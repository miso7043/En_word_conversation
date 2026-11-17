const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const root=fileURLToPath(new URL('../../',import.meta.url));await mkdir(`${root}/docs/images`,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function removed() {
    assert.equal(await page.locator('audio,[data-setting=pitch],[data-setting=a],[data-setting=b],#study-tag').count(),0);
    assert.equal(await page.getByText(/오프라인 저장|생성 오디오|구간 해제|모든 태그/).count(),0);
    assert.equal(await page.getByRole('spinbutton',{name:'음성 피치'}).count(),0);
    assert.equal(await page.locator('header').getByLabel('테마').count(),1);
  }
  await page.goto('http://127.0.0.1:43879/');await page.getByRole('heading',{level:2}).first().waitFor();
  await removed();await page.getByRole('checkbox').first().check();await page.reload();await page.getByRole('checkbox').first().waitFor();assert.equal(await page.getByRole('checkbox').first().isChecked(),true);
  await page.getByLabel('테마',{exact:true}).selectOption('light');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.reload();assert.equal(await page.getByLabel('테마',{exact:true}).inputValue(),'light');await page.getByLabel('테마',{exact:true}).selectOption('dark');
  await page.getByLabel('자료 검색').fill('What did you think of my presentation today?');assert.equal(await page.locator('nav[aria-label="대화 목록"] input').count(),0);
  await page.getByLabel('자료 검색').fill('candid');assert.equal(await page.locator('nav[aria-label="대화 목록"] input').count(),1);await page.getByLabel('자료 검색').fill('');
  await page.getByText('학습 설정',{exact:true}).click();await page.getByText('영어 가리기',{exact:true}).click();assert.ok(await page.getByRole('button',{name:'탭하여 보기'}).count()>0);await page.getByRole('button',{name:'탭하여 보기'}).first().click();await page.getByText('영어 가리기',{exact:true}).click();
  assert.equal(await page.getByLabel('재생 속도').count(),1);await page.getByLabel('재생 속도').fill('0.7');await page.locator('summary').filter({hasText:'학습 설정'}).click();
  await page.screenshot({path:`${root}/docs/images/react-desktop.png`});
  await page.goto('http://127.0.0.1:43879/administration');await page.getByText('Google 인증 설정이 필요합니다.',{exact:true}).waitFor();assert.equal(await page.getByText('JSON 파일',{exact:true}).count(),0);
  await page.goto('http://127.0.0.1:43879/htmlVersion/conversation.html');await page.locator('#lessons button').first().waitFor();await removed();
  await page.locator('#lessons input').first().check();await page.reload();await page.locator('#lessons input').first().waitFor();assert.equal(await page.locator('#lessons input').first().isChecked(),true);
  await page.getByLabel('테마',{exact:true}).selectOption('light');await page.reload();assert.equal(await page.getByLabel('테마',{exact:true}).inputValue(),'light');await page.getByLabel('테마',{exact:true}).selectOption('dark');
  await page.locator('.study-options summary').click();await page.locator('[data-setting=hideEnglish]').check();assert.ok(await page.getByRole('button',{name:'탭하여 보기'}).count()>0);await page.locator('[data-setting=hideEnglish]').uncheck();
  const line=await page.locator('#content [lang=en]').first().textContent();await page.locator('#study-search').fill(line);assert.equal(await page.locator('.lesson-row:visible').count(),0);await page.locator('#study-search').fill('');await page.locator('.study-options summary').click();
  await page.screenshot({path:`${root}/docs/images/html-desktop.png`});
  // 실제 브라우저 UI가 선택한 속도를 두 버전 모두 utterance에 전달하는지 확인한다.
  const speech=await context.newPage();await speech.addInitScript(()=>{
    window.spoken=[];window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    Object.defineProperty(window,'speechSynthesis',{value:{paused:false,getVoices:()=>[{name:'English',lang:'en-US',voiceURI:'test'}],addEventListener(){},removeEventListener(){},cancel(){},resume(){},speak(item){window.spoken.push({text:item.text,rate:item.rate,pitch:item.pitch});}},configurable:true});
  });
  await speech.goto('http://127.0.0.1:43879/');await speech.getByText('학습 설정',{exact:true}).click();await speech.getByLabel('재생 속도').fill('0.65');await speech.getByRole('button',{name:'재생',exact:true}).click();await speech.waitForFunction(()=>window.spoken.length>0);assert.equal(await speech.evaluate(()=>window.spoken[0].rate),.65);assert.equal(await speech.evaluate(()=>window.spoken[0].pitch),undefined);
  await speech.goto('http://127.0.0.1:43879/htmlVersion/conversation.html');await speech.locator('#lessons button').first().waitFor();await speech.locator('.study-options summary').click();await speech.locator('[data-setting=rate]').fill('0.75');await speech.locator('[data-setting=rate]').dispatchEvent('change');await speech.locator('#play').click();await speech.waitForFunction(()=>window.spoken.length>0);assert.equal(await speech.evaluate(()=>window.spoken[0].rate),.75);assert.equal(await speech.evaluate(()=>window.spoken[0].pitch),undefined);await speech.close();
  const microphone=await context.newPage();await microphone.addInitScript(()=>{class Recognition{start(){setTimeout(()=>{this.onerror?.({error:'not-allowed'});this.onend?.();},10);}abort(){this.onend?.();}}Object.defineProperty(window,'SpeechRecognition',{value:Recognition,configurable:true});});
  microphone.on('dialog',dialog=>dialog.accept());await microphone.goto('http://127.0.0.1:43879/');await microphone.getByRole('button',{name:'말해 보기',exact:true}).first().click();await microphone.getByText('음성 인식 실패 (not-allowed). 수동 연습을 계속할 수 있습니다.',{exact:true}).waitFor();await microphone.close();
  for (const [url,kind] of [['/','react'],['/htmlVersion/conversation.html','html']]) {
    await page.setViewportSize({width:390,height:844});await page.goto(`http://127.0.0.1:43879${url}`);await page.getByRole('heading',{name:'영어 대화 연습',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await removed();await page.screenshot({path:`${root}/docs/images/${kind}-mobile.png`});
  }
  // 기존 사용자의 캐싱 워커가 새 버전에서 등록 해제되는지 검증한다.
  for (const [url, script, scope, cache] of [['/', '/sw.js', '/', 'study-shell-v1'], ['/htmlVersion/conversation.html', '/htmlVersion/sw.js', '/htmlVersion/', 'html-study-shell-v1']]) {
    const legacyContext=await browser.newContext();const legacy=await legacyContext.newPage();
    await legacy.request.post('http://127.0.0.1:43879/__tests/legacy-worker',{data:{enabled:true}});
    await legacy.goto(`http://127.0.0.1:43879${url}`);
    await legacy.evaluate(async ({script,scope,cache})=>{await caches.open(cache);await navigator.serviceWorker.register(script,{scope});await navigator.serviceWorker.ready;},{script,scope,cache});
    await legacy.request.post('http://127.0.0.1:43879/__tests/legacy-worker',{data:{enabled:false}});await legacy.reload();
    await legacy.waitForFunction(async scope=>!(await navigator.serviceWorker.getRegistrations()).some(registration=>registration.scope===new URL(scope,location.href).href),scope);
    await legacy.waitForFunction(async key=>!(await caches.keys()).includes(key),cache,{timeout:10000});await legacyContext.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: 두 버전 제거 항목 부재·상단 테마/저장·제목 검색/대사 제외·선택 복원·가리기·속도 전달·마이크 거부·모바일 레이아웃·기존 캐싱 워커 해제');await context.close();
} finally {await browser.close();}
