// Service worker Qurbandong Odot (khusus folder /odot/). Ambil dari jaringan dulu, cadangan dari cache saat offline.
const CACHE = 'odot-v5';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './config.js', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('odot-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.indexOf('/qurbandon-odot/') !== 0) return;
  e.respondWith(
    fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(r, copy); });
      return res;
    }).catch(function () {
      return caches.match(r).then(function (m) { return m || caches.match('./index.html'); });
    })
  );
});
