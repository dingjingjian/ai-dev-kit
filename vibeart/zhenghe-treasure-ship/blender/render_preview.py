"""渲染宝船预览图，用于阶段验收目视检查。

用法：blender --background --factory-startup --python blender/render_preview.py

取景：不写死相机距离，改为**按包围盒自动后退**（见 fit_distance）。
写死的距离会把船切出画面 —— 实测踩过：正侧视首尾同时出框、桅顶被上缘裁掉，
而 01 号机位又是照参考图对位用的，切了就没法逐项对照。

方位角约定（已实测核对）：相机放在 +Y 侧时，船首（+X）出现在画面**左侧**，
与参考图一致（参考图：船首在左、多层带白窗的艉楼在右）。
"""
import os
import sys
import math

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "out")
os.makedirs(OUTDIR, exist_ok=True)
sys.path.insert(0, HERE)

import build_ship as BS

BS.build_all()

L = BS.L
HULL_H = BS.DEPTH
# 取景目标定在船体腰线，而不是整体包围盒中心 ——
# 整体中心会被 30 单位高的桅顶拽到天上，船体反被挤出画面（实测踩过）。
TARGET = Vector((0.0, 0.0, HULL_H * 0.62))

# ── 相机内参（须与下方 scn.render 设置一致）────────────────
LENS_MM = 58.0
SENSOR_MM = 36.0
RES_X, RES_Y = 1400, 1000


def _half_angles():
    """返回水平/垂直半视场角的正切。sensor_fit 为 AUTO 时，长边取满 sensor。"""
    if RES_X >= RES_Y:
        kh = (SENSOR_MM / 2.0) / LENS_MM
        kv = kh * RES_Y / RES_X
    else:
        kv = (SENSOR_MM / 2.0) / LENS_MM
        kh = kv * RES_X / RES_Y
    return kh, kv


K_H, K_V = _half_angles()


def scene_bbox():
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name == "ZH_Preview_Sea":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for k in range(3):
                lo[k] = min(lo[k], w[k])
                hi[k] = max(hi[k], w[k])
    return lo, hi


def fit_distance(az_deg, el_deg, target, lo, hi, pad=1.06):
    """沿给定方位/俯仰方向后退到能把盒子完整收进画面的最小距离。

    对每个盒角求「横向偏移不超出半视场」的下界，取最大值。
    相机朝向 fwd 指向船；点 Q 的相机空间深度 = (Q-target)·fwd + d。
    """
    az, el = math.radians(az_deg), math.radians(el_deg)
    fwd = Vector((-math.cos(el) * math.cos(az),
                  -math.cos(el) * math.sin(az),
                  -math.sin(el)))
    right = fwd.cross(Vector((0.0, 0.0, 1.0)))
    if right.length < 1e-6:
        right = Vector((1.0, 0.0, 0.0))
    right.normalize()
    up = right.cross(fwd).normalized()

    need = 0.0
    for ix in (lo.x, hi.x):
        for iy in (lo.y, hi.y):
            for iz in (lo.z, hi.z):
                v = Vector((ix, iy, iz)) - target
                dep0 = v.dot(fwd)
                lat, ver = abs(v.dot(right)), abs(v.dot(up))
                need = max(need, lat / K_H - dep0, ver / K_V - dep0)
    return max(need, 1.0) * pad


# ── 世界与海面 ────────────────────────────────────────────
world = bpy.data.worlds.new("PreviewWorld")
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.106, 0.157, 0.196, 1.0)
    bg.inputs[1].default_value = 0.75
bpy.context.scene.world = world

SHIP_LO, SHIP_HI = scene_bbox()

bpy.ops.mesh.primitive_plane_add(size=L * 8, location=(0, 0, BS.KEEL_MIN_Z))
sea = bpy.context.active_object
sea.name = "ZH_Preview_Sea"
sea.data.materials.append(BS.mkmat("ZH_Mat_Sea", (0.055, 0.129, 0.180), 0.20))

# ── 三点光 ────────────────────────────────────────────────
# 能量压低：船体是木色，强光会把木纹洗成灰白（第一轮实测）
def add_sun(name, rot, energy, color=(1.0, 0.97, 0.92)):
    d = bpy.data.lights.new(name, type="SUN")
    d.energy = energy
    d.color = color
    d.angle = math.radians(7)
    ob = bpy.data.objects.new(name, d)
    ob.rotation_euler = rot
    bpy.context.collection.objects.link(ob)


add_sun("Key", (math.radians(52), 0, math.radians(38)), 2.0)
add_sun("Fill", (math.radians(74), 0, math.radians(-118)), 0.6, (0.72, 0.82, 1.0))
add_sun("Rim", (math.radians(80), 0, math.radians(206)), 0.9, (1.0, 0.86, 0.66))

scn = bpy.context.scene
# 引擎标识随 Blender 版本变化（5.2 是 BLENDER_EEVEE，不是 EEVEE_NEXT），
# 运行时从枚举里挑，不写死。
_engines = [i.identifier for i in
            bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
for _want in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    if _want in _engines:
        scn.render.engine = _want
        break
scn.render.film_transparent = False
scn.render.resolution_x = RES_X
scn.render.resolution_y = RES_Y
if hasattr(scn, "eevee") and hasattr(scn.eevee, "taa_render_samples"):
    scn.eevee.taa_render_samples = 64

cam_data = bpy.data.cameras.new("PreviewCam")
cam_data.lens = LENS_MM
cam_data.sensor_width = SENSOR_MM
cam = bpy.data.objects.new("PreviewCam", cam_data)
bpy.context.collection.objects.link(cam)
scn.camera = cam


def shoot(name, az_deg, el_deg, target=None, box=None, pad=1.06, dist_l=None):
    """机位渲染。box=(lo,hi) 限定取景范围（局部特写用）；dist_l 可强制指定距离。"""
    tgt = TARGET if target is None else target
    lo, hi = (SHIP_LO, SHIP_HI) if box is None else box
    dist = L * dist_l if dist_l else fit_distance(az_deg, el_deg, tgt, lo, hi, pad)
    az, el = math.radians(az_deg), math.radians(el_deg)
    pos = Vector((tgt.x + dist * math.cos(el) * math.cos(az),
                  tgt.y + dist * math.cos(el) * math.sin(az),
                  tgt.z + dist * math.sin(el)))
    cam.location = pos
    cam.rotation_euler = (tgt - pos).normalized().to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = os.path.join(OUTDIR, name)
    bpy.ops.render.render(write_still=True)
    return "%s.png  方位 %.0f° 俯仰 %.0f° 距离 %.1f(船长 %.2f)" % (
        name, az_deg, el_deg, dist, dist / L)


# 首 / 尾特写取景盒（只收半条船，看细节）
def end_box(sign):
    x0, x1 = (10.0, SHIP_HI.x + 1.0) if sign > 0 else (SHIP_LO.x - 1.0, -10.0)
    return (Vector((x0, SHIP_LO.y, SHIP_LO.z)),
            Vector((x1, SHIP_HI.y, SHIP_HI.z)))


outs = []
# 对照参考图：首左、3/4 视，全船入画
outs.append(shoot("preview_01_ref", 52, 11))
# 正侧视：看线型与双色水线
outs.append(shoot("preview_02_broadside", 90, 6))
# 首部特写
outs.append(shoot("preview_03_bow", 22, 12, box=end_box(+1)))
# 尾部与舵特写
outs.append(shoot("preview_04_stern", 158, 13, box=end_box(-1)))
# 俯瞰桅帆排布
outs.append(shoot("preview_05_top", 68, 46))

with open(os.path.join(OUTDIR, "_render.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(outs))
print("\n".join(outs))
