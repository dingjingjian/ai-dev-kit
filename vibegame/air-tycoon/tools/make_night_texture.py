# -*- coding: utf-8 -*-
"""生成夜面城市灯光贴图 assets/earth-night.jpg。

【本脚本自 vibeknow/nobel-atlas/tools/make_night_texture.py 移植，逐字节同源】
  移植的前提是两边的 assets/earth.jpg 是同一个文件（md5 e15eb8d2…），
  否则等距圆柱投影的经纬对齐会差开，灯光会落到错误的海岸线上。
  产物需再用 node tools/gen-earth-night-tex.js 转成内联 assets/earth-night-tex.js
  （file:// 下外链 jpg 会被 CORS 拒绝，见该脚本头注释）。

为什么需要它：
  app.js 在夜面（背向太阳的半球）叠一层加色混合的灯光球壳，需要一张「只有城市灯光」
  的等距圆柱贴图。直接用 NASA 黑大理石原图不行——那张图的海洋与陆地本身带一层
  冷蓝底噪（海洋 max 通道 ≈0.15、陆地 ≈0.33），加色叠上去会把整个夜面糊成一片蓝雾；
  而真正的灯光只有 0.2% 的像素，暖色（R>B）且比地表亮。
  所以这里按「暖度 R−B」把灯光从蓝调地表里挑出来，再做一层小半径晕开
  （原图灯光多是单像素点，直接降采样会暗掉），最后降采样到 2048×1024 出 JPEG。

源图：NASA Black Marble（地球夜间灯光）→ three-globe 示例素材
      https://unpkg.com/three-globe/example/img/earth-night.jpg（4096×2048，首次运行自动下载到 _scratch/）
产物：assets/earth-night.jpg（2048×1024，暖金色灯光，其余全黑）

用法：python tools/make_night_texture.py
"""
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
# 源图是 715 KB 的下载中间物，放 _scratch/（.gitignore 的「本地临时脚本与中间产物」）——
# 落在 tools/ 会让一次联网运行往仓库里丢一个不该入库的大 jpg。
SCRATCH = ROOT / "_scratch"
SCRATCH.mkdir(exist_ok=True)
SRC = SCRATCH / "earth-night-src.jpg"
OUT = ROOT / "assets" / "earth-night.jpg"
URL = "https://unpkg.com/three-globe/example/img/earth-night.jpg"

W_OUT, H_OUT = 2048, 1024
WARM_FLOOR = 0.004        # 暖度下限：低于它的都算地表蓝调底噪
WARM_GAIN = 9.0           # 暖度映射增益：暖度 0.004+1/9 ≈ 0.115 起满亮
BOOST = 2.3               # 整体提亮：原图灯光峰值也不过 0.5 上下，不提亮在几百像素的地球上几乎看不见
GLOW = ((7, 1.00), (26, 0.80), (70, 0.50), (150, 0.28), (260, 0.14))
# 多重晕开：(半径, 权重)。近几档把单像素灯点铺成一团小光斑，远两档（150 / 260）
# 让同一片城市群连成一块发亮的地带——手机上地球只有一百多 CSS 像素宽，
# 只有「块」看得出是城市，单像素的「点」到了屏幕上就没了。
TINT = (1.0, 0.87, 0.64)  # 烘进贴图的暖金色（app.js 侧还会再乘一层极淡的 tint）

if not SRC.exists():
    print("下载源图 %s" % URL)
    urllib.request.urlretrieve(URL, SRC)

a = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32) / 255.0
warmth = a[:, :, 0] - a[:, :, 2]
lum = a.max(axis=2)

sig = np.clip((warmth - WARM_FLOOR) * WARM_GAIN, 0, 1) * BOOST
# 极暗的暖色像素是传感器噪点而不是灯，按亮度压一档
sig = np.clip(sig * np.clip(lum * 2.6, 0.25, 1.0), 0, 1)
print("灯光像素占比 %.3f%%（原图 %d×%d）" % (100.0 * float((sig > 0.05).mean()), a.shape[1], a.shape[0]))

s = Image.fromarray((sig * 255.0 + 0.5).astype(np.uint8))
glow = sig.copy()
for r, w in GLOW:
    glow += w * (np.asarray(s.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255.0)
out = np.clip(glow, 0, 1)

rgb = np.stack([out * TINT[0], out * TINT[1], out * TINT[2]], axis=2)
img = Image.fromarray((np.clip(rgb, 0, 1) * 255.0 + 0.5).astype(np.uint8)).resize((W_OUT, H_OUT), Image.LANCZOS)
img.save(OUT, quality=88, optimize=True, progressive=True)
print("写出 %s（%d×%d，%.1f KB）" % (OUT.relative_to(ROOT), W_OUT, H_OUT, OUT.stat().st_size / 1024.0))
