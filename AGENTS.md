# AI Dev Kit 工作区

本目录是一个 AI 开发工具集合，包含多个独立子项目。多数浏览器端工具为零依赖单文件 HTML，开箱即用；服务端项目集中在 `ai_gateway/`、`password-manager/`、`daily-report/`、`ai-news/` 等。

本文件为**通用 AI 编程助手**（Claude、Codex、Gemini、CodeBuddy 等任何代码智能体）提供工作区导航与协作约定。子项目各自的 `README.md` / `CLAUDE.md` / `SKILL.md` 包含更具体的用法与约束，处理对应目录前请先查阅。

## 子项目

| 项目 | 目录 | 说明 |
|------|------|------|
| AI 网关 | `ai_gateway/` | 本地 AI 网关，统一管理 LLM API 配置，智能体只需配置一次 |
| AI 计算器 | `ai-calculator/` | 仿真计算器，随机产生计算错误，锻炼心算验算能力 |
| AI 新闻日报 | `ai-news/` | AI 领域新闻采集、整理、飞书写入与 HTML 日报生成 |
| 工作日报 | `daily-report/` | 从 Git 提交生成日报并写入飞书多维表格 |
| 函数可视化 | `function-visualization/` | 初高中数学函数可视化工具，浏览器端绘制函数图像 |
| 分子结构 | `molecule/` | 分子结构可视化（含构建/打包/校验脚本） |
| 密码管理器 | `password-manager/` | 本地密码管理器，AES 加密存储，自动备份，支持 Web 和 Electron 双模式 |
| 拼豆设计工具 | `perler-bead-designer/` | 浏览器端拼豆图案设计工具，行业标准色卡、多种钉板形状、用料统计、图纸导出 |
| 拼豆游戏 | `perler-bead-game/` | 国风拼豆填色网页小游戏，逐格填豆拼图过关；`_dev/build.py` 为唯一真源，产出 `index.html` + `main.js`；`_dev/build_zip.py` 校验并打包为小红书小工具 zip |
| 拼豆城市 | `perler-city/` | 拼豆 × 模拟城市：拼成图纸才能盖楼，已掌握后可花金币直接建；含 RCI 三需求与电力/供水/环卫三市政；同构工程约定（`_dev/build.py` 唯一真源 + `build_zip.py` 打包 + `smoke_test.js` 无头验证） |
| 像素画编辑器 | `pixel-art-editor/` | 浏览器端像素画绘制工具，支持多种画笔、图层、撤销重做、导出 PNG |
| 火箭发射 | `rocket-launch/` | 火箭发射主题小工具，含构建/打包/校验脚本，生成可分发压缩包 |
| 网站截图 | `screenshot/` | 多网站批量截图采集，自动处理懒加载/Cloudflare/字体，分类输出 |
| Word 转 Markdown | `word-to-md/` | Word 文档转 Markdown 格式工具 |

## 协作约定（供 AI 助手）

- **先读文档再动手**：进入任意子项目前，先阅读其 `README.md` / `CLAUDE.md` / `SKILL.md`，遵循其中的技术栈、目录结构与约束。
- **保持单文件工具的最小依赖**：浏览器端工具优先零依赖单文件 HTML；除非必要，不要引入构建步骤或外部 CDN。
- **不擅自改动项目定位**：每个子项目有独立用途，改动核心逻辑或依赖前应先确认意图。
- **脚本与产物分离**：构建/打包/校验脚本（如 `molecule/`、`rocket-launch/` 下的 `*.mjs`/`*.ps1`）与生成产物（压缩包、导出文件）应分目录管理，避免污染源码。
- **提交与协作**：不要主动 `git commit`/`push`；改动完成后汇总说明，由用户决定提交。
- **凭据安全**：飞书 API、密钥等凭据不应写入代码或提交到仓库；优先使用环境变量或本地配置。

## 环境要求

- Node.js（服务端及构建类项目依赖，如 `ai_gateway/`、`password-manager/`、`molecule/`、`rocket-launch/`）
- 飞书 API 配置（飞书集成相关项目：`daily-report/`、`ai-news/`）
- 现代浏览器（浏览器端工具）

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。
