"""几何合理性审计：检出穿模、比例失真、部件越界。
无头运行：blender --background --factory-startup --python audit_geometry.py
"""
import os, sys, json, math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUTDIR = os.path.join(HERE, "out")
os.makedirs(OUTDIR, exist_ok=True)
sys.path.insert(0, HERE)

import build_ship as BS

log = []
fails = []


def check(cond, label):
    log.append(("  [ OK ] " if cond else "  [FAIL] ") + label)
    if not cond:
        fails.append(label)


rep = BS.build_all()
SHIP, MASTS = BS.SHIP, BS.MASTS

# ── 1. 顶部/底部越界 ──────────────────────────────────────
top = -1e9
top_name = ""
keel_min = 1e9
keel_name = ""
for o in bpy.context.scene.objects:
    if o.type != "MESH":
        continue
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        if w.z > top:
            top, top_name = w.z, o.name
        if w.z < keel_min:
            keel_min, keel_name = w.z, o.name

log.append("最高点 z=%.2f (%s)" % (top, top_name))
log.append("最低点 z=%.2f (%s)" % (keel_min, keel_name))

# 主桅最高；船体（含舵）最低应在龙骨附近
check(top_name.startswith("ZH_Mast_"), "最高点应为主桅桅顶（实际 %s）" % top_name)
check(keel_min > -0.6, "最低点应贴近龙骨底面（实际 z=%.2f，%s）" % (keel_min, keel_name))

# ── 2. 长高比：九桅宝船应为「高桅大帆」，高不应远超长 ──────
L = SHIP["length"]
check(top < L * 0.75, "总高 %.1f 不应超过总长 %.1f 的 75%%（桅高失真）" % (top, L))

# ── 3. 桅高单调性：主桅最高，向前后递减 ───────────────────
tops = []
for m in MASTS:
    nm = "ZH_" + m["key"].replace("mast", "Mast")
    ob = bpy.data.objects.get(nm)
    if not ob:
        check(False, "桅缺失：%s" % nm)
        continue
    tops.append((nm, max((ob.matrix_world @ Vector(c)).z for c in ob.bound_box), m["t"]))

order = [n for n, _, _ in tops]
main = [t for t in tops if t[2] == 0.5]
check(len(main) == 1, "应恰有 1 根主桅（t=0.5）")
if main:
    check(main[0][1] == max(t[1] for t in tops), "主桅应为最高桅（实际最高是 %s）"
          % max(tops, key=lambda x: x[1])[0])

# 主桅往首方向应递减
fore = sorted([t for t in tops if t[2] > 0.5], key=lambda x: x[2])
after = sorted([t for t in tops if t[2] < 0.5], key=lambda x: -x[2])
check(all(fore[i][1] > fore[i + 1][1] for i in range(len(fore) - 1)), "前桅群桅高应向首递减")
check(all(after[i][1] > after[i + 1][1] for i in range(len(after) - 1)), "后桅群桅高应向尾递减")

# ── 4. 帆不应低于主甲板（穿模检查）────────────────────────
deck_min = BS.Z_DECK
low_sails = []
for o in bpy.context.scene.objects:
    if o.type != "MESH" or not o.name.startswith("ZH_Sail_") or "_Yard_" in o.name:
        continue
    zmin = min((o.matrix_world @ Vector(c)).z for c in o.bound_box)
    if zmin < deck_min * 0.9:
        low_sails.append((o.name, round(zmin, 2)))
check(not low_sails, "不应有帆体低于主甲板：%s" % low_sails)

# ── 5. 帆数 ───────────────────────────────────────────────
nsail = len([o for o in bpy.context.scene.objects
             if o.name.startswith("ZH_Sail_") and "_Yard_" not in o.name])
check(nsail == 12, "帆数应为 12（实际 %d）" % nsail)

# ── 6. 隔舱不越出船体 ────────────────────────────────────
ovf = []
for o in bpy.context.scene.objects:
    if o.type != "MESH" or not o.name.startswith("ZH_Bulkhead_"):
        continue
    ymax = max(abs((o.matrix_world @ Vector(c)).y) for c in o.bound_box)
    xc = o.location.x
    t = xc / L + 0.5
    hw = BS.hull_half_width_at(t) * 1.0
    if ymax > hw * 1.08:
        ovf.append((o.name, round(ymax, 2), round(hw, 2)))
check(not ovf, "隔舱壁不应越出船体线型：%s" % ovf)

# ── 7. 面数预算（展示版 ≤ 15 万，低模 ≤ 3 万）────────────
tri = sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH")
check(tri <= 150000, "面数应 ≤ 150000（实际 %d）" % tri)

log.append("")
log.append("RESULT " + ("PASS" if not fails else "FAIL(%d)" % len(fails)))
log.append("faces=%d objects=%d" % (tri, len(bpy.context.scene.objects)))

with open(os.path.join(OUTDIR, "_audit.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(log))
print("\n".join(log))
