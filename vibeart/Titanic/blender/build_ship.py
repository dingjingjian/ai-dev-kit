# -*- coding: utf-8 -*-
"""
泰坦尼克号（照乐高 10294 参考图建模）—— 参数化建模（Blender Python）

前置：先跑 `node blender/export_params.js` 生成 blender/out/params.json。

设计约束（沿用本仓库其它 Blender 项目的既有约定）：
1. 尺寸全部来自 assets/titanic-params.js（经 JSON 传来），本文件不另写数字。
2. 部件按 TI_<组>_<细分> 命名，供 HTML 端拆解模式按前缀取件。
3. 不使用贴图，只用纯色材质 —— 贴图是体积杀手。
4. 三色船壳（红防污 / 黑舷侧 / 金线）用逐面材质索引实现，不拆三个 Object。
5. 脚本一律相对路径，禁止硬编码绝对路径。

建模依据：docs/10294_alt4.png 正侧视图逐像素丈量（985 px ↔ 269.1 m）。
"""

import json
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
PARAMS = os.path.join(HERE, "out", "params.json")


def load_params():
    if not os.path.isfile(PARAMS):
        raise RuntimeError(
            "未找到 %s\n请先在项目根目录跑：node blender/export_params.js" % PARAMS)
    with open(PARAMS, encoding="utf-8") as f:
        return json.load(f)


P = load_params()
SHIP = P["SHIP"]
CURVES = P["CURVES"]
HOUSE = P["HOUSE"]
WINDOWS = P["WINDOWS"]
PORTHOLES = P["PORTHOLES"]
SHELL_DOORS = P["SHELL_DOORS"]
PLATING = P["PLATING"]
FUNNELS = P["FUNNELS"]
FUNNEL = P["FUNNEL"]
MASTS = P["MASTS"]
MAST = P["MAST"]
RIGGING = P["RIGGING"]
LIFTS = P["LIFTS"]
BOWG = P["BOW"]
STERNG = P["STERN"]
STAND = P["STAND"]
COLORS = P["COLORS"]

LOA = SHIP["loa"]
BEAM = SHIP["beam"]
HB = BEAM / 2.0
RED_TOP = SHIP["redTop"]
BLACK_TOP = SHIP["blackTop"]
GOLD_H = SHIP["goldBandH"]
BOAT_DECK = SHIP["boatDeck"]
DECK_TOP = BOAT_DECK + SHIP["deckSlab"]
BULWARK_H = SHIP["bulwarkH"]

HOUSE_T0 = HOUSE[0]["t0"]
HOUSE_T1 = HOUSE[0]["t1"]
BOAT_T0 = HOUSE[3]["t0"]
BOAT_T1 = HOUSE[3]["t1"]

N_T = 132       # 纵向站数
N_U = 18        # 半剖分点数

MAT_ORDER = ["white", "black", "red", "funnel", "gold", "deck", "porthole",
             "glass", "mast", "steel", "wood", "boat", "flagRed", "flagBlue",
             "rigging"]
MI = {n: i for i, n in enumerate(MAT_ORDER)}


# ────────────────────────────────────────────────────────────
# 一、曲线与船体数学
# ────────────────────────────────────────────────────────────

def cv(name, t):
    """采样参数曲线（[[t, 值], ...]），线性插值。"""
    tbl = CURVES[name]
    if t <= tbl[0][0]:
        return tbl[0][1]
    if t >= tbl[-1][0]:
        return tbl[-1][1]
    for i in range(len(tbl) - 1):
        a, b = tbl[i], tbl[i + 1]
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
            return a[1] + (b[1] - a[1]) * f
    return tbl[-1][1]


def x_of(t):
    return (t - 0.5) * LOA


def t_of(x):
    return x / LOA + 0.5


def hull_half(t):
    return HB * cv("plan", t)


def keel_z(t):
    return cv("keel", t)


def deck_z(t):
    return BLACK_TOP + cv("sheer", t)


def sect_frac(v, vb, p):
    """横剖面半宽系数：v 自龙骨(0)到舷顶(1)。舭部以下快速张开，其上满宽。"""
    if v <= 0.0:
        return 0.0
    if v >= vb:
        return 1.0
    return math.sqrt(1.0 - (1.0 - v / vb) ** p)


def hull_pt(t, u, side):
    zk, zd = keel_z(t), deck_z(t)
    z = zk + u * (zd - zk)
    w = hull_half(t) * sect_frac(u, cv("vb", t), cv("psect", t))
    return (x_of(t), side * w, z)


def deck_top_at(t):
    z = deck_z(t)
    for b in HOUSE:
        if b["t0"] <= t <= b["t1"]:
            z = max(z, b["z1"])
    return z


def house_plan(t):
    """上层建筑平面系数 —— 比水线平面丰满（上层建筑不会跟着船体收到尖角）。"""
    return min(1.0, cv("plan", t) ** 0.55)


# ────────────────────────────────────────────────────────────
# 二、几何累加器
# ────────────────────────────────────────────────────────────

class MB(object):
    """把部件的多个体块合成单个 Object，支持逐面材质索引。"""

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.mi = []

    def add_quad(self, a, b, c, d, mi=0):
        i = len(self.verts)
        self.verts.extend([a, b, c, d])
        self.faces.append((i, i + 1, i + 2, i + 3))
        self.mi.append(mi)

    def add_tri(self, a, b, c, mi=0):
        i = len(self.verts)
        self.verts.extend([a, b, c])
        self.faces.append((i, i + 1, i + 2))
        self.mi.append(mi)

    def add_box(self, center, size, mi=0):
        return self.add_box_rot(center, size, 0.0, mi)

    def add_box_rot(self, center, size, rot_x, mi=0):
        """绕 X 轴旋转的箱体（用于倾斜的烟囱底座、斜桅等）。"""
        cx, cy, cz = center
        sx, sy, sz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
        ca, sa = math.cos(rot_x), math.sin(rot_x)
        pts = []
        for dz in (-sz, sz):
            for dy, dx in ((-sy, -sx), (-sy, sx), (sy, sx), (sy, -sx)):
                pts.append((dx, dy, dz))
        b0 = len(self.verts)
        self.verts.extend([
            (cx + p[0], cy + p[1] * ca - p[2] * sa, cz + p[1] * sa + p[2] * ca)
            for p in pts])
        for q in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                  (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            self.faces.append((b0 + q[0], b0 + q[1], b0 + q[2], b0 + q[3]))
            self.mi.append(mi)

    def add_box_seg(self, a, b, w, hgt, mi=0):
        """两点之间的方杆（栏杆、支索托等斜置构件）。"""
        d = [b[i] - a[i] for i in range(3)]
        ln = math.sqrt(sum(v * v for v in d))
        if ln < 1e-9:
            return
        u = [v / ln for v in d]
        ref = (0.0, 0.0, 1.0) if abs(u[2]) < 0.98 else (1.0, 0.0, 0.0)
        s = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2],
             u[0] * ref[1] - u[1] * ref[0]]
        sl = math.sqrt(sum(v * v for v in s)) or 1.0
        s = [v / sl for v in s]
        t = [s[1] * u[2] - s[2] * u[1], s[2] * u[0] - s[0] * u[2],
             s[0] * u[1] - s[1] * u[0]]
        corners = []
        for p in (a, b):
            for (fs, ft) in ((-1, -1), (-1, 1), (1, 1), (1, -1)):
                corners.append((p[0] + s[0] * w / 2 * fs + t[0] * hgt / 2 * ft,
                                p[1] + s[1] * w / 2 * fs + t[1] * hgt / 2 * ft,
                                p[2] + s[2] * w / 2 * fs + t[2] * hgt / 2 * ft))
        i0 = len(self.verts)
        self.verts.extend(corners)
        for q in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                  (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            self.faces.append((i0 + q[0], i0 + q[1], i0 + q[2], i0 + q[3]))
            self.mi.append(mi)

    def add_grid(self, nu, nt, pt_fn, mi_fn, flip=False):
        """生成 (nt-1)×(nu-1) 张四边形。索引 i*nu + j，i 沿长度(j 变化最快)。"""
        b0 = len(self.verts)
        for i in range(nt):
            for j in range(nu):
                self.verts.append(pt_fn(i, j))
        for i in range(nt - 1):
            for j in range(nu - 1):
                a = b0 + i * nu + j
                b = b0 + (i + 1) * nu + j
                c = b0 + (i + 1) * nu + j + 1
                d = b0 + i * nu + j + 1
                if flip:
                    self.faces.append((a, b, c, d))
                else:
                    self.faces.append((a, d, c, b))
                self.mi.append(mi_fn(i, j))

    def add_prism(self, pts_lo, pts_hi, mi_side=0, mi_cap=0):
        """由上下两条等长闭合折线拉出棱柱（用于烟囱、索具等）。"""
        n = len(pts_lo)
        for k in range(n):
            k2 = (k + 1) % n
            self.add_quad(pts_lo[k], pts_lo[k2], pts_hi[k2], pts_hi[k], mi_side)
        cx = sum(p[0] for p in pts_hi) / n
        cy = sum(p[1] for p in pts_hi) / n
        cz = sum(p[2] for p in pts_hi) / n
        for k in range(n):
            self.add_tri((cx, cy, cz), pts_hi[k], pts_hi[(k + 1) % n], mi_cap)
        cx = sum(p[0] for p in pts_lo) / n
        cy = sum(p[1] for p in pts_lo) / n
        cz = sum(p[2] for p in pts_lo) / n
        for k in range(n):
            self.add_tri((cx, cy, cz), pts_lo[(k + 1) % n], pts_lo[k], mi_cap)

    def build(self):
        if not self.verts:
            return None
        me = bpy.data.meshes.new(self.name + "_mesh")
        me.from_pydata(self.verts, [], self.faces)
        for name in MAT_ORDER:
            me.materials.append(MATERIALS[name])
        me.validate(verbose=False)
        nmat = len(MAT_ORDER)
        for i, poly in enumerate(me.polygons):
            if i < len(self.mi):
                poly.material_index = min(max(self.mi[i], 0), nmat - 1)
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        return ob


# ────────────────────────────────────────────────────────────
# 三、场景与材质
# ────────────────────────────────────────────────────────────

MATERIALS = {}


def reset_scene():
    """清空场景。

    刻意**不**用 `wm.read_factory_settings`：那会把 Blender 重载回出厂状态，
    顺带卸载 blender-mcp 插件、掐断 MCP 连接（实测踩过，会话当场断线）。
    改为逐个删除数据块。
    """
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for store in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                  bpy.data.lights, bpy.data.cameras, bpy.data.images,
                  bpy.data.worlds):
        for blk in list(store):
            try:
                store.remove(blk)
            except (RuntimeError, ReferenceError):
                pass
    scn = bpy.context.scene
    scn.unit_settings.system = "METRIC"
    scn.unit_settings.scale_length = 1.0


def _find_node(mat, bl_idname):
    for n in mat.node_tree.nodes:
        if n.bl_idname == bl_idname:
            return n
    return None


def _socket(node, ident):
    """按 identifier 取插槽。

    不能用 `node.inputs["Base Color"]`：Blender 5.x 的中文界面下
    节点名与插槽名都被本地化（节点叫「原理化 BSDF」、插槽叫「基础色」），
    按名字取会静默拿到 None，结果是整船渲染成白模（实测踩过）。
    """
    for s in node.inputs:
        if s.identifier == ident:
            return s
    return None


def mkmat(name, rgb, rough=0.62, metal=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = _find_node(mat, "ShaderNodeBsdfPrincipled")
    if b is None:
        b = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = _find_node(mat, "ShaderNodeOutputMaterial")
        if out is not None:
            mat.node_tree.links.new(b.outputs[0], out.inputs[0])
    for ident, val in (("Base Color", (rgb[0], rgb[1], rgb[2], 1.0)),
                       ("Roughness", rough), ("Metallic", metal)):
        s = _socket(b, ident)
        if s is not None:
            s.default_value = val
    mat.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return mat


def build_materials():
    MATERIALS["white"] = mkmat("TI_Mat_White", COLORS["white"], 0.55)
    MATERIALS["black"] = mkmat("TI_Mat_Black", COLORS["black"], 0.48)
    MATERIALS["red"] = mkmat("TI_Mat_Red", COLORS["red"], 0.52)
    MATERIALS["funnel"] = mkmat("TI_Mat_Funnel", COLORS["funnel"], 0.52)
    MATERIALS["gold"] = mkmat("TI_Mat_Gold", COLORS["gold"], 0.45, 0.35)
    MATERIALS["deck"] = mkmat("TI_Mat_Deck", COLORS["deck"], 0.78)
    MATERIALS["porthole"] = mkmat("TI_Mat_Porthole", COLORS["porthole"], 0.40)
    MATERIALS["glass"] = mkmat("TI_Mat_Glass", COLORS["glass"], 0.25)
    MATERIALS["mast"] = mkmat("TI_Mat_Mast", COLORS["mast"], 0.72)
    MATERIALS["steel"] = mkmat("TI_Mat_Steel", COLORS["steel"], 0.40, 0.55)
    MATERIALS["wood"] = mkmat("TI_Mat_Wood", COLORS["wood"], 0.72)
    MATERIALS["boat"] = mkmat("TI_Mat_Boat", COLORS["boat"], 0.72)
    MATERIALS["flagRed"] = mkmat("TI_Mat_FlagRed", COLORS["flagRed"], 0.80)
    MATERIALS["flagBlue"] = mkmat("TI_Mat_FlagBlue", COLORS["flagBlue"], 0.80)
    MATERIALS["rigging"] = mkmat("TI_Mat_Rigging", COLORS["rigging"], 0.55)


# ────────────────────────────────────────────────────────────
# 四、船体：三色外壳
# ────────────────────────────────────────────────────────────

def hull_mi(t, u):
    """逐面材质：金线（舷顶）/ 黑舷侧 / 红防污。"""
    zk, zd = keel_z(t), deck_z(t)
    z = zk + u * (zd - zk)
    if z >= zd - GOLD_H:
        return MI["gold"]
    if z <= RED_TOP:
        return MI["red"]
    return MI["black"]


def build_hull_shell():
    ts = [i / float(N_T - 1) for i in range(N_T)]
    us = [j / float(N_U - 1) for j in range(N_U)]

    for side in (1, -1):
        nm = "TI_Hull_Shell_%s" % ("Port" if side > 0 else "Stbd")
        mb = MB(nm)

        def pt(i, j):
            return hull_pt(ts[i], us[j], side)

        def mi_at(i, j):
            tm = (ts[i] + ts[i + 1]) / 2.0
            um = (us[j] + us[j + 1]) / 2.0
            return hull_mi(tm, um)

        mb.add_grid(N_U, N_T, pt, mi_at, flip=(side < 0))
        mb.build()


def build_keel():
    """龙骨平板 + 舭龙骨（航速标志，也让平底不至于像一块砖）。"""
    mb = MB("TI_Hull_Keel")
    n = 60
    for i in range(n):
        tm = (i + 0.5) / float(n)
        zk = keel_z(tm)
        wf = 0.85 - 0.45 * (abs((tm - 0.5) * 2.0) ** 3.0)
        mb.add_box((x_of(tm), 0.0, zk - 0.30), (LOA / n * 1.06, HB * wf, 0.62),
                   MI["steel"])
    mb.build()


def build_deck():
    """露天甲板面：船壳上缘的木质铺面（上层建筑之下被遮住，只在艏艉可见）。"""
    mb = MB("TI_Deck_Weather")
    ts = [i / float(96) for i in range(97)]

    def pt(i, j):
        t = ts[i]
        w = hull_half(t) * 0.985
        return (x_of(t), (1 if j == 0 else -1) * w, deck_z(t) - 0.06)

    mb.add_grid(2, 97, pt, lambda i, j: MI["deck"], flip=True)
    mb.build()


def build_bulwark():
    """露天甲板舷墙（艏楼）—— 黑色板 + 浅色压条，照参考图。"""
    mb = MB("TI_Hull_Bulwark")
    ts = [0.858 + (0.998 - 0.858) * i / 40.0 for i in range(41)]
    for side in (1, -1):
        def pt(i, j):
            t = ts[i]
            w = hull_half(t) * 0.995
            z = deck_z(t) + (BULWARK_H if j else -0.05)
            return (x_of(t), side * w, z)

        mb.add_grid(2, len(ts), pt, lambda i, j: MI["black"], flip=(side < 0))
    mb.build()

    cap = MB("TI_Hull_BulwarkCap")
    for side in (1, -1):
        def pt(i, j):
            t = ts[i]
            w = hull_half(t) * 0.995
            z = deck_z(t) + BULWARK_H + (0.30 if j else -0.06)
            return (x_of(t), side * w, z)

        cap.add_grid(2, len(ts), pt, lambda i, j: MI["white"], flip=(side < 0))
    cap.build()


def build_portholes():
    """黑色船壳上的两排浅色舷孔 —— 参考图最显眼的纹理。"""
    mb = MB("TI_Hull_Portholes")
    for row in PORTHOLES:
        z = row["z"]
        t = row["t0"]
        while t <= row["t1"]:
            zk, zd = keel_z(t), deck_z(t)
            u = (z - zk) / (zd - zk)
            if 0.06 < u < 0.96:
                w = hull_half(t) * sect_frac(u, cv("vb", t), cv("psect", t))
                for side in (1, -1):
                    mb.add_box((x_of(t), side * (w - 0.10), z),
                               (row["w"], 0.66, row["h"]), MI["porthole"])
            t += row["pitch"] / LOA
    mb.build()


def build_shell_doors():
    """船壳上的深色装货门 / 舷门。"""
    mb = MB("TI_Hull_ShellDoors")
    for d in SHELL_DOORS:
        t, z = d["t"], d["z"]
        zk, zd = keel_z(t), deck_z(t)
        u = (z - zk) / (zd - zk)
        w = hull_half(t) * sect_frac(u, cv("vb", t), cv("psect", t))
        for side in (1, -1):
            mb.add_box((x_of(t), side * (w - 0.16), z),
                       (d["w"], 0.70, d["h"]), MI["steel"])
            mb.add_box((x_of(t), side * (w - 0.06), z),
                       (d["w"] * 0.86, 0.52, d["h"] * 0.80), MI["black"])
    mb.build()


def build_plating():
    """黑色舷侧上缘的一排深色板 —— 参考图上最显眼的横向肌理。"""
    mb = MB("TI_Hull_Plating")
    z = PLATING["z"]
    step = PLATING["pitch"] / LOA
    t = PLATING["t0"]
    while t <= PLATING["t1"]:
        zk, zd = keel_z(t), deck_z(t)
        u = (z - zk) / (zd - zk)
        if 0.06 < u < 0.96:
            w = hull_half(t) * sect_frac(u, cv("vb", t), cv("psect", t))
            for side in (1, -1):
                mb.add_box((x_of(t), side * (w - PLATING["depth"] * 0.5 + 0.04), z),
                           (PLATING["w"], PLATING["depth"] + 0.10, PLATING["h"]),
                           MI["steel"])
        t += step
    mb.build()


# ────────────────────────────────────────────────────────────
# 五、上层建筑
# ────────────────────────────────────────────────────────────

def house_half(t, wk):
    return HB * house_plan(t) * wk


def build_house():
    """白色上层建筑：自下而上嵌套的台阶块，随平面线型收放。"""
    for blk in HOUSE:
        nm = "TI_Super_%s" % blk["key"]
        mb = MB(nm)
        n = 44
        ts = [blk["t0"] + (blk["t1"] - blk["t0"]) * i / float(n) for i in range(n + 1)]

        def pt(i, j):
            t = ts[i]
            w = house_half(t, blk["wk"])
            # j: 0 左舷底, 1 左舷顶, 2 右舷顶, 3 右舷底 —— 构成闭合环
            z = blk["z1"] if j in (1, 2) else blk["z0"]
            y = w if j in (0, 1) else -w
            return (x_of(t), y, z)

        mb.add_grid(4, len(ts), pt, lambda i, j: MI["white"], flip=True)

        # 前后端封口
        for idx, sgn in ((0, -1), (len(ts) - 1, 1)):
            t = ts[idx]
            w = house_half(t, blk["wk"])
            a = (x_of(t) + sgn * 0.02, w, blk["z0"])
            b = (x_of(t) + sgn * 0.02, w, blk["z1"])
            c = (x_of(t) + sgn * 0.02, -w, blk["z1"])
            d = (x_of(t) + sgn * 0.02, -w, blk["z0"])
            if sgn > 0:
                mb.add_quad(a, b, c, d, MI["white"])
            else:
                mb.add_quad(d, c, b, a, MI["white"])
        mb.build()


def build_windows():
    """窗列：照参考图的横向长排小窗。"""
    mb = MB("TI_Super_Windows")
    for row in WINDOWS:
        t = row["t0"]
        while t <= row["t1"]:
            w = house_half(t, row["wk"])
            for side in (1, -1):
                mb.add_box((x_of(t), side * (w - row["depth"] * 0.5 + 0.06), row["z"]),
                           (row["w"], row["depth"] + 0.12, row["h"]), MI["glass"])
            t += row["pitch"] / LOA
    mb.build()


def build_rails():
    """栏杆：艇甲板周边 + 各层露台外缘。"""
    mb = MB("TI_Super_Rails")
    h = SHIP["railH"]
    ps = 0.34

    def run(ts, half_fn, z_fn):
        for side in (1, -1):
            for i in range(len(ts)):
                mb.add_box((x_of(ts[i]), side * half_fn(ts[i]), z_fn(ts[i]) + h / 2.0),
                           (ps, ps, h), MI["white"])
            for lvl in (0.42, 1.0):
                for i in range(len(ts) - 1):
                    x0, x1 = x_of(ts[i]), x_of(ts[i + 1])
                    y0, y1 = side * half_fn(ts[i]), side * half_fn(ts[i + 1])
                    z0 = z_fn(ts[i]) + h * lvl
                    z1 = z_fn(ts[i + 1]) + h * lvl
                    # 甲板有舷弧，横杆随之抬升：用斜置箱体，避免出现台阶缺口
                    mb.add_box_seg((x0, y0, z0), (x1, y1, z1), 0.22, 0.22,
                                   MI["white"])

    # 艇甲板边缘
    n = 40
    ts = [BOAT_T0 + (BOAT_T1 - BOAT_T0) * i / float(n) for i in range(n + 1)]
    run(ts, lambda t: house_half(t, HOUSE[3]["wk"]), lambda t: DECK_TOP - 0.1)
    # 艉部 C 甲板露台（B2 之后的 B1 顶）
    n2 = 12
    ts2 = [HOUSE[0]["t0"] + (HOUSE[1]["t0"] - HOUSE[0]["t0"]) * i / float(n2)
           for i in range(n2 + 1)]
    run(ts2, lambda t: house_half(t, HOUSE[0]["wk"]), lambda t: HOUSE[0]["z1"] - 0.1)
    # 艏部 C 甲板露台（B1 之前，B2 之后）
    ts3 = [HOUSE[1]["t1"] + (HOUSE[0]["t1"] - HOUSE[1]["t1"]) * i / float(n2)
           for i in range(n2 + 1)]
    run(ts3, lambda t: house_half(t, HOUSE[0]["wk"]), lambda t: HOUSE[0]["z1"] - 0.1)
    # B3 顶露台（B4 之外）
    ts4 = [HOUSE[2]["t0"] + (HOUSE[3]["t0"] - HOUSE[2]["t0"]) * i / float(n2)
           for i in range(n2 + 1)]
    run(ts4, lambda t: house_half(t, HOUSE[2]["wk"]), lambda t: HOUSE[2]["z1"] - 0.1)
    ts5 = [HOUSE[3]["t1"] + (HOUSE[2]["t1"] - HOUSE[3]["t1"]) * i / float(n2)
           for i in range(n2 + 1)]
    run(ts5, lambda t: house_half(t, HOUSE[2]["wk"]), lambda t: HOUSE[2]["z1"] - 0.1)
    mb.build()


def build_boat_deck():
    """艇甲板铺面 + 甲板舱室（通风筒、升降口）。"""
    blk = HOUSE[3]
    mb = MB("TI_BoatDeck")
    n = 40
    ts = [blk["t0"] + (blk["t1"] - blk["t0"]) * i / float(n) for i in range(n + 1)]

    def pt(i, j):
        t = ts[i]
        w = house_half(t, blk["wk"] + 0.022)
        return (x_of(t), (1 if j == 0 else -1) * w, DECK_TOP)

    mb.add_grid(2, len(ts), pt, lambda i, j: MI["deck"], flip=True)
    mb.build()

    fit = MB("TI_BoatDeck_Fittings")
    boxes = [
        (-70.0, 0.0, 3.4, 2.6, 2.2), (-58.0, 0.0, 2.6, 2.2, 1.8),
        (-38.0, 0.0, 3.0, 2.4, 2.6), (-28.0, 0.0, 2.4, 2.0, 1.7),
        (-4.0, 0.0, 3.6, 2.8, 2.4), (6.0, 0.0, 2.2, 1.9, 1.6),
        (32.0, 0.0, 3.2, 2.5, 2.2), (44.0, 0.0, 2.4, 2.0, 1.8),
        (68.0, 0.0, 2.8, 2.2, 2.0),
        # 两舷通风筒
        (-64.0, 6.4, 1.7, 1.7, 2.4), (52.0, 6.4, 1.7, 1.7, 2.4),
        (-64.0, -6.4, 1.7, 1.7, 2.4), (52.0, -6.4, 1.7, 1.7, 2.4),
    ]
    for (x, y, ln, wd, hh) in boxes:
        fit.add_box((x, y, DECK_TOP + hh / 2.0), (ln, wd, hh), MI["white"])
        fit.add_box((x, y, DECK_TOP + hh + 0.16), (ln * 1.10, wd * 1.10, 0.32),
                    MI["white"])
    fit.build()


# ────────────────────────────────────────────────────────────
# 六、烟囱
# ────────────────────────────────────────────────────────────

def build_funnels():
    segs = FUNNEL["segs"]
    rake = math.radians(FUNNEL["rakeDeg"])
    oval = FUNNEL["oval"]
    z0 = DECK_TOP
    z1 = SHIP["funnelTop"]
    height = z1 - z0
    dx_top = -math.tan(rake) * height

    for f in FUNNELS:
        x0 = f["x"]
        mb = MB("TI_Funnel_%s" % f["key"])

        def ring(fr, r):
            xc = x0 + dx_top * fr
            return [(xc + r * math.cos(2 * math.pi * k / segs),
                     r * oval * math.sin(2 * math.pi * k / segs),
                     z0 + height * fr) for k in range(segs)]

        steps = 10
        cap_lo_fr = 1.0 - f["capH"] / height
        prev = ring(0.0, f["rBase"])
        for s in range(1, steps + 1):
            fr = s / float(steps)
            r = f["rBase"] + (f["rTop"] - f["rBase"]) * fr
            cur = ring(fr, r)
            # 罐体黄、顶罩黑：以顶罩下缘为界
            mi_active = MI["funnel"] if fr <= cap_lo_fr + 1e-6 else MI["black"]
            for k in range(segs):
                k2 = (k + 1) % segs
                mb.add_quad(prev[k], prev[k2], cur[k2], cur[k], mi_active)
            prev = cur

        # 黑色顶罩（略微外扩，读起来是"套"上去的）
        cap_lo_fr = 1.0 - f["capH"] / height
        r_cap = f["rBase"] + (f["rTop"] - f["rBase"]) * cap_lo_fr
        lo = []
        hi = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            lo.append((x0 + dx_top * cap_lo_fr + r_cap * 1.06 * math.cos(a),
                       r_cap * 1.06 * oval * math.sin(a),
                       z0 + height * cap_lo_fr))
            hi.append((x0 + dx_top + f["rTop"] * 1.06 * math.cos(a),
                       f["rTop"] * 1.06 * oval * math.sin(a), z1))
        mb.add_prism(lo, hi, MI["black"], MI["black"])
        mb.build()

        # 蒸汽管：两支细管，贴在烟囱两侧
        mp = MB("TI_Funnel_%s_Pipes" % f["key"])
        for side in (1, -1):
            xc = x0 + 0.5 * dx_top - side * 0.0
            lp = []
            hp = []
            for k in range(8):
                a = 2 * math.pi * k / 8
                rr = 0.62
                lp.append((xc + rr * math.cos(a),
                           side * (f["rBase"] * 0.80 * oval) + rr * math.sin(a),
                           z0 + 0.6))
                hp.append((x0 + dx_top + rr * math.cos(a),
                           side * (f["rTop"] * 0.80 * oval) + rr * math.sin(a),
                           z1 - 1.9))
            mp.add_prism(lp, hp, MI["white"], MI["white"])
        mp.build()


# ────────────────────────────────────────────────────────────
# 七、桅、索具、旗帜
# ────────────────────────────────────────────────────────────

def build_masts():
    segs = MAST["segs"]
    for m in MASTS:
        mb = MB("TI_Mast_%s" % m["key"])
        rake = math.radians(m["rakeDeg"])
        zb = deck_top_at(t_of(m["x"])) - 1.2
        h = m["zTop"] - zb
        dx_top = -math.tan(rake) * h
        prev = None
        steps = 6
        for s in range(steps + 1):
            fr = s / float(steps)
            r = MAST["rBase"] + (MAST["rTop"] - MAST["rBase"]) * fr
            xc = m["x"] + dx_top * fr
            z = zb + h * fr
            ring = [(xc + r * math.cos(2 * math.pi * k / segs),
                     r * math.sin(2 * math.pi * k / segs), z) for k in range(segs)]
            if prev is not None:
                for k in range(segs):
                    k2 = (k + 1) % segs
                    mb.add_quad(prev[k], prev[k2], ring[k2], ring[k], MI["mast"])
            else:
                cx = xc
                for k in range(segs):
                    mb.add_tri((cx, 0.0, z), ring[(k + 1) % segs], ring[k],
                               MI["mast"])
            prev = ring

        # 桅顶小旗杆
        mb.add_box((m["x"] + dx_top, 0.0, m["zTop"] + 1.2),
                   (0.34, 0.34, 2.4), MI["mast"])

        # 横桁（两根）
        for fr, ln in ((0.52, 13.0), (0.80, 9.0)):
            zz = zb + h * fr
            xx = m["x"] + dx_top * fr
            mb.add_box((xx, 0.0, zz), (0.62, ln, 0.62), MI["mast"])

        # 了望台（前桅）
        if m["crow"]:
            zz = zb + h * 0.62
            xx = m["x"] + dx_top * 0.62
            mb.add_box((xx, 0.0, zz), (3.2, 5.6, 0.42), MI["white"])
            for side in (1, -1):
                mb.add_box((xx, side * 2.7, zz + 0.62), (3.2, 0.24, 1.3),
                           MI["white"])
            mb.add_box((xx - 1.5, 0.0, zz + 0.62), (0.24, 5.6, 1.3),
                       MI["white"])
        mb.build()


def add_wire(mb, a, b, r, mi):
    """两点之间的细杆（索具）。"""
    ax, ay, az = a
    bx, by, bz = b
    d = (bx - ax, by - ay, bz - az)
    ln = math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2)
    if ln < 1e-6:
        return
    u = (d[0] / ln, d[1] / ln, d[2] / ln)
    # 构造正交基
    ref = (0.0, 0.0, 1.0) if abs(u[2]) < 0.9 else (1.0, 0.0, 0.0)
    e1 = (u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2],
          u[0] * ref[1] - u[1] * ref[0])
    l1 = math.sqrt(sum(v * v for v in e1)) or 1.0
    e1 = tuple(v / l1 for v in e1)
    e2 = (u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2],
          u[0] * e1[1] - u[1] * e1[0])
    segs = 4
    lo, hi = [], []
    for k in range(segs):
        a2 = 2 * math.pi * k / segs
        ox = r * (math.cos(a2) * e1[0] + math.sin(a2) * e2[0])
        oy = r * (math.cos(a2) * e1[1] + math.sin(a2) * e2[1])
        oz = r * (math.cos(a2) * e1[2] + math.sin(a2) * e2[2])
        lo.append((ax + ox, ay + oy, az + oz))
        hi.append((bx + ox, by + oy, bz + oz))
    mb.add_prism(lo, hi, mi, mi)


def build_rigging():
    mb = MB("TI_Rigging")
    r = RIGGING["wireR"]
    zspan = RIGGING["spanZ"]
    m_by_key = {m["key"]: m for m in MASTS}

    def top_of(key, fr=1.0):
        m = m_by_key[key]
        zb = deck_top_at(t_of(m["x"])) - 1.2
        h = m["zTop"] - zb
        rake = math.radians(m["rakeDeg"])
        return (m["x"] - math.tan(rake) * h * fr, 0.0, zb + h * fr)

    # 主桅 — 前桅 横拉线（参考图上最长的一根）
    a = top_of("Main")
    b = top_of("Fore")
    add_wire(mb, (a[0], 0.0, zspan), (b[0], 0.0, zspan), r, MI["rigging"])
    add_wire(mb, (a[0], 0.0, a[2] - 0.6), (a[0], 0.0, zspan), r, MI["rigging"])
    add_wire(mb, (b[0], 0.0, b[2] - 0.6), (b[0], 0.0, zspan), r, MI["rigging"])

    for (key, px, py, pz) in RIGGING["stays"]:
        add_wire(mb, top_of(key), (px, py, pz), r, MI["rigging"])

    # 两根斜拉索：桅顶到相邻烟囱顶部（参考图上的斜线）
    for key, fx in (("Main", -51.5), ("Fore", 54.6)):
        add_wire(mb, top_of(key), (fx - 3.0, 0.0, SHIP["funnelTop"] - 2.0),
                 r, MI["rigging"])
    mb.build()


def build_flags():
    mb = MB("TI_Flags")
    # 前桅顶：美国旗（红白条纹 + 蓝角）
    m = [x for x in MASTS if x["key"] == "Fore"][0]
    rake = math.radians(m["rakeDeg"])
    h = m["zTop"] - (deck_top_at(t_of(m["x"])) - 1.2)
    fx = m["x"] - math.tan(rake) * h
    fz = m["zTop"] + 2.6
    w, hgt = 7.4, 4.8
    stripes = 7
    x0 = fx + 0.1
    for s in range(stripes):
        z0 = fz - hgt / 2 + hgt * s / stripes
        z1 = fz - hgt / 2 + hgt * (s + 1) / stripes
        mi = MI["flagRed"] if s % 2 == 0 else MI["white"]
        mb.add_quad((x0, 0.0, z0), (x0 + w, 0.0, z0),
                    (x0 + w, 0.0, z1), (x0, 0.0, z1), mi)
        mb.add_quad((x0, -0.12, z1), (x0 + w, -0.12, z1),
                    (x0 + w, -0.12, z0), (x0, -0.12, z0), mi)
    mb.add_box((x0 + w * 0.28, -0.06, fz + hgt * 0.28),
               (w * 0.56, 0.16, hgt * 0.44), MI["flagBlue"])

    # 艉旗杆：蓝旗
    zt = deck_z(STERNG["flagT"]) + 1.4
    mb.add_box((x_of(STERNG["flagT"]) - 0.6, 0.0, zt + 5.5),
               (0.5, 0.5, 11.0), MI["mast"])
    for d in (0.0, -0.14):
        mb.add_quad((-0.6 + x_of(STERNG["flagT"]) - 9.0, d, zt + 10.6),
                    (-0.6 + x_of(STERNG["flagT"]) - 0.2, d, zt + 10.6),
                    (-0.6 + x_of(STERNG["flagT"]) - 0.2, d, zt + 6.4),
                    (-0.6 + x_of(STERNG["flagT"]) - 9.0, d, zt + 6.4),
                    MI["flagBlue"])
    mb.build()


# ────────────────────────────────────────────────────────────
# 八、救生艇与吊艇架
# ────────────────────────────────────────────────────────────

def build_lifeboats():
    mb = MB("TI_Lifeboats")
    dv = MB("TI_Davits")
    z0 = LIFTS["z"]
    ln, wd, hg = LIFTS["len"], LIFTS["wid"], LIFTS["hgt"]
    for x in LIFTS["xs"]:
        for side in (1, -1):
            y = side * LIFTS["y"]
            # 艇体
            mb.add_box((x, y, z0 + hg / 2.0), (ln * 0.86, wd * 0.66, hg * 0.8),
                       MI["boat"])
            mb.add_box((x + ln * 0.46, y, z0 + hg * 0.62),
                       (ln * 0.16, wd * 0.42, hg * 0.55), MI["boat"])
            mb.add_box((x - ln * 0.46, y, z0 + hg * 0.62),
                       (ln * 0.16, wd * 0.42, hg * 0.55), MI["boat"])
            # 艇缘
            for sy in (1, -1):
                mb.add_box((x, y + sy * wd * 0.34, z0 + hg * 0.94),
                           (ln, wd * 0.14, hg * 0.16), MI["white"])
            mb.add_box((x, y, z0 + hg * 0.28), (ln, wd * 0.70, hg * 0.10),
                       MI["wood"])
            # 吊艇架：立杆 + 挑臂
            for sx in (1, -1):
                xx = x + sx * ln * 0.30
                dv.add_box((xx, y + side * wd * 0.55, z0 + LIFTS["davitH"] / 2.0),
                           (LIFTS["davitR"], LIFTS["davitR"], LIFTS["davitH"]),
                           MI["white"])
                dv.add_box((xx, y + side * (wd * 0.55 - 1.5), z0 + LIFTS["davitH"]),
                           (LIFTS["davitR"], 3.4, LIFTS["davitR"]), MI["white"])
    mb.build()
    dv.build()


# ────────────────────────────────────────────────────────────
# 九、艏艉属具
# ────────────────────────────────────────────────────────────

def build_bow_gear():
    mb = MB("TI_Bow_Gear")
    t = BOWG["anchorT"]
    zk, zd = keel_z(t), deck_z(t)
    w = hull_half(t) * sect_frac((BOWG["anchorZ"] - zk) / (zd - zk),
                                 cv("vb", t), cv("psect", t))
    for side in (1, -1):
        mb.add_box((x_of(t), side * (w - 0.2), BOWG["anchorZ"]),
                   (1.6, 1.0, BOWG["anchorLen"]), MI["steel"])
        mb.add_box((x_of(t) - 1.6, side * (w - 0.2), BOWG["anchorZ"] - 2.0),
                   (3.4, 0.9, 1.1), MI["steel"])
    mb.build()

    # 起锚机 / 绞盘 / 防浪板
    wl = MB("TI_Bow_Windlass")
    for tt, ln in ((BOWG["windlassT"], 6.0), (0.940, 3.6)):
        zb = deck_z(tt)
        ww = hull_half(tt) * 0.75
        wl.add_box((x_of(tt), 0.0, zb + 1.5), (ln, ww * 1.5, 3.0), MI["steel"])
        wl.add_box((x_of(tt), 0.0, zb + 3.2), (ln * 0.4, ww * 1.7, 0.8),
                   MI["steel"])
    # 防浪板：艏楼上的弧形挡墙
    tt = BOWG["breakwaterT"]
    zb = deck_z(tt)
    for i in range(9):
        f = i / 8.0
        y = (-1.0 + 2.0 * f) * hull_half(tt) * 0.80
        wl.add_box((x_of(tt), y, zb + 1.6), (0.7, 0.5, 3.2), MI["white"])
    wl.build()

    # 锚吊车（参考图艏部的白色 L 形吊臂）
    cr = MB("TI_Bow_Crane")
    tt = BOWG["craneT"]
    zb = deck_z(tt)
    h = BOWG["craneH"]
    for side in (1, -1):
        y = side * hull_half(tt) * 0.62
        cr.add_box((x_of(tt), y, zb + h / 2.0), (1.5, 1.5, h), MI["white"])
        cr.add_box((x_of(tt) - 4.5, y, zb + h - 0.8), (9.5, 1.5, 1.5),
                   MI["white"])
        cr.add_box((x_of(tt) - 8.4, y, zb + h - 5.0), (1.1, 1.1, 8.0),
                   MI["white"])
    # 桅式信号杆
    cr.add_box((x_of(0.988), 0.0, deck_z(0.988) + 5.0), (0.9, 0.9, 10.0),
               MI["mast"])
    cr.build()


def build_bow_name():
    """艏部两舷的船名 «TITANIC»（参考图里写在黑色舷侧上）。"""
    t, z = 0.905, 10.10
    zk, zd = keel_z(t), deck_z(t)
    u = (z - zk) / (zd - zk)
    w = hull_half(t) * sect_frac(u, cv("vb", t), cv("psect", t))
    try:
        bpy.ops.object.text_add(location=(0.0, 0.0, 0.0))
        txt = bpy.context.object
        txt.data.body = "TITANIC"
        txt.data.size = 3.3
        txt.data.extrude = 0.16
        txt.data.align_x = "CENTER"
        txt.data.align_y = "CENTER"
        bpy.ops.object.convert(target="MESH")
        ob = bpy.context.object
        ob.name = "TI_Hull_Name"
        ob.data.materials.clear()
        ob.data.materials.append(MATERIALS["gold"])
        for side in (1, -1):
            dup = ob.copy()
            dup.data = ob.data.copy()
            bpy.context.collection.objects.link(dup)
            dup.location = (x_of(t), side * (w + 0.12), z)
            dup.rotation_euler = (math.radians(90.0 * side), 0.0, 0.0)
        bpy.data.objects.remove(ob, do_unlink=True)
        return True
    except Exception as exc:      # noqa: BLE001
        print("BOW_NAME_SKIPPED %s" % exc)
        return False


def build_stern_gear():
    mb = MB("TI_Stern_Gear")
    # 舵
    t = STERNG["rudderT"]
    zk, zd = keel_z(t), deck_z(t)
    mb.add_box((x_of(t) - 3.6, 0.0, (zk + zd) * 0.18),
               (7.6, 1.1, 13.0), MI["steel"])
    mb.add_box((x_of(t) - 3.4, 0.0, 2.0), (8.4, 0.8, 12.0), MI["steel"])
    # 三轴螺旋桨
    tb = STERNG["propT"]
    zb = keel_z(tb) + 3.0
    for y, rr, blades in ((0.0, 3.6, 4), (5.0, 3.1, 3), (-5.0, 3.1, 3)):
        xc = x_of(tb) - 2.0
        mb.add_box((xc + 2.4, y, zb), (5.0, 1.0, 1.0), MI["steel"])
        for k in range(blades):
            a = 2 * math.pi * k / blades + (0.4 if y == 0.0 else 0.0)
            mb.add_box_rot((xc, y + rr * 0.52 * math.cos(a),
                            zb + rr * 0.52 * math.sin(a)),
                           (0.5, rr * 0.95, 0.9), a, MI["steel"])
    mb.build()

    # 艉部吊臂
    cr = MB("TI_Stern_Crane")
    tt = STERNG["craneT"]
    zb = deck_z(tt)
    for side in (1, -1):
        y = side * hull_half(tt) * 0.60
        cr.add_box((x_of(tt), y, zb + 3.6), (1.5, 1.5, 7.2), MI["white"])
        cr.add_box((x_of(tt) - 4.2, y, zb + 6.4), (9.0, 1.5, 1.5), MI["white"])
        cr.add_box((x_of(tt) - 7.8, y, zb + 2.6), (1.1, 1.1, 7.0), MI["white"])
    cr.build()


# ────────────────────────────────────────────────────────────
# 十、展示底座与铭牌
# ────────────────────────────────────────────────────────────

def build_stand():
    """木托展示架：一列垫木 + 两条纵向托木 + 底板，照参考图。"""
    mb = MB("TI_Stand")
    st = STAND
    for x in st["xs"]:
        t = t_of(x)
        zk = keel_z(t) if 0.0 <= t <= 1.0 else SHIP["keelBottom"]
        top = zk - 0.35
        h = top - st["topZ"]
        if h <= 0.8:
            continue
        # 立柱 + 外扩的底座脚，照参考图的垫木形制
        mb.add_box((x, 0.0, (top + st["topZ"] + 2.6) / 2.0),
                   (st["blockW"], BEAM * 0.34, h - 2.6), MI["wood"])
        mb.add_box((x, 0.0, st["topZ"] + 1.3),
                   (st["blockW"] * 1.75, BEAM * 0.52, 2.6), MI["wood"])
    mb.build()


def build_nameplate():
    """铭牌：木托 + 金底板 + TITANIC 立体字，置于船侧（照参考图）。

    字体不可用时退化为素底板，不阻断建模。
    """
    plate = MB("TI_Nameplate")
    xb, yb = STAND["plateX"], -6.0
    plate.add_box((xb, yb, STAND["baseZ"] + 1.2), (68.0, 14.0, 2.4),
                  MI["wood"])
    plate.add_box((xb, yb, STAND["baseZ"] + 2.6), (62.0, 11.0, 0.6),
                  MI["gold"])
    plate.build()
    try:
        bpy.ops.object.text_add(location=(0.0, 0.0, 0.0))
        txt = bpy.context.object
        txt.name = "TI_Nameplate_Text"
        txt.data.body = "TITANIC"
        txt.data.size = 9.5
        txt.data.extrude = 0.32
        txt.data.align_x = "CENTER"
        txt.data.align_y = "CENTER"
        bpy.ops.object.convert(target="MESH")
        ob = bpy.context.object
        ob.name = "TI_Nameplate_Text"
        ob.location = (xb, yb, STAND["baseZ"] + 3.0)
        ob.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        ob.data.materials.clear()
        ob.data.materials.append(MATERIALS["gold"])
        return True
    except Exception as exc:      # noqa: BLE001
        print("NAMEPLATE_TEXT_SKIPPED %s" % exc)
        return False


# ────────────────────────────────────────────────────────────
# 十一、场景灯光（仅为视口/渲染可见，不参与几何）
# ────────────────────────────────────────────────────────────

def setup_scene():
    scn = bpy.context.scene
    world = bpy.data.worlds.new("TI_World")
    scn.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.055, 0.062, 0.075, 1.0)
        bg.inputs[1].default_value = 1.4

    def add_light(name, kind, loc, energy, size=120.0, rot=(0, 0, 0)):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        if kind == "AREA":
            data.size = size
        if kind == "SUN":
            data.angle = math.radians(4.0)
        ob = bpy.data.objects.new(name, data)
        ob.location = loc
        ob.rotation_euler = rot
        bpy.context.collection.objects.link(ob)
        return ob

    add_light("TI_Key", "SUN", (200, -260, 320), 3.2,
              rot=(math.radians(52), 0, math.radians(38)))
    add_light("TI_Fill", "AREA", (-300, 240, 180), 1400000.0, 320.0,
              rot=(math.radians(66), 0, math.radians(-128)))
    add_light("TI_Rim", "AREA", (60, 320, 90), 800000.0, 260.0,
              rot=(math.radians(78), 0, math.radians(170)))

    cam_data = bpy.data.cameras.new("TI_Camera")
    cam_data.lens = 85.0
    cam = bpy.data.objects.new("TI_Camera", cam_data)
    cam.location = (30.0, -520.0, 120.0)
    cam.rotation_euler = (math.radians(80.0), 0.0, math.radians(4.0))
    bpy.context.collection.objects.link(cam)
    scn.camera = cam
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scn.render.engine = eng
            break
        except TypeError:
            continue
    scn.render.resolution_x = 1600
    scn.render.resolution_y = 900
    return cam


# ────────────────────────────────────────────────────────────
# 十二、总装
# ────────────────────────────────────────────────────────────

def build_all():
    reset_scene()
    build_materials()
    build_hull_shell()
    build_keel()
    build_deck()
    build_bulwark()
    build_shell_doors()
    build_plating()
    build_portholes()
    build_house()
    build_windows()
    build_boat_deck()
    build_rails()
    build_funnels()
    build_masts()
    build_rigging()
    build_lifeboats()
    build_bow_gear()
    build_stern_gear()
    build_bow_name()
    build_flags()
    build_stand()
    plate = build_nameplate()
    setup_scene()

    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = 0
    for o in objs:
        for poly in o.data.polygons:
            tris += max(1, len(poly.vertices) - 2)
    return {
        "objects": len(objs),
        "tris": tris,
        "funnels": len([o for o in objs if o.name.startswith("TI_Funnel_")]),
        "masts": len([o for o in objs if o.name.startswith("TI_Mast_")]),
        "lifeboats": 2 * len(LIFTS["xs"]),
        "nameplate": plate,
        "bbox": [round(v, 2) for v in (
            min(o.dimensions.x for o in objs),
            max(o.dimensions.x for o in objs),
        )],
        "dims": [round(LOA, 2), round(BEAM, 2),
                 round(SHIP["mastTop"] if "mastTop" in SHIP else max(
                     m["zTop"] for m in MASTS), 2)],
    }


if __name__ == "__main__":
    print("BUILD_OK " + json.dumps(build_all(), ensure_ascii=False))
