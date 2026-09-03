# AI Dev Kit

本目录是一个 AI 开发工具集合，包含多个独立子项目。多数浏览器端工具为零依赖单文件 HTML，开箱即用；服务端项目集中在 `ai_gateway/`、`password-manager/`、`daily-report/`、`ai-news/` 等。

每个子项目可能带有各自的 `README.md` 或 `CLAUDE.md`/`SKILL.md`；工作区级协作约定见 `AGENTS.md`，详细用法请参阅对应文件。

## 项目列表

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
| 拼豆游戏 | `perler-bead-game/` | 国风拼豆填色网页小游戏，纯前端单文件，逐格填豆拼图过关 |
| 拼豆城市 | `perler-city/` | 拼豆 × 模拟城市：拼成图纸才能盖楼，含 RCI 三需求与电力/供水/环卫三市政 |
| 像素画编辑器 | `pixel-art-editor/` | 浏览器端像素画绘制工具，支持多种画笔、图层、撤销重做、导出 PNG |
| 火箭发射 | `rocket-launch/` | 火箭发射主题小工具（2D），含构建/打包/校验脚本，生成可分发压缩包 |
| 3D 火箭发射 | `3d-rocket-launch/` | 3D 火箭发射模拟，WebGL 渲染，支持展示/拆解等模式，含遥测与倒计时 |
| 太阳系 3D | `solar-system-3d/` | 太阳系 3D 可视化，WebGL 渲染行星、轨道与土星环，支持点击追踪天体 |
| 网站截图 | `screenshot/` | 多网站批量截图采集，自动处理懒加载/Cloudflare/字体，分类输出 |
| Word 转 Markdown | `word-to-md/` | Word 文档转 Markdown 格式工具 |

## 快速开始

进入对应子项目目录，查看各自的 `README.md`、`CLAUDE.md` 或 `SKILL.md` 了解详细使用方法；工作区级约定见根目录 `AGENTS.md`。

## 环境要求

- Node.js（服务端及构建类项目依赖，如 `ai_gateway/`、`password-manager/`、`molecule/`、`rocket-launch/`）
- 飞书 API 配置（飞书集成相关项目：`daily-report/`、`ai-news/`）
- 现代浏览器（浏览器端工具）

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。你可以自由地使用、修改和分发代码，无需任何限制。
