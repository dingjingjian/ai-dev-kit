# AI Dev Kit 工作区

本目录是一个 AI 开发工具集合，包含多个独立子项目，按用途分为四个顶层目录（`vibetool/`、`vibegame/`、`vibeart/`、`vibeknow/`）。多数浏览器端工具为零依赖单文件 HTML，开箱即用；服务端项目集中在 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibetool/daily-report/`、`vibetool/ai-news/` 等。

本文件为**通用 AI 编程助手**（Claude、Codex、Gemini、CodeBuddy 等任何代码智能体）提供工作区导航与协作约定。子项目各自的 `README.md` / `CLAUDE.md` / `SKILL.md` 包含更具体的用法与约束，处理对应目录前请先查阅。

## 子项目

按目录分组，与顶层目录一一对应（`vibetool/` / `vibegame/` / `vibeart/` / `vibeknow/`）。各目录的定位与分类说明见 [`TRACKS.md`](TRACKS.md)。

### #vibetool　实用工具

| 项目 | 目录 | 说明 |
|------|------|------|
| 拼豆设计工具 | `vibetool/perler-bead-designer/` | 浏览器端拼豆图案设计工具，行业标准色卡、多种钉板形状、用料统计、图纸导出 |
| 像素画编辑器 | `vibetool/pixel-art-editor/` | 浏览器端像素画绘制工具，支持多种画笔、图层、撤销重做、导出 PNG |
| Word 转 Markdown | `vibetool/word-to-md/` | Word 文档转 Markdown 格式工具 |
| 密码管理器 | `vibetool/password-manager/` | 本地密码管理器，AES 加密存储，自动备份，支持 Web 和 Electron 双模式 |
| AI 网关 | `vibetool/ai_gateway/` | 本地 AI 网关，统一管理 LLM API 配置，智能体只需配置一次 |
| 网站截图 | `vibetool/screenshot/` | 多网站批量截图采集，自动处理懒加载/Cloudflare/字体，分类输出 |
| AI 新闻日报 | `vibetool/ai-news/` | AI 领域新闻采集、整理、飞书写入与 HTML 日报生成 |
| 工作日报 | `vibetool/daily-report/` | 从 Git 提交生成日报并写入飞书多维表格 |

### #vibegame　互动游戏

| 项目 | 目录 | 说明 |
|------|------|------|
| 拼豆城市 | `vibegame/perler-city/` | 拼豆 × 模拟城市：拼成图纸才能盖楼，已掌握后可花金币直接建；含 RCI 三需求与电力/供水/环卫三市政；同构工程约定（`_dev/build.py` 唯一真源 + `build_zip.py` 打包 + `smoke_test.js` 无头验证） |
| 拼豆游戏 | `vibegame/perler-bead-game/` | 国风拼豆填色网页小游戏，逐格填豆拼图过关；`_dev/build.py` 为唯一真源，产出 `index.html` + `main.js`；`_dev/build_zip.py` 校验并打包为小红书小工具 zip |
| AI 计算器 | `vibegame/ai-calculator/` | 仿真计算器，随机产生计算错误，判断对错得分、连对加成，锻炼心算验算能力 |

### #vibeart　数字艺术

暂无项目。不硬凑，补位方案见 `TRACKS.md`。

### #vibeknow　人文知识

| 项目 | 目录 | 说明 |
|------|------|------|
| 3D 地球科普 | `vibeknow/earth-3d/` | 3D 地球科普工具，WebGL 展示蓝色星球、昼夜交替、四季成因、地球内部结构与经纬网格 |
| 太阳系 3D | `vibeknow/solar-system-3d/` | 太阳系 3D 可视化，WebGL 渲染行星、轨道与土星环，支持点击追踪天体 |
| 3D 火箭发射 | `vibeknow/rocket-launch-3d/` | 3D 火箭发射模拟，WebGL 渲染，支持展示/拆解等模式，含遥测与倒计时 |
| 3D 月球科普 | `vibeknow/moon-3d/` | 3D 月球科普展示工具，WebGL 渲染高细节月球，演示月相变化与潮汐锁定等科学知识 |
| 分子结构 | `vibeknow/molecule/` | 分子空间构型可视化（含构建/打包/校验脚本） |
| 函数可视化 | `vibeknow/function-visualization/` | 初高中数学函数可视化工具，浏览器端绘制函数图像 |
| 火箭发射 | `vibeknow/rocket-launch/` | 2D 火箭发射演示，含遥测与倒计时，含构建/打包/校验脚本，生成可分发压缩包 |

## 协作约定（供 AI 助手）

- **先读文档再动手**：进入任意子项目前，先阅读其 `README.md` / `CLAUDE.md` / `SKILL.md`，遵循其中的技术栈、目录结构与约束。
- **保持单文件工具的最小依赖**：浏览器端工具优先零依赖单文件 HTML；除非必要，不要引入构建步骤或外部 CDN。
- **不擅自改动项目定位**：每个子项目有独立用途，改动核心逻辑或依赖前应先确认意图。
- **目录归属看目录 + `TRACKS.md`**：项目位于哪个顶层目录下即属哪个分类。跨分类迁移用 `git mv`，并同步更新 `TRACKS.md`（唯一真源）与项目 README 顶部的分类行。
- **脚本与产物分离**：构建/打包/校验脚本（如 `vibeknow/molecule/`、`vibeknow/rocket-launch/` 下的 `*.mjs`/`*.ps1`）与生成产物（压缩包、导出文件）应分目录管理，避免污染源码。
- **提交与协作**：不要主动 `git commit`/`push`；改动完成后汇总说明，由用户决定提交。
- **凭据安全**：飞书 API、密钥等凭据不应写入代码或提交到仓库；优先使用环境变量或本地配置。

## 环境要求

- Node.js（服务端及构建类项目依赖，如 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibeknow/molecule/`、`vibeknow/rocket-launch/`）
- 飞书 API 配置（飞书集成相关项目：`vibetool/daily-report/`、`vibetool/ai-news/`）
- 现代浏览器（浏览器端工具）

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。
