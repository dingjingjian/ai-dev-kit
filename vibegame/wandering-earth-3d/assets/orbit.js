/**
 * 开普勒轨道解算（逃逸时代的"看得见的策略"基础）。
 *
 * 全部计算限制在 XZ 平面（y = 0）：地球与行星共面，太阳位于原点。
 * 给定某时刻的位置与速度，解出轨道要素，就能：
 *   · 画出地球接下来会走的那条曲线（当前轨道）；
 *   · 画出"如果现在施加某个 Δv"之后的曲线（预测轨道）；
 *   · 求出近日点位置与真近点角，进而判定"点火窗口"。
 *
 * 本文件是**纯函数**，不持有状态，也不碰 DOM —— 无头自检可直接加载调用。
 */
(function (global) {
  'use strict';
  var M3D = global.M3D || (global.M3D = {});

  function hypot(x, y) { return Math.sqrt(x * x + y * y); }

  // 角度归一化到 (-π, π]
  function wrapPi(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a <= -Math.PI) a += Math.PI * 2;
    return a;
  }

  /**
   * 由位置与速度解算轨道要素。
   * @param x,z    位置（游戏单位，太阳在原点）
   * @param vx,vz  速度（游戏单位/秒）
   * @param gm     中心天体 GM
   * @param out    可选，复用对象
   * @returns { a, e, p, rp, ra, periX, periZ, theta, dir, period, escapeRatio, bound }
   *   a 半长轴（双曲线为负）；e 偏心率；p 半通径；rp 近日点；ra 远地点（不闭合为 Infinity）
   *   periX/periZ 近日点方向单位向量；theta 当前真近点角（沿运动方向递增）
   *   dir = +1 / -1 表示绕行方向；bound = e < 1
   */
  function elements(x, z, vx, vz, gm, out) {
    out = out || {};
    var r = hypot(x, z) || 1e-6;
    var v2 = vx * vx + vz * vz;
    var eps = v2 / 2 - gm / r;                  // 比机械能
    var a = -gm / (2 * eps);                    // eps < 0 → a > 0（椭圆）
    var rv = x * vx + z * vz;                   // r·v
    var ex = (v2 / gm - 1 / r) * x - (rv / gm) * vx;
    var ez = (v2 / gm - 1 / r) * z - (rv / gm) * vz;
    var e = hypot(ex, ez);

    var periX, periZ;
    // 近圆轨道（e 极小时偏心率向量只剩数值噪声，方向会乱跳）→ 退化为当前径向，
    // 此时"近日点"在物理上没有意义，HUD 侧按 e 阈值隐藏标记即可。
    if (e > 1e-4) { periX = ex / e; periZ = ez / e; }
    else { periX = x / r; periZ = z / r; e = 0; }

    // 绕行方向：h = x·vz − z·vx（2D 叉积）
    var h = x * vz - z * vx;
    var dir = h >= 0 ? 1 : -1;

    // 真近点角：以近日点方向为基准，沿运动方向递增
    var cosT = (periX * x + periZ * z) / r;
    var sinT = dir * (periX * z - periZ * x) / r;
    var theta = Math.atan2(sinT, cosT);

    var p = a * (1 - e * e);                    // 半通径（双曲线 a<0、e>1 → p>0）
    var rp = p / (1 + e);
    var ra = e < 1 ? p / (1 - e) : Infinity;
    var period = e < 1 ? 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / gm) : Infinity;

    out.a = a; out.e = e; out.p = p; out.rp = rp; out.ra = ra;
    out.periX = periX; out.periZ = periZ;
    out.theta = theta; out.dir = dir; out.period = period;
    out.bound = e < 1;
    out.vEsc = Math.sqrt(2 * gm / r);           // 当前位置的逃逸速度（用于 HUD 逃逸比）
    return out;
  }

  /**
   * 轨道上真近点角 theta 处的坐标（XZ 平面）。
   * @param el    elements() 的结果
   * @param theta 真近点角（沿运动方向）
   * @param out   [x, z] 复用数组
   */
  function pointAt(el, theta, out) {
    out = out || [0, 0];
    var denom = 1 + el.e * Math.cos(theta);
    var r = denom <= 1e-6 ? el.p / 1e-6 : el.p / denom;
    // 沿运动方向 +90° 的横向基：dir=+1 → (-pz, px)；dir=-1 → (pz, -px)
    var s = el.dir >= 0 ? 1 : -1;
    var tx = -el.periZ * s, tz = el.periX * s;
    var c = Math.cos(theta), sn = Math.sin(theta);
    out[0] = (el.periX * c + tx * sn) * r;
    out[1] = (el.periZ * c + tz * sn) * r;
    return out;
  }

  /**
   * 采样一段轨道，回调收到 (x, z, theta)。
   * 椭圆采满一圈；双曲线/抛物线只采到 r 超过 rMax 为止。
   */
  function sample(el, thetaFrom, thetaTo, n, rMax, cb) {
    var pt = [0, 0];
    var span = thetaTo - thetaFrom;
    for (var i = 0; i <= n; i++) {
      var th = thetaFrom + span * (i / n);
      pointAt(el, th, pt);
      var r = hypot(pt[0], pt[1]);
      if (rMax && r > rMax) break;
      cb(pt[0], pt[1], th, r);
    }
  }

  /**
   * 施加一个 Δv 之后的新轨道要素（预测用）。
   * @param dvx,dvz 速度增量（游戏单位/秒）
   */
  function afterDv(x, z, vx, vz, gm, dvx, dvz, out) {
    return elements(x, z, vx + dvx, vz + dvz, gm, out);
  }

  /**
   * 近日点窗口强度：真近点角距近日点越近越强。
   * 奥伯特效应的游戏化 —— 同样的燃料在近日点附近能换来更多轨道能量。
   * @returns 0..1
   */
  function periWindow(el) {
    if (!isFinite(el.theta)) return 0;
    var c = Math.cos(el.theta);
    if (c <= 0) return 0;
    // 偏心率越大，"靠近近日点"越值钱；圆轨道（e≈0）处处等价，给一个基础值
    return c * (0.45 + 0.55 * Math.min(1, el.e / 0.5));
  }

  M3D.orbit = {
    elements: elements,
    pointAt: pointAt,
    sample: sample,
    afterDv: afterDv,
    periWindow: periWindow,
    wrapPi: wrapPi
  };
})(typeof window !== 'undefined' ? window : this);
