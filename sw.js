// Offline support: serve the app shell from the cache, refresh it in the background.
// Bump VERSION whenever any cached file changes.
const VERSION = 'money-atlas-0.1.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/app.js', 'src/db.js', 'src/budget.js', 'src/model.js', 'src/import/expensebook.js',
  'fonts/Manrope-400.woff2', 'fonts/Manrope-500.woff2', 'fonts/Manrope-600.woff2', 'fonts/Manrope-700.woff2',
  'fonts/ZenKakuGothicNew-400.woff2', 'fonts/ZenKakuGothicNew-700.woff2',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || fresh;
  }));
});
