// Offline support. Network first (so updates arrive straight away when the
// server is running), falling back to the saved copy when you are offline.
const CACHE = 'mali-budget-v2';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/boot.js',
  'js/main.js',
  'js/store.js',
  'js/model.js',
  'js/format.js',
  'js/ui.js',
  'js/charts.js',
  'js/csv.js',
  'js/sample.js',
  'js/actions.js',
  'js/editors.js',
  'js/views/dashboard.js',
  'js/views/transactions.js',
  'js/views/budget.js',
  'js/views/recurring.js',
  'js/views/goals.js',
  'js/views/settings.js',
  'js/views/onboarding.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const apiPath = new URL('api/', self.registration.scope).pathname;
  if (url.origin !== self.location.origin || url.pathname.startsWith(apiPath)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await withTimeout(fetch(req), 4000);
      if (res && res.ok && res.type === 'basic') {
        const key = req.mode === 'navigate' ? 'index.html' : req;
        cache.put(key, res.clone());
      }
      return res;
    } catch (e) {
      const hit = req.mode === 'navigate'
        ? await cache.match('index.html')
        : await cache.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
