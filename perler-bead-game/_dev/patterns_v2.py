# -*- coding: utf-8 -*-
"""拼豆图案稿件 v2：全部 20 个图案 + 预览渲染。"""
import math, os, json
from PIL import Image, ImageDraw

PAL = {
    'w': '#F3EDE0', 'e': '#BDB6A8', 'k': '#221E1B', 'm': '#7A4A2E',
    'o': '#B0763C', 'r': '#C8382F', 'v': '#7E2B3A', 'p': '#C95F7C',
    'l': '#DCACBB', 'y': '#E9B23C', 'd': '#C9A34B', 'g': '#86A95C',
    'n': '#3D6B4E', 't': '#3FA79B', 'b': '#2F5D8C', 'c': '#86AECB',
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


# ---------- 入门 13x13 ----------
def p_taiji():
    n = 13; g = G(n); C = n / 2.0; R = 5.9
    g.disc(C, C, R, 'w')
    g.disc(C, C, R, 'e', cond=lambda dx, dy: math.hypot(dx, dy) > R - 0.7)
    g.disc(C, C, R, 'k', cond=lambda dx, dy: math.hypot(dx, dy) > R - 0.35)
    for y in range(n):
        for x in range(n):
            dx = x + 0.5 - C; dy = y + 0.5 - C
            if math.hypot(dx, dy) > R - 0.7: continue
            xs = -math.sqrt(max(0.0, (R / 2) ** 2 - (dy + R / 2) ** 2)) if dy < 0 else \
                 math.sqrt(max(0.0, (R / 2) ** 2 - (dy - R / 2) ** 2))
            if dx < xs: g.d[y][x] = 'k'
    g.disc(C, C + R / 2, 1.15, 'w')
    g.disc(C, C - R / 2, 1.15, 'k')
    return g


def p_coin():
    n = 13; g = G(n); C = n / 2.0
    g.disc(C, C, 6.1, 'd')
    g.disc(C, C, 6.1, 'y', cond=lambda dx, dy: math.hypot(dx, dy) > 4.7 and (dx + dy) < -2.0)
    g.disc(C, C, 6.1, 'o', cond=lambda dx, dy: math.hypot(dx, dy) > 4.7 and (dx + dy) > 2.0)
    g.ring(C, C, 5.75, 0.45, 'k')
    g.rect(4, 4, 5, 5, 'o')
    g.rect(5, 5, 3, 3, '.')
    return g


def p_plum():
    n = 13; g = G(n); C = n / 2.0
    g.curve([(-0.5, 12.5), (2.5, 10.5), (4.0, 8.0), (5.2, 6.2)], 'm', 1.5)
    g.curve([(5.2, 6.2), (7.5, 5.0), (9.5, 5.6)], 'm', 1.1)
    g.curve([(4.0, 8.0), (5.5, 9.8), (6.5, 11.2)], 'm', 1.0)
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        px = C + math.cos(a) * 2.9; py = C + math.sin(a) * 2.9
        g.disc(px, py, 2.05, 'p')
        g.disc(px, py, 2.05, 'l', cond=lambda dx, dy, a=a: (dx * math.cos(-a) - dy * math.sin(-a)) < -0.35)
        g.disc(px, py, 2.05, 'v', cond=lambda dx, dy, a=a: (dx * math.cos(-a) - dy * math.sin(-a)) > 0.75)
    g.disc(C, C, 1.35, 'y')
    g.set(C - 0.5, C - 0.5, 'k'); g.set(C + 0.5, C - 0.5, 'k'); g.set(C, C + 0.5, 'k')
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5 + 0.6
        g.line(C, C, C + math.cos(a) * 2.2, C + math.sin(a) * 2.2, 'y', 0.8)
    return g


def p_peach():
    n = 13; g = G(n)
    for y in range(2, 13):
        t = (y - 2) / 10.0
        hw = 1.0 + 4.4 * math.sin(t * math.pi * 0.82) ** 0.8
        add = 0.9 if y >= 11 else 0
        for x in range(n):
            if abs(x + 0.5 - 6.5) <= hw + add:
                g.d[y][x] = 'l'
    g.set(6, 1, 'l'); g.set(7, 1, 'l')
    for y in range(3, 12): g.set(6, y, 'p')
    g.disc(4.2, 8.4, 1.9, 'p'); g.disc(9.0, 8.0, 1.5, 'p'); g.disc(5.0, 5.5, 1.1, 'w')
    g.ell(10.6, 3.2, 2.9, 1.15, 'n', rot=-0.62)
    g.line(8.4, 3.6, 12.6, 2.4, 'g', 0.7)
    g.line(6.8, 2.0, 7.6, 0.6, 'm', 1.1)
    return g


# ---------- 进阶 17x17 ----------
def p_lantern():
    n = 17; g = G(n); C = 8.5
    g.line(C, 0.2, C, 2.2, 'k', 0.9)
    g.rect(5, 2, 7, 1.4, 'd')
    g.rect(6, 2.8, 5, 0.6, 'y')
    g.rect(5, 14.2, 7, 1.4, 'd')
    g.rect(7, 15.4, 3, 0.9, 'd')
    cy, rx, ry = 8.6, 6.0, 5.0
    g.ell(C, cy, rx, ry, 'r')
    g.ell(C, cy, rx, ry, 'v', cond=lambda dx, dy: dx / rx + dy / ry > 1.05)
    g.ell(C, cy, rx, ry, 'y', cond=lambda dx, dy: dx / rx + dy / ry < -1.05)
    for f in (-0.78, -0.42, 0.0, 0.42, 0.78):
        pts = []
        for k in range(11):
            yy = cy - ry + 0.4 + (2 * ry - 0.8) * k / 10.0
            t = (yy - cy) / ry
            w = rx * math.sqrt(max(0.0, 1 - t * t))
            pts.append((C + w * f, yy))
        g.curve(pts, 'v', 0.85)
    for y in range(n):
        for x in range(n):
            dx = x + 0.5 - C; dy = y + 0.5 - cy
            m = (dx / rx) ** 2 + (dy / ry) ** 2
            if m <= 1.0 and abs(dy) > ry - 1.0:
                g.d[y][x] = 'd'
    g.diamond(C, cy, 1.7, 'y')
    g.set(C, cy, 'k')
    for dx in (-1.0, 0.0, 1.0):
        g.line(C + dx * 0.9, 16.0, C + dx * 1.6, 16.9, 'y', 0.9)
    return g


def p_bamboo():
    n = 17; g = G(n)
    for y in range(1, 17):
        cx = 6.2 - 0.028 * (y - 1) ** 1.35; w = 1.55 - 0.035 * (y - 1)
        for x in range(n):
            if abs(x + 0.5 - cx) <= w / 2.0 + 0.25:
                g.d[y][x] = 'n'
        g.set(cx - 0.75, y, 'g')
    for y in (4, 8, 12, 15):
        cx = 6.2 - 0.028 * (y - 1) ** 1.35
        for x in range(n):
            if abs(x + 0.5 - cx) <= 1.3:
                g.d[y][x] = 'k'
        g.set(int(cx) - 2, y - 1, 'w')
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
    def leaf(px, py, ang, ln, wd, col):
        g.ell(px + math.cos(ang) * ln / 2, py + math.sin(ang) * ln / 2, ln / 2, wd / 2, col, rot=ang)
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
    n = 17; g = G(n)
    for k, yy in enumerate([14.4, 15.8]):
        for x in range(n):
            y = yy + 0.55 * math.sin(x * 0.62 + k * 1.7)
            for dy in (-0.5, 0.5):
                g.set(x, y + dy, 'c')
    g.poly([(10.5, 8.6), (16.2, 4.6), (15.0, 8.6), (16.2, 12.6), (13.6, 11.0), (13.6, 6.2)], 'r')
    g.line(11.5, 7.6, 15.8, 4.8, 'v', 0.7)
    g.line(11.5, 9.6, 15.8, 12.4, 'v', 0.7)
    g.ell(8.0, 8.8, 5.4, 3.1, 'w', rot=-0.1)
    g.ell(8.0, 8.8, 5.4, 3.1, 'e', cond=lambda dx, dy: dy < -1.9)
    g.ell(8.0, 8.8, 5.4, 3.1, 'l', cond=lambda dx, dy: dy > 1.7)
    g.disc(5.6, 7.2, 2.0, 'r')
    g.disc(9.6, 9.9, 1.7, 'r')
    g.disc(11.2, 7.2, 1.15, 'r')
    g.disc(5.6, 7.2, 2.0, 'v', cond=lambda dx, dy: dx - dy > 1.1)
    g.disc(3.2, 9.0, 1.5, 'w')
    g.poly([(6.0, 6.2), (8.2, 3.2), (10.2, 6.4), (8.0, 6.0)], 'p')
    g.poly([(7.4, 11.4), (5.6, 14.4), (9.2, 12.2)], 'l')
    g.poly([(10.0, 11.2), (9.6, 13.6), (11.8, 12.0)], 'l')
    g.disc(2.9, 8.3, 1.9, 'w')
    g.disc(2.5, 7.7, 0.75, 'k')
    g.set(3.0, 7.2, 'w')
    g.line(1.4, 9.4, 2.6, 9.0, 'k', 0.7)
    g.curve([(4.0, 6.2), (4.6, 8.6), (3.9, 11.0)], 'e', 0.7)
    return g


def p_vase():
    n = 17; g = G(n); C = 8.5
    hw = {1: 2.0, 2: 1.2, 3: 1.05, 4: 1.15, 5: 1.6, 6: 2.6, 7: 3.5, 8: 4.15,
          9: 4.5, 10: 4.55, 11: 4.35, 12: 3.9, 13: 3.4, 14: 3.0, 15: 2.85, 16: 3.15}
    for y, w in hw.items():
        for x in range(n):
            if abs(x + 0.5 - C) <= w:
                g.d[y][x] = 'w'
    for y, w in hw.items():
        for x in range(n):
            dx = x + 0.5 - C
            if abs(dx) <= w:
                if dx > w - 0.9: g.d[y][x] = 'e'
                elif dx < -w + 0.75: g.d[y][x] = 'c'
    for y in (1, 3, 6, 13, 16):
        w = hw[y]
        for x in range(n):
            if abs(x + 0.5 - C) <= w:
                g.d[y][x] = 'b'
    g.rect(7, 2, 3, 1, 'b')
    g.ring(C, 10.0, 2.5, 0.85, 'b')
    g.disc(C, 10.0, 1.25, 'b')
    for i in range(6):
        a = i * math.pi / 3 + 0.4
        g.disc(C + math.cos(a) * 2.5, 10.0 + math.sin(a) * 2.5, 0.85, 'b')
    g.curve([(4.0, 7.4), (6.0, 8.4), (5.4, 10.4), (3.6, 11.2)], 'b', 0.85)
    g.curve([(13.0, 7.4), (11.0, 8.4), (11.6, 10.4), (13.4, 11.2)], 'b', 0.85)
    g.rect(5, 15, 7, 1, 'w')
    g.rect(5, 16, 7, 1, 'b')
    return g


def p_lotus():
    n = 17; g = G(n); C = 8.5; CY = 8.2
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4
        g.ell(C + math.cos(a) * 3.0, CY + math.sin(a) * 2.5, 1.45, 2.7, 'p', rot=a + math.pi / 2)
    for i in range(6):
        a = -math.pi / 2 + (i + 0.5) * math.pi / 3
        g.ell(C + math.cos(a) * 2.1, CY + math.sin(a) * 1.75, 1.35, 2.3, 'l', rot=a + math.pi / 2)
        g.ell(C + math.cos(a) * 2.1, CY + math.sin(a) * 1.75, 1.35, 2.3, 'w', rot=a + math.pi / 2,
              cond=lambda dx, dy, a=a: (dx * math.sin(a) - dy * math.cos(a)) < 0)
    g.disc(C, CY + 0.3, 1.5, 'y')
    g.disc(C, CY + 0.3, 0.8, 'g')
    for i in range(5):
        a = i * 2 * math.pi / 5
        g.set(C + math.cos(a) * 0.75, CY + 0.3 + math.sin(a) * 0.75, 'n')
    g.ell(3.6, 14.2, 3.6, 1.5, 'n')
    g.ell(12.8, 14.8, 3.4, 1.4, 'n')
    g.line(1.0, 13.6, 6.6, 14.6, 'g', 0.7)
    g.line(10.0, 15.0, 15.8, 14.2, 'g', 0.7)
    g.ell(8.6, 16.2, 5.0, 1.0, 't')
    return g


def p_cloud():
    n = 17; g = G(n)
    for cx, cy, r in [(4.4, 9.6, 2.9), (7.6, 7.6, 3.4), (11.4, 7.4, 3.0), (14.2, 9.4, 2.3)]:
        g.disc(cx, cy, r, 't')
    g.rect(2, 9.6, 14, 3.0, 't')
    for cx, cy, r in [(4.4, 9.6, 2.9), (7.6, 7.6, 3.4), (11.4, 7.4, 3.0), (14.2, 9.4, 2.3)]:
        g.disc(cx, cy, r, 'c', cond=lambda dx, dy: dy < -r * 0.35)
        g.disc(cx, cy, r, 'b', cond=lambda dx, dy: dx + dy > r * 0.9)
    g.rect(2, 12.0, 14, 0.7, 'b')
    # 云尾卷：从 (14,12) 向左下卷出
    pts = []
    for i in range(40):
        t = i / 39.0 * 1.5 * math.pi
        rr = 0.4 + t * 0.5
        pts.append((14.4 - t * 1.05 + math.cos(t + 0.2) * rr, 12.6 + math.sin(t + 0.2) * rr * 0.8))
    g.curve(pts, 't', 0.95)
    g.curve([(p[0] - 0.7, p[1] - 0.4) for p in pts[::3]], 'c', 0.5)
    return g


def p_knot():
    n = 17; g = G(n); C = 8.5
    g.line(C, 0.2, C, 2.2, 'r', 0.9)
    g.disc(C, 1.2, 0.9, 'y')
    g.diamondring(C, C, 5.4, 6.8, 'r')
    g.diamondring(C, C, 5.4, 6.8, 'v', )
    g.diamondring(C, C, 1.9, 3.2, 'r')
    for dx, dy in [(0, -4.6), (0, 4.6), (-4.6, 0), (4.6, 0)]:
        g.ring(C + dx, C + dy, 1.5, 0.95, 'r')
    for dx, dy in [(-2.6, -2.6), (2.6, 2.6)]:
        g.disc(C + dx, C + dy, 0.85, 'y')
    g.diamond(C, C, 1.0, 'y')
    g.rect(7, 15.4, 3, 0.9, 'd')
    for dx in (-1.1, -0.35, 0.35, 1.1):
        g.line(C + dx, 16.2, C + dx * 1.7, 16.9, 'y', 0.85)
    return g


def p_crane():
    n = 17; g = G(n)
    g.ell(8.6, 10.2, 4.5, 2.9, 'w', rot=-0.12)
    g.ell(8.6, 10.2, 4.5, 2.9, 'e', cond=lambda dx, dy: dy > 1.6)
    g.poly([(11.5, 9.0), (16.2, 6.4), (15.4, 9.6), (16.6, 12.4), (12.4, 11.2)], 'k')
    g.poly([(11.5, 9.0), (16.2, 6.4), (15.4, 9.6)], 'e')
    g.ell(8.2, 10.6, 3.4, 1.5, 'w', rot=-0.25)
    g.curve([(6.4, 9.4), (8.6, 11.6), (11.4, 11.0)], 'e', 0.8)
    g.curve([(6.4, 9.6), (4.6, 7.0), (4.4, 4.4), (5.0, 2.9)], 'w', 1.5)
    g.disc(5.2, 2.4, 1.35, 'w')
    g.disc(5.6, 1.3, 0.95, 'r')
    g.poly([(4.0, 2.3), (0.6, 1.6), (4.0, 3.2)], 'd')
    g.set(4.6, 2.3, 'k'); g.set(5.6, 2.3, 'w')
    g.curve([(6.0, 8.0), (6.4, 9.6)], 'k', 1.2)
    g.line(8.0, 12.8, 8.0, 15.8, 'k', 0.85)
    g.line(9.8, 12.6, 10.4, 15.8, 'k', 0.85)
    g.line(7.4, 15.8, 8.8, 15.8, 'k', 0.8)
    g.line(9.8, 15.8, 11.2, 15.8, 'k', 0.8)
    g.rect(4, 16, 10, 1, 'n')
    return g


# ---------- 精工 21x21 ----------
def p_fu():
    n = 21; g = G(n)
    # 红底斗方
    g.fill_bbox(1, 1, 19, 19, 'r')
    # 笔画：描金
    # 左点
    g.disc(5, 3, 0.7, 'd')
    # 左横
    g.rect(1, 5, 6, 1, 'd')
    # 左撇
    g.curve([(1.5, 6.2), (2.8, 9.0), (4.4, 11.4), (5.0, 13.0)], 'd', 1.1)
    # 左竖
    g.rect(4.8, 6, 1.2, 12, 'd')
    # 左点
    g.disc(8.0, 10.5, 0.7, 'd')
    # 右上横
    g.rect(10, 5, 8, 1, 'd')
    # 口
    g.rect(10, 7, 7, 4, 'd')
    g.rect(11, 8, 5, 2, '.')
    # 田
    g.rect(10, 12, 7, 6, 'd')
    g.rect(11, 13, 2, 1, '.')
    g.rect(14, 13, 2, 1, '.')
    g.rect(11, 15, 2, 1, '.')
    g.rect(14, 15, 2, 1, '.')
    # 描金边框
    g.rect(1, 1, 19, 1, 'd')
    g.rect(1, 19, 19, 1, 'd')
    g.rect(1, 1, 1, 19, 'd')
    g.rect(19, 1, 1, 19, 'd')
    return g


def p_peony():
    n = 21; g = G(n); C = 10.5; CY = 10.0
    # 枝叶
    g.curve([(-1, 19), (4, 16), (7, 12), (9, 9.5)], 'm', 1.6)
    g.curve([(22, 19), (17, 16), (14, 12), (12, 9.5)], 'm', 1.6)
    g.ell(4.0, 16.5, 3.0, 1.2, 'n', rot=-0.5)
    g.ell(17.0, 16.5, 3.0, 1.2, 'n', rot=0.5)
    g.ell(7.5, 13.0, 2.2, 0.9, 'n', rot=-0.2)
    g.ell(13.5, 13.0, 2.2, 0.9, 'n', rot=0.2)
    # 外层花瓣
    for i in range(14):
        a = i * 2 * math.pi / 14 + 0.2
        g.ell(C + math.cos(a) * 5.0, CY + math.sin(a) * 4.6, 1.7, 3.6, 'v', rot=a + math.pi / 2)
    for i in range(10):
        a = i * 2 * math.pi / 10 + 0.5
        g.ell(C + math.cos(a) * 3.6, CY + math.sin(a) * 3.2, 1.5, 2.7, 'p', rot=a + math.pi / 2)
    for i in range(8):
        a = i * 2 * math.pi / 8 + 0.3
        g.ell(C + math.cos(a) * 2.4, CY + math.sin(a) * 2.1, 1.2, 1.9, 'l', rot=a + math.pi / 2)
    # 花心
    g.disc(C, CY, 1.8, 'y')
    for i in range(6):
        a = i * math.pi / 3
        g.set(C + math.cos(a) * 0.9, CY + math.sin(a) * 0.9, 'o')
    return g


def p_goldfish():
    n = 21; g = G(n)
    # 水
    for k, yy in enumerate([17.2, 18.8, 20.0]):
        for x in range(n):
            y = yy + 0.6 * math.sin(x * 0.55 + k * 2.1)
            for dy in (-0.5, 0.5):
                g.set(x, y + dy, 'c')
    # 扇尾
    g.poly([(12.5, 10.5), (19.5, 3.5), (17.8, 10.5), (19.5, 17.5), (14.0, 13.5), (14.0, 7.5)], 'r')
    g.line(13.5, 8.0, 18.0, 5.0, 'v', 0.9)
    g.line(13.5, 13.0, 18.0, 16.0, 'v', 0.9)
    # 身
    g.ell(10.0, 10.5, 6.0, 3.5, 'w', rot=-0.05)
    g.ell(10.0, 10.5, 6.0, 3.5, 'e', cond=lambda dx, dy: dy < -2.2)
    g.ell(10.0, 10.5, 6.0, 3.5, 'l', cond=lambda dx, dy: dy > 2.0)
    # 红斑
    g.disc(6.8, 8.6, 2.6, 'r')
    g.disc(11.5, 12.0, 2.2, 'r')
    g.disc(13.8, 9.0, 1.5, 'r')
    g.disc(8.8, 12.8, 1.4, 'r')
    # 鳍
    g.poly([(7.5, 7.0), (10.0, 3.2), (12.5, 7.2), (10.0, 6.8)], 'p')
    g.poly([(8.2, 13.8), (6.0, 18.2), (10.8, 14.6)], 'l')
    g.poly([(11.8, 13.6), (11.2, 17.4), (14.2, 14.4)], 'l')
    # 头眼
    g.disc(4.2, 10.2, 2.0, 'w')
    g.disc(3.4, 9.0, 1.0, 'k')
    g.set(3.8, 8.4, 'w')
    g.line(1.8, 11.4, 3.4, 11.0, 'k', 0.8)
    g.curve([(14.2, 12.0), (15.8, 14.0), (17.0, 13.0)], 'v', 0.7)
    return g


def p_butterfly():
    n = 21; g = G(n); C = 10.5; CY = 10.5
    # 身体
    g.line(C, 4.0, C, 16.5, 'm', 1.3)
    g.disc(C, 3.2, 1.1, 'm')
    g.line(C - 0.8, 3.0, C - 1.6, 0.5, 'k', 0.45)
    g.line(C + 0.8, 3.0, C + 1.6, 0.5, 'k', 0.45)
    g.disc(C, 4.5, 0.7, 'y')
    g.disc(C, 6.5, 0.7, 'y')
    # 上翅
    g.ell(C - 5.0, CY - 2.5, 5.2, 3.4, 'b', rot=-0.25)
    g.ell(C + 5.0, CY - 2.5, 5.2, 3.4, 'b', rot=0.25)
    g.ell(C - 5.0, CY - 2.5, 5.2, 3.4, 'c', rot=-0.25, cond=lambda dx, dy: (dx * math.cos(0.25) - dy * math.sin(0.25)) < -2.2)
    g.ell(C + 5.0, CY - 2.5, 5.2, 3.4, 'c', rot=0.25, cond=lambda dx, dy: (dx * math.cos(-0.25) - dy * math.sin(-0.25)) > 2.2)
    # 下翅
    g.ell(C - 3.8, CY + 3.8, 3.6, 2.7, 'p', rot=-0.45)
    g.ell(C + 3.8, CY + 3.8, 3.6, 2.7, 'p', rot=0.45)
    g.ell(C - 3.8, CY + 3.8, 3.6, 2.7, 'l', rot=-0.45, cond=lambda dx, dy: dy > 0)
    g.ell(C + 3.8, CY + 3.8, 3.6, 2.7, 'l', rot=0.45, cond=lambda dx, dy: dy > 0)
    # 翅斑
    g.disc(C - 5.0, CY - 2.5, 1.1, 'w')
    g.disc(C + 5.0, CY - 2.5, 1.1, 'w')
    g.disc(C - 5.0, CY - 2.5, 0.55, 'd')
    g.disc(C + 5.0, CY - 2.5, 0.55, 'd')
    g.disc(C - 3.8, CY + 3.8, 0.9, 'w')
    g.disc(C + 3.8, CY + 3.8, 0.9, 'w')
    g.disc(C - 3.8, CY + 3.8, 0.45, 'd')
    g.disc(C + 3.8, CY + 3.8, 0.45, 'd')
    # 翅脉
    g.line(C, 7.0, C - 4.0, CY - 4.0, 'k', 0.4)
    g.line(C, 7.0, C + 4.0, CY - 4.0, 'k', 0.4)
    g.line(C, 11.0, C - 3.0, CY + 5.0, 'k', 0.4)
    g.line(C, 11.0, C + 3.0, CY + 5.0, 'k', 0.4)
    # 外缘描金
    g.ellring(C - 5.0, CY - 2.5, 5.2, 3.4, 0.4, 'd', rot=-0.25)
    g.ellring(C + 5.0, CY - 2.5, 5.2, 3.4, 0.4, 'd', rot=0.25)
    return g


def p_fan():
    n = 21; g = G(n); C = 10.5; CY = 9.0
    # 扇面
    g.disc(C, CY, 9.6, 'w')
    g.disc(C, CY, 9.6, 'e', cond=lambda dx, dy: dy > 5.5)
    g.disc(C, CY, 9.6, 'c', cond=lambda dx, dy: dx < -7.0)
    g.ring(C, CY, 9.3, 0.5, 'm')
    # 扇骨
    for a in [-0.85, -0.42, 0, 0.42, 0.85]:
        g.line(C, CY, C + math.sin(a) * 9.0, CY - math.cos(a) * 9.0, 'm', 0.4)
    # 扇柄
    g.rect(9.8, 18.0, 1.4, 3.0, 'm')
    g.rect(9.5, 18.0, 2.0, 0.6, 'd')
    g.rect(9.8, 21.0, 1.4, 0.6, 'd')
    g.line(C, 20.6, C, 21.6, 'y', 0.7)
    # 扇面画：一枝红梅
    g.curve([(C - 3.5, CY + 1.0), (C - 1.5, CY - 1.5), (C + 1.0, CY - 3.0), (C + 4.0, CY - 1.0)], 'm', 0.9)
    g.curve([(C + 4.0, CY - 1.0), (C + 5.5, CY + 1.5), (C + 3.5, CY + 3.5)], 'm', 0.7)
    for px, py in [(C - 2.0, CY - 0.5), (C + 0.5, CY - 3.0), (C + 3.8, CY + 0.0), (C + 2.5, CY + 2.5)]:
        g.disc(px, py, 1.1, 'p')
        g.disc(px, py, 0.6, 'y')
        g.set(px + 0.3, py + 0.3, 'k')
    return g


def p_landscape():
    n = 21; g = G(n)
    # 天空渐变
    for y in range(1, 9):
        c = 'b' if y <= 3 else 'c' if y <= 6 else 'w'
        for x in range(n): g.d[y][x] = c
    # 落日
    g.disc(16.0, 4.5, 2.1, 'y')
    g.disc(16.0, 4.5, 2.1, 'o', cond=lambda dx, dy: dy > 0.5)
    # 远山
    g.poly([(0, 14), (0, 9), (3, 5), (7, 10), (11, 6), (15, 11), (21, 7), (21, 14)], 'k')
    g.poly([(0, 16), (0, 12), (5, 7), (9, 13), (14, 8), (21, 13), (21, 16)], 'b')
    g.poly([(0, 18), (0, 14), (6, 11), (12, 16), (21, 12), (21, 18)], 'n')
    # 水
    for y in range(18, 21):
        for x in range(n):
            g.d[y][x] = 'c'
    # 水波
    for yy in [18.8, 19.8]:
        for x in range(n):
            y = yy + 0.5 * math.sin(x * 0.7 + yy)
            g.set(x, y, 'w')
    # 孤舟
    g.poly([(14.0, 16.5), (18.0, 16.5), (17.2, 17.8), (14.8, 17.8)], 'm')
    g.line(15.5, 16.5, 15.5, 14.8, 'm', 0.5)
    g.rect(15.0, 14.8, 1.8, 0.5, 'y')
    # 雾
    g.ell(6.0, 16.0, 5.0, 1.0, 'w')
    g.ell(17.0, 15.0, 4.0, 1.0, 'w')
    return g


# ---------- 传世 25x25 ----------
def p_medallion():
    n = 25; g = G(n); C = 12.0
    # 用旋转对称生成
    def rpoint(u, v, k, i):
        a = -i * 2 * math.pi / k
        return (u * math.cos(a) - v * math.sin(a), u * math.sin(a) + v * math.cos(a))
    def stamp(u, v, ch):
        for i in range(8):
            dx, dy = rpoint(u, v, 8, i)
            g.set(C + dx, C + dy, ch)
    # 外圈花瓣
    for i in range(8):
        for u in range(-2, 3):
            for v in range(6, 12):
                dx, dy = rpoint(u + 0.5, v + 0.5, 8, i)
                g.disc(C + dx, C + dy, 1.8, 'v')
    for i in range(8):
        for u in range(-1, 2):
            for v in range(7, 11):
                dx, dy = rpoint(u + 0.5, v + 0.5, 8, i)
                g.disc(C + dx, C + dy, 1.4, 'p')
    # 中层尖瓣
    for i in range(8):
        for u in range(-1, 2):
            for v in range(3, 6):
                dx, dy = rpoint(u + 0.5, v + 0.5, 8, i)
                g.disc(C + dx, C + dy, 1.2, 'l')
    # 菱环
    for r0, r1, ch in [(5.0, 6.2, 'd'), (3.0, 4.0, 'd')]:
        g.diamondring(C, C, r0, r1, ch)
    # 中心花蕊
    g.disc(C, C, 2.4, 'y')
    g.disc(C, C, 1.4, 'o')
    for i in range(8):
        dx, dy = rpoint(0, 1.8, 8, i)
        g.set(C + dx, C + dy, 'r')
    # 点缀
    for i in range(8):
        for v in [8.5, 10.5]:
            dx, dy = rpoint(0, v, 8, i)
            g.set(C + dx, C + dy, 'y')
    return g


def p_magpie():
    n = 25; g = G(n)
    # 梅枝
    g.curve([(-1, 22), (5, 17), (10, 12), (16, 9), (22, 10)], 'm', 2.2)
    g.curve([(10, 12), (7, 8), (4, 5), (2, 2)], 'm', 1.3)
    g.curve([(16, 9), (19, 5), (21, 1)], 'm', 1.1)
    # 梅花
    for px, py in [(2, 21), (6, 16), (11, 11), (18, 9), (4, 5), (20, 2), (14, 7)]:
        g.disc(px, py, 1.8, 'p')
        g.disc(px, py, 1.8, 'l', cond=lambda dx, dy: dy < -0.6)
        g.disc(px, py, 0.9, 'y')
        g.set(px + 0.4, py + 0.4, 'k')
    # 喜鹊 1：立在枝上，朝右
    bx, by = 13.5, 10.0
    g.ell(bx, by + 1.5, 4.0, 2.4, 'w', rot=0.1)
    g.ell(bx, by + 1.5, 4.0, 2.4, 'k', cond=lambda dx, dy: dy > 1.2)
    g.ell(bx, by + 1.5, 4.0, 2.4, 'e', cond=lambda dx, dy: dy < -1.2)
    # 头
    g.disc(bx - 2.8, by - 0.5, 1.5, 'w')
    g.disc(bx - 2.8, by - 0.5, 0.5, 'k')
    # 冠
    g.disc(bx - 3.0, by - 1.6, 0.85, 'r')
    # 喙
    g.poly([(bx - 3.8, by - 0.2), (bx - 5.5, by - 0.6), (bx - 3.8, by + 0.6)], 'd')
    # 尾
    g.poly([(bx + 3.0, by + 1.0), (bx + 7.5, by - 0.5), (bx + 6.5, by + 2.0), (bx + 3.6, by + 2.4)], 'k')
    # 翅
    g.ell(bx + 0.5, by + 0.5, 2.6, 1.4, 'k', rot=0.3)
    g.ell(bx + 0.5, by + 0.5, 1.4, 0.8, 'w', rot=0.3)
    # 腿
    g.line(bx - 0.8, by + 3.0, bx - 0.8, by + 4.2, 'k', 0.6)
    g.line(bx + 0.8, by + 3.0, bx + 0.8, by + 4.2, 'k', 0.6)
    # 喜鹊 2：飞翔，左上
    cx, cy = 6.5, 7.0
    g.ell(cx, cy, 3.2, 1.8, 'w', rot=-0.35)
    g.ell(cx, cy, 3.2, 1.8, 'k', cond=lambda dx, dy: dy > 0.6)
    g.disc(cx - 1.8, cy - 1.2, 1.2, 'w')
    g.disc(cx - 1.8, cy - 1.2, 0.4, 'k')
    g.disc(cx - 1.9, cy - 2.0, 0.6, 'r')
    g.poly([(cx - 2.5, cy - 1.0), (cx - 4.2, cy - 1.4), (cx - 2.5, cy - 0.2)], 'd')
    g.ell(cx + 2.0, cy + 0.5, 2.0, 1.2, 'k', rot=0.5)
    g.line(cx + 0.5, cy + 1.0, cx - 0.5, cy + 3.0, 'k', 0.5)
    g.line(cx + 1.5, cy + 1.0, cx + 1.0, cy + 3.2, 'k', 0.5)
    return g


ALL = [
    # key, name, difficulty(1-4), category, lore, fn
    ('taiji', '太极', 1, '入门', '阴阳相生，万物之始。', p_taiji),
    ('coin', '铜钱', 1, '入门', '天圆地方，招财进宝。', p_coin),
    ('plum', '梅花', 1, '入门', '凌寒独自开，报春第一枝。', p_plum),
    ('peach', '寿桃', 1, '入门', '三千年结实，祝寿绵长春。', p_peach),
    ('lantern', '红灯笼', 2, '进阶', '一夜鱼龙舞，灯明照岁寒。', p_lantern),
    ('bamboo', '墨竹', 2, '进阶', '未出土时先有节，及凌云处尚虚心。', p_bamboo),
    ('koi', '锦鲤', 2, '进阶', '锦鲤跃浪，年年有余。', p_koi),
    ('vase', '青花瓶', 2, '进阶', '素瓷雪色缥沫香，青花半隐见天光。', p_vase),
    ('lotus', '荷花', 2, '进阶', '出淤泥而不染，濯清涟而不妖。', p_lotus),
    ('cloud', '祥云', 2, '进阶', '青云直上，瑞气东来。', p_cloud),
    ('knot', '中国结', 2, '进阶', '一根丝线，千回百转，同心永结。', p_knot),
    ('crane', '仙鹤', 2, '进阶', '丹顶鹤唳，一品鸟也。', p_crane),
    ('fu', '福字斗方', 3, '精工', '福到万家，新春纳祥。', p_fu),
    ('peony', '牡丹', 3, '精工', '唯有牡丹真国色，花开时节动京城。', p_peony),
    ('goldfish', '金鱼', 3, '精工', '金玉满堂，连年有余。', p_goldfish),
    ('butterfly', '蝴蝶', 3, '精工', '庄周晓梦迷蝶，梁祝化蝶双飞。', p_butterfly),
    ('fan', '团扇', 3, '精工', '轻罗小扇扑流萤，古典闺阁之雅。', p_fan),
    ('landscape', '山水', 3, '精工', '远山如黛，落日熔金，一叶扁舟。', p_landscape),
    ('medallion', '宝相花', 4, '传世', '敦煌华盖，宝相庄严。', p_medallion),
    ('magpie', '喜鹊登梅', 4, '传世', '喜鹊登梅梢，喜上眉梢来。', p_magpie),
]


def render_contact(path, items, cell=9, cols=5):
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
        dr.text((ox, oy + sw + 10), "★" * diff, fill=(212, 175, 55))
    img = img.resize((W * 2, H * 2), Image.NEAREST)
    img.save(path)
    print('saved', path, img.size)


if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(base, exist_ok=True)
    render_contact(os.path.join(base, 'preview_v2.png'), ALL)
    # 导出 JSON 数据
    out = []
    for key, name, diff, cat, lore, fn in ALL:
        g = fn()
        out.append({"id": key, "name": name, "diff": diff, "cat": cat, "lore": lore, "n": g.n, "grid": g.rows()})
    with open(os.path.join(base, 'patterns.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('patterns.json rows:', len(out))
