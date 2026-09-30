# -*- coding: utf-8 -*-
"""world-food-3d · 大洲主题 / 横幅融合 / 热量合计 冒烟与盒模型审计

核查点：
  1. 顶栏牌匾（.top / .brand）已不存在，菜单页无顶部留白（横幅 top == 0）
  2. 页签咬在横幅下沿（tabs.bottom == hero.bottom），菜单列表可视高度
  3. 七套主题：body[data-ctn] 切换后 --red / --paper / --banner-img 随之改变，
     横幅实际 background-image 指向对应 banner-<key>.webp，标题与统计文案跟着换
  4. 菜品页上栏不再被 50px 留白顶下去（dish-bar.top ≈ 8px）
  5. 风味总结页的热量合计区渲染出总热量 / 占日均 / 均值 / 最重最轻 / 快走折算
  6. 全流程无 pageerror / console.error，无横向溢出

运行：python tests/smoke_theme.py
"""
import os
import json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
OUT = os.path.join(ROOT, "dist", "smoke_theme.log")

LAUNCH = dict(
    channel="msedge", headless=True,
    args=["--use-gl=angle", "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader", "--allow-file-access-from-files"],
)

PROBE = """() => {
  const box = (sel) => { const e = document.querySelector(sel); if(!e) return null;
    const b = e.getBoundingClientRect();
    return {t:Math.round(b.top), b:Math.round(b.bottom), l:Math.round(b.left),
            w:Math.round(b.width), h:Math.round(b.height)}; };
  const cs = (sel,p) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[p] : null; };
  const v = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
  return {
    vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth,
    ctn: document.body.getAttribute('data-ctn'),
    hasTop: !!document.querySelector('.top'),
    hasBrand: !!document.querySelector('.brand'),
    hero: box('.menu-hero'), tabs: box('.tabs'), list: box('.menu-list'),
    veil: box('.hero-veil'), heroTxt: box('.hero-txt'),
    heroBg: cs('.menu-hero','backgroundImage'),
    ttl: (document.getElementById('menuTtl')||{}).textContent || null,
    sub: (document.getElementById('menuSub')||{}).textContent || null,
    stat: (document.getElementById('menuStat')||{}).textContent || null,
    vars: {red: v('--red'), paper: v('--paper'), wood9: v('--wood-9'), banner: v('--banner-img')},
    secs: [...document.querySelectorAll('#menuList .sec')].map(e => e.textContent),
    rows: document.querySelectorAll('#menuList .mrow').length,
    dishBar: box('.dish-bar'), globe: box('#globeSlot'),
    kcal: (document.getElementById('sumKcal')||{}).innerText || null
  };
}"""


def main():
    log = []
    with sync_playwright() as p:
        br = p.chromium.launch(**LAUNCH)
        pg = br.new_page(viewport={"width": 390, "height": 844})
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text)
              if m.type == "error" else None)
        pg.goto(URL)
        pg.wait_for_timeout(1600)

        def probe(tag):
            d = pg.evaluate(PROBE)
            log.append("=== %s ===" % tag)
            log.append(json.dumps(d, ensure_ascii=False, indent=1))
            return d

        base = probe("menu / all")
        log.append("菜单列表可视高度 / 视口高 = %d / %d" % (base["list"]["h"], base["vh"]))
        log.append("横幅 top = %d（应为 0）, 底 = %d, 页签底 = %d（须相等）"
                   % (base["hero"]["t"], base["hero"]["b"], base["tabs"]["b"]))
        log.append("牌匾残留：.top=%s .brand=%s" % (base["hasTop"], base["hasBrand"]))

        for key in ["asia", "europe", "africa", "nam", "sam", "oce", "all"]:
            pg.click('#tabs button[data-c="%s"]' % key)
            pg.wait_for_timeout(220)
            d = probe("theme / " + key)
            log.append("  → ctn=%s red=%s banner=%s ttl=%s stat=%s"
                       % (d["ctn"], d["vars"]["red"], d["vars"]["banner"], d["ttl"], d["stat"]))

        # 菜品页：上栏不再被 50px 留白顶下去
        pg.click("#menuList .mrow")
        pg.wait_for_timeout(500)
        d = probe("dish")
        log.append("菜品页上栏 top=%d（约 8px 安全区）, 地球槽 top=%d"
                   % (d["dishBar"]["t"], d["globe"]["t"]))

        # 点两道菜 → 上菜 → 总结
        pg.click("#dAdd")
        pg.click("#dNext")
        pg.wait_for_timeout(400)
        pg.click("#dAdd")
        pg.wait_for_timeout(200)
        pg.click("#backBtn")
        pg.wait_for_timeout(300)
        pg.click("#orderBtn")
        pg.wait_for_timeout(600)
        pg.click("#svNext")
        pg.wait_for_timeout(500)
        pg.click("#svNext")          # 末道 → 风味总结
        pg.wait_for_timeout(700)
        d = probe("summary")
        log.append("热量区：\n" + (d["kcal"] or "<空>"))

        log.append("横向溢出：scrollW=%d vw=%d" % (d["scrollW"], d["vw"]))

        # 多档视口：只量几何 —— 横幅是否被压、列表还剩多少、横向是否溢出
        pg2 = br.new_page(viewport={"width": 390, "height": 844})
        pg2.goto(URL)
        pg2.wait_for_timeout(1400)
        for w, h in [(390, 844), (390, 500), (360, 640), (1280, 820)]:
            pg2.set_viewport_size({"width": w, "height": h})
            pg2.wait_for_timeout(350)
            d = pg2.evaluate(PROBE)
            log.append("视口 %dx%d → 横幅 h=%d（含页签） 列表 h=%d 溢出=%s 页签底/横幅底=%d/%d"
                       % (w, h, d["hero"]["h"], d["list"]["h"],
                          d["scrollW"] > d["vw"], d["tabs"]["b"], d["hero"]["b"]))
        pg2.close()

        log.append("错误：%s" % (errs if errs else "无"))
        br.close()

    txt = "\n".join(log)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
