# -*- coding: utf-8 -*-
"""world-food-3d · 菜单页横幅「是否整幅完整显示」的像素级验证
做法：把渲染出来的 .menu-hero 区域裁下来，与源图 top-banner.webp 缩到同尺寸后逐像素比。
     同时构造一个「反例对照」——按旧样式（cover + center 25%）应该出现的那块裁剪画面，
     若新样式的差异远小于反例，说明横幅确实整幅可见，而不是「看着像」。
运行：python tests/verify_menu_bg.py
"""
import os, io
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
SRC = os.path.join(ROOT, "assets", "tex", "top-banner.webp")
OUT = os.path.join(ROOT, "dist", "probe_bg")
os.makedirs(OUT, exist_ok=True)
INSET = 4          # 躲开铜线描边与边缘反走样

LAUNCH = dict(channel="msedge", headless=True,
              args=["--use-gl=angle", "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader", "--allow-file-access-from-files"])

VIEWPORTS = [("phone", 390, 844), ("desktop", 1280, 820)]

src = Image.open(SRC).convert("RGB")
print(f"源图 {src.size[0]}×{src.size[1]}  比例 {src.size[0]/src.size[1]:.3f}")


def mad(a, b):
    return float(np.abs(np.asarray(a, np.int16) - np.asarray(b, np.int16)).mean())


def cover_ref(band_size, page_y, viewport, kx=0.5, ky=0.25):
    """旧样式（整页 cover + center 25%）下，横幅所在那一段实际看到的画面。
    反例必须按「旧元素 = 整页」来反推：先整页 cover，再把页面那一条带子映射回源图坐标。"""
    bw, bh = band_size
    vw, vh = viewport
    k = max(vw / src.size[0], vh / src.size[1])
    sw, sh = src.size[0] * k, src.size[1] * k
    x0, y0 = (vw - sw) * kx, (vh - sh) * ky
    sx0, sy0 = (0 - x0) / k, (page_y - y0) / k
    sx1, sy1 = (vw - x0) / k, (page_y + bh - y0) / k
    box = (max(0, sx0), max(0, sy0), min(src.size[0], sx1), min(src.size[1], sy1))
    if box[2] - box[0] < 2 or box[3] - box[1] < 2:
        return None
    return src.crop(box).resize((bw, bh), Image.LANCZOS)


with sync_playwright() as P:
    b = P.chromium.launch(**LAUNCH)
    for name, w, h in VIEWPORTS:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.goto(URL, wait_until="load")
        pg.wait_for_timeout(2400)
        box = pg.evaluate("""() => { const r = document.querySelector('.menu-hero').getBoundingClientRect();
            return {x:r.x, y:r.y, width:r.width, height:r.height}; }""")
        clip = {"x": box["x"], "y": box["y"], "width": box["width"], "height": box["height"]}
        png = pg.screenshot(clip=clip)
        shot = Image.open(io.BytesIO(png)).convert("RGB")
        ctx.close()
        shot.save(os.path.join(OUT, f"crop_{name}_hero.png"))

        bw, bh = shot.size
        ins = (INSET, INSET, bw - INSET, bh - INSET)
        a = shot.crop(ins)
        b_whole = src.resize((bw, bh), Image.LANCZOS).crop(ins)
        ref = cover_ref((bw, bh), box["y"], (w, h))
        m_whole = mad(a, b_whole)
        m_cover = mad(a, ref.crop(ins)) if ref else float("nan")

        print(f"\n[{name}] 横幅渲染尺寸 {bw}×{bh}（比例 {bw/bh:.3f}）")
        print(f"  与「整幅源图」的像素差 MAD = {m_whole:6.2f}")
        print(f"  与「旧样式那一段画面」的像素差 MAD = {m_cover:6.2f}  ← 反例对照")
        print(f"  判定：{'整幅完整显示' if m_whole < 8 and m_cover > m_whole * 3 else '仍有裁切或拉伸，需复查'}")
        ref.save(os.path.join(OUT, f"ref_{name}_oldstyle.png"))
    b.close()
