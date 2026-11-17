// 기존 운영 DB는 읽지 않고 별도 임시 DB에서 검증한다.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const database = `wordstudy_verify_${Date.now()}`;
const connection = new URL(process.env.DATABASE_URL); connection.pathname = `/${database}`;
const db = new pg.Pool({ connectionString: connection.href });
const base = 'http://127.0.0.1:43872/api/', origin = 'http://localhost:43872';
const secret = 'test-only-session-secret-at-least-32-characters';
const temp = await mkdtemp(join(tmpdir(), 'wordstudy-api-'));
await writeFile(join(temp, 'access.json'), JSON.stringify({ adminGoogleIds: ['admin'] }));
let child, output = '', who = '', csrf = 'test-csrf';
async function start(enabled = '1') {
  output = '';
  child = spawn(process.execPath, ['--experimental-transform-types', 'server/index.ts'], {
    env: { ...process.env, DATABASE_URL: connection.href, PORT: '43872', SERVE_WEB: '0', ENABLE_IMPORT: enabled,
      PUBLIC_ORIGIN: origin, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', SESSION_SECRET: secret,
      ACCESS_CONFIG: join(temp,'access.json') }, stdio: ['ignore','pipe','pipe'],
  });
  child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  for(let i=0;i<150;i++) { if(child.exitCode!==null)throw new Error(output);try{if((await fetch(`${base}health`)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100)); }
  throw new Error(`검증 서버 시작 실패: ${output}`);
}
async function stop() { if(!child||child.exitCode!==null)return;const ended=once(child,'exit');child.kill('SIGTERM');await ended; }
async function request(path, method='GET', body, expected=200, headers={}) {
  const response=await fetch(`${base}${path}`,{method,headers:{...(body?{'content-type':'application/json','origin':origin,'x-csrf-token':csrf}:{}),...(who?{cookie:`ws_session=${who}`} : {}),...headers},body:body?JSON.stringify(body):undefined});
  const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text}`);return text?JSON.parse(text):null;
}
async function session(token, sub, expired=false) {
  await db.query(`INSERT INTO auth_sessions (id,user_id,csrf,expires_at) VALUES ($1,$2,$3,now()+$4::interval)`,[createHash('sha256').update(secret).update(token).digest('hex'),sub,csrf,expired?'-1 hour':'1 hour']);
}
await admin.query(`CREATE DATABASE ${database}`);
try {
  // 이전 마이그레이션만 적용된 실제 구형 DB를 만든 뒤 새 서버로 업그레이드한다.
  const initial = await readFile('drizzle/0000_initial.sql', 'utf8');
  await db.query(initial);
  await db.query('CREATE SCHEMA drizzle');
  await db.query('CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  await db.query('INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES ($1,$2)', [createHash('sha256').update(initial).digest('hex'),1794643200000]);
  await db.query("INSERT INTO lessons VALUES ('legacy.json','기존 자료',NULL,'{}')");
  await db.query("INSERT INTO conversations VALUES ('legacy.json',0,'기존 대화','{}')");
  await db.query("INSERT INTO lines VALUES ('legacy.json',0,0,'A','Existing one.',NULL), ('legacy.json',0,1,'B','Existing two.',NULL)");
  await db.query("INSERT INTO progress VALUES ('local','legacy.json',1), ('admin','legacy.json',1)");
  await start();
  const legacy = (await request('lessons')).find(l => l.id === 'legacy.json');
  assert.equal(legacy.title, '기존 자료');assert.equal(legacy.conversations[0].lines.length, 2);assert.equal('tags' in legacy,false);
  assert.equal((await db.query("SELECT position FROM progress WHERE user_id='local' AND lesson_id='legacy.json'")).rows[0].position,1);
  const seeds=(await request('lessons')).filter(l=>l.id!=='legacy.json');assert.equal(seeds.length,22);assert.equal(seeds.flatMap(l=>l.conversations).length,222);assert.equal(seeds.flatMap(l=>l.conversations.flatMap(c=>c.lines)).length,430);
  assert.deepEqual(await request('config'),{canImport:false});
  const name='verification-only.json',data={title:'검증 자료',tags:['greeting'],level:'A1',conversations:[{lines:[{speaker:'A',text:'Hello.',meaning:'안녕하세요.',keyPhrase:'Hello'},{speaker:'B',text:'Hi.'}]}]};
  const payload=()=>({name,modified:0,data});
  await request('import','POST',payload(),401);await request('progress','PUT',{id:name,position:0},401);
  await session('member-token','member');await session('admin-token','admin');await session('expired-token','admin',true);
  who='member-token';await request('import','POST',payload(),403);assert.equal((await request('auth/session')).user.admin,false);
  who='expired-token';await request('import','POST',payload(),401);
  who='admin-token';csrf='wrong';await request('import','POST',payload(),403);csrf='test-csrf';
  await request('import','POST',payload(),403,{origin:'https://evil.example'});
  assert.deepEqual(await request('config'),{canImport:true});
  assert.equal((await request('import','POST',payload())).status,'added');
  await request('progress','PUT',{id:name,position:1});
  const find=async()=> (await request('lessons')).find(l=>l.id===name);
  assert.equal((await find()).position,1);
  assert.deepEqual((await find()).conversations[0].lines[0].keyPhrase,['Hello']);
  assert.equal((await request('import','POST',{...payload(),modified:123456})).status,'unchanged');
  data.title='수정 자료';
  assert.equal((await request('import','POST',{...payload(),policy:'skip'})).status,'skipped');assert.equal((await find()).title,'검증 자료');
  data.conversations[0].lines.unshift({speaker:'A',text:'Inserted.'});
  assert.equal((await request('import','POST',payload())).status,'updated');assert.equal((await find()).position,2);
  who='member-token';assert.equal((await find()).position,0);await request('progress','PUT',{id:name,position:1});
  who='admin-token';assert.equal((await find()).position,2);
  data.conversations[0].lines=[{speaker:'A',text:'Only remaining.'}];await request('import','POST',payload());assert.equal((await find()).position,0);
  await request('progress','PUT',{id:name,position:1},404);await request('progress','PUT',{id:name,position:-1},400);
  await request('import','POST',{...payload(),data:{title:'invalid'}},400);assert.equal((await find()).title,'수정 자료');
  const concurrent=await Promise.all(Array.from({length:3},()=>request('import','POST',{...payload(),name:'concurrent.json'})));
  assert.equal(concurrent.filter(r=>r.status==='added').length,1);assert.equal(concurrent.filter(r=>r.status==='unchanged').length,2);
  // DB 제약 실패가 자료 교체 전체를 롤백하는지 확인한다.
  await db.query(`ALTER TABLE lines ADD CONSTRAINT verification_text CHECK (text <> 'reject-me')`);
  const before=await find();await request('import','POST',{...payload(),data:{...data,conversations:[{lines:[{speaker:'A',text:'reject-me'}]}]}},500);assert.deepEqual(await find(),before);
  await db.query('ALTER TABLE lines DROP CONSTRAINT verification_text');
  await db.query("INSERT INTO progress VALUES ('local',$1,0)",[name]);
  assert.equal((await request('admin/claim-progress','POST',{})).copied,true);assert.equal((await request('admin/claim-progress','POST',{})).copied,false);
  assert.equal((await db.query("SELECT count(*) FROM progress WHERE user_id='local'")).rows[0].count,'2');
  const login=await fetch(`${base}auth/login`,{redirect:'manual'});assert.equal(login.status,302);assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));assert.ok(new URL(login.headers.get('location')).searchParams.get('code_challenge'));
  await request('auth/callback?code=invalid&state=invalid','GET',undefined,400);
  await stop();await start();assert.equal((await find()).title,'수정 자료');
  for (const path of ['audio', 'audio/old/file', 'audio/old/export']) await request(path,'GET',undefined,404);
  await request('admin/audio','POST',{},404);
  await request('auth/logout','POST',{});await request('import','POST',payload(),401);
  await stop();await start('0');assert.deepEqual(await request('config'),{canImport:false});await request('import','POST',payload(),404);
  console.log('PASS: 구형 DB 마이그레이션·기존 seed·진도 보존, 관리자/일반/익명/만료 권한, CSRF, 변경 해시, 갱신·문장 이동·보정, 동시 가져오기, 롤백, 공동 진도 복사, 음성 생성 API 제거, 로그아웃, 가져오기 기본 차단');
} finally { await stop();await db.end();await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);await admin.end();await rm(temp,{recursive:true,force:true}); }
