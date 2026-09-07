# -*- coding: utf-8 -*-
"""
小红书配图底部标签优化脚本
- 截图区域 100% 保持不变
- 仅重绘底部标签为 HUD 科技感风格
- 先备份原图到 backup_original/
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os, random, shutil

INPUT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(INPUT_DIR, 'backup_original')

IMAGES = [
    {'file': 'P0-震撼封面.png', 'tags': ['真实发射时序', '3D实时渲染', '三大模式'],     'color': '#ff6a3a'},
    {'file': 'P1-封面.png',     'tags': ['展示模式', '拆解模式', '发射模式'],             'color': '#5cc8ff'},
    {'file': 'P2-发射模式.png', 'tags': ['点火升空', '助推分离', '整流罩抛离', '船箭分离'], 'color': '#ff6a3a'},
    {'file': 'P3-拆解模式.png', 'tags': ['逃逸塔', '整流罩', '返回舱', '助推器'],         'color': '#ffb84d'},
    {'file': 'P4-实时遥测.png', 'tags': ['高度', '速度', '过载', '飞行阶段'],             'color': '#5ce8c8'},
]

FONT_PATH = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_SIZE = 28

def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def draw_tag(img, x, y, w, h, text, color, font):
    """绘制单个 HUD 科技感标签"""
    r, g, b = hex_rgb(color)
    W, H = img.size

    # ---- 1. 渐变玻璃拟态背景 ----
    bg = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bg)
    for i in range(h):
        t = i / h
        cr = int(12 + t * 10)
        cg = int(20 + t * 12)
        cb = int(38 + t * 16)
        bd.line([(x, y + i), (x + w, y + i)], fill=(cr, cg, cb, 238))
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x, y, x + w, y + h], radius=14, fill=255)
    img.paste(bg, (0, 0), mask)

    # ---- 2. 主题色发光边框 ----
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([x, y, x + w, y + h], radius=14, outline=(r, g, b, 150), width=4)
    glow = glow.filter(ImageFilter.GaussianBlur(5))
    img.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x, y, x + w, y + h], radius=14, outline=(r, g, b, 255), width=2)

    # ---- 3. 顶部高光线 ----
    d.line([(x + 16, y + 1), (x + w - 16, y + 1)], fill=(255, 255, 255, 35), width=1)

    # ---- 4. 左侧发光竖条 ----
    bx, bw = x + 16, 3
    bh = int(h * 0.55)
    by = y + (h - bh) // 2
    glow2 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow2).rounded_rectangle([bx - 2, by, bx + bw + 2, by + bh], radius=2, fill=(r, g, b, 170))
    glow2 = glow2.filter(ImageFilter.GaussianBlur(3))
    img.paste(glow2, (0, 0), glow2)
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=1, fill=(r, g, b, 255))

    # ---- 5. 发光圆形图标 + 白色向上箭头 ----
    icx, icy = bx + 22, y + h // 2
    ir = 11
    glow3 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow3).ellipse([icx - ir - 4, icy - ir - 4, icx + ir + 4, icy + ir + 4], fill=(r, g, b, 130))
    glow3 = glow3.filter(ImageFilter.GaussianBlur(5))
    img.paste(glow3, (0, 0), glow3)
    d.ellipse([icx - ir, icy - ir, icx + ir, icy + ir], fill=(r, g, b, 255))
    d.polygon([(icx - 5, icy + 4), (icx + 5, icy + 4), (icx, icy - 5)], fill=(255, 255, 255, 255))

    # ---- 6. 文字（带阴影） ----
    tx = icx + ir + 14
    ty = y + h // 2
    d.text((tx, ty + 1), text, font=font, fill=(0, 0, 0, 170), anchor="lm")
    d.text((tx, ty), text, font=font, fill=(255, 255, 255, 255), anchor="lm")


def process(config):
    fp = os.path.join(INPUT_DIR, config['file'])
    img = Image.open(fp).convert('RGBA')
    W, H = img.size
    tags = config['tags']
    color = config['color']
    r, g, b = hex_rgb(color)

    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)

    n = len(tags)
    tag_h = 60
    tag_y = H - 96

    if n == 3:
        tag_w, gap = 290, 36
    else:
        tag_w, gap = 250, 28

    total_w = n * tag_w + (n - 1) * gap
    start_x = (W - total_w) // 2

    # ---- 清除底部旧标签区域（深色渐变 + 随机星点） ----
    clear_y = tag_y - 80
    d = ImageDraw.Draw(img)
    for i in range(clear_y, H):
        t = (i - clear_y) / (H - clear_y)
        cr = int(8 + t * 4)
        cg = int(10 + t * 4)
        cb = int(18 + t * 6)
        d.line([(0, i), (W, i)], fill=(cr, cg, cb, 255))
    random.seed(hash(config['file']) & 0xffff)
    for _ in range(70):
        sx = random.randint(0, W - 1)
        sy = random.randint(clear_y, H - 1)
        sa = random.randint(25, 110)
        d.point((sx, sy), fill=(255, 255, 255, sa))

    # ---- 标签上方发光分隔线 ----
    ly = tag_y - 18
    lw = int(W * 0.5)
    lx = (W - lw) // 2
    glow_line = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow_line).line([(lx, ly), (lx + lw, ly)], fill=(r, g, b, 100), width=3)
    glow_line = glow_line.filter(ImageFilter.GaussianBlur(4))
    img.paste(glow_line, (0, 0), glow_line)
    d.line([(lx, ly), (lx + lw, ly)], fill=(r, g, b, 180), width=1)
    d.ellipse([lx - 4, ly - 4, lx + 4, ly + 4], fill=(r, g, b, 255))
    d.ellipse([lx + lw - 4, ly - 4, lx + lw + 4, ly + 4], fill=(r, g, b, 255))

    # ---- 绘制所有标签 ----
    for i, t in enumerate(tags):
        tx = start_x + i * (tag_w + gap)
        draw_tag(img, tx, tag_y, tag_w, tag_h, t, color, font)

    img.convert('RGB').save(fp, 'PNG')
    print(f"  OK  {config['file']}")


# ===== 主流程 =====
if __name__ == '__main__':
    # 1. 备份原图
    os.makedirs(BACKUP_DIR, exist_ok=True)
    print("备份原图:")
    for c in IMAGES:
        src = os.path.join(INPUT_DIR, c['file'])
        dst = os.path.join(BACKUP_DIR, c['file'])
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
            print(f"  备份 {c['file']}")
        else:
            print(f"  已存在 {c['file']}，跳过备份")

    # 2. 处理
    print("\n优化底部标签:")
    for c in IMAGES:
        process(c)

    print("\n全部完成！原图备份在 backup_original/ 目录")
