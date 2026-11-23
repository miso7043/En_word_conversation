import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      paused: false, getVoices: () => [{ name: 'English', lang: 'en-US', voiceURI: 'test' }],
      addEventListener() {}, removeEventListener() {}, cancel() {}, resume() {},
      speak(item) { window.spoken.push(item); item.onstart?.(); },
    } });
  });
  let count = 1;
  const events = [];
  const lesson = { id: 'study.json', title: 'Study count', date: null, description: [], position: 0, studyCount: 1,
    conversations: [{ description: [], lines: [{ speaker: 'A', text: 'First.' }, { speaker: 'B', text: 'Last.' }] }] };
  await page.route('**/api/auth/session', route => route.fulfill({ json: { enabled:true, user:{ sub:'fixture-admin', admin:true, csrf:'fixture' } } }));
  await page.route('**/api/lessons', route => route.fulfill({ json: [{ ...lesson, studyCount: count }] }));
  await page.route('**/api/study-completions', route => {
    events.push(route.request().postDataJSON());
    return route.fulfill({ json: { studyCount: ++count } });
  });
  await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:43879');
  await page.getByText('학습 1회', { exact: true }).waitFor();
  const bar = page.locator('section[aria-label="음성 제어"]');
  async function finishSpeech(expectedLength) {
    await page.waitForFunction(length => window.spoken.length === length, expectedLength);
    await page.evaluate(() => window.spoken.at(-1).onend());
  }
  await bar.getByLabel('반복 재생', { exact: true }).check();
  await bar.getByRole('button', { name: '재생', exact: true }).click();
  await finishSpeech(1);
  assert.equal(events.length, 0);
  await finishSpeech(2);
  await page.getByText('학습 2회', { exact: true }).waitFor();
  await finishSpeech(3);
  await bar.getByLabel('반복 재생', { exact: true }).uncheck();
  await finishSpeech(4);
  await page.getByText('학습 3회', { exact: true }).waitFor();
  assert.equal(events.length, 2);
  assert.notEqual(events[0].eventId, events[1].eventId);
  assert.equal(events[0].id, lesson.id);
  await page.reload();
  await page.getByText('학습 3회', { exact: true }).waitFor();
  const title = await page.locator('#lesson-title').boundingBox();
  const counter = await page.getByText('학습 3회', { exact: true }).boundingBox();
  assert.ok(counter.x > title.x + title.width);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/wordstudy-study-count-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: 모바일 제목 오른쪽 학습 횟수·완주 자동 저장·반복마다 집계·반복 해제·새로고침 후 DB 응답 표시');
} finally {
  await browser.close();
}
