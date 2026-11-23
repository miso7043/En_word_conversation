import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome', headless:true, args:['--no-sandbox'] });
const base = process.env.BASE_URL ?? 'http://127.0.0.1:43879';
try {
  const page = await browser.newPage();
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('study-settings-v1')) localStorage.setItem('study-settings-v1',JSON.stringify({rate:1.1,theme:'dark'}));
    window.spoken=[];
    window.SpeechSynthesisUtterance=class { constructor(text) { this.text=text; } };
    Object.defineProperty(window,'speechSynthesis',{value:{paused:false,
      getVoices:()=>[{name:'English',lang:'en-US',voiceURI:'english'},{name:'한국어',lang:'ko-KR',voiceURI:'korean'}],
      addEventListener(){},removeEventListener(){},cancel(){},resume(){},
      speak(item){ window.spoken.push(item); item.onstart?.(); },
    }});
  });
  const lesson={id:'desktop-check.json',title:'Desktop playback',description:['한국어 단어 설명입니다.','설명을 읽은 다음 영어 대화를 시작합니다.'],date:null,position:0,
    conversations:[{title:'긴 대화',description:[],lines:Array.from({length:40},(_,i)=>({speaker:i%2?'B':'A',text:`Sentence ${i+1}: keep the last sentence visible above the player.`,meaning:`${i+1}번째 문장입니다.`}))}]};
  await page.route('**/api/lessons',route=>route.fulfill({json:[lesson]}));
  for(const width of [768,1024,1440]) {
    await page.setViewportSize({width,height:844});
    await page.goto(base);
    await page.locator('#lesson-title').waitFor();
    const bar=page.getByRole('region',{name:'음성 제어',exact:true});
    const initial=await bar.boundingBox();
    const content=await page.locator('.study-layout > .min-w-0').boundingBox();
    assert.ok(Math.abs(initial.x-content.x)<2 && Math.abs(initial.width-content.width)<2,`본문 너비의 하단 패널 ${width}`);
    assert.ok(Math.abs(initial.y+initial.height-844)<2,`하단 고정 ${width}`);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const after=await bar.boundingBox();
    assert.ok(Math.abs(after.y-initial.y)<1,`스크롤 중 고정 ${width}`);
    const last=await page.locator('#line-39').boundingBox();
    assert.ok(last.y>=0 && last.y+last.height<after.y,`마지막 문장 가림 없음 ${width}`);
    const contentBefore=await page.locator('.lesson-content').boundingBox();
    await page.getByRole('button',{name:'목록 접기',exact:true}).click();
    assert.equal(await page.getByRole('navigation',{name:'대화 목록',exact:true}).count(),0);
    assert.ok((await page.locator('.desktop-lessons').boundingBox()).width<=65);
    assert.ok((await page.locator('.lesson-content').boundingBox()).width-contentBefore.width>=250);
    await page.reload();
    await page.getByRole('button',{name:'목록 펼치기',exact:true}).waitFor();
    await page.getByRole('button',{name:'목록 펼치기',exact:true}).click();
    await page.getByRole('navigation',{name:'대화 목록',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  const bar=page.getByRole('region',{name:'음성 제어',exact:true});
  await bar.getByRole('button',{name:'학습 설정',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'학습 설정',exact:true});
  assert.equal(await settings.getByLabel('한국어 설명 읽기',{exact:true}).isChecked(),true,'기존 설정에도 기본 켬');
  await page.keyboard.press('Escape');
  await bar.getByRole('button',{name:'재생',exact:true}).click();
  await page.waitForFunction(()=>window.spoken.length===1);
  assert.deepEqual(await page.evaluate(()=>({text:window.spoken[0].text,lang:window.spoken[0].lang,voice:window.spoken[0].voice.lang,rate:window.spoken[0].rate})),{text:lesson.description.join('\n\n'),lang:'ko-KR',voice:'ko-KR',rate:1.1});
  await bar.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.evaluate(()=>window.spoken[0].onend());
  assert.equal(await page.evaluate(()=>window.spoken.length),1);
  await bar.getByRole('button',{name:'이어 듣기',exact:true}).click();
  await page.waitForFunction(()=>window.spoken.length===2);
  await page.evaluate(()=>window.spoken[1].onend());
  await page.waitForFunction(()=>window.spoken.length===3);
  assert.equal(await page.evaluate(()=>window.spoken[2].lang),'en-US');
  await bar.getByRole('button',{name:'정지',exact:true}).click();
  await bar.getByRole('button',{name:'학습 설정',exact:true}).click();
  await settings.getByLabel('한국어 설명 읽기',{exact:true}).uncheck();
  await settings.getByRole('status').filter({hasText:'한국어 설명 읽기 끔'}).waitFor();
  await page.keyboard.press('Escape');
  await page.reload();
  await bar.getByRole('button',{name:'재생',exact:true}).click();
  await page.waitForFunction(()=>window.spoken.length===1);
  assert.equal(await page.evaluate(()=>window.spoken[0].lang),'en-US','설정 해제 저장');
  await bar.getByRole('button',{name:'정지',exact:true}).click();
  await page.locator('#line-39 > button').click();
  await page.waitForFunction(()=>window.spoken.at(-1).text.startsWith('Sentence 40:'));
  await page.waitForFunction(()=>{ const last=document.getElementById('line-39').getBoundingClientRect();const bar=document.querySelector('.playback-panel').getBoundingClientRect();return last.top>=0&&last.bottom<bar.top; });
  await page.screenshot({path:'/tmp/wordstudy-desktop-fixed-last-line.png'});
  await page.getByRole('button',{name:'목록 접기',exact:true}).click();
  await page.screenshot({path:'/tmp/wordstudy-desktop-collapsed.png'});
  await page.unroute('**/api/lessons');
  await page.goto(base);
  await page.locator('[id^="line-"]').last().waitFor();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const actualLast=await page.locator('[id^="line-"]').last().boundingBox();
  assert.ok(actualLast.y>=0 && actualLast.y+actualLast.height<(await bar.boundingBox()).y,'실제 자료의 마지막 문장 노출');
  await page.getByRole('button',{name:'문장읽기',exact:true}).click();
  assert.equal(await page.locator('.desktop-lessons').count(),0);
  const reader=await page.getByRole('main',{name:'영어 문장 읽기',exact:true}).boundingBox();
  const layout=await page.locator('.study-layout').boundingBox();
  assert.ok(Math.abs(reader.width-layout.width)<2,'문장읽기 전체 너비');
  const readerBar=await page.getByRole('region',{name:'문장 읽기 제어',exact:true}).boundingBox();
  assert.ok(Math.abs(readerBar.width-layout.width)<2,'문장읽기 하단 패널 전체 너비');
  await page.getByRole('button',{name:'대화연습',exact:true}).click();
  assert.equal(await page.locator('.desktop-lessons').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: 768/1024/1440 본문 하단 전체 너비 고정·문장읽기 사이드바 제거·스크롤/재생 중 마지막 문장 노출·목록 접기/펼치기/저장·한국어 설명 기본값/음성/순서/일시정지/설정 저장');
} finally { await browser.close(); }
