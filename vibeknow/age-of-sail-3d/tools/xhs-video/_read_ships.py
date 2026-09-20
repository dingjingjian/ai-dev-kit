# -*- coding: utf-8 -*-
"""读取 SHIPS 数组指定索引的 name/family，用于写解说词。"""
import re

src = open(r"C:\Users\dingj\Documents\git\ai-dev-kit\vibeknow\age-of-sail-3d\assets\ships.js",
           encoding="utf-8").read()

names = re.findall(r"name\s*:\s*['\"]([^'\"]+)['\"]", src)
families = re.findall(r"family\s*:\s*['\"]([^'\"]+)['\"]", src)
minfo = re.findall(r"desc\s*:\s*['\"]([^'\"]{0,60})['\"]", src)

print("total entries:", len(names), len(families))
want = [20, 1, 2, 24, 14, 15, 16, 17]
for i in want:
    fam = families[i] if i < len(families) else "?"
    print("idx %-3d name=%s | family=%s" % (i, names[i] if i < len(names) else "?", fam))