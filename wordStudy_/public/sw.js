const SHELL = 'study-shell-v1';
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(SHELL); const response = await fetch('/');
  const html = await response.clone().text(); await cache.put('/', response);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
  await cache.addAll(['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', ...assets]);
})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('study-shell-') && key !== SHELL).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/api\/audio\/[\da-f-]+\/file$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await (await caches.open('study-audio-v1')).match(url.pathname);
      if (!cached) return fetch(request);
      const range = request.headers.get('range');
      if (!range) return cached;
      const buffer = await cached.arrayBuffer(), match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? +match[1] : -1, end = match?.[2] ? Math.min(+match[2], buffer.byteLength - 1) : buffer.byteLength - 1;
      if (start < 0 || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buffer.byteLength}` } });
      return new Response(buffer.slice(start, end + 1), { status: 206, headers: { 'Content-Type': 'audio/wav', 'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
    })()); return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => { if (response.ok && url.pathname === '/') { const copy = response.clone(); void caches.open(SHELL).then(cache => cache.put('/', copy)); } return response; }).catch(() => caches.match('/'))); return;
  }
  if (url.pathname.startsWith('/assets/') || ['icon.svg','manifest.webmanifest'].includes(url.pathname.slice(1))) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => { if (response.ok) { const copy = response.clone(); void caches.open(SHELL).then(cache => cache.put(request, copy)); } return response; })));
  }
});
