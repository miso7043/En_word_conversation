// 기존 설치의 캐싱 워커만 갱신한다. 새 워커나 오프라인 자료는 등록하지 않는다.
if ('serviceWorker' in navigator && window.isSecureContext) {
  void navigator.serviceWorker.getRegistration('/').then(registration => {
    if (registration?.scope === new URL('/', location.href).href) return registration.update();
  }).catch(() => {});
}
