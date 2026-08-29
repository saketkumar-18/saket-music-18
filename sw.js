/* Saket Music 18 service worker: offline shell + runtime audio/image caching. */
const VERSION = 'sm18-v1';
const SHELL = `${VERSION}-shell`;
const MEDIA = `${VERSION}-media`;

const SHELL_FILES = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/store.js',
  '/js/player.js',
  '/js/views.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/favicon-64.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    // audio + artwork from CDN: cache-first with trim
    if (url.pathname.endsWith('.mp4') || url.pathname.includes('_96.') || url.pathname.includes('_320.')) {
      e.respondWith(cacheFirst(e.request, MEDIA, 60));
    } else if (/(c\.saavncdn\.com|pa\.saavncdn\.com)/.test(url.hostname)) {
      e.respondWith(cacheFirst(e.request, MEDIA, 200));
    }
    return;
  }
  // same-origin
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) {
    // network-first, cache fallback (offline replay)
    e.respondWith(networkFirst(e.request, MEDIA));
    return;
  }
  // static: cache-first
  e.respondWith(cacheFirst(e.request, SHELL, 60));
});

async function cacheFirst(req, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await trim(cacheName, maxEntries);
    cache.put(req, res.clone());
  }
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response(JSON.stringify({ ok: false, error: 'offline' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
}

async function trim(cacheName, max) {
  if (!max) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}
