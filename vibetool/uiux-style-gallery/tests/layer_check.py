# -*- coding: utf-8 -*-
"""合成层自检：页面里不得出现「超大不可滚动合成层」。

背景（真机踩过的坑）：列表页第 67 张卡（RGB 分离故障）的 mix-blend-mode 会把混合底衬
回溯到根，Chrome 因此生成一个覆盖整页、不可滚动的合成层。这类层要整块光栅化，一旦
超过低端 Android 的 GPU 纹理上限（约 4096 设备像素，DPR3 ≈ 1365 CSS px），超出的部分
就完全不绘制 —— 真机表现是「首页往下滑，滑到活力色块之后整片空白」。
修复方式：在 .demo 上建立混合隔离组（isolation:isolate），把底衬限制在 140px 的预览卡内。

可滚动层用瓦片光栅化，不受纹理上限约束，故只断言非滚动层的尺寸。
判定阈值取 1000 CSS px（视口 640px 的两倍以内、且明显低于 1365px 的下限）。
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
MAX_FIXED_LAYER = 1000          # CSS px

PAGES = [("列表页「全部」", "#/"), ("详情页 RGB 分离故障", "#/s/67"), ("详情页 毛玻璃", "#/s/3")]

failures = []


def fixed_layers(page, label):
    client = page.context.new_cdp_session(page)
    client.send("LayerTree.enable")
    layers = {}

    def on_change(ev):
        for l in ev.get("layers", []):
            layers[l["layerId"]] = l

    client.on("LayerTree.layerTreeDidChange", on_change)
    page.wait_for_timeout(300)
    page.mouse.wheel(0, 300)        # 触发一次合成
    page.wait_for_timeout(500)
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(500)
    fixed = sorted((l.get("height", 0) for l in layers.values() if not l.get("scrollRects")), reverse=True)
    client.detach()
    return len(layers), fixed


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 360, "height": 640}, device_scale_factor=3)
    for label, hash_ in PAGES:
        page.goto((ROOT / "index.html").as_uri() + hash_)
        page.wait_for_selector(".card" if hash_ == "#/" else ".detail .hero")
        page.wait_for_timeout(600)
        total, fixed = fixed_layers(page, label)
        worst = fixed[0] if fixed else 0
        ok = worst <= MAX_FIXED_LAYER
        print(f"{label:<20} 合成层总数={total:>3}  最大不可滚动层={worst}px"
              f"（DPR3 设备像素 {worst * 3}）{'✓' if ok else '✗'}")
        if not ok:
            failures.append(f"{label}：存在 {worst}px 的不可滚动合成层（上限 {MAX_FIXED_LAYER}）")
    page.close()
    browser.close()

if failures:
    print("\n合成层自检失败：")
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n合成层自检通过 ✅（无超大不可滚动层）")
