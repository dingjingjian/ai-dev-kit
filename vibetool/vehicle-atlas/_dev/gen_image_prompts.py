# -*- coding: utf-8 -*-
"""
从 main.js 派生配图提示词清单（图片生成 agent 的施工图）。

main.js 的 CATS / VEHICLES / IMG_STYLE 是唯一真源，本脚本只做提取与排版，
不新增任何数据，因此清单永远与页面一致、不会写一遍数据、清单又是第二遍。

产物：
  _dev/IMAGE_PROMPTS.md    人工 / agent 阅读的清单（含统一风格、规格、逐张提示词）
  _dev/image-prompts.json  机器可读清单（脚本批处理生成图片时用）

用法：python _dev/gen_image_prompts.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "main.js"
MD = ROOT / "_dev" / "IMAGE_PROMPTS.md"
JSON_OUT = ROOT / "_dev" / "image-prompts.json"

sys.stdout.reconfigure(encoding="utf-8")

js = SRC.read_text(encoding="utf-8")


def block(start_marker, end_marker="\n];"):
    i = js.index(start_marker)
    j = js.index(end_marker, i)
    return js[i:j]


def field(chunk, name):
    m = re.search(r'\b%s:"((?:[^"\\]|\\.)*)"' % name, chunk)
    return m.group(1) if m else ""


style_m = re.search(r'var IMG_STYLE = "((?:[^"\\]|\\.)*)";', js)
if not style_m:
    sys.exit("未在 main.js 中找到 IMG_STYLE")
IMG_STYLE = style_m.group(1)

cats = []
for chunk in re.split(r'\n(?=  \{key:")', block("var CATS = [")):
    if 'key:"' not in chunk:
        continue
    key = field(chunk, "key")
    cats.append({
        "key": key,
        "zh": field(chunk, "zh"),
        "en": field(chunk, "en"),
        "cover": "cover-" + key,
    })

items = []
for chunk in re.split(r'\n(?=  \{id:")', block("var VEHICLES = [")):
    if 'id:"' not in chunk:
        continue
    items.append({
        "id": field(chunk, "id"),
        "cat": field(chunk, "cat"),
        "name": field(chunk, "name"),
        "en": field(chunk, "en"),
        "subject": field(chunk, "subject"),
    })

missing = [it["id"] for it in items if not it["subject"]]
if missing:
    sys.exit("以下条目缺少 subject，无法生成提示词：" + ", ".join(missing))

cat_by_key = {c["key"]: c for c in cats}
unknown = [it["id"] for it in items if it["cat"] not in cat_by_key]
if unknown:
    sys.exit("以下条目的 cat 不在 CATS 中：" + ", ".join(unknown))

ITEM_W, ITEM_H = 640, 360
COVER_W, COVER_H = 960, 540


def prompt_of(subject):
    return IMG_STYLE + " " + subject


def image_record(base, kind, cat, name, subject):
    w, h = (COVER_W, COVER_H) if kind == "cover" else (ITEM_W, ITEM_H)
    return {
        "file": "assets/img/%s.webp" % base,
        "base": base,
        "kind": kind,
        "cat": cat,
        "name": name,
        "size": "%dx%d" % (w, h),
        "prompt": prompt_of(subject),
    }


records = []
for c in cats:
    name = c["zh"] + " · 分类封面"
    subject = (
        "a tidy lineup of typical in-service %s vehicles from around the world, "
        "arranged side by side at a slight three-quarter angle, unified visual style" % c["en"]
    )
    records.append(image_record(c["cover"], "cover", c["key"], name, subject))
for it in items:
    records.append(image_record(it["id"], "item", it["cat"], it["name"], it["subject"]))

JSON_OUT.write_text(
    json.dumps({
        "style": IMG_STYLE,
        "itemSize": "%dx%d" % (ITEM_W, ITEM_H),
        "coverSize": "%dx%d" % (COVER_W, COVER_H),
        "images": records,
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

lines = []
lines.append("# 配图施工图 · 全球交通工具图鉴")
lines.append("")
lines.append("> 本文件由 `_dev/gen_image_prompts.py` 从 `main.js` **自动生成**，请勿手改；"
             "改数据请改 `main.js` 后重跑脚本。")
lines.append("")
lines.append("图片生成 agent 按本清单产出配图即可，页面无需任何改动："
             "文件名对上就自动显示，对不上则继续显示占位块。")
lines.append("")
lines.append("## 1. 交付规格")
lines.append("")
lines.append("| 项 | 要求 |")
lines.append("| --- | --- |")
lines.append("| 存放位置 | `assets/img/`（相对 zip 根目录） |")
lines.append("| 文件命名 | `<base>.webp`，base 见下方表格（如 `car-01.webp` / `cover-car.webp`） |")
lines.append("| 条目图尺寸 | %d × %d（16:9 横构图） |" % (ITEM_W, ITEM_H))
lines.append("| 分类封面尺寸 | %d × %d（16:9 横构图） |" % (COVER_W, COVER_H))
lines.append("| 格式 | WebP（页面另有 jpg / png 后缀回退，但 WebP 体积最优） |")
lines.append("| 单张体积 | 条目图 ≤ 45 KB，分类封面 ≤ 90 KB |")
lines.append("| 全部图片合计 | ≤ 1.8 MB（小工具 zip 建议不超过 2 MB，图片是主要体积来源） |")
lines.append("| 构图安全区 | 卡片按约 2.2:1 裁切显示，主体须**水平居中、垂直居中**，上下各留 ≥20% 余量 |")
lines.append("| 禁止 | 画面内出现文字 / 字母 / logo / 水印 / 人物；使用外部素材（版权风险） |")
lines.append("")
lines.append("转化命令（若生成工具只出 PNG/JPG）：")
lines.append("")
lines.append("```python")
lines.append("from PIL import Image")
lines.append('img = Image.open("raw.png").convert("RGB").resize((%d, %d))' % (ITEM_W, ITEM_H))
lines.append('img.save("assets/img/car-01.webp", "WEBP", quality=78, method=6)')
lines.append("```")
lines.append("")
lines.append("## 2. 统一风格串（每张图都要带上）")
lines.append("")
lines.append("```text")
lines.append(IMG_STYLE)
lines.append("```")
lines.append("")
lines.append("**完整提示词 = 统一风格串 + 空格 + 下表「主体」**，逐张拼接即可。")
lines.append("")
lines.append("## 3. 分类封面（%d 张）" % len(cats))
lines.append("")
lines.append("| 文件 | 尺寸 | 中文名 | 完整提示词 |")
lines.append("| --- | --- | --- | --- |")
for c in cats:
    rec = records[[r["base"] for r in records].index(c["cover"])]
    lines.append("| `%s.webp` | %s | %s | %s |"
                 % (rec["base"], rec["size"], rec["name"].replace("|", "/"),
                    rec["prompt"].replace("|", "/")))
lines.append("")
lines.append("## 4. 条目配图（%d 张）" % len(items))
lines.append("")
for c in cats:
    group = [it for it in items if it["cat"] == c["key"]]
    lines.append("### %s（%s）· %d 张" % (c["zh"], c["key"], len(group)))
    lines.append("")
    lines.append("| 文件 | 尺寸 | 中文名 | 完整提示词 |")
    lines.append("| --- | --- | --- | --- |")
    for it in group:
        rec = records[[r["base"] for r in records].index(it["id"])]
        lines.append("| `%s.webp` | %s | %s | %s |"
                     % (rec["base"], rec["size"], it["name"].replace("|", "/"),
                        rec["prompt"].replace("|", "/")))
    lines.append("")
lines.append("## 5. 验收")
lines.append("")
lines.append("- [ ] 全部 %d 张图已放入 `assets/img/`，文件名与上表一致（后缀 `.webp`）" % len(records))
lines.append("- [ ] 尺寸、体积达标；合计 ≤ 1.8 MB")
lines.append("- [ ] 打开页面抽查：列表卡片与详情页大图均无占位块残留")
lines.append("- [ ] 重跑 `python _dev/build_zip.py` 打包（脚本会统计图片体积）")
lines.append("")

MD.write_text("\n".join(lines), encoding="utf-8")

print("源文件：%s" % SRC)
print("分类：%d 个，条目：%d 条" % (len(cats), len(items)))
print("产物：%s（%d 张图）" % (MD, len(records)))
print("产物：%s" % JSON_OUT)
