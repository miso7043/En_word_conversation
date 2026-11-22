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

function tokens(text: string, expandContractions = false): Token[] {
  const result = [...text.matchAll(/[a-z]+(?:['’][a-z]+)*/gi)].map(match => ({
    word: match[0].toLowerCase().replaceAll('’', "'"), start: match.index!, end: match.index! + match[0].length,
  }));
  return expandContractions ? result.flatMap(token => {
    const contraction = /^(could|would|should|might|must)('ve|n't)$/.exec(token.word);
    return contraction ? [{ ...token, word: contraction[1] }, { ...token, word: contraction[2] === "'ve" ? 'have' : 'not' }] : [token];
  }) : result;
}

function patternTargets(phrase: string): Token[][] {
  const target = tokens(phrase.replace(/\bp\s*\.\s*p\s*\.?/gi, 'PP'));
  if (target.length !== 3 || !/^(could|would|should|might|must)$/.test(target[0].word)
    || target[1].word !== 'have' || target[2].word !== 'pp') return [target];
  // 기본 문형에 대응하는 부정형·대명사 주어 의문형도 같은 문형으로 표시한다.
  return [target, ...'not i you he she it we they'.split(' ').map(word =>
    [target[0], { word, start: 0, end: 0 }, ...target.slice(1)])];
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
    // 문형 표기 PP / p.p. / p. p.와 구분 기호 +를 처리한다.
    for (const target of patternTargets(phrase)) {
      if (!target.length) continue;
      const grammarPattern = target.some(token => token.word === 'pp');
      const source = tokens(text, grammarPattern);
      const variants = target.map(token => forms(token.word));
      for (let i = 0; i + target.length <= source.length; i++) {
        const matches = target.every((token, j) => {
          const actual = source[i + j];
          // 단어 사이는 공백·쉼표·하이픈만 허용해 문장 경계를 넘지 않는다.
          if (j) {
            const previous = source[i + j - 1];
            const sameContraction = previous.start === actual.start && previous.end === actual.end;
            if (!sameContraction && !/^[\s,\-–—]+$/.test(text.slice(previous.end, actual.start))) return false;
          }
          if (token.word === 'pp') return participles.has(actual.word) || /^[a-z]{2,}ed$/.test(actual.word);
          if (token.word === "one's") return possessives.has(actual.word) || /'s$/.test(actual.word);
          if (token.word === 'oneself') return /^(myself|yourself|yourselves|himself|herself|itself|ourselves|themselves|oneself)$/.test(actual.word);
          // 문형의 have를 has/had로 확대하지 않아 could had went 같은 오탐을 막는다.
          return grammarPattern ? token.word === actual.word : variants[j].has(actual.word);
        });
        if (matches) ranges.push({ start: source[i].start, end: source[i + target.length - 1].end });
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
