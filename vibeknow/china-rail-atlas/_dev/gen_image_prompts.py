# -*- coding: utf-8 -*-
"""
从 main.js 派生配图提示词清单（生图的施工图）。

main.js 的 CATS / ITEMS / 四条风格串 / COVER_SUBJECTS 是唯一真源，本脚本只做提取与排版，
不新增任何数据，因此清单永远与页面一致——不会出现「页面一套、清单又一套」。
分类封面画的是该类别的铁路物件聚成的一景（不画具体车型），组景描述取 main.js 的 COVER_SUBJECTS。

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


# 四套风格串：条目图两层（vehicle / arch）+ 分类封面两层（cover / cover_arch）。
# 封面与条目图刻意分层——条目图是图鉴式插画（信息优先），封面是写实棚拍静物（氛围优先）。
STYLES = {}
for var, key in (("IMG_STYLE", "vehicle"), ("IMG_STYLE_ARCH", "arch"),
                 ("IMG_STYLE_COVER", "cover"), ("IMG_STYLE_COVER_ARCH", "cover_arch")):
    m = re.search(r'var %s = "((?:[^"\\]|\\.)*)";' % var, js)
    if not m:
        sys.exit("未在 main.js 中找到 %s" % var)
    STYLES[key] = m.group(1)

# 分类封面的道具清单：从 main.js 的 COVER_SUBJECTS 逐 key 提取（四段英文主体描述）
COVER_SUBJECTS = {}
_m = re.search(r'var COVER_SUBJECTS = \{(.*?)\n\};', js, re.S)
if not _m:
    sys.exit("未在 main.js 中找到 COVER_SUBJECTS")
for _k, _v in re.findall(r'\n\s*(\w+):\s*"((?:[^"\\]|\\.)*)"', _m.group(1)):
    COVER_SUBJECTS[_k] = _v

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


def style_of(cat_key, cover=False):
    """条目图与封面各有一套风格串：条目图走图鉴插画，封面走写实渲染。"""
    if cover:
        return STYLES["cover_arch"] if cat_key == "station" else STYLES["cover"]
    return STYLES["arch"] if cat_key == "station" else STYLES["vehicle"]


def prompt_of(cat_key, subject, cover=False):
    return style_of(cat_key, cover) + " " + subject


def refs_of(base):
    """已有的参考照片文件名（按名排序）；不存在则空列表。"""
    if not REF_DIR.is_dir():
        return []
    out = []
    for f in sorted(os.listdir(REF_DIR)):
        if f.startswith(base + "-") and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            out.append("ref/" + f)
    return out


def record(base, kind, cat, name, subject, era="", kind_zh="", zh="", refs=None):
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
        "prompt": prompt_of(cat, subject, cover=(kind == "cover")),
        "refs": refs_of(base) if refs is None else refs,
    }


# 分类封面（4 张）是**该类别的铁路物件聚成的一景**（不画具体车型），组景描述来自 main.js 的 COVER_SUBJECTS：
# 封面显示框约 3.44:1（窄屏）～3.8:1（宽屏），object-fit:cover 只留源图中间约一半。
# 一节车正侧视约 6:1、四节并排要 ≈24:1，整车在封面里只能被压短或小到看不清（旧版封面即如此）；
# 物件没有固定长宽比，聚成一景正好吃满这条横带，比例问题从根上消失。
# 认型号交给条目图，封面只负责「这里是机车 / 客车 / 货车 / 车站」的氛围。
#
# 主体描述在 main.js 里维护，此处只提取；光照、材质、底色、构图与负面项交给封面风格串。
# 封面是静物小品，没有对照照片，因此不列参考图（refs 为空）。
records = []
for c in cats:
    subj = COVER_SUBJECTS.get(c["key"])
    if not subj:
        sys.exit("分类 %s 缺少封面组景描述，请在 main.js 的 COVER_SUBJECTS 里补" % c["key"])
    records.append(record(c["cover"], "cover", c["key"], c["zh"] + " · 分类封面", subj, refs=[]))
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
lines.append("**完整提示词 = 该层的风格串 + 空格 + 主体描述**，逐张拼接即可。")
lines.append("风格串分两层：**条目图**走图鉴式插画（%d 张，信息优先），"
             "**分类封面**走写实棚拍渲染（4 张，视觉优先）；" % len(items))
lines.append("两层共用同一片浅暖白底与同一种视角（车辆正侧视 / 车站正立面），所以封面好看但不跳戏。")
lines.append("「中文要点」是给中文模型用的主体说明，也方便人工核对造型识别点。")
lines.append("")
lines.append("## 1. 交付规格")
lines.append("")
lines.append("> 以下要求摘自 `_dev/image-spec.md`（唯一真源）。")
lines.append("")
lines.extend(spec_body.split("\n"))
lines.append("")
lines.append("## 2. 统一风格串（两层共四条）")
lines.append("")
lines.append("### 2.1 条目图 · 车辆类（火车头 / 客车 / 货车）——**图鉴式侧视插画**")
lines.append("")
lines.append("```text")
lines.append(STYLES["vehicle"])
lines.append("```")
lines.append("")
lines.append("### 2.2 条目图 · 车站类——**图鉴式正视立面插画**")
lines.append("")
lines.append("```text")
lines.append(STYLES["arch"])
lines.append("```")
lines.append("")
lines.append("### 2.3 分类封面 · 车辆类——**写实棚拍静物 · 一景一图**（与条目图刻意的分层）")
lines.append("")
lines.append("```text")
lines.append(STYLES["cover"])
lines.append("```")
lines.append("")
lines.append("### 2.4 分类封面 · 车站类——**写实棚拍静物 · 一景一图（站台器物）**")
lines.append("")
lines.append("```text")
lines.append(STYLES["cover_arch"])
lines.append("```")
lines.append("")
lines.append("## 3. 分类封面（4 张）")
lines.append("")
lines.append("> 封面用 **2.3 / 2.4** 的写实风格串拼接，主体描述是该类别的**一景**"
             "（在 `main.js` 的 `COVER_SUBJECTS` 里维护），见下表。")
lines.append("> 封面画的是**一组铁路物件聚成的完整画面，不画具体车型**：认型号是条目图的活；")
lines.append("> 而且封面显示框约 3.44:1（窄屏）～3.8:1（宽屏），源图上下各丢近一半，"
             "一节车约 6:1、四节并排要 ≈24:1——整车放进封面只会被压短成方盒子。")
lines.append("> 物件没有固定长宽比，聚成一景正好吃满这条横带，还能带上煤、麻袋、皮箱这类年代质感。")
lines.append("> **四张必须像一套**：同底色、同光位、同正交视角、同样的「一件主 + 陪衬靠叠在前」结构、"
             "同样的占宽与高度，四张一起改。")
lines.append("> 封面是静物小品，**无对照照片**，按文字要点生图即可。")
lines.append("")
lines.append("提示词 = 风格串 + 空格 + 主体描述；下表每行末尾那串就是该类的**组景描述**"
             "（`COVER_SUBJECTS` 原文，写明谁是谁的陪衬）。")
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
lines.append("- [ ] 条目图风格与背景一致：车辆正侧视、车站正立面，浅暖白底，无文字 / 路徽 / 人物 / 场景")
lines.append("- [ ] 条目图底部**没有横贯画面的轨道线 / 地平线**（只允许车轮下极淡的接触阴影）")
lines.append("- [ ] 动车组三张（CRH2 / CRH380A / CR400AF）与 CR200J **只出现一节车、车头只在一端**，右端为平断面")
lines.append("- [ ] 东风5型只有**一个司机室**（车尾是平直的机械间端墙，不要第二个车头）")
lines.append("- [ ] 硬卧车为**墨绿车身 + 黄色腰带 + 一排小窗**（不是橙红涂装、不是连续大窗带）")
lines.append("- [ ] 封面为写实棚拍**静物小品**：一组物件**聚成一景**、有主有次、有叠放遮挡，"
             "不是等距排成一行摆件")
lines.append("- [ ] 封面里**没有整车 / 整节车厢**（只允许物件与部件），没有轨道、道砟、地面、地平线、接触网")
lines.append("- [ ] 封面物件**无文字、无数字、无路徽、无人手人物**（站牌、车票、表盘、钟面这类一律不选）")
lines.append("- [ ] 封面一景占画面宽度 **70%～80%**、最高一件不超过画面高度的 **45%** 且整景垂直居中")
lines.append("- [ ] 四张封面**像一套**：底色 / 光位 / 视角 / 组景结构 / 色调一致，没有一张跑偏")
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
