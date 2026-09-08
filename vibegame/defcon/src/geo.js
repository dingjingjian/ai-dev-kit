/*
 * defcon — geo.js
 * 经纬度数学 / 大圆航线 / 弹道曲线 / 弹道溯源误差
 * 依赖：data.js（仅用 DC.CONFIG.earthRadiusKm，无 THREE 依赖，可无头断言）
 * 命名空间：window.DC（经典脚本，无 import/export/type=module）
 *
 * ll2v 公式与 vibeknow/earth-3d 的 ll2v 保持一致（等距圆柱贴图 UV 对齐）：
 *   th = (90 - lat) * π/180
 *   p  = (lon + 180) / 360 * 2π
 *   x = -r·cos(p)·sin(th), y = r·cos(th), z = r·sin(p)·sin(th)
 * 返回纯 {x,y,z}（不依赖 THREE.Vector3），render.js 直接消费分量；
 * 这样逻辑层可在无浏览器的 Node 环境里无头测试。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};
  var CONFIG = DC.CONFIG || {};

  var EARTH_R = (CONFIG.earthRadiusKm || 6371);

  function deg2rad(d) { return d * Math.PI / 180; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  // 经纬度 → 球面坐标（UV 对齐 earth-3d）
  function ll2v(lat, lon, r) {
    var th = deg2rad(90 - lat);
    var p = deg2rad(lon + 180);
    return {
      x: -r * Math.cos(p) * Math.sin(th),
      y:  r * Math.cos(th),
      z:  r * Math.sin(p) * Math.sin(th)
    };
  }

  // 球面直角坐标 → 经纬度（ll2v 的逆运算，与 earth-3d 的 UV 约定一致）。
  // 布阵与质心计算需要：先求若干城市的球面质心向量，再转回经纬度落点。
  function v2ll(v) {
    var r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (r < 1e-12) return { lat: 0, lon: 0 };
    var th = Math.acos(Math.max(-1, Math.min(1, v.y / r)));
    var p = Math.atan2(v.z, -v.x);          // x = -r·cos(p)·sin(th) ⇒ -x 对应 cos(p)
    return { lat: 90 - rad2deg(th), lon: wrapLon(rad2deg(p) - 180) };
  }

  // 多个 {lat,lon} 的球面质心：向量求和后归一化再转回经纬度。
  // 若点集完全对跖抵消（模长≈0）则退化为 (0,0)。
  function centroid(list) {
    var x = 0, y = 0, z = 0, n = 0;
    (list || []).forEach(function (p) {
      if (!p) return;
      var v = ll2v(p.lat, p.lon, 1);
      x += v.x; y += v.y; z += v.z; n++;
    });
    if (!n) return { lat: 0, lon: 0 };
    if (Math.sqrt(x * x + y * y + z * z) < 1e-9) return { lat: 0, lon: 0 };
    return v2ll({ x: x, y: y, z: z });
  }

  // 起点 a 指向终点 b 的初始方位角（度，正北为 0，顺时针为正）
  function bearing(a, b) {
    var la1 = deg2rad(a.lat), la2 = deg2rad(b.lat), dLo = deg2rad(b.lon - a.lon);
    var y = Math.sin(dLo) * Math.cos(la2);
    var x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLo);
    return rad2deg(Math.atan2(y, x));
  }

  // 从 ll 出发沿方位角 brgDeg 走 angDeg（角距，度）后的落点。
  // 布阵用它把单位撒在质心周围，D5 溯源也可用它沿弹道反向延伸。
  function destination(ll, brgDeg, angDeg) {
    var la1 = deg2rad(ll.lat), lo1 = deg2rad(ll.lon);
    var b = deg2rad(brgDeg), d = deg2rad(angDeg);
    var la2 = Math.asin(Math.max(-1, Math.min(1,
      Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b))));
    var lo2 = lo1 + Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return { lat: rad2deg(la2), lon: wrapLon(rad2deg(lo2)) };
  }

  // 两点（{lat,lon}）间的中心角（弧度，0..π）
  function angular(a, b) {
    var la1 = deg2rad(a.lat), lo1 = deg2rad(a.lon);
    var la2 = deg2rad(b.lat), lo2 = deg2rad(b.lon);
    var dLa = la2 - la1, dLo = lo2 - lo1;
    var s = Math.sin(dLa / 2), t = Math.sin(dLo / 2);
    var h = s * s + Math.cos(la1) * Math.cos(la2) * t * t;
    if (h > 1) h = 1;                       // 浮点保护
    return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // 大圆距离（公里）
  function distKm(a, b) { return angular(a, b) * EARTH_R; }

  // 球面线性插值（slerp）：a→b 在比例 t∈[0,1] 处的 {lat,lon}
  function slerpLL(a, b, t) {
    var la1 = deg2rad(a.lat), lo1 = deg2rad(a.lon);
    var la2 = deg2rad(b.lat), lo2 = deg2rad(b.lon);
    var ang = angular(a, b);
    if (ang < 1e-9) return { lat: a.lat, lon: a.lon };
    var s1 = Math.sin((1 - t) * ang) / Math.sin(ang);
    var s2 = Math.sin(t * ang) / Math.sin(ang);
    var x = s1 * Math.cos(la1) * Math.cos(lo1) + s2 * Math.cos(la2) * Math.cos(lo2);
    var y = s1 * Math.cos(la1) * Math.sin(lo1) + s2 * Math.cos(la2) * Math.sin(lo2);
    var z = s1 * Math.sin(la1) + s2 * Math.sin(la2);
    var lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    var lon = Math.atan2(y, x);
    return { lat: rad2deg(lat), lon: rad2deg(lon) };
  }

  // 大圆表面点：a→b 在比例 t 处、半径 r 的球面坐标 {x,y,z}
  function gcPoint(a, b, t, r) {
    var ll = slerpLL(a, b, t);
    return ll2v(ll.lat, ll.lon, r);
  }

  // 弹道点：大圆路径 + 正弦顶点高度；t=0.5 时高度最大，t=0/1 贴地。
  // apexDeg 为「顶点高度当量角」：顶点半径 = r × (1 + apexDeg×π/180)。
  // 例：apexDeg=12、r=6371km → 顶点高约 1334 km，与真实 ICBM 顶点同量级。
  function ballistic(a, b, t, r, apexDeg) {
    var ll = slerpLL(a, b, t);
    var up = 1 + deg2rad(apexDeg || 12) * Math.sin(Math.PI * t);
    return ll2v(ll.lat, ll.lon, r * up);
  }

  // 弹道溯源误差 σ（角距离，单位度）：σ = σ0 + k × 角距离(deg)
  // 越远打得越不准，误差越大（DESIGN §5.1）。
  function traceSigma(sigma0, k, angDeg) {
    return sigma0 + k * angDeg;
  }

  // 反向溯源（几何层，未加随机误差）：
  // 已知真实发射点 start 与命中目标 end，导弹在飞行比例 tc 处被捕获，
  // 先求捕获点 captured = slerp(start, end, tc)，再沿大圆从 captured 回溯至 start，
  // 几何估计即为发射点 start（真实误差由调用方按 traceSigma 叠加，见 offsetLL）。
  function reverseTrace(start, end, tc) {
    var captured = slerpLL(start, end, tc);
    var est = slerpLL(captured, start, 1); // t=1 → 回到 start
    return { lat: est.lat, lon: est.lon };
  }

  // 在估计点叠加高斯误差偏移（Box–Muller）。u1,u2 ∈ [0,1) 由调用方（含 RNG）提供，
  // 使 geo.js 保持纯函数、可被无头测试以确定性输入驱动。
  // 返回偏移后的 {lat,lon}（度），sigmaDeg 为 1σ 角半径（度）。
  function offsetLL(ll, sigmaDeg, u1, u2) {
    if (u1 < 1e-9) u1 = 1e-9;
    var mag = sigmaDeg * Math.sqrt(-2 * Math.log(u1)); // 瑞利/高斯幅度
    var theta = 2 * Math.PI * u2;
    var dLat = mag * Math.cos(theta);
    var cosLat = Math.max(0.1, Math.cos(deg2rad(ll.lat)));
    var dLon = mag * Math.sin(theta) / cosLat;
    return { lat: wrapLat(ll.lat + dLat), lon: wrapLon(ll.lon + dLon) };
  }

  // 经纬度归一化：纬度折叠回 ±90，经度环绕回 (-180, 180]。
  // 极区估算点叠加误差后 lat 可能越过极点，必须折叠，否则 ll2v 会算出镜面翻转的位置。
  function wrapLat(lat) {
    var v = ((lat + 180) % 360 + 360) % 360 - 180;   // → [-180, 180)
    if (v > 90) v = 180 - v;        // 越过北极：折回
    if (v < -90) v = -180 - v;      // 越过南极：折回
    return v;
  }
  function wrapLon(lon) {
    var v = ((lon + 180) % 360 + 360) % 360 - 180;
    return v === -180 ? 180 : v;
  }

  // 导弹飞行时间（秒）：按大圆距离线性映射到 [min,max]（DESIGN §3.1）
  function flightSeconds(distKm, minSec, maxSec, fullDistKm) {
    var mn = (minSec != null) ? minSec : (CONFIG.missileFlightMin || 15);
    var mx = (maxSec != null) ? maxSec : (CONFIG.missileFlightMax || 40);
    var full = (fullDistKm != null) ? fullDistKm : (CONFIG.missileFullDistKm || 20000);
    var r = distKm / full;
    if (r < 0) r = 0; if (r > 1) r = 1;
    return mn + (mx - mn) * r;
  }

  // 导出
  DC.geo = {
    EARTH_R: EARTH_R,
    deg2rad: deg2rad,
    rad2deg: rad2deg,
    ll2v: ll2v,
    v2ll: v2ll,
    centroid: centroid,
    bearing: bearing,
    destination: destination,
    angular: angular,
    distKm: distKm,
    slerpLL: slerpLL,
    gcPoint: gcPoint,
    ballistic: ballistic,
    traceSigma: traceSigma,
    reverseTrace: reverseTrace,
    offsetLL: offsetLL,
    wrapLat: wrapLat,
    wrapLon: wrapLon,
    flightSeconds: flightSeconds
  };

})(typeof window !== 'undefined' ? window : globalThis);
