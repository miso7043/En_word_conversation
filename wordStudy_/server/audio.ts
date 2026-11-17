import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { listLessons } from './store.ts';
import { requireAdmin } from './auth.ts';
const root = process.env.AUDIO_CACHE ?? 'audio-cache';
type Item = { lessonId: string; position: number; text: string; speaker: string; userTurn?: boolean };
type Job = { id: string; title: string; state: 'queued' | 'generating' | 'complete' | 'failed'; message?: string;
  items: Item[]; pitch: number; loop: boolean; timeline?: Array<Item & { start: number; end: number }>; key: string };
const jobs = new Map<string, Job>();
let running = false;
async function persist(job: Job) {
  await mkdir(root, { recursive: true });
  const path = join(root, `${job.id}.json`);
  await writeFile(`${path}.tmp`, JSON.stringify(job)); await rename(`${path}.tmp`, path);
}
async function work() {
  if (running) return;
  running = true;
  try {
    for (const job of jobs.values()) {
      if (job.state !== 'queued') continue;
      job.state = 'generating'; await persist(job);
      try {
        const response = await fetch(`${process.env.TTS_URL}/render`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: job.items, pitch: job.pitch }), signal: AbortSignal.timeout(3600000) });
        if (!response.ok) throw new Error('로컬 TTS 생성에 실패했습니다. 모델과 서비스 로그를 확인하세요.');
        const result = await response.json() as { audio: string; timeline: Job['timeline'] };
        await writeFile(join(root, `${job.id}.wav.tmp`), Buffer.from(result.audio, 'base64'));
        await rename(join(root, `${job.id}.wav.tmp`), join(root, `${job.id}.wav`));
        job.timeline = result.timeline; job.state = 'complete'; delete job.message;
      } catch (error) { job.state = 'failed'; job.message = (error as Error).message; }
      await persist(job);
    }
  } finally { running = false; }
}
export async function registerAudio(app: FastifyInstance) {
  await mkdir(root, { recursive: true });
  for (const name of await readdir(root)) {
    if (!/^[\da-f-]+\.json$/.test(name)) continue;
    try { const job = JSON.parse(await readFile(join(root, name), 'utf8')) as Job; if (job.state === 'generating') job.state = 'queued'; jobs.set(job.id, job); } catch { /* 불완전한 캐시는 무시 */ }
  }
  const schedule = () => { void work().catch(error => app.log.error(error, '음성 생성 큐 오류')); };
  if (process.env.TTS_URL) schedule();
  app.get('/api/audio', async () => ({ enabled: !!process.env.TTS_URL, jobs: [...jobs.values()].map(({ items, ...job }) => job) }));
  app.post<{ Body: { ids: string[]; pitch: number; repeat: number; role: string; a: number; b: number } }>('/api/admin/audio', {
    schema: { body: { type: 'object', required: ['ids', 'pitch', 'repeat', 'role', 'a', 'b'], additionalProperties: false, properties: {
      ids: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string' } }, pitch: { type: 'number', minimum: .5, maximum: 1.5 }, repeat: { type: 'integer', minimum: 1, maximum: 10 }, role: { type: 'string', maxLength: 100 }, a: { type: 'integer', minimum: -1 }, b: { type: 'integer', minimum: -1 },
    } } },
  }, async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!process.env.TTS_URL) return reply.code(503).send({ message: '로컬 TTS 서비스가 설정되지 않았습니다.' });
    const body = request.body;
    const all = await listLessons();
    const selected = body.ids.map(id => all.find(lesson => lesson.id === id));
    if (selected.some(lesson => !lesson)) return reply.code(400).send({ message: '자료를 찾을 수 없습니다.' });
    const loop = body.a >= 0 && body.b >= body.a;
    if (loop && (selected.length !== 1 || body.b >= selected[0]!.conversations.flatMap(c => c.lines).length)) return reply.code(400).send({ message: '구간 반복은 자료 하나의 유효한 문장 범위로 지정하세요.' });
    const items: Item[] = [];
    for (const lesson of selected) lesson!.conversations.flatMap(c => c.lines).forEach((line, position) => {
      if (loop && (position < body.a || position > body.b)) return;
      for (let i = 0; i < body.repeat; i++) items.push({ lessonId: lesson!.id, position, text: line.text, speaker: line.speaker, ...(line.speaker === body.role ? { userTurn: true } : {}) });
    });
    if (!items.length || items.length > 2000 || items.some(item => item.text.length > 10000) || items.reduce((n, item) => n + item.text.length, 0) > 100000) return reply.code(400).send({ message: '생성할 문장 수는 1~2000개, 문장 길이는 10000자 이하입니다.' });
    const key = createHash('sha256').update(JSON.stringify([items, body.pitch, loop, process.env.TTS_MODEL_REVISION ?? 'piper-1.3.0-ljspeech-medium'])).digest('hex');
    const existing = [...jobs.values()].find(job => job.key === key);
    if (existing) { if (existing.state === 'failed') { existing.state = 'queued'; await persist(existing); schedule(); } return { id: existing.id }; }
    const job: Job = { id: randomUUID(), title: selected.map(l => l!.title).join(' → '), state: 'queued', items, pitch: body.pitch, loop, key };
    jobs.set(job.id, job); await persist(job); schedule(); return { id: job.id };
  });
  app.get<{ Params: { id: string } }>('/api/audio/:id/export', async (request, reply) => {
    const job = jobs.get(request.params.id);
    if (!job || job.state !== 'complete') return reply.code(404).send({ message: '완료된 음성을 찾을 수 없습니다.' });
    const audio = await readFile(join(root, `${job.id}.wav`));
    return reply.header('content-disposition', 'attachment; filename="study-audio.json"').send({ version: 1, title: job.title, loop: job.loop, pitch: job.pitch, timeline: job.timeline, audio: `data:audio/wav;base64,${audio.toString('base64')}` });
  });
  app.get<{ Params: { id: string } }>('/api/audio/:id/file', async (request, reply) => {
    const job = jobs.get(request.params.id);
    if (!job || job.state !== 'complete') return reply.code(404).send({ message: '완료된 음성을 찾을 수 없습니다.' });
    const path = join(root, `${job.id}.wav`), size = (await stat(path)).size;
    const range = request.headers.range;
    reply.type('audio/wav').header('accept-ranges', 'bytes');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return reply.code(416).header('content-range', `bytes */${size}`).send();
      const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start > end || start >= size) return reply.code(416).header('content-range', `bytes */${size}`).send();
      reply.code(206).header('content-range', `bytes ${start}-${end}/${size}`).header('content-length', end - start + 1);
      return reply.send(createReadStream(path, { start, end }));
    }
    return reply.header('content-length', size).send(createReadStream(path));
  });
}
