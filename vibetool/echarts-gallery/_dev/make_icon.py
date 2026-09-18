# -*- coding: utf-8 -*-
"""生成应用图标 icon.png（2048×2048）。用法：python _dev/make_icon.py"""
from PIL import Image, ImageDraw, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
S = 2048
img = Image.new("RGB", (S, S), (245, 245, 247))
d = ImageDraw.Draw(img)
GAP = 40
R = 120

def rounded(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)

# 四宫格配色：柱状蓝 / 饼图彩 / 折线绿 / 雷达紫
rounded(d, [GAP, GAP, S//2 - GAP//2, S//2 - GAP//2], R, (84, 112, 198))           # 柱状 蓝
rounded(d, [S//2 + GAP//2, GAP, S - GAP, S//2 - GAP//2], R, (250, 200, 88))       # 饼图 黄
rounded(d, [GAP, S//2 + GAP//2, S//2 - GAP//2, S - GAP], R, (145, 204, 117))      # 折线 绿
rounded(d, [S//2 + GAP//2, S//2 + GAP//2, S - GAP, S - GAP], R, (238, 102, 102))  # 雷达 红

# 左上 柱状：三根白色柱
cx, cy = S//4, S//4
for i, h in enumerate([180, 280, 220]):
    x = cx - 240 + i * 180
    d.rounded_rectangle([x, cy + 150 - h, x + 120, cy + 150], radius=20, fill=(255, 255, 255))

# 右上 饼图：白色扇形分割
cx2, cy2 = S//4 * 3, S//4
d.pieslice([cx2 - 220, cy2 - 220, cx2 + 220, cy2 + 220], start=0, end=140, fill=(84, 112, 198))
d.pieslice([cx2 - 220, cy2 - 220, cx2 + 220, cy2 + 220], start=140, end=230, fill=(145, 204, 117))
d.pieslice([cx2 - 220, cy2 - 220, cx2 + 220, cy2 + 220], start=230, end=360, fill=(238, 102, 102))

# 左下 折线：白色折线
pts = []
cx3, cy3 = S//4, S//4 * 3
for i in range(6):
    px = cx3 - 240 + i * 96
    py = cy3 + [120, -40, 60, -100, 20, -80][i]
    pts.append((px, py))
for i in range(len(pts) - 1):
    d.line([pts[i], pts[i+1]], fill=(255, 255, 255), width=28)
for p in pts:
    d.ellipse([p[0]-18, p[1]-18, p[0]+18, p[1]+18], fill=(255, 255, 255))

# 右下 雷达：白色五边形
cx4, cy4 = S//4 * 3, S//4 * 3
poly = []
for i in range(5):
    ang = -math.pi / 2 + i * 2 * math.pi / 5
    poly.append((cx4 + 220 * math.cos(ang), cy4 + 220 * math.sin(ang)))
d.polygon(poly, outline=(255, 255, 255))
poly2 = [(cx4 + (p[0]-cx4)*0.5, cy4 + (p[1]-cy4)*0.5) for p in poly]
d.polygon(poly2, outline=(255, 255, 255))

out = ROOT / "icon.png"
img.save(str(out), "PNG")
print(f"icon.png {S}x{S} 已生成 -> {out}")
