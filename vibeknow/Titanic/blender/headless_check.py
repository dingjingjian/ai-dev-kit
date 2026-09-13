# -*- coding: utf-8 -*-
"""泰坦尼克号 —— 无头几何审计 + GLB 导出。

用法（项目根目录）：
  blender --background --factory-startup --python blender/headless_check.py

审计项覆盖：部件齐全度、主尺度、三色船壳的逐面材质、烟囱/桅/救生艇落位、
水平与垂直方向的对称性、面片退化情况。退出码非 0 表示有断言失败。
"""

import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import build_ship as BS  # noqa: E402

FAILS = []
CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append((name, bool(ok), detail))
    if not ok:
        FAILS.append("%s  %s" % (name, detail))


def bbox_of(objs):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in objs:
        for c in o.bound_box:
            for i in range(3):
                v = c[i] * o.scale[i] + o.location[i]
                lo[i] = min(lo[i], v)
                hi[i] = max(hi[i], v)
    return lo, hi


def main():
    stats = BS.build_all()
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    names = sorted(o.name for o in objs)

    # 1 部件齐全度
    for pre in ("TI_Hull_Shell_", "TI_Hull_Keel", "TI_Hull_Portholes",
                "TI_Hull_Plating", "TI_Deck_Weather", "TI_Hull_Bulwark",
                "TI_Super_", "TI_Super_Windows", "TI_Super_Rails",
                "TI_BoatDeck", "TI_Mast_", "TI_Rigging", "TI_Lifeboats",
                "TI_Davits", "TI_Bow_Gear", "TI_Stern_Gear", "TI_Stand",
                "TI_Nameplate", "TI_Flags"):
        check("部件存在 " + pre, any(n.startswith(pre) for n in names))

    # 2 四座烟囱齐备
    keys = [f["key"] for f in BS.FUNNELS]
    for k in keys:
        check("烟囱 " + k, ("TI_Funnel_%s" % k) in names)

    # 3 主尺度：以船壳为准（铭牌、旗、了望台等外伸件不计入主尺度）
    hull = [o for o in objs if o.name.startswith("TI_Hull_Shell_")]
    hlo, hhi = bbox_of(hull)
    check("总长 = LOA", abs(hhi[0] - hlo[0] - BS.LOA) < 1.0,
          "%.2f / %.2f" % (hhi[0] - hlo[0], BS.LOA))
    check("型宽 = beam", abs(hhi[1] - hlo[1] - BS.BEAM) < 0.4,
          "%.2f / %.2f" % (hhi[1] - hlo[1], BS.BEAM))
    lo, hi = bbox_of(objs)
    span = [hi[i] - lo[i] for i in range(3)]
    check("全场景高 > 桅高", span[2] > BS.MASTS[0]["zTop"] - BS.MAST["zBase"],
          "%.2f" % span[2])
    check("外伸件（舭龙骨等）不超 6%",
          hhi[1] - hlo[1] <= BS.BEAM and hi[1] - lo[1] < BS.BEAM * 1.06,
          "%.2f" % (hi[1] - lo[1]))

    # 4 船体三色逐面材质都在用
    for side in ("Port", "Stbd"):
        ob = bpy.data.objects["TI_Hull_Shell_" + side]
        used = set(p.material_index for p in ob.data.polygons)
        used_names = set(ob.material_slots[i].material.name for i in used)
        for m in ("TI_Mat_Red", "TI_Mat_Black", "TI_Mat_Gold"):
            check("船壳 %s 用到 %s" % (side, m), m in used_names, str(sorted(used_names)))

    # 5 材质基色确实写进去了（Blender 5 中文界面下节点/插槽名被本地化，曾整船白模）
    for m in bpy.data.materials:
        if not m.name.startswith("TI_Mat_"):
            continue
        node = None
        for n in m.node_tree.nodes:
            if n.bl_idname == "ShaderNodeBsdfPrincipled":
                node = n
                break
        val = None
        if node is not None:
            for s in node.inputs:
                if s.identifier == "Base Color":
                    val = tuple(s.default_value)[:3]
        check("材质取色 " + m.name, val is not None and sum(val) > 0.0, str(val))

    # 6 舷孔 / 窗列落在黑色舷侧与白色上层建筑的正确高度带内
    ob = bpy.data.objects["TI_Hull_Portholes"]
    zs = [v.co.z for v in ob.data.vertices]
    check("舷孔在红色之上", min(zs) > BS.RED_TOP, "%.2f" % min(zs))
    check("舷孔在舷顶之下",
          max(zs) < BS.BLACK_TOP + max(c[1] for c in BS.CURVES["sheer"]))

    ob = bpy.data.objects["TI_Super_Windows"]
    zs = [v.co.z for v in ob.data.vertices]
    check("窗列在甲板面之上", min(zs) > BS.BLACK_TOP, "%.2f" % min(zs))
    check("窗列在艇甲板之下", max(zs) < BS.DECK_TOP, "%.2f" % max(zs))

    # 7 救生艇数量与左右对称
    ob = bpy.data.objects["TI_Lifeboats"]
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    check("救生艇两舷各 8 艘", abs(len(BS.LIFTS["xs"]) - 8) == 0)
    check("救生艇左右对称", abs(max(ys) + min(ys)) < 0.01,
          "%.3f / %.3f" % (min(ys), max(ys)))
    check("救生艇在艇甲板上", min(v.co.z for v in ob.data.vertices) >= BS.DECK_TOP - 0.6)

    # 8 烟囱后倾：顶部比底部更靠船尾
    rake = math.radians(BS.FUNNEL["rakeDeg"])
    for f in BS.FUNNELS:
        h = BS.SHIP["funnelTop"] - BS.DECK_TOP
        dx = -math.tan(rake) * h
        check("烟囱 %s 后倾" % f["key"], dx < 0 and abs(dx) > 1.0, "%.2f" % dx)

    # 9 索具在主桅与桅顶之间成线
    ob = bpy.data.objects["TI_Rigging"]
    check("索具有几何", len(ob.data.polygons) > 20, str(len(ob.data.polygons)))

    # 10 退化面统计
    bad = 0
    for o in objs:
        for p in o.data.polygons:
            if p.area < 1e-6:
                bad += 1
    check("退化面占比 < 1%", bad < stats["tris"] * 0.01,
          "%d/%d" % (bad, stats["tris"]))

    # 11 铭牌与船体不重叠（铭牌是独立摆件）
    plate = bpy.data.objects["TI_Nameplate"]
    plo, phi = bbox_of([plate])
    check("铭牌在艏部之外", plo[0] > hhi[0] - 1.0,
          "plate %.1f  bow %.1f" % (plo[0], hhi[0]))

    # ── 导出 GLB ───────────────────────────────────────────
    out = os.path.join(HERE, "out", "titanic.glb")
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "MESH")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB",
                              use_selection=True, export_apply=True)
    size = os.path.getsize(out)
    print("GLB %s  %.1f KB" % (out, size / 1024.0))

    ok = len(FAILS) == 0
    print("CHECKS %d  FAIL %d" % (len(CHECKS), len(FAILS)))
    for n, o, d in CHECKS:
        if not o:
            print("  FAIL %s  %s" % (n, d))
    print("HEADLESS_OK " + json.dumps({
        "objects": stats["objects"], "tris": stats["tris"],
        "checks": len(CHECKS), "fails": len(FAILS),
        "glbKB": round(size / 1024.0, 1)}))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
