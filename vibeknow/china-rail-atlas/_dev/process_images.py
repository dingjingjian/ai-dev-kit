# -*- coding: utf-8 -*-
"""
把生成好的原图（_dev/raw_img/<base>.png|.jpg|.jpeg）按清单尺寸缩放、转 WebP、
按体积预算自动调质量，输出到 assets/img/<base>.webp。

预算（摘自 _dev/image-spec.md 唯一真源）：
  条目图 640x360，单张 ≤ 45 KB
  分类封面 960x540，单张 ≤ 90 KB
  全部图片合计 ≤ 2.0 MB

用法：
  python _dev/process_images.py            # 处理全部
  python _dev/process_images.py --only loco-03 cover-pax   # 只处理指定 base
  python _dev/process_images.py --check     # 仅统计 assets/img 现状，不重新编码
"""
import argparse
import json
import os
import sys
from pathlib import Path

import PIL.Image

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DEV = ROOT / "_dev"
RAW = DEV / "raw_img"
OUT = ROOT / "assets" / "img"
SPEC = json.load(open(DEV / "image-prompts.json", encoding="utf-8"))

ITEM_BUDGET = 45_000
COVER_BUDGET = 90_000
TOTAL_BUDGET = 2_000_000


def budget_of(size):
    w, h = (int(x) for x in size.split("x"))
    return COVER_BUDGET if (w, h) == (960, 540) else ITEM_BUDGET


def find_raw(base):
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = RAW / (base + ext)
        if p.exists():
            return p
    return None


def encode(path_out, img, w, h, budget):
    """缩放并编码为 WebP，按 budget 自动降质量。返回字节数。"""
    rgb = img.convert("RGB")
    rgb = rgb.resize((w, h), PIL.Image.LANCZOS)
    out_bytes = None
    out_q = None
    for q in (92, 88, 84, 80, 76, 72, 68, 64, 60, 55, 50):
        buf = __import__("io").BytesIO()
        rgb.save(buf, format="WEBP", quality=q, method=6, lossless=False)
        out_bytes = buf.getvalue()
        out_q = q
        if len(out_bytes) <= budget:
            break
    path_out.write_bytes(out_bytes)
    return out_q, len(out_bytes)  # (quality, bytes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None, help="只处理指定 base")
    ap.add_argument("--check", action="store_true", help="仅统计现状")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    if args.check:
        total = 0
        for rec in SPEC["images"]:
            f = OUT / (rec["base"] + ".webp")
            if f.exists():
                total += f.stat().st_size
        print("assets/img 现有 %d 张，合计 %.2f KB / 上限 %.0f KB"
              % (sum(1 for r in SPEC["images"] if (OUT / (r["base"] + ".webp")).exists()),
                 total / 1024, TOTAL_BUDGET / 1024))
        return

    records = SPEC["images"]
    if args.only:
        wanted = set(args.only)
        records = [r for r in records if r["base"] in wanted]

    done = 0
    skipped = 0
    total = 0
    for rec in records:
        base = rec["base"]
        w, h = (int(x) for x in rec["size"].split("x"))
        budget = budget_of(rec["size"])
        raw = find_raw(base)
        if not raw:
            print("跳过（缺原图）: %s  → 请把生成图放到 %s/%s.png" % (base, RAW, base))
            skipped += 1
            continue
        img = PIL.Image.open(raw)
        q, n = encode(OUT / (base + ".webp"), img, w, h, budget)
        flag = "OK" if n <= budget else "超预算!"
        print("%-14s %dx%d  q=%d  %6.1f KB  %s" % (base, w, h, q, n / 1024, flag))
        total += n
        done += 1

    print("-" * 40)
    print("处理 %d 张，跳过 %d 张，本批输出 %.2f KB，累计 assets/img 约 %.2f KB / 上限 %.0f KB"
          % (done, skipped, total / 1024, total / 1024, TOTAL_BUDGET / 1024))


if __name__ == "__main__":
    main()
