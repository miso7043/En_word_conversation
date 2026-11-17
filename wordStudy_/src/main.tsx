import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Lesson } from '../shared/lesson';
import { usePlayback } from './usePlayback';
import { selectedPlaylist, updateSelection } from './playlist';
import './style.css';
import './retireOffline';
import { StudyControls, Concealed, useSettings, useWakeLock, type Settings } from './study';
import { readStored, writeStored, bookmark, restore, type Bookmark } from './storage';
let csrfToken = '';
type User = { sub: string; admin: boolean; csrf: string };


const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
});

async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`/api/${path}`, {
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

function LessonView({ lesson, save, startSelected, autoPlay, onComplete, selectionCount, order, changeOrder, settings, changeSettings }: {
  lesson: Lesson; save: (position: number) => void;
  startSelected: () => boolean;
  autoPlay: boolean; onComplete: () => void;
  selectionCount: number; order: 'reverse' | 'forward'; changeOrder: (order: 'reverse' | 'forward') => void; settings: Settings; changeSettings: (s: Settings) => void;
}) {
  const player = usePlayback(lesson, save, { autoPlay, onComplete, settings });
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
    <main className="lesson-content min-w-0 px-4 pb-40 pt-1 sm:px-8 md:px-10 md:pt-10">
      <div className="mb-6 break-words">
        <h2 id="lesson-title" className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{lesson.title}</h2>
        <Paragraphs values={lesson.description} />
      </div>
      <section aria-label="음성 제어" className="fixed inset-x-0 bottom-0 z-10 border-t border-edge bg-panel px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:sticky md:top-0 md:mb-5 md:rounded-xl md:border md:pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className="control bg-accent text-slate-950" disabled={!player.canPlay && !selectionCount} onClick={() => {
            if (player.mode !== 'idle' || !startSelected()) player.toggle();
          }}
            aria-keyshortcuts="Space" title="재생 중 스페이스바로 일시정지·이어 듣기">
            {playLabel}
          </button>
          <button className="control border border-edge" disabled={player.mode === 'idle' && player.position === 0} onClick={() => {
            player.stop();
            requestAnimationFrame(() => document.getElementById('lesson-title')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
          }}>정지</button>
          <div className="flex items-center gap-2">
            <button className="control border border-edge" disabled={!player.canPlay} onClick={player.nextLine}>다음 문장</button>
            <select className="min-h-11" aria-label="연속 재생 방향" value={order} onChange={e => changeOrder(e.target.value as 'reverse' | 'forward')}><option value="reverse">아래 → 위</option><option value="forward">위 → 아래</option></select>
          </div>
          <StudyControls settings={settings} change={changeSettings} speakers={[...new Set(flat.map(line => line.speaker))]} count={flat.length} />
        </div>
        {selectionCount > 0 && <p className="mt-1 text-sm text-slate-300">선택 {selectionCount}개{selectionCount > 1 ? ' 연속 재생' : ' 재생'}</p>}
        {wakeStatus && <p role="status">{wakeStatus}</p>}
        <p className="mt-1 min-h-5 text-sm text-slate-300" role="status">{player.status}</p>
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
                      <p lang="en" className="leading-relaxed"><Concealed label="영어 보기" text={line.text} hidden={settings.hideEnglish} phrases={line.keyPhrase} /></p>
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
    setMessage('재생을 정지했습니다.');
  }

  function speak(value: string) {
    const alternatives = voices.filter(voice => voiceKey(voice) !== previousVoice.current);
    const pool = alternatives.length ? alternatives : voices;
    const voice = pool[Math.floor(Math.random() * pool.length)];
    if (!voice) return;
    previousVoice.current = voiceKey(voice);
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.voice = voice;
    utterance.lang = voice.lang.replaceAll('_', '-');
    utterance.rate = config.current.rate;
    active.current = utterance;
    setPlaying(true);
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
  const status = message || (!synth ? '이 브라우저는 음성 재생을 지원하지 않습니다.'
    : voices.length ? `사용 가능한 영어 목소리 ${voices.length}개 · 재생할 때 무작위로 선택합니다.`
    : '사용 가능한 영어 목소리가 아직 없습니다.');

  return (
    <main className="min-w-0 px-4 py-4 sm:px-8 md:px-10 md:py-10" aria-labelledby="sentence-reader-title">
      <h2 id="sentence-reader-title" className="mb-4 text-3xl font-bold">영어 문장 읽기</h2>
      <label htmlFor="sentence-reader-input" className="mb-2 block text-slate-300">영어 문장</label>
      <textarea id="sentence-reader-input" lang="en" spellCheck={false} rows={12} value={text} onChange={event => {
        setText(event.target.value);
        try { localStorage.setItem('sentence-reader-text', event.target.value); } catch { /* 저장 실패 시에도 입력 유지 */ }
      }} className="mb-3 w-full rounded-xl border border-edge bg-panel p-3 focus-visible:outline-accent" />
      <div className="flex flex-wrap items-center gap-2">
        <button className="control bg-accent text-slate-950" disabled={!text.trim() || !voices.length} onClick={() => {
          stop();
          speak(text.trim());
        }}>▶ 재생</button>
        <button className="control border border-edge" disabled={!playing} onClick={stop}>정지</button>
        <label className="ml-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={repeat} onChange={event => {
          repeating.current = event.target.checked;
          setRepeat(event.target.checked);
        }} />반복 재생</label>
        <StudyControls settings={settings} change={changeSettings} />
      </div>
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
  const administration = location.pathname === '/administration';
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [settings, changeSettings] = useSettings();
  const [order, setOrder] = useState<'reverse' | 'forward'>(() => readStored<string>('playlist-order-v1', 'reverse') === 'forward' ? 'forward' : 'reverse');
  const [policy, setPolicy] = useState('update');
  const scope = user?.sub ?? 'anonymous';
  const [page, setPage] = useState<'dialogues' | 'sentences'>('dialogues');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [session, setSession] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
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
  const playlist = selectedPlaylist(lessons, checkedIds, order);
  useEffect(() => { if (authReady) writeStored(`selection-v1:${scope}`, [...checkedIds]); }, [checkedIds]);
  useEffect(() => { writeStored('playlist-order-v1', order); }, [order]);

  function checkLesson(id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    const anchor = selectionAnchor.current;
    setCheckedIds(previous => updateSelection(lessons.map(lesson => lesson.id), previous,
      id, anchor, event.shiftKey, event.ctrlKey || event.metaKey));
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
    const index = playlist.findIndex(lesson => lesson.id === selected.id);
    const previous = index < 0 ? undefined : playlist[index + 1];
    if (!previous) {
      setAutoPlay(false);
      return;
    }
    changeSettings({ ...settings, role: '' });
    setSelectedId(previous.id);
    setAutoPlay(true);
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
    if (!authReady) return;
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

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center gap-3 p-4">
        <nav aria-label="학습 메뉴" className="flex gap-2">
          {([['dialogues', '대화 연습'], ['sentences', '문장읽기']] as const).map(([value, label]) => (
            <button key={value} aria-current={page === value ? 'page' : undefined} onClick={() => {
              setAutoPlay(false);
              setPage(value);
              window.scrollTo(0, 0);
            }}
              className={`control border ${page === value ? 'border-accent bg-sky-950 text-accent' : 'border-edge'}`}>{label}</button>
          ))}
        </nav>
        <label className="ml-auto text-sm"><span className="sr-only">테마</span><select aria-label="테마" value={settings.theme} onChange={e => changeSettings({ ...settings, theme: e.target.value })}><option value="dark">어둡게</option><option value="light">밝게</option><option value="system">시스템</option></select></label>
      </header>
      <div className="grid md:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="p-4 md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-edge md:bg-panel md:p-5">
        {administration && <p className="mb-3 text-sm"><a href="/">학습 화면</a></p>}
        {administration && <section className="mb-3"><h2>자료 관리</h2>{!user ? authEnabled ? <a className="control border" href="/api/auth/login">Google 로그인</a> : <p>Google 인증 설정이 필요합니다.</p> : <><p className="break-all">Google ID: {user.sub}</p><p>{user.admin ? '관리자' : '관리자로 등록되지 않은 계정입니다.'}</p>
        <button className="control border" onClick={() => { void api('auth/logout', 'POST', {}).then(() => location.reload()); }}>로그아웃</button>
        {user.admin && <button className="control border" onClick={() => { void api<{ copied: boolean }>('admin/claim-progress', 'POST', {}).then(result => { setStatus(result.copied ? '기존 공동 진도를 복사했습니다.' : '이미 복사한 계정입니다.'); void reload(); }).catch(error => setStatus(error.message)); }}>기존 공동 진도 복사</button>}</>}</section>}
        {page === 'dialogues' && !!lessons.length && (
          <>
            <p className="mb-2 text-sm">선택 {checkedIds.size}개</p>
            <p className="mb-2 text-xs text-slate-400">체크: 재생할 자료 선택 · Ctrl+클릭: 개별 선택 · Shift+클릭: 범위 선택</p>
            <nav aria-label="대화 목록" className="max-h-40 sm:max-h-64 min-h-0 flex-1 space-y-2 overflow-y-auto p-1 md:max-h-none">
              {lessons.map(lesson => (
                <div key={lesson.id} className={`flex items-center gap-2 rounded-xl border px-2 ${checkedIds.has(lesson.id) ? 'border-accent bg-sky-950' : 'border-edge'}`}>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-sky-400"
                    aria-label={`${lesson.title} 연속 재생 선택`} checked={checkedIds.has(lesson.id)}
                    onChange={() => {}} onClick={event => checkLesson(lesson.id, event)} />
                <button key={lesson.id} aria-current={selected?.id === lesson.id}
                  className="min-w-0 flex-1 select-none rounded-xl border border-transparent px-2 py-2 text-left hover:border-accent aria-[current=true]:border-accent"
                  onClick={event => {
                    if (event.ctrlKey || event.metaKey || event.shiftKey) checkLesson(lesson.id, event);
                    else selectLesson(lesson.id);
                  }}>
                  {lesson.title}
                  {lesson.date && <span className="mt-1 block text-xs text-slate-400">{dateFormat.format(new Date(lesson.date))}</span>}
                </button>
                </div>
              ))}
            </nav>
          </>
        )}
        {page === 'dialogues' && <div className="mt-2 space-y-2 text-sm">
          {administration && canImport && (
            <div className="flex flex-wrap gap-2">
              <select aria-label="가져오기 정책" value={policy} onChange={e => setPolicy(e.target.value)}><option value="update">변경된 자료 갱신·진도 유지</option><option value="skip">기존 자료 건너뛰기</option></select>
              <label className="control cursor-pointer border border-edge focus-within:outline-2 focus-within:outline-accent">
                JSON 파일
                <input type="file" className="sr-only" accept=".json" multiple disabled={busy} onChange={event => {
                  void importFiles(event.target.files);
                  event.target.value = '';
                }} />
              </label>
              <label className="control cursor-pointer border border-edge focus-within:outline-2 focus-within:outline-accent">
                JSON 폴더
                <input type="file" className="sr-only" {...{ webkitdirectory: '' }} multiple disabled={busy} onChange={event => {
                  void importFiles(event.target.files, true);
                  event.target.value = '';
                }} />
              </label>
            </div>
          )}
          {status && <p role="status" className="break-words text-slate-300">{status}</p>}
          {progressError && <p role="status" className="text-amber-300">{progressError}</p>}
        </div>}
      </aside>
      <div className="min-w-0">
      {importResult && <ImportSummary result={importResult} close={() => setImportResult(null)} />}
      {page === 'sentences' && <SentenceReader settings={settings} changeSettings={changeSettings} />}
      {page === 'dialogues' && selected && !busy && (
        <LessonView key={`${selected.id}-${session}`}
          lesson={{ ...selected, position: positions.current.get(selected.id) ?? selected.position }}
          startSelected={startSelected}
          selectionCount={playlist.length} order={order} changeOrder={setOrder} settings={settings} changeSettings={changeSettings}
          autoPlay={autoPlay} onComplete={playPreviousLesson}
          save={position => save(selected.id, position)} />
      )}
      </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
