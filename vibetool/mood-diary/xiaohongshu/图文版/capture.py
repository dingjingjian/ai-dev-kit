# -*- coding: utf-8 -*-
"""用 Edge headless 截全页，再切成 8 张 2160x2880 的配图。"""
import subprocess, pathlib
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
HTML = HERE / "slides.html"
FULL = HERE / "_full.png"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

VIEW_W, VIEW_H = 1080, 1440 * 8
DPR = 2

cmd = [
    EDGE,
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=%d" % DPR,
    "--window-size=%d,%d" % (VIEW_W, VIEW_H),
    "--default-background-color=FFFFFFFF",
    "--screenshot=" + str(FULL),
    "file:///" + str(HTML).replace("\\", "/"),
]
print(">>", " ".join(cmd))
subprocess.run(cmd, check=True, timeout=120)

img = Image.open(FULL)
print("full size:", img.size)
W, H = img.size
SH = H // 8

names = [
    "01-封面.png",
    "02-为什么做.png",
    "03-灵感来源.png",
    "04-六种心情.png",
    "05-心情日历.png",
    "06-本月心情与统计.png",
    "07-主题与隐私.png",
    "08-收尾.png",
]
for i, name in enumerate(names):
    crop = img.crop((0, i * SH, W, (i + 1) * SH))
    out = HERE / name
    crop.save(out, "PNG", optimize=True)
    print("saved", out.name, crop.size)

FULL.unlink()
print("done")
