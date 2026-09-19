# -*- coding: utf-8 -*-
"""ai-os 小工具 ZIP 打包（纯打包，不含修复逻辑）。

修复一律改 _dev/build.py（唯一真源）后重跑 `python _dev/build.py`。

流程：前置校验（不合规直接拒绝打包）-> 构建 dist（index.html + main.js）
      -> 压缩 dist 的「内容」-> 校验 index.html 位于 zip 根目录。

规范真源：DESIGN.md §5/§6；容器与兼容细则见仓库 .skill/minitool-zip-builder/。
用法：python _dev/build_zip.py
"""
import json
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # ai-os/
DIST = ROOT / "dist"
ZIP = ROOT / "ai-os.zip"
# 仓库根 TRACKS.md：「应用商店」的数据真源（_dev/build.py 在构建期解析后注入 main.js）
# ROOT 已是 ai-os/，故上溯两级到仓库根（vibegame/ai-os -> vibegame -> 仓库根）
TRACKS = (ROOT / ".." / ".." / "TRACKS.md").resolve()
ALLOWED_EXT = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
               ".webp", ".svg", ".woff", ".woff2", ".json"}
sys.stdout.reconfigure(encoding="utf-8")

html = (ROOT / "index.html").read_text(encoding="utf-8")
js = (ROOT / "main.js").read_text(encoding="utf-8")


def store_expected():
    """独立解析 TRACKS.md（与 _dev/build.py 各写一遍），取所有「应用」的 (名称, 目录)。

    只作门禁对拍用：打包前确认 main.js 里的商店清单确实由它派生 —— 手抄一份、
    或改了 TRACKS.md 却忘了重跑构建，都会在这里被挡下（.skill/ 是技能，不算应用）。
    """
    head = re.compile(r"^##\s*#([a-z]+)[\s\u3000]*(.+?)\s*[（(]\d+[）)]\s*$")
    out, cur = [], None
    with open(TRACKS, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            m = head.match(line)
            if m:
                cur = m.group(1)
                continue
            if cur is None or not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 4:
                continue
            name, path = cells[0], cells[1].strip("`")
            if not path.endswith("/") or path.startswith(".skill/"):
                continue
            out.append((name, path))
    return out


STORE_ITEMS = store_expected() if TRACKS.exists() else []


def store_in_sync():
    """main.js 里逐项能对上 TRACKS.md（json.dumps 默认分隔符，故可整段子串比对）。"""
    if not STORE_ITEMS or "var STORE_GROUPS = [" not in js:
        return False
    for name, path in STORE_ITEMS:
        pair = '"n": %s, "d": %s' % (json.dumps(name, ensure_ascii=False),
                                     json.dumps(path, ensure_ascii=False))
        if pair not in js:
            return False
    return True


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
    # 第三方库本地化：Three.js 随包分发（./assets/three.min.js），不引任何 CDN。
    # 注意：受扫描的只有"我们自己的代码"（index.html + main.js）；three.min.js 是上游产物，
    # 其中的 http(s) 字样与内部 loader 不会在运行时被触发（本项目只用静态场景 + 本地贴图）。
    ("Three.js 走本地 ./assets/（无 CDN）",
     '<script src="./assets/three.min.js"></script>' in html
     and not re.search(r"<script[^>]+src\s*=\s*[\"']https?://", html, re.I)),
    ("月面贴图随包分发（./assets/moon.jpg）", (ROOT.parent / "assets" / "moon.jpg").exists()
     or (ROOT / "assets" / "moon.jpg").exists()),
    ("启动头像随包分发（./assets/avatar.png）", (ROOT / "assets" / "avatar.png").exists()),
    # 相机取景素材：三个 vibeknow 项目派生的小图（_dev/make_cam_photos.py），随包分发
    ("相机取景素材随包分发（./assets/cam/*.webp）", len(list((ROOT / "assets" / "cam").glob("*.webp"))) >= 3),
    ("相机素材清单指向包内相对路径", "./assets/cam/" in js),
    ("版本判断忽略 buildVersion 末 3 位", "Math.floor(buildVersion / 1000)" in js
     and "STORAGE_MIN_CLIENT_VERSION = 9460" in js),
    # 系统音效（DESIGN.md §4.11）：Web Audio 实时合成，零音频文件、无音频标签
    ("音效为 Web Audio 实时合成（webkit 前缀兜底 + 振荡器）",
     "webkitAudioContext" in js and "createOscillator" in js and "AudioContext" in js),
    ("无音频标签 / 音频文件（音效不引任何外部资源）",
     not re.search(r"<audio\b|<video\b|\.mp3|\.wav|\.ogg|\.m4a|\.aac", html + js, re.I)
     and not [p for ext in ("*.mp3", "*.wav", "*.ogg", "*.m4a")
              for p in (ROOT / "assets").rglob(ext)]),
    ("音效可整体静音（data-sfx 派发 + aios_sound 落盘）",
     "data-sfx" in js and "'sound'" in js and "sfxSetEnabled" in js),
    # 应用商店（DESIGN.md §4.12）：清单构建期由仓库根 TRACKS.md 派生后注入 main.js。
    ("应用商店清单与仓库根 TRACKS.md 一致（构建期派生，非手抄）", store_in_sync()),
    ("应用商店含四大分类", all(('"%s"' % t) in js
                          for t in ("vibetool", "vibegame", "vibeart", "vibeknow"))),
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
# 运行时资源：Three.js / 月面贴图 / 启动头像 / 相机取景素材（assets/ 原样搬运）
ASSETS = ROOT / "assets"
shutil.copytree(ASSETS, DIST / "assets")
dist_files = sorted(p.relative_to(DIST).as_posix() for p in DIST.rglob("*") if p.is_file())
cam_n = len([f for f in dist_files if f.startswith("assets/cam/")])
print("\ndist：%d 个文件（根 %d + assets/cam %d + assets 其余 %d）"
      % (len(dist_files), len([f for f in dist_files if "/" not in f]),
         cam_n, len(dist_files) - cam_n - len([f for f in dist_files if "/" not in f])))
print("      %s" % [f for f in dist_files if not f.startswith("assets/cam/")])

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
# 允许 zip 根 + assets/ 子树：Three.js / 月面贴图 / 头像 / 相机素材都放 assets/
# （相机素材按其来源再分一层 assets/cam/，便于与上游项目对应）。
# 规范未限制嵌套层级（zip-artifact-spec.md §1：除 index.html 必须在根外，
# 其余文件可自由平铺或分目录），但仍禁止绝对路径与 ../ 逃逸，并要求顶层只出现 assets/。
for n in names:
    assert not n.startswith("/") and ".." not in n, "存在越界路径：%s" % n
    parts = n.split("/")
    assert len(parts) <= 3 and (len(parts) == 1 or parts[0] == "assets"), \
        "只允许 zip 根与 assets/ 子树（含一层次目录）：%s" % n

print("\n产物：%s" % ZIP)
print("体积：%.1f KB（上限 10MB，建议 ≤2MB，%s）"
      % (size / 1024, "通过" if size <= 2 * 1024 * 1024 else "超建议值"))
print("内容：%s" % names)
print("校验：index.html 位于 zip 根；子目录仅在 assets/ 子树内 ✅")
print("提醒：交付前跑 .skill/minitool-zip-builder/scripts/audit_artifact.py（或 .mjs）复核体积门禁。")
