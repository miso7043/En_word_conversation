/* 브라우저 음성 합성을 사용하는 학습 설정과 보조 기능 */
(() => {
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const defaults = { rate: .95, repeat: 1, hideEnglish: false, hideMeaning: false, role: '', wake: false, theme: 'dark', order: 'reverse' };
  const saved = read('html-settings-v1', {});
  const settings = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof saved?.[key] === typeof value ? saved[key] : value]));
  settings.role = '';
  for (const [key, min, max] of [['rate', .5, 1.5], ['repeat', 1, 10]]) settings[key] = Number.isFinite(settings[key]) ? Math.max(min, Math.min(max, settings[key])) : defaults[key];
  settings.repeat = Math.round(settings.repeat);
  const panel = document.createElement('dialog'); panel.className = 'study-options'; panel.setAttribute('aria-labelledby', 'settings-title');
  panel.innerHTML = `<div class="settings-heading"><h2 id="settings-title">학습 설정</h2><form method="dialog"><button autofocus>닫기</button></form></div><div class="options-grid">
  <label>속도 <input aria-label="재생 속도" data-setting="rate" type="number" min="0.5" max="1.5" step="0.05"></label>
  <label data-dialogue-only>문장 반복 <input data-setting="repeat" type="number" min="1" max="10"></label>
  <label data-dialogue-only><input data-setting="hideEnglish" type="checkbox"> 영어 가리기</label><label data-dialogue-only><input data-setting="hideMeaning" type="checkbox"> 해석 가리기</label>
  <label><input data-setting="wake" type="checkbox"> 재생 중 화면 유지</label>
  <label data-dialogue-only>내 역할 <select data-setting="role"><option value="">모두 읽기</option></select></label>
  <span data-study-status role="status"></span></div>`;
  document.body.append(panel);
  function settingsButton(controls) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'settings-trigger'; button.textContent = '학습 설정'; button.setAttribute('aria-haspopup', 'dialog');
    button.onclick = () => { const reader = document.getElementById('dialogue-panel').hidden; panel.querySelectorAll('[data-dialogue-only]').forEach(item => item.hidden = reader); panel.showModal(); };
    controls.append(button);
  }
  const controls = document.querySelector('#play').parentElement;
  const pair = document.createElement('div'); pair.className = 'play-order';
  pair.innerHTML = `<button type="button" data-next>다음 문장</button><select aria-label="연속 재생 방향" data-setting="order"><option value="reverse">아래 → 위</option><option value="forward">위 → 아래</option></select>`;
  controls.append(pair); settingsButton(controls);
  document.addEventListener('DOMContentLoaded', () => settingsButton(document.querySelector('#reader-play').parentElement));
  panel.addEventListener('click', event => { if (event.target !== panel) return; const bounds = panel.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) panel.close(); });
  let wake, acquiring = false, playing = false;
  const status = panel.querySelector('[data-study-status]');
  async function updateWake() {
    if (!settings.wake || !playing || document.visibilityState !== 'visible') { await wake?.release(); wake = null; return; }
    if (acquiring || wake && !wake.released) return;
    acquiring = true;
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); else status.textContent = '이 환경에서는 화면 유지를 지원하지 않습니다.'; }
    catch { status.textContent = '화면 유지 요청을 사용할 수 없습니다.'; } finally { acquiring = false; }
  }
  document.addEventListener('visibilitychange', updateWake);
  function theme() { document.documentElement.dataset.theme = settings.theme === 'system' ? matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' : settings.theme; }
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', theme);
  for (const input of document.querySelectorAll('[data-setting]')) {
    const key = input.dataset.setting;
    if (input.type === 'checkbox') input.checked = settings[key]; else input.value = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value))) : input.value;
      if (key === 'repeat') settings.repeat = Math.round(settings.repeat);
      write('html-settings-v1', { ...settings, role: '' }); theme(); void updateWake(); window.dispatchEvent(new Event('study-settings'));
    });
  }
  theme();
  const checks = new Set([].concat(read('html-selection-v1', [])).filter(x => typeof x === 'string'));
  window.study = {
    settings, read, write, checks,
    play(value) { playing = value; void updateWake(); },
    resetRole(speakers) { settings.role = ''; const select = panel.querySelector('[data-setting=role]'); select.replaceChildren(new Option('모두 읽기', ''), ...speakers.map(s => new Option(s, s))); },
    next(fn) { document.querySelector('[data-next]').onclick = fn; },
    selection() { document.querySelector('#selection-count').textContent = `선택 ${checks.size}개`; },
    text(parent, text, hide, phrases, label) {
      const render = () => {
        parent.replaceChildren(); const values = [].concat(phrases||[]).filter(x => typeof x === 'string' && x).sort((a,b)=>b.length-a.length);
        const regex = values.length ? new RegExp(`(${values.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`,'gi') : null;
        for(const part of regex ? text.split(regex) : [text]) { if(values.some(v=>v.toLowerCase()===part.toLowerCase())) { const mark=document.createElement('mark');mark.textContent=part;parent.append(mark); } else parent.append(document.createTextNode(part)); }
      };
      if(hide) { const button=document.createElement('button');button.textContent=label;button.onclick=render;parent.append(button); } else render();
    },
  };
  // 이전 버전의 캐싱 서비스 워커만 갱신하여 등록 해제를 진행한다.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.getRegistration('./').then(registration => {
      if (registration?.scope === new URL('./', location.href).href) return registration.update();
    }).catch(() => {});
  }
})();
