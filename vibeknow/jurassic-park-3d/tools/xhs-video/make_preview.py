# -*- coding: utf-8 -*-
"""make_preview.py — 一次生成「旧样式 vs 三套新样式」的对照短片 + 对照图。

用途：改字幕样式时，不必先渲完整片（60s）才能看效果。取一小段（默认 10s 起 5s，
恰好跨一个段落切换，能同时看到淡出 / 淡入）分别渲出四种版本，并拼一张静帧对照图。

用法：
  python make_preview.py                       # 默认 10s 起 5s
  python make_preview.py --at 30 --dur 4       # 换一段看
  python make_preview.py --skip-old            # 不渲旧样式

产物（默认落在 ./preview/）：
  00_旧样式.mp4 / 01_scrim.mp4 / 02_plaque.mp4 / 03_side.mp4
  字幕样式对比.png
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

import build_captioned as bc
import caption_render as cr

HERE = os.path.dirname(os.path.abspath(__file__))

# v1 旧样式的视觉参数，仅用于「改版前」对照，勿作为可调项
OLD_STYLE = {
    "banner_y": 180, "banner_height": 180, "banner_color": "black@0.45",
    "title_size": 54, "sub_size": 30, "title_color": "white", "sub_color": "0xD6E6FF",
    "title_y": 220, "sub_y": 288, "box_color": "black@0.55", "box_border": 16,
}

THEME_LABEL = {
    "scrim": "A｜渐隐片头（无底块·顶部渐变托字）",
    "plaque": "B｜琥珀牌匾（居中圆角暗牌）",
    "side": "C｜左对齐条（琥珀竖条·杂志感）",
}


def old_style_filter(cues, offset):
    parts = []
    for c in cues:
        s = max(0.0, c["start"] - offset)
        e = c["end"] - offset
        if e <= 0:
            continue
        parts.append(
            "drawbox=x=0:y={by}:w=iw:h={bh}:color={bc}:t=fill"
            ":enable=between(t\\,{s}\\,{e})".format(
                by=OLD_STYLE["banner_y"], bh=OLD_STYLE["banner_height"],
                bc=OLD_STYLE["banner_color"], s=round(s, 3), e=round(e, 3)))
        for text, color, size, y in (
            (c["title"], OLD_STYLE["title_color"], OLD_STYLE["title_size"], OLD_STYLE["title_y"]),
            (c["subtitle"], OLD_STYLE["sub_color"], OLD_STYLE["sub_size"], OLD_STYLE["sub_y"]),
        ):
            parts.append(
                "drawtext=fontfile=simhei.ttf:text={t}:fontcolor={c}:fontsize={fs}"
                ":box=1:boxcolor={bx}:boxborderw={bb}:x=(w-text_w)/2:y={y}"
                ":enable=between(t\\,{s}\\,{e})".format(
                    t=text, c=color, fs=size, bx=OLD_STYLE["box_color"],
                    bb=OLD_STYLE["box_border"], y=y, s=round(s, 3), e=round(e, 3)))
    return ",".join(parts)


def render_old(ff, base, cfg, at, dur, out, work):
    shutil.copy(r"C:\Windows\Fonts\simhei.ttf", os.path.join(work, "simhei.ttf"))
    vf = old_style_filter(cfg["cues"], at)
    cmd = [ff, "-y", "-ss", str(at), "-t", str(dur), "-i", base, "-vf", vf,
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19",
           "-preset", "medium", "-an", "-t", str(dur), out]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=work)
    if r.returncode != 0:
        print("OLD STYLE FAIL\n", r.stderr[-2500:])
        return False
    return True


def grab(ff, clip, t, out):
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-ss", str(t),
           "-i", clip, "-frames:v", "1", "-y", out]
    return subprocess.run(cmd, capture_output=True, text=True).returncode == 0


def build_sheet(items, out, crop=(0, 40, 1080, 620), label_h=58, width=760):
    """把各版本同一时刻的字幕区拼成一张对照图。"""
    w = crop[2] - crop[0]
    h = crop[3] - crop[1]
    scale = width / float(w)
    ch, lh = int(h * scale), int(label_h * scale)
    sheet = Image.new("RGB", (width, (ch + lh) * len(items)), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", int(30 * scale), index=1)
    for i, (label, path) in enumerate(items):
        y0 = i * (ch + lh)
        d.rectangle([0, y0, width, y0 + lh], fill=(30, 26, 24))
        d.text((int(18 * scale), y0 + int(13 * scale)), label, font=font,
               fill=(232, 197, 124))
        im = Image.open(path).convert("RGB").crop(crop).resize((width, ch), Image.LANCZOS)
        sheet.paste(im, (0, y0 + lh))
    sheet.save(out)
    return out


def main():
    at = float(bc.arg_value("--at", 10))
    dur = float(bc.arg_value("--dur", 5))
    out_dir = os.path.abspath(bc.arg_value("--out-dir", os.path.join(HERE, "preview")))
    os.makedirs(out_dir, exist_ok=True)
    work = os.path.join(HERE, ".work")
    os.makedirs(work, exist_ok=True)

    ff = bc.find_ffmpeg()
    cfg = json.load(open(os.path.join(HERE, "caption_config.json"), encoding="utf-8"))
    base = os.path.abspath(os.path.join(HERE, cfg["base_video"]))
    py = sys.executable

    # 取一个「字幕已完全显示」的时刻做静帧对照
    inside = [c for c in cfg["cues"] if c["start"] < at + dur and c["end"] > at]
    cue = max(inside, key=lambda c: min(c["end"], at + dur) - max(c["start"], at))
    shot_t = (max(cue["start"], at) + min(cue["end"], at + dur)) / 2.0 - at

    items = []
    # 自检：各主题的遮罩必须各用各的（曾出现「三套主题共用一份遮罩」的静默失效）
    scrims = {t: cr.theme_scrim(t, cfg["style"]).split()[3].getpixel((5, 450))
              for t in ("scrim", "plaque", "side")}
    print("scrim alpha@y450:", scrims)
    if len(set(scrims.values())) == 1 and len({cr.THEMES[t].scrim_defaults for t in scrims}) > 1:
        print("WARN: 三套主题遮罩默认值不同却渲染成同一份，请检查 theme_scrim/save_assets")

    if "--skip-old" not in sys.argv:
        p = os.path.join(out_dir, "00_旧样式.mp4")
        if render_old(ff, base, cfg, at, dur, p, work):
            print("ok 旧样式 ->", p)
            still = os.path.join(work, "still_old.png")
            grab(ff, p, shot_t, still)
            items.append(("旧版（drawtext 实心方块 + 浅蓝副标）", still))

    for i, theme in enumerate(("scrim", "plaque", "side"), start=1):
        p = os.path.join(out_dir, "%02d_%s.mp4" % (i, theme))
        r = subprocess.run([py, os.path.join(HERE, "build_captioned.py"),
                            "--clip", "%s:%s" % (at, dur), "--theme", theme,
                            "--out", p], capture_output=True, text=True, cwd=HERE)
        if r.returncode != 0:
            print("THEME FAIL", theme, r.stdout[-1500:], r.stderr[-1500:])
            continue
        print("ok", theme, "->", p)
        still = os.path.join(work, "still_%s.png" % theme)
        grab(ff, p, shot_t, still)
        items.append((THEME_LABEL[theme], still))

    if len(items) >= 2:
        sheet = build_sheet(items, os.path.join(out_dir, "字幕样式对比.png"))
        print("ok 对照图 ->", sheet)


if __name__ == "__main__":
    main()
