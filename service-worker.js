// Aumentar a versão do cache forçará o navegador a instalar o novo Service Worker.
const CACHE_NAME = 'lamic-dados-v2';

// URLs a serem cacheadas durante a instalação.
// Incluem os novos ícones locais.
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://i.imgur.com/y8EzMg8.png',
  'https://i.imgur.com/0CfbOl5.png',
  // URLs de terceiros que você quer cachear no início:
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Cache addAll failed:', error);
      })
  );
  // Força o Service Worker a ativar imediatamente
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    // Garante que o novo Service Worker controle a página imediatamente
    .then(() => self.clients.claim()) 
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Regra 1: Ignorar requests que não são http(s)
  if (!requestUrl.protocol.startsWith('http')) return;
    
  // Regra 2: URLs de terceiros que NÃO estão na lista de cache devem ir direto para a rede (Network-only).
  // Isso evita cachear dinamicamente recursos externos desconhecidos.
  const isExternalAndNotCached = requestUrl.host !== self.location.host && !urlsToCache.includes(requestUrl.href);

  if (isExternalAndNotCached) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Regra 3: Cache-First para URLs internas e recursos externos pre-cacheados (urlsToCache).
  // Tenta o cache primeiro, depois a rede, e armazena na rede se for bem-sucedido.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna do cache se encontrado
        if (response) {
          return response;
        }
        
        // Se não estiver no cache, tenta buscar na rede
        return fetch(event.request)
          .then(networkResponse => {
            // Verifica se a resposta é válida para cache
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            // Clona a resposta e armazena no cache para uso futuro
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          })
          .catch(() => {
            // Fallback offline: Retorna a página offline HTML.
            return new Response(
              '<html><body><h1>Offline</h1><p>Você está offline. Por favor, conecte-se à internet para acessar este conteúdo.</p></body></html>',
              {
                headers: { 'Content-Type': 'text/html' },
                status: 503
              }
            );
          });
      })
  );
});