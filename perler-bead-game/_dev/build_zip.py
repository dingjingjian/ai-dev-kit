# -*- coding: utf-8 -*-
"""
小工具 ZIP 打包（纯打包，不含修复逻辑）
修复一律改 _dev/build.py（唯一真源）后重跑 `python _dev/build.py`。

前置校验 -> 构建 dist（仅 index.html + main.js）-> 压缩 dist 的“内容”
保证 index.html 位于 zip 根目录（不能多套一层目录）。

用法：python _dev/build_zip.py
"""
import os, re, shutil, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # perler-bead-game/
DIST = ROOT / "dist"
ZIP = ROOT / "perler-bead-game.zip"
ALLOWED_EXT = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
               ".webp", ".svg", ".woff", ".woff2", ".json"}
sys.stdout.reconfigure(encoding="utf-8")

html = (ROOT / "index.html").read_text(encoding="utf-8")
js = (ROOT / "main.js").read_text(encoding="utf-8")

# ---------- 前置校验：不合规直接拒绝打包 ----------
GUARDS = [
    ("脚本已外置，无内联 <script>", not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I)),
    ("index.html 引用 ./main.js", '<script src="./main.js"></script>' in html),
    ("JS 为经典脚本，无 import/export", not re.search(r"^\s*(import|export)\s", js, re.M)),
    ("安全区用 var(--safe-area-inset-*, env(...)) 组合",
     "var(--safe-area-inset-top, env(safe-area-inset-top, 0px))" in html),
    ("未用 UA 自动判定宿主 App 内缩", "/xiaohongshu|redbook|xhslink/i" not in js),
    ("无 http(s) 外部资源引用",
     not [u for u in re.findall(r"https?://[^\s\"')]+", html) if "www.w3.org" not in u]),
]
print("—— 打包前置校验 ——")
failed = [name for name, ok in GUARDS if not ok]
for name, ok in GUARDS:
    print(f"  [{'✓' if ok else '✗'}] {name}")
if failed:
    sys.exit("前置校验未通过，拒绝打包。请先修 _dev/build.py 后重新生成。")

# ---------- 构建 dist ----------
if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir(parents=True)
for name in ("index.html", "main.js"):
    shutil.copy2(ROOT / name, DIST / name)
print(f"\ndist: {sorted(p.name for p in DIST.iterdir())}")

# ---------- 打包 ----------
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(DIST.rglob("*")):
        if p.is_dir():
            continue
        if p.name == ".DS_Store" or p.suffix not in ALLOWED_EXT:
            print(f"  跳过（类型不允许）：{p.name}")
            continue
        z.write(p, p.relative_to(DIST).as_posix())      # 相对 dist -> 落在 zip 根

with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
size = ZIP.stat().st_size
assert "index.html" in names, "index.html 不在 zip 根目录"
assert not any("/" in n for n in names), "存在子目录层级"

print(f"\n产物：{ZIP}")
print(f"体积：{size/1024:.1f} KB（上限 10MB，建议 ≤2MB，{'通过' if size <= 2*1024*1024 else '超建议值'}）")
print(f"内容：{[n for n in names]}")
print("校验：index.html 位于 zip 根，无多余层级 ✅")
