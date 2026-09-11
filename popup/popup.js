const $ = (id) => document.getElementById(id);

function setStatus(text, kind = 'info') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + kind;
}

// 载入已保存配置
chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'targetLang'], (cfg) => {
  $('apiKey').value = cfg.apiKey || '';
  $('baseUrl').value = cfg.baseUrl || '';
  $('model').value = cfg.model || '';
  $('targetLang').value = cfg.targetLang || 'auto';
});

$('btnSave').addEventListener('click', () => {
  const cfg = {
    apiKey: $('apiKey').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
    model: $('model').value.trim(),
    targetLang: $('targetLang').value
  };
  chrome.storage.sync.set(cfg, () => setStatus('设置已保存 ✓', 'ok'));
});

$('btnTest').addEventListener('click', () => {
  const payload = {
    apiKey: $('apiKey').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
    model: $('model').value.trim()
  };
  if (!payload.apiKey || !payload.baseUrl || !payload.model) {
    return setStatus('请先填写 API Key、Base URL 和模型', 'err');
  }
  setStatus('正在测试连接…');
  $('btnTest').disabled = true;
  chrome.runtime.sendMessage({ type: 'ai-request', action: 'test', payload }, (resp) => {
    $('btnTest').disabled = false;
    if (chrome.runtime.lastError) return setStatus('错误: ' + chrome.runtime.lastError.message, 'err');
    if (resp?.ok) setStatus('连接成功 ✓ 模型响应: ' + (resp.data?.reply ?? resp.data), 'ok');
    else setStatus('连接失败: ' + (resp?.error || '未知错误'), 'err');
  });
});

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('未找到当前标签页');
  if (/^(chrome|edge|about|chrome-extension):/.test(tab.url || '')) {
    throw new Error('浏览器内置页面不支持此功能');
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

function bindAction(btnId, message, busyText) {
  $(btnId).addEventListener('click', async () => {
    const btn = $(btnId);
    btn.disabled = true;
    setStatus(busyText);
    try {
      const resp = await sendToActiveTab(message);
      if (resp?.ok) setStatus(resp.message || '完成 ✓', 'ok');
      else setStatus(resp?.error || '操作失败', 'err');
    } catch (e) {
      setStatus(e.message || String(e), 'err');
    } finally {
      btn.disabled = false;
    }
  });
}

$('btnOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

bindAction('btnTranslatePage', { type: 'page-action', action: 'translate-page' }, '正在翻译整页，请稍候…');
bindAction('btnSummarize', { type: 'page-action', action: 'summarize' }, '正在总结本页，请稍候…');
bindAction('btnRestore', { type: 'page-action', action: 'restore' }, '正在恢复…');
