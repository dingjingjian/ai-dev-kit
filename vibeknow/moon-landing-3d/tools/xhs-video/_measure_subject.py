# -*- coding: utf-8 -*-
"""量画面主体（飞行器/地球）的像素占比与包围盒。

判据不能靠肉眼印象：近黑画面里一个小亮点，肉眼容易低估它有多小。
直接算「亮于阈值的像素占全图比例」以及它们的包围盒，得到可比较的数。
"""
import pathlib, sys
from PIL import Image
import numpy as np

BASE = pathlib.Path(__file__).resolve().parent
CLIPS = BASE / "clips"
CHAPS = ["01-show", "02-explode", "03-launch1", "04-transit",
         "05-launch2", "06-rendez", "07-descent", "08-land"]
SAMPLES = 4


def main():
    only = sys.argv[1:] or CHAPS
    for chap in only:
        d = CLIPS / chap
        fs = sorted(d.glob("f*.jpg"))
        if not fs:
            print("!! %s 无素材" % chap); continue
        picks = [fs[round(k * (len(fs) - 1) / (SAMPLES - 1))] for k in range(SAMPLES)]
        print("== %s ==" % chap)
        for p in picks:
            a = np.asarray(Image.open(p).convert("L"), dtype=np.float32)
            H, W = a.shape
            # 前景阈值：明显亮于背景。深空场景背景近 0~12，主体通常 >25
            for thr in (25.0,):
                m = a > thr
                frac = m.mean() * 100
                if m.any():
                    ys, xs = np.where(m)
                    bw = (xs.max() - xs.min() + 1) / W * 100
                    bh = (ys.max() - ys.min() + 1) / H * 100
                    cx = (xs.min() + xs.max()) / 2 / W * 100
                    cy = (ys.min() + ys.max()) / 2 / H * 100
                    print("  %s thr=%.0f 前景 %5.2f%%  bbox %5.1f%%x%5.1f%%  中心(%4.0f,%4.0f)  全图均值%5.1f"
                          % (p.name, thr, frac, bw, bh, cx, cy, a.mean()))
                else:
                    print("  %s thr=%.0f 前景 0%%  —— 全图无亮像素，画面是空的"
                          % (p.name, thr))


if __name__ == "__main__":
    main()
