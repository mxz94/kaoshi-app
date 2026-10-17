// app.js —— 行测刷题App 前端（原生 SPA，5 屏流程串接真实 API）
const $screen = document.getElementById('screen');
const $tabbar = document.getElementById('tabbar');
const MODULES = ['言语理解', '判断推理', '资料分析', '数量关系', '常识'];

const state = {
  view: 'home',
  banks: [],
  stats: null,
  currentBank: null,
  questions: [],
  index: 0,
  selected: [],
  startTime: 0,
  timer: null,
  lastResult: null,
  addBankCats: [],
  addBankEntry: 'manual',
  addQType: 'single',
};

/* ---------- 工具 ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const apiGet = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(await r.text()); return r.json(); };
const apiPost = async (u, b) => {
  const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800);
}
function setTabbar(v) { $tabbar.style.display = v ? 'flex' : 'none'; }
function setActiveTab(name) {
  document.querySelectorAll('#tabbar .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
}
/* ---------- 身份 ---------- */
function getIdentity() {
  try {
    const raw = localStorage.getItem('kaoshi_identity') || sessionStorage.getItem('kaoshi_identity');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function backIcon() {
  return '<svg class="back" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1A1D26" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
}
function clockIcon() {
  return '<span class="timer"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1A1D26" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span id="practice-timer">00:00</span></span>';
}

/* ---------- 首页 ---------- */
async function renderHome() {
  state.view = 'home'; setTabbar(true); setActiveTab('home');
  const me = getIdentity();
  let banks = [], stats = { count: 0, accuracy: 0, streak: 0 };
  try { [banks, stats] = await Promise.all([apiGet('/api/banks'), apiGet('/api/stats/today')]); } catch (e) { toast('加载失败'); }
  state.banks = banks; state.stats = stats;

  const continueBank = banks.slice().sort((a, b) => b.doneCount - a.doneCount)[0];
  const hero = continueBank
    ? `<div class="hero" data-bank="${continueBank.id}">
         <div class="hero-top"><span class="tag">继续练习</span><span class="prog">${continueBank.doneCount} / ${continueBank.totalQuestions}</span></div>
         <div class="hero-title">${esc(continueBank.name)}</div>
         <div class="track"><i style="width:${Math.min(100, Math.round(continueBank.doneCount / continueBank.totalQuestions * 100))}%"></i></div>
         <button class="btn-primary" data-bank="${continueBank.id}">继续刷题 →</button>
       </div>`
    : `<div class="hero" data-add="1">
         <div class="hero-top"><span class="tag">开始</span></div>
         <div class="hero-title">还没有题库，先建一个吧</div>
         <button class="btn-primary" data-add="1">＋ 新建题库</button>
       </div>`;

  const statsRow = `<div class="stats-row">
    <div class="stat-card"><div class="l">今日刷题</div><div class="v">${stats.count}</div></div>
    <div class="stat-card"><div class="l">平均正确率</div><div class="v">${stats.accuracy}%</div></div>
    <div class="stat-card"><div class="l">连续打卡</div><div class="v">${stats.streak} 天</div></div>
  </div>`;

  const bankCards = banks.map((b) => {
    const rate = b.accuracy > 0 ? `<span class="bank-rate">正确率 ${b.accuracy}%</span>` : `<span class="bank-rate" style="color:var(--text3)">未开始</span>`;
    const cats = b.categories.length ? ' · ' + b.categories.join('/') : '';
    return `<div class="bank-card" data-bank="${b.id}">
      <div class="bank-top"><span class="bank-name">${esc(b.name)}</span>${rate}</div>
      <div class="bank-meta">${b.totalQuestions} 题 · 已做 ${b.doneCount}${cats}</div>
    </div>`;
  }).join('');

  $screen.innerHTML = `
    <div class="home-header"><div class="greet">晚上好${me ? '，' + esc(me.nickname) : ''}</div><div class="sub">9月29日 周二 · 今日目标 50 题</div></div>
    ${hero}
    ${statsRow}
    <div class="section-title"><span class="t">我的题库</span><span class="add" data-add="1">＋ 新建题库</span></div>
    ${bankCards || '<div style="color:var(--text3);font-size:13px;text-align:center;padding:24px 0">暂无题库</div>'}`;

  $screen.querySelectorAll('[data-bank]').forEach((el) =>
    el.addEventListener('click', () => startPractice(Number(el.dataset.bank))));
  $screen.querySelectorAll('[data-add]').forEach((el) =>
    el.addEventListener('click', renderAddBank));
}

/* ---------- 开始刷题 ---------- */
async function startPractice(bankId) {
  const bank = state.banks.find((b) => b.id === bankId) || (await apiGet('/api/banks')).find((b) => b.id === bankId);
  if (!bank) return;
  state.currentBank = bank;
  let questions = [];
  try { questions = await apiGet(`/api/banks/${bankId}/questions`); } catch (e) { toast('题目加载失败'); return; }
  if (!questions.length) { toast('该题库还没有题目，先去录入'); renderAddQuestion(bankId); return; }
  state.questions = questions; state.index = 0; state.selected = [];
  renderPractice();
}

/* ---------- 刷题页 ---------- */
function renderPractice() {
  state.view = 'practice'; setTabbar(false); setActiveTab('practice');
  const q = state.questions[state.index];
  const total = state.questions.length;
  const typeLabel = { single: '单选题', multiple: '多选题', judge: '判断题' }[q.type];
  const opts = q.options.map((o) =>
    `<div class="opt" data-label="${o.label}"><div class="badge">${o.label}</div><div class="txt">${esc(o.content)}</div></div>`).join('');

  $screen.innerHTML = `
    <div class="topnav">${backIcon()}<span class="title">${esc(state.currentBank.name)}</span>
      <div class="right"><span class="prog-txt">${state.index + 1} / ${total}</span>${clockIcon()}</div></div>
    <div class="q-progress"><i style="width:${Math.round((state.index) / total * 100)}%"></i></div>
    <div class="stem-block"><span class="type-chip">${typeLabel}</span><div class="stem">${esc(q.stem)}</div></div>
    ${opts}
    <button class="btn-primary" id="confirm" disabled>确认答案</button>`;

  // 返回
  $screen.querySelector('.back').addEventListener('click', renderHome);
  // 选项点击
  $screen.querySelectorAll('.opt').forEach((el) => {
    el.addEventListener('click', () => {
      const label = el.dataset.label;
      if (q.type === 'multiple') {
        const i = state.selected.indexOf(label);
        if (i >= 0) state.selected.splice(i, 1); else state.selected.push(label);
        el.classList.toggle('selected', state.selected.includes(label));
      } else {
        state.selected = [label];
        $screen.querySelectorAll('.opt').forEach((o) => o.classList.toggle('selected', o === el));
      }
      document.getElementById('confirm').disabled = state.selected.length === 0;
    });
  });
  // 确认
  document.getElementById('confirm').addEventListener('click', submitAnswer);
  startTimer();
}

function startTimer() {
  state.startTime = Date.now();
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const el = document.getElementById('practice-timer'); if (!el) return;
    const s = Math.floor((Date.now() - state.startTime) / 1000);
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}

async function submitAnswer() {
  clearInterval(state.timer);
  const q = state.questions[state.index];
  let res;
  try {
    res = await apiPost('/api/practice/answer', {
      bankId: state.currentBank.id, questionId: q.id, selected: state.selected,
      duration: Math.floor((Date.now() - state.startTime) / 1000),
    });
  } catch (e) { toast('提交失败'); return; }
  state.lastResult = res;
  renderResult(q, res);
}

/* ---------- 答题结果页 ---------- */
function renderResult(q, res) {
  state.view = 'result'; setTabbar(false); setActiveTab('practice');
  const total = state.questions.length;
  const opts = q.options.map((o) => {
    let cls = 'opt locked';
    if (o.isCorrect) cls += ' correct';
    else if (state.selected.includes(o.label) && !o.isCorrect) cls += ' wrong';
    return `<div class="${cls}"><div class="badge">${o.label}</div><div class="txt">${esc(o.content)}</div></div>`;
  }).join('');

  $screen.innerHTML = `
    <div class="topnav">${backIcon()}<span class="title">${esc(state.currentBank.name)}</span>
      <div class="right"><span class="prog-txt">${state.index + 1} / ${total}</span>${clockIcon()}</div></div>
    <div class="q-progress"><i style="width:${Math.round((state.index + 1) / total * 100)}%"></i></div>
    <div class="stem-block"><span class="type-chip">${ { single: '单选题', multiple: '多选题', judge: '判断题' }[q.type] }</span><div class="stem">${esc(q.stem)}</div></div>
    ${opts}
    <div class="feedback ${res.isCorrect ? 'ok' : ''}"><span class="f-txt">${res.isCorrect ? '回答正确' : '回答错误 · 正确答案 ' + res.correctLabels.join('')}</span></div>
    <div class="explain"><div class="lbl">解析</div><div class="txt">${esc(res.analysis || '（暂无解析）')}</div></div>
    <div class="result-btns">
      ${res.isCorrect ? '' : '<button class="btn-ghost" id="wrong">加入错题本</button>'}
      <button class="btn-primary" id="next">${state.index + 1 < total ? '下一题 →' : '完成 ✓'}</button>
    </div>`;

  $screen.querySelector('.back').addEventListener('click', renderHome);
  const wrongBtn = document.getElementById('wrong');
  if (wrongBtn) wrongBtn.addEventListener('click', async () => {
    await apiPost('/api/wrong', { bankId: state.currentBank.id, questionId: q.id });
    wrongBtn.textContent = '已加入错题本'; wrongBtn.disabled = true;
  });
  document.getElementById('next').addEventListener('click', () => {
    if (state.index + 1 < total) { state.index++; state.selected = []; renderPractice(); }
    else { toast('本题库已刷完'); renderHome(); }
  });
}

/* ---------- 新建题库 ---------- */
function renderAddBank() {
  state.view = 'addbank'; setTabbar(false); setActiveTab('home');
  state.addBankCats = []; state.addBankEntry = 'manual';
  const chips = MODULES.map((m) => `<button class="chip" data-cat="${m}">${m}</button>`).join('');
  const entryManual = `<div class="entry-card on" data-entry="manual">
      <div class="entry-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2F6BFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></div>
      <div class="entry-text"><div class="ti">手动录入</div><div class="de">一题题自己添加，灵活可控</div></div>
      <div class="entry-check"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
    </div>`;
  const entryFile = `<div class="entry-card" data-entry="file">
      <div class="entry-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5"/><path d="M12 4v12"/></svg></div>
      <div class="entry-text"><div class="ti">文件导入</div><div class="de">从 PDF / Excel / Word 批量导入</div></div>
      <div class="entry-check"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
    </div>`;

  $screen.innerHTML = `
    <div class="topnav">${backIcon()}<span class="title" style="text-align:center">新建题库</span><span style="width:24px"></span></div>
    <div class="field"><label class="field-label">题库名称</label><input class="input" id="bank-name" placeholder="如：2024 国考行测真题" /></div>
    <div class="field"><label class="field-label">分类（可多选）</label><div class="chips" id="cat-chips">${chips}</div></div>
    <div class="field"><label class="field-label">录入方式</label>${entryManual}${entryFile}</div>
    <button class="btn-primary" id="create">创建并继续</button>`;

  $screen.querySelector('.back').addEventListener('click', renderHome);
  $screen.querySelectorAll('#cat-chips .chip').forEach((el) =>
    el.addEventListener('click', () => {
      const c = el.dataset.cat;
      el.classList.toggle('on');
      if (el.classList.contains('on')) state.addBankCats.push(c);
      else state.addBankCats = state.addBankCats.filter((x) => x !== c);
    }));
  $screen.querySelectorAll('.entry-card').forEach((el) =>
    el.addEventListener('click', () => {
      $screen.querySelectorAll('.entry-card').forEach((e) => e.classList.remove('on'));
      el.classList.add('on'); state.addBankEntry = el.dataset.entry;
    }));
  document.getElementById('create').addEventListener('click', async () => {
    const name = document.getElementById('bank-name').value.trim();
    if (!name) { toast('请填写题库名称'); return; }
    const r = await apiPost('/api/banks', { name, categories: state.addBankCats });
    toast(state.addBankEntry === 'file' ? '文件导入流程规划中，先手动录入' : '已创建，去录入题目');
    renderAddQuestion(r.id);
  });
}

/* ---------- 手动录入题目 ---------- */
function renderAddQuestion(bankId, keepType) {
  state.view = 'addquestion'; setTabbar(false); setActiveTab('home');
  const bank = state.banks.find((b) => b.id === bankId) || state.currentBank;
  if (!keepType) state.addQType = 'single';
  const seg = `<div class="segmented" id="seg">
      <button class="seg on" data-type="single">单选</button>
      <button class="seg" data-type="multiple">多选</button>
      <button class="seg" data-type="judge">判断</button>
    </div>`;

  $screen.innerHTML = `
    <div class="topnav">${backIcon()}<span class="title" style="text-align:center">添加题目</span><span style="width:24px"></span></div>
    <div class="field"><label class="field-label">所属题库</label><div class="select"><span class="v">${esc(bank ? bank.name : '未知题库')}</span></div></div>
    <div class="field"><label class="field-label">题型</label>${seg}</div>
    <div class="field"><label class="field-label">题干</label><textarea class="input" id="stem" placeholder="输入题干内容，支持换行…"></textarea></div>
    <div class="field"><label class="field-label">选项与正确答案（点击右侧圆圈标记答案）</label><div id="opt-list"></div></div>
    <div class="save-row">
      <button class="btn-primary" id="save">保存并继续添加</button>
      <button class="btn-ghost" id="done">完成</button>
    </div>`;

  $screen.querySelector('.back').addEventListener('click', renderHome);
  $screen.querySelectorAll('#seg .seg').forEach((el) =>
    el.addEventListener('click', () => {
      $screen.querySelectorAll('#seg .seg').forEach((s) => s.classList.remove('on'));
      el.classList.add('on'); state.addQType = el.dataset.type; renderOptList();
    }));
  renderOptList();

  document.getElementById('save').addEventListener('click', () => saveQuestion(bankId, true));
  document.getElementById('done').addEventListener('click', () => saveQuestion(bankId, false));
}

// 根据题型渲染选项行
function renderOptList() {
  const list = document.getElementById('opt-list');
  const multi = state.addQType === 'multiple';
  let rows;
  if (state.addQType === 'judge') {
    rows = [
      { label: 'A', content: '正确', correct: true },
      { label: 'B', content: '错误', correct: false },
    ];
  } else {
    rows = ['A', 'B', 'C', 'D'].map((l) => ({ label: l, content: '', correct: false }));
  }
  list._rows = rows;
  list.innerHTML = rows.map((r) =>
    `<div class="opt-row" data-label="${r.label}">
       <div class="badge">${r.label}</div>
       <input class="input" placeholder="选项 ${r.label} 内容" value="${esc(r.content)}" ${state.addQType === 'judge' ? 'readonly' : ''} />
       <div class="mark ${multi ? 'multi' : ''}" data-label="${r.label}"></div>
     </div>`).join('');

  list.querySelectorAll('.opt-row').forEach((rowEl) => {
    const label = rowEl.dataset.label;
    const input = rowEl.querySelector('input');
    const mark = rowEl.querySelector('.mark');
    input.addEventListener('input', () => { list._rows.find((r) => r.label === label).content = input.value; });
    mark.addEventListener('click', () => {
      if (multi) {
        const r = list._rows.find((x) => x.label === label); r.correct = !r.correct;
        mark.classList.toggle('on', r.correct);
      } else {
        list._rows.forEach((r) => (r.correct = r.label === label));
        list.querySelectorAll('.mark').forEach((m) => m.classList.toggle('on', m.dataset.label === label));
      }
    });
  });
}

async function saveQuestion(bankId, keepOpen) {
  const stem = document.getElementById('stem').value.trim();
  if (!stem) { toast('请填写题干'); return; }
  const options = (document.getElementById('opt-list')._rows || []).map((r) => ({
    label: r.label, content: r.content, isCorrect: !!r.correct,
  }));
  if (!options.some((o) => o.isCorrect)) { toast('请标记正确答案'); return; }
  try {
    await apiPost(`/api/banks/${bankId}/questions`, { type: state.addQType, stem, analysis: '', options });
    toast('已保存');
    if (keepOpen) {
      document.getElementById('stem').value = '';
      state.addQType = 'single'; renderAddQuestion(bankId, true);
    } else { renderHome(); }
  } catch (e) { toast('保存失败：' + e.message); }
}

/* ---------- 统计页 ---------- */
let statsPeriod = 'month';
const PERIOD_LABEL = { week: '本周', month: '本月', all: '全部' };
const WK = ['日', '一', '二', '三', '四', '五', '六'];
function heatColor(c) { return c <= 0 ? '#EBEEF0' : c <= 2 ? '#9BE9A8' : c <= 5 ? '#40C463' : c <= 9 ? '#30A14E' : '#216E39'; }
function modColor(a) { return a >= 80 ? 'var(--success)' : a >= 60 ? 'var(--primary)' : 'var(--danger)'; }

async function renderStats() {
  state.view = 'stats'; setTabbar(true); setActiveTab('stats');
  let data = null;
  try { data = await apiGet('/api/stats/overview?period=' + statsPeriod); } catch (e) { toast('加载失败'); }
  if (!data) { renderHome(); return; }
  const { today, modules, last7, heatmap, wrongCount } = data;

  const ovCards = `
    <div class="ov-cards">
      <div class="ov-card"><div class="l">今日练习</div><div class="v">${today.count}</div></div>
      <div class="ov-card good"><div class="l">正确率</div><div class="v">${today.accuracy}%</div></div>
      <div class="ov-card gold"><div class="l">连续打卡</div><div class="v">${today.streak} 天</div></div>
    </div>`;

  const validMods = modules.filter((m) => m.count > 0);
  const avg = validMods.length ? Math.round(validMods.reduce((s, m) => s + m.accuracy, 0) / validMods.length) : 0;
  const modRows = validMods.length ? validMods.map((m) => {
    const c = modColor(m.accuracy);
    return `<div class="mod-row"><div class="name">${esc(m.name)}</div><div class="bar"><i style="width:${m.accuracy}%;background:${c}"></i></div><div class="pct" style="color:${c}">${m.accuracy}%</div></div>`;
  }).join('') : '<div style="font-size:13px;color:var(--text3)">还没有练习数据，先去刷题吧</div>';

  const maxC = Math.max(1, ...last7.map((x) => x.count));
  const weekChart = last7.map((x) => {
    const d = new Date(x.date + 'T00:00:00');
    const h = x.count > 0 ? Math.max(8, Math.round(x.count / maxC * 96)) : 4;
    return `<div class="week-bar"><div class="col" style="height:${h}px"></div><div class="wk">${WK[d.getDay()]}</div></div>`;
  }).join('');

  const heatCells = heatmap.map((x) => `<i style="background:${heatColor(x.count)}"></i>`).join('');

  let insight = '';
  if (validMods.length) {
    const weak = validMods.slice().sort((a, b) => a.accuracy - b.accuracy)[0];
    const strong = validMods.slice().sort((a, b) => b.accuracy - a.accuracy)[0];
    const gap = Math.max(0, avg - weak.accuracy);
    insight = `<div class="insight-card">
      <div class="ic-title">本周建议</div>
      <div class="ic-line">${esc(weak.name)} 正确率 ${weak.accuracy}%，低于平均 ${gap} 个百分点，是重点提升项。</div>
      <div class="ic-line">${esc(strong.name)} ${strong.accuracy}% 是强项，保持节奏即可。</div>
      <div class="ic-act" id="insight-act">每天加练 10 题 ›</div>
    </div>`;
  }

  $screen.innerHTML = `
    <div class="stats-header"><div class="h-title">统计</div><div class="month-pill" id="month-pill">${PERIOD_LABEL[statsPeriod]} ▾</div></div>
    ${ovCards}
    <div class="section-card"><div class="sc-title">模块正确率</div>${modRows}</div>
    <div class="section-card"><div class="sc-title">最近 7 天练习</div><div class="week-chart">${weekChart}</div></div>
    <div class="section-card"><div class="sc-title">练习热力图</div>
      <div class="heatmap">${heatCells}</div>
      <div class="heat-legend"><span>少</span><i class="sw" style="background:#EBEEF0"></i><i class="sw" style="background:#9BE9A8"></i><i class="sw" style="background:#40C463"></i><i class="sw" style="background:#30A14E"></i><i class="sw" style="background:#216E39"></i><span>多</span></div>
    </div>
    ${insight}
    <div class="section-card wrong-entry" id="wrong-entry">
      <div class="ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="10" y1="9" x2="14" y2="9"/><line x1="10" y1="13" x2="14" y2="13"/></svg></div>
      <div class="txt"><div class="t">错题本</div><div class="s">${wrongCount} 题待复习</div></div>
      <div class="ar">›</div>
    </div>`;

  const pill = document.getElementById('month-pill');
  if (pill) pill.addEventListener('click', () => {
    statsPeriod = statsPeriod === 'month' ? 'week' : statsPeriod === 'week' ? 'all' : 'month';
    renderStats();
  });
  const act = document.getElementById('insight-act');
  if (act) act.addEventListener('click', () => toast('加练计划生成中（规划）'));
  const we = document.getElementById('wrong-entry');
  if (we) we.addEventListener('click', () => toast('错题本列表规划中'));
}

/* ---------- 我的页面 ---------- */
async function renderMe() {
  state.view = 'me'; setTabbar(true); setActiveTab('me');
  const me = getIdentity();
  let arena = null;
  if (me) {
    try { const r = await apiGet('/api/arena/player/' + encodeURIComponent(me.nickname)); arena = r.found ? r.player : null; } catch (e) {}
  }
  const games = arena ? arena.games : null;
  const wins = arena ? arena.wins : null;
  const winRate = (games && games > 0) ? Math.round(wins / games * 100) + '%' : '—';
  const score = arena ? arena.total_score : '—';
  const nick = me ? me.nickname : '未登录';
  const initial = (nick && nick[0]) || '考';

  $screen.innerHTML = `
    <div class="profile-card">
      <div class="avatar">${esc(initial)}</div>
      <div class="p-info"><div class="p-name">${esc(nick)}</div><div class="p-sub">ID: ${me && me.id ? esc(me.id) : '—'} · 编辑资料</div></div>
    </div>
    <div class="arena-cards">
      <div class="ac"><div class="v">${games != null ? games : '—'}</div><div class="l">场次</div></div>
      <div class="ac good"><div class="v">${winRate}</div><div class="l">胜率</div></div>
      <div class="ac gold"><div class="v">${score}</div><div class="l">积分</div></div>
    </div>
    <div class="menu-card">
      <div class="menu-row" id="m-wrong"><div class="mic red"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><div class="mt">错题本</div><div class="ar">›</div></div>
      <div class="menu-row" id="m-bank"><div class="mic blue"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2F6BFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><div class="mt">我的题库</div><div class="ar">›</div></div>
      <div class="menu-row" id="m-set"><div class="mic gray"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></div><div class="mt">设置</div><div class="ar">›</div></div>
    </div>
    <div class="logout-card"><button class="lo" id="logout">退出登录</button></div>`;

  const w = document.getElementById('m-wrong'); if (w) w.addEventListener('click', () => toast('错题本列表规划中'));
  const b = document.getElementById('m-bank'); if (b) b.addEventListener('click', renderHome);
  const s = document.getElementById('m-set'); if (s) s.addEventListener('click', () => toast('设置页规划中'));
  const lo = document.getElementById('logout'); if (lo) lo.addEventListener('click', () => {
    localStorage.removeItem('kaoshi_identity'); sessionStorage.removeItem('kaoshi_identity');
    location.replace('login.html');
  });
}

/* ---------- 底部导航 ---------- */
document.querySelectorAll('#tabbar .tab').forEach((b) =>
  b.addEventListener('click', () => {
    const t = b.dataset.tab;
    if (t === 'home') renderHome();
    else if (t === 'practice') {
      const b0 = state.banks.slice().sort((a, c) => c.doneCount - a.doneCount)[0];
      if (b0) startPractice(b0.id); else toast('还没有题库');
    } else if (t === 'stats') renderStats();
    else if (t === 'me') renderMe();
    else toast('该模块规划中');
  }));

/* ---------- 启动 ---------- */
if (getIdentity()) renderHome();
else location.replace('login.html');   // 未登录 → 登录页（登录页即身份入口）
