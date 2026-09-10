# -*- coding: utf-8 -*-
"""开发辅助：模拟「小红书小工具容器」与「普通浏览器」，验证导出保存的反馈链路。

断言三点：
1. 调用链正确（writeTempFile -> saveImageToPhotosAlbum / a[download]）
2. 保存成功后 toast 真的可见（z-index 不被导出面板 z-95 遮住，且在视口内）
3. 按钮态流转：生成中… -> 已保存到相册 ✓ -> 复位
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
URL = 'file:///' + os.path.join(BASE, '..', 'index.html').replace(os.sep, '/')

MOCK_SDK = """
window.__calls = [];
window.__silent = false;   // 设为 true 可模拟容器回调不上行
window.xhs = { miniTool: {
  writeTempFile: function (o) {
    window.__calls.push('writeTempFile(len=' + String(o.data).length + ')');
    if (!window.__silent) o.success && o.success({ filePath: '/tmp/mock.png' });
  },
  saveImageToPhotosAlbum: function (o) {
    window.__calls.push('saveImageToPhotosAlbum(' + o.filePath + ')');
    if (window.__silent) return;      // 模拟容器回调不上行
    setTimeout(function () { o.success && o.success({ errMsg: 'saveImageToPhotosAlbum:ok' }); }, 500);
  }
} };
"""

PROBE_TOAST = """() => {
  const t = document.querySelector('.toast');
  const r = t.getBoundingClientRect();
  const cs = getComputedStyle(t);
  const shown = t.classList.contains('show');
  // 命中测试：toast 默认 pointer-events:none 会被 elementFromPoint 忽略，先临时开启
  const prev = t.style.pointerEvents;
  t.style.pointerEvents = 'auto';
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  t.style.pointerEvents = prev;
  return {
    text: t.textContent, shown: shown, z: cs.zIndex,
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
    topmost: !!(hit && (hit === t || t.contains(hit))),
    hitTag: hit ? (hit.className || hit.tagName) : null,
    btn: document.getElementById('expPng').textContent
  };
}"""


def run(b, with_sdk, silent=False, tag=''):
    pg = b.new_page(viewport={'width': 420, 'height': 860})
    if with_sdk:
        pg.add_init_script(MOCK_SDK)
        if silent:
            pg.add_init_script("window.__silent = true;")
    pg.goto(URL)
    pg.wait_for_timeout(700)
    pg.locator('.lib-export').nth(2).click()
    pg.wait_for_timeout(400)
    pg.locator('#expPng').click()
    pg.wait_for_timeout(250)
    mid = pg.evaluate(PROBE_TOAST)          # 进行中：应显示「正在生成图纸…」
    pg.wait_for_timeout(700)
    after = pg.evaluate(PROBE_TOAST)        # 完成后：应显示成功提示
    print('=' * 62)
    print(tag)
    print('  SDK 调用链 :', pg.evaluate('window.__calls || []') or '（无，走 a[download] 降级）')
    print('  进行中     : toast=%r 按钮=%r' % (mid['text'], mid['btn']))
    print('  完成后     : toast=%r shown=%s z=%s 视口内=%s 未被遮挡=%s (命中=%s)'
          % (after['text'], after['shown'], after['z'], after['inViewport'],
             after['topmost'], after['hitTag']))
    print('  按钮文案   : %r' % after['btn'])
    pg.screenshot(path=os.path.join(BASE, '_preview_saved_%s.png' % ('xhs' if with_sdk else 'web')))
    pg.close()
    return mid, after


with sync_playwright() as pw:
    b = pw.chromium.launch(channel='msedge', headless=True)
    m1, a1 = run(b, True, tag='容器内(有SDK)')
    m2, a2 = run(b, False, tag='浏览器(无SDK)')
    b.close()

ok = (a1['shown'] and a1['topmost'] and a1['inViewport'] and '相册' in a1['text']
      and '生成中' in m1['btn'] and '已保存' in a1['btn']
      and a2['shown'] and a2['topmost'] and '已保存' in a2['btn'])
print('=' * 62)
print('结论:', '✅ 提示可见且按钮态流转正确' if ok else '❌ 反馈链路仍有问题')
