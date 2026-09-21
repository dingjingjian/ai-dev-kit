# -*- coding: utf-8 -*-
"""从 data.js 派生配图提示词清单（图片生成 agent 的施工图）。

data.js 的 ERAS / TECHS / IMG_STYLE 是唯一真源，本脚本只做提取与排版，
不新增任何数据，因此清单永远与页面一致、不会写一遍数据、清单又是第二遍。

产物：
  _dev/IMAGE_PROMPTS.md    人工 / agent 阅读的清单（含统一风格、规格、逐张提示词）
  _dev/image-prompts.json  机器可读清单（脚本批处理生成图片时用）

用法：python _dev/gen_image_prompts.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_data import load, DATA, ROOT  # noqa: E402

MD = ROOT / "_dev" / "IMAGE_PROMPTS.md"
JSON_OUT = ROOT / "_dev" / "image-prompts.json"

ITEM_W, ITEM_H = 640, 360
COVER_W, COVER_H = 960, 540


def cover_subject(era, names):
    """时代封面：把该时代的条目英文名交给生图方，由它挑几件摆成一排。"""
    return ("a tidy museum-style lineup of a few representative objects from the %s era "
            "(%s), arranged side by side in a single row at a slight three-quarter angle, "
            "each object small and fully visible, the tallest object less than one third of the frame height, "
            "the whole lineup confined to a horizontal band across the middle of the frame, "
            "large empty background above and below, unified visual style, no readable modern text, no logos"
            % (era["en"], ", ".join(names)))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    eras, techs, style = load()

    if not eras or not techs:
        sys.exit("data.js 解析失败：eras=%d techs=%d" % (len(eras), len(techs)))
    missing = [t["id"] for t in techs if not t["subject"]]
    if missing:
        sys.exit("以下条目缺少 subject，无法生成提示词：" + ", ".join(missing))

    era_keys = set(e["key"] for e in eras)
    unknown = [t["id"] for t in techs if t["era"] not in era_keys]
    if unknown:
        sys.exit("以下条目的 era 不在 ERAS 中：" + ", ".join(unknown))

    records = []
    for e in eras:
        names = [t["en"] for t in techs if t["era"] == e["key"]]
        records.append({
            "file": "assets/img/cover-%s.webp" % e["key"],
            "base": "cover-" + e["key"],
            "kind": "cover",
            "era": e["key"],
            "name": "%s · 时代封面" % e["zh"],
            "year": e["span"],
            "size": "%dx%d" % (COVER_W, COVER_H),
            "prompt": style + " " + cover_subject(e, names),
        })
    for t in techs:
        records.append({
            "file": "assets/img/%s.webp" % t["id"],
            "base": t["id"],
            "kind": "item",
            "era": t["era"],
            "name": t["name"],
            "year": t["year"],
            "size": "%dx%d" % (ITEM_W, ITEM_H),
            "prompt": style + " " + t["subject"],
        })

    JSON_OUT.write_text(
        json.dumps({
            "style": style,
            "itemSize": "%dx%d" % (ITEM_W, ITEM_H),
            "coverSize": "%dx%d" % (COVER_W, COVER_H),
            "images": records,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    spec_path = ROOT / "_dev" / "image-spec.md"
    spec = spec_path.read_text(encoding="utf-8")
    spec_body = spec[spec.index("## 交付清单"):].rstrip()

    lines = []
    lines.append("# 配图施工图 · 人类科技树")
    lines.append("")
    lines.append("> 本文件由 `_dev/gen_image_prompts.py` 生成，请勿手改：条目数据改 `data.js`，"
                 "配图要求改 `_dev/image-spec.md`，然后重跑 `python _dev/gen_image_prompts.py`。")
    lines.append("")
    lines.append("**科技树的节点不配图**（节点是紧凑小卡，只有名称、年代与连线），图片只用在两处："
                 "详情页大图，以及图鉴视图里的卡片与时代封面。")
    lines.append("")
    lines.append("```")
    lines.append("assets/img/<科技 id>.webp      条目图 640×360    共 %d 张" % len(techs))
    lines.append("assets/img/cover-<时代 key>.webp  时代封面 960×540  共 %d 张" % len(eras))
    lines.append("```")
    lines.append("")
    lines.append("## 1. 交付规格")
    lines.append("")
    lines.append("> 以下要求摘自 `_dev/image-spec.md`（唯一真源）。")
    lines.append("")
    lines.extend(spec_body.split("\n"))
    lines.append("")
    lines.append("## 2. 统一风格串（每张图都要带上）")
    lines.append("")
    lines.append("```text")
    lines.append(style)
    lines.append("```")
    lines.append("")
    lines.append("**完整提示词 = 统一风格串 + 空格 + 下表「主体 / 画面」**，逐张拼接即可。")
    lines.append("")
    lines.append("## 3. 时代封面（%d 张）" % len(eras))
    lines.append("")
    lines.append("| 文件 | 尺寸 | 时代 | 完整提示词 |")
    lines.append("| --- | --- | --- | --- |")
    for e in eras:
        rec = [r for r in records if r["base"] == "cover-" + e["key"]][0]
        lines.append("| `%s.webp` | %s | %s | %s |"
                     % (rec["base"], rec["size"], e["zh"], rec["prompt"].replace("|", "/")))
    lines.append("")
    lines.append("## 4. 条目配图（%d 张）" % len(techs))
    lines.append("")
    for e in eras:
        group = [t for t in techs if t["era"] == e["key"]]
        lines.append("### %s（%s）· %d 张" % (e["zh"], e["key"], len(group)))
        lines.append("")
        lines.append("| 文件 | 尺寸 | 中文名 | 年代 | 完整提示词 |")
        lines.append("| --- | --- | --- | --- | --- |")
        for t in group:
            rec = [r for r in records if r["base"] == t["id"]][0]
            lines.append("| `%s.webp` | %s | %s | %s | %s |"
                         % (rec["base"], rec["size"], t["name"].replace("|", "/"),
                            t["year"].replace("|", "/"), rec["prompt"].replace("|", "/")))
        lines.append("")
    lines.append("## 5. 验收")
    lines.append("")
    lines.append("- [ ] 全部 %d 张图已放入 `assets/img/`，文件名与上表一致（后缀 `.webp`）" % len(records))
    lines.append("- [ ] 尺寸、体积达标；合计 ≤ 1.8 MB")
    lines.append("- [ ] 打开页面抽查：图鉴卡片与详情页大图均无占位块残留")
    lines.append("- [ ] 逐张核对构图：主体水平居中、上下各留 ≥22% 纯背景，没有被卡片裁掉的部分")
    lines.append("- [ ] 重跑 `python _dev/build_zip.py` 打包（脚本会统计图片体积）")
    lines.append("")

    MD.write_text("\n".join(lines), encoding="utf-8")

    print("源文件：%s" % DATA)
    print("时代：%d 个，科技：%d 项" % (len(eras), len(techs)))
    print("产物：%s（%d 张图：%d 封面 + %d 条目）" % (MD, len(records), len(eras), len(techs)))
    print("产物：%s" % JSON_OUT)


if __name__ == "__main__":
    main()
