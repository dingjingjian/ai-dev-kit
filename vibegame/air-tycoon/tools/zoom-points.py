# -*- coding: utf-8 -*-
"""
zoom-points.py —— 自动找出截图里的城市点最密集处，裁出来放大，供人眼核对「点」的清晰度。

为什么需要：城市点在 390x844 下只有 12~20px，直接看截图判断不出硬边有没有站住、
描边环有没有被纹理过滤抹平。放大 4 倍（最近邻，保持像素硬边）后，
盘心与描边之间的亮度台阶才看得见 —— 这是「去光晕、改硬边」这轮改动的核心验收面。

⚠ 不要写死裁剪坐标：截图机位一换（昼夜、太阳方向、推近程度都会变），
写死的坐标就会裁到 UI 栏或球外星空里 —— 本轮真的踩过，裁出来一张 6/6 排名栏。
改成**自动定位**：扫全图找「城市点色」的像素，取最密的窗口。

配套还会打印取样点的**径向亮度剖面**：改前是「平顶然后直接掉下去」（没有描边台阶），
改后应在半径的 0.70~0.92 段出现一段**比盘心亮**的平台。剖面不出现台阶就说明描边没站住。

用法：
  <venv>/python tools/zoom-points.py          # 读 docs/shots/smoke-*.png
  （须先跑 tests/smoke-render.py 生成截图）
"""
import pathlib
import sys
from PIL import Image
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOT = ROOT / "docs" / "shots"
SCALE = 4
HALF = 110          # 裁剪半宽/半高（CSS px @ 390x844）
HALF_H = 95

# 城市点两档色：冰青（未通航，偏蓝）/ 橙黄（已通航，偏暖）。
# 判据统一写成「通道间差异」而不是绝对亮度 —— 这样昼夜两种底色下都成立。
JOBS = [
    ("smoke-11-night-home.png", "zoom-night-points.png"),
    ("smoke-12-day-face.png",   "zoom-day-points.png"),
]


def point_mask(im):
    """返回城市点像素掩码。冰青：B 明显大于 R；橙黄：R 明显大于 B 且足够亮。"""
    a = im.astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    cyan = (b > 150) & (b - r > 45) & (g - r > 25)
    amber = (r > 170) & (r - b > 45) & (g - b > 25)
    return cyan | amber


def densest_window(mask, hw, hh):
    """积分图找点像素最多的 (cx, cy) 窗口中心。"""
    m = mask.astype(np.float32)
    ii = np.cumsum(np.cumsum(m, axis=0), axis=1)
    ii = np.pad(ii, ((1, 0), (1, 0)))
    H, W = mask.shape
    best, bx, by = -1, W // 2, H // 2
    for cy in range(hh, H - hh, 12):
        for cx in range(hw, W - hw, 12):
            s = (ii[cy + hh, cx + hw] - ii[cy - hh, cx + hw]
                 - ii[cy + hh, cx - hw] + ii[cy - hh, cx - hw])
            if s > best:
                best, bx, by = s, cx, cy
    return bx, by, best


def profile(patch_arr, name):
    """量化一枚点的径向亮度剖面：找点质心，水平向右取样到出点为止。"""
    im = patch_arr.astype(np.float32)
    lum = im.mean(axis=2)
    m = point_mask(patch_arr)
    ys, xs = np.where(m)
    if not len(ys):
        print("   %s：窗口内无城市点，跳过剖面" % name)
        return
    i = int(np.argmax(lum[ys, xs]))          # 取最亮的一枚（描边最清晰）
    cy, cx = ys[i], xs[i]
    row = lum[cy, cx:cx + 40]
    print("   %s 径向剖面: %s" % (name, " ".join("%.0f" % v for v in row)))


def main():
    if not SHOT.exists():
        print("没有 %s，请先跑 tests/smoke-render.py" % SHOT)
        return 1
    n = 0
    for src, out in JOBS:
        p = SHOT / src
        if not p.exists():
            print("跳过（缺 %s）" % src)
            continue
        im = Image.open(p).convert("RGB")
        arr = np.asarray(im)
        cx, cy, hits = densest_window(point_mask(arr), HALF, HALF_H)
        if hits < 20:
            print("跳过（%s 里找不到足够的城市点，命中 %d）" % (src, hits))
            continue
        box = (max(0, cx - HALF), max(0, cy - HALF_H),
               min(im.width, cx + HALF), min(im.height, cy + HALF_H))
        patch = im.crop(box)
        patch.resize((patch.width * SCALE, patch.height * SCALE),
                     Image.NEAREST).save(SHOT / out)
        print("已生成 %s（放大 %dx，取样中心 %d,%d，命中 %d px）"
              % (out, SCALE, cx, cy, hits))
        profile(np.asarray(patch), out)
        n += 1
    if not n:
        print("没有任何截图可处理")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
