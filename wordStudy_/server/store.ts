import { and, asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Lesson } from '../shared/lesson.ts';
import { conversations, lessons, lines, progress } from './schema.ts';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
const userId = 'local';

export async function saveLesson(lesson: Lesson, replace: boolean) {
  const { id, title, description } = lesson;
  const date = lesson.date ? new Date(lesson.date) : null;
  return db.transaction(async tx => {
    const insert = tx.insert(lessons).values({ id, title, date, description });
    if (replace) {
      await insert.onConflictDoUpdate({ target: lessons.id, set: { title, date, description } });
      await tx.delete(conversations).where(eq(conversations.lessonId, id));
      await tx.delete(progress).where(eq(progress.lessonId, id));
    } else {
      const inserted = await insert.onConflictDoNothing().returning({ id: lessons.id });
      if (!inserted.length) return false;
    }

    for (const [ordinal, dialogue] of lesson.conversations.entries()) {
      await tx.insert(conversations).values({
        lessonId: id, ordinal, title: dialogue.title, description: dialogue.description,
      });
      if (dialogue.lines.length) {
        await tx.insert(lines).values(dialogue.lines.map((line, index) => ({
          ...line, lessonId: id, conversationOrdinal: ordinal, ordinal: index,
        })));
      }
    }
    return true;
  });
}

export async function listLessons(): Promise<Lesson[]> {
  return db.transaction(async tx => {
    const rows = await tx.select().from(lessons).leftJoin(progress, and(
      eq(progress.lessonId, lessons.id), eq(progress.userId, userId),
    )).orderBy(sql`${lessons.date} DESC NULLS LAST`, asc(lessons.id));
    const dialogueRows = await tx.select().from(conversations).orderBy(asc(conversations.ordinal));
    const lineRows = await tx.select().from(lines).orderBy(asc(lines.ordinal));
    const byId = new Map<string, Lesson>();
    for (const row of rows) {
      byId.set(row.lessons.id, {
        ...row.lessons, date: row.lessons.date?.toISOString() ?? null, position: row.progress?.position ?? 0, conversations: [],
      });
    }
    for (const row of dialogueRows) {
      byId.get(row.lessonId)?.conversations.push({
        title: row.title ?? undefined, description: row.description, lines: [],
      });
    }
    for (const row of lineRows) {
      byId.get(row.lessonId)?.conversations[row.conversationOrdinal]?.lines.push({
        speaker: row.speaker, text: row.text, meaning: row.meaning ?? undefined,
      });
    }
    return [...byId.values()];
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function saveProgress(id: string, position: number) {
  return db.transaction(async tx => {
    const [lesson] = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, id)).for('update');
    if (!lesson) return false;
    const count = await tx.$count(lines, eq(lines.lessonId, id));
    if (position >= count && position !== 0) return false;
    await tx.insert(progress).values({ userId, lessonId: id, position }).onConflictDoUpdate({
      target: [progress.userId, progress.lessonId], set: { position },
    });
    return true;
  });
}
