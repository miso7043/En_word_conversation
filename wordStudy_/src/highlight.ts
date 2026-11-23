type Token = { word: string; start: number; end: number };
export type HighlightPart = { text: string; highlighted: boolean };

// 외부 사전/API 없이 사용하는 불규칙 변화 목록. 규칙 변화와 분리해 확장한다.
const irregular = [
  'be am is are was were been being', 'have has had having', 'do does did done doing',
  'go goes went gone going', 'come comes came coming', 'get gets got gotten getting',
  'take takes took taken taking', 'give gives gave given giving', 'make makes made making',
  'say says said saying', 'see sees saw seen seeing', 'know knows knew known knowing',
  'think thinks thought thinking', 'find finds found finding', 'leave leaves left leaving',
  'feel feels felt feeling', 'keep keeps kept keeping', 'hold holds held holding',
  'bring brings brought bringing', 'buy buys bought buying', 'catch catches caught catching',
  'teach teaches taught teaching', 'tell tells told telling', 'sell sells sold selling',
  'send sends sent sending', 'spend spends spent spending', 'build builds built building',
  'lose loses lost losing', 'meet meets met meeting', 'pay pays paid paying',
  'run runs ran running', 'sit sits sat sitting', 'stand stands stood standing',
  'begin begins began begun beginning', 'drink drinks drank drunk drinking',
  'sing sings sang sung singing', 'sink sinks sank sunk sinking',
  'speak speaks spoke spoken speaking', 'break breaks broke broken breaking',
  'choose chooses chose chosen choosing', 'write writes wrote written writing',
  'drive drives drove driven driving', 'eat eats ate eaten eating',
  'fall falls fell fallen falling', 'rise rises rose risen rising',
  'grow grows grew grown growing', 'throw throws threw thrown throwing',
  'draw draws drew drawn drawing', 'wear wears wore worn wearing',
  'cut cuts cutting', 'put puts putting', 'set sets setting', 'hit hits hitting',
  'read reads reading', 'let lets letting', 'hurt hurts hurting',
  'child children', 'person people', 'man men', 'woman women',
  'tooth teeth', 'foot feet foots footed footing', 'mouse mice', 'good better best', 'bad worse worst',
].map(group => group.split(' '));
const possessives = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their', "one's"]);
// PP는 임의의 단어가 아니라 과거분사만 허용한다. 규칙형은 -ed로 판단한다.
const participles = new Set(('been had done gone come got gotten taken given made said seen known thought found left felt kept held brought bought caught taught told sold sent spent built lost met paid run sat stood begun drunk sung sunk spoken broken chosen written driven eaten fallen risen grown thrown drawn worn cut put set hit read let hurt become cost shut won understood meant heard led slept frozen forgotten forgiven hidden ridden shaken stolen swum torn woken blown flown shown lain lit fed fought sought bound laid hung stuck struck swept wept dealt dug sworn').split(' '));
// 기능어는 그대로 비교해 다른 구문까지 일치하는 것을 막는다.
const fixed = new Set('a an the in on at to into of for from with by as and or but if than then it this that these those i you he she we they me him us them can could will would shall should may might must not out up down off over under after before through about'.split(' '));

// 문법 자리표시자는 문맥 분석기가 아닌, 범위가 제한된 문형 규칙으로 처리한다.
const slotAliases: Array<[string, string]> = [
  ['past participle|과거분사|pp', 'slotpp'],
  ['present participle|현재분사', 'sloting'],
  ['noun phrase|명사구|np|noun|명사', 'slotnoun'],
  ['subject|주어', 'slotsubject'], ['object|목적어', 'slotobject'],
  ['complement|보어', 'slotcomplement'], ['pronoun|대명사', 'slotpronoun'],
  ['adjective|adj|형용사', 'slotadjective'], ['adverb|adv|부사', 'slotadverb'],
  ['preposition|prep|전치사', 'slotpreposition'], ['conjunction|conj|접속사', 'slotconjunction'],
  ['interjection|interj|감탄사', 'slotinterjection'], ['determiner|det|한정사|관사', 'slotdeterminer'],
  ['gerund|동명사', 'sloting'], ['infinitive|부정사', 'slotinfinitive'],
  ['verb|동사', 'slotverb'],
];
const pronouns = new Set('i you he she it we they me him her us them this that these those someone somebody everyone everybody anyone anybody nobody'.split(' '));
const adverbs = new Set('still already just really probably possibly certainly definitely always never often sometimes usually also even only very quite too well here there now then'.split(' '));
const prepositions = new Set('in on at to into of for from with by as over under after before through about without between among'.split(' '));
const conjunctions = new Set('and or but so because although if when while since unless'.split(' '));
const determiners = new Set('a an the this that these those my your his her its our their some any each every no'.split(' '));
const nounStops = new Set([...conjunctions, ...[...prepositions].filter(word => word !== 'of'), 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'must']);
// 숙어의 핵심 단어 앞에 들어가는 관사·정도 표현·흔한 수식어만 허용한다.
const modifiers = new Set([...determiners, 'total', 'real', 'huge', 'tough', 'extra', 'additional',
  'great', 'enormous', 'immense', 'intense', 'severe', 'serious', 'strong', 'heavy', 'constant',
  'considerable', 'significant', 'tremendous', 'unexpected', 'sudden', 'major', 'minor',
  'big', 'small', 'little', 'much', 'more', 'less', 'many', 'very', 'really', 'extremely', 'so', 'too']);
const modifierPhrases = ['a lot of', 'lots of', 'a great deal of', 'a good deal of',
  'a bit of', 'a little bit of', 'plenty of', 'a large amount of', 'a great amount of']
  .map(phrase => phrase.split(' '));

function insertionEnds(text: string, source: Token[], position: number): number[] {
  const ends = new Set<number>();
  const limit = Math.min(position + 6, source.length);
  function visit(cursor: number) {
    for (const unit of [[source[cursor]?.word], ...modifierPhrases]) {
      const end = cursor + unit.length;
      if (end > limit || unit[0] === undefined) continue;
      if (unit.length === 1 && !modifiers.has(unit[0])) continue;
      if (!unit.every((word, i) => {
        const token = source[cursor + i], previous = source[cursor + i - 1];
        return token.word === word && previous !== undefined && connected(text, previous, token)
          && !/[,;:]/.test(text.slice(previous.end, token.start));
      })) continue;
      if (ends.has(end)) continue;
      ends.add(end);
      if (end < limit) visit(end);
    }
  }
  visit(position);
  return [...ends].sort((a, b) => a - b);
}

function tokens(text: string, expandContractions = false): Token[] {
  const result = [...text.matchAll(/[a-z]+(?:['’][a-z]+)*/gi)].map(match => ({
    word: match[0].toLowerCase().replaceAll('’', "'"), start: match.index!, end: match.index! + match[0].length,
  }));
  return expandContractions ? result.flatMap(token => {
    const modal = /^(could|would|should|might|must)('ve|n't)$/.exec(token.word);
    if (modal) return [{ ...token, word: modal[1] }, { ...token, word: modal[2] === "'ve" ? 'have' : 'not' }];
    const be = /^(i'm|you're|he's|she's|it's|we're|they're|that's|there's)$/.exec(token.word);
    if (be) return [{ ...token, word: token.word.split("'")[0] },
      { ...token, word: token.word === "i'm" ? 'am' : token.word.endsWith("'re") ? 'are' : 'is' }];
    return [token];
  }) : result;
}

function patternTargets(phrase: string): Token[][] {
  const patterns: Token[][] = [];
  for (let alternative of phrase.split(/[/／]/)) {
    alternative = alternative.replace(/\bp\s*\.\s*p\s*\.?/gi, 'PP')
      .replace(/[~～〜]+/g, ' slotgap ');
    for (const [aliases, marker] of slotAliases) {
      alternative = alternative.replace(new RegExp(`(?<![a-z가-힣])(?:${aliases})(?![a-z가-힣])`, 'gi'), marker);
    }
    // S/V/N/O/C 약어는 대문자 또는 점이 있는 문법 표기만 인정한다.
    alternative = alternative.replace(/\b([SVNOC])\b|\b([svnoc])\.(?=\s|$)/g, (_, upper: string, dotted: string) =>
      ({ s: 'slotsubject', v: 'slotverb', n: 'slotnoun', o: 'slotobject', c: 'slotcomplement' })[(upper ?? dotted).toLowerCase() as 's'] ?? '');
    const target = tokens(alternative, true);
    while (target[0]?.word === 'slotgap') target.shift();
    while (target.at(-1)?.word === 'slotgap') target.pop();
    // 자리표시자만 있는 제목은 모든 문장을 강조하지 않는다.
    if (!target.some(token => !token.word.startsWith('slot'))) continue;
    // as they explain은 같은 문형의 as he explains 등에도 대응한다.
    for (let i = 0; i + 2 < target.length; i++) {
      if (target[i].word === 'as' && target[i + 1].word === 'they' && target[i + 2].word === 'explain') {
        target[i + 1] = { ...target[i + 1], word: 'slotpronoun' };
      }
    }
    patterns.push(target);
    if (target[0]?.word === 'be') {
      patterns.push([target[0], { word: 'slotsubject', start: 0, end: 0 }, ...target.slice(1)]);
    }
    if (target.map(token => token.word).join(' ') === 'it comes after') patterns.push(target.slice(1));
    if (target.length === 3 && /^(could|would|should|might|must)$/.test(target[0].word)
      && target[1].word === 'have' && target[2].word === 'slotpp') {
      patterns.push(...'not i you he she it we they'.split(' ').map(word =>
        [target[0], { word, start: 0, end: 0 }, ...target.slice(1)]));
    }
  }
  return patterns;
}

function connected(text: string, previous: Token, actual: Token): boolean {
  return previous.start === actual.start && previous.end === actual.end
    || /^[\s,\-–—]+$/.test(text.slice(previous.end, actual.start));
}

function slotAccepts(slot: string, words: string[]): boolean {
  const word = words[0];
  if (slot === 'slotgap') return true;
  if (slot === 'slotpp') return words.length === 1 && (participles.has(word) || /^[a-z]{2,}ed$/.test(word));
  if (slot === 'sloting') return words.length === 1 && /^[a-z]+ing$/.test(word);
  if (slot === 'slotpronoun') return words.length === 1 && pronouns.has(word);
  if (slot === 'slotpreposition') return words.length === 1 && prepositions.has(word);
  if (slot === 'slotconjunction') return words.length === 1 && conjunctions.has(word);
  if (slot === 'slotdeterminer') return words.length === 1 && determiners.has(word);
  if (slot === 'slotinterjection') return words.length === 1 && /^(oh|ah|wow|hey|oops|ouch|alas|hooray)$/.test(word);
  if (slot === 'slotadverb') return words.length === 1 && (adverbs.has(word) || word.endsWith('ly'));
  if (slot === 'slotinfinitive') return words.length >= 2 && word === 'to';
  if (slot === 'slotnoun') return words.some(w => !determiners.has(w)) && !words.some(w => nounStops.has(w));
  if (slot === 'slotsubject') return !words.some(w => nounStops.has(w));
  if (slot === 'slotobject' || slot === 'slotcomplement') return !words.some(w => conjunctions.has(w));
  if (slot === 'slotadjective') return words.length === 1 && !fixed.has(word) && !determiners.has(word);
  return slot === 'slotverb' && !conjunctions.has(word) && !determiners.has(word);
}

function forms(word: string): Set<string> {
  const group = irregular.find(group => group.includes(word));
  if (group) return new Set(group);
  if (fixed.has(word) || word.includes("'")) return new Set([word]);
  const result = new Set([word]);
  if (/[^aeiou]y$/.test(word)) {
    const stem = word.slice(0, -1);
    result.add(stem + 'ies'); result.add(stem + 'ied');
  } else {
    result.add(word + (/(s|sh|ch|x|z|o)$/.test(word) ? 'es' : 's'));
    result.add(word + (word.endsWith('e') ? 'd' : 'ed'));
  }
  result.add(word.endsWith('ie') ? word.slice(0, -2) + 'ying'
    : /[^e]e$/.test(word) ? word.slice(0, -1) + 'ing' : word + 'ing');
  // 짧은 단어의 끝 자음 중복과 자주 쓰는 복수 음절 강세 단어.
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(word) || ['admit', 'commit', 'permit', 'prefer', 'refer', 'occur', 'regret', 'control'].includes(word)) {
    result.add(word + word.at(-1) + 'ed'); result.add(word + word.at(-1) + 'ing');
  }
  return result;
}

export function highlightParts(text: string, phrases: string[]): HighlightPart[] {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const phrase of phrases) {
    for (const target of patternTargets(phrase)) {
      const allowModifiers = target.length > 1 && !target.some(token => token.word.startsWith('slot'));
      const strictHave = target.some(token => token.word === 'slotpp')
        && target.some(token => /^(could|would|should|might|must)$/.test(token.word));
      const source = tokens(text, true);
      const variants = target.map(token => forms(token.word));
      for (let start = 0; start < source.length; start++) {
        let budget = 3000;
        function match(part: number, position: number): number | undefined {
          if (--budget <= 0 || position - start > 64) return undefined;
          if (part === target.length) return position;
          if (position >= source.length) return undefined;
          if (position > start && !connected(text, source[position - 1], source[position])) return undefined;
          const word = target[part].word;
          if (word.startsWith('slot')) {
            const max = word === 'slotgap' ? 24 : 8;
            const available = Math.min(max, source.length - position);
            // 끝의 명사구는 구두점·접속사 등에서 멈추고, 중간 자리는 뒤의 고정 표현을 찾는다.
            const lengths = Array.from({ length: available + 1 }, (_, i) => i)
              .filter(n => n > 0 || word === 'slotgap');
            if (part === target.length - 1) lengths.reverse();
            for (const count of lengths) {
              const slice = source.slice(position, position + count);
              if (slice.some((token, i) => i > 0 && (!connected(text, slice[i - 1], token)
                || /[,;:]/.test(text.slice(slice[i - 1].end, token.start))))) continue;
              if (!slotAccepts(word, slice.map(token => token.word))) continue;
              const end = match(part + 1, position + count);
              if (end !== undefined) return end;
            }
            return undefined;
          }
          const actual = source[position].word;
          const matches = word === "one's" ? possessives.has(actual) || /'s$/.test(actual)
            : word === 'oneself' ? /^(myself|yourself|yourselves|himself|herself|itself|ourselves|themselves|oneself)$/.test(actual)
            : strictHave && word === 'have' ? word === actual : variants[part].has(actual);
          if (!matches) return undefined;
          // is still up for처럼 be 바로 뒤의 짧은 부사 삽입을 허용한다.
          if (word === 'be') {
            for (let next = position + 1; next <= Math.min(position + 3, source.length); next++) {
              if (next > position + 1 && (!adverbs.has(source[next - 1].word)
                || !connected(text, source[next - 2], source[next - 1]))) break;
              const end = match(part + 1, next);
              if (end !== undefined) return end;
            }
            return undefined;
          }
          const end = match(part + 1, position + 1);
          if (end !== undefined) return end;
          // 핵심 단어의 순서를 보존하고, 다음 내용어 앞의 제한된 수식어만 건너뛴다.
          const nextWord = target[part + 1]?.word;
          if (allowModifiers && nextWord && !fixed.has(nextWord) && !nextWord.includes("'")) {
            for (const next of insertionEnds(text, source, position + 1)) {
              if (source[next] && /[,;:]/.test(text.slice(source[next - 1].end, source[next].start))) continue;
              const modifiedEnd = match(part + 1, next);
              if (modifiedEnd !== undefined) return modifiedEnd;
            }
          }
          return undefined;
        }
        const end = match(0, start);
        if (end !== undefined && end > start) ranges.push({ start: source[start].start, end: source[end - 1].end });
      }
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const parts: HighlightPart[] = [];
  let position = 0;
  for (const range of merged) {
    if (position < range.start) parts.push({ text: text.slice(position, range.start), highlighted: false });
    parts.push({ text: text.slice(range.start, range.end), highlighted: true });
    position = range.end;
  }
  if (position < text.length) parts.push({ text: text.slice(position), highlighted: false });
  return parts;
}
