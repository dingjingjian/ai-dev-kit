# -*- coding: utf-8 -*-
"""诊断：纹理到底有没有"上到画面"。

分两头量 ——
  (1) 纹理源图自身对比度（灰度 std）：源图若本来就淡，问题在素材；
  (2) 渲染结果里最"空"的一块能空到什么程度：
      最平处 std≈0 → 纹理没铺上；≈ 源图起伏 → 帘纹确实可见。

不读 ui_shot.log（本机存在"写入后立即读取拿到空文件"的现象），
直接用固定逻辑坐标取区。
"""
import os
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOT = os.path.join(ROOT, "tools", "r_desktop_1menu.png")


def gray(path, box=None):
    im = Image.open(path).convert("L")
    if box:
        im = im.crop(box)
    st = ImageStat.Stat(im)
    return round(st.mean[0], 2), round(st.stddev[0], 2), im.size


print("==== (1) 纹理源图自身体量 ====")
for rel in ["assets/tex/paper.webp", "assets/tex/wood-sign.webp", "assets/tex/wood-desk.webp"]:
    m, s, sz = gray(os.path.join(ROOT, rel))
    print(f"{rel:28s} {sz[0]}x{sz[1]}  灰度均值={m:6.2f}  标准差={s:6.2f}")

print("\n==== (2) 渲染结果：菜单纸面 ====")
im = Image.open(SHOT)
W, H = im.size
S = W / 1280.0
print(f"截图 {W}x{H}　缩放系数 {S}")

# 桌面端菜单列表：逻辑 x 46..854、y 185..750
# （750 以下被 fixed 的 .orderbar 盖住，那里是点单栏纯色，会造出 std=0 的假"最平行"）
x0, x1 = int(46 * S), int(854 * S)
y0, y1 = int(185 * S), int(750 * S)
band = 8                                   # 逻辑 8px 高的横带
rows, y = [], y0
while y + band * S <= y1:
    g = im.convert("L").crop((x0, y, x1, int(y + band * S)))
    st = ImageStat.Stat(g)
    rows.append((round(st.stddev[0], 3), round(st.mean[0], 2), int(y / S)))
    y += int(band * S)

rows.sort()
print(f"共 {len(rows)} 条横带，每条 {x1 - x0}×{int(band * S)} 物理像素")
print("  最平的 5 条 (std, 灰度均值, 逻辑y):")
for r in rows[:5]:
    print(f"      std={r[0]:6.3f}  mean={r[1]:6.2f}   y={r[2]}")
print(f"  中位     std={rows[len(rows) // 2][0]:6.3f}")
print(f"  最花     std={rows[-1][0]:6.3f}  @y={rows[-1][2]}")

flat = [r[0] for r in rows[:max(1, len(rows) // 5)]]
print(f"\n最平 20% 横带平均 std = {sum(flat) / len(flat):.3f}")
print("判据：最平处 ≈0 → 纹理没铺上；≥5 → 帘纹可见（源图起伏 9.24，multiply 应几乎全保留）")

print("\n==== (3) 招牌木牌与点单栏木线 ====")
m, s, sz = gray(SHOT, (int(20 * S), int(14 * S), int(155 * S), int(48 * S)))
print(f"招牌木牌区 {sz[0]}x{sz[1]}：均值={m:.2f} std={s:.2f}　（含文字，看量级）")
m, s, sz = gray(SHOT, (int(60 * S), int(757 * S), int(600 * S), int(763 * S)))
print(f"点单栏木线 {sz[0]}x{sz[1]}：均值={m:.2f} std={s:.2f}　（无遮挡，应完整保留）")
