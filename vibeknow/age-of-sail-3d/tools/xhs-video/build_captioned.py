# -*- coding: utf-8 -*-
"""build_captioned.py — 配置驱动地把「字幕 + 中文解说」烤进侏罗纪公园宣传片。

这是 jurassic-park-3d 小红书宣传片的【后期】步骤：输入由 demo-video-recorder skill
录制的无字幕竖屏 mp4（jurassic-park-3d-demo.mp4），输出带字幕 + edge-tts 语音的版本。

用法：
  1. 改文案/样式：编辑同目录 caption_config.json
       - cues[].title / subtitle / narration  = 文案（标题 / 副标 / 解说语音）
       - cues[].start / end                  = 该段出现的起止秒数
       - style.theme                         = 视觉主题：scrim | plaque | side
       - style.*                             = 字号/字距/位置等参数（各主题通用）
  2. 跑：
       python build_captioned.py                 # 全片：字幕 + 语音
       python build_captioned.py --no-voice      # 全片：只要字幕
       python build_captioned.py --theme plaque   # 换主题
       python build_captioned.py --clip 13:6      # 只渲 13 秒起 6 秒（快速试样式，仅字幕）

依赖：
  - ffmpeg：优先用 imageio-ffmpeg 自带二进制（本机 venv 已装），找不到再回退硬编码路径
  - Pillow：字幕卡片渲染（本机 venv 已装）
  - edge-tts：语音需要；未安装时自动降级为「仅字幕」并提示 pip install edge-tts
  - 系统字体：微软雅黑 Bold / Regular（msyhbd.ttc / msyh.ttc）

踩过的坑（已固化，勿回退）：
  - 字体路径盘符冒号 C:/... 会被 ffmpeg drawtext 当成选项分隔符；改用 PIL 渲染 PNG 后
    这个限制消失，路径照常传即可（本脚本已不再依赖 drawtext）。
  - enable / y 表达式里的逗号在 filter_complex 中必须写成 \\, 否则被当参数分隔符。
  - 字幕卡片 PNG 是「整幅 1080x1920、只有内容区有像素」，所以 overlay 的 y 表达式
    可以直接拿来当「内容上浮」动画用。
  - 图片输入要 `-loop 1 -t <秒>` 限长 + overlay 加 `eof_action=pass`，否则最后一帧
    会被无限重复、字幕赖着不走。
  - amix 用 duration=longest + -shortest，避免音频比视频长导致末尾冻结。
"""
import asyncio
import json
import os
import shutil
import subprocess
import sys

import caption_render as cr

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 25


def find_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return (r"C:\Users\ASUS\.workbuddy\binaries\python\envs\default\Lib"
                r"\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe")


def arg_value(flag, default=None):
    """取 `--flag value` 形式的值；支持 `--flag=value`。"""
    for i, a in enumerate(sys.argv):
        if a == flag and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
        if a.startswith(flag + "="):
            return a.split("=", 1)[1]
    return default


def build_overlay_filter(cues, style, scrim_idx, card_idx0, offset=0.0):
    """生成「渐隐遮罩 + 每段卡片淡入上浮」的 filter_complex 片段。"""
    rise = style.get("rise_px", 16)
    fin = style.get("fade_in", 0.45)
    fout = style.get("fade_out", 0.32)
    g = style.get("card_y", 0)

    s0 = max(0.0, cues[0]["start"] - 0.4 - offset)
    s1 = max(s0 + 0.5, cues[-1]["end"] + 0.4 - offset)
    parts = [
        "[{i}:v]format=rgba,fade=t=in:st={a}:d=0.5:alpha=1,"
        "fade=t=out:st={b}:d=0.5:alpha=1[sc]".format(i=scrim_idx, a=round(s0, 2), b=round(s1, 2)),
        "[0:v][sc]overlay=0:0[v0]",
    ]
    prev = "[v0]"
    for n, c in enumerate(cues):
        idx = card_idx0 + n
        s = c["start"] - offset
        e = c["end"] - offset
        if e <= 0:
            continue
        s = max(0.0, s)
        e = max(s + 0.3, e)
        # 若这一段在片段开始前就已经出现，则进片段时直接满亮
        if s <= 0.001:
            fin_here, s_anim = 0.001, s - 10
        else:
            fin_here, s_anim = fin, s
        out_st = max(0.0, e - fout)
        parts.append(
            "[{i}:v]format=rgba,fade=t=in:st={s}:d={fi}:alpha=1,"
            "fade=t=out:st={fo}:d={ff}:alpha=1[c{n}]".format(
                i=idx, s=round(s, 3), fi=fin_here, fo=round(out_st, 3),
                ff=fout, n=n))
        parts.append(
            "{p}[c{n}]overlay=x=0:y='{g}+{r}*max(0\\,1-(t-({sa}))/{fi})'"
            ":eof_action=pass:enable='between(t\\,{s}\\,{e})'[v{n1}]".format(
                p=prev, n=n, n1=n + 1, g=g, r=rise, sa=round(s_anim, 3),
                fi=fin_here, s=round(s, 3), e=round(e, 3)))
        prev = "[v{n1}]".format(n1=n + 1)
    return ";".join(parts), prev


def main():
    FF = find_ffmpeg()
    if not os.path.exists(FF):
        print("FFMPEG NOT FOUND:", FF)
        sys.exit(1)

    cfg = json.load(open(os.path.join(HERE, "caption_config.json"), encoding="utf-8"))
    st = cfg.get("style", {})
    cues = cfg["cues"]
    theme = arg_value("--theme", st.get("theme", "scrim"))
    no_voice = "--no-voice" in sys.argv
    pad = int(cfg.get("pad_seconds", 65))

    base = os.path.abspath(os.path.join(HERE, cfg["base_video"]))
    out = os.path.abspath(os.path.join(HERE, cfg["output"]))
    work = os.path.join(HERE, ".work")
    os.makedirs(work, exist_ok=True)

    # ---- 可选：只渲一小段做样式预览 ----
    clip = arg_value("--clip")
    offset = 0.0
    clip_dur = None
    if clip:
        a, _, b = clip.partition(":")
        offset = float(a)
        clip_dur = float(b) if b else 6.0
        no_voice = True
        out = os.path.abspath(arg_value("--out") or os.path.join(work, "preview.mp4"))

    # ---- 1) 字幕：PIL 渲染透明卡片 + 顶部渐隐遮罩 ----
    assets_dir = os.path.join(work, "assets_" + theme)
    scrim, cards = cr.save_assets(theme, cues, assets_dir, st)
    fc, last = build_overlay_filter(cues, st, scrim_idx=1, card_idx0=2, offset=offset)

    cmd = [FF, "-y"]
    if clip:
        cmd += ["-ss", str(offset), "-t", str(clip_dur)]
    cmd += ["-i", base]
    cmd += ["-loop", "1", "-framerate", str(FPS), "-t",
            str(max(2.0, cues[-1]["end"] + 1 - offset)), "-i", scrim]
    for i, c in enumerate(cues):
        cmd += ["-loop", "1", "-framerate", str(FPS), "-t",
                str(max(1.0, c["end"] + 0.6 - offset)), "-i", cards[i]]
    cmd += ["-filter_complex", fc, "-map", last,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19",
            "-preset", "medium", "-movflags", "+faststart", "-an"]
    if clip:
        cmd += ["-t", str(clip_dur)]
    cmd += [os.path.join(work, "captioned.mp4")]

    cap = os.path.join(work, "captioned.mp4")
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=work)
    if r.returncode != 0:
        print("CAPTION FAIL\n", r.stderr[-3000:])
        sys.exit(1)
    print("caption OK ->", os.path.getsize(cap) // 1024, "KB  [theme=%s]" % theme)

    if no_voice:
        shutil.copy(cap, out)
        print("DONE(subtitle only) ->", out)
        return

    # ---- 2) 解说：edge-tts 逐 cue 生成中文语音 ----
    try:
        import edge_tts
    except Exception:
        print("edge_tts 未安装，降级为「仅字幕」。安装语音：python -m pip install edge-tts")
        shutil.copy(cap, out)
        print("DONE(subtitle only) ->", out)
        return

    tts_dir = os.path.join(work, "tts")
    os.makedirs(tts_dir, exist_ok=True)

    async def gen():
        for i, c in enumerate(cues):
            p = os.path.join(tts_dir, "n{0}.mp3".format(i))
            if not os.path.exists(p):
                await edge_tts.Communicate(c["narration"], cfg["voice"]).save(p)
            print("tts", i, os.path.getsize(p), "bytes")

    asyncio.run(gen())

    # ---- 3) 混音：每段 adelay 到起点 + apad 补齐 + amix，再与字幕视频封装 ----
    n = len(cues)
    fc_parts = []
    for i, c in enumerate(cues):
        fc_parts.append("[{i}]apad=whole_dur={pad}[a{i}p]".format(i=i, pad=pad))
        fc_parts.append("[a{i}p]adelay=delays={d}:all=1[d{i}]".format(
            i=i, d=int(c["start"] * 1000)))
    mix = "".join("[d{i}]".format(i=i) for i in range(n))
    fc_mix = ",".join(fc_parts) + ";{mix}amix=inputs={n}:duration=longest[outa]".format(
        mix=mix, n=n)

    cmd = [FF, "-y"]
    for i in range(n):
        cmd += ["-i", os.path.join(tts_dir, "n{0}.mp3".format(i))]
    cmd += ["-i", cap, "-filter_complex", fc_mix,
            "-map", "{0}:v".format(n), "-map", "[outa]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", "-shortest", out]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=work)
    if r.returncode != 0:
        print("NARRATE FAIL\n", r.stderr[-3000:])
        sys.exit(1)
    print("DONE ->", out, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main()
