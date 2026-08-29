# -*- coding: utf-8 -*-
"""拼豆图案稿件：像素级绘制 + 预览渲染。产出 patterns.json 供游戏使用。"""
import math, os, json
from PIL import Image, ImageDraw

PAL = {
    'w': '#F3EDE0',  # 月白
    'e': '#BDB6A8',  # 银灰
    'k': '#221E1B',  # 墨黑
    'm': '#7A4A2E',  # 栗棕
    'o': '#B0763C',  # 赭石
    'r': '#C8382F',  # 朱砂
    'v': '#7E2B3A',  # 绛紫
    'p': '#C95F7C',  # 胭脂
    'l': '#DCACBB',  # 藕荷
    'y': '#E9B23C',  # 藤黄
    'd': '#C9A34B',  # 描金
    'g': '#86A95C',  # 豆绿
    'n': '#3D6B4E',  # 松绿
    't': '#3FA79B',  # 青碧
    'b': '#2F5D8C',  # 青花
    'c': '#86AECB',  # 天青
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
        if 0 <= x < self.n and 0 <= y < self.n:
            return self.d[y][x]
        return '.'

    def each(self, fn):
        for y in range(self.n):
            for x in range(self.n):
                fn(x + 0.5 - self.n / 2.0, y + 0.5 - self.n / 2.0, x, y)

    def disc(self, cx, cy, r, c, cond=None):
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                if dx * dx + dy * dy <= r * r:
                    if not cond or cond(dx, dy):
                        self.d[y][x] = c

    def ring(self, cx, cy, r, w, c, cond=None):
        ro, ri = r + w / 2.0, r - w / 2.0
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                dd = math.hypot(dx, dy)
                if ri <= dd <= ro and (not cond or cond(dx, dy)):
                    self.d[y][x] = c

    def rect(self, x, y, w, h, c):
        for j in range(int(math.floor(y + 1e-4)), int(math.ceil(y + h - 1e-4))):
            for i in range(int(math.floor(x + 1e-4)), int(math.ceil(x + w - 1e-4))):
                self.set(i, j, c)

    def ell(self, cx, cy, rx, ry, c, rot=0.0, cond=None):
        ca, sa = math.cos(-rot), math.sin(-rot)
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                u = (dx * ca - dy * sa) / rx
                v = (dx * sa + dy * ca) / ry
                if u * u + v * v <= 1.0 and (not cond or cond(dx, dy)):
                    self.d[y][x] = c

    def ellring(self, cx, cy, rx, ry, w, c, rot=0.0):
        ca, sa = math.cos(-rot), math.sin(-rot)
        for y in range(self.n):
            for x in range(self.n):
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                u = (dx * ca - dy * sa) / rx
                v = (dx * sa + dy * ca) / ry
                m = math.hypot(u, v)
                if abs(m - 1.0) * min(rx, ry) <= w / 2.0:
                    self.d[y][x] = c

    def line(self, x0, y0, x1, y1, c, w=1.0):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 4) + 2
        hw = w / 2.0
        rad = int(math.ceil(hw))
        for i in range(steps + 1):
            t = i / steps
            px = x0 + (x1 - x0) * t; py = y0 + (y1 - y0) * t
            xi = int(math.floor(px)); yi = int(math.floor(py))
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    if math.hypot(xi + dx + 0.5 - px, yi + dy + 0.5 - py) <= hw + 0.3:
                        self.set(xi + dx, yi + dy, c)

    def curve(self, pts, c, w=1.0, seg=40):
        """Catmull-Rom 平滑曲线"""
        p = [pts[0]] + list(pts) + [pts[-1]]
        out = []
        for i in range(len(p) - 3):
            for t in [j / float(seg) for j in range(seg)]:
                p0, p1, p2, p3 = p[i], p[i + 1], p[i + 2], p[i + 3]
                t2, t3 = t * t, t * t * t
                x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
                y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
                out.append((x, y))
        out.append(pts[-1])
        for i in range(len(out) - 1):
            self.line(out[i][0], out[i][1], out[i + 1][0], out[i + 1][1], c, w)

    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
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

    def rows(self):
        return [''.join(r) for r in self.d]


def rad_sym(g, cx, cy, fn, k):
    """k 重旋转对称绘制：fn(dx,dy) -> char or None"""
    for y in range(g.n):
        for x in range(g.n):
            dx = x + 0.5 - cx; dy = y + 0.5 - cy
            for i in range(k):
                a = -i * 2 * math.pi / k
                u = dx * math.cos(a) - dy * math.sin(a)
                v = dx * math.sin(a) + dy * math.cos(a)
                c = fn(u, v)
                if c:
                    g.d[y][x] = c
                    break


# ============================================================
# 图案定义
# ============================================================

def p_taiji():
    n = 13
    g = G(n)
    C = n / 2.0; R = 5.9
    g.disc(C, C, R, 'w')
    g.disc(C, C, R, 'e', cond=lambda dx, dy: math.hypot(dx, dy) > R - 0.7)
    for y in range(n):
        for x in range(n):
            dx = x + 0.5 - C; dy = y + 0.5 - C
            if math.hypot(dx, dy) > R - 0.7:
                continue
            if dy < 0:
                xs = -math.sqrt(max(0.0, (R / 2) ** 2 - (dy + R / 2) ** 2))
            else:
                xs = math.sqrt(max(0.0, (R / 2) ** 2 - (dy - R / 2) ** 2))
            if dx < xs:
                g.d[y][x] = 'k'
    g.disc(C, C + R / 2, 1.15, 'w')
    g.disc(C, C - R / 2, 1.15, 'k')
    return g


def p_coin():
    n = 13
    g = G(n)
    C = n / 2.0
    g.disc(C, C, 6.1, 'd')
    g.disc(C, C, 6.1, 'y', cond=lambda dx, dy: math.hypot(dx, dy) > 4.7 and (dx + dy) < -2.0)
    g.disc(C, C, 6.1, 'o', cond=lambda dx, dy: math.hypot(dx, dy) > 4.7 and (dx + dy) > 2.0)
    g.disc(C, C, 6.1, 'k', cond=lambda dx, dy: math.hypot(dx, dy) > 5.75)
    g.rect(4, 4, 5, 5, 'o')
    g.rect(5, 5, 3, 3, '.')
    return g


def p_plum():
    n = 13
    g = G(n)
    C = n / 2.0
    # 枝干
    g.curve([(-0.5, 12.5), (2.5, 10.5), (4.0, 8.0), (5.2, 6.2)], 'm', 1.5)
    g.curve([(5.2, 6.2), (7.5, 5.0), (9.5, 5.6)], 'm', 1.1)
    g.curve([(4.0, 8.0), (5.5, 9.8), (6.5, 11.2)], 'm', 1.0)
    # 五瓣
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        px = C + math.cos(a) * 2.9
        py = C + math.sin(a) * 2.9
        g.disc(px, py, 2.05, 'p')
        g.disc(px, py, 2.05, 'l', cond=lambda dx, dy, i=i: (dx * math.cos(-a) - dy * math.sin(-a)) < -0.35)
        g.disc(px, py, 2.05, 'v', cond=lambda dx, dy: (dx * math.cos(-a) - dy * math.sin(-a)) > 0.75)
    # 花心
    g.disc(C, C, 1.35, 'y')
    g.set(C - 0.5, C - 0.5, 'k')
    g.set(C + 0.5, C - 0.5, 'k')
    g.set(C, C + 0.5, 'k')
    # 花蕊
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5 + 0.6
        g.line(C, C, C + math.cos(a) * 2.2, C + math.sin(a) * 2.2, 'y', 0.8)
    return g


def p_peach():
    n = 13
    g = G(n)
    # 桃身：上尖下宽
    for y in range(2, 13):
        t = (y - 2) / 10.0
        hw = 1.0 + 4.4 * math.sin(t * math.pi * 0.82) ** 0.8
        for x in range(n):
            dx = x + 0.5 - 6.5
            if abs(dx) <= hw + (0.9 if y >= 11 else 0):
                g.d[y][x] = 'l'
    # 尖顶
    g.set(6, 1, 'l'); g.set(7, 1, 'l')
    # 中缝
    for y in range(3, 12):
        g.set(6, y, 'p')
    # 腮红
    g.disc(4.2, 8.4, 1.9, 'p')
    g.disc(9.0, 8.0, 1.5, 'p')
    g.disc(5.0, 5.5, 1.1, 'w')
    # 叶
    g.ell(10.6, 3.2, 2.9, 1.15, 'n', rot=-0.62)
    g.line(8.4, 3.6, 12.6, 2.4, 'g', 0.7)
    # 蒂
    g.line(6.8, 2.0, 7.6, 0.6, 'm', 1.1)
    return g


def p_lantern():
    n = 17
    g = G(n)
    C = 8.5
    # 提绳
    g.line(8.5, 0.2, 8.5, 2.2, 'k', 0.9)
    # 上下盖
    g.rect(5, 2, 7, 1.4, 'd')
    g.rect(5, 14.2, 7, 1.4, 'd')
    g.rect(5, 2, 7, 1.4, 'y', )
    g.rect(7, 15.4, 3, 0.9, 'd')
    # 灯身
    cy, rx, ry = 8.6, 6.0, 5.0
    g.ell(C, cy, rx, ry, 'r')
    g.ell(C, cy, rx, ry, 'v', cond=lambda dx, dy: dx / rx + dy / ry > 1.05)
    g.ell(C, cy, rx, ry, 'y', cond=lambda dx, dy: dx / rx + dy / ry < -1.05)
    # 竖骨
    for f in (-0.78, -0.42, 0.0, 0.42, 0.78):
        pts = []
        for k in range(11):
            yy = cy - ry + 0.4 + (2 * ry - 0.8) * k / 10.0
            t = (yy - cy) / ry
            w = rx * math.sqrt(max(0.0, 1 - t * t))
            pts.append((C + w * f, yy))
        g.curve(pts, 'v', 0.85)
    # 顶底金箍
    for x in range(n):
        for y in range(n):
            dx = x + 0.5 - C; dy = y + 0.5 - cy
            m = (dx / rx) ** 2 + (dy / ry) ** 2
            if m <= 1.0 and (abs(dy) > ry - 1.0):
                g.d[y][x] = 'd'
    # 中心菱形福位
    g.diamond(C, cy, 1.7, 'y')
    g.set(C, cy, 'k')
    # 流苏
    for i, dx in enumerate([-1.0, 0.0, 1.0]):
        g.line(C + dx * 0.9, 16.0, C + dx * 1.6, 16.9, 'y', 0.9)
    return g


def p_bamboo():
    n = 17
    g = G(n)
    # 主竿
    for y in range(1, 17):
        w = 1.55 - 0.035 * (y - 1)
        for x in range(n):
            cx = 6.2 - 0.028 * (y - 1) ** 1.35
            if abs(x + 0.5 - cx) <= w / 2.0 + 0.25:
                g.d[y][x] = 'n'
    # 高光
    for y in range(1, 17):
        cx = 6.2 - 0.028 * (y - 1) ** 1.35
        g.set(cx - 0.75, y, 'g')
    # 竹节
    for y in (4, 8, 12, 15):
        cx = 6.2 - 0.028 * (y - 1) ** 1.35
        for x in range(n):
            if abs(x + 0.5 - cx) <= 1.3:
                g.d[y][x] = 'k'
        g.set(int(cx) - 2, y - 1, 'w')
    # 细竿
    for y in range(3, 17):
        cx = 11.8 + 0.05 * (y - 3)
        for x in range(n):
            if abs(x + 0.5 - cx) <= 0.62:
                g.d[y][x] = 'g'
    for y in (6, 10, 14):
        cx = 11.8 + 0.05 * (y - 3)
        for x in range(n):
            if abs(x + 0.5 - cx) <= 0.85:
                g.d[y][x] = 'k'
    # 叶
    def leaf(px, py, ang, ln, wd, col):
        g.ell(px + math.cos(ang) * ln / 2, py + math.sin(ang) * ln / 2,
              ln / 2, wd / 2, col, rot=ang)
    leaf(5.0, 3.4, -0.55, 5.6, 1.5, 'g')
    leaf(6.6, 2.6, -0.15, 4.6, 1.3, 'n')
    leaf(4.4, 6.2, -0.85, 5.2, 1.4, 'n')
    leaf(7.6, 7.4, 0.35, 4.4, 1.2, 'g')
    leaf(6.0, 10.4, -0.5, 5.0, 1.4, 'g')
    leaf(8.2, 12.2, 0.45, 4.2, 1.2, 'n')
    leaf(12.4, 5.0, -0.35, 4.2, 1.2, 'g')
    leaf(12.0, 9.0, 0.5, 4.0, 1.1, 'g')
    return g


def p_koi():
    n = 17
    g = G(n)
    # 水波
    for k, yy in enumerate([14.4, 15.8]):
        for x in range(n):
            y = yy + 0.55 * math.sin(x * 0.62 + k * 1.7)
            for dy in (-0.5, 0.5):
                g.set(x, y + dy, 'c')
    # 尾
    g.poly([(10.5, 8.6), (16.8, 3.4), (15.0, 8.6), (16.8, 14.2), (13.6, 11.4), (13.6, 5.8)], 'r')
    g.poly([(10.5, 8.6), (16.8, 3.4), (15.0, 8.6)], 'v')
    g.line(11.5, 8.0, 15.8, 4.6, 'v', 0.7)
    g.line(11.5, 9.2, 15.8, 12.8, 'v', 0.7)
    # 身
    g.ell(8.0, 8.8, 5.4, 3.1, 'w', rot=-0.1)
    g.ell(8.0, 8.8, 5.4, 3.1, 'e', cond=lambda dx, dy: dy < -1.9)
    g.ell(8.0, 8.8, 5.4, 3.1, 'l', cond=lambda dx, dy: dy > 1.7)
    # 红斑
    g.disc(5.6, 7.2, 2.0, 'r')
    g.disc(9.6, 9.9, 1.7, 'r')
    g.disc(11.2, 7.2, 1.15, 'r')
    g.disc(5.6, 7.2, 2.0, 'v', cond=lambda dx, dy: dx - dy > 1.1)
    g.disc(3.2, 9.0, 1.5, 'w')
    # 背鳍
    g.poly([(6.0, 6.2), (8.2, 3.2), (10.2, 6.4), (8.0, 6.0)], 'p')
    # 胸鳍 腹鳍
    g.poly([(7.4, 11.4), (5.6, 14.4), (9.2, 12.2)], 'l')
    g.poly([(10.0, 11.2), (9.6, 13.6), (11.8, 12.0)], 'l')
    # 头 & 眼
    g.disc(2.9, 8.3, 1.9, 'w')
    g.disc(2.5, 7.7, 0.75, 'k')
    g.set(2.5, 7.7, 'k')
    g.set(3.0, 7.2, 'w')
    g.line(1.4, 9.4, 2.6, 9.0, 'k', 0.7)
    # 鳃
    g.curve([(4.0, 6.2), (4.6, 8.6), (3.9, 11.0)], 'e', 0.7)
    return g


def p_vase():
    n = 17
    g = G(n)
    C = 8.5
    hw = {1: 2.0, 2: 1.2, 3: 1.05, 4: 1.15, 5: 1.6, 6: 2.6, 7: 3.5, 8: 4.15,
          9: 4.5, 10: 4.55, 11: 4.35, 12: 3.9, 13: 3.4, 14: 3.0, 15: 2.85, 16: 3.15}
    for y, w in hw.items():
        for x in range(n):
            if abs(x + 0.5 - C) <= w:
                g.d[y][x] = 'w'
    # 侧面阴影 / 高光
    for y, w in hw.items():
        for x in range(n):
            dx = x + 0.5 - C
            if abs(dx) <= w:
                if dx > w - 0.9:
                    g.d[y][x] = 'e'
                elif dx < -w + 0.75:
                    g.d[y][x] = 'c' if g.d[y][x] == 'w' else g.d[y][x]
    # 口沿 / 颈纹 / 肩纹 / 足纹
    for y in (1, 3, 6, 13, 16):
        w = hw[y]
        for x in range(n):
            if abs(x + 0.5 - C) <= w:
                g.d[y][x] = 'b'
    g.rect(7, 2, 3, 1, 'b')
    # 主体缠枝：中心团花
    g.ring(C, 10.0, 2.5, 0.85, 'b')
    g.disc(C, 10.0, 1.25, 'b')
    for i in range(6):
        a = i * math.pi / 3 + 0.4
        g.disc(C + math.cos(a) * 2.5, 10.0 + math.sin(a) * 2.5, 0.85, 'b')
    # 左右卷草
    g.curve([(4.0, 7.4), (6.0, 8.4), (5.4, 10.4), (3.6, 11.2)], 'b', 0.85)
    g.curve([(13.0, 7.4), (11.0, 8.4), (11.6, 10.4), (13.4, 11.2)], 'b', 0.85)
    # 足
    g.rect(5, 15, 7, 1, 'w')
    g.rect(5, 16, 7, 1, 'b')
    return g


def p_lotus():
    n = 17
    g = G(n)
    C = 8.5; CY = 8.2
    # 后方花瓣
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4
        g.ell(C + math.cos(a) * 3.0, CY + math.sin(a) * 2.5,
              1.45, 2.7, 'p', rot=a + math.pi / 2)
    # 前方花瓣
    for i in range(6):
        a = -math.pi / 2 + (i + 0.5) * math.pi / 3
        g.ell(C + math.cos(a) * 2.1, CY + math.sin(a) * 1.75,
              1.35, 2.3, 'l', rot=a + math.pi / 2)
        g.ell(C + math.cos(a) * 2.1, CY + math.sin(a) * 1.75,
              1.35, 2.3, 'w', rot=a + math.pi / 2,
              cond=lambda dx, dy, a=a: (dx * math.sin(a) - dy * math.cos(a)) < 0)
    g.disc(C, CY + 0.3, 1.5, 'y')
    g.disc(C, CY + 0.3, 0.8, 'g')
    # 莲蓬点
    for i in range(5):
        a = i * 2 * math.pi / 5
        g.set(C + math.cos(a) * 0.75, CY + 0.3 + math.sin(a) * 0.75, 'n')
    # 荷叶 & 水
    g.ell(3.6, 14.2, 3.6, 1.5, 'n')
    g.ell(12.8, 14.8, 3.4, 1.4, 'n')
    g.line(1.0, 13.6, 6.6, 14.6, 'g', 0.7)
    g.line(10.0, 15.0, 15.8, 14.2, 'g', 0.7)
    g.ell(8.6, 16.2, 5.0, 1.0, 't')
    return g


def p_knot():
    n = 17
    g = G(n)
    C = 8.5
    # 挂绳
    g.line(C, 0.2, C, 2.2, 'r', 0.9)
    g.disc(C, 1.2, 0.9, 'y')
    # 外菱环
    g.diamondring(C, C, 5.4, 6.8, 'r')
    g.diamondring(C, C, 5.4, 6.8, 'v', )
    # 内菱环
    g.diamondring(C, C, 1.9, 3.2, 'r')
    # 四角耳
    for (dx, dy) in [(0, -4.6), (0, 4.6), (-4.6, 0), (4.6, 0)]:
        g.ring(C + dx, C + dy, 1.5, 0.95, 'r')
    # 中间连接
    for (dx, dy) in [(-2.6, -2.6), (2.6, 2.6)]:
        g.disc(C + dx, C + dy, 0.85, 'y')
    g.diamond(C, C, 1.0, 'y')
    # 流苏
    g.rect(7, 15.4, 3, 0.9, 'd')
    for i, dx in enumerate([-1.1, -0.35, 0.35, 1.1]):
        g.line(C + dx, 16.2, C + dx * 1.7, 16.9, 'y', 0.85)
    # 高光
    g.diamondring(C, C, 5.4, 6.8, 'p', )
    return g


def p_cloud():
    n = 17
    g = G(n)
    # 云头
    for (cx, cy, r) in [(4.4, 9.6, 2.9), (7.6, 7.6, 3.4), (11.4, 7.4, 3.0), (14.2, 9.4, 2.3)]:
        g.disc(cx, cy, r, 't')
    g.rect(2, 9.6, 14, 3.0, 't')
    # 高光
    for (cx, cy, r) in [(4.4, 9.6, 2.9), (7.6, 7.6, 3.4), (11.4, 7.4, 3.0), (14.2, 9.4, 2.3)]:
        g.disc(cx, cy, r, 'c', cond=lambda dx, dy: dy < -r * 0.35)
        g.disc(cx, cy, r, 'b', cond=lambda dx, dy: dx + dy > r * 0.9)
    g.rect(2, 9.6, 14, 3.0, 'b', )
    g.rect(2, 12.0, 14, 0.7, 'b')
    # 云尾卷
    pts = []
    for i in range(46):
        t = i / 45.0 * 2.4 * math.pi
        rr = 0.55 + t * 0.42
        a = t + 1.1
        pts.append((13.2 - t * 1.35 + math.cos(a) * rr, 13.4 + math.sin(a) * rr * 0.75))
    g.curve(pts, 't', 1.0)
    g.curve([(p[0], p[1] - 0.9) for p in pts[::3]], 'c', 0.6)
    return g


def p_crane():
    n = 17
    g = G(n)
    # 身
    g.ell(8.6, 10.2, 4.5, 2.9, 'w', rot=-0.12)
    g.ell(8.6, 10.2, 4.5, 2.9, 'e', cond=lambda dx, dy: dy > 1.6)
    # 尾羽
    g.poly([(11.5, 9.0), (16.2, 6.4), (15.4, 9.6), (16.6, 12.4), (12.4, 11.2)], 'k')
    g.poly([(11.5, 9.0), (16.2, 6.4), (15.4, 9.6)], 'e')
    # 翅
    g.ell(8.2, 10.6, 3.4, 1.5, 'w', rot=-0.25)
    g.curve([(6.4, 9.4), (8.6, 11.6), (11.4, 11.0)], 'e', 0.8)
    # 颈
    g.curve([(6.4, 9.6), (4.6, 7.0), (4.4, 4.4), (5.0, 2.9)], 'w', 1.5)
    # 头
    g.disc(5.2, 2.4, 1.35, 'w')
    # 冠
    g.disc(5.6, 1.3, 0.95, 'r')
    # 喙
    g.poly([(4.0, 2.3), (0.6, 1.6), (4.0, 3.2)], 'd')
    # 眼
    g.set(4.6, 2.3, 'k'); g.set(5.6, 2.3, 'w')
    # 颈根黑
    g.curve([(6.0, 8.0), (6.4, 9.6)], 'k', 1.2)
    # 腿
    g.line(8.0, 12.8, 8.0, 15.8, 'k', 0.85)
    g.line(9.8, 12.6, 10.4, 15.8, 'k', 0.85)
    g.line(7.4, 15.8, 8.8, 15.8, 'k', 0.8)
    g.line(9.8, 15.8, 11.2, 15.8, 'k', 0.8)
    # 地
    g.rect(4, 16, 10, 1, 'n')
    return g


PATTERNS_1 = [
    ('taiji', '太极', 1, p_taiji),
    ('coin', '铜钱', 1, p_coin),
    ('plum', '梅花', 1, p_plum),
    ('peach', '寿桃', 1, p_peach),
    ('lantern', '灯笼', 2, p_lantern),
    ('bamboo', '墨竹', 2, p_bamboo),
    ('koi', '锦鲤', 2, p_koi),
    ('vase', '青花瓶', 2, p_vase),
    ('lotus', '荷花', 2, p_lotus),
    ('cloud', '祥云', 2, p_cloud),
    ('knot', '中国结', 2, p_knot),
    ('crane', '仙鹤', 2, p_crane),
]

ALL = PATTERNS_1


def render_contact(path, items, cell=11, cols=6):
    rows = (len(items) + cols - 1) // cols
    pad = 16
    W = cols * (cell * 17 + pad) + pad
    H = rows * (cell * 17 + pad + 14) + pad
    img = Image.new('RGB', (W, H), (28, 24, 20))
    dr = ImageDraw.Draw(img)
    for i, (key, name, diff, fn) in enumerate(items):
        g = fn()
        n = g.n
        ox = pad + (i % cols) * (cell * 17 + pad)
        oy = pad + (i // cols) * (cell * 17 + pad + 14)
        dr.rectangle([ox - 2, oy - 2, ox + cell * n + 2, oy + cell * n + 2], outline=(70, 60, 48))
        for y in range(n):
            for x in range(n):
                ch = g.d[y][x]
                if ch == '.':
                    continue
                col = PAL[ch]
                rr = int(col[1:3], 16); gg = int(col[3:5], 16); bb = int(col[5:7], 16)
                dr.rectangle([ox + x * cell, oy + y * cell, ox + (x + 1) * cell - 1, oy + (y + 1) * cell - 1],
                             fill=(rr, gg, bb))
        dr.text((ox, oy + cell * n + 3), "%d.%s(%d)" % (i, key, diff), fill=(200, 180, 140))
    img = img.resize((W * 2, H * 2), Image.NEAREST)
    img.save(path)
    print('saved', path, img.size)


if __name__ == '__main__':
    os.makedirs(os.path.dirname(os.path.abspath(__file__)), exist_ok=True)
    render_contact(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'preview1.png'), ALL)
