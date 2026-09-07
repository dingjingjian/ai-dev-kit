# -*- coding: utf-8 -*-
"""用纯 PIL 复现 canvas 的珠子绘制逻辑，渲染出来目视检查材质（不依赖 numpy）。"""
import math, os
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))

PAL = {
    'w': '#F3EDE0', 'e': '#BDB6A8', 'k': '#221E1B', 'm': '#7A4A2E',
    'o': '#B0763C', 'r': '#C8382F', 'v': '#7E2B3A', 'p': '#C95F7C',
    'l': '#DCACBB', 'y': '#E9B23C', 'd': '#C9A34B', 'g': '#86A95C',
    'n': '#3D6B4E', 't': '#3FA79B', 'b': '#2F5D8C', 'c': '#86AECB',
}


def hex2rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def clamp(v):
    return max(0.0, min(255.0, v))


def lighten(c, f):
    return [clamp(x + f * 255) for x in c]


def darken(c, f):
    return [clamp(x - f * 255) for x in c]


def lerp(a, b, t):
    return a + (b - a) * t


def over(dst, src, sa):
    dr, da = dst
    if sa <= 0:
        return dst
    oa = sa + da * (1 - sa)
    if oa <= 0:
        return ([0, 0, 0], 0.0)
    orgb = [src[j] * sa + dr[j] * da * (1 - sa) for j in range(3)]
    return ([v / oa for v in orgb], oa)


def in_ellipse(px, py, cx, cy, a, b, rot):
    cr, sr = math.cos(rot), math.sin(rot)
    ux = ((px - cx) * cr + (py - cy) * sr) / a
    uy = (-(px - cx) * sr + (py - cy) * cr) / b
    return ux * ux + uy * uy <= 1.0


def radial_alpha(d, inner, outer, a_in, a_out):
    if d <= inner:
        return a_in
    if d >= outer:
        return a_out
    t = (d - inner) / (outer - inner)
    return lerp(a_in, a_out, t)


def body_color(py, cy, R, base, light, dark):
    t = max(0.0, min(1.0, (py - (cy - R)) / (2 * R)))
    if t < 0.45:
        f = t / 0.45
        return [base[i] + (light[i] - base[i]) * f for i in range(3)]
    else:
        f = (t - 0.45) / 0.55
        return [base[i] + (dark[i] - base[i]) * f for i in range(3)]


def draw_bead(size, hexcol, t=0.0):
    """t=0 普通珠子；t>0 熨烫融合进度。返回 RGBA 图像。"""
    s = size
    base = hex2rgb(hexcol)
    cx = cy = s / 2.0
    grow = min(1.0, t / 0.62)
    flat = min(1.0, t / 0.82)
    R = s * (0.40 + 0.14 * grow)
    RH = s * 0.23 * (1 - grow)

    light_f = max(0.01, 0.08 - 0.10 * flat) if t > 0 else 0.08
    dark_f = max(0.01, 0.08 - 0.10 * flat) if t > 0 else 0.08
    light = lighten(base, light_f)
    dark = darken(base, dark_f)

    # 高光参数
    hcx = cx - R * (0.22 if t <= 0 else 0.20)
    hcy = cy - R * (0.30 if t <= 0 else 0.28)
    ha = R * (0.10 if t <= 0 else (0.10 + 0.08 * flat))
    hb = R * (0.055 if t <= 0 else (0.055 + 0.04 * flat))
    hrot = -0.55
    h_a = max(0.0, 0.22 - 0.22 * flat)

    buf = bytearray(s * s * 4)
    k = 0
    for y in range(s):
        py = y + 0.5
        for x in range(s):
            px = x + 0.5
            dx, dy = px - cx, py - cy
            d = math.hypot(dx, dy)

            rgb, a = ([0.0, 0.0, 0.0], 0.0)

            # 1) 底部软阴影（未熨烫时立在钉板上）
            if t <= 0:
                sh_d = math.hypot(px - cx, (py - (cy + R * 0.32)) / 0.40)
                if sh_d < R * 0.90:
                    sa = radial_alpha(sh_d, 0, R * 0.90, 0.28, 0)
                    rgb, a = over((rgb, a), [0, 0, 0], sa)

            # 2) 珠体：外圆挖去中心孔的环形
            if d <= R and d >= RH:
                c = body_color(py, cy, R, base, light, dark)
                rgb, a = over((rgb, a), c, 1.0)
                # 管壁厚度：外缘压暗
                wa = radial_alpha(d, R * 0.74, R, 0, 0.16)
                if t > 0:
                    wa *= (1 - t)
                rgb, a = over((rgb, a), [0, 0, 0], wa)

            # 3) 孔洞：露出钉板/钉柱暖灰色，孔壁下侧受光、上侧背光
            if RH > 0.4 and d <= RH:
                fade = (1 - grow) if t > 0 else 1.0
                rgb, a = over((rgb, a), [82, 72, 62], 0.96 * fade)
                if py > cy + RH * 0.12 and d > RH * 0.60:
                    rgb, a = over((rgb, a), [255, 255, 255], 0.12 * fade)
                if py < cy - RH * 0.12 and d > RH * 0.60:
                    rgb, a = over((rgb, a), [0, 0, 0], 0.22 * fade)

            # 4) 环面高光：左上小椭圆
            if in_ellipse(px, py, hcx, hcy, ha, hb, hrot):
                rgb, a = over((rgb, a), [255, 255, 255], h_a)

            buf[k] = int(clamp(rgb[0]))
            buf[k + 1] = int(clamp(rgb[1]))
            buf[k + 2] = int(clamp(rgb[2]))
            buf[k + 3] = int(clamp(a * 255))
            k += 4

    return Image.frombytes('RGBA', (s, s), bytes(buf))


def main():
    BG = (34, 26, 19, 255)

    # 1) 大珠子细节
    big = Image.new('RGBA', (128 * 4 + 50, 160), BG)
    for i, code in enumerate(['r', 'w', 'n', 'b']):
        big.alpha_composite(draw_bead(128, PAL[code]), (i * 128 + 10, 16))

    # 2) 全色卡一排
    codes = list(PAL.keys())
    row = Image.new('RGBA', (64 * len(codes) + 20, 84), BG)
    for i, c in enumerate(codes):
        row.alpha_composite(draw_bead(64, PAL[c]), (10 + i * 64, 10))

    # 3) 5x5 阵列
    grid = Image.new('RGBA', (5 * 64 + 20, 5 * 64 + 20), BG)
    for j in range(5):
        for i in range(5):
            code = ['r', 'w', 'y', 'n', 'b'][(i + j) % 5]
            grid.alpha_composite(draw_bead(64, PAL[code]), (10 + i * 64, 10 + j * 64))

    # 4) 熨烫过程 t = 0 / 0.35 / 0.7 / 1.0
    iron = Image.new('RGBA', (64 * 4 * 3 + 40, 84), BG)
    for kk, t in enumerate([0.0, 0.35, 0.7, 1.0]):
        for i, code in enumerate(['r', 'w', 'n']):
            iron.alpha_composite(draw_bead(64, PAL[code], t), (10 + (kk * 3 + i) * 64, 10))

    parts = [big, row, grid, iron]
    W = max(p.width for p in parts)
    H = sum(p.height + 12 for p in parts)
    canvas = Image.new('RGBA', (W, H), (20, 15, 11, 255))
    y = 0
    for p in parts:
        canvas.alpha_composite(p, (0, y))
        y += p.height + 12
    canvas.convert('RGB').save(os.path.join(BASE, 'bead_check.png'))
    print('saved bead_check.png', canvas.size)


if __name__ == '__main__':
    main()
