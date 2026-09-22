# -*- coding: utf-8 -*-
"""从规格文档拼装「可直接粘贴」的出图提示词。

真源（本脚本只读，不写）：
  docs/兵种图片素材需求.md   48 个兵种的主体描述 / 构图模板 / 阵营色调，
                             外加两套风格前缀：写实 3.1+3.2（取景 3.4）、
                             兵牌 3.5+3.6+3.7（取景 3.8，半身像）（共 96 张图）
  docs/装备图集需求.md       52 件装备的逐件主体描述 + 统一风格（3.1~3.4）
  docs/场景配图需求.md       14 个场景图位的提示词要点与建议尺寸
产出：
  docs/提示词包.md           （本脚本生成，**不要手改**；改规格改上面三份文档后重跑）
  --txt DIR 时，另为每张图写一份 .txt（写实 <id>.txt / 兵牌 card-<id>.txt / 装备 gear-<id>.txt）

设计取舍：
  规格散在三份文档的表格与引用块里，如果再把 162 条提示词手抄一遍，
  就会出现「文档改了、提示词没改」的静默分叉。所以这里全部走解析 ——
  解析不到就硬失败并把缺的图位列出来，绝不给半份清单。

用法：
  python tools/gen_prompts.py
  python tools/gen_prompts.py --txt docs/prompts
"""

import io
import os
import re
import sys
import time
import argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC_UNITS = os.path.join(ROOT, 'docs', '兵种图片素材需求.md')
DOC_GEAR = os.path.join(ROOT, 'docs', '装备图集需求.md')
DOC_TEX = os.path.join(ROOT, 'docs', '场景配图需求.md')
OUT_MD = os.path.join(ROOT, 'docs', '提示词包.md')

UNITS_N = 48
GEAR_N = 52
TEX_N = 14


def read_lines(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read().split('\n')


def section(lines, marker, stop=('### ', '## ')):
    """取某个标题下的正文（不含标题行本身），遇到下一个同级标题为止。"""
    out, started = [], False
    for l in lines:
        s = l.rstrip()
        if not started:
            if s.startswith(marker):
                started = True
            continue
        if s.startswith(stop):
            break
        out.append(s)
    return out


def table_rows(lines, header_marker):
    """取某一张表的数据行。header_marker 命中表头即开始，遇非表格行为止。"""
    rows, in_tbl = [], False
    for l in lines:
        s = l.strip()
        if not in_tbl:
            if s.startswith('|') and header_marker in s and '---' not in s:
                in_tbl = True
            continue
        if not s.startswith('|'):
            break
        body = s.strip().strip('|')
        if set(body.replace('|', '')) <= set('- '):   # |---|---| 分隔行
            continue
        rows.append([c.strip() for c in body.split('|')])
    return rows


def quotes(lines):
    """取一段里所有引用块的行（去掉 '>'，保留空行以维持段落结构）。"""
    return [l[1:].strip() for l in lines if l.strip().startswith('>')]


def strip_label(s):
    """去掉「提示词要点：」「提示词要点（竖版）：」这类前缀标签。"""
    if s.startswith('提示词要点'):
        # 只认紧跟标签的那个冒号。取最后一个会把正文里的「9:14」当成标签分隔符，
        # 切出「14，凯旋门完整入画」这种残句。
        i = s.find('：')
        if i < 0:
            i = s.find(':')
        if i >= 0:
            s = s[i + 1:].strip()
    return s


def clean(s):
    """去掉表格里的 markdown 强调标记，避免 **无马镫** 被原样粘进模型。"""
    return s.replace('**', '').strip()


def parse_size(s):
    m = re.search(r'(\d+)\s*[×xX*]\s*(\d+)', s)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), ('透明底' in s)


# ---------------------------------------------------------------- 兵种图

def parse_units_spec():
    lines = read_lines(DOC_UNITS)

    cn_prefix = '\n'.join(quotes(section(lines, '### 3.1'))).strip()
    en_prefix = '\n'.join(quotes(section(lines, '### 3.2'))).strip()
    if not cn_prefix or not en_prefix:
        raise SystemExit('FAIL 解析不到风格前缀（3.1 / 3.2 的引用块改格式了？）')

    tone = {}
    for r in table_rows(section(lines, '### 3.3'), '中文色调后缀'):
        tone[r[1]] = (clean(r[2]), clean(r[3]))       # key -> (中文, 英文)

    tpl = {}
    for r in table_rows(section(lines, '### 3.4'), '构图'):
        tpl[clean(r[0])] = clean(r[2])

    factions, units = [], []
    for i, l in enumerate(lines):
        if not l.startswith('### ') or '·' not in l:
            continue
        name, key = [x.strip() for x in l[4:].split('·')[:2]]
        if key not in tone:
            continue
        rows = table_rows(lines[i + 1:], '主体描述')
        items = []
        for r in rows:
            if len(r) < 6:
                continue
            items.append({
                'file': clean(r[1]).strip('`'),
                'unit': clean(r[2]),
                'tpl': clean(r[3]),
                'subject': clean(r[4]),
                'bg': clean(r[5]),
            })
        factions.append((name, key, items))
        units.extend(items)

    if len(units) != UNITS_N:
        raise SystemExit('FAIL 兵种图解析到 %d 条，应为 %d 条（文档表格改结构了？）' % (len(units), UNITS_N))
    return cn_prefix, en_prefix, tone, tpl, factions, units


def unit_prompt(it, tpl, tone, key):
    cn_tone, en_tone = tone.get(key, ('', ''))
    comp = tpl.get(it['tpl'], '')
    en = '\n'.join(x for x in [
        'Composition: ' + comp if comp else '',
        'Subject: ' + it['subject'],
        'Setting: ' + it['bg'],
        'Palette: ' + en_tone if en_tone else '',
        'Format: square 1:1',
    ] if x)
    cn = '\n'.join(x for x in [
        '构图：' + comp if comp else '',
        '主体：' + it['subject'],
        '背景：' + it['bg'],
        '色调：' + cn_tone if cn_tone else '',
        '画幅：方形 1:1',
    ] if x)
    return en, cn


# ---------------------------------------------------------------- 兵牌（第二套）

def parse_card_spec():
    """兵牌那一套的四块规格：3.5 中文前缀 / 3.6 英文前缀 / 3.7 固定背景（CN / EN）/ 3.8 半身取景。"""
    lines = read_lines(DOC_UNITS)

    def bq(mark):
        return [x for x in quotes(section(lines, mark)) if x]

    cn_prefix = '\n'.join(bq('### 3.5')).strip()
    en_prefix = '\n'.join(bq('### 3.6')).strip()
    cn_bg = en_bg = ''
    tail = ''            # 正在累积哪一段：'' / 'cn' / 'en'
    for x in bq('### 3.7'):
        # 用显式标签切分，靠「有没有中文」猜会随文案变化而失效；
        # 标签之后没换行的续行（长句折行）要接回同一段，否则只有第一行被读走。
        if x.startswith('CN'):
            tail = 'cn'
            cn_bg = _after_label(x)
        elif x.startswith('EN'):
            tail = 'en'
            en_bg = _after_label(x)
        elif tail == 'cn':
            cn_bg = (cn_bg + ' ' + x).strip()
        elif tail == 'en':
            en_bg = (en_bg + ' ' + x).strip()

    # 兵牌是半身像，取景与写实那套（3.4 的膝以上 / 整体入画）不同，单独一张表
    tpl_card = {}
    for r in table_rows(section(lines, '### 3.8'), '兵牌构图'):
        tpl_card[clean(r[0])] = clean(r[2])

    for label, val in (('3.5 兵牌中文前缀', cn_prefix), ('3.6 兵牌英文前缀', en_prefix),
                       ('3.7 兵牌背景 CN', cn_bg), ('3.7 兵牌背景 EN', en_bg)):
        if not val:
            raise SystemExit('FAIL 解析不到「%s」（文档的引用块改格式了？）' % label)
    if not tpl_card:
        raise SystemExit('FAIL 解析不到兵牌构图模板（§3.8 的表格改结构了？）')
    return cn_prefix, en_prefix, cn_bg, en_bg, tpl_card


def _after_label(s):
    """取「CN：xxx」/「EN: xxx」冒号之后的正文。中文冒号优先，取不到再认英文冒号。"""
    for mark in ('：', ':'):
        i = s.find(mark)
        if i >= 0:
            return s[i + 1:].strip()
    return s.strip()


def card_unit_prompt(it, tpl, tpl_card, bg_cn, bg_en, tone, key):
    """兵牌与写实共用主体描述，取景换成 3.8 的半身模板、背景换成 3.7 的固定暗底。"""
    cn_tone, en_tone = tone.get(key, ('', ''))
    comp = tpl_card.get(it['tpl']) or tpl.get(it['tpl'], '')   # 3.8 优先，缺哪档回落 3.4
    en = '\n'.join(x for x in [
        'Composition: ' + comp if comp else '',
        'Subject: ' + it['subject'],
        'Setting: ' + bg_en,
        'Palette: ' + en_tone if en_tone else '',
        'Format: square 1:1',
    ] if x)
    cn = '\n'.join(x for x in [
        '构图：' + comp if comp else '',
        '主体：' + it['subject'],
        '背景：' + bg_cn,
        '色调：' + cn_tone if cn_tone else '',
        '画幅：方形 1:1',
    ] if x)
    return en, cn


# ---------------------------------------------------------------- 装备图集

def parse_gear_spec():
    """装备图集需求.md：3.1~3.4 四段风格块 + §四 的逐件表格（文件名即 assets/gear.js 的键）。"""
    lines = read_lines(DOC_GEAR)

    def bq(mark):
        return '\n'.join(x for x in quotes(section(lines, mark)) if x).strip()

    cn_prefix, en_prefix = bq('### 3.1'), bq('### 3.2')
    cn_suffix, en_suffix = bq('### 3.3'), bq('### 3.4')
    for label, val in (('3.1 中文前缀', cn_prefix), ('3.2 英文前缀', en_prefix),
                       ('3.3 中文后缀', cn_suffix), ('3.4 英文后缀', en_suffix)):
        if not val:
            raise SystemExit('FAIL 装备图集「%s」解析为空（引用块改格式了？）' % label)

    items = []
    for r in table_rows(section(lines, '## 四、'), '主体描述'):
        if len(r) < 5:
            continue
        items.append({'file': clean(r[1]).strip('`'), 'name': clean(r[2]),
                      'slot': clean(r[3]), 'desc': clean(r[4])})
    if len(items) != GEAR_N:
        raise SystemExit('FAIL 装备解析到 %d 件，应为 %d 件（表格改结构了？）' % (len(items), GEAR_N))
    return cn_prefix, en_prefix, cn_suffix, en_suffix, items


def gear_prompt(it, cn_prefix, cn_suffix, en_prefix, en_suffix):
    """与兵种图同一条口径：前缀决定画风、主体决定画什么，两处都不该让模型自由发挥。"""
    en = '\n'.join([en_prefix, 'Subject: ' + it['desc'], en_suffix])
    cn = '\n'.join([cn_prefix, '主体：' + it['desc'], cn_suffix])
    return en, cn


# ---------------------------------------------------------------- 场景图

def parse_tex_spec():
    lines = read_lines(DOC_TEX)

    size = {}
    for r in table_rows(section(lines, '## 一、'), '建议尺寸'):
        dim = parse_size(r[3])
        if dim:
            size[r[1]] = dim                          # 图位名 -> (w, h, alpha)

    def sec(num):
        """场景文档用的是 ## 级标题，其下还有 ### 级子条目（如「### ③ gate-front.webp」），
        所以这里只停在 ## 级，不能把子条目里的引用块一起截掉。"""
        for pre in ('## ', '### '):
            s = section(lines, pre + num, stop=('## ', '# '))
            if s:
                return s
        return []

    def bq(marker):
        return [strip_label(x) for x in quotes(sec(marker))]

    # 凯旋门兜底只剩一帧，整段引用块就是它的提示词（不再拆「共用前缀 + 各帧追加」）
    gate_shot = '\n'.join(x for x in bq('三、') if x).strip()

    # 竖版单帧：明示「与 ③ 相同的前缀，追加…」
    port_txt = '\n'.join(x for x in bq('四、') if x).strip()
    if '追加' in port_txt:
        port_txt = port_txt.split('追加', 1)[1].strip()
    port_txt = port_txt.strip('「」')

    logo = '\n'.join(x for x in bq('二、') if x).strip()
    marble = '\n'.join(x for x in bq('六、') if x).strip()
    banner_tpl = '\n'.join(x for x in bq('七、') if x).strip()

    banners = []
    for r in table_rows(sec('七、'), '画面内容'):
        if len(r) < 3:
            continue
        banners.append({'file': clean(r[0]).strip('`'), 'faction': clean(r[1]), 'scene': clean(r[2])})

    for label, val in (('logo', logo), ('凯旋门单帧', gate_shot),
                       ('竖版追加', port_txt), ('大理石', marble), ('横幅模板', banner_tpl)):
        if not val:
            raise SystemExit('FAIL 场景图「%s」解析为空（文档的引用块改格式了？）' % label)
    if len(banners) != 9:
        raise SystemExit('FAIL 阵营横幅解析到 %d 条，应为 9 条' % len(banners))
    return size, logo, gate_shot, port_txt, marble, banner_tpl, banners


def tex_slots(spec):
    """把上面解析到的碎片组装成 14 个图位的完整提示词。"""
    size, logo, gate_shot, port_txt, marble, banner_tpl, banners = spec

    def dim(name):
        return size.get(name, (None, None, False))

    # dim = 场景配图需求.md §一 图位总览表里的「图位」列，尺寸从那张表查，不在这里另写一份
    slots = [
        {'file': 'logo.webp', 'name': '图鉴 logo', 'dim': '图鉴 logo', 'prompt': logo,
         'note': '透明底；只出图形不出文字（SPQR 由页面文字层负责）'},
        {'file': 'gate-front.webp', 'name': '凯旋门正面（横）', 'dim': '凯旋门正面（横）',
         'prompt': gate_shot,
         'note': '图片兜底只此一帧；与过渡视频首帧必须同门同光位；构图左右对称、门居中'},
        {'file': 'gate-front-portrait.webp', 'name': '凯旋门竖版单帧', 'dim': '凯旋门竖版单帧',
         'prompt': gate_shot + '\n' + port_txt,
         'note': '竖幅，门完整入画不裁立柱；可选，只在竖屏且没有视频时用'},
        {'file': 'gate.webp', 'name': '兜底内景', 'dim': '兜底内景',
         'prompt': gate_shot + '\n凯旋门内景与远去的军道，暗调，无人物，可作底层压暗',
         'note': '脚本补的后半句（原文档未给要点）；缺了也不影响可用性'},
        {'file': 'marble.webp', 'name': '大理石纹理', 'dim': '大理石纹理', 'prompt': marble,
         'note': '必须能无缝平铺；出图后先拼 2×2 看接缝'},
    ]
    for b in banners:
        key = b['file'].replace('faction-', '').replace('.webp', '')
        cn_tone = TONE_CN.get(key, '')
        p = banner_tpl.replace('[画面内容]', b['scene']).replace('[阵营色调]', cn_tone)
        # 自选军团没有阵营色调，替换后会留下一个孤零零的「，视觉焦点…」，这里清掉
        p = '\n'.join(re.sub(r'^，+', '', x.strip()) for x in p.split('\n') if x.strip())
        slots.append({'file': b['file'], 'name': '阵营横幅 · ' + b['faction'], 'dim': '阵营横幅', 'prompt': p,
                      'note': '视觉焦点放在画面右侧 40%，左侧留干净暗部给文字'})

    for s in slots:
        w, h, alpha = dim(s['dim'])
        s['size'] = (w, h)
        s['alpha'] = alpha
        if not w:
            raise SystemExit('FAIL 场景图「%s」在 §一 图位总览里查不到建议尺寸' % s['dim'])
    return slots


# ---------------------------------------------------------------- 输出

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--txt', default='', help='额外为每张图写一份 .txt 到该目录')
    args = ap.parse_args()

    global TONE_CN
    cn_prefix, en_prefix, tone, tpl, factions, units = parse_units_spec()
    TONE_CN = {k: v[0] for k, v in tone.items()}
    cn_card, en_card, cn_card_bg, en_card_bg, tpl_card = parse_card_spec()

    spec = parse_tex_spec()
    slots = tex_slots(spec)
    cn_prefix_g, en_prefix_g, cn_suffix_g, en_suffix_g, gear_items = parse_gear_spec()
    if len(slots) != TEX_N:
        raise SystemExit('FAIL 场景图解析到 %d 个位，应为 %d 个' % (len(slots), TEX_N))

    out = []
    w = out.append
    w('# 出图提示词包')
    w('')
    w('> **本文件由 `tools/gen_prompts.py` 生成，不要手改。**')
    w('> 改规格请改 [`兵种图片素材需求.md`](兵种图片素材需求.md) / [`场景配图需求.md`](场景配图需求.md)，')
    w('> 再跑一次 `python tools/gen_prompts.py` 重新生成。')
    w('>')
    w('> 生成时间：%s' % time.strftime('%Y-%m-%d %H:%M'))
    w('')
    w('## 怎么用')
    w('')
    w('1. 每条提示词已把「风格前缀 + 构图模板 + 主体描述 + 背景 + 阵营色调」拼好，整段复制即可。')
    w('2. **EN 版**给吃英文的模型；**CN 版**给吃中文的模型。主体描述只有中文一版，')
    w('   所以 EN 版是「英文前缀 + 中文主体 + 英文色调」的混合体 —— 这是有意的：')
    w('   前缀决定画风，主体决定画什么，两处都不该让模型自由发挥。')
    w('3. 出图尺寸建议 **1024×1024**（兵种图）／场景图按每条标注的尺寸；')
    w('   落位前的裁方与压缩交给 `tools/prep_units.py`，不要手工另存。')
    w('4. 兵种图**两套分目录放**：写实跑 `python tools/prep_units.py --src <写实目录>`，')
    w('   兵牌跑 `python tools/prep_units.py --kind card --src <兵牌目录>`；')
    w('   装备图跑 `--kind gear`，场景图跑 `--kind tex`。')
    w('')

    w('## 一、兵种图 ×%d（每条 4 段：写实 EN/CN + 兵牌 EN/CN）' % len(units))
    w('')
    w('两套**各自独立出图**，共用同一条主体描述与构图模板，只有「风格前缀 + 背景」不同：')
    w('')
    w('| 套 | 落位 | 风格前缀 | 背景 | 预算 |')
    w('|----|------|----------|------|------|')
    w('| 写实（默认） | `assets/units/<id>.webp` | §3.1 / §3.2 | 每条各写的地景 | 单张 ≤70KB · 全套 ≤2.6MB |')
    w('| 兵牌 | `assets/units/card/<id>.webp` | §3.5 / §3.6 | §3.7 的固定底 | 单张 ≤55KB · 全套 ≤2.0MB |')
    w('')
    w('统一规格：源图 1024×1024 → 落位 512×512 WebP。')
    w('')
    n = 0
    for name, key, items in factions:
        w('### %s · %s' % (name, key))
        w('')
        for it in items:
            n += 1
            en, cn = unit_prompt(it, tpl, tone, key)
            c_en, c_cn = card_unit_prompt(it, tpl, tpl_card, cn_card_bg, en_card_bg, tone, key)
            w('**%02d · `%s`**　%s　模板 %s　背景：%s' % (n, it['file'], it['unit'], it['tpl'], it['bg']))
            w('')
            for label, pre, body in (('写实 EN（推荐）', en_prefix, en),
                                     ('写实 CN', cn_prefix, cn),
                                     ('兵牌 EN（推荐）', en_card, c_en),
                                     ('兵牌 CN', cn_card, c_cn)):
                w(label)
                w('')
                w('```text')
                w(pre)
                w(body)
                w('```')
                w('')

    w('## 二、装备图集 ×%d' % len(gear_items))
    w('')
    w('落位目录 `assets/gear/`，**文件名必须等于 `assets/gear.js` 里 GEAR 的键**（写错就是静默缺图）。')
    w('统一规格：源图 1024×1024 → 落位 **128×128 透明底** WebP，单张 ≤8KB，全套 ≤0.60MB。')
    w('')
    for it in gear_items:
        en, cn = gear_prompt(it, cn_prefix_g, cn_suffix_g, en_prefix_g, en_suffix_g)
        w('**`%s`**　%s　%s' % (it['file'], it['name'], it['slot']))
        w('')
        w('EN（推荐）')
        w('')
        w('```text')
        w(en)
        w('```')
        w('')
        w('CN')
        w('')
        w('```text')
        w(cn)
        w('```')
        w('')

    w('## 三、场景图 ×%d' % len(slots))
    w('')
    w('落位目录 `assets/tex/`，文件名逐字对应 `index.html` 里的 `url()`，写错会静默回退。')
    w('')
    for s in slots:
        sw, sh = s['size']
        w('**`%s`**　%s　%s%s' % (s['file'], s['name'],
                                  ('%d×%d' % (sw, sh)) if sw else '尺寸见文档',
                                  '　透明底' if s['alpha'] else ''))
        w('')
        if s['note']:
            w('> %s' % s['note'])
            w('')
        w('```text')
        w(s['prompt'])
        w('```')
        w('')

    with io.open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print('ok   写入 %s（兵种图 %d 条 × 写实/兵牌两套 · 装备图 %d 条 · 场景图 %d 条）'
          % (OUT_MD, len(units), len(gear_items), len(slots)))

    if args.txt:
        d = os.path.join(ROOT, args.txt)
        if not os.path.isdir(d):
            os.makedirs(d)
        k = 0
        for name, key, items in factions:
            for it in items:
                en, _ = unit_prompt(it, tpl, tone, key)
                c_en, _ = card_unit_prompt(it, tpl, tpl_card, cn_card_bg, en_card_bg, tone, key)
                stem = it['file'].replace('.webp', '')
                with io.open(os.path.join(d, stem + '.txt'), 'w', encoding='utf-8') as f:
                    f.write(en_prefix + '\n' + en)
                with io.open(os.path.join(d, 'card-' + stem + '.txt'), 'w', encoding='utf-8') as f:
                    f.write(en_card + '\n' + c_en)
                k += 2
        for it in gear_items:
            en, _ = gear_prompt(it, cn_prefix_g, cn_suffix_g, en_prefix_g, en_suffix_g)
            with io.open(os.path.join(d, 'gear-' + it['file'].replace('.webp', '') + '.txt'),
                         'w', encoding='utf-8') as f:
                f.write(en)
            k += 1
        for s in slots:
            with io.open(os.path.join(d, s['file'].replace('.webp', '') + '.txt'), 'w', encoding='utf-8') as f:
                f.write(s['prompt'])
            k += 1
        print('ok   另写 %d 份 .txt 到 %s' % (k, d))


if __name__ == '__main__':
    main()
