import { useEffect, useState } from 'react';
import type { Lesson } from '../shared/lesson';
import { readStored, writeStored } from './storage';
export function OfflinePanel({ selected, scope }: { lessons: Lesson[]; selected: Lesson[]; scope: string }) {
  const [message, setMessage] = useState(''), [usage, setUsage] = useState('');
  async function estimate() { const value = await navigator.storage?.estimate(); setUsage(`${((value?.usage ?? 0) / 1048576).toFixed(1)} MB / ${((value?.quota ?? 0) / 1048576).toFixed(0)} MB`); }
  useEffect(() => { void estimate(); }, []);
  return <details className="rounded-xl border border-edge p-3 my-3"><summary>오프라인 저장 · {usage}</summary>
    <button className="control border" disabled={!selected.length} onClick={() => {
      const key = `offline-lessons-v1:${scope}`, previous = readStored<Lesson[]>(key, []), map = new Map(previous.map(l => [l.id, l]));
      selected.forEach(lesson => map.set(lesson.id, lesson)); const saved = writeStored(key, [...map.values()]);
      setMessage(saved ? `선택한 ${selected.length}개 자료를 저장했습니다. 새 내용은 다시 저장하면 갱신됩니다.` : '브라우저 저장소에 접근할 수 없거나 용량이 부족합니다.'); void estimate();
    }}>선택 자료 오프라인 저장·갱신</button>
    <button className="control border" onClick={() => { writeStored(`offline-lessons-v1:${scope}`, []); void caches.delete('study-audio-v1'); writeStored('offline-audio-v1', []); setMessage('이 계정의 오프라인 자료와 저장 오디오를 삭제했습니다.'); void estimate(); }}>저장 자료·오디오 삭제</button>
    <button className="control border" onClick={() => { void navigator.serviceWorker?.getRegistration().then(registration => registration?.update()); setMessage('앱 업데이트를 확인했습니다. 새 버전은 열린 창을 닫은 뒤 적용됩니다.'); }}>앱 업데이트 확인</button>
    <p role="status">{message}</p><p>오프라인에서는 저장한 자료만 볼 수 있으며 로그인·가져오기·음성 생성은 연결 후 사용할 수 있습니다.</p>
  </details>;
}
if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js');
