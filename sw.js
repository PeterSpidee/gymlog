/* ==========================================================================
   GymLog — Service Worker
   Stratégie « cache d'abord, versionné » :
   - l'app démarre instantanément depuis sa copie locale, même sans réseau
     ou avec un réseau faible à la salle ;
   - les mises à jour arrivent par ce fichier : à chaque déploiement on change
     CACHE_VERSION, le navigateur installe le nouveau service worker qui
     télécharge des copies fraîches de tous les fichiers (cache: 'reload'),
     supprime les anciennes, puis l'app se recharge toute seule.
   Incrémenter CACHE_VERSION à chaque déploiement.
   ========================================================================== */
const CACHE_VERSION = 'gymlog-v13';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './exercises.js',
  './body.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Installation : copies fraîches de tous les fichiers (sans passer par le cache HTTP)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Activation : suppression des anciennes versions, prise de contrôle immédiate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Requêtes : copie locale d'abord (démarrage instantané), réseau sinon
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = url.origin + url.pathname; // on ignore les ?paramètres

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(key) || (req.mode === 'navigate' ? (await cache.match('./index.html')) || (await cache.match('./')) : null);
    if (hit) return hit;
    try {
      const res = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});

// Clic sur la notification « repos terminé » : on ramène l'app au premier plan
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow('./');
    })
  );
});
