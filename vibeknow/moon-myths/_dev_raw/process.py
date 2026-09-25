import os, sys, urllib.request, ssl
from PIL import Image

ssl._create_default_https_context = ssl._create_unverified_context

BASE = r"C:\Users\dingj\Documents\git\ai-dev-kit\vibeknow\moon-myths"
OUT = os.path.join(BASE, "assets", "illus")
TMP = os.path.join(BASE, "_dev_raw")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

IMGS = [
    ("china-change",            "https://aka.doubaocdn.com/s/qf4hWhHSUK"),
    ("japan-kaguya",            "https://aka.doubaocdn.com/s/zqiqV7mfNc"),
    ("india-soma",              "https://aka.doubaocdn.com/s/mfXKVZ9A7I"),
    ("sumer-nanna",             "https://aka.doubaocdn.com/s/0W7epzPtdd"),
    ("egypt-khonsu",            "https://aka.doubaocdn.com/s/0QUeUh8aQW"),
    ("greece-selene",           "https://aka.doubaocdn.com/s/QSnUfrGbKG"),
    ("norse-mani",              "https://aka.doubaocdn.com/s/bK6G4MdxRd"),
    ("celtic-brigid",           "https://aka.doubaocdn.com/s/rfpef5cdFz"),
    ("slavic-moon-tsar",        "https://aka.doubaocdn.com/s/5jbwn2iVI3"),
    ("aztec-coyolxauhqui",      "https://aka.doubaocdn.com/s/AMUEUTOlIF"),
    ("inuit-annigan",           "https://aka.doubaocdn.com/s/bI092NUJgL"),
    ("polynesia-maui",          "https://aka.doubaocdn.com/s/BNWR8aJnhK"),
    ("bantu-unkulunkulu",       "https://aka.doubaocdn.com/s/FlluWFEAc9"),
    ("aboriginal-ngalindi",     "https://aka.doubaocdn.com/s/R0lszoW1pd"),
]

TARGET = (1080, 360)
results = []
for slug, url in IMGS:
    raw = os.path.join(TMP, slug + ".png")
    if not os.path.exists(raw):
        req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(raw,"wb") as f:
            f.write(r.read())
    im = Image.open(raw).convert("RGB")
    # source is exactly 3:1; resize to target
    im = im.resize(TARGET, Image.LANCZOS)
    out = os.path.join(OUT, slug + ".webp")
    # try q=78, lower if >90KB
    q = 78
    while True:
        im.save(out, "WEBP", quality=q, method=6)
        kb = os.path.getsize(out)/1024
        if kb <= 90 or q <= 40:
            break
        q -= 4
    results.append((slug, im.size, q, round(kb,1)))

print(f"{'slug':28s} {'size':11s} {'q':>3s} {'KB':>7s}")
tot = 0
for slug,size,q,kb in results:
    tot += kb
    print(f"{slug:28s} {str(size):11s} {q:>3d} {kb:>7.1f}")
print(f"TOTAL: {tot:.1f} KB  ({tot/1024:.2f} MB)")
