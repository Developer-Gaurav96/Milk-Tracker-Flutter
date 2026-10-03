/* ============================================================
   sw.js — offline shell for Milk & Dahi Tracker

   Two caches:
     APP_CACHE  same-origin shell (HTML, JS, manifest, icons)
     CDN_CACHE  third-party runtime deps (Tailwind, jsPDF, Inter)

   Strategy:
     navigations      network-first, fall back to the cached shell
     same-origin      stale-while-revalidate
     CDN hosts        cache-first (they're versioned or immutable enough
                      that staleness is preferable to an offline failure)
   ============================================================ */

const VERSION = 'v3';
const APP_CACHE = 'mdt-app-' + VERSION;
const CDN_CACHE = 'mdt-cdn-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tailwind.css',
  './js/store.js',
  './js/calendar.js',
  './js/modal.js',
  './js/confirm.js',
  './js/invoices.js',
  './js/pdf.js',
  './js/settings.js',
  './js/app.js',
  './js/capacitor-files.js'
];

/* Optional: absent icons must not abort the whole install. */
const OPTIONAL = [
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(SHELL);

    await Promise.all(OPTIONAL.map(async (url) => {
      try {
        await cache.add(url);
      } catch (err) {
        // Icon not generated yet — the app still works without it.
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('mdt-app-') || k.startsWith('mdt-cdn-'))
        .filter((k) => k !== APP_CACHE && k !== CDN_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- strategies ---------- */

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  // Opaque cross-origin responses are storable, just not inspectable.
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);

  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return hit || network.then((r) => r || new Response('', { status: 504, statusText: 'Offline' }));
}

async function navigationHandler(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch (err) {
    return (await cache.match('./index.html'))
        || (await cache.match('./'))
        || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/* ---------- router ---------- */

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Range requests (media) aren't cacheable here; let them pass through.
  if (request.headers.has('range')) return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (CDN_HOSTS.indexOf(url.host) !== -1) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(navigationHandler(request));
    } else {
      event.respondWith(staleWhileRevalidate(request, APP_CACHE));
    }
  }
});
