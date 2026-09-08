# 目录分类索引

本文件是 ai-dev-kit 项目**目录分类的唯一真源**。顶层目录与分类一一对应：

```
ai-dev-kit/
├── vibetool/     #vibetool 实用工具
├── vibegame/     #vibegame 互动游戏
├── vibeart/      #vibeart 数字艺术（当前为空）
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

## #vibetool　实用工具（9）

| 项目 | 目录 | 一句话定位 | 物料状态 |
|------|------|-----------|----------|
| 拼豆设计工具 | `vibetool/perler-bead-designer/` | 48 色标准色卡的拼豆图纸设计与导出 | 笔记就绪 · 未打包 |
| 像素画编辑器 | `vibetool/pixel-art-editor/` | 16–256 画布，笔刷/图层/撤销，导出 SVG+PNG | 笔记就绪 · 未打包 |
| Word 转 Markdown | `vibetool/word-to-md/` | 浏览器端 .docx 转 Markdown | 均未 |
| 密码管理器 | `vibetool/password-manager/` | AES 加密本地密码库，Web + Electron 双模式 | 自用 · 不投稿 |
| AI 网关 | `vibetool/ai_gateway/` | 本地 LLM API 统一网关，智能体只需配置一次 | 自用 · 不投稿 |
| 网站截图 | `vibetool/screenshot/` | 多网站批量截图，处理懒加载/Cloudflare/字体 | 自用 · 不投稿 |
| AI 新闻日报 | `vibetool/ai-news/` | AI 新闻采集、飞书写入、HTML 日报生成 | 自用 · 不投稿 |
| 工作日报 | `vibetool/daily-report/` | 从 Git 提交生成日报并写入飞书多维表格 | 自用 · 不投稿 |
| 小工具打包器 | `vibetool/minitool-zip-builder-1.6.0.skill` | 把单文件 HTML 打成符合小红书规范的小工具 zip | 自用 · 不投稿 |

## #vibegame　互动游戏（7）

| 项目 | 目录 | 一句话定位 | 物料状态 |
|------|------|-----------|----------|
| 拼豆城市 | `vibegame/perler-city/` | 拼豆 × 模拟城市，RCI 三需求 + 水电环卫三市政 | 完整（zip + 海报） |
| 拼豆游戏 | `vibegame/perler-bead-game/` | 国风纹样逐格填豆，拼成即过关 | 完整（zip + 图） |
| 中秋拼豆坊 | `vibegame/perler-mid-autumn/` | 中秋版拼豆：月夜纹样 + 猜灯谜 | 完整（zip）· 缺笔记 |
| AI 计算器 | `vibegame/ai-calculator/` | 会故意算错的计算器，判断对错得分、连对加成 | 笔记就绪 · 未打包 |
| 星航者·太阳系漫游 | `vibegame/solar-voyager/` | 太阳系探索策略：基地运营→火箭设计→发射探索，8 星球 + 11 任务 + 程序化 Canvas/BGM | 开发完成 · 待投稿物料 |
| 人工智能 OS | `vibegame/ai-os/` | 移动端 AI 操作系统桌面模拟，React 构建，含旧版安卓 WebView 适配层 | 构建产物 · 未打包 |
| 核战危机 | `vibegame/defcon/` | 3D 球面核战策略：危机博弈推高 DEFCON，核弹有限、死得少的赢 | 立项 · 未开发 |

> `ai-calculator` 外壳是计算器，但有判断对错、得分、连对加成、实时战绩——爽点是"上头"而非"算得快"，故归 `#vibegame`。
>
> `defcon` 复用 `vibeknow/earth-3d` 的 three.js 与地球贴图；世界设定全部虚构，不使用真实国家与城市名。

## #vibeart　数字艺术（0）

**暂无项目。** 不硬凑：宁可空着，也不把工具或科普作品贴艺术标签顶数。

后续若要补，两条路：新开一个以"观看 / 聆听 / 互动"为主价值的作品；或给 `pixel-art-editor` 加生成式艺术层，让它从"画画的软件"变成"艺术作品本身"。

## #vibeknow　人文知识（7）

| 项目 | 目录 | 一句话定位 | 物料状态 |
|------|------|-----------|----------|
| 3D 地球科普 | `vibeknow/earth-3d/` | 昼夜交替、四季成因、地球内部结构 | 完整（zip + 物料） |
| 太阳系 3D | `vibeknow/solar-system-3d/` | 行星轨道、土星环、点击追踪天体 | 完整（zip + 物料） |
| 3D 火箭发射 | `vibeknow/rocket-launch-3d/` | 发射/拆解双模式，实时遥测 | 完整（zip + 物料） |
| 3D 月球科普 | `vibeknow/moon-3d/` | 月相变化、潮汐锁定、起源假说 | 均未 |
| 分子空间构型 | `vibeknow/molecule/` | 分子结构 3D 可视化 | 已打包 · 缺笔记 |
| 函数可视化 | `vibeknow/function-visualization/` | 初高中数学函数图像绘制 | 已打包 · 缺笔记 |
| 火箭发射 | `vibeknow/rocket-launch/` | 2D 火箭发射演示，含遥测与倒计时 | 已打包 · 缺笔记 |

## 维护约定

1. **新项目在落地时就定分类**，写进 TRACKS.md 与自身 README 顶部。
2. **一个项目只允许一个主分类**。确实跨界的（如工具外壳 + 游戏内核），以第 2 问定主分类，在备注里说明另一面。
3. **发笔记时的标签以本文件为准**，避免 README 写一遍、文案写一遍、话题标签又是第三遍。
4. **禁止硬编码绝对路径**。项目整体迁移是常态，任何写死 `C:\Users\...` 的脚本都会在迁移后失效——`vibeknow/rocket-launch/runtime-test.py` 与 `vibeknow/rocket-launch-3d/xiaohongshu/gen_cards.py` 都曾踩过，已改为基于 `__file__` 推导。新脚本一律用相对路径，或 `os.path.dirname(os.path.abspath(__file__))`。
