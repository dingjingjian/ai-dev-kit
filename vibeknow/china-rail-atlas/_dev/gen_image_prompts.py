# -*- coding: utf-8 -*-
"""
从 main.js 派生配图提示词清单（生图的施工图）。

main.js 的 CATS / ITEMS / IMG_STYLE / IMG_STYLE_ARCH 是唯一真源，本脚本只做提取与排版，
不新增任何数据，因此清单永远与页面一致——不会出现「页面一套、清单又一套」。

产物：
  _dev/IMAGE_PROMPTS.md    给人看的施工图（规格 + 风格串 + 逐张中文要点 / 完整提示词 / 参考图）
  _dev/image-prompts.json  机器可读清单（批处理生图时用）

参考图：_dev/ref/<id>-01.jpg 等若已存在，会被自动列进清单；来源地址见 _dev/ref-index.md。

用法：python _dev/gen_image_prompts.py
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEV = ROOT / "_dev"
SRC = ROOT / "main.js"
MD = DEV / "IMAGE_PROMPTS.md"
JSON_OUT = DEV / "image-prompts.json"
REF_DIR = DEV / "ref"

sys.stdout.reconfigure(encoding="utf-8")

js = SRC.read_text(encoding="utf-8")

ITEM_W, ITEM_H = 640, 360
COVER_W, COVER_H = 960, 540


def block(start_marker, end_marker="\n];"):
    i = js.index(start_marker)
    j = js.index(end_marker, i)
    return js[i:j]


def field(chunk, name):
    m = re.search(r'\b%s:"((?:[^"\\]|\\.)*)"' % name, chunk)
    return m.group(1) if m else ""


STYLES = {}
for var, key in (("IMG_STYLE", "vehicle"), ("IMG_STYLE_ARCH", "arch")):
    m = re.search(r'var %s = "((?:[^"\\]|\\.)*)";' % var, js)
    if not m:
        sys.exit("未在 main.js 中找到 %s" % var)
    STYLES[key] = m.group(1)

cats = []
for chunk in re.split(r'\n(?=  \{key:")', block("var CATS = [")):
    if 'key:"' not in chunk:
        continue
    key = field(chunk, "key")
    cats.append({"key": key, "zh": field(chunk, "zh"), "en": field(chunk, "en"),
                 "cover": "cover-" + key})

items = []
for chunk in re.split(r'\n(?=  \{id:")', block("var ITEMS = [")):
    if 'id:"' not in chunk:
        continue
    items.append({
        "id": field(chunk, "id"),
        "cat": field(chunk, "cat"),
        "name": field(chunk, "name"),
        "kind": field(chunk, "kind"),
        "era": field(chunk, "era"),
        "zh": field(chunk, "zh"),
        "subject": field(chunk, "subject"),
    })

for want in ("id", "cat", "name", "era", "subject", "zh"):
    missing = [it["id"] for it in items if not it[want]]
    if missing:
        sys.exit("以下条目缺少 %s：%s" % (want, ", ".join(missing)))

cat_by_key = {c["key"]: c for c in cats}
unknown = [it["id"] for it in items if it["cat"] not in cat_by_key]
if unknown:
    sys.exit("以下条目的 cat 不在 CATS 中：" + ", ".join(unknown))


def style_of(cat_key):
    return STYLES["arch"] if cat_key == "station" else STYLES["vehicle"]


def prompt_of(cat_key, subject):
    return style_of(cat_key) + " " + subject


def refs_of(base):
    """已有的参考照片文件名（按名排序）；不存在则空列表。"""
    if not REF_DIR.is_dir():
        return []
    out = []
    for f in sorted(os.listdir(REF_DIR)):
        if f.startswith(base + "-") and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            out.append("ref/" + f)
    return out


def record(base, kind, cat, name, subject, era="", kind_zh="", zh=""):
    w, h = (COVER_W, COVER_H) if kind == "cover" else (ITEM_W, ITEM_H)
    return {
        "file": "assets/img/%s.webp" % base,
        "base": base,
        "kind": kind,
        "cat": cat,
        "name": name,
        "kindZh": kind_zh,
        "era": era,
        "zh": zh,
        "size": "%dx%d" % (w, h),
        "prompt": prompt_of(cat, subject),
        "refs": refs_of(base),
    }


COVER_SUBJECTS = {
    "loco": ("a neat row of four representative Chinese locomotives from different eras "
             "(a steam locomotive, a diesel locomotive, an electric locomotive and a high-speed EMU), "
             "arranged side by side in a straight line, each one shown in strict side elevation view, "
             "all four small and fully visible in one horizontal band across the middle of the frame, "
             "the tallest less than one third of the frame height, wide empty background above and below"),
    "pax": ("a neat row of four representative Chinese railway passenger coaches from different eras, "
            "arranged side by side in a straight line, each one shown in strict side elevation view, "
            "all four small and fully visible in one horizontal band across the middle of the frame, "
            "the tallest less than one third of the frame height, wide empty background above and below"),
    "freight": ("a neat row of four representative Chinese railway freight wagons from different eras "
                "(a gondola, a boxcar, a tank wagon and a flat wagon), "
                "arranged side by side in a straight line, each one shown in strict side elevation view, "
                "all four small and fully visible in one horizontal band across the middle of the frame, "
                "the tallest less than one third of the frame height, wide empty background above and below"),
    "station": ("a neat row of four representative Chinese railway station buildings from different eras, "
                "arranged side by side in a straight line, each one shown in strict front elevation view, "
                "all four small and fully visible in one horizontal band across the middle of the frame, "
                "the widest less than two thirds of the frame width, wide empty background above and below"),
}

records = []
for c in cats:
    subj = COVER_SUBJECTS.get(c["key"])
    if not subj:
        sys.exit("分类 %s 缺少封面主体描述，请在 gen_image_prompts.py 的 COVER_SUBJECTS 里补" % c["key"])
    records.append(record(c["cover"], "cover", c["key"], c["zh"] + " · 分类封面", subj))
for it in items:
    records.append(record(it["id"], "item", it["cat"], it["name"], it["subject"],
                          it["era"], it["kind"], it["zh"]))

JSON_OUT.write_text(
    json.dumps({
        "styles": STYLES,
        "itemSize": "%dx%d" % (ITEM_W, ITEM_H),
        "coverSize": "%dx%d" % (COVER_W, COVER_H),
        "images": records,
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

_spec = (ROOT / "_dev" / "image-spec.md").read_text(encoding="utf-8")
spec_body = _spec[_spec.index("## 交付清单"):].rstrip()

lines = []
lines.append("# 配图施工图 · 中国铁路图鉴")
lines.append("")
lines.append("> 本文件由 `_dev/gen_image_prompts.py` 生成，请勿手改：条目数据改 `main.js`，"
             "配图要求改 `_dev/image-spec.md`，然后重跑 `python _dev/gen_image_prompts.py`。")
lines.append("")
lines.append("共 **%d 张**：4 张分类封面 + %d 张条目图。中文名、类型与年代均与页面一致。"
             % (len(records), len(items)))
lines.append("")
lines.append("**完整提示词 = 该类的统一风格串 + 空格 + 主体描述**，逐张拼接即可。")
lines.append("「中文要点」是给中文模型用的主体说明，也方便人工核对造型识别点。")
lines.append("")
lines.append("## 1. 交付规格")
lines.append("")
lines.append("> 以下要求摘自 `_dev/image-spec.md`（唯一真源）。")
lines.append("")
lines.extend(spec_body.split("\n"))
lines.append("")
lines.append("## 2. 统一风格串")
lines.append("")
lines.append("### 车辆类（火车头 / 客车 / 货车）——**正侧视**")
lines.append("")
lines.append("```text")
lines.append(STYLES["vehicle"])
lines.append("```")
lines.append("")
lines.append("### 车站类——**正立面**")
lines.append("")
lines.append("```text")
lines.append(STYLES["arch"])
lines.append("```")
lines.append("")
lines.append("## 3. 分类封面（4 张）")
lines.append("")
lines.append("| 文件 | 尺寸 | 中文名 | 完整提示词 |")
lines.append("| --- | --- | --- | --- |")
by_base = {r["base"]: r for r in records}
for c in cats:
    r = by_base[c["cover"]]
    lines.append("| `%s.webp` | %s | %s | %s |"
                 % (r["base"], r["size"], r["name"], r["prompt"].replace("|", "/")))
lines.append("")
lines.append("## 4. 条目配图（%d 张）" % len(items))
lines.append("")
lines.append("表格按分类分组，组内即 `main.js` 中的顺序（同一分类内按问世年代从早到晚）。")
lines.append("")
for c in cats:
    group = [it for it in items if it["cat"] == c["key"]]
    lines.append("### %s（%s）· %d 张" % (c["zh"], c["key"], len(group)))
    lines.append("")
    lines.append("| 文件 | 尺寸 | 中文名 | 类型 | 年代 | 中文要点 | 参考照片 | 完整提示词 |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for it in group:
        r = by_base[it["id"]]
        refs = "、".join("`%s`" % x for x in r["refs"]) if r["refs"] else "—"
        lines.append("| `%s.webp` | %s | %s | %s | %s | %s | %s | %s |"
                     % (r["base"], r["size"], it["name"], it["kind"], it["era"],
                        it["zh"].replace("|", "/"), refs, r["prompt"].replace("|", "/")))
    lines.append("")
lines.append("## 5. 验收")
lines.append("")
lines.append("- [ ] 全部 %d 张图已放入 `assets/img/`，文件名与上表一致（后缀 `.webp`）" % len(records))
lines.append("- [ ] 尺寸、体积达标；合计 ≤ 2.0 MB")
lines.append("- [ ] 画面风格与背景一致：车辆正侧视、车站正立面，浅暖白底，无文字 / 路徽 / 人物 / 场景")
lines.append("- [ ] 打开页面抽查：列表卡片与详情页大图均无占位块残留")
lines.append("- [ ] 重跑 `python _dev/build_zip.py` 打包（脚本会统计图片体积）")
lines.append("")

MD.write_text("\n".join(lines), encoding="utf-8")

print("源文件：%s" % SRC)
print("分类：%d 个，条目：%d 条" % (len(cats), len(items)))
have_refs = sum(1 for r in records if r["refs"])
print("参考照片已就位：%d / %d 张" % (have_refs, len(records)))
print("产物：%s（%d 张图）" % (MD, len(records)))
print("产物：%s" % JSON_OUT)
