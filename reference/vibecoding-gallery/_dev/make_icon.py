# -*- coding: utf-8 -*-
"""
生成小工具上传图标 icon.png（512x512，红底白色瀑布流双列卡片）。
用法：python _dev/make_icon.py
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
root = Path(__file__).resolve().parent.parent
out = root / "icon.png"

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
RED = (255, 36, 66, 255)
WHITE = (255, 255, 255, 255)
GRAY = (236, 238, 241, 255)

d.rounded_rectangle([0, 0, S - 1, S - 1], radius=116, fill=RED)

# 双列瀑布流卡片（右列上移错落）
def card(x0, y0, x1, y1, bars):
    d.rounded_rectangle([x0, y0, x1, y1], radius=22, fill=WHITE)
    for i, bw in enumerate(bars):
        d.rounded_rectangle(
            [x0 + 18, y0 + 26 + i * 34, x0 + 18 + bw, y0 + 40 + i * 34],
            radius=7, fill=GRAY)

card(92, 150, 218, 336, [84, 100, 66])   # 左列上：图区高 + 两行标题条
card(92, 352, 218, 428, [76, 92])        # 左列下
card(294, 96, 420, 252, [92, 74])        # 右列上
card(294, 268, 420, 430, [96, 84, 70])   # 右列下

img.save(out, "PNG", optimize=True)
print(f"OK {out} ({out.stat().st_size / 1024:.0f}KB)")
