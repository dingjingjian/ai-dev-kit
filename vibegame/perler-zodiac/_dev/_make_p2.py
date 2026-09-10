# -*- coding: utf-8 -*-
"""重做小红书 P2（图案库）：用 patterns.json 真实网格逐颗渲染拼豆。

每颗豆 = 管身圆 + 外缘暗边 + 左上高光 + 中心圆孔，彻底避免「光滑软胶玩具」感，
且 12 生肖与应用内图案完全一致。
运行：python _dev/_make_p2.py
"""
import json, math, os, random, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import patterns as P  # 复用 PAL 色卡
from PIL import Image, ImageDraw, ImageFont, ImageFilter

random.seed(20260910)
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(BASE, '..'))
W, H = 1536, 2048

DIFF = {'rat': 1, 'ox': 2, 'tiger': 3, 'rabbit': 1, 'dragon': 3, 'snake': 3,
        'horse': 2, 'goat': 2, 'monkey': 3, 'rooster': 1, 'dog': 2, 'pig': 1}

with open(os.path.join(BASE, 'patterns.json'), 'r', encoding='utf-8') as f:
    PATS = json.load(f)

FONT_TITLE = ImageFont.truetype(r'C:\Windows\Fonts\STXINGKA.TTF', 148)
FONT_SUB = ImageFont.truetype(r'C:\Windows\Fonts\simkai.ttf', 46)
FONT_LBL = ImageFont.truetype(r'C:\Windows\Fonts\simkai.ttf', 30)
FONT_STAR = ImageFont.truetype(r'C:\Windows\Fonts\simhei.ttf', 24)

CREAM = (246, 239, 221)
INK = (28, 26, 23)
MUTE = (107, 90, 56)
GOLD = (184, 146, 58)
HOLE = (74, 66, 56)


def hx(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def shift(c, d):
    return tuple(max(0, min(255, x + d)) for x in c)


# ---------- 背景 ----------
img = Image.new('RGB', (W, H), CREAM)
# 暖色轻晕
glow = Image.new('RGB', (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([-300, -300, W + 300, H * 0.9], fill=(250, 244, 228))
glow = glow.filter(ImageFilter.GaussianBlur(160))
img = Image.blend(img, glow, 0.35)
# 宣纸噪点
px = img.load()
for _ in range(26000):
    x = random.randint(0, W - 1); y = random.randint(0, H - 1)
    d = random.randint(-9, 7)
    r, g, b = px[x, y]
    px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)),
                max(0, min(255, b + d)))

dr = ImageDraw.Draw(img)


# ---------- 金色祥云角花 ----------
def corner(cx_dir, cy_dir):
    """以四角定位绘制金色双线卷云角花。"""
    def pt(x, y):  # 局部坐标(以角为原点, 向内为正) -> 全局
        gx = x if cx_dir == 1 else W - x
        gy = y if cy_dir == 1 else H - y
        return gx, gy
    for rr, wdt in ((118, 3), (92, 2)):
        box = [0, 0, rr * 2, rr * 2]
        # 只取朝内的四分之一弧
        b = [pt(0, 0)[0], pt(0, 0)[1], pt(rr * 2, rr * 2)[0],
             pt(rr * 2, rr * 2)[1]]
        b = [min(b[0], b[2]), min(b[1], b[3]), max(b[0], b[2]), max(b[1], b[3])]
        start = 0 if (cx_dir, cy_dir) == (-1, -1) else \
                90 if (cx_dir, cy_dir) == (1, -1) else \
                180 if (cx_dir, cy_dir) == (1, 1) else 270
        dr.arc(b, start, start + 90, fill=GOLD, width=wdt)
    # 小螺旋云头
    hx0, hy0 = pt(150, 150)
    for rr, wdt in ((26, 3), (13, 2)):
        dr.ellipse([hx0 - rr, hy0 - rr, hx0 + rr, hy0 + rr],
                   outline=GOLD, width=wdt)
    dr.arc([hx0 - 40, hy0 - 40, hx0 + 40, hy0 + 40], 20, 300,
           fill=GOLD, width=2)


corner(1, 1); corner(-1, 1); corner(1, -1); corner(-1, -1)


# ---------- 标题 ----------
dr.text((W // 2, 190), '12幅生肖纹样', font=FONT_TITLE, fill=INK, anchor='mm')
dr.text((W // 2, 300), '—— 三档难度 · 循序渐进 ——', font=FONT_SUB,
        fill=MUTE, anchor='mm')


# ---------- 单颗拼豆 ----------
def bead(g, x, y, r, hexs):
    c = hx(hexs)
    j = random.randint(-4, 4)
    c = shift(c, j)
    # 落地投影（略深于宣纸的暖灰椭圆，向下偏移）
    g.ellipse([x - r * 0.92, y - r * 0.62, x + r * 0.92, y + r * 1.18],
              fill=(208, 198, 174))
    # 管身
    g.ellipse([x - r, y - r, x + r, y + r], fill=c,
              outline=shift(c, -34), width=max(1, int(r * 0.12)))
    # 左上高光
    g.ellipse([x - r * 0.62, y - r * 0.66, x - r * 0.04, y - r * 0.18],
              fill=shift(c, 34))
    # 中心圆孔
    rh = r * 0.42
    g.ellipse([x - rh, y - rh, x + rh, y + rh], fill=HOLE)
    g.ellipse([x - rh * 0.5, y - rh * 0.62, x + rh * 0.12, y - rh * 0.08],
              fill=(120, 110, 96))


# ---------- 12 生肖 4×3 ----------
MX, TOP, BOT = 70, 360, 1760
cols, rows = 4, 3
tw = (W - MX * 2) / cols
th = (BOT - TOP) / rows

for idx, p in enumerate(PATS):
    cx0 = MX + (idx % cols) * tw
    cy0 = TOP + (idx // cols) * th
    n = p['n']
    pitch = min((tw * 0.80) / n, (th * 0.74) / n)
    gw = pitch * n
    ox = cx0 + (tw - gw) / 2
    oy = cy0 + (th * 0.74 - gw) / 2 + 6
    r = pitch * 0.44
    for j in range(n):
        for i in range(n):
            ch = p['grid'][j][i]
            if ch == '.':
                continue
            bx = ox + (i + 0.5) * pitch
            by = oy + (j + 0.5) * pitch
            bead(dr, bx, by, r, P.PAL[ch])
    # 名称 + 难度
    ly = cy0 + th * 0.80
    dr.text((cx0 + tw / 2, ly), p['name'], font=FONT_LBL, fill=INK,
            anchor='mm')
    stars = '★' * DIFF[p['id']]
    dr.text((cx0 + tw / 2, ly + 34), stars, font=FONT_STAR,
            fill=(198, 150, 48), anchor='mm')

# ---------- 底部金线 + 散落拼豆 ----------
dr.line([120, 1828, W - 120, 1828], fill=GOLD, width=2)
piles = [(360, 1908, ['r', 'o', 'y']), (620, 1912, ['t', 'g', 'c']),
         (880, 1906, ['p', 'l', 'w']), (1140, 1912, ['b', 'n', 'd'])]
for px0, py0, codes in piles:
    for k, code in enumerate(codes):
        ang = k * 2.1
        bead(dr, px0 + math.cos(ang) * 22, py0 + math.sin(ang) * 16,
             15, P.PAL[code])
for _ in range(130):
    x = random.randint(220, W - 220); y = random.randint(1850, 1970)
    dr.ellipse([x, y, x + random.randint(1, 3), y + random.randint(1, 3)],
               fill=shift(GOLD, random.randint(-10, 30)))

out = os.path.join(ROOT, 'xiaohongshu', 'p2_patterns.png')
img.save(out)
print('saved', out, img.size)
