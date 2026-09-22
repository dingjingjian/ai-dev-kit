"""Cut out light-gray background from gear icons using edge flood-fill.

Pure-Pillow (no numpy).  Only removes background-connected light pixels;
interior light parts of the object are preserved.
"""
import os, glob
from collections import deque
from PIL import Image, ImageFilter

GEAR_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'gear')
OUT_DIR  = os.path.join(os.path.dirname(__file__), '..', 'assets', 'gear_cutout')

MIN_BRIGHT  = 200   # darker than this -> always foreground (object)
COLOR_TOL   = 38    # per-channel tolerance from border seed colour


def cutout(img_rgb):
    w, h = img_rgb.size
    px = img_rgb.load()

    # seed colour = mean of border pixels
    rs = gs = bs = n = 0
    for x in range(w):
        for y in (0, h - 1):
            r, g, b = px[x, y]
            rs += r; gs += g; bs += b; n += 1
    for y in range(h):
        for x in (0, w - 1):
            r, g, b = px[x, y]
            rs += r; gs += g; bs += b; n += 1
    seed = (rs // n, gs // n, bs // n)

    visited = bytearray(w * h)
    is_bg   = bytearray(w * h)
    q = deque()

    def enqueue(x, y):
        idx = y * w + x
        if visited[idx]:
            return
        r, g, b = px[x, y]
        bright = (r + g + b) / 3
        if bright < MIN_BRIGHT:
            visited[idx] = 1
            return
        dist = abs(r - seed[0]) + abs(g - seed[1]) + abs(b - seed[2])
        if dist > COLOR_TOL * 3:
            visited[idx] = 1
            return
        q.append((x, y))

    # seed from border
    for x in range(w):
        enqueue(x, 0); enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y); enqueue(w - 1, y)

    while q:
        x, y = q.popleft()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b = px[x, y]
        bright = (r + g + b) / 3
        if bright < MIN_BRIGHT:
            continue
        dist = abs(r - seed[0]) + abs(g - seed[1]) + abs(b - seed[2])
        if dist > COLOR_TOL * 3:
            continue
        is_bg[idx] = 1
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                ni = ny * w + nx
                if not visited[ni]:
                    q.append((nx, ny))

    # build alpha
    alpha = Image.new('L', (w, h))
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            ap[x, y] = 0 if is_bg[y * w + x] else 255

    # soft edge
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.6))

    rgba = img_rgb.convert('RGBA')
    rgba.putalpha(alpha)
    return rgba


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    files = sorted(glob.glob(os.path.join(GEAR_DIR, '*.webp')))
    print(f'Processing {len(files)} gear images ...')
    ok = 0
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        im = Image.open(f).convert('RGB')
        out = cutout(im)
        out_path = os.path.join(OUT_DIR, name + '.webp')
        out.save(out_path, 'WEBP', lossless=False, quality=90, alpha_quality=100)
        chk = Image.open(out_path)
        if chk.mode == 'RGBA':
            a = list(chk.getchannel('A').getdata())
            tp = sum(1 for v in a if v < 250) / len(a) * 100
            print(f'  {name:24s} transparent={tp:5.1f}%  size={os.path.getsize(out_path):5d}B')
            ok += 1
        else:
            print(f'  {name:24s} *** NO ALPHA ***')
    print(f'\nDone: {ok}/{len(files)} with transparency -> {OUT_DIR}')


if __name__ == '__main__':
    main()
