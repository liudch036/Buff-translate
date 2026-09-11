# Buff-translate

基于 AI 大模型的 Chrome 翻译扩展：全页面翻译、划词翻译、网页总结。兼容 OpenAI 协议，支持自定义 API Key 与 Base URL，可接入 DeepSeek、OpenAI 及任何 OpenAI 兼容服务。

## 功能

- **整页翻译**：一键翻译整个网页，译文以双语对照形式显示在原文下方，可随时恢复原页面
- **划词翻译**：选中任意文本，点击浮动按钮即可查看译文
- **网页总结**：自动提取正文，生成"一句话概括 + 要点"摘要
- **中英互译**：自动检测语言方向，也可手动指定源语言/目标语言（支持中、英、日、韩、法、德、西、俄）
- **管理面板**：接口配置、语言设置、翻译历史记录（可搜索/清空）、Token 消耗统计（按日聚合）

## 安装

1. 下载或克隆本仓库
2. 打开 `chrome://extensions`，开启右上角"开发者模式"
3. 点击"加载已解压的扩展程序"，选择本仓库目录
4. 点击工具栏图标，在 Popup 或管理面板中填写接口配置

## 配置

| 配置项 | 说明 | 示例 |
|---|---|---|
| API Key | 你的模型服务密钥 | `sk-...` |
| Base URL | OpenAI 兼容接口地址 | `https://api.deepseek.com` |
| 模型 | 模型 ID | `deepseek-flash` / `gpt-4o-mini` |

Base URL 支持自动补全，以下写法等价：

- `https://api.deepseek.com`
- `https://api.deepseek.com/v1`
- `https://api.deepseek.com/v1/chat/completions`

## 项目结构

```
├── manifest.json        # MV3 清单
├── background.js        # Service Worker：API 请求、历史记录、Token 统计
├── lib/api.js           # OpenAI 兼容协议层
├── popup/               # 工具栏弹窗（快捷操作 + 基础配置）
├── options/             # 管理面板（设置 / 语言 / 历史 / 统计）
├── content/             # 划词翻译、整页翻译、总结面板
├── icons/               # 扩展图标
├── test/                # 真实接口测试 + Mock 回归测试
└── tools/               # 图标生成脚本
```

## 测试

```bash
# 代码逻辑回归（本地 Mock，无需真实 Key）
node test/mock.test.mjs

# 真实接口测试（需在 test/api.test.mjs 中配置有效 Key）
node test/api.test.mjs
```

## 隐私

API Key 等配置仅保存在浏览器本地（`chrome.storage`），所有请求直接从你的浏览器发往你配置的服务商，不经过任何第三方。
