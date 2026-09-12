"""无头跑通建模、做几何审计、导出 GLB。

用法：blender --background --factory-startup --python blender/headless_check.py
前置：node blender/export_params.js（本脚本会自动尝试调用 node 同步参数）
"""
import sys
import os
import json
import shutil
import subprocess
import traceback

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUTDIR = os.path.join(HERE, "out")
os.makedirs(OUTDIR, exist_ok=True)
sys.path.insert(0, HERE)

log = []
fails = []


def check(cond, label):
    log.append(("  [ OK ] " if cond else "  [FAIL] ") + label)
    if not cond:
        fails.append(label)


# ── 0. 同步参数 ──────────────────────────────────────────
node = shutil.which("node") or shutil.which("node.exe")
if node:
    try:
        r = subprocess.run([node, os.path.join(HERE, "export_params.js")],
                           cwd=ROOT, capture_output=True, text=True, timeout=90)
        log.append("参数同步：" + (r.stdout or "").strip().replace("\n", " | "))
    except Exception as e:
        log.append("参数同步失败（改用已有 params.json）：" + repr(e))
else:
    log.append("未找到 node，直接使用已有 params.json")

try:
    import build_ship as BS
    rep = BS.build_all()
    log.append("BUILD_OK " + json.dumps(rep, ensure_ascii=False))

    SHIP = BS.SHIP
    L, B, DEPTH = SHIP["length"], SHIP["beam"], SHIP["hullDepth"]
    from mathutils import Vector

    # ── 1. 桅帆计数 ──────────────────────────────────────
    names = [o.name for o in bpy.context.scene.objects]
    nm = len([n for n in names if n.startswith("ZH_Mast_")])
    ns = len([n for n in names if n.startswith("ZH_Sail_")])
    check(nm == 9, "桅数应为 9（实际 %d）" % nm)
    check(ns == 12, "帆数应为 12（实际 %d）" % ns)

    # ── 2. 极值部件 ──────────────────────────────────────
    top, top_name = -1e9, ""
    low, low_name = 1e9, ""
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            if w.z > top:
                top, top_name = w.z, o.name
            if w.z < low:
                low, low_name = w.z, o.name
    log.append("最高 z=%.2f (%s)　最低 z=%.2f (%s)" % (top, top_name, low, low_name))
    check(top_name.startswith("ZH_Mast_"), "最高点应为桅顶（实际 %s）" % top_name)
    check(low_name.startswith("ZH_Rudder"),
          "最低点应为大舵（福船大舵低于龙骨，实际 %s）" % low_name)
    check(low >= -(BS.DRAFT * 0.65),
          "舵底不应低于龙骨超 0.65 倍吃水（实际 z=%.2f）" % low)

    # ── 3. 总高 / 总长（参考图约 0.5，v1 只有 0.21）────────
    h_ratio = top / L
    check(0.40 <= h_ratio <= 0.60,
          "总高/总长 = %.3f 应落在 0.40~0.60（v1 为 0.21，篷帆过矮）" % h_ratio)

    # ── 4. 型深比例（v1 为 0.047 的「驳船」）──────────────
    d_ratio = DEPTH / L
    check(d_ratio >= 0.09,
          "型深/总长 = %.4f 应 ≥ 0.09（v1 为 0.047）" % d_ratio)

    # ── 5. 桅高单峰、峰值偏首 ────────────────────────────
    hs = []
    for m in BS.MASTS:
        ob = bpy.data.objects.get("ZH_" + m["key"].replace("mast", "Mast"))
        if not ob:
            check(False, "桅缺失：%s" % m["key"])
            continue
        hs.append((m["t"], max((ob.matrix_world @ Vector(c)).z for c in ob.bound_box)))
    hs.sort()
    peak_t = max(hs, key=lambda x: x[1])[0]
    check(0.55 <= peak_t <= 0.72,
          "最高桅应落在 t∈[0.55,0.72]（实际 %.3f）" % peak_t)
    mid_i = len(hs) // 2
    check(hs[0][1] < hs[mid_i][1], "桅高应自尾向中递增")
    check(hs[-1][1] < hs[mid_i][1], "桅高应自首向中递增")

    # ── 6. 篷帆高窄（v1 接近方形）────────────────────────
    ars = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.name.startswith("ZH_Sail_"):
            continue
        zs = [(o.matrix_world @ Vector(c)).z for c in o.bound_box]
        ys = [(o.matrix_world @ Vector(c)).y for c in o.bound_box]
        hh, ww = max(zs) - min(zs), max(ys) - min(ys)
        if ww > 1e-6:
            ars.append(hh / ww)
    avg_ar = sum(ars) / len(ars) if ars else 0
    log.append("帆高宽比均值 = %.2f（%d 面）" % (avg_ar, len(ars)))
    check(avg_ar >= 1.45,
          "帆应高窄（高/宽 ≥ 1.45，实际 %.2f）" % avg_ar)

    # ── 7. 舷孔 ──────────────────────────────────────────
    # 注意：不能用 obj.bound_box 检查 —— 那是整个舷孔阵列的全局 AABB，
    # 拿它去比某个局部站位的半宽必然误报（实测踩过）。逐顶点核验。
    ph = bpy.data.objects.get("ZH_Hull_Portholes")
    check(ph is not None, "应存在舷孔部件 ZH_Hull_Portholes")
    if ph:
        nph = len(ph.data.polygons) // 6
        check(nph >= 40, "舷孔数应 ≥ 40（实际约 %d）" % nph)
        ovf = []
        for v in ph.data.vertices:
            w = ph.matrix_world @ v.co
            tt = w.x / L + 0.5
            if not (0.02 < tt < 0.98):
                continue
            hw = BS.half_width(tt)
            # 允许「舷孔自身厚度 + 外偏量」的余量，不应超过半宽的 3% + 0.25
            if abs(w.y) > hw * 1.03 + 0.25:
                ovf.append((round(tt, 3), round(abs(w.y), 2), round(hw, 2)))
        check(not ovf, "舷孔不应越出舷外（越界 %d 个顶点）：%s" % (len(ovf), ovf[:4]))

    # ── 8. 双色船体 ──────────────────────────────────────
    shell = bpy.data.objects.get("ZH_Hull_Shell")
    check(shell is not None, "应存在船体外壳 ZH_Hull_Shell")
    if shell:
        used = sorted(set(p.material_index for p in shell.data.polygons))
        check(len(used) >= 2,
              "船体应为双色以上（深赭舷侧 + 米白船底），实际材质索引 %s" % used)

    # ── 9. 隔舱 ──────────────────────────────────────────
    nb = len([n for n in names if n.startswith("ZH_Bulkhead_")])
    check(nb == SHIP["bulkheadCount"],
          "隔舱数应为 %d（实际 %d）" % (SHIP["bulkheadCount"], nb))

    # 隔舱板应贴在船体内侧。站位 t 必须由顶点算 —— MB.build() 把顶点直接写在
    # 世界坐标里，object.location 恒为原点，拿它反推 t 会全部落到船中（实测踩过）。
    ovf_bh = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.name.startswith("ZH_Bulkhead_"):
            continue
        vs = [o.matrix_world @ v.co for v in o.data.vertices]
        t = sum(v.x for v in vs) / len(vs) / L + 0.5
        hw = BS.half_width(t)
        ymax = max(abs(v.y) for v in vs)
        if ymax > hw:
            ovf_bh.append((o.name, round(ymax, 2), round(hw, 2)))
    check(not ovf_bh,
          "隔舱壁不应越出船体线型（越界 %d 个）：%s" % (len(ovf_bh), ovf_bh[:4]))

    # 篷帆不应低于所在站位的甲板面（穿模）
    low_sails = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.name.startswith("ZH_Sail_"):
            continue
        vs = [o.matrix_world @ v.co for v in o.data.vertices]
        t = sum(v.x for v in vs) / len(vs) / L + 0.5
        zmin, zd = min(v.z for v in vs), BS.deck_z(t)
        if zmin < zd:
            low_sails.append((o.name, round(zmin, 2), round(zd, 2)))
    check(not low_sails,
          "篷帆不应低于所在站位甲板（穿透 %d 面）：%s" % (len(low_sails), low_sails[:4]))

    # ── 10. 拆解分组覆盖 ─────────────────────────────────
    groups = BS.P["explodeGroups"]
    uncovered = []
    for n in names:
        if not n.startswith("ZH_"):
            continue
        stem = n[3:]
        if not any(stem.startswith(p) for g in groups for p in g["parts"]):
            uncovered.append(n)
    check(not uncovered, "全部部件应归入拆解分组，未覆盖：%s" % uncovered[:8])

    # ── 11. 面数 ─────────────────────────────────────────
    check(rep["tris"] <= 150000, "三角面应 ≤ 150000（实际 %d）" % rep["tris"])

    # ── 12. 导出 GLB ─────────────────────────────────────
    out = os.path.join(OUTDIR, "zhenghe-treasure-ship.glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB",
                              use_selection=True, export_apply=True, export_yup=True)
    log.append("GLB = %s（%d bytes）" % (out, os.path.getsize(out)))

except Exception as e:
    log.append("ERROR " + repr(e))
    log.append(traceback.format_exc())
    fails.append("exception")

log.append("")
log.append("RESULT " + ("PASS" if not fails else "FAIL(%d)" % len(fails)))
if fails:
    log.append("失败项：")
    for f in fails:
        log.append("  - " + f)

with open(os.path.join(OUTDIR, "_log.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(log))
print("\n".join(log))
