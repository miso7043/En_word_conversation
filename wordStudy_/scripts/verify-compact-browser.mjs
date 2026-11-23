import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const base = process.env.BASE_URL ?? 'http://127.0.0.1:43879';
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.spoken = []; window.pauses = 0; window.resumes = 0;
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      paused: false, getVoices: () => [{ name: 'English', lang: 'en-US', voiceURI: 'test' }],
      addEventListener() {}, removeEventListener() {}, cancel() {},
      pause() { window.pauses++; }, resume() { window.resumes++; },
      speak(item) { window.spoken.push(item); item.onstart?.(); },
    } });
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);
    const bar = page.getByRole('region', { name: '음성 제어', exact: true });
    await bar.getByRole('button', { name: '재생', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `가로 넘침 ${width}`);
    const controls = bar.locator('.playback-row > button, .repeat-toggle, .study-settings-trigger > button');
    assert.equal(await controls.count(), 6);
    const boxes = await controls.evaluateAll(items => items.map(item => { const b = item.getBoundingClientRect(); return { x:b.x, y:b.y, right:b.right, width:b.width }; }));
    assert.equal(new Set(boxes.map(b => Math.round(b.y))).size, 1, `한 줄 배치 ${width}`);
    assert.ok(boxes.every(b => b.width >= 44 && b.x >= 0 && b.right <= width), `터치 영역 ${width}`);
    assert.ok((await bar.boundingBox()).height <= 64, `패널 높이 ${width}`);
    assert.equal((await bar.innerText()).includes('선택'), false);
    assert.equal(await bar.locator('.playback-row > button, .study-settings-trigger > button').evaluateAll(items => items.every(item => !item.textContent.trim() && item.getAttribute('aria-label'))), true);
    if (width < 768) {
      assert.equal(await page.getByRole('navigation', { name: '대화 목록', exact: true }).count(), 0);
      assert.ok((await page.locator('#lesson-title').boundingBox()).y < 125);
      const header = page.locator('.study-header');
      assert.ok((await header.boundingBox()).height <= 64);
      assert.equal(await header.locator('button').evaluateAll(items => items.every(item => item.getBoundingClientRect().top === items[0].getBoundingClientRect().top)), true);
    }
  }
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(base);
  const bar = page.getByRole('region', { name:'음성 제어', exact:true });
  await bar.getByLabel('반복 재생', { exact:true }).check();
  await page.getByRole('status').filter({ hasText:'반복 재생 켬' }).waitFor();
  await bar.getByLabel('반복 재생', { exact:true }).uncheck();
  await page.getByRole('status').filter({ hasText:'반복 재생 끔' }).waitFor();
  await bar.getByRole('button', { name:/연속 재생 방향/ }).click();
  const direction = await bar.getByRole('button', { name:/연속 재생 방향/ }).getAttribute('aria-label');
  await page.reload();
  await bar.getByRole('button', { name:direction, exact:true }).waitFor();
  await page.getByRole('button', { name:'밝게', exact:true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.getByRole('button', { name:'어둡게', exact:true }).click();
  await page.getByRole('button', { name:'자료 선택', exact:true }).click();
  const picker = page.getByRole('dialog', { name:'자료 선택', exact:true });
  await picker.waitFor();
  const check = picker.getByRole('checkbox', { name:/연속 재생 선택/ }).first();
  await check.check();
  await picker.getByRole('status').filter({ hasText:'재생할 자료 1개 선택' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await picker.isVisible(), false);
  await page.getByRole('button', { name:'자료 선택', exact:true }).click();
  assert.equal(await check.isChecked(), true);
  await picker.getByRole('navigation', { name:'대화 목록', exact:true }).getByRole('button').first().click();
  assert.equal(await picker.isVisible(), false);
  await bar.getByRole('button', { name:'학습 설정', exact:true }).click();
  const settings = page.getByRole('dialog', { name:'학습 설정', exact:true });
  await settings.getByLabel('영어 가리기', { exact:true }).check();
  await settings.getByRole('status').filter({ hasText:'영어 가리기 켬' }).waitFor();
  await settings.getByLabel('영어 가리기', { exact:true }).uncheck();
  await page.keyboard.press('Escape');
  await page.screenshot({ path:'/tmp/wordstudy-compact-mobile.png' });
  await page.getByRole('button', { name:'문장읽기', exact:true }).click();
  await page.getByLabel('영어 문장', { exact:true }).fill('A compact sentence reader.');
  const reader = page.getByRole('region', { name:'문장 읽기 제어', exact:true });
  await reader.getByRole('button', { name:'재생', exact:true }).click();
  await reader.getByRole('button', { name:'일시정지', exact:true }).click();
  await reader.getByRole('button', { name:'이어 듣기', exact:true }).click();
  assert.equal(await page.evaluate(() => window.pauses), 1);
  assert.equal(await page.evaluate(() => window.resumes), 1);
  await reader.getByRole('button', { name:'정지', exact:true }).click();
  await page.getByRole('button', { name:'대화연습', exact:true }).click();
  await page.setViewportSize({ width:1440, height:1000 });
  await page.screenshot({ path:'/tmp/wordstudy-compact-desktop.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: 320/390/768/1440 한 줄 아이콘·44px 터치·모바일 콘텐츠 확대·선택 팝업·방향 저장·토스트·테마·설정·문장 읽기 일시정지');
} finally { await browser.close(); }
