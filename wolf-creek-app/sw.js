// Minimal service worker: cache the app shell so the home-screen app opens
// instantly and survives a flaky signal. Data always comes live from Supabase.
const CACHE = 'wcf-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/vendor/supabase.js',
  './assets/js/app.js',
  './assets/js/config.js',
  './assets/js/db.js',
  './assets/js/ui.js',
  './assets/js/sched.js',
  './assets/js/sheet.js',
  './assets/js/estimates.js',
  './assets/js/estimate.js',
  './assets/js/newjob.js',
  './assets/js/pending.js',
  './assets/js/scheduled.js',
  './assets/js/completed.js',
  './assets/js/expenses.js',
  './assets/js/reports.js',
  './assets/img/logo-mark-white.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API calls (Supabase) — always straight to network, never cached.
  if (url.origin !== location.origin) return;
  // App shell: NETWORK-FIRST so every launch runs the latest deployed version.
  // Cache is only a fallback when offline. Refreshes the cached copy on success.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
  );
});
