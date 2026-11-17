/* Service worker: makes the trainer work offline.
   Strategy: serve from cache instantly, refresh the cache from the network in the background,
   so a new deploy shows up on the next launch. Bump VERSION to force a clean re-download. */
const VERSION = 'v2';
const CACHE = `bj-trainer-${VERSION}`;
const ASSETS = [
  './',
  'manifest.json',
  'css/styles.css',
  'js/cards.js',
  'js/strategy.js',
  'js/game.js',
  'js/store.js',
  'js/ui.js',
  'js/tab-chart.js',
  'js/tab-drill.js',
  'js/tab-quiz.js',
  'js/tab-play.js',
  'js/tab-progress.js',
  'js/main.js',
  'icons/icon.svg',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bj-trainer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Every page navigation (/, /index.html, /?x, /#drill) is the same single page.
  const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : req;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return (await fresh) || new Response('Offline and not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })()
  );
});
