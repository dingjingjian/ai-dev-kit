# -*- coding: utf-8 -*-
"""图案与色卡体检工具（开发辅助，不参与构建产物）。

用法：
  python _dev/check.py pal          色卡体检：打印 HSL，并列出 RGB 距离 < 60 的难区分色对
  python _dev/check.py coin 铜钱    按 id 或中文名打印像素网格 + 行宽序列（验圆度/对称性）
  python _dev/check.py              默认打印 太极 / 铜钱 / 团扇 / 宝相花

为什么要它：
  1) 逐格填豆靠颜色分辨，两色太近就认不出 —— 色卡必须能自动体检；
  2) 小尺寸像素圆很容易被削平/变尖 —— 用行宽序列比肉眼可靠。
"""
import math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import patterns as P

NAMES = ['月白', '银灰', '墨黑', '栗棕', '赭石', '朱砂', '绛紫', '胭脂',
         '藕荷', '藤黄', '描金', '豆绿', '松绿', '青碧', '青花', '天青']


def by_name(key):
    for item in P.ALL:
        if item[0] == key or item[1] == key:
            return item
    return None


def show(key):
    item = by_name(key)
    if not item:
        print('未找到图案：%s' % key)
        return
    _, name, diff, cat, lore, fn = item
    g = fn()
    print('\n=== %s（%s %dx%d ★%d）===' % (name, cat, g.n, g.n, diff))
    for r in g.rows():
        print('  ' + ' '.join(r))
    widths = [sum(1 for ch in r if ch != '.') for r in g.rows()]
    print('  行宽序列:', widths)
    mirror = all(widths[i] == widths[-1 - i] for i in range(len(widths) // 2))
    print('  上下等宽:', 'OK' if mirror else 'NOTE 有额外元素（枝/叶/梗/山）或本身不对称')
    codes = sorted({ch for r in g.rows() for ch in r if ch != '.'})
    print('  用色: %d 色 %s' % (len(codes), ''.join(codes)))


def hsl(hexs):
    h = hexs.lstrip('#')
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    mx, mn = max(r, g, b), min(r, g, b)
    L = (mx + mn) / 2
    d = mx - mn
    S = 0 if d == 0 else (d / (2 - mx - mn) if L > 0.5 else d / (mx + mn))
    if d == 0:
        H = 0
    elif mx == r:
        H = (60 * ((g - b) / d) + 360) % 360
    elif mx == g:
        H = 60 * ((b - r) / d) + 120
    else:
        H = 60 * ((r - g) / d) + 240
    return H, S, L


def rgb(hexs):
    h = hexs.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def palette_check():
    codes = list(P.PAL.keys())
    print('=== 色卡（RGB 距离 < 60 视为难区分）===')
    for i, c in enumerate(codes):
        H, S, L = hsl(P.PAL[c])
        print('  %s %-4s %s  H=%3.0f S=%.2f L=%.2f' % (c, NAMES[i] if i < len(NAMES) else '', P.PAL[c], H, S, L))
    bad = []
    for i in range(len(codes)):
        for j in range(i + 1, len(codes)):
            a, b = rgb(P.PAL[codes[i]]), rgb(P.PAL[codes[j]])
            dist = math.sqrt(sum((a[k] - b[k]) ** 2 for k in range(3)))
            if dist < 60:
                bad.append((NAMES[i], NAMES[j], round(dist), P.PAL[codes[i]], P.PAL[codes[j]]))
    if bad:
        print('\n  难区分色对：')
        for x in bad:
            print('    %s(%s) <-> %s(%s)  距离 %d' % (x[0], x[3], x[1], x[4], x[2]))
        print('\n  结论: NG —— 请拉开明度或色相')
    else:
        print('\n  难区分色对：无')
        print('  结论: OK —— 任意两色 RGB 距离均 >= 60')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == 'pal':
        palette_check()
    else:
        for k in (args or ['taiji', 'coin', 'fan', 'medallion']):
            show(k)
