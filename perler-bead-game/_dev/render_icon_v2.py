# -*- coding: utf-8 -*-
"""
国风拼豆坊 · 应用图标 v2

上一版问题：钉板 + 13x13 网格 + 印章三层元素叠加，符号分散，
缩到 48px 糊成一团色块。应用图标需要「单一强符号」。

v2 三个方向：
    1. beads  —— 五颗大拼豆梅花排布，中心孔穿透透出底板（聚焦「豆」本身）
    2. seal   —— 一枚大朱砂印，印面用拼豆孔阵列构成，刻「拼」字
    3. glyph  —— 用拼豆格子拼出「豆」字，笔画即豆阵，双重表意

每个方向出「底板版」与「透明版」两张，1024x1024。
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from render_icon import (
    SS, SIZE, S, GOLD, FONT_KAI, OUT_DIR,
    hx, mix, darken, lighten, radial_alpha, solid, noise_layer,
    build_paper, build_seal, build_bead_layers, make_bead, center_grid, add_grain,
)

OUT_DIR_V2 = os.path.join(OUT_DIR, "v2")

# 国风色卡取色
C_CINNABAR = hx("#C8382F")   # 朱砂
C_CRIMSON = hx("#8E2018")    # 深朱（印章暗部）
C_WISTERIA = hx("#E9B23C")   # 藤黄
C_PINE = hx("#3D6B4E")       # 松绿
C_BLUE = hx("#2F5D8C")       # 青花
C_TEAL = hx("#3FA79B")       # 青碧
C_PURPLE = hx("#7E2B3A")     # 绛紫
C_CREAM = hx("#F3EDE0")      # 月白


# ---------------------------------------------------------------- 通用

def paper(corner=False):
    return build_paper(corner=corner)


def drop_shadow(size, cx, cy, w, h, blur, color=(58, 38, 22), alpha=170):
    """单个椭圆投影"""
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse(
        [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
        fill=color + (alpha,),
    )
    return sh.filter(ImageFilter.GaussianBlur(blur))


# ---------------------------------------------------------------- 大拼豆特写

def big_bead(size, color, hole_ratio=0.30):
    """
    大颗拼豆正面特写：
      圆角方块（保留拼豆基因）+ 真正穿透的中心孔 + 立体高光 + 内壁厚度
    孔为全透明，透出下方底板；孔缘上暗下亮模拟豆子厚度。
    """
    rad = int(size * 0.42)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # 主体
    ImageDraw.Draw(img).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=rad, fill=color + (255,)
    )

    # 左上受光
    img.alpha_composite(solid(
        size, lighten(color, 0.46),
        radial_alpha(size, size * 0.30, size * 0.25, size * 0.92, 0.80, power=1.7)))
    # 右下背光
    img.alpha_composite(solid(
        size, darken(color, 0.52),
        radial_alpha(size, size * 0.84, size * 0.88, size * 0.82, 0.62, power=1.9)))

    # 底部环境反光
    img.alpha_composite(solid(
        size, (255, 248, 228),
        radial_alpha(size, size * 0.52, size * 0.90, size * 0.40, 0.22, power=2.4)))

    # 主高光斑
    spec = solid(
        size, (255, 255, 255),
        radial_alpha(size, size * 0.31, size * 0.24, size * 0.30, 0.60, power=2.0))
    img.alpha_composite(spec.filter(ImageFilter.GaussianBlur(size * 0.022)))

    # 顶部窄边反光（塑料边缘）
    edge = solid(
        size, (255, 255, 255),
        radial_alpha(size, size * 0.50, size * 0.055, size * 0.46, 0.30, power=2.6))
    img.alpha_composite(edge)

    # ---- 中心孔 ----
    hr = size * hole_ratio / 2
    cx = cy = size / 2
    pad = size * 0.040                      # 内壁环带宽度
    d = ImageDraw.Draw(img)

    outer = [cx - hr - pad, cy - hr - pad, cx + hr + pad, cy + hr + pad]
    d.ellipse(outer, fill=darken(color, 0.40) + (255,))         # 内壁暗环
    d.arc(outer, 15, 165, fill=lighten(color, 0.62) + (255,),
          width=max(1, int(pad * 1.5)))                          # 内壁下缘受光
    d.arc(outer, 195, 345, fill=darken(color, 0.22) + (255,),
          width=max(1, int(pad * 1.2)))                          # 内壁上缘压暗

    # 挖空中心孔（穿透）
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=rad, fill=255)
    ImageDraw.Draw(mask).ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=0)

    img.putalpha(Image.fromarray(
        np.minimum(np.array(img.getchannel("A")), np.array(mask)), mode="L"))

    # 外缘一圈极细暗边，强化剪影
    rim = Image.new("L", (size, size), 0)
    ImageDraw.Draw(rim).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=rad, outline=180,
        width=max(1, int(size * 0.012)))
    rim_img = Image.new("RGBA", (size, size), darken(color, 0.55) + (255,))
    rim_img.putalpha(Image.fromarray(
        np.minimum(np.array(rim), np.array(img.getchannel("A"))), mode="L"))
    img.alpha_composite(rim_img)

    return img


def style_beads(with_paper=True):
    """五颗大拼豆，梅花排布：中心朱砂 + 四角国风四色"""
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_paper:
        canvas.alpha_composite(paper(corner=True))

    center_s = int(322 * SS)
    side_s = int(250 * SS)
    dist = int(197 * SS)          # 对角分量，实际半径 ≈ 260

    layout = [
        (-dist, -dist, side_s, C_WISTERIA),   # 左上：藤黄
        (dist, -dist, side_s, C_BLUE),        # 右上：青花
        (-dist, dist, side_s, C_PINE),        # 左下：松绿
        (dist, dist, side_s, C_TEAL),         # 右下：青碧
    ]

    # 投影统一先铺
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for dx, dy, s, _ in layout:
        shadow.alpha_composite(
            drop_shadow(S, S / 2 + dx, S / 2 + dy + s * 0.50, s * 1.02, s * 0.40,
                        blur=s * 0.10),
            (0, 0))
    shadow.alpha_composite(
        drop_shadow(S, S / 2, S / 2 + center_s * 0.50, center_s * 1.02, center_s * 0.40,
                    blur=center_s * 0.10, alpha=190),
        (0, 0))
    canvas.alpha_composite(shadow)

    for dx, dy, s, col in layout:
        b = big_bead(s, col)
        canvas.alpha_composite(b, (int(S / 2 + dx - s / 2), int(S / 2 + dy - s / 2)))

    # 中心朱砂豆压在最上层
    c = big_bead(center_s, C_CINNABAR, hole_ratio=0.27)
    canvas.alpha_composite(c, (int(S / 2 - center_s / 2), int(S / 2 - center_s / 2)))

    return canvas


def style_single(with_paper=True):
    """
    单颗巨豆：符号最简、剪影最强。
    缩到 32px 仍是「朱砂圆角方块 + 米白穿孔」，辨识度最高。
    """
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_paper:
        canvas.alpha_composite(paper(corner=True))

    size = int(690 * SS)
    bead = big_bead(size, C_CINNABAR, hole_ratio=0.235)
    bead = bead.rotate(-3.0, resample=Image.BICUBIC, expand=True)

    cx, cy = S / 2, S / 2 - int(10 * SS)
    canvas.alpha_composite(
        drop_shadow(S, cx + size * 0.02, cy + size * 0.54, size * 1.00, size * 0.30,
                    blur=size * 0.070, alpha=185),
        (0, 0))
    canvas.alpha_composite(bead, (int(cx - bead.width / 2), int(cy - bead.height / 2)))

    # 右下角小印章点缀
    s = build_seal().resize((int(178 * SS), int(178 * SS)), Image.LANCZOS)
    s = s.rotate(-5.0, resample=Image.BICUBIC, expand=True)
    m = int(96 * SS)
    canvas.alpha_composite(s, (S - m - s.width, S - m - s.height))
    return canvas


# ---------------------------------------------------------------- 朱砂大印

def build_big_seal(size, text="拼"):
    """大朱砂印：印面由拼豆孔阵列构成，白文刻字"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 印底
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.055),
                        fill=C_CINNABAR + (255,))
    # 印泥深浅
    dark = Image.new("RGBA", (size, size), C_CRIMSON + (255,))
    dark.putalpha(noise_layer(size, 44, size * 0.05).point(lambda v: int(v * 0.34)))
    img.alpha_composite(dark)
    # 左上受光
    img.alpha_composite(solid(
        size, lighten(C_CINNABAR, 0.30),
        radial_alpha(size, size * 0.26, size * 0.20, size * 0.95, 0.42, power=1.8)))

    # 拼豆孔阵列：印面由豆子构成
    inner = int(size * 0.115)
    span = size - inner * 2
    n = 9
    step = span / n
    hr = step * 0.155
    pd = ImageDraw.Draw(img)
    for r in range(n):
        for c in range(n):
            cx = inner + step * (c + 0.5)
            cy = inner + step * (r + 0.5)
            pd.ellipse([cx - hr, cy - hr, cx + hr, cy + hr],
                       fill=darken(C_CINNABAR, 0.50) + (255,))
            # 孔下缘微光
            pd.arc([cx - hr * 1.25, cy - hr * 1.25, cx + hr * 1.25, cy + hr * 1.25],
                   20, 160, fill=lighten(C_CINNABAR, 0.34) + (190,),
                   width=max(1, int(hr * 0.5)))

    # 印边
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.055),
                        outline=C_CRIMSON + (255,), width=int(size * 0.042))
    d.rectangle([inner, inner, size - 1 - inner, size - 1 - inner],
                outline=C_CREAM + (240,), width=int(size * 0.048))

    # 白文刻字
    fs = int(size * 0.60)
    font = ImageFont.truetype(FONT_KAI, fs)
    txt = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt)
    bbox = td.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    td.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]),
            text, font=font, fill=C_CREAM + (255,))

    # 字口缺墨斑驳
    nib = Image.fromarray(
        np.clip(np.abs(np.random.normal(0, 1, (size, size))).astype(np.float32) * 80, 0, 255)
        .astype(np.uint8), mode="L"
    ).filter(ImageFilter.GaussianBlur(size * 0.010))
    nib = np.clip(255 - np.array(nib, dtype=np.float32) * 2.0, 90, 255).astype(np.uint8)
    txt.putalpha(Image.fromarray(
        np.minimum(np.array(txt.getchannel("A")), nib), mode="L"))
    img.alpha_composite(txt)

    # 印章厚度（下、右暗边）
    th_ = int(size * 0.028)
    side = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(side).rounded_rectangle(
        [th_ * 0.6, th_ * 2.2, size - 1 + th_ * 0.4, size - 1 + th_ * 0.4],
        radius=int(size * 0.055), fill=darken(C_CRIMSON, 0.72) + (255,))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(side)
    out.alpha_composite(img)
    return out


def style_seal(with_paper=True):
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_paper:
        canvas.alpha_composite(paper(corner=False))

    size = int(600 * SS)
    seal = build_big_seal(size, "拼")
    seal = seal.rotate(-3.0, resample=Image.BICUBIC, expand=True)

    cx, cy = S / 2, S / 2
    canvas.alpha_composite(
        drop_shadow(S, cx + size * 0.03, cy + size * 0.55, size * 1.05, size * 0.30,
                    blur=size * 0.075, alpha=175),
        (0, 0))
    canvas.alpha_composite(seal, (int(cx - seal.width / 2), int(cy - seal.height / 2)))
    return canvas


# ---------------------------------------------------------------- 拼豆「豆」字

# 15x15 字形稿：顶横 → 口 → 两点 → 长横（笔画 2 格宽，保证小尺寸下饱满）
GLYPH = [
    "...............",
    "..###########..",
    "..###########..",
    "..##.......##..",
    "..##.......##..",
    "..##.......##..",
    "..###########..",
    "...............",
    "..##.......##..",
    "..##.......##..",
    "...#.......#...",
    "...............",
    ".#############.",
    ".#############.",
    "...............",
]


def style_glyph(with_paper=True, seal=True):
    """用拼豆格子拼出「豆」字，笔画即豆阵"""
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_paper:
        canvas.alpha_composite(paper(corner=True))

    grid = center_grid(GLYPH)
    n = len(grid)
    span = int(832 * SS)
    cell = int(round(span / n))
    bs = cell * n
    x0 = (S - bs) // 2
    y0 = (S - bs) // 2

    L = build_bead_layers(cell)

    board = Image.new("RGBA", (bs, bs), (0, 0, 0, 0))

    # 投影
    shadow = Image.new("RGBA", (bs, bs), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for r in range(n):
        for c in range(n):
            if grid[r][c] == ".":
                continue
            bx, by = cell * c, cell * r
            sd.rounded_rectangle(
                [bx + cell * 0.06, by + cell * 0.16, bx + cell * 0.96, by + cell * 1.02],
                radius=int(cell * 0.28), fill=(58, 34, 22, 168))
    shadow = shadow.filter(ImageFilter.GaussianBlur(cell * 0.085))
    board.alpha_composite(shadow)

    # 豆子：垂直方向朱砂 → 绛紫渐变，横向左亮右暗
    for r in range(n):
        for c in range(n):
            if grid[r][c] == ".":
                continue
            t = r / max(n - 1, 1)
            col = mix(C_CINNABAR, C_PURPLE, t * 0.82)
            col = mix(col, darken(col, 0.86), c / max(n - 1, 1) * 0.35)
            board.alpha_composite(make_bead(col, L), (cell * c, cell * r))

    canvas.alpha_composite(board, (x0, y0))

    if seal:
        s = build_seal().resize((int(150 * SS), int(150 * SS)), Image.LANCZOS)
        s = s.rotate(-4.5, resample=Image.BICUBIC, expand=True)
        canvas.alpha_composite(s, (x0 + bs - int(s.width * 0.72),
                                   y0 + bs - int(s.height * 0.72)))
    return canvas


# ---------------------------------------------------------------- 红灯笼

# 17x17 原图稿（取自 patterns.json / lantern）
LANTERN_GRID = [
    "........k........",
    "........k........",
    ".....dyyyyyd.....",
    ".....dvvvvvd.....",
    ".....ddddddd.....",
    "....vvvrvrvvv....",
    "...vvvvrvrvvvv...",
    "...vvvvryrvvvv...",
    "...vvvvyyyvvvv...",
    "...vvvvrkrvvvv...",
    "...vvvvrvrvvvv...",
    "....vvvrvrvvv....",
    ".....vvvvvvv.....",
    "......vdddv......",
    ".....ddddddd.....",
    ".....ddyyydd.....",
    "......yyyyy......",
]

# 图标用色：原稿主色是绛紫（偏暗紫），提亮为朱砂才像「红灯笼」；
# 原稿的朱砂竖纹改描金，成为灯笼骨架。
LANTERN_COLORS = {
    "v": hx("#C8382F"),   # 灯笼主体：绛紫 → 朱砂
    "r": hx("#E9B23C"),   # 骨架竖纹：朱砂 → 藤黄
    "y": hx("#E9B23C"),   # 藤黄（顶饰 / 流苏）
    "d": hx("#C9A34B"),   # 描金（上下盖）
    "k": hx("#221E1B"),   # 墨黑（提手 / 灯芯）
}


def style_lantern(with_paper=True):
    """红灯笼：去钉板，让灯笼剪影本身当主角；加暖光晕体现灯火"""
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_paper:
        canvas.alpha_composite(paper(corner=True))

    grid = center_grid(LANTERN_GRID)
    n = len(grid)
    span = int(852 * SS)
    cell = int(round(span / n))
    bs = cell * n
    x0 = (S - bs) // 2
    y0 = (S - bs) // 2

    # 灯火暖晕（垫在豆阵之下，极淡）
    canvas.alpha_composite(solid(
        S, (255, 186, 84),
        radial_alpha(S, S / 2, S / 2 + bs * 0.04, bs * 0.54, 0.22, power=2.2)))

    L = build_bead_layers(cell)
    board = Image.new("RGBA", (bs, bs), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (bs, bs), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for r in range(n):
        for c in range(n):
            if grid[r][c] == ".":
                continue
            bx, by = cell * c, cell * r
            sd.rounded_rectangle(
                [bx + cell * 0.06, by + cell * 0.16, bx + cell * 0.96, by + cell * 1.02],
                radius=int(cell * 0.28), fill=(74, 28, 20, 168))
    board.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(cell * 0.085)))

    # 豆子：左右两侧压暗，让灯笼有球体感
    mid = (n - 1) / 2
    for r in range(n):
        for c in range(n):
            ch = grid[r][c]
            if ch == ".":
                continue
            col = LANTERN_COLORS.get(ch, C_CINNABAR)
            t = abs(c - mid) / mid
            col = mix(col, darken(col, 0.78), (t ** 1.6) * 0.42)
            board.alpha_composite(make_bead(col, L), (cell * c, cell * r))

    canvas.alpha_composite(board, (x0, y0))
    return canvas


# ---------------------------------------------------------------- 输出

STYLES = {
    "灯笼": style_lantern,
    "单豆": style_single,
    "大珠": style_beads,
    "印章": style_seal,
    "豆字": style_glyph,
}


def main(targets=None):
    os.makedirs(OUT_DIR_V2, exist_ok=True)
    made = []
    for name, fn in STYLES.items():
        if targets and name not in targets:
            continue
        for wp in (True, False):
            img = fn(with_paper=wp).resize((SIZE, SIZE), Image.LANCZOS)
            img = add_grain(img)
            tag = "底板" if wp else "透明"
            path = os.path.join(OUT_DIR_V2, f"图标_{name}_{tag}_{SIZE}.png")
            img.save(path, "PNG", optimize=True)
            made.append(path)
            print(f"[ok] 图标_{name}_{tag}_{SIZE}.png  "
                  f"{os.path.getsize(path) / 1024:.0f} KB")
    return made


if __name__ == "__main__":
    import sys
    main(sys.argv[1:] or None)
