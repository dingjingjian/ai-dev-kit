# -*- coding: utf-8 -*-
"""截图自检：验证悬浮按钮（列表页滚动后 fabTop、详情页 fabBack）。"""
from playwright.sync_api import sync_playwright
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.goto((ROOT / "index.html").as_uri())
    page.wait_for_selector(".card")

    # 列表页：滚动 600px，fabTop 应显示
    page.evaluate("window.scrollTo(0, 600)")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "list_scrolled.png"))
    print("list_scrolled  fabTop.show =", page.locator("#fabTop").evaluate("el => el.classList.contains('show')"))

    # 详情页：fabBack 应显示
    page.goto((ROOT / "index.html").as_uri() + "#/s/41")
    page.wait_for_selector(".detail .hero")
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / "detail_fab.png"))
    print("detail_fab  fabBack.show =", page.locator("#fabBack").evaluate("el => el.classList.contains('show')"))

    # 详情页滚动后两个都显示
    page.evaluate("window.scrollTo(0, 500)")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "detail_scrolled.png"))
    print("detail_scrolled  fabTop.show =", page.locator("#fabTop").evaluate("el => el.classList.contains('show')"),
          " fabBack.show =", page.locator("#fabBack").evaluate("el => el.classList.contains('show')"))

    browser.close()
print("截图完成：", OUT)
