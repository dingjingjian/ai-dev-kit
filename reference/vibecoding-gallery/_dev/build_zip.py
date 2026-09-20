# -*- coding: utf-8 -*-
"""
小工具 ZIP 打包（前置校验 -> 构建 dist -> 压缩 dist 的"内容"）。
保证 index.html 位于 zip 根目录。用法：python _dev/build_zip.py
"""
import json, re, shutil, sys, zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ZIP = ROOT / "vibecoding-gallery.zip"
ALLOWED_EXT = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
               ".webp", ".svg", ".woff", ".woff2", ".json"}

html = (ROOT / "index.html").read_text(encoding="utf-8")
js = (ROOT / "main.js").read_text(encoding="utf-8")
dims_js_path = ROOT / "covers-data.js"
dims_js = dims_js_path.read_text(encoding="utf-8") if dims_js_path.exists() else ""

# 归档原始数据（由 reference/ 各 README 提取）：链接逐字比对的基准
raw = json.loads((ROOT / "_dev" / "works_raw.json").read_text(encoding="utf-8"))
raw_links = [w["link"] for w in raw]

covers_in_js = re.findall(r"cover:\s*'([^']+)'", js)
covers_on_disk = sorted(p.name for p in (ROOT / "covers").glob("*.jpg"))
dims_covered = set(re.findall(r'"(\d+-[^"]+\.jpg)":\s*\[\d+,\s*\d+\]', dims_js))
js_links = re.findall(r"link:\s*'([^']+)'", js)

GUARDS = [
    ("脚本已外置，无内联 <script>", not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I)),
    ("index.html 依次引用 ./covers-data.js 与 ./main.js",
     '<script src="./covers-data.js"></script>' in html
     and '<script src="./main.js"></script>' in html
     and html.index('covers-data.js') < html.index('main.js')),
    ("JS 为经典脚本，无 import/export", not re.search(r"^\s*(import|export)\s", js, re.M)),
    ("无 ES2020+ 语法残留（?. / ??）", not re.search(r"\?\.|\?\?", js)),
    ("安全区用 var(--safe-area-inset-*, env(...)) 组合",
     "var(--safe-area-inset-top, env(safe-area-inset-top, 0px))" in html),
    ("无 UA 自动判定宿主 App", not re.search(r"/xiaohongshu|redbook|xhslink/i", js)),
    ("无外部资源引用（script/link/img src、CSS url()）", not re.search(
        r'(src|href)\s*=\s*["\']https?://|url\(\s*["\']?https?://', html, re.I)),
    ("无内联事件 on*=", not re.search(r"\son[a-z]+\s*=\s*[\"']", html, re.I)),
    ("无 eval / new Function", not re.search(r"\beval\s*\(|new\s+Function\b", js)),
    ("禁用能力：无 WebSocket/Worker/geolocation/window.open", not re.search(
        r"WebSocket|new\s+Worker|geolocation|getUserMedia|window\.open", js)),
    ("禁用能力：无剪贴板 API（navigator.clipboard / execCommand）", not re.search(
        r"navigator\.clipboard|execCommand", js)),
    ("无 iframe / object / base", not re.search(r"<iframe|<object|<base\s", html, re.I)),
    ("main.js 引用的封面共 %d 张且全部存在" % len(covers_in_js),
     all((ROOT / "covers" / c).is_file() for c in covers_in_js)
     and len(set(covers_in_js)) == len(covers_in_js)),
    ("covers/ 目录文件全部被 main.js 引用", set(covers_in_js) == set(covers_on_disk)),
    ("covers-data.js 尺寸表覆盖全部封面", set(covers_on_disk) == dims_covered),
    ("每条作品带完整链接（https 开头）",
     all(u.startswith("https://") for u in js_links)),
    # 链接必须与归档原文逐字一致：xsec_token 等查询参数一旦被去掉/截断，站外就打不开
    ("链接与归档原文逐字一致（含 xsec_token 等全部参数，不得截断）",
     len(js_links) == len(raw_links) and set(js_links) == set(raw_links)),
]
print("—— 打包前置校验 ——")
failed = [name for name, ok in GUARDS if not ok]
for name, ok in GUARDS:
    print(f"  [{'✓' if ok else '✗'}] {name}")
if failed:
    sys.exit("前置校验未通过，拒绝打包。请先修复后重新运行。")

# 归档原文本身没带 xsec_token 的条目：页面会显示「未取到分享令牌」提示，此处点名
no_token = [w["dir"] for w in raw if "xsec_token=" not in w["link"]]
if no_token:
    print(f"\n  提示：{len(no_token)} 条归档链接不含 xsec_token，站外可能打不开，"
          f"需补分享链接：{'、'.join(no_token)}")

if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir(parents=True)
for name in ("index.html", "main.js", "covers-data.js"):
    shutil.copy2(ROOT / name, DIST / name)
cover_dir = DIST / "covers"
cover_dir.mkdir()
for p in sorted((ROOT / "covers").glob("*.jpg")):
    shutil.copy2(p, cover_dir / p.name)
print(f"\ndist: index.html + main.js + covers-data.js + covers/({len(covers_on_disk)} 张)")

with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(DIST.rglob("*")):
        if p.is_dir():
            continue
        if p.name == ".DS_Store" or p.suffix not in ALLOWED_EXT:
            print(f"  跳过（类型不允许）：{p.name}")
            continue
        z.write(p, p.relative_to(DIST).as_posix())

with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
size = ZIP.stat().st_size
assert "index.html" in names, "index.html 不在 zip 根目录"

print(f"\n产物：{ZIP.name}")
print(f"体积：{size / 1024:.1f} KB（上限 10MB，建议 ≤2MB，"
      f"{'通过' if size <= 2 * 1024 * 1024 else '超建议值'}）")
print(f"文件数：{len(names)}（index.html 在根 ✅）")
