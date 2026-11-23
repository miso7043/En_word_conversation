import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { basePath, route } from './paths.ts';
import { parseLesson } from '../shared/lesson.ts';
import { identity, registerAuth, requireUser, requireAdmin } from './auth.ts';
import { db, listLessons, pool, saveProgress, importLesson, recordStudy, saveMemorized } from './store.ts';

const app = Fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token'] }, disableRequestLogging: true });
registerAuth(app);

app.get(route('/api/health'), async () => {
  await pool.query('SELECT 1');
  return { ok: true };
});
app.get(route('/api/lessons'), async (request, reply) => {
  const user = await identity(request);
  const items = await listLessons(user?.sub);
  return reply.header('cache-control', 'no-store').send(user?.admin ? items : items.map(({ studyCount, memorized, ...lesson }) => lesson));
});

app.put<{ Body: { id: string; position: number } }>(route('/api/progress'), {
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

// 관리자만 공통 학습 횟수를 기록한다. 인증·권한·CSRF를 모두 확인한다.
app.post<{ Body: { id: string; eventId: string } }>(route('/api/study-completions'), {
  schema: { body: {
    type: 'object', required: ['id', 'eventId'], additionalProperties: false,
    properties: { id: { type: 'string', maxLength: 225 }, eventId: { type: 'string', format: 'uuid' } },
  } },
}, async (request, reply) => {
  if (!await requireAdmin(request, reply)) return;
  const count = await recordStudy(request.body.id, request.body.eventId);
  if (count === undefined) return reply.code(404).send({ message: '자료를 찾을 수 없습니다.' });
  return { studyCount: count };
});

// 암기 상태 변경도 관리자에게만 허용한다.
app.put<{ Body: { id: string; memorized: boolean } }>(route('/api/memorized'), {
  schema: { body: {
    type: 'object', required: ['id', 'memorized'], additionalProperties: false,
    properties: { id: { type: 'string', maxLength: 225 }, memorized: { type: 'boolean' } },
  } },
}, async (request, reply) => {
  if (!await requireAdmin(request, reply)) return;
  const { id, memorized } = request.body;
  if (!await saveMemorized(id, memorized)) return reply.code(404).send({ message: '자료를 찾을 수 없습니다.' });
  return { memorized };
});

app.get(route('/api/config'), async request => ({ canImport: process.env.ENABLE_IMPORT === '1' && !!(await identity(request))?.admin }));
if (process.env.ENABLE_IMPORT === '1') {
  app.post<{ Body: { name: string; modified: number; data: unknown; policy?: 'skip' | 'update' } }>(route('/api/import'), {
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
    await app.register(fastifyStatic, { root: resolve('dist'), prefix: route('/') });
    if (basePath) {
      app.get(basePath, async (_request, reply) => reply.redirect(route('/'), 308));
      app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>태환 블로그</title></head>
<body><main><h1>태환 블로그</h1></main></body></html>`));
    }
    app.get(route('/administration'), async (_request, reply) => reply.sendFile('index.html'));
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
