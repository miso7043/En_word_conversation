import type { Lesson } from '../shared/lesson';

export function updateSelection(ids: string[], selected: Set<string>, id: string,
  anchor: string | null, shift: boolean, additive: boolean) {
  const index = ids.indexOf(id);
  const start = anchor === null ? -1 : ids.indexOf(anchor);
  if (index < 0) return selected;
  if (shift && start >= 0) {
    const next = additive ? new Set(selected) : new Set<string>();
    for (const item of ids.slice(Math.min(start, index), Math.max(start, index) + 1)) next.add(item);
    return next;
  }
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectedPlaylist(lessons: Lesson[], selected: Set<string>) {
  return lessons.filter(lesson => selected.has(lesson.id)
    && lesson.conversations.some(group => group.lines.length)).toReversed();
}
