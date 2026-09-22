# -*- coding: utf-8 -*-
"""按标题策展参考图：剔除误配/细节照，重排主参考图，统一重编号。"""
import os, json, sys
sys.stdout.reconfigure(encoding="utf-8")

REF = r"C:\Users\dingj\Documents\git\ai-dev-kit\vibeknow\china-rail-atlas\_dev\ref"
META = os.path.join(REF, "_meta.json")
meta = json.load(open(META, encoding="utf-8"))

# 剔除：条目 -> 标题包含这些子串的照片整张删掉（含文件与 meta 记录）
DROP = {
    "freight-04": ["QHCH type 120 ton coal hopper"],          # 澳洲车，非 K18
    "freight-06": ["Xihu Sugar Factory"],                     # 台湾糖厂保留车，非 P64
    "freight-10": ["Cabin of DQ45", "Good of DQ45"],          # 细节照
    "pax-02": ["Attendant's office on YZ22"],                 # 内部照
    "pax-04": ["25G coach from K1182"],                       # 车内照
    "station-01": ["DF7C-5219 at Harbin East"],               # 机车照，不是站房
    "station-02": ["Zhengzhoudong", "Zhengzhou East"],        # 全是郑州东站，重抓
}

# 重排：条目 -> 按优先级列出标题子串（匹配不到的跳过）
REORDER = {
    "loco-04": ["RM-1001 steam locomotive 01", "RM-1001 steam locomotive 02", "RM-1001 steam locomotive 03"],
    "pax-05": ["25K 20111102", "25K coaches in Urumqi", "Locomotive dragging Double Decker 25K"],
    "pax-04": ["25G passenger coaches 20141009 211530", "25G passenger coaches 20141009 211517"],
}


def drop_and_renumber():
    for bid, subs in DROP.items():
        v = meta.get(bid)
        if not v:
            continue
        keep = []
        for p in v["photos"]:
            if any(s in p["title"] for s in subs):
                f = os.path.join(REF, p["file"])
                if os.path.exists(f):
                    os.remove(f)
                    print("剔除 %s  %s" % (bid, p["file"]))
            else:
                keep.append(p)
        v["photos"] = keep


def reorder():
    for bid, subs in REORDER.items():
        v = meta.get(bid)
        if not v:
            continue
        photos = v["photos"]
        # 先按文件名清点实际存在的（meta 可能漏）
        on_disk = sorted(
            f for f in os.listdir(REF)
            if f.startswith(bid + "-") and not f.endswith(".part"))
        by_file = {p["file"]: p for p in photos}
        for f in on_disk:                     # meta 缺失的补占位
            if f not in by_file:
                by_file[f] = {"file": f, "title": "(未知来源，需人工核对)",
                              "source": "", "license": "?", "author": "",
                              "orig": "", "kb": round(os.path.getsize(os.path.join(REF, f)) / 1024)}
        used, new_photos = set(), []
        for s in subs:                        # 按期望顺序挑
            for p in by_file.values():
                if p["file"] not in used and s in p["title"]:
                    new_photos.append(p)
                    used.add(p["file"])
                    break
        for p in by_file.values():            # 剩下的跟在后面
            if p["file"] not in used:
                new_photos.append(p)
                used.add(p["file"])
        # 重命名到 -01..-NN（临时名防覆盖）
        renames = []
        for i, p in enumerate(new_photos):
            ext = os.path.splitext(p["file"])[1] or ".jpg"
            renames.append((p["file"], "%s-%02d%s" % (bid, i + 1, ext)))
        for old, new in renames:
            if old == new:
                continue
            os.replace(os.path.join(REF, old),
                       os.path.join(REF, new + ".tmp"))
        for old, new in renames:
            tmp = os.path.join(REF, new + ".tmp")
            if os.path.exists(tmp):
                os.replace(tmp, os.path.join(REF, new))
        for p, (old, new) in zip(new_photos, renames):
            p["file"] = new
        v["photos"] = new_photos
        print("重排 %s → %s" % (bid, [p["file"] for p in new_photos]))


# 清掉空 cover-loco / cover-freight（改用条目参考图组合）
for cb in ["cover-loco", "cover-freight"]:
    if cb in meta and not meta[cb]["photos"]:
        del meta[cb]
        print("移除空条目", cb)

drop_and_renumber()
reorder()
json.dump(meta, open(META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
n = sum(len(v["photos"]) for v in meta.values())
print("meta 完成：条目 %d，照片 %d" % (len(meta), n))
