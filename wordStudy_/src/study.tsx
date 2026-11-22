import { useEffect, useId, useRef, useState } from 'react';
import { readStored, writeStored } from './storage';
import { highlightParts } from './highlight';
export type Settings = { rate: number; repeat: number; hideEnglish: boolean; hideMeaning: boolean;
  role: string; wake: boolean; theme: string };
const defaults: Settings = { rate: .95, repeat: 1, hideEnglish: false, hideMeaning: false, role: '', wake: false, theme: 'dark' };
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    const raw = readStored<Partial<Settings>>('study-settings-v1', {});
    return { ...defaults, rate: clamp(raw?.rate, .5, 1.5, .95), repeat: Math.round(clamp(raw?.repeat, 1, 10, 1)),
      hideEnglish: raw.hideEnglish === true, hideMeaning: raw.hideMeaning === true, wake: raw.wake === true,
      theme: ['light', 'dark', 'system'].includes(raw.theme ?? '') ? raw.theme! : 'dark' };
  });
  useEffect(() => {
    writeStored('study-settings-v1', { ...settings, role: '' });
    const query = matchMedia('(prefers-color-scheme: light)');
    const apply = () => { document.documentElement.dataset.theme = settings.theme === 'system' ? query.matches ? 'light' : 'dark' : settings.theme; };
    apply(); query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [settings]);
  return [settings, setSettings] as const;
}
function clamp(value: unknown, min: number, max: number, fallback: number) { return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
export function StudyControls({ settings: s, change, speakers = [], count = 0 }: { settings: Settings; change: (next: Settings) => void; speakers?: string[]; count?: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return <div className="ml-auto shrink-0">
    <button className="control border border-edge" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>학습 설정</button>
    <dialog ref={dialog} aria-labelledby={title} className="study-controls m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-edge bg-panel p-5 text-slate-100 backdrop:bg-black/60" onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
    }}>
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id={title} className="text-xl font-bold">학습 설정</h2><form method="dialog"><button autoFocus className="control border border-edge">닫기</button></form></div>
      <div className="grid gap-5">
        <label className="flex items-center justify-between gap-3">속도 <input aria-label="재생 속도" type="number" min="0.5" max="1.5" step="0.05" value={s.rate} onChange={e => change({ ...s, rate: clamp(+e.target.value, .5, 1.5, .95) })} /></label>
        {!!count && <label className="flex items-center justify-between gap-3">문장 반복 <input type="number" min="1" max="10" value={s.repeat} onChange={e => change({ ...s, repeat: Math.round(clamp(+e.target.value, 1, 10, 1)) })} /></label>}
        {(['hideEnglish', 'hideMeaning', 'wake'] as const).filter(key => count > 0 || key === 'wake').map(key => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={s[key]} onChange={e => change({ ...s, [key]: e.target.checked })} /> {({ hideEnglish: '영어 가리기', hideMeaning: '해석 가리기', wake: '재생 중 화면 유지' })[key]}</label>)}
        {!!count && <label className="flex items-center justify-between gap-3">내 역할 <select aria-label="내 역할" value={s.role} onChange={e => change({ ...s, role: e.target.value })}><option value="">모두 읽기</option>{speakers.map(speaker => <option key={speaker}>{speaker}</option>)}</select></label>}
      </div>
    </dialog>
  </div>;
}

export function Concealed({ text, hidden, phrases = [], label }: { text: string; hidden: boolean; phrases?: string[]; label: '영어 보기' | '해석 보기' }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [hidden, text]);
  if (hidden && !open) return <button className="control border border-edge" onClick={() => setOpen(true)}>{label}</button>;
  return <>{highlightParts(text, phrases).map((part, i) => part.highlighted ? <mark key={i}>{part.text}</mark> : part.text)}</>;
}
export function useWakeLock(playing: boolean, enabled: boolean) {
  const [status, setStatus] = useState('');
  useEffect(() => {
    let lock: { release: () => Promise<void>; released?: boolean } | undefined, disposed = false, acquiring = false;
    const wake = navigator.wakeLock;
    async function acquire() {
      if (!playing || !enabled || document.visibilityState !== 'visible') return;
      if (acquiring || lock && !lock.released) return;
      if (!wake) { setStatus('이 환경에서는 화면 유지를 지원하지 않습니다.'); return; }
      acquiring = true;
      try { const next = await wake.request('screen'); if (disposed) await next.release(); else lock = next; }
      catch { setStatus('화면 유지 요청이 거부되었습니다.'); } finally { acquiring = false; }
    }
    setStatus(''); void acquire(); document.addEventListener('visibilitychange', acquire);
    return () => { disposed = true; void lock?.release(); document.removeEventListener('visibilitychange', acquire); };
  }, [playing, enabled]);
  return status;
}
