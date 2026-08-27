const CACHE_NAME = 'qsaafrigus-shell-v2';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/vendor/chart.umd.min.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Só cacheia os ficheiros estáticos do próprio shell (HTML/JS/ícones).
// Pedidos à API e ao WebSocket do backend vão sempre direto à rede, para nunca
// mostrar dados desatualizados de temperatura/válvula.
//
// Rede primeiro, cache como fallback só quando offline — ao contrário de
// "cache primeiro", isto garante que uma nova versão do shell chega sempre
// que há rede, sem depender de bumpar o CACHE_NAME a cada deploy.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
