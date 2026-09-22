# -*- coding: utf-8 -*-
"""渲染自检：移动端视口跑一遍列表页与详情页，覆盖以下断言。

  1. 四分类分组齐全、条目数正确（机车 20 / 客车 10 / 货车 10 / 车站 10 = 50）
  2. 顶栏 5 个 tab 单行放下，且 tab 行没有横向滚动区
  3. 配图缺失时占位块可见并显示条目名（不含仓库路径）
  4. 图片框高度 = 卡片 150 / 分类封面 104 / 详情 hero 210（Chrome 61 无 aspect-ratio，靠固定高度）
  5. 年代徽标：列表只显示起始年份，详情显示完整跨度；卡片 meta 行显示「类型 · 英文名」
  6. 详情页区块齐全（介绍 / 关键参数 / 亮点 / AI 配图提示词），参数与亮点数量正确
  7. 提示词 = 该类风格串 + 条目的主体描述；车站类用建筑立面串（front elevation）
  8. 详情页不含开发信息（assets/img、.webp 等）
  9. 从详情返回列表能回到离开时的滚动位置
 10. 分类筛选：点某个 tab 后只剩一个分组

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
TITLE = "中国铁路图鉴"
EXPECT_PER_CAT = [20, 10, 10, 10]
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
    check(sections == 4 and cards == 50 and tabs == 5,
          "4 个分类分组 / 50 张卡片 / 5 个 tab",
          "分组数 %d、卡片数 %d、tab 数 %d，期望 4 / 50 / 5" % (sections, cards, tabs))

    per_cat = page.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.section').forEach(s => out.push(s.querySelectorAll('.card').length));
      return out;
    }""")
    check(per_cat == EXPECT_PER_CAT,
          "四类条目数 %s" % " / ".join(str(x) for x in per_cat),
          "四类条目数 = %s，期望 %s" % (per_cat, EXPECT_PER_CAT))

    row = page.evaluate("""() => {
      const t = document.querySelectorAll('.tab');
      const tops = new Set();
      for (const b of t) tops.add(Math.round(b.getBoundingClientRect().top));
      const box = document.querySelector('.tabs');
      return {rows: tops.size, scrollW: box.scrollWidth, clientW: box.clientWidth};
    }""")
    check(row["rows"] == 1 and row["scrollW"] <= row["clientW"] + 1,
          "顶栏 tab 单行放下、无横向滚动区（scrollW=%d ≤ clientW=%d）" % (row["scrollW"], row["clientW"]),
          "tab 行数 %d、scrollW=%d > clientW=%d" % (row["rows"], row["scrollW"], row["clientW"]))

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
      const nm = box.querySelector('.shot-ph .nm');
      const r = box.querySelector('.shot-ph').getBoundingClientRect();
      return {name: nm ? nm.textContent : '', visible: r.width > 100 && r.height > 100};
    }""")
    check(ph["name"] == "龙号机车" and ph["visible"],
          "占位块可见并显示条目名「%s」" % ph["name"],
          "占位块文案 = %r，期望「龙号机车」" % ph["name"])

    era = page.evaluate("() => { const c = document.querySelector('.card .shot-era'); return c ? c.textContent : ''; }")
    check(era == "1881 年",
          "卡片年代徽标只显示起始年份（%s）" % era,
          "卡片年代徽标 = %r，期望「1881 年」" % era)

    meta = page.evaluate("() => document.querySelector('.card-info .meta').textContent")
    check(meta.startswith("第一台中国造蒸汽机车") and "Rocket of China" in meta,
          "卡片 meta 行 = 类型 · 英文名（%s）" % meta,
          "卡片 meta 行 = %r" % meta)

    print("—— 详情页（机车首条） ——")
    page.locator(".card").first.click()
    page.wait_for_selector(".detail .hero")
    check(page.url.endswith("#/v/loco-01") and page.locator(".detail h2").inner_text() == "龙号机车",
          "点击首张卡片进入 #/v/loco-01（标题：龙号机车）",
          "路由或标题异常：%s / %s" % (page.url, page.locator(".detail h2").inner_text()))

    hero_h = page.evaluate("() => Math.round(document.querySelector('.hero .shot').getBoundingClientRect().height)")
    check(hero_h == SHOT_HERO, "详情 hero 高度 %dpx" % hero_h, "hero 高度 = %d，期望 %d" % (hero_h, SHOT_HERO))

    pill = page.locator(".badge-row .era-pill").inner_text()
    check(pill == "1881 年 — 1930 年代",
          "详情页年代徽标显示完整跨度（%s）" % pill,
          "详情页年代徽标 = %r，期望「1881 年 — 1930 年代」" % pill)
    kind_pill = page.locator(".badge-row .kind-pill").inner_text()
    check(kind_pill == "第一台中国造蒸汽机车",
          "详情页类型徽标（%s）" % kind_pill,
          "类型徽标 = %r，期望「第一台中国造蒸汽机车」" % kind_pill)

    blocks = page.locator(".block").count()
    specs_n = page.locator(".spec").count()
    feats_n = page.locator(".feats li").count()
    check(blocks == 4 and specs_n == 4 and feats_n == 3,
          "4 个区块 / 4 项参数 / 3 条亮点",
          "区块 %d、参数 %d、亮点 %d，期望 4 / 4 / 3" % (blocks, specs_n, feats_n))

    prompt = page.locator(".prompt-box pre").inner_text()
    check("strict side elevation view" in prompt and "tank steam locomotive" in prompt,
          "车辆类提示词 = 侧视风格串 + 主体（%d 字符）" % len(prompt),
          "车辆类提示词拼接异常：%s" % prompt[:80])

    detail_text = page.evaluate("() => document.querySelector('.detail').innerText")
    check("assets/img" not in detail_text and ".webp" not in detail_text,
          "详情页不含仓库路径 / 文件名等开发信息",
          "详情页出现开发信息：%s" % detail_text[:120])

    page.screenshot(path=str(OUT / "detail-loco.png"), full_page=True)

    print("—— 详情页（车站类：走建筑立面风格串） ——")
    page.evaluate("() => { location.hash = '#/v/station-01'; }")
    page.wait_for_selector(".detail .hero")
    arch_prompt = page.locator(".prompt-box pre").inner_text()
    check("front elevation view" in arch_prompt and "side elevation view" not in arch_prompt,
          "车站类切换为建筑立面风格串（含 front elevation）",
          "车站类未切到立面风格串：%s" % arch_prompt[:80])

    print("—— 返回列表 ——")
    page.evaluate("() => { location.hash = '#/'; }")
    page.wait_for_selector(".card")
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
    page.locator(".tab", has_text="车站").first.click()
    st_sections = page.locator(".section").count()
    st_cards = page.locator(".card").count()
    check(st_sections == 1 and st_cards == 10,
          "「车站」tab 只剩一个分组（10 项）",
          "车站筛选后分组 %d、卡片 %d，期望 1 / 10" % (st_sections, st_cards))
    page.screenshot(path=str(OUT / "list-station.png"), full_page=True)

    check(not js_errors, "无 JS 运行时错误", "JS 报错：%s" % js_errors[:3])
    browser.close()

if failures:
    print("\n自检失败 %d 项：" % len(failures))
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n自检全部通过 ✅  截图：%s" % OUT)
