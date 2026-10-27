// Service worker Qurbandong Odot (khusus folder /odot/). Ambil dari jaringan dulu, cadangan dari cache saat offline.
const CACHE = 'odot-v11';
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
  if (u.origin !== location.origin || r.url.indexOf(self.registration.scope) !== 0) return;
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

// Notifikasi (Web Push) — tampil walau aplikasi ditutup.
self.addEventListener('push', function (e) {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'QDF Odot', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'QDF Odot', {
    body: d.body || 'Ada pembaruan baru.', icon: 'icon-192.png', badge: 'icon-192.png',
    tag: 'qdf-odot-digest', renotify: true, data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (const c of list) { if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus(); }
    return clients.openWindow(target);
  }));
});
