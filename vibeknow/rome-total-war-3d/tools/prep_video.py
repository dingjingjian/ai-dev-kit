# -*- coding: utf-8 -*-
"""把生视频模型出的片段转成凯旋门过渡页能直接用的 gate.mp4。

要做的四件事（手工做既麻烦又容易漏）：
  裁成 16:9 → 缩到 1280×720 → 去掉音轨 → H.264 重编码并压进体积预算

输出固定落在 assets/video/gate.mp4（页面只认这一个文件名）。

用法：
  python tools/prep_video.py --src 原片.mp4
  python tools/prep_video.py --src 原片.mp4 --dur 7        # 只取前 7 秒
  python tools/prep_video.py --src 原片.mp4 --dry          # 只报不转，先看时长/尺寸
  python tools/prep_video.py --src 原片.mp4 --max-kb 900   # 收紧预算（默认 1200KB）

压不进预算时的降级顺序（每步都会打印）：
  crf 30 → 32 → 34 → 36 → 降到 960×540 重来一遍
  全部失败就报出来，绝不写出一个超重的 mp4 —— 包体是硬约束。

ffmpeg 不在 PATH：用 imageio_ffmpeg 自带的二进制（pip install imageio-ffmpeg）。
"""

import os
import re
import sys
import argparse
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DEFAULT = os.path.join(ROOT, 'assets', 'video', 'gate.mp4')
KB = 1024


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        from shutil import which
        for c in ('ffmpeg', 'ffmpeg.exe'):
            p = which(c)
            if p:
                return p
    sys.exit('找不到 ffmpeg。请 pip install imageio-ffmpeg，或把 ffmpeg 放进 PATH。')


def probe(exe, src):
    """imageio_ffmpeg 只带 ffmpeg 不带 ffprobe，元信息从 ffmpeg -i 的 stderr 上读。"""
    r = subprocess.run([exe, '-hide_banner', '-i', src],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    txt = (r.stderr or '') + (r.stdout or '')
    dur, w, h, audio = 0.0, 0, 0, False
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.?\d*)', txt)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    for line in txt.splitlines():
        if ' Video: ' in line and not w:
            m2 = re.search(r'(\d{2,5})x(\d{2,5})', line)
            if m2:
                w, h = int(m2.group(1)), int(m2.group(2))
        if ' Audio: ' in line:
            audio = True
    return dur, w, h, audio


def build_args(exe, src, out, w, h, dur, crf):
    a = [exe, '-y', '-hide_banner', '-loglevel', 'error', '-i', src]
    if dur:
        a += ['-t', '%.3f' % dur]
    vf = 'scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,fps=30' % (w, h, w, h)
    a += ['-an', '-vf', vf,
          '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
          '-crf', str(crf), '-g', '60', '-movflags', '+faststart', out]
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', default=OUT_DEFAULT)
    ap.add_argument('--dur', type=float, default=0, help='只取前 N 秒（0 = 不截）')
    ap.add_argument('--w', type=int, default=1280)
    ap.add_argument('--h', type=int, default=720)
    ap.add_argument('--max-kb', type=int, default=1200)
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    src = os.path.abspath(args.src)
    if not os.path.isfile(src):
        sys.exit('FAIL 源文件不存在：%s' % src)
    exe = ffmpeg_exe()
    dur, w, h, audio = probe(exe, src)

    print('源片：%s' % os.path.basename(src))
    print('  %.2fs · %dx%d%s' % (dur, w, h, ' · 含音轨（会被去掉）' if audio else ''))
    if dur and dur < 4:
        print('note 时长不足 4s，页面字幕来不及读完；建议 6–8s')
    if dur and dur > 9:
        print('note 时长超过 9s，页面会在 9s 处强制进检阅页；建议 6–8s 或用 --dur 截断')

    if args.dry:
        print('（--dry：没有转码）')
        return

    out = args.out
    d = os.path.dirname(out)
    if not os.path.isdir(d):
        os.makedirs(d)

    plan = [(args.w, args.h, 30), (args.w, args.h, 32), (args.w, args.h, 34), (args.w, args.h, 36),
            (960, 540, 32), (960, 540, 34), (960, 540, 36)]
    last = None
    for ww, hh, crf in plan:
        subprocess.run(build_args(exe, src, out, ww, hh, args.dur, crf), check=True)
        size = os.path.getsize(out) if os.path.exists(out) else 0
        last = (ww, hh, crf, size)
        print('  试 %dx%d crf%d → %dKB' % (ww, hh, crf, size / KB))
        if size <= args.max_kb * KB:
            break

    ww, hh, crf, size = last
    odur, ow, oh, oaudio = probe(exe, out)
    print('\n输出：%s' % os.path.relpath(out, ROOT))
    print('  %.2fs · %dx%d · %dKB / 预算 %dKB%s'
          % (odur, ow, oh, size / KB, args.max_kb,
             ' · 有音轨（异常！）' if oaudio else ' · 无音轨'))
    if size > args.max_kb * KB:
        print('FAIL 压不进 %dKB：细节量太大（画面噪点/纹理过多）。换镜头或缩短时长再来。' % args.max_kb)
        sys.exit(1)
    print('ok   下一步：node tools/check_assets.js')


if __name__ == '__main__':
    main()
