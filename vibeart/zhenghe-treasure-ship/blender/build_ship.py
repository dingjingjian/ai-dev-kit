"""
郑和宝船 — 参数化建模（Blender Python）

前置：先跑 `node blender/export_params.js` 生成 blender/out/params.json。
      本脚本只读 JSON，不解析 JS 源码（v1 的正则解析踩过三种数字形态的坑）。

设计约束：
1. 尺寸全部来自 assets/ship-params.js（经 JSON 传来），本文件不另写数字。
2. 部件按 ZH_<组>_<细分> 命名，供 HTML 端拆解模式按前缀取件。
3. 不使用贴图，只用纯色材质 —— 贴图是体积杀手。
4. 船体双色（深赭舷侧 / 米白船底）用逐面材质索引实现，不拆两个 Object。

与 v1 的实质改动（照参考图重做）：
  - 型深 2.80 → 6.60，船体不再「像驳船」
  - 横剖面改为 V 形尖底 + 舭部转折的福船线型
  - 新增水线双色、舷孔阵列、舷墙、栏杆、随船小艇
  - 篷帆由近方形改为高窄形（v1 最大的观感失误）
  - 桅与帆同体生成并带后倾
"""

import json
import math
import os

import bpy

# ────────────────────────────────────────────────────────────
# 一、参数
# ────────────────────────────────────────────────────────────

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "out")
PARAMS = os.path.join(OUTDIR, "params.json")


def load_params():
    if not os.path.isfile(PARAMS):
        raise RuntimeError(
            "未找到 %s\n请先在项目根目录跑：node blender/export_params.js" % PARAMS)
    with open(PARAMS, encoding="utf-8") as f:
        return json.load(f)


P = load_params()
SHIP = P["ship"]
RIG = P["rig"]
MASTS = P["masts"]
CASTLES = P["castles"]
GEAR = P["gear"]
TBL = P["tables"]

L = SHIP["length"]
B = SHIP["beam"]
HALF_B = B / 2.0
DEPTH = SHIP["hullDepth"]
DRAFT = SHIP["draft"]
FREEBOARD = SHIP["freeboard"]
WATERLINE = DRAFT


def tbl(arr, x):
    """采样表线性插值（表已足够密，线性即可）。"""
    n = len(arr)
    if x <= 0:
        return arr[0]
    if x >= 1:
        return arr[n - 1]
    f = x * (n - 1)
    i = int(f)
    g = f - i
    return arr[i] * (1.0 - g) + arr[i + 1] * g


def x_of_t(t):
    """船长比例 t（0 = 尾，1 = 首）→ 世界 X（船中为 0，首为 +）。"""
    return (t - 0.5) * L


def half_width(t):
    return HALF_B * tbl(TBL["g"], t)


def keel_z(t):
    return tbl(TBL["keel"], t)


def deck_z(t):
    """甲板高度 = 型深 + 舷弧抬升。"""
    return DEPTH + tbl(TBL["sheer"], t)


def hull_pt(t, u, side):
    """船体表面点：t 沿船长，u 自龙骨底(0)到舷顶(1)。"""
    zk, zd = keel_z(t), deck_z(t)
    z = zk + u * (zd - zk)
    w = half_width(t) * tbl(TBL["prof"], u)
    return (x_of_t(t), side * w, z)


# 船体最低点（龙骨木下缘）。大舵以此为基准向下延伸 —— 首尾有龙骨弧线，
# 若拿局部 keel_z 当基准，舵会悬在半空（实测踩过）。
KEEL_WOOD_HALF = 0.17
KEEL_MIN_Z = min(keel_z(i / 200.0) for i in range(201)) - KEEL_WOOD_HALF * 2.0


# ────────────────────────────────────────────────────────────
# 二、几何累加器
# ────────────────────────────────────────────────────────────

class MB(object):
    """把一个部件的多个体块合成单个 Object，支持逐面材质索引。"""

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
        cx, cy, cz = center
        sx, sy, sz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
        v = [
            (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
            (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
            (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
        ]
        b0 = len(self.verts)
        self.verts.extend(v)
        for q in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                  (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            self.faces.append((b0 + q[0], b0 + q[1], b0 + q[2], b0 + q[3]))
            self.mi.append(mi)

    def build(self, materials):
        if not self.verts:
            return None
        me = bpy.data.meshes.new(self.name + "_mesh")
        me.from_pydata(self.verts, [], self.faces)
        for m in materials:
            me.materials.append(m)
        me.validate(verbose=False)
        nmat = max(1, len(materials))
        for i, poly in enumerate(me.polygons):
            if i < len(self.mi):
                poly.material_index = min(self.mi[i], nmat - 1)
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        return ob


# ────────────────────────────────────────────────────────────
# 三、场景与材质
# ────────────────────────────────────────────────────────────

MATS = {}
MI_HULL, MI_LIGHT, MI_WALE = 0, 1, 2


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.unit_settings.system = "METRIC"
    scn.unit_settings.scale_length = 1.0


def mkmat(name, rgb, rough=0.72):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        if "Roughness" in b.inputs:
            b.inputs["Roughness"].default_value = rough
        if "Metallic" in b.inputs:
            b.inputs["Metallic"].default_value = 0.0
    return mat


def build_materials():
    # 照参考图取色：深赭舷侧 / 米白船底 / 米黄篷帆
    MATS["hull"] = mkmat("ZH_Mat_Hull", (0.400, 0.128, 0.090), 0.68)
    MATS["hull_light"] = mkmat("ZH_Mat_HullLight", (0.878, 0.820, 0.698), 0.75)
    MATS["wale"] = mkmat("ZH_Mat_Wale", (0.196, 0.071, 0.051), 0.66)
    MATS["deck"] = mkmat("ZH_Mat_Deck", (0.518, 0.388, 0.247), 0.80)
    MATS["mast"] = mkmat("ZH_Mat_Mast", (0.612, 0.463, 0.294), 0.78)
    MATS["sail"] = mkmat("ZH_Mat_Sail", (0.722, 0.565, 0.290), 0.90)
    MATS["batten"] = mkmat("ZH_Mat_Batten", (0.510, 0.376, 0.180), 0.84)
    MATS["porthole"] = mkmat("ZH_Mat_Porthole", (0.949, 0.925, 0.867), 0.60)
    MATS["struct"] = mkmat("ZH_Mat_Struct", (0.706, 0.624, 0.463), 0.76)
    MATS["roof"] = mkmat("ZH_Mat_Roof", (0.286, 0.129, 0.090), 0.70)
    MATS["gear"] = mkmat("ZH_Mat_Gear", (0.286, 0.243, 0.176), 0.55)


# ────────────────────────────────────────────────────────────
# 四、船体
# ────────────────────────────────────────────────────────────

N_T = 96        # 纵向站数
N_U = 14        # 半剖分点数


def face_mi(t, u):
    """按 (t, u) 判定面材质：顶缘材 / 深赭舷侧 / 水线缘材 / 米白船底。"""
    if u > 0.945:
        return MI_WALE
    zk, zd = keel_z(t), deck_z(t)
    z = zk + u * (zd - zk)
    if z > WATERLINE + 0.30:
        return MI_HULL
    if z > WATERLINE - 0.17:
        return MI_WALE
    return MI_LIGHT


HULL_MATS = [None, None, None]      # 延迟到 build_materials 之后填充


def build_hull_shell():
    us = [j / float(N_U - 1) for j in range(N_U)]
    ts = [i / float(N_T - 1) for i in range(N_T)]

    mb = MB("ZH_Hull_Shell")
    for side in (1, -1):
        b0 = len(mb.verts)
        for t in ts:
            for u in us:
                mb.verts.append(hull_pt(t, u, side))
        for i in range(N_T - 1):
            for j in range(N_U - 1):
                a = b0 + i * N_U + j
                b = b0 + (i + 1) * N_U + j
                c = b0 + (i + 1) * N_U + j + 1
                d = b0 + i * N_U + j + 1
                mi = face_mi((ts[i] + ts[i + 1]) / 2.0, (us[j] + us[j + 1]) / 2.0)
                if side == 1:
                    mb.faces.append((a, b, c, d))
                else:
                    mb.faces.append((a, d, c, b))
                mb.mi.append(mi)
    mb.build(HULL_MATS)

    # 封尾（方尾）与封首（方首）—— 以剖面重心作三角扇。
    # 命名收在 ZH_Hull_Shell_* 之下，拆解分组按 'Hull_Shell' 前缀即可覆盖。
    for idx, nm in ((0, "ZH_Hull_Shell_SternCap"), (N_T - 1, "ZH_Hull_Shell_BowCap")):
        t = ts[idx]
        loop = [hull_pt(t, us[j], 1) for j in range(N_U)]
        loop += [hull_pt(t, us[j], -1) for j in range(N_U - 2, 0, -1)]
        cap = MB(nm)
        cx = sum(p[0] for p in loop) / len(loop)
        cz = sum(p[2] for p in loop) / len(loop)
        for j in range(len(loop)):
            cap.add_tri((cx, 0.0, cz), loop[j], loop[(j + 1) % len(loop)], MI_WALE)
        cap.build(HULL_MATS)


def build_deck():
    mb = MB("ZH_Deck_Main")
    n = 96
    for side in (1, -1):
        b0 = len(mb.verts)
        for i in range(n + 1):
            t = i / float(n)
            mb.verts.append((x_of_t(t), side * half_width(t) * 0.985, deck_z(t)))
        for i in range(n):
            a = b0 + i
            b = b0 + i + 1
            if side == 1:
                mb.faces.append((a, b, b + 1, a + 1))
            else:
                mb.faces.append((a, a + 1, b + 1, b))
            mb.mi.append(0)
    mb.build([MATS["deck"]])


def build_keel():
    """龙骨：沿艏艉上翘的方木。"""
    mb = MB("ZH_Hull_Keel")
    n = 48
    for i in range(n):
        tm = (i + 0.5) / float(n)
        zk = keel_z(tm)
        wf = 1.0 - 0.55 * (abs((tm - 0.5) * 2.0) ** 2.2)
        mb.add_box((x_of_t(tm), 0.0, zk - 0.17),
                   (L / n * 1.08, 0.86 * wf, 0.34), 0)
    mb.build([MATS["wale"]])


def build_stem_stern():
    for nm, t, dxx in (("ZH_Hull_Stem", 0.994, -0.10), ("ZH_Hull_Stern", 0.007, 0.12)):
        mb = MB(nm)
        zk, zd = keel_z(t), deck_z(t)
        mb.add_box((x_of_t(t) + dxx, 0.0, (zk + zd) / 2.0),
                   (0.64, half_width(t) * 1.04, zd - zk), 0)
        mb.build([MATS["wale"]])


def build_bulwark():
    """舷墙：甲板以上的连续墙板。"""
    mb = MB("ZH_Hull_Bulwark")
    n = 90
    h = SHIP["bulwarkHeight"]
    for side in (1, -1):
        b0 = len(mb.verts)
        for i in range(n + 1):
            t = i / float(n)
            w = half_width(t)
            mb.verts.append((x_of_t(t), side * w, deck_z(t) - 0.02))
            mb.verts.append((x_of_t(t), side * w, deck_z(t) + h))
        for i in range(n):
            a = b0 + i * 2
            if side == 1:
                mb.faces.append((a, a + 2, a + 3, a + 1))
            else:
                mb.faces.append((a, a + 1, a + 3, a + 2))
            mb.mi.append(0)
    mb.build([MATS["wale"]])


def build_rail():
    """栏杆：立柱 + 上下横杆，合并为单 Object。"""
    mb = MB("ZH_Hull_Rail")
    h = SHIP["railPostHeight"]
    ps = SHIP["railPostSize"]
    base = SHIP["bulwarkHeight"]
    t = 0.030
    while t <= 0.972:
        z = deck_z(t) + base + h / 2.0
        w = half_width(t)
        for side in (1, -1):
            mb.add_box((x_of_t(t), side * w, z), (ps, ps, h), 0)
        t += SHIP["railSpacing"]
    n = 90
    for side in (1, -1):
        for lvl in (0.0, 1.0):
            b0 = len(mb.verts)
            for i in range(n + 1):
                t = 0.030 + 0.942 * i / float(n)
                w = half_width(t)
                z = deck_z(t) + base + h * lvl
                mb.verts.append((x_of_t(t), side * (w - 0.02), z - 0.035))
                mb.verts.append((x_of_t(t), side * (w - 0.02), z + 0.035))
            for i in range(n):
                a = b0 + i * 2
                if side == 1:
                    mb.faces.append((a, a + 2, a + 3, a + 1))
                else:
                    mb.faces.append((a, a + 1, a + 3, a + 2))
                mb.mi.append(0)
    mb.build([MATS["struct"]])


def build_portholes():
    """舷孔阵列 —— 参考图的招牌特征，合并为单 Object。"""
    mb = MB("ZH_Hull_Portholes")
    rows = SHIP["portholeRows"]
    cols = SHIP["portholeCols"]
    size = SHIP["portholeSize"]
    t0, t1 = SHIP["portholeT0"], SHIP["portholeT1"]
    for r in range(rows):
        frac = SHIP["portholeRowZ"][r]
        target_z = WATERLINE + FREEBOARD * frac
        for c in range(cols):
            t = t0 + (t1 - t0) * c / float(cols - 1)
            zk, zd = keel_z(t), deck_z(t)
            u = (target_z - zk) / (zd - zk)
            if u <= 0.05 or u >= 0.94:
                continue
            w = half_width(t) * tbl(TBL["prof"], u)
            for side in (1, -1):
                mb.add_box((x_of_t(t), side * (w + size * 0.14), target_z),
                           (size, size * 0.5, size), 0)
    mb.build([MATS["porthole"]])


def build_bulkheads():
    """水密隔舱：横向舱壁，随船体线型收放。"""
    cnt = SHIP["bulkheadCount"]
    th = SHIP["bulkheadThickness"]
    for i in range(cnt):
        t = 0.052 + 0.896 * i / float(cnt - 1)
        zk, zd = keel_z(t), deck_z(t)
        z_bot = zk + (zd - zk) * 0.10
        z_top = zd - 0.05
        zs = [z_bot + (z_top - z_bot) * k / 4.0 for k in range(5)]
        pts = []
        for zz in zs:
            u = (zz - zk) / (zd - zk)
            pts.append((half_width(t) * tbl(TBL["prof"], u) * 0.965, zz))
        mb = MB("ZH_Bulkhead_%02d" % (i + 1))
        for k in range(len(pts) - 1):
            y0, z0 = pts[k]
            y1, z1 = pts[k + 1]
            for side in (1, -1):
                a = (x_of_t(t) - th / 2, side * y0, z0)
                b = (x_of_t(t) + th / 2, side * y0, z0)
                c = (x_of_t(t) + th / 2, side * y1, z1)
                d = (x_of_t(t) - th / 2, side * y1, z1)
                if side == 1:
                    mb.add_quad(a, b, c, d, 0)
                else:
                    mb.add_quad(b, a, d, c, 0)
        mb.build([MATS["deck"]])


# ────────────────────────────────────────────────────────────
# 五、上层建筑
# ────────────────────────────────────────────────────────────

def build_castles():
    for c in CASTLES:
        t0, t1, h = c["t0"], c["t1"], c["height"]
        x0, x1 = x_of_t(t0), x_of_t(t1)
        cx, ln = (x0 + x1) / 2.0, abs(x1 - x0)
        w = min(half_width(t0), half_width(t1)) * c.get("widthK", 0.90)
        z0 = deck_z((t0 + t1) / 2.0)
        nm = "ZH_Castle_" + c["key"].split("_", 1)[1].capitalize()

        # 台座
        mb = MB(nm)
        mb.add_box((cx, 0.0, z0 + h / 2.0), (ln, w * 2.0, h), 0)
        mb.build([MATS["struct"]])

        # 台座栏杆（沿外缘一圈）
        mbr = MB(nm + "_Rail")
        hh = SHIP["railPostHeight"] * 0.72
        n = max(4, int(ln / 1.1))
        for i in range(n + 1):
            x = x0 + ln * i / float(n)
            for side in (1, -1):
                mbr.add_box((x, side * w, z0 + h + hh / 2.0), (0.07, 0.07, hh), 0)
        for side in (1, -1):
            mbr.add_box((x1, side * w * 0.5, z0 + h + hh / 2.0), (0.07, w, hh), 0)
            mbr.add_box((x0, side * w * 0.5, z0 + h + hh / 2.0), (0.07, w, hh), 0)
        mbr.build([MATS["struct"]])

        if not c.get("cabin"):
            continue

        # 逐层收进的台阶
        z_cur = z0 + h
        w_cur = w
        tiers = c.get("tiers") or []
        for k, tr in enumerate(tiers):
            ta0, ta1, th = tr["t0"], tr["t1"], tr["h"]
            tx0, tx1 = x_of_t(ta0), x_of_t(ta1)
            tcx, tln = (tx0 + tx1) / 2.0, abs(tx1 - tx0)
            tw = w_cur * 0.74
            mt = MB(nm + "_Tier%d" % (k + 1))
            mt.add_box((tcx, 0.0, z_cur + th / 2.0), (tln, tw * 2.0, th), 0)
            mt.build([MATS["struct"]])
            # 该层披檐（收进比例小于层身，避免飘板观感）
            mr = MB(nm + "_Tier%d_Roof" % (k + 1))
            mr.add_box((tcx, 0.0, z_cur + th + 0.05),
                       (tln * 1.04, tw * 2.0 * 1.05, 0.10), 0)
            mr.build([MATS["roof"]])
            z_cur += th + 0.10
            w_cur = tw

        # 顶舱
        cw = w_cur * 0.80
        cl = ln * 0.40
        mc = MB(nm + "_Cabin")
        mc.add_box((cx, 0.0, z_cur + c["height"] * 0.42),
                   (cl, cw * 2.0, c["height"] * 0.84), 0)
        mc.build([MATS["struct"]])
        mr = MB(nm + "_CabinRoof")
        mr.add_box((cx, 0.0, z_cur + c["height"] * 0.90),
                   (cl * 1.14, cw * 2.0 * 1.20, 0.14), 0)
        mr.build([MATS["roof"]])


# ────────────────────────────────────────────────────────────
# 六、桅帆
# ────────────────────────────────────────────────────────────

def mast_deck_base(t):
    """桅基高度 = 甲板面。

    刻意**不**因桅落在上层建筑内而抬到楼面：桅是自甲板一通到顶的整根木料，
    楼阁是「套」在桅外面的（真实船也如此）。早先按楼面抬基，
    结果是中舱那根桅被抬高 1.3 单位，把「主桅最高」的桅高弧线抹平了。
    """
    return deck_z(t)


def add_cambered_slab(mb, xc0, xc1, hw0, hw1, z0, z1, camber, th, mi, ny=6):
    """带兜风弧度的薄板 —— 帆面与横撑条共用。

    平板帆在 3D 里一眼就假（v1 就是平板）。这里沿帆宽做抛物线弧，
    厚度方向成对生成，四周封边，得到闭合薄壳。

    xc0 / xc1 分别是下缘与上缘的 X 中心 —— 帆必须跟着桅一起后倾，
    否则帆是竖直的而桅是斜的，横撑条还会顺着斜桅漂出帆面（实测踩过）。
    """
    rows = ((0.0, z0, xc0), (1.0, z1, xc1))
    key = {}

    def vid(k, p):
        i = len(mb.verts)
        mb.verts.append(p)
        key[k] = i

    for r, (fz, z, xc) in enumerate(rows):
        hw = hw0 + (hw1 - hw0) * fz
        for i in range(ny + 1):
            vy = -1.0 + 2.0 * i / float(ny)
            y = vy * hw
            x = xc + camber * (1.0 - vy * vy)
            vid(("f", r, i), (x + th / 2.0, y, z))
            vid(("b", r, i), (x - th / 2.0, y, z))

    def q(a, b, c, d):
        mb.faces.append((key[a], key[b], key[c], key[d]))
        mb.mi.append(mi)

    for i in range(ny):
        q(("f", 0, i), ("f", 0, i + 1), ("f", 1, i + 1), ("f", 1, i))      # 正面
        q(("b", 1, i), ("b", 1, i + 1), ("b", 0, i + 1), ("b", 0, i))      # 背面
        q(("b", 0, i), ("f", 0, i), ("f", 0, i + 1), ("b", 0, i + 1))      # 下缘
        q(("f", 1, i), ("b", 1, i), ("b", 1, i + 1), ("f", 1, i + 1))      # 上缘
    q(("b", 0, 0), ("b", 1, 0), ("f", 1, 0), ("f", 0, 0))                  # 左侧封边
    q(("f", 0, ny), ("f", 1, ny), ("b", 1, ny), ("b", 0, ny))              # 右侧封边


def build_masts_and_sails():
    r0 = B * RIG["mastRadiusPerBeam"]
    taper = RIG["mastTaper"]
    rake = RIG["mastRake"]
    sail_idx = 0

    for mi, m in enumerate(MASTS):
        t = m["t"]
        x = x_of_t(t)
        z_base = mast_deck_base(t)
        H = m["h"] * DEPTH * RIG["mastHeightPerDepth"]
        dx = -rake * H                     # 后倾：顶部向尾偏移

        # 桅身：锥形八棱柱
        mm = MB("ZH_" + m["key"].replace("mast", "Mast"))
        segs, circ = 6, 8
        rings = []
        for i in range(segs + 1):
            f = i / float(segs)
            rr = r0 * (1.0 - taper * f)
            ox = dx * f
            z = z_base + H * f
            rings.append([(x + ox + rr * math.cos(2 * math.pi * k / circ),
                           rr * math.sin(2 * math.pi * k / circ), z)
                          for k in range(circ)])
        b0 = len(mm.verts)
        for ring in rings:
            mm.verts.extend(ring)
        for i in range(segs):
            for k in range(circ):
                k2 = (k + 1) % circ
                mm.faces.append((b0 + i * circ + k, b0 + i * circ + k2,
                                 b0 + (i + 1) * circ + k2, b0 + (i + 1) * circ + k))
                mm.mi.append(0)
        # 桅顶小旗
        fx, fz = x + dx, z_base + H
        mm.add_tri((fx, 0.0, fz + 0.55), (fx - 0.10, 0.0, fz + 0.95),
                   (fx, 0.86, fz + 0.72), 0)
        mm.build([MATS["mast"]])

        # 篷帆
        for (u0, u1) in P["derived"]["sailSpansForMast"][mi]:
            z0 = z_base + H * u0
            z1 = z_base + H * u1
            sail_h = z1 - z0
            half_w = sail_h * RIG["sailAspect"] * 0.5
            half_w_top = half_w * RIG["sailTaper"]
            ox0, ox1 = dx * u0, dx * u1
            th = RIG["sailThick"]
            camber = half_w * 2.0 * RIG["sailCamber"]

            sail_idx += 1
            nm = "ZH_Sail_%02d" % sail_idx
            ms = MB(nm)
            # 帆面：下缘中心 ox0 → 上缘中心 ox1，随桅后倾
            add_cambered_slab(ms, x + ox0, x + ox1, half_w, half_w_top, z0, z1,
                              camber, th, 0, ny=6)

            # 横撑条：同弧度、收在帆宽之内（v1 撑条外凸成「围栏」，此处修正）
            nb = RIG["sailBattens"]
            for b in range(nb):
                fb = (b + 1) / float(nb + 1)
                hw = half_w + (half_w_top - half_w) * fb
                zb = z0 + sail_h * fb
                bh = sail_h * 0.055
                xb = x + ox0 + (ox1 - ox0) * fb
                add_cambered_slab(ms, xb, xb, hw * 0.985, hw * 0.985,
                                  zb - bh / 2, zb + bh / 2, camber, th * 3.0, 1, ny=6)
            ms.build([MATS["sail"], MATS["batten"]])


# ────────────────────────────────────────────────────────────
# 七、属具
# ────────────────────────────────────────────────────────────

def build_deck_fittings():
    """甲板属件：舱口盖与货物。

    参考图的甲板是「满」的，空甲板会让整船读成模型白模。
    """
    # 舱口盖：沿中线布置的矮方台，带围框
    mbh = MB("ZH_Deck_Hatches")
    for t, ln, wd in ((0.300, 4.4, 3.0), (0.395, 3.4, 2.6),
                      (0.680, 3.6, 2.8), (0.775, 3.0, 2.4)):
        z = deck_z(t)
        mbh.add_box((x_of_t(t), 0.0, z + 0.16), (ln, wd, 0.32), 0)
        mbh.add_box((x_of_t(t), 0.0, z + 0.34), (ln * 1.06, wd * 1.08, 0.06), 1)
    mbh.build([MATS["deck"], MATS["wale"]])

    # 货物：沿两舷错落堆放的箱笼
    mbc = MB("ZH_Deck_Crates")
    crates = [
        (0.255, 0.62, 1.5, 1.3, 1.1), (0.268, 0.60, 1.1, 1.0, 1.6),
        (0.340, -0.66, 1.7, 1.4, 1.0), (0.352, -0.62, 1.2, 1.1, 1.5),
        (0.715, 0.64, 1.3, 1.2, 1.0), (0.728, 0.60, 1.0, 1.0, 1.4),
        (0.795, -0.60, 1.4, 1.2, 1.1),
    ]
    for t, wy, ln, wd, hh in crates:
        w = half_width(t) * wy
        mbc.add_box((x_of_t(t), w, deck_z(t) + hh / 2.0), (ln, wd, hh), 0)
    mbc.build([MATS["struct"]])


def build_gear():
    # 大舵：福船特征，舵底低于船体最低点。
    # 基准必须用全局 KEEL_MIN_Z 而非局部 keel_z —— 首尾有龙骨弧线，
    # 用局部位会把舵吊在半空（实测 z_bot=0.80 而龙骨在 -0.34）。
    g = GEAR["rudder"]
    t = 0.018
    chord = L * g["chord"]
    z_top = deck_z(t) * g["topK"]
    z_bot = KEEL_MIN_Z - g["belowKeel"] * DRAFT
    # 舵挂在尾柱上：前缘越过尾柱 postBite 比例，其余向后伸出。
    # 早先按「弦长全部后置」摆，舵整体漂在船体之外、顶部与船底脱开，
    # 渲染出来是一块悬空的白板（实测踩过）。
    post_x = x_of_t(0.007)
    x0 = post_x - chord * (1.0 - g["postBite"])
    x1 = post_x + chord * g["postBite"]
    mb = MB("ZH_Rudder")
    mb.add_box(((x0 + x1) / 2.0, 0.0, (z_top + z_bot) / 2.0),
               (x1 - x0, g["thick"] * 2.6, z_top - z_bot), 0)
    mb.build([MATS["hull_light"]])

    # 舵杆：露出水面的深色竖杆，把舵与艉部连成一体。
    # 少了它，舵就是一整块浅色板贴在船尾，眼睛读不出「装在尾柱上」。
    mb = MB("ZH_Rudder_Stock")
    zs_top = deck_z(t) * 0.92
    zs_bot = z_bot * 0.35
    mb.add_box((post_x - chord * 0.10, 0.0, (zs_top + zs_bot) / 2.0),
               (chord * 0.30, g["thick"] * 3.4, zs_top - zs_bot), 0)
    mb.build([MATS["wale"]])

    mb = MB("ZH_Rudder_Tiller")
    mb.add_box((x_of_t(t) + chord * 0.30, 0.0, z_top - 0.30),
               (chord * 0.72, 0.30, 0.22), 0)
    mb.build([MATS["gear"]])

    # 铁锚 ×2
    a = GEAR["anchor"]
    for i, side in enumerate((1, -1)):
        ta = 0.795
        w = half_width(ta)
        mb = MB("ZH_Anchor_%02d" % (i + 1))
        mb.add_box((x_of_t(ta), side * (w + 0.30), deck_z(ta) + a["length"] * 0.42),
                   (a["length"] * 0.26, a["length"] * 0.16, a["length"]), 0)
        mb.add_box((x_of_t(ta), side * (w + 0.30), deck_z(ta) - 0.10),
                   (a["length"] * 0.62, a["length"] * 0.16, a["length"] * 0.18), 0)
        mb.build([MATS["gear"]])

    # 绞盘
    wl = GEAR["windlass"]
    tw = 0.875
    mb = MB("ZH_Windlass")
    mb.add_box((x_of_t(tw), 0.0, deck_z(tw) + wl["radius"] * 0.9),
               (wl["width"] * 0.28, wl["width"], wl["radius"] * 1.8), 0)
    mb.build([MATS["gear"]])

    # 船首饰
    tf = 0.985
    mb = MB("ZH_Figurehead")
    mb.add_box((x_of_t(tf) - 0.05, 0.0, deck_z(tf) - 0.55),
               (0.55, half_width(tf) * 0.55, 1.25), 0)
    mb.build([MATS["gear"]])

    # 随船小艇（平置甲板）
    bt = GEAR["boat"]
    tb = bt["t"]
    z = deck_z(tb) + SHIP["bulwarkHeight"] + 0.30
    ln = bt["length"]
    mb = MB("ZH_Boat")
    mb.add_box((x_of_t(tb), 0.0, z), (ln, ln * 0.34, 0.22), 0)
    for side in (1, -1):
        mb.add_box((x_of_t(tb), side * ln * 0.17, z + 0.22), (ln, 0.10, 0.34), 1)
    mb.add_box((x_of_t(tb) + ln * 0.52, 0.0, z + 0.10), (ln * 0.22, ln * 0.18, 0.20), 1)
    mb.add_box((x_of_t(tb) - ln * 0.52, 0.0, z + 0.10), (ln * 0.22, ln * 0.18, 0.20), 1)
    mb.build([MATS["deck"], MATS["struct"]])


# ────────────────────────────────────────────────────────────
# 八、总装
# ────────────────────────────────────────────────────────────

def build_all():
    reset_scene()
    build_materials()
    HULL_MATS[0] = MATS["hull"]
    HULL_MATS[1] = MATS["hull_light"]
    HULL_MATS[2] = MATS["wale"]

    build_hull_shell()
    build_keel()
    build_stem_stern()
    build_deck()
    build_bulwark()
    build_rail()
    build_portholes()
    build_bulkheads()
    build_castles()
    build_deck_fittings()
    build_masts_and_sails()
    build_gear()

    objs = list(bpy.context.scene.objects)
    tris = 0
    for o in objs:
        if o.type == "MESH":
            for poly in o.data.polygons:
                tris += max(1, len(poly.vertices) - 2)

    return {
        "objects": len(objs),
        "masts": len([o for o in objs if o.name.startswith("ZH_Mast_")]),
        "sails": len([o for o in objs if o.name.startswith("ZH_Sail_")]),
        "bulkheads": len([o for o in objs if o.name.startswith("ZH_Bulkhead_")]),
        "tris": tris,
        "dims": [round(L, 2), round(B, 3), round(DEPTH, 2)],
    }


if __name__ == "__main__":
    print("BUILD_OK " + json.dumps(build_all()))
