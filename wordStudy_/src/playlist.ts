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

export function selectedPlaylist(lessons: Lesson[], selected: Set<string>, order: 'reverse' | 'forward' = 'reverse') {
  const items = lessons.filter(lesson => selected.has(lesson.id)
    && lesson.conversations.some(group => group.lines.length));
  return order === 'reverse' ? items.toReversed() : items;
}

// 선택 목록은 지정된 방향으로 순환하고, 목록 밖 자료는 현재 자료만 반복한다.
export function nextPlaylistLesson<T extends { id: string }>(playlist: T[], current: T, repeat: boolean): T | undefined {
  const index = playlist.findIndex(lesson => lesson.id === current.id);
  if (index < 0) return repeat ? current : undefined;
  return playlist[index + 1] ?? (repeat ? playlist[0] : undefined);
}
