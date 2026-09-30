# 拼豆城市 · perler-city

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

把**拼豆**的「一颗一颗填满钉板」和**模拟城市**的「RCI 供需、水电垃圾、人口涨跌」缝在一起：
每栋楼都是一张拼豆图纸，**第一次盖必须亲手拼出来**，拼满自动熨烫成片、落进城里；
之后这栋楼就算「已掌握」，花金币可以直接盖。

盖完之后才是真正的游戏：**住宅 / 商业 / 工业**三条需求互相拉扯，
**电力 / 供水 / 环卫**三条管网随时可能爆掉——停水停电人会搬走，垃圾积压会拖垮整座城的幸福。

- 参赛：小红书 vibecoding 大赛 · **#vibegame** 互动游戏赛道
- 形态：纯前端、零依赖、零构建，浏览器直接打开即玩，移动端优先
- 产物：`index.html` + `main.js`（可压缩成小红书小工具 zip，约 20 KB）

## 目录结构

```
perler-city/
├── index.html            ← 产物（由 tools/build.py 生成，勿手改）
├── main.js               ← 产物（由 tools/build.py 生成，勿手改）
├── perler-city.zip       ← 小工具上传包（由 `node ../../tools/build.mjs --pack` 生成）
├── 设定文档.md           ← 玩法 / 数值 / 美术规范
├── dist/                 ← 打包中间目录
├── tools/                  ← 构建 / 打包脚本（唯一真源）
│   ├── build.py            ← 拼装 index.template.html + src/game.js + data/buildings.json
│   ├── redraw.py           ← 图纸重绘与校验（方阵/对称/色号/末行地面/填充量）
│   └── preview.py          ← 离线把 25 张图纸渲染成对比图（人眼校对用）
├── tests/                  ← 验证 / 冒烟 / 截图脚本
│   ├── smoke_test.js       ← 无头冒烟测试（手写 DOM stub 跑真实 main.js）
│   ├── simulate.js         ← 数值推演（建第 N 栋时间 / 全程最低进账）
│   ├── shot_util.py        ← 截图 + 面板结构 dump（Playwright + Edge）
│   └── audio_check.py      ← 音频链路真机校验
├── data/
│   └── buildings.json      ← 25 张建筑图纸（ASCII 像素稿）+ 色卡 + 类别 + 称号表
└── src/
    ├── game.js             ← 游戏逻辑（RCI / 市政 / 拼豆台 / 渲染）
    └── index.template.html ← 页面外壳 + 样式
```


## 常用命令

```bash
# 1. 改完 src/* 或 data/*.json 后重新生成产物
python tools/build.py

# 2. 重画图纸：手动改 buildings.json 后跑这个做对称 / 色号 / 末行校验
python tools/redraw.py

# 3. 出预览图（25 张同屏对比）
python tools/preview.py

# 4. 无头跑通全流程（110 项断言，含七局：新手 / 供需 / RCI 收敛 / 面板结构 / 反死锁 / 重置城市 / 音效）
node tests/smoke_test.js

# 5. 校验并打包成小红书小工具 zip
node ../../tools/build.mjs --pack

# 6. 截图 + 排版结构 dump（需先 `pip install playwright`）
python tests/shot_util.py            # 8 档存档截图
python tests/shot_util.py --dump     # 6 份面板结构 dump（3 浮层 × 2 宽度）

# 7. 音频链路真机校验（音效看不着也截不出，只能开真浏览器验）
python tests/audio_check.py
```


## 视觉验证

`tests/shot_util.py` 用 Playwright + 系统 Edge 渲染真实页面，注入 8 档存档（空城 / 运转良好 / 全面告急 / 住宅详情 / 数据页（满负荷）/ 数据页（空城）/ 玩法图鉴 / 蓝图 / 蓝图窄屏 / 数据页窄屏）截图输出到 `.work/shots/`。脚本自带静态服务器，不需要另外开端口。

**改排版时用 `--dump` 而不是只看截图**：

```
python tests/shot_util.py --dump
```

它把当前浮层（默认 #utilView）渲染成缩进文本 + 盒模型（层次顺序 / 每行 x·宽·高 / 数值列是否成列 / 横向是否溢出），
支持市政 / 数据 / 蓝图三块面板，分别跑 390 与 360 两档宽度，共 6 份结构清单。截图只能人眼看，结构对不对、列齐不齐、窄屏挤不挤，这份清单说得更准。


## 开发约定

1. **`tools/` 是构建真源**。根目录 `index.html` / `main.js` 是产物，直接改会被下次构建覆盖。
2. 新建筑需同时改 `data/buildings.json`（元数据 + rows）和 `tools/redraw.py` 的 `ART`（图纸真源）：`rows` 必须是 N 行 × N 字符的方阵，色号必须在色卡里声明。`use` / `gen` 的 key 只能是 `power` / `water` / `trash`。构建时会自动校验，不合规直接报错退出。
3. 产物必须满足小红书小工具约束（构建脚本已内置校验，不通过会拒绝打包）：
   - 脚本外置，无内联 `<script>`；`index.html` 用 `<script src="./main.js">` 引入
   - 经典脚本，禁止 `import` / `export`
   - 零外部资源（无 CDN、无外链字体、无网络请求）
   - 安全区用 `var(--safe-area-inset-*, env(...))` 组合
   - 禁止用 UA 判定宿主 App 内缩
4. **元素 id 校验是自动的**：`build.py` 会扫描 JS 里所有函数定义，凡「函数体含 `getElementById(`」或「把自己首参传给已知取元素函数」的，都算取元素函数（当前识别出 `$` 与 `setChip`），再把这些函数的字符串首参当作 id 去 HTML 里比对。**新增同类 helper 无需改构建脚本**，但仍建议跑构建时看一眼识别出的函数名列表是否符合预期。
5. 改完数值/经济后跑一次 `node tests/simulate.js`，把"建第 N 栋"时间和"全程最低进账"摆出来，能看出早期死锁或后期金币溢出。
6. 每次改动后至少跑一次 `node tests/smoke_test.js`，确保核心循环没断。
   - 注意：**游戏内时间只在 rAF 回调里推进**，测试里要「边 sleep 边推帧」（`advance()`），光 sleep 不会让时间流逝。
   - 不要用 `b.size` / `b.total` 这类运行时属性（JSON 里没有），测试脚本应从 `rows` 自己推导。


## 发布流程（小红书小工具）

1. `python tools/build.py` → `node tests/smoke_test.js` → `node ../../tools/build.mjs --pack`
2. 上传 `perler-city.zip` 为小红书小工具（zip 根目录必须是 `index.html`）
3. 发布笔记挂载小工具，带 **#小红书vibecoding大赛** + **#vibegame**

## 设计细节

玩法、数值、素材与界面等实现细节见 [`DESIGN.md`](DESIGN.md)。
