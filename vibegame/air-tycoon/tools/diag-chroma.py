# -*- coding: utf-8 -*-
"""解剖 infoAB：把标记像素按「青环 / 橙点 / 其它」分桶，看彩度丢失集中在哪。"""
import pathlib
import sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOT = ROOT / "docs" / "shots"
ON = SHOT / "smoke-14-lights-face.png"
OFF = SHOT / "smoke-16-lights-off.png"

on = np.asarray(Image.open(ON).convert("RGB")).astype(np.int16)
off = np.asarray(Image.open(OFF).convert("RGB")).astype(np.int16)
H, W = off.shape[:2]
cx, cy = W // 2, H // 2
rs = (0.2828 * H * 0.55) ** 2

blur_off = np.asarray(Image.open(OFF).convert("L").filter(ImageFilter.BoxBlur(15))).astype(np.float32)

lum = lambda a: (0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]) / 255.0
lf = lum(off)
yy, xx = np.mgrid[0:H, 0:2]
yy, xx = np.mgrid[0:H, 0:W]
inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= rs
mask = inside & (lf > 0.35) & (lf - blur_off / 255.0 > 0.10)

r0, b0 = on[:, :, 0], on[:, :, 2]
r1, b1 = off[:, :, 0], off[:, :, 2]
chroma_on = np.abs(r0 - b0) / 255.0
chroma_off = np.abs(r1 - b1) / 255.0

# 分桶：青（B-R 大）/ 橙（R-B 大）/ 低彩度
cyan = mask & (b1 - r1 > 45)
amber = mask & (r1 - b1 > 45)
other = mask & ~cyan & ~amber

for name, m in (("全部", mask), ("青环", cyan), ("橙点", amber), ("低彩", other)):
    n = int(m.sum())
    if not n:
        print("%s: 0 px" % name)
        continue
    co = chroma_off[m].mean()
    ci = chroma_on[m].mean()
    lo = lf[m].mean()
    li = lum(on)[m].mean()
    print("%s: n=%5d  chromaOff=%.3f chromaOn=%.3f  保留=%.3f  lumOff=%.3f lumOn=%.3f"
          % (name, n, co, ci, ci / co, lo, li))

# 灯火强度在标记像素上的增量（ON-OFF 亮度差）
d = (lum(on) - lum(off))[mask]
print("标记像素灯火增量: mean=%.3f p90=%.3f" % (d.mean(), np.percentile(d, 90)))
