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
const alerts = [];
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
  window: { alert(message) { alerts.push(message); }, speechSynthesis: synth, addEventListener() {}, removeEventListener() {} },
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
const beforeAuto = spoken.length;
let scrollTop = 500;
context.document.getElementById = () => ({
  scrollIntoView() {}, getBoundingClientRect: () => ({ top: scrollTop }),
});
render(); render(); render();
advance(250); scrollTop = 200; advance(250); scrollTop = 0; advance(50);
advance(299); assert.equal(spoken.length, beforeAuto);
advance(121);
context.document.getElementById = () => null;
assert.equal(player.mode, 'playing');
assert.equal(spoken.at(-1).text, 'First sentence.');
// A checkbox change must update completion behavior even during an utterance.
options = { autoPlay: true, onComplete: () => { completed += 10; } };
render();
spoken.at(-1).onend(); render(); flush();
spoken.at(-1).onend(); render();
advance(299); assert.equal(completed, 0); advance(1);
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
spoken.at(-1).onend({elapsedTime:1});render();advance(2999);assert.equal(completed,0);advance(1);assert.equal(completed,0);advance(300);assert.equal(completed,1);assert.equal(player.mode,'idle');advance(5000);assert.equal(completed,1);
player.playLine(1);render();flush();spoken.at(-1).onerror({error:'synthesis-failed'});render();assert.equal(player.mode,'idle');assert.equal(player.turnProgress,null);advance(5000);assert.equal(completed,1);
console.log('PASS: 내 역할 음소거 재시작·마지막 문장 자동 완료·음성 오류 취소');

// 처음부터 실제로 모든 문장을 마친 경우에만 학습 횟수 이벤트를 보낸다.
slots.length=0;spoken.length=0;timers.clear();let studied=0;
options={onStudied:()=>studied++,settings:{rate:1,repeat:1,role:''}};
render();render();player.playLine(1);render();flush();spoken.at(-1).onend();render();assert.equal(studied,0);
player.playLine(0);render();flush();player.nextLine();render();flush();spoken.at(-1).onend();render();assert.equal(studied,0);
player.playLine(0);render();flush();spoken.at(-1).onend();render();flush();player.toggle();render();player.toggle();render();flush();
const finalSpeech=spoken.at(-1);finalSpeech.onend();render();assert.equal(studied,1);finalSpeech.onend();render();assert.equal(studied,1);
player.playLine(0);render();flush();spoken.at(-1).onend();render();flush();player.stop();render();assert.equal(studied,1);
options={onStudied:()=>studied++,settings:{rate:1,repeat:2,role:'B'}};render();
player.playLine(0);render();flush();spoken.at(-1).onend();render();flush();spoken.at(-1).onend();render();flush();
spoken.at(-1).onend({elapsedTime:1});render();advance(3000);flush();assert.equal(studied,1);
spoken.at(-1).onend({elapsedTime:1});render();advance(3000);assert.equal(studied,2);
console.log('PASS: 전체 재생만 집계·중간 시작/건너뛰기/정지 제외·일시정지 유지·중복 종료 제외·문장 반복과 역할 연습 완료 집계');

// 화면 전환 대기 중 정지하면 다음 학습으로 이동하지 않는다.
slots.length=0;spoken.length=0;timers.clear();completed=0;
options={onComplete:()=>completed++};
render();render();player.playLine(1);render();flush();
spoken.at(-1).onend();render();advance(299);player.stop();render();advance(1000);
assert.equal(completed,0);
// 스크롤 대기 중 정지하면 예약된 자동 재생도 취소한다.
slots.length=0;spoken.length=0;timers.clear();options={autoPlay:true};
render();render();render();advance(100);player.stop();render();advance(1000);
assert.equal(spoken.length,0);
console.log('PASS: 스크롤 완료 후 대기·화면 전환 전 300ms 대기·대기 중 정지 취소');

// 설명은 한국어로 먼저 읽고, 영어 대사 완주 기록·반복 횟수와 분리한다.
lesson.description = ['이것은 단어 설명입니다.', '두 번째 설명입니다.'];
const korean = { name:'Korean', lang:'ko-KR', voiceURI:'korean' };
synth.getVoices = () => [voice, korean];
function descriptionCase(nextOptions = {}) {
  slots.length=0; spoken.length=0; timers.clear();
  options=nextOptions; render(); render();
}
let descriptionStudied=0;
descriptionCase({settings:{rate:.8,repeat:1,role:'A'},onStudied:()=>descriptionStudied++});
player.toggle();render();flush();
const intro=spoken.at(-1);
assert.equal(intro.text,lesson.description.join('\n\n'));
assert.equal(intro.lang,'ko-KR');assert.equal(intro.voice,korean);assert.equal(intro.volume,1);assert.equal(intro.rate,.8);
assert.equal(player.status,'한국어 설명을 읽는 중');assert.equal(player.position,0);assert.equal(player.turnProgress,null);
player.toggle();render();assert.equal(player.mode,'paused');
intro.onend();render();flush();assert.equal(spoken.length,1);
player.toggle();render();flush();assert.equal(spoken.at(-1).text,intro.text);
spoken.at(-1).onend();render();flush();
assert.equal(spoken.at(-1).text,'First sentence.');assert.equal(spoken.at(-1).volume,0);assert.equal(descriptionStudied,0);
spoken.at(-1).onend({elapsedTime:1});render();advance(3000);flush();
assert.equal(spoken.at(-1).text,'Second sentence.');spoken.at(-1).onend();render();assert.equal(descriptionStudied,1);
// 설명 도중 다음 문장은 첫 영어 문장으로 이동하고, 영어 완주 집계는 유지한다.
descriptionCase({onStudied:()=>descriptionStudied++});player.toggle();render();flush();const skippedIntro=spoken.at(-1);
player.nextLine();render();flush();assert.equal(spoken.at(-1).text,'First sentence.');
skippedIntro.onend();render();assert.equal(spoken.length,2);
spoken.at(-1).onend();render();flush();spoken.at(-1).onend();render();assert.equal(descriptionStudied,2);
// 정지는 설명의 늦은 이벤트를 취소하고, 화자 버튼은 지정한 영어 대사로 바로 이동한다.
descriptionCase();player.toggle();render();flush();const stoppedIntro=spoken.at(-1);player.stop();render();
stoppedIntro.onend();stoppedIntro.onerror({error:'interrupted'});render();flush();assert.equal(spoken.length,1);assert.equal(player.mode,'idle');
player.toggle();render();flush();player.playLine(0);render();flush();assert.equal(spoken.at(-1).text,'First sentence.');
// 설정 해제·빈 설명은 바로 영어로 시작한다.
descriptionCase({settings:{readDescription:false}});player.toggle();render();flush();assert.equal(spoken[0].text,'First sentence.');
lesson.description=[];descriptionCase();player.toggle();render();flush();assert.equal(spoken[0].text,'First sentence.');
// 한국어 음성 목록이 없으면 ko-KR 언어를 요청하고, 엔진 오류 시 영어로 이어간다.
lesson.description=['한국어 설명'];synth.getVoices=()=>[voice];descriptionCase();player.toggle();render();flush();
assert.equal(spoken[0].lang,'ko-KR');assert.equal(spoken[0].voice,undefined);
spoken[0].onerror({error:'language-unavailable'});render();flush();assert.equal(spoken.at(-1).text,'First sentence.');
// 연속·자동 재생도 자료마다 설명을 먼저 읽는다.
synth.getVoices=()=>[voice,korean];descriptionCase({autoPlay:true});render();advance(500);
assert.equal(spoken[0].lang,'ko-KR');assert.equal(spoken[0].text,'한국어 설명');
console.log('PASS: 한국어 설명 기본 재생·음성/속도·역할 제외·일시정지/재시작·정지/늦은 이벤트·설명 건너뛰기·완주 집계·설정 해제·빈 설명·한국어 오류 대체·자동 재생');

// 저장 진도가 중간에 있어도 자동 연속 재생의 설명 건너뛰기는 첫 대사로 이동한다.
lesson.position=1;descriptionCase({autoPlay:true});render();advance(500);
assert.equal(spoken[0].lang,'ko-KR');player.nextLine();render();flush();
assert.equal(spoken.at(-1).text,'First sentence.');lesson.position=0;

// 클릭 시 음성이 없으면 알림만 표시하고 재생·예약·완주를 시작하지 않는다.
lesson.description=[];synth.getVoices=()=>[];descriptionCase();
player.toggle();render();flush();
assert.equal(alerts.at(-1),'재생할 목소리가 없습니다.');assert.equal(player.mode,'idle');
assert.equal(spoken.length,0);assert.equal(timers.size,0);
// voiceschanged 없이 늦게 준비된 음성도 클릭 시 다시 읽어 사용할 수 있다.
synth.getVoices=()=>[voice];player.toggle();render();flush();assert.equal(spoken.at(-1).text,'First sentence.');
player.toggle();render();synth.getVoices=()=>[];const beforeResume=spoken.length;
player.toggle();render();flush();assert.equal(player.mode,'paused');assert.equal(spoken.length,beforeResume);
assert.equal(alerts.at(-1),'재생할 목소리가 없습니다.');
console.log('PASS: 음성 0개 알림·재생/이어 듣기 차단·늦게 준비된 음성 클릭 재확인');
