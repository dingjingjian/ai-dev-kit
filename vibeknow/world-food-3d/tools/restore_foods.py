# -*- coding: utf-8 -*-
"""从 git HEAD 恢复被写空的 foods.js。不用 git checkout，只取 blob 内容自己写，
避免任何涉及工作区的 git 操作（同目录下 assets/foods/ 等均为未跟踪新文件）。"""
import subprocess, os, re, sys

R = r'C:\Users\dingj\Documents\git\ai-dev-kit'
REL = 'vibeknow/world-food-3d/assets/foods.js'
DST = os.path.join(R, REL.replace('/', os.sep))

p = subprocess.run(['git', '-C', R, 'show', 'HEAD:' + REL], capture_output=True)
raw = p.stdout
if p.returncode != 0 or not raw:
    print('git show 失败:', p.stderr.decode('utf-8', 'replace')[:400]); sys.exit(1)

print('HEAD blob 字节数 :', len(raw))

# 先备份当前（空的）文件，再写
bak = DST + '.bak'
if os.path.exists(DST):
    with open(bak, 'wb') as f:
        f.write(open(DST, 'rb').read())

tmp = DST + '.tmp'
with open(tmp, 'wb') as f:
    f.write(raw)
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp, DST)                      # 原子替换，避免再次出现"截断后未写入"

s = open(DST, encoding='utf-8').read()
print('恢复后字节数     :', len(s.encode('utf-8')))
print('name 计数        :', len(re.findall(r"name:'", s)))
print('img 计数         :', len(re.findall(r"img:'", s)))
print('尾部             :', repr(s[-40:]))
os.remove(bak)
print('OK' if len(re.findall(r"name:'", s)) == 35 else 'CHECK FAILED')
