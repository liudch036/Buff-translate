import { translateTexts, summarizePage, testConnection } from './lib/api.js';

const HISTORY_KEY = 'history';
const STATS_KEY = 'tokenStats';
const HISTORY_LIMIT = 200;

async function getConfig() {
  const cfg = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'sourceLang', 'targetLang']);
  return {
    apiKey: cfg.apiKey || '',
    baseUrl: cfg.baseUrl || '',
    model: cfg.model || '',
    sourceLang: cfg.sourceLang || 'auto',
    targetLang: cfg.targetLang || 'auto'
  };
}

async function recordUsage(usage) {
  if (!usage) return;
  const { [STATS_KEY]: stats } = await chrome.storage.local.get(STATS_KEY);
  const s = stats || { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, byDay: {} };
  const day = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD 本地时区
  s.requests += 1;
  s.promptTokens += usage.promptTokens;
  s.completionTokens += usage.completionTokens;
  s.totalTokens += usage.totalTokens;
  const d = s.byDay[day] || { requests: 0, totalTokens: 0 };
  d.requests += 1;
  d.totalTokens += usage.totalTokens;
  s.byDay[day] = d;
  await chrome.storage.local.set({ [STATS_KEY]: s });
}

async function addHistory(entry) {
  const { [HISTORY_KEY]: h } = await chrome.storage.local.get(HISTORY_KEY);
  const list = Array.isArray(h) ? h : [];
  list.unshift({
    id: Date.now() + Math.random().toString(36).slice(2, 7),
    time: new Date().toISOString(),
    ...entry
  });
  if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
  await chrome.storage.local.set({ [HISTORY_KEY]: list });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'ai-request') return false;

  (async () => {
    try {
      const cfg = await getConfig();
      const full = { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model };
      let result;
      switch (msg.action) {
        case 'translate': {
          const r = await translateTexts(full, msg.payload.texts, {
            sourceLang: cfg.sourceLang,
            targetLang: cfg.targetLang
          });
          await recordUsage(r.usage);
          // 整页翻译批次多，不写入历史（只统计 token），划词翻译写入历史
          if (msg.payload.kind !== 'page') {
            await addHistory({
              kind: '划词翻译',
              source: msg.payload.texts.join('\n').slice(0, 500),
              result: r.translations.join('\n').slice(0, 500),
              tokens: r.usage?.totalTokens || 0
            });
          }
          result = r.translations;
          break;
        }
        case 'summarize': {
          const r = await summarizePage(full, msg.payload.text, { targetLang: cfg.targetLang });
          await recordUsage(r.usage);
          await addHistory({
            kind: '网页总结',
            source: msg.payload.text.slice(0, 300),
            result: r.summary.slice(0, 800),
            tokens: r.usage?.totalTokens || 0
          });
          result = r.summary;
          break;
        }
        case 'test':
          // 测试连接使用传入的表单值，而不是已保存值
          result = await testConnection(msg.payload);
          break;
        default:
          throw new Error('未知操作: ' + msg.action);
      }
      sendResponse({ ok: true, data: result });
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();

  return true; // 异步响应
});
