# -*- coding: utf-8 -*-
"""
zoom-planes.py —— 把 verify-heading.py 存下的飞机裁图放大拼接，供人眼核对朝向。

为什么需要：飞机贴图在 390x844 下只有约 10px，直接看裁图辨认不出机头朝哪。
放大到 8 倍（最近邻，保持像素硬边）后，后掠翼与尾翼的形态才看得出来。

用法：
  <venv>/python tools/zoom-planes.py            # 读 docs/shots/heading/
"""
import pathlib, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "shots" / "heading"
OUT = SRC / "zoom.png"
SCALE = 8
TILE = 34          # 每个裁图的取样边长（CSS px）


def main():
    files = sorted(SRC.glob("plane-*.png"))
    if not files:
        print("没有找到 plane-*.png，请先跑 tests/verify-heading.py")
        return 1
    tiles = []
    for f in files:
        im = Image.open(f).convert("RGB")
        w, h = im.size
        # 取中心方形区域（裁图本身已以飞机为中心）
        s = min(w, h, TILE)
        cx, cy = w // 2, h // 2
        left = max(0, min(w - s, cx - s // 2))
        top = max(0, min(h - s, cy - s // 2))
        im = im.crop((left, top, left + s, top + s)).resize(
            (s * SCALE, s * SCALE), Image.NEAREST)
        tiles.append((f.name, im))

    s = tiles[0][1].size[0]
    pad = 8
    cols = min(4, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * (s + pad) + pad, rows * (s + pad) + pad), (10, 14, 22))
    for k, (_name, im) in enumerate(tiles):
        r, c = divmod(k, cols)
        canvas.paste(im, (pad + c * (s + pad), pad + r * (s + pad)))
    canvas.save(OUT)
    print("已生成 %s（%d 张，放大 %dx，每格 %s）" % (OUT, len(tiles), SCALE, tiles[0][0]))
    print("格内以飞机为中心，机头朝向即飞机贴图的指向。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
