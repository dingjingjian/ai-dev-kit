# -*- coding: utf-8 -*-
"""渲染自检：移动端视口跑一遍列表页与详情页，覆盖以下断言。

  1. 四分类分组齐全、条目数正确（机车 20 / 客车 10 / 货车 10 / 车站 10 = 50）
  2. 顶栏 5 个 tab 单行放下，且 tab 行没有横向滚动区
  3. 配图缺失时占位块可见并显示条目名（不含仓库路径）
  4. 图片框高度 = 卡片 150 / 详情 hero 210（固定高度）；分类封面按源图 16:9 整幅铺满，
     高度随宽度走（Chrome 61 无 aspect-ratio，靠 padding-bottom:56.25% 撑高），故按比例核对
  5. 年代徽标：列表只显示起始年份，详情显示完整跨度；卡片 meta 行显示「类型 · 英文名」
  6. 详情页区块齐全（介绍 / 关键参数 / 亮点 / AI 配图提示词），参数与亮点数量正确
  7. 提示词 = 该类风格串 + 条目的主体描述；车站类用建筑立面串（front elevation）
  8. 详情页不含开发信息（assets/img、.webp 等）
  9. 从详情返回列表能回到离开时的滚动位置
 10. 分类筛选：点某个 tab 后只剩一个分组
 11. 分享到小红书：拿不到 postNote 时整块隐藏；注入桥桩后按钮出现、原图到货即转可用，
     点击先 writeTempFile 落临时文件再 postNote，标题 / 正文按 API 上限裁剪且内容正确

用法：python _dev/shot_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)

SHOT_CARD, SHOT_HERO = 150, 210
COVER_RATIO = 9.0 / 16.0   # 分类封面按源图 960×540 整幅铺满，显示框恒为 16:9
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
    # --allow-file-access-from-files：本自检直接用 file:// 打开 index.html，
    # 而「分享」要把页面里的原图经 Canvas 取成 data:uri —— 不放开这条，
    # file:// 下画布会被判为被污染、toDataURL 抛 SecurityError（容器里同源，不存在这一步）。
    browser = p.chromium.launch(args=["--allow-file-access-from-files"])
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
      const c = document.querySelector('.card .shot').getBoundingClientRect();
      const v = document.querySelector('.cat-cover .shot').getBoundingClientRect();
      return {card: Math.round(c.height), coverW: v.width, coverH: v.height};
    }""")
    cover_ok = abs(heights["coverH"] - heights["coverW"] * COVER_RATIO) <= 1.5
    check(heights["card"] == SHOT_CARD and cover_ok,
          "卡片图片框 %dpx；分类封面 %d×%d ≈ 16:9" % (heights["card"], heights["coverW"], heights["coverH"]),
          "图片框异常 = %s，期望卡片 %dpx、封面 16:9" % (heights, SHOT_CARD))

    # 宽屏：封面容器受 --page(640px) 限制，不该被拉宽成别的比例
    page.set_viewport_size({"width": 768, "height": 844})
    wide = page.evaluate("""() => {
      const v = document.querySelector('.cat-cover .shot').getBoundingClientRect();
      return {w: v.width, h: v.height};
    }""")
    check(abs(wide["h"] - wide["w"] * COVER_RATIO) <= 1.5 and wide["w"] < 620,
          "宽屏（768px）分类封面 %d×%d 仍为 16:9、未超出 640px 页面宽"
          % (wide["w"], wide["h"]),
          "宽屏分类封面异常：%s，期望 16:9 且宽 < 620" % wide)
    page.set_viewport_size({"width": 390, "height": 844})

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

    share_off = page.evaluate("""() => ({
      has: document.documentElement.className.indexOf('has-share') >= 0,
      btn: document.querySelectorAll('.share').length})""")
    check(not share_off["has"] and share_off["btn"] == 0,
          "拿不到 postNote 时分享整块隐藏（能力检测而非 UA 判断）",
          "不该出现分享按钮：%s" % share_off)

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

    print("—— 分享到小红书（注入桥桩） ——")
    sp = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    # 注意：add_init_script 的字符串是「直接执行的脚本」，不要写成箭头函数（那只是个从不执行的表达式）
    sp.add_init_script("""
      window.__share = [];
      window.xhs = { miniTool: {
        writeTempFile: function (o) {
          window.__share.push({api: 'writeTempFile', head: String(o.data).slice(0, 22),
                               len: String(o.data).length});
          return Promise.resolve({filePath: '/tmp/cra-share.webp'});
        },
        postNote: function (o) {
          window.__share.push({api: 'postNote', title: o.title, content: o.content,
                               pageType: o.pageType, url: o.mediaInfo.image_resources[0].url});
          return Promise.resolve({errMsg: 'postNote:ok'});
        }
      }};
    """)
    sp.goto(URL + "#/v/loco-01")
    sp.wait_for_selector("#shareBtn")
    sp.wait_for_function(
        "() => { const i = document.querySelector('.hero .shot-img'); return !!(i && i.naturalWidth > 0); }")
    sp.wait_for_timeout(150)
    ready = sp.evaluate("""() => { const b = document.getElementById('shareBtn');
      return {cls: b.className, dis: b.disabled,
              has: document.documentElement.className.indexOf('has-share') >= 0}; }""")
    check(ready["has"] and "off" not in ready["cls"] and not ready["dis"],
          "拿得到 postNote 时分享按钮出现，且原图到货后转为可用",
          "分享按钮状态异常：%s" % ready)

    intro_text = sp.evaluate("() => document.querySelector('.block p').innerText")
    sp.click("#shareBtn")
    sp.wait_for_timeout(500)
    rec = sp.evaluate("window.__share")
    sp.screenshot(path=str(OUT / "share.png"), full_page=False)

    ok_calls = (len(rec) == 2 and rec[0]["api"] == "writeTempFile" and rec[1]["api"] == "postNote")
    check(ok_calls and rec[0]["head"].startswith("data:image/"),
          "先 writeTempFile 落临时文件（%s…，%d 字符）再 postNote"
          % (rec[0]["head"] if rec else "?", rec[0]["len"] if rec else 0),
          "桥调用异常：%s" % rec)
    note = rec[1] if len(rec) > 1 else {}
    check(note.get("title") == "中国铁路图鉴 · 龙号机车" and len(note.get("title") or "") <= 20,
          "标题为条目名且 ≤20（%s）" % note.get("title"), "标题异常：%r" % note.get("title"))
    check(note.get("pageType") == "photo_publish" and note.get("url") == "/tmp/cra-share.webp",
          "pageType=photo_publish，媒体用 writeTempFile 返回的 filePath",
          "图文参数异常：%s" % note)
    body = note.get("content") or ""
    check(body.startswith(intro_text) and "年代：1881 年 — 1930 年代" in body
          and "火车头 · 第一台中国造蒸汽机车" in body
          and "—— 中国铁路图鉴" in body and len(body) <= 1000,
          "正文是该条目介绍 + 分类 · 类型 + 年代 + 关键参数（%d 字）" % len(body),
          "正文异常：%s" % body[:80])
    after = sp.evaluate("""() => ({dis: document.getElementById('shareBtn').disabled})""")
    check(not after["dis"], "唤起后按钮恢复可点（busy 复位）", "按钮未复位：%s" % after)
    sp.close()

    check(not js_errors, "无 JS 运行时错误", "JS 报错：%s" % js_errors[:3])
    browser.close()

if failures:
    print("\n自检失败 %d 项：" % len(failures))
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n自检全部通过 ✅  截图：%s" % OUT)
