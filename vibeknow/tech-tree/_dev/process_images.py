# -*- coding: utf-8 -*-
"""把生成出来的原始 PNG 批量转成合规 WebP：按清单尺寸缩放、按体积预算自动调质量。

原始图放 `_dev/raw_img/<base>.png`（base 见 _dev/image-prompts.json），
输出到 `assets/img/<base>.webp`。

用法：python _dev/gen_image_prompts.py && python _dev/process_images.py
"""
import io
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "_dev", "raw_img")
OUT = os.path.join(BASE, "assets", "img")
PROMPTS = os.path.join(BASE, "_dev", "image-prompts.json")

os.makedirs(OUT, exist_ok=True)

with open(PROMPTS, "r", encoding="utf-8") as f:
    data = json.load(f)

LIMIT_ITEM = 45 * 1024   # 45 KB
LIMIT_COVER = 90 * 1024  # 90 KB


def save_webp_target(img, target_size_bytes, start_q):
    """Save img as WebP, lowering quality until it fits target_size."""
    q = start_q
    while q >= 40:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=q, method=6)
        size = buf.tell()
        if size <= target_size_bytes:
            return buf.getvalue(), q, size
        q -= 5
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=q, method=6)
    return buf.getvalue(), q, buf.tell()


results = []
total_bytes = 0
missing = []
for item in data["images"]:
    base = item["base"]
    kind = item["kind"]
    w, h = [int(x) for x in item["size"].split("x")]
    raw_path = os.path.join(RAW, base + ".png")
    out_path = os.path.join(OUT, base + ".webp")

    if not os.path.exists(raw_path):
        missing.append(base)
        continue

    img = Image.open(raw_path).convert("RGB")
    img = img.resize((w, h), Image.LANCZOS)

    limit = LIMIT_COVER if kind == "cover" else LIMIT_ITEM
    start_q = 75 if kind == "cover" else 80
    webp_bytes, q, fsize = save_webp_target(img, limit, start_q)

    with open(out_path, "wb") as f:
        f.write(webp_bytes)

    total_bytes += fsize
    results.append((base, kind, w, h, q, fsize))

print("%-24s %-6s %-10s %-5s %9s %8s" % ("file", "kind", "size", "q", "bytes", "KB"))
print("-" * 68)
for base, kind, w, h, q, fsize in results:
    over = " OVER!" if (kind == "item" and fsize > LIMIT_ITEM) or (kind == "cover" and fsize > LIMIT_COVER) else ""
    print("%-24s %-6s %-10s q=%-3d %9d %7.1fKB%s" % (base + ".webp", kind, "%dx%d" % (w, h), q, fsize, fsize / 1024, over))
print("-" * 68)
print("Total: %d files, %.2f MB (budget 1.8 MB)" % (len(results), total_bytes / 1024 / 1024))
if missing:
    print("raw_img 里找不到 %d 张（未处理）：%s%s"
          % (len(missing), ", ".join(missing[:8]), " …" if len(missing) > 8 else ""))
over = [r for r in results if (r[1] == "item" and r[5] > LIMIT_ITEM) or (r[1] == "cover" and r[5] > LIMIT_COVER)]
if over:
    print("WARNING: %d files over budget: %s" % (len(over), [r[0] for r in over]))
elif results:
    print("All files within size budget.")
