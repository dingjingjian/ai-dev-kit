# -*- coding: utf-8 -*-
"""把生图模型的原图批量处理成能直接落位的素材。

出图 → 能用之间差着五步，手工做 48 次不现实，也容易漏：
  居中裁方 → 缩到目标尺寸 → 转 sRGB → 转 WebP 并压到预算内 → 写进 assets/ 下的正确文件名

真源（本脚本只读）：
  assets/units.js           48 个兵种 id（文件名）
  docs/场景配图需求.md       §一 各图位建议尺寸、§九 落位文件名
  tools/check_assets.js      每个图位的体积上限（预算的唯一真源，不在这里另写一份）

用法：
  python tools/prep_units.py --src <原图目录>            # 兵种图 + 场景图一起处理
  python tools/prep_units.py --src <原图目录> --kind units
  python tools/prep_units.py --src <原图目录> --dry      # 只报不写，先看匹配对不对
  python tools/prep_units.py --src <原图目录> --force    # 覆盖已落位的文件
  python tools/prep_units.py --src <原图目录> --only hastati,equites
  python tools/prep_units.py --src <原图目录> --check    # 落位后顺手跑 check_assets.js

文件名匹配：原图叫 velites.png / velites (1).png / Velites_01.PNG 都能认成 velites；
认不出来的会列出来等改名，不会瞎猜着覆盖。实在对不上可以写一份 map.json
（形如 {"图像_20260922.png": "hastati"}）用 --map 指进来。

两条硬规矩：
  · 绝不删改原图目录里的任何文件。
  · 默认跳过已落位的文件；改了原图请加 --force，否则会拿到旧结果。
"""

import io
import os
import re
import sys
import json
import argparse
import subprocess

from PIL import Image, ImageOps, ImageCms

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNITS_JS = os.path.join(ROOT, 'assets', 'units.js')
DOC_TEX = os.path.join(ROOT, 'docs', '场景配图需求.md')
CHECK_JS = os.path.join(ROOT, 'tools', 'check_assets.js')
UNIT_DIR = os.path.join(ROOT, 'assets', 'units')
TEX_DIR = os.path.join(ROOT, 'assets', 'tex')

SRC_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff')
KB = 1024

# 场景图文件 -> 场景配图需求.md §一 图位总览里的「图位」列（尺寸从那张表查）
DIM_OF = {
    'logo.webp': '图鉴 logo',
    'gate-front.webp': '凯旋门正面（横）',
    'gate-open.webp': '凯旋门穿行（横）',
    'gate-front-portrait.webp': '凯旋门竖版两帧',
    'gate-open-portrait.webp': '凯旋门竖版两帧',
    'gate.webp': '兜底内景',
    'marble.webp': '大理石纹理',
}
FACTION_DIM = '阵营横幅'


def read_text(p):
    with io.open(p, encoding='utf-8') as f:
        return f.read()


# ---------------------------------------------------------------- 目标表

def parse_unit_ids():
    src = read_text(UNITS_JS)
    ids = re.findall(r"\{id:'([a-z0-9\-]+)'", src)
    if len(ids) != 48:
        raise SystemExit('FAIL units.js 解析到 %d 个 id，应为 48（正则失效？）' % len(ids))
    keys = re.findall(r"\{key:'([a-z]+)'", src) + ['custom']
    return ids, keys


def parse_tex_sizes():
    """§一 图位总览表：图位名 -> (宽, 高, 是否透明底)。"""
    lines = read_text(DOC_TEX).split('\n')
    size, in_tbl = {}, False
    for l in lines:
        s = l.strip()
        if not in_tbl:
            if s.startswith('|') and '建议尺寸' in s and '---' not in s:
                in_tbl = True
            continue
        if not s.startswith('|'):
            break
        body = s.strip().strip('|')
        if set(body.replace('|', '')) <= set('- '):
            continue
        c = [x.strip() for x in body.split('|')]
        if len(c) < 4:
            continue
        m = re.search(r'(\d+)\s*[×xX]\s*(\d+)', c[3])
        if m:
            size[c[1]] = (int(m.group(1)), int(m.group(2)), '透明底' in c[3])
    return size


def parse_tex_files(keys):
    """§九 落位契约代码块里的文件名清单（faction-<key> 展开成 9 张）。"""
    files = []
    for l in read_text(DOC_TEX).split('\n'):
        s = l.strip()
        if not s.startswith('assets/tex/'):
            continue
        # 代码块里文件名后面还跟着中文注释（如「横版 · 门在外面」），只取第一个词
        f = s.split('/')[-1].split()[0].strip()
        if '<key>' in f:
            files.extend('faction-%s.webp' % k for k in keys)
        else:
            files.append(f)
    return files


def parse_budgets():
    """体积上限从 check_assets.js 读，避免这里和它各写一份。"""
    src = read_text(CHECK_JS)
    m = re.search(r"maxEach:\s*(\d+)\s*\*\s*KB", src)
    unit_max = int(m.group(1)) * KB if m else 70 * KB
    tex_max = {}
    for f, n in re.findall(r"f:\s*'([^']+)'\s*,\s*max:\s*(\d+)\s*\*\s*KB", src):
        tex_max[f] = int(n) * KB
    return unit_max, tex_max


def build_targets(kind):
    ids, keys = parse_unit_ids()
    sizes = parse_tex_sizes()
    unit_max, tex_max = parse_budgets()
    out = []
    if kind in ('units', 'auto'):
        for i in ids:
            out.append({'kind': 'units', 'key': i, 'file': i + '.webp',
                        'dir': UNIT_DIR, 'w': 512, 'h': 512, 'alpha': False,
                        'max': unit_max})
    if kind in ('tex', 'auto'):
        for f in parse_tex_files(keys):
            dim = DIM_OF.get(f, FACTION_DIM if f.startswith('faction-') else None)
            if dim is None or dim not in sizes:
                raise SystemExit('FAIL 场景图「%s」在 §一 图位总览里查不到尺寸（文档改了？）' % f)
            w, h, alpha = sizes[dim]
            out.append({'kind': 'tex', 'key': f[:-5], 'file': f, 'dir': TEX_DIR,
                        'w': w, 'h': h, 'alpha': alpha,
                        'max': tex_max.get(f, 120 * KB)})
    return out


# ---------------------------------------------------------------- 匹配

def norm_stem(stem):
    s = stem.lower().replace(' ', '').replace('_', '-')
    s = re.sub(r'\((\d+)\)$', '', s)
    s = re.sub(r'-(\d+)$', '', s)
    s = re.sub(r'[^a-z0-9\-]', '', s)
    return s.strip('-')


def index_sources(src_dir):
    idx = {}
    for dirpath, _, names in os.walk(src_dir):
        for n in sorted(names):
            if not n.lower().endswith(SRC_EXT):
                continue
            stem = norm_stem(os.path.splitext(n)[0])
            p = os.path.join(dirpath, n)
            if stem in idx:
                print('note 源图重名：%s 与 %s 都认成 "%s"，取前者' % (idx[stem], n, stem))
                continue
            idx[stem] = p
    return idx


# ---------------------------------------------------------------- 处理

def to_srgb(im):
    """源图带广色域 ICC 时不转会在不同浏览器偏色；转不了就原样走，不强求。"""
    icc = im.info.get('icc_profile')
    if not icc:
        return im
    try:
        src_prof = ImageCms.getOpenProfile(io.BytesIO(icc))
        dst_prof = ImageCms.createProfile('sRGB')
        im2 = ImageCms.profileToProfile(im, src_prof, dst_prof)
        return im2 if im2 is not None else im
    except Exception:
        return im


def fit_image(im, w, h, keep_alpha, fit):
    """先把比例调成目标比例（裁或填），再缩到目标尺寸。返回 (图, 处理方式)。"""
    if keep_alpha:
        im = im.convert('RGBA')
    else:
        if im.mode in ('RGBA', 'LA', 'P'):
            bg = Image.new('RGB', im.size, (255, 255, 255))
            rgba = im.convert('RGBA')
            bg.paste(rgba, mask=rgba.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')

    tr, sr = w / float(h), im.width / float(im.height)
    how = '直出'
    if abs(sr - tr) > 1e-3:
        if fit == 'pad':
            if sr > tr:
                nw = int(round(im.height * tr))
                canvas = Image.new(im.mode, (nw, im.height),
                                   (255, 255, 255, 0) if keep_alpha else (255, 255, 255))
                canvas.paste(im, ((nw - im.width) // 2, 0))
            else:
                nh = int(round(im.width / tr))
                canvas = Image.new(im.mode, (im.width, nh),
                                   (255, 255, 255, 0) if keep_alpha else (255, 255, 255))
                canvas.paste(im, (0, (nh - im.height) // 2))
            im = canvas
            how = '留白'
        else:
            if sr > tr:
                nw = int(round(im.height * tr))
                left = (im.width - nw) // 2
                im = im.crop((left, 0, left + nw, im.height))
            else:
                nh = int(round(im.width / tr))
                top = (im.height - nh) // 2
                im = im.crop((0, top, im.width, top + nh))
            how = '裁切'
    if im.size != (w, h):
        im = im.resize((w, h), Image.LANCZOS)
        how = how if how != '直出' else '缩放'
    return im, how


def save_webp(im, max_bytes, q0, qmin, keep_alpha):
    """从 q0 往下找第一档能压进预算的质量；压不进去就把最低档的结果报出去。"""
    last = None
    for q in range(q0, qmin - 1, -2):
        buf = io.BytesIO()
        kw = {'quality': q, 'method': 6}
        if keep_alpha:
            kw['alpha_quality'] = 90
        im.save(buf, 'WEBP', **kw)
        data = buf.getvalue()
        last = (q, data)
        if len(data) <= max_bytes:
            return q, data, True
    return last[0], last[1], False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='原图目录（不会被改动）')
    ap.add_argument('--kind', default='auto', choices=['auto', 'units', 'tex'])
    ap.add_argument('--fit', default='crop', choices=['crop', 'pad'], help='比例不合时裁切还是留白，默认裁切')
    ap.add_argument('--start-q', type=int, default=82)
    ap.add_argument('--min-q', type=int, default=60)
    ap.add_argument('--force', action='store_true', help='覆盖已落位的文件')
    ap.add_argument('--dry', action='store_true', help='只报不写')
    ap.add_argument('--only', default='', help='只处理这些 key，逗号分隔')
    ap.add_argument('--map', default='', help='手工对应表 json：{源文件名: key}')
    ap.add_argument('--check', action='store_true', help='跑完调 check_assets.js')
    args = ap.parse_args()

    src_dir = os.path.abspath(args.src)
    if not os.path.isdir(src_dir):
        raise SystemExit('FAIL 原图目录不存在：%s' % src_dir)

    targets = build_targets(args.kind)
    only = set(x.strip() for x in args.only.split(',') if x.strip())
    manual = {}
    if args.map:
        manual = json.loads(read_text(args.map))

    idx = index_sources(src_dir)
    for name, key in manual.items():
        idx[norm_stem(os.path.splitext(name)[0])] = os.path.join(src_dir, name)

    done, skip, fail, nofile = 0, 0, 0, []
    print('目标 %d 个 · 源图目录 %s' % (len(targets), src_dir))
    print('%-34s %-9s %-6s %-7s %s' % ('落位文件', '处理', '质量', '大小', '源图'))
    print('-' * 96)

    for t in targets:
        if only and t['key'] not in only:
            continue
        dst = os.path.join(t['dir'], t['file'])
        stem = norm_stem(t['key'])
        src = idx.get(stem)
        if not src:
            nofile.append(t['file'])
            continue
        if os.path.exists(dst) and not args.force:
            skip += 1
            continue

        im = Image.open(src)
        im = ImageOps.exif_transpose(im)
        im = to_srgb(im)
        im, how = fit_image(im, t['w'], t['h'], t['alpha'], args.fit)
        q, data, okfit = save_webp(im, t['max'], args.start_q, args.min_q, t['alpha'])

        tag = '%dKB' % (len(data) / KB)
        if not okfit:
            fail += 1
            print('%-34s %-9s q%-5d %-7s %s  ← 压不进 %dKB，建议换图或查细节量'
                  % (t['file'], how, q, tag, os.path.basename(src), t['max'] / KB))
            continue
        if not args.dry:
            if not os.path.isdir(t['dir']):
                os.makedirs(t['dir'])
            with open(dst, 'wb') as f:
                f.write(data)
        done += 1
        print('%-34s %-9s q%-5d %-7s %s'
              % (t['file'], how, q, tag, os.path.basename(src)))

    unused = [os.path.relpath(p, src_dir) for p in idx.values()]  # 粗算：命中过的不再提示
    print('-' * 96)
    print('落位 %d · 跳过（已存在）%d · 超预算 %d · 缺原图 %d'
          % (done, skip, fail, len(nofile)))
    if args.dry:
        print('（--dry：没有写任何文件）')
    if nofile:
        print('缺原图（改好名重跑即可）：' + ', '.join(nofile[:12]) + ('…' if len(nofile) > 12 else ''))
    if done and not args.dry:
        print('下一步：node tools/check_assets.js')

    if args.check and not args.dry:
        node = 'node'
        try:
            subprocess.call([node, CHECK_JS], cwd=ROOT)
        except Exception as e:
            print('note 调 check_assets.js 失败：%s（可手动跑 node tools/check_assets.js）' % e)


if __name__ == '__main__':
    main()
