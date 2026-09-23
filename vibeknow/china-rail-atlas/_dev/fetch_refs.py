# -*- coding: utf-8 -*-
"""按条目从 Wikimedia Commons 抓参考照片，落盘到 _dev/ref/<id>-NN.jpg。

用法：
    python _dev/fetch_refs.py            # 增量（已存在的跳过）
    python _dev/fetch_refs.py --force    # 重下全部
    python _dev/fetch_refs.py --only loco-01,pax-04

产出：
    _dev/ref/<id>-01.jpg ...            参考照片
    _dev/ref/_meta.json                 每张的来源页 / 许可 / 作者 / 原标题
"""
import json, os, re, sys, time, html, argparse
import requests

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF_DIR = os.path.join(ROOT, "_dev", "ref")
META_PATH = os.path.join(REF_DIR, "_meta.json")

UA = "ChinaRailAtlas/1.0 (reference image collection for an educational rail atlas; contact via GitHub issue)"
API = "https://commons.wikimedia.org/w/api.php"
S = requests.Session()
S.headers.update({"User-Agent": UA})

WANT = 3           # 每个条目目标张数
THUMB_W = 900      # 抓取宽度

# ---------------- 通用排除规则（对这些照片一概不要） ----------------
EXCLUDE_ANY = [
    "interior", "inside", "nameplate", "plate detail", "builder", "works plate",
    "logo", "emblem", "sign ", " sign", "signage", "poster", "diagram", "map",
    "ticket", "timetable", "chart", "graph", "logo of", "flag of",
    "driver", "cab view", "controller", "throttle", "cockpit", "console",
    "toilet", "lavatory", "washroom", "berth interior", "kitchen", "dining room",
    "seats on", "seat map", "seat plan",
    "bogie detail", "coupler", "buckeye", "pantograph detail", "roof detail",
    "wreck", "derail", "accident", "scrap", "scrapyard", "cutting up",
    "scale model", "model train", "toy", " miniature", "lego",
    "cartoon", "postcard", "stamp", "banknote", "coin", "cover of",
    "night view", "at night", "under construction", "construction site",
]
# 车站排除：只要站房外观，不要站台 / 候车厅 / 地铁
EXCLUDE_STATION = [
    "subway", "metro line", "metro station", "underground station",
    "plan of", "layout", "yard", "locomotive shed", "depot",
    "construction", "demolition",
]
SOFT_STATION = [  # 降权：尽量别用站台/室内视角当主参考
    "platform", "concourse", "waiting", "ticket", "interior", "hall", "inside",
]
PREFER_STATION = ["exterior", "facade", "facade", "front", "building", "station building", "main entrance"]

# ---------------- 逐条检索词 ----------------
# must: 标题里至少含其中一个关键词才算「命中主体」（大小写不敏感）
Q = {
    # 机车
    "loco-01": {"must": ["rocket of china", "longhao", "龙号"], "q": ["China Railways Longhao 龙号 locomotive", "Rocket of China locomotive 1881"]},
    "loco-02": {"must": ["jf", "解放", "jianfang"], "q": ["China Railways JF steam locomotive", "China Railways JF1 解放 locomotive"]},
    "loco-03": {"must": ["qj"], "q": ["China Railways QJ steam locomotive", "China Railways QJ locomotive"]},
    "loco-04": {"must": ["rm ", "rm-", "人民"], "q": ["China Railways RM steam locomotive", "China Railways RM class passenger steam locomotive"]},
    "loco-05": {"must": ["sy", "上游"], "q": ["China Railways SY steam locomotive", "China Railways SY locomotive shunter"]},
    "loco-06": {"must": ["df ", "dongfeng", "东风"], "q": ["China Railways DF diesel locomotive 东风", "China Railways Dongfeng diesel locomotive"]},
    "loco-07": {"must": ["df4", "df4b", "df4d"], "q": ["China Railways DF4B diesel locomotive", "China Railways DF4 diesel locomotive"]},
    "loco-08": {"must": ["df5"], "q": ["China Railways DF5 diesel locomotive", "China Railways DF5 shunting locomotive"]},
    "loco-09": {"must": ["df11"], "q": ["China Railways DF11 diesel locomotive", "China Railways DF11 passenger diesel"]},
    "loco-10": {"must": ["df8b", "df8"], "q": ["China Railways DF8B diesel locomotive", "China Railways DF8B freight locomotive"]},
    "loco-11": {"must": ["ss1", "shaoshan 1"], "q": ["China Railways SS1 electric locomotive", "China Railways Shaoshan 1 electric locomotive"]},
    "loco-12": {"must": ["ss3", "shaoshan 3"], "q": ["China Railways SS3 electric locomotive", "China Railways Shaoshan 3 electric locomotive"]},
    "loco-13": {"must": ["ss4", "shaoshan 4"], "q": ["China Railways SS4 electric locomotive", "China Railways SS4 freight electric locomotive"]},
    "loco-14": {"must": ["ss8", "shaoshan 8"], "q": ["China Railways SS8 electric locomotive", "China Railways Shaoshan 8 electric locomotive"]},
    "loco-15": {"must": ["hxd3", "harmony electric"], "q": ["China Railways HXD3 electric locomotive", "China Railways HXD3 freight locomotive"]},
    "loco-16": {"must": ["hxd3d"], "q": ["China Railways HXD3D electric locomotive", "China Railways HXD3D passenger locomotive"]},
    "loco-17": {"must": ["crh2"], "q": ["CRH2 high speed train", "China Railways CRH2 EMU"]},
    "loco-18": {"must": ["crh380a", "crh380"], "q": ["CRH380A high speed train", "CRH380A EMU China"]},
    "loco-19": {"must": ["cr400af", "cr400"], "q": ["CR400AF Fuxing high speed train", "CR400AF EMU China"]},
    "loco-20": {"must": ["cr200j"], "q": ["CR200J EMU China Railway", "CR200J train"]},
    # 客车
    "pax-01": {"must": ["type 21", " 21 "], "q": ["China Railways Type 21 coach", "China Railways 21 passenger car"]},
    "pax-02": {"must": ["type 22", "uz22", "yz22", " 22 "], "q": ["China Railways Type 22 coach", "China Railways green train Type 22 coach"]},
    "pax-03": {"must": ["syz", "srz", "double deck", "double-deck", "syw"],
               "q": ["SYZ25B double deck coach", "China Railways SYZ passenger car", "Railroad passenger car of China SRZ25B"]},
    "pax-04": {"must": ["25g"], "q": ["China Railways Type 25G coach", "China Railways 25G passenger coach"]},
    "pax-05": {"must": ["25k"], "q": ["China Railways Type 25K coach", "China Railways 25K passenger coach"]},
    "pax-06": {"must": ["25t"], "q": ["China Railways Type 25T coach", "China Railways 25T passenger coach"]},
    "pax-07": {"must": ["yw25", "yw ", "hard sleeper", "hard sleeper"], "q": ["China Railways YW25G hard sleeper", "China Railways hard sleeper coach YW"]},
    "pax-08": {"must": ["rw25", "rw ", "soft sleeper"], "q": ["China Railways RW25T soft sleeper", "China Railways soft sleeper coach RW"]},
    "pax-09": {"must": ["ca25", "dining car", "restaurant car"], "q": ["China Railways dining car coach", "China Railways CA25 dining car"]},
    "pax-10": {"must": ["kd25", "power car", "generator car"], "q": ["China Railways KD25K power car", "China Railways generator coach air conditioning"]},
    # 货车
    "freight-01": {"must": ["c62"], "q": ["China Railways C62 gondola car", "China Railways C62 wagon"]},
    "freight-02": {"must": ["*"], "q": ["China Railways tank wagon"]},   # G60 无存图，取国产罐车同类
    "freight-03": {"must": ["n17", "flatcar", "flat wagon"], "q": ["China Railways N17 flatcar", "China Railways flat wagon N17"]},
    "freight-04": {"must": ["k18", "c80", "km70", "coal hopper"], "q": ["China Railways K18 hopper car", "China Railways C80 coal hopper"]},
    "freight-05": {"must": ["c64"], "q": ["China Railways C64 gondola car", "China Railways C64 wagon"]},
    "freight-06": {"must": ["pb ", "pb7", "p70", "p64", "boxcar"], "q": ["China railways PB wagon", "China Railways boxcar covered"]},  # P64 无存图，取 PB/P70 同类
    "freight-07": {"must": ["x2k", "x6b", "x70", "container"], "q": ["China Railways container wagon", "container flat car China railway"]},
    "freight-08": {"must": ["c70"], "q": ["China Railways C70 gondola car", "China Railways C70 wagon"]},
    "freight-09": {"must": ["p70"], "q": ["China Railways P70 boxcar", "China Railways covered wagon P70"]},
    "freight-10": {"must": ["dq45", "dk36", "dq ", "schnabel", "d26"],
                   "q": ["China Railways DQ45 schnabel", "China railways DK36 heavy duty"]},  # D26 无存图，取 DQ45/DK36 同类长大货物车
    # 车站（检索词保持简短，外观/站台交给评分规则区分）
    "station-01": {"must": ["harbin"], "q": ["Harbin railway station"]},
    "station-02": {"must": ["zhengzhou railway station"], "q": ["Zhengzhou railway station"]},
    "station-03": {"must": ["qinglongqiao", "qing long qiao"], "q": ["Qinglongqiao railway station"]},
    "station-04": {"must": ["beijing railway station", "beijing station"], "q": ["Beijing railway station"]},
    "station-05": {"must": ["guangzhou"], "q": ["Guangzhou railway station"]},
    "station-06": {"must": ["shanghai railway station", "shanghai station"], "q": ["Shanghai railway station"]},
    "station-07": {"must": ["lhasa"], "q": ["Lhasa railway station"]},
    "station-08": {"must": ["beijing south"], "q": ["Beijing South railway station"]},
    "station-09": {"must": ["wuhan railway station", "wuhan station"], "q": ["Wuhan railway station"]},
    "station-10": {"must": ["hongqiao"], "q": ["Shanghai Hongqiao railway station"]},
    # 封面（cover-loco / cover-freight 在 Commons 无合适整排图，改用条目参考图组合）
    "cover-pax": {"must": ["coach", "passenger"], "q": ["China Railways passenger coaches row", "Chinese railway passenger train coaches"]},
    "cover-station": {"must": ["station"], "q": ["China railway station buildings", "Chinese railway station architecture"]},
}

ITEM_WANT = {"cover-loco": 2, "cover-pax": 2, "cover-freight": 2, "cover-station": 2}


def _retry(fn, tries=6, wait=4.0):
    """带 429 长退避的重试。"""
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            last = e
            s = str(e)
            if "429" in s or "Too Many Requests" in s:
                time.sleep(60.0 * (i + 1))     # 被限流：长退避
            else:
                time.sleep(wait * (i + 1))
    raise last


def search(q, limit=14):
    p = {
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "search", "gsrsearch": "filetype:bitmap " + q,
        "gsrnamespace": "6", "gsrlimit": str(limit),
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": str(THUMB_W),
        "iiextmetadatafilter": "LicenseShortName|Artist|Credit|ImageDescription",
    }
    r = _retry(lambda: S.get(API, params=p, timeout=40))
    r.raise_for_status()
    return r.json().get("query", {}).get("pages", []) or []


def clean_html(s):
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()[:180]


def pick(entry_id, cat):
    cfg = Q[entry_id]
    must = [m.lower() for m in cfg["must"]]
    excl = list(EXCLUDE_ANY)
    prefer_st = cat == "station"
    if prefer_st:
        excl = excl + EXCLUDE_STATION

    seen, cands = set(), []
    for q in cfg["q"]:
        try:
            pages = search(q)
        except Exception as e:
            print("    ! 检索失败 %s (%s)" % (q, e))
            continue
        time.sleep(3.0)   # 检索间隔，避免触发限流
        for pg in pages:
            title = pg.get("title", "")
            low = title.lower()
            if title in seen:
                continue
            ii = (pg.get("imageinfo") or [{}])[0]
            if ii.get("mime") not in ("image/jpeg", "image/png"):
                continue
            w, h = int(ii.get("width") or 0), int(ii.get("height") or 0)
            if w < 700 or h < 380:
                continue
            seen.add(title)
            if any(x in low for x in excl):
                continue
            if "*" not in must and not any(m in low for m in must):
                continue
            ar = w / float(h)
            score = 0.0
            if prefer_st:
                if any(k in low for k in PREFER_STATION):
                    score += 4
                if any(k in low for k in SOFT_STATION):
                    score -= 3.0
                score += 1.5 if 1.1 <= ar <= 2.0 else -1.0
            else:
                score += 1.5 if 1.25 <= ar <= 2.1 else -1.2
            score += min(w, 4000) / 4000.0
            score += 0.4 * len([m for m in must if m in low])
            em = ii.get("extmetadata", {}) or {}
            cands.append({
                "title": title, "thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"),
                "lic": clean_html((em.get("LicenseShortName", {}) or {}).get("value")) or "?" ,
                "artist": clean_html((em.get("Artist", {}) or {}).get("value")),
                "w": w, "h": h, "score": score, "query": q,
            })
    cands.sort(key=lambda c: -c["score"])
    return cands


def download(url, path):
    r = _retry(lambda: S.get(url, timeout=60))
    r.raise_for_status()
    ct = r.headers.get("Content-Type", "")
    if "jpeg" in ct or url.lower().endswith((".jpg", ".jpeg")):
        ext = "jpg"
    elif "png" in ct:
        ext = "png"
    else:
        return None
    out = os.path.splitext(path)[0] + "." + ext
    tmp = out + ".part"
    with open(tmp, "wb") as f:
        f.write(r.content)
    os.replace(tmp, out)
    return out


def quality_gate(path):
    """清晰度 / 亮度把关：运动模糊、过暗过曝的照片不能当参考。返回 (ok, 原因)。"""
    from PIL import Image, ImageFilter
    try:
        im = Image.open(path)
        im = im.convert("L")
        w0, h0 = im.size
        nw = 480
        im = im.resize((nw, max(1, int(h0 * nw / w0))))
        mean = sum(im.getdata()) / (im.size[0] * im.size[1])
        lap = im.filter(ImageFilter.Kernel((3, 3),
              [0, 1, 0, 1, -4, 1, 0, 1, 0], 1, 0))
        px = list(lap.getdata())
        m = sum(px) / len(px)
        var = sum((p - m) ** 2 for p in px) / len(px)
    except Exception as e:
        return False, "read fail %s" % e
    if mean < 20:
        return False, "too dark (mean %.0f)" % mean
    if mean > 246:
        return False, "too bright (mean %.0f)" % mean
    if var < 90:
        return False, "blurry (lapvar %.0f)" % var
    return True, "lapvar %.0f mean %.0f" % (var, mean)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    os.makedirs(REF_DIR, exist_ok=True)
    meta = {}
    if os.path.exists(META_PATH):
        try:
            meta = json.load(open(META_PATH, encoding="utf-8"))
        except Exception:
            meta = {}

    jp = os.path.join(ROOT, "_dev", "image-prompts.json")
    imgs = json.load(open(jp, encoding="utf-8"))["images"]

    only = set(x.strip() for x in args.only.split(",") if x.strip())
    short = []
    n_new = 0

    for it in imgs:
        bid = it["base"]
        if only and bid not in only:
            continue
        if bid not in Q:
            continue
        want = ITEM_WANT.get(bid, WANT)
        existing = sorted(
            f for f in os.listdir(REF_DIR)
            if f.lower().startswith(bid + "-") and not f.startswith("_")
            and not f.endswith(".part"))
        keep = [rec for rec in meta.get(bid, {}).get("photos", [])
                if rec.get("file") in existing]
        done_titles = set(rec.get("title") for rec in keep)
        if len(existing) >= want and not args.force:
            print("  · %-14s 已存在 %d 张，跳过" % (bid, len(existing)))
            continue

        cands = pick(bid, it["cat"])
        saved = list(keep)
        n = len(keep)
        for c in cands:
            if n >= want:
                break
            if c["title"] in done_titles:
                continue
            out = os.path.join(REF_DIR, "%s-%02d" % (bid, n + 1))
            try:
                real = download(c["thumb"], out + ".jpg")
            except Exception as e:
                print("    ! 下载失败 %s (%s)" % (c["title"], e))
                continue
            if not real:
                continue
            ok, why = quality_gate(real)
            if not ok:
                print("    ✗ 质量淘汰 %s (%s)" % (c["title"], why))
                os.remove(real)
                continue
            n += 1
            rec = {
                "file": os.path.basename(real), "title": c["title"],
                "source": c["page"], "license": c["lic"], "author": c["artist"],
                "orig": "%dx%d" % (c["w"], c["h"]),
                "kb": round(os.path.getsize(real) / 1024),
                "quality": why,
            }
            saved.append(rec)
            n_new += 1
            time.sleep(1.5)

        meta[bid] = {"name": it["name"], "cat": it["cat"], "photos": saved}
        if len(saved) < 2:
            short.append("%s(%s) 只有 %d 张" % (bid, it["name"], len(saved)))
        print("  ✓ %-14s %s → %d 张" % (bid, it["name"], len(saved)))

    json.dump(meta, open(META_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    total = sum(len(v["photos"]) for v in meta.values())
    print("\n=== 完成 ===")
    print("条目：%d / %d   照片：%d   新建：%d" % (len(meta), len(imgs), total, n_new))
    if short:
        print("不足 2 张的条目：")
        for s in short:
            print("   -", s)


if __name__ == "__main__":
    main()
