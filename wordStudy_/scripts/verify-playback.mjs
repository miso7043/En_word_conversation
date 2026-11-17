import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Run the real hook with a deterministic speech engine and React hook harness.
const slots = [];
let cursor = 0;
let effects = [];
const timers = new Map();
let timerId = 0;
let now = 0;
const spoken = [];
const voice = { name: 'English', lang: 'en-US', voiceURI: 'english' };
const synth = {
  paused: false,
  getVoices: () => [voice],
  addEventListener() {}, removeEventListener() {},
  cancel() {
    for (const utterance of spoken) {
      // Browsers can deliver cancellation events after another utterance starts.
      effects.push(() => utterance.onerror?.({ error: 'interrupted' }));
    }
  },
  pause() { throw new Error('Native pause must not be used'); },
  resume() { this.paused = false; },
  speak(utterance) { spoken.push(utterance); utterance.onstart?.(); },
};
const context = vm.createContext({
  console: { info() {}, table() {}, warn() {} },
  window: { speechSynthesis: synth, addEventListener() {}, removeEventListener() {} },
  document: { getElementById: () => null },
  matchMedia: () => ({ matches: true }),
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  performance: { now: () => now },
  setTimeout(fn, delay = 0) { timers.set(++timerId, { fn, at: now + delay }); return timerId; },
  clearTimeout(id) { timers.delete(id); },
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = value; }];
  },
  useMemo(fn) { cursor++; return fn(); },
  useEffect(fn, deps) {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) effects.push(fn);
    slots[index] = deps;
  },
});
const source = readFileSync(new URL('../src/usePlayback.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function usePlayback', 'function usePlayback');
vm.runInContext(stripTypeScriptTypes(source) + '\nglobalThis.hook = usePlayback;', context);
const lesson = { position: 0, conversations: [{ lines: [
  { speaker: 'A', text: 'First sentence.' }, { speaker: 'B', text: 'Second sentence.' },
] }] };
let player;
let options = {};
function render() {
  cursor = 0;
  player = context.hook(lesson, () => {}, options);
  const queued = effects;
  effects = [];
  queued.forEach(fn => fn());
}
function advance(ms) {
  const target = now + ms;
  while (true) {
    const due = [...timers.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    timers.delete(due[0]); now = due[1].at; due[1].fn(); render();
  }
  now = target; render();
}
function flush() { advance(120); }
render(); render();
player.toggle(); render(); flush();
assert.equal(spoken.length, 1);
const stale = spoken[0];
player.toggle(); render();
assert.equal(player.mode, 'paused');
for (let i = 0; i < 30; i++) { player.playLine(0); render(); }
assert.equal(player.mode, 'paused');
assert.equal(timers.size, 0);
player.playLine(1); render();
player.playLine(0); render();
player.playLine(1); render();
assert.equal(timers.size, 1);
flush();
assert.equal(spoken.length, 2);
assert.equal(spoken.at(-1).text, 'Second sentence.');
stale.onend(); stale.onerror({ error: 'canceled' }); render();
assert.equal(player.mode, 'playing');
assert.equal(player.position, 1);
player.toggle(); render();
player.toggle(); render();
player.stop(); render(); flush();
assert.equal(player.mode, 'idle');
assert.equal(spoken.length, 2);
player.playLine(0); render(); flush();
spoken.at(-1).onend(); render(); flush();
assert.equal(spoken.at(-1).text, 'Second sentence.');
spoken.at(-1).onend(); render();
assert.equal(player.mode, 'idle');
assert.equal(player.status, '재생이 끝났습니다.');
console.log('PASS: rapid pause/A/B clicks, stale events, pending stop, sequential playback');

slots.length = 0;
let completed = 0;
options = { autoPlay: true, onComplete: () => { completed++; } };
render(); render(); render(); flush();
assert.equal(player.mode, 'playing');
assert.equal(spoken.at(-1).text, 'First sentence.');
// A checkbox change must update completion behavior even during an utterance.
options = { autoPlay: true, onComplete: () => { completed += 10; } };
render();
spoken.at(-1).onend(); render(); flush();
spoken.at(-1).onend(); render();
assert.equal(completed, 10);
assert.equal(player.mode, 'idle');
flush();
assert.equal(player.mode, 'idle');
console.log('PASS: automatic start, latest completion callback, no automatic restart');

// 학습 모드도 실제 재생 hook을 통해 검증한다.
slots.length = 0; spoken.length = 0; timers.clear();
options = { settings: {rate:.7,repeat:2,role:''} };
render(); render(); player.toggle(); render(); flush();
assert.equal(spoken.at(-1).rate,.7);assert.equal(spoken.at(-1).pitch,undefined);
spoken.at(-1).onend();render();flush();assert.equal(spoken.at(-1).text,'First sentence.');
spoken.at(-1).onend();render();flush();assert.equal(spoken.at(-1).text,'Second sentence.');
player.stop();render();
slots.length=0;spoken.length=0;timers.clear();
options={settings:{rate:1,repeat:1,role:'A'}};
render();render();player.toggle();render();flush();assert.equal(player.mode,'playing');assert.equal(spoken.at(-1).volume,0);assert.equal(player.turnProgress.phase,'speech');
advance(2000);const silent=spoken.at(-1);silent.onend({elapsedTime:2});render();assert.equal(player.turnProgress.phase,'extra');assert.equal(player.turnProgress.speechMs,2000);
advance(1000);player.toggle();render();const remaining=player.turnProgress.remainingMs;assert.equal(player.mode,'paused');advance(5000);assert.equal(player.turnProgress.remainingMs,remaining);assert.equal(spoken.length,1);
player.toggle();render();advance(remaining-1);assert.equal(spoken.length,1);advance(1);assert.equal(player.position,1);flush();assert.equal(spoken.at(-1).text,'Second sentence.');assert.equal(spoken.at(-1).volume,1);assert.equal(player.turnProgress,null);
player.stop();render();
// 정지/다음 문장 후 늦게 도착한 음성 종료나 타이머가 다음 재생을 바꾸지 않는다.
player.playLine(0);render();flush();const canceled=spoken.at(-1);advance(1000);canceled.onend();render();advance(500);player.stop();render();advance(10000);assert.equal(player.mode,'idle');assert.equal(player.turnProgress,null);const afterStop=spoken.length;canceled.onend({elapsedTime:1});render();advance(5000);assert.equal(spoken.length,afterStop);
player.playLine(0);render();flush();spoken.at(-1).onend({elapsedTime:1});render();player.nextLine();render();flush();assert.equal(spoken.at(-1).text,'Second sentence.');const afterNext=spoken.length;advance(4000);assert.equal(spoken.length,afterNext);player.stop();render();
slots.length=0;spoken.length=0;timers.clear();
// 이전 저장 설정에 구간과 피치가 남아 있어도 다시 적용하지 않는다.
options={settings:{rate:.7,pitch:1.4,repeat:1,role:'',a:0,b:0}};
render();render();player.toggle();render();flush();
options={settings:{rate:1.3,repeat:1,role:''}};render();
spoken.at(-1).onend();render();flush();assert.equal(spoken.at(-1).text,'Second sentence.');assert.equal(spoken.at(-1).rate,1.3);assert.equal(spoken.at(-1).pitch,undefined);
spoken.at(-1).onend();render();flush();assert.equal(player.mode,'idle');
console.log('PASS: 속도와 다음 문장 적용·문장 반복·음소거 역할+3초 자동 진행·추가 시간 일시정지·정지/다음 취소·이전 구간/피치 설정 무시·종료');

// 내 역할이 마지막 문장인 경우에도 추가 3초 이후 한 번만 완료된다.
slots.length=0;spoken.length=0;timers.clear();completed=0;
options={settings:{rate:1,repeat:1,role:'B'},onComplete:()=>completed++};
render();render();player.playLine(1);render();flush();const lastRole=spoken.at(-1);assert.equal(lastRole.volume,0);
player.toggle();render();assert.equal(player.mode,'paused');assert.equal(player.turnProgress,null);
player.toggle();render();flush();assert.equal(spoken.at(-1).volume,0);assert.equal(spoken.at(-1).text,'Second sentence.');lastRole.onend({elapsedTime:1});render();assert.equal(player.turnProgress.phase,'speech');
spoken.at(-1).onend({elapsedTime:1});render();advance(2999);assert.equal(completed,0);advance(1);assert.equal(completed,1);assert.equal(player.mode,'idle');advance(5000);assert.equal(completed,1);
player.playLine(1);render();flush();spoken.at(-1).onerror({error:'synthesis-failed'});render();assert.equal(player.mode,'idle');assert.equal(player.turnProgress,null);advance(5000);assert.equal(completed,1);
console.log('PASS: 내 역할 음소거 재시작·마지막 문장 자동 완료·음성 오류 취소');
