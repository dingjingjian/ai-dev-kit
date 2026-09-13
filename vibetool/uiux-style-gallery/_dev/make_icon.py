# -*- coding: utf-8 -*-
"""生成应用图标 icon.png（2048×2048）。用法：python _dev/make_icon.py"""
from PIL import Image, ImageDraw

S = 2048
img = Image.new("RGB", (S, S), (245, 245, 247))
d = ImageDraw.Draw(img)
GAP = 40
R = 120

def rounded(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)

# 四宫格配色
rounded(d, [GAP, GAP, S//2 - GAP//2, S//2 - GAP//2], R, (255, 255, 255))            # 极简 白
rounded(d, [S//2 + GAP//2, GAP, S - GAP, S//2 - GAP//2], R, (255, 107, 157))         # 毛玻璃 粉
rounded(d, [GAP, S//2 + GAP//2, S//2 - GAP//2, S - GAP], R, (13, 17, 23))            # 深色 黑
rounded(d, [S//2 + GAP//2, S//2 + GAP//2, S - GAP, S - GAP], R, (10, 10, 18))        # 赛博 黑

# 左上 极简：黑方块 + 黑横线
d.rectangle([S//4 - 180, S//4 - 60, S//4 + 180, S//4 + 60], fill=(0, 0, 0))
d.rectangle([S//4 - 220, S//4 + 160, S//4 + 220, S//4 + 176], fill=(0, 0, 0))

# 右上 毛玻璃：半透白圆角块
ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
od = ImageDraw.Draw(ov)
od.rounded_rectangle([S//2 + 180, 280, S - 220, 760], radius=80, fill=(255, 255, 255, 150))
img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
d = ImageDraw.Draw(img)

# 左下 深色：霓虹绿进度环 + 白字感
cx, cy = S//4, S//4 * 3
d.ellipse([cx - 200, cy - 200, cx + 200, cy + 200], outline=(48, 209, 88), width=40)
d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=(48, 209, 88))

# 右下 赛博：霓虹青粉横条
bx = S//2 + GAP//2
d.rectangle([bx + 180, S//4 * 3 - 30, S - 220, S//4 * 3 + 30], fill=(0, 255, 255))
d.rectangle([bx + 180, S//4 * 3 + 80, S - 380, S//4 * 3 + 140], fill=(255, 0, 255))
d.rectangle([bx + 180, S//4 * 3 + 190, S - 300, S//4 * 3 + 250], fill=(0, 255, 255))

img.save("icon.png", "PNG")
print(f"icon.png {S}x{S} 已生成")
