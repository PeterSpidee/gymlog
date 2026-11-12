/* ==========================================================================
   GymLog — Service Worker
   Stratégie : on pré-cache tout le "shell" de l'app à l'installation,
   puis on sert depuis le cache (cache-first) avec mise à jour en arrière-plan.
   Incrémenter CACHE_VERSION à chaque déploiement pour forcer la mise à jour.
   ========================================================================== */
const CACHE_VERSION = 'gymlog-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './exercises.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Installation : mise en cache de tous les fichiers
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activation : suppression des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Requêtes : cache d'abord, réseau ensuite (et on rafraîchit le cache)
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});

// Clic sur la notification "repos terminé" : on ramène l'app au premier plan
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow('./');
    })
  );
});
