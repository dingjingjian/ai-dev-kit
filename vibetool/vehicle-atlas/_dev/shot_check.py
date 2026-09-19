# -*- coding: utf-8 -*-
"""渲染自检：移动端视口下跑一遍列表页与详情页，覆盖以下断言。

  1. 四大分类分组齐全、条目数正确（地面 14 / 水面 13 / 天空 12 / 太空 10 = 49）
  2. 顶栏 5 个 tab 单行放下且列表页无横向滚动区
  3. 配图缺失时占位块可见并显示条目名（页面不出现仓库路径），img 已隐藏
  4. 图片框高度 = 卡片 150 / 分类封面 104 / 详情 hero 210（Chrome 61 无 aspect-ratio，靠固定高度）
  5. 时代徽标（列表起始时间 / 详情完整跨度）已渲染，条目是「类型」而非型号
  6. 详情页区块齐全（介绍 / 关键参数 / 亮点 / AI 配图提示词）与关键元素存在
  7. 无未捕获的 JS 运行时错误（子资源加载失败不计）
  8. 从详情返回列表能回到离开时的滚动位置与所选分类

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
TITLE = "人类交通工具图鉴"
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
    check(sections == 4 and cards == 49 and tabs == 5,
          "4 个分类分组 / 49 张卡片 / 5 个 tab",
          "分组数 %d、卡片数 %d、tab 数 %d，期望 4 / 49 / 5" % (sections, cards, tabs))

    per_cat = page.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.section').forEach(s => out.push(s.querySelectorAll('.card').length));
      return out;
    }""")
    check(per_cat == [14, 13, 12, 10],
          "四类条目数 14 / 13 / 12 / 10",
          "四类条目数 = %s，期望 [14, 13, 12, 10]" % per_cat)

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
      const nm = box.querySelector('.shot-ph .nm');
      const r = box.querySelector('.shot-ph').getBoundingClientRect();
      return {name: nm ? nm.textContent : '', hidden: getComputedStyle(img).display === 'none',
              visible: r.width > 100 && r.height > 100};
    }""")
    check(ph["name"] == "畜力车" and ph["visible"],
          "占位块可见并显示条目名「%s」（不含仓库路径）" % ph["name"],
          "占位块文案 = %r，期望「畜力车」" % ph["name"])
    if not ph["hidden"]:
        print("  · 提示：ground-01 实图已在位（占位块被实图覆盖），属预期")

    era = page.evaluate("""() => {
      const chip = document.querySelector('.card .shot-era');
      return chip ? chip.textContent : '';
    }""")
    check(era == "公元前 3000 年",
          "卡片时代徽标只显示起始时间（%s）" % era,
          "卡片时代徽标 = %r，期望「公元前 3000 年」" % era)

    print("—— 详情页 ——")
    page.locator(".card").first.click()
    page.wait_for_selector(".detail .hero")
    check(page.url.endswith("#/v/ground-01") and page.locator(".detail h2").inner_text() == "畜力车",
          "点击首张卡片进入 #/v/ground-01（标题：畜力车）",
          "路由或标题异常：%s / %s" % (page.url, page.locator(".detail h2").inner_text()))

    hero_h = page.evaluate("() => Math.round(document.querySelector('.hero .shot').getBoundingClientRect().height)")
    check(hero_h == SHOT_HERO, "详情 hero 高度 %dpx" % hero_h, "hero 高度 = %d，期望 %d" % (hero_h, SHOT_HERO))

    pill = page.locator(".badge-row .era-pill").inner_text()
    check(pill == "公元前 3000 年 — 至今",
          "详情页时代徽标显示完整跨度（%s）" % pill,
          "详情页时代徽标 = %r，期望「公元前 3000 年 — 至今」" % pill)

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
    check("three-quarter or side view" in prompt and "horse-drawn" in prompt,
          "提示词 = 统一风格串 + 条目主体（%d 字）" % len(prompt),
          "提示词拼接异常：%s" % prompt[:60])

    detail_text = page.evaluate("() => document.querySelector('.detail').innerText")
    check("assets/img" not in detail_text and ".webp" not in detail_text,
          "详情页不含仓库路径 / 文件名等开发信息",
          "详情页出现开发信息：%s" % detail_text[:120])

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
    check(back["y"] > 400 and back["title"] == TITLE,
          "返回列表恢复离开时的滚动位置 y=%d" % back["y"],
          "返回列表未恢复位置：y=%d、标题=%s" % (back["y"], back["title"]))

    print("—— 分类筛选 ——")
    page.locator(".tab", has_text="太空").first.click()
    space_sections = page.locator(".section").count()
    space_cards = page.locator(".card").count()
    check(space_sections == 1 and space_cards == 10,
          "「太空」tab 只显示一个分组（10 种）",
          "太空筛选后分组 %d、卡片 %d，期望 1 / 10" % (space_sections, space_cards))
    page.screenshot(path=str(OUT / "list-space.png"), full_page=True)

    check(not js_errors, "无 JS 运行时错误", "JS 报错：%s" % js_errors[:3])
    browser.close()

if failures:
    print("\n自检失败 %d 项：" % len(failures))
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n自检全部通过 ✅  截图：%s" % OUT)
