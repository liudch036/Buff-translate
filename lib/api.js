/**
 * OpenAI 兼容协议 API 层。
 * 同时被扩展的 background（ESM）与 Node 测试脚本复用。
 */

export const LANGS = {
  auto: '自动',
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ru: 'Русский'
};

export function normalizeBaseUrl(baseUrl) {
  let u = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) throw new Error('Base URL 不能为空');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

export function buildChatEndpoint(baseUrl) {
  const u = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(u)) return u;
  if (/\/v1$/i.test(u)) return u + '/chat/completions';
  return u + '/v1/chat/completions';
}

function parseUsage(usage) {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0
  };
}

function sumUsage(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

export async function chatCompletion({ apiKey, baseUrl, model, messages, temperature = 0.3, maxTokens = 4096 }) {
  if (!apiKey) throw new Error('请先在插件设置中填写 API Key');
  if (!model) throw new Error('请先在插件设置中填写模型名称');
  const url = buildChatEndpoint(baseUrl);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    })
  });

  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }

  if (!resp.ok) {
    const msg = data?.error?.message || text.slice(0, 200) || ('HTTP ' + resp.status);
    throw new Error('API 请求失败 (' + resp.status + '): ' + msg);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('API 返回格式异常，未找到 choices[0].message.content');
  return { content, usage: parseUsage(data?.usage) };
}

/** 从模型输出中稳健地提取 JSON 数组 */
export function extractJsonArray(text) {
  if (!text) return null;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function resolveTargetLang(targetLang, sampleText) {
  if (targetLang && targetLang !== 'auto') return LANGS[targetLang] || targetLang;
  // auto：含中文则译成英文，否则译成中文
  return /[\u4e00-\u9fff]/.test(sampleText || '') ? 'English' : '简体中文';
}

function sourceLangPhrase(sourceLang) {
  if (!sourceLang || sourceLang === 'auto') return '';
  return '从' + (LANGS[sourceLang] || sourceLang);
}

/**
 * 批量翻译文本数组。
 * 返回 { translations: string[], usage: {promptTokens, completionTokens, totalTokens} | null }
 */
export async function translateTexts(cfg, texts, { sourceLang = 'auto', targetLang = 'auto' } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) return { translations: [], usage: null };
  const target = resolveTargetLang(targetLang, texts.join(' '));
  const src = sourceLangPhrase(sourceLang);
  const sys = [
    '你是专业翻译引擎。用户会给你一个 JSON 字符串数组，请把每个元素' + (src ? src : '') + '翻译成' + target + '。',
    '严格要求：',
    '1. 只输出一个 JSON 字符串数组，长度必须与输入完全一致，顺序一一对应；',
    '2. 不要输出任何解释、markdown 代码块或额外文字；',
    '3. 保留原文中的换行与 inline HTML 标签结构。'
  ].join('\n');

  const r = await chatCompletion({
    ...cfg,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify(texts) }
    ]
  });

  const arr = extractJsonArray(r.content);
  if (arr && arr.length === texts.length) {
    return { translations: arr.map(x => String(x)), usage: r.usage };
  }

  // 兜底：单条逐个翻译
  const out = [];
  let usage = null;
  for (const t of texts) {
    const single = await chatCompletion({
      ...cfg,
      messages: [
        { role: 'system', content: '把用户给出的文本' + (src ? src : '') + '翻译成' + target + '，只输出译文。' },
        { role: 'user', content: t }
      ]
    });
    out.push(single.content.trim());
    usage = sumUsage(usage, single.usage);
  }
  return { translations: out, usage };
}

/** 网页内容总结，返回 { summary, usage } */
export async function summarizePage(cfg, text, { targetLang = 'auto' } = {}) {
  const target = resolveTargetLang(targetLang, text);
  const r = await chatCompletion({
    ...cfg,
    maxTokens: 1024,
    messages: [
      {
        role: 'system',
        content: '你是网页内容总结助手。请用' + target + '输出总结，格式：\n' +
          '【一句话概括】...\n【要点】（3-6 条，每条一行，以 - 开头）\n只输出总结内容本身。'
      },
      { role: 'user', content: text.slice(0, 8000) }
    ]
  });
  return { summary: r.content, usage: r.usage };
}

/** 连接测试，返回 { reply, usage } */
export async function testConnection(cfg) {
  const r = await chatCompletion({
    ...cfg,
    maxTokens: 16,
    messages: [{ role: 'user', content: 'Hi, reply with exactly: OK' }]
  });
  return { reply: r.content.trim(), usage: r.usage };
}
