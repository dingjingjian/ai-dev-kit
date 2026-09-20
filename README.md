# AI Dev Kit

本目录是一个 AI 开发工具集合。自研项目按用途分为四个顶层目录（`vibetool/` / `vibegame/` / `vibeart/` / `vibeknow/`），多数浏览器端工具为零依赖单文件 HTML，开箱即用；服务端与脚本类项目集中在 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibetool/daily-report/`、`vibetool/ai-news/` 等。另有两个**非赛道目录**：`reference/`（他人优秀作品归档，参考资料）与 `vibecoding-gallery/`（浏览这些归档的展示工具），均不计入下面的项目清单。仓库级可复用技能在 `.skill/`。

每个子项目可能带有各自的 `README.md` 或 `CLAUDE.md`/`SKILL.md`；工作区级协作约定见 `AGENTS.md`，详细用法请参阅对应文件。

## 项目列表

按目录分组，与顶层目录一一对应。各目录的定位与维护约定见 [`TRACKS.md`](TRACKS.md)（唯一真源，本表与其同步）。

### #vibetool　实用工具（14）

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
| 准时下班打卡 | `vibetool/offwork-heatmap/` | 浏览器端上下班打卡工具，GitHub 式热力图展示每日准时/加班状态，含连续准时与月度统计 |
| 心情日记 | `vibetool/mood-diary/` | 浏览器端心情记录工具，五种心情颜色一键打卡，GitHub 式热力图回看半年情绪 |
| 图表图鉴 | `vibetool/echarts-gallery/` | 30 种常用图表速查图鉴，卡片真实渲染缩略图 + 详情页含介绍/主题配色/AI 提示词/适用场景，块内点选 5 套主题整站换色 |
| UI/UX 风格画廊 | `vibetool/uiux-style-gallery/` | 67 种主流 UI/UX 设计风格速查，纯 CSS 迷你示例卡片 + 详情页（中文介绍/AI 提示词/配色/场景），零依赖离线、适配小红书容器 |
| 小工具打包器 | `.skill/minitool-zip-builder/` | 把 H5 页面打包成符合小红书容器规范的离线小工具 zip（v1.6.0） |
| 宣传片录制器 | `.skill/demo-video-recorder/` | Playwright 驱动真浏览器录 9:16 竖屏片，Pillow 字幕（三主题）+ edge-tts 解说（v1.2.0） |

### #vibegame　互动游戏（11）

| 项目 | 目录 | 说明 |
|------|------|------|
| 拼豆城市 | `vibegame/perler-city/` | 拼豆 × 模拟城市：拼成图纸才能盖楼，含 RCI 三需求与电力/供水/环卫三市政 |
| 拼豆游戏 | `vibegame/perler-bead-game/` | 国风拼豆填色网页小游戏，纯前端单文件，逐格填豆拼图过关 |
| 中秋拼豆坊 | `vibegame/perler-mid-autumn/` | 中秋版拼豆：月夜纹样 + 猜灯谜，拼成即点亮 |
| AI 计算器 | `vibegame/ai-calculator/` | 仿真计算器，随机产生计算错误，判断对错得分，锻炼心算验算 |
| 人工智能 OS | `vibegame/ai-os/` | 移动端 AI 操作系统桌面模拟（v2 单源 vanilla JS）：主屏壁纸/Dock/金刚键 + 9 个恶搞应用，容器存储走 Storage JS API |
| 星航者·太阳系漫游 | `vibegame/solar-voyager/` | 太阳系探索策略：基地运营→火箭设计→发射探索，8 星球 + 11 任务 + 程序化 Canvas/BGM |
| 十二生肖拼豆坊 | `vibegame/perler-zodiac/` | 12 生肖拼豆 + 一键导出线下制作图纸（PNG/打印 PDF） |
| 核战危机 DEFCON | `vibegame/defcon/` | 3D 球面核战策略：危机博弈推高 DEFCON，核弹有限、死得少的赢 |
| 流浪地球·逃出太阳系 | `vibegame/wandering-earth-3d/` | 滑屏点火推动地球穿越太阳系，被行星吸走或撞毁即失败、飞出太阳系即胜利 |
| 航空大亨 | `vibegame/air-tycoon/` | 3D 球面航空经营：开辟航线带动城市经济升级，双瓶颈判断，60 回合做到全球巨企 |
| 倒车入库 | `vibegame/reverse-parking/` | 第一人称倒车入库模拟：三面后视镜 + 后窗判断车身姿态，滑动控方向盘/油门入库停正并评分 |

### #vibeart　数字艺术（2）

| 项目 | 目录 | 说明 |
|------|------|------|
| 泰坦尼克号 | `vibeart/Titanic/` | 照乐高 10294 参考图逐像素丈量建模的泰坦尼克号，可旋转观赏的 3D 船模 |
| 郑和宝船 | `vibeart/zhenghe-treasure-ship/` | Blender 建模的明代宝船，九桅十二帆、水密隔舱、七下西洋航线，三种模式可观赏 |

### #vibeknow　人文知识（13）

| 项目 | 目录 | 说明 |
|------|------|------|
| 3D 地球科普 | `vibeknow/earth-3d/` | WebGL 展示昼夜交替、四季成因、月相、地球内部结构与经纬网格 |
| 太阳系 3D | `vibeknow/solar-system-3d/` | WebGL 渲染行星、轨道与土星环，支持点击追踪天体 |
| 3D 火箭发射 | `vibeknow/rocket-launch-3d/` | 3D 火箭发射模拟，支持展示/拆解等模式，含遥测与倒计时 |
| 3D 月球科普 | `vibeknow/moon-3d/` | 高细节月球，演示月相变化与潮汐锁定等科学知识 |
| 分子结构 | `vibeknow/molecule/` | 分子空间构型可视化（含构建/打包/校验脚本） |
| 函数可视化 | `vibeknow/function-visualization/` | 初高中数学函数可视化工具，浏览器端绘制函数图像 |
| 火箭发射 | `vibeknow/rocket-launch/` | 2D 火箭发射演示，含遥测与倒计时，含构建/打包/校验脚本 |
| 为了小猫我飞遍全球 | `vibeknow/cat-globe-3d/` | 世界猫咪图鉴（24 种 / 5 大洲），飞机第一视角沿地球大圆航线飞行去见小猫，生成爱猫基因解析 |
| 世界美食大百科 | `vibeknow/world-food-3d/` | 复用 earth-3d 框架，35 道世界美食钉在地球上，点红点看介绍 |
| 3D 登月全程 | `vibeknow/moon-landing-3d/` | 长征十号双箭发射→环月交会对接→揽月着陆器落月（中国载人登月真实方案） |
| 侏罗纪公园 3D | `vibeknow/jurassic-park-3d/` | 侏罗纪公园游览导航：30 只恐龙 / 4 主题路线 + 自选，巡逻车行进时地球标注化石发现地 |
| 大航海时代 · 帆船图鉴 | `vibeknow/age-of-sail-3d/` | 大航海时代帆船图鉴：30 艘帆船 / 5 大海域家族，5 支主题舰队 + 自选，舰队沿岸航行时地球标注每艘的建造地 |
| 全球交通工具图鉴 | `vibeknow/vehicle-atlas/` | 49 种交通工具「类型」速查，按地面 / 水面 / 天空 / 太空四类分组、类内按出现时间从早到晚排列，串成从公元前 3000 年至今的交通史 |

## 其他目录

以下目录**不属于四个赛道分类**，不进上面的项目清单：

| 目录 | 说明 |
|------|------|
| `reference/` | 他人优秀小工具归档（截图 + 元信息），仅作学习借鉴与笔记素材，规范见 `reference/README.md` |
| `vibecoding-gallery/` | 浏览 `reference/` 归档的展示小工具（非参赛作品），见 `vibecoding-gallery/README.md` |
| `.skill/` | 仓库级可复用技能：小工具打包器、宣传片录制器 |
| `docs/` | 工作区级文档与素材：大赛官方启动文案、参赛总结、应用清单 |

## 快速开始

进入对应子项目目录，查看各自的 `README.md`、`CLAUDE.md` 或 `SKILL.md` 了解详细使用方法；工作区级约定见根目录 `AGENTS.md`。

## 环境要求

- Node.js（服务端及构建类项目依赖，如 `vibetool/ai_gateway/`、`vibetool/password-manager/`、`vibeknow/molecule/`、`vibeknow/rocket-launch/`）
- Python 3（构建/打包/配图/录制脚本，如 `.skill/demo-video-recorder/` 需 `playwright`、`imageio-ffmpeg`，解说需 `edge-tts`；`.skill/minitool-zip-builder/`）
- 飞书 API 配置（飞书集成相关项目：`vibetool/daily-report/`、`vibetool/ai-news/`）
- 现代浏览器（浏览器端工具）

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。你可以自由地使用、修改和分发代码，无需任何限制。
