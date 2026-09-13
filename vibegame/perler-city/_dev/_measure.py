from PIL import Image
import sys
sys.stdout.reconfigure(encoding="utf-8")
im = Image.open(r"C:\Users\dingj\Documents\git\ai-dev-kit\vibegame\perler-city\_dev\shots\util-demand.png").convert("RGB")
W, H = im.size
print("size", W, H)
px = im.load()

def near(c, t, tol=40):
    return all(abs(c[i]-t[i]) <= tol for i in range(3))

GREEN = (0x6B, 0xC7, 0x9A)
GREEN2 = (0x4E, 0x9E, 0x73)
ORANGE = (0xF0, 0xC2, 0x4B)

# 扫每一行，统计绿色像素的 y 范围（发展需求 fill）和橙色（市政电力 fill）
green_ys = []
orange_ys = []
for y in range(H):
    for x in range(W):
        c = px[x, y]
        if near(c, GREEN, 45) or near(c, GREEN2, 45):
            green_ys.append(y); break
    for x in range(W):
        c = px[x, y]
        if near(c, ORANGE, 45):
            orange_ys.append(y); break

# 绿色可能有多段（住宅/商业/工业），按连续分段
def segments(ys, gap=3):
    if not ys: return []
    ys = sorted(set(ys)); segs = [[ys[0]]]
    for y in ys[1:]:
        if y - segs[-1][-1] <= gap: segs[-1].append(y)
        else: segs.append([y])
    return [(s[0], s[-1], len(s)) for s in segs]

print("绿色 fill 段 (y0,y1,高):", segments(green_ys))
print("橙色 fill 段 (y0,y1,高):", segments(orange_ys))

# 对每个绿色段，找其所在的 bar 背景（深色槽）的 y 范围
def dark_band(y0, y1):
    # 向上下扩展，找深色背景（RGB 都 < 60）
    top = y0
    while top > 0:
        rowdark = sum(1 for x in range(W) if max(px[x, top]) < 55)
        if rowdark < 50: break
        top -= 1
    bot = y1
    while bot < H-1:
        rowdark = sum(1 for x in range(W) if max(px[x, bot]) < 55)
        if rowdark < 50: break
        bot += 1
    return top, bot

for (y0, y1, h) in segments(green_ys):
    # 找这一行绿色出现的 x 范围
    xs = [x for y in range(y0, y1+1) for x in range(W) if near(px[x,y],GREEN,45) or near(px[x,y],GREEN2,45)]
    if not xs: continue
    xmin, xmax = min(xs), max(xs)
    # 在绿色 x 范围内，向上向下找深色 bar 边界
    cx = (xmin+xmax)//2
    top = y0
    while top > 0 and max(px[cx, top]) < 60: top -= 1
    bot = y1
    while bot < H-1 and max(px[cx, bot]) < 60: bot += 1
    print(f"绿色段 y={y0}-{y1} (fill高{h}), x={xmin}-{xmax}, bar背景 y={top}-{bot} (槽高{bot-top+1}), fill/槽={h/(bot-top+1):.0%}")
