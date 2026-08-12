// Minimal offline-support service worker for CalmNoise.
//
// Strategy:
//  - HTML navigations: network-first, falling back to the cached shell page
//    (so the app opens offline after at least one successful visit).
//  - Same-origin static assets (JS/CSS/icons/worklets/audio files): stale-
//    while-revalidate — serve from cache instantly if present, and refresh
//    the cache in the background.
//  - Cross-origin requests (ads, etc.) are left untouched.
//
// Bump CACHE_VERSION whenever you want to force clients to drop old caches.
const CACHE_VERSION = 'v2';
const CACHE_NAME = `calmnoise-${CACHE_VERSION}`;

// Self-derived from where this script is actually served, so the same static
// file works whether deployed at the domain root or under a project-page
// base path like /CalmNoise/ — no build-time templating needed.
const BASE = self.location.pathname.replace(/sw\.js$/, '');

const PRECACHE_URLS = [
  BASE,
  `${BASE}manifest.webmanifest`,
  `${BASE}favicon.svg`,
  `${BASE}worklets/noise-processor.js`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith(`${BASE}_astro/`) ||
    url.pathname.startsWith(`${BASE}worklets/`) ||
    url.pathname.startsWith(`${BASE}sounds/`) ||
    url.pathname.startsWith(`${BASE}icons/`)
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || cache.match(BASE);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || (await networkFetch) || Response.error();
}
