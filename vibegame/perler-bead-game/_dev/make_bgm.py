# -*- coding: utf-8 -*-
"""
把 mp4（或任何含音轨的视频）的音频抽出来当拼豆坊 BGM，生成 perler-bead-game/bgm.js。

参考 vibeknow/rome-total-war-3d 的做法：容器上传白名单不收音频扩展名、CSP 又禁
data:/blob: 媒体源，所以音频以 base64 字符串藏在 .js 里，运行时由 main.js 的
loadBgm() 解成 ArrayBuffer 交给 Web Audio 播放。本工具只负责“产音频”，运行时零依赖。

为何重编码（不是直接塞整段视频音轨）：
  ① 单条 base64 解码后需 ≤ 1 MiB（性能预算），整段 204s 原曲远超限；
  ② 统一压成 64kbps 单声道 22.05kHz，截取前 --cap 秒，文件 0.8~0.9 MiB，zip 仍 < 1MB。

依赖（仅本工具，运行时代码零依赖）：
  pip install imageio-ffmpeg        # 自带静态 ffmpeg，无需系统安装

用法：
  python _dev/make_bgm.py "视频.mp4"
  python _dev/make_bgm.py "视频.mp4" --cap 115 --kbps 64
"""
import os, re, sys, base64, subprocess
from imageio_ffmpeg import get_ffmpeg_exe

ROOT = os.path.dirname(os.path.abspath(__file__))          # perler-bead-game/_dev
PROJ = os.path.dirname(ROOT)                               # perler-bead-game/
OUT = os.path.join(PROJ, "bgm.js")
BUDGET = 1048576                                           # 解码后 ≤ 1 MiB

args = sys.argv[1:]
SRC = next((a for a in args if not a.startswith("--")), None)
CAP = int((lambda v: v[0] if v else 115)(re.findall(r"--cap\s+(\d+)", " ".join(args))))
KBPS = int((lambda v: v[0] if v else 64)(re.findall(r"--kbps\s+(\d+)", " ".join(args))))

if not SRC:
    sys.exit("用法：python _dev/make_bgm.py \"视频.mp4\" [--cap 115] [--kbps 64]")

ff = get_ffmpeg_exe()

# --- 探测时长 ---
dur = 0.0
try:
    p = subprocess.run([ff, "-i", SRC], stderr=subprocess.PIPE, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", p.stderr)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
except Exception:
    pass
print("源时长: %.2f s" % dur)

# --- 抽取 + 重编码（解 AAC → 单声道 → 22.05k → 64kbps mp3）---
tmp = os.path.join(PROJ, "_dev", "_bgm_tmp.mp3")
cmd = [ff, "-y", "-i", SRC, "-vn", "-ac", "1", "-ar", "22050", "-b:a", "%dk" % KBPS]
if dur and dur > CAP:
    cmd += ["-t", str(CAP)]
cmd += [tmp]
subprocess.run(cmd, stderr=subprocess.DEVNULL, check=True)

size = os.path.getsize(tmp)
assert size <= BUDGET, "mp3 %d 字节超过 1MiB 预算，请降 --kbps 或缩短 --cap" % size
print("mp3 : %d KB (%.3f MiB)" % (size // 1024, size / 1048576))

seg = ("前 %.0f s" % min(dur, CAP)) if (dur and dur > CAP) else "整段"
with open(tmp, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("ascii")
os.remove(tmp)

header = (
    "/* 由 _dev/make_bgm.py 生成，请勿手改。\n"
    " * 源：%s\n"
    " * 本文件：%s · %dkbps 单声道 22.05kHz · %d KB\n" % (os.path.basename(SRC), seg, KBPS, size // 1024) +
    " * 为何 base64：容器上传白名单不收音频扩展名，且 CSP 禁 data:/blob: 媒体源，\n"
    " * 音频只能以字符串藏在 .js 里，运行时由 main.js 解成 ArrayBuffer 交给 Web Audio 播放。\n"
    " * 换曲：python _dev/make_bgm.py \"新视频.mp4\" 重跑生成新的 bgm.js 覆盖即可。 */\n"
)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(header + 'window.PBG_BGM="' + b64 + '";\n')
print("bgm.js 写入完成：%s（base64 %.2f MB）" % (OUT, len(b64) / 1048576))
