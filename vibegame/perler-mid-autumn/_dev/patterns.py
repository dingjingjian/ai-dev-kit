# -*- coding: utf-8 -*-
"""中秋拼豆坊 · 图案稿 v1：16 幅中秋主题图案 + 预览渲染。

运行：python _dev/patterns.py
产出：_dev/patterns.json（游戏数据）、_dev/preview.png（目视校验用预览图）
"""
import math, os, json
from PIL import Image, ImageDraw

# 中秋色卡（16 色）
# 硬约束：任意两色的 RGB 欧氏距离 >= 60（逐格填豆时靠颜色分辨，太近会认不出）。
# 明度分四档：w/l 高调；y/c/p/e/o/g/r 中调；t/d/b/v/n 中低；m/k 低调。
PAL = {
    'w': '#FBF6E9',  # 月白
    'e': '#9C9686',  # 银灰
    'k': '#1C1A1E',  # 墨黑
    'm': '#63351A',  # 栗棕
    'o': '#C8944E',  # 赭石
    'r': '#D13B2E',  # 朱砂
    'v': '#7A2450',  # 绛紫
    'p': '#D9627F',  # 胭脂
    'l': '#E7B7C6',  # 藕荷
    'y': '#FFD45E',  # 月黄
    'd': '#A87A1E',  # 描金
    'g': '#8AB84E',  # 豆绿
    'n': '#2E6B45',  # 松绿
    't': '#35AD9C',  # 青碧
    'b': '#2E4FA6',  # 夜蓝
    'c': '#8FB8DC',  # 天青
}


class G:
    """像素画板：以字符网格描述图案，'.' 表示空格。"""

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

    def ring2(self, cx, cy, r_out, r_in, c_out, c_in):
        """实心圆环：先填外圆 c_out，再用内圆覆盖 c_in。

        比 ring() 可靠两处：
        1) 外沿形状由 r_out 精确决定，圆才会圆；
        2) 环带不会在某些行整行消失——像素圆环在偏离圆心的行上横向投影会变宽，
           而两个实心圆相减在任何行都至少留下一格。
        半径差建议 >= 1.0，否则个别行仍可能无环带格子。
        """
        self.disc(cx, cy, r_out, c_out)
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

    def fill_bbox(self, x0, y0, x1, y1, c):
        for y in range(max(0, int(y0)), min(self.n, int(y1) + 1)):
            for x in range(max(0, int(x0)), min(self.n, int(x1) + 1)):
                self.d[y][x] = c

    def flood(self, sx, sy, c):
        if not self.inside(sx, sy):
            return
        old = self.d[sy][sx]
        if old == c:
            return
        stack = [(sx, sy)]
        while stack:
            x, y = stack.pop()
            if not self.inside(x, y) or self.d[y][x] != old:
                continue
            self.d[y][x] = c
            stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    def rows(self):
        return [''.join(r) for r in self.d]


# ---------- 通用零件 ----------
def flower4(g, cx, cy, col, r=0.8):
    """桂花：四瓣小花 + 描金花心。"""
    for dx, dy in ((0, -0.85), (0, 0.85), (-0.85, 0), (0.85, 0)):
        g.disc(cx + dx, cy + dy, r, col)
    g.disc(cx, cy, r * 0.62, 'd')


def cloud(g, cx, cy, w, c1, c2=None):
    """祥云：一排圆鼓 + 平底云脚。"""
    lobes = max(2, int(round(w / 2.2)))
    for i in range(lobes):
        t = i / (lobes - 1.0) if lobes > 1 else 0.5
        x = cx - w / 2.0 + t * w
        r = 0.95 + 0.95 * math.sin(math.pi * t)
        g.disc(x, cy, r, c1)
    g.rect(cx - w / 2.0, cy, w, 1.2, c1)
    if c2:
        g.rect(cx - w / 2.0 + 0.9, cy + 0.35, w - 1.8, 0.7, c2)


# ---------- 入门 13x13 ----------
def p_moon():
    """明月：满月 + 环形山 + 描金月晕。
    外沿取 r=6.5（= 半宽），保证 13x13 上是满圆而非被削平的多边形。
    """
    n = 13; g = G(n); C = 6.5
    g.ring2(C, C, 6.5, 5.75, 'd', 'y')       # 月晕外圈 + 月面
    g.disc(C - 1.8, C - 2.0, 2.2, 'w')       # 左上高光
    g.disc(8.6, 8.7, 1.15, 'e')              # 环形山
    g.disc(9.4, 5.6, 0.72, 'e')
    g.disc(5.4, 9.9, 0.6, 'e')
    return g


def p_mooncake():
    """月饼：16 瓣花边 + 描金双圈 + 中心桂花。
    花边凸起画在最外层（会被内侧两圆覆盖内侧部分），外沿自然贴合满圆。
    """
    n = 13; g = G(n); C = 6.5
    for k in range(16):
        a = k * math.pi / 8
        g.disc(C + 5.6 * math.cos(a), C + 5.6 * math.sin(a), 1.1, 'o')  # 花边
    # 只分「花边 / 描金圈 / 饼面」三层：13x13 上分区再多就会碎成 o-d 交替的杂点
    g.ring2(C, C, 5.6, 4.6, 'd', 'o')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        g.disc(C + 3.4 * math.cos(a), C + 3.4 * math.sin(a), 0.58, 'y')
    for dx, dy in ((0, -1.35), (0, 1.35), (-1.35, 0), (1.35, 0)):
        g.disc(C + dx, C + dy, 0.95, 'w')
    g.disc(C, C, 0.9, 'y')
    return g


def p_rabbit():
    """玉兔：长耳白兔。"""
    n = 13; g = G(n)
    g.ell(4.7, 4.0, 1.0, 2.9, 'w', rot=0.12)
    g.ell(8.3, 4.0, 1.0, 2.9, 'w', rot=-0.12)
    g.ell(4.7, 4.3, 0.48, 2.1, 'l', rot=0.12)
    g.ell(8.3, 4.3, 0.48, 2.1, 'l', rot=-0.12)
    g.disc(6.5, 9.3, 3.0, 'w')
    g.ring(6.5, 9.3, 3.0, 0.5, 'e')
    g.disc(5.1, 8.8, 0.55, 'k'); g.disc(7.9, 8.8, 0.55, 'k')
    g.disc(4.1, 9.9, 0.6, 'l'); g.disc(8.9, 9.9, 0.6, 'l')
    g.disc(6.5, 9.9, 0.48, 'p')
    return g


def p_osmanthus():
    """桂花：折枝桂花，四瓣小花缀于叶间。"""
    n = 13; g = G(n)
    g.curve([(0.6, 11.9), (4.0, 9.8), (7.5, 7.2), (11.8, 3.0)], 'm', 0.85)
    g.ell(4.3, 8.6, 1.5, 0.7, 'n', rot=-0.6)
    g.ell(6.4, 10.4, 1.5, 0.7, 'n', rot=0.55)
    g.ell(9.9, 4.2, 1.5, 0.7, 'n', rot=-0.7)
    g.ell(10.6, 7.4, 1.4, 0.65, 'n', rot=0.45)
    for (x, y) in [(3.0, 6.4), (6.2, 5.0), (9.0, 2.4), (8.6, 9.4), (11.4, 5.6)]:
        flower4(g, x, y, 'y', 0.72)
    return g


# ---------- 进阶 17x17 ----------
def p_lantern():
    """花灯：朱红灯笼 + 描金骨架 + 藤黄流苏。"""
    n = 17; g = G(n); C = 8.5
    g.line(C, 0.3, C, 2.1, 'k', 0.8)
    g.rect(6.2, 1.9, 4.6, 1.1, 'd')
    g.ell(C, 7.8, 4.3, 4.4, 'r')
    for dx in (-2.2, 0, 2.2):
        g.line(C + dx, 3.4, C + dx, 12.2, 'd', 0.55)
    g.rect(4.6, 3.0, 7.8, 1.0, 'y')
    g.rect(4.6, 12.2, 7.8, 1.0, 'y')
    g.rect(6.2, 13.2, 4.6, 1.1, 'd')
    for dx in (-0.9, 0, 0.9):
        g.line(C + dx, 14.3, C + dx, 16.6, 'y', 0.5)
    g.line(C, 14.3, C, 16.6, 'y', 0.9)
    flower4(g, C, 7.8, 'w', 0.95)
    return g


def p_osm_tree():
    """桂树：月下桂树，满树金粟。"""
    n = 17; g = G(n)
    g.ring2(13.5, 3.5, 2.8, 1.8, 'd', 'y')
    g.disc(12.8, 2.8, 0.7, 'w')
    g.rect(7.7, 9.0, 1.8, 6.0, 'm')
    g.line(8.6, 10.6, 6.0, 8.0, 'm', 0.9)
    g.line(8.6, 10.6, 11.2, 8.0, 'm', 0.9)
    for (x, y, r) in [(8.6, 6.2, 3.4), (5.6, 7.4, 2.5), (11.6, 7.4, 2.5),
                      (8.6, 3.4, 2.6), (6.8, 4.6, 2.0), (10.4, 4.6, 2.0)]:
        g.disc(x, y, r, 'n')
    for (x, y, r) in [(7.2, 4.8, 1.5), (4.9, 6.4, 1.2), (10.2, 2.9, 1.2)]:
        g.disc(x, y, r, 'g')
    for (x, y) in [(6.2, 9.0), (10.8, 9.2), (8.4, 7.9), (5.4, 4.6),
                   (11.6, 5.4), (7.6, 2.6), (9.8, 6.6)]:
        g.disc(x, y, 0.55, 'y')
    g.rect(0, 15.2, 17, 1.8, 'n')
    return g


def p_pestle():
    """玉兔捣药：白兔持杵，石臼盛药。"""
    n = 17; g = G(n)
    g.rect(0, 14.6, 17, 2.4, 'n')
    g.ell(5.6, 11.2, 3.0, 3.2, 'w')
    g.disc(5.4, 7.2, 2.3, 'w')
    g.ell(4.2, 4.4, 0.75, 2.0, 'w', rot=0.25)
    g.ell(6.6, 4.4, 0.75, 2.0, 'w', rot=-0.2)
    g.ell(4.2, 4.6, 0.34, 1.3, 'l', rot=0.25)
    g.ell(6.6, 4.6, 0.34, 1.3, 'l', rot=-0.2)
    g.disc(4.6, 7.0, 0.45, 'k'); g.disc(6.4, 7.0, 0.45, 'k')
    g.disc(5.4, 7.9, 0.4, 'p')
    g.ell(7.6, 8.6, 1.5, 0.8, 'w', rot=-0.7)
    g.line(9.6, 3.6, 11.6, 10.6, 'm', 1.0)
    g.line(9.4, 3.0, 9.9, 4.2, 'd', 1.3)
    g.ell(12.2, 12.4, 2.4, 1.1, 'e')
    g.rect(10.0, 12.4, 4.4, 2.4, 'e')
    g.ell(12.2, 12.4, 1.7, 0.6, 'k')
    return g


def p_cloud_moon():
    """彩云追月：满月穿行于祥云之间。"""
    n = 17; g = G(n)
    g.ring2(6.5, 5.5, 4.2, 3.2, 'd', 'y')
    g.disc(5.5, 4.5, 1.5, 'w')
    g.disc(8.2, 7.0, 0.7, 'e')
    g.disc(4.8, 7.0, 0.6, 'e')
    cloud(g, 9.0, 10.2, 11.0, 'c', 'e')
    cloud(g, 6.0, 13.4, 9.0, 'c', 'e')
    return g


def p_pomelo():
    """柚子：中秋供果，黄皮带叶。
    圆心取 y=9.5（格线交点），使 dx/dy 同时落在整数上，上下左右才会对称。
    """
    n = 17; g = G(n); C = 8.5
    g.ring2(C, 9.5, 7.6, 6.6, 'd', 'y')      # 果皮暗边 + 果肉
    g.ell(6.0, 6.2, 2.0, 1.3, 'w', rot=-0.5)  # 高光
    for (x, y, r) in [(11.5, 12.0, 0.7), (6.0, 12.5, 0.6), (10.5, 6.0, 0.6), (5.5, 10.0, 0.5)]:
        g.disc(x, y, r, 'd')                 # 油胞点：用描金而非赭石，与月黄拉得开
    g.line(C, 0.5, C, 3.0, 'm', 1.0)         # 果梗
    g.ell(6.0, 1.2, 2.2, 0.8, 'n', rot=-0.35)
    g.ell(11.0, 1.2, 2.2, 0.8, 'n', rot=0.35)
    return g


def p_cake_cut():
    """莲蓉蛋黄：切开的月饼断面，饼皮 / 莲蓉 / 蛋黄三层同心圆。"""
    n = 17; g = G(n); C = 8.5
    g.ring2(C, C, 8.2, 7.2, 'o', 'm')        # 饼皮 + 莲蓉馅
    for k in range(6):
        a = k * math.pi / 3 + 0.5
        g.disc(C + 4.7 * math.cos(a), C + 4.7 * math.sin(a), 0.55, 'w')   # 果仁
    g.ring2(C, C, 3.6, 2.8, 'd', 'y')        # 蛋黄金边 + 蛋黄
    g.disc(C - 0.9, C - 0.9, 0.9, 'w')       # 蛋黄高光
    return g


# ---------- 精工 21x21 ----------
def p_change():
    """嫦娥奔月：广袖飘带，飞向明月。"""
    n = 21; g = G(n)
    g.ring2(15.5, 5.5, 4.4, 3.4, 'd', 'y')
    g.disc(14.4, 4.2, 1.1, 'w')
    g.curve([(9.2, 10.0), (13.0, 11.8), (17.2, 9.6), (19.6, 12.0)], 't', 0.85)
    g.curve([(9.4, 13.2), (13.6, 15.0), (17.6, 13.2), (20.0, 15.4)], 'p', 0.75)
    g.poly([(8.0, 11.0), (12.6, 19.4), (5.4, 19.4)], 'w')
    g.poly([(8.6, 12.6), (11.8, 19.4), (6.6, 19.4)], 'e')
    g.curve([(7.2, 6.8), (8.0, 9.6), (8.6, 12.4)], 'w', 2.2)
    g.curve([(7.2, 11.3), (9.4, 10.9)], 'p', 0.8)
    g.curve([(7.2, 8.0), (5.2, 6.4), (3.4, 4.8)], 'w', 1.0)
    g.curve([(8.2, 8.2), (10.2, 7.0), (11.8, 5.8)], 'w', 1.0)
    g.disc(7.0, 5.2, 1.5, 'w')
    g.disc(7.0, 4.4, 1.5, 'k')
    g.disc(8.6, 4.0, 0.9, 'k')
    g.line(5.9, 3.4, 8.0, 3.0, 'd', 0.5)
    cloud(g, 10.0, 18.0, 13.0, 'c', 'e')
    return g


def p_palace():
    """广寒宫：月宫楼阁，桂树玉兔相伴。"""
    n = 21; g = G(n)
    g.fill_bbox(0, 0, 20, 16, 'b')
    for (x, y) in [(2.5, 2.5), (5.5, 1.5), (18.5, 2.0), (16.0, 5.5),
                   (1.5, 7.0), (19.5, 9.0), (3.5, 11.0)]:
        g.disc(x, y, 0.45, 'w')
    g.ring2(10.5, 3.5, 3.4, 2.4, 'd', 'y')
    g.disc(9.6, 2.7, 0.85, 'w')
    g.rect(2.7, 12.4, 0.9, 4.4, 'm')
    g.disc(3.1, 10.6, 2.5, 'n'); g.disc(1.6, 12.0, 1.7, 'n'); g.disc(4.6, 12.0, 1.7, 'n')
    for (x, y) in [(2.4, 9.2), (4.0, 10.4), (1.4, 11.0)]:
        g.disc(x, y, 0.5, 'y')
    g.poly([(10.5, 7.2), (15.8, 10.6), (5.2, 10.6)], 'r')
    g.rect(4.6, 10.6, 11.8, 0.9, 'd')
    g.rect(7.0, 11.5, 7.0, 6.0, 'm')
    g.line(7.2, 11.5, 7.2, 17.5, 'd', 0.6)
    g.line(13.8, 11.5, 13.8, 17.5, 'd', 0.6)
    g.rect(9.3, 13.6, 2.6, 3.9, 'k')
    g.rect(6.0, 17.0, 9.0, 1.5, 'e')
    g.ell(17.6, 16.2, 1.5, 1.1, 'w')
    g.ell(16.9, 14.8, 0.5, 1.1, 'w')
    g.disc(17.9, 16.0, 0.35, 'k')
    g.rect(0, 18, 21, 3, 'n')
    return g


def p_reunion():
    """团圆宴：一桌月饼清茶，俯视团圆。"""
    n = 21; g = G(n); C = 10.5
    g.disc(C, C, 9.7, 'm')
    g.ring(C, C, 9.7, 0.8, 'd')
    g.ring(C, C, 6.6, 0.5, 'o')
    for (px, py) in [(5.9, 5.9), (15.1, 5.9), (5.9, 15.1), (15.1, 15.1)]:
        g.disc(px, py, 2.8, 'w')
        g.ring(px, py, 2.8, 0.45, 'c')
        g.disc(px, py, 1.8, 'o')
        g.ring(px, py, 1.8, 0.4, 'd')
        g.disc(px, py, 0.6, 'y')
    g.ell(C, 10.6, 2.7, 2.3, 'w')
    g.line(C + 2.4, 10.0, C + 4.0, 9.2, 'w', 0.8)
    g.line(C - 2.0, 9.6, C - 2.8, 11.4, 'w', 0.7)
    g.disc(C, 9.0, 0.9, 'd')
    g.disc(C, 10.6, 0.9, 't')
    for (cx, cy) in [(10.5, 4.4), (10.5, 16.6)]:
        g.disc(cx, cy, 1.3, 'w'); g.disc(cx, cy, 0.8, 't')
    return g


def p_pools():
    """三潭印月：三塔立水，月影沉璧。"""
    n = 21; g = G(n)
    g.fill_bbox(0, 0, 20, 8, 'b')
    g.ring2(3.5, 3.5, 3.2, 2.2, 'd', 'y')
    g.disc(2.8, 2.6, 0.9, 'w')
    for (x, y) in [(11.5, 1.6), (16.5, 2.6), (9.0, 6.0), (19.0, 6.5), (13.5, 6.8)]:
        g.disc(x, y, 0.45, 'w')
    g.fill_bbox(0, 9, 20, 20, 't')
    for yy in (11.0, 14.0, 17.5):
        for xx in (7.0, 11.0, 15.5, 19.0):
            g.line(xx, yy, xx + 2.2, yy, 'w', 0.5)
    for yy in (10.2, 12.2, 14.2, 16.2, 18.2):
        g.line(2.7, yy, 4.5, yy, 'y', 0.7)
    for bx in (8.0, 13.0, 18.0):
        g.ell(bx, 13.2, 1.5, 0.6, 'e')
        g.rect(bx - 1.1, 12.6, 2.2, 1.2, 'e')
        g.disc(bx, 11.4, 1.2, 'e')
        g.rect(bx - 1.3, 10.2, 2.6, 0.6, 'e')
        g.disc(bx, 9.6, 0.6, 'd')
    return g


# ---------- 传世 25x25 ----------
def p_moon_palace():
    """月宫全景：月中广寒宫、桂树与玉兔。"""
    n = 25; g = G(n); C = 12.5
    g.ring2(C, C, 12.2, 11.2, 'd', 'y')
    # 环形山用银灰而非赭石：月面阴影本就该偏冷，同时少用一个与月黄打架的暖色
    g.disc(7.0, 6.0, 1.6, 'e'); g.disc(18.5, 7.6, 1.2, 'e'); g.disc(6.5, 18.0, 1.1, 'e')
    g.rect(6.2, 14.0, 1.0, 4.0, 'm')
    g.disc(6.7, 12.2, 2.8, 'n'); g.disc(4.4, 13.6, 1.9, 'n'); g.disc(9.0, 13.6, 1.9, 'n')
    for (x, y) in [(5.4, 10.6), (8.2, 11.8), (3.8, 12.4), (9.6, 12.0)]:
        g.disc(x, y, 0.5, 'y')
    g.poly([(12.5, 6.0), (17.4, 9.4), (7.6, 9.4)], 'r')
    g.rect(6.8, 9.4, 11.4, 1.0, 'd')
    g.rect(9.4, 10.4, 6.2, 4.6, 'm')
    g.line(9.6, 10.4, 9.6, 15.0, 'd', 0.6)
    g.line(15.4, 10.4, 15.4, 15.0, 'd', 0.6)
    g.rect(11.5, 12.0, 2.0, 3.0, 'k')
    g.rect(8.4, 15.0, 8.2, 1.2, 'e')
    g.ell(18.2, 16.4, 1.7, 1.2, 'w')
    g.ell(17.4, 14.8, 0.55, 1.2, 'w')
    g.ell(19.2, 14.9, 0.55, 1.1, 'w')
    g.disc(18.6, 16.2, 0.35, 'k')
    # 月盘放大后云要下移收紧，否则会吃掉整个月亮底部
    cloud(g, 4.0, 24.0, 7.0, 'c', 'e')
    cloud(g, 20.0, 24.2, 7.0, 'c', 'e')
    # 星：必须落在月盘之外（距圆心 > 12.2），否则会变成月亮上的白点
    for (x, y) in [(1.2, 1.2), (4.5, 2.2), (21.5, 3.5), (23.5, 6.5),
                   (0.6, 6.0), (24.0, 8.0), (1.0, 17.0), (24.0, 18.0)]:
        g.disc(x, y, 0.5, 'w')
    return g


def p_miles():
    """千里共婵娟：明月、远山、扁舟与秋水。"""
    n = 25; g = G(n)
    g.ring2(18.0, 6.0, 6.2, 5.4, 'd', 'y')
    g.disc(16.4, 4.4, 2.0, 'w')
    for (x, y) in [(2.0, 2.0), (5.5, 4.5), (8.5, 1.5), (1.5, 7.0), (11.0, 3.0)]:
        g.disc(x, y, 0.5, 'w')
    cloud(g, 9.0, 11.0, 17.0, 'c', 'e')
    g.poly([(0.0, 20.0), (5.0, 13.0), (10.0, 20.0)], 'n')
    g.poly([(7.0, 20.0), (13.0, 12.0), (19.0, 20.0)], 'b')
    g.poly([(15.0, 20.0), (20.5, 14.5), (25.0, 20.0)], 'n')
    g.fill_bbox(0, 20, 24, 24, 'c')
    for yy in (21.0, 23.0):
        for xx in (3.0, 15.0, 19.5):
            g.line(xx, yy, xx + 2.4, yy, 'w', 0.45)
    g.poly([(6.0, 22.4), (7.0, 23.6), (12.0, 23.6), (13.0, 22.4)], 'm')
    g.line(10.0, 22.4, 10.0, 20.6, 'k', 0.5)
    g.disc(9.4, 20.3, 0.7, 'k'); g.disc(10.7, 20.5, 0.7, 'k')
    for xx in (1.5, 2.6, 22.5, 23.4):
        g.line(xx, 23.6, xx + 0.4, 19.6, 'n', 0.5)
    return g


ALL = [
    # key, name, 难度(1-4), 分类, 典故, fn
    ('moon', '明月', 1, '赏月', '今夜月明人尽望，不知秋思落谁家。', p_moon),
    ('mooncake', '月饼', 1, '赏月', '小饼如嚼月，中有酥与饴。', p_mooncake),
    ('rabbit', '玉兔', 1, '玉兔', '白兔捣药秋复春，嫦娥孤栖与谁邻。', p_rabbit),
    ('osmanthus', '桂花', 1, '玉兔', '桂子月中落，天香云外飘。', p_osmanthus),
    ('lantern', '花灯', 2, '灯谜', '一夜鱼龙舞，灯明照岁寒。', p_lantern),
    ('osm_tree', '桂树', 2, '赏月', '吴刚捧出桂花酒，寂寞嫦娥舒广袖。', p_osm_tree),
    ('pestle', '玉兔捣药', 2, '玉兔', '玉兔捣药，服之可以长生。', p_pestle),
    ('cloud_moon', '彩云追月', 2, '赏月', '彩云追月，月华如练。', p_cloud_moon),
    ('pomelo', '柚子', 2, '团圆', '柚子谐音「佑子」，中秋供之求平安。', p_pomelo),
    ('cake_cut', '莲蓉蛋黄', 2, '团圆', '一枚月饼切开，金黄蛋黄如满月。', p_cake_cut),
    ('change', '嫦娥奔月', 3, '玉兔', '嫦娥应悔偷灵药，碧海青天夜夜心。', p_change),
    ('palace', '广寒宫', 3, '赏月', '琼楼玉宇高处，不胜清寒。', p_palace),
    ('reunion', '团圆宴', 3, '团圆', '月圆人圆事事圆，一桌清欢话团圆。', p_reunion),
    ('pools', '三潭印月', 3, '赏月', '三潭印月，一湖金波共婵娟。', p_pools),
    ('moon_palace', '月宫全景', 4, '玉兔', '广寒宫里，桂树玉兔伴嫦娥。', p_moon_palace),
    ('miles', '千里共婵娟', 4, '团圆', '但愿人长久，千里共婵娟。', p_miles),
]


def render_contact(path, items, cell=9, cols=4):
    rows = (len(items) + cols - 1) // cols
    pad = 12
    maxn = max(fn().n for _, _, _, _, _, fn in items)
    W = cols * (cell * maxn + pad) + pad
    H = rows * (cell * maxn + pad + 18) + pad
    img = Image.new('RGB', (W, H), (16, 20, 38))
    dr = ImageDraw.Draw(img)
    for i, (key, name, diff, cat, lore, fn) in enumerate(items):
        g = fn()
        n = g.n
        ox = pad + (i % cols) * (cell * maxn + pad)
        oy = pad + (i // cols) * (cell * maxn + pad + 18)
        sw = cell * n
        dr.rectangle([ox - 1, oy - 1, ox + sw + 1, oy + sw + 1], outline=(90, 110, 160))
        for y in range(n):
            for x in range(n):
                ch = g.d[y][x]
                if ch == '.':
                    continue
                col = PAL[ch]
                rr = int(col[1:3], 16); gg = int(col[3:5], 16); bb = int(col[5:7], 16)
                dr.rectangle([ox + x * cell, oy + y * cell,
                              ox + (x + 1) * cell - 1, oy + (y + 1) * cell - 1],
                             fill=(rr, gg, bb))
        dr.text((ox, oy + sw + 2), "%d.%s" % (i + 1, name), fill=(230, 214, 165))
        dr.text((ox, oy + sw + 11), "★" * diff, fill=(240, 194, 75))
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
        out.append({"id": key, "name": name, "diff": diff, "cat": cat,
                    "lore": lore, "n": g.n, "grid": g.rows()})
    with open(os.path.join(base, 'patterns.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    for o in out:
        beads = sum(1 for r in o['grid'] for ch in r if ch != '.')
        cols = len({ch for r in o['grid'] for ch in r if ch != '.'})
        print('%-12s %2dx%-2d  %3d 豆  %d 色' % (o['name'], o['n'], o['n'], beads, cols))
    print('patterns.json rows:', len(out))
