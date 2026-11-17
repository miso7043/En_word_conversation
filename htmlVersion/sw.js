const SHELL = 'html-study-shell-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(['./conversation.html','./study.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png']))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('html-study-shell-') && key !== SHELL).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== location.origin || !['conversation.html','study.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'].includes(url.pathname.split('/').pop())) return;
  event.respondWith(fetch(event.request).then(response => { if(response.ok){const copy=response.clone();void caches.open(SHELL).then(cache=>cache.put(event.request,copy));}return response; }).catch(()=>caches.match(event.request)));
});
