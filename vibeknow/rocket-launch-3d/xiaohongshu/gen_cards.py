# -*- coding: utf-8 -*-
"""Generate 3:4 Xiaohongshu intro cards from real app screenshots."""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
SS = os.path.join(BASE, "screenshots")
OUT = BASE

W, H = 1536, 2048  # 3:4

# Fonts
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"

def f(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def gradient_bg(draw, w, h, top=(12, 18, 38), bottom=(4, 6, 14)):
    """Vertical gradient background."""
    for y in range(h):
        t = y / h
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

def add_stars(draw, w, h, count=120):
    """Add subtle star dots."""
    import random
    random.seed(42)
    for _ in range(count):
        x = random.randint(0, w)
        y = random.randint(0, int(h * 0.45))
        size = random.choice([1, 1, 1, 2])
        alpha = random.randint(80, 200)
        draw.ellipse([x, y, x + size, y + size], fill=(255, 255, 255, alpha))

def round_corner_mask(size, radius):
    """Create a rounded corner mask."""
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask

def paste_screenshot(canvas, ss_path, top_y, max_h, padding=80):
    """Paste screenshot centered with rounded corners and subtle border."""
    img = Image.open(ss_path).convert("RGBA")
    # Scale to fit width with padding
    target_w = W - padding * 2
    scale = target_w / img.width
    target_h = int(img.height * scale)
    if target_h > max_h:
        scale = max_h / img.height
        target_w = int(img.width * scale)
        target_h = max_h
    img = img.resize((target_w, target_h), Image.LANCZOS)

    # Rounded corners
    radius = 24
    mask = round_corner_mask((target_w, target_h), radius)
    # Border glow
    border = Image.new("RGBA", (target_w + 8, target_h + 8), (100, 180, 255, 60))
    border_mask = round_corner_mask((target_w + 8, target_h + 8), radius + 4)
    canvas.paste(border, ((W - target_w) // 2 - 4, top_y - 4), border_mask)
    canvas.paste(img, ((W - target_w) // 2, top_y), mask)
    return target_h

def draw_text_centered(draw, text, y, font, fill=(255, 255, 255, 255), max_w=None):
    """Draw centered text, auto-wrap if max_w given."""
    if max_w:
        # Simple wrap by character
        lines = []
        line = ""
        for ch in text:
            test = line + ch
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] > max_w and line:
                lines.append(line)
                line = ch
            else:
                line = test
        if line:
            lines.append(line)
        total_h = sum(draw.textbbox((0, 0), l, font=font)[3] for l in lines) + (len(lines) - 1) * 10
        cy = y
        for l in lines:
            bbox = draw.textbbox((0, 0), l, font=font)
            tw = bbox[2] - bbox[0]
            draw.text(((W - tw) // 2, cy), l, font=font, fill=fill)
            cy += bbox[3] + 10
        return total_h
    else:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, y), text, font=font, fill=fill)
        return bbox[3]

def draw_feature_row(draw, features, y, icon_color=(90, 200, 255)):
    """Draw a row of feature pills at bottom."""
    n = len(features)
    gap = 30
    pill_h = 72
    # Calculate widths
    widths = []
    font = f(34, bold=False)
    for feat in features:
        bbox = draw.textbbox((0, 0), feat, font=font)
        widths.append(bbox[2] - bbox[0] + 60)
    total_w = sum(widths) + gap * (n - 1)
    x = (W - total_w) // 2
    for i, feat in enumerate(features):
        # Pill background (dark semi-transparent for white text contrast)
        draw.rounded_rectangle([x, y, x + widths[i], y + pill_h], radius=36,
                                fill=(0, 0, 0, 120), outline=(255, 255, 255, 140), width=2)
        # Dot icon
        draw.ellipse([x + 24, y + pill_h // 2 - 8, x + 40, y + pill_h // 2 + 8], fill=icon_color)
        # Text
        bbox = draw.textbbox((0, 0), feat, font=font)
        text_h = bbox[3] - bbox[1]
        text_y = y + (pill_h - text_h) // 2 - bbox[1]
        draw.text((x + 52, text_y), feat, font=font, fill=(255, 255, 255, 255))
        x += widths[i] + gap

def make_card(title, subtitle, ss_file, features, out_name, accent=(90, 200, 255)):
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    draw = ImageDraw.Draw(canvas)
    gradient_bg(draw, W, H)
    add_stars(draw, W, H)

    # Subtle radial glow at top (soft, not blocky)
    glow = Image.new("RGBA", (W, 400), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(120):
        alpha = int(28 * (1 - i / 120))
        gd.ellipse([W // 2 - 500 + i * 3, -150 + i, W // 2 + 500 - i * 3, 250 - i],
                   fill=(*accent, alpha))
    canvas.paste(glow, (0, 0), glow)

    # Title
    y = 100
    draw_text_centered(draw, title, y, f(72, bold=True), fill=(255, 255, 255, 255), max_w=W - 120)
    y += 100

    # Subtitle
    draw_text_centered(draw, subtitle, y, f(36, bold=False), fill=(180, 200, 230, 255))
    y += 70

    # Accent line under subtitle
    line_w = 120
    draw.rounded_rectangle([(W - line_w) // 2, y, (W + line_w) // 2, y + 5], radius=3, fill=accent)
    y += 40

    # Screenshot
    ss_top = y
    ss_max_h = 1350
    paste_screenshot(canvas, os.path.join(SS, ss_file), ss_top, ss_max_h)

    # Recreate draw object after paste (Pillow 12.x workaround for text rendering)
    draw = ImageDraw.Draw(canvas)

    # Features at bottom
    feat_y = H - 170
    draw_feature_row(draw, features, feat_y, icon_color=accent)

    # Save
    out_path = os.path.join(OUT, out_name)
    canvas.convert("RGB").save(out_path, "PNG", quality=95)
    print(f"Saved: {out_path} ({os.path.getsize(out_path) // 1024} KB)")

# P0 Hero Cover (ignition launch)
make_card(
    title="3·2·1 点火！送火箭上天",
    subtitle="口袋火箭 · 3D火箭发射模拟器",
    ss_file="00-cover-launch.png",
    features=["真实发射时序", "3D 实时渲染", "三大模式"],
    out_name="P0-震撼封面.png",
    accent=(255, 120, 50),
)

# P1 Cover
make_card(
    title="在手机里，亲手送一枚火箭上天",
    subtitle="口袋火箭 · 3D火箭发射模拟器",
    ss_file="01-show.png",
    features=["展示模式", "拆解模式", "发射模式"],
    out_name="P1-封面.png",
    accent=(90, 200, 255),
)

# P2 Launch
make_card(
    title="3·2·1 点火发射",
    subtitle="真实飞行时序，每一次分离都是工程师的浪漫",
    ss_file="02-launch.png",
    features=["点火升空", "助推分离", "整流罩抛离", "船箭分离"],
    out_name="P2-发射模式.png",
    accent=(255, 140, 60),
)

# P3 Explode
make_card(
    title="一键拆解，看懂火箭",
    subtitle="每个部件都在默默守护宇航员回家",
    ss_file="03-explode.png",
    features=["逃逸塔", "整流罩", "返回舱", "助推器"],
    out_name="P3-拆解模式.png",
    accent=(255, 190, 80),
)

# P4 Telemetry
make_card(
    title="实时遥测，飞向星空",
    subtitle="高度、速度、过载实时跳动，丈量通往太空的路",
    ss_file="04-orbit-china.png",
    features=["高度", "速度", "过载", "飞行阶段"],
    out_name="P4-实时遥测.png",
    accent=(120, 220, 180),
)

print("\nAll 5 cards generated!")
