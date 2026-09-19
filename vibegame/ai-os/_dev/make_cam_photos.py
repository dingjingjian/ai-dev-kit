# -*- coding: utf-8 -*-
"""相机取景素材派生脚本（只读来源，产物入库）。

来源（**只读**，不修改、不移动）：
  vibeknow/world-food-3d/assets/foods/*.webp     美食（36 张，跳过 _placeholder）

产物：vibegame/ai-os/assets/cam/food-<slug>.webp
  统一 512×512（与来源同尺寸，不缩图）/ WebP q80 —— 取景框只有手机屏宽级别，
  原图分辨率已是上限，重编码只做一次收口（36 张合计 ~0.95 MB），
  以守住小工具 2 MB 建议体积（见 .skill/minitool-zip-builder 的
  performance-budget.md：10 MiB 硬上限、2 MiB 建议值）。

取材前缀（food）防重名，也让 `_dev/build.py` 里的清单一眼看出图来自哪个项目；
相机取景框只认 `assets/cam/*.webp` 这个目录，新增来源时改本脚本（加一段 SOURCES
即可）后重跑即可 —— 注意加来源会直接抬高 zip 体积，先算账再动手。

用法：python _dev/make_cam_photos.py      # 幂等：每次清空产物目录重建
"""
import io
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))              # ai-os/
REPO = os.path.normpath(os.path.join(ROOT, "..", ".."))        # 仓库根
OUT = os.path.join(ROOT, "assets", "cam")

SIZE = 512
QUALITY = 80
# 体积红线：zip 2 MB 建议值 − 产物其余部分（index/main/three/moon/avatar ≈ 560 KB）≈ 1.45 MB，
# 此处再留一档余量取 1.0 MB（当前实产 ~0.95 MB，zip ~1.5 MB，audit 0 warning）
BUDGET_KB = 1000

# (前缀, 源目录, 排除的文件名)
SOURCES = [
    ("food", os.path.join(REPO, "vibeknow", "world-food-3d", "assets", "foods"), {"_placeholder.webp"}),
]

sys.stdout.reconfigure(encoding="utf-8")

if not os.path.isdir(OUT):
    os.makedirs(OUT)
stale = 0
for name in os.listdir(OUT):
    if name.endswith(".webp"):
        os.remove(os.path.join(OUT, name))
        stale += 1
if stale:
    print("清空旧产物：%d 个" % stale)

total = 0
count = 0
for prefix, src_dir, skip in SOURCES:
    if not os.path.isdir(src_dir):
        sys.exit("源目录不存在：%s" % src_dir)
    names = sorted(n for n in os.listdir(src_dir)
                   if n.endswith(".webp") and n not in skip)
    if not names:
        sys.exit("源目录没有图片：%s" % src_dir)
    for name in names:
        src = os.path.join(src_dir, name)
        dst = os.path.join(OUT, "%s-%s" % (prefix, name))
        im = Image.open(src).convert("RGB")
        if im.size != (SIZE, SIZE):
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=QUALITY, method=6)
        with open(dst, "wb") as f:
            f.write(buf.getvalue())
        total += buf.tell()
        count += 1
    print("%-5s %2d 张  <- %s" % (prefix, len(names), os.path.relpath(src_dir, REPO)))

print("产物：%s（%d 张，%.1f KB，%.1f KB/张）"
      % (os.path.relpath(OUT, ROOT), count, total / 1024, total / 1024 / max(count, 1)))
if total / 1024 > BUDGET_KB:
    print("警告：素材合计 %.1f KB 超过 %d KB 预算，请下调 SIZE/QUALITY 或精简来源"
          % (total / 1024, BUDGET_KB))
