# -*- coding: utf-8 -*-
"""
把 pax-06 / pax-10 车身蓝色统一为 pax-08 的蓝色。
做法：采样 pax-08 蓝色窗带的目标色相/饱和度；对另两张图中蓝色系像素
（色相 180~250、有一定饱和度）按饱和度做软权重，把 hue/sat 映射到目标值，
保留明度（value）以维持阴影与细节。
"""
import colorsys
import io
import sys
from pathlib import Path

import numpy as np
import PIL.Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"

HUE_LO, HUE_HI = 180 / 360, 250 / 360
SAT_MIN = 0.18


def hsv_arrays(img):
    rgb = np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    v = mx
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-9), 0)
    h = np.zeros_like(mx)
    m = d > 1e-9
    idx = m & (mx == r)
    h[idx] = ((g[idx] - b[idx]) / d[idx]) % 6
    idx = m & (mx == g)
    h[idx] = (b[idx] - r[idx]) / d[idx] + 2
    idx = m & (mx == b)
    h[idx] = (r[idx] - g[idx]) / d[idx] + 4
    h = h / 6.0
    return h, s, v, rgb


def rgb_from_hsv(h, s, v):
    i = np.floor(h * 6)
    f = h * 6 - i
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    i = i.astype(int) % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def target_stats():
    """pax-08 中饱和蓝的中位 hue / sat。"""
    img = PIL.Image.open(IMG / "pax-08.webp")
    h, s, v, _ = hsv_arrays(img)
    m = (h >= HUE_LO) & (h <= HUE_HI) & (s > 0.5) & (v > 0.3) & (v < 0.85)
    th = float(np.median(h[m]))
    ts = float(np.median(s[m]))
    tv = float(np.median(v[m]))
    print(f"pax-08 目标蓝: hue={th * 360:.1f}° sat={ts:.3f} val={tv:.3f}  像素数={int(m.sum())}")
    return th, ts, tv


def recolor(src, dst, th, ts):
    img = PIL.Image.open(IMG / src)
    h, s, v, _ = hsv_arrays(img)
    m = (h >= HUE_LO) & (h <= HUE_HI) & (s >= SAT_MIN)
    # 该图蓝色像素的中位饱和度/明度，按比例匹配到目标值
    med_s = float(np.median(s[m]))
    med_v = float(np.median(v[m]))
    sat_scale = ts / max(med_s, 1e-6)
    val_scale = tv / max(med_v, 1e-6)
    print(f"{src}: 蓝色像素 {int(m.sum())}, 中位sat={med_s:.3f}(x{sat_scale:.2f}), "
          f"中位val={med_v:.3f}(x{val_scale:.2f})")
    # 软权重：饱和度越低权重越小，避免白/灰边缘出现色晕
    w = np.clip((s - SAT_MIN) / 0.12, 0, 1) * m
    new_h = np.where(m, ((h - HUE_LO + th - HUE_LO) % 1.0) * 0 + th, h)
    # hue 直接设为目标；对权重低于 1 的像素按原色相/目标色相插值（走最短弧）
    dh = ((th - h + 0.5) % 1.0) - 0.5
    new_h = (h + dh * w) % 1.0
    new_s = np.clip(s * (1 + (sat_scale - 1) * w), 0, 1)
    new_v = np.clip(v * (1 + (val_scale - 1) * w), 0, 0.82)
    out = rgb_from_hsv(new_h, new_s, new_v)
    res = PIL.Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), "RGB")
    buf = io.BytesIO()
    res.save(buf, format="WEBP", quality=92, method=6)
    dst.write_bytes(buf.getvalue())
    print(f"{src} -> {dst.name}, {dst.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    th, ts, tv = target_stats()
    recolor("pax-06.webp", IMG / "pax-06.webp", th, ts)
    recolor("pax-10.webp", IMG / "pax-10.webp", th, ts)
