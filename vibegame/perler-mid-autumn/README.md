# 中秋拼豆坊 · Perler Mid-Autumn

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

基于 [`vibegame/perler-bead-game`](../perler-bead-game/) 的拼豆填色玩法改造的**中秋主题版**，为小红书「邀你把月亮写进提示词 · 中秋国风 vibecoding」活动而生（活动公告归档见 [`vibeknow/moon-3d/xiaohongshu/`](../../vibeknow/moon-3d/xiaohongshu/)）。纯前端零依赖，离线可用。

## 打开方式

双击 `index.html`，或由源码重新构建（见下）。

## 玩法与活动功能

- **拼豆核心**：选定月夜纹样后按色号逐格填豆，拼满 100% 触发熨烫融合 → 盖「圆」字印章 → 桂花飘落 → 结算。
- **🏮 猜灯谜（中秋小游戏）**：每拼成一幅图案点亮一盏灯谜；首页「猜灯谜」横幅与底栏「更多」菜单均可进入，8 条中秋灯谜，答对点亮灯笼并显示注解，进度持久化。
- **🌙 沉浸赏月**：全局夜空底色 + 满月月晕 + 星尘闪烁 + 桂花飘落，16 幅图案全部取材月亮、玉兔、桂花、月饼、团圆等中秋意象。

## 导出图纸（线下拼豆）

与 [`perler-zodiac`](../perler-zodiac/) 同款能力，三个入口：首页每张卡片左上角「导图纸」、拼豆台底栏「更多 → 导出图纸」、拼成结算弹窗「存图纸」。

- **图纸内容**：标题与规格（分类/尺寸/豆数/色数）、带色号字母的编号网格、每 5 行列的坐标粗线与数字、两列色号图例（色样 + 色名 + 数量）、右上角朱红印章。
- **落图方式随环境自动切换**：小红书小工具容器内 → 按钮变「存到相册」，走 `writeTempFile` → `saveImageToPhotosAlbum`（容器禁用 `a[download]`，打印按钮自动隐藏）；普通浏览器 → 「保存图片」存 PNG（2x 分辨率）+「打印 / 存 PDF」。
- 预览默认全景：整张图纸一屏看全，点图纸可放大看色号。

## 工程约定

| 项 | 说明 |
|----|------|
| 唯一真源 | `_dev/build.py`，**不要直接改 `index.html` / `main.js`** |
| 图案稿 | `_dev/patterns.py` → 生成 `patterns.json` + `preview.png` |
| 构建产物 | `index.html` + `main.js` |
| 打包 | `_dev/build_zip.py`，校验并打包为小红书小工具 zip |
| 体检 | `_dev/check.py` —— 色卡 RGB 距离 / 图案像素网格与行宽（验圆度） |
| 冒烟测试 | `_dev/smoke_test.js`（jsdom），覆盖拼图闭环 + 灯谜 |
| 设定 | [`设定文档.md`](设定文档.md) |

## 构建命令

```bash
python _dev/patterns.py     # 图案数据 + 预览图
python _dev/check.py pal    # 色卡体检：任意两色 RGB 距离需 >= 60
python _dev/check.py 明月    # 打印像素网格与行宽序列（验圆度）
python _dev/build.py        # 生成 index.html / main.js
python _dev/build_zip.py    # 前置校验 + 打包 zip
cd _dev && npm i && node smoke_test.js   # 运行时冒烟
```

## 物料状态

| 项 | 状态 |
|----|------|
| zip | `perler-mid-autumn.zip`（26.8 KB，远小于 2MB 建议值） |
| 图标 | `icon.png`（1:1，2048×2048） |
| 小红书笔记 | 未撰写 |

## 与原版的差异

- 全新 16 幅中秋图案库（原版 20 幅国风纹样不复用）；
- 中秋 16 色色卡，并加了一条原版没有的硬约束：**任意两色 RGB 距离 ≥ 60**（逐格填豆靠颜色分辨，太近认不出）；
- 新增猜灯谜活动线及对应存档键（`pma_riddle` / 存档前缀全部由 `pbg_` 改为 `pma_`，避免与原版互相覆盖）；
- 夜空主题皮肤（背景 / 印章「圆」/ 桂花粒子 / 星尘）。
