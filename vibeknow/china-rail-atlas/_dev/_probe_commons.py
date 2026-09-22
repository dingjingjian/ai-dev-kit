import json, sys, requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "ChinaRailAtlasRefFetcher/1.0 (educational reference-image collection; contact: local user)"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept": "application/json"})

API = "https://commons.wikimedia.org/w/api.php"

def search(q, limit=8):
    p = {
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "search", "gsrsearch": "filetype:bitmap " + q,
        "gsrnamespace": "6", "gsrlimit": str(limit),
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": "900",
    }
    r = S.get(API, params=p, timeout=30)
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", [])
    out = []
    for pg in pages:
        ii = (pg.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if int(ii.get("width") or 0) < 700:
            continue
        em = ii.get("extmetadata", {}) or {}
        out.append({
            "title": pg.get("title"),
            "thumb": ii.get("thumburl"),
            "page": ii.get("descriptionurl"),
            "lic": (em.get("LicenseShortName", {}) or {}).get("value"),
            "w": ii.get("width"), "h": ii.get("height"),
        })
    return out

for q in ["QJ class steam locomotive China", "China Railway 25G passenger coach",
          "Beijing South railway station", "China Railway CR400AF Fuxing"]:
    print("=" * 60)
    print("Q:", q)
    try:
        res = search(q)
        for it in res[:5]:
            print("   -", it["title"], it["w"], "x", it["h"], "|", it["lic"])
        if not res:
            print("   (no result)")
    except Exception as e:
        print("   ERROR", type(e).__name__, e)
