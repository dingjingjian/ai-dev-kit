# -*- coding: utf-8 -*-
"""
把「世界美食图鉴」打包成可分发 zip（小工具容器要求 index.html 在 zip 根目录）。

包含：index.html、assets/（js、贴图、36 张菜品 webp）
排除：_dev/（脚本）、dist/（产物）、docs/、xiaohongshu/、README.md、.git

用法：
  python _dev/build_zip.py
"""
import argparse
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "dist" / "world-food-atlas.zip"

INCLUDE_FILES = {"index.html"}
INCLUDE_DIRS = {"assets"}
SKIP_DIRS = {"_dev", "dist", "docs", "xiaohongshu", ".git", "node_modules", "__pycache__"}


def collect():
    out = []
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if set(rel.parts) & SKIP_DIRS or not p.is_file():
            continue
        if rel.name in INCLUDE_FILES or rel.parts[0] in INCLUDE_DIRS:
            out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    files = collect()
    total = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            data = p.read_bytes()
            z.writestr(p.relative_to(ROOT).as_posix(), data)
            total += len(data)
    print("打包 %d 个文件 -> %s" % (len(files), out))
    print("压缩前合计 %.2f KB，zip %.2f KB" % (total / 1024, out.stat().st_size / 1024))
    names = [p.relative_to(ROOT).as_posix() for p in files]
    if "index.html" not in names:
        print("错误：缺少根目录 index.html")


if __name__ == "__main__":
    main()
