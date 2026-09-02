# -*- coding: utf-8 -*-
"""重绘全部建筑图纸：剪影优先 + 一物一符号。

用法：python _dev/redraw.py
只替换 buildings.json 里的 rows 字段，其余字段原样保留。
内置校验：方阵、对称、色号合法、底部地面行、填充量。
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "_dev", "data", "buildings.json")

# 有意不对称的图纸（单坡顶 / 偏置烟囱，属于构图需要）
ASYM_OK = {"workshop"}

# ---------------------------------------------------------------- 新图纸
# 设计原则：
#   1. 顶部留白形成天际线剪影，不要占满棋盘
#   2. 每张图一个独一无二的视觉锤（锯齿顶 / 收腰冷却塔 / 红白塔 / 回收三角 / 钟楼…）
#   3. 底部统一一条地面线，保证放进同一个城市网格时不违和
ART = {
    # ------------------------------------------------ 住宅
    "house": [  # 11x11 人字坡屋顶 + 烟囱，填充少、拼得快
        ".....d.....",
        ".....d.....",
        "....RRR....",
        "...RRRRR...",
        "..RRRRRRR..",
        ".RRRRRRRRR.",
        "..WWWWWWW..",
        "..WTWWWTW..",
        "..WWWWWWW..",
        "..WWOOOWW..",
        ".GGGGGGGGG.",
    ],
    "apartment": [  # 13x13 平顶 + 三层外挑阳台，轮廓宽窄交替
        ".............",
        "...aaaaaaa...",
        "..SSSSSSSSS..",
        "...WWWWWWW...",
        "...WKTWTKW...",
        "..SSSSSSSSS..",
        "...WWWWWWW...",
        "...WKTWTKW...",
        "..SSSSSSSSS..",
        "...WWWWWWW...",
        "...WKTOTKW...",
        "..aaaaaaaaa..",
        ".GGGGGGGGGGG.",
    ],
    "tower": [  # 15x15 逐层收分 + 幕墙竖线 + 顶部航空灯，全场最高
        ".......Y.......",
        "......SYS......",
        ".....TTTTT.....",
        ".....TKTKT.....",
        ".....TSTST.....",
        "....TKTKTKT....",
        "....TSTSTST....",
        "...TKTKTKTKT...",
        "...TSTSTSTST...",
        "..TKTKTKTKTKT..",
        "..TSTSTSTSTST..",
        ".aaaaaaaaaaaaa.",
        ".aWKaaaOaaaKWa.",
        ".aaaaaaaaaaaaa.",
        ".GGGGGGGGGGGGG.",
    ],
    # ------------------------------------------------ 商业
    "cafe": [  # 11x11 红白斜条纹遮阳篷 + 招牌 + 橱窗
        "...........",
        "...........",
        "..WYYYYYW..",
        ".RWRWRWRWR.",
        ".WRWRWRWRW.",
        ".RWRWRWRWR.",
        ".WWWWWWWWW.",
        ".WTTWWWTTW.",
        ".WTTWWWTTW.",
        ".WWWOOOWWW.",
        ".GGGGGGGGG.",
    ],
    "market": [  # 13x13 大棚 + 彩旗 + 立柱 + 双层货堆 + 货箱
        ".............",
        ".............",
        ".............",
        ".R.R.R.R.R.R.",
        ".RRRRRRRRRRR.",
        ".RWYWYWYWYWR.",
        ".W.W.W.W.W.W.",
        ".W.W.W.W.W.W.",
        ".OYTnYTYnTYO.",
        ".OYnTnYnTnYO.",
        ".WWWWWWWWWWW.",
        ".GnGnGnGnGnG.",
        ".GGGGGGGGGGG.",
    ],
    # ------------------------------------------------ 工业
    "workshop": [  # 11x11 单坡顶 + 右上烟囱，故意不对称以区别于住宅
        "...........",
        "...........",
        "........d..",
        ".......d...",
        "aaaaaaaaaa.",
        ".aaaaaaaa..",
        "..WWWWWWW..",
        "..WTTWTTW..",
        "..WWWWWWW..",
        "..WWOOOWW..",
        ".GGGGGGGGG.",
    ],
    "factory": [  # 13x13 双烟囱 + 连片厂房屋顶 + 卷帘门
        "..SSS...SSS..",
        "...d.....d...",
        "..ddd...ddd..",
        "..ddd...ddd..",
        ".aaaaaaaaaaa.",
        ".BBBBBBBBBBB.",
        ".BWKWKWKWKWB.",
        ".BWWWWWWWWWB.",
        ".BWKWKWKWKWB.",
        ".BWWWWWWWWWB.",
        ".BBBOOOOOBBB.",
        ".aaaaaaaaaaa.",
        ".GGGGGGGGGGG.",
    ],
    # ------------------------------------------------ 电力
    "windmill": [  # 11x11 120° 三叶 + 锥形塔筒
        "....SSS....",
        "....SSS....",
        "....SSS....",
        "....SYS....",
        "...SSaSS...",
        "..SS.a.SS..",
        ".SS..a..SS.",
        "....aaa....",
        "....aaa....",
        "...aaaaa...",
        "..GGGGGGG..",
    ],
    "coalplant": [  # 13x13 双曲线冷却塔（中间收腰）+ 暗色厂房
        ".............",
        ".....SSS.....",
        "....SSSSS....",
        "....aaaaa....",
        ".....aaa.....",
        ".....aaa.....",
        "....aaaaa....",
        "...aaaaaaa...",
        "..aaaaaaaaa..",
        ".aaaaaaaaaaa.",
        ".ddddddddddd.",
        ".dKdKdKdKdKd.",
        ".GGGGGGGGGGG.",
    ],
    # ------------------------------------------------ 水利
    "watertower": [  # 11x11 罐体装水 + 四根外撇支腿
        "...........",
        "....SSS....",
        "...SSSSS...",
        "...wwwww...",
        "...wwwww...",
        "...wwwww...",
        "...SSSSS...",
        "....SSS....",
        "...SS.SS...",
        "..SS...SS..",
        ".GGGGGGGGG.",
    ],
    "waterworks": [  # 13x13 圆形沉淀池 + 进水管 + 泵房
        ".............",
        ".............",
        ".....aaa.....",
        "....wwwww....",
        "...wwwwwww...",
        "...wwwwwww...",
        "....wwwww....",
        "....aaaaa....",
        ".aaaaaaaaaaa.",
        ".aaaaaaaaaaa.",
        ".aWKaaaaaKWa.",
        ".aaaaaOaaaaa.",
        ".GGGGGGGGGGG.",
    ],
    # ------------------------------------------------ 环卫
    "recycling": [  # 11x11 空心三角回收标志 + 砖红厂房
        "...........",
        "....nnn....",
        "...nn.nn...",
        "...n...n...",
        "..n.....n..",
        ".nnn...nnn.",
        ".nnnnnnnnn.",
        ".GGGGGGGGG.",
        ".GBBBBBBBG.",
        ".GBBOOOBBG.",
        ".GGGGGGGGG.",
    ],
    # ------------------------------------------------ 民生
    "park": [  # 11x11 双层树冠（深浅点缀）+ 树干 + 花坛
        "...........",
        ".....n.....",
        "....nnn....",
        "...nnnnn...",
        "..nNnnnNn..",
        ".nnnnnnnnn.",
        ".nNnnnnnNn.",
        "..nnnnnnn..",
        "...nnnnn...",
        "....OOO....",
        "..GGGGGGG..",
    ],
    "lighthouse": [  # 11x11 红白横条纹锥形塔 + 灯室 + 两侧光束
        "...........",
        "....YYY....",
        ".YY.YYY.YY.",
        "....SSS....",
        "....BBB....",
        "....WWW....",
        "...BBBBB...",
        "...WWWWW...",
        "...BBBBB...",
        "..aaaaaaa..",
        ".GGGGGGGGG.",
    ],
    "school": [  # 13x13 钟楼（钟面 + 尖顶）+ 两层主楼 + 门廊
        ".............",
        ".....SSS.....",
        "....aaaaa....",
        "....aKYKa....",
        "....aYYYa....",
        "....aKYKa....",
        "....aaaaa....",
        ".BBBBBBBBBBB.",
        ".BWKWKWKWKWB.",
        ".BWWWWWWWWWB.",
        ".BWKWKWKWKWB.",
        ".BBBOOOOOBBB.",
        ".GGGGGGGGGGG.",
    ],
}


def check(rows, bid, palette_keys):
    errs = []
    n = len(rows)
    for y, r in enumerate(rows):
        if len(r) != n:
            errs.append("%s 第%d行 宽度 %d != %d" % (bid, y, len(r), n))
    for y, r in enumerate(rows):
        for ch in r:
            if ch != "." and ch not in palette_keys:
                errs.append("%s 第%d行 未知色号 '%s'" % (bid, y, ch))
    if bid not in ASYM_OK:
        for y, r in enumerate(rows):
            if r != r[::-1]:
                errs.append("%s 第%d行 左右不对称：%s" % (bid, y, r))
    filled = sum(1 for r in rows for ch in r if ch != ".")
    empty_rows = sum(1 for r in rows if set(r) == {"."})
    if empty_rows > 4:
        errs.append("%s 空行过多（%d/%d），剪影太瘦" % (bid, empty_rows, n))
    # 地面必须落在最后一行，否则放进城市网格时会比别的建筑"浮高"
    if set(rows[-1]) == {"."}:
        errs.append("%s 末行为空，地面没有沉底（应把内容整体下移）" % bid)
    else:
        tail = [ch for ch in rows[-1] if ch != "."]
        if len(tail) < n * 0.6:
            errs.append("%s 末行太窄（%d/%d），不像一条地面线" % (bid, len(tail), n))
    if filled < 30:
        errs.append("%s 填充仅 %d 颗，太单薄" % (bid, filled))
    if filled > 140:
        errs.append("%s 填充 %d 颗，拼太久" % (bid, filled))
    return errs, filled, n


def main():
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    keys = {p["k"] for p in data["palette"]}
    by_id = {b["id"]: b for b in data["buildings"]}

    missing = [k for k in ART if k not in by_id]
    extra = [b["id"] for b in data["buildings"] if b["id"] not in ART]
    if missing:
        print("× ART 里有的图纸在 JSON 中不存在：%s" % "、".join(missing))
        return 1
    if extra:
        print("× JSON 里有图纸未重绘：%s" % "、".join(extra))
        return 1

    all_errs = []
    report = []
    for b in data["buildings"]:
        rows = ART[b["id"]]
        errs, filled, n = check(rows, b["id"], keys)
        all_errs += errs
        b["rows"] = rows
        report.append((b["id"], b["name"], b["cat"], n, filled))

    if all_errs:
        print("× 图纸校验未通过：")
        for e in all_errs:
            print("   " + e)
        return 1

    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("图纸重绘完成，%-11s %-5s %-6s %-6s %s" % ("id", "cat", "尺寸", "填充", "名称"))
    for bid, name, cat, n, filled in report:
        flag = "  ← 不对称（构图需要）" if bid in ASYM_OK else ""
        print("  %-11s %-5s %dx%-4d %-6d %s%s" % (bid, cat, n, n, filled, name, flag))
    print("\n共 %d 张，填充量区间 %d ~ %d" % (
        len(report), min(r[4] for r in report), max(r[4] for r in report)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
