# -*- coding: utf-8 -*-
"""给 foods.js 逐条注入 img 字段。
安全写法：先在内存改好 -> 写临时文件 + fsync -> os.replace 原子替换。
内容来源是文件本身（不手抄），并且先做 35 个菜名集合校验。"""
import re, os, sys, glob

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(BASE, 'assets', 'foods.js')
DIR = os.path.join(BASE, 'assets', 'foods')

SLUG = {
    '北京烤鸭': 'beijing-kaoya', '小笼包': 'xiaolongbao', '寿司': 'sushi',
    '韩式烤肉': 'hanshi-kaorou', '冬阴功': 'dongyingong', '印度咖喱': 'yindu-gali',
    '越南河粉': 'yuenan-hefen', '沙威玛': 'shaweima', '肉骨茶': 'rougucha',
    '茶碗蒸': 'chawanmushi',
    '那不勒斯披萨': 'napoli-pizza', '法国可颂': 'croissant', '西班牙海鲜饭': 'paella',
    '德国猪脚': 'schweinshaxe', '炸鱼薯条': 'fish-and-chips', '希腊木沙卡': 'moussaka',
    '罗宋汤': 'borscht', '芝士火锅': 'fondue',
    '塔吉锅': 'tagine', '英吉拉': 'injera', '库纳法': 'kunafa',
    '南非烤肉': 'braai', '贾洛夫饭': 'jollof-rice',
    '汉堡': 'hamburger', '深盘披萨': 'deep-dish-pizza', '墨西哥塔可': 'taco',
    '普丁': 'poutine', '古巴三明治': 'cuban-sandwich',
    '巴西烤肉': 'churrasco', '阿根廷烤肉': 'asado', '酸橘汁腌鱼': 'ceviche',
    '玉米馅饼': 'humita',
    '澳洲肉派': 'meat-pie', '毛利地炉': 'hangi', '夏威夷拌鱼': 'poke',
}

s = open(JS, encoding='utf-8').read()
names = re.findall(r"name:'([^']+)'", s)
print('恢复版记录数     :', len(names))
print('菜名集合校验     :', 'OK' if set(names) == set(SLUG) else
      ('缺 %s / 多 %s' % (sorted(set(SLUG) - set(names)), sorted(set(names) - set(SLUG)))))
if set(names) != set(SLUG):
    sys.exit('菜名集合不匹配，中止以免破坏文件')

# ---- 注入 ----
lines = s.split('\n')
out, hit, miss = [], [], []
for ln in lines:
    m = re.search(r"name:'([^']+)'", ln)
    if m:
        nm = m.group(1)
        if nm in SLUG and 'img:' not in ln:
            new = re.sub(r"(color:'#[0-9a-fA-F]{3,6}',)",
                         r"\1img:'./assets/foods/" + SLUG[nm] + ".webp',", ln, count=1)
            if new == ln:
                miss.append(nm)
            else:
                ln = new
                hit.append(nm)
    out.append(ln)
if miss:
    sys.exit('color 未匹配: %s' % miss)

new_s = '\n'.join(out)
head_old = " *   color       色卡主色（程序化代替图片）\n"
head_new = (" *   color       色卡主色（无图或加载失败时回退到此色）\n"
            " *   img         菜品图路径，省略则用 color 色卡（相对 index.html）\n")
if head_old in new_s:
    new_s = new_s.replace(head_old, head_new, 1)

# ---- 原子写入 ----
data = new_s.encode('utf-8')
tmp = JS + '.tmp'
with open(tmp, 'wb') as f:
    f.write(data)
    f.flush()
    os.fsync(f.fileno())
if os.path.getsize(tmp) != len(data):
    sys.exit('临时文件大小异常，中止')
os.replace(tmp, JS)

# ---- 复核 ----
chk = open(JS, encoding='utf-8').read()
got = re.findall(r"name:'([^']+)'[^\n]*?img:'([^']+)'", chk)
print('写入字节数       :', len(chk.encode('utf-8')))
print('带 img 的记录    :', len(got))
bad = [(n, p) for n, p in got if not os.path.isfile(
    os.path.join(BASE, p.replace('./', '').replace('/', os.sep)))]
on_disk = {os.path.basename(p) for p in glob.glob(os.path.join(DIR, '*.webp'))} - {'_placeholder.webp'}
used = {os.path.basename(p) for _, p in got}
print('img 指向缺失文件 :', bad or '无')
print('磁盘图未被引用   :', sorted(on_disk - used) or '无')
print('已引用但磁盘无图 :', sorted(used - on_disk) or '无')
print('结果             :', 'OK' if (len(got) == 35 and not bad and on_disk == used) else 'CHECK FAILED')
