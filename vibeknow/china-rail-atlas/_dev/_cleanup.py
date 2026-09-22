# -*- coding: utf-8 -*-
import os, json, sys
sys.stdout.reconfigure(encoding="utf-8")

REF = r"C:\Users\dingj\Documents\git\ai-dev-kit\vibeknow\china-rail-atlas\_dev\ref"
META = os.path.join(REF, "_meta.json")
meta = json.load(open(META, encoding="utf-8"))

# 1) 删除误配/内饰照
BAD = ["pax-01-02.jpg", "pax-01-03.jpg", "pax-02-02.jpg", "pax-02-03.jpg", "freight-04-01.jpg"]
for fn in BAD:
    p = os.path.join(REF, fn)
    if os.path.exists(p):
        os.remove(p)
        print("删除", fn)

# 2) 主参考图重排：把整车/侧视最好的图放到 -01
REORDER = {
    "loco-04": ["File:China Railways RM-1001 steam locomotive 01.JPG",
                "File:China Railways RM-1001 steam locomotive 02.JPG",
                "File:China Railways RM-1001 steam locomotive 03.JPG"],
    "pax-05": ["File:China Railways 25K 20111102.jpg",
               "File:201104 25K coaches in Urumqi West Station.jpg",
               "File:HXD3D-0539 Locomotive dragging Double Decker 25K coach (K1001, -4) Approaching Yinzhen Railway Station, Mar 1 2024.jpg"],
}

for bid, want_titles in REORDER.items():
    v = meta[bid]
    by_title = {p["title"]: p for p in v["photos"]}
    new_photos = []
    for i, t in enumerate(want_titles):
        if t not in by_title:
            continue
        rec = dict(by_title[t])
        old_file = os.path.join(REF, rec["file"])
        ext = os.path.splitext(rec["file"])[1]
        new_file = os.path.join(REF, "%s-%02d%s" % (bid, i + 1, ext))
        tmp = new_file + ".tmp"
        os.replace(old_file, tmp)          # 先挪到临时名，避免相互覆盖
        rec["file"] = os.path.basename(new_file)
        new_photos.append(rec)
    # 处理完成后一次性落到最终名
    for rec in new_photos:
        tmp = os.path.join(REF, rec["file"]) + ".tmp"
        final = os.path.join(REF, rec["file"])
        if os.path.exists(tmp):
            os.replace(tmp, final)
    meta[bid]["photos"] = new_photos
    print("重排", bid, [p["file"] for p in new_photos])

json.dump(meta, open(META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("meta 已更新")
