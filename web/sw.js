// Offline-Hülle: App-Dateien aus dem Cache, Daten immer frisch (nur bei fehlendem Netz aus dem Cache).
const VERSION = 'v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/pages.js', 'js/components.js', 'js/ui.js', 'js/chart.js', 'js/glossary.js',
  'core/indicators.js', 'core/signal.js', 'core/format.js', 'core/dates.js', 'core/position.js', 'core/relstrength.js', 'core/quality.js', 'core/market.js', 'core/rank.js',
  'vendor/lightweight-charts.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isData = url.pathname.includes('/data/');
  e.respondWith(isData
    ? fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request))
    : caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
