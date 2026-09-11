const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Hero 多语言单词循环 ---------- */
(() => {
  const words = ['中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español', 'Русский'];
  const el = document.getElementById('cycleWord');
  if (!el) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % words.length;
    el.textContent = words[i];
    if (!reduceMotion) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }
  }, 2200);
})();

/* ---------- Hero 终端实时翻译演示 ---------- */
(() => {
  const body = document.getElementById('termBody');
  if (!body) return;

  const script = [
    { cls: 't-cmd', text: 'buff-translate --page example.com/article' },
    { cls: 't-dim', text: '检测到 42 个文本段落，开始翻译…' },
    { cls: 't-en', text: '"Language should never be a barrier."' },
    { cls: 't-zh', text: '"语言永远不应成为壁垒。"' },
    { cls: 't-en', text: '"Read the entire web in your own tongue."' },
    { cls: 't-zh', text: '"用你的母语，阅读整个互联网。"' },
    { cls: 't-ok', text: '✓ 42 段全部完成 · 用时 3.2s · 消耗 1,864 tokens' }
  ];

  function renderInstant() {
    body.innerHTML = script.map(l => `<div class="${l.cls}">${l.text}</div>`).join('');
  }

  if (reduceMotion) { renderInstant(); return; }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function typeLine(line) {
    const div = document.createElement('div');
    div.className = line.cls;
    body.appendChild(div);
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    div.appendChild(cursor);

    const fast = line.cls === 't-dim' || line.cls === 't-ok';
    for (let i = 0; i <= line.text.length; i++) {
      div.textContent = line.text.slice(0, i);
      div.appendChild(cursor);
      await sleep(fast ? 6 : (line.cls === 't-cmd' ? 34 : 18));
    }
    cursor.remove();
    await sleep(line.cls === 't-cmd' ? 350 : 240);
  }

  async function loop() {
    while (true) {
      body.innerHTML = '';
      for (const line of script) await typeLine(line);
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      body.appendChild(cursor);
      await sleep(3600);
    }
  }
  loop();
})();

/* ---------- 滚动显现 ---------- */
(() => {
  const items = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12 });
  items.forEach(el => io.observe(el));
})();
