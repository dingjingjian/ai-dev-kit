# -*- coding: utf-8 -*-
"""
小工具 ZIP 打包（纯打包，不含修复逻辑）。
修复一律直接改 index.html / main.js 后重跑本脚本。

流程：前置校验 -> 构建 dist（index.html + main.js + assets/）-> 压缩 dist 的「内容」。
保证 index.html 位于 zip 根目录（不能多套一层目录）。

用法：python _dev/build_zip.py
"""
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ZIP = ROOT / "vehicle-atlas.zip"
ASSETS = ROOT / "assets"
ALLOWED_EXT = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
               ".webp", ".svg", ".woff", ".woff2", ".json"}
IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
ZIP_LIMIT = 10 * 1024 * 1024
ZIP_SUGGEST = 2 * 1024 * 1024
sys.stdout.reconfigure(encoding="utf-8")

html = (ROOT / "index.html").read_text(encoding="utf-8")
js = (ROOT / "main.js").read_text(encoding="utf-8")

# ---------- 前置校验：不合规直接拒绝打包 ----------
GUARDS = [
    ("脚本已外置，无内联 <script>", not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I)),
    ("index.html 引用 ./main.js", '<script src="./main.js"></script>' in html),
    ("JS 为经典脚本，无 import/export", not re.search(r"^\s*(import|export)\s", js, re.M)),
    ("无 type=\"module\" / top-level await",
     'type="module"' not in html and not re.search(r"^\s*await\s", js, re.M)),
    ("安全区用 var(--safe-area-inset-*, env(...)) 组合",
     "var(--safe-area-inset-top, env(safe-area-inset-top, 0px))" in html),
    ("viewport 含 viewport-fit=cover", "viewport-fit=cover" in html),
    ("无 http(s) 外部资源引用",
     not [u for u in re.findall(r"https?://[^\s\"')]+", html + js) if "www.w3.org" not in u]),
    ("无内联事件 on*=", not re.search(r"\son[a-z]+\s*=\s*[\"']", html, re.I)),
    ("无 eval / new Function / WebAssembly", not re.search(
        r"\beval\s*\(|new\s+Function\b|WebAssembly\.", js)),
    ("无 <base> / <iframe> / <object> / CSP meta", not re.search(
        r"<base\b|<iframe\b|<object\b|http-equiv\s*=\s*[\"']?Content-Security-Policy", html, re.I)),
    ("无 target=\"_blank\" / a[download] / window.open / window.prompt", not re.search(
        r'target\s*=\s*"_blank"|\[download\]|window\.open|window\.prompt', html + js)),
    ("禁用能力：无网络请求 / 实时通信", not re.search(
        r"fetch\s*\(|XMLHttpRequest|new\s+WebSocket|new\s+EventSource|RTCPeerConnection", js)),
    ("禁用能力：无定位 / 传感器 / 硬件连接", not re.search(
        r"geolocation|BlueTooth|navigator\.bluetooth|navigator\.usb|navigator\.hid|navigator\.serial|"
        r"DeviceMotion|DeviceOrientation|Accelerometer|Gyroscope|Magnetometer", js)),
    ("禁用能力：无 Worker / ServiceWorker / 屏幕共享", not re.search(
        r"new\s+Worker|new\s+SharedWorker|serviceWorker|getDisplayMedia|requestFullscreen", js)),
    # device-capabilities.md §3：剪贴板 API（navigator.clipboard / execCommand）已禁用
    ("禁用能力：无剪贴板 API（navigator.clipboard / execCommand）", not re.search(
        r"navigator\.clipboard|execCommand", js)),
    ("未用 UA / 机型判断能力", not re.search(
        r"userAgent|/xiaohongshu|redbook|xhslink", js, re.I)),
    ("未硬编码绝对路径", not re.search(r"[A-Za-z]:\\\\|/Users/|/home/", js)),
    ("图片后缀回退链存在（webp/jpg/png）",
     all('"%s"' % e in js for e in ("webp", "jpg", "png"))),
]
print("—— 打包前置校验 ——")
failed = [name for name, ok in GUARDS if not ok]
for name, ok in GUARDS:
    print("  [%s] %s" % ("✓" if ok else "✗", name))
if failed:
    sys.exit("前置校验未通过，拒绝打包。请先修复后重新运行。")

# ---------- 配图盘点（图片由图像生成 agent 产出，缺失不阻塞打包） ----------
ids = re.findall(r'\{id:"([a-z0-9-]+)"', js)
cat_keys = re.findall(r'\{key:"([a-z0-9-]+)"', js)
expect = ["cover-" + k for k in cat_keys] + ids
have, miss_bytes = [], 0
if ASSETS.is_dir():
    for p in ASSETS.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXT:
            have.append(p.stem)
            miss_bytes += p.stat().st_size
missing = [b for b in expect if b not in have]
print("\n—— 配图盘点 ——")
print("  期望 %d 张（%d 张分类封面 + %d 张条目图），已就位 %d 张"
      % (len(expect), len(cat_keys), len(ids), len([b for b in expect if b in have])))
if missing:
    print("  未就位 %d 张（页面显示占位块，不影响打包）: %s%s"
          % (len(missing), ", ".join(missing[:6]), " …" if len(missing) > 6 else ""))
if have:
    print("  已就位图片合计 %.1f KB" % (miss_bytes / 1024))
    if miss_bytes > 1.8 * 1024 * 1024:
        print("  [!] 图片体积超过 1.8MB 建议值，请压缩尺寸 / 质量后再交付")

# ---------- 构建 dist ----------
if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir(parents=True)
for name in ("index.html", "main.js"):
    shutil.copy2(ROOT / name, DIST / name)
# 只拷贝被 main.js 引用的配图：命名对不上的历史遗留图 / 下线条目图不再进包，
# 也就不会白白撑大 zip（assets/ 下仍保留原文件，需要时自行清理）。
copied, unreferenced = [], []
if ASSETS.is_dir():
    for pth in sorted(ASSETS.rglob("*")):
        if not pth.is_file() or pth.suffix.lower() not in ALLOWED_EXT:
            continue
        if pth.suffix.lower() in IMG_EXT and pth.stem not in expect:
            unreferenced.append(pth)
            continue
        rel = pth.relative_to(ASSETS)
        (DIST / "assets" / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(pth, DIST / "assets" / rel)
        copied.append(rel.as_posix())
if unreferenced:
    print("\n  未引用的配图 %d 张，已排除在 dist / zip 之外（可按需清理）: %s%s"
          % (len(unreferenced), ", ".join(p.name for p in unreferenced[:6]),
             " …" if len(unreferenced) > 6 else ""))
print("\ndist: %s" % sorted(p.as_posix() for p in DIST.rglob("*") if p.is_file())[:6])

# ---------- 打包 ----------
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(DIST.rglob("*")):
        if p.is_dir():
            continue
        if p.name == ".DS_Store" or p.suffix not in ALLOWED_EXT:
            print("  跳过（类型不允许）：%s" % p.as_posix())
            continue
        z.write(p, p.relative_to(DIST).as_posix())      # 相对 dist -> 落在 zip 根

with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
size = ZIP.stat().st_size
assert "index.html" in names, "index.html 不在 zip 根目录"
assert not any(n.endswith("/index.html") for n in names), "存在嵌套的 index.html"
assert not any(n.startswith(DIST.name + "/") for n in names), "多套了一层目录"
bad = [n for n in names if Path(n).suffix not in ALLOWED_EXT]
assert not bad, "含不支持的文件类型：%s" % bad

print("\n产物：%s" % ZIP)
print("体积：%.1f KB（上限 10MB，建议 ≤2MB，%s）"
      % (size / 1024, "通过" if size <= ZIP_SUGGEST else "超过建议值但不影响上传"))
print("文件：%d 个，index.html 位于 zip 根，无多余层级 ✅" % len(names))
