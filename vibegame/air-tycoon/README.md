# 航空大亨 AIR TYCOON（air-tycoon）

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)
> 小红书 VibeCoding 大赛参赛作品 · 框架复用自 [`../defcon`](../defcon)

一款 **3D 球面地图上的航空经营模拟游戏**，竖屏移动端单手游玩。**开局先在六家航空公司里选一家**（各据一个大洲、基地与特色技能各异），再开辟航线、购置机队、扩张网络，让交通带动城市经济成长；目标是在 60 个季度（15 年）内成长为**全球航空巨企**。

## 项目信息

- 中文名：航空大亨
- 仓库名：`air-tycoon`
- 主赛道：`#vibegame`（互动游戏）
- 复用来源：`vibegame/defcon`（球面 3D 引擎、竖屏单手 UI、无构建工程约定、测试三件套方法）
- 引擎：**three.js r149**（`assets/three.min.js`，608 KB，随包内联，无 CDN）；渲染层由本项目自写
- 音频：WebAudio 程序化合成，**零音频文件**（见「音频」一节）


## 技术路线

- `index.html` + `src/` 下 10 个外置经典脚本，**无构建步骤**，作为小红书「小工具」上传挂载
- 竖屏移动端布局（390×844 基准）
- 3D 引擎：**three.js r149**（随包内联，608 KB）；渲染层 `src/render.js` 自写（球体、城市光点、航线弧、HUD 投射），含自动降级
- 音频：WebAudio 程序化合成（13 音效 + 三段落 BGM），**零音频文件**，见下节
- 逻辑 10 Hz 固定步长 + 渲染 60 fps 插值，确定性便于无头测试
- 红线：离线运行不联网、无 `fetch` / `Worker` / `eval`、脚本全外置、无外部资源
- 兼容基线：Chrome 61（无 CSS `inset` 简写、无 flex `gap`、`var()` 需兜底）


## 自动存档

每 5 秒写一次档（真实时间，见 `game.js` 的 `AUTOSAVE_SEC`），另在切后台 / 页面卸载（`visibilitychange` + `pagehide`）时立即补写一次；`phase === 'over'`（终局）时清档。启动时若读到**可读存档**，先弹「继续经营 / 开启新的一局」覆盖层（`ui.showResume`），点选后才建局（`boot` 必须在点击手势里执行以解锁 AudioContext）；没有可读存档则直接进选航司。

存储按小红书小工具规范 **§2.4 数据存储 / §3.6 版本判断 / §3.7 Storage JS API** 分两级，全部实现在 `src/save.js`：

- 客户端 ≥ 9.46（`buildVersion` 忽略末 3 位编译序号后 ≥ 9460）→ `window.xhs.miniTool.setStorage / getStorage / removeStorage`（规范推荐方案）；
- 客户端 < 9.46，或未注入端能力（普通浏览器预览）→ 降级 `localStorage`。

读写一律包在 `try/catch` 内，失败只返回 `false` / `null`、**绝不抛出**（规范明确浏览器自带存储不保证可用/持久），调用方必须容忍「读不到、写不成」。**全仓仅 `src/save.js` 允许触碰 `localStorage`**，`tests/check-chrome61.py` 有对应扫描项（⑤b）钉住这条边界。

存档是整局 `state` 的 JSON 快照，有两处不能直接 JSON 化：`rng` 是闭包函数，故另存 `rngState`（`sim.makeRng` 暴露了 `getState/setState`），复原时把随机流**接着往下跑**而不是从种子重放 —— 否则读档后的世界线会与「一直玩下去」分叉，破坏「同种子同结果」的确定性契约；`fx` 是每帧消费的瞬时特效队列，不存。读档时 `paused` 一律复位为 `false`：存档可能写在面板打开的暂停态，原样恢复会让 `tick` 永远早退、游戏卡死。


## 目录结构

```
air-tycoon/
├── index.html          # 页面骨架 + 全部 CSS + 启动脚本
├── src/
│   ├── compat.js       # Chrome 61 兼容层（flex-gap 检测等）
│   ├── data.js         # 唯一数据源：24 城 / 13 机型 / 15 事件卡 / AT.CONFIG
│   ├── geo.js          # 经纬度、大圆距离、球面几何
│   ├── landmask.js     # 陆地掩码（判断城市光点是否落在陆地上）
│   ├── sim.js          # 全部游戏逻辑（需求/运力/槽位/结算/事件/终局），唯一真源
│   ├── save.js         # 自动存档：Storage JS API 优先 + localStorage 降级（见「自动存档」）
│   ├── render.js       # three.js 渲染层（球体、城市、航线弧、HUD 投射）
│   ├── ui.js           # 三层 UI：HUD / 抽屉面板 / 模态层（含续玩覆盖层 showResume）
│   ├── audio.js        # WebAudio 程序化音频（13 音效 + 三段落 BGM）
│   └── game.js         # 主循环、脚本装配、状态推进（含每 5 秒自动存档）
├── tests/
│   ├── headless.js     # 功能与结构断言（对不对）
│   ├── audio.js        # 音频层断言（该响的响了没有、参数对不对）
│   ├── ui-contract.js  # UI ↔ HTML/CSS 契约静态校验
│   ├── check-chrome61.py / check-fallback.py  # Chrome 61 静态扫描 + 降级行为验证
│   ├── verify-dist.py  # 打包产物核验（解压副本 file:// 实机）
│   ├── verify-heading.py  # 飞机朝向实机验证（读真实实例矩阵判「倒飞」）
│   └── smoke.js / smoke-render.py              # 轻量冒烟 / 实机冒烟+UI 操作链
├── tools/
│   ├── build_dist.py   # 打包为 air-tycoon.zip（小工具提交包）
│   ├── balance.js      # 多种子节奏与胜负分布（好不好玩）
│   ├── audit-econ.js   # 经济层可读性审计（合不合理）
│   ├── fit-demand.js   # 需求模型回归标定
│   ├── calib.js / calib-cost.js / diag-share.js / probe-cap.js  # 标定探针
│   ├── probe-heading.js  # 飞机朝向离线复算（真实 three.js，含内置反例）
│   ├── zoom-planes.py    # 把实机裁图放大拼接，供人眼核对朝向
│   └── gen-earth-tex.js / probe-cities.py           # 贴图生成与城市坐标探测
├── assets/             # three.js 与地球贴图
└── dist/               # 打包产物（不入库）
```


## 验证

```bash
cd vibegame/air-tycoon

# 对不对（193 项功能/结构断言）
node tests/headless.js

# UI 契约（50 项静态校验，不开浏览器）
node tests/ui-contract.js

# 音频（67 项：去抖叠层、总线结构、包络安全区、BGM 音序）
node tests/audio.js

# 飞机朝向（离线复算，含内置反例自证探针有效）
node tools/probe-heading.js

# 飞机朝向（实机，读渲染层真实实例矩阵判「倒飞 / 姿态抖动」）
C:/Users/ASUS/.workbuddy/binaries/python/envs/default/Scripts/python.exe tests/verify-heading.py

# 好不好玩（60 局节奏与胜负分布）
node tools/balance.js 60

# 合不合理（经济层可读性审计报告）
node tools/audit-econ.js

# 打包 + 提交包核验（解压副本 file:// 实机）
python tools/build_dist.py && python tests/verify-dist.py

# Chrome 61 静态扫描（扫 zip 内产物，非源码）+ 降级路径行为验证
python tests/check-chrome61.py && python tests/check-fallback.py

# 实机操作链（Playwright，需 Python + playwright + PIL）
C:/Users/ASUS/.workbuddy/binaries/python/envs/default/Scripts/python.exe tests/smoke-render.py
```

测试分层遵循 defcon 确立的三件套方法，并新增了契约层与兼容层：

| 层 | 脚本 | 回答什么问题 | 成本 |
|---|---|---|---|
| 契约 | `tests/ui-contract.js` | UI 要的东西 HTML 都给全了吗 | 1 秒，纯静态 |
| 功能 | `tests/headless.js` | 逻辑对不对 | 秒级，无头 |
| 音频 | `tests/audio.js` | 该响的响了没有、参数对不对 | 秒级，假 AudioContext |
| 朝向 | `tools/probe-heading.js` + `tests/verify-heading.py` | 飞机姿态对不对（有没有倒着飞） | 秒级离线 + 分钟级实机 |
| 实机 | `tests/smoke-render.py` / `tests/verify-dist.py` | 真的能点吗 | 分钟级，开浏览器 |
| 兼容 | `tests/check-chrome61.py` + `check-fallback.py` | 旧内核对不对 | 静态秒级 + 行为分钟级 |
| 平衡 | `tools/balance.js` | 好不好玩 | 分钟级，大样本 |
| 审计 | `tools/audit-econ.js` | 数据合不合理 | 只读，输出调参依据 |

**断言全绿 ≠ 数据合理**：结构断言查不出城市坐标重合、文本残留英文、节奏失衡这类「语义正确」的问题。所以契约 → 功能 → 音频 → 朝向 → 实机 → 兼容 → 平衡 → 审计，八层都要跑。

### 为什么「飞机朝向」要单独一层

**姿态错误是静默的**，而且它同时躲过了现有所有层：功能断言覆盖不到（那段代码依赖 THREE 与相机），像素体检只知道「有亮点」不知道亮点朝向，实机操作链只验证「点了有反应」。

实机反馈的现象是「有些飞机倒着飞」。根因在 `render.js` 的朝向推导：

```js
t = t < 0.5 ? t * 2 : (1 - t) * 2;   // 折叠成三角波 → t 是「弧上位置」
var fwd = (t < 0.5) ? 1 : -1;        // ← 拿位置判方向：位置每周期被经过两次，与方向无关
```

`t` 在一个往返周期里被**经过两次**（去程一次、回程一次），所以「`t` 落在哪一半」根本不含方向信息。正确做法是由**周期相位**推出方向，并把它抽成纯函数 `AT.geo.legAt(u)`，好让这条不变量能在**无头环境**里被永久钉住（`tests/headless.js` 的「往返航段层」）。

量到的偏差：离线探针在 30 组「航线 × 视角」里，每个航段有 **49.9%** 的相位在倒飞；实机读真实实例矩阵量到 **786 / 1580** 个判定样本倒飞（`dot = −1.00`，完全反向）。

三层的分工（缺一不可）：

| 装置 | 怎么判 | 为什么不能省 |
|---|---|---|
| `tests/headless.js` 往返航段层 | `fwd` 与 `dt/du` 同号；采样方向与真实位移同向（`dot>0`） | 纯几何、毫秒级、不依赖 THREE —— 日常改动后立刻能跑 |
| `tools/probe-heading.js` | 用真实 three.js 复算朝向公式，取机头方向 · 真实速度方向（`dot<0` 即倒飞），30 组场景 × 720 相位 | 覆盖多视角/多航线组合；**内置「修复前的错误公式」作为反例**，若反例未被检出则探针自报失效（否则「探针通过」没有证明力） |
| `tests/verify-heading.py` | 在真浏览器里**读渲染层真实的实例矩阵**，解出机头世界方向，与逐帧位移点乘 | 离线复算只能证明「公式对」，不能证明「画面上真的按这个公式来了」 |

`verify-heading.py` 有三个**必须写对**的判断细节（都踩过）：

- **必须由远侧（球背面）排除样本**：只判 NDC `z<1` 不够。球背面飞机的投影会翻号，算出的「机头屏幕向量」趋近零向量（实测出现过 `0.00px`），把它当退化样本会让判据量到噪声 —— 首版因此误报 15 个倒飞。加上「位于相机所在半球」后才干净（实测排除掉 1300+ 个远侧样本）。
- **采样窗必须长于一个完整往返周期**（`PLANE_PERIOD=14s`，最慢 `speed≈0.6` → 周期 ≈23s，故录 36s），否则只验到单程 —— 而这个 bug 恰好是「每个航段的一半」，只测一半周期有可能刚好躲过。脚本会统计掉头次数，为 0 直接判「覆盖不足」而不给通过。
- **必须在页面内按 rAF 节奏采样**：Python 侧 `page.evaluate` 往返一次几十毫秒，而退化帧只持续很短时间，慢采样抓不到相邻帧。故采样与统计都装进页面，Python 只取聚合结果。

截图前还会自动关掉季报模态 —— 录 36s 必然跨过季度结算，不关掉的话裁图截到的是弹窗文字。裁图放大拼接可用 `tools/zoom-planes.py` 复现（产物为过程截图，不入库）；不过飞机贴图在 390×844 下只有约 10px，**人眼核对只能作旁证，判定依据是实例矩阵**。

**一个被证伪的假设，记下来免得后人重走**：修倒飞时一度以为还存在第二类缺陷 —— 机头正对/背对相机时切向平行视轴，`atan2` 吃噪声导致姿态抖动（首版实机数据似乎支持：554 个样本里 22 个机头长度 <1.5px，最小 0.00）。但**排除远侧样本后不可测帧降到 0**（最小 4.68px），离线探针在 30 组场景里量到 `|sinθ|` 最小也有 0.083（阈值 0.05 从未触发）—— 那些 `0.00px` 测的是球背面飞机。所以 `render.js` 里保留的 `DEGEN_SIN` 退化保护是**廉价保险，不是已知 bug 的修复**，代码注释里也是这么写的。

方法论已沉淀为可复用技能：`~/.workbuddy/skills/rendered-heading-verify/`（含实机验证模板 `scripts/verify_heading.py`，原样放到本项目可跑）。

**音频为什么要单独一层**：音频 bug 是**静默**的。去抖窗口写错、总线接错、包络峰值为 0 都不会报错，只表现为「某个音没响」——这在无头 CI 里没人听得见、在实机里又容易归因成「我手机喇叭小」。`tests/audio.js` 用假 `AudioContext` 把每个音的**结构性事实**钉住：起了几个振荡器、频率多少、接到哪条总线、峰值是否为正。

**兼容层验的是两件不同的事**：`check-chrome61.py` 是**静态扫描**（扫 zip 内产物，逐条核对禁忌清单）；`check-fallback.py` 是**降级路径行为验证**（强制屏蔽能力，看页面是否仍可用）。后者的末尾会明确打印「本机无 Chrome 61 内核，未实测」——**降级逻辑写对了 ≠ Chrome 61 上真能跑**，交付说明中须保留该标记（见 minitool `css-compatibility.md §7`）。

契约层的方法论已沉淀为可复用技能：`~/.workbuddy/skills/web-ui-contract-check/`。


## 遗留问题

按优先级排列，都是已知且已量化的：

| 问题 | 现状读数 | 为什么值得改 |
|---|---|---|
| ~~**难度偏低**~~（2026-10-08 已修复） | 竞对改「资本部署」（不再囤现金）+ 事件加密加重后，40 局自动对局：Q10 第 1 名占比 **0%**、Q30 **10%**、Q50 **53%**、Q60 **88%**；Q60 玩家/最强竞对 **1.22×**（原 5.43×）；终局排名 1 名×35 / 2 名×4 / 3 名×1 | 已从「中段锁胜」改为「全程追赶、末段反超」的完整弧线 |
| **`giant` 门槛形同虚设** | 机队门槛 `winFleetSize = 40`，而托管 AI 平均机队 **113 架** | 五档评价实际只有「巨企」会被触发，另外四档玩家见不到 |
| **Chrome 61 未实测** | 本机无该内核 | 验的是「降级逻辑写对了」，**不等于**「Chrome 61 上真能跑」；交付说明须保留该标记 |

难度修复的两条主线（用户 2026-10-08 拍板）：① **强化竞对投资** —— 移除买机概率闸门、改为按现金部署机队，`rivalIncomeMul` 由 1.18 降到 1.0（同口径）；② **加强事件打击** —— 一局事件上限 14→20、间隔 3~7 季→2~5 季，并上调各负面卡的幅度。修复后单季亏损占比 **1.7%**（原近似 0），最差单季净利 −76 万。


## 协作约定

- **不要主动 `git commit` / `push`**；改动完成后汇总说明，由用户决定
- 改动 sim 逻辑后，`headless.js` + `balance.js` 必跑；改动 UI 后，`ui-contract.js` + `smoke-render.py` 必跑；改动音频后，`audio.js` 必跑；**改动渲染层（尤其飞机/弧线/相机）后，`probe-heading.js` + `verify-heading.py` 必跑**——姿态类错误不会让任何别的层变红
- **改了任何源码后都要重打包，再跑 `check-chrome61.py` / `verify-dist.py`**——这两个脚本扫的是 **zip 内产物**，不重打包会拿旧包给出**假绿**。踩过两次：一次是 `audio.js` 加入后仍报「未使用 WebAudio」；一次是 `sim.js` 改了 17 行、`air-tycoon.zip` 还是旧包，八层却「全绿」。`tools/build_dist.py` 会打印「内容有变化：xxx」以提示差异，别忽略这行。
- 保持零构建、零依赖；不引入 CDN 与外部资源
- **`localStorage` 只允许出现在 `src/save.js`**（小工具规范 §2.4 的降级路径，且须包在 `try/catch` 内）。要加持久化需求请复用 `AT.save`，不要在别处直接读写浏览器存储 —— 否则 `tests/check-chrome61.py` 的 ⑤b 会失败
- 不擅自改动单位口径与需求压缩系数（会连带破坏玩法闭环）


## 贡献者

小红书 VibeCoding 大赛参赛作品 · MIT License

## 设计细节

玩法、数值、素材与界面等实现细节见 [`DESIGN.md`](DESIGN.md)。
