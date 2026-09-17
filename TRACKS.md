# 目录分类索引

本文件是 ai-dev-kit 项目**目录分类的唯一真源**。顶层目录与分类一一对应：

```
ai-dev-kit/
├── vibetool/     #vibetool 实用工具
├── vibegame/     #vibegame 互动游戏
├── vibeart/      #vibeart 数字艺术
└── vibeknow/     #vibeknow 人文知识
```

换目录 = 用 `git mv` 把项目迁到目标分类目录，再同步本表与该项目 README 顶部的分类行。

## 四类定位

| 标签 | 分类 | 定位 |
|------|------|----------|
| `#vibetool` | 实用工具 | 点开就能使用的工具，让生活和工作变得更简单 |
| `#vibegame` | 互动游戏 | 有趣的小游戏，让人一玩就停不下来 |
| `#vibeart` | 数字艺术 | 把情绪和想象，做成可以观看、聆听和互动的艺术体验 |
| `#vibeknow` | 人文知识 | 把有深度的知识、故事或观点，做成让人愿意探索的内容 |

## 判定标准（三问）

1. **用户点开它的第一动机是什么**——做事 / 玩 / 看和感受 / 搞懂一件事
2. **有没有分数、关卡、输赢**——有则偏 `#vibegame`
3. **主价值是效率还是认知增量**——后者偏 `#vibeknow`

第 2 问优先级最高：一个套着工具外壳的东西，只要有胜负反馈，内核就是游戏（见 `ai-calculator`）。

补充一条：**服务端与脚本类项目也归 `#vibetool`**。AI 网关、日报、截图这类项目的主价值同样是"把一件事办成"，只是使用者不是普通用户而是自己或团队；不另设内部目录，避免同一分类被拆成两处。

## #vibetool　实用工具（12）

| 项目 | 目录 | 一句话定位 | 物料状态 |
|------|------|-----------|----------|
| 准时下班打卡 | `vibetool/offwork-heatmap/` | 上下班打卡 + GitHub 式热力图看每日准时情况 | 均未 |
| 心情日记 | `vibetool/mood-diary/` | 每天一种颜色记心情，GitHub 式热力图回看半年情绪 | 均未 |
| 拼豆设计工具 | `vibetool/perler-bead-designer/` | 48 色标准色卡的拼豆图纸设计与导出 | 笔记就绪 · 未打包 |
| 像素画编辑器 | `vibetool/pixel-art-editor/` | 16–256 画布，笔刷/图层/撤销，导出 SVG+PNG | 笔记就绪 · 未打包 |
| Word 转 Markdown | `vibetool/word-to-md/` | 浏览器端 .docx 转 Markdown | 均未 |
| 密码管理器 | `vibetool/password-manager/` | AES 加密本地密码库，Web + Electron 双模式 | 自用 · 不投稿 |
| AI 网关 | `vibetool/ai_gateway/` | 本地 LLM API 统一网关，智能体只需配置一次 | 自用 · 不投稿 |
| 网站截图 | `vibetool/screenshot/` | 多网站批量截图，处理懒加载/Cloudflare/字体 | 自用 · 不投稿 |
| AI 新闻日报 | `vibetool/ai-news/` | AI 新闻采集、飞书写入、HTML 日报生成 | 自用 · 不投稿 |
| 工作日报 | `vibetool/daily-report/` | 从 Git 提交生成日报并写入飞书多维表格 | 自用 · 不投稿 |
| 小工具打包器 | `.skill/minitool-zip-builder/` | 把 H5 页面打包成符合小红书容器规范的离线小工具 zip（v1.6.0） | 自用 · 不投稿 |
| 宣传片录制器 | `.skill/demo-video-recorder/` | Playwright 驱动真浏览器录 9:16 竖屏片，Pillow 字幕（三主题）+ edge-tts 解说（v1.2.0） | 自用 · 不投稿 |

## #vibegame　互动游戏（9）

| 项目 | 目录 | 一句话定位 | 物料状态 |
|------|------|-----------|----------|
| 拼豆城市 | `vibegame/perler-city/` | 拼豆 × 模拟城市，RCI 三需求 + 水电环卫三市政 | 完整（zip + 海报） |
| 拼豆游戏 | `vibegame/perler-bead-game/` | 国风纹样逐格填豆，拼成即过关（已含导出图纸） | 完整（zip + 图） |
| 中秋拼豆坊 | `vibegame/perler-mid-autumn/` | 中秋版拼豆：月夜纹样 + 猜灯谜（已含导出图纸） | 完整（zip）· 缺笔记 |
| 十二生肖拼豆坊 | `vibegame/perler-zodiac/` | 12 生肖拼豆 + 一键导出线下制作图纸（PNG/打印 PDF） | 完整（zip + 导出闭环冒烟过） |
| AI 计算器 | `vibegame/ai-calculator/` | 会故意算错的计算器，判断对错得分、连对加成 | 笔记就绪 · 未打包 |
| 星航者·太阳系漫游 | `vibegame/solar-voyager/` | 太阳系探索策略：基地运营→火箭设计→发射探索，8 星球 + 11 任务 + 程序化 Canvas/BGM | 开发完成 · 待投稿物料 |
| 人工智能 OS | `vibegame/ai-os/` | 移动端 AI 操作系统桌面模拟，React 构建，含旧版安卓 WebView 适配层 | 构建产物 · 未打包 |
| 核战危机 | `vibegame/defcon/` | 3D 球面核战策略：危机博弈推高 DEFCON，核弹有限、死得少的赢 | 竖屏移动端 · 可玩（headless 115 项过，待打包） |
| 流浪地球·逃出太阳系 | `vibegame/wandering-earth-3d/` | 滑屏点火推动地球，穿越太阳系：被行星吸走或撞毁即失败，飞出太阳系即胜利 | 可玩（headless 16 项过，待物料） |
| 航空大亨 | `vibegame/air-tycoon/` | 3D 球面航空经营：开辟航线带动城市经济升级，双瓶颈（需求/槽位）判断，60 回合做到全球巨企 | 修掉「飞机倒着飞」（朝向改由周期相位推出的 `AT.geo.legAt`，每个航段原有 49.9% 相位倒飞）；修掉三处静默失效（价格战从未进结算、地区需求修正永不命中、事件现金双倍扣除）；八层验证：headless 97 + 契约 43 + 音频 67 + 朝向（离线 30 场景 0 倒飞 / 实机 1571 样本 0 倒飞）+ 打包核验 56 + Chrome61 静态 91 + 降级 18 项过 |

> `ai-calculator` 外壳是计算器，但有判断对错、得分、连对加成、实时战绩——爽点是"上头"而非"算得快"，故归 `#vibegame`。
>
> `defcon` 复用 `vibeknow/earth-3d` 的 three.js 与地球贴图；半架空命名（阵营带地缘指代、不出现真实国家与政治军事组织名），城市用真实坐标 + 中文别称。竖屏移动端优先，桌面端居中成 480px 竖屏。
>
> `air-tycoon` 复用 `defcon` 的球面 3D 引擎骨架、竖屏单手 UI 与无构建工程约定；用真实城市名（上海/东京/伦敦…）与真实机型量级，但为保玩法闭环把需求整体压缩 1/3（见 `src/data.js` 的 `penetrationRate` 注释）。经营数值的唯一真源是 `src/sim.js`，UI 只调其导出接口、绝不重算。

## #vibeart　数字艺术（2）

| 项目 | 目录 | 一句话定位 | 物料状态 |
|------|------|-----------|----------|
| 泰坦尼克号 | `vibeart/Titanic/` | 照乐高 10294 参考图逐像素丈量建模的泰坦尼克号，四烟囱双桅十六艇，可旋转观赏的 3D 船模 | 模型完成 · 待 H5 |
| 郑和宝船 | `vibeart/zhenghe-treasure-ship/` | Blender 建模的明代宝船，九桅十二帆、水密隔舱、七下西洋航线，三种模式可观赏 | 骨架就绪 · 待建模 |

> 两项目由 `#vibeknow` 人文知识迁移而来：以"观看 / 感受"为主价值的 3D 船模作品，归入数字艺术更贴切。

## #vibeknow　人文知识（11）

| 项目 | 目录 | 一句话定位 | 物料状态 |
|------|------|-----------|----------|
| 055 型驱逐舰 | `vibeknow/type-055-destroyer/` | 照四视图线图做的 055 三维模型，含舰体线型与武备落位 | 骨架就绪 · 模型完成 |
| 3D 地球科普 | `vibeknow/earth-3d/` | 昼夜交替、四季成因、月相、地球内部结构 | 完整（zip + 物料） |
| 世界美食大百科 | `vibeknow/world-food-3d/` | 复用 earth-3d 框架，35 道世界美食钉在地球上，点红点看介绍 | 笔记就绪 · 未打包 |
| 为了小猫我飞遍全球 | `vibeknow/cat-globe-3d/` | 世界猫咪图鉴，心动后飞机第一视角沿地球飞行去见小猫，生成爱猫基因解析 | 已打包 · 缺图缺笔记 |
| 太阳系 3D | `vibeknow/solar-system-3d/` | 行星轨道、土星环、点击追踪天体 | 完整（zip + 物料） |
| 3D 火箭发射 | `vibeknow/rocket-launch-3d/` | 发射/拆解双模式，实时遥测 | 完整（zip + 物料） |
| 3D 登月全程 | `vibeknow/moon-landing-3d/` | 长征十号双箭发射→环月交会对接→揽月着陆器落月（中国载人登月真实方案） | 均未 |
| 3D 月球科普 | `vibeknow/moon-3d/` | 月相变化、潮汐锁定、起源假说 | 均未 |
| 分子空间构型 | `vibeknow/molecule/` | 分子结构 3D 可视化 | 已打包 · 缺笔记 |
| 函数可视化 | `vibeknow/function-visualization/` | 初高中数学函数图像绘制 | 已打包 · 缺笔记 |
| 火箭发射 | `vibeknow/rocket-launch/` | 2D 火箭发射演示，含遥测与倒计时 | 已打包 · 缺笔记 |

## 维护约定

1. **新项目在落地时就定分类**，写进 TRACKS.md 与自身 README 顶部。
2. **一个项目只允许一个主分类**。确实跨界的（如工具外壳 + 游戏内核），以第 2 问定主分类，在备注里说明另一面。
3. **发笔记时的标签以本文件为准**，避免 README 写一遍、文案写一遍、话题标签又是第三遍。
4. **禁止硬编码绝对路径**。项目整体迁移是常态，任何写死 `C:\Users\...` 的脚本都会在迁移后失效——`vibeknow/rocket-launch/runtime-test.py` 与 `vibeknow/rocket-launch-3d/xiaohongshu/gen_cards.py` 都曾踩过，已改为基于 `__file__` 推导。新脚本一律用相对路径，或 `os.path.dirname(os.path.abspath(__file__))`。
5. **技能（Skill）只提交目录，不提交打包 zip**。仓库级技能真源在 `.skill/<name>/`，以目录形式入库；`.zip` 属二次产物，一旦入库就会与目录分叉——`minitool-zip-builder.zip` 就落到了「zip 内 SKILL.md 3116B vs 磁盘 4638B」并夹带 macOS `__MACOSX/` 垃圾，2026-09-16 已删除（需要时 `git show a2db1d5:.skill/minitool-zip-builder.zip` 可取回）。要让 Skill 工具真的发现技能，用 `.skill/<name>/sync_check.py --install-user` 装到 `~/.workbuddy/skills/`，不要靠 zip。
