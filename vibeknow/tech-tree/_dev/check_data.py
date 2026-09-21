# -*- coding: utf-8 -*-
"""科技树数据校验：把「前置关系」当成一张有向图来检查。

data.js 的数据只要违反下面任何一条，页面就会画出断线、环路或错位的连线，
因此本脚本既能在本地单独跑，也被 build_zip.py 当作打包前置校验调用。

用法：python _dev/check_data.py        # 校验并打印统计
     check_data.collect()              # 供其它脚本 import，返回问题列表
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_data import load, DATA  # noqa: E402

SPECS_N = 4      # 每条科技的参数项数
FEATS_N = 3      # 每条科技的亮点条数


def collect():
    """返回 (problems, eras, techs, stats)。problems 为空即全部通过。"""
    eras, techs, style = load()
    problems = []

    if not eras:
        problems.append("data.js 里没有解析到任何时代（ERAS）")
    if not techs:
        problems.append("data.js 里没有解析到任何科技（TECHS）")
    if len(style) < 80:
        problems.append("IMG_STYLE 过短或缺失，配图提示词会缺少统一风格串")
    for bad in ("no logos", "no watermarks"):
        if bad not in style:
            problems.append("IMG_STYLE 缺少负面约束「%s」" % bad)

    era_keys = [e["key"] for e in eras]
    era_no = {k: i for i, k in enumerate(era_keys)}
    if len(set(era_keys)) != len(era_keys):
        problems.append("ERAS 里有重复的 key")

    by_id = {}
    for t in techs:
        if not t["id"]:
            problems.append("有条目缺少 id")
            continue
        if t["id"] in by_id:
            problems.append("科技 id 重复：%s" % t["id"])
        by_id[t["id"]] = t

    for t in techs:
        tag = t["id"] or t["name"] or "?"
        if t["era"] not in era_no:
            problems.append("%s 的 era=%r 不在 ERAS 中" % (tag, t["era"]))
        for field, label in (("name", "中文名"), ("en", "英文名"), ("year", "年代"),
                             ("tag", "一句话"), ("intro", "介绍"), ("subject", "生图主体")):
            if not t[field].strip():
                problems.append("%s 缺少%s（%s）" % (tag, label, field))
        if len(t["specs"]) != SPECS_N:
            problems.append("%s 的参数项应为 %d 项，实际 %d 项" % (tag, SPECS_N, len(t["specs"])))
        if len(t["feats"]) != FEATS_N:
            problems.append("%s 的亮点应为 %d 条，实际 %d 条" % (tag, FEATS_N, len(t["feats"])))
        if t["id"] in t["roots"]:
            problems.append("%s 把自身列为前置科技" % tag)
        if len(set(t["roots"])) != len(t["roots"]):
            problems.append("%s 的前置科技有重复项" % tag)

        for r in t["roots"]:
            if r not in by_id:
                problems.append("%s 的前置 %r 不存在" % (tag, r))
                continue
            if r not in era_no or t["era"] not in era_no:
                continue
            if era_no[r] > era_no[t["era"]]:
                problems.append("%s（第 %d 时代）的前置 %s 位于更晚的第 %d 时代"
                                % (tag, era_no[t["era"]] + 1, r, era_no[r] + 1))

    # 无环检查（拓扑排序；同时顺便统计每个时代的节点数）
    indeg = dict((t["id"], 0) for t in techs)
    children = dict((t["id"], []) for t in techs)
    for t in techs:
        for r in t["roots"]:
            if r in by_id:
                indeg[t["id"]] += 1
                children[r].append(t["id"])
    queue = [i for i in indeg if indeg[i] == 0]
    seen = 0
    while queue:
        cur = queue.pop()
        seen += 1
        for c in children[cur]:
            indeg[c] -= 1
            if indeg[c] == 0:
                queue.append(c)
    if seen != len(techs):
        problems.append("前置关系存在环：只有 %d / %d 个条目能排进拓扑序" % (seen, len(techs)))

    # 每个时代都要有「入口」：要么有根节点，要么它的前置来自更早的时代
    for e in eras:
        group = [t for t in techs if t["era"] == e["key"]]
        if not group:
            problems.append("时代「%s」没有任何科技条目" % e["zh"])
            continue
        entry = [t for t in group if not t["roots"]
                 or any(era_no[by_id[r]["era"]] < era_no[e["key"]]
                        for r in t["roots"] if r in by_id)]
        if not entry:
            problems.append("时代「%s」没有入口节点（所有条目的前置都落在同代，可能成环）" % e["zh"])

    edges = sum(len(t["roots"]) for t in techs)
    long_edges = sum(1 for t in techs for r in t["roots"]
                     if r in by_id and era_no[t["era"]] - era_no[by_id[r]["era"]] >= 2)
    stats = {
        "eras": len(eras),
        "techs": len(techs),
        "edges": edges,
        "long_edges": long_edges,
        "roots": sum(1 for t in techs if not t["roots"]),
        "per_era": [(e["zh"], len([t for t in techs if t["era"] == e["key"]])) for e in eras],
    }
    return problems, eras, techs, stats


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    problems, eras, techs, stats = collect()
    print("—— 数据校验（%s）——" % DATA.name)
    print("  时代 %d 个，科技 %d 项，前置关系 %d 条（其中跨多代的虚线 %d 条），起点 %d 个"
          % (stats["eras"], stats["techs"], stats["edges"], stats["long_edges"], stats["roots"]))
    for zh, n in stats["per_era"]:
        print("    · %-10s %2d 项" % (zh, n))
    if problems:
        print("\n校验失败 %d 项：" % len(problems))
        for p in problems:
            print("  ✗ " + p)
        sys.exit(1)
    print("\n数据校验全部通过 ✅")


if __name__ == "__main__":
    main()
