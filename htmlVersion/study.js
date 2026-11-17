/* 서버 없이도 사용하는 공통 학습 설정과 보조 기능 */
(() => {
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value));return true; } catch {return false;} };
  const defaults = { rate: .95, pitch: 1, repeat: 1, hideEnglish: false, hideMeaning: false, role: '', a: -1, b: -1, wake: false, theme: 'dark', order: 'reverse' };
  const saved = read('html-settings-v1', {});
  const settings = { ...defaults, ...saved, role: '', a: -1, b: -1 };
  for (const [key, min, max] of [['rate',.5,1.5],['pitch',.5,1.5],['repeat',1,10]]) settings[key] = typeof settings[key] === 'number' && Number.isFinite(settings[key]) ? Math.max(min, Math.min(max, settings[key])) : defaults[key];
  const panel = document.createElement('details'); panel.className = 'study-options';
  panel.innerHTML = `<summary>학습 설정 · 검색 · 오프라인</summary><div class="options-grid">
  <label>속도 <input data-setting="rate" type="number" min="0.5" max="1.5" step="0.05"></label>
  <label>피치 <input data-setting="pitch" type="number" min="0.5" max="1.5" step="0.1"></label>
  <label>문장 반복 <input data-setting="repeat" type="number" min="1" max="10"></label>
  <label><input data-setting="hideEnglish" type="checkbox"> 영어 가리기</label><label><input data-setting="hideMeaning" type="checkbox"> 뜻 가리기</label>
  <label><input data-setting="wake" type="checkbox"> 재생 중 화면 유지</label>
  <label>테마 <select data-setting="theme"><option value="dark">어둡게</option><option value="light">밝게</option><option value="system">시스템</option></select></label>
  <label>재생 순서 <select data-setting="order"><option value="reverse">아래 → 위</option><option value="forward">위 → 아래</option></select></label>
  <label>내 역할 <select data-setting="role"><option value="">모두 읽기</option></select></label>
  <label>A 문장 <input data-setting="a" type="number" min="1"></label><label>B 문장 <input data-setting="b" type="number" min="1"></label><button data-clear>구간 해제</button>
  <label>검색 <input id="study-search" placeholder="제목·설명·대사"></label><label>태그 <select id="study-tag"><option value="">모든 태그</option></select></label>
  <label>난이도 <select id="study-level"><option value="">모든 난이도</option>${['A1','A2','B1','B2','C1','C2'].map(x => `<option>${x}</option>`).join('')}</select></label>
  <button data-next>다음 문장</button><button data-save>선택 자료 오프라인 저장·갱신</button><button data-delete>오프라인 자료·음성 삭제</button><button data-update>앱 업데이트 확인</button>
  <label>서버 음성 묶음 열기 <input data-audio type="file" accept=".json"></label><audio controls data-player></audio>
  <button data-audio-save>현재 음성 오프라인 저장</button><span data-offline-status role="status"></span><span data-selection></span></div>`;
  document.querySelector('.study-tabs').after(panel);
  let wake, acquiring = false, playing = false, recognizing;
  async function updateWake() {
    if (!settings.wake || !playing || document.visibilityState !== 'visible') { await wake?.release(); wake = null; return; }
    if (acquiring || wake && !wake.released) return;
    acquiring = true;
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); else status.textContent = '이 환경에서는 화면 유지를 지원하지 않습니다.'; }
    catch { status.textContent = '화면 유지 요청을 사용할 수 없습니다.'; } finally { acquiring = false; }
  }
  document.addEventListener('visibilitychange', updateWake);
  const status = panel.querySelector('[data-offline-status]');
  function theme() { document.documentElement.dataset.theme = settings.theme === 'system' ? matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' : settings.theme; }
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', theme);
  for (const input of panel.querySelectorAll('[data-setting]')) {
    const key = input.dataset.setting;
    if (input.type === 'checkbox') input.checked = settings[key]; else input.value = ['a','b'].includes(key) ? '' : settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.value === '' ? -1 : Math.min(Number(input.max) || Infinity, Math.max(Number(input.min), Number(input.value))) - (['a','b'].includes(key) ? 1 : 0) : input.value;
      if (key === 'repeat') settings.repeat = Math.round(settings.repeat);
      write('html-settings-v1', { ...settings, role: '', a: -1, b: -1 }); if(key==='rate')player.playbackRate=settings.rate; theme(); void updateWake(); window.dispatchEvent(new Event('study-settings'));
    });
  }
  theme();
  panel.querySelector('[data-clear]').onclick = () => { settings.a = settings.b = -1; panel.querySelector('[data-setting=a]').value = panel.querySelector('[data-setting=b]').value = ''; };
  const checks = new Set([].concat(read('html-selection-v1', [])).filter(x => typeof x === 'string'));
  const query = () => ({ text: panel.querySelector('#study-search').value.toLowerCase(), tag: panel.querySelector('#study-tag').value, level: panel.querySelector('#study-level').value });
  for (const input of panel.querySelectorAll('#study-search,#study-tag,#study-level')) input.addEventListener('input', () => window.dispatchEvent(new Event('study-filter')));
  const player = panel.querySelector('[data-player]');
  let bundle, handledTurn=-1, lastTime=0;
  function installBundle(data) {
    if (data?.version !== 1 || typeof data.audio !== 'string' || !data.audio.startsWith('data:audio/wav;base64,') || !Array.isArray(data.timeline)) throw new Error('음성 묶음 형식을 확인하세요.');
    bundle = data; handledTurn=-1;lastTime=0; player.src = data.audio; player.loop = !!data.loop; player.playbackRate = settings.rate;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: data.title });
      for (const [name, action] of [['play', () => player.play()], ['pause', () => player.pause()], ['previoustrack', () => seek(-1)], ['nexttrack', () => seek(1)]]) try { navigator.mediaSession.setActionHandler(name, action); } catch {}
    }
  }
  function seek(delta) { const i = bundle.timeline.findIndex(t => t.end > player.currentTime); player.currentTime = bundle.timeline[Math.max(0, Math.min(bundle.timeline.length - 1, i + delta))]?.start ?? 0; }
  panel.querySelector('[data-audio]').onchange = async event => { try { installBundle(JSON.parse(await event.target.files[0].text())); } catch (error) { status.textContent = error.message; } event.target.value = ''; };
  panel.querySelector('[data-audio-save]').onclick = async () => { try { if (!bundle) throw new Error('음성 묶음을 먼저 여세요.'); const db = await openDB(); const tx = db.transaction('audio','readwrite'); tx.objectStore('audio').put(bundle,'current'); tx.oncomplete = () => { status.textContent = '현재 음성을 오프라인 저장했습니다.'; db.close(); }; } catch (error) { status.textContent = error.message; } };
  function openDB() { return new Promise((resolve, reject) => { const req = indexedDB.open('study-html-v1',1); req.onupgradeneeded = () => req.result.createObjectStore('audio'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  openDB().then(db => { const tx = db.transaction('audio'); const req = tx.objectStore('audio').get('current'); req.onsuccess = () => { if (req.result) installBundle(req.result); }; tx.oncomplete = () => db.close(); }).catch(() => {});
  player.ontimeupdate=()=>{if(!bundle)return;if(player.currentTime<lastTime-.1)handledTurn=-1;lastTime=player.currentTime;const index=bundle.timeline.findIndex(item=>item.userTurn&&player.currentTime>=item.start&&player.currentTime<item.end);if(index>=0&&handledTurn!==index){handledTurn=index;player.pause();status.textContent='내 차례입니다. 말한 뒤 오디오 재생을 누르면 계속합니다.';}};
  player.onplay = () => {const turn=bundle?.timeline[handledTurn];if(turn?.userTurn&&player.currentTime>=turn.start&&player.currentTime<turn.end)player.currentTime=turn.end; window.speechSynthesis?.cancel(); window.dispatchEvent(new Event('study-audio-play')); playing = true; void updateWake(); };
  player.onpause = player.onended = () => { playing = false; void updateWake(); };
  panel.querySelector('[data-delete]').onclick = async () => { write('html-offline-v1', []); player.pause(); bundle = null; player.removeAttribute('src'); const db = await openDB(); db.transaction('audio','readwrite').objectStore('audio').clear(); status.textContent = '오프라인 자료와 음성을 삭제했습니다.'; };
  panel.querySelector('[data-update]').onclick = () => { navigator.serviceWorker?.getRegistration().then(r => r?.update()); status.textContent = '업데이트 확인을 요청했습니다. 새 버전은 창을 닫은 후 적용됩니다.'; };
  navigator.storage?.estimate().then(x => { status.textContent = `사용량 ${((x.usage || 0)/1048576).toFixed(1)} MB`; });
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
    play(value) { if(value) { player.pause(); recognizing?.abort(); } playing = value; void updateWake(); },
    resetRole(speakers, count) { settings.role = ''; const select = panel.querySelector('[data-setting=role]'); select.replaceChildren(new Option('모두 읽기',''),...speakers.map(s => new Option(s,s))); for(const key of ['a','b']) { settings[key] = -1; const input=panel.querySelector(`[data-setting=${key}]`); input.max=count; input.value=''; } },
    next(fn) { panel.querySelector('[data-next]').onclick = fn; },
    save(fn) { panel.querySelector('[data-save]').onclick = () => { const ok=fn(); status.textContent=ok?'선택 자료를 저장했습니다. 연결이 없으면 저장한 자료를 표시합니다.':'브라우저 저장소에 접근할 수 없거나 용량이 부족합니다.'; }; },
    tags(values) { const select=panel.querySelector('#study-tag'); select.replaceChildren(new Option('모든 태그',''),...values.map(s => new Option(s,s))); },
    selection(hidden) { panel.querySelector('[data-selection]').textContent = `선택 ${checks.size}개 · 필터로 숨김 ${hidden}개 · ${settings.order==='reverse'?'아래 → 위':'위 → 아래'}`; },
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
        pause();player.pause();recognizing?.abort();const rec=new Engine();recognizing=rec;rec.lang='en-US';rec.continuous=false;rec.interimResults=false;button.disabled=true;
        rec.onresult=e=>{if(recognizing===rec)result.textContent=`인식: ${e.results[0][0].transcript} · ${compare(text,e.results[0][0].transcript)}`;};
        rec.onerror=e=>{result.textContent=`음성 인식 실패 (${e.error}). 수동 연습을 계속하세요.`;};rec.onend=()=>{button.disabled=false;if(recognizing===rec)recognizing=null;};
        try{rec.start();}catch{button.disabled=false;result.textContent='마이크를 시작할 수 없습니다.';}
      };
    }
  };
  if('serviceWorker' in navigator && window.isSecureContext && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js');
})();
