// 기존 HTML 캐싱 워커를 갱신한 후 등록 해제한다. 새 캐싱은 하지 않는다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('html-study-shell-')).map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
