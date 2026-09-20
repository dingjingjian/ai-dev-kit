# -*- coding: utf-8 -*-
"""
从 ../../reference/<dir>/screenshots/ 取最新一张图片（jpg/png/webp 均可），
生成 ../covers/{NN}-{dir}.jpg（宽 540、JPEG q80、白底）与 ../covers-data.js（尺寸表）。
截图更新后重跑本脚本即可，main.js 通过 COVER_DIMS 自动取新尺寸。
用法：python _dev/make_covers.py
"""
import sys
from pathlib import Path
from PIL import Image

ORDER = [
    "zhexue-kafeishi-fireworks", "zhexue-kafeishi-pocket-museum", "maoge-suxiu",
    "ciyuan-ai-speed-drift", "carrytzz-doraemon-house", "nide-ai-fly",
    "way-ai-jump-ball", "haha-mini-flight", "zuoshou-keer-parking",
    "xingkong-excavator-pig", "doumi-next-blue-dot", "jiqi-bianzhong-qingtian",
    "muduchuan-relic-viewer", "amao-squeeze-toy", "xianhua-moon-letter",
    "mingo-bala-bala", "piece-of-moonlight",
]
TARGET_W = 540
QUALITY = 80
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}

sys.stdout.reconfigure(encoding="utf-8")
root = Path(__file__).resolve().parent.parent
ref = root.parent.parent / "reference"
out_dir = root / "covers"
out_dir.mkdir(exist_ok=True)

def pick_cover(ss_dir):
    files = [p for p in ss_dir.iterdir() if p.suffix.lower() in IMG_EXT]
    if not files:
        raise SystemExit(f"未找到封面图：{ss_dir}")
    return max(files, key=lambda p: p.stat().st_mtime)

total = 0
dims = {}
for i, d in enumerate(ORDER, 1):
    src = pick_cover(ref / d / "screenshots")
    img = Image.open(src)
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    h = round(img.height * TARGET_W / img.width)
    img = img.resize((TARGET_W, h), Image.LANCZOS)
    name = f"{i:02d}-{d}.jpg"
    dst = out_dir / name
    img.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    dims[name] = [TARGET_W, h]
    kb = dst.stat().st_size / 1024
    total += kb
    print(f"{name}  {TARGET_W}x{h}  {kb:.0f}KB  <- {src.name}")

lines = ["// 由 _dev/make_covers.py 生成，勿手改",
         "window.COVER_DIMS = {"]
for name, (w, h) in dims.items():
    lines.append(f'  "{name}": [{w}, {h}],')
lines.append("};")
(root / "covers-data.js").write_text("\n".join(lines) + "\n", encoding="utf-8")

print(f"\n合计 {total:.0f}KB / {len(dims)} 张，已写 covers-data.js（预算：zip 建议不超过 2MiB）")
