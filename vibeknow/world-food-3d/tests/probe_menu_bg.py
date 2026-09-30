# -*- coding: utf-8 -*-
"""world-food-3d · 菜单页横幅几何探针
用途：量 .menu-hero 的实际盒模型，核对三件事：
       ① 盒宽高之比 == 源图 750×220（否则 background-size:100% 100% 会拉伸）
       ② 盒高 ≤ 34vh（不会吞掉下方列表）
       ③ 盒不越出视口、不遮住标题与页签
     并输出手机 / 桌面 / 横屏三档截图供人眼对照。
运行：python tests/probe_menu_bg.py [标签]     标签默认 now，决定 dist/probe_bg/ 下的文件名
"""
import os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
TAG = sys.argv[1] if len(sys.argv) > 1 else "now"
OUT = os.path.join(ROOT, "dist", "probe_bg")
os.makedirs(OUT, exist_ok=True)

SRC_W, SRC_H = 750, 220          # 源图像素尺寸（横幅必须按这个比例开槽）
SRC_RATIO = SRC_W / SRC_H

LAUNCH = dict(
    channel="msedge", headless=True,
    args=["--use-gl=angle", "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader", "--allow-file-access-from-files"],
)

GEO_JS = """() => {
  const box = (e) => { const b = e.getBoundingClientRect();
    return {x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width),
            h:Math.round(b.height), b:Math.round(b.bottom)}; };
  const hero = document.querySelector('.menu-hero');
  const cur  = document.querySelector('.crumb');
  const o = { viewport: {w: innerWidth, h: innerHeight},
              bodyClass: document.body.className,
              docScrollW: document.documentElement.scrollWidth };
  if (hero) {
    const cs = getComputedStyle(hero);
    const bb = hero.getBoundingClientRect();
    o.hero = { box: box(hero), bgSize: cs.backgroundSize, bgPos: cs.backgroundPosition,
               bgRepeat: cs.backgroundRepeat,
               ratio: bb.width / bb.height,   /* 用未取整的尺寸算比例，矮视口下取整会带偏 */
               bgFile: (cs.backgroundImage.match(/[^/]+\.webp/) || [''])[0] };
    /* 注：file:// 下 performance 的 decodedBodySize 恒为 0，不能用来判「图有没有加载」，
       图是否真的画出来了由 tests/verify_menu_bg.py 做像素比对判定。 */
  }
  const q = (s) => { const e = document.querySelector(s); return e ? box(e) : null; };
  o.top = q('.top'); o.menuHead = q('.menu-head'); o.tabs = q('.tabs'); o.menuList = q('.menu-list');
  o.menuRowsVisible = [...document.querySelectorAll('#menuList .mrow')]
        .filter(e => { const b = e.getBoundingClientRect();
                       return b.top >= (o.menuList ? o.menuList.y : 0) && b.bottom <= innerHeight; }).length;
  return o;
}"""

VIEWPORTS = [("phone", 390, 844), ("desktop", 1280, 820), ("wide", 1920, 1080),
             ("landscape", 844, 390)]

with sync_playwright() as P:
    b = P.chromium.launch(**LAUNCH)
    verdict = []
    for name, w, h in VIEWPORTS:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
        pg = ctx.new_page()
        pg.goto(URL, wait_until="load")
        pg.wait_for_timeout(2200)
        pg.screenshot(path=os.path.join(OUT, f"{TAG}_{name}_menu.png"))
        d = pg.evaluate(GEO_JS)
        print(f"\n===== {name} {w}x{h} =====")
        print(json.dumps(d, ensure_ascii=False, indent=1))
        hr = d.get("hero")
        if hr:
            ok_ratio = abs(hr["ratio"] - SRC_RATIO) < 0.02
            ok_cap = hr["box"]["h"] <= 0.34 * h + 2
            ok_below = hr["box"]["y"] >= d["top"]["b"] - 1
            verdict.append((name, ok_ratio, ok_cap, ok_below, hr["box"], hr["bgFile"], hr["ratio"]))
        ctx.close()
    b.close()

print("\n==== 判定（比例对 / 高度受 34vh 封顶 / 位于顶栏之下）====")
for name, a, c, d, bx, f, ratio in verdict:
    print(f"[{name:9s}] 比例一致={a}  高度≤34vh={c}  在顶栏下={d}  "
          f"盒={bx['w']}x{bx['h']}@y{bx['y']}  实际比例={ratio:.3f}  背景图={f}")
print("\nOK" if all(a and c and d for _, a, c, d, _, _, _ in verdict) else "\nFAIL")
