# -*- coding: utf-8 -*-
"""截图自检：模拟移动端视口，截图列表页 + 4 类各一个详情页。

附带两条断言（防止曾经的「demo 不撑满预览区」缺陷回归）：
  1. 每个迷你 demo 根节点的高度必须等于其 .demo 预览区高度；
  2. 卡片与详情页 hero 的预览区高度必须分别等于 140 / 200。
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)

CARD_H, HERO_H = 140, 200

FILL_PROBE = """() => {
  const bad = [];
  document.querySelectorAll('.demo').forEach(d => {
    const kid = d.querySelector('.demo-body > *');
    if (!kid) { bad.push([d.parentElement.className, '(empty)']); return; }
    const dk = Math.round(d.getBoundingClientRect().height);
    const kk = Math.round(kid.getBoundingClientRect().height);
    if (Math.abs(dk - kk) > 1) bad.push([kid.className, dk, kk]);
  });
  return bad;
}"""

failures = []

TITLE_OFFSET = """() => {
  const t = document.querySelector('.topbar h1');
  const r = document.createRange(); r.selectNodeContents(t);
  const b = r.getBoundingClientRect();
  return +(((b.left + b.right) / 2 - window.innerWidth / 2).toFixed(1));
}"""
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.goto((ROOT / "index.html").as_uri())

    page.wait_for_selector(".card")
    page.screenshot(path=str(OUT / "list.png"), full_page=True)
    print("list.png  卡片数 =", page.locator(".card").count())

    bad = page.evaluate(FILL_PROBE)
    if bad:
        failures.append(f"列表页 demo 未撑满：{bad}")
    print(f"列表页 demo 撑满检查（{page.locator('.demo').count()} 个）:", "通过" if not bad else f"失败 {bad}")

    off = page.evaluate(TITLE_OFFSET)
    if abs(off) > 1:
        failures.append(f"列表页顶栏标题偏离中线 {off}px")
    print(f"列表页标题居中检查：偏移 {off}px", "通过" if abs(off) <= 1 else "失败")

    for sid, label in [("1", "minimal"), ("38", "neubrutal"), ("41", "cyberpunk"), ("43", "ainative")]:
        page.goto((ROOT / "index.html").as_uri() + "#/s/" + sid)
        page.wait_for_selector(".detail .hero")
        page.screenshot(path=str(OUT / f"detail_{label}.png"), full_page=True)
        hero_h = page.evaluate("() => Math.round(document.querySelector('.hero .demo').getBoundingClientRect().height)")
        if hero_h != HERO_H:
            failures.append(f"详情页 {label} hero 高度 ={hero_h}，期望 {HERO_H}")
        off = page.evaluate(TITLE_OFFSET)
        if abs(off) > 1:
            failures.append(f"详情页 {label} 顶栏标题偏离中线 {off}px")
        print(f"detail_{label}.png  标题 =", page.locator(".detail h2").inner_text())

    card_h = page.evaluate(
        "() => { location.hash = '#/'; return new Promise(r => setTimeout(() => {"
        " r(Math.round(document.querySelector('.demo').getBoundingClientRect().height)); }, 60)); }")
    if card_h != CARD_H:
        failures.append(f"卡片预览区高度 ={card_h}，期望 {CARD_H}")

    # 测试复制按钮存在
    page.goto((ROOT / "index.html").as_uri() + "#/s/3")
    page.wait_for_selector("#copyBtn")
    print("copyBtn 存在 ✓")

    browser.close()

if failures:
    print("\n自检失败：")
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n自检全部通过 ✅  截图完成：", OUT)
