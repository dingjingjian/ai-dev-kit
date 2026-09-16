# -*- coding: utf-8 -*-
"""
泰坦尼克号 —— 四机位预览渲染。

机位对应参考图：
  side    正侧视（桨右首左对齐 docs/10294_alt4.png 的取景）
  portbow 左舷艏 3/4 俯视（对应 alt6 / prod）
  stbdqtr 右舷艉 3/4 俯视（对应 alt2）
  headon  艏部特写

用法：
  blender --background blender/out/titanic.blend --python blender/render_preview.py
或直接在已建好场景的 Blender 里跑本文件。

渲染用的地面与背景不计入模型：脚本结束时会把临时地面删掉。
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

# azim: 0=+X(船首) 90=+Y(左舷) 180=-X(船尾) -90=-Y(右舷)
VIEWS = [
    {"key": "side", "azim": -90.0, "elev": 0.0, "dist": 2700.0,
     "target": (5.0, 0.0, 20.0), "lens": 210.0, "res": (1500, 480)},
    {"key": "portbow", "azim": 48.0, "elev": 20.0, "dist": 620.0,
     "target": (6.0, 0.0, 10.0), "lens": 62.0, "res": (1500, 860)},
    {"key": "stbdqtr", "azim": -140.0, "elev": 18.0, "dist": 620.0,
     "target": (-6.0, 0.0, 10.0), "lens": 62.0, "res": (1500, 860)},
    {"key": "headon", "azim": 22.0, "elev": 10.0, "dist": 330.0,
     "target": (85.0, 0.0, 12.0), "lens": 58.0, "res": (1500, 900)},
]


def aim(cam, dist, azim_deg, elev_deg, target):
    t = Vector(target)
    a = math.radians(azim_deg)
    e = math.radians(elev_deg)
    d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a),
                math.sin(e)))
    cam.location = t + d * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()


def make_floor(z):
    """参考图里的深色地面（带反射感）。渲染完即删。"""
    me = bpy.data.meshes.new("TIFloor_mesh")
    s = 4000.0
    me.from_pydata([(-s, -s, z), (s, -s, z), (s, s, z), (-s, s, z)], [],
                   [(0, 1, 2, 3)])
    me.update()
    mat = bpy.data.materials.new("TIFloor_Mat")
    mat.use_nodes = True
    b = None
    for n in mat.node_tree.nodes:
        if n.bl_idname == "ShaderNodeBsdfPrincipled":
            b = n
            break
    if b is not None:
        for s_ in b.inputs:
            if s_.identifier == "Base Color":
                s_.default_value = (0.020, 0.022, 0.026, 1.0)
            elif s_.identifier == "Roughness":
                s_.default_value = 0.30
    me.materials.append(mat)
    ob = bpy.data.objects.new("TI_RenderFloor", me)
    bpy.context.collection.objects.link(ob)
    return ob


def main():
    os.makedirs(OUT, exist_ok=True)
    scn = bpy.context.scene
    cam = bpy.data.objects.get("TI_Camera")
    if cam is None:
        data = bpy.data.cameras.new("TI_Camera")
        cam = bpy.data.objects.new("TI_Camera", data)
        bpy.context.collection.objects.link(cam)
    scn.camera = cam
    # 默认远裁剪面只有 100 m，侧视机位要拉到 2400 才够长焦，必须先放开
    cam.data.clip_start = 2.0
    cam.data.clip_end = 20000.0

    floor = make_floor(-20.6)
    scn.render.image_settings.file_format = "PNG"
    scn.render.film_transparent = False

    results = []
    for v in VIEWS:
        aim(cam, v["dist"], v["azim"], v["elev"], v["target"])
        cam.data.lens = v["lens"]
        scn.render.resolution_x, scn.render.resolution_y = v["res"]
        path = os.path.join(OUT, "preview_%s.png" % v["key"])
        scn.render.filepath = path
        bpy.ops.render.render(write_still=True)
        results.append(path)
        print("RENDERED %s" % path)

    bpy.data.objects.remove(floor, do_unlink=True)
    print("PREVIEW_OK " + json.dumps(results))


if __name__ == "__main__":
    main()
