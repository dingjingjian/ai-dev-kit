# -*- coding: utf-8 -*-
"""扫描 mp4 开头/结尾若干帧，测量内容包围盒是否只占左上 1/4。"""
import os, sys, subprocess, tempfile, shutil
from collections import Counter
from PIL import Image

FFMPEG = r"C:\Users\dingj\.workbuddy\binaries\python\envs\default\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win64-v4.2.2.exe"
if not os.path.exists(FFMPEG):
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

FILES = [
    (r"C:\Users\dingj\Documents\git\ai-dev-kit\vibeknow\cat-globe-3d\xiaohongshu\cat-globe-3d-demo.mp4", "底片"),
    (r"C:\Users\dingj\Documents\git\ai-dev-kit\vibeknow\cat-globe-3d\xiaohongshu\cat-globe-3d-demo-字幕解说版.mp4", "成片"),
]

SMALL = (180, 320)


def probe_wh(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True,
                         encoding="utf-8", errors="ignore").stderr
    wh = None
    dur = None
    for line in out.splitlines():
        if "Video:" in line and wh is None:
            import re
            m = re.search(r"(\d{2,5})x(\d{2,5})", line)
            if m:
                wh = (int(m.group(1)), int(m.group(2)))
        if "Duration:" in line:
            import re
            m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", line)
            if m:
                dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return wh, dur


def extract(path, start, count, outdir, tag):
    cmd = [FFMPEG, "-y", "-v", "error", "-ss", "%.3f" % start, "-i", path,
           "-frames:v", str(count), "-vf", "scale=%d:%d" % SMALL,
           os.path.join(outdir, tag + "_%04d.png")]
    subprocess.run(cmd, capture_output=True)


def bbox(img):
    px = img.load()
    w, h = img.size
    # 背景色 = 四角像素众数
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = Counter(corners).most_common(1)[0][0]

    def close(a, b, tol=10):
        return all(abs(a[i] - b[i]) <= tol for i in range(3))

    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if not close(px[x, y], bg):
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < 0:
        return None, bg
    return (x0, y0, x1, y1), bg


def main():
    tmp = tempfile.mkdtemp(prefix="framescan_")
    n = 30
    fps_probe = 25.0
    for path, label in FILES:
        wh, dur = probe_wh(path)
        print("=" * 70)
        print("%s  %s  %s  时长%.2fs" % (label, os.path.basename(path), wh, dur or -1))
        # 结尾：从 dur-1.2s 起抽 30 帧
        tail_start = max(0.0, (dur or 0) - 1.3)
        for tag, start in (("head", 0.0), ("tail", tail_start)):
            d = os.path.join(tmp, tag)
            os.makedirs(d, exist_ok=True)
            for f in os.listdir(d):
                os.remove(os.path.join(d, f))
            extract(path, start, n, d, tag)
            files = sorted(os.listdir(d))
            bad = []
            for i, f in enumerate(files):
                im = Image.open(os.path.join(d, f)).convert("RGB")
                bb, bg = bbox(im)
                if bb is None:
                    continue
                x0, y0, x1, y1 = bb
                wr = (x1 - x0 + 1) / SMALL[0]
                hr = (y1 - y0 + 1) / SMALL[1]
                if wr < 0.9 or hr < 0.9:
                    bad.append((f, round(wr, 2), round(hr, 2), bg, x0, y0, x1, y1))
            print("  [%s] 起 %.2fs  抽 %d 帧  异常 %d 帧" % (tag, start, len(files), len(bad)))
            for b in bad[:6]:
                print("      %s 宽占比%.2f 高占比%.2f 背景%s 框(%d,%d)-(%d,%d)" % b)
            if len(bad) > 6:
                print("      ... 其余 %d 帧同值" % (len(bad) - 6))
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
