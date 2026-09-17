# AI Dev Kit 工作区

本目录是一个 AI 开发工具集合，包含多个独立子项目，按用途分为四个顶层目录（`vibetool/`、`vibegame/`、`vibeart/`、`vibeknow/`）。多数浏览器端工具为零依赖单文件 HTML，开箱即用；服务端项目集中在 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibetool/daily-report/`、`vibetool/ai-news/` 等。

本文件为**通用 AI 编程助手**（Claude、Codex、Gemini、CodeBuddy 等任何代码智能体）提供工作区导航与协作约定。子项目各自的 `README.md` / `CLAUDE.md` / `SKILL.md` 包含更具体的用法与约束，处理对应目录前请先查阅。

## 子项目

按目录分组，与顶层目录一一对应（`vibetool/` / `vibegame/` / `vibeart/` / `vibeknow/`）。各目录的定位与分类说明见 [`TRACKS.md`](TRACKS.md)。

### #vibetool　实用工具

| 项目 | 目录 | 说明 |
|------|------|------|
| 准时下班打卡 | `vibetool/offwork-heatmap/` | 浏览器端上下班打卡工具，GitHub 式热力图展示每日准时/加班状态，含连续准时与月度统计，localStorage 本地存储 |
| 心情日记 | `vibetool/mood-diary/` | 浏览器端心情记录工具，五种心情颜色一键打卡，GitHub 式热力图回看半年情绪，含连续好心情与月度统计，localStorage 本地存储 |
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
| 核战危机 DEFCON | `vibegame/defcon/` | 3D 球面核战策略：危机博弈推高 DEFCON、弹道溯源、核弹有限不可逆；竖屏移动端单手 UI + 手写 bloom；`tests/` 下 headless / balance / audit / smoke-mobile 四件套，设定唯一真源为 `DESIGN.md` |
| 拼豆游戏 | `vibegame/perler-bead-game/` | 国风拼豆填色网页小游戏，逐格填豆拼图过关；`_dev/build.py` 为唯一真源，产出 `index.html` + `main.js`；`_dev/build_zip.py` 校验并打包为小红书小工具 zip；同构工程约定，存档前缀 `pbg_`。已含「导出图纸」（三入口，容器内走 `saveImageToPhotosAlbum` 存相册、浏览器走 PNG 下载/打印） |
| 中秋拼豆坊 | `vibegame/perler-mid-autumn/` | 基于 perler-bead-game 引擎的中秋活动版：16 幅月夜纹样 + 猜灯谜（拼成点亮）；同构工程约定，存档前缀 `pma_`。已含「导出图纸」，规格与国风版一致 |
| 十二生肖拼豆坊 | `vibegame/perler-zodiac/` | 基于 perler-bead-game 引擎的生肖版：12 生肖按地支顺序分三档难度；「导出图纸」首发于此（编号网格 + 色号图例 + 用料清单，全景预览 + 点图放大）；同构工程约定，存档前缀 `pzd_` |
| AI 计算器 | `vibegame/ai-calculator/` | 仿真计算器，随机产生计算错误，判断对错得分、连对加成，锻炼心算验算能力 |
| 流浪地球·逃出太阳系 | `vibegame/wandering-earth-3d/` | 滑屏点火推动地球穿越太阳系：太阳引力 + 五颗行星引力实时作用，被行星引力捕获或撞毁即失败、飞出太阳系即胜利；行星发动机燃料有限，掠过行星时"相对速度"决定被吸走还是引力弹弓；复用手写 WebGL 引擎与 solar-system-3d 行星贴图，`tests/headless_wandering.js` 无头自检（16 项） |
| 航空大亨 | `vibegame/air-tycoon/` | 3D 球面航空经营模拟：24 座真实城市、开辟航线带动城市开发度成长，双瓶颈设计（薄线卡需求 / 干线卡槽位）逼玩家判断扩张方向，槽位按航线给故换大机型是唯一出路；60 回合（15 年）做到全球航空巨企；复用 defcon 球面引擎与竖屏单手 UI，经营数值唯一真源为 `src/sim.js`（UI 只调其导出接口）；音频为 WebAudio 现场合成（13 音效 + 三段落 BGM，零音频文件）；修掉三处静默失效（竞对价格战从未进入结算公式、地区类需求修正永不命中、事件选项现金被双倍扣除）并订正胜负判定口径（`verdict` 返回 `tier` 而非 `win`）；验证八层：`tests/ui-contract.js` 契约 + `tests/headless.js` 功能 + `tests/audio.js` 音频 + `tools/probe-heading.js`/`tests/verify-heading.py` 朝向（读真实实例矩阵判「飞机倒飞」，离线复算内置反例自证有效）+ `tests/smoke-render.py`/`tests/verify-dist.py` 实机 + `tests/check-chrome61.py`/`check-fallback.py` 兼容 + `tools/balance.js` 平衡 + `tools/audit-econ.js` 审计 |

### #vibeart　数字艺术

| 项目 | 目录 | 说明 |
|------|------|------|
| 泰坦尼克号 | `vibeart/Titanic/` | 照乐高 10294 参考图逐像素丈量建模的泰坦尼克号，四烟囱双桅十六艇，可旋转观赏的 3D 船模；尺寸真源为 `assets/titanic-params.js`，`blender/headless_check.py` 含 62 项几何审计并导出 GLB |
| 郑和宝船 | `vibeart/zhenghe-treasure-ship/` | Blender 建模的明代宝船，九桅十二帆、水密隔舱、七下西洋航线，三种模式（展示/拆解/航行）可观赏；史料口径见 `docs/史料考证.md`，尺寸真源为 `assets/ship-params.js` |

### #vibeknow　人文知识

| 项目 | 目录 | 说明 |
|------|------|------|
| 055 型驱逐舰 | `vibeknow/type-055-destroyer/` | 照四视图线图做的 055 三维模型：舰体线型、隐身上层建筑、集成桅四面 AESA、前 64 + 后 64 垂发；Blender 参数化建模（`assets/ship-params.js` 为唯一真源），含 9 项几何审计与四机位预览 |
| 3D 地球科普 | `vibeknow/earth-3d/` | 3D 地球科普工具，WebGL 展示蓝色星球、昼夜交替、四季成因、月相（地月系统）、地球内部结构与经纬网格 |
| 世界美食大百科 | `vibeknow/world-food-3d/` | 复用 earth-3d 框架，35 道世界美食以发光红点钉在地球上，点红点看介绍；按大洲筛选；离线零依赖 |
| 太阳系 3D | `vibeknow/solar-system-3d/` | 太阳系 3D 可视化，WebGL 渲染行星、轨道与土星环，支持点击追踪天体 |
| 3D 火箭发射 | `vibeknow/rocket-launch-3d/` | 3D 火箭发射模拟，WebGL 渲染，支持展示/拆解等模式，含遥测与倒计时 |
| 3D 登月全程 | `vibeknow/moon-landing-3d/` | 复用 rocket-launch-3d 引擎与 UI 风格的登月全流程科普：按中国载人登月真实方案，长征十号双箭发射（先发揽月着陆器驻留环月、数日后发梦舟飞船）→环月交会对接→船器分离→动力下降→月面软着陆；展示/拆解/登月三模式，`tests/headless_two_segment.js` 无头自检 |
| 3D 月球科普 | `vibeknow/moon-3d/` | 3D 月球科普展示工具，WebGL 渲染高细节月球，演示月相变化与潮汐锁定等科学知识 |
| 侏罗纪公园 3D | `vibeknow/jurassic-park-3d/` | 致敬 1993 电影的恐龙园游览导航：30 只恐龙 / 5 个地质年代 / 11 个国家，四条预设路线 + 自选路线，五页流转（路线选择 → 自选路线 → 经典大门 → 游览 → 巡逻日志），六维雷达图，地球标注化石发现地；零依赖单文件 HTML + Three.js（复用 earth-3d 渲染器），含小红书宣传片流水线 `tools/xhs-video/` |
| 为了小猫我飞遍全球 | `vibeknow/cat-globe-3d/` | 世界猫咪图鉴（24 种 / 5 大洲），心动后进入见小猫模式——飞机第一视角沿地球大圆航线飞行（Three.js 程序化地球纹理，离线零 CORS），到达俯瞰目标地区展示小猫，最后生成爱猫基因解析（六维雷达图 + 地区/特征基因构成 + 爱猫人格）；参照 jurassic-park-3d 框架重构交互逻辑，图片预留提示词待生图 |
| 分子结构 | `vibeknow/molecule/` | 分子空间构型可视化（含构建/打包/校验脚本） |
| 函数可视化 | `vibeknow/function-visualization/` | 初高中数学函数可视化工具，浏览器端绘制函数图像 |
| 火箭发射 | `vibeknow/rocket-launch/` | 2D 火箭发射演示，含遥测与倒计时，含构建/打包/校验脚本，生成可分发压缩包 |

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
