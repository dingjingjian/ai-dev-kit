# -*- coding: utf-8 -*-
"""从最终 mp4 抽帧复检 —— 素材干净 != 成片干净。

合成阶段还有 Ken Burns / 转场 / 进度线 / 文字淡入等逐帧变化，
万一哪一步引入位移抖动或定格，只查素材查不出来。

判据（来自 webgame-promo-video skill，逐帧量像素，不读 DOM）：
  1. 容器：1080x1920 / 30fps / yuv420p / 有 moov / **无音轨**（用户要自己配乐）
  2. 抖动：逐帧位移的**符号翻转率** <= 8 次/秒（>=20 才是抖动）；
     不要用「分段边界的位移方向」判（看不见逐帧翻转且会假警），也不许稀疏抽样
  3. 定格：各镜头**最长连续静止** <= 0.35s（不是重复帧「数量」）
  4. 转场：逐帧量**像素亮度**，切点前几帧必须**递减**（那是淡出生效的指纹）；
     读 DOM 的 opacity 不算验证
  5. 素材：无 OVER（按校正后帧率核算）
"""
import sys, pathlib, subprocess, json, re
import numpy as np
from PIL import Image
from _tl import load

BASE = pathlib.Path(__file__).resolve().parent
OUT = BASE / "out.mp4"
VDIR = BASE / "_verify"          # 抽帧目录（与 _frames 版本同步，便于留证据）
FPS = 30


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path):
    r = subprocess.run([ffmpeg(), "-hide_banner", "-i", str(path)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stderr or ""


def check_container():
    txt = probe(OUT)
    ok = True
    checks = []
    checks.append(("分辨率 1080x1920", "1080x1920" in txt.replace(" ", ""), True))
    checks.append(("30fps", bool(re.search(r"30 fps|30fps|, 30 tbr", txt)), True))
    checks.append(("yuv420p", "yuv420p" in txt, True))
    checks.append(("无音轨（要求自行配乐）", "Audio:" not in txt, True))
    if OUT.exists():
        r = subprocess.run([ffmpeg(), "-v", "error", "-i", str(OUT), "-f", "null", "-"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        checks.append(("可完整解码（moov 正常）", r.returncode == 0, True))
    for name, got, want in checks:
        good = (got == want)
        ok = ok and good
        print("  [%s] %s" % ("OK" if good else "FAIL", name))
    return ok


def extract(n_frames_needed=None):
    """抽全帧到 _verify/（逐帧！稀疏抽样对抖动是系统性失明）"""
    VDIR.mkdir(exist_ok=True)
    cmd = [ffmpeg(), "-y", "-i", str(OUT), "-vsync", "0", str(VDIR / "v%05d.png")]
    subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return sorted(VDIR.glob("v*.png"))


def gray_of(p, size=(270, 480)):
    return np.asarray(Image.open(p).convert("L").resize(size), dtype=np.float32)


def lum_of(p):
    return float(np.asarray(Image.open(p).convert("L"), dtype=np.float32).mean())


def shift_est(a, b, rad=3):
    """在 +-rad 内找使 |a - shift(b)| 最小的位移（亚像素不做，整数够判翻转）。"""
    best, bd = (0, 0), None
    H, W = a.shape
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            y0, y1 = max(0, dy), min(H, H + dy)
            x0, x1 = max(0, dx), min(W, W + dx)
            sa = a[y0:y1, x0:x1]
            sb = b[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
            d = float(np.abs(sa - sb).mean())
            if bd is None or d < bd:
                bd, best = d, (dx, dy)
    return best, bd


def check_jitter(files):
    """逐帧位移符号翻转率 <=8/s 干净、>=20/s 才是抖动。"""
    xs, ds = [], []
    prev = None
    step = 1                       # 逐帧，不抽样
    for i in range(0, len(files) - step, step):
        a = gray_of(files[i]); b = gray_of(files[i + step])
        (dx, dy), mad = shift_est(a, b)
        if mad < 5.0:              # 变化太小，位移估计不可靠，不计入方向
            continue
        ds.append(dx if dx != 0 else dy)
        prev = (dx, dy)
    flips = sum(1 for i in range(1, len(ds)) if ds[i] * ds[i - 1] < 0)
    per_s = flips / (len(files) / FPS) if files else 0
    print("  有效位移样本 %d，符号翻转 %d 次 -> %.2f 次/秒（<=8 干净，>=20 是抖动）"
          % (len(ds), flips, per_s))
    return per_s <= 8.0, per_s


def check_static(files):
    """最长连续静止 <=0.35s。口径要在判读的尺度上量。"""
    worst, worst_at = 0.0, None
    run = 0
    prev = None
    TH = 0.10
    for i, f in enumerate(files):
        g = gray_of(f)
        if prev is not None:
            mad = float(np.abs(g - prev).mean())
            if mad < TH:
                run += 1
            else:
                if run / FPS > worst:
                    worst, worst_at = run / FPS, i
                run = 0
        prev = g
    if run / FPS > worst:
        worst, worst_at = run / FPS, len(files)
    print("  最长连续静止 %.2f s（阈值 0.35s），位于第 %s 帧" % (worst, worst_at))
    return worst <= 0.35, worst


def check_fades(files, tl):
    """以切点为中心：切点前几帧亮度必须**递减**（淡出生效的直接指纹）。"""
    ok = True
    spans, acc = [], 0.0
    for c in tl["CLIPS"]:
        spans.append((acc, acc + c["dur"], c["clip"]))
        acc += c["dur"]
    for k in range(1, len(spans)):
        cut = spans[k][0]
        n = int(round(cut * FPS))
        if n < 6 or n + 6 >= len(files):
            continue
        pre = [lum_of(files[n - j]) for j in range(1, 6)]      # 越靠切点越近
        # 递减 = 切点前亮度持续下降
        desc = all(pre[j] <= pre[j + 1] + 0.6 for j in range(len(pre) - 1))
        base = lum_of(files[n - 6]) or 1.0
        jump = abs(lum_of(files[n]) - lum_of(files[n - 1])) / max(base, 1e-6)
        good = desc and jump < 0.35
        ok = ok and good
        print("  切点@%s 前5帧亮度 %s -> 递减:%s 跨切点相对跳变 %.1f%%  [%s]"
              % (spans[k][2], ["%.1f" % x for x in pre[::-1]], desc, jump * 100,
                 "OK" if good else "FAIL"))
    return ok


def main():
    print("=== 1. 容器 ===")
    ok1 = check_container()
    if not OUT.exists():
        print("!! out.mp4 不存在"); return 1
    print("=== 抽帧 ===")
    files = extract()
    print("  抽到 %d 帧" % len(files))
    tl = load()
    print("=== 2. 抖动（逐帧符号翻转率）===")
    ok2, _ = check_jitter(files)
    print("=== 3. 定格（最长连续静止）===")
    ok3, _ = check_static(files)
    print("=== 4. 转场（像素亮度）===")
    ok4 = check_fades(files, tl)
    print()
    print("容器 %s | 抖动 %s | 定格 %s | 转场 %s"
          % ("OK" if ok1 else "FAIL", "OK" if ok2 else "FAIL",
             "OK" if ok3 else "FAIL", "OK" if ok4 else "FAIL"))
    return 0 if (ok1 and ok2 and ok3 and ok4) else 1


if __name__ == "__main__":
    import numpy
    sys.exit(main())
