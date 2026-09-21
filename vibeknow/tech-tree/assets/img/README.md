# 配图目录

把配图按文件名放在本目录即可，**页面无需任何改动**：文件名对上就自动显示，对不上则继续显示占位块。

- 条目图：`<科技 id>.webp`，如 `stone-tools.webp`、`steam-engine.webp`、`machine-learning.webp`
- 时代封面：`cover-<时代 key>.webp`，如 `cover-prehistoric.webp`、`cover-industrial.webp`（key 见 `data.js` 的 `ERAS`）
- 规格：条目图 640×360，时代封面 960×540，WebP，条目图 ≤45 KB / 封面 ≤90 KB
- 页面另有 `jpg / jpeg / png` 后缀回退链，但 WebP 体积最优

**科技树的节点不配图**（节点是紧凑小卡，只有年代、名称与连线），图片只用于详情页大图与图鉴视图的卡片、时代封面。

完整的逐张提示词（含年代列）、尺寸与验收清单见 [`../../_dev/IMAGE_PROMPTS.md`](../../_dev/IMAGE_PROMPTS.md)
（该清单由 `python _dev/gen_image_prompts.py` 从 `data.js` 自动派生）。

本 README 不会被打进 zip（打包脚本只收 `.html/.css/.js/图片/字体/.json`）。
