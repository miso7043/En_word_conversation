import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
process.env.GOOGLE_CLIENT_ID='test-client';
const { publicKey, privateKey }=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');return new Response(JSON.stringify({keys:[jwk]}));};
const { verifyGoogleToken }=await import('../server/auth.ts');
const now=Math.floor(Date.now()/1000), claims={sub:'google-sub',iss:'https://accounts.google.com',aud:'test-client',exp:now+3600,iat:now,nonce:'nonce'};
function token(value=claims,header={alg:'RS256',kid:'test-key'}) { const encoded=[header,value].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');return `${encoded}.${sign('RSA-SHA256',Buffer.from(encoded),privateKey).toString('base64url')}`; }
try {
  assert.equal(await verifyGoogleToken(token(),'nonce'),'google-sub');
  for(const change of [{aud:'wrong'},{iss:'https://evil.example'},{exp:now-1},{iat:now+3600},{nonce:'wrong'},{sub:''},{exp:'not-number'}])await assert.rejects(verifyGoogleToken(token({...claims,...change}),'nonce'));
  await assert.rejects(verifyGoogleToken(token(claims,{alg:'none',kid:'test-key'}),'nonce'));
  await assert.rejects(verifyGoogleToken(token(claims,{alg:'RS256',kid:'wrong'}),'nonce'));
  const bad=token().split('.');bad[2]=Buffer.from('invalid signature').toString('base64url');await assert.rejects(verifyGoogleToken(bad.join('.'),'nonce'));
  console.log('PASS: Google RS256 서명·발급자·대상·만료·nonce·발급시각·sub 검증');
} finally { globalThis.fetch=originalFetch; }
