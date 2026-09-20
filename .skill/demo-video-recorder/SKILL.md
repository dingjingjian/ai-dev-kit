---
name: demo-video-recorder
description: 把带 ?demo 自动播放（或任意免手动交互）的网页/H5/小工具，录制为小红书竖屏 9:16 mp4（1080×1920）。专治手录滑动卡顿、画面只显示顶部一块、左右黑边、开头掉帧、监控/图片太小等问题。可一键出两个版本：**阶段一录屏版**（纯画面、无字幕无解说，供后期二剪）+ **阶段二字幕解说版**（Pillow 渲卡片的电影感字幕，三套主题可选，含淡入上浮动画 + edge-tts 中文解说）。当用户要把单页 demo / 浏览器作品 / 小游戏录成可发小红书·B站的竖屏宣传片（纯录屏版或带字幕解说版），或抱怨成片字幕样式简陋难看时使用。
agent_created: true
metadata:
  version: "1.3.0"
---

# 网页 Demo 竖屏宣传片录制（?demo 自动播放 → 9:16 mp4）

把「会自动演示、无需任何手动滑动/点击」的网页，用无头浏览器录成一段竖屏视频。
**核心思想：让 app 自己跑，而不是录人操作**——手录滑动必然抖（惯性、momentum 回弹、坐标错位），
所以给 app 加一个 `?demo` 自动播放模式（见下文「app 侧改造」），再驱动浏览器录整条流程。

## 文件位置与副本（四处，别改飘）

| 位置 | 角色 | 入库 |
|------|------|------|
| `.skill/demo-video-recorder/`（仓库根） | **真源**，唯一权威版本 | ✅ git 跟踪 |
| `~/.workbuddy/skills/demo-video-recorder/` | 用户级副本，**供 Skill 工具发现**（跨项目可用）；用 `--install-user` 安装/更新 | ❌ 本机私有 |
| `<repo>/.workbuddy/skills/demo-video-recorder/` | 工作区副本（与真源同构，本机备用） | ❌ 被 `.gitignore` 的 `.workbuddy/` 忽略 |
| `<项目>/tools/xhs-video/` | 该项目的**实例**：真实 `caption_config.json` + `.work/` + `preview/` | 源码/配置入库，产物忽略 |

**没装用户级副本时 skill 不会被自动发现**——放进 `.skill/` 解决的是「不丢」，不是「自动可用」。

两处布局不同是既定约定，不是笔误：真源里引擎在 `caption/` 子目录，项目实例里**拍平**到
`tools/xhs-video/` 根（`build_captioned.py` 靠 cwd 里的 `import caption_render` 找同级模块）。

**改引擎后立刻跑一次 `python sync_check.py`** —— 逐文件比指纹，列出漂移并非零退出；`--sync` 以真源
覆盖全部副本。脚本用 `.git`/`TRACKS.md` 逐级向上认仓库根，因此**从哪个副本运行都行**（不在仓库内时加
`--repo <仓库根>`）。这个脚本是为防一个真实事故而写的：技能模板与项目源码曾静默分叉，复用技能时拿到的还是旧引擎。

**安全边界（2026-09-16 审计结论，无 P0/P1）**：全部脚本无 `eval`/`exec`/`shell=True`，无网络下载、
无破坏性删除；子进程只以**列表参数**调用 ffmpeg 与 edge-tts。唯一出网是 edge-tts 合成解说语音
（需联网，未安装时自动降级为「仅字幕」）。本技能**不打包 zip**，仓库只提交 `.skill/<name>/` 目录。

## 已验证的铁律（真实踩过的坑，照做即可）

### 1. Playwright 不会按 dpr 放大视频
`record_video` **永远按 viewport 的 CSS 像素尺寸录制**（如 360×640），`device_scale_factor` 只影响
页面内渲染清晰度，**不会改变视频分辨率**。所以「提高画质」的正确路径是：
- viewport 设成**手机逻辑尺寸**（如 360×640，dpr=3），
- ffmpeg `scale=1080:1920:flags=lanczos` 等比放大到 1080×1920。

### 2. record_video_size 大于 viewport = 小画面 + 四周灰边 + 只显示顶部
若把 `record_video_size` 设成 1080×1920 而 viewport 还是 360×640，Playwright 只会把 360×640 的
内容**贴在 1080×1920 视频的左上角**，于是：画面小、只看到上面一部分、周围一圈灰。
**正确做法：不设置 `record_video_size`（默认等于 viewport），录完交给 ffmpeg 放大。**

### 3. 禁止 CSS zoom / transform:scale
页面里用 `zoom` 或 `transform:scale` 放大，会让点击坐标算错、分辨率上限被锁死在布局尺寸，越弄越糊。
放大交给 ffmpeg，不在页面内做。

### 4. SwiftShader 软件渲染掉帧 → 关全屏模糊 + 预热
无头浏览器走 SwiftShader（软件 WebGL），开头 3D 场景初始化会卡。两招：
- 录制时注入 CSS 关掉全屏模糊层（如 `.gate-bg{filter:none!important}`），保留清晰主层；
- 给 app 加 `?warm=N` 参数，演示开始前静置 N 秒让着色器/地球预热。

### 5. 内容超出一屏 → demo 模式自动平滑滚动
路线页（hero+卡片）、总结页（雷达图+清单）常比一屏高，只录顶部会漏内容。
在 `?demo` 里加 `demoSmoothScroll(el, to, dur, cb)`（easeInOutQuad），进页后先扫到底再回顶，再继续流程。

### 6. 监控/小图太小 → 录制专用 CSS 放大 + 轻度锐化
如 `.tour-frame`（恐龙方图）原 `24vh`，录制时注入 `.tour-frame{height:30vh!important}` 放大 ~25%；
配套放宽同层容器（如 `.tour-card{max-width:600px}`）保持平衡。因用 `background-size:contain`，
放大不裁切。ffmpeg 加 `unsharp=5:5:0.8` 抵消 3x 放大发虚。

### 7. CSS 注入时机：在 goto(load) 之后，别用 add_init_script
`page.add_init_script` 在 `document.head` 就绪前执行 → `document.head.appendChild` 报
`Cannot read properties of null`。改用 `page.goto(url, wait_until="load")` 之后 `page.add_style_tag(content=css)`。

### 8. 浏览器版本错配 → 用 executable_path 指本地已装 chromium
Playwright Python 包期望的 chromium revision（如 1223）常与本地已装版本（如 1243）不符，会报
`Executable doesn't exist`。**不要重下载**，直接用 `find_chromium()` 搜 `ms-playwright` 目录里已装的
`chromium-*/chrome-win*/chrome.exe`，传 `executable_path`。启动参数：
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`。

### 9. favicon 404 无害
控制台那条 `GET /favicon.ico 404` 是浏览器自动请求，忽略；只盯 `pageerror` 是否有真正的 JS 报错。

### 10. ffmpeg 二进制
环境常无系统 ffmpeg。装 `imageio-ffmpeg`（`pip install imageio-ffmpeg`），用
`imageio_ffmpeg.get_ffmpeg_exe()` 拿到内置二进制；兜底 `shutil.which("ffmpeg")`。

### 11. 录屏开头约 0.4s 会是「左上 1/3 小画面 + 中灰边」（即使没设 record_video_size）
**症状**：成片前 10 帧（25fps ≈ 0.40s）内容只占左上约 1/3 宽高（1080×1920 里只填了 360×640），
四周是 `(126,126,126)` 中灰；第 11 帧起恢复正常满幅。肉眼读成「画面只有四分之一在左上角」。

**成因**：viewport 360×640 + `device_scale_factor=3` 时，Chromium 的视频捕获在**最初若干帧**还没拿到
按 dpr 缩放后的 surface，这几帧按 CSS 逻辑尺寸 360×640 被贴进已按 1080×1920 初始化的画布左上角，
其余填中灰。与铁律 #2 是同一症状家族，区别是 #2 整片如此、#11 只有开头一小段，且**不是脚本写错参数**
——不设 `record_video_size` 也会出现。

**判定方法**（别靠播放器目测）：缩到 180×320 逐帧抽，取四角像素众数为背景色求内容包围盒，
宽或高占比 < 0.9 即异常帧。底片与字幕版要各测一遍。

**修法（不必重录）**：
- 录制后裁掉片头：`ffmpeg -ss 0.45 -i in.mp4 -c copy out.mp4`（`-c copy` 只在最近关键帧处生效，
  稳妥做法是重新编码：`-ss 0.45 -i in.mp4 -c:v libx264 -crf 18 -c:a aac out.mp4`）；
- 或只给开头补 `crop=iw/3:ih/3:0:0,scale=1080:1920` 的短片段再 concat；
- 若成片已挂字幕/解说：视频整体 `-ss` 前移后，字幕 cue 时间轴要同步减去同样的秒数再重渲字幕层。

### 12. 「结尾也有小画面」多半是播放器循环，不是文件问题
实测过：成片末尾 30 帧（最后 1.2s）内容包围盒全部满幅，无灰边。用户看到的结尾异常，几乎都是
播放器（手机相册 / 小红书 / 网页）播完自动回到第 0 帧，于是开头那 0.4s 小画面在「结尾」又出现一次。
**复核时先逐帧量文件，再谈观感**，别急着重录。

## 录制脚本

`record_demo.py` 已参数化，覆盖上面全部要点：
- `--www 目录` 自动起 `http.server`（模块/CORS 友好，比 file:// 稳）；或 `--url` 直接给完整录制 URL
- `--out` 输出 mp4；`--css` 传录制专用覆盖 CSS 文件（可选，默认内置 jurassic 版覆盖）
- `--warm` 预热秒数、`--duration` 总时长、`--crf`、`--fps`、`--chromium` 显式指定
- `--check` 只打印检测到的 ffmpeg / chromium 路径后退出（快速自检，不录）

默认 CSS（jurassic-park-3d 验证过，按需改选择器）：
```css
.gate-bg{filter:none !important;}
.tour-frame{height:30vh !important;max-height:600px !important;}
.tour-card{max-width:600px !important;}
```

## 阶段二：字幕 + 中文解说（配置驱动，可选）

阶段一产出的是「纯录屏版」（无字幕、无解说，供你或剪辑软件二次加工）。若要直接出「带字幕+解说」的成片，
用本 skill `caption/` 目录下的配置驱动工具：把文案/样式抽成一份 JSON，改 JSON 跑命令即可，无需碰引擎。

### 工具与用法
- `caption/caption_render.py`：字幕渲染器。用 **Pillow 把每段字幕画成整幅透明 PNG**（三套主题在此实现）。
- `caption/build_captioned.py`：主流程。渲卡片 → ffmpeg overlay（淡入淡出 + 上浮）→ edge-tts 混音 → 出片。
- `caption/make_preview.py`：对照预览。一小段视频渲出「旧样式 + 三套新样式」并拼一张对照图。
- `caption/caption_config.example.json`：字段模板，复制到项目 `tools/xhs-video/` 后改名 `caption_config.json` 改文案。
- `sync_check.py`：副本校验与安装。`--sync` 以真源覆盖副本，`--install-user` 装到
  `~/.workbuddy/skills/`（只有这样 Skill 工具才能发现本技能）。**改了 `caption/` 或 `record_demo.py` 后跑一次。**

```bash
# 阶段一：录屏版（无字幕，供后期二剪）
python record_demo.py --www <项目根> --out xiaohongshu/<name>-demo.mp4 --warm 2 --duration 60

# 阶段二：在 caption/ 模板里改 config，然后
python caption/build_captioned.py             # 字幕 + 解说
python caption/build_captioned.py --no-voice  # 只要字幕
python caption/build_captioned.py --theme plaque   # 换主题
python caption/build_captioned.py --clip 10:5      # 只渲 10s 起 5 秒（试样式，秒级反馈）
python caption/make_preview.py                     # 四版对照短片 + 字幕样式对比.png
```

### config 关键字段
- `base_video` / `output`：输入（阶段一 mp4）/ 输出（字幕解说版）
- `voice`：edge-tts 音色，如 `zh-CN-XiaoxiaoNeural`（女声）、`zh-CN-YunxiNeural`（男声）、`zh-CN-XiaoyiNeural`（活泼女声）
- `cues[]`：`start`/`end` 该段出现的起止秒数；`title`/`subtitle` 字幕；`narration` 解说语音文本
- `style.theme`：`scrim`（默认）/ `plaque` / `side`，见下表
- `style.*`：字号 `title_size`/`sub_size`、字距 `title_tracking`/`sub_tracking`、
  动画 `rise_px`/`fade_in`/`fade_out`、版面上边界 `top`、解说音量 `volume`（默认 2.5）；
  `title_color`/`sub_color`/`line_color` 可传 `"#E9C36B"`。

### 三套主题（`style.theme`）

| 主题 | 观感 | 适合 |
|------|------|------|
| `scrim`（默认） | 顶部渐隐遮罩托字 + 金色 `——◆——` 分隔线，无底块 | 最像正片片头，画面感保留最多 |
| `plaque` | 居中圆角暗牌 + 琥珀细边，呼应导视牌 | 信息最稳最清楚，存在感也最强 |
| `side` | 左侧琥珀竖条 + 左对齐标题 | 杂志/纪录片感，最克制 |

选主题前**先跑 `make_preview.py` 出对照图**，让用户看着选；改样式一律先 `--clip` 试一小段，
别一上来就渲整片（60s 一遍要几分钟）。

### 为什么不用 ffmpeg drawtext（v1 旧样式的病根）

v1 用一个 `drawbox` 画满宽实心黑条，再用 `drawtext box=1` 给标题和副标各套一个实心灰方块——
观感是「一条硬边黑胶带里嵌两块灰底字」；副标还写死浅蓝 `0xD6E6FF`，与作品本体的暗红 + 琥珀金主色打架。
drawtext 也做不出渐变遮罩、圆角、字距、柔和投影。**已被用户明确否掉，不要再回退。**

v2 改成 **Pillow 渲染整幅透明 PNG → ffmpeg overlay**：两段式渐变遮罩（强压区 + smoothstep 收尾，
无硬切边）、微软雅黑 Bold + 描边 + 柔化投影、逐字排字距、每段淡入淡出 + 16px 上浮落位，
配色统一到作品本体的暗红 + 琥珀金 + 奶油白。改配色前先看一眼作品本身的色板。

**字幕配色必须跟作品主色同温**——副标不要凭喜好挑颜色（浅蓝配琥珀金就是这样翻车的）。

### 字幕+解说踩过的坑（已固化在脚本，勿回退）
- **各主题的遮罩必须按主题取**（`theme_scrim()`）。曾出现 `save_assets` 一律用最强遮罩，
  导致 B 主题「牌匾自带底色、遮罩可以轻」的设计**静默失效**——`make_preview.py` 已加自检，
  会打印 `scrim alpha@y450`，三套主题数值全等且默认值不同时 WARN。
- **图片输入要限长 + `eof_action=pass`**：`-loop 1 -t <秒> -i card.png`，overlay 加
  `eof_action=pass`；否则最后一帧被无限重复、字幕赖着不走。
- **字幕卡片是「整幅 1080×1920、只有内容区有像素」**，所以 overlay 的 `y` 表达式可直接当
  「内容上浮」动画；遮罩必须单独作为一个 overlay，否则会跟着一起位移。
- **filter_complex 里 `enable` / `y` 表达式的逗号**必须写成 `\,`。
- **字体路径盘符冒号**：`fontfile=C:/...` 的 `:` 会被 drawtext 当选项分隔符 → v2 走 Pillow 渲染
  后此限制消失；只有渲旧样式对照（`make_preview.py`）才需要把 `simhei.ttf` 复制到 cwd。
- **ttc 集合字体**：`msyh.ttc` 在 ffmpeg drawtext 里需 `fontindex` 而本机不支持；
  **Pillow 没这个限制**，可 `ImageFont.truetype(path, size, index=1)` 直接用雅黑 Bold。
- **描边与投影**：1080×1920 上标题描边 3px（黑 @165）、副标 2px，再加 GaussianBlur 柔化投影；
  只加描边不加投影在亮背景上会发脏。
- **版面必须留出文字安全区**：遮罩强压区要盖住「标题 + 副标 + 余量」，否则画面里若有高饱和字牌
  （如大门上的招牌）会跟副标打架。取景后用 `make_preview.py` 在**全片最亮的顶区**验证一次。
- **解说混音**：每段 `apad` 补齐到 `pad_seconds` + `adelay=delays=N` 对齐到 cue 起点，`amix=duration=longest`，
  最后 `-shortest` 防末尾冻结。
- **解说依赖**：edge-tts 需联网；未装时脚本自动降级为「仅字幕」并提示 `pip install edge-tts`。
- **收尾要验**：末段字幕结束后 overlay 必须彻底消失且画面不冻结（`eof_action=pass` 若写错会重现字幕）。
  抽末段帧 + 比对相邻帧指纹确认「在动、无字幕」。
- **解说响度直出偏轻，脚本内置 `style.volume` 增益**：edge-tts 直出的解说整轨 mean 约 −37dB
  （max 约 −20dB），手机外放明显偏小。混音段现在默认补 `volume=2.5` 再串 `alimiter=limit=0.95`
  防爆音（必要时把 config 里 `style.volume` 调到 3 上下，峰值即可抬到约 −9dB），
  无需再手动 `-af volume=6dB` 重编码（2026-09-21 age-of-sail-3d 实测）。
- **解说重叠排查**：每段语音按 cue 起点 `adelay` 对齐后 `amix`，若某段朗读时长超过到下段起点的
  间隔，两句话会叠着念。改文案要让每段 `narration` 实际朗读长度**收进 [start, 下段 start) 区间**
  并留约 1s 余量；可用 `ffmpeg -i nN.mp3` 量真实时长核对，别只凭字数猜。
- **字幕时间轴必须按成片实测，不能照抄探针 console 打点**：正式录制时（视频编码 +
  SwiftShader 渲染双负载）rAF 驱动的「到达检测」逐段滞后累积，成片比探针打点整体拉长且
  **各段拉伸不均**（实测 44s 流程录成 51s，进基因页打点差 4s+）。录完先用
  `fps=2,scale=小,tile=NxM` 拼全片概览、再对关键切换点（进飞行页/进基因页）局部放大，
  量出成片里的真实时刻再写 cues；解说超窗口就挪 cue 边界，别硬塞。

## app 侧改造（让 app 能 ?demo 自动播放）

在 `assets/app.js` 顶部读 `location.search`：
```js
var QP = new URLSearchParams(location.search);
var DEMO = QP.has('demo');
var DEMO_ROUTE = QP.get('demo') || 'predator';      // 默认路线 key
var DEMO_ROUTE_MS = 3000, DEMO_TOUR_MS = 3400, DEMO_SUMMARY_MS = 5200;
var DEMO_WARM_MS = Math.max(0,(parseInt(QP.get('warm'),10)||0))*1000;
var DEMO_LOOP = QP.has('loop');
```
在「选路线」页 `setTimeout` 自动 `enterGate(ROUTES[idx])`；在「游览」页每 `DEMO_TOUR_MS` 自动 `tourNext()`；
「总结」页停留后 `DEMO_LOOP ? 回路线页 : 结束`。**只接管两处手动环节**——大门页、地球摆头通常是自带自动动效，不必改。
演示模式禁用键盘、屏蔽 toast，画面纯净。

## 标准工作流

**阶段一 · 录屏版（必做）**
1. 确认 app 有 `?demo` 自动播放（没有就按下面「app 侧改造」）；起本地服务确认 `http://127.0.0.1:PORT/index.html?demo&warm=2` 能自动跑完。
2. 跑 `python record_demo.py --www <项目根> --out xiaohongshu/<name>-demo.mp4 --warm 2 --duration 60 --check` 自检二进制。
3. 去掉 `--check` 正式录；产物默认 1080×1920 / H.264 / yuv420p / 25fps，无字幕无解说（供后期二剪）。
4. 抽帧核对：是否铺满、有无黑边、监控图大小、开头是否还掉帧。

**阶段二 · 字幕解说版（可选，在阶段一基础上）**
5. 把 `caption/` 模板复制到项目 `tools/xhs-video/`，改名 `caption_config.json`，按文案/音色改 `cues`，
   并挑一个 `style.theme`。
6. `python make_preview.py` 出对照图（旧样式 + 三套主题），让用户看着选主题；选定后再
   `python build_captioned.py`（含解说）或 `--no-voice`（仅字幕），产物 `<name>-demo-字幕解说版.mp4`。
7. 抽帧核对：① 字幕不挡主体 ② 在最亮的顶区仍读得清 ③ 末段之后字幕彻底消失、画面不冻结；
   用 `ffmpeg -i` 看 `Stream #0:1 Audio: aac` 确认解说音轨已封装。

按 AGENTS.md 约定，视频与验证帧放 `xiaohongshu/`（demo-shots / demo-shots-vo 子目录）。

## 输出约定

- 竖屏 mp4：`xiaohongshu/<project>-demo.mp4`（1080×1920，H.264/yuv420p，+faststart 便于上传）
- 验证帧：`xiaohongshu/demo-shots/*.png`
- 本 skill 的录制 CSS 是**临时注入**，不写回 app 源码；app 的真实布局保持不变。
