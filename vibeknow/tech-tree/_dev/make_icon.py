# -*- coding: utf-8 -*-
"""生成应用图标 icon.png（2048x2048）。

意象参考《文明 VI》主视觉「大地/人类托举文明之球」——但不照搬阿特拉斯人形与
地球照片（版权 + 不适合小图标），转译成本项目的纸墨语言：

  - 上半：一个墨线描边的「天球」（地球/文明之球），纸底留白，圆内两条浅墨
    弧线作经纬线，像古籍里的浑仪/星图；
  - 下半：3x3 的科技树节点（直角方块 + 时代色 + 墨边），墨线从球底长出，
    节点之间按前置关系相连，指向最后一列的两条画成浅墨虚线（近未来）。

整体仍是纸面编年史：暖纸底、墨色细线、直角线框、无圆角、无投影、无渐变。

用法：python _dev/make_icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
S = 2048
BG = (245, 240, 227)     # 纸面底色（--bg #f5f0e3）
INK = (41, 36, 26)       # 墨色（--ink #29241a）
DASH = (151, 142, 120)   # 浅墨虚线（--ink-3 #978e78）

# 九个节点（按时代顺序取色，与 data.js 的 ERAS.accent 同族）
COLORS = [
    (138, 106, 76),    # 远古 褐
    (176, 125, 36),    # 早期文明 青铜
    (47, 111, 127),    # 古典 青
    (74, 107, 82),     # 中世纪 绿
    (109, 79, 154),    # 科学革命 紫
    (140, 74, 63),     # 工业 砖红
    (29, 111, 224),    # 电气与原子 蓝
    (8, 145, 178),     # 信息 青蓝
    (219, 39, 119),    # 数字与智能 玫红
]

# ---- 天球（上半部） ----
GLOBE_C = (1024, 540)     # 圆心
GLOBE_R = 270             # 半径
GLOBE_STROKE = 22         # 圆边墨线宽
GRID = (151, 142, 120)    # 经纬线浅墨
GRID_W = 8

# ---- 科技树（下半部） ----
NODE = 180               # 节点方块边长
STROKE = 14              # 节点墨边
LINE_W = 18              # 连线墨线宽
COL_X = [482, 1024, 1566]
ROW_Y = [1080, 1380, 1680]

# 球底到第一行节点的连线（球 -> 每个第一行节点）
GLOBE_TO_ROW0 = [(0, 0), (1, 0), (2, 0)]

# 3x3 网格内的前置边（只向右/向下生长）
EDGES = [((0, 0), (1, 0)), ((0, 0), (1, 1)), ((0, 1), (1, 1)), ((0, 2), (1, 1)),
         ((0, 2), (1, 2)), ((1, 0), (2, 0)), ((1, 1), (2, 0)), ((1, 1), (2, 1)),
         ((1, 2), (2, 1)), ((1, 2), (2, 2))]
# 指向最后一列的两条画成虚线（近未来还只是「前瞻」）
DASHED = {((1, 1), (2, 1)), ((1, 2), (2, 2))}

img = Image.new("RGB", (S, S), BG)
d = ImageDraw.Draw(img)


def node_center(col, row):
    return COL_X[col], ROW_Y[row]


def dashed_line(a, b, fill, width, dash=44, gap=30):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    length = (dx * dx + dy * dy) ** 0.5
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    t = 0.0
    while t < length:
        t2 = min(t + dash, length)
        d.line([ax + ux * t, ay + uy * t, ax + ux * t2, ay + uy * t2],
               fill=fill, width=width)
        t = t2 + gap


# ---- 天球 ----
gx, gy = GLOBE_C
d.ellipse([gx - GLOBE_R, gy - GLOBE_R, gx + GLOBE_R, gy + GLOBE_R],
          outline=INK, width=GLOBE_STROKE)
# 经纬线：横椭圆（纬线）+ 竖椭圆（经线），浅墨细线
rx, ry = GLOBE_R * 0.82, GLOBE_R * 0.34
d.ellipse([gx - rx, gy - ry, gx + rx, gy + ry], outline=GRID, width=GRID_W)
rx2, ry2 = GLOBE_R * 0.34, GLOBE_R * 0.82
d.ellipse([gx - rx2, gy - ry2, gx + rx2, gy + ry2], outline=GRID, width=GRID_W)

# ---- 连线（先画线，节点盖住线头） ----
# 球底 -> 第一行节点
ball_bottom = (gx, gy + GLOBE_R)
for c, r in GLOBE_TO_ROW0:
    nx, ny = node_center(c, r)
    # 从球底拉到节点顶部
    d.line([ball_bottom, (nx, ny - NODE // 2)], fill=INK, width=LINE_W)

for (c1, r1), (c2, r2) in EDGES:
    a, b = node_center(c1, r1), node_center(c2, r2)
    if ((c1, r1), (c2, r2)) in DASHED:
        dashed_line(a, b, DASH, LINE_W)
    else:
        d.line([a, b], fill=INK, width=LINE_W)

# ---- 节点：直角方块 + 时代色 + 墨边 ----
for row in range(3):
    for col in range(3):
        cx, cy = node_center(col, row)
        color = COLORS[col * 3 + row]
        box = [cx - NODE // 2, cy - NODE // 2, cx + NODE // 2, cy + NODE // 2]
        d.rectangle(box, fill=color, outline=INK, width=STROKE)

out = ROOT / "icon.png"
img.save(out, "PNG")
print("icon.png %dx%d 已生成 -> %s" % (S, S, out))
