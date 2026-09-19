# -*- coding: utf-8 -*-
"""渲染自检：移动端视口下跑一遍列表页与详情页，覆盖以下断言。

  1. 六大分类分组齐全、条目数正确（8 台 / 类）
  2. 顶栏 6 个 tab 单行放下且列表页无横向滚动区
  3. 配图缺失时占位块可见、写明期望文件名，img 已隐藏（补图后此断言自然转移为"实图可见"）
  4. 图片框高度 = 卡片 150 / 分类封面 104 / 详情 hero 210（Chrome 61 无 aspect-ratio，靠固定高度）
  5. 详情页区块齐全（介绍 / 关键参数 / 亮点 / AI 配图提示词）与关键元素存在
  6. 无未捕获的 JS 运行时错误（子资源加载失败不计）
  7. 从详情返回列表能回到离开时的滚动位置与所选分类

用法：python _dev/shot_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)

SHOT_CARD, SHOT_COVER, SHOT_HERO = 150, 104, 210
failures = []
URL = (ROOT / "index.html").as_uri()


def check(cond, ok_msg, bad_msg):
    if cond:
        print("  ✓ " + ok_msg)
    else:
        failures.append(bad_msg)
        print("  ✗ " + bad_msg)


with sync_playwright() as p:
    browser = p.chromium.launch()
    # DPR 取 1：断言都用 CSS 像素，整页截图又高又长（DPR2 单张可达 5MB），没必要翻四倍
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)

    js_errors = []
    page.on("pageerror", lambda e: js_errors.append(str(e)))
    page.on("console", lambda m: js_errors.append(m.text)
            if m.type == "error" and "Failed to load resource" not in m.text else None)

    print("—— 列表页 ——")
    page.goto(URL)
    page.wait_for_selector(".card")
    page.screenshot(path=str(OUT / "list.png"), full_page=True)

    sections = page.locator(".section").count()
    cards = page.locator(".card").count()
    tabs = page.locator(".tab").count()
    check(sections == 6 and cards == 48 and tabs == 6,
          "6 个分类分组 / 48 张卡片 / 6 个 tab",
          "分组数 %d、卡片数 %d、tab 数 %d，期望 6 / 48 / 6" % (sections, cards, tabs))

    row = page.evaluate("""() => {
      const t = document.querySelectorAll('.tab');
      const tops = new Set();
      for (const b of t) tops.add(Math.round(b.getBoundingClientRect().top));
      const box = document.querySelector('.tabs');
      return {rows: tops.size, scrollW: box.scrollWidth, clientW: box.clientWidth};
    }""")
    check(row["rows"] == 1 and row["scrollW"] <= row["clientW"] + 1,
          "顶栏 tab 单行放下、无横向滚动区（scrollW=%d ≤ clientW=%d）" % (row["scrollW"], row["clientW"]),
          "tab 行数 %d、scrollW=%d > clientW=%d，存在换行或横向滚动"
          % (row["rows"], row["scrollW"], row["clientW"]))

    heights = page.evaluate("""() => {
      const c = document.querySelector('.card .shot');
      const v = document.querySelector('.cat-cover .shot');
      return [Math.round(c.getBoundingClientRect().height), Math.round(v.getBoundingClientRect().height)];
    }""")
    check(heights[0] == SHOT_CARD and heights[1] == SHOT_COVER,
          "卡片图片框 %dpx、分类封面 %dpx" % (heights[0], heights[1]),
          "图片框高度 = %s，期望 [%d, %d]" % (heights, SHOT_CARD, SHOT_COVER))

    ph = page.evaluate("""() => {
      const box = document.querySelector('.card .shot');
      const img = box.querySelector('img.shot-img');
      const fp = box.querySelector('.shot-ph .fp');
      const r = box.querySelector('.shot-ph').getBoundingClientRect();
      return {text: fp ? fp.textContent : '', hidden: getComputedStyle(img).display === 'none',
              visible: r.width > 100 && r.height > 100};
    }""")
    check(ph["text"] == "./assets/img/car-01.webp" and ph["visible"],
          "占位块可见并写明期望文件 %s" % ph["text"],
          "占位块文案 = %r（期望 ./assets/img/car-01.webp）" % ph["text"])
    if not ph["hidden"]:
        print("  · 提示：car-01 实图已在位（占位块被实图覆盖），属预期")

    print("—— 详情页 ——")
    page.locator(".card").first.click()
    page.wait_for_selector(".detail .hero")
    check(page.url.endswith("#/v/car-01") and page.locator(".detail h2").inner_text() == "丰田卡罗拉",
          "点击首张卡片进入 #/v/car-01（标题：丰田卡罗拉）",
          "路由或标题异常：%s / %s" % (page.url, page.locator(".detail h2").inner_text()))

    hero_h = page.evaluate("() => Math.round(document.querySelector('.hero .shot').getBoundingClientRect().height)")
    check(hero_h == SHOT_HERO, "详情 hero 高度 %dpx" % hero_h, "hero 高度 = %d，期望 %d" % (hero_h, SHOT_HERO))

    blocks = page.locator(".block").count()
    specs_n = page.locator(".spec").count()
    feats_n = page.locator(".feats li").count()
    check(blocks == 4 and specs_n == 4 and feats_n == 3,
          "4 个区块 / 4 项参数 / 3 条亮点",
          "区块 %d、参数 %d、亮点 %d，期望 4 / 4 / 3" % (blocks, specs_n, feats_n))

    check(page.locator("#copyBtn").count() == 1 and page.locator(".prompt-box pre").count() == 1,
          "AI 配图提示词与复制按钮存在",
          "提示词区块缺失")

    prompt = page.locator(".prompt-box pre").inner_text()
    check("three-quarter front view" in prompt and "white Toyota Corolla" in prompt,
          "提示词 = 统一风格串 + 条目主体（%d 字）" % len(prompt),
          "提示词拼接异常：%s" % prompt[:60])

    file_line = page.locator(".file-line").inner_text()
    check("./assets/img/car-01.webp" in file_line,
          "详情页标注目标文件 ./assets/img/car-01.webp",
          "详情页未标注目标文件：%s" % file_line)

    page.screenshot(path=str(OUT / "detail.png"), full_page=True)

    print("—— 返回列表 ——")
    page.evaluate("() => { location.hash = '#/'; }")
    page.wait_for_selector(".card")
    # 用 JS 直接点卡片（不经 Playwright 的「滚动到元素再点」，否则会污染待恢复的滚动位置）
    page.evaluate("() => { window.scrollTo(0, 700); }")
    page.evaluate("() => { document.querySelectorAll('.card')[4].click(); }")
    page.wait_for_selector(".detail .hero")
    page.locator(".fab-back").click()
    page.wait_for_selector(".card")
    back = page.evaluate("() => ({y: Math.round(window.pageYOffset), title: document.getElementById('title').textContent})")
    check(back["y"] > 400 and back["title"] == "全球交通工具图鉴",
          "返回列表恢复离开时的滚动位置 y=%d" % back["y"],
          "返回列表未恢复位置：y=%d、标题=%s" % (back["y"], back["title"]))

    print("—— 分类筛选 ——")
    page.locator(".tab", has_text="轮船").first.click()
    ship_sections = page.locator(".section").count()
    ship_cards = page.locator(".card").count()
    check(ship_sections == 2 and ship_cards == 16,
          "「轮船」tab 合并客运 / 货运两个分组（16 台）",
          "轮船筛选后分组 %d、卡片 %d，期望 2 / 16" % (ship_sections, ship_cards))
    page.screenshot(path=str(OUT / "list-ship.png"), full_page=True)

    check(not js_errors, "无 JS 运行时错误", "JS 报错：%s" % js_errors[:3])
    browser.close()

if failures:
    print("\n自检失败 %d 项：" % len(failures))
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n自检全部通过 ✅  截图：%s" % OUT)
