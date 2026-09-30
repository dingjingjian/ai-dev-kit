# -*- coding: utf-8 -*-
"""小红书配图换车型：只换画面里的车，排版与文案一个像素都不动。

背景：旧的三张宣传图是整幅 AI 生图，车型画错了（复兴号被画成两端尖头等）。
本脚本不再另排版，而是以 git 里的旧海报为底图，检测出插画区域、抹掉旧车，
再把 assets/img/ 里修正过的条目图贴进去——其余像素原样保留。

用法：
    python tools/patch_xhs_trains.py            # 只检测并打印区域，不动文件
    python tools/patch_xhs_trains.py --apply    # 写出到 xiaohongshu/

底图：.work/xhs_prev/（git HEAD 版本的三张图；再改版前请先在这里留一份）
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PREV = ROOT / ".work" / "xhs_prev"
IMG = ROOT / "assets" / "img"
OUT = ROOT / "xiaohongshu"

# 底图 → 要换的区域（旧车所在的外接框，由下面的检测跑出来）+ 换成哪张素材。
# 01 的三块自上而下是 龙号 / 东风4 / 复兴号，03 的那一块是前进型。
PLAN = {
    "01-cover.jpg": [
        ((376, 872, 828, 1102), "loco-01.webp"),
        ((372, 1184, 1100, 1410), "loco-07.webp"),
        ((376, 1552, 1460, 1720), "loco-19.webp"),
    ],
    # 03 的卡片白底是 x 112..1424 / y 380..1117，文字从 y=1117 才开始，
    # 所以插画可以放大到接近卡片宽度：1150×409 居中（旧车那块是 1100×298）
    "03-card-detail.jpg": [
        ((193, 544, 1343, 953), "loco-03.webp", 1.0),
    ],
}

RANGE_K = 7        # 局部对比度窗口（越大越只留大块内容）
RANGE_T = 45       # 局部明暗差阈值：版面平涂处 ≈0，插画与文字处很大
DILATE = 9         # 膨胀：把同一台车的分块连成一片
DETECT_SCALE = 2   # 检测用降采样倍数
MIN_BOX = 0.006    # 区域外接框至少占整幅的比例（滤掉文字行 / 小图标）
MIN_FILL = 0.0015  # 区域内“有内容”的像素占比下限
MIN_H, MIN_W = 0.035, 0.07


def busy_mask(im):
    """局部明暗差大的地方 = 有内容（插画 + 文字），平涂底色被滤掉"""
    g = im.convert("L")
    hi = g.filter(ImageFilter.MaxFilter(RANGE_K))
    lo = g.filter(ImageFilter.MinFilter(RANGE_K))
    m = ImageChops.subtract(hi, lo).point(lambda v: 255 if v > RANGE_T else 0)
    return m.filter(ImageFilter.MaxFilter(DILATE))


def components(mask):
    """连通域 BFS，返回 [(像素数, x0, y0, x1, y1)]"""
    w, h, mp = mask.width, mask.height, mask.load()
    seen = bytearray(w * h)
    out = []
    for sy in range(h):
        for sx in range(w):
            if mp[sx, sy] and not seen[sy * w + sx]:
                seen[sy * w + sx] = 1
                q = deque([(sx, sy)])
                x0 = x1 = sx
                y0 = y1 = sy
                n = 0
                while q:
                    x, y = q.popleft()
                    n += 1
                    x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < w and 0 <= ny < h and mp[nx, ny] \
                                and not seen[ny * w + nx]:
                            seen[ny * w + nx] = 1
                            q.append((nx, ny))
                out.append((n, x0, y0, x1 + 1, y1 + 1))
    return out


def pick_regions(im):
    """挑插画区域：够大、够高、不贴画布边（贴边的是色块与页脚带）"""
    m = busy_mask(im).resize((im.width // DETECT_SCALE, im.height // DETECT_SCALE),
                             Image.NEAREST)
    total = m.width * m.height
    regs = []
    for n, x0, y0, x1, y1 in components(m):
        bw, bh = (x1 - x0) / total ** 0 + (x1 - x0), (y1 - y0)
        if n < total * MIN_FILL or bw < m.width * MIN_W or bh < m.height * MIN_H:
            continue
        if (x1 - x0) * (y1 - y0) < total * MIN_BOX:
            continue
        if x0 <= 2 or y0 <= 2 or x1 >= m.width - 3 or y1 >= m.height - 3:
            continue
        s = DETECT_SCALE
        regs.append((n, x0 * s, y0 * s, x1 * s, y1 * s))
    regs.sort(key=lambda r: (round(r[2] / 80), r[1]))   # 先上后下，同一行从左到右
    return regs


def median_color(im, box):
    """取区域外一圈的颜色中位数，用来把旧车抹平"""
    x0, y0, x1, y1 = box
    pad = 8
    px = im.load()
    pts = []
    for x in range(max(0, x0 - pad), min(im.width, x1 + pad)):
        for y in (max(0, y0 - pad), min(im.height - 1, y1 + pad - 1)):
            pts.append(px[x, y])
    for y in range(y0, min(im.height, y1)):
        for x in (max(0, x0 - pad), min(im.width - 1, x1 + pad - 1)):
            pts.append(px[x, y])
    if not pts:
        return (250, 243, 227)
    return tuple(sorted(p[i] for p in pts)[len(pts) // 2] for i in range(3))


def knock_bg(img, tol=8, soft=18):
    """条目图是浅暖白底的插画，把底色抠成透明，只留车本身"""
    corners = [(2, 2), (img.width - 3, 2), (2, img.height - 3),
               (img.width - 3, img.height - 3)]
    pts = [img.getpixel(p) for p in corners]
    bg = tuple(sorted(p[i] for p in pts)[len(pts) // 2] for i in range(3))
    a = Image.new("L", img.size, 0)
    ap, px = a.load(), img.load()
    for y in range(img.height):
        for x in range(img.width):
            c = px[x, y]
            d = max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2]))
            ap[x, y] = 0 if d <= tol else min(255, int(255 * (d - tol) / soft))
    img.putalpha(a)
    return img


def contain(img, w, h):
    s = min(w / img.width, h / img.height)
    return img.resize((max(1, int(round(img.width * s))),
                       max(1, int(round(img.height * s)))), Image.LANCZOS)


def patch(name, plan, apply=False):
    im = Image.open(PREV / name).convert("RGB")
    print("\n== %s ==" % name)
    if "--detect" in sys.argv:
        for i, (n, x0, y0, x1, y1) in enumerate(pick_regions(im)):
            print("  检出 #%d  %4d,%4d → %4d,%4d  %4d×%-4d"
                  % (i, x0, y0, x1, y1, x1 - x0, y1 - y0))
        if not apply:
            return
    d = ImageDraw.Draw(im)
    for item in plan:
        (x0, y0, x1, y1), src = item[0], item[1]
        fill = item[2] if len(item) > 2 else 0.96   # 贴进框里的比例，1.0 = 铺满框
        d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1],
                    fill=median_color(im, (x0, y0, x1, y1)))
        art = knock_bg(Image.open(IMG / src).convert("RGB"))
        # 裁掉条目图自带的留白，车才够大；只认不透明的部分，别把淡影和底色渐变算进来
        solid = art.getchannel("A").point(lambda v: 255 if v > 140 else 0)
        bb = solid.getbbox()
        if bb:
            art = art.crop(bb)
        art = contain(art, int((x1 - x0) * fill), int((y1 - y0) * fill))
        px = x0 + (x1 - x0 - art.width) // 2
        py = y0 + (y1 - y0 - art.height) // 2
        im.paste(art, (px, py), art)
        print("  ✓ %s → %d,%d (%d×%d)" % (src, px, py, art.width, art.height))
    if not apply:
        print("  （未改文件，加 --apply 才写出）")
        return
    im.save(OUT / name, "JPEG", quality=94, subsampling=0)
    print("  → 写出 %s" % (OUT / name))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    apply = "--apply" in sys.argv
    for name, plan in PLAN.items():
        patch(name, plan, apply)
    if not apply:
        print("\n（只检测未改文件；确认上面的框无误后加 --apply）")
