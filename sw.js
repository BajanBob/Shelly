/* Shelly service worker: lets Shelly install as an app, open without internet, and receive push notifications.
   Notifications never contain message text: only who is calling, or that a new message is waiting. */
const CACHE = 'shelly-v4';
const TILES = 'shelly-tiles-v1';                                        // offline map tiles (OpenStreetMap), kept across app updates
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('tile.openstreetmap.org')){                   // map tiles: cache-first so they work offline once seen or saved
    e.respondWith(caches.open(TILES).then(c => c.match(e.request).then(hit => hit ||
      fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone()); return r; })
        .catch(() => hit || Response.error()))));
    return;
  }
  if (u.origin !== location.origin) return;
  if (u.pathname.endsWith('config.json')) return;                       // always fresh
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  const who = (d.n || 'Someone').slice(0, 30);
  const call = d.k === 'voice' || d.k === 'video' || d.k === 'call', sos = d.k === 'sos';
  const title = sos ? `SOS: ${who} needs help` : call ? `${who} is calling` : who;
  const opts = {
    body: sos ? 'Open Shelly now to see where they are' : call ? (d.k === 'video' ? 'Video call on Shelly - tap to answer' : 'Voice call on Shelly - tap to answer') : 'New message on Shelly',
    tag: sos ? 'shelly-sos' : call ? 'shelly-call' : 'shelly-msg-' + who, renotify: true, requireInteraction: call || sos,
    vibrate: sos ? [800, 200, 800, 200, 800, 200, 800] : call ? [400, 200, 400, 200, 400] : [60, 60, 60], icon: 'icon-192.png', badge: 'icon-192.png',
    data: {url: './'}, timestamp: d.ts || Date.now()
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
