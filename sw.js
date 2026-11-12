/* ==========================================================================
   GymLog — Service Worker
   Stratégie « réseau d'abord » :
   - en ligne : on récupère toujours la version la plus récente (vérification
     rapide via ETag) et on met le cache à jour ;
   - réseau lent (> 3 s) ou hors ligne : on sert la copie en cache.
   Ainsi une mise à jour publiée est visible dès le lancement suivant,
   et l'app fonctionne toujours sans connexion à la salle.
   Incrémenter CACHE_VERSION à chaque déploiement.
   ========================================================================== */
const CACHE_VERSION = 'gymlog-v6';
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
const NETWORK_TIMEOUT = 3000;

// Installation : on télécharge des copies fraîches (cache: 'reload' ignore
// le cache HTTP du navigateur, sinon on risquerait de stocker d'anciens fichiers)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Activation : suppression des anciens caches, prise de contrôle immédiate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = url.origin + url.pathname; // on ignore les ?paramètres

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // 'no-cache' : le navigateur revalide auprès du serveur (réponse 304 légère si rien n'a changé)
    const network = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then(res => { if (res && res.ok) cache.put(key, res.clone()); return res; });
    network.catch(() => { /* hors ligne : géré plus bas */ });
    try {
      return await Promise.race([
        network,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT))
      ]);
    } catch (e) {
      const cached = await caches.match(key) || await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
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
