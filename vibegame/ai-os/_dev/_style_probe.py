# -*- coding: utf-8 -*-
"""临时：样式体检探针 2（应用页，用完删除）。"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, inapp in [(390, 844, False), (390, 844, True), (320, 568, True)]:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(URL)
        if inapp:
            pg.evaluate("document.body.classList.add('in-app')")
        pg.wait_for_timeout(150)
        print("=== %dx%d in-app=%s" % (w, h, inapp))
        n = pg.evaluate("() => document.querySelectorAll('.home-grid .app-tile, .dock .app-tile').length")
        for i in range(n):
            pg.evaluate("() => { document.getElementById('keyHome').click(); }")
            pg.wait_for_timeout(60)
            pg.evaluate("(i) => document.querySelectorAll('.home-grid .app-tile, .dock .app-tile')[i].click()", i)
            pg.wait_for_timeout(150)
            d = pg.evaluate("""() => {
              const v = document.querySelector('.view:not(.hidden)');
              if (!v) return null;
              const name = (v.querySelector('.phead h1')||{}).textContent || v.className;
              const pb = v.querySelector('.pbody');
              const pf = v.querySelector('.pfoot');
              const wrap = v.querySelector('.ph-wrap');
              const body = pb || wrap;
              const r = { name: name };
              if (body) {
                r.overflowX = body.scrollWidth - body.clientWidth;
                r.empty = body.scrollHeight <= body.clientHeight
                  ? +(body.clientHeight - body.scrollHeight).toFixed(0) : 0;
              }
              if (pf) { r.footH = Math.round(pf.getBoundingClientRect().height); }
              // 找超宽子元素
              r.wideKids = [];
              v.querySelectorAll('*').forEach(function (e) {
                const rc = e.getBoundingClientRect();
                if (rc.width > 0 && rc.right > innerWidth + 1) {
                  r.wideKids.push(e.className + '@' + Math.round(rc.right));
                }
              });
              r.wideKids = r.wideKids.slice(0, 4);
              return r;
            }""")
            if not d:
                continue
            flags = []
            if d.get("overflowX", 0) > 1:
                flags.append("横向溢出+%s" % d["overflowX"])
            if d.get("empty", 0) > 80:
                flags.append("底部留白%s" % d["empty"])
            if d.get("wideKids"):
                flags.append("越界:" + ",".join(d["wideKids"]))
            print("  %-6s %s" % (d["name"], " | ".join(flags) if flags else "ok"))
        pg.close()
    b.close()
