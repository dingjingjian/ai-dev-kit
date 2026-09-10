# 十二生肖拼豆坊 · Perler Zodiac

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

十二生肖主题拼豆填色网页小游戏：选一头生肖兽，按色号逐格填豆，拼满 100% 触发熨烫融合 → 盖「成」字印章 → 结算（用时/步数/失误/星级）。**支持一键导出线下制作图纸**（编号网格 + 色号图例 + 用料清单），可保存 PNG 或打印存 PDF，照图在实体钉板上拼豆。纯前端零依赖，离线可用。

基于 [`vibegame/perler-bead-game/`](../perler-bead-game/) 同构引擎（含中秋版 [`perler-mid-autumn/`](../perler-mid-autumn/)），本版差异：图案库换为 12 生肖、品牌与存档键独立（`pzd_`）、新增「导出图纸」能力。

## 打开方式

双击 `index.html`，或由源码重新构建（见下）。

## 玩法

- **拼豆核心**：选色珠点按/拖动连续填豆、橡皮、提示、二次确认清空；临摹／挑战双模式。
- **导出图纸（本项目新增）**，三个入口：
  1. 首页每张生肖卡左上角「导图纸」——不进游戏直接拿图；
  2. 拼豆台底栏「更多 → 导出图纸」——导当前图案；
  3. 拼成结算弹窗「存图纸」。
- **图纸内容**：标题与规格（尺寸/豆数/色数）、带色号字母的编号网格、每 5 行列的坐标粗线与数字、两列色号图例（色样 + 色名 + 数量）、右下角操作提示。照色号逐格放豆，线下拼豆不再靠猜色。
- **落图方式随运行环境自动切换**（小红书小工具容器禁用 `a[download]`，故做双分支）：
  - **小红书容器内**：按钮变「存到相册」，走 `writeTempFile` → `saveImageToPhotosAlbum` 存进系统相册；「打印 / 存 PDF」自动隐藏（容器无打印能力）。
  - **普通浏览器**：「保存图片」存 PNG（2x 分辨率，打印清晰）+「打印 / 存 PDF」（打印样式已裁掉全部游戏 UI，只出图纸本体）。

## 工程约定

| 项 | 说明 |
|----|------|
| 唯一真源 | `_dev/build.py`，**不要直接改 `index.html` / `main.js`** |
| 图案稿 | `_dev/patterns.py` → 生成 `patterns.json` + `preview.png` |
| 构建产物 | `index.html` + `main.js` |
| 打包 | `_dev/build_zip.py`，前置校验 + 打包 zip（产物 `perler-zodiac.zip`） |
| 体检 | `_dev/check.py` —— 色卡 RGB 距离 / 图案像素网格与行宽 |
| 冒烟测试 | `_dev/smoke_test.js`（jsdom），覆盖拼图闭环 + 导出图纸闭环 |
| 截图自检 | `_dev/_shot_export.py`（Playwright + Edge），导出面板与打印视图目视校验 |
| 容器分支自检 | `_dev/_shot_container.py`，注入 mock `window.xhs.miniTool` 验证容器内/浏览器两条导出路径 |
| 设定 | [`设定文档.md`](设定文档.md) |

## 构建命令

```bash
python _dev/patterns.py     # 图案数据 + 预览图
python _dev/check.py pal    # 色卡体检：任意两色 RGB 距离需 >= 60
python _dev/check.py 寅虎   # 打印像素网格与行宽序列
python _dev/build.py        # 生成 index.html / main.js
python _dev/build_zip.py    # 前置校验 + 打包 zip（同时生成 dist/ 供冒烟用）
cd _dev && npm i && node smoke_test.js   # 运行时冒烟
```

> Python 需带 Pillow（预览图渲染）。本机可用 `C:\Users\ASUS\.workbuddy\binaries\python\envs\default\Scripts\python.exe`（已装 Pillow + Playwright）。

## 物料状态

| 项 | 状态 |
|----|------|
| zip | `perler-zodiac.zip`（约 26 KB） |
| 图案预览 | `_dev/preview.png`（12 生肖总览） |

## 分类判定

同为拼豆题材：`perler-bead-designer` 是设计工具（产出图纸），本作是游戏（逐格填色 + 过关反馈），且新增的导图纸是「把线上玩过的图案带到线下实体拼豆」的桥，不改变游戏本体定位 → `#vibegame`。
