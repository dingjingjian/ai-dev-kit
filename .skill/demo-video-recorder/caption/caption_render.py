# -*- coding: utf-8 -*-
"""caption_render.py — 把每段字幕渲染成「整幅透明 PNG」，交给 ffmpeg overlay 叠加。

为什么不再用 drawtext：
  旧实现用 `drawbox` 画满宽实心黑条 + `drawtext box=1` 给每行文字套一个实心方块，
  结果是一段生硬的「信箱黑边」里贴两块灰底白字，副标还是浅蓝 0xD6E6FF——与作品本身的
  暗红 + 琥珀金主色直接冲突；drawtext 也做不出渐变遮罩、圆角、字距、柔和投影。
  改用 PIL 渲染透明卡片（设计自由）+ ffmpeg overlay（淡入 / 上浮），观感直接上一个档。

输出：两个 PNG
  scrim.png      —— 顶部渐隐遮罩（黑色 alpha 自上而下衰减），保证任何画面下字幕都读得清
  card_<i>.png   —— 第 i 段字幕卡片（1080x1920 画布，只有内容区有像素，其余全透明，
                    这样 overlay 时整体下移 N px 就等于「内容上浮」动画）
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H = 1080, 1920
FONT_DIR = r"C:\Windows\Fonts"

# 字体栈：标题用微软雅黑 Bold（视频上最扛得住小屏），副标用雅黑 Regular
F_TITLE = ("msyhbd.ttc", 1)
F_SUB = ("msyh.ttc", 0)

# 与作品本体一致的色板（暗红 + 琥珀金 + 奶油白）
AMBER = (233, 195, 107)
AMBER_DEEP = (201, 158, 86)
CREAM = (255, 252, 245)
MUTED = (224, 206, 178)
INK = (26, 14, 12)

_font_cache = {}


def _font(spec, size):
    key = (spec, size)
    if key not in _font_cache:
        name, idx = spec
        _font_cache[key] = ImageFont.truetype(
            os.path.join(FONT_DIR, name), size, index=idx)
    return _font_cache[key]


def hexcolor(value, default):
    """config 里可写 "#E9C36B" / "0xE9C36B" / "E9C36B"，留空则用默认色。"""
    if not value:
        return default
    v = str(value).strip().lstrip("#")
    if v.lower().startswith("0x"):
        v = v[2:]
    try:
        return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return default


# ---------------------------------------------------------------- 基础绘制


def text_width(draw, text, font, tracking=0.0):
    w = sum(draw.textlength(ch, font=font) for ch in text)
    return w + tracking * max(0, len(text) - 1)


def draw_tracked(draw, x, y, text, font, fill, tracking=0.0,
                 stroke_width=0, stroke_fill=None, shadow=False):
    """逐字绘制以实现字距（PIL 原生无 letter-spacing）。x 为左边缘，y 为字顶。"""
    cx = x
    for ch in text:
        if shadow:
            draw.text((cx + 1, y + 3), ch, font=font, fill=(0, 0, 0, 160))
        draw.text((cx, y), ch, font=font, fill=fill,
                  stroke_width=stroke_width, stroke_fill=stroke_fill)
        cx += draw.textlength(ch, font=font) + tracking


def _soft_shadow(layer, offset=(0, 5), blur=7, opacity=0.5):
    """取一层的 alpha 做黑色柔化投影，返回可直接 alpha_composite 的图层。"""
    alpha = layer.split()[3].point(lambda v: int(v * opacity))
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    sh.putalpha(alpha)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.alpha_composite(sh, (offset[0], offset[1]))
    return out


def make_scrim(top_alpha=195, fade_end=600, gamma=1.0, size=(W, H), hold_until=340,
               hold_alpha=150, color=(10, 7, 6)):
    """顶部渐隐遮罩：y=0 处最暗，到 hold_until 缓慢减弱，再以 S 曲线平滑收到 fade_end 归零。

    两段式的好处：文字所在区（0~hold_until）保持均匀压暗 → 字幕在任何画面上都读得清；
    之后用 smoothstep 收尾 → 没有旧版 drawbox 那种「信箱黑边」的硬切边。
    默认色不是纯黑而是极暗暖棕，和作品本体的暗红主色同温，避免看成一条黑胶带。
    """
    vals = []
    for y in range(fade_end):
        if y <= hold_until:
            a = top_alpha - (top_alpha - hold_alpha) * (y / float(hold_until))
        else:
            t = (y - hold_until) / float(max(1, fade_end - hold_until))
            t = t * t * (3 - 2 * t)          # smoothstep
            a = hold_alpha * (1 - t) ** gamma
        vals.append(max(0, min(255, int(a))))
    grad = Image.new("L", (1, fade_end))
    grad.putdata(vals)
    grad = grad.resize((size[0], fade_end), Image.BILINEAR)
    alpha = Image.new("L", size, 0)
    alpha.paste(grad, (0, 0))
    img = Image.new("RGBA", size, tuple(color) + (0,))
    img.putalpha(alpha)
    return img


def _scrim(cfg, top, hold, hold_alpha, end):
    """按主题默认值取遮罩曲线，config 里的 scrim_* 可逐项覆盖。"""
    return make_scrim(cfg.get("scrim_alpha", top), cfg.get("scrim_end", end),
                      cfg.get("scrim_gamma", 1.0), (W, H),
                      cfg.get("scrim_hold", hold),
                      cfg.get("scrim_hold_alpha", hold_alpha),
                      hexcolor(cfg.get("scrim_color"), (10, 7, 6)))


def _diamond(draw, cx, cy, r, color):
    draw.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=color)


def _rule_with_diamond(base, cx, y, half=62, color=AMBER, alpha=150, r=5):
    """`——◆——` 装饰分隔线。"""
    d = ImageDraw.Draw(base)
    c = color + (alpha,)
    d.rectangle([cx - half - r * 2, y, cx - r * 2, y + 2], fill=c)
    d.rectangle([cx + r * 2, y, cx + half + r * 2, y + 2], fill=c)
    _diamond(d, cx, y + 1, r, color + (min(255, alpha + 60),))


# ---------------------------------------------------------------- 三套主题


def card_scrim(title, sub, cfg):
    """A｜渐隐片头 —— 无底色方块，靠顶部渐变托字，金色装饰线收束，最像正片片头。"""
    base = _scrim(cfg, *card_scrim.scrim_defaults)  # A 主题：文字区压得最实
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tc = hexcolor(cfg.get("title_color"), CREAM)
    sc = hexcolor(cfg.get("sub_color"), AMBER)
    lc = hexcolor(cfg.get("line_color"), AMBER)
    ts = cfg.get("title_size", 66)
    ss = cfg.get("sub_size", 33)
    tt = cfg.get("title_tracking", 7)
    st = cfg.get("sub_tracking", 3.5)
    ft, fs = _font(F_TITLE, ts), _font(F_SUB, ss)

    y = cfg.get("top", 152)
    tw = text_width(d, title, ft, tt)
    draw_tracked(d, (W - tw) / 2, y, title, ft, tc + (255,), tt,
                 stroke_width=cfg.get("stroke", 3), stroke_fill=(0, 0, 0, 165))
    tb = y + int(ts * 1.22)

    ry = tb + 30
    _rule_with_diamond(layer, W // 2, ry, half=cfg.get("rule_half", 62),
                       color=lc, alpha=cfg.get("line_alpha", 150))

    sy = ry + 30
    sw = text_width(d, sub, fs, st)
    draw_tracked(d, (W - sw) / 2, sy, sub, fs, sc + (255,), st, shadow=True,
                 stroke_width=cfg.get("sub_stroke", 2), stroke_fill=(0, 0, 0, 130))

    base.alpha_composite(_soft_shadow(layer, (0, 5), 8, 0.45))
    base.alpha_composite(layer)
    return base


def card_plaque(title, sub, cfg):
    """B｜琥珀牌匾 —— 居中圆角暗牌，呼应园区导视牌，信息最稳但存在感最强。"""
    base = _scrim(cfg, *card_plaque.scrim_defaults)  # B 主题：牌匾自带底，遮罩可轻
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    x0, x1 = cfg.get("panel_x", (96, 984))
    y0 = cfg.get("top", 140)
    ts = cfg.get("title_size", 58)
    ss = cfg.get("sub_size", 30)
    ft, fs = _font(F_TITLE, ts), _font(F_SUB, ss)
    y1 = y0 + cfg.get("panel_h", 244)

    d.rounded_rectangle([x0, y0, x1, y1], radius=26,
                        fill=INK + (216,), outline=AMBER_DEEP + (130,), width=2)
    # 顶部一道极淡的琥珀高光，让牌匾不死板
    d.line([x0 + 26, y0 + 1, x1 - 26, y0 + 1], fill=AMBER + (60,), width=1)

    tt, st = cfg.get("title_tracking", 6), cfg.get("sub_tracking", 3)
    ty = y0 + cfg.get("pad_top", 50)
    tw = text_width(d, title, ft, tt)
    draw_tracked(d, (W - tw) / 2, ty, title, ft, CREAM + (255,), tt)
    tb = ty + int(ts * 1.22)

    ry = tb + 24
    _rule_with_diamond(layer, W // 2, ry, half=44, r=4)

    sy = ry + 26
    sw = text_width(d, sub, fs, st)
    draw_tracked(d, (W - sw) / 2, sy, sub, fs, AMBER + (255,), st)

    base.alpha_composite(_soft_shadow(layer, (0, 6), 10, 0.5))
    base.alpha_composite(layer)
    return base


def card_side(title, sub, cfg):
    """C｜左对齐条 —— 琥珀竖条 + 左对齐标题，杂志感 / 纪录片感，最克制。"""
    base = _scrim(cfg, *card_side.scrim_defaults)   # C 主题：与 A 同强度
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    x = cfg.get("x", 120)
    y = cfg.get("top", 150)
    ts = cfg.get("title_size", 62)
    ss = cfg.get("sub_size", 31)
    tt = cfg.get("title_tracking", 5)
    st = cfg.get("sub_tracking", 2.5)
    ft, fs = _font(F_TITLE, ts), _font(F_SUB, ss)

    tw = text_width(d, title, ft, tt)
    tb = y + int(ts * 1.22)
    bar_h = int(ts * 1.22) + 46

    d.rounded_rectangle([x - 38, y - 4, x - 30, y - 4 + bar_h], radius=4,
                        fill=AMBER + (235,))
    draw_tracked(d, x, y, title, ft, CREAM + (255,), tt,
                 stroke_width=2, stroke_fill=(0, 0, 0, 110))

    uy = tb + 20
    d.rectangle([x, uy, x + tw, uy + 2], fill=AMBER + (110,))

    draw_tracked(d, x, uy + 26, sub, fs, hexcolor(cfg.get("sub_color"), MUTED) + (255,),
                 st, shadow=True, stroke_width=cfg.get("sub_stroke", 2),
                 stroke_fill=(0, 0, 0, 130))

    base.alpha_composite(_soft_shadow(layer, (0, 5), 8, 0.45))
    base.alpha_composite(layer)
    return base


# 各主题的遮罩默认值 (top_alpha, hold_until, hold_alpha, fade_end)
card_scrim.scrim_defaults = (205, 400, 170, 660)
card_plaque.scrim_defaults = (140, 380, 115, 600)
card_side.scrim_defaults = (205, 400, 170, 660)

THEMES = {
    "scrim": card_scrim,
    "plaque": card_plaque,
    "side": card_side,
}


def render_card(theme, title, sub, cfg=None):
    if theme not in THEMES:
        raise KeyError("unknown theme: %s (可选 %s)" % (theme, list(THEMES)))
    return THEMES[theme](title, sub, cfg or {})


def theme_scrim(theme, cfg=None):
    """取该主题自己的遮罩默认值（scrim_defaults 挂在各主题函数上，避免两处真源）。

    注意：这里必须按主题取，不能全局共用一份——否则 B 主题「牌匾自带底色、
    遮罩可以轻」的设计会失效（曾经踩过：save_assets 一律用最强遮罩）。
    """
    if theme not in THEMES:
        raise KeyError("unknown theme: %s (可选 %s)" % (theme, list(THEMES)))
    return _scrim(cfg or {}, *THEMES[theme].scrim_defaults)


def save_assets(theme, cues, out_dir, cfg=None):
    """落盘 scrim.png + card_<i>.png，返回 (scrim_path, [card_path...])。"""
    os.makedirs(out_dir, exist_ok=True)
    sp = os.path.join(out_dir, "scrim.png")
    theme_scrim(theme, cfg).save(sp)
    cards = []
    for i, c in enumerate(cues):
        p = os.path.join(out_dir, "card_{0}.png".format(i))
        render_card(theme, c["title"], c["subtitle"], cfg).save(p)
        cards.append(p)
    return sp, cards
