import assert from 'node:assert/strict';
import { highlightParts } from '../src/highlight.ts';

function highlighted(text, phrase) {
  const parts = highlightParts(text, Array.isArray(phrase) ? phrase : [phrase]);
  assert.equal(parts.map(part => part.text).join(''), text, '문장 원문 보존');
  return parts.filter(part => part.highlighted).map(part => part.text);
}
for (const [text, phrase, expected] of [
  ['She worked and is working.', 'work', ['worked', 'working']],
  ['He studies, studied and is studying.', 'study', ['studies', 'studied', 'studying']],
  ['She is making and has made it.', 'make', ['making', 'made']],
  ['He went and has gone.', 'go', ['went', 'gone']],
  ['They stopped running.', 'stop', ['stopped']],
  ['She prioritized it.', 'prioritize', ['prioritized']],
  ['He tallied the votes.', 'tally', ['tallied']],
  ['They constituted a blockade.', 'constitute', ['constituted']],
  ['I footed the bill.', 'foot the bill', ['footed the bill']],
  ['She sank her teeth into it.', "sink one's teeth into", ['sank her teeth into']],
  ['He has sunk John’s teeth into it.', 'sink one’s teeth into', ['sunk John’s teeth into']],
  ['He dishes it out, but can’t take it.', "Dish it out but can't take it", ['dishes it out, but can’t take it']],
  ['It comes after the news.', 'It comes after ~', ['It comes after']],
  ['He looked after himself.', 'look after oneself', ['looked after himself']],
  ['IN FAVOR OF it.', 'in favor of', ['IN FAVOR OF']],
  ['A surge, surges and surged.', 'surge', ['surge', 'surges', 'surged']],
  ['A mounting concern.', 'mount', ['mounting']],
  ['A stark setback.', ['stark', 'stark setback'], ['stark setback']],
  ['The candy is candid.', 'candid', ['candid']],
  ['The target is inside retargeting.', 'target', ['target']],
  ['Take. It away.', 'take it', []],
  ['Sink unrelated words my teeth into it.', "sink one's teeth into", []],
  ['Nothing matched.', '', []],
]) assert.deepEqual(highlighted(text, phrase), expected, `${phrase}: ${text}`);
console.log('PASS: 오프라인 강조 — 규칙·불규칙 변화, 숙어 소유격·재귀대명사, 단어 경계, 원문 보존');
