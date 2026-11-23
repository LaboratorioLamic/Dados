/* Service worker do COMERCIAL LAMIC: permite instalar como aplicativo.
   Os arquivos do próprio site vão primeiro à rede (sempre a versão publicada) e só caem
   no cache quando não há conexão. Os dados continuam vindo direto do Firebase. */
const CACHE_NAME = 'comercial-lamic-v1';
const urlsToCache = ['./', 'index.html', 'manifest.json', 'img/icone-192.png', 'img/icone-512.png', 'img/logo-lamic.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(error => console.error('Cache addAll failed:', error))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.map(nome => nome !== CACHE_NAME && caches.delete(nome))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Só o que é do próprio site; Firebase, fontes e bibliotecas seguem direto para a rede
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(resposta => {
        if (resposta && resposta.status === 200 && resposta.type === 'basic') {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(req).then(emCache => emCache || new Response(
        '<html><body><h1>Offline</h1><p>Você está offline. Conecte-se à internet para usar o COMERCIAL LAMIC.</p></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
      )))
  );
});
