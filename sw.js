// Offline support: serve the app shell from the cache, refresh it in the background.
// Bump VERSION whenever any cached file changes.
const VERSION = 'money-atlas-0.3.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/app.js', 'src/db.js', 'src/budget.js', 'src/recurring.js', 'src/model.js', 'src/import/expensebook.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Online: the app's own code and pages come from the network first, so a new deploy shows on the
// next launch. Offline (or slow network): the cached copy. Fonts and icons rarely change: cache first.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const staticAsset = /\/(fonts|icons)\//.test(url.pathname);
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    if (staticAsset && cached) return cached;
    try {
      const res = await Promise.race([
        fetch(e.request, { cache: 'no-cache' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  }));
});
