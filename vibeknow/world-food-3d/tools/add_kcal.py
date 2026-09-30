# -*- coding: utf-8 -*-
"""一次性：按 foods.js 中条目的先后顺序，给每条记录的 taste 数组后补上 kcal 字段。

用法：python tools/add_kcal.py
会原地改写 assets/foods.js，并打印「菜名 -> kcal」对照，便于人工核对。
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "assets", "foods.js")

# 与 foods.js 条目顺序一一对应的「一份成品」热量估算值（千卡）
KCAL = [
    560, 420, 480, 350, 640, 220, 520, 400, 470, 480, 110,          # 亚洲 11
    750, 460, 620, 980, 840, 560, 230, 720,                          # 欧洲 8
    610, 480, 430, 780, 590,                                         # 非洲 5
    640, 710, 470, 740, 620,                                         # 北美 5
    700, 820, 260, 560,                                              # 南美 4
    480, 690, 330,                                                   # 大洋洲 3
]

src = io.open(PATH, encoding="utf-8").read()
pat = re.compile(r"taste:\[[^\]]*\]\}")

names = re.findall(r"\{name:'([^']+)'", src)
hits = pat.findall(src)
if len(hits) != len(KCAL):
    raise SystemExit("条目数不符：taste 出现 %d 次，热量表 %d 条" % (len(hits), len(KCAL)))
if len(names) != len(KCAL):
    raise SystemExit("菜名数不符：%d vs %d" % (len(names), len(KCAL)))

it = iter(KCAL)


def repl(m):
    return "%s,kcal:%d}" % (m.group(0)[:-1], next(it))


out = pat.sub(repl, src)
io.open(PATH, "w", encoding="utf-8", newline="").write(out)

for n, k in zip(names, KCAL):
    print("%s -> %d" % (n, k))
print("total dishes: %d, sum kcal: %d" % (len(KCAL), sum(KCAL)))
