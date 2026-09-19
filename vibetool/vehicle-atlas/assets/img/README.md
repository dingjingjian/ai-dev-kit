# 配图目录

把配图按文件名放在本目录即可，**页面无需任何改动**：文件名对上就自动显示，对不上则继续显示占位块。

- 条目图：`<条目 id>.webp`，如 `car-01.webp`、`train-05.webp`、`ship-cargo-03.webp`
- 分类封面：`cover-<分类 key>.webp`，如 `cover-car.webp`、`cover-ship-pax.webp`
- 规格：条目图 640×360，分类封面 960×540，WebP，条目图 ≤45 KB / 封面 ≤90 KB
- 页面另有 `jpg / jpeg / png` 后缀回退链，但 WebP 体积最优

完整的逐张提示词、尺寸与验收清单见 [`../../_dev/IMAGE_PROMPTS.md`](../../_dev/IMAGE_PROMPTS.md)
（该清单由 `python _dev/gen_image_prompts.py` 从 `main.js` 自动派生）。

本 README 不会被打进 zip（打包脚本只收 `.html/.css/.js/图片/字体/.json`）。
