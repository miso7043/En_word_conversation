import { useEffect, useRef, useState } from 'react';
import { readStored, writeStored } from './storage';
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
  return <details className="study-controls rounded-xl border border-edge p-3 my-3"><summary>학습 설정</summary><div className="flex flex-wrap gap-3 mt-3">
    <label>속도 <input aria-label="재생 속도" type="number" min="0.5" max="1.5" step="0.05" value={s.rate} onChange={e => change({ ...s, rate: clamp(+e.target.value, .5, 1.5, .95) })} /></label>
    {!!count && <label>문장 반복 <input type="number" min="1" max="10" value={s.repeat} onChange={e => change({ ...s, repeat: Math.round(clamp(+e.target.value, 1, 10, 1)) })} /></label>}
    {(['hideEnglish', 'hideMeaning', 'wake'] as const).filter(key => count > 0 || key === 'wake').map((key, i) => <label key={key}><input type="checkbox" checked={s[key]} onChange={e => change({ ...s, [key]: e.target.checked })} /> {({ hideEnglish: '영어 가리기', hideMeaning: '뜻 가리기', wake: '재생 중 화면 유지' })[key]}</label>)}
    {!!count && <><label>내 역할 <select value={s.role} onChange={e => change({ ...s, role: e.target.value })}><option value="">모두 읽기</option>{speakers.map(speaker => <option key={speaker}>{speaker}</option>)}</select></label>
    </>}
  </div></details>;
}
export function Concealed({ text, hidden, phrases = [] }: { text: string; hidden: boolean; phrases?: string[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [hidden, text]);
  if (hidden && !open) return <button className="control border border-edge" onClick={() => setOpen(true)}>탭하여 보기</button>;
  const matches = phrases.filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern = matches.length ? new RegExp(`(${matches.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null;
  return <>{pattern ? text.split(pattern).map((part, i) => matches.some(p => p.toLowerCase() === part.toLowerCase()) ? <mark key={i}>{part}</mark> : part) : text}</>;
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
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; abort(): void;
  onresult: ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
export function compareWords(expected: string, actual: string) {
  const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const a = words(expected), b = words(actual);
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0; const missing: string[] = [], added: string[] = [];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) added.push(b[j++]);
    else missing.push(a[i++]);
  }
  return { score: Math.round(100 * dp[0][0] / Math.max(1, a.length, b.length)), missing, added };
}
export function Shadowing({ text, pause }: { text: string; pause: () => void }) {
  const [message, setMessage] = useState(''), [listening, setListening] = useState(false);
  const active = useRef<Recognition | null>(null);
  const ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition });
  const Engine = ctor.SpeechRecognition ?? ctor.webkitSpeechRecognition;
  useEffect(() => { const cancel = () => active.current?.abort(); window.addEventListener('study-play', cancel); return () => { window.removeEventListener('study-play', cancel); cancel(); }; }, []);
  useEffect(() => () => { const current = active.current; active.current = null; current?.abort(); }, [text]);
  return <span className="block text-sm"><button className="control border border-edge" disabled={!Engine} onClick={() => {
    if (listening) { active.current?.abort(); return; }
    if (!Engine || !window.confirm('브라우저 음성 인식은 음성을 외부 서버에서 처리할 수 있으며 인터넷이 필요할 수 있습니다. 시작할까요?')) return;
    window.dispatchEvent(new Event('study-microphone'));
    pause(); const recognition = new Engine(); active.current = recognition; recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => { if (active.current !== recognition) return; const actual = event.results[0][0].transcript, result = compareWords(text, actual);
      setMessage(`인식: ${actual} · 인식 문장 일치율 ${result.score}% · 누락: ${result.missing.join(', ') || '없음'} · 추가: ${result.added.join(', ') || '없음'}`); };
    recognition.onerror = event => { if (active.current === recognition) setMessage(`음성 인식 실패 (${event.error}). 수동 연습을 계속할 수 있습니다.`); };
    recognition.onend = () => { if (active.current === recognition) { active.current = null; setListening(false); } };
    try { recognition.start(); setListening(true); } catch { setMessage('마이크를 시작할 수 없습니다.'); }
  }}>{listening ? '인식 중지' : '말해 보기'}</button> {!Engine && '이 브라우저는 음성 인식을 지원하지 않습니다.'}<span role="status">{message}</span></span>;
}
