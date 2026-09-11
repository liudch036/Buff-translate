const $ = (id) => document.getElementById(id);

const LANGS = {
  auto: '自动检测',
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ru: 'Русский'
};
const TARGET_LANGS = { ...LANGS, auto: '自动（中英互译）' };

/* ---------- 标签页切换 ---------- */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
  });
});

function setStatus(el, text, kind = 'info') {
  el.textContent = text;
  el.className = 'status ' + kind;
}

/* ---------- 语言下拉 ---------- */
function fillLangSelects() {
  for (const [v, name] of Object.entries(LANGS)) {
    $('sourceLang').add(new Option(name, v));
  }
  for (const [v, name] of Object.entries(TARGET_LANGS)) {
    $('targetLang').add(new Option(name, v));
  }
}
fillLangSelects();

/* ---------- 配置读写 ---------- */
function loadConfig() {
  chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'sourceLang', 'targetLang'], (cfg) => {
    $('apiKey').value = cfg.apiKey || '';
    $('baseUrl').value = cfg.baseUrl || '';
    $('model').value = cfg.model || '';
    $('sourceLang').value = cfg.sourceLang || 'auto';
    $('targetLang').value = cfg.targetLang || 'auto';
  });
}
loadConfig();

$('btnSaveApi').addEventListener('click', () => {
  chrome.storage.sync.set({
    apiKey: $('apiKey').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
    model: $('model').value.trim()
  }, () => setStatus($('apiStatus'), '接口设置已保存 ✓', 'ok'));
});

$('btnSaveLang').addEventListener('click', () => {
  chrome.storage.sync.set({
    sourceLang: $('sourceLang').value,
    targetLang: $('targetLang').value
  }, () => setStatus($('langStatus'), '语言设置已保存 ✓', 'ok'));
});

$('btnTest').addEventListener('click', () => {
  const payload = {
    apiKey: $('apiKey').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
    model: $('model').value.trim()
  };
  if (!payload.apiKey || !payload.baseUrl || !payload.model) {
    return setStatus($('apiStatus'), '请先填写 API Key、Base URL 和模型', 'err');
  }
  setStatus($('apiStatus'), '正在测试连接…');
  $('btnTest').disabled = true;
  chrome.runtime.sendMessage({ type: 'ai-request', action: 'test', payload }, (resp) => {
    $('btnTest').disabled = false;
    if (chrome.runtime.lastError) return setStatus($('apiStatus'), '错误: ' + chrome.runtime.lastError.message, 'err');
    if (resp?.ok) setStatus($('apiStatus'), '连接成功 ✓ 模型响应: ' + (resp.data?.reply ?? resp.data), 'ok');
    else setStatus($('apiStatus'), '连接失败: ' + (resp?.error || '未知错误'), 'err');
  });
});

/* ---------- 历史记录 ---------- */
let historyCache = [];

function renderHistory() {
  const q = $('historySearch').value.trim().toLowerCase();
  const list = q
    ? historyCache.filter(h => (h.source + h.result).toLowerCase().includes(q))
    : historyCache;
  const box = $('historyList');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty">暂无历史记录</div>';
    return;
  }
  for (const h of list) {
    const item = document.createElement('div');
    item.className = 'history-item';
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = h.kind || '翻译';
    const time = document.createElement('span');
    time.textContent = new Date(h.time).toLocaleString('zh-CN');
    const tokens = document.createElement('span');
    tokens.textContent = h.tokens ? h.tokens + ' tokens' : '';
    meta.append(badge, time, tokens);
    const src = document.createElement('div');
    src.className = 'history-src';
    src.textContent = h.source;
    const dst = document.createElement('div');
    dst.className = 'history-dst';
    dst.textContent = h.result;
    item.append(meta, src, dst);
    box.appendChild(item);
  }
}

function loadHistory() {
  chrome.storage.local.get('history', (data) => {
    historyCache = Array.isArray(data.history) ? data.history : [];
    renderHistory();
  });
}
loadHistory();
$('historySearch').addEventListener('input', renderHistory);
$('btnClearHistory').addEventListener('click', () => {
  chrome.storage.local.set({ history: [] }, () => {
    historyCache = [];
    renderHistory();
  });
});

/* ---------- Token 统计 ---------- */
function fmt(n) { return (n || 0).toLocaleString('en-US'); }

function renderStats() {
  chrome.storage.local.get('tokenStats', (data) => {
    const s = data.tokenStats || { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, byDay: {} };
    $('statRequests').textContent = fmt(s.requests);
    $('statPrompt').textContent = fmt(s.promptTokens);
    $('statCompletion').textContent = fmt(s.completionTokens);
    $('statTotal').textContent = fmt(s.totalTokens);

    const tbody = $('dayTableBody');
    tbody.innerHTML = '';
    const days = Object.keys(s.byDay).sort().reverse().slice(0, 14);
    if (!days.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="color:#9ca3af">暂无数据</td></tr>';
      return;
    }
    for (const day of days) {
      const d = s.byDay[day];
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = day;
      const td2 = document.createElement('td'); td2.textContent = fmt(d.requests);
      const td3 = document.createElement('td'); td3.textContent = fmt(d.totalTokens);
      tr.append(td1, td2, td3);
      tbody.appendChild(tr);
    }
  });
}
renderStats();

$('btnResetStats').addEventListener('click', () => {
  chrome.storage.local.remove('tokenStats', renderStats);
});

// 切到对应标签时刷新数据
document.querySelector('[data-tab="history"]').addEventListener('click', loadHistory);
document.querySelector('[data-tab="stats"]').addEventListener('click', renderStats);
