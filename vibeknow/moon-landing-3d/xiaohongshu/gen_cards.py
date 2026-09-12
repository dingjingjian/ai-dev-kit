# -*- coding: utf-8 -*-
"""奔月 3D · 小红书轮播卡片（1536x2048, 3:4）。
风格对齐姊妹项目 rocket-launch-3d/gen_cards.py。"""
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE = os.path.dirname(os.path.abspath(__file__))
SS   = os.path.join(BASE, "screenshots")
ICON = os.path.join(os.path.dirname(BASE), "icon.png")
OUT  = BASE

W, H = 1536, 2048
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG  = r"C:\Windows\Fonts\msyh.ttc"

def f(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def gradient_bg(draw, w, h, top=(14, 22, 46), bottom=(4, 6, 14)):
    for y in range(h):
        t = y / h
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

def add_stars(draw, w, h, count=140):
    random.seed(42)
    for _ in range(count):
        x = random.randint(0, w)
        y = random.randint(0, int(h * 0.5))
        s = random.choice([1, 1, 1, 2, 2, 3])
        a = random.randint(80, 210)
        draw.ellipse([x, y, x + s, y + s], fill=(255, 255, 255, a))

def round_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m

def paste_screenshot(canvas, path, top_y, max_h, padding=80):
    img = Image.open(path).convert("RGBA")
    target_w = W - padding * 2
    scale = target_w / img.width
    target_h = int(img.height * scale)
    if target_h > max_h:
        scale = max_h / img.height
        target_w = int(img.width * scale)
        target_h = max_h
    img = img.resize((target_w, target_h), Image.LANCZOS)
    radius = 28
    # 发光边框
    border = Image.new("RGBA", (target_w + 10, target_h + 10), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle([0, 0, target_w + 10, target_h + 10],
                                             radius=radius + 5, fill=(120, 180, 255, 55))
    mask = round_mask((target_w, target_h), radius)
    bx = (W - target_w) // 2 - 5
    canvas.paste(border, (bx, top_y - 5), round_mask((target_w + 10, target_h + 10), radius + 5))
    canvas.paste(img, ((W - target_w) // 2, top_y), mask)
    return target_h

def center_text(draw, text, y, font, fill=(255, 255, 255, 255), max_w=None):
    if max_w:
        lines, line = [], ""
        for ch in text:
            if draw.textlength(line + ch, font=font) > max_w and line:
                lines.append(line); line = ch
            else:
                line += ch
        if line: lines.append(line)
        cy = y
        for l in lines:
            tw = draw.textlength(l, font=font)
            draw.text(((W - tw) // 2, cy), l, font=font, fill=fill)
            cy += int(font.size * 1.35)
        return cy - y
    tw = draw.textlength(text, font=font)
    draw.text(((W - tw) // 2, y), text, font=font, fill=fill)
    return font.size

def feature_row(draw, features, y, accent=(90, 200, 255)):
    n = len(features)
    gap = 26
    pill_h = 76
    font = f(32, bold=False)
    widths = [int(draw.textlength(t, font=font)) + 70 for t in features]
    total = sum(widths) + gap * (n - 1)
    x = (W - total) // 2
    for i, t in enumerate(features):
        draw.rounded_rectangle([x, y, x + widths[i], y + pill_h], radius=38,
                               fill=(0, 0, 0, 130), outline=(*accent, 180), width=2)
        # 小三角图标
        cx = x + 32
        cy = y + pill_h // 2
        draw.polygon([(cx, cy - 8), (cx + 9, cy + 7), (cx - 9, cy + 7)], fill=accent)
        draw.text((x + 52, y + (pill_h - font.size) // 2 - 4), t, font=font, fill=(255, 255, 255, 255))
        x += widths[i] + gap

def make_card(title, subtitle, ss_file, features, out_name, accent=(90, 200, 255), max_h=1300):
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    draw = ImageDraw.Draw(canvas)
    gradient_bg(draw, W, H)
    add_stars(draw, W, H)
    # 顶部光晕
    glow = Image.new("RGBA", (W, 460), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(130):
        a = int(30 * (1 - i / 130))
        gd.ellipse([W // 2 - 560 + i * 3, -160 + i, W // 2 + 560 - i * 3, 300 - i],
                   fill=(*accent, a))
    canvas.paste(glow, (0, 0), glow)

    y = 110
    y += center_text(draw, title, y, f(76, bold=True), fill=(255, 255, 255, 255), max_w=W - 140) + 20
    center_text(draw, subtitle, y, f(34, bold=False), fill=(180, 200, 230, 255))
    y += 70
    line_w = 130
    draw.rounded_rectangle([(W - line_w) // 2, y, (W + line_w) // 2, y + 6], radius=3, fill=accent)
    y += 50

    paste_screenshot(canvas, os.path.join(SS, ss_file), y, max_h)
    draw = ImageDraw.Draw(canvas)
    feature_row(draw, features, H - 180, accent=accent)

    out = os.path.join(OUT, out_name)
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print(f"saved: {out_name}  {os.path.getsize(out)//1024} KB")

# P0 封面：用 icon.png（舷窗望月面地球），不用截图
def make_cover():
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    draw = ImageDraw.Draw(canvas)
    gradient_bg(draw, W, H, top=(20, 28, 56), bottom=(4, 6, 14))
    add_stars(draw, W, H)
    glow = Image.new("RGBA", (W, 500), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(140):
        a = int(32 * (1 - i / 140))
        gd.ellipse([W // 2 - 600 + i * 3, -180 + i, W // 2 + 600 - i * 3, 320 - i],
                   fill=(255, 210, 120, a))
    canvas.paste(glow, (0, 0), glow)

    y = 120
    y += center_text(draw, "在手机里，走一遍", y, f(72, bold=True), fill=(240, 245, 255, 255), max_w=W - 140) + 8
    y += center_text(draw, "中国载人登月全程", y, f(96, bold=True), fill=(255, 217, 102, 255), max_w=W - 140) + 28
    center_text(draw, "长征十号双箭发射 · 环月交会对接 · 月面软着陆", y + 20, f(32, bold=False), fill=(180, 200, 230, 255))
    line_w = 140
    draw.rounded_rectangle([(W - line_w) // 2, y + 88, (W + line_w) // 2, y + 94], radius=3, fill=(255, 217, 102))

    # icon 方图作为主视觉（圆角大圆，像舷窗）
    icon = Image.open(ICON).convert("RGBA")
    box = 980
    icon = icon.resize((box, box), Image.LANCZOS)
    # 圆形遮罩
    mask = Image.new("L", (box, box), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, box - 1, box - 1], fill=255)
    ix = (W - box) // 2
    iy = y + 90
    # 光环
    ring = Image.new("RGBA", (box + 30, box + 30), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([0, 0, box + 29, box + 29], outline=(255, 217, 102, 160), width=6)
    canvas.paste(ring, (ix - 15, iy - 15), ring)
    canvas.paste(icon, (ix, iy), mask)

    draw = ImageDraw.Draw(canvas)
    feature_row(draw, ["双箭接力", "环月对接", "动力下降", "月面回望"], H - 180, accent=(255, 217, 102))

    out = os.path.join(OUT, "P0-震撼封面.png")
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print(f"saved: P0-震撼封面.png  {os.path.getsize(out)//1024} KB")

# ── 生成整套 ──
make_cover()

make_card(
    title="3·2·1 点火！",
    subtitle="第一次发射 · 揽月着陆器先一步去月球等着",
    ss_file="04-launch-ignition.jpg",
    features=["21 台发动机", "三级半构型", "揽月着陆器"],
    out_name="P1-首次发射.png",
    accent=(255, 130, 60),
)

make_card(
    title="两枚长征十号，接力奔月",
    subtitle="数日后第二枚起飞，梦舟飞船载着人出发",
    ss_file="02-show-ship.png",
    features=["揽月先驻留", "梦舟载人", "环月再会合"],
    out_name="P2-双箭接力.png",
    accent=(90, 200, 255),
)

make_card(
    title="一键拆解，看懂火箭",
    subtitle="每个部件点开都有故事，三级半构型逐级铺开",
    ss_file="03-explode-ship.png",
    features=["逃逸塔", "整流罩", "梦舟飞船", "芯三级氢氧"],
    out_name="P3-结构拆解.png",
    accent=(255, 190, 80),
)

make_card(
    title="环月轨道，两器交会对接",
    subtitle="飞船从后方追近驻留着陆器，航天员转入着陆器",
    ss_file="06-rendezvous-dock.jpg",
    features=["后方追近", "环月对接", "航天员换乘"],
    out_name="P4-环月对接.png",
    accent=(180, 160, 255),
)

make_card(
    title="动力下降，反推制动",
    subtitle="着陆器与飞船分离，着陆腿展开，扬起月尘",
    ss_file="07-powered-descent.jpg",
    features=["反推减速", "着陆腿展开", "月尘扬起"],
    out_name="P5-动力下降.png",
    accent=(120, 220, 180),
)

make_card(
    title="稳稳落月，全程走完",
    subtitle="长按 60× 速通全程，双击 index.html 即玩",
    ss_file="08-landed-earth-view.jpg",
    features=["月面软着陆", "四腿站稳", "3D 实时渲染"],
    out_name="P6-月面软着陆.png",
    accent=(255, 150, 150),
)

print("\nAll 7 cards done.")
