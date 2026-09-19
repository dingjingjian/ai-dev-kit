# -*- coding: utf-8 -*-
"""生成应用图标 icon.png（2048×2048）。

四宫格对应图鉴的四大分类，配色与 main.js 的 CATS.accent 一致：
    0 地面（蓝 · 汽车）  1 水面（青 · 轮船）
    2 天空（紫 · 飞机）  3 太空（粉 · 火箭）

用法：python _dev/make_icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
S = 2048
M = 140          # 外边距
GAP = 56         # 四宫格间距
TILE = (S - M * 2 - GAP) // 2
R = 200          # 圆角

BG = (244, 246, 250)
TILES = [
    (37, 99, 235),    # 地面 蓝
    (8, 145, 178),    # 水面 青
    (124, 58, 237),   # 天空 紫
    (219, 39, 119),   # 太空 粉
]

img = Image.new("RGB", (S, S), BG)
d = ImageDraw.Draw(img)

boxes = []
for i in range(4):
    col, row = i % 2, i // 2
    x0 = M + col * (TILE + GAP)
    y0 = M + row * (TILE + GAP)
    boxes.append((x0, y0, x0 + TILE, y0 + TILE))
    d.rounded_rectangle([x0, y0, x0 + TILE, y0 + TILE], radius=R, fill=TILES[i])

W = (255, 255, 255)


def center(i):
    x0, y0, x1, y1 = boxes[i]
    return (x0 + x1) // 2, (y0 + y1) // 2


# ---- 0 地面：汽车（侧视：车身 + 座舱 + 两轮）----
cx, cy = center(0)
d.rounded_rectangle([cx - 300, cy - 20, cx + 300, cy + 130], radius=80, fill=W)
d.rounded_rectangle([cx - 165, cy - 185, cx + 130, cy + 30], radius=80, fill=W)
for wx in (cx - 165, cx + 165):
    d.ellipse([wx - 92, cy + 48, wx + 92, cy + 232], fill=W)

# ---- 1 水面：轮船（船体 + 上层建筑 + 烟囱）----
cx, cy = center(1)
d.rounded_rectangle([cx - 130, cy - 300, cx + 130, cy + 40], radius=50, fill=W)
d.rounded_rectangle([cx - 40, cy - 215, cx + 40, cy - 90], radius=30, fill=TILES[1])
d.polygon([(cx - 360, cy - 40), (cx + 360, cy - 40),
           (cx + 250, cy + 230), (cx - 250, cy + 230)], fill=W)
d.rectangle([cx - 360, cy - 78, cx + 360, cy - 40], fill=W)

# ---- 2 天空：飞机（俯视：机身 + 后掠机翼 + 尾翼）----
cx, cy = center(2)
d.rounded_rectangle([cx - 62, cy - 320, cx + 62, cy + 320], radius=62, fill=W)
for s in (-1, 1):
    d.polygon([(cx + s * 66, cy - 60), (cx + s * 380, cy + 175),
               (cx + s * 380, cy + 245), (cx + s * 66, cy + 95)], fill=W)
    d.polygon([(cx + s * 58, cy + 215), (cx + s * 205, cy + 305),
               (cx + s * 205, cy + 345), (cx + s * 58, cy + 265)], fill=W)

# ---- 3 太空：火箭（正视：头锥 + 箭体 + 舷窗 + 尾翼 + 焰流）----
cx, cy = center(3)
# 尾翼（先画，压在箭体之下）
for s in (-1, 1):
    d.polygon([(cx + s * 110, cy - 10), (cx + s * 235, cy + 190),
               (cx + s * 110, cy + 150)], fill=W)
# 头锥 + 箭体
d.polygon([(cx, cy - 345), (cx + 112, cy - 130), (cx - 112, cy - 130)], fill=W)
d.rounded_rectangle([cx - 112, cy - 140, cx + 112, cy + 150], radius=42, fill=W)
# 舷窗
d.ellipse([cx - 60, cy - 72, cx + 60, cy + 48], fill=TILES[3])
# 焰流
d.polygon([(cx - 72, cy + 160), (cx, cy + 340), (cx + 72, cy + 160)], fill=W)

out = ROOT / "icon.png"
img.save(out, "PNG")
print("icon.png %dx%d 已生成 -> %s" % (S, S, out))
