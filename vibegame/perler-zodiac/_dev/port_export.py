# -*- coding: utf-8 -*-
"""把 perler-zodiac 的「导出图纸」模块移植到姊妹项目（同构引擎，锚点一致）。

用法: python vibegame/_port_export.py
覆盖三处：_dev/build.py（CSS+HTML+JS）、_dev/build_zip.py（防回退校验）、_dev/smoke_test.js（闭环断言）
幂等：已含 sheetExport 的目标会跳过。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC_PROJ = ROOT / 'perler-zodiac'
TARGETS = ['perler-bead-game', 'perler-mid-autumn']

src = (SRC_PROJ / '_dev' / 'build.py').read_text(encoding='utf-8')


def slc(text, start, end):
    i = text.index(start)
    j = text.index(end, i)
    return text[i:j]


# ---------- 从 zodiac 提取导出模块 ----------
CSS = slc(src, '\n/* 首页卡片「导图纸」按钮', '\n</style>')
MENU_ITEM = slc(src, '      <button class="menu-item" data-act="export">', '\n') + '\n'
PANEL = slc(src, '  <div class="sheet" id="sheetExport">', '  <div class="modal" id="winModal">')
JS_BLOCK = slc(src, '// ==================== 导出图纸', '// 背景粒子')
MENU_JS = slc(src, "      else if(a==='export') openExport();", '\n') + '\n'
CARD_BTN = slc(src, "    const ex=document.createElement('button')", 'card.appendChild(ex);\n') + 'card.appendChild(ex);\n'
BIND_JS = slc(src, "  document.getElementById('winExport')", '  winModal.addEventListener')

OLD_WIN_BTN = '        <button class="secondary" id="winNext">下一幅</button>\n'
NEW_WIN_BTN = ('        <button class="secondary" id="winExport">存图纸</button>\n'
               '        <button id="winNext">下一幅</button>\n')

OLD_TOAST = ("function showToast(msg){\n"
             "  toastEl.textContent=msg;toastEl.classList.add('show');\n"
             "  clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1800);\n"
             "}")
NEW_TOAST = ("function showToast(msg,ms){\n"
             "  toastEl.textContent=msg;toastEl.classList.add('show');\n"
             "  clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),ms||1800);\n"
             "}")

ZIP_GUARDS = ('    # 小红书容器 §4.2 禁用 a[download]/blob 下载，导出必须走端能力 saveImageToPhotosAlbum\n'
              '    ("导出走容器端能力 saveImageToPhotosAlbum", "saveImageToPhotosAlbum" in js),\n'
              '    ("导出保留无 SDK 降级路径 a[download]", ".download=" in js),\n')


def patch(path, pairs, label):
    """pairs: [(old, new, 期望替换次数)]，old 为 None 时表示纯插入（用 anchor 定位由调用方处理）"""
    t = path.read_text(encoding='utf-8')
    for old, new, times in pairs:
        n = t.count(old)
        assert n == times, f'{label}: 锚点出现 {n} 次（期望 {times}）：{old[:60]!r}'
        t = t.replace(old, new)
    path.write_text(t, encoding='utf-8')
    print(f'  ✓ {label}')


for name in TARGETS:
    proj = ROOT / name
    bp = proj / '_dev' / 'build.py'
    zp = proj / '_dev' / 'build_zip.py'
    sp = proj / '_dev' / 'smoke_test.js'
    print(f'\n=== {name} ===')
    code = bp.read_text(encoding='utf-8')
    if 'sheetExport' in code:
        print('  · 已含导出模块，跳过 build.py')
    else:
        patch(bp, [
            ('z-index:40;white-space:nowrap', 'z-index:200;white-space:nowrap', 1),
            ('.lib-empty{grid-column:1/-1;text-align:center;color:var(--text-dim);padding:34px 0;font-size:13px;}\n',
             '.lib-empty{grid-column:1/-1;text-align:center;color:var(--text-dim);padding:34px 0;font-size:13px;}\n' + CSS, 1),
            ('      <button class="menu-item" data-act="gallery">',
             MENU_ITEM + '      <button class="menu-item" data-act="gallery">', 1),
            ('  <div class="modal" id="winModal">', PANEL + '  <div class="modal" id="winModal">', 1),
            (OLD_WIN_BTN, NEW_WIN_BTN, 1),
            ('    card.appendChild(tw);card.appendChild(info);\n',
             '    card.appendChild(tw);card.appendChild(info);\n' + CARD_BTN, 1),
            (OLD_TOAST, NEW_TOAST, 1),
            ("      else if(a==='info') showToast(", MENU_JS + "      else if(a==='info') showToast(", 1),
            ("  document.getElementById('winNext').addEventListener('click',nextPattern);\n",
             "  document.getElementById('winNext').addEventListener('click',nextPattern);\n" + BIND_JS, 1),
            ('// 背景粒子', JS_BLOCK + '// 背景粒子', 1),
        ], 'build.py 注入导出模块')

    # build_zip.py：加两条防回退校验
    zc = zp.read_text(encoding='utf-8')
    if 'saveImageToPhotosAlbum' not in zc:
        anchor = '        r"WebSocket|new\\s+Worker|geolocation|clipboard|getUserMedia|window\\.open", js)),\n'
        assert zc.count(anchor) == 1, f'{name}: build_zip 锚点不唯一'
        zc = zc.replace(anchor, anchor + ZIP_GUARDS)
        zp.write_text(zc, encoding='utf-8')
        print('  ✓ build_zip.py 加防回退校验')
    else:
        print('  · build_zip.py 已有校验，跳过')

    # smoke_test.js：加导出闭环断言（图案数按各项目实际数量）
    sc = sp.read_text(encoding='utf-8')
    if 'sheetExport' not in sc:
        n_pat = len(json.loads((proj / '_dev' / 'patterns.json').read_text(encoding='utf-8')))
        block = f"""
  // —— 导出图纸闭环：菜单打开 → 图纸面板渲染 → 关闭 ——
  click(doc.querySelector('[data-act=export]'));
  await new Promise((r) => setTimeout(r, 300));
  const expSheet = doc.getElementById('sheetExport');
  const expShown = /show/.test((expSheet || {{ className: '' }}).className || '');
  const expCanvas = doc.getElementById('exportCanvas');
  const expReady = !!expCanvas && expCanvas.width > 0 && expCanvas.height > 0;
  const expBtnOnCard = doc.querySelectorAll('.lib-export').length;
  console.log('\\n—— 导出图纸 ——');
  console.log('菜单可打开图纸面板 :', expShown, expShown ? '✅' : '⚠');
  console.log('图纸画布已渲染     :', expReady, expReady ? `(${{expCanvas.width}}x${{expCanvas.height}}) ✅` : '⚠');
  console.log('首页卡片导出按钮   :', expBtnOnCard, expBtnOnCard === {n_pat} ? '✅ {n_pat} 张卡全配齐' : '⚠');
  click(expSheet.querySelector('[data-close]'));
  await new Promise((r) => setTimeout(r, 200));
  console.log('关闭图纸面板       :', !/show/.test(expSheet.className) ? '✅' : '⚠');

"""
        anchor = '  const real2 = errors.filter((e) => e.kind === \'error\');'
        assert sc.count(anchor) == 1, f'{name}: smoke_test 锚点不唯一'
        sc = sc.replace(anchor, block + anchor)
        sp.write_text(sc, encoding='utf-8')
        print(f'  ✓ smoke_test.js 加导出断言（{n_pat} 幅图案）')
    else:
        print('  · smoke_test.js 已有导出断言，跳过')

print('\n移植完成。请对每个项目执行：build.py → build_zip.py → smoke_test.js')
