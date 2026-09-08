# AI Dev Kit

本目录是一个 AI 开发工具集合，包含多个独立子项目，按用途分为四个顶层目录（`vibetool/` / `vibegame/` / `vibeart/` / `vibeknow/`）。多数浏览器端工具为零依赖单文件 HTML，开箱即用；服务端与脚本类项目集中在 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibetool/daily-report/`、`vibetool/ai-news/` 等。

每个子项目可能带有各自的 `README.md` 或 `CLAUDE.md`/`SKILL.md`；工作区级协作约定见 `AGENTS.md`，详细用法请参阅对应文件。

## 项目列表

按目录分组，与顶层目录一一对应。各目录的定位与维护约定见 [`TRACKS.md`](TRACKS.md)。

### #vibetool　实用工具

| 项目 | 目录 | 说明 |
|------|------|------|
| 拼豆设计工具 | `vibetool/perler-bead-designer/` | 浏览器端拼豆图案设计，行业标准色卡、钉板形状、用料统计、图纸导出 |
| 像素画编辑器 | `vibetool/pixel-art-editor/` | 多种画笔、图层、撤销重做，导出 PNG / SVG |
| Word 转 Markdown | `vibetool/word-to-md/` | Word 文档转 Markdown 格式工具 |
| 密码管理器 | `vibetool/password-manager/` | AES 加密本地密码库，自动备份，Web 与 Electron 双模式 |
| AI 网关 | `vibetool/ai_gateway/` | 本地 AI 网关，统一管理 LLM API 配置，智能体只需配置一次 |
| 网站截图 | `vibetool/screenshot/` | 多网站批量截图采集，自动处理懒加载/Cloudflare/字体 |
| AI 新闻日报 | `vibetool/ai-news/` | AI 领域新闻采集、整理、飞书写入与 HTML 日报生成 |
| 工作日报 | `vibetool/daily-report/` | 从 Git 提交生成日报并写入飞书多维表格 |

### #vibegame　互动游戏

| 项目 | 目录 | 说明 |
|------|------|------|
| 拼豆城市 | `vibegame/perler-city/` | 拼豆 × 模拟城市：拼成图纸才能盖楼，含 RCI 三需求与电力/供水/环卫三市政 |
| 拼豆游戏 | `vibegame/perler-bead-game/` | 国风拼豆填色网页小游戏，纯前端单文件，逐格填豆拼图过关 |
| 中秋拼豆坊 | `vibegame/perler-mid-autumn/` | 中秋版拼豆：月夜纹样 + 猜灯谜，拼成即点亮 |
| AI 计算器 | `vibegame/ai-calculator/` | 仿真计算器，随机产生计算错误，判断对错得分，锻炼心算验算 |
| 人工智能 OS | `vibegame/ai-os/` | 移动端 AI 操作系统桌面模拟，React 构建，含旧版安卓适配层 |
| 星航者·太阳系漫游 | `vibegame/solar-voyager/` | 太阳系探索策略：基地运营→火箭设计→发射探索，8 星球 + 11 任务 + 程序化 Canvas/BGM |

### #vibeart　数字艺术

暂无项目。不硬凑——补位方案见 `TRACKS.md`。

### #vibeknow　人文知识

| 项目 | 目录 | 说明 |
|------|------|------|
| 3D 地球科普 | `vibeknow/earth-3d/` | WebGL 展示昼夜交替、四季成因、地球内部结构与经纬网格 |
| 太阳系 3D | `vibeknow/solar-system-3d/` | WebGL 渲染行星、轨道与土星环，支持点击追踪天体 |
| 3D 火箭发射 | `vibeknow/rocket-launch-3d/` | 3D 火箭发射模拟，支持展示/拆解等模式，含遥测与倒计时 |
| 3D 月球科普 | `vibeknow/moon-3d/` | 高细节月球，演示月相变化与潮汐锁定等科学知识 |
| 分子结构 | `vibeknow/molecule/` | 分子空间构型可视化（含构建/打包/校验脚本） |
| 函数可视化 | `vibeknow/function-visualization/` | 初高中数学函数可视化工具，浏览器端绘制函数图像 |
| 火箭发射 | `vibeknow/rocket-launch/` | 2D 火箭发射演示，含遥测与倒计时，含构建/打包/校验脚本 |

## 快速开始

进入对应子项目目录，查看各自的 `README.md`、`CLAUDE.md` 或 `SKILL.md` 了解详细使用方法；工作区级约定见根目录 `AGENTS.md`。

## 环境要求

- Node.js（服务端及构建类项目依赖，如 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibeknow/molecule/`、`vibeknow/rocket-launch/`）
- 飞书 API 配置（飞书集成相关项目：`vibetool/daily-report/`、`vibetool/ai-news/`）
- 现代浏览器（浏览器端工具）

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。你可以自由地使用、修改和分发代码，无需任何限制。
