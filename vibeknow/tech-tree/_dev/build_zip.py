# -*- coding: utf-8 -*-
"""小工具 ZIP 打包（纯打包，不含修复逻辑）。
修复一律直接改 index.html / data.js / main.js 后重跑本脚本。

流程：数据校验 + 前置校验 -> 构建 dist（index.html + data.js + main.js + assets/）-> 压缩 dist 的「内容」。
保证 index.html 位于 zip 根目录（不能多套一层目录）。

用法：python _dev/build_zip.py
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_data  # noqa: E402
from parse_data import load  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ZIP = ROOT / "tech-tree.zip"
ASSETS = ROOT / "assets"
ALLOWED_EXT = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
               ".webp", ".svg", ".woff", ".woff2", ".json"}
IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
ZIP_LIMIT = 10 * 1024 * 1024
ZIP_SUGGEST = 2 * 1024 * 1024
sys.stdout.reconfigure(encoding="utf-8")

html = (ROOT / "index.html").read_text(encoding="utf-8")
data = (ROOT / "data.js").read_text(encoding="utf-8")
js = (ROOT / "main.js").read_text(encoding="utf-8")
code = data + js

# ---------- 背景音乐载荷（base64 藏在 assets/audio/bgm.js，由 _dev/audio/make-bgm.mjs 生成）----------
BGM_JS = ASSETS / "audio" / "bgm.js"
bgm_decoded = 0
if BGM_JS.is_file():
    _m = re.search(r'window\.TT_BGM="([A-Za-z0-9+/=]*)"', BGM_JS.read_text(encoding="utf-8"))
    if _m:
        bgm_decoded = len(_m.group(1)) * 3 // 4

# ---------- 内容校验：科技树的数据必须先自洽，否则线会画断 ----------
problems, eras, techs, stats = check_data.collect()
print("—— 数据校验（data.js）——")
print("  时代 %d 个，科技 %d 项，前置关系 %d 条（跨多代虚线 %d 条）"
      % (stats["eras"], stats["techs"], stats["edges"], stats["long_edges"]))
if problems:
    print("  以下问题必须先在 data.js 修掉：")
    for p in problems:
        print("    ✗ " + p)
    sys.exit("数据校验未通过，拒绝打包。")
print("  全部通过 ✅")

# ---------- 前置校验：不合规直接拒绝打包 ----------
GUARDS = [
    ("脚本已外置，无内联 <script>", not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I)),
    ("脚本顺序 data.js → bgm.js → main.js",
     html.index('<script src="./data.js"></script>')
     < html.index('<script src="./assets/audio/bgm.js"></script>')
     < html.index('<script src="./main.js"></script>')),
    ("JS 为经典脚本，无 import/export", not re.search(r"^\s*(import|export)\s", code, re.M)),
    ("无 type=\"module\" / top-level await",
     'type="module"' not in html and not re.search(r"^\s*await\s", code, re.M)),
    ("安全区用 var(--safe-area-inset-*, env(...)) 组合",
     "var(--safe-area-inset-top, env(safe-area-inset-top, 0px))" in html),
    # 容器自带「返回 / 分享 / 更多」按钮行压在最上面，env() 不含它 —— 必须显式预留
    ("顶部显式预留 --top-gap（宿主按钮行）",
     "--top-gap:50px" in html and "height:var(--safe-top)" in html),
    ("标题放在预留带中间（不挤第二行，小屏也不换行）",
     '<div class="topband">' in html and ".topband h1" in html
     and "text-overflow:ellipsis" in html),
    ("顶部预留带普通值兜底（--safe-top 链失效也不塌）",
     "min-height:50px" in html and "--top-gap:70px" in html),
    ("容器内嵌时预留带加大到 70px（body.in-app 重新声明 --safe-top）",
     "--top-gap:70px" in html and "body.in-app{" in html),
    ("viewport 含 viewport-fit=cover", "viewport-fit=cover" in html),
    ("无 http(s) 外部资源引用",
     not [u for u in re.findall(r"https?://[^\s\"')]+", html + code) if "www.w3.org" not in u]),
    ("无内联事件 on*=", not re.search(r"\son[a-z]+\s*=\s*[\"']", html, re.I)),
    ("无 eval / new Function / WebAssembly", not re.search(
        r"\beval\s*\(|new\s+Function\b|WebAssembly\.", code)),
    ("无 <base> / <iframe> / <object> / CSP meta", not re.search(
        r"<base\b|<iframe\b|<object\b|http-equiv\s*=\s*[\"']?Content-Security-Policy", html, re.I)),
    ("无 target=\"_blank\" / a[download] / window.open / window.prompt", not re.search(
        r'target\s*=\s*"_blank"|\[download\]|window\.open|window\.prompt', html + code)),
    ("禁用能力：无网络请求 / 实时通信", not re.search(
        r"fetch\s*\(|XMLHttpRequest|new\s+WebSocket|new\s+EventSource|RTCPeerConnection", code)),
    ("禁用能力：无定位 / 传感器 / 硬件连接", not re.search(
        r"geolocation|BlueTooth|navigator\.bluetooth|navigator\.usb|navigator\.hid|navigator\.serial|"
        r"DeviceMotion|DeviceOrientation|Accelerometer|Gyroscope|Magnetometer", code)),
    ("禁用能力：无 Worker / ServiceWorker / 屏幕共享", not re.search(
        r"new\s+Worker|new\s+SharedWorker|serviceWorker|getDisplayMedia|requestFullscreen", code)),
    # device-capabilities.md §3：剪贴板 API（navigator.clipboard / execCommand）已禁用
    ("禁用能力：无剪贴板 API（navigator.clipboard / execCommand）", not re.search(
        r"navigator\.clipboard|execCommand", code)),
    ("未用 UA / 机型判断能力", not re.search(
        r"userAgent|/xiaohongshu|redbook|xhslink", code, re.I)),
    ("未硬编码绝对路径", not re.search(r"[A-Za-z]:\\\\|/Users/|/home/", code)),
    ("图片后缀回退链存在（webp/jpg/png）",
     all('"%s"' % e in js for e in ("webp", "jpg", "png"))),
    # 容器上传白名单不收音频扩展名、CSP 又禁 data:/blob: 媒体源 ——
    # 音频只能 base64 藏进 .js（见 _dev/audio/make-bgm.mjs）
    ("白名单不含音频扩展名（音频必须藏在 .js 里）",
     not [e for e in (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac") if e in ALLOWED_EXT]),
    ("背景音乐载荷 assets/audio/bgm.js 已生成", BGM_JS.is_file() and bgm_decoded > 0),
    ("背景音乐 base64 解码后 ≤ 1 MiB（performance-budget §1）",
     0 < bgm_decoded <= 1048576),
    ("背景音乐解码后 ≥ 200 KB（防止误打成空片段）", bgm_decoded >= 200 * 1024),
    ("浏览器不因音频失败阻断其余功能（解码失败只隐藏开关）",
     'classList.add("has-bgm")' in js),
    # 分享（容器 JSBridge postNote）：能力检测 + 取图不经网络
    ("分享走容器 JSBridge 且做了能力检测（postNote + has-share）",
     "postNote" in js and 'classList.add("has-share")' in js),
    ("分享标题 / 正文按 API 上限裁剪（20 / 1000）",
     ".slice(0, 20)" in js and ".slice(0, 1000)" in js),
    ("分享取图走 Canvas，不额外发起网络取字节", 'getContext("2d")' in js and "toDataURL" in js),
    ("连线画在 SVG 里、节点压在它之上（层级基线）",
     "position:absolute; left:0; top:0; z-index:1" in html and ".node{" in html),
    ("吸顶偏移用 --nav-h 实测值（不硬编码）", "var(--nav-h)" in html),
    ("时代是左侧立柱而非横幅（不挡连线）", ".era-rail" in html and "grid-template-columns:1fr 1fr" in html),
]
print("\n—— 打包前置校验 ——")
failed = [name for name, ok in GUARDS if not ok]
for name, ok in GUARDS:
    print("  [%s] %s" % ("✓" if ok else "✗", name))
if failed:
    sys.exit("前置校验未通过，拒绝打包。请先修复后重新运行。")

# ---------- 配图盘点（图片由图像生成 agent 产出，缺失不阻塞打包） ----------
expect = ["cover-" + e["key"] for e in eras] + [t["id"] for t in techs]
have, img_bytes = [], 0
if ASSETS.is_dir():
    for p in ASSETS.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXT:
            have.append(p.stem)
            img_bytes += p.stat().st_size
missing = [b for b in expect if b not in have]
print("\n—— 配图盘点 ——")
print("  期望 %d 张（%d 张时代封面 + %d 张条目图），已就位 %d 张"
      % (len(expect), len(eras), len(techs), len([b for b in expect if b in have])))
if missing:
    print("  未就位 %d 张（页面显示占位块，不影响打包）: %s%s"
          % (len(missing), ", ".join(missing[:6]), " …" if len(missing) > 6 else ""))
if img_bytes:
    print("  已就位图片合计 %.1f KB" % (img_bytes / 1024))
    if img_bytes > 1.8 * 1024 * 1024:
        print("  [!] 图片体积超过 1.8MB 建议值，请压缩尺寸 / 质量后再交付")

# ---------- 背景音乐盘点 ----------
print("\n—— 背景音乐 ——")
if bgm_decoded:
    print("  assets/audio/bgm.js：base64 %.0f KB → 解码后 %.0f KB（门禁 ≤ 1024 KB，余量 %.0f KB）"
          % (BGM_JS.stat().st_size / 1024, bgm_decoded / 1024, (1048576 - bgm_decoded) / 1024))
    print("  源曲 assets/audio/bgm.mp3 是构建输入，按扩展名白名单自动不进 zip")
else:
    print("  未找到载荷 —— 页面会隐藏音乐开关，其余功能照常")

# ---------- 构建 dist ----------
if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir(parents=True)
for name in ("index.html", "data.js", "main.js"):
    shutil.copy2(ROOT / name, DIST / name)
# 只拷贝被 data.js 引用的配图：命名对不上的历史遗留图 / 下线条目图不再进包。
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
print("\ndist: %s" % sorted(p.as_posix() for p in DIST.rglob("*") if p.is_file())[:8])

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
