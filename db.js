/* ==========================================================================
   GymLog — Couche de données
   IndexedDB en priorité, repli automatique sur localStorage si IndexedDB
   est indisponible (navigation privée ancienne, erreur d'ouverture…).
   Chaque "store" contient des objets identifiés par leur champ `id`.
   ========================================================================== */
const DB = (() => {
  const DB_NAME = 'gymlog';
  const DB_VERSION = 2; // v2 : ajout du store « photos »
  const STORES = ['exercises', 'workouts', 'templates', 'folders', 'measurements', 'settings', 'photos'];

  let idb = null;        // connexion IndexedDB
  let fallback = false;  // true => on utilise localStorage

  /** Ouvre (ou crée) la base. Résout toujours, éventuellement en mode repli. */
  function init() {
    return new Promise(resolve => {
      const useFallback = () => { if (!idb) { fallback = true; resolve('localStorage'); } };
      if (!('indexedDB' in window)) return useFallback();
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return useFallback(); }

      // Création des stores à la première ouverture / montée de version
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            const os = db.createObjectStore(name, { keyPath: 'id' });
            if (name === 'workouts') os.createIndex('startTime', 'startTime');
            if (name === 'measurements') os.createIndex('date', 'date');
          }
        });
      };
      req.onsuccess = () => {
        if (fallback) { req.result.close(); return; } // on a déjà basculé en repli
        idb = req.result;
        idb.onversionchange = () => idb.close();
        resolve('indexedDB');
      };
      req.onerror = useFallback;
      // Mise à jour de la base bloquée par une ancienne page encore ouverte :
      // on ATTEND (l'ancienne page ferme sa connexion via onversionchange).
      // Basculer trop tôt sur le repli afficherait des données vides.
      req.onblocked = () => console.warn('[DB] Mise à jour en attente d\'une ancienne connexion…');
      // Dernier recours seulement si IndexedDB ne répond vraiment pas
      setTimeout(useFallback, 20000);
    });
  }

  /** Données éventuellement restées dans le stockage de repli (localStorage) */
  function readFallback() {
    const out = {};
    let any = false;
    STORES.forEach(st => {
      const raw = localStorage.getItem(lsKey(st));
      if (!raw) return;
      try { const list = Object.values(JSON.parse(raw) || {}); if (list.length) { out[st] = list; any = true; } } catch (e) { /* ignore */ }
    });
    return any ? out : null;
  }
  function clearFallback() { STORES.forEach(st => { try { localStorage.removeItem(lsKey(st)); } catch (e) { /* ignore */ } }); }

  /* ---------- Repli localStorage : un objet {id: valeur} par store ---------- */
  const lsKey = store => 'gymlog:' + store;
  function lsRead(store) {
    try { return JSON.parse(localStorage.getItem(lsKey(store))) || {}; } catch (e) { return {}; }
  }
  function lsWrite(store, map) {
    try { localStorage.setItem(lsKey(store), JSON.stringify(map)); }
    catch (e) { console.warn('[DB] Écriture localStorage impossible', e); }
  }

  /* ---------- Helpers IndexedDB -> Promise ---------- */
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const txP = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); });
  // Copie "propre" : évite les erreurs de clonage (fonctions, proxies…)
  const plain = o => JSON.parse(JSON.stringify(o));

  /** Renvoie tous les objets d'un store */
  async function getAll(store) {
    if (fallback) return Object.values(lsRead(store));
    return reqP(idb.transaction(store).objectStore(store).getAll());
  }

  /** Renvoie un objet par id (ou null) */
  async function get(store, id) {
    if (fallback) return lsRead(store)[id] ?? null;
    return (await reqP(idb.transaction(store).objectStore(store).get(id))) ?? null;
  }

  /** Objets dont l'identifiant commence par `prefix` (ex. miniatures de photos) */
  async function getAllPrefix(store, prefix) {
    if (fallback) return Object.values(lsRead(store)).filter(o => String(o.id).startsWith(prefix));
    return reqP(idb.transaction(store).objectStore(store).getAll(IDBKeyRange.bound(prefix, prefix + '￿')));
  }

  /** Insère ou remplace plusieurs objets */
  async function putMany(store, list) {
    if (!list.length) return;
    if (fallback) {
      const map = lsRead(store);
      list.forEach(o => { map[o.id] = plain(o); });
      return lsWrite(store, map);
    }
    const tx = idb.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    list.forEach(o => os.put(plain(o)));
    return txP(tx);
  }

  /** Insère ou remplace un objet */
  const put = (store, obj) => putMany(store, [obj]);

  /** Supprime un objet par id */
  async function del(store, id) {
    if (fallback) {
      const map = lsRead(store);
      delete map[id];
      return lsWrite(store, map);
    }
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    return txP(tx);
  }

  /** Vide un store */
  async function clear(store) {
    if (fallback) return lsWrite(store, {});
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return txP(tx);
  }

  return {
    STORES, init, getAll, getAllPrefix, get, put, putMany, del, clear, readFallback, clearFallback,
    get mode() { return fallback ? 'localStorage' : 'indexedDB'; }
  };
})();
