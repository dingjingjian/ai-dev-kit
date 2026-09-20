# -*- coding: utf-8 -*-
"""Batch convert raw PNGs to spec WebP: resize, quality-tune to size budget."""
import json, os, io
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "_dev", "raw_img")
OUT = os.path.join(BASE, "assets", "img")
PROMPTS = os.path.join(BASE, "_dev", "image-prompts.json")

os.makedirs(OUT, exist_ok=True)

with open(PROMPTS, "r", encoding="utf-8") as f:
    data = json.load(f)

# per-image size budgets
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
    # fallback: lowest quality
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=q, method=6)
    return buf.getvalue(), q, buf.tell()

results = []
total_bytes = 0
for item in data["images"]:
    base = item["base"]
    kind = item["kind"]
    w, h = [int(x) for x in item["size"].split("x")]
    raw_path = os.path.join(RAW, base + ".png")
    out_path = os.path.join(OUT, base + ".webp")

    img = Image.open(raw_path).convert("RGB")
    # Resize to exact target (LANCZOS for quality)
    img = img.resize((w, h), Image.LANCZOS)

    limit = LIMIT_COVER if kind == "cover" else LIMIT_ITEM
    start_q = 75 if kind == "cover" else 80
    webp_bytes, q, fsize = save_webp_target(img, limit, start_q)

    with open(out_path, "wb") as f:
        f.write(webp_bytes)

    total_bytes += fsize
    results.append((base, kind, w, h, q, fsize))

# Report
print(f"{'file':<22} {'kind':<6} {'size':<10} {'q':<4} {'bytes':>8} {'KB':>7}")
print("-" * 65)
for base, kind, w, h, q, fsize in results:
    flag = ""
    if kind == "item" and fsize > LIMIT_ITEM:
        flag = " OVER!"
    if kind == "cover" and fsize > LIMIT_COVER:
        flag = " OVER!"
    print(f"{base+'.webp':<22} {kind:<6} {w}x{h:<6} q={q:<3} {fsize:>8} {fsize/1024:>6.1f}KB{flag}")

print("-" * 65)
print(f"Total: {len(results)} files, {total_bytes} bytes = {total_bytes/1024/1024:.2f} MB (budget 1.8 MB)")
over = [r for r in results if (r[1]=="item" and r[5]>LIMIT_ITEM) or (r[1]=="cover" and r[5]>LIMIT_COVER)]
if over:
    print(f"WARNING: {len(over)} files over budget: {[r[0] for r in over]}")
else:
    print("All files within size budget.")
