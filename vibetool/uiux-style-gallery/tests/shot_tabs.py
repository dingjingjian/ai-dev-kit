# -*- coding: utf-8 -*-
"""验证 tabs 布局：任何宽度下都不横向滚动、5 个分类全部落在视口内、且保持单行。

两条回归点（都是真机踩过的）：
  1. 曾经的实现是「横向滚动 + 两侧渐隐」，低端 Android 上吸顶栏会渲染残缺；
     故断言 scrollWidth == clientWidth（没有横滑区）。
  2. Android 8 的中文字体比新机略宽 + 宽度取整，360px 下 3 字标签会把整行顶到第二行；
     故断言各宽度下 tabs 只有一行，并额外用 letter-spacing:1px 模拟「字体更宽」再测一遍
     （约 +10px，足以覆盖机型字体差异；留不下的余量就是会在真机上换行的余量）。
"""
import sys
from playwright.sync_api import sync_playwright
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)

PROBE = """() => {
  const t = document.getElementById('tabs');
  const vw = window.innerWidth;
  const tabs = [...t.querySelectorAll('.tab')].map(b => {
    const r = b.getBoundingClientRect();
    return {txt: b.textContent, top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right)};
  });
  const rowTops = [...new Set(tabs.map(x => x.top))];
  return {
    scrollW: t.scrollWidth, clientW: t.clientWidth,
    rows: rowTops.length,
    used: tabs.length ? tabs[tabs.length - 1].right - tabs[0].left : 0,
    avail: Math.round(t.getBoundingClientRect().width) - 24,
    tabs: tabs, vw: vw
  };
}"""

failures = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for w in [320, 360, 390, 640]:
        page = browser.new_page(viewport={"width": w, "height": 800}, device_scale_factor=2)
        page.goto((ROOT / "index.html").as_uri())
        page.wait_for_selector(".card")
        s = page.evaluate(PROBE)
        page.screenshot(path=str(OUT / f"tabs_{w}.png"))
        out = [t for t in s["tabs"] if t["right"] > s["vw"] + 1 or t["left"] < -1]
        ok = s["scrollW"] <= s["clientW"] + 1 and s["rows"] == 1 and not out
        print(f"w={w}  行数={s['rows']} 占用={s['used']}/{s['avail']}px 余量={s['avail'] - s['used']}px "
              f"scrollW={s['scrollW']} clientW={s['clientW']} 越界={out or '无'} {'✓' if ok else '✗'}")
        print(f"      标签：{[t['txt'] for t in s['tabs']]}")
        if not ok:
            failures.append(f"w={w}: 行数 {s['rows']} / 越界 {out} / {s['scrollW']}>{s['clientW']}")

        # 模拟「字体更宽」的机型（Android 8 中文字体偏宽 + 逐元素宽度取整）
        if w == 360:
            page.add_style_tag(content=".tab{letter-spacing:1px;}")
            page.wait_for_timeout(80)
            s2 = page.evaluate(PROBE)
            print(f"      字体加宽 +1px/字（模拟 Android 8 中文字体）：行数={s2['rows']} "
                  f"占用={s2['used']}/{s2['avail']}px 余量={s2['avail'] - s2['used']}px "
                  f"{'✓' if s2['rows'] == 1 else '✗'}")
            if s2["rows"] != 1:
                failures.append("w=360 字体加宽后换行（真机上会复现换行）")
        page.close()
    browser.close()

if failures:
    print("\n失败：")
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\ntabs 自检通过 ✅  截图：", OUT)
