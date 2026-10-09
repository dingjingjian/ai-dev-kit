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
import base64
import re
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
GLOW = ((5, 1.00), (16, 0.90), (40, 0.50), (80, 0.22))
# 多重晕开：(半径, 权重)。近三档把单像素灯点铺成一团小光斑、把同一片城市群连成
# 一块发亮的地带——手机上地球只有一百多 CSS 像素宽，只有「块」看得出是城市，
# 单像素的「点」到了屏幕上就没了。
#
# ⚠ 2026-10-09 大幅收紧（原为 (7,1.00)(26,0.80)(70,0.50)(150,0.28)(260,0.14)）：
#   原配方在 4096 宽的源图上最大半径 260px = **22.9°≈2500km**，等于把「城市块」
#   直接糊成「整片海都在发光」—— 实测近海水面平均亮度被抬到东海 0.043 / 日本海 0.036 /
#   美东近海 0.052 / 地中海西 0.059（P90 0.11），与「关灯对照帧」一比肉眼即见。
#   现最大 62px = 5.45°≈600km：390 宽的手机屏上约 23px（1° ≈ 4.2px），
#   刚好是「一块看得见的城市群」，不会再淹掉邻海。半径是这次的关键量，权重只调幅。
#   改完务必重跑 tests/smoke-render.py 的夜景探针（灯火核心亮度 / litFrac 都要复核）。
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


def land_gate(h, w):
    """把灯火限制在陆地上（与 src/landmask.js 同一份 1° 掩膜）。

    ⚠ 2026-10-09 加。起因：实机看夜面「大海都是亮的」。查下来是两个来源叠加：
      ① 大半径高斯把近岸城市糊向海面（旧配方最大半径 260px = 22.9°≈2500km）；
      ② 更主要的 —— 原图（NASA 黑大理石）**海上本来就有大片暖色像素**：东亚 / 黄海 /
         日本海的渔船编队是黑大理石里最著名的海上光源。所以只收紧半径治不了本：
         实测东海水面平均亮度 0.043→0.046，纹丝不动（那些亮像素本来就在水里）。
    做法：先向海「膨胀」1 格（≈111km）—— 1° 掩膜的格心常落在海里，而曼哈顿 / 伦敦 /
      上海这类贴海岸的大城恰好压在这种格上，不膨胀会把它们的核心一起削掉；再轻微模糊
      给出海岸线外侧约一格的柔和过渡，避免 1° 网格被放大成方块边；最后上采样到源图
      分辨率，乘在**晕开之后**的结果上。
    ⚠ 顺序不能反：先门控再晕开，灯光会从岸边渗回海里 —— 等于没做。
    """
    txt = (ROOT / 'src' / 'landmask.js').read_text(encoding='utf-8')
    b64 = re.search(r"var BITS = '([A-Za-z0-9+/=]+)'", txt).group(1)
    bits = np.unpackbits(np.frombuffer(base64.b64decode(b64), dtype=np.uint8))[:360 * 180]
    m = bits.reshape(180, 360).astype(np.float32)          # 1 = 陆地，行 0 = 北纬 90°
    grown = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            grown = np.maximum(grown, np.roll(np.roll(m, dy, 0), dx, 1))
    g = Image.fromarray((grown * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    g = g.resize((w, h), Image.BILINEAR)
    return np.asarray(g, dtype=np.float32) / 255.0


gate = land_gate(out.shape[0], out.shape[1])
print("陆地门：非黑像素 %.3f%% → 门控后 %.3f%%"
      % (100.0 * (out > 0.02).mean(), 100.0 * ((out * gate) > 0.02).mean()))
out = out * gate

rgb = np.stack([out * TINT[0], out * TINT[1], out * TINT[2]], axis=2)
img = Image.fromarray((np.clip(rgb, 0, 1) * 255.0 + 0.5).astype(np.uint8)).resize((W_OUT, H_OUT), Image.LANCZOS)
img.save(OUT, quality=88, optimize=True, progressive=True)
print("写出 %s（%d×%d，%.1f KB）" % (OUT.relative_to(ROOT), W_OUT, H_OUT, OUT.stat().st_size / 1024.0))
