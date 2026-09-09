# -*- coding: utf-8 -*-
"""
defcon — tools/gen-landmask.py
把 Natural Earth 110m 陆地边界（tools/ne_110m_land.geojson，公有领域）光栅化成
1° 分辨率海陆掩膜，产出 src/landmask.js。

为什么需要它：
  布阵（发射井 / 潜艇）原来用「离最近城市 ≥ 9°」当作深海判据 —— 城市只是陆地的稀疏采样点，
  撒哈拉、澳洲内陆、中亚这些地方离城市很远但分明是陆地，潜艇照样会"跑到陆地上"。
  也试过直接从地球贴图抽色（早期版本），但贴图是暗色艺术化处理，雨林与深海的色差
  小到无法稳定区分 —— 改用权威海岸线数据做几何光栅化，一次到位。

光栅化：360×180 网格，每格 3×3 子采样取多数；跨所有环（外环+湖洞）做奇偶穿越计数，
  奇数次命中即陆地 —— 湖泊自动成"水"，不需要单独处理洞环。
  极地兜底：最南端若整行大半是陆地（南极冰盖），整行补成陆地。

产出：src/landmask.js → DC.land = { isLand / isWater / isInland / isDeepWater }
  1 bit / 格，1 = 陆地，0 = 海洋。行优先，第 0 行 = 北纬 +90，第 0 列 = 西经 180。

运行：python tools/gen-landmask.py [--preview]
  --preview 只把掩膜打成 ASCII 图打到终端，不写文件（用来肉眼校验海岸线对不对）。
依赖：无第三方库（GeoJSON 解析与射线法都是手写的纯 Python）。
"""
import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEO = ROOT / "tools" / "ne_110m_land.geojson"
OUT = ROOT / "src" / "landmask.js"

W, H = 360, 180          # 1° 一格
SUB = 3                  # 每格 3×3 子采样取多数
SUBW, SUBH = W, H        # 子采样网格与主网格同尺寸（只是采样点错开）

JS_TPL = """/*
 * defcon — src/landmask.js
 * 【自动生成，勿手改】由 tools/gen-landmask.py 从 Natural Earth 110m 陆地边界
 * （tools/ne_110m_land.geojson，公有领域）光栅化产出。
 *
 * 1° 分辨率海陆掩膜（1 bit / 格，1 = 陆地，0 = 海洋），行优先：
 *   第 0 行 = 北纬 +90 → 第 %(Hm1)d 行 = 南纬 -90；第 0 列 = 西经 180 → 第 %(Wm1)d 列 = 东经 180。
 *
 * 用途：布阵必须落在它该在的地方 —— 潜艇下不了陆地，发射井也修不到海里。
 *   旧版用「离最近城市 ≥ 9°」当作深海判据，城市只是陆地的稀疏采样点，
 *   撒哈拉 / 澳洲内陆 / 中亚离城市都很远但分明是陆地，潜艇照样爬上岸。
 * 体积：%(raw)d 字节位图 → base64 %(b64)d 字符，离线内联，不联网、不 fetch。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};

  var W = %(W)d, H = %(H)d;
  var BITS = '%(b64data)s';

  /* base64 → 字节数组。手写 64 字符查表：不碰 atob（Node 无头环境没有它），
   * 也不碰 Buffer（浏览器端没有它）—— 逻辑层与无头测试要共用同一份代码。 */
  var B64 = (function () {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var t = {};
    for (var i = 0; i < 64; i++) t[A.charAt(i)] = i;
    return t;
  })();
  var bytes = (function (s) {
    var n = s.length, out = [], buf = 0, bits = 0;
    for (var i = 0; i < n; i++) {
      buf = (buf << 6) | B64[s.charAt(i)];
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xFF); }
    }
    return out;
  })(BITS);

  function cellAt(lat, lon) {
    var ix = Math.floor(((lon + 180) %% 360) * W / 360);
    var iy = Math.floor((90 - lat) * H / 180);
    if (ix < 0) ix = 0; if (ix >= W) ix = W - 1;
    if (iy < 0) iy = 0; if (iy >= H) iy = H - 1;
    return iy * W + ix;
  }

  function bit(n) {
    return (bytes[n >> 3] >> (7 - (n & 7))) & 1;
  }

  /* 该点是陆地吗（只看自己这一格）。掩膜给布阵"挑地方"用，单格精度足够：1° ≈ 111 km。 */
  function isLand(lat, lon) {
    return bit(cellAt(lat, lon)) === 1;
  }

  /* 该点及四邻（radiusDeg）都是陆地吗 —— 内陆判据。
   * 发射井要修在纵深里，贴在海岸线上视觉上像"泡在水边"，也容易被一发带走。 */
  function isInland(lat, lon, radiusDeg) {
    var d = radiusDeg || 1;
    return isLand(lat, lon) &&
           isLand(lat + d, lon) && isLand(lat - d, lon) &&
           isLand(lat, lon + d) && isLand(lat, lon - d);
  }

  /* 该点及四邻（radiusDeg）都是水吗 —— 深海判据。
   * 潜艇不能贴着海岸线蹲：既不符合"藏在深海里"的叙事，也会被玩家一眼看穿是贴图错位。 */
  function isDeepWater(lat, lon, radiusDeg) {
    var d = radiusDeg || 2;
    return !isLand(lat, lon) &&
           !isLand(lat + d, lon) && !isLand(lat - d, lon) &&
           !isLand(lat, lon + d) && !isLand(lat, lon - d);
  }

  DC.land = {
    W: W, H: H,
    isLand: isLand,
    isWater: function (lat, lon) { return !isLand(lat, lon); },
    isInland: isInland,
    isDeepWater: isDeepWater
  };

})(typeof window !== 'undefined' ? window : globalThis);
"""


def load_rings():
    """GeoJSON → 环列表。奇偶计数法下外环与洞环一视同仁。"""
    gj = json.loads(GEO.read_text(encoding="utf-8"))
    rings = []
    for f in gj.get("features", []):
        g = f.get("geometry") or {}
        t, coords = g.get("type"), g.get("coordinates")
        if t == "Polygon":
            rings.extend(coords)
        elif t == "MultiPolygon":
            for poly in coords:
                rings.extend(poly)
    return rings


def inside(pt, ring):
    """射线法（奇偶规则）：从 pt 向 +x 引一条射线，数环的穿越次数。"""
    x, y = pt
    n, hit = len(ring), False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            # 环边与水平线的交点横坐标
            t = (y - yi) / (yj - yi)
            xcross = xi + t * (xj - xi)
            if x > xcross:
                hit = not hit
        j = i
    return hit


def _ring_scanline(ring, off_lat, off_lon, W=SUBW, H=SUBH):
    """单个环在子采样网格上的扫描线填充（奇偶规则）。
    返回布尔网格：行 iy 覆盖纬度 [90-iy-1, 90-iy]，列 ix 覆盖经度 [-180+ix, -180+ix+1]。"""
    g = bytearray(W * H)
    # 预过滤：环外接盒之外的行直接跳过
    lats = [p[1] for p in ring]
    r_top, r_bot = max(lats), min(lats)
    iy_min = max(0, int(90 - r_top) - 1)
    iy_max = min(H - 1, int(90 - r_bot) + 1)
    for iy in range(iy_min, iy_max + 1):
        y = 90 - iy - 1 + off_lat        # 该行采样纬度
        xs = []
        j = len(ring) - 1
        for i in range(len(ring)):
            x1, y1 = ring[j][0], ring[j][1]
            x2, y2 = ring[i][0], ring[i][1]
            if (y1 > y) != (y2 > y):
                xs.append(x1 + (y - y1) / (y2 - y1) * (x2 - x1) + off_lon)
            j = i
        if len(xs) < 2:
            continue
        xs.sort()
        # 奇偶配对填充：偶数索引进、奇数索引出
        for k in range(0, len(xs) - 1, 2):
            ix0 = max(0, int(xs[k] + 180))
            ix1 = min(W - 1, int(xs[k + 1] + 180))
            for ix in range(ix0, ix1 + 1):
                # 列中心落在 [xs0, xs1] 内才算命中
                cx = -180 + ix + off_lon
                if xs[k] <= cx <= xs[k + 1]:
                    g[iy * W + ix] ^= 1
    return g


def rasterize():
    rings = load_rings()
    # 3×3 子采样：9 份错位网格逐环 XOR（外环/洞环自动配对），再按格取多数
    subs = []
    for sy in range(SUB):
        for sx in range(SUB):
            off_lat = (sy + 1) / (SUB + 1)
            off_lon = (sx + 1) / (SUB + 1)
            g = bytearray(SUBW * SUBH)
            for r in rings:
                rg = _ring_scanline(r, off_lat, off_lon)
                for i in range(len(g)):
                    g[i] ^= rg[i]
            subs.append(g)
    bits = [0] * (W * H)
    for iy in range(H):
        for ix in range(W):
            n = 0
            for g in subs:
                n += g[iy * W + ix]
            bits[iy * W + ix] = 1 if n * 2 >= len(subs) else 0
    # 极地兜底：南极冰盖在海岸线数据里到 -90 为止可能有缝，最南两行按行内陆地占比补齐
    for iy in (H - 1, H - 2):
        row = bits[iy * W:(iy + 1) * W]
        if sum(row) * 2 >= W:
            bits[iy * W:(iy + 1) * W] = [1] * W
    return bits


def pack(bits):
    buf = bytearray((W * H + 7) // 8)
    for i, v in enumerate(bits):
        if v:
            buf[i >> 3] |= 1 << (7 - (i & 7))
    return bytes(buf)


def preview(bits):
    print("+" + "-" * (W // 4) + "+")
    for y in range(0, H, 4):
        row = "".join("#" if bits[y * W + x] else "." for x in range(0, W, 4))
        print("|" + row + "|")
    print("+" + "-" * (W // 4) + "+")


def main():
    if "--preview-generate" not in sys.argv and "--preview" in sys.argv:
        # 预览模式：仍旧全量光栅化一遍（快，纯 Python < 5s），但不写文件
        bits = rasterize()
        preview(bits)
        return
    bits = rasterize()
    raw = pack(bits)
    b64 = base64.b64encode(raw).decode("ascii")
    txt = JS_TPL % {"W": W, "H": H, "Hm1": H - 1, "Wm1": W - 1,
                    "raw": len(raw), "b64": len(b64), "b64data": b64}
    OUT.write_text(txt, encoding="utf-8")
    land = sum(bits)
    print("wrote %s" % OUT)
    print("  grid %dx%d  land cells %d (%.1f%%)  bytes %d  b64 %d" %
          (W, H, land, land * 100.0 / (W * H), len(raw), len(b64)))
    preview(bits)


if __name__ == "__main__":
    main()
