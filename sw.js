/* Permite abrir la app sin señal: primero intenta la red (siempre la versión más reciente) y, si falla, usa la copia guardada. */

const CACHE = 'cff-20';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      /* Las copias viejas se borran solo cuando la nueva ya tiene la app completa */
      .then(claves => caches.open(CACHE).then(c => c.match('app.js')).then(ok => ok ? Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))) : null))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('version.json')) return; // la consulta de versión siempre va a la red

  /* Solo la página puede caer a index.html. Un archivo de código (app.js, styles.css) nunca se
     reemplaza por otra cosa: si no hay red se usa su última copia buena, de cualquier versión. */
  const esPagina = e.request.mode === 'navigate';
  const deCopia = () => caches.match(e.request, { ignoreSearch: true })
    .then(r => r || (esPagina ? caches.match('index.html', { ignoreSearch: true }) : null))
    .then(r => r || Response.error());

  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(r => {
        if (!r.ok) return esPagina ? r : deCopia(); // un error del servidor no se guarda ni se usa como código
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return r;
      })
      .catch(deCopia)
  );
});

/* Al tocar una notificación se abre la app */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
