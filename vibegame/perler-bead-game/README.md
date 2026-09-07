# 国风拼豆坊 · Perler Bead Game

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

国风拼豆填色网页小游戏：选定纹样后按色号逐格填豆，拼满 100% 触发熨烫融合 → 盖「成」字印章 → 落花粒子 → 结算（用时/步数/失误/星级）。纯前端零依赖，离线可用。

中秋主题版（同引擎 + 灯谜/祝福笺/夜空皮肤）见 [`vibegame/perler-mid-autumn/`](../perler-mid-autumn/)。

## 打开方式

双击 `index.html`，或由源码重新构建（见下）。

## 玩法

- **拼豆核心**：选色珠点按/拖动连续填豆、橡皮、提示（计失误）、二次确认清空。
- **双模式**：临摹（钉板淡底显示参照图）／挑战（不画参照、顶栏缩略图虚化），底栏「更多」菜单内切换。
- **顶栏纯展示**：参照缩略图 + 图纸名与「分类 · 尺寸 · 豆数 · 色数」+ 进度环 + 计时星级（顶部零按钮，避免与宿主 App 控件冲突）。
- **底栏 6 键**：图纸 / 画笔 / 橡皮 / 提示 / 清空 / 更多（模式切换、我的画廊、音效、背景音乐、玩法说明）。
- **每幅独立进度**：切走再回来自动恢复；拼成后触发熨烫动画与结算，收入画廊。
- **音效**：五声音阶 BGM 与木鱼/编钟/古筝音效，全部 Web Audio 程序化合成，零音频文件。

## 工程约定

| 项 | 说明 |
|----|------|
| 唯一真源 | `_dev/build.py`，**不要直接改 `index.html` / `main.js`** |
| 图案稿 | `_dev/patterns.py` → 生成 `patterns.json` + `preview.png` |
| 构建产物 | `index.html` + `main.js` |
| 打包 | `_dev/build_zip.py`，前置校验 + 打包小红书小工具 zip |
| 体检 | `_dev/check.py` —— 色卡 RGB 距离 / 图案像素网格与行宽（验圆度） |
| 冒烟测试 | `_dev/smoke_test.js`（jsdom），覆盖拼图闭环 |
| 设定 | [`设定文档.md`](设定文档.md) |

## 构建命令

```bash
python _dev/patterns.py     # 图案数据 + 预览图
python _dev/check.py pal    # 色卡体检：任意两色 RGB 距离需 >= 60
python _dev/check.py 铜钱   # 打印像素网格与行宽序列（验圆度）
python _dev/build.py        # 生成 index.html / main.js
python _dev/build_zip.py    # 前置校验 + 打包 zip
cd _dev && npm i && node smoke_test.js   # 运行时冒烟
```

## 物料状态

| 项 | 状态 |
|----|------|
| zip | `perler-bead-game.zip`（24.4 KB，远小于 2MB 建议值） |
| 图标 | `icons/` |
| 小红书笔记 | `xiaohongshu/` |

## 分类判定

有明确过关条件与逐关推进的反馈，「再来一张」的驱动力来自玩法而非产出 → `#vibegame`。同为拼豆题材的 `perler-bead-designer` 产出的是图纸（工具闭环），两者不同分类。
