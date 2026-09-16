# jurassic-park-3d 小红书宣传片 · 字幕+解说后期工具

把 `demo-video-recorder` skill 录制的无字幕竖屏 mp4（`jurassic-park-3d-demo.mp4`）
加上「字幕 + 中文语音解说」，产出 `jurassic-park-3d-demo-字幕解说版.mp4`。

> 录制（无字幕底片）由项目 skill `demo-video-recorder` 负责；本目录只做后期叠字幕/解说。

## 文件分工

| 文件 | 职责 |
|------|------|
| `caption_config.json` | **唯一改文案/样式的地方**：字幕文字、时间段、主题、字号、动画 |
| `caption_render.py` | 字幕渲染器：用 Pillow 把每段字幕画成透明 PNG（三套主题在此实现） |
| `build_captioned.py` | 主流程：渲卡片 → ffmpeg overlay → edge-tts 混音 → 出片 |
| `make_preview.py` | 对照预览：一小段视频渲出「旧样式 + 三套新样式」，并拼一张对照图 |

## 运行

```bash
# 需要 python venv：C:\Users\ASUS\.workbuddy\binaries\python\envs\default
cd vibeknow/jurassic-park-3d/tools/xhs-video

python build_captioned.py                  # 全片：字幕 + 语音
python build_captioned.py --no-voice       # 全片：只要字幕
python build_captioned.py --theme plaque    # 换主题
python build_captioned.py --clip 10:5       # 只渲 10s 起 5 秒（试样式，秒级反馈）

python make_preview.py                      # 四版对照短片 + 字幕样式对比.png
```

改样式时**先跑 `--clip` 或 `make_preview.py`**，别一上来就渲整片（60s 一遍要几分钟）。

## 三套主题（`style.theme`）

| 主题 | 观感 | 适合 |
|------|------|------|
| `scrim`（默认） | 顶部渐隐遮罩托字 + 金色 `——◆——` 分隔线，无底块 | 最像正片片头，画面感保留最多 |
| `plaque` | 居中圆角暗牌 + 琥珀细边，呼应园区导视牌 | 信息最稳最清楚，存在感也最强 |
| `side` | 左侧琥珀竖条 + 左对齐标题 | 杂志/纪录片感，最克制 |

三套主题各自带一套遮罩强度（`card_*.scrim_defaults`）——B 主题牌匾自带底色，遮罩刻意更轻。
配置里的 `style.scrim_alpha` / `scrim_end` / `scrim_hold` / `scrim_hold_alpha` / `scrim_color`
是**全局覆盖项**，一旦写上就会盖掉所有主题各自的默认值，只有确实需要统一时才加。

## 为什么不用 ffmpeg drawtext（v1 旧样式的病根）

v1 用一个 `drawbox` 画满宽实心黑条，再用 `drawtext box=1` 给标题和副标各套一个实心灰方块——
观感是「一条硬边黑胶带里嵌两块灰底字」，副标还用了浅蓝 `0xD6E6FF`，与作品本身的
暗红 + 琥珀金主色直接打架。drawtext 也做不出渐变遮罩、圆角、字距和柔和投影。

v2 改成 **Pillow 渲染整幅透明 PNG → ffmpeg overlay**：

- 顶部两段式渐变遮罩（强压区 + smoothstep 收尾），没有硬切边；
- 标题微软雅黑 Bold + 描边 + 柔化投影，字距手工逐字排（PIL 无 letter-spacing）；
- 每段卡片按时淡入淡出，并带 16px 上浮落位（`rise_px` / `fade_in` / `fade_out`）；
- 配色统一到作品本体的暗红 + 琥珀金 + 奶油白。

## 依赖

- `ffmpeg`：优先用 imageio-ffmpeg 自带二进制（venv 已装），无需单独下载。
- `Pillow`：字幕卡片渲染（venv 已装）。
- `edge-tts`：语音需要。未装时脚本自动降级为「仅字幕」并提示
  `python -m pip install edge-tts`。
- 系统字体：微软雅黑 `msyhbd.ttc`（标题）/ `msyh.ttc`（副标）；旧样式对照用 `simhei.ttf`。

## 踩过的坑（已固化，勿回退）

1. `fontfile=C:/...` 的盘符冒号会被 ffmpeg 当选项分隔符 → 旧版靠复制字体到 cwd 绕开；
   改用 PIL 渲染 PNG 后此限制消失。（`make_preview.py` 渲旧样式对照时仍需复制字体。）
2. filter_complex 里 `enable` / `y` 表达式中的逗号必须写成 `\,`。
3. 图片输入要 `-loop 1 -t <秒>` 限长，overlay 要加 `eof_action=pass`；
   否则最后一帧会被无限重复、字幕赖着不走。
4. 字幕卡片 PNG 是「整幅 1080x1920、只有内容区有像素」，所以 overlay 的 `y`
   表达式可以直接当「内容上浮」动画用；遮罩必须单独作为一个 overlay，否则会跟着一起位移。
5. **各主题的遮罩必须按主题取**（`theme_scrim()`）。曾出现 `save_assets` 一律用最强
   遮罩，导致 B 主题「遮罩可以轻」的设计静默失效——`make_preview.py` 已加自检打印
   `scrim alpha@y450`，三套主题数值全等且默认值不同时会 WARN。
6. `amix` 用 `duration=longest` + `-shortest`，避免音频比视频长导致末尾冻结。

## 交接说明（给后续 agent / 协作者）

1. **文案与样式全部集中在 `caption_config.json`**，引擎一般不用改；要加新主题就在
   `caption_render.py` 里加 `card_xxx()` 并登记到 `THEMES` + 设 `scrim_defaults`。
2. 视频底片（`jurassic-park-3d-demo.mp4`）若更新，先跑 `demo-video-recorder` 重新录制，
   再跑本工具。
3. **引擎真源不在这里**。真源是仓库根的 `.skill/demo-video-recorder/`（已入库），本目录是它在
   jurassic-park-3d 上的**实例**：只管 `caption_config.json` 的文案/样式与产物。两边布局不同
   （真源在 `caption/` 子目录，这里拍平到本目录根，便于 `import caption_render`）。
   改完引擎到 `.skill/demo-video-recorder/` 下跑 `python sync_check.py` 校验，漂移时 `--sync` 覆盖。
4. `.gitignore` 已从「整目录忽略 `**/xhs-video/`」改为只忽略 `.work/`、`preview/` 与媒体产物，
   因此本目录的源码 / `caption_config.json` / README 自 2026-09-16 起入库。
