# -*- coding: utf-8 -*-
"""生成应用图标 icon.png（2048×2048）。用法：python _dev/make_icon.py"""
from PIL import Image, ImageDraw

S = 2048
BG = (13, 17, 23)          # --bg #0d1117
CARD = (22, 27, 34)        # --card #161b22
BORDER = (42, 50, 61)      # --border #2a323d
GREEN = (38, 166, 65)      # --green #26a641
GREEN_DEEP = (14, 92, 46)  # --green-deep
YELLOW = (211, 165, 39)    # --yellow
ORANGE = (232, 135, 30)    # --orange
RED = (229, 83, 75)        # --red
TEXT = (230, 237, 243)     # --text

img = Image.new("RGB", (S, S), BG)
d = ImageDraw.Draw(img)

# 圆角卡片底
GAP = 180
d.rounded_rectangle([GAP, GAP, S - GAP, S - GAP], radius=160, fill=CARD, outline=BORDER, width=8)

# ---------- 热力图格子阵列 ----------
CELL = 96
GAP_C = 14
COLS = 13
ROWS = 7
grid_w = COLS * CELL + (COLS - 1) * GAP_C
grid_h = ROWS * CELL + (ROWS - 1) * GAP_C
ox = (S - grid_w) // 2
oy = (S - grid_h) // 2 - 120

# 颜色梯度（模拟准时→加班）
palette = [CARD, GREEN_DEEP, GREEN, GREEN, YELLOW, ORANGE, RED, CARD, GREEN, GREEN_DEEP]
import itertools
seq = itertools.cycle(palette)
for r in range(ROWS):
    for c in range(COLS):
        x = ox + c * (CELL + GAP_C)
        y = oy + r * (CELL + GAP_C)
        d.rounded_rectangle([x, y, x + CELL, y + CELL], radius=18, fill=next(seq))

# 高亮"今天"格子（白色描边）
tx = ox + (COLS - 1) * (CELL + GAP_C)
ty = oy + 3 * (CELL + GAP_C)
d.rounded_rectangle([tx - 8, ty - 8, tx + CELL + 8, ty + CELL + 8], radius=24, outline=TEXT, width=10)
d.rounded_rectangle([tx, ty, tx + CELL, ty + CELL], radius=18, fill=GREEN)

# ---------- 标题文字 ----------
from PIL import ImageFont
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 96)
    font_s = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 56)
except Exception:
    font = ImageFont.load_default()
    font_s = ImageFont.load_default()

title = "准时下班了吗"
tw = d.textlength(title, font=font)
d.text(((S - tw) / 2, oy + grid_h + 90), title, fill=TEXT, font=font)

sub = "GitHub 式打卡热力图"
sw = d.textlength(sub, font=font_s)
d.text(((S - sw) / 2, oy + grid_h + 210), sub, fill=(139, 148, 158), font=font_s)

img.save("icon.png", "PNG")
print(f"icon.png {S}x{S} 已生成")
