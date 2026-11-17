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
  const panel = document.createElement('details'); panel.className = 'study-options';
  panel.innerHTML = `<summary>학습 설정 · 검색</summary><div class="options-grid">
  <label>속도 <input data-setting="rate" type="number" min="0.5" max="1.5" step="0.05"></label>
  <label>문장 반복 <input data-setting="repeat" type="number" min="1" max="10"></label>
  <label><input data-setting="hideEnglish" type="checkbox"> 영어 가리기</label><label><input data-setting="hideMeaning" type="checkbox"> 뜻 가리기</label>
  <label><input data-setting="wake" type="checkbox"> 재생 중 화면 유지</label>
  <label>재생 순서 <select data-setting="order"><option value="reverse">아래 → 위</option><option value="forward">위 → 아래</option></select></label>
  <label>내 역할 <select data-setting="role"><option value="">모두 읽기</option></select></label>
  <label>제목·설명 검색 <input id="study-search" placeholder="제목·설명 검색"></label>
  <label>난이도 <select id="study-level"><option value="">모든 난이도</option>${['A1','A2','B1','B2','C1','C2'].map(x => `<option>${x}</option>`).join('')}</select></label>
  <button data-next>다음 문장</button><span data-study-status role="status"></span><span data-selection></span></div>`;
  document.querySelector('.study-tabs').after(panel);
  let wake, acquiring = false, playing = false, recognizing;
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
  const query = () => ({ text: panel.querySelector('#study-search').value.toLowerCase(), level: panel.querySelector('#study-level').value });
  for (const input of panel.querySelectorAll('#study-search,#study-level')) input.addEventListener('input', () => window.dispatchEvent(new Event('study-filter')));
  function compare(expected, actual) {
    const split = s => s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu,' ').split(/\s+/).filter(Boolean), a = split(expected), b = split(actual);
    const dp = Array.from({length:a.length+1},() => Array(b.length+1).fill(0));
    for (let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) dp[i][j] = a[i]===b[j] ? 1+dp[i+1][j+1] : Math.max(dp[i+1][j],dp[i][j+1]);
    let i=0,j=0;const missing=[],added=[];
    while(i<a.length||j<b.length) { if(i<a.length&&j<b.length&&a[i]===b[j]){i++;j++;} else if(j<b.length&&(i===a.length||dp[i][j+1]>=dp[i+1][j]))added.push(b[j++]);else missing.push(a[i++]); }
    return `인식 문장 일치율 ${Math.round(100*dp[0][0]/Math.max(1,a.length,b.length))}% · 누락: ${missing.join(', ')||'없음'} · 추가: ${added.join(', ')||'없음'}`;
  }
  window.study = {
    settings, read, write, checks, query,
    play(value) { if (value) recognizing?.abort(); playing = value; void updateWake(); },
    resetRole(speakers) { settings.role = ''; const select = panel.querySelector('[data-setting=role]'); select.replaceChildren(new Option('모두 읽기', ''), ...speakers.map(s => new Option(s, s))); },
    next(fn) { panel.querySelector('[data-next]').onclick = fn; },
    selection(hidden) { panel.querySelector('[data-selection]').textContent = `선택 ${checks.size}개 · 필터로 숨김 ${hidden}개 · ${settings.order === 'reverse' ? '아래 → 위' : '위 → 아래'}`; },
    text(parent, text, hide, phrases) {
      const render = () => {
        parent.replaceChildren(); const values = [].concat(phrases||[]).filter(x => typeof x === 'string' && x).sort((a,b)=>b.length-a.length);
        const regex = values.length ? new RegExp(`(${values.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`,'gi') : null;
        for(const part of regex ? text.split(regex) : [text]) { if(values.some(v=>v.toLowerCase()===part.toLowerCase())) { const mark=document.createElement('mark');mark.textContent=part;parent.append(mark); } else parent.append(document.createTextNode(part)); }
      };
      if(hide) { const button=document.createElement('button');button.textContent='탭하여 보기';button.onclick=render;parent.append(button); } else render();
    },
    shadow(parent,text,pause) {
      const Engine=window.SpeechRecognition||window.webkitSpeechRecognition, button=document.createElement('button'), result=document.createElement('span');
      button.textContent='말해 보기';button.disabled=!Engine; parent.append(document.createElement('br'),button,result);
      if(!Engine)result.textContent='음성 인식 미지원';
      button.onclick=()=>{
        if(!confirm('음성 인식은 외부 서버에서 처리될 수 있으며 인터넷이 필요할 수 있습니다. 시작할까요?'))return;
        pause();recognizing?.abort();const rec=new Engine();recognizing=rec;rec.lang='en-US';rec.continuous=false;rec.interimResults=false;button.disabled=true;
        rec.onresult=e=>{if(recognizing===rec)result.textContent=`인식: ${e.results[0][0].transcript} · ${compare(text,e.results[0][0].transcript)}`;};
        rec.onerror=e=>{result.textContent=`음성 인식 실패 (${e.error}). 수동 연습을 계속하세요.`;};rec.onend=()=>{button.disabled=false;if(recognizing===rec)recognizing=null;};
        try{rec.start();}catch{button.disabled=false;result.textContent='마이크를 시작할 수 없습니다.';}
      };
    }
  };
  // 이전 버전의 캐싱 서비스 워커만 갱신하여 등록 해제를 진행한다.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.getRegistration('./').then(registration => {
      if (registration?.scope === new URL('./', location.href).href) return registration.update();
    }).catch(() => {});
  }
})();
