// 서버 컨테이너의 /app/scripts에서 실행한다. 인증 테이블과 DB 볼륨은 변경하지 않는다.
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { parseLesson, remapPosition } from '../shared/lesson.ts';

const directory = resolve(process.argv[2] ?? '');
if (!process.argv[2] || process.argv[3] !== '--apply' || !process.env.DATABASE_URL) {
  throw new Error('사용법: node --experimental-transform-types scripts/replace-lessons.mjs JSON폴더 --apply (DATABASE_URL 필요)');
}
const files = (await readdir(directory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.json$/i.test(entry.name)).map(entry => entry.name).sort();
if (!files.length) throw new Error('JSON 파일이 없어 중단합니다.');
const lessons = [];
for (const name of files) {
  const path = join(directory, name);
  const raw = await readFile(path, 'utf8');
  lessons.push(parseLesson(name, JSON.parse(raw.replace(/^\uFEFF/, '')), (await stat(path)).mtimeMs));
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '15s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('wordstudy-import'))");
  await client.query('LOCK TABLE lessons, conversations, lines, progress, study_completions IN EXCLUSIVE MODE');
  const before = await client.query('SELECT count(*)::int AS count FROM lessons');
  for (const lesson of lessons) {
    const { id, position, revision, date, sourceDate, studyCount, memorized, ...content } = lesson;
    const hash = createHash('sha256').update(JSON.stringify({ ...content, sourceDate: sourceDate ?? null })).digest('hex');
    const oldLines = (await client.query('SELECT speaker, text FROM lines WHERE lesson_id=$1 ORDER BY conversation_ordinal, ordinal', [id])).rows;
    const oldProgress = (await client.query('SELECT user_id, position FROM progress WHERE lesson_id=$1', [id])).rows;
    await client.query(`INSERT INTO lessons (id,title,date,description,revision) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,date=EXCLUDED.date,description=EXCLUDED.description,revision=EXCLUDED.revision`,
      [id,lesson.title,date,lesson.description,hash]);
    await client.query('DELETE FROM conversations WHERE lesson_id=$1',[id]);
    for (const [ordinal, group] of lesson.conversations.entries()) {
      await client.query('INSERT INTO conversations (lesson_id,ordinal,title,description) VALUES ($1,$2,$3,$4)',[id,ordinal,group.title,group.description]);
      for (const [index,line] of group.lines.entries()) {
        await client.query('INSERT INTO lines (lesson_id,conversation_ordinal,ordinal,speaker,text,meaning,key_phrase) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [id,ordinal,index,line.speaker,line.text,line.meaning ?? null,line.keyPhrase ?? []]);
      }
    }
    const newLines = lesson.conversations.flatMap(group => group.lines);
    for (const item of oldProgress) {
      await client.query('UPDATE progress SET position=$1 WHERE user_id=$2 AND lesson_id=$3',
        [remapPosition(oldLines,newLines,item.position),item.user_id,id]);
    }
  }
  const removed = await client.query('DELETE FROM lessons WHERE NOT (id = ANY($1::text[]))',[files]);
  const expected = [lessons.length,lessons.flatMap(l=>l.conversations).length,lessons.flatMap(l=>l.conversations.flatMap(c=>c.lines)).length];
  const counts = (await client.query('SELECT (SELECT count(*)::int FROM lessons) AS lessons,(SELECT count(*)::int FROM conversations) AS conversations,(SELECT count(*)::int FROM lines) AS lines')).rows[0];
  if (JSON.stringify(Object.values(counts)) !== JSON.stringify(expected)) throw new Error('등록 건수 검증 실패');
  await client.query('COMMIT');
  console.log(JSON.stringify({ before: before.rows[0].count, removed: removed.rowCount, ...counts }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
