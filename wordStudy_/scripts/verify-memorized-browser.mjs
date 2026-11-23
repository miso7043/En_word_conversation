import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const lessons = ['New', 'Middle', 'Old'].map((title, index) => ({
    id: `${title}.json`, title, date: `2026-11-${22-index}T00:00:00Z`, position: 0,
    description: [], memorized: index === 1,
    conversations: [{ title: '대화', description: [], lines: [{ speaker: 'A', text: 'Hello.' }] }],
  }));
  let fail = false;
  await page.route('**/api/auth/session', route => route.fulfill({ json: { enabled:true, user:{ sub:'fixture-admin', admin:true, csrf:'fixture' } } }));
  await page.route('**/api/lessons', route => route.fulfill({ json: lessons }));
  await page.route('**/api/memorized', async route => {
    if (fail) return route.fulfill({ status: 500, json: { message: 'test' } });
    const { id, memorized } = route.request().postDataJSON();
    lessons.find(item => item.id === id).memorized = memorized;
    await route.fulfill({ json: { memorized } });
  });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:43871');
  await page.getByRole('button', { name: '자료 선택', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '대화 목록', exact: true });
  const titles = () => nav.locator('button').evaluateAll(items => items.map(item => item.firstChild.textContent.trim()));
  await nav.getByLabel('New Memorized', { exact: true }).waitFor();
  assert.deepEqual(await titles(), ['New', 'Old', 'Middle']);
  assert.equal(await nav.getByRole('separator', { name: 'Memorized' }).count(), 1);
  await nav.getByLabel('New Memorized', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('nav[aria-label="대화 목록"] button')?.textContent.trim().startsWith('Old'));
  assert.deepEqual(await titles(), ['Old', 'New', 'Middle']);
  await page.reload();
  await page.getByRole('button', { name: '자료 선택', exact: true }).click();
  await nav.getByLabel('New Memorized', { exact: true }).waitFor();
  assert.equal(await nav.getByLabel('New Memorized', { exact: true }).isChecked(), true);
  await nav.getByLabel('New Memorized', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('nav[aria-label="대화 목록"] button')?.textContent.trim().startsWith('New'));
  fail = true;
  await nav.getByLabel('Old Memorized', { exact: true }).click();
  await page.getByRole('dialog', { name: '자료 선택', exact: true }).getByText('암기 상태를 저장하지 못했습니다. 서버 연결을 확인하세요.').waitFor();
  assert.equal(await nav.getByLabel('Old Memorized', { exact: true }).isChecked(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('PASS: 암기 영역 정렬·구분선·체크/해제 이동·새로고침 유지·저장 실패 복원·모바일 너비');
} finally { await browser.close(); }
