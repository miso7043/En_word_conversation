import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('study-settings-v1',JSON.stringify({readDescription:false}));
    window.spoken=[];window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
    Object.defineProperty(window,'speechSynthesis',{value:{paused:false,getVoices:()=>[{name:'English',lang:'en-US',voiceURI:'test'}],addEventListener(){},removeEventListener(){},cancel(){},resume(){},speak(item){window.spoken.push(item);item.onstart?.();}}});
  });
  let user=null, events=[], changes=[];
  const lesson={id:'admin-test.json',title:'Admin visibility',description:[],date:null,position:0,studyCount:17,memorized:true,
    conversations:[{title:'대화',description:[],lines:[{speaker:'A',text:'First.'},{speaker:'B',text:'Last.'}]}]};
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,user}}));
  await page.route('**/api/lessons',route=>route.fulfill({json:[lesson]}));
  await page.route('**/api/study-completions',route=>{events.push(route.request().postDataJSON());assert.equal(route.request().headers()['x-csrf-token'],'fixture');return route.fulfill({json:{studyCount:18}});});
  await page.route('**/api/memorized',route=>{changes.push(route.request().postDataJSON());return route.fulfill({json:{memorized:false}});});
  for(const identity of [null,{sub:'member',admin:false,csrf:'fixture'},{sub:'admin',admin:true,csrf:'fixture'}]) {
    user=identity;events=[];changes=[];
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:43879');
    const bar=page.getByRole('region',{name:'음성 제어',exact:true});
    await bar.getByRole('button',{name:'재생',exact:true}).waitFor();
    const admin=!!identity?.admin;
    assert.equal(await page.getByText('학습 17회',{exact:true}).count(),admin?1:0);
    assert.equal(await page.getByRole('checkbox',{name:'Admin visibility Memorized',exact:true}).count(),admin?1:0);
    assert.equal(await page.getByRole('separator',{name:'Memorized',exact:true}).count(),admin?1:0);
    await bar.getByRole('button',{name:'재생',exact:true}).click();
    await page.waitForFunction(()=>window.spoken.length===1);
    await page.evaluate(()=>window.spoken[0].onend());
    await page.waitForFunction(()=>window.spoken.length===2);
    await page.evaluate(()=>window.spoken[1].onend());
    await bar.getByRole('button',{name:'재생',exact:true}).waitFor();
    if(admin) {
      await page.getByText('학습 18회',{exact:true}).waitFor();
      assert.equal(events.length,1);
      await page.getByRole('checkbox',{name:'Admin visibility Memorized',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('aside input[aria-label="Admin visibility Memorized"]').checked);
      assert.equal(changes.length,1);
    } else {
      assert.equal(events.length,0,'일반 완주 기록 요청 없음');assert.equal(changes.length,0);
    }
    await page.getByRole('button',{name:'문장읽기',exact:true}).click();
    assert.equal(await page.locator('.desktop-lessons').count(),0);
    const layout=await page.locator('.study-layout').boundingBox();
    const reader=await page.getByRole('main',{name:'영어 문장 읽기',exact:true}).boundingBox();
    assert.ok(Math.abs(layout.width-reader.width)<2);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: 익명/일반 학습 횟수·암기 UI/구분선 숨김·완주 기록 요청 없음, 관리자 표시/기록/암기 변경, 문장읽기 전체 너비');
} finally {await browser.close();}
