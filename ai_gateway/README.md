# AI Gateway - 本地 AI 网关

统一管理大模型 API 配置，本地智能体只需配置一次，切换模型时无需逐个修改。

## 工作原理

```
本地智能体 (Trae / Dify / 其他)
    │
    │  统一地址: http://localhost:5174/v1
    │  API Key:  gw-xxxxxxxx
    │
    ▼
┌──────────────────────────┐
│       AI Gateway         │
│  ┌────────────────────┐  │
│  │  GLM-4-Flash  ✓活跃 │  │
│  │  DeepSeek           │  │
│  │  Silicon Flow       │  │
│  └────────────────────┘  │
└──────────────────────────┘
    │
    │  实际 API 地址 + Key + Model
    ▼
  大模型 API (智谱 / DeepSeek / 硅基流动 / ...)
```

**核心价值**：智能体永远只连网关地址。换模型时，在管理界面切换活跃 Provider 即可，无需触碰任何智能体配置。

## 两种使用方式

### 方式一：直接运行 exe（推荐）

1. 获取 `ai-gateway.exe`（见下方「打包成 exe」）
2. 双击运行
3. 浏览器自动打开管理界面 `http://localhost:5174`
4. 配置数据存储在 exe 旁边的 `data/` 文件夹

### 方式二：从源码运行

```bash
# 安装依赖
npm install

# 启动网关
npm start

# 开发模式（文件变动自动重启）
npm run dev
```

启动后打开 `http://localhost:5174` 进入管理界面。

## 打包成 exe

```bash
npm install        # 安装依赖（含 esbuild + postject）
npm run build      # 构建单可执行文件
```

构建产物：`dist/ai-gateway.exe`（约 84MB，基于 Node.js 22 SEA）

**技术方案**：esbuild 打包 → Node.js Single Executable Application (SEA) → postject 注入

**运行要求**：Windows x64（打包用的 Node.js 版本决定）

## 使用步骤

### 1. 添加模型配置

在管理界面点击「添加配置」，填写：
- **名称**：方便识别，如 `GLM-4-Flash`
- **API Base URL**：OpenAI 兼容地址，如 `https://open.bigmodel.cn/api/paas/v4`
- **API Key**：对应平台的密钥
- **模型 ID**：如 `glm-4-flash`

### 2. 测试连接

添加后点击「测试」按钮，验证配置是否正确。

### 3. 在智能体中配置

将以下信息填入智能体的 API 配置：

| 配置项 | 值 |
|-------|---|
| API Base URL | `http://localhost:5174/v1` |
| API Key | 网关密钥（管理界面顶部可复制） |
| Model | 任意值即可，网关会自动替换为活跃模型的 ID |

### 4. 切换模型

在管理界面点击「启用」按钮切换活跃 Provider，所有智能体立即生效。

## 兼容性

网关暴露 OpenAI 兼容的 `/v1/chat/completions` 和 `/v1/models` 接口，支持：
- 流式响应（SSE）
- 非流式 JSON 响应
- 任何使用 OpenAI SDK 或兼容 API 的智能体/工具

### 已知兼容的平台

| 平台 | Base URL 示例 |
|------|-------------|
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` |
| DeepSeek | `https://api.deepseek.com` |
| 硅基流动 | `https://api.siliconflow.cn/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Ollama | `http://localhost:11434/v1` |

## 数据存储

- **exe 模式**：数据存储在 exe 旁边的 `data/config.json`
- **源码模式**：数据存储在项目根目录 `data/config.json`

内容包括：网关设置（端口、密钥）、Provider 列表、请求日志（最近 200 条）。

## 项目结构

```
ai_gateway/
├── server.js          # 主服务器（源码运行入口）
├── sea-entry.js       # SEA 打包入口（内联静态文件）
├── build.js           # exe 构建脚本（esbuild + SEA + postject）
├── src/
│   ├── config.js      # 配置管理（JSON 存储、Provider CRUD、日志）
│   └── proxy.js       # 请求代理（流式 SSE + 连接测试）
├── public/
│   ├── index.html     # 管理界面
│   ├── style.css      # 样式
│   └── app.js         # 前端交互逻辑
├── dist/              # 构建产物（gitignore）
│   └── ai-gateway.exe
├── data/              # 运行数据（gitignore）
└── package.json
```

## 技术栈

- Node.js 22 + Express
- esbuild 打包 + Node.js SEA 单可执行应用
- 原生 HTML/CSS/JS（无前端构建步骤）
- 纯本地运行，数据不出本机
