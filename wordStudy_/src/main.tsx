import { Fragment, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Lesson } from '../shared/lesson';
import { usePlayback } from './usePlayback';
import { nextPlaylistLesson, selectedPlaylist, updateSelection } from './playlist';
import './style.css';
import { Icon, ToastProvider, useToast } from './ui';
import { StudyControls, Concealed, useSettings, useWakeLock, type Settings } from './study';
import { readStored, writeStored, bookmark, restore, type Bookmark } from './storage';
let csrfToken = '';
type User = { sub: string; admin: boolean; csrf: string };


const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
});

async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data as T;
}

function Paragraphs({ values }: { values: string[] }) {
  return values.map((value, index) => <p key={index} className="mb-2 leading-relaxed text-slate-300">{value}</p>);
}

function LessonView({ lesson, save, startSelected, autoPlay, onComplete, selectionCount, order, changeOrder, settings, changeSettings, repeat, changeRepeat, onStudied, showStudyCount }: {
  onStudied?: () => void; showStudyCount: boolean;
  repeat: boolean; changeRepeat: (repeat: boolean) => void;
  lesson: Lesson; save: (position: number) => void;
  startSelected: () => boolean;
  autoPlay: boolean; onComplete: () => void;
  selectionCount: number; order: 'reverse' | 'forward'; changeOrder: (order: 'reverse' | 'forward') => void; settings: Settings; changeSettings: (s: Settings) => void;
}) {
  const notify = useToast();
  const player = usePlayback(lesson, save, { autoPlay, onComplete, settings, onStudied });
  const wakeStatus = useWakeLock(player.mode === 'playing', settings.wake);
  const flat = lesson.conversations.flatMap(group => group.lines);
  useEffect(() => {
    function handleSpace(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.defaultPrevented || event.isComposing
        || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable
        || target.closest('input, textarea, select, a, [role="textbox"], dialog'))) return;
      if (!player.canPlay || player.mode === 'idle') return;
      // Prevent scrolling and the focused button's synthetic click as well.
      event.preventDefault();
      if (!event.repeat) player.toggle();
    }
    function handleSpaceUp(event: KeyboardEvent) {
      if (event.code === 'Space' && spaceHandled.current) {
        event.preventDefault();
        spaceHandled.current = false;
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      handleSpace(event);
      if (event.code === 'Space' && event.defaultPrevented) spaceHandled.current = true;
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleSpaceUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleSpaceUp);
    };
  }, [player.canPlay, player.mode, player.toggle]);
  const spaceHandled = useRef(false);
  const playLabel = player.mode === 'playing' ? '일시정지' : player.mode === 'paused' || player.position > 0 ? '이어 듣기' : '재생';
  let offset = 0;

  return (
    <main className="lesson-content min-w-0 px-4 pb-24 pt-1 sm:px-8 md:px-10 md:pt-10">
      <div className="mb-6 break-words">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="lesson-title" className="min-w-0 text-3xl font-bold tracking-tight sm:text-4xl">{lesson.title}</h2>
          {showStudyCount && <p className="ml-auto shrink-0 text-right text-sm text-slate-300" aria-live="polite">학습 {lesson.studyCount ?? 0}회</p>}
        </div>
        <Paragraphs values={lesson.description} />
      </div>
      <section aria-label="음성 제어" className="playback-panel">
        <div className="playback-row">
          <button className="icon-button bg-accent text-slate-950" aria-label={playLabel} disabled={!flat.length && !selectionCount} onClick={() => {
            if (player.mode !== 'playing' && !player.checkVoices()) return;
            if (player.mode !== 'idle' || !startSelected()) player.toggle();
          }} aria-keyshortcuts="Space" title={playLabel}>
            <Icon name={player.mode === 'playing' ? 'pause' : 'play'} />
          </button>
          <button className="icon-button border border-edge" aria-label="정지" title="정지" disabled={player.mode === 'idle' && player.position === 0} onClick={() => {
            player.stop();
            requestAnimationFrame(() => document.getElementById('lesson-title')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
          }}><Icon name="stop" /></button>
          <button className="icon-button border border-edge" aria-label="다음 문장" title="다음 문장" disabled={!player.canPlay} onClick={player.nextLine}><Icon name="next" /></button>
          <button className="icon-button border border-edge" aria-label={`연속 재생 방향: ${order === 'reverse' ? '아래에서 위' : '위에서 아래'}`} title={order === 'reverse' ? '아래에서 위 · 방향 바꾸기' : '위에서 아래 · 방향 바꾸기'} onClick={() => {
            const next = order === 'reverse' ? 'forward' : 'reverse';
            changeOrder(next);
            notify(`재생 방향: ${next === 'reverse' ? '아래에서 위' : '위에서 아래'}`);
          }}><Icon name={order === 'reverse' ? 'up' : 'down'} /></button>
          <label className="icon-button repeat-toggle" title="반복 재생"><input type="checkbox" aria-label="반복 재생" checked={repeat} onChange={event => {
            changeRepeat(event.target.checked);
            notify(`반복 재생 ${event.target.checked ? '켬' : '끔'}`);
          }} /></label>
          <StudyControls settings={settings} change={changeSettings} speakers={[...new Set(flat.map(line => line.speaker))]} count={flat.length} />
        </div>
        <p className="sr-only" role="status">{player.status}</p>
        {wakeStatus && <p className="playback-notice" role="status">{wakeStatus}</p>}
      </section>
      {lesson.conversations.map((dialogue, group) => {
        const start = offset;
        offset += dialogue.lines.length;
        return (
          <article key={group} className="mb-4 rounded-2xl border border-edge bg-panel p-4 sm:p-6">
            <h3 className="mb-2 text-xl font-semibold">{dialogue.title}</h3>
            <Paragraphs values={dialogue.description} />
            {player.cast[group] && (
              <p className="mb-3 text-xs leading-relaxed text-slate-400">
                {[...player.cast[group]].map(([speaker, voice]) => `${speaker} · ${voice.name} (${voice.lang})`).join(' / ')}
              </p>
            )}
            <div className="grid gap-2">
              {dialogue.lines.map((line, index) => {
                const position = start + index;
                const active = player.mode !== 'idle' && player.position === position;
                return (
                  <div key={index} id={`line-${position}`} className={`flex scroll-mt-28 items-start gap-3 rounded-xl border p-2 sm:p-3 ${active ? 'border-accent bg-sky-950' : 'border-transparent bg-canvas'}`}>
                    <button className="control min-w-11 border border-edge bg-panel px-2 text-accent" disabled={!player.canPlay} onClick={() => player.playLine(position)}
                      aria-label={`${line.speaker} · ${index + 1}번째 대사 · ${active ? playLabel : '여기부터 재생'}`}>{line.speaker}</button>
                    <div className="min-w-0 break-words py-1">
                      <p lang="en" className="leading-relaxed"><Concealed label="영어 보기" text={line.text} hidden={settings.hideEnglish} phrases={line.keyPhrase?.length ? line.keyPhrase : [lesson.title]} /></p>
                      {line.meaning && <p className="mt-1 text-sm leading-relaxed text-slate-300"><Concealed label="해석 보기" text={line.meaning} hidden={settings.hideMeaning} /></p>}
                      {player.turnProgress && player.position === position && <div className="mt-3 role-progress">
                        <progress aria-label="내 역할 연습 진행" max={player.turnProgress.speechMs + 3000} value={player.turnProgress.phase === 'extra' ? player.turnProgress.speechMs + 3000 - player.turnProgress.remainingMs : undefined} />
                        <p className="mt-1 text-sm text-slate-300">{player.mode === 'paused' ? '일시정지됨' : player.turnProgress.phase === 'speech' ? '내 차례 · 음소거로 연습 중' : `내 차례 · 추가 시간 ${(player.turnProgress.remainingMs / 1000).toFixed(1)}초`}</p>
                      </div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </main>
  );
}

type ImportResult = Record<'added' | 'updated' | 'unchanged' | 'skipped' | 'failed', string[]>;
const emptyImport = (): ImportResult => ({ added: [], updated: [], unchanged: [], skipped: [], failed: [] });

function SentenceReader({ settings, changeSettings }: { settings: Settings; changeSettings: (s: Settings) => void }) {
  const notify = useToast();
  const [paused, setPaused] = useState(false);
  const config = useRef(settings); config.current = settings;
  const [text, setText] = useState(() => { try { return localStorage.getItem('sentence-reader-text') ?? ''; } catch { return ''; } });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const [repeat, setRepeat] = useState(false);
  const repeating = useRef(false);
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const previousVoice = useRef('');
  const synth = window.speechSynthesis;
  const voiceKey = (voice: SpeechSynthesisVoice) => voice.voiceURI || `${voice.name}:${voice.lang}`;

  useEffect(() => {
    function refresh() {
      const found = new Map<string, SpeechSynthesisVoice>();
      for (const voice of synth?.getVoices() ?? []) {
        if (/^en(?:[-_]|$)/i.test(voice.lang)) found.set(voiceKey(voice), voice);
      }
      setVoices([...found.values()]);
    }
    function cancel() {
      if (active.current) {
        active.current = null;
        synth?.cancel();
      }
    }
    refresh();
    synth?.addEventListener('voiceschanged', refresh);
    window.addEventListener('pagehide', cancel);
    return () => {
      synth?.removeEventListener('voiceschanged', refresh);
      window.removeEventListener('pagehide', cancel);
      cancel();
    };
  }, [synth]);

  function stop() {
    active.current = null;
    synth?.cancel();
    setPlaying(false);
    setPaused(false);
    setMessage('재생을 정지했습니다.');
  }

  function speak(value: string) {
    const available = (synth?.getVoices() ?? []).filter(voice => /^en(?:[-_]|$)/i.test(voice.lang));
    const alternatives = available.filter(voice => voiceKey(voice) !== previousVoice.current);
    const pool = alternatives.length ? alternatives : available;
    const voice = pool[Math.floor(Math.random() * pool.length)];
    if (!voice) return;
    previousVoice.current = voiceKey(voice);
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.voice = voice;
    utterance.lang = voice.lang.replaceAll('_', '-');
    utterance.rate = config.current.rate;
    active.current = utterance;
    setPlaying(true);
    setPaused(false);
    const label = `${voice.name} (${voice.lang})`;
    setMessage(`재생 중 · ${label}`);
    utterance.onend = () => {
      if (active.current !== utterance) return;
      if (repeating.current) speak(value);
      else {
        active.current = null;
        setPlaying(false);
        setMessage(`재생 완료 · ${label}`);
      }
    };
    utterance.onerror = () => {
      if (active.current !== utterance) return;
      active.current = null;
      setPlaying(false);
      setMessage('음성 재생 중 오류가 발생했습니다.');
    };
    if (synth.paused) synth.resume();
    synth.speak(utterance);
  }

  const wakeStatus = useWakeLock(playing, settings.wake);
  const status = paused ? '일시정지됨' : message || (!synth ? '이 브라우저는 음성 재생을 지원하지 않습니다.'
    : voices.length ? `사용 가능한 영어 목소리 ${voices.length}개 · 재생할 때 무작위로 선택합니다.`
    : '사용 가능한 영어 목소리가 아직 없습니다.');

  return (
    <main className="min-w-0 px-4 pt-4 pb-24 sm:px-8 md:px-10 md:py-10" aria-labelledby="sentence-reader-title">
      <h2 id="sentence-reader-title" className="mb-4 text-3xl font-bold">영어 문장 읽기</h2>
      <label htmlFor="sentence-reader-input" className="mb-2 block text-slate-300">영어 문장</label>
      <textarea id="sentence-reader-input" lang="en" spellCheck={false} rows={12} value={text} onChange={event => {
        setText(event.target.value);
        try { localStorage.setItem('sentence-reader-text', event.target.value); } catch { /* 저장 실패 시에도 입력 유지 */ }
      }} className="mb-3 w-full rounded-xl border border-edge bg-panel p-3 focus-visible:outline-accent" />
      <section aria-label="문장 읽기 제어" className="playback-panel">
        <div className="playback-row">
          <button className="icon-button bg-accent text-slate-950" aria-label={playing ? paused ? '이어 듣기' : '일시정지' : '재생'} title={playing ? paused ? '이어 듣기' : '일시정지' : '재생'} disabled={!text.trim()} onClick={() => {
            if ((!playing || paused) && !(synth?.getVoices() ?? []).some(voice => /^en(?:[-_]|$)/i.test(voice.lang))) {
              window.alert('재생할 목소리가 없습니다.');
              return;
            }
            if (playing) {
              if (paused) synth.resume(); else synth.pause();
              setPaused(!paused);
            } else { stop(); speak(text.trim()); }
          }}><Icon name={playing && !paused ? 'pause' : 'play'} /></button>
          <button className="icon-button border border-edge" aria-label="정지" title="정지" disabled={!playing} onClick={stop}><Icon name="stop" /></button>
          <label className="icon-button repeat-toggle" title="반복 재생"><input type="checkbox" aria-label="반복 재생" checked={repeat} onChange={event => {
            repeating.current = event.target.checked;
            setRepeat(event.target.checked);
            notify(`반복 재생 ${event.target.checked ? '켬' : '끔'}`);
          }} /></label>
          <StudyControls settings={settings} change={changeSettings} />
        </div>
      </section>
      <p role="status">{wakeStatus}</p>
      <p className="mt-2 text-sm text-slate-300" role="status">{status}</p>
    </main>
  );
}

function ImportSummary({ result, close }: { result: ImportResult; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} onClose={close} aria-labelledby="import-title"
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-edge bg-panel p-6 text-slate-100 backdrop:bg-black/60">
      <h2 id="import-title" className="mb-5 text-xl font-bold">폴더 가져오기 결과</h2>
      {([
        ['새로 등록한 파일', result.added],
        ['갱신한 파일', result.updated],
        ['변경 없는 파일', result.unchanged],
        ['기존에 있어 건너뛴 파일', result.skipped],
        ['가져오지 못한 파일', result.failed],
      ] as const).map(([title, files]) => (
        <section key={title} className="mb-5">
          <h3 className="mb-2 font-semibold">{title} ({files.length}개)</h3>
          {files.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            {files.map((name, index) => <li className="break-all" key={index}>{name}</li>)}
          </ul> : <p className="text-sm text-slate-400">없음</p>}
        </section>
      ))}
      <form method="dialog" className="flex justify-end">
        <button autoFocus className="control bg-accent text-slate-950">확인</button>
      </form>
    </dialog>
  );
}

function App() {
  const notify = useToast();
  const picker = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const wide = matchMedia('(min-width: 768px)');
    const close = () => { if (wide.matches) picker.current?.close(); };
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, []);
  const administration = location.pathname === `${import.meta.env.BASE_URL}administration`;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [settings, changeSettings] = useSettings();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStored<boolean>('sidebar-collapsed-v1', false) === true);
  useEffect(() => { writeStored('sidebar-collapsed-v1', sidebarCollapsed); }, [sidebarCollapsed]);
  const [order, setOrder] = useState<'reverse' | 'forward'>(() => readStored<string>('playlist-order-v1', 'reverse') === 'forward' ? 'forward' : 'reverse');
  const policy = 'update';
  const scope = user?.sub ?? 'anonymous';
  const [page, setPage] = useState<'dialogues' | 'sentences'>('dialogues');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const orderedLessons = user?.admin ? [...lessons].sort((a, b) => Number(!!a.memorized) - Number(!!b.memorized)) : lessons;
  const [memorizedPending, setMemorizedPending] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState('');
  const [session, setSession] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const selectionAnchor = useRef<string | null>(null);
  const [status, setStatus] = useState('대화 목록을 불러오는 중입니다.');
  const [progressError, setProgressError] = useState('');
  const [canImport, setCanImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const positions = useRef(new Map<string, number>());
  const currentScope = useRef(scope); currentScope.current = scope;
  const selected = lessons.find(lesson => lesson.id === selectedId) ?? lessons[0];
  const playlist = selectedPlaylist(orderedLessons, checkedIds, order);
  const allChecked = lessons.length > 0 && playlist.length === lessons.length;
  useEffect(() => { if (authReady) writeStored(`selection-v1:${scope}`, [...checkedIds]); }, [checkedIds]);
  useEffect(() => { writeStored('playlist-order-v1', order); }, [order]);

  function checkLesson(id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    const anchor = selectionAnchor.current;
    const next = updateSelection(orderedLessons.map(lesson => lesson.id), checkedIds,
      id, anchor, event.shiftKey, event.ctrlKey || event.metaKey);
    setCheckedIds(next);
    notify(`재생할 자료 ${next.size}개 선택`);
    if (!event.shiftKey || anchor === null) selectionAnchor.current = id;
  }

  function selectLesson(id: string) {
    setAutoPlay(false);
    setSelectedId(id); changeSettings({ ...settings, role: '' });
  }

  function startSelected() {
    const bottom = playlist[0];
    if (!bottom) return false;
    if (bottom.id !== selected?.id) changeSettings({ ...settings, role: '' });
    setSelectedId(bottom.id);
    setAutoPlay(true);
    setSession(value => value + 1);
    return true;
  }

  function playPreviousLesson() {
    if (!selected) return;
    const previous = nextPlaylistLesson(playlist, selected, repeat);
    if (!previous) {
      setAutoPlay(false);
      return;
    }
    if (previous.id !== selected.id) changeSettings({ ...settings, role: '' });
    setSelectedId(previous.id);
    setSession(value => value + 1);
    setAutoPlay(true);
  }

  function recordCompletion(id: string) {
    if (!user?.admin) return;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    const eventId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    void api<{ studyCount: number }>('study-completions', 'POST', { id, eventId }).then(result => {
      setLessons(items => items.map(item => item.id === id ? { ...item, studyCount: Math.max(item.studyCount ?? 0, result.studyCount) } : item));
    }).catch(() => setProgressError('학습 횟수를 저장하지 못했습니다. 서버 연결을 확인하세요.'));
  }

  async function toggleMemorized(id: string, memorized: boolean) {
    if (!user?.admin) return;
    setMemorizedPending(items => new Set(items).add(id));
    try {
      const result = await api<{ memorized: boolean }>('memorized', 'PUT', { id, memorized });
      setLessons(items => items.map(item => item.id === id ? { ...item, memorized: result.memorized } : item));
      setProgressError('');
    } catch {
      setProgressError('암기 상태를 저장하지 못했습니다. 서버 연결을 확인하세요.');
    } finally {
      setMemorizedPending(items => { const next = new Set(items); next.delete(id); return next; });
    }
  }

  async function reload() {
    await pending.current;
    const data = await api<Lesson[]>('lessons');
    if (currentScope.current !== scope) return 0;
    if (!user) {
      const saved = readStored<Record<string, Bookmark>>(`progress-v1:${scope}`, {});
      for (const lesson of data) lesson.position = restore(lesson, saved?.[lesson.id]);
    }
    positions.current.clear();
    setLessons(data);
    const stored = readStored<unknown>(`selection-v1:${scope}`, []);
    setCheckedIds(new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && data.some(item => item.id === id)) : []));
    setSession(value => value + 1);
    return data.length;
  }

  useEffect(() => {
    void api<{ enabled: boolean; user: User | null }>('auth/session').then(data => {
      csrfToken = data.user?.csrf ?? ''; setUser(data.user); setAuthEnabled(data.enabled); setAuthReady(true);
    }).catch(() => { setAuthReady(true); setStatus('인증 상태를 확인할 수 없습니다. 서버 연결을 확인하세요.'); });
  }, []);
  useEffect(() => {
    if (!authReady || (administration && !user?.admin)) return;
    void reload().then(count => setStatus(count ? '' : '등록된 대화가 없습니다.'))
      .catch(() => setStatus('대화 목록을 불러올 수 없습니다. 서버 상태를 확인하세요.'));
    void api<{ canImport: boolean }>('config').then(config => setCanImport(config.canImport)).catch(() => {});
  }, [authReady, scope]);

  function save(id: string, position: number) {
    positions.current.set(id, position);
    const lesson = lessons.find(item => item.id === id);
    const saved = readStored<Record<string, Bookmark>>(`progress-v1:${scope}`, {});
    if (lesson) writeStored(`progress-v1:${scope}`, { ...saved, [id]: bookmark(lesson, position) });
    if (!user || !lesson) return;
    const sub = user.sub;
    pending.current = pending.current.then(async () => {
      if (currentScope.current !== sub) return;
      await api('progress', 'PUT', { id, position });
      setProgressError('');
    }).catch(() => setProgressError('학습 위치를 저장하지 못했습니다. 서버 연결을 확인하세요.'));
  }

  async function importFiles(files: FileList | null, folder = false) {
    const json = Array.from(files ?? []).filter(file => /\.json$/i.test(file.name));
    if (!json.length) {
      if (folder && files?.length) setImportResult(emptyImport());
      return;
    }
    setBusy(true);
    setStatus('JSON 자료를 가져오는 중입니다.');
    const result: ImportResult = emptyImport();
    const duplicates = new Set(json.filter((file, i) => json.some((other, j) => i !== j && file.name === other.name)).map(file => file.name));
    await pending.current;
    for (const file of json) {
      const label = folder ? file.webkitRelativePath || file.name : file.name;
      if (duplicates.has(file.name)) {
        result.failed.push(`${label} · 같은 파일명 충돌`);
        continue;
      }
      try {
        const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
        const response = await api<{ status: 'added' | 'updated' | 'unchanged' | 'skipped' }>('import', 'POST', {
          name: file.name, modified: file.lastModified, data, policy,
        });
        result[response.status].push(label);

      } catch {
        result.failed.push(label);
      }
    }
    try {
      if (result.added.length || result.updated.length) await reload();
      setStatus(result.failed.length ? `가져오지 못한 파일 · ${result.failed.join(', ')}`
        : result.added.length ? `${result.added.length}개 자료를 저장했습니다.` : '');
    } catch {
      setStatus('가져온 뒤 목록을 다시 읽지 못했습니다. 페이지를 새로고침하세요.');
    } finally {
      setBusy(false);
      setImportResult(result);
    }
  }

  function lessonList() { return <>
        {page === 'dialogues' && !!lessons.length && (
          <>
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-sky-400"
                  checked={allChecked}
                  ref={input => { if (input) input.indeterminate = playlist.length > 0 && !allChecked; }}
                  onChange={event => {
                    selectionAnchor.current = null;
                    setCheckedIds(new Set(event.target.checked ? lessons.map(lesson => lesson.id) : []));
                    notify(event.target.checked ? '전체 자료 선택' : '전체 선택 해제');
                  }} />
                전체 선택
              </label>
              <span>선택 {playlist.length}개</span>
            </div>
            <p className="mb-2 text-xs text-slate-400">체크: 재생할 자료 선택 · Ctrl+클릭: 개별 선택 · Shift+클릭: 범위 선택</p>
            <nav aria-label="대화 목록" className="lesson-list min-h-0 flex-1 space-y-2 overflow-y-auto p-1">
              {orderedLessons.map((lesson, index) => (
                <Fragment key={lesson.id}>
                {user?.admin && lesson.memorized && (index === 0 || !orderedLessons[index - 1].memorized) && (
                  <div role="separator" aria-label="Memorized" className="flex items-center gap-3 py-3 text-xs text-slate-400">
                    <span className="h-px flex-1 bg-edge" /><span>Memorized</span><span className="h-px flex-1 bg-edge" />
                  </div>
                )}
                <div key={lesson.id} className={`flex items-center gap-2 rounded-xl border px-2 ${checkedIds.has(lesson.id) ? 'border-accent bg-sky-950' : 'border-edge'}`}>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-sky-400"
                    aria-label={`${lesson.title} 연속 재생 선택`} checked={checkedIds.has(lesson.id)}
                    onChange={() => {}} onClick={event => checkLesson(lesson.id, event)} />
                <button key={lesson.id} aria-current={selected?.id === lesson.id}
                  className="min-w-0 flex-1 select-none rounded-xl border border-transparent px-2 py-2 text-left hover:border-accent aria-[current=true]:border-accent"
                  onClick={event => {
                    if (event.ctrlKey || event.metaKey || event.shiftKey) checkLesson(lesson.id, event);
                    else { selectLesson(lesson.id); picker.current?.close(); }
                  }}>
                  {lesson.title}
                  {lesson.date && <span className="mt-1 block text-xs text-slate-400">{dateFormat.format(new Date(lesson.date))}</span>}
                </button>
                {user?.admin && <label className="flex shrink-0 flex-col items-center gap-1 py-2 text-[10px]">
                  <input type="checkbox" className="h-4 w-4 accent-sky-400"
                    aria-label={`${lesson.title} Memorized`} checked={!!lesson.memorized}
                    disabled={memorizedPending.has(lesson.id)}
                    onChange={event => { void toggleMemorized(lesson.id, event.target.checked); }} />
                  Memorized
                </label>}
                </div>
                </Fragment>
              ))}
            </nav>
          </>
        )}
        {page === 'dialogues' && <div className="mt-2 space-y-2 text-sm">
          {status && <p role="status" className="break-words text-slate-300">{status}</p>}
          {progressError && <p role="status" className="text-amber-300">{progressError}</p>}
        </div>}
  </>; }

  if (administration) return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">자료 관리</h1>
      {!authReady ? <p role="status">인증 상태를 확인하고 있습니다.</p> : !user?.admin ?
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true); setStatus('');
          void api('auth/login', 'POST', { username: data.get('username'), password: data.get('password') })
            .then(() => location.reload()).catch(error => setStatus(error.message)).finally(() => setBusy(false));
        }}>
          <h2>관리자 인증</h2>
          <label className="block">아이디<input className="ml-3 border p-2" name="username" autoComplete="username" required maxLength={255} /></label>
          <label className="block">비밀번호<input className="ml-3 border p-2" name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
          <button className="control border" disabled={busy || !authEnabled}>로그인</button>
          {!authEnabled && <p>서버의 관리자 인증 설정이 필요합니다.</p>}
        </form> : <>
          <button className="control border" onClick={() => { void api('auth/logout', 'POST', {}).then(() => location.reload()).catch(error => setStatus(error.message)); }}>로그아웃</button>
          {canImport && <div className="flex flex-wrap gap-3">
            <label className="control cursor-pointer border">파일 등록<input aria-label="파일 등록" className="sr-only" type="file" accept=".json" multiple disabled={busy} onChange={event => { void importFiles(event.target.files); event.target.value = ''; }} /></label>
            <label className="control cursor-pointer border">폴더 등록<input aria-label="폴더 등록" className="sr-only" type="file" {...{ webkitdirectory: '' }} multiple disabled={busy} onChange={event => { void importFiles(event.target.files, true); event.target.value = ''; }} /></label>
          </div>}
          <section><h2 className="mb-3 text-lg">등록된 리스트 ({lessons.length})</h2>
            <ul className="space-y-2">{lessons.map(lesson => <li className="rounded border border-edge p-3" key={lesson.id}>{lesson.id} · {lesson.title}</li>)}</ul>
          </section>
        </>}
      {status && <p role="status">{status}</p>}
      {importResult && <ImportSummary result={importResult} close={() => setImportResult(null)} />}
    </main>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="study-header">
        <nav aria-label="학습 메뉴" className="flex shrink-0 gap-1">
          {([['dialogues', '대화연습', 'chat'], ['sentences', '문장읽기', 'read']] as const).map(([value, label, icon]) => (
            <button key={value} aria-label={label} title={label} aria-current={page === value ? 'page' : undefined} onClick={() => {
              setAutoPlay(false);
              setPage(value);
              window.scrollTo(0, 0);
            }} className={`menu-button border ${page === value ? 'border-accent bg-sky-950 text-accent' : 'border-edge'}`}><Icon name={icon} /><span className="hidden md:inline">{label}</span></button>
          ))}
        </nav>
        {page === 'dialogues' && <button className="icon-button mobile-picker-trigger border border-edge" aria-label="자료 선택" title="자료 선택" aria-haspopup="dialog" onClick={() => picker.current?.showModal()}><Icon name="list" /></button>}
        <div className="theme-buttons ml-auto flex gap-1 md:hidden" role="group" aria-label="테마">
          {([['dark', '어둡게', 'moon'], ['light', '밝게', 'sun'], ['system', '시스템', 'system']] as const).map(([value, label, icon]) => <button key={value} className={`theme-button border ${settings.theme === value ? 'border-accent bg-sky-950 text-accent' : 'border-edge'}`} aria-label={label} title={label} aria-pressed={settings.theme === value} onClick={() => { changeSettings({ ...settings, theme: value }); notify(`${label} 테마`); }}><Icon name={icon} /></button>)}
        </div>
        <label className="ml-auto hidden text-sm md:block"><span className="sr-only">테마</span><select aria-label="테마" value={settings.theme} onChange={event => { changeSettings({ ...settings, theme: event.target.value }); notify(`${({ dark: '어둡게', light: '밝게', system: '시스템' } as Record<string, string>)[event.target.value]} 테마`); }}><option value="dark">어둡게</option><option value="light">밝게</option><option value="system">시스템</option></select></label>
      </header>
      {page === 'dialogues' && (status || progressError) && <p role="status" className="mobile-message px-4 text-sm text-slate-300">{progressError || status}</p>}
      <div className={`study-layout ${page === 'dialogues' ? `has-lessons ${sidebarCollapsed ? 'sidebar-collapsed' : ''}` : 'reader-layout'}`}>
      {page === 'dialogues' && <aside className="desktop-lessons md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-edge md:bg-panel">
        <div className="sidebar-toggle-row"><button className="icon-button border border-edge" aria-label={sidebarCollapsed ? '목록 펼치기' : '목록 접기'} title={sidebarCollapsed ? '목록 펼치기' : '목록 접기'} aria-expanded={!sidebarCollapsed} aria-controls="desktop-lesson-list" onClick={() => setSidebarCollapsed(value => !value)}><Icon name={sidebarCollapsed ? 'expand' : 'collapse'} /></button></div>
        <div id="desktop-lesson-list" className="sidebar-list-content" hidden={sidebarCollapsed}>{lessonList()}</div>
      </aside>}
      <dialog ref={picker} aria-labelledby="lesson-picker-title" className="lesson-picker study-controls m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-edge bg-panel p-4 text-slate-100 backdrop:bg-black/60" onClick={event => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
        }
      }}>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="lesson-picker-title" className="text-xl font-bold">자료 선택</h2><form method="dialog"><button className="icon-button border border-edge" aria-label="선택 닫기" title="닫기"><Icon name="close" /></button></form></div>
        {lessonList()}
      </dialog>
      <div className="min-w-0">
      {importResult && <ImportSummary result={importResult} close={() => setImportResult(null)} />}
      {page === 'sentences' && <SentenceReader settings={settings} changeSettings={changeSettings} />}
      {page === 'dialogues' && selected && !busy && (
        <LessonView key={`${selected.id}-${session}`}
          lesson={{ ...selected, position: positions.current.get(selected.id) ?? selected.position }}
          startSelected={startSelected} repeat={repeat} changeRepeat={setRepeat}
          selectionCount={playlist.length} order={order} changeOrder={setOrder} settings={settings} changeSettings={changeSettings}
          autoPlay={autoPlay} onComplete={playPreviousLesson} showStudyCount={!!user?.admin} onStudied={user?.admin ? () => recordCompletion(selected.id) : undefined}
          save={position => save(selected.id, position)} />
      )}
      </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<ToastProvider><App /></ToastProvider>);
