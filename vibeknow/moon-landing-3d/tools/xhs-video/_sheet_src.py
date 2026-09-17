# -*- coding: utf-8 -*-
"""素材章概览：每章抽 6 帧拼成一行，并量平均亮度。

用途：合成前先确认「每一章真的有画面」。过去踩过的坑是某几章其实是
纯黑/空场/地球特写，画面看着在动、其实是废素材 —— 这种问题一旦等到
1886 帧渲染完才发现，返工成本极高。所以宁可在合成前多花 20 秒。
"""
import pathlib, json
from PIL import Image, ImageStat

BASE = pathlib.Path(__file__).resolve().parent
CLIPS = BASE / "clips"
CHAPS = ["01-show", "02-explode", "03-launch1", "04-transit",
         "05-launch2", "06-rendez", "07-descent", "08-land"]
COLS = 6
TW, TH = 178, 316           # 每格缩略图（保持 1080:1920 = 9:16）


def main():
    rows = []
    for chap in CHAPS:
        d = CLIPS / chap
        if not d.exists():
            print("!! 缺章节目录 %s" % chap); continue
        fs = sorted(d.glob("f*.jpg"))
        if not fs:
            print("!! %s 无素材帧" % chap); continue
        picks = [fs[round(k * (len(fs) - 1) / (COLS - 1))] for k in range(COLS)]
        ims, lum = [], []
        for p in picks:
            im = Image.open(p).convert("RGB")
            gray = im.convert("L")
            st = ImageStat.Stat(gray)
            lum.append(st.mean[0])
            ims.append(im.resize((TW, TH)))
        rows.append((chap, ims, lum, len(fs)))

    n = len(rows)
    sheet = Image.new("RGB", (TW * COLS, TH * n), (16, 16, 20))
    for r, (chap, ims, lum, cnt) in enumerate(rows):
        for c, im in enumerate(ims):
            sheet.paste(im, (c * TW, r * TH))
    out = BASE / "_sheet_src.png"
    sheet.save(out)

    print("素材概览 -> %s" % out.name)
    ok = True
    for chap, ims, lum, cnt in rows:
        mn, mx = min(lum), max(lum)
        # 有明暗起伏 = 画面确实在变化；整章几乎同值 = 可能是一张不动的废图
        rng = mx - mn
        good = mx > 6 and rng > 1.0
        ok = ok and good
        print("  [%s] %-12s n=%3d  亮度 min/avg/max=%5.1f/%5.1f/%5.1f  跨度=%4.1f"
              % ("OK  " if good else "WARN", chap, cnt, mn, sum(lum) / len(lum), mx, rng))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
