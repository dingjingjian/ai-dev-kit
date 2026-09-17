# -*- coding: utf-8 -*-
"""由文案反推每镜时长，并反解 kb 下限，生成 timeline.js。

为什么要生成而不是手写：时长与 kb 都是文案字数的函数。手写时一旦改了文案
而忘了同步改 dur / kb，就会得到「文字读不完」或「画面几乎不动」——
两种都不会报错，只在成片里看得出来。让脚本算，这两者就不可能脱钩。
"""
import pathlib, json

BASE = pathlib.Path(__file__).resolve().parent

# 阅读速度基准 5.5 字/秒，取 5.0 留余量
CPS = 5.0
TEXT_IN, RISE, TEXT_OUT = 0.35, 0.30, 0.80
FPS = 30
E_R = 587.5            # 1080x1920 时「素材中心到随机采样点的期望距离」，数值积分值
PER_FRAME_MIN = 1.6    # 每帧位移下限（判据 1.45，留余量）
BASE_ZOOM = 1.06

# ---- 8 章：文案与取景意图（时长 / kb 由脚本文案推出）----
# pan 为「每镜平移总量」的期望值，脚本会按余量上限自动收窄
SHOTS = [
    dict(clip="01-show", label="展示", srcFrom=0.2, pan=(-60, -90),
         sub="长征十号 · 三级半构型<br>两枚长征十号，两种发射构型",
         big="奔月<br>中国载人登月全程", big_start=0.6, big_end_hold=True),
    dict(clip="02-explode", label="拆解", srcFrom=0.3, pan=(70, -100),
         sub="逐级铺开，点击标签查看部件说明<br>芯一级 · 芯二级 · 芯三级 · 整流罩",
         big=None),
    dict(clip="03-launch1", label="第一次发射 · 揽月", srcFrom=0.1, pan=(-90, -140),
         sub="三芯并联 21 台发动机点火<br>程序转弯 · 最大动压 · 助推器分离<br>芯三级点火，推入近地停泊轨道",
         big=None),
    dict(clip="04-transit", label="地月转移", srcFrom=0.2, pan=(90, -150),
         sub="芯三级二次点火（TLI），奔赴月球<br>近月制动反推减速，被月球引力捕获<br>着陆器驻留环月轨道，静候飞船",
         big=None),
    dict(clip="05-launch2", label="第二次发射 · 梦舟", srcFrom=0.2, pan=(-70, -120),
         sub="数日后，梦舟载人飞船出发<br>逃逸塔分离，太阳翼展开",
         big=None),
    dict(clip="06-rendez", label="环月交会", srcFrom=0.2, pan=(80, -130),
         sub="飞船沿环月轨道从后方追近着陆器<br>对接帧对齐姿态，航天员转入着陆器",
         big=None),
    dict(clip="07-descent", label="动力下降", srcFrom=0.1, pan=(-90, 150),
         sub="着陆器脱离飞船，转入落月飞行<br>下降发动机反推制动，展开着陆腿",
         big=None),
    dict(clip="08-land", label="月面软着陆", srcFrom=0.15, pan=(0, -110),
         sub="揽月着陆器平稳触月<br>地球悬于漆黑月空",
         big="登月不是终点<br>是走向星辰大海的第一步", big_start=0.7, big_end_hold=True),
]


def nchars(s):
    plain = s.replace("<br>", "")
    return len([c for c in plain if not c.isspace()])


def solve():
    out = []
    for s in SHOTS:
        n = nchars(s["sub"])
        win_need = n / CPS
        dur = round(win_need + TEXT_IN + RISE + TEXT_OUT + 0.30, 1)   # +0.3 余量
        N = dur * FPS
        # pan 期望值，先按名义值
        px, py = s["pan"]
        m0 = abs(px) + abs(py)
        kb = (PER_FRAME_MIN * N - m0) / E_R
        kb = round(max(kb, 0.30), 2)
        # 按 cover 余量上限收窄 pan（最紧一侧留 >=8px）
        scale = BASE_ZOOM * (1 + kb)
        mx = 540 * (1 - 1 / scale) - 8
        my = 960 * (1 - 1 / scale) - 8
        px = max(-mx, min(mx, px))
        py = max(-my, min(my, py))
        out.append(dict(s, dur=dur, kb=kb, pan=(round(px), round(py))))
    return out


def emit(shots):
    total = round(sum(s["dur"] for s in shots), 2)
    L = []
    A = L.append
    A("/* timeline.js —— 剪辑表（唯一真源）")
    A(" *")
    A(" * 由 _gen_timeline.py 生成，请勿手改 —— 改文案请改生成器的 SHOTS 后重跑。")
    A(" * 时长与 kb 都是文案字数的函数：只改文案不改 dur/kb，会得到「文字读不完」")
    A(" * 或「画面几乎不动」，两者都不报错、只在成片里看得出来。")
    A(" *")
    A(" * 文案来自应用自身：assets/mission.js 的 PHASES 与 README.md 的登月流程表。")
    A(" */")
    A("")
    A("var FPS = %d;" % FPS)
    A("var W = 1080, H = 1920;")
    A("var SRCFPS = %d;" % FPS)
    A("")
    A("var XFADE = 0.44;                // 总过渡时长（以切点为中心两侧平分，每侧 0.22s）")
    A("var FADE_IN = 0.9;")
    A("var FADE_OUT = 1.2;")
    A("")
    A("var RISE = %.2f, DROP = 0.45;" % RISE)
    A("var SEG_SPREAD = 0.5;            // 各段出现时刻占窗口的比例（只用前半段）")
    A("var SEG_FADE = 0.20;")
    A("var TEXT_IN = %.2f, TEXT_OUT = %.2f;" % (TEXT_IN, TEXT_OUT))
    A("")
    A("var BASE_ZOOM = %.2f;             // 起点即拉近主体，减少竖屏空场" % BASE_ZOOM)
    A("")
    A("var CLIPS = [")
    for s in shots:
        A("  {")
        A("    clip: '%s', dur: %.1f, srcFrom: %.2f," % (s["clip"], s["dur"], s["srcFrom"]))
        A("    kb: %.2f, pan: [%d, %d]," % (s["kb"], s["pan"][0], s["pan"][1]))
        A("    label: '%s'," % s["label"])
        A("    sub: '%s'," % s["sub"])
        if s.get("big"):
            A("    big: '%s'," % s["big"])
            A("    bigWin: [%.1f, %.1f]" % (s["big_start"], s["dur"]))
        else:
            A("    big: null, bigWin: null")
        A("  },")
    A("];")
    A("")
    A("var BIG_TITLE = '奔月<br>中国载人登月全程';")
    A("var BIG_SUB = '展示 · 拆解 · 双箭发射 · 环月对接 · 月面软着陆';")
    A("var BIG_END = '登月不是终点<br>是走向星辰大海的第一步';")
    A("var BRAND = '3D 登月全程模拟器';")
    A("")
    (BASE / "timeline.js").write_text("\n".join(L), encoding="utf-8")
    return total


if __name__ == "__main__":
    shots = solve()
    total = emit(shots)
    for s in shots:
        n = nchars(s["sub"])
        win = (s["dur"] - TEXT_OUT) - (TEXT_IN + RISE)
        print("%-12s dur=%5.1f  字数=%3d  win=%5.2f  字/秒=%4.2f  kb=%.2f  pan=%s" %
              (s["clip"], s["dur"], n, win, n / win, s["kb"], s["pan"]))
    print("DURATION %.2f s / %d frames" % (total, round(total * FPS)))
