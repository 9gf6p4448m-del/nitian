const CACHE = "nitian-s0-8c4034928409";
const BASE = "/nitian/";
const FILES = ["/nitian/assets/index-CPU06eQc.css","/nitian/assets/index-D-qOQsNS.js","/nitian/icon.svg","/nitian/icons/apple-touch-icon.png","/nitian/icons/icon-192.png","/nitian/icons/icon-512.png","/nitian/index.html","/nitian/manifest.webmanifest","/nitian/version.json","/nitian/"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nitian-s0-') && k !== CACHE).map(k => caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => {
      if (!response.ok) throw new Error('Navigation unavailable');
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match(BASE + 'index.html'))));
    return;
  }
  if (!FILES.includes(url.pathname)) return;
  // These are allowlisted, same-origin static files. Use the canonical precache
  // key so Vary: Origin cannot miss on module/CSS requests during offline reload.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(req)));
});
