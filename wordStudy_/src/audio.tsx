import { useEffect, useRef, useState } from 'react';
import type { Lesson } from '../shared/lesson';
import { readStored, writeStored } from './storage';
import { useWakeLock, type Settings } from './study';
type Job = { id: string; title: string; state: string; message?: string; pitch: number; loop: boolean; timeline?: Array<{ start: number; end: number; text: string; lessonId: string; position: number; userTurn?: boolean }> };
export function AudioLibrary({ lessons, settings, admin, request, savePosition }: { lessons: Lesson[]; settings: Settings; admin: boolean; savePosition: (id: string, position: number) => void; request: <T>(path: string, method?: string, body?: object) => Promise<T> }) {
  const [jobs, setJobs] = useState<Job[]>([]), [enabled, setEnabled] = useState(false), [selected, select] = useState(''), [message, setMessage] = useState(''), [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const handledTurn = useRef<number>(-1);
  const lastPosition = useRef('');
  const lastTime = useRef(0);
  const [currentText, setCurrentText] = useState('');
  const job = jobs.find(item => item.id === selected);
  const wake = useWakeLock(playing, settings.wake);
  async function refresh() { try { const data = await request<{ enabled: boolean; jobs: Job[] }>('audio'); setJobs(data.jobs); setEnabled(data.enabled); } catch { setJobs(readStored<Job[]>('offline-audio-v1', [])); } }
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, []);
  useEffect(() => { setPlaying(false); handledTurn.current = -1; lastTime.current=0; lastPosition.current=''; setCurrentText(''); }, [selected]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = settings.rate; }, [settings.rate, selected]);
  useEffect(() => {
    const element = audio.current;
    if (!element || !job || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: job.title, artist: '영어 대화 연습' });
    const seek = (direction: number) => { const times = job.timeline ?? []; const index = times.findIndex(item => item.end > element.currentTime); element.currentTime = times[Math.max(0, Math.min(times.length - 1, index + direction))]?.start ?? 0; };
    const actions: Array<[MediaSessionAction, () => void]> = [['play', () => { void element.play().catch(() => setMessage('재생 버튼을 다시 누르세요.')); }], ['pause', () => element.pause()], ['previoustrack', () => seek(-1)], ['nexttrack', () => seek(1)]];
    for (const [name, handler] of actions) { try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* 미지원 */ } }
    return () => { element.pause(); for (const [name] of actions) { try { navigator.mediaSession.setActionHandler(name, null); } catch { /* 미지원 */ } } };
  }, [job?.id, job?.state]);
  return <details className="rounded-xl border border-edge p-3 my-3"><summary>생성 오디오 · 잠금 화면 재생</summary>
    <p>서버 음성은 단일 영어 목소리입니다. 속도는 즉시 적용하고 피치·문장 반복·구간은 생성 시 반영합니다. 롤플레이는 화면을 켠 상태에서 내 차례에 일시정지합니다. 백그라운드에서는 자동 대기를 보장하지 않습니다.</p>
    {admin && <button className="control border" disabled={!enabled || !lessons.length} onClick={() => {
      void request<{ id: string }>('admin/audio', 'POST', { ids: lessons.map(l => l.id), pitch: settings.pitch, repeat: settings.repeat, role: settings.role, a: settings.a, b: settings.b })
        .then(result => { select(result.id); setMessage('생성 요청을 등록했습니다. 실패한 동일 요청은 다시 누르면 재시도합니다.'); void refresh(); }).catch(error => setMessage(error.message));
    }}>선택 자료 음성 생성·재시도</button>}
    {!enabled && <p>운영자가 로컬 TTS를 활성화하면 음성을 생성할 수 있습니다.</p>}
    <select aria-label="생성 오디오 선택" value={selected} onChange={event => { window.speechSynthesis?.cancel(); select(event.target.value); }}><option value="">오디오 선택</option>{jobs.map(item => <option key={item.id} value={item.id}>{item.title} · {({ queued: '대기', generating: '생성 중', complete: '완료', failed: '실패' } as Record<string,string>)[item.state]}</option>)}</select>
    {job?.state === 'complete' && <><audio ref={audio} src={`/api/audio/${job.id}/file`} controls loop={job.loop} onTimeUpdate={event => { const element = event.currentTarget; if (element.currentTime < lastTime.current - .1) handledTurn.current = -1; lastTime.current = element.currentTime; const line = job.timeline?.find(item => element.currentTime >= item.start && element.currentTime < item.end); if (line && `${line.lessonId}:${line.position}` !== lastPosition.current) { lastPosition.current = `${line.lessonId}:${line.position}`; setCurrentText(line.text); savePosition(line.lessonId, line.position); } const index = job.timeline?.findIndex(item => item.userTurn && element.currentTime >= item.start && element.currentTime < item.end) ?? -1; if (index >= 0 && handledTurn.current !== index) { handledTurn.current = index; element.pause(); setMessage('내 차례입니다. 말한 뒤 오디오 재생을 누르면 계속합니다.'); } }} onPlay={() => { const element = audio.current; const turn = job.timeline?.[handledTurn.current]; if (element && turn?.userTurn && element.currentTime >= turn.start && element.currentTime < turn.end) element.currentTime = turn.end; window.dispatchEvent(new Event('study-audio')); window.dispatchEvent(new Event('study-play')); window.speechSynthesis?.cancel(); setPlaying(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setMessage('오디오를 읽지 못했습니다. 브라우저 음성을 사용할 수 있습니다.')} />
      <a className="control border" href={`/api/audio/${job.id}/export`} download>HTML용 음성 묶음 내보내기</a>
      <button className="control border" onClick={() => { void caches.open('study-audio-v1').then(cache => cache.add(`/api/audio/${job.id}/file`)).then(() => { writeStored('offline-audio-v1', [...readStored<Job[]>('offline-audio-v1', []).filter(item => item.id !== job.id), job]); setMessage('오디오를 오프라인 저장했습니다.'); }).catch(() => setMessage('오디오 저장 실패: 용량과 연결을 확인하세요.')); }}>오디오 오프라인 저장</button></>}
    <p lang="en">{currentText}</p><p role="status">{message || job?.message} {wake}</p>
  </details>;
}
