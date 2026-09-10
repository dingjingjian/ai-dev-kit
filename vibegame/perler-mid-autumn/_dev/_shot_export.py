# -*- coding: utf-8 -*-
"""开发辅助：用 Playwright 打开游戏，截图导出图纸面板并体检「是否一屏看全」。

用法: python _shot_export.py
输出: _preview_export.png（全景）/ _preview_export_zoom.png（放大）
      _preview_print.png（打印视图）/ _preview_play.png（拼豆台）
      控制台打印各尺寸档位下是否需要滚动。
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
URL = 'file:///' + os.path.join(BASE, '..', 'index.html').replace(os.sep, '/')

PROBE = """() => {
  const cv = document.getElementById('exportCanvas');
  const sc = document.querySelector('.exp-scroll');
  const r = cv.getBoundingClientRect();
  return {
    name: document.getElementById('expTitle').textContent,
    dispW: Math.round(r.width), dispH: Math.round(r.height),
    boxW: sc.clientWidth, boxH: sc.clientHeight,
    scrollH: sc.scrollHeight, scrollW: sc.scrollWidth,
    tip: (document.getElementById('expTip')||{}).textContent
  };
}"""

with sync_playwright() as pw:
    try:
        b = pw.chromium.launch(channel='msedge', headless=True)
    except Exception:
        b = pw.chromium.launch(headless=True)

    for vw, vh in ((420, 860), (360, 640)):
        pg = b.new_page(viewport={'width': vw, 'height': vh})
        pg.goto(URL)
        pg.wait_for_timeout(700)
        print('=' * 56)
        print('视口 %dx%d' % (vw, vh))
        # 抽查三档尺寸：子鼠(17) 丑牛(21) 寅虎(25)
        for idx, tag in ((0, '子鼠17'), (1, '丑牛21'), (2, '寅虎25')):
            pg.locator('.lib-export').nth(idx).click()
            pg.wait_for_timeout(350)
            d = pg.evaluate(PROBE)
            need = d['scrollH'] - d['boxH']
            print('  %s 图纸显示 %dx%d / 容器 %dx%d  scrollH=%d  需滚动=%s'
                  % (tag, d['dispW'], d['dispH'], d['boxW'], d['boxH'],
                     d['scrollH'], ('否 ✅' if need <= 1 else '是 ❌ +%dpx' % need)))
            if idx == 2:
                pg.screenshot(path=os.path.join(BASE, '_preview_export.png'))
                pg.locator('#exportCanvas').click()
                pg.wait_for_timeout(300)
                d2 = pg.evaluate(PROBE)
                print('     放大后 %dx%d，tip=%s' % (d2['dispW'], d2['dispH'], d2['tip']))
                pg.screenshot(path=os.path.join(BASE, '_preview_export_zoom.png'))
                pg.locator('#exportCanvas').click()
                pg.wait_for_timeout(250)
            pg.locator('#sheetExport .sheet-close').click()
            pg.wait_for_timeout(250)
        if (vw, vh) == (420, 860):
            pg.locator('.lib-export').nth(2).click()
            pg.wait_for_timeout(300)
            pg.emulate_media(media='print')
            pg.wait_for_timeout(300)
            pg.screenshot(path=os.path.join(BASE, '_preview_print.png'))
            pg.emulate_media(media='screen')
            pg.locator('#sheetExport .sheet-close').click()
            pg.wait_for_timeout(250)
            pg.locator('.lib-card').nth(0).click()
            pg.wait_for_timeout(600)
            pg.screenshot(path=os.path.join(BASE, '_preview_play.png'))
        pg.close()
    b.close()
print('saved _preview_export.png / _preview_export_zoom.png / _preview_print.png / _preview_play.png')
