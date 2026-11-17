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
  speak(utterance) { spoken.push(utterance); },
};
const context = vm.createContext({
  console: { info() {}, table() {}, warn() {} },
  window: { speechSynthesis: synth, addEventListener() {}, removeEventListener() {} },
  document: { getElementById: () => null },
  matchMedia: () => ({ matches: true }),
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
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
function flush() {
  const queued = [...timers.values()];
  timers.clear();
  queued.forEach(fn => fn());
  render();
}
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
render();render();player.toggle();render();flush();assert.equal(player.mode,'paused');assert.equal(spoken.length,0);
player.nextLine();render();flush();assert.equal(spoken.at(-1).text,'Second sentence.');
player.stop();render();
slots.length=0;spoken.length=0;timers.clear();
// 이전 저장 설정에 구간과 피치가 남아 있어도 다시 적용하지 않는다.
options={settings:{rate:.7,pitch:1.4,repeat:1,role:'',a:0,b:0}};
render();render();player.toggle();render();flush();
options={settings:{rate:1.3,repeat:1,role:''}};render();
spoken.at(-1).onend();render();flush();assert.equal(spoken.at(-1).text,'Second sentence.');assert.equal(spoken.at(-1).rate,1.3);assert.equal(spoken.at(-1).pitch,undefined);
spoken.at(-1).onend();render();flush();assert.equal(player.mode,'idle');
console.log('PASS: 속도와 다음 문장 적용·문장 반복·롤플레이·이전 구간/피치 설정 무시·종료');
