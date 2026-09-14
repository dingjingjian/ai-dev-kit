# -*- coding: utf-8 -*-
"""air-tycoon 截图像素体检（smoke-render.py 与 verify-dist.py 共用）

从 smoke-render.py 抽出，避免两份脚本各维护一套判据 —— 判据一旦漂移，
「源码目录过、提交包不过」这种差异就查不出原因了。
"""
import pathlib


def analyze_png(path):
    """对截图做像素体检：亮度分布 + 暖色（城市/航线）占比。

    为什么这些指标能抓问题：
      · avgLum 过低（<3）→ 画面全黑，渲染没出东西
      · brightPct 过高（>12）→ bloom 把画面糊成一片白
      · warmPct 为 0 → 暖金城市与航线一条都没画出来
    暖色判据用 R 明显高于 B（暖金 0xffc247 的 R/B ≈ 3.4，地球贴图的冷蓝 R/B < 1）。
    """
    try:
        from PIL import Image
    except ImportError:
        return {"png": "PIL 不可用，跳过"}
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    step = 3                                  # 每 3 像素采一个，足够统计且快
    n = 0
    lum_sum = 0
    non_black = bright = warm = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            lum = r * 0.299 + g * 0.587 + b * 0.114
            lum_sum += lum
            n += 1
            if lum > 12:
                non_black += 1
            if lum > 235:
                bright += 1
            # 暖金：R 显著高于 B 且亮度不低（排除暗部噪声）
            if r > b * 1.7 and lum > 60:
                warm += 1
    return {
        "size": "%dx%d" % (w, h),
        "avgLum": round(lum_sum / n, 1),
        "nonBlackPct": round(non_black / n * 100, 2),
        "brightPct": round(bright / n * 100, 2),
        "warmPct": round(warm / n * 100, 3),
    }
