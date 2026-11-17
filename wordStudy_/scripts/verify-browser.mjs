const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const root=fileURLToPath(new URL('../../',import.meta.url));await mkdir(`${root}/docs/images`,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function exercise(url,kind,list,barSelector) {
    await page.goto(`http://127.0.0.1:43879${url}`);await page.locator(list).first().waitFor();
    assert.equal(await page.getByText(/말해 보기|탭하여 보기|관리·로그인|모든 난이도/).count(),0);
    assert.equal(await page.locator('[aria-label="자료 검색"],[aria-label="난이도 필터"],[aria-label="대화 선택"],#study-search,#study-level,a[href="/administration"]').count(),0);
    const check=page.locator(list).first();await check.check();await page.reload();await page.locator(list).first().waitFor();assert.equal(await page.locator(list).first().isChecked(),true);
    const bar=page.locator(barSelector),trigger=bar.getByRole('button',{name:'학습 설정',exact:true}),order=bar.getByLabel('연속 재생 방향');
    const bounds=await order.boundingBox(),next=await bar.getByRole('button',{name:'다음 문장',exact:true}).boundingBox();assert.ok(bounds.x>next.x&&Math.abs(bounds.y-next.y)<6);
    await order.selectOption('forward');await page.reload();await page.locator(list).first().waitFor();assert.equal(await bar.getByLabel('연속 재생 방향').inputValue(),'forward');
    await trigger.click();const dialog=page.getByRole('dialog',{name:'학습 설정',exact:true});await dialog.waitFor();
    await dialog.getByLabel('영어 가리기',{exact:true}).check();await dialog.getByLabel('해석 가리기',{exact:true}).check();await dialog.getByLabel('재생 속도').fill('0.7');
    if(kind==='html')await dialog.getByLabel('재생 속도').dispatchEvent('change');
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await dialog.isVisible(),false);
    const english=await page.getByRole('button',{name:'영어 보기',exact:true}).count(),meaning=await page.getByRole('button',{name:'해석 보기',exact:true}).count();assert.ok(english>0&&meaning>0);
    await page.getByRole('button',{name:'영어 보기',exact:true}).first().click();assert.equal(await page.getByRole('button',{name:'영어 보기',exact:true}).count(),english-1);assert.equal(await page.getByRole('button',{name:'해석 보기',exact:true}).count(),meaning);
    await page.getByRole('button',{name:'해석 보기',exact:true}).first().click();assert.equal(await page.getByRole('button',{name:'해석 보기',exact:true}).count(),meaning-1);
    await trigger.click();await dialog.getByLabel('영어 가리기',{exact:true}).uncheck();await dialog.getByLabel('해석 가리기',{exact:true}).uncheck();await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
    const button=await trigger.boundingBox(),container=await bar.boundingBox();assert.ok(container.x+container.width-(button.x+button.width)<35);
    await page.screenshot({path:`${root}/docs/images/${kind}-desktop.png`});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const mobileOrder=await order.boundingBox(),mobileNext=await bar.getByRole('button',{name:'다음 문장',exact:true}).boundingBox();assert.ok(mobileOrder.x>mobileNext.x&&Math.abs(mobileOrder.y-mobileNext.y)<6);
    await trigger.click();await dialog.waitFor();assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    await page.screenshot({path:`${root}/docs/images/${kind}-mobile.png`});await page.setViewportSize({width:1440,height:1000});
  }
  await exercise('/','react','nav[aria-label="대화 목록"] input','section[aria-label="음성 제어"]');
  assert.equal(await page.locator('input[type=file]').count(),0);
  // 로그인된 관리자여도 공개 화면에는 가져오기 UI가 없어야 한다.
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,user:{sub:'fixture-admin',admin:true,csrf:'fixture'}}}));
  await page.route('**/api/config',route=>route.fulfill({json:{canImport:true}}));await page.reload();await page.locator('nav[aria-label="대화 목록"] input').first().waitFor();assert.equal(await page.locator('input[type=file]').count(),0);
  await page.goto('http://127.0.0.1:43879/administration');await page.getByText('자료 관리',{exact:true}).waitFor();await page.locator('input[type=file]').first().waitFor({state:'attached'});assert.equal(await page.locator('input[type=file]').count(),2);
  await page.unroute('**/api/auth/session');await page.unroute('**/api/config');
  await exercise('/htmlVersion/conversation.html','html','#lessons input','.player');
  // 두 버전에서 설정 팝업의 속도가 실제 utterance에 전달된다.
  const speech=await context.newPage();await speech.addInitScript(()=>{
    window.spoken=[];window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    Object.defineProperty(window,'speechSynthesis',{value:{paused:false,getVoices:()=>[{name:'English',lang:'en-US',voiceURI:'test'}],addEventListener(){},removeEventListener(){},cancel(){},resume(){},speak(item){window.spoken.push({text:item.text,rate:item.rate});}},configurable:true});
  });
  for(const [url,play] of [['/','section[aria-label="음성 제어"] button'],['/htmlVersion/conversation.html','#play']]){
    await speech.goto(`http://127.0.0.1:43879${url}`);await speech.getByRole('button',{name:'학습 설정',exact:true}).first().click();const dialog=speech.getByRole('dialog',{name:'학습 설정'});await dialog.getByLabel('재생 속도').fill('0.65');await dialog.getByLabel('재생 속도').dispatchEvent('change');await dialog.getByRole('button',{name:'닫기',exact:true}).click();await speech.locator(play).first().click();await speech.waitForFunction(()=>window.spoken.length>0);assert.equal(await speech.evaluate(()=>window.spoken[0].rate),.65);
  }
  await speech.close();
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
  assert.deepEqual(errors,[]);console.log('PASS: 중복 선택·관리 링크·검색/난이도·음성 인식 제거, 재생 바 순서/설정 위치, 팝업·Escape·포커스 복원, 영어/해석 보기, 관리자 경로 제한, 속도·모바일·워커 해제');await context.close();
} finally {await browser.close();}
