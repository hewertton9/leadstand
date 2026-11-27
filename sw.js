
const CACHE = 'leadstand-v12';

// Se a rede demorar mais que isso, abre pelo cache (Wi-Fi ruim em evento)
const REDE_TIMEOUT = 4000;

function fetchComTimeout(request, ms, opts) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request, opts).then(
      r => { clearTimeout(t); resolve(r); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

const LOCAL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

// Instala a nova versão
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      await Promise.all(
        LOCAL.map(async url => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (error) {
            console.warn('Não foi possível atualizar:', url);
          }
        })
      );

      await Promise.all(
        CDN.map(async url => {
          try {
            const response = await fetch(url, { mode: 'no-cors' });
            await cache.put(url, response);
          } catch (error) {}
        })
      );
    })
  );
});

// Ativa a versão nova e limpa somente caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith('leadstand-') && key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Recebe autorização do usuário para ativar a atualização
self.addEventListener('message', event => {
  if (event.data === 'ATIVAR_ATUALIZACAO') {
    self.skipWaiting();
  }
});

// Atualiza páginas sempre pela rede, usando cache como alternativa offline
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.hostname === 'wa.me') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetchComTimeout(request, REDE_TIMEOUT, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then(cache => cache.put('./index.html', copy))
            );
          }
          return response;
        })
        .catch(async () => {
          return (
            await caches.match(request, { ignoreSearch: true }) ||
            await caches.match('./index.html') ||
            fetch(request)
          );
        })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetchComTimeout(request, REDE_TIMEOUT)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then(cache => cache.put(request, copy))
            );
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => {
      return hit || fetch(request).then(response => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then(cache => cache.put(request, copy))
          );
        }
        return response;
      });
    })
  );
});
