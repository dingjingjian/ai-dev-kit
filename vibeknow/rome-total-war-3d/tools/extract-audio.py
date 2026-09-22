"""从视频文件里抽出音轨，输出 mp3（供 tools/make-bgm.mjs 使用）。

用法：
    python tools/extract-audio.py "视频.mp4"
    python tools/extract-audio.py "视频.mp4" -o assets/audio/bgm.mp3 --kbps 320

ffmpeg 不在 PATH —— 用 imageio_ffmpeg 自带的二进制（pip install imageio-ffmpeg）。
输出默认 320kbps 立体声 mp3：源文件只是构建输入、不进包，码率给足，
后面 make-bgm.mjs 会重编码到 64kbps 单声道 22.05kHz。
"""
import argparse, os, re, subprocess, sys

def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        for c in ('ffmpeg', 'ffmpeg.exe'):
            from shutil import which
            p = which(c)
            if p:
                return p
    sys.exit('找不到 ffmpeg。请先 pip install imageio-ffmpeg，或把 ffmpeg 放进 PATH。')


def probe(exe, src):
    """imageio_ffmpeg 只带 ffmpeg、不带 ffprobe，所以直接读 ffmpeg 的元信息输出
    （它写在 stderr 上；不给输出文件时退出码为 1，属正常）。"""
    r = subprocess.run([exe, '-hide_banner', '-i', src],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    txt = (r.stderr or '') + (r.stdout or '')
    dur, audios = 0.0, []
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.?\d*)', txt)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    for line in txt.splitlines():
        if ' Audio: ' in line:
            seg = line.split(' Audio: ', 1)[1]
            codec = seg.split(',')[0].strip()
            hz = re.search(r'(\d+)\s*Hz', seg)
            ch = re.search(r'(mono|stereo|(\d\.?\d?) channels?)', seg)
            audios.append({
                'codec': codec,
                'hz': hz.group(1) if hz else '?',
                'ch': ch.group(1) if ch else '?',
            })
        elif 'Stream #' in line and 'Audio' in line:
            pass
    return {'duration': dur, 'audios': audios}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('-o', '--out', default='assets/audio/bgm.mp3')
    ap.add_argument('--kbps', type=int, default=320)
    ap.add_argument('--mono', action='store_true', help='直接混成单声道（默认保留立体声）')
    a = ap.parse_args()

    src = os.path.abspath(a.src)
    if not os.path.exists(src):
        sys.exit('源文件不存在：' + src)
    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    exe = ffmpeg_exe()
    info = probe(exe, src)
    audios = info['audios']

    print('源文件 : ' + os.path.basename(src))
    print('  时长 ' + ('%.1f' % info['duration']) + 's · '
          + ('%.1f' % (os.path.getsize(src) / 1048576)) + ' MB')
    if not audios:
        sys.exit('这个文件里没有音轨。')
    for s in audios:
        print('  音轨  %s · %sHz · %s' % (s['codec'], s['hz'], s['ch']))

    cmd = [exe, '-hide_banner', '-v', 'error', '-y', '-i', src,
           '-vn',                       # 丢掉视频
           '-map', '0:a:0',             # 只取第一条音轨
           '-ac', '1' if a.mono else '2',
           '-ar', '44100',
           '-c:a', 'libmp3lame', '-b:a', str(a.kbps) + 'k',
           out]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0 or not os.path.exists(out):
        sys.exit('提取失败：' + (r.stderr or '').strip())

    print('\n输出   : ' + os.path.relpath(out) + ' · '
          + ('%.2f' % (os.path.getsize(out) / 1048576)) + ' MB')
    print('\n下一步（循环点分析与重编码）：')
    print('  cd tools && npm i mpg123-decoder @breezystack/lamejs')
    print('  node tools/analyze-bgm.mjs "' + os.path.relpath(out).replace(os.sep, '/') + '"')
    print('  node tools/make-bgm.mjs "' + os.path.relpath(out).replace(os.sep, '/') + '" --a <起> --b <止>')


if __name__ == '__main__':
    main()
