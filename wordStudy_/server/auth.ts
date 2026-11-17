import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool, claimLegacyProgress } from './store.ts';

const random = () => randomBytes(32).toString('base64url');
const secret = process.env.SESSION_SECRET ?? '';
const digest = (value: string) => createHash('sha256').update(secret).update(value).digest('hex');
const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:43871';
const callback = `${origin}/api/auth/callback`;
export const authEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && secret.length >= 32);
type Identity = { sub: string; admin: boolean; csrf: string };

async function admins(): Promise<string[]> {
  try {
    const config = JSON.parse(await readFile(process.env.ACCESS_CONFIG ?? 'config/access.json', 'utf8'));
    return Array.isArray(config.adminGoogleIds) ? config.adminGoogleIds.filter((id: unknown) => typeof id === 'string') : [];
  } catch { return []; }
}
function cookie(request: FastifyRequest) {
  const raw = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('ws_session='));
  return raw?.slice('ws_session='.length) ?? '';
}
function setCookie(reply: FastifyReply, token: string, age: number) {
  reply.header('set-cookie', `ws_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`);
}
export async function identity(request: FastifyRequest): Promise<Identity | null> {
  if (!authEnabled) return null;
  const { rows } = await pool.query('SELECT user_id, csrf FROM auth_sessions WHERE id=$1 AND expires_at>now()', [digest(cookie(request))]);
  const session = rows[0];
  return session?.user_id ? { sub: session.user_id, csrf: session.csrf, admin: (await admins()).includes(session.user_id) } : null;
}
export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await identity(request);
  if (!user) { reply.code(401).send({ message: '로그인이 필요합니다.' }); return null; }
  if (request.headers.origin !== origin || request.headers['x-csrf-token'] !== user.csrf) {
    reply.code(403).send({ message: '요청 검증에 실패했습니다. 페이지를 다시 여세요.' }); return null;
  }
  return user;
}
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireUser(request, reply);
  if (user && !user.admin) { reply.code(403).send({ message: '등록된 관리자만 사용할 수 있습니다.' }); return null; }
  return user;
}
let keys: { expires: number; values: Array<JsonWebKey & { kid?: string }> } | undefined;
export async function verifyGoogleToken(token: string, nonce: string) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('토큰 형식 오류');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('서명 알고리즘 오류');
  if (!keys || keys.expires < Date.now() || !keys.values.some(key => key.kid === header.kid)) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Google 공개키 조회 실패');
    keys = { values: (await response.json() as { keys: Array<JsonWebKey & { kid?: string }> }).keys, expires: Date.now() + 3600000 };
  }
  const jwk = keys.values.find(key => key.kid === header.kid);
  if (!jwk || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk as import('node:crypto').JsonWebKey, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('서명 오류');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const now = Date.now() / 1000;
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)
    || claims.aud !== process.env.GOOGLE_CLIENT_ID || !Number.isFinite(claims.exp) || claims.exp <= now
    || !Number.isFinite(claims.iat) || claims.iat > now + 60 || claims.nonce !== nonce
    || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new Error('토큰 검증 오류');
  return claims.sub as string;
}
export function registerAuth(app: FastifyInstance) {
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
    return payload;
  });
  app.get('/api/auth/session', async request => ({ enabled: authEnabled, user: await identity(request) }));
  app.get('/api/auth/login', async (_request, reply) => {
    if (!authEnabled) return reply.code(503).send({ message: '운영자가 Google 인증 설정을 완료해야 합니다.' });
    const token = random(), state = random(), nonce = random(), verifier = random();
    await pool.query('DELETE FROM auth_sessions WHERE expires_at<=now()');
    await pool.query('INSERT INTO auth_sessions (id, csrf, state, nonce, verifier, expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval \'10 minutes\')', [digest(token), random(), state, nonce, verifier]);
    setCookie(reply, token, 600);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: callback, response_type: 'code', scope: 'openid', state, nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return reply.redirect(url.href);
  });
  app.get<{ Querystring: { code?: string; state?: string } }>('/api/auth/callback', async (request, reply) => {
    const { rows } = await pool.query('DELETE FROM auth_sessions WHERE id=$1 AND user_id IS NULL AND expires_at>now() RETURNING *', [digest(cookie(request))]);
    const pending = rows[0];
    if (!authEnabled || !pending || !request.query.code || request.query.state !== pending.state) return reply.code(400).send({ message: '로그인 요청이 만료되었거나 유효하지 않습니다.' });
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000),
        body: new URLSearchParams({ code: request.query.code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: callback, grant_type: 'authorization_code', code_verifier: pending.verifier }) });
      if (!response.ok) throw new Error('로그인 교환 실패');
      const data = await response.json() as { id_token: string };
      const sub = await verifyGoogleToken(data.id_token, pending.nonce);
      const token = random();
      await pool.query('INSERT INTO auth_sessions (id,user_id,csrf,expires_at) VALUES ($1,$2,$3,now()+interval \'7 days\')', [digest(token), sub, random()]);
      setCookie(reply, token, 604800);
      return reply.redirect('/administration');
    } catch { return reply.code(400).send({ message: 'Google 로그인 검증에 실패했습니다. 다시 로그인하세요.' }); }
  });
  app.post('/api/auth/logout', async (request, reply) => {
    if (!await requireUser(request, reply)) return;
    await pool.query('DELETE FROM auth_sessions WHERE id=$1', [digest(cookie(request))]);
    setCookie(reply, '', 0);
    return { ok: true };
  });
  app.post('/api/admin/claim-progress', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return { copied: await claimLegacyProgress(user.sub) };
  });
}
