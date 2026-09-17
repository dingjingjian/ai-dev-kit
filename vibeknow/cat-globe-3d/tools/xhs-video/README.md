# cat-globe-3d 小红书宣传片 · 录制与字幕解说

把「为了小猫我飞遍全球」录成竖屏 9:16 宣传片。真源是仓库根的
[`/.skill/demo-video-recorder/`](../../../.skill/demo-video-recorder/SKILL.md)（v1.3.0），
本目录是它在 cat-globe-3d 上的**实例**：只管 `caption_config.json` 文案/样式与产物，
引擎与录制脚本不改在这里。

## 产物（`../../xiaohongshu/`）

| 文件 | 说明 |
|------|------|
| `cat-globe-3d-demo.mp4` | 阶段一 · 无字幕纯录屏底片（1080×1920，25fps，51.3s），供二次创作 |
| `cat-globe-3d-demo-字幕解说版.mp4` | 阶段二 · 字幕 + 中文解说成片（音频已 +6dB 抬响度） |

## 演示模式（`?demo`，本目录配套的 app 侧改造）

`assets/app.js` 支持 `?demo&warm=2&pick=7,22,0,18,23[&loop]`：
图鉴页整页扫动 → 滚到每只猫逐个点心动 → 自动进飞行页逐只飞 → 自动进基因页扫动收尾。
**默认关闭，不影响正常使用**；演示的节奏常量（`DEMO_*`）集中在 app.js 顶部。
演示航线默认 伦敦→开罗→东京→加州→悉尼（跨五大洲）。

## 复现步骤

```bash
cd tools/xhs-video

# 0) 自检二进制
python ../../.skill/demo-video-recorder/record_demo.py --check

# 1) 起多线程静态服务（不能用单线程 http.server，猫咪图会被排队拖成占位爪印）
python serve_static.py            # 默认 127.0.0.1:8177

# 2) 阶段一录制（--url 指向步骤 1 的服务；时长 47s，成片约 51s）
python probe_demo.py --live                 # 先跑一遍拿时间轴
python probe_demo.py                        # 抽帧确认画面（_probe/）
python ../../.skill/demo-video-recorder/record_demo.py \
    --url "http://127.0.0.1:8177/index.html?demo&warm=2&pick=7,22,0,18,23" \
    --out ../../xiaohongshu/cat-globe-3d-demo.mp4 --duration 47 --warm 2

# 3) 阶段二字幕+解说
python build_captioned.py --clip 12:7       # 先试一小段样式
python build_captioned.py                   # 全片：字幕 + edge-tts 解说
python build_captioned.py --no-voice        # 只要字幕

# 4) 音频后期（edge-tts 直出偏轻，+6dB；视频流复制不重编码）
ffmpeg -i 成片.mp4 -c:v copy -af volume=6dB -c:a aac -b:a 128k \
    -movflags +faststart 输出.mp4
```

## 字幕时间轴（2026-09-16 版，按成片实测对齐）

录制的负载会让成片比探针打点**整体拉长且各段不均**（本次 44s 流程录成 51.3s），
cues 必须按成片实测量：

| 段 | 成片时间 | 画面 |
|----|---------|------|
| 加载+热身 | 0 – 2.8s | 白屏 → 图鉴顶部静置 |
| 图鉴扫动 | 2.8 – 6.5s | 下 → 上整页扫 |
| 逐个心动 | 6.5 – 12.8s | 滚到卡片逐个点 ♥（cue1/cue2 边界 6.9s） |
| 飞行页 | 12.9 – 42.2s | 伦敦→开罗→东京→加州→悉尼 |
| 基因页 | 42.2 – 51.3s | 扫动看报告，回顶收尾 |

配色跟作品本体同温：标题奶油白 `#FFF7F2`、副标草莓粉 `#FFC9D8`、分隔线 `#FF8FAE`、
遮罩深梅 `#2E1420`（都是 `caption_config.json` 的 style 字段，别改引擎）。

## 本目录文件

| 文件 | 职责 |
|------|------|
| `caption_config.json` | **唯一改文案/样式/时间轴的地方** |
| `build_captioned.py` / `caption_render.py` / `make_preview.py` | 引擎三支（与真源拍平同构，`sync_check.py` 校验） |
| `record_demo.py` | 录制脚本副本（真源在 `.skill/`，此处仅便于单目录复现） |
| `serve_static.py` | 多线程静态服务（ThreadingTCPServer，禁请求日志） |
| `probe_demo.py` | 演示探针：抓 `DEMO` console 打点 + 按时刻抽帧 |
| `_probe/` | 探针抽帧与概览拼图（过程产物，可随时清） |
| `.work/` | 字幕卡片、tts、中间 mp4（git 忽略） |

改完引擎到 `.skill/demo-video-recorder/` 跑 `python sync_check.py`；
两边漂移时以真源 `--sync` 覆盖。

## 已知边界（老实说）

- 底片是真实运行的页面（无头 Chromium + SwiftShader 软渲染 WebGL），不是合成示意图；
  软件渲染下帧率不高，快速飞行段在低端真机上会更流畅。
- 成片最后 ~1.5s 是基因页顶部的自然定格收尾（`?demo` 非 loop 模式的终点），非卡死。
- 解说为 edge-tts（zh-CN-XiaoxiaoNeural，联网合成）；离线环境跑 `--no-voice` 只出字幕。
- 根目录 `cat-globe-3d.zip` 是加 `?demo` 之前打包的分发包，未随本次改动重打包；
  要分发含演示模式的版本需重跑 `node pack.mjs` + 审计。
