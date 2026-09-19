# AI Dev Kit 工作区

本目录是一个 AI 开发工具集合，包含多个独立子项目，按用途分为四个顶层目录（`vibetool/`、`vibegame/`、`vibeart/`、`vibeknow/`）。多数浏览器端工具为零依赖单文件 HTML，开箱即用；服务端项目集中在 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibetool/daily-report/`、`vibetool/ai-news/` 等。

本文件为**通用 AI 编程助手**（Claude、Codex、Gemini、CodeBuddy 等任何代码智能体）提供工作区导航与协作约定。子项目各自的 `README.md` / `CLAUDE.md` / `SKILL.md` 包含更具体的用法与约束，处理对应目录前请先查阅。

## 子项目清单

完整的项目清单（分类、一句话定位、物料状态）以根目录 [`TRACKS.md`](TRACKS.md) 为**唯一真源**，本文件不再重复罗列，避免多套维护分叉。

工作区按用途分为四个顶层目录，与 `TRACKS.md` 的分类一一对应：

- `vibetool/` —— `#vibetool` 实用工具
- `vibegame/` —— `#vibegame` 互动游戏
- `vibeart/` —— `#vibeart` 数字艺术
- `vibeknow/` —— `#vibeknow` 人文知识

## 协作约定（供 AI 助手）

- **先读文档再动手**：进入任意子项目前，先阅读其 `README.md` / `CLAUDE.md` / `SKILL.md`，遵循其中的技术栈、目录结构与约束。仓库级可复用 Skill 位于根目录 `.skill/`（如小工具打包与兼容性规范 `minitool-zip-builder/`，见 [`TRACKS.md`](TRACKS.md)），涉及 H5 / WebView / 小工具产出时优先查阅其 `SKILL.md` 与工作流。
- **兼容性基线（H5 / WebView / 小工具）**：任何在浏览器内核中运行的产出，最低兼容基线为 **Android 8.1 出场 Chrome / WebView 61（ES2017）**。新 Web API 必须做能力检测而非 UA / 机型判断，超出基线语法须由构建链转译；CSS 采用「基线层 + `@supports` / 行为检测增强层」，不维护两套完整样式。权威细则见 `.skill/minitool-zip-builder/references/`（`js-compatibility.md` / `css-compatibility.md` / `cross-platform-h5.md` / `device-capabilities.md`），交付前逐条核对其末尾自检清单，未实测须标注「兼容性未实测」。
- **保持单文件工具的最小依赖**：浏览器端工具优先零依赖单文件 HTML；除非必要，不要引入构建步骤或外部 CDN。
- **不擅自改动项目定位**：每个子项目有独立用途，改动核心逻辑或依赖前应先确认意图。
- **目录归属看目录 + `TRACKS.md`**：项目位于哪个顶层目录下即属哪个分类。跨分类迁移用 `git mv`，并同步更新 `TRACKS.md`（唯一真源）与项目 README 顶部的分类行。
- **脚本与产物分离**：构建/打包/校验脚本（如 `vibeknow/molecule/`、`vibeknow/rocket-launch/` 下的 `*.mjs`/`*.ps1`）与生成产物（压缩包、导出文件）应分目录管理，避免污染源码。
- **小红书宣传素材目录命名统一为 `xiaohongshu`**：任意子项目的小红书（REDnote）参赛/宣传素材（笔记文案、封面、海报、配图等）都放在项目根目录下名为 `xiaohongshu/` 的文件夹里，**禁止**使用 `xiaohongshu-promo`、`promo`、`xhs-note`、`rednote`、`小红书*` 等异名，也不要把笔记文案直接散落在项目根目录或 `docs/` 下。构建期生成的小红书海报等内部素材若需独立目录，也用 `xiaohongshu/`（如 `perler-city/_dev/xiaohongshu/`）。
- **官方启动文案唯一真源在仓库根目录**：赛事官方启动文案（赛道划分、话题标签、奖励金额、时间线等权威表述）的唯一真源为仓库根目录的 `小红书vibecoding大赛-官方启动文案.md`。**禁止**在各子项目 `xiaohongshu/` 目录再维护该文案副本；agent 在 2026-09-20 前为本仓库撰写小红书参赛笔记/文案时，必须引用此文件、不得自行编造赛事信息。此为上述「笔记文案不散落根目录」规则的唯一例外。
- **提交与协作**：不要主动 `git commit`/`push`；改动完成后汇总说明，由用户决定提交。
- **凭据安全**：飞书 API、密钥等凭据不应写入代码或提交到仓库；优先使用环境变量或本地配置。

## 环境要求

- Node.js（服务端及构建类项目依赖，如 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibeknow/molecule/`、`vibeknow/rocket-launch/`）
- 飞书 API 配置（飞书集成相关项目：`vibetool/daily-report/`、`vibetool/ai-news/`）
- 现代浏览器（浏览器端工具）

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。
