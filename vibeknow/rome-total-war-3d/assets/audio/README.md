# 音频素材留档

本目录**不进包**（`tools/pack.mjs` 已排除）：容器上传白名单不收任何音频扩展名，
运行时用的是 `bgm.js`（base64 字符串经 Web Audio 解码播放）。

## 当前 BGM

| 项 | 值 |
|----|-----|
| 曲目 | Total War: Rome II — Main Menu（游戏原声） |
| 来源文件 | `Total War- Rome 2 OST - Main Menu.mp4`（4:01，AAC 44.1kHz 立体声） |
| 版权方 | SEGA / Creative Assembly（**商业原声，未取得商用授权**） |
| 选用乐句 | 8.50s → 125.53s（117.0s） |
| 织体相似 | 0.986 |
| 波形互相关 | **1.000** —— 曲子有真正的重复段，接缝几乎听不出来 |
| 相位对齐 | 末端从 125.50s 挪到 125.53s（+33ms，避开交叠梳状感） |
| 编码 | 64kbps 单声道 22.05kHz |
| 解码后 | 0.893 MiB（门禁 1 MiB，余量 109 KB） |
| `bgm.js` | 1.19 MB（门禁 2 MB） |

## ⚠️ 发布前必读

**这首是商业游戏原声，没有商用授权。** 目前只可用于本地自测。
若要公开发布（小红书 / 公开仓库），二选一：

1. 换成自有版权、CC0 / CC-BY 或已购授权的曲目，重跑下面三条命令；
2. 取得 SEGA / Creative Assembly 的书面授权并留档凭证。

替换曲目不影响代码——重跑一遍即可，页面不需要改。

## 重跑链路

```bash
# ① 若源是视频：先抽音轨（ffmpeg 不在 PATH，脚本用 imageio_ffmpeg 的二进制）
python tools/extract-audio.py "源视频.mp4" -o assets/audio/bgm-src.mp3

# ② 找循环点（看输出末尾「=== 推荐 ===」给出的 --a / --b）
node tools/analyze-bgm.mjs "assets/audio/bgm-src.mp3"

# ③ 截段 + 重编码（--a / --b 换成上一步给的秒数）
node tools/make-bgm.mjs "assets/audio/bgm-src.mp3" --a 8.50 --b 125.53 --kbps 64
```

产物：`assets/audio/bgm.js`（进包）、`assets/audio/bgm.mp3`（不进包，仅中间产物）。
