# assets/img/ · 配图落位目录

把生成的图鉴插画放这里，文件名严格为 `<base>.webp`，base 见
`_dev/IMAGE_PROMPTS.md` 与 `_dev/image-prompts.json` 的逐张清单：

- 条目图 `loco-03.webp`、`pax-04.webp`、`freight-02.webp`、`station-01.webp` …（640×360）
- 分类封面 `cover-loco.webp`、`cover-pax.webp`、`cover-freight.webp`、`cover-station.webp`（960×540）

## 工作流

1. 用你的生图模型，对着 `_dev/ref/` 的真实照片 + `_dev/ref-index.md` 的「外观要点」，
   生成图鉴式侧视（车辆）/ 正立面（车站）插画。
2. 若工具只出 PNG/JPG，先落到 `_dev/raw_img/<base>.png`。
3. 跑 `python _dev/process_images.py` 自动缩放 + 转 WebP + 压体积到预算内，
   输出到本目录。
4. 跑 `python _dev/build_zip.py` 打包整站（≤ 2 MB）。

页面 `index.html` 已内置占位块：未放图时显示占位，放入同名 `.webp` 后自动覆盖。
