import { useEffect, useMemo, useRef, useState } from 'react';
import type { Settings } from './study';
import type { Lesson } from '../shared/lesson';

const locales = ['en-us', 'en-ca', 'en-gb', 'en-au', 'en-in'];
const childVoice = /\b(?:child(?:ren)?|kid(?:s)?|junior|teen(?:ager)?|boy|girl|zippy|bahh|boing|bubbles|jester|good news|bad news|superstar)\b/i;
const locale = (voice: SpeechSynthesisVoice) => voice.lang.replaceAll('_', '-').toLowerCase();
const voiceKey = (voice: SpeechSynthesisVoice) => `${locale(voice)}:${voice.voiceURI || voice.name}`;
const isEligibleVoice = (voice: SpeechSynthesisVoice) => locales.includes(locale(voice)) && !childVoice.test(voice.name);

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function assignVoices(lesson: Lesson, voices: SpeechSynthesisVoice[], previous: string[]) {
  return lesson.conversations.map((dialogue, index) => {
    const regions = locales.map(region => shuffle(voices.filter(voice => locale(voice) === region)));
    const pool: SpeechSynthesisVoice[] = [];
    while (regions.some(region => region.length)) {
      for (const region of shuffle(regions)) {
        const voice = region.pop();
        if (voice) pool.push(voice);
      }
    }
    if (pool.length > 1 && voiceKey(pool[0]) === previous[index]) {
      [pool[0], pool[1]] = [pool[1], pool[0]];
    }
    const speakers = [...new Set(dialogue.lines.map(line => line.speaker))];
    return new Map(speakers.map((speaker, offset) => [speaker, pool[offset % pool.length]]));
  });
}

type Mode = 'idle' | 'playing' | 'paused';

export function usePlayback(lesson: Lesson, save: (position: number) => void,
  options: { autoPlay?: boolean; onComplete?: () => void; settings?: Settings } = {}) {
  const settings = useRef(options.settings);
  settings.current = options.settings;
  const repeats = useRef(0);
  const waiting = useRef(false);
  const synth = window.speechSynthesis;
  const flat = useMemo(() => lesson.conversations.flatMap((dialogue, group) =>
    dialogue.lines.map(line => ({ ...line, group })),
  ), [lesson]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [mode, setMode] = useState<Mode>('idle');
  const [message, setMessage] = useState('');
  const [position, setPosition] = useState(lesson.position < flat.length ? lesson.position : 0);
  const [cast, setCast] = useState<ReturnType<typeof assignVoices>>([]);
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef(position);
  const state = useRef<Mode>('idle');
  const previous = useRef<string[]>([]);
  const completion = useRef(options.onComplete);
  completion.current = options.onComplete;
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!options.autoPlay || autoStarted.current || !voices.length || !flat.length) return;
    autoStarted.current = true;
    start(0);
  }, [options.autoPlay, voices, flat]);

  useEffect(() => {
    let lastReport: string | undefined;
    function refresh() {
      const found = new Map<string, SpeechSynthesisVoice>();
      for (const voice of synth?.getVoices() ?? []) {
        if (!isEligibleVoice(voice) || found.has(voiceKey(voice))) continue;
        found.set(voiceKey(voice), voice);
      }
      const eligible = [...found.values()];
      const report = eligible.map(({ name, lang }) => ({ name, lang }));
      const signature = JSON.stringify(report);
      if (signature !== lastReport) {
        console.info(`[영어 대화 연습] 재생 가능 음성 ${report.length}개`);
        if (report.length) console.table(report);
        lastReport = signature;
      }
      setVoices(eligible);
    }
    function cancel() {
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
      active.current = null;
      synth?.cancel();
      if (synth?.paused) synth.resume();
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

  useEffect(() => {
    if (mode !== 'playing') return;
    document.getElementById(`line-${position}`)?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [mode, position]);

  function changeMode(next: Mode) {
    state.current = next;
    setMode(next);
  }

  function move(next: number) {
    current.current = next;
    setPosition(next);
    save(next);
  }

  function stop(label = '재생을 정지했습니다.') {
    changeMode('idle');
    cancelSpeech();
    move(0);
    setMessage(label);
  }

  function cancelSpeech() {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
    active.current = null;
    synth?.cancel();
    if (synth?.paused) synth.resume();
  }

  function speak(index: number, assignments: typeof cast) {
    const line = flat[index];
    if (!line) {
      stop('재생이 끝났습니다.');
      return;
    }
    const config = settings.current;
    if (config?.role && line.speaker === config.role && !waiting.current) {
      move(index); waiting.current = true; changeMode('paused'); setMessage('내 차례입니다. 말한 뒤 다음 문장을 누르세요.'); return;
    }
    waiting.current = false;
    const voice = assignments[line.group].get(line.speaker);
    if (!voice) return;
    move(index);
    setMessage('');
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = settings.current?.rate ?? 0.95;
    active.current = utterance;
    utterance.onend = () => {
      if (active.current !== utterance) return;
      active.current = null;
      const config = settings.current;
      repeats.current++;
      let next = index + 1;
      if (repeats.current < (config?.repeat ?? 1)) next = index;
      else {
        repeats.current = 0;
      }
      if (next >= flat.length) {
        stop('재생이 끝났습니다.');
        completion.current?.();
      }
      else if (state.current === 'playing') speak(next, assignments);
      else move(next);
    };
    utterance.onerror = (event) => {
      if (active.current !== utterance) return;
      active.current = null;
      changeMode('idle');
      console.warn('[영어 대화 연습] 음성 재생 오류:', event.error);
      setMessage('음성 재생 중 오류가 발생했습니다.');
    };
    // Let cancellation settle and coalesce rapid clicks before calling the engine.
    pending.current = setTimeout(() => {
      pending.current = null;
      if (active.current !== utterance || state.current !== 'playing') return;
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    }, 120);
  }

  function start(index: number) {
    if (!voices.length || !flat[index]) return;
    cancelSpeech();
    repeats.current = 0; waiting.current = false;
    const assignments = assignVoices(lesson, voices, previous.current);
    previous.current = assignments.map(group => {
      const first = group.values().next().value;
      return first ? voiceKey(first) : '';
    });
    setCast(assignments);
    changeMode('playing');
    speak(index, assignments);
  }

  function toggle() {
    if (state.current === 'playing') {
      changeMode('paused');
      // Native pause/resume can leave the speech engine stuck after rapid toggles.
      // Keep the sentence position and restart it when playback resumes.
      cancelSpeech();
    } else if (state.current === 'paused') {
      if (waiting.current) { nextLine(); return; }
      changeMode('playing');
      speak(current.current, cast);
    } else start(current.current);
  }

  function nextLine() {
    cancelSpeech(); waiting.current = false; repeats.current = 0;
    const next = current.current + 1;
    if (next >= flat.length) { stop('재생이 끝났습니다.'); completion.current?.(); return; }
    if (!cast.length) { start(next); return; }
    changeMode('playing'); speak(next, cast);
  }
  const voiceStatus = !synth ? '이 브라우저는 음성 재생을 지원하지 않습니다.'
    : !voices.length ? '사용 가능한 미국·캐나다·영국·호주·인도 영어 음성이 없습니다.'
    : lesson.conversations.some(group => new Set(group.lines.map(line => line.speaker)).size > voices.length)
      ? '일부 화자가 같은 목소리를 사용합니다.' : '';

  return {
    cast, mode, position, toggle, stop, nextLine,
    canPlay: !!voices.length && !!flat.length,
    playLine: (index: number) => {
      if (state.current !== 'idle' && current.current === index) toggle();
      else start(index);
    },
    status: mode === 'playing' ? `읽는 중 · ${position + 1} / ${flat.length}`
      : mode === 'paused' ? (waiting.current ? '내 차례입니다. 말한 뒤 다음 문장을 누르세요.' : '일시정지됨') : message || voiceStatus,
  };
}
