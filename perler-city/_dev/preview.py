# -*- coding: utf-8 -*-
"""把 15 张图纸按 main.js 的 drawBead 逻辑渲染成一张对比图（离线预览用）。

用法：python _dev/preview.py
产物：_dev/preview.png
不参与构建，只用于人眼校对图纸造型。
"""
import json
import os
import sys

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "_dev", "data", "buildings.json")
OUT = os.path.join(ROOT, "_dev", "preview.png")

IRON = 0.62          # 成品（城市里的建筑）
BEAD = 26            # 单颗豆的像素直径
BG = (26, 33, 45)
PANEL = (30, 39, 53)


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, k):
    return tuple(max(0, min(255, round(v * k))) for v in c)


def draw_bead(d, cx, cy, r, hexs, iron):
    """复刻 main.js 的 drawBead（iron=0 生豆 / 0.62 已熨烫）。"""
    rr = r * (1 + iron * 0.12)
    hole = r * 0.30 * (1 - iron * 0.92)
    top = shade(hx(hexs), 1.16 - iron * 0.10)
    bot = shade(hx(hexs), 0.80 + iron * 0.10)
    # 用三段色带近似线性渐变
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=hx(hexs))
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr * 0.1], fill=top)
    d.ellipse([cx - rr, cy + rr * 0.1, cx + rr, cy + rr], fill=bot)
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
              outline=shade(hx(hexs), 0.60 + iron * 0.18), width=max(1, round(r * 0.11)))
    if hole > 0.5:
        d.ellipse([cx - hole, cy - hole, cx + hole, cy + hole], fill=(62, 54, 48))
    # 高光
    hr = rr * 0.17
    d.ellipse([cx - rr * 0.30 - hr, cy - rr * 0.34 - hr,
               cx - rr * 0.30 + hr, cy - rr * 0.34 + hr],
              fill=shade((255, 255, 255), 0.40 * (1 - iron * 0.65) + 0.25))


def main():
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    pal = {p["k"]: p["hex"] for p in data["palette"]}
    cats = {c["id"]: c for c in data["cats"]}
    builds = data["buildings"]

    cols = 5
    rows = (len(builds) + cols - 1) // cols
    cell_w, cell_h = 15 * BEAD + 24, 15 * BEAD + 46
    W = cols * cell_w + 20
    H = rows * cell_h + 20

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    for i, b in enumerate(builds):
        cx0 = 10 + (i % cols) * cell_w
        cy0 = 10 + (i // cols) * cell_h
        d.rectangle([cx0 + 4, cy0 + 4, cx0 + cell_w - 8, cy0 + cell_h - 8],
                    fill=PANEL, outline=(48, 60, 78))

        n = len(b["rows"])
        # 图纸在格子里居中
        ox = cx0 + 12 + (15 - n) * BEAD // 2
        oy = cy0 + 12 + (15 - n) * BEAD // 2
        for y, row in enumerate(b["rows"]):
            for x, ch in enumerate(row):
                if ch == ".":
                    continue
                draw_bead(d, ox + x * BEAD + BEAD // 2, oy + y * BEAD + BEAD // 2,
                          BEAD * 0.47, pal[ch], IRON)

        cat = cats.get(b["cat"], {"name": "", "color": "#888888"})
        ty = cy0 + 12 + 15 * BEAD + 6
        d.rectangle([cx0 + 12, ty + 5, cx0 + 20, ty + 13], fill=hx(cat["color"]))
        d.text((cx0 + 25, ty + 3), "%s  %s" % (b["name"], cat["name"]), fill=(226, 234, 246))
        d.text((cx0 + 25, ty + 16), "%d 颗" % sum(1 for r in b["rows"] for c in r if c != "."),
               fill=(110, 122, 141))

    img.save(OUT)
    print("预览图已生成：%s（%dx%d）" % (OUT, W, H))


if __name__ == "__main__":
    main()
