# -*- coding: utf-8 -*-
"""ai-os 小工具 ZIP 打包（纯打包，不含修复逻辑）。

修复一律改 _dev/build.py（唯一真源）后重跑 `python _dev/build.py`。

流程：前置校验（不合规直接拒绝打包）-> 构建 dist（index.html + main.js）
      -> 压缩 dist 的「内容」-> 校验 index.html 位于 zip 根目录。

规范真源：DESIGN.md §5/§6；容器与兼容细则见仓库 .skill/minitool-zip-builder/。
用法：python _dev/build_zip.py
"""
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # ai-os/
DIST = ROOT / "dist"
ZIP = ROOT / "ai-os.zip"
ALLOWED_EXT = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
               ".webp", ".svg", ".woff", ".woff2", ".json"}
sys.stdout.reconfigure(encoding="utf-8")

html = (ROOT / "index.html").read_text(encoding="utf-8")
js = (ROOT / "main.js").read_text(encoding="utf-8")

# ---------- 前置校验：不合规直接拒绝打包 ----------
GUARDS = [
    # 包结构 / 入口
    ("脚本已外置，无内联 <script>", not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I)),
    ("index.html 引用 ./main.js", '<script src="./main.js"></script>' in html),
    ("JS 为经典脚本，无 import/export", not re.search(r"^\s*(import|export)\s", js, re.M)),
    ("无 <base href> / <iframe> / <object>", not re.search(r"<base\b|<iframe\b|<object\b", html, re.I)),
    ("无内联事件 on*=", not re.search(r"\son[a-z]+\s*=\s*[\"']", html, re.I)),
    ("无 eval / new Function", not re.search(r"\beval\s*\(|new\s+Function\b", js)),
    # 外部资源（邮件/规范里的 xmlns 除外）
    ("无 http(s) 外部资源引用",
     not [u for u in re.findall(r"https?://[^\s\"')]+", html + js) if "www.w3.org" not in u]),
    # 容器适配（DESIGN.md §2）
    ("安全区用 var(--safe-area-inset-*, env(...)) 组合",
     "var(--safe-area-inset-top, env(safe-area-inset-top, 0px))" in html),
    ("顶部显式预留 --top-gap", "--top-gap:50px" in html),
    ("未用 UA 自动判定宿主 App 内缩", "/xiaohongshu|redbook|xhslink/i" not in js),
    # 禁用能力（device-capabilities.md §3/§4/§7）
    ("禁用能力零命中（联网/Worker/WebRTC/定位/剪贴板/全屏/新窗口等）", not re.search(
        r"fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection"
        r"|new\s+Worker|SharedWorker|serviceWorker"
        r"|geolocation|clipboard|execCommand|navigator\.(bluetooth|usb|hid|serial)"
        r"|getBattery|navigator\.connection|navigator\.credentials|navigator\.locks"
        r"|mediaDevices|getUserMedia|requestFullscreen|window\.open\s*\(|window\.prompt\s*\("
        r"|WebAssembly\.|\.download\s*=|target\s*=\s*[\"']_blank[\"']", js)),
    # 存储（小红书容器能力清单 §2.4/§3.6/§3.7）：容器 Storage 优先、localStorage 仅降级
    ("存储走容器 Storage JS API", "miniTool" in js and "setStorage" in js and "getStorage" in js),
    ("保留下拉级通道 localStorage", "localStorage.setItem" in js and "localStorage.getItem" in js),
    ("存储 key 前缀 aios_", "STORE_PREFIX = 'aios_'" in js),
    ("版本判断忽略 buildVersion 末 3 位", "Math.floor(buildVersion / 1000)" in js
     and "STORAGE_MIN_CLIENT_VERSION = 9460" in js),
]
print("—— 打包前置校验 ——")
failed = [name for name, ok in GUARDS if not ok]
for name, ok in GUARDS:
    print("  [%s] %s" % ("✓" if ok else "✗", name))
if failed:
    sys.exit("前置校验未通过，拒绝打包。请先修 _dev/build.py 后重新生成。")

# ---------- 构建 dist ----------
if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir(parents=True)
for name in ("index.html", "main.js"):
    shutil.copy2(ROOT / name, DIST / name)
print("\ndist: %s" % sorted(p.name for p in DIST.iterdir()))

# ---------- 打包（压缩 dist 的内容，index.html 落在 zip 根） ----------
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(DIST.rglob("*")):
        if p.is_dir():
            continue
        if p.name == ".DS_Store" or p.suffix not in ALLOWED_EXT:
            print("  跳过（类型不允许）：%s" % p.name)
            continue
        z.write(p, p.relative_to(DIST).as_posix())

with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
size = ZIP.stat().st_size
assert "index.html" in names, "index.html 不在 zip 根目录"
assert not any("/" in n for n in names), "存在子目录层级"

print("\n产物：%s" % ZIP)
print("体积：%.1f KB（上限 10MB，建议 ≤2MB，%s）"
      % (size / 1024, "通过" if size <= 2 * 1024 * 1024 else "超建议值"))
print("内容：%s" % names)
print("校验：index.html 位于 zip 根，无多余层级 ✅")
print("提醒：交付前跑 .skill/minitool-zip-builder/scripts/audit_artifact.py（或 .mjs）复核体积门禁。")
