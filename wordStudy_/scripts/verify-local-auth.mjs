import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import Fastify from 'fastify';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.SESSION_SECRET = 's'.repeat(64);
process.env.ADMIN_PASSWORD_HASH = `salt:${scryptSync('test-password', 'salt', 64).toString('hex')}`;
const { registerAuth, verifyPassword, requireAdmin } = await import('../server/auth.ts');
const { pool } = await import('../server/store.ts');
assert(verifyPassword('test-password'));
assert(!verifyPassword('wrong'));
assert(!verifyPassword('test-password', 'invalid'));
let session;
const original = pool.query;
pool.query = async (sql, args) => {
  if (sql.startsWith('INSERT')) session = { user_id: args[1], csrf: args[2] };
  return { rows: sql.startsWith('SELECT') && session ? [session] : [] };
};
const app = Fastify();
registerAuth(app);
app.post('/protected', async (req, reply) => await requireAdmin(req, reply));
try {
  const origin = 'http://localhost:43871';
  const login = password => app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { username: 'test-admin', password } });
  assert.equal((await app.inject({ method: 'POST', url: '/protected' })).statusCode, 401);
  assert.equal((await login('wrong')).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'test-admin', password: 'test-password' } })).statusCode, 403);
  const response = await login('test-password');
  assert.equal(response.statusCode, 200);
  const cookie = response.headers['set-cookie'].split(';')[0];
  assert(response.headers['set-cookie'].includes('HttpOnly'));
  const user = (await app.inject({ url: '/api/auth/session', headers: { cookie } })).json().user;
  assert.equal(user.admin, true);
  assert.equal((await app.inject({ method: 'POST', url: '/protected', headers: { cookie, origin } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/protected', headers: { cookie, origin, 'x-csrf-token': user.csrf } })).statusCode, 200);
  for (let i = 0; i < 5; i++) assert.equal((await login('wrong')).statusCode, 401);
  assert.equal((await login('test-password')).statusCode, 429);
  console.log('PASS: scrypt·로그인 성공/실패·미인증 차단·Origin/CSRF·관리자 권한·시도 제한');
} finally { pool.query = original; await app.close(); await pool.end(); }
