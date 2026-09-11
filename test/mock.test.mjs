// 本地 Mock OpenAI 服务回归测试：验证新数据结构（usage / 语言对 / 批量对齐）
import http from 'node:http';
import { translateTexts, summarizePage, testConnection } from '../lib/api.js';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const payload = JSON.parse(body || '{}');
    const userMsg = payload.messages?.find(m => m.role === 'user')?.content || '';
    let content;
    try {
      const arr = JSON.parse(userMsg);
      content = JSON.stringify(arr.map(t => '[译]' + t)); // 批量翻译请求
    } catch {
      content = userMsg.includes('reply with exactly') ? 'OK' : '【一句话概括】mock 总结\n【要点】\n- a\n- b';
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      choices: [{ message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
    }));
  });
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const cfg = { apiKey: 'mock-key', baseUrl: `http://127.0.0.1:${port}`, model: 'mock-model' };

let pass = 0, fail = 0;
function report(name, ok, detail = '') {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  ok ? pass++ : fail++;
}

// 连接测试新结构
const tc = await testConnection(cfg);
report('testConnection 返回 {reply, usage}', tc.reply === 'OK' && tc.usage?.totalTokens === 20, JSON.stringify(tc));

// 批量翻译：数量对齐 + usage
const tr = await translateTexts(cfg, ['Hello', 'World'], { targetLang: 'zh' });
report('批量翻译数量对齐', tr.translations.length === 2 && tr.translations[0] === '[译]Hello', JSON.stringify(tr.translations));
report('翻译返回 usage', tr.usage?.promptTokens === 12 && tr.usage?.totalTokens === 20, JSON.stringify(tr.usage));

// 语言对参数（不抛错且走同一链路）
const tr2 = await translateTexts(cfg, ['Bonjour'], { sourceLang: 'fr', targetLang: 'en' });
report('指定语言对可用', tr2.translations[0] === '[译]Bonjour', tr2.translations[0]);

// 空数组
const tr3 = await translateTexts(cfg, [], {});
report('空输入安全返回', Array.isArray(tr3.translations) && tr3.translations.length === 0);

// 总结
const sm = await summarizePage(cfg, 'some article text', { targetLang: 'auto' });
report('总结返回 {summary, usage}', sm.summary.includes('一句话概括') && sm.usage?.totalTokens === 20);

server.close();
console.log('\n结果: ' + pass + ' pass, ' + fail + ' fail');
process.exitCode = fail ? 1 : 0;
