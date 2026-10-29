// Service worker: guarda a casca do app para abrir offline.
// Os .epub são guardados pelo app.js na cache "chd-books".
const SHELL = 'chd-shell-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'vendor/jszip.min.js', 'vendor/epub.min.js',
  'icons/android-chrome-192x192.png', 'icons/android-chrome-512x512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('chd-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // rede primeiro (pega atualizações), cache como reserva offline
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(SHELL).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
