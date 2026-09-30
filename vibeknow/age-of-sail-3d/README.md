# 大航海时代 · 帆船图鉴

> **分类**：`#vibeknow` 人文知识　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

一个以大航海时代（Age of Sail，约 1200–1700）为背景的帆船图鉴 app。
**组建舰队 → 起锚出港 → 舰队沿岸航行、逐艘检阅帆船 → 航海日志**，
致敬《大航海时代4》那套"跑遍七大海域、把船一艘艘买回来"的玩法。
30 艘帆船按 5 大海域家族（北海 / 地中海 / 大西洋 / 印度洋 / 东亚）组织，
也可自选舰队自由编成；舰队行进时地球组件实时标注每艘船的**建造地（船坞 / 港口城市）**。

> 本项目参照 [`jurassic-park-3d`](../jurassic-park-3d/) 的技术框架构建，
> 底层逻辑从「园区游览」改为「航海检阅」，数据从恐龙换成帆船。

## 打开方式

双击 `index.html`。资源在 `assets/`，需与 `index.html` 保持同级目录。


## 素材

**图位全部已预留；已出的图按文件名覆盖即可，无需改代码（音频要先重跑 `tools/make-bgm.mjs`，见 §背景音乐）。只剩首页 hero 地区轮播 5 张待出。**

| 图位 | 数量 | 路径 | 需求文档 |
|------|------|------|----------|
| 帆船图 | 30 | `assets/ships/<slug>.webp` | [`docs/帆船图片素材需求.md`](docs/帆船图片素材需求.md) |
| 航海徽标 / 港口竖版两帧 / 首页 hero 轮播 ×5 / 海图纸纹 / 舰队横幅 ×6 | 16 | `assets/tex/*.webp` | [`docs/场景与横幅配图需求.md`](docs/场景与横幅配图需求.md) |
| 背景音乐 | 1 | `assets/audio/bgm.js`（base64 音频，由 [`tools/make-bgm.mjs`](tools/make-bgm.mjs) 从源曲目 `assets/audio/bgm.mp3` 生成） | [`docs/背景音乐需求.md`](docs/背景音乐需求.md) |

代码侧的图位路径也标注在 `index.html` 的 `<style>` 顶部。
每份需求文档都含**可直接照抄的提示词**（音频为规格与听感清单）、硬约束与常见问题排查表。
目录内还各有一份 `README.md` 列出待补齐的文件名清单。

**缺图时的表现**：帆船图回退到该船的 `color` 色卡，港口/徽标/横幅回退到下一级底或纯渐变，
**五页流程一条不少**。因此图片可以分批补，不必等齐了再上线。


## 兼容性（Chrome 61 回退层）

最低基线是 **Android 8.1 出场 Chrome / WebView 61**。做法是「基线层 + 能力检测后的增强层」，
不为旧内核另起一套页面：

| 能力 | 基线（Chrome 61 可用） | 增强（检测后启用） |
|------|----------------------|------------------|
| Flex `gap` | 子项 `margin-left` | `.supports-flex-gap` 下换 `gap` 并清 margin |
| `clamp()` | `--hero-h` 固定值 + 按视口高的媒体查询分档 | 不引入 |
| `env(safe-area-inset-*)` | `--sat / --sattop / --sab` 在 **`body`** 上算（容器把 `--safe-area-inset-*` 注入在 `html` 还是 `body` 都认 —— 只写在 `:root` 上算一次的话，注入在 `body` 时会取不到而静默退成 0）。无注入则 `0 / 8px / 0` | `@supports` 块里退成 `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))` —— 认注入变量、真机认 `env()` |
| `:focus` | `:focus` 描边基线 | 不用 `:focus-visible` |
| WebGL 3D | 地球槽内挂 `.globe-down`，组建舰队/出港/航海/日志照常 | 完整地球 |
| `localStorage` | `try/catch` 包住，读写失败则自选舰队只活在本次会话 | 自选舰队跨会话保留 |
| 出港切换 | 两张图 `opacity` + `transform:scale` 交叉淡化，Chrome 61 原生可用 | 不引入 |
| 多行截断 | 介绍文字用 `-webkit-line-clamp`（Chrome 61 支持）限行 | 不引入 |
| 背景音乐 | `AudioContext` + `decodeAudioData` + `GainNode` 包络（Chrome 61 原生）；手势后才起播 | 没有 `AudioContext` / 解码失败则开关隐藏，不引入第三方音频库 |
| 笔记分享 | 能力检测 `window.xhs.miniTool.postNote`，没有就隐藏按钮；`writeTempFile` 缺失时直接传 `data:uri` | 不引入任何第三方 SDK |
| 船图转 base64 | `XMLHttpRequest`（`responseType:'blob'`）+ `FileReader.readAsDataURL`，拿到逐字节原图 | 不走 `canvas.drawImage` + `toDataURL` —— 既避免 `file://` 下画布被污染，也避免重编码 |

**3D 不可用不再是全屏报错**：地球只是标建造地的组件，它挂了就只在槽内降级，
底下的组建舰队、自选舰队、出港动画、航海检阅、航海日志一条不少。


## 项目结构

```
age-of-sail-3d/
├── index.html                    # 页面骨架与全套样式（五页 + 五套舰队主题色 + 海图叠层）
├── docs/
│   ├── 帆船图片素材需求.md        # 帆船图 ×30 的图位、规格与提示词
│   ├── 场景与横幅配图需求.md      # 徽标 / 港口两帧（横竖）/ 海图纸纹 / 舰队横幅 ×6
│   └── 背景音乐需求.md            # base64 + Web Audio 方案、裁帧规格、版权与验收清单
├── assets/
│   ├── ships.js                  # 帆船数据集（30 艘，含六维 stats 与排水量）
│   ├── app.js                    # 组建舰队/自选舰队/出港/航海/日志 + 地球定位 + 背景音乐
│   ├── three.min.js              # Three.js（复用自 earth-3d）
│   ├── earth.jpg                 # 地球贴图（复用自 earth-3d）
│   ├── clouds.png                # 云层贴图（复用自 earth-3d）
│   ├── flexgap.js                # Flex gap 能力检测
│   ├── ships/                    # 帆船图 ×30（<slug>.webp，待出图）
│   ├── tex/                      # 徽标/港口/横幅/纸纹（待出图）
│   └── audio/                    # 背景音乐（bgm.js = base64 音频，进包；bgm.mp3 = 源曲目，不进包）
├── tools/
│   ├── analyze-bgm.mjs           # 找循环乐句（织体相似 + 接缝安静 + 整小节 + 波形互相关）
│   └── make-bgm.mjs              # 源曲目 → assets/audio/bgm.js（裁帧 + base64 + 门禁核对）

└── README.md
```


## 打包

```bash
node tools/analyze-bgm.mjs assets/audio/bgm.mp3 --data-end 101.15  # 换曲目：先找循环乐句
node tools/make-bgm.mjs            # 生成 assets/audio/bgm.js（裁帧 + base64 + 门禁核对）
node ../../tools/build.mjs --pack                      # 产出 age-of-sail-3d.zip（zip 根即 index.html）
```

`--data-end 101.15` 是本项目特有的一步：音频只打前 101.15s 进包，
不告诉工具就会推荐一段**根本播不到**的乐句。工具会给出可直接粘贴的 `BGM_A / BGM_B / BGM_X`。


## 分类判定

没有任务、没有输赢，用户点开是为了"组建一支舰队，跟着它把一整个时代的帆船看一遍，
知道每种船造在哪儿、强在哪"，看完脑子里多一份对船舶史与地理的认知 → `#vibeknow`。
地球是标注建造地的组件，3D 是手段而非目的，故不归 `#vibeart`。

## 设计细节

玩法、数值、素材与界面等实现细节见 [`DESIGN.md`](DESIGN.md)。
