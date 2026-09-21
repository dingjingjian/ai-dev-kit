# -*- coding: utf-8 -*-
import json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, '_dev', 'image-prompts.json'), 'r', encoding='utf-8') as f:
    d = json.load(f)
out = os.path.join(ROOT, '_dev', '_prompts_dump.txt')
with open(out, 'w', encoding='utf-8') as o:
    o.write('STYLE:\n' + d['style'] + '\n\n')
    for i, it in enumerate(d['images']):
        o.write('=== [%d] %s (%s, %s) ===\n' % (i, it['base'], it['kind'], it['size']))
        o.write(it['prompt'] + '\n\n')
print('written', out, 'total', len(d['images']))
