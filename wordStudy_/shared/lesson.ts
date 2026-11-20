export type Line = { speaker: string; text: string; meaning?: string; keyPhrase?: string[] };
export type Dialogue = { title?: string; description: string[]; lines: Line[] };
export type Lesson = {
  id: string;
  title: string;
  date: string | null;
  description: string[];
  conversations: Dialogue[];
  position: number;
  studyCount?: number;
  revision?: string;
  sourceDate?: string | null;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('객체가 필요합니다.');
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error(`${field} 항목에 텍스트가 필요합니다.`);
  }
  return value;
}

function paragraphs(value: unknown): string[] {
  if (value == null || value === '') return [];
  return (Array.isArray(value) ? value : [value])
    .filter(paragraph => paragraph !== '')
    .map(paragraph => requiredText(paragraph, 'description'));
}

export function parseLesson(id: string, value: unknown, modified: number): Lesson {
  if (!/^[^/\\\u0000-\u001f]{1,220}\.json$/iu.test(id)) throw new Error('JSON 파일 이름을 확인하세요.');
  const data = record(value);
  if (!Array.isArray(data.conversations)) throw new Error('conversations 배열이 필요합니다.');
  const declaredDate = typeof data.date === 'string' ? Date.parse(data.date) : NaN;
  const date = Number.isFinite(declaredDate) ? declaredDate : modified;
  return {
    id,
    title: requiredText(data.title, 'title'),
    date: Number.isFinite(date) && Math.abs(date) <= 8.64e15 ? new Date(date).toISOString() : null,
    description: paragraphs(data.description),
    position: 0,
    sourceDate: Number.isFinite(declaredDate) ? new Date(declaredDate).toISOString() : null,
    conversations: data.conversations.map((value, index) => {
      const dialogue = record(value);
      if (!Array.isArray(dialogue.lines)) throw new Error('lines 배열이 필요합니다.');
      return {
        title: typeof dialogue.title === 'string' && dialogue.title
          ? requiredText(dialogue.title, 'title')
          : `대화 ${typeof dialogue.id === 'number' ? dialogue.id : index + 1}`,
        description: paragraphs(dialogue.description),
        lines: dialogue.lines.map(value => {
          const line = record(value);
          return {
            speaker: requiredText(line.speaker, 'speaker'),
            text: requiredText(line.text, 'text'),
            keyPhrase: line.keyPhrase == null ? [] : stringArray(typeof line.keyPhrase === 'string' ? [line.keyPhrase] : line.keyPhrase, 'keyPhrase'),
            meaning: line.meaning == null || line.meaning === '' ? undefined : requiredText(line.meaning, 'meaning'),
          };
        }),
      };
    }),
  };
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`${field} 배열을 확인하세요.`);
  return [...new Set(value.map(item => requiredText(item, field)))];
}
export function remapPosition(oldLines: Array<Pick<Line, 'speaker' | 'text'>>, newLines: Array<Pick<Line, 'speaker' | 'text'>>, position: number) {
  const old = oldLines[position];
  const matches = newLines.flatMap((line, index) => old && line.speaker === old.speaker && line.text === old.text ? [index] : []);
  return matches.length ? matches.reduce((a, b) => Math.abs(a - position) <= Math.abs(b - position) ? a : b)
    : Math.max(0, Math.min(position, newLines.length - 1));
}
