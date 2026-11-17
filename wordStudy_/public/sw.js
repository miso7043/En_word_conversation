// 이전 버전의 오프라인 캐싱을 종료하기 위한 등록 해제 전용 워커.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('study-shell-') || key === 'study-audio-v1').map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
