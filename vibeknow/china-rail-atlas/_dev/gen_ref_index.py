# -*- coding: utf-8 -*-
"""由 _meta.json + ref_notes.json 生成 _dev/ref-index.md（参考照片索引）。

ref_notes.json: { "<id>": "从照片提炼的中文外观要点" }
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF_DIR = os.path.join(ROOT, "_dev", "ref")
META = os.path.join(REF_DIR, "_meta.json")
NOTES = os.path.join(ROOT, "_dev", "ref_notes.json")
OUT = os.path.join(ROOT, "_dev", "ref-index.md")

CAT_ZH = {"loco": "火车头", "pax": "客运车厢", "freight": "货运车厢", "station": "著名车站"}


def main():
    meta = json.load(open(META, encoding="utf-8"))
    notes = {}
    if os.path.exists(NOTES):
        notes = json.load(open(NOTES, encoding="utf-8"))

    # 按 cat 分组，保持条目顺序
    groups = {}
    for bid in sorted(meta.keys()):
        groups.setdefault(meta[bid]["cat"], []).append(bid)

    lines = []
    lines.append("# 参考照片索引（生图参考）")
    lines.append("")
    lines.append("照片均来自 Wikimedia Commons（可溯源、可自由使用的授权），")
    lines.append("仅作生图参考，不随项目分发。每个条目 1–3 张，")
    lines.append("落盘于 `_dev/ref/<条目id>-NN.jpg`。")
    lines.append("")
    lines.append("「外观要点」是看图提炼的关键特征，生成插画时应写进提示词或据此校对。")
    lines.append("")
    short = []
    for cat in ["loco", "pax", "freight", "station"]:
        if cat not in groups:
            continue
        lines.append("## %s（%s）" % (CAT_ZH[cat], cat))
        lines.append("")
        lines.append("| 条目 | 参考照片 | 来源与许可 | 外观要点 |")
        lines.append("|------|----------|------------|----------|")
        for bid in groups[cat]:
            v = meta[bid]
            name = v["name"]
            if not v["photos"]:
                lines.append("| %s `%s` | —（未找到） | — | %s |" % (name, bid, notes.get(bid, "")))
                short.append("%s %s" % (bid, name))
                continue
            cells = []
            srcs = []
            for p in v["photos"]:
                cells.append("`%s`" % p["file"])
                lic = p.get("license", "?")
                au = p.get("author", "")
                srcs.append("[%s](%s) · %s%s" % (
                    p["title"].replace("File:", ""),
                    p["source"], lic,
                    ("，" + au) if au else ""))
            lines.append("| %s `%s` | %s | %s | %s |" % (
                name, bid, "、".join(cells), "；".join(srcs), notes.get(bid, "")))
        lines.append("")

    if short:
        lines.append("## 照片不足的条目")
        lines.append("")
        lines.append("以下条目在 Commons 上缺少理想照片，生图时以同风格近似车型 / 建筑照片替代参考，")
        lines.append("或按文字描述执行：")
        lines.append("")
        for s in short:
            lines.append("- " + s)
        lines.append("")

    open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    n = sum(len(v["photos"]) for v in meta.values())
    print("ref-index.md 完成：条目 %d，照片 %d，要点 %d" % (len(meta), n, len(notes)))


if __name__ == "__main__":
    main()
