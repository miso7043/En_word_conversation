import { and, asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { remapPosition } from '../shared/lesson.ts';
import type { Lesson } from '../shared/lesson.ts';
import { conversations, lessons, lines, progress } from './schema.ts';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
export function contentHash(lesson: Lesson) {
  const { id, position, revision, date, sourceDate, ...content } = lesson;
  return createHash('sha256').update(JSON.stringify({ ...content, sourceDate: sourceDate ?? null })).digest('hex');
}
export async function saveLesson(lesson: Lesson, replace: boolean) {
  return (await importLesson(lesson, replace ? 'update' : 'skip')) === 'added';
}
export async function importLesson(lesson: Lesson, policy: 'skip' | 'update') {
  const { id, title, description } = lesson;
  const revision = contentHash(lesson);
  return db.transaction(async tx => {
    // Serializes creation as well as updates of the same filename.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    const [existing] = await tx.select().from(lessons).where(eq(lessons.id, id)).for('update');
    if (existing && policy === 'skip') return 'skipped' as const;
    if (existing?.revision === revision) return 'unchanged' as const;
    const oldLines = existing ? await tx.select().from(lines).where(eq(lines.lessonId, id))
      .orderBy(asc(lines.conversationOrdinal), asc(lines.ordinal)) : [];
    const oldProgress = existing ? await tx.select().from(progress).where(eq(progress.lessonId, id)) : [];
    const values = { id, title, description, date: lesson.date ? new Date(lesson.date) : null,
      tags: lesson.tags ?? [], level: lesson.level ?? null, revision };
    await tx.insert(lessons).values(values).onConflictDoUpdate({ target: lessons.id, set: values });
    if (existing) await tx.delete(conversations).where(eq(conversations.lessonId, id));
    for (const [ordinal, dialogue] of lesson.conversations.entries()) {
      await tx.insert(conversations).values({ lessonId: id, ordinal, title: dialogue.title, description: dialogue.description });
      if (dialogue.lines.length) await tx.insert(lines).values(dialogue.lines.map((line, index) => ({
        ...line, keyPhrase: line.keyPhrase ?? [], lessonId: id, conversationOrdinal: ordinal, ordinal: index,
      })));
    }
    const newLines = lesson.conversations.flatMap(group => group.lines);
    for (const item of oldProgress) await tx.update(progress).set({
      position: remapPosition(oldLines, newLines, item.position),
    }).where(and(eq(progress.userId, item.userId), eq(progress.lessonId, id)));
    return existing ? 'updated' as const : 'added' as const;
  });
}

export async function listLessons(userId = ''): Promise<Lesson[]> {
  return db.transaction(async tx => {
    const rows = await tx.select().from(lessons).leftJoin(progress, and(
      eq(progress.lessonId, lessons.id), eq(progress.userId, userId),
    )).orderBy(sql`${lessons.date} DESC NULLS LAST`, asc(lessons.id));
    const dialogueRows = await tx.select().from(conversations).orderBy(asc(conversations.ordinal));
    const lineRows = await tx.select().from(lines).orderBy(asc(lines.ordinal));
    const byId = new Map<string, Lesson>();
    for (const row of rows) {
      byId.set(row.lessons.id, {
        ...row.lessons, level: row.lessons.level ?? undefined, date: row.lessons.date?.toISOString() ?? null, position: row.progress?.position ?? 0, conversations: [],
      });
    }
    for (const row of dialogueRows) {
      byId.get(row.lessonId)?.conversations.push({
        title: row.title ?? undefined, description: row.description, lines: [],
      });
    }
    for (const row of lineRows) {
      byId.get(row.lessonId)?.conversations[row.conversationOrdinal]?.lines.push({
        speaker: row.speaker, text: row.text, meaning: row.meaning ?? undefined, keyPhrase: row.keyPhrase,
      });
    }
    return [...byId.values()];
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function saveProgress(id: string, position: number, userId: string) {
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

export async function claimLegacyProgress(userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claim = await client.query('INSERT INTO legacy_progress_claims VALUES ($1) ON CONFLICT DO NOTHING RETURNING user_id', [userId]);
    if (claim.rowCount) await client.query(`INSERT INTO progress (user_id, lesson_id, position)
      SELECT $1, lesson_id, position FROM progress WHERE user_id = 'local' ON CONFLICT DO NOTHING`, [userId]);
    await client.query('COMMIT');
    return !!claim.rowCount;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
