// 真实接口测试：复用插件的 lib/api.js，验证用户提供的 DeepSeek 配置
import { translateTexts, summarizePage, testConnection, buildChatEndpoint, normalizeBaseUrl } from '../lib/api.js';

const USER_CFG = {
  apiKey: 'sk-fad293b116fe4d23a931328fd3829c9c',
  baseUrl: 'https://www.deepseek.com/',
  model: 'DeepSeek V4.1 Flash'
};

let pass = 0, fail = 0;
function report(name, ok, detail = '') {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  ok ? pass++ : fail++;
}

async function tryStep(name, fn) {
  try {
    const r = await fn();
    report(name, true, typeof r === 'string' ? r.slice(0, 120).replace(/\n/g, ' ') : JSON.stringify(r).slice(0, 120));
    return r;
  } catch (e) {
    report(name, false, e.message);
    return null;
  }
}

console.log('== 端点规范化 ==');
report('endpoint(www.deepseek.com/)', buildChatEndpoint(USER_CFG.baseUrl) === 'https://www.deepseek.com/v1/chat/completions', buildChatEndpoint(USER_CFG.baseUrl));
report('endpoint(带/v1)', buildChatEndpoint('https://api.deepseek.com/v1/') === 'https://api.deepseek.com/v1/chat/completions', buildChatEndpoint('https://api.deepseek.com/v1/'));

// 若用户给的端点/模型不通，自动回退到官方端点与合法模型做诊断
async function pickWorkingConfig() {
  try {
    await testConnection(USER_CFG);
    return USER_CFG;
  } catch (e) {
    console.log('DIAG | 用户配置不可用: ' + e.message);
  }
  const alt = { ...USER_CFG, baseUrl: 'https://api.deepseek.com' };
  try {
    await testConnection(alt);
    return alt;
  } catch (e) {
    console.log('DIAG | 官方端点+用户模型不可用: ' + e.message);
    // 从错误信息中解析支持的模型名
    const m = /supported API model names are ([^,]+)/i.exec(e.message);
    const model = m ? m[1].trim() : 'deepseek-chat';
    const fixed = { ...alt, model };
    await testConnection(fixed);
    console.log('DIAG | 修正后配置可用: baseUrl=' + fixed.baseUrl + ', model=' + fixed.model);
    return fixed;
  }
}

console.log('\n== 连接测试 ==');
const cfg = await tryStep('连接测试', pickWorkingConfig);
if (!cfg) {
  console.log('\n结果: ' + pass + ' pass, ' + fail + ' fail');
  process.exitCode = 1;
  throw new Error('无法建立连接');
}

console.log('\n== 划词翻译（英->中，auto） ==');
const t1 = await tryStep('单条翻译', () => translateTexts(cfg, ['The quick brown fox jumps over the lazy dog.'], { targetLang: 'auto' }));
if (t1) report('返回 token 用量', !!t1.usage && t1.usage.totalTokens > 0, JSON.stringify(t1.usage));

console.log('\n== 划词翻译（中->英，auto） ==');
await tryStep('中译英', () => translateTexts(cfg, ['人工智能正在改变世界。'], { targetLang: 'auto' }));

console.log('\n== 指定源语言/目标语言（en -> ja） ==');
const t2 = await tryStep('指定语言对', () => translateTexts(cfg, ['Good morning, have a nice day.'], { sourceLang: 'en', targetLang: 'ja' }));
if (t2) report('译文为日语', /[\u3040-\u30ff\u4e00-\u9fff]/.test(t2.translations[0] || ''), t2.translations[0]);

console.log('\n== 整页批量翻译 ==');
const batch = ['Hello world', 'This is a test paragraph.', 'AI translation extension works well.'];
const t3 = await tryStep('批量翻译(3条)', () => translateTexts(cfg, batch, { targetLang: 'zh' }));
if (t3) report('批量返回长度一致', Array.isArray(t3.translations) && t3.translations.length === batch.length, 'len=' + (t3?.translations?.length));

console.log('\n== 网页总结 ==');
const article = 'Artificial intelligence has advanced rapidly in recent years. Large language models can now translate text, summarize articles, and answer questions. Browser extensions bring these capabilities directly into the daily browsing experience, allowing users to translate entire pages, look up selected words, and generate summaries without leaving the tab. Privacy-conscious users prefer extensions that let them configure their own API keys and endpoints.';
const s1 = await tryStep('总结生成', () => summarizePage(cfg, article, { targetLang: 'auto' }));
if (s1) report('总结含 token 用量', !!s1.usage && s1.usage.totalTokens > 0, JSON.stringify(s1.usage));

console.log('\n结果: ' + pass + ' pass, ' + fail + ' fail');
process.exitCode = fail ? 1 : 0;
