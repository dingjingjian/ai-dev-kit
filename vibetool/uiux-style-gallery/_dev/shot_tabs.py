# -*- coding: utf-8 -*-
"""验证 tabs 渐隐指示：窄屏下右侧渐隐、滑动后左侧渐隐。"""
from playwright.sync_api import sync_playwright
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)

def cls_state(page, el_id):
    return page.locator("#" + el_id).evaluate("el => ({l: el.classList.contains('show-left'), r: el.classList.contains('show-right'), sw: el.scrollWidth, cw: el.clientWidth})")

with sync_playwright() as p:
    browser = p.chromium.launch()
    for w in [360, 390, 640]:
        page = browser.new_page(viewport={"width": w, "height": 800}, device_scale_factor=2)
        page.goto((ROOT / "index.html").as_uri())
        page.wait_for_selector(".card")
        s0 = cls_state(page, "tabs")
        page.screenshot(path=str(OUT / f"tabs_{w}_init.png"))
        # 滑动 tabs 到最右
        page.locator("#tabs").evaluate("el => el.scrollTo({left: el.scrollWidth, behavior:'instant'})")
        page.wait_for_timeout(200)
        s1 = cls_state(page, "tabs")
        page.screenshot(path=str(OUT / f"tabs_{w}_scrolled.png"))
        print(f"w={w}  init={s0}  scrolled={s1}")
        page.close()
    browser.close()
