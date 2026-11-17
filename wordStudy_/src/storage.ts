import type { Lesson, Line } from '../shared/lesson';
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key); if (raw === null) return fallback;
    const value = JSON.parse(raw);
    if (fallback !== null && (Array.isArray(fallback) ? !Array.isArray(value) : typeof value !== typeof fallback || typeof fallback === 'object' && (!value || Array.isArray(value)))) return fallback;
    return value;
  } catch { return fallback; }
}
export function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export type Bookmark = { position: number; revision?: string; line?: Line };
export function bookmark(lesson: Lesson, position: number): Bookmark {
  return { position, revision: lesson.revision, line: lesson.conversations.flatMap(group => group.lines)[position] };
}
export function restore(lesson: Lesson, saved?: Bookmark) {
  if (!saved || !Number.isInteger(saved.position) || saved.position < 0) return lesson.position;
  const lines = lesson.conversations.flatMap(group => group.lines);
  if (saved.revision !== lesson.revision && saved.line) {
    const indices = lines.flatMap((line, i) => line.speaker === saved.line!.speaker && line.text === saved.line!.text ? [i] : []);
    if (indices.length) return indices.reduce((a, b) => Math.abs(a - saved.position) <= Math.abs(b - saved.position) ? a : b);
  }
  return Math.max(0, Math.min(saved.position, lines.length - 1));
}
