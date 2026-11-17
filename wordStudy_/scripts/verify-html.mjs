import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../htmlVersion/conversation.html',import.meta.url),'utf8');
let count=0;
for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){new vm.Script(match[1]);count++;}
new vm.Script(readFileSync(new URL('../../htmlVersion/study.js',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('../../htmlVersion/lessons.json',import.meta.url),'utf8'));
assert.ok(manifest.length);for(const name of manifest){assert.ok(!name.includes('/'));assert.ok(readFileSync(new URL(`../../htmlVersion/json/${name}`,import.meta.url)).length);}
assert.ok(count>=2);console.log('PASS: HTML 인라인·학습 스크립트 구문, 정적 자료 manifest');
