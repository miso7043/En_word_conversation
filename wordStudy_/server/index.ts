import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parseLesson } from '../shared/lesson.ts';
import { db, listLessons, pool, saveLesson, saveProgress } from './store.ts';

const app = Fastify({ logger: true });

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  return { ok: true };
});
app.get('/api/lessons', async (_request, reply) => reply.header('cache-control', 'no-store').send(await listLessons()));

app.put<{ Body: { id: string; position: number } }>('/api/progress', {
  schema: { body: {
    type: 'object', required: ['id', 'position'], additionalProperties: false,
    properties: { id: { type: 'string', maxLength: 225 }, position: { type: 'integer', minimum: 0 } },
  } },
}, async (request, reply) => {
  const { id, position } = request.body;
  if (!await saveProgress(id, position)) return reply.code(404).send({ message: '대사 위치를 찾을 수 없습니다.' });
  return { ok: true };
});

app.get('/api/config', async () => ({ canImport: process.env.ENABLE_IMPORT === '1' }));
if (process.env.ENABLE_IMPORT === '1') {
  app.post<{ Body: { name: string; modified: number; data: unknown } }>('/api/import', {
    bodyLimit: 4 * 1024 * 1024,
    schema: { body: {
      type: 'object', required: ['name', 'modified', 'data'], additionalProperties: false,
      properties: { name: { type: 'string' }, modified: { type: 'number' }, data: {} },
    } },
  }, async (request, reply) => {
    const { name, modified, data } = request.body;
    let lesson;
    try {
      lesson = parseLesson(name, data, modified);
    } catch (error) {
      return reply.code(400).send({ message: (error as Error).message });
    }
    const added = await saveLesson(lesson, false);
    return { id: lesson.id, status: added ? 'added' : 'skipped' };
  });
}

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL이 필요합니다.');
  await migrate(db, { migrationsFolder: 'drizzle' });
  for (const entry of await readdir('seed', { withFileTypes: true })) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
    const path = join('seed', entry.name);
    const [raw, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    try {
      await saveLesson(parseLesson(entry.name, JSON.parse(raw.replace(/^\uFEFF/, '')), info.mtimeMs), false);
    } catch (error) {
      throw new Error(`${entry.name} 가져오기 실패`, { cause: error });
    }
  }
  if (process.env.SERVE_WEB !== '0') {
    await app.register(fastifyStatic, { root: resolve('dist') });
  }
  app.addHook('onClose', async () => { await pool.end(); });
  await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 43871) });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => { void app.close(); });
  }
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exitCode = 1;
}
