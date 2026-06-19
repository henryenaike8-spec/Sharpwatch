const CACHE_NAME = 'sharpwatch-v1';
const SHELL_FILES = ['./sharpwatch.html', './manifest.json', './icon-192.svg', './icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for the live data API, cache-first for the app shell itself.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('data-api.polymarket.com') || url.includes('polymarket.com/profile')) {
    return; // always go to network for live trading data
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
