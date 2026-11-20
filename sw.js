/* Service worker: app shell cached for offline; stock data always network-first. */
const VERSION = 'si-v1.0.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/core.js', 'js/stockparse.js', 'js/report.js', 'js/scanner.js', 'js/publisher.js', 'js/app.js',
  'js/lib/zxing-reader.js', 'js/lib/zxing_reader.wasm', 'js/lib/exceljs.min.js',
  'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) {   // stock data: network first, cached fallback
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  if (url.pathname.includes('/js/lib/') || url.pathname.includes('/icons/')) {   // heavy static files: cache first
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })));
    return;
  }
  // app code: network first (always fresh when online), cached copy when offline
  e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
});
