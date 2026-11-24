// Rede primeiro (dados e login sempre atualizados); cache só como reserva offline do "casco" do app.
const CACHE = 'lamic-portal-v93';
const CASCO = ['./', 'index.html', 'css/portal.css', 'js/app.js', 'js/chat-flutuante.js', 'js/config.js', 'assents/circulo.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCO)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Só arquivos do próprio site, via GET. Supabase e outros domínios passam direto.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // no-cache: sempre confere com o servidor (304 se igual); sem isso o cache HTTP do navegador servia arquivo velho
    (e.request.mode === 'navigate' ? fetch(e.request) : fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => {
        if (r) return r;
        // index.html só substitui a própria página do portal; num módulo (iframe) abriria o portal dentro dele mesmo
        const raiz = new URL('./', self.registration.scope).pathname;
        return (url.pathname === raiz || url.pathname === raiz + 'index.html') ? caches.match('index.html') : Response.error();
      }))
  );
});
