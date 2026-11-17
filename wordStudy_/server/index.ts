import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parseLesson } from '../shared/lesson.ts';
import { identity, registerAuth, requireUser, requireAdmin } from './auth.ts';
import { db, listLessons, pool, saveProgress, importLesson } from './store.ts';

const app = Fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token'] }, disableRequestLogging: true });
registerAuth(app);

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  return { ok: true };
});
app.get('/api/lessons', async (request, reply) => reply.header('cache-control', 'no-store').send(await listLessons((await identity(request))?.sub)));

app.put<{ Body: { id: string; position: number } }>('/api/progress', {
  schema: { body: {
    type: 'object', required: ['id', 'position'], additionalProperties: false,
    properties: { id: { type: 'string', maxLength: 225 }, position: { type: 'integer', minimum: 0 } },
  } },
}, async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return;
  const { id, position } = request.body;
  if (!await saveProgress(id, position, user.sub)) return reply.code(404).send({ message: '대사 위치를 찾을 수 없습니다.' });
  return { ok: true };
});

app.get('/api/config', async request => ({ canImport: process.env.ENABLE_IMPORT === '1' && !!(await identity(request))?.admin }));
if (process.env.ENABLE_IMPORT === '1') {
  app.post<{ Body: { name: string; modified: number; data: unknown; policy?: 'skip' | 'update' } }>('/api/import', {
    bodyLimit: 4 * 1024 * 1024,
    schema: { body: {
      type: 'object', required: ['name', 'modified', 'data'], additionalProperties: false,
      properties: { name: { type: 'string' }, modified: { type: 'number' }, data: {}, policy: { type: 'string', enum: ['skip', 'update'] } },
    } },
  }, async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const { name, modified, data, policy } = request.body;
    let lesson;
    try {
      lesson = parseLesson(name, data, modified);
    } catch (error) {
      return reply.code(400).send({ message: (error as Error).message });
    }
    return { id: lesson.id, status: await importLesson(lesson, policy ?? 'update') };
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
      await importLesson(parseLesson(entry.name, JSON.parse(raw.replace(/^\uFEFF/, '')), info.mtimeMs), 'skip');
    } catch (error) {
      throw new Error(`${entry.name} 가져오기 실패`, { cause: error });
    }
  }
  if (process.env.SERVE_WEB !== '0') {
    await app.register(fastifyStatic, { root: resolve('dist') });
    app.get('/administration', async (_request, reply) => reply.sendFile('index.html'));
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
