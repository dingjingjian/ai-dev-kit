# 音频目录

| 文件 | 角色 | 是否进 zip |
| --- | --- | --- |
| `bgm.js` | **运行时载荷**：`window.TT_BGM`（base64 音频），由 `_dev/audio/make-bgm.mjs` 生成 | 进（`.js` 在白名单内） |
| `bgm.mp3` | **构建输入**：重编码后的源曲目，只用于核对与重跑工具 | 不进（音频扩展名不在打包白名单内，脚本自动排除） |

页面不引用任何音频文件路径：容器上传白名单不收音频扩展名、CSP 又禁 `data:` / `blob:` 媒体源，
所以音频只能以 base64 字符串藏在 `bgm.js` 里，运行时由 `main.js` 解成 ArrayBuffer 交给 Web Audio 播放，
全程不产生任何 URL。完整规格、循环点依据与**版权提示**见
[`../../docs/背景音乐需求.md`](../../docs/背景音乐需求.md)。

换曲目：

```bash
cd _dev/audio && npm i mpg123-decoder @breezystack/lamejs   # 仅构建需要
node _dev/audio/make-bgm.mjs "新曲目.mp3"
```

本 README 不会被打进 zip（打包脚本只收 `.html/.css/.js/图片/字体/.json`）。
