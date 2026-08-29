# -*- coding: utf-8 -*-
"""
国风拼豆坊 · 应用图标渲染器

程序化绘制 1:1 PNG 应用图标：
  - 底板：宣纸米白 + 径向渐变 + 噪点纤维 + 描金描边 + 四角回纹角饰
  - 主体：木质拼豆钉板 + 13x13 国风色卡拼豆（圆角方块 / 中心孔 / 高光 / 投影）
  - 印章：右下角朱砂印（华文楷体「坊」字，模拟印泥斑驳）

图案数据直接取自 patterns.json，与游戏本体同源。
坐标按 4x 超采样绘制后 LANCZOS 缩放到目标尺寸。

用法：
    python render_icon.py              # 生成全部（梅花 + 铜钱，底板版 + 透明版）
    python render_icon.py plum         # 只生成指定图案
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------------------------------------------------------------- 基础配置

SS = 4                      # 超采样倍数
SIZE = 1024                 # 输出尺寸（1:1）
S = SIZE * SS               # 实际绘制尺寸

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "icons")
FONT_KAI = r"C:\Windows\Fonts\STKAITI.TTF"

# 国风 16 色卡（取自 设定文档.md 第四节）
PALETTE = {
    "w": "#F3EDE0", "e": "#BDB6A8", "k": "#221E1B", "m": "#7A4A2E",
    "o": "#B0763C", "r": "#C8382F", "v": "#7E2B3A", "p": "#C95F7C",
    "l": "#DCACBB", "y": "#E9B23C", "d": "#C9A34B", "g": "#86A95C",
    "n": "#3D6B4E", "t": "#3FA79B", "b": "#2F5D8C", "c": "#86AECB",
}

# 版面常量（均为 1x 尺度，内部统一乘 SS）
PAPER_MARGIN = 30           # 底板外边距
PAPER_RADIUS = 226          # 底板圆角（squircle 观感）
GOLD = "#C9A34B"            # 描金
INK = "#221E1B"             # 墨黑
BOARD_SIZE = 664            # 钉板边长
BOARD_TOP_BIAS = 0          # 钉板整体竖直居中
SEAL_SIZE = 158             # 印章边长（稍大，压角更稳）
SEAL_TEXT = "坊"


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def darken(c, f):
    """f 为保留比例，越小越暗"""
    return tuple(int(round(v * f)) for v in c)


def lighten(c, f, target=255):
    return tuple(int(round(v + (target - v) * f)) for v in c)


# ---------------------------------------------------------------- 通用图层工具

def radial_alpha(size, cx, cy, r, alpha_max, power=2.0, alpha_min=0.0):
    """生成径向 alpha 渐变（numpy）"""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / float(r)
    a = np.clip(1.0 - dist, 0.0, 1.0) ** power
    a = alpha_min + (alpha_max - alpha_min) * a
    return (a * 255).astype(np.uint8)


def linear_alpha(size, angle_deg, alpha_max, alpha_min=0.0, power=1.0):
    """线性 alpha 渐变，angle_deg=0 表示从左往右递增"""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    rad = np.deg2rad(angle_deg)
    t = (xx * np.cos(rad) + yy * np.sin(rad)) / float(size)
    t = np.clip((t - t.min()) / max(t.max() - t.min(), 1e-6), 0, 1)
    a = (alpha_min + (alpha_max - alpha_min) * (t ** power)) * 255
    return a.astype(np.uint8)


def noise_layer(size, amp, blur=None, base=128):
    """生成噪点纹理（L 模式）。blur 可为标量或 (x, y) 各向异性半径。"""
    n = np.random.normal(0, 1, (size, size)).astype(np.float32)
    n = np.clip(base + n * amp, 0, 255).astype(np.uint8)
    img = Image.fromarray(n, mode="L")
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return img


def solid(size, color, alpha_mask=None):
    img = Image.new("RGBA", (size, size), color + (255,))
    if alpha_mask is not None:
        img.putalpha(Image.fromarray(alpha_mask, mode="L"))
    return img


def rounded(size, radius, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, fill=color + (255,)
    )
    return img


# ---------------------------------------------------------------- 拼豆珠子

def build_bead_layers(cell):
    """
    预生成与颜色无关的珠子图层（高光 / 暗角 / 孔形 / 孔内高光）。
    cell 为超采样后的单格像素尺寸。
    """
    p = int(round(cell * 0.05))          # 珠子外缩，留出钉板缝隙
    side = cell - p * 2
    rad = int(round(cell * 0.30))

    # 主体形状遮罩
    shape = Image.new("L", (cell, cell), 0)
    ImageDraw.Draw(shape).rounded_rectangle(
        [p, p, cell - p - 1, cell - p - 1], radius=rad, fill=255
    )

    # 左上主高光（白色径向）
    hl = solid(
        cell, (255, 255, 255),
        radial_alpha(cell, cell * 0.34, cell * 0.30, cell * 0.72, 0.42, power=2.2),
    )
    hl.putalpha(Image.fromarray(
        np.minimum(np.array(hl.getchannel("A")),
                   np.array(shape)) , mode="L"))

    # 底部反光（暖白，弱）
    bounce = solid(
        cell, (255, 250, 235),
        radial_alpha(cell, cell * 0.52, cell * 0.86, cell * 0.44, 0.20, power=2.4),
    )
    bounce.putalpha(Image.fromarray(
        np.minimum(np.array(bounce.getchannel("A")), np.array(shape)), mode="L"))

    # 边缘暗角（体积感）
    vig_a = np.clip(
        (np.array(radial_alpha(cell, cell * 0.46, cell * 0.46, cell * 0.62, 1.0, power=2.6)).astype(np.float32)
         / 255.0), 0, 1)
    vig = np.array(
        ((1.0 - vig_a) * 0.42 * 255).astype(np.uint8)
    )
    vig = Image.fromarray(vig, mode="L")
    vig_img = Image.new("RGBA", (cell, cell), (0, 0, 0, 255))
    vig_img.putalpha(Image.fromarray(
        np.minimum(np.array(vig), np.array(shape)), mode="L"))

    # 中心孔
    hr = cell * 0.155
    hcx = hcy = cell * 0.5
    hole_box = [hcx - hr, hcy - hr, hcx + hr, hcy + hr]

    hole_shape = Image.new("L", (cell, cell), 0)
    ImageDraw.Draw(hole_shape).ellipse(hole_box, fill=255)

    # 孔内上缘阴影 + 下缘反光
    hole_top = Image.new("L", (cell, cell), 0)
    ImageDraw.Draw(hole_top).ellipse(
        [hcx - hr, hcy - hr * 1.05, hcx + hr, hcy - hr * 0.15], fill=255
    )
    hole_bot = Image.new("L", (cell, cell), 0)
    ImageDraw.Draw(hole_bot).ellipse(
        [hcx - hr * 0.92, hcy + hr * 0.30, hcx + hr * 0.92, hcy + hr * 1.02], fill=255
    )

    # 顶部小高光点
    spec_a = radial_alpha(cell, cell * 0.33, cell * 0.24, cell * 0.20, 0.85, power=2.0)
    spec_a = Image.fromarray(spec_a, mode="L").filter(
        ImageFilter.GaussianBlur(cell * 0.035)
    )
    spec = Image.new("RGBA", (cell, cell), (255, 255, 255, 255))
    spec.putalpha(Image.fromarray(
        np.minimum(np.array(spec_a), np.array(shape)), mode="L"))

    return {
        "cell": cell,
        "p": p,
        "rad": rad,
        "shape": shape,
        "hl": hl,
        "bounce": bounce,
        "vig": vig_img,
        "hole_shape": hole_shape,
        "hole_box": hole_box,
        "hole_top": hole_top,
        "hole_bot": hole_bot,
        "spec": spec,
    }


def make_bead(base_rgb, L):
    """按缓存图层合成一颗珠子"""
    cell = L["cell"]
    bead = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    d = ImageDraw.Draw(bead)

    # 主体
    d.rounded_rectangle(
        [L["p"], L["p"], cell - L["p"] - 1, cell - L["p"] - 1],
        radius=L["rad"], fill=base_rgb + (255,),
    )

    bead.alpha_composite(L["hl"])
    bead.alpha_composite(L["bounce"])
    bead.alpha_composite(L["vig"])

    # 中心孔：基色压暗，模拟透光孔洞
    hr = Image.new("RGBA", (cell, cell), darken(base_rgb, 0.34) + (255,))
    hr.putalpha(L["hole_shape"])
    bead.alpha_composite(hr)

    hs = Image.new("RGBA", (cell, cell), darken(base_rgb, 0.18) + (255,))
    hs.putalpha(Image.fromarray(
        np.minimum(np.array(L["hole_top"]), np.array(L["hole_shape"])), mode="L"))
    bead.alpha_composite(hs)

    hb = Image.new("RGBA", (cell, cell), lighten(base_rgb, 0.30) + (255,))
    hb.putalpha(Image.fromarray(
        np.minimum(np.array(L["hole_bot"]), np.array(L["hole_shape"])), mode="L"))
    bead.alpha_composite(hb)

    bead.alpha_composite(L["spec"])

    # 裁剪到主体形状，防止图层溢出格子
    bead.putalpha(Image.fromarray(
        np.minimum(np.array(bead.getchannel("A")), np.array(L["shape"])), mode="L"))
    return bead


def center_grid(grid):
    """按图案非空 bounding box 居中，让主体视觉居中。"""
    n = len(grid)
    rows = [r for r, row in enumerate(grid) if any(c != "." for c in row)]
    cols = [c for c in range(n) if any(grid[r][c] != "." for r in range(n))]
    if not rows or not cols:
        return grid
    min_r, max_r = rows[0], rows[-1]
    min_c, max_c = cols[0], cols[-1]
    h = max_r - min_r + 1
    w = max_c - min_c + 1
    off_r = (n - h) // 2 - min_r
    off_c = (n - w) // 2 - min_c
    new = ["." * n for _ in range(n)]
    for r in range(n):
        for c in range(n):
            if grid[r][c] != ".":
                nr, nc = r + off_r, c + off_c
                if 0 <= nr < n and 0 <= nc < n:
                    row = list(new[nr])
                    row[nc] = grid[r][c]
                    new[nr] = "".join(row)
    return new


# ---------------------------------------------------------------- 宣纸底板

def build_paper(corner=True):
    """宣纸底板：米白渐变 + 纤维噪点 + 描金描边 + 四角回纹（可关）"""
    m = PAPER_MARGIN * SS
    side = S - m * 2
    radius = PAPER_RADIUS * SS

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 径向底色：中心暖亮 → 边缘沉稳
    base = Image.new("RGBA", (S, S), hx("#F3EDE0") + (255,))
    warm = solid(S, hx("#FBF7EE"), radial_alpha(S, S * 0.42, S * 0.36, S * 0.78, 0.95, power=1.5))
    base.alpha_composite(warm)
    edge = solid(S, hx("#D8CDB8"), radial_alpha(S, S * 0.5, S * 0.5, S * 0.72, 0.55, power=3.0, alpha_min=0.0))
    # 边缘压暗：用中心透明、外围不透明的环状渐变
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dist = np.sqrt((xx - S * 0.5) ** 2 + (yy - S * 0.5) ** 2) / (S * 0.72)
    ring = np.clip(dist, 0, 1) ** 2.6 * 0.5 * 255
    edge_img = Image.new("RGBA", (S, S), hx("#C9BCA2") + (255,))
    edge_img.putalpha(Image.fromarray(ring.astype(np.uint8), mode="L"))
    base.alpha_composite(edge_img)

    # 裁成圆角方形
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [m, m, m + side - 1, m + side - 1], radius=radius, fill=255
    )
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(base, (0, 0), mask)

    # 宣纸纤维噪点
    fiber = Image.new("RGBA", (S, S), (90, 74, 52, 255))
    fiber.putalpha(noise_layer(S, 26, SS * 0.6).point(lambda v: int(v * 0.10)))
    img.alpha_composite(fiber)

    # 宣纸长纤维（横向细丝）
    st = Image.new("RGBA", (S, S), (120, 100, 70, 255))
    st.putalpha(noise_layer(S, 30, (SS * 0.5, SS * 3.0)).point(lambda v: int(v * 0.07)))
    img.alpha_composite(st)

    d = ImageDraw.Draw(img)

    # 外描边：墨黑打底 + 描金主线 + 内细墨线
    d.rounded_rectangle([m, m, m + side - 1, m + side - 1], radius=radius,
                        outline=hx("#8E7442") + (255,), width=int(7 * SS))
    d.rounded_rectangle(
        [m + 3.5 * SS, m + 3.5 * SS, m + side - 1 - 3.5 * SS, m + side - 1 - 3.5 * SS],
        radius=int(radius - 3.5 * SS), outline=hx(GOLD) + (255,), width=int(4 * SS),
    )
    inner = int(14 * SS)
    d.rounded_rectangle(
        [m + inner, m + inner, m + side - 1 - inner, m + side - 1 - inner],
        radius=int(radius - inner * 0.55), outline=hx(GOLD) + (110,), width=int(1.6 * SS),
    )

    # 四角回纹角饰
    if corner:
        corner_len = int(84 * SS)
        inset = int(46 * SS)
        gw = int(3.4 * SS)
        gc = hx(GOLD) + (200,)
        for sx, sy, dx, dy in ((1, 1, 1, 1), (-1, 1, -1, 1), (1, -1, 1, -1), (-1, -1, -1, -1)):
            ox = (m + inset) if sx > 0 else (m + side - 1 - inset)
            oy = (m + inset) if sy > 0 else (m + side - 1 - inset)
            ex, ey = ox + dx * corner_len, oy + dy * corner_len
            d.line([(ox, oy), (ex, oy)], fill=gc, width=gw)
            d.line([(ox, oy), (ox, ey)], fill=gc, width=gw)
            # 内侧短回勾
            k = int(26 * SS)
            d.line([(ex - dx * k, oy + dy * gw), (ex - dx * k, oy + dy * k)],
                   fill=gc, width=int(2.2 * SS))
            d.line([(ox + dx * gw, ey - dy * k), (ox + dx * k, ey - dy * k)],
                   fill=gc, width=int(2.2 * SS))

    return img


# ---------------------------------------------------------------- 钉板

def build_board(grid, L):
    """木质钉板 + 拼豆阵列"""
    n = len(grid)
    bs = BOARD_SIZE * SS
    cell = bs / n
    L = build_bead_layers(int(round(cell)))
    bs = int(round(cell)) * n                      # 对齐到整格

    x0 = (S - bs) // 2
    y0 = (S - bs) // 2 + BOARD_TOP_BIAS * SS

    board = Image.new("RGBA", (bs, bs), (0, 0, 0, 0))
    d = ImageDraw.Draw(board)

    # 木框外投影
    sh = Image.new("RGBA", (bs, bs), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [6 * SS, 12 * SS, bs - 6 * SS, bs - 4 * SS], radius=int(38 * SS), fill=(58, 38, 20, 190)
    )
    sh = sh.filter(ImageFilter.GaussianBlur(11 * SS))
    board.alpha_composite(sh)

    # 木框主体：左上亮 → 右下暗
    frame = Image.new("RGBA", (bs, bs), hx("#7A4A2E") + (255,))
    frame.alpha_composite(solid(bs, hx("#A06C40"), radial_alpha(
        bs, bs * 0.22, bs * 0.16, bs * 1.05, 0.85, power=1.6)))
    frame.alpha_composite(solid(bs, hx("#3E2415"), radial_alpha(
        bs, bs * 0.88, bs * 0.92, bs * 0.95, 0.70, power=2.0)))
    fmask = Image.new("L", (bs, bs), 0)
    ImageDraw.Draw(fmask).rounded_rectangle(
        [0, 0, bs - 1, bs - 1], radius=int(36 * SS), fill=255
    )
    board.paste(frame, (0, 0), fmask)

    # 木纹
    gr = Image.new("RGBA", (bs, bs), (40, 22, 10, 255))
    gr.putalpha(noise_layer(bs, 34, (SS * 0.8, SS * 6.0)).point(lambda v: int(v * 0.30)))
    board.alpha_composite(gr)

    d = ImageDraw.Draw(board)

    # 描金内线
    gi = int(13 * SS)
    d.rounded_rectangle(
        [gi, gi, bs - 1 - gi, bs - 1 - gi], radius=int(26 * SS),
        outline=hx(GOLD) + (255,), width=int(3.2 * SS),
    )

    # 钉板面
    pi = gi + int(9 * SS)
    plate_r = int(20 * SS)
    d.rounded_rectangle(
        [pi, pi, bs - 1 - pi, bs - 1 - pi], radius=plate_r,
        fill=hx("#241F1C") + (255,),
    )
    # 板面内阴影（上深下浅）
    plate_sh = solid(bs, (0, 0, 0), radial_alpha(bs, bs * 0.5, bs * 0.42, bs * 0.62, 0.55, power=2.2))
    pmask = Image.new("L", (bs, bs), 0)
    ImageDraw.Draw(pmask).rounded_rectangle(
        [pi, pi, bs - 1 - pi, bs - 1 - pi], radius=plate_r, fill=255
    )
    plate_sh.putalpha(Image.fromarray(
        np.minimum(np.array(plate_sh.getchannel("A")), np.array(pmask)), mode="L"))
    board.alpha_composite(plate_sh)

    # 钉孔网格（缝隙里透出的方孔）
    pd = ImageDraw.Draw(board)
    grid0 = pi + int(7 * SS)
    grid_span = bs - pi * 2 - int(14 * SS)
    gc_cell = grid_span / n
    hole_r = gc_cell * 0.17
    for r in range(n):
        for c in range(n):
            cx = grid0 + gc_cell * (c + 0.5)
            cy = grid0 + gc_cell * (r + 0.5)
            pd.rectangle(
                [cx - hole_r, cy - hole_r, cx + hole_r, cy + hole_r],
                fill=hx("#100D0B") + (255,),
            )
            pd.line(
                [(cx - hole_r, cy + hole_r + SS), (cx + hole_r, cy + hole_r + SS)],
                fill=hx("#4A423A") + (120,), width=max(1, int(SS * 0.8)),
            )

    # 珠子投影层
    shadow = Image.new("RGBA", (bs, bs), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    cs = L["cell"]
    for r in range(n):
        for c in range(n):
            ch = grid[r][c]
            if ch == "." or ch not in PALETTE:
                continue
            bx = grid0 + gc_cell * c + (gc_cell - cs) / 2
            by = grid0 + gc_cell * r + (gc_cell - cs) / 2
            off = cs * 0.10
            sd.rounded_rectangle(
                [bx + off * 0.4, by + off, bx + cs - off * 0.4 + off * 0.5, by + cs + off],
                radius=int(cs * 0.30), fill=(0, 0, 0, 165),
            )
    shadow = shadow.filter(ImageFilter.GaussianBlur(cs * 0.075))
    # 投影只落在板面内
    shadow.putalpha(Image.fromarray(
        np.minimum(np.array(shadow.getchannel("A")), np.array(pmask)), mode="L"))
    board.alpha_composite(shadow)

    # 珠子本体
    for r in range(n):
        for c in range(n):
            ch = grid[r][c]
            if ch == "." or ch not in PALETTE:
                continue
            bx = grid0 + gc_cell * c + (gc_cell - cs) / 2
            by = grid0 + gc_cell * r + (gc_cell - cs) / 2
            board.alpha_composite(make_bead(hx(PALETTE[ch]), L), (int(round(bx)), int(round(by))))

    # 板面高光（左上斜射光）
    gloss = solid(bs, (255, 255, 255), linear_alpha(bs, 45, 0.16, 0.0, 1.0))
    board.alpha_composite(gloss)

    return board, (x0, y0)


# ---------------------------------------------------------------- 朱砂印章

def build_seal():
    size = SEAL_SIZE * SS
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 印底
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.10),
                        fill=hx("#C8382F") + (255,))
    # 印泥深浅不均
    dark = Image.new("RGBA", (size, size), hx("#8E2018") + (255,))
    dark.putalpha(noise_layer(size, 40, size * 0.045).point(lambda v: int(v * 0.30)))
    img.alpha_composite(dark)

    # 边框 + 内框
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.10),
                        outline=hx("#8E2018") + (255,), width=int(size * 0.045))
    inner = int(size * 0.115)
    d.rectangle([inner, inner, size - 1 - inner, size - 1 - inner],
                outline=hx("#F3EDE0") + (235,), width=int(size * 0.055))

    # 「坊」字（华文楷体，阴刻效果 = 挖空留白）
    fs = int(size * 0.62)
    font = ImageFont.truetype(FONT_KAI, fs)
    txt = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt)
    bbox = td.textbbox((0, 0), SEAL_TEXT, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    td.text(
        ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]),
        SEAL_TEXT, font=font, fill=hx("#F7F1E4") + (255,),
    )
    # 轻微斑驳：让字口有缺墨感
    nib = Image.fromarray(
        np.clip(np.abs(np.random.normal(0, 1, (size, size))).astype(np.float32) * 80, 0, 255)
        .astype(np.uint8), mode="L"
    ).filter(ImageFilter.GaussianBlur(size * 0.012))
    nib = np.clip(255 - np.array(nib, dtype=np.float32) * 2.2, 70, 255).astype(np.uint8)
    alpha = np.minimum(np.array(txt.getchannel("A")), nib)
    txt.putalpha(Image.fromarray(alpha, mode="L"))
    img.alpha_composite(txt)

    # 投影
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [size * 0.06, size * 0.10, size * 0.96, size], radius=int(size * 0.10),
        fill=(90, 40, 30, 150),
    )
    sh = sh.filter(ImageFilter.GaussianBlur(size * 0.055))

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(sh)
    out.alpha_composite(img)
    return out


# ---------------------------------------------------------------- 组装

def render(pattern_id, with_paper=True):
    with open(os.path.join(HERE, "patterns.json"), encoding="utf-8") as f:
        data = json.load(f)
    pat = next((p for p in data if p["id"] == pattern_id), None)
    if pat is None:
        raise SystemExit(f"未找到图案：{pattern_id}")
    grid = center_grid(pat["grid"])

    n = len(grid)
    cs = int(round((BOARD_SIZE * SS) / n))
    bs = cs * n
    x0 = (S - bs) // 2
    y0 = (S - bs) // 2 + BOARD_TOP_BIAS * SS

    L = build_bead_layers(cs)
    board, _ = build_board(grid, L)

    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_paper:
        canvas.alpha_composite(build_paper())
    canvas.alpha_composite(board, (x0, y0))

    # 印章：右下角压住钉板约 1/3
    seal = build_seal()
    seal = seal.rotate(-4.5, resample=Image.BICUBIC, expand=True)
    overlap = int(SEAL_SIZE * SS * 0.32)
    sx = x0 + bs - seal.width + overlap
    sy = y0 + bs - seal.height + overlap
    canvas.alpha_composite(seal, (sx, sy))

    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def add_grain(img, strength=0.035):
    """1024 尺度上补一层极细颗粒，避免降采样后过于平滑"""
    a = np.array(img, dtype=np.float32)
    n = np.random.normal(0, strength * 255, a.shape[:2]).astype(np.float32)
    a[..., :3] = np.clip(a[..., :3] + n[..., None], 0, 255)
    return Image.fromarray(a.astype(np.uint8), mode="RGBA")


def main(targets=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = targets or ["plum", "coin"]
    made = []
    for pid in jobs:
        for wp in (True, False):
            img = render(pid, with_paper=wp)
            img = add_grain(img)
            tag = "底板" if wp else "透明"
            name = f"图标_{pid}_{tag}_{SIZE}.png"
            path = os.path.join(OUT_DIR, name)
            img.save(path, "PNG", optimize=True)
            made.append(path)
            print(f"[ok] {name}  {img.size[0]}x{img.size[1]}  "
                  f"{os.path.getsize(path) / 1024:.0f} KB")
    return made


if __name__ == "__main__":
    import sys
    main(sys.argv[1:] or None)
