# -*- coding: utf-8 -*-
"""十二生肖拼豆坊 · 图案稿：12 生肖 + 预览渲染。

运行：python _dev/patterns.py
产出：_dev/patterns.json（游戏数据）、_dev/preview.png（目视校验用预览图）
体检：python _dev/check.py pal（色卡）、python _dev/check.py 子鼠（网格/行宽）

设计约定：
- 生肖一律画「正面头像」，圆脸 + 大眼，小尺寸下辨识度最高。
- 17×17 入门（鼠兔鸡猪）／21×21 进阶（牛马羊狗）／25×25 精工（虎龙蛇猴）。
- 改完必须渲染 preview.png 目视，颜色贴近的色号在逐格填豆时认不出。
"""
import math, os, json
from PIL import Image, ImageDraw

# 国风色卡（16 色）
# 硬约束：任意两色的 RGB 欧氏距离 >= 60（逐格填豆时靠颜色分辨，太近会认不出）。
PAL = {
    'w': '#F5EFE2',  # 月白
    'e': '#A8A292',  # 银灰
    'k': '#221E1B',  # 墨黑
    'm': '#6E3D1F',  # 栗棕
    'o': '#D09A55',  # 赭石
    'r': '#CE3A2C',  # 朱砂
    'v': '#8A2450',  # 绛紫
    'p': '#DB6A8C',  # 胭脂
    'l': '#EFAFC4',  # 藕荷
    'y': '#F5C93C',  # 藤黄
    'd': '#A87A1E',  # 描金
    'g': '#8FBF52',  # 豆绿
    'n': '#2F6B49',  # 松绿
    't': '#35AE9E',  # 青碧
    'b': '#2F5D8C',  # 青花
    'c': '#9CC0DC',  # 天青
}


class G:
    def __init__(self, n):
        self.n = n
        self.d = [['.'] * n for _ in range(n)]

    def set(self, x, y, c):
        x = int(round(x)); y = int(round(y))
        if 0 <= x < self.n and 0 <= y < self.n:
            self.d[y][x] = c

    def get(self, x, y):
        return self.d[y][x] if 0 <= x < self.n and 0 <= y < self.n else '.'

    def inside(self, x, y):
        return 0 <= x < self.n and 0 <= y < self.n

    def disc(self, cx, cy, r, c, cond=None):
        r2 = r * r
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                if dx * dx + dy * dy <= r2 and (not cond or cond(dx, dy)):
                    self.d[y][x] = c

    def ring(self, cx, cy, r, w, c, cond=None):
        ro, ri = r + w / 2.0, r - w / 2.0
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                dd = math.hypot(dx, dy)
                if ri <= dd <= ro and (not cond or cond(dx, dy)):
                    self.d[y][x] = c

    def ring2(self, cx, cy, r_out, r_in, c_out, c_in=None):
        """实心圆环：先填外圆 c_out，再用内圆覆盖 c_in（两圆相减）。

        比 ring() 可靠两处：
        1) 外沿形状由 r_out 精确决定，圆才会圆；
        2) 环带不会在某些行整行消失（两实心圆相减任何行都至少留一格）。
        半径差建议 >= 1.0。c_in 省略时保留内圆原有像素。
        """
        snap = [row[:] for row in self.d]
        self.disc(cx, cy, r_out, c_out)
        if c_in is None:
            r2 = r_in * r_in
            for y in range(self.n):
                for x in range(self.n):
                    dx = x + 0.5 - cx; dy = y + 0.5 - cy
                    if dx * dx + dy * dy <= r2:
                        self.d[y][x] = snap[y][x]
        else:
            self.disc(cx, cy, r_in, c_in)

    def rect(self, x, y, w, h, c):
        for j in range(int(math.floor(y + 1e-4)), int(math.ceil(y + h - 1e-4))):
            for i in range(int(math.floor(x + 1e-4)), int(math.ceil(x + w - 1e-4))):
                self.set(i, j, c)

    def ell(self, cx, cy, rx, ry, c, rot=0.0, cond=None):
        ca, sa = math.cos(-rot), math.sin(-rot)
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                u = (dx * ca - dy * sa) / rx; v = (dx * sa + dy * ca) / ry
                if u * u + v * v <= 1.0 and (not cond or cond(dx, dy)):
                    self.d[y][x] = c

    def ellring(self, cx, cy, rx, ry, w, c, rot=0.0, cond=None):
        ca, sa = math.cos(-rot), math.sin(-rot)
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                u = (dx * ca - dy * sa) / rx; v = (dx * sa + dy * ca) / ry
                m = math.hypot(u, v)
                if abs(m - 1.0) * min(rx, ry) <= w / 2.0 and (not cond or cond(dx, dy)):
                    self.d[y][x] = c

    def line(self, x0, y0, x1, y1, c, w=1.0):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 4) + 2
        hw, rad = w / 2.0, int(math.ceil(w / 2.0 + 0.5))
        for i in range(steps + 1):
            t = i / steps
            px = x0 + (x1 - x0) * t; py = y0 + (y1 - y0) * t
            xi, yi = int(math.floor(px)), int(math.floor(py))
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    if math.hypot(xi + dx + 0.5 - px, yi + dy + 0.5 - py) <= hw + 0.35:
                        self.set(xi + dx, yi + dy, c)

    def curve(self, pts, c, w=1.0, seg=50):
        if len(pts) < 2:
            return
        out = []
        for i in range(len(pts) - 1):
            p0, p1 = pts[i], pts[i + 1]
            for j in range(seg + 1 if i < len(pts) - 2 else seg):
                t = j / seg
                out.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
        out.append(pts[-1])
        for i in range(len(out) - 1):
            self.line(out[i][0], out[i][1], out[i + 1][0], out[i + 1][1], c, w)

    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(max(0, int(min(ys))), min(self.n - 1, int(max(ys))) + 1):
            yc = y + 0.5
            xs = []
            m = len(pts)
            for i in range(m):
                x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % m]
                if (y0 <= yc < y1) or (y1 <= yc < y0):
                    xs.append(x0 + (x1 - x0) * (yc - y0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.ceil(xs[i] - 0.5)), int(math.floor(xs[i + 1] - 0.5)) + 1):
                    self.set(x, y, c)

    def diamond(self, cx, cy, rad, c):
        for y in range(self.n):
            for x in range(self.n):
                if abs(x + 0.5 - cx) + abs(y + 0.5 - cy) <= rad:
                    self.d[y][x] = c

    def diamondring(self, cx, cy, r0, r1, c):
        for y in range(self.n):
            for x in range(self.n):
                m = abs(x + 0.5 - cx) + abs(y + 0.5 - cy)
                if r0 <= m <= r1:
                    self.d[y][x] = c

    def fill_bbox(self, x0, y0, x1, y1, c):
        for y in range(max(0, int(y0)), min(self.n, int(y1) + 1)):
            for x in range(max(0, int(x0)), min(self.n, int(x1) + 1)):
                self.d[y][x] = c

    def flood(self, sx, sy, c):
        if not self.inside(sx, sy): return
        old = self.d[sy][sx]
        if old == c: return
        stack = [(sx, sy)]
        while stack:
            x, y = stack.pop()
            if not self.inside(x, y) or self.d[y][x] != old: continue
            self.d[y][x] = c
            stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    def rows(self):
        return [''.join(r) for r in self.d]


def eyes(g, lx, rx, y, r=1.0, glint=True):
    """对称双眼：黑瞳 + 月白高光。"""
    g.disc(lx, y, r, 'k'); g.disc(rx, y, r, 'k')
    if glint:
        g.set(lx - 0.4, y - 0.4, 'w'); g.set(rx - 0.4, y - 0.4, 'w')


# ---------- 入门 17x17 ----------
def p_rat():
    """子鼠：圆耳朵 + 尖嘴 + 长尾。"""
    n = 17; g = G(n); C = 8.5
    # 尾巴（先画，根部被身体压住）
    g.curve([(12.0, 13.6), (14.8, 14.6), (15.6, 11.6), (13.4, 10.2)], 'l', 0.75)
    # 耳朵
    for sx in (3.6, 13.4):
        g.disc(sx, 4.4, 3.1, 'e')
        g.disc(sx, 4.4, 1.7, 'l')
    # 脸
    g.disc(C, 9.2, 4.6, 'e')
    g.disc(C, 9.2, 4.6, 'w', cond=lambda dx, dy: dx < -1.9 and dy > 0.4)
    # 尖嘴
    g.ell(C, 12.6, 2.0, 1.9, 'e')
    g.disc(C, 13.4, 0.95, 'l')
    # 腮红
    g.disc(5.2, 11.0, 1.15, 'l'); g.disc(11.8, 11.0, 1.15, 'l')
    eyes(g, 6.5, 10.5, 8.6, 1.0)
    # 胡须
    for dy in (-0.6, 0.4, 1.4):
        g.line(7.0, 12.4, 1.6, 12.4 + dy, 'k', 0.55)
        g.line(10.0, 12.4, 15.4, 12.4 + dy, 'k', 0.55)
    return g


def p_rabbit():
    """卯兔：长耳三瓣嘴。"""
    n = 17; g = G(n); C = 8.5
    # 长耳朵
    for sx, rot in ((5.6, -0.14), (11.4, 0.14)):
        g.ell(sx, 4.6, 1.5, 3.7, 'w', rot=rot)
        g.ell(sx, 4.9, 0.75, 2.6, 'l', rot=rot)
    # 脸
    g.disc(C, 10.4, 4.5, 'w')
    g.disc(C, 10.4, 4.5, 'e', cond=lambda dx, dy: dx > 3.3)
    eyes(g, 6.5, 10.5, 10.0, 1.0)
    # 鼻子与三瓣嘴
    g.disc(C, 12.2, 0.85, 'p')
    g.line(C, 12.9, C, 13.8, 'k', 0.5)
    g.curve([(C, 13.8), (7.3, 14.6), (6.6, 13.8)], 'k', 0.5)
    g.curve([(C, 13.8), (9.7, 14.6), (10.4, 13.8)], 'k', 0.5)
    # 腮红
    g.disc(4.9, 12.0, 1.0, 'l'); g.disc(12.1, 12.0, 1.0, 'l')
    # 胡须
    for dy in (-0.5, 0.5):
        g.line(6.2, 12.4, 1.8, 11.8 + dy, 'k', 0.5)
        g.line(10.8, 12.4, 15.2, 11.8 + dy, 'k', 0.5)
    return g


def p_rooster():
    """酉鸡：红冠黄喙，尾羽三色。"""
    n = 17; g = G(n); C = 8.5
    # 尾羽
    for pts, c in (([(3.6, 12.6), (0.6, 8.0), (1.6, 4.6)], 'n'),
                   ([(4.4, 13.2), (1.6, 9.4), (3.0, 5.4)], 'g'),
                   ([(5.2, 13.6), (3.2, 10.4), (5.0, 6.6)], 't')):
        g.curve(pts, c, 0.95)
    # 身体
    g.ell(7.4, 12.2, 4.3, 3.2, 'w')
    g.ell(7.8, 12.6, 2.7, 2.0, 'o')
    g.line(5.6, 12.0, 8.6, 13.4, 'd', 0.5)
    g.line(5.6, 13.4, 8.6, 12.6, 'd', 0.5)
    # 腿
    g.rect(6.4, 15.0, 0.9, 1.8, 'd'); g.rect(9.2, 15.0, 0.9, 1.8, 'd')
    # 头
    g.disc(11.0, 7.4, 3.6, 'w')
    # 鸡冠
    g.curve([(8.2, 5.0), (9.4, 2.9), (11.0, 3.6), (12.4, 1.9), (13.4, 4.4)], 'r', 1.25)
    # 喙
    g.poly([(13.6, 6.4), (16.6, 7.6), (13.6, 8.9)], 'y')
    g.line(13.6, 7.6, 16.4, 7.6, 'd', 0.5)
    # 肉垂
    g.disc(13.2, 9.6, 1.15, 'r')
    eyes(g, 12.2, 12.2, 6.8, 0.9)
    return g


def p_pig():
    """亥猪：大鼻头 + 招风耳。"""
    n = 17; g = G(n); C = 8.5
    # 耳朵
    g.poly([(1.8, 2.4), (5.4, 5.6), (1.6, 7.6)], 'p')
    g.poly([(15.2, 2.4), (11.6, 5.6), (15.4, 7.6)], 'p')
    # 脸
    g.disc(C, 9.4, 4.8, 'l')
    g.disc(C, 9.4, 4.8, 'p', cond=lambda dx, dy: dx > 3.0)
    # 腮红
    g.disc(4.6, 10.6, 1.2, 'p'); g.disc(12.4, 10.6, 1.2, 'p')
    eyes(g, 6.4, 10.6, 8.6, 0.9)
    # 鼻头
    g.ell(C, 12.4, 2.5, 1.9, 'p')
    g.disc(7.4, 12.4, 0.6, 'k'); g.disc(9.6, 12.4, 0.6, 'k')
    # 嘴
    g.curve([(6.6, 14.4), (8.5, 15.2), (10.4, 14.4)], 'k', 0.55)
    return g


# ---------- 进阶 21x21 ----------
def p_ox():
    """丑牛：弯角 + 宽鼻 + 鼻环。"""
    n = 21; g = G(n); C = 10.5
    # 角
    g.curve([(5.4, 6.6), (3.0, 4.0), (3.4, 1.6)], 'd', 1.3)
    g.curve([(15.6, 6.6), (18.0, 4.0), (17.6, 1.6)], 'd', 1.3)
    # 耳朵
    g.ell(2.6, 8.4, 2.3, 1.2, 'm', rot=-0.45)
    g.ell(18.4, 8.4, 2.3, 1.2, 'm', rot=0.45)
    # 脸
    g.ell(C, 10.6, 5.5, 5.8, 'o')
    g.ell(C, 10.6, 5.5, 5.8, 'm', cond=lambda dx, dy: dx > 3.4)
    # 额前卷毛
    g.disc(C, 5.6, 1.7, 'm'); g.disc(C - 1.9, 6.2, 1.3, 'm'); g.disc(C + 1.9, 6.2, 1.3, 'm')
    eyes(g, 7.6, 13.4, 9.8, 1.25)
    # 大鼻
    g.ell(C, 14.8, 3.5, 2.5, 'w')
    g.ell(C, 14.8, 3.5, 2.5, 'e', cond=lambda dx, dy: dy > 1.3)
    g.disc(9.2, 14.6, 0.8, 'k'); g.disc(11.8, 14.6, 0.8, 'k')
    # 鼻环
    g.ring2(C, 17.4, 1.5, 1.05, 'd')
    return g


def p_horse():
    """午马：长脸 + 一侧鬃毛 + 白斑。"""
    n = 21; g = G(n); C = 10.5
    # 耳朵
    g.poly([(7.0, 4.6), (7.9, 0.8), (9.4, 4.8)], 'm')
    g.poly([(14.0, 4.6), (13.1, 0.8), (11.6, 4.8)], 'm')
    # 鬃毛：额前一撮 + 沿脸左侧垂落
    g.disc(C, 4.8, 1.4, 'k')
    g.curve([(8.6, 5.0), (5.4, 6.6), (5.0, 10.2), (6.0, 13.6), (7.6, 15.2)], 'k', 1.3)
    # 脸
    g.ell(C, 11.0, 4.2, 6.2, 'm')
    g.ell(C, 11.0, 4.2, 6.2, 'o', cond=lambda dx, dy: dx < -2.2)
    # 额前白斑
    g.ell(C, 8.6, 1.2, 2.8, 'w')
    eyes(g, 8.4, 12.6, 10.4, 1.15)
    # 鼻头
    g.ell(C, 16.0, 2.7, 2.1, 'o')
    g.ell(C, 16.0, 2.7, 2.1, 'm', cond=lambda dx, dy: dy > 0.9)
    g.disc(9.3, 16.1, 0.7, 'k'); g.disc(11.7, 16.1, 0.7, 'k')
    # 嘴
    g.curve([(8.6, 18.0), (10.5, 18.7), (12.4, 18.0)], 'k', 0.55)
    return g


def p_goat():
    """未羊：盘角 + 卷毛 + 山羊胡。

    卷毛靠「小圆盘凸出底圆轮廓」形成波浪剪影，底圆半径要小于凸盘外沿。
    """
    n = 21; g = G(n); C = 10.5
    # 盘角（加粗，贴头顶两侧外卷）
    g.curve([(7.4, 5.2), (4.2, 3.4), (2.8, 6.2), (4.6, 8.2)], 'd', 1.5)
    g.curve([(13.6, 5.2), (16.8, 3.4), (18.2, 6.2), (16.4, 8.2)], 'd', 1.5)
    # 耳朵（浅色带粉内耳）
    for sx, rot in ((4.2, 0.4), (16.8, -0.4)):
        g.ell(sx, 11.4, 2.2, 1.1, 'w', rot=rot)
        g.ell(sx, 11.4, 1.1, 0.5, 'l', rot=rot)
    # 卷毛剪影
    for i in range(9):
        a = math.pi * 0.9 + i * (2 * math.pi / 9)
        g.disc(C + math.cos(a) * 5.4, 9.6 + math.sin(a) * 5.2, 1.9, 'w')
    g.disc(C, 9.8, 5.6, 'w')
    # 脸
    g.ell(C, 13.8, 2.7, 3.3, 'w')
    g.ell(C, 13.8, 2.7, 3.3, 'e', cond=lambda dx, dy: dx > 1.9)
    eyes(g, 9.1, 11.9, 13.0, 0.9)
    g.disc(C, 14.4, 0.7, 'p')
    # 山羊胡
    g.poly([(9.5, 16.6), (11.5, 16.6), (10.5, 19.8)], 'w')
    return g


def p_dog():
    """戌狗：垂耳 + 黑鼻 + 项圈铜铃。"""
    n = 21; g = G(n); C = 10.5
    # 垂耳
    g.ell(3.8, 10.6, 1.9, 4.1, 'm', rot=0.12)
    g.ell(17.2, 10.6, 1.9, 4.1, 'm', rot=-0.12)
    # 脸
    g.disc(C, 9.8, 5.4, 'o')
    g.disc(C, 9.8, 5.4, 'm', cond=lambda dx, dy: dy < -3.2)
    # 额前毛
    g.disc(C, 5.0, 1.6, 'm'); g.disc(C - 1.8, 5.6, 1.2, 'm'); g.disc(C + 1.8, 5.6, 1.2, 'm')
    eyes(g, 8.0, 13.0, 9.6, 1.2)
    # 口鼻
    g.ell(C, 13.8, 3.3, 2.5, 'w')
    g.disc(C, 12.7, 1.3, 'k')
    g.line(C, 13.6, C, 14.6, 'k', 0.5)
    g.curve([(C, 14.6), (8.8, 15.5), (8.0, 14.5)], 'k', 0.5)
    g.curve([(C, 14.6), (12.2, 15.5), (13.0, 14.5)], 'k', 0.5)
    g.ell(C, 15.4, 0.9, 1.3, 'r')
    # 项圈与铜铃
    g.rect(5.6, 17.6, 9.8, 1.4, 'r')
    g.disc(C, 19.4, 1.35, 'y')
    g.line(C - 0.6, 19.4, C + 0.6, 19.4, 'd', 0.45)
    return g


# ---------- 精工 25x25 ----------
def p_tiger():
    """寅虎：额上「王」字 + 黑条纹。"""
    n = 25; g = G(n); C = 12.5
    # 耳朵
    for sx in (6.0, 19.0):
        g.disc(sx, 5.6, 2.7, 'o')
        g.disc(sx, 5.9, 1.2, 'm')
    # 脸
    g.disc(C, 13.0, 7.6, 'o')
    g.disc(C, 13.0, 7.6, 'm', cond=lambda dx, dy: dx > 5.2)
    # 侧脸条纹
    for y, x0, x1, w in ((12.6, 4.6, 7.0, 1.0), (15.0, 4.2, 6.4, 1.0),
                         (17.2, 6.0, 8.0, 0.9)):
        g.line(x0, y, x1, y + 1.0, 'k', w)
        g.line(25 - x0, y, 25 - x1, y + 1.0, 'k', w)
    # 额上「王」字（三横一竖，整行对齐防糊）
    for y in (7, 9, 11):
        g.rect(9.6, y, 5.8, 1.0, 'k')
    g.rect(12.1, 7, 0.85, 5.0, 'k')
    eyes(g, 9.4, 15.6, 14.2, 1.25)
    # 白口鼻
    g.ell(C, 18.6, 4.2, 2.6, 'w')
    g.ell(7.4, 18.6, 2.1, 1.8, 'w'); g.ell(17.6, 18.6, 2.1, 1.8, 'w')
    g.poly([(11.2, 17.0), (13.8, 17.0), (12.5, 18.3)], 'p')
    g.line(C, 18.4, C, 19.4, 'k', 0.55)
    g.curve([(C, 19.4), (10.4, 20.4), (9.4, 19.3)], 'k', 0.55)
    g.curve([(C, 19.4), (14.6, 20.4), (15.6, 19.3)], 'k', 0.55)
    # 胡须
    g.line(7.0, 18.6, 1.8, 17.4, 'k', 0.55)
    g.line(18.0, 18.6, 23.2, 17.4, 'k', 0.55)
    return g


def p_dragon():
    """辰龙：鹿角 + 赤鬃 + 长须。"""
    n = 25; g = G(n); C = 12.5
    # 鬃毛（朱砂尖刺）
    for i in range(7):
        a = math.pi * 1.05 + i * (math.pi * 0.9 / 6)
        px = C + math.cos(a) * 7.2; py = 12.0 + math.sin(a) * 6.6
        g.disc(px, py, 1.5, 'r')
    # 鹿角
    for s in (-1, 1):
        g.curve([(C + s * 5.0, 7.6), (C + s * 7.8, 4.2), (C + s * 6.4, 1.4)], 'd', 1.1)
        g.line(C + s * 7.2, 3.4, C + s * 9.4, 2.2, 'd', 0.75)
    # 脸
    g.ell(C, 12.6, 6.2, 5.6, 't')
    g.ell(C, 12.6, 6.2, 5.6, 'n', cond=lambda dx, dy: dx > 3.4)
    g.ell(C, 10.6, 5.0, 2.6, 'g')
    # 眼
    for s in (-1, 1):
        g.ell(C + s * 3.2, 11.8, 1.7, 1.4, 'w')
        g.disc(C + s * 3.2, 11.9, 0.85, 'k')
    # 鼻与嘴
    g.ell(C, 16.2, 3.0, 2.0, 'g')
    g.disc(11.0, 16.2, 0.65, 'k'); g.disc(14.0, 16.2, 0.65, 'k')
    g.line(9.4, 18.4, 15.6, 18.4, 'k', 0.6)
    g.poly([(10.2, 18.4), (11.2, 18.4), (10.7, 19.7)], 'w')
    g.poly([(13.8, 18.4), (14.8, 18.4), (14.3, 19.7)], 'w')
    # 长须
    g.curve([(9.0, 17.0), (5.4, 19.4), (2.4, 17.6)], 'y', 0.8)
    g.curve([(16.0, 17.0), (19.6, 19.4), (22.6, 17.6)], 'y', 0.8)
    # 鳞片点缀
    for px, py in ((9.0, 8.6), (16.0, 8.6), (12.5, 7.2)):
        g.diamond(px, py, 0.9, 'y')
    return g


def p_snake():
    """巳蛇：盘成螺旋 + 抬头吐信。

    圈与圈之间必须留出空隙（每圈半径差 >= 2.5），否则螺旋糊成一团。
    """
    n = 25; g = G(n); C = 12.5
    # 盘身（螺旋 2.6 圈，由外向内逐渐变细）
    steps = 720
    turns = 2.6
    pts = []
    for i in range(steps):
        t = i / (steps - 1.0)
        th = -math.pi / 2 + t * turns * 2 * math.pi
        r = 9.0 - t * 7.6
        pts.append((C + math.cos(th) * r, 14.8 + math.sin(th) * r, 0.95 - 0.42 * t))
    for x, y, w in pts:
        g.disc(x, y, w, 'g')
    # 背部斑纹（沿螺旋等弧长点一记松绿）
    for i in range(24, steps - 40, 21):
        x, y, w = pts[i]
        g.disc(x, y, 0.55, 'n')
    # 头（螺旋起点在正上方，头朝右）
    g.ell(12.0, 4.2, 3.2, 2.8, 'g')
    g.ell(15.0, 4.8, 2.2, 1.8, 'g')
    g.disc(10.6, 2.8, 1.05, 'y'); g.disc(10.6, 2.8, 0.55, 'k')
    g.disc(14.8, 3.4, 0.95, 'y'); g.disc(14.8, 3.4, 0.5, 'k')
    g.line(11.6, 6.2, 12.6, 6.2, 'k', 0.5)
    # 信子（分叉）
    g.curve([(17.0, 5.6), (19.6, 6.6), (22.2, 5.2)], 'r', 0.6)
    g.line(22.2, 5.2, 24.0, 3.6, 'r', 0.5)
    g.line(22.2, 5.2, 24.0, 6.8, 'r', 0.5)
    # 头顶鳞纹
    g.diamond(9.2, 3.0, 0.85, 'n')
    return g


def p_monkey():
    """申猴：大耳 + 粉脸 + 胸口绒毛。"""
    n = 25; g = G(n); C = 12.5
    # 大耳
    for sx in (4.0, 21.0):
        g.disc(sx, 11.6, 3.1, 'm')
        g.disc(sx, 11.6, 1.8, 'l')
    # 头
    g.disc(C, 11.8, 6.6, 'm')
    g.disc(C, 11.8, 6.6, 'o', cond=lambda dx, dy: dx < -4.2)
    # 额前绒毛
    for i in range(7):
        a = math.pi * 1.12 + i * (math.pi * 0.76 / 6)
        g.disc(C + math.cos(a) * 6.2, 11.0 + math.sin(a) * 6.0, 1.3, 'm')
    # 脸（浅色面罩）
    g.ell(C, 13.2, 4.6, 4.4, 'l')
    g.ell(C, 13.6, 3.4, 3.3, 'w')
    eyes(g, 10.4, 14.6, 11.8, 1.05)
    # 眉
    g.line(9.2, 10.2, 11.4, 9.6, 'm', 0.5)
    g.line(13.6, 9.6, 15.8, 10.2, 'm', 0.5)
    # 鼻孔与嘴
    g.disc(11.6, 14.8, 0.55, 'k'); g.disc(13.4, 14.8, 0.55, 'k')
    g.curve([(10.2, 16.0), (12.5, 16.8), (14.8, 16.0)], 'k', 0.6)
    # 胸口绒毛
    g.ell(C, 21.4, 5.2, 3.2, 'm')
    g.ell(C, 21.4, 3.0, 2.0, 'l')
    return g


ALL = [
    # key, name, difficulty(1-4), category, lore, fn
    ('rat', '子鼠', 1, '入门', '鼠为生肖之首，机敏善藏，仓廪常丰。', p_rat),
    ('ox', '丑牛', 2, '进阶', '牛耕春野，俯首甘为，一岁之首功。', p_ox),
    ('tiger', '寅虎', 3, '精工', '虎为百兽之王，额上天生一个「王」字。', p_tiger),
    ('rabbit', '卯兔', 1, '入门', '玉兔捣药于月宫，捣的是长生不老方。', p_rabbit),
    ('dragon', '辰龙', 3, '精工', '龙能大能小，能升能隐，春分而登天。', p_dragon),
    ('snake', '巳蛇', 3, '精工', '蛇称小龙，蜕皮重生，寓生生不息。', p_snake),
    ('horse', '午马', 2, '进阶', '马踏飞燕，一日千里，志在四方。', p_horse),
    ('goat', '未羊', 2, '进阶', '羊有跪乳之恩，古人以羊为祥兽。', p_goat),
    ('monkey', '申猴', 3, '精工', '猴灵而近人，蟠桃献寿，千岁为春。', p_monkey),
    ('rooster', '酉鸡', 1, '入门', '雄鸡一唱天下白，司晨守信不误时。', p_rooster),
    ('dog', '戌狗', 2, '进阶', '犬守夜而不倦，主家宅安宁。', p_dog),
    ('pig', '亥猪', 1, '入门', '豕肥年丰，福气满堂，一岁之末在亥。', p_pig),
]


def render_contact(path, items, cell=9, cols=4):
    rows = (len(items) + cols - 1) // cols
    pad = 12
    maxn = max(fn().n for _, _, _, _, _, fn in items)
    W = cols * (cell * maxn + pad) + pad
    H = rows * (cell * maxn + pad + 16) + pad
    img = Image.new('RGB', (W, H), (28, 24, 20))
    dr = ImageDraw.Draw(img)
    for i, (key, name, diff, cat, lore, fn) in enumerate(items):
        g = fn()
        n = g.n
        ox = pad + (i % cols) * (cell * maxn + pad)
        oy = pad + (i // cols) * (cell * maxn + pad + 16)
        sw = cell * n
        dr.rectangle([ox - 1, oy - 1, ox + sw + 1, oy + sw + 1], outline=(70, 60, 48))
        for y in range(n):
            for x in range(n):
                ch = g.d[y][x]
                if ch == '.': continue
                col = PAL[ch]
                rr = int(col[1:3], 16); gg = int(col[3:5], 16); bb = int(col[5:7], 16)
                dr.rectangle([ox + x * cell, oy + y * cell, ox + (x + 1) * cell - 1, oy + (y + 1) * cell - 1],
                             fill=(rr, gg, bb))
        dr.text((ox, oy + sw + 2), "%d.%s" % (i, name), fill=(220, 200, 155))
        dr.text((ox, oy + sw + 10), "*" * diff, fill=(212, 175, 55))
    img = img.resize((W * 2, H * 2), Image.NEAREST)
    img.save(path)
    print('saved', path, img.size)


if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(base, exist_ok=True)
    render_contact(os.path.join(base, 'preview.png'), ALL)
    out = []
    for key, name, diff, cat, lore, fn in ALL:
        g = fn()
        out.append({"id": key, "name": name, "diff": diff, "cat": cat, "lore": lore, "n": g.n, "grid": g.rows()})
    with open(os.path.join(base, 'patterns.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('patterns.json rows:', len(out))
