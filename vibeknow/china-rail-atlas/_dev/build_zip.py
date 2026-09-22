# -*- coding: utf-8 -*-
"""
把图鉴站点打包成可分发 zip（≤ 2 MB，图片是主要体积来源）。

包含：index.html、main.js、assets/（含生成的 .webp）、README.md。
排除：_dev/（脚本与参考照片）、.git、*.log、node_modules。

用法：
  python _dev/build_zip.py
  python _dev/build_zip.py --out china-rail-atlas.zip
"""
import argparse
import os
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "china-rail-atlas.zip"

INCLUDE_DIRS = {"assets"}
INCLUDE_FILES = {"index.html", "main.js", "README.md"}
SKIP_DIRS = {"_dev", ".git", "node_modules", "__pycache__"}


def collect():
    out = []
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        parts = set(rel.parts)
        if parts & SKIP_DIRS:
            continue
        if p.is_dir():
            continue
        if p.suffix == ".log":
            continue
        if rel.name in INCLUDE_FILES or rel.parts[0] in INCLUDE_DIRS:
            out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()
    out = Path(args.out)

    files = collect()
    total = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            data = p.read_bytes()
            z.writestr(str(p.relative_to(ROOT)), data)
            total += len(data)
    print("打包 %d 个文件 → %s" % (len(files), out))
    print("未压缩体积合计 %.2f KB（zip 体积略小）" % (total / 1024))
    if total > 2_000_000:
        print("⚠️ 超过 2 MB 上限，请先跑 python _dev/process_images.py 压图")


if __name__ == "__main__":
    main()
