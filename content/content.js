/* AI 翻译助手 content script：划词翻译 / 整页翻译 / 网页总结 */
(() => {
  if (window.__aiTranslatorLoaded) return;
  window.__aiTranslatorLoaded = true;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'IFRAME', 'SVG', 'CANVAS', 'KBD', 'SAMP']);
  const TRANS_CLASS = 'ai-trans-result';

  function aiRequest(action, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'ai-request', action, payload }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp?.ok) resolve(resp.data);
        else reject(new Error(resp?.error || '请求失败'));
      });
    });
  }

  /* ---------------- 划词翻译 ---------------- */
  let bubble = null;
  let popPanel = null;

  function removeFloaters() {
    bubble?.remove(); bubble = null;
    popPanel?.remove(); popPanel = null;
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text || text.length < 1 || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { text, rect };
  }

  function showBubble(rect, text) {
    removeFloaters();
    bubble = document.createElement('div');
    bubble.className = 'ai-trans-bubble';
    bubble.textContent = '译';
    const x = Math.min(Math.max(rect.left + rect.width / 2 - 16, 4), window.innerWidth - 40);
    const y = rect.top - 38 < 4 ? rect.bottom + 8 : rect.top - 38;
    bubble.style.left = (x + window.scrollX) + 'px';
    bubble.style.top = (y + window.scrollY) + 'px';
    document.documentElement.appendChild(bubble);
    bubble.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      translateSelection(text, rect);
    });
  }

  async function translateSelection(text, rect) {
    bubble?.remove(); bubble = null;
    popPanel = document.createElement('div');
    popPanel.className = 'ai-trans-panel';
    popPanel.innerHTML =
      '<div class="ai-trans-panel-head"><span>划词翻译</span><button class="ai-trans-close">×</button></div>' +
      '<div class="ai-trans-panel-src"></div>' +
      '<div class="ai-trans-panel-body">翻译中…</div>';
    popPanel.querySelector('.ai-trans-panel-src').textContent = text.length > 300 ? text.slice(0, 300) + '…' : text;
    const x = Math.min(Math.max(rect.left, 8), window.innerWidth - 340);
    const y = rect.bottom + 8;
    popPanel.style.left = (x + window.scrollX) + 'px';
    popPanel.style.top = (y + window.scrollY) + 'px';
    document.documentElement.appendChild(popPanel);
    popPanel.querySelector('.ai-trans-close').addEventListener('click', removeFloaters);

    try {
      const [result] = await aiRequest('translate', { texts: [text], kind: 'selection' });
      popPanel.querySelector('.ai-trans-panel-body').textContent = result;
    } catch (e) {
      popPanel.querySelector('.ai-trans-panel-body').textContent = '翻译失败: ' + e.message;
    }
  }

  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('.ai-trans-bubble, .ai-trans-panel, .ai-summary-panel')) return;
    setTimeout(() => {
      const info = getSelectionInfo();
      if (info) showBubble(info.rect, info.text);
      else removeFloaters();
    }, 10);
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.ai-trans-bubble, .ai-trans-panel')) removeFloaters();
  });
  window.addEventListener('scroll', removeFloaters, { passive: true });

  /* ---------------- 整页翻译 ---------------- */
  let translatedNodes = []; // {node, original}
  let translating = false;

  function collectTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const t = node.nodeValue;
        if (!t || t.trim().length < 2) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('.' + TRANS_CLASS + ', .ai-trans-bubble, .ai-trans-panel, .ai-summary-panel')) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(p);
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function chunkNodes(nodes, maxChars = 1800, maxCount = 20) {
    const chunks = [];
    let cur = [], chars = 0;
    for (const node of nodes) {
      const len = node.nodeValue.length;
      if (cur.length && (chars + len > maxChars || cur.length >= maxCount)) {
        chunks.push(cur); cur = []; chars = 0;
      }
      cur.push(node); chars += len;
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  async function translatePage() {
    if (translating) return { ok: false, error: '正在翻译中，请稍候' };
    restorePage();
    translating = true;
    try {
      const nodes = collectTextNodes();
      if (!nodes.length) return { ok: false, error: '未找到可翻译的文本' };
      const chunks = chunkNodes(nodes);
      let done = 0;
      // 并发 3 路，逐批翻译
      const queue = [...chunks];
      async function worker() {
        while (queue.length) {
          const batch = queue.shift();
          const originals = batch.map(n => n.nodeValue);
          try {
            const results = await aiRequest('translate', { texts: originals, kind: 'page' });
            batch.forEach((node, i) => {
              const span = document.createElement('span');
              span.className = TRANS_CLASS;
              span.textContent = results[i] || '';
              node.parentNode.insertBefore(span, node.nextSibling);
              translatedNodes.push({ node, span });
              node.nodeValue = originals[i];
            });
          } catch (e) {
            console.warn('[AI翻译] 批次翻译失败:', e.message);
          }
          done++;
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      const failed = chunks.length - done;
      return { ok: true, message: '整页翻译完成 ✓ 共 ' + nodes.length + ' 段' + (failed ? '，' + failed + ' 批失败' : '') };
    } finally {
      translating = false;
    }
  }

  function restorePage() {
    for (const { span } of translatedNodes) span.remove();
    translatedNodes = [];
    document.querySelectorAll('.' + TRANS_CLASS).forEach(el => el.remove());
    return { ok: true, message: '已恢复原页面 ✓' };
  }

  /* ---------------- 网页总结 ---------------- */
  let summaryPanel = null;

  function extractMainText() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,iframe,svg,canvas,nav,footer,header,form,.ai-trans-result,.ai-trans-bubble,.ai-trans-panel,.ai-summary-panel')
      .forEach(el => el.remove());
    return (clone.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
  }

  async function summarize() {
    summaryPanel?.remove();
    summaryPanel = document.createElement('div');
    summaryPanel.className = 'ai-summary-panel';
    summaryPanel.innerHTML =
      '<div class="ai-trans-panel-head"><span>网页总结</span><button class="ai-trans-close">×</button></div>' +
      '<div class="ai-summary-body">正在生成总结…</div>';
    document.documentElement.appendChild(summaryPanel);
    summaryPanel.querySelector('.ai-trans-close').addEventListener('click', () => summaryPanel?.remove());

    const text = extractMainText();
    if (text.length < 50) {
      summaryPanel.querySelector('.ai-summary-body').textContent = '页面内容太少，无法总结';
      return { ok: false, error: '页面内容太少' };
    }
    try {
      const result = await aiRequest('summarize', { text });
      summaryPanel.querySelector('.ai-summary-body').textContent = result;
      return { ok: true, message: '总结已生成 ✓' };
    } catch (e) {
      summaryPanel.querySelector('.ai-summary-body').textContent = '总结失败: ' + e.message;
      return { ok: false, error: e.message };
    }
  }

  /* ---------------- 消息路由 ---------------- */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'page-action') return false;
    (async () => {
      try {
        let resp;
        if (msg.action === 'translate-page') resp = await translatePage();
        else if (msg.action === 'summarize') resp = await summarize();
        else if (msg.action === 'restore') resp = restorePage();
        else resp = { ok: false, error: '未知操作' };
        sendResponse(resp);
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  });
})();
