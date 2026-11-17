// Run inside the app container via stdin. Uses a separate, temporary database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const database = `wordstudy_verify_${Date.now()}`;
const connection = new URL(process.env.DATABASE_URL);
connection.pathname = `/${database}`;
const base = 'http://127.0.0.1:43872/api/';
let child;
let output = '';

async function start() {
  output = '';
  child = spawn(process.execPath, ['--experimental-transform-types', 'server/index.ts'], {
    env: { ...process.env, DATABASE_URL: connection.href, PORT: '43872', SERVE_WEB: '0', ENABLE_IMPORT: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${base}health`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start: ${output}`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, 'exit');
  child.kill('SIGTERM');
  await ended;
}

async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(response.status, expected, `${method} ${path}`);
  return response.json();
}

await admin.query(`CREATE DATABASE ${database}`);
try {
  await start();
  const lessons = await request('lessons');
  assert.equal(lessons.length, 22);
  assert.equal(lessons.flatMap(lesson => lesson.conversations).length, 222);
  assert.equal(lessons.flatMap(lesson => lesson.conversations.flatMap(group => group.lines)).length, 430);
  assert.deepEqual(await request('config'), { canImport: true });
  const name = 'verification-only.json';
  const data = { title: '검증 자료', conversations: [{ lines: [
    { speaker: 'A', text: 'Hello.', meaning: '안녕하세요.' },
    { speaker: 'B', text: 'Hi.' },
  ] }] };
  assert.deepEqual(await request('import', 'POST', { name, modified: 0, data }), { id: name, status: 'added' });
  await request('progress', 'PUT', { id: name, position: 1 });
  const find = async () => (await request('lessons')).find(lesson => lesson.id === name);
  assert.equal((await find()).position, 1);
  await request('progress', 'PUT', { id: name, position: 2 }, 404);
  await request('progress', 'PUT', { id: name, position: -1 }, 400);
  await request('import', 'POST', { name, modified: 0, data: { title: 'invalid' } }, 400);
  assert.equal((await find()).position, 1);
  await stop();
  await start();
  assert.equal((await request('lessons')).length, 23);
  assert.equal((await find()).position, 1);
  data.title = '교체 자료';
  assert.deepEqual(await request('import', 'POST', { name, modified: 0, data }), { id: name, status: 'skipped' });
  assert.equal((await find()).title, '검증 자료');
  assert.equal((await find()).position, 1);
  const concurrentName = 'concurrent-verification.json';
  const concurrent = await Promise.all(Array.from({ length: 3 }, () =>
    request('import', 'POST', { name: concurrentName, modified: 0, data })));
  assert.equal(concurrent.filter(result => result.status === 'added').length, 1);
  assert.equal(concurrent.filter(result => result.status === 'skipped').length, 2);
  assert.equal((await request('lessons')).length, 24);
  console.log('PASS: seeds (22/222/430), config, import, duplicate skipping, concurrent imports, validation, progress, restart persistence');
} finally {
  await stop();
  await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await admin.end();
}
