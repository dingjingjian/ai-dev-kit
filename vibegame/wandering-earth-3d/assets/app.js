/**
 * 流浪地球 · 引力弹弓 —— 主程序（固定航线版）
 *
 * 玩法（固定航线 / 时机弹弓）：
 *   · 地球沿一条**固定航线**自动前进，玩家不能转向，只能决定「何时点火」。
 *   · 每颗行星处有一次**加速窗口**：太早点火吃不到弹弓放大（白烧温度）、
 *     最佳区间点火 = 引力弹弓 ×SLING、太晚速度不够 = 被行星捕获或拽入大气。
 *   · 身后的氦闪膨胀壳持续追击，被吞没即失败。
 *
 * 结构：
 *   1. 航线 + 物理核心 createGame（纯 JS，不依赖 THREE，无头自检可直接调用）
 *   2. 渲染层（依赖 THREE + DOM，无 THREE 时跳过）
 */
(function (global) {
  'use strict';

  // ============================================================
  //  1. 尺度与真实单位换算
  // ============================================================
  var AU = 100;                 // 1 天文单位
  var AU_KM = 149597871;        // 1 AU = 1.496e8 km（半径换算用）
  var KM_PER_UNIT = AU_KM / AU; // 1 单位 = 1.496e6 km

  // 天体半径 = 真实半径(km) × BODY_SCALE，**所有天体共用同一个倍率** →
  // 屏幕上的大小关系与真实完全一致（是「比例正确」，不是各自手调）：
  //   木星 69911 : 土星 58232 : 天王星 25362 : 海王星 24622 : 冥王星 1188 : 地球 6371
  // 倍率以**地球的观感**为锚点定：800× 让地球 = 3.41 单位 —— 与手调时代的 3.4 一致
  // （占屏 ~13%），主角不再是一颗小球。真值下地球只有 0.0043 单位，必须放大才看得见。
  // 代价是掠过行星同比放大 2.67×（木星 37.4 单位），净空也同比放大以保持掠过分镜的相对关系。
  var BODY_SCALE = 800;
  function bodyR(km) { return km / KM_PER_UNIT * BODY_SCALE; }

  // 引力强度：真实质量（地球 = 1）+ 真实半径 → 表面逃逸速度 v_esc = √(2GM/R)（km/s）。
  // 引力弹弓能利用的增益上限**就是** v_esc，所以「加速窗口该多长、最佳区间该多宽」
  // 由它派生（见 §3 的 deriveTiming）—— 质量大的行星引力影响范围大，窗口与绿色区间都更宽。
  var G_SI = 6.6743e-11;        // m³·kg⁻¹·s⁻²
  var EARTH_KG = 5.9722e24;     // 地球质量
  function bodyVesc(rKm, mEarth) {
    return Math.sqrt(2 * G_SI * mEarth * EARTH_KG / (rKm * 1000)) / 1000;
  }

  // 太阳是**唯一不参与 BODY_SCALE 的天体**：同比放大它会是 bodyR(696340) ≈ 372 单位，
  // 而航线起点只有 95 单位、氦闪壳从 30 单位起 —— 地球会出生在太阳内部、壳也在太阳内部。
  // 想让太阳同比，共用倍率得压到 ≤43×（太阳 20 单位，才在壳的 30 单位以内），
  // 那时地球只剩 0.18 单位（≈6 px）、木星 2.0 单位，主角和「行星由小变大」的分镜一起消失。
  // 故太阳单独取 10（约为真值的 21×）。
  var SUN_R = 10;
  var EARTH_R = bodyR(6371);    // 地球半径：与五颗行星同一倍率（3.41 单位 = 手调时代的 3.4）

  // 速度显示换算：**巡航速 = 1 AU 处太阳逃逸速度（42.1 km/s）**。
  // 这是本作唯一保留的真实锚点：游戏里读到的 km/s 都是真实量级，
  // 而单位/距离做了游戏化压缩（见 DESIGN §8）。
  var SUN_ESCAPE_KMS_1AU = 42.1;
  var KMS_REF_SPEED = 100;                                  // 换算基准（单位/秒）
  var KMS_PER_UNIT = SUN_ESCAPE_KMS_1AU / KMS_REF_SPEED;    // 1 单位/秒 ≈ 0.421 km/s
  var TAU = Math.PI * 2;

  function len3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

  // ============================================================
  //  2. 航线（唯一真源：参数曲线 → 采样 → 弧长表）
  // ============================================================
  // 参数 u ∈ [0,1]：
  //   r(u) = R0 · (R1/R0)^u                    —— 对数螺旋，半径从 0.95 AU 涨到 43 AU
  //   φ(u) = Φ0 + TURNS·2π·u^WIND              —— 方位角
  //   y(u) = Y_AMP · sin(Y_FREQ·2π·u + PHASE)  —— 垂直起伏（3D 过山车感）
  //
  // **TURNS 必须小**：手机竖屏的水平视场只有约 ±16°，航行方向每转 1° 就把「前方」甩 1°。
  // 早期版本用 TURNS=0.92 / WIND=0.42 让内圈猛绕（137°），结果行星全从画面侧面冒出来，
  // 完全框不住；改成近乎径向的缓螺旋后，行星才在正前方由小变大。
  // 代价是「地球→第一颗行星」的弧长只能由真实轨道间距给出，所以火星（1.52 AU，仅 52 单位）
  // 太近、窗口还没亮就已经到判定点 —— 只能从掠过的行星名单里去掉，改由木星开局。
  var ROUTE_R0 = 95;
  var ROUTE_R1 = 4300;
  var ROUTE_TURNS = 0.25;       // 全程绕日圈数（小 → 近似径向；必须 < 1，否则航线自交）
  var ROUTE_WIND = 1.0;         // 方位角幂次（1 = 匀速缠绕，起手不会出现无限大的转向率）
  var ROUTE_Y_AMP = 25;         // 垂直起伏振幅
  var ROUTE_Y_FREQ = 0.9;       // 垂直起伏周期数
  var ROUTE_Y_PHASE = -Math.PI / 2;  // 起手是平的（y'(0)=0），避免开局就在陡爬升
  var ROUTE_SAMPLES = 3600;     // 采样段数

  function routePos(u, out) {
    var r = ROUTE_R0 * Math.pow(ROUTE_R1 / ROUTE_R0, u);
    var ph = ROUTE_TURNS * TAU * Math.pow(u, ROUTE_WIND);
    out[0] = Math.cos(ph) * r;
    out[1] = ROUTE_Y_AMP * Math.sin(ROUTE_Y_FREQ * TAU * u + ROUTE_Y_PHASE);
    out[2] = Math.sin(ph) * r;
    return out;
  }

  // 航线采样 + 弧长表。返回 { pts, cum, n, len }
  function buildRoute() {
    var n = ROUTE_SAMPLES;
    var pts = new Float64Array((n + 1) * 3);
    var cum = new Float64Array(n + 1);
    var tmp = [0, 0, 0];
    for (var i = 0; i <= n; i++) {
      routePos(i / n, tmp);
      pts[i * 3] = tmp[0]; pts[i * 3 + 1] = tmp[1]; pts[i * 3 + 2] = tmp[2];
      if (i === 0) { cum[0] = 0; continue; }
      var dx = tmp[0] - pts[(i - 1) * 3];
      var dy = tmp[1] - pts[(i - 1) * 3 + 1];
      var dz = tmp[2] - pts[(i - 1) * 3 + 2];
      cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return { pts: pts, cum: cum, n: n, len: cum[n] };
  }

  function routeIndex(route, s) {
    var lo = 0, hi = route.n;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (route.cum[mid] <= s) lo = mid; else hi = mid;
    }
    return lo;
  }

  // 沿航线取弧长 s 处的点与单位切向（纯函数，渲染层与无头自检共用）
  function routeSample(route, s, outPos, outTan) {
    if (!(s > 0)) s = 0;
    if (s > route.len) s = route.len;
    var i = routeIndex(route, s);
    if (i >= route.n) i = route.n - 1;
    var seg = route.cum[i + 1] - route.cum[i];
    var f = seg > 1e-9 ? (s - route.cum[i]) / seg : 0;
    var p = route.pts;
    var x0 = p[i * 3], y0 = p[i * 3 + 1], z0 = p[i * 3 + 2];
    var x1 = p[(i + 1) * 3], y1 = p[(i + 1) * 3 + 1], z1 = p[(i + 1) * 3 + 2];
    var dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    if (outPos) { outPos[0] = x0 + dx * f; outPos[1] = y0 + dy * f; outPos[2] = z0 + dz * f; }
    if (outTan) { outTan[0] = dx / l; outTan[1] = dy / l; outTan[2] = dz / l; }
    return route.cum[i] + seg * f;
  }

  // ============================================================
  //  3. 行星（航线掠过点 + 场上其他行星）
  // ============================================================
  // rKm    = 真实半径（km）→ rad 由 bodyR 派生，**唯一入口**，不允许手调单颗尺寸。
  // mEarth = 真实质量（地球 = 1）→ vEsc 由 bodyVesc 派生，**时机窗口与最佳区间由它决定**。
  // clear  = 「航线到行星表面」的净空，rad + clear 就是掠过的垂直距离 →
  //          clear 越小，行星在屏幕上越大越压迫。clear 是分镜参数，不参与半径换算。
  //          本轮随 BODY_SCALE 300→800 **同倍率放大（×2.667）**：画面上「行星半径 : 掠距」
  //          的比例不变，所以掠过行星的构图与放大前一致，只有地球回到了原来的观感。
  //          例外一：冥王星等比后掠距 19.3 几乎等于相机抬升 CAM_UP=20，相机会贴着它的中心过去，
  //          故单独压到 14.4，让航线明显从它下方掠过（实测相机离它中心 5.0 单位）。
  //          例外二：土星光环必须**整个留在掠距之内**（RING_OUT × 半径 < 掠距 − 地球半径），
  //          否则地球会从环的盘面投影里穿过去（截图可见）。所以光环内缩到 1.12~1.55 倍半径，
  //          而不是把掠距推到环外 —— 后者会把土星推到画面外（判定点近缘离轴 35.6° > 30° 半视场）。
  // vNeed  = 判定点速度门槛；低于它 → 被捕获（再低到 ×CRASH_RATIO 以下 → 撞毁）
  // vSling = 该行星的「弹弓速度」：最佳区间内速度按比例向它逼近（差距越大拉得越猛）
  function flyby(o) { o.rad = bodyR(o.rKm); o.vEsc = bodyVesc(o.rKm, o.mEarth); return o; }
  var FLYBYS = [
    flyby({ key: 'jupiter', name: '木星', rKm: 69911, mEarth: 317.8, orbitR: 5.20 * AU, clear: 29.3, vNeed: 98, vSling: 156, tex: 'JUPITER_TEXTURE_URI', color: 0xdbc29e }),
    flyby({ key: 'saturn', name: '土星', rKm: 58232, mEarth: 95.2, orbitR: 9.54 * AU, clear: 26.7, vNeed: 130, vSling: 168, tex: 'SATURN_TEXTURE_URI', color: 0xe0d4a8, ring: true }),
    // 2026-09-27：五站**全部换真实影像**（此前天王星 / 海王星 / 冥王星是程序化色块）。
    // 贴图来自 vibeknow/solar-system-3d/assets/（NASA 影像），同样内联 base64。
    // color 现在只给**光晕**（柔光 sprite）用，不再兼作程序化贴图底色。
    flyby({ key: 'uranus', name: '天王星', rKm: 25362, mEarth: 14.54, orbitR: 19.20 * AU, clear: 24, vNeed: 138, vSling: 172, tex: 'URANUS_TEXTURE_URI', color: 0x9dd9e0 }),
    flyby({ key: 'neptune', name: '海王星', rKm: 24622, mEarth: 17.15, orbitR: 30.10 * AU, clear: 22.7, vNeed: 138, vSling: 172, tex: 'NEPTUNE_TEXTURE_URI', color: 0x4a7fd6 }),
    flyby({ key: 'pluto', name: '冥王星', rKm: 1188, mEarth: 0.00218, orbitR: 39.50 * AU, clear: 14.4, vNeed: 132, vSling: 164, tex: 'PLUTO_TEXTURE_URI', color: 0xc2a08a })
  ];

  // ---- 不参与判定的「场上其他行星」：水星 / 金星 / 火星 ----
  // 它们照样按真实半径（同一 BODY_SCALE）与**真实轨道半径**摆位，只是没有判定点、
  // 没有加速窗口、不检测碰撞 —— 存在的意义是「太阳系是完整的」，不是能借力。
  // 摆位分两类：
  //   · 'route'  —— 轨道半径在航线起点外侧（火星 1.52 AU）：和掠过行星一样沿航线局部上抬
  //                 h = 半径 + SCENERY_LIFT 并正对航线（距日仍反解到真实轨道半径），
  //                 于是地球会在开局不久从它旁边过去 —— 看得见，但吃不到弹弓。
  //   · 'behind' —— 轨道半径在航线起点**内侧**（水星 0.39 / 金星 0.72 AU，航线根本不到那儿）：
  //                 摆在地球起点同一方位角、黄道面上 → 它永远在地球身后。
  //                 正前方看不到（物理上也不该看到），靠尾向观测窗 + 小地图读出来。
  var SCENERY_LIFT = 40;        // 与 clear 同倍率放大（15 × 2.667），保证「从它旁边过」的构图不变
  function scenery(o) { o.rad = bodyR(o.rKm); return o; }
  var SCENERY = [
    // 同样换成真实影像（2026-09-27）：它们只在尾向观测窗 / 小地图里的小点上出现，
    // 真实纹理让「那是水星 / 金星 / 火星」这件事一眼可辨，而不是三个灰球。
    scenery({ key: 'mercury', name: '水星', rKm: 2440, mEarth: 0.0553, orbitR: 0.387 * AU, color: 0x9a8f86, tex: 'MERCURY_TEXTURE_URI', place: 'behind' }),
    scenery({ key: 'venus', name: '金星', rKm: 6052, mEarth: 0.815, orbitR: 0.723 * AU, color: 0xe8c88a, tex: 'VENUS_TEXTURE_URI', place: 'behind' }),
    scenery({ key: 'mars', name: '火星', rKm: 3390, mEarth: 0.107, orbitR: 1.524 * AU, color: 0xc1440e, tex: 'MARS_TEXTURE_URI', place: 'route' })
  ];

  // ---- 质量 → 时机窗口（两遍：先扫出全体的 v_esc 范围，再归一化）----
  // q = 0（冥王星，v_esc 1.2 km/s，几乎弹不动）→ 窗口 2.5 s、最佳区间只占窗口 28%
  // q = 1（木星，v_esc 60 km/s，引力最强）    → 窗口 2.8 s、最佳区间占窗口 44%
  // 温度预算（满箱 ≈1.43 s）必须同时满足「< 每颗窗口」与「> 每颗最佳区间」→ 有逐行星断言。
  var WIN_MIN = 2.5, WIN_MAX = 2.8;                            // 窗口时长（秒）随引力强度
  var SWEET_LO_NARROW = 0.62, SWEET_LO_WIDE = 0.46, SWEET_HI = 0.90;
  var SLING_SWEET_PRODUCT = 2.06;   // 吃满最佳区间时的弹弓逼近量 = 1−e^−2.06 ≈ 87%（与旧版等价）
  var RATING_SWEET_FRAC = 0.48;     // 「完美弹弓」阈值 = 吃满该行星最佳区间的 48%（旧版 0.55/1.14 s）
  function deriveTiming(list) {
    var lo = Infinity, hi = -Infinity, i, o;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o.vEsc < lo) lo = o.vEsc;
      if (o.vEsc > hi) hi = o.vEsc;
    }
    var span = Math.max(1e-9, hi - lo);
    for (i = 0; i < list.length; i++) {
      o = list[i];
      o.gravQ = (o.vEsc - lo) / span;                    // 0 = 引力最弱，1 = 引力最强
      o.winTime = WIN_MIN + (WIN_MAX - WIN_MIN) * o.gravQ;
      o.sweet0 = SWEET_LO_NARROW - (SWEET_LO_NARROW - SWEET_LO_WIDE) * o.gravQ;
      o.sweet1 = SWEET_HI;
      o.sweetTime = (o.sweet1 - o.sweet0) * o.winTime;
      // 弹弓逼近速率按区间宽度**反向补偿** → 「吃满」的收益与区间宽窄无关：
      // 窄区间只是更难按准（冰巨星、冥王星），不会让吃满的人变慢 → 通关时间与壳曲线不用重标。
      o.slingK = SLING_SWEET_PRODUCT / o.sweetTime;
      o.ratingSweet = o.sweetTime * RATING_SWEET_FRAC;
    }
  }
  deriveTiming(FLYBYS);

  // 航线在参数 u 处的局部「上」方向：ŷ 去掉沿切向的分量（航线有垂直起伏，不能直接用世界 ŷ）
  function routeUp(u, out) {
    var p0 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0];
    var e = 1e-4;
    routePos(u, p0);
    routePos(Math.min(1, u + e), p1);
    routePos(Math.max(0, u - e), p2);
    var tx = p1[0] - p2[0], ty = p1[1] - p2[1], tz = p1[2] - p2[2];
    var tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    var dot = ty;
    var ux = -tx * dot, uy = 1 - ty * dot, uz = -tz * dot;
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    out[0] = ux / ul; out[1] = uy / ul; out[2] = uz / ul;
    return out;
  }

  // 由航线反推天体摆位（掠过行星与「场上的其他行星」共用同一套机制）：
  //   1. 二分反解参数 u，使「航线点沿局部上抬升 h」后的天体距日**恰好 = 真实轨道半径**
  //      （航线的 xz 半径不等于 orbitR，还有垂直抬升与起伏，故必须反解而非直接换算）；
  //   2. 再把 u 吸附到航线采样点，天体锚在该点正上方 → 掠过/经过的水平偏移严格为 0。
  // 轨道半径比航线起点还小的天体（水星/金星）反解无解 → 返回 null，由调用方另摆。
  function routeStation(route, orbitR, h) {
    var tmpP = [0, 0, 0], tmpU = [0, 0, 0], tmpT = [0, 0, 0];
    routePos(0, tmpP);
    routeUp(0, tmpU);
    var reach0 = len3([tmpP[0] + tmpU[0] * h, tmpP[1] + tmpU[1] * h, tmpP[2] + tmpU[2] * h]);
    if (orbitR <= reach0) return null;
    var lo = 0, hi = 1, k, mid;
    for (k = 0; k < 48; k++) {
      mid = (lo + hi) * 0.5;
      routePos(mid, tmpP);
      routeUp(mid, tmpU);
      if (len3([tmpP[0] + tmpU[0] * h, tmpP[1] + tmpU[1] * h, tmpP[2] + tmpU[2] * h]) < orbitR) lo = mid; else hi = mid;
    }
    var idx = Math.round((lo + hi) * 0.5 * route.n);
    idx = Math.max(1, Math.min(route.n - 1, idx));
    var s = route.cum[idx];
    var px = route.pts[idx * 3], py = route.pts[idx * 3 + 1], pz = route.pts[idx * 3 + 2];
    // 注意：必须取**该采样点所在段**的切向（routeSample(s)），不能用 routeSample(s+1) ——
    // 航线在 u 上均匀采样、在空间上不均匀（内圈每段仅 ~0.4 单位），s+1 会跳到下一段，
    // 「上」方向随之偏斜，天体就不再正对掠过点。
    routeSample(route, s, null, tmpT);
    var dot = tmpT[1];
    var ux = -tmpT[0] * dot, uy = 1 - tmpT[1] * dot, uz = -tmpT[2] * dot;
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    return { idx: idx, u: idx / route.n, s: s, pos: [px + ux * h, py + uy * h, pz + uz * h] };
  }

  // 天体到航线的真实最近距离（航线会拐，可能比 h 略近一点）+ 最近点弧长
  function nearestRoute(route, pos, idx, half) {
    var lo = Math.max(0, idx - half), hi = Math.min(route.n, idx + half);
    var best = 1e18, bestS = route.cum[Math.max(0, Math.min(route.n, idx))];
    for (var j = lo; j <= hi; j++) {
      var ax = route.pts[j * 3] - pos[0], ay = route.pts[j * 3 + 1] - pos[1], az = route.pts[j * 3 + 2] - pos[2];
      var dd = Math.sqrt(ax * ax + ay * ay + az * az);
      if (dd < best) { best = dd; bestS = route.cum[j]; }
    }
    return { dist: best, s: bestS };
  }

  function buildFlybys(route) {
    var out = [];
    for (var i = 0; i < FLYBYS.length; i++) {
      var d = FLYBYS[i];
      var h = d.rad + d.clear;
      var stn = routeStation(route, d.orbitR, h);
      var nr = nearestRoute(route, stn.pos, stn.idx, 260);
      out.push({ def: d, u: stn.u, s: stn.s, h: h, pos: stn.pos, passDist: nr.dist, passS: nr.s });
    }
    return out;
  }

  // 场上的其他行星（水星/金星/火星）：只摆位、不参与判定
  function buildScenery(route) {
    var out = [];
    for (var i = 0; i < SCENERY.length; i++) {
      var d = SCENERY[i];
      var stn = d.place === 'route' ? routeStation(route, d.orbitR, d.rad + SCENERY_LIFT) : null;
      var pos, idx = 0, s = 0, h = 0;
      if (stn) { pos = stn.pos; idx = stn.idx; s = stn.s; h = d.rad + SCENERY_LIFT; }
      // 'behind'：航线起点内侧的行星摆在地球起点的同一方位角（航线 φ(0)=0）的黄道面上
      else pos = [d.orbitR, 0, 0];
      var nr = nearestRoute(route, pos, idx, stn ? 260 : 600);
      out.push({ def: d, pos: pos, s: s, h: h, passDist: nr.dist, passS: nr.s });
    }
    return out;
  }

  // ============================================================
  //  4. 速度 / 时机窗口 / 过热 常量
  // ============================================================
  var START_SPEED = 88;         // 开局速度
  var THRUST_ACC = 9.0;         // 满推加速度
  var DRAG_K = 0.036;           // 阻力 ∝ 速度（1/s），时间常数 ~28 s
  var SUBSTEP_TIME = 0.005;     // 固定子步（与帧率无关）
  var MAX_SUBSTEP = 400;

  // ---- 发动机：功率 → 温度 → 过热锁定（2026-09-26 重构）----
  // 旧版是两条互不相干的量：**温度**（唯一资源，按住恒定 +70/s、满则锁死）与
  // **功率**（从区间派生的瞬时读数 0/20/100/160%）。后果是「在过早区死按」与
  // 「在巡航段死按」烧穿温度的速度一模一样 —— 功率表再怎么动都不影响温度。
  // 现在串成一条因果链（旧「温度箱」变成**功率**，另起一个新**温度**箱）：
  //   功率（按住起转、松手回落）→ 温度按**当前功率档位**涨 → 满 = 过热锁定（与旧版一致）
  // 于是「功率越大越烫」成为可读的物理关系：过晚残效 20% 几乎不烫、
  // 脉冲乘波 160% 烫得最快，而**功率表指针的高度就是此刻的发热强度**。
  var PWR_MAX = 100;            // 功率满额
  var PWR_UP = 200;             // 起转：按住 0.5 s 到满功率（发动机响应时间）
  var PWR_DOWN = 200;           // 熄火：松手 0.5 s 功率归零（比散热快得多）
  var TEMP_MAX = 100;           // 温度满箱 → 过热锁定
  var TEMP_RATE = 75;           // 满功率时的温升速率（满功率恒温 ≈ 1.33 s 满箱）
  var COOL_RATE = 26;           // 降温速率：停机时降温；过热锁定后**强制降温**（按不按都一样，归零解锁 ≈ 3.85 s）
  var PULSE_THRUST_BOOST = 1.6; // 耀斑脉冲的额外推力加成（同时计入**功率档位** → 温升也 ×1.6；**不叠加弹弓**）

  // 加速窗口时长 / 最佳区间位置 / 弹弓逼近速率 / 评级阈值**都是逐行星的**，由质量派生
  // （见 §3 的 deriveTiming），这里只留与行星无关的部分。
  var LATE_EFF = 0.2;           // 过晚区间点火的残效
  var CRASH_RATIO = 0.72;       // 判定点速度 < vNeed×该比例 → 撞毁，否则 → 被捕获

  // ============================================================
  //  5. 氦闪膨胀壳
  // ============================================================
  // 壳半径是**时间的解析函数**（不逐帧积分）：便于标定、便于断言、不受帧率影响。
  //   shellR(t) = SHELL_START + SHELL_A·t + SHELL_B·t²   （线性 + 二次加速 = 越追越快）
  // 系数由「理想打法到达各行星的时间 + 余量」数值标定，见 DESIGN §8.4。
  var SHELL_START = 30;
  var SHELL_A = 48.22;
  var SHELL_B = 1.6282;
  // 耀斑脉冲：只加成**推力**，不再让壳额外膨胀 —— 壳曲线保持解析可断言。
  // 两次（12 / 26 s），都落在行星之间的巡航段：那里不是「过早」区，
  // 点火不会作废弹弓，所以脉冲期是白拿 ×1.6 的正规窗口。
  // 原来还有第 3 次 @40 s，实测不可达：单局最长 38.5 s（绿色吃 75% 压线逃出），
  // 更慢的打法会先被行星捕获（≤72%）或被壳吞掉（73–74%，37.5–38.3 s），永远走不到 40 s。
  var PULSE_TIMES = [12, 26];
  var PULSE_DUR = 1.0;
  var PULSE_WARN = 2.0;         // 预警提前量：足够看到提示并决定按不按（旧值 0.5 s 只够眨一下眼）

  // 氦闪壳半径（纯函数，渲染层与无头自检共用）
  function shellRadius(t) {
    return SHELL_START + SHELL_A * t + SHELL_B * t * t;
  }

  var INTRO_TIME = 2.6;         // 开场过场时长（秒）

  // ============================================================
  //  5b. 启动页（MOSS 自检）常量
  // ============================================================
  // 资源全部内联（贴图 / BGM / 引擎都是 base64 或同目录 js），真实加载只要一两百毫秒 ——
  // 启动页会**一闪而过**，玩家读不到「这是谁的屏、在为出发做什么准备」。
  // 故给启动页一段**最短停留**：BOOT_MIN_MS 就是那个**唯一旋钮**（改这一个数即可调长短）。
  // 停留期间按 BOOT_STEPS 逐项打勾自检清单，走满才交出操控权；
  // 期间**不推进开场过场**（introT 由 bootDone 门控），过场镜头不会在启动页背后放完。
  var BOOT_MIN_MS = 3000;
  // 走满之后再多留一拍：让「自检完成 · 移交操控权」这句话真的被看到
  // （否则 100% 与撤屏发生在同一帧，最后一句状态等于没写）
  var BOOT_TAIL_MS = 400;
  // t = 该项打勾的时刻（占 BOOT_MIN_MS 的比例）；k = 清单上的名字（与 index.html 的 .ld-line 一一对应）
  var BOOT_STEPS = [
    { t: 0.12, k: '轨道数据库' },
    { t: 0.32, k: '引力弹弓模型' },
    { t: 0.52, k: '行星发动机' },
    { t: 0.72, k: '氦闪预警' },
    { t: 0.90, k: '生命维持' }
  ];
  var BOOT_DONE_MSG = '自检完成 · 移交操控权';

  // ============================================================
  //  6. 相机常量（渲染层与无头自检共用）
  // ============================================================
  var CAM_BACK = 46;            // 基础跟拍距离
  var CAM_UP = 20;              // 相机抬升
  var CAM_AHEAD = 0.62;         // 注视点沿航线前移比例（占 camBack）
  var CAM_GAP_EASE = 55;        // 距壳该范围内开始拉远
  var CAM_PANIC_MAX = 1.55;     // 拉远上限
  var CAM_FOV = 60;             // 垂直视场角（度）
  var CAM_PAN_MAX = 0.55;       // 掠过行星时注视方向偏向行星的最大比例
  var CAM_PAN_LEAD = 3.2;       // 接近段：距判定点该秒数内开始偏
  var CAM_PAN_HOLD = 0.30;      // 掠过段：判定点之后仍保持偏移的秒数（必须很短）
  var CAM_PAN_TILT_MAX = 9;     // 掠过时注视方向被行星拉走的夹角上限（度）——见 chasePose 里的说明
  var STAR_SIZE = 9;

  var PLANET_GLOW_MAX = 0.30;   // 行星光晕最大不透明度（贴近时会被收掉，见渲染层）
  // 土星光环：环带用**真实比例**（D 环内缘 1.11 R → A 环外缘 2.27 R），环面摆在**土星赤道面**上
  // （法线 +Y）并叠加真实轴倾角 26.73°。
  // 为什么角度是关键：RingGeometry 默认躺在 XY 平面（法线 +Z），不旋转的话航线恰好从环带内
  // 穿过环面 —— 实测环带内最小垂距只有 0.15 单位（地球半径 3.41）→ 地球真的从环体里穿过去。
  // 摆到赤道面后同一测法的最小垂距是 30.3 单位 → 永不穿环。自检用同一个法线验算。
  var RING_IN = 1.11, RING_OUT = 2.27;                            // 环带（行星半径倍数，真实值）
  var SAT_TILT = 26.73 * Math.PI / 180;                           // 土星轴倾角（真实值）
  var RING_NORMAL = [0, Math.cos(SAT_TILT), Math.sin(SAT_TILT)];   // 环面法线（环面过行星中心）
  var MIRROR_BACK = 26;
  var MIRROR_UP = 6;
  var MIRROR_LOOK = 200;
  var MIRROR_FOV = 68;

  // 跟拍距离（纯函数）：只随「地球到壳的间隙」变化，绝不被无界膨胀的壳半径直接驱动
  function followDist(rSun, shellR) {
    var gap = rSun - shellR;
    var d = CAM_BACK;
    if (gap < CAM_GAP_EASE) {
      d *= 1 + (CAM_GAP_EASE - Math.max(0, gap)) / CAM_GAP_EASE * (CAM_PANIC_MAX - 1);
    }
    return Math.min(d, Math.max(18, rSun - SUN_R));
  }

  // 掠过的注视偏移（纯函数）：把「当前该不该看哪颗行星、看多重」算出来。
  //   out[0] = 行星下标（-1 表示不偏），out[1] = 权重 0..CAM_PAN_MAX
  // 关键点：窗口是**单侧**的。接近段有 CAM_PAN_LEAD 那么长（让行星早早点进画面），
  // 掠过段只有 CAM_PAN_HOLD（0.3 s）。若用 |s_i − s| 的对称窗口，判定点之后好几秒里
  // 视线还被拴在**已经在身后**的行星上，接着又被拉回航线 → 就是「刚穿过行星镜头猛地一沉」。
  function panAim(flybys, s, v, out) {
    var bestW = 0, bestI = -1, inv = 1 / Math.max(1e-3, v);
    for (var i = 0; i < flybys.length; i++) {
      var ttg = (flybys[i].s - s) * inv;         // > 0 = 还在前方
      var w = ttg >= 0 ? 1 - ttg / CAM_PAN_LEAD : 1 + ttg / CAM_PAN_HOLD;
      if (w > bestW) { bestW = w; bestI = i; }
    }
    out[0] = bestI;
    out[1] = Math.max(0, Math.min(1, bestW)) * CAM_PAN_MAX;
    return out;
  }

  // 跟拍姿态（纯函数，渲染层与无头自检共用）
  //   cam = {s, v, pos, tan, rSun, shellR, zoom}
  // 注意是**方向空间**插值：先把「航线注视方向」与「指向行星的方向」按权重合成再归一化，
  // 最后按原注视距离投射出去。若直接把注视点插值到行星位置，行星落到相机后方时
  // 注视点会跑到相机背后，lookAt 方向翻折 → 镜头乱甩。
  function chasePose(route, flybys, cam, outPos, outLook) {
    var ep = cam.pos, tn = cam.tan;
    var camBack = followDist(cam.rSun, cam.shellR) * cam.zoom;
    var ahead = camBack * CAM_AHEAD;
    outPos[0] = ep[0] - tn[0] * camBack;
    outPos[1] = ep[1] - tn[1] * camBack + CAM_UP * cam.zoom;
    outPos[2] = ep[2] - tn[2] * camBack;
    var lookS = cam.s + ahead;
    if (lookS >= route.len) {
      // 越过航线终点：让注视点沿末端切向继续外推。否则 routeSample 会把它夹回终点，
      // 而终点就是地球本体 —— 最后一瞬镜头会变成「盯着地球自己」，注视距离再塌掉。
      routeSample(route, route.len, _camEnd, _camTan);
      var over = lookS - route.len;
      _camBase[0] = _camEnd[0] + _camTan[0] * over;
      _camBase[1] = _camEnd[1] + _camTan[1] * over;
      _camBase[2] = _camEnd[2] + _camTan[2] * over;
    } else {
      routeSample(route, lookS, _camBase, null);
    }
    var dx = _camBase[0] - outPos[0], dy = _camBase[1] - outPos[1], dz = _camBase[2] - outPos[2];
    var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    panAim(flybys, cam.s, cam.v, _camAim);
    var w = _camAim[1];
    if (w > 0 && _camAim[0] >= 0) {
      var fp = flybys[_camAim[0]].pos;
      var px = fp[0] - outPos[0], py = fp[1] - outPos[1], pz = fp[2] - outPos[2];
      var pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
      // **抬升上限**：行星挂在航线几十单位之上（半径等比放大后更远），全额偏移会把注视
      // 方向抬高几十度，地球直接被顶出画面（实测离轴 42° > 30° 半视场）。故把「注视方向
      // 被行星拉走的夹角」限制在 CAM_PAN_TILT_MAX 以内：掠过时行星占画面上半、地球留在下半。
      // 注意只夹「拉走多少角」，不夹注意力权重 —— 行星该早进画面还是早进。
      var cosA = dx * (px / pl) + dy * (py / pl) + dz * (pz / pl);
      var angDeg = Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI;
      var wMax = angDeg > CAM_PAN_TILT_MAX ? CAM_PAN_TILT_MAX / angDeg : 1;
      if (w > wMax) w = wMax;
      dx = dx * (1 - w) + (px / pl) * w;
      dy = dy * (1 - w) + (py / pl) * w;
      dz = dz * (1 - w) + (pz / pl) * w;
      var nl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= nl; dy /= nl; dz /= nl;
    }
    outLook[0] = outPos[0] + dx * dl;
    outLook[1] = outPos[1] + dy * dl;
    outLook[2] = outPos[2] + dz * dl;
    return outLook;
  }
  var _camBase = [0, 0, 0], _camAim = [0, 0], _camEnd = [0, 0, 0], _camTan = [0, 0, 0];

  // 时机窗口相位（纯函数）：tToGo = 距判定点还有多少秒，winTime = **该行星**的窗口时长。
  // 窗口时长逐行星不同（质量越大引力影响范围越大 → 越早亮灯），所以必须显式传入。
  //   返回 < 0 → 尚未进入窗口；0..1 → 窗口内；> 1 → 已过判定点
  function flybyPhase(tToGo, winTime) {
    if (tToGo > winTime) return -1;
    if (tToGo < 0) return 2;
    return 1 - tToGo / winTime;
  }
  // 相位 → 区间。sweet0 / sweet1 同样逐行星（由质量派生）：引力越强，绿色区间越宽。
  function phaseZone(phase, sweet0, sweet1) {
    if (phase < 0) return 'appr';
    if (phase > 1) return 'done';
    if (phase < sweet0) return 'early';
    if (phase < sweet1) return 'sweet';
    return 'late';
  }
  // 常规推力效率（与 pulseActive 相乘）。最佳区间不走这里：它由「弹弓比例项」接管。
  function zoneEff(zone) {
    if (zone === 'late') return LATE_EFF;
    return 1;
  }

  // 掠过评级（纯函数）：把「三个区间各点了多久」翻译成等级 + 一句可执行的提示。
  // 玩家最需要知道的不是「过没过」，而是「刚才那次点火到底错在哪」——
  // 是按早了（白烧温度、吃不到弹弓）、按晚了（来不及）、还是根本没按。
  // ratingSweet = **该行星**的「吃满」阈值（= 它绿色区间时长 × RATING_SWEET_FRAC）：
  // 木星区间宽、阈值高，冥王星区间窄、阈值低 —— 但语义都是「把绿色区间吃满了」。
  // tip 会接在「绿色区间 X s / 完美线 Y s」后面显示，所以除首句外不再重复「绿色区间」四个字。
  function gradeFlyby(r, ok, ratingSweet) {
    var R = ratingSweet;
    // 「速度没到门槛但推过了」不算当场判死：地球照样掠过去了，欠账由氦闪壳在后面追讨。
    // 这条要排在 !ok 之前 —— 它确实没通过门槛，但要说清楚「还活着，只是慢了」。
    if (r.result === 'slow') {
      return {
        key: 'early', label: '轨道速度不足',
        tip: r.lostSling
          ? '弹弓增益已作废。轨道速度欠账，氦闪前壳正在逼近。'
          : '轨道速度欠账未弥补。氦闪前壳正在逼近。'
      };
    }
    if (!ok) return { key: 'fail', label: '引力捕获', tip: '通过判定点速度低于逃逸门槛。引力窗口内必须吃满推力。' };
    // 过早区间点过火 → 整次掠过失去弹弓机会，只能普通加速：评级最高封顶「弹弓增益损失」，绝不评完美弹弓
    if (r.lostSling) {
      if (r.sweet === 0 && r.early === 0 && r.late > 0) return { key: 'late', label: '点火延迟', tip: '窗口已关闭，残余推力不产生轨道增量。' };
      if (r.sweet === 0 && r.early === 0 && r.late === 0) return { key: 'none', label: '发动机未点火', tip: '全程未点火。轨道速度被星际阻力耗散。' };
      if (r.sweet === 0 && r.early > 0) return { key: 'early', label: '无效点火', tip: '全程窗口外点火。弹弓增益作废，发动机温升超限。' };
      return { key: 'good', label: '弹弓增益损失', tip: '过早点火，本次弹弓增益作废。绿色窗口开启前禁止点火。' };
    }
    if (r.sweet >= R) {
      return { key: 'perfect', label: '完美弹弓', tip: '引力弹弓增益已拉满，轨道速度达标。' };
    }
    if (r.sweet >= R * 0.45) {
      return { key: 'good', label: '弹弓增益未满', tip: '弹弓增益未满。绿色窗口内保持推力更久。' };
    }
    if (r.sweet > 0) {
      return { key: 'early', label: '提前点火', tip: '窗口外点火不增益，发动机温升无效。' };
    }
    if (r.late > 0) {
      return { key: 'late', label: '点火延迟', tip: '窗口已关闭，残余推力不产生轨道增量。' };
    }
    if (r.early > 0) {
      return { key: 'early', label: '无效点火', tip: '全程窗口外点火。弹弓增益作废，发动机温升超限。' };
    }
    return { key: 'none', label: '发动机未点火', tip: '全程未点火。轨道速度被星际阻力耗散。' };
  }
  function pulseActive(t) {
    for (var i = 0; i < PULSE_TIMES.length; i++) {
      var pt = PULSE_TIMES[i];
      if (t >= pt && t < pt + PULSE_DUR) return true;
    }
    return false;
  }
  // 距下一次脉冲开始还有几秒（没有下一次 → Infinity）。脉冲生效期内返回的是「到再下一次」，
  // 所以调用方要先用 pulseActive 判断是否正处于脉冲中。
  function pulseIn(t) {
    var best = Infinity;
    for (var i = 0; i < PULSE_TIMES.length; i++) {
      var d = PULSE_TIMES[i] - t;
      if (d > 0 && d < best) best = d;
    }
    return best;
  }
  // 脉冲提示（纯函数，渲染层与自检共用）：
  //   · 预警期（距脉冲 ≤ PULSE_WARN）报倒计时，让玩家有时间决定按不按；
  //   · 生效期报「现在能不能按」。
  // **必须按区间分叉**：在「过早」区按下去会作废本次弹弓（lostSling），
  // 若这时还挂一条「推力 ×1.6」，等于把玩家钓去毁掉整次掠过 —— 那是提示在害人。
  function pulseTip(t, zone) {
    var early = (zone === 'early');
    if (pulseActive(t)) {
      if (early) return '⚠ 太阳耀斑脉冲 ×' + PULSE_THRUST_BOOST + ' · 窗口外禁止点火';
      if (zone === 'appr' || zone === 'done') return '⚠ 太阳耀斑脉冲 ×' + PULSE_THRUST_BOOST + ' · 全功率推进';
      return '';   // 绿色区间由弹弓接管（加成不生效）、过晚已来不及：交给既有提示，不抢屏
    }
    var left = pulseIn(t);
    if (!(left <= PULSE_WARN)) return '';
    // 窗口期（过早/最佳/过晚）不刷预警：那几秒屏幕归时机条与边缘光，任何别的文案都是干扰。
    // 预警有 2 s，窗口只吃掉其中一段，剩下的时间足够看到；
    // 而「过早区别按」这条关键警告在生效期还会再出现一次，不会漏。
    if (zone !== 'appr' && zone !== 'done') return '';
    return '⚠ 太阳耀斑脉冲 ' + left.toFixed(1) + ' s 后 · 推力 ×' + PULSE_THRUST_BOOST;
  }

  // ---- 行星发动机（纯函数，渲染层与无头自检共用）----
  var ENGINE_COUNT = 48;
  var ENGINE_SHELL = 1.08;
  var ENGINE_AXIS = [0, 0, -1];
  function engineLayout() {
    var out = [];
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < ENGINE_COUNT; i++) {
      var ez = -0.05 - (i / (ENGINE_COUNT - 1)) * 0.95;
      var err = Math.sqrt(Math.max(0, 1 - ez * ez));
      var th = i * golden;
      out.push({
        pos: [Math.cos(th) * err * EARTH_R * ENGINE_SHELL,
              Math.sin(th) * err * EARTH_R * ENGINE_SHELL,
              ez * EARTH_R * ENGINE_SHELL],
        dir: ENGINE_AXIS.slice()
      });
    }
    return out;
  }

  // ============================================================
  //  7. 物理核心（纯 JS，无 THREE 依赖）
  // ============================================================
  function createGame(route) {
    var g = {};
    route = route || buildRoute();
    var flybys = buildFlybys(route);
    var scenery = buildScenery(route);      // 只摆位、不参与判定（水星/金星/火星）
    var nF = flybys.length;

    var st = g.state = {
      status: 'flying',
      reason: '', culprit: '',
      t: 0,
      s: 0,                    // 沿航线弧长
      v: START_SPEED,          // 沿航线速度
      acc: 0,                  // 固定子步累加器（保证帧率无关）
      pos: [0, 0, 0],
      tan: [0, 0, 0],
      rSun: 0, rSunAU: 0, speedKms: 0,
      shellR: SHELL_START, shellV: SHELL_A, shellAU: SHELL_START / AU,
      gap: 0,
      pwr: 0,                  // 发动机功率（按住起转、松手回落；过热锁定即熄火）
      heat: 0, overheated: false, overheatLeft: 0, thrustEff: 0, burning: false,
      pullTo: 0, slinging: false,   // 弹弓：本子步向 pullTo 逼近（0 = 未触发）
      slingK: 0,               // 当前行星的弹弓逼近速率（窄区间行星的 K 更大 → 吃满收益一致）
      pulseHot: false, pulseIn: -1,   // 脉冲生效中 / 距下一次脉冲还有几秒
      target: 0,               // 当前目标行星索引（-1 = 全部通过）
      tToGo: 0, phase: -1, zone: 'appr',
      vNeed: 0, safe: true,
      warn: '', warnKind: '',   // warnKind：'' 常规 / 'pulse' 耀斑脉冲（渲染层据此换样式）
      progress: 0,
      results: [],             // 每颗行星的掠过评级
      score: { perfect: 0, pass: 0, slow: 0 }   // slow = 弹弓作废、速度没到门槛但硬掠过去了（欠账留给氦闪壳）
    };
    for (var i = 0; i < nF; i++) st.results.push({ zone: '', sweet: 0, early: 0, late: 0, result: '', lostSling: false });

    var tmpP = [0, 0, 0], tmpT = [0, 0, 0];

    function syncFromS() {
      routeSample(route, st.s, st.pos, st.tan);
      st.rSun = len3(st.pos);
      st.rSunAU = st.rSun / AU;
      st.shellR = shellRadius(st.t);
      st.shellV = SHELL_A + 2 * SHELL_B * st.t;
      st.shellAU = st.shellR / AU;
      st.gap = st.rSun - st.shellR;
      st.progress = Math.min(1, st.s / route.len);
    }

    // 目标行星：航线前方第一颗未通过的行星
    function pickTarget() {
      for (var i = 0; i < nF; i++) {
        if (flybys[i].s > st.s) return i;
      }
      return -1;
    }

    function fail(status, reason, culprit) {
      st.status = status; st.reason = reason; st.culprit = culprit || '';
      st.burning = false; st.thrustEff = 0;
    }

    function substep(h, tNow) {
      // 速度：阻力 ∝ v；推力分两种形态 ——
      //   · 弹弓期（st.pullTo > 0）：a = st.slingK·(pullTo − v)，向该行星的弹弓速度**按比例逼近**。
      //     比例项意味着「落后越多拉得越猛」，所以前面吃得少不会一路崩到底（可追回）；
      //     slingK 是该行星自己的（区间越窄 K 越大），保证「吃满绿色区间」的收益与区间宽度无关。
      //   · 其余时刻：a = THRUST_ACC × **功率档位**（= 功率 × 区间效率 × 乘波，见上面的积分循环），
      //     也就是「油门踩多深」：巡航/过早 1×、过晚残效 0.2×、脉冲乘波 1.6×，过热熄火 0。
      //     同一档位也决定温升速率 —— 推力与发热共用同一个系数（温度 = ∫ 功率）。
      var acc = -DRAG_K * st.v;
      if (st.pullTo > 0) acc += st.slingK * (st.pullTo - st.v);
      else if (st.burning && st.thrustEff > 0) acc += THRUST_ACC * st.thrustEff;
      st.v = Math.max(1e-3, st.v + acc * h);
      st.s += st.v * h;
      st.shellR = shellRadius(tNow);

      if (st.s >= route.len) { st.s = route.len; st.status = 'escaped'; st.reason = '逃逸成功，航向比邻星'; return; }
      if (st.shellR >= st.rSun) {
        // 这局若吃过「弹弓作废」的亏，就把因果写进失败原因 —— 玩家才知道是被自己的过早烧没的
        var starved = false, kk;
        for (kk = 0; kk < nF; kk++) if (st.results[kk].result === 'slow') { starved = true; break; }
        fail('burned', starved ? '轨道速度不足，地球被氦闪前壳追上' : '地球被氦闪前壳吞没', '太阳');
        return;
      }
    }

    // 行星判定：过了判定点就结算速度。
    // **两种失败模式按原因分开**（这是设计意图，不是同一件事的两个名字）：
    //   · 过晚 / 没按 → 弹弓没作废，只是速度根本没拉起来 → 这颗行星当场抓住你（caught / crashed）
    //   · 过早过多 → 弹弓已被烧作废 → 地球照常掠过，只是速度上不去 → 交给身后的氦闪壳结账（延迟失败）
    // 旧版把「过早」也判成当场被捕获：两种原因同一个死法，且第一颗行星就是终点 —— 代价过高，
    // 也丢了「速度不够 → 被太阳追上」这条更有说服力的因果。
    function judge() {
      if (st.target < 0) return;
      var f = flybys[st.target];
      if (st.s < f.s) return;
      var need = f.def.vNeed, r = st.results[st.target];
      if (st.v < need) {
        // 真·撞毁：速度低到连大气层都擦不过去（三档判定的最低一档，仍然只在窗口里认）
        if (st.v < need * CRASH_RATIO) {
          r.result = 'crashed';
          fail('crashed', '轨道速度不足，坠入' + f.def.name + '大气层', f.def.name);
          return;
        }
        // 「这一关有没有真的推过」= 过早区间烧过、或绿色区间吃到过一点。
        // 都没碰过（只在过晚区间点、或完全没按）= 错过这个窗口 → 行星当场抓住你。
        // 推过却仍然不够快 = 速度欠账，不在行星这里结 —— 放它过去，交给身后的氦闪壳。
        if (r.early <= 0 && r.sweet <= 0) {
          r.result = 'caught';
          fail('caught', '轨道速度不足，被' + f.def.name + '引力捕获', f.def.name);
          return;
        }
        r.result = 'slow';
        st.score.slow++;
        st.target = pickTarget();
        return;
      }
      r.result = (!r.lostSling && r.sweet >= f.def.ratingSweet) ? 'perfect' : 'pass';
      if (r.result === 'perfect') st.score.perfect++; else st.score.pass++;
      st.target = pickTarget();
    }

    g.setBurning = function (on) {
      if (st.status !== 'flying') { st.burning = false; return; }
      st.burning = !!on;
    };

    g.step = function (dtReal) {
      if (st.status !== 'flying') { st.burning = false; return; }
      var dt = Math.min(0.25, Math.max(0, dtReal));
      st.acc += dt;
      var n = 0;
      var tNow = st.t;
      var tg = st.target;
      while (st.acc >= SUBSTEP_TIME && n < MAX_SUBSTEP) {
        // ---- 时机窗口（窗口时长与最佳区间都是**该行星自己的**，由质量派生）----
        tg = st.target;
        if (tg >= 0) {
          var fd = flybys[tg].def;
          var tToGo = (flybys[tg].s - st.s) / Math.max(1e-3, st.v);
          st.tToGo = tToGo;
          st.phase = flybyPhase(tToGo, fd.winTime);
          st.zone = phaseZone(st.phase, fd.sweet0, fd.sweet1);
          st.vNeed = fd.vNeed;
        } else {
          st.tToGo = 1e9; st.phase = 2; st.zone = 'done'; st.vNeed = 0;
        }
        // ---- 功率（发动机油门）：按住起转、松手回落；过热锁定即熄火 ----
        // 旧版这一步就是「温度」本身（按住恒定 +70/s）—— 现在它只是**功率**，
        // 温度要按功率档位再积一次（见下），所以「功率越大越烫」是被算出来的，不是文案。
        if (st.burning && !st.overheated) st.pwr = Math.min(PWR_MAX, st.pwr + PWR_UP * SUBSTEP_TIME);
        else st.pwr = Math.max(0, st.pwr - PWR_DOWN * SUBSTEP_TIME);
        // ---- 功率档位（发动机这一刻的有效输出）= 功率 × 区间效率 × 脉冲乘波 ----
        // 它同时是**推力系数**（普通推力项）与**温升系数** —— 这就是本次重构的耦合点：
        // 过晚残效 20% 几乎不烫、脉冲乘波 160% 烫得最快、起转未满时推力与发热一起爬升。
        // 绿色区间的速度增益由弹弓比例项接管、与功率档位无关（弹弓是引力，不是发动机）。
        var eff = (st.pwr / PWR_MAX) * zoneEff(st.zone);
        if (eff > 0 && pulseActive(tNow)) eff *= PULSE_THRUST_BOOST;
        st.thrustEff = (st.burning && !st.overheated) ? eff : 0;
        // ---- 温度：温升速率 ∝ 功率档位；停机降温 ----
        // **过热锁定 = 强制降温阶段**：无论手指按不按，温度都按 COOL_RATE 降。按住既不会升温、
        // 也不会重新起转（功率与推力全程 0），更不会打断降温进度 —— 点也白点，但也不受罚。
        // （旧规则是「按着不降温，必须松手」。它把「没松手」本身当成惩罚，代价是逼玩家先抬指再按；
        //   而惩罚其实由「强制停机这一段」就表达完了：过热 = 发动机停机 COOL_RATE 那段时长。）
        if (st.overheated) {
          st.heat = Math.max(0, st.heat - COOL_RATE * SUBSTEP_TIME);
          if (st.heat <= 0) st.overheated = false;
        } else if (st.burning) {
          st.heat = Math.min(TEMP_MAX, st.heat + TEMP_RATE * st.thrustEff * SUBSTEP_TIME);
          if (st.heat >= TEMP_MAX) { st.overheated = true; st.thrustEff = 0; }
        } else {
          st.heat = Math.max(0, st.heat - COOL_RATE * SUBSTEP_TIME);
        }
        // 最佳区间点火 → 切到弹弓形态
        // 但若本次掠过曾在「过早」区间点过火（lostSling），弹弓机会已作废，绿色区间也只给普通推力
        st.slinging = !!(st.burning && !st.overheated && st.zone === 'sweet' && tg >= 0 && !st.results[tg].lostSling);
        st.pullTo = st.slinging ? flybys[tg].def.vSling : 0;
        st.slingK = st.slinging ? flybys[tg].def.slingK : 0;
        // 分区累计点火时长：掠过后用来告诉玩家「刚才到底点得怎么样」
        if (tg >= 0 && st.burning && !st.overheated) {
          if (st.zone === 'sweet') st.results[tg].sweet += SUBSTEP_TIME;
          else if (st.zone === 'early') { st.results[tg].early += SUBSTEP_TIME; st.results[tg].lostSling = true; }
          else if (st.zone === 'late') st.results[tg].late += SUBSTEP_TIME;
        }
        st.safe = !(tg >= 0 && st.vNeed > 0 && st.v < st.vNeed);

        // ---- 积分 ----
        tNow += SUBSTEP_TIME;
        substep(SUBSTEP_TIME, tNow);
        st.acc -= SUBSTEP_TIME;
        n++;
        if (st.status !== 'flying') break;
        judge();
        if (st.status !== 'flying') break;
      }
      st.t = tNow;
      syncFromS();
      st.speedKms = st.v * KMS_PER_UNIT;
      st.pulseHot = pulseActive(st.t);
      st.pulseIn = pulseIn(st.t);
      // 提示文案：优先级 —— 过热 > 耀斑脉冲 > 过晚。
      // 不报速度缺口：过早区间里速度必然低于门槛（弹弓还没开始拉），那是正常状态
      // 而不是危险（基线打法实测 453 帧在过早区间误报、只有 51 帧落在绿色区间）。
      // 真正的危险由时机条红边与「过晚」文案负责。
      // 也**不报窗口开启倒计时**：巡航段提前告诉玩家「还有几秒亮窗口」等于把窗口送到嘴边，
      // 张力交给「行星越长越大 + 时机条滑入 + 绿色边缘光 + 进绿色区间的音效」去交代。
      st.warn = '';
      st.warnKind = '';
      st.overheatLeft = 0;
      var pulseTxt = pulseTip(st.t, st.zone);
      if (st.target >= 0) {
        var fdw = flybys[st.target].def;
        var toSweet = st.tToGo - (1 - fdw.sweet0) * fdw.winTime;  // 解锁截止 = 绿色区间开始
        if (st.overheated) {
          st.overheatLeft = st.heat / COOL_RATE;                  // 归零解锁还差几秒（强制降温，按不按都一样）
          st.warn = st.overheatLeft > toSweet
            ? '发动机过热锁定 · 本站窗口前无法解锁'
            : '发动机过热 · 强制冷却 ' + st.overheatLeft.toFixed(1) + ' s';
        } else if (pulseTxt) {
          st.warn = pulseTxt; st.warnKind = 'pulse';
        } else if (st.zone === 'late') {
          st.warn = '窗口关闭 · 已错过';
        }
      } else if (pulseTxt) {
        st.warn = pulseTxt; st.warnKind = 'pulse';
      }
    };

    g.reset = function () {
      st.status = 'flying'; st.reason = ''; st.culprit = '';
      st.t = 0; st.s = 0; st.v = START_SPEED; st.acc = 0;
      st.shellR = SHELL_START; st.shellV = SHELL_A;
      st.pwr = 0; st.heat = 0; st.overheated = false; st.overheatLeft = 0; st.thrustEff = 0; st.burning = false;
      st.pullTo = 0; st.slinging = false; st.slingK = 0;
      st.pulseHot = false; st.pulseIn = -1; st.target = 0; st.tToGo = 0; st.phase = -1; st.zone = 'appr';
      st.vNeed = flybys[0].def.vNeed; st.safe = false; st.warn = ''; st.warnKind = '';
      st.progress = 0;
      for (var i = 0; i < nF; i++) {
        st.results[i].zone = ''; st.results[i].sweet = 0; st.results[i].early = 0; st.results[i].late = 0; st.results[i].result = ''; st.results[i].lostSling = false;
      }
      st.score.perfect = 0; st.score.pass = 0; st.score.slow = 0;
      syncFromS();
    };

    // 自检/调参钩子：直接摆到某个弧长与速度
    g.debugSet = function (s, v) {
      st.s = s; st.v = v; st.acc = 0;
      st.target = pickTarget();
      syncFromS();
      if (st.target >= 0) st.vNeed = flybys[st.target].def.vNeed;
    };

    syncFromS();
    st.vNeed = flybys[0].def.vNeed;
    st.target = 0;
    st.speedKms = st.v * KMS_PER_UNIT;
    g.route = route;
    g.flybys = flybys;
    g.scenery = scenery;
    return g;
  }

  // ============================================================
  //  8. 导出（无头自检用）
  // ============================================================
  global.M3D = global.M3D || {};
  global.M3D.createGame = createGame;
  global.M3D.buildRoute = buildRoute;
  global.M3D.buildFlybys = buildFlybys;
  global.M3D.buildScenery = buildScenery;
  global.M3D.routeSample = routeSample;
  global.M3D.routePos = routePos;
  global.M3D.followDist = followDist;
  global.M3D.panAim = panAim;
  global.M3D.chasePose = chasePose;
  global.M3D.flybyPhase = flybyPhase;
  global.M3D.phaseZone = phaseZone;
  global.M3D.zoneEff = zoneEff;
  global.M3D.gradeFlyby = gradeFlyby;
  global.M3D.pulseActive = pulseActive;
  global.M3D.pulseIn = pulseIn;
  global.M3D.pulseTip = pulseTip;
  global.M3D.shellRadius = shellRadius;
  global.M3D.engineLayout = engineLayout;
  global.M3D.WORLD = {
    AU: AU, SUN_R: SUN_R, EARTH_R: EARTH_R,
    AU_KM: AU_KM, KM_PER_UNIT: KM_PER_UNIT, BODY_SCALE: BODY_SCALE,
    flybys: FLYBYS, scenery: SCENERY, sceneryLift: SCENERY_LIFT, routeLen: buildRoute().len,
    route: buildRoute()
  };
  global.M3D.CONST = {
    START_SPEED: START_SPEED, THRUST_ACC: THRUST_ACC, DRAG_K: DRAG_K,
    PWR_MAX: PWR_MAX, PWR_UP: PWR_UP, PWR_DOWN: PWR_DOWN,
    TEMP_MAX: TEMP_MAX, TEMP_RATE: TEMP_RATE, COOL_RATE: COOL_RATE,
    WIN_MIN: WIN_MIN, WIN_MAX: WIN_MAX, SWEET_HI: SWEET_HI,
    SWEET_LO_NARROW: SWEET_LO_NARROW, SWEET_LO_WIDE: SWEET_LO_WIDE,
    SLING_SWEET_PRODUCT: SLING_SWEET_PRODUCT, RATING_SWEET_FRAC: RATING_SWEET_FRAC,
    LATE_EFF: LATE_EFF, CRASH_RATIO: CRASH_RATIO,
    SHELL_START: SHELL_START, SHELL_A: SHELL_A, SHELL_B: SHELL_B,
    PULSE_TIMES: PULSE_TIMES, PULSE_DUR: PULSE_DUR, PULSE_WARN: PULSE_WARN,
    PULSE_THRUST_BOOST: PULSE_THRUST_BOOST,
    KMS_PER_UNIT: KMS_PER_UNIT, SUN_ESCAPE_KMS_1AU: SUN_ESCAPE_KMS_1AU,
    CAM_BACK: CAM_BACK, CAM_UP: CAM_UP, CAM_AHEAD: CAM_AHEAD,
    CAM_GAP_EASE: CAM_GAP_EASE, CAM_PANIC_MAX: CAM_PANIC_MAX, CAM_FOV: CAM_FOV,
    CAM_PAN_MAX: CAM_PAN_MAX, CAM_PAN_LEAD: CAM_PAN_LEAD, CAM_PAN_HOLD: CAM_PAN_HOLD, STAR_SIZE: STAR_SIZE,
    CAM_PAN_TILT_MAX: CAM_PAN_TILT_MAX,
    RING_IN: RING_IN, RING_OUT: RING_OUT, SAT_TILT: SAT_TILT, RING_NORMAL: RING_NORMAL.slice(),
    ENGINE_COUNT: ENGINE_COUNT, ENGINE_SHELL: ENGINE_SHELL, ENGINE_AXIS: ENGINE_AXIS.slice(),
    INTRO_TIME: INTRO_TIME,
    BOOT_MIN_MS: BOOT_MIN_MS, BOOT_STEPS: BOOT_STEPS, BOOT_DONE_MSG: BOOT_DONE_MSG
  };

  // ============================================================
  //  9. 渲染层（依赖 THREE + DOM；无 THREE 时跳过）
  // ============================================================
  if (typeof THREE === 'undefined' || typeof document === 'undefined') return;

  var canvas = document.getElementById('stage');
  var gl = null;
  try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) { }
  if (!gl) {
    document.getElementById('fallback').classList.add('show');
    document.getElementById('loader').classList.add('hide');
    return;
  }

  var W = innerWidth, H = innerHeight, DPR = Math.min(devicePixelRatio || 1, 1.5);
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(CAM_FOV, W / H, 0.5, 60000);

  // ---- 星空：天球用顶点色（无贴图），星点用 Points 点精灵 ----
  // 相机在天球内部，屏幕只截取约 60° 视场，任何「画在贴图上」的天球内容
  // 都会被放大量化台阶 → 满屏白色方格子（详见 DESIGN §10）。顶点色是连续插值，放大多少倍都平滑。
  (function () {
    var SKY_R = 16000;
    var geo = new THREE.SphereGeometry(SKY_R, 96, 64);
    var pos = geo.attributes.position, n = pos.count;
    var col = new Float32Array(n * 3);
    var DARK = [0.0022, 0.0032, 0.0070];
    var LIGHT = [0.0032, 0.0048, 0.0115];
    var GLOW = [0.0100, 0.0130, 0.0245];
    var GBX = -Math.sin(0.35), GBY = Math.cos(0.35), GSIG = 0.30;
    for (var i = 0; i < n; i++) {
      var vx = pos.getX(i) / SKY_R, vy = pos.getY(i) / SKY_R, vz = pos.getZ(i) / SKY_R;
      var k = Math.pow(1 - Math.abs(vy), 0.7);
      var d = vx * GBX + vy * GBY;
      var f = Math.sin(vx * 4.1 + 1.3) * Math.sin(vz * 3.7 - 0.6) * Math.sin(vy * 5.9 + 2.4);
      var band = Math.exp(-(d * d) / (2 * GSIG * GSIG)) * (0.6 + 0.4 * f);
      for (var ch = 0; ch < 3; ch++) {
        col[i * 3 + ch] = DARK[ch] + (LIGHT[ch] - DARK[ch]) * k + GLOW[ch] * band;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false })));
  })();

  var glowTex = (function () {
    var s = 32, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.2)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.04)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  })();

  (function () {
    // 星点：很小的亮核 + 快速衰减。size 小于 ~8px 时点精灵只采到贴图中心那点纯白 → 实心白方块
    var n = 3200, R = 15200;
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * TAU, rr = Math.sqrt(Math.max(0, 1 - u * u));
      pos[i * 3] = Math.cos(th) * rr * R; pos[i * 3 + 1] = u * R; pos[i * 3 + 2] = Math.sin(th) * rr * R;
      var b = 0.22 + Math.random() * 0.73;
      col[i * 3] = b; col[i * 3 + 1] = b * (0.96 + Math.random() * 0.06); col[i * 3 + 2] = Math.min(1, b * 1.06);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: STAR_SIZE * DPR, sizeAttenuation: false, map: glowTex, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.Points(geo, mat));
  })();

  // ---- 光照 ----
  scene.add(new THREE.AmbientLight(0x1e3a34, 0.6));
  var sunLight = new THREE.PointLight(0xfff2d0, 2.5, 0, 1.2);
  sunLight.position.set(0, 0, 0); scene.add(sunLight);

  function dataTex(uri) {
    if (typeof uri !== 'string') return null;
    var img = new Image();
    var tex = new THREE.Texture(img);
    tex.encoding = THREE.sRGBEncoding;
    img.onload = function () { tex.needsUpdate = true; };
    img.src = uri;
    return tex;
  }
  function plainTex(col) {
    var c = document.createElement('canvas'); c.width = c.height = 4;
    var x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 4, 4);
    return new THREE.CanvasTexture(c);
  }
  function procPlanetTex(base) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256;
    var x = c.getContext('2d');
    var br = (base >> 16) & 255, bg = (base >> 8) & 255, bb = base & 255;
    x.fillStyle = 'rgb(' + br + ',' + bg + ',' + bb + ')'; x.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 14; i++) {
      var y = (i / 14) * 256;
      x.fillStyle = 'rgba(255,255,255,' + (0.06 + Math.random() * 0.1) + ')';
      x.fillRect(0, y, 512, 6 + Math.random() * 10);
    }
    for (var j = 0; j < 40; j++) {
      x.fillStyle = 'rgba(' + br + ',' + bg + ',' + bb + ',' + (0.1 + Math.random() * 0.15) + ')';
      x.beginPath(); x.arc(Math.random() * 512, Math.random() * 256, 8 + Math.random() * 25, 0, 6.283); x.fill();
    }
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // ---- 太阳（同时也是氦闪膨胀壳的贴图）----
  // 壳是把同一个 sunGroup 整体放大 shellR / SUN_R 倍（开局就是 3×，终局 40×+），
  // 所以这张贴图会被"吹"得很大：颗粒画得太小太密，放大后就不再是"沸腾表面"，
  // 而是满屏高频噪点（后视镜里尤其明显）。改用大而软的斑块，放大后仍读得出层次。
  function sunTex() {
    var c = document.createElement('canvas'); c.width = c.height = 512;
    var x = c.getContext('2d');
    x.fillStyle = '#ff7a14'; x.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 260; i++) {
      var px = Math.random() * 512, py = Math.random() * 512, r = 16 + Math.random() * 52;
      var g = x.createRadialGradient(px, py, 0, px, py, r);
      var bright = 190 + Math.random() * 65 | 0;
      g.addColorStop(0, 'rgba(255,' + bright + ',' + (60 + Math.random() * 90 | 0) + ',' + (0.30 + Math.random() * 0.34).toFixed(2) + ')');
      g.addColorStop(1, 'rgba(255,' + bright + ',60,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
    }
    for (var j = 0; j < 900; j++) {   // 一点点细颗粒，别太密
      x.fillStyle = 'rgba(255,' + (200 + Math.random() * 55 | 0) + ',' + (90 + Math.random() * 80 | 0) + ',0.16)';
      x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 9, 0, 6.283); x.fill();
    }
    return new THREE.CanvasTexture(c);
  }
  var sunGroup = new THREE.Group(); scene.add(sunGroup);
  sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 48), new THREE.MeshBasicMaterial({ map: sunTex() })));
  sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.25, 36, 28), new THREE.MeshBasicMaterial({ color: 0xff7a14, side: THREE.BackSide, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false })));
  sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.8, 32, 24), new THREE.MeshBasicMaterial({ color: 0xff4a14, side: THREE.BackSide, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false })));

  // ---- 地球（冰封场景：真实贴图 + 冷色 tint + 半透明冰壳叠加）----
  function iceOverlayTex() {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    var x = c.getContext('2d');
    for (var i = 0; i < 55; i++) {
      var px = Math.random() * 1024, py = Math.random() * 512, r = 40 + Math.random() * 120;
      var g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(225,238,250,0.55)');
      g.addColorStop(0.55, 'rgba(190,215,238,0.30)');
      g.addColorStop(1, 'rgba(190,215,238,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
    }
    x.fillStyle = 'rgba(245,250,255,0.65)';
    x.fillRect(0, 0, 1024, 58); x.fillRect(0, 454, 1024, 58);
    x.strokeStyle = 'rgba(18,38,66,0.35)'; x.lineWidth = 1.2;
    for (var j = 0; j < 40; j++) {
      x.beginPath(); var sx = Math.random() * 1024, sy = 64 + Math.random() * 384;
      x.moveTo(sx, sy);
      for (var k = 0; k < 5; k++) { sx += (Math.random() - 0.5) * 80; sy += (Math.random() - 0.5) * 80; x.lineTo(sx, sy); }
      x.stroke();
    }
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  var earthGroup = new THREE.Group(); scene.add(earthGroup);
  // **南极洲朝前**：SphereGeometry 的南极在 -Y，而本组的 +Z 才是航向（羽流朝 -Z 喷）。
  // 把承载球体的这一组绕 X 轴转 **-90°** → 南极（-Y）落到 +Z（= 正前方）。
  // 自检推算（也写进 tests）：rotation.x = θ 时，镜头那一侧看到的点 = R_x(-θ)·(0,0,-1)，
  //   θ = -90° → 局部 +Y = **北极**朝镜头（南极在正前方，背对镜头）✅ 要的就是这个；
  //   θ = +90° → 局部 -Y = **南极**朝镜头 → 南极变成「向后」❌（2026-09-27 实机反馈踩到过）。
  // 所以符号必须是 -1；若哪天换贴图或改相机，先翻这一行再按下面对照表验一次。
  // 判定口径：镜头正对的那一侧中心应是**灰白海冰 + 四周有陆地**（北极），
  //           而**一整块白色大陆**（南极洲）只出现在飞行正前方、背对镜头。
  var EARTH_POLE_SIGN = -1;  // +1 / -1：南极朝行进方向（-1）还是朝镜头（+1）
  var earthBody = new THREE.Group();
  earthBody.rotation.x = EARTH_POLE_SIGN * Math.PI / 2;
  earthGroup.add(earthBody);
  var earthMat = new THREE.MeshStandardMaterial({ map: dataTex(global.EARTH_TEXTURE_URI) || plainTex('#3a5a7a'), color: 0x8aa8c8, roughness: .8, metalness: .06 });
  earthBody.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 48, 32), earthMat));
  earthBody.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.004, 48, 32),
    new THREE.MeshStandardMaterial({ map: iceOverlayTex(), transparent: true, opacity: .75, roughness: .9, metalness: .02, depthWrite: false })));
  earthBody.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.012, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xdde8f5, transparent: true, opacity: .2, roughness: 1, depthWrite: false })));
  earthBody.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.06, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x4a86c8, side: THREE.BackSide, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false })));

  // 发动机羽流统一成**薄荷白**（0x8af2d4）：整屏主色改成绿之后，青蓝的等离子焰
  // 会成了画面上唯一一块蓝 —— 加色混合下它仍读作「白热」，只是偏绿。
  var thrustFlame = new THREE.Mesh(new THREE.ConeGeometry(EARTH_R * 0.35, EARTH_R * 1.8, 12),
    new THREE.MeshBasicMaterial({ color: 0x8af2d4, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  thrustFlame.visible = false; earthGroup.add(thrustFlame);

  var _flameAxis = new THREE.Vector3(0, 1, 0), _flameDir = new THREE.Vector3();
  var _zAxis = new THREE.Vector3(0, 0, 1), _negZAxis = new THREE.Vector3(0, 0, -1);
  var _targetQuat = new THREE.Quaternion();

  // ---- 行星发动机 ----
  // 2026-09-27：原先 48 台只画了本体（一小枚锥体）+ 中间一束主焰 —— 远看是「地球后面挂了一根棒」，
  // 看不出「上万台发动机同时在喷」。现在每台**自带一道等离子柱**：
  //   · 柱体 = 同一份几何 + 同一份材质（48 个 Mesh 只改 visible / scale，不新建材质）
  //   · 柱长随推力实时变（点火起转时从短到长），并叠一点高频抖动 —— 等离子不是稳定水流
  //   · 底座锚在发动机上：只缩放长度时同步改 z，锥底才不会跟着往前爬
  var engineGroup = new THREE.Group(); earthGroup.add(engineGroup);
  var engines = [], plumes = [];
  var engineGeo = new THREE.ConeGeometry(EARTH_R * 0.062, EARTH_R * 0.5, 6);
  var engineQuat = new THREE.Quaternion().setFromUnitVectors(_flameAxis, _negZAxis);
  var PLUME_LEN = EARTH_R * 1.15;
  var plumeGeo = new THREE.ConeGeometry(EARTH_R * 0.05, PLUME_LEN, 6);
  var plumeMat = new THREE.MeshBasicMaterial({
    color: 0x8af2d4, transparent: true, opacity: .5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  var engineSlots = engineLayout();
  for (var ei = 0; ei < engineSlots.length; ei++) {
    var ep = engineSlots[ei].pos;
    var cone = new THREE.Mesh(engineGeo, new THREE.MeshBasicMaterial({ color: 0x8af2d4, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
    cone.position.set(ep[0], ep[1], ep[2]);
    cone.quaternion.copy(engineQuat);
    engineGroup.add(cone);
    engines.push(cone);

    var plume = new THREE.Mesh(plumeGeo, plumeMat);
    plume.quaternion.copy(engineQuat);
    plume.position.set(ep[0], ep[1], ep[2] - PLUME_LEN / 2);
    plume.visible = false;
    plume.userData.seed = ei * 1.7;
    plume.userData.z0 = ep[2];
    engineGroup.add(plume);
    plumes.push(plume);
  }

  // ---- 物理 ----
  var game = createGame();
  var st = game.state;
  var route = game.route, flybys = game.flybys, scenery = game.scenery;

  // ---- 航线可视化：一串发光点沿航线铺开（「固定线路」要一眼可读）----
  (function () {
    var step = 14, n = Math.floor(route.len / step);
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    var p = [0, 0, 0];
    for (var i = 0; i < n; i++) {
      routeSample(route, (i + 0.5) * step, p, null);
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      col[i * 3] = 0.16; col[i * 3 + 1] = 0.42; col[i * 3 + 2] = 0.62;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 5 * DPR, sizeAttenuation: false, map: glowTex, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    })));
  })();

  // ---- 行星 + 判定环 ----
  // 球体 + 柔光两个网格的构造抽出来共用（掠过行星与「场上其他行星」用同一套外观规则）：
  // 光晕是**世界尺寸固定**的加色 sprite（不随距离缩小），所以贴脸掠过时必须收掉，
  // 否则 40+ 单位的白色加色面片会糊满整屏（木星会糊成一片橙白，纹理全看不见）。
  // 光晕下限按**近场尺度（地球半径）**取，不用绝对单位：真实比例下冥王星半径只有
  // 0.24 单位，一个 10 单位的光晕是它自身的 42 倍 —— 等于用假面片冒充一颗大行星。
  function makePlanetBody(rad, tex, colorHex) {
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(rad, 40, 28),
      new THREE.MeshStandardMaterial({ map: tex, roughness: .85 }));
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: colorHex, transparent: true, opacity: PLANET_GLOW_MAX, blending: THREE.AdditiveBlending, depthWrite: false }));
    var glowR = Math.max(rad * 2.2, EARTH_R * 0.8);
    glow.scale.set(glowR, glowR, 1);
    return { mesh: mesh, glow: glow };
  }
  var planetMeshes = [], gateMeshes = [];
  for (var pi = 0; pi < flybys.length; pi++) {
    (function (fb) {
      var def = fb.def;
      var pcol = def.color;
      // 优先真实影像；内联数据缺失时退回程序化色块（procPlanetTex）
      var tex = def.tex ? (dataTex(global[def.tex]) || procPlanetTex(pcol)) : procPlanetTex(pcol);
      var body = makePlanetBody(def.rad, tex, pcol);
      var mesh = body.mesh, glow = body.glow;
      mesh.position.set(fb.pos[0], fb.pos[1], fb.pos[2]);
      scene.add(mesh);
      glow.position.set(fb.pos[0], fb.pos[1], fb.pos[2]);
      scene.add(glow);
      var ring = null;
      if (def.ring) {
        ring = new THREE.Mesh(new THREE.RingGeometry(def.rad * RING_IN, def.rad * RING_OUT, 72),
          new THREE.MeshBasicMaterial({ color: 0xd4c89c, side: THREE.DoubleSide, transparent: true, opacity: .55, depthWrite: false }));
        ring.position.set(fb.pos[0], fb.pos[1], fb.pos[2]);
        // 环面朝向 = 土星赤道面：RingGeometry 默认法线 +Z，先放平（法线 +Y），再叠真实轴倾角 26.73°。
        // 这一步同时是「地球不穿环」的几何保证（见 RING_IN/RING_OUT 处的说明与自检断言）。
        ring.rotation.x = -Math.PI / 2 + SAT_TILT;
        scene.add(ring);
      }
      // 判定环：垂直于航线、正好套在地球必经之处 —— 玩家一眼知道「要在这里通过」
      var gate = new THREE.Mesh(new THREE.TorusGeometry(EARTH_R * 2.6, EARTH_R * 0.16, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0x45e0b0, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
      var gp = [0, 0, 0], gt = [0, 0, 0];
      routeSample(route, fb.s, gp, gt);
      gate.position.set(gp[0], gp[1], gp[2]);
      gate.quaternion.setFromUnitVectors(_zAxis, new THREE.Vector3(gt[0], gt[1], gt[2]).normalize());
      scene.add(gate);
      planetMeshes.push({ mesh: mesh, ring: ring, glow: glow, rad: def.rad });
      gateMeshes.push(gate);
    })(flybys[pi]);
  }

  // ---- 场上其他行星（水星 / 金星 / 火星）----
  // 没有判定环、没有时机窗口、不参与判定：它们只是**在各自轨道上存在着**。
  // 半径与距日都按真实数据（同一 BODY_SCALE / AU 换算），所以真实比例下它们很小
  // （水星 0.49 / 金星 1.21 / 火星 0.68 单位）——近处靠球体、远处靠柔光与小地图识别。
  for (var sci = 0; sci < scenery.length; sci++) {
    (function (sc) {
      var d = sc.def;
      var stex = d.tex ? (dataTex(global[d.tex]) || procPlanetTex(d.color)) : procPlanetTex(d.color);
      var body = makePlanetBody(d.rad, stex, d.color);
      body.mesh.position.set(sc.pos[0], sc.pos[1], sc.pos[2]);
      body.glow.position.set(sc.pos[0], sc.pos[1], sc.pos[2]);
      scene.add(body.mesh);
      scene.add(body.glow);
      planetMeshes.push({ mesh: body.mesh, ring: null, glow: body.glow, rad: d.rad });
    })(scenery[sci]);
  }

  // ---- 音频（WebAudio；移动端必须首次触摸才解锁）----
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null, rumbleGain = null;
  function initAudio() {
    if (!AC || actx) return;
    try { actx = new AC(); } catch (e) { return; }
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    bgmBus = actx.createGain(); bgmBus.gain.value = 1; bgmBus.connect(actx.destination);
    var len = (actx.sampleRate * 2) | 0;
    var buf = actx.createBuffer(1, len, actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    var lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130;
    rumbleGain = actx.createGain(); rumbleGain.gain.value = 0;
    src.connect(lp); lp.connect(rumbleGain); rumbleGain.connect(actx.destination);
    src.start();
    bgmLoad();
  }

  // ---- 背景音乐：assets/bgm-data.js 里内联的整曲 base64 ----
  // 为什么不放 .mp3 文件、也不用 <audio src>：小工具容器上传白名单不收音频扩展名，
  // 且 file:// 直接打开时 fetch 会被跨域拦。改成「base64 藏进 .js → atob → decodeAudioData
  // → Web Audio 播放」，全程不产生任何 URL，与贴图的 *_data.js 内联是同一套思路。
  // 循环不是 src.loop=true（接缝会有咔哒声），而是手动排期：每遍提前 XFADE 秒起下一遍、
  // 交叠处一条淡出对一条淡入，接缝听不出来。
  var bgmBus = null, bgmBuf = null, bgmLoaded = false;
  var BGM_XFADE = 3, BGM_TICK_MS = 500, BGM_GAIN = 0.42;
  var bgmOn = true, bgmTimer = null, bgmNextAt = 0, bgmFirstPass = true, bgmPasses = [];
  var elMute = document.getElementById('mute');
  try { bgmOn = localStorage.getItem('we3d_bgm') !== '0'; } catch (e) { bgmOn = true; }

  function bgmLoad() {
    if (!actx || bgmLoaded) return;
    var b64 = window.WE_BGM_B64;
    if (typeof b64 !== 'string' || !b64) return;   // 没带音频文件时静默降级（音效仍可用）
    bgmLoaded = true;
    try {
      var bin = atob(b64), n = bin.length, arr = new Uint8Array(n);
      for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
      actx.decodeAudioData(arr.buffer, function (buf) {
        bgmBuf = buf;
        if (bgmOn) bgmStart();
      }, function () { bgmLoaded = false; });
    } catch (e) { bgmLoaded = false; }
  }

  // 排期器：把「下一遍」提前排在当前遍的尾/头交叠处
  function bgmTick() {
    if (!actx || !bgmBuf || !bgmOn) return;
    var D = bgmBuf.duration;
    var X = Math.min(BGM_XFADE, D * 0.2);
    var L = D - X;
    var now = actx.currentTime;
    if (bgmNextAt < now + 0.05) bgmNextAt = now + 0.08;
    while (bgmNextAt < now + 1.2) {
      var at = bgmNextAt;
      var src = actx.createBufferSource(), g = actx.createGain();
      src.buffer = bgmBuf; src.connect(g); g.connect(bgmBus);
      var fin = bgmFirstPass ? Math.min(X, 1.0) : X;   // 首遍快速淡入，别让玩家干等
      bgmFirstPass = false;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(BGM_GAIN, at + fin);
      g.gain.setValueAtTime(BGM_GAIN, at + L);
      g.gain.linearRampToValueAtTime(0.0001, at + D);
      src.start(at); src.stop(at + D + 0.05);
      bgmPasses.push({ src: src, endsAt: at + D });
      bgmNextAt = at + L;
    }
    for (var i = bgmPasses.length - 1; i >= 0; i--) {
      if (bgmPasses[i].endsAt < now - 0.5) {
        try { bgmPasses[i].src.disconnect(); } catch (e) { }
        bgmPasses.splice(i, 1);
      }
    }
  }
  function bgmStart() {
    if (!actx || !bgmBuf || !bgmOn || bgmTimer) return;
    bgmFirstPass = true;
    bgmNextAt = actx.currentTime + 0.08;
    bgmTick();
    bgmTimer = setInterval(bgmTick, BGM_TICK_MS);
  }
  function bgmStop() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    var ps = bgmPasses; bgmPasses = [];
    for (var i = 0; i < ps.length; i++) {
      try { ps[i].src.stop(); } catch (e) { }
      try { ps[i].src.disconnect(); } catch (e) { }
    }
    bgmNextAt = 0;
  }
  function bgmSet(on) {
    bgmOn = !!on;
    try { localStorage.setItem('we3d_bgm', bgmOn ? '1' : '0'); } catch (e) { }
    if (bgmOn) bgmStart(); else bgmStop();
    if (elMute) {
      elMute.classList.toggle('off', !bgmOn);
      elMute.setAttribute('aria-label', bgmOn ? '关闭背景音乐' : '开启背景音乐');
    }
  }
  if (elMute) {
    elMute.classList.toggle('off', !bgmOn);
    elMute.addEventListener('click', function (e) {
      e.stopPropagation();
      initAudio();
      bgmSet(!bgmOn);
    });
  }
  // 切到后台就挂起整个音频上下文（BGM 与音效一起静音），回来再续上
  document.addEventListener('visibilitychange', function () {
    if (!actx) return;
    try { document.hidden ? actx.suspend() : actx.resume(); } catch (e) { }
  });
  function sfxOsc(type, f0, f1, dur, vol) {
    if (!actx || actx.state !== 'running') return;
    var t0 = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfxBoom() { sfxOsc('sawtooth', 90, 28, 0.9, 0.45); sfxOsc('sine', 55, 20, 1.2, 0.55); }
  function sfxSling() { sfxOsc('sawtooth', 240, 900, 0.55, 0.3); sfxOsc('sine', 420, 1320, 0.5, 0.2); }
  function sfxMiss() { sfxOsc('square', 300, 120, 0.35, 0.18); }
  function sfxOverheat() { sfxOsc('square', 360, 110, 0.4, 0.2); }
  function sfxReady() { sfxOsc('sine', 660, 990, 0.25, 0.14); }
  function sfxWin() { sfxOsc('sine', 523, 784, 0.5, 0.25); setTimeout(function () { sfxOsc('sine', 659, 1046, 0.8, 0.25); }, 220); }
  function sfxLose() { sfxOsc('sine', 220, 60, 1.1, 0.35); }

  // ---- 输入：按住屏幕 = 点火（唯一操作）----
  // 整块画布就是按钮：没有可点的落点、没有死角，单手随便按哪儿都算。
  // 松手监听挂在 window 上（不是画布），否则手指滑出画布/被系统手势打断时会一直烧着。
  var pointer = null, pointers = {}, pinchDist = 0, userZoom = 1;
  function canControl() { return st.status === 'flying' && introT >= INTRO_TIME && briefClosed; }

  canvas.addEventListener('pointerdown', function (e) {
    initAudio();
    if (!canControl()) return;
    if (e.isPrimary === false) return;
    pointer = e.pointerId;
    game.setBurning(true);
    hideTip();
  });
  function endPointer(e) {
    if (pointer === null) return;
    if (e && e.pointerId !== undefined && e.pointerId !== pointer) return;
    pointer = null;
    game.setBurning(false);
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  // 双指捏合：相机距离微调
  canvas.addEventListener('pointerdown', function (e) { pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; });
  function dropPointer(e) { delete pointers[e.pointerId]; if (Object.keys(pointers).length < 2) pinchDist = 0; }
  canvas.addEventListener('pointerup', dropPointer);
  canvas.addEventListener('pointercancel', dropPointer);
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
      if (pinchDist > 0) userZoom = Math.max(0.6, Math.min(1.9, userZoom * (d / pinchDist)));
      pinchDist = d;
    }
  });

  // ---- 相机：跟拍航线 + 掠过行星时注视方向偏向行星 ----
  var camPos = new THREE.Vector3(0, 900, 0.01), camLook = new THREE.Vector3(0, 0, 0);
  var introT = 0;
  var _cam = { s: 0, v: 1, pos: null, tan: null, rSun: 0, shellR: 0, zoom: 1 };
  function camState() {
    _cam.s = st.s; _cam.v = st.v; _cam.pos = st.pos; _cam.tan = st.tan;
    _cam.rSun = st.rSun; _cam.shellR = st.shellR; _cam.zoom = userZoom;
    return _cam;
  }

  var _tp = [0, 0, 0], _tl = [0, 0, 0];
  function updateCamera(dt) {
    chasePose(route, flybys, camState(), _tp, _tl);
    var k = 1 - Math.exp(-dt * 4.5);
    camPos.x += (_tp[0] - camPos.x) * k; camPos.y += (_tp[1] - camPos.y) * k; camPos.z += (_tp[2] - camPos.z) * k;
    camLook.x += (_tl[0] - camLook.x) * k; camLook.y += (_tl[1] - camLook.y) * k; camLook.z += (_tl[2] - camLook.z) * k;
    camera.position.copy(camPos); camera.lookAt(camLook);
  }

  // ---- 尾向观测窗（代码里仍叫 mirror）：单 renderer + scissor 画在同一块 canvas 的顶部矩形里。
  // 初始 aspect 只是占位，layoutMirror() 每次布局都按 #mirror-frame 的实际矩形改写 ——
  // 所以 2026-09-26 把 120×62 的横窗改成 80×80 的方窗时，画面不会被拉扁。
  var mirrorCam = new THREE.PerspectiveCamera(MIRROR_FOV, 80 / 80, 0.5, 60000);
  var elMirrorFrame = document.getElementById('mirror-frame');
  var mirrorOn = false;
  var mirrorRect = { x: 0, y: 0, w: 0, h: 0, ok: false };

  function layoutMirror() {
    if (!elMirrorFrame) return;
    var r = elMirrorFrame.getBoundingClientRect();
    mirrorRect.x = r.left; mirrorRect.y = r.top; mirrorRect.w = r.width; mirrorRect.h = r.height;
    mirrorRect.ok = r.width > 4 && r.height > 4;
    if (mirrorRect.ok) { mirrorCam.aspect = r.width / r.height; mirrorCam.updateProjectionMatrix(); }
  }
  function updateMirrorCamera() {
    var ep = st.pos, tn = st.tan;
    mirrorCam.position.set(ep[0] + tn[0] * MIRROR_BACK, ep[1] + MIRROR_UP, ep[2] + tn[2] * MIRROR_BACK);
    mirrorCam.lookAt(ep[0] - tn[0] * MIRROR_LOOK, ep[1], ep[2] - tn[2] * MIRROR_LOOK);
  }

  // ---- HUD ----
  var elClockWrap = document.getElementById('clock'), elClock = document.getElementById('clock-num'),
    elClockMs = document.getElementById('clock-ms');
  var elSpeed = document.getElementById('tm-speed'), elDist = document.getElementById('tm-dist'), elGap = document.getElementById('tm-gap');
  var elWarn = document.getElementById('warn'), elDanger = document.getElementById('danger'), elTip = document.getElementById('tip');

  var elBrief = document.getElementById('brief'), elBfBtn = document.getElementById('bf-btn'), briefClosed = false;
  var elProg = document.getElementById('progress'), elProgFill = document.getElementById('prog-fill'), elProgLabel = document.getElementById('prog-label');
  // 汽车式仪表盘（底部平铺）：功率 / 温度 / 速度三根指针 + 三段随值生长的弧
  // （自左至右 = 驾驶时的手上顺序：多大力 → 烫不烫 → 够不够门槛），另加刻度与四盏警报灯。
  // 指针用 SVG 的 rotate 属性变换（不是 CSS transform）—— 后者在 Chrome 61 的 SVG 上要
  // transform-origin/transform-box 才转得对，前者是 SVG 1.1 就有的，所有内核一致。
  var elDash = document.getElementById('dash');
  var elHeatGauge = document.getElementById('dg-heat'), elHeatNeedle = document.getElementById('dg-heat-needle'),
    elHeatArc = document.getElementById('dg-heat-arc'), elHeatVal = document.getElementById('tm-heat');
  var elSpdGauge = document.getElementById('dg-speed'), elSpdNeedle = document.getElementById('dg-speed-needle'),
    elSpdArc = document.getElementById('dg-speed-arc'), elSpdTick = document.getElementById('dg-tick');
  var elPwGauge = document.getElementById('dg-pw'), elPwNeedle = document.getElementById('dg-pw-needle'),
    elPwArc = document.getElementById('dg-pw-arc'), elPwRef = document.getElementById('dg-pw-ref'),
    elPwVal = document.getElementById('tm-pw');
  var elLampHot = document.getElementById('lamp-hot'), elLampSling = document.getElementById('lamp-sling'),
    elLampFlare = document.getElementById('lamp-flare'), elLampShell = document.getElementById('lamp-shell');
  var elFlyby = document.getElementById('flyby'), elFbName = document.getElementById('fb-name'),
    elFbNeedle = document.getElementById('fb-needle'), elFbTag = document.getElementById('fb-tag'),
    elFbCur = document.getElementById('fb-cur'), elFbNeed = document.getElementById('fb-need'),
    elFbEarly = document.getElementById('fb-early'), elFbSweet = document.getElementById('fb-sweet'),
    elFbLate = document.getElementById('fb-late'),
    elFbTrack = document.getElementById('fb-track'), elFbNext = document.getElementById('fb-next'),
    elFbNextFill = document.getElementById('fb-next-fill'), elFbNextPct = document.getElementById('fb-next-pct');
  var elToast = document.getElementById('fb-toast'), elFtName = document.getElementById('ft-name'),
    elFtGrade = document.getElementById('ft-grade'), elFtDetail = document.getElementById('ft-detail');
  var elRadar = document.getElementById('radar'), radarCtx = elRadar.getContext('2d');
  elRadar.width = 160; elRadar.height = 160;
  var elResult = document.getElementById('result'), elRsTitle = document.getElementById('rs-title'),
    elRsText = document.getElementById('rs-text'), elRsStat = document.getElementById('rs-stat'),
    elRsBtn = document.getElementById('rs-btn'), elFlash = document.getElementById('flash');
  var elRsTimeBox = document.getElementById('rs-time-box'), elRsLabel = document.getElementById('rst-label'),
    elRsTime = document.getElementById('rs-time-value'), elRsBest = document.getElementById('rs-best'),
    elRsShare = document.getElementById('rs-share'), elRsHint = document.getElementById('rs-hint');

  // ---- 表盘刻度换算 ----
  // 速度满量程 80 km/s：实测「满弹弓」全程峰值 67.1 km/s、开局 37.0 —— 指针常驻表盘 46%–84% 区间，
  // 留得住顶部余量（真被顶满也只是指针贴死上限，数字读数仍然是真的）。
  var GAUGE_VMAX = 80;
  // 功率满量程 160%：额定推力 100% 落在弧长 62.5% 处（表盘上那道细刻度），
  // 只有耀斑脉冲的乘波（×1.6）才推得过额定线 —— 「乘波」因此是看得见的。
  var PWR_VMAX = 160;
  var GAUGE_R0 = -135, GAUGE_SWEEP = 270;
  var ARC_LEN = 179.1;                  // 值弧弧长 = 2π×38×270/360
  function gaugeSet(needleEl, arcEl, p) {
    if (p < 0) p = 0; else if (p > 1) p = 1;
    var deg = (GAUGE_R0 + p * GAUGE_SWEEP).toFixed(1);
    if (needleEl) needleEl.setAttribute('transform', 'rotate(' + deg + ',50,50)');
    // 值弧走 **inline style** 而不是同名的表现属性：CSS 里那条 .dg-arc{stroke-dashoffset:179.1} 是声明，
    // 而 CSS 声明**永远压过** SVG 表现属性 —— 写成属性的话值弧一辈子停在 179.1（全空），
    // 表盘上就只剩指针在动（历史 bug，实测 computed 恒为 179.1px）。
    if (arcEl) arcEl.style.strokeDashoffset = (ARC_LEN * (1 - p)).toFixed(2);
  }
  // 额定刻度是一次性常量：100% / 160% 的位置固定，不必每帧重算
  if (elPwRef) gaugeSet(elPwRef, null, 100 / PWR_VMAX);

  function hideTip() { if (elTip) elTip.classList.add('hide'); }

  var prevFlybyState = '';

  // ---- 掠过评级提示 ----
  // 时机条只负责「该按了」，这条负责事后告诉玩家「刚才那次到底点得怎么样」：
  // 等级 + 绿色区间实际点了多少秒（对照完美线）+ 一句可执行的改进提示。
  // 与状态提示（#warn）共用时机条上方那个槽位，由 updateHUD 保证同一时刻只出一条。
  var toastTimer = null;
  function showFlybyToast(idx) {
    if (!elToast || idx < 0 || idx >= flybys.length) return;
    // 被捕获 / 撞毁那次由结算页解释得更清楚，不再叠一条评级
    if (st.status !== 'flying') return;
    var f = flybys[idx], r = st.results[idx];
    var ok = r.result === 'perfect' || r.result === 'pass';
    var g = gradeFlyby(r, ok, f.def.ratingSweet);
    elFtName.textContent = f.def.name;
    elFtGrade.textContent = g.label;
    elFtDetail.textContent =
      '绿色区间 ' + r.sweet.toFixed(2) + ' s / 完美线 ' + f.def.ratingSweet.toFixed(2) + ' s\n' + g.tip;
    elToast.className = g.key;
    void elToast.offsetWidth;
    elToast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    // 3.2 s：最短的一腿（木星→土星 3.65 s）也要留出「下一个窗口倒计时」的露头时间
    toastTimer = setTimeout(function () { if (elToast) elToast.classList.remove('show'); }, 3200);
    // 提示音也按等级区分：吃满 = 明亮的双音，差一点 = 单音，失败 = 低沉方波
    if (g.key === 'perfect') sfxOsc('sine', 720, 1180, 0.3, 0.15);
    else if (g.key === 'good') sfxOsc('sine', 560, 780, 0.26, 0.12);
    else sfxMiss();
  }

  // 判定是 physics 核心做的，渲染层只轮询「已出结果的数量」——
  // 这样「被捕获/撞毁」那次（target 不再前进）也能被捕捉到并给出反馈。
  var judgedCount = 0;
  function pollJudged() {
    var n = 0, i;
    for (i = 0; i < flybys.length; i++) if (st.results[i].result) n++;
    if (n < judgedCount) { judgedCount = n; return; }
    for (; judgedCount < n; judgedCount++) {
      var k = 0, idx = -1;
      for (var j = 0; j < flybys.length; j++) {
        if (st.results[j].result) { if (k === judgedCount) { idx = j; break; } k++; }
      }
      if (idx >= 0) showFlybyToast(idx);
    }
  }

  function updateHUD() {
    // 计时带毫秒：秒位保持大号、毫秒另起一段小字（#clock-ms）。
    // 成绩本身仍按 0.1 s 记（结算与分享都读 st.t），毫秒只是仪表盘上的跟手读数。
    var sec = Math.max(0, st.t);
    var mm = Math.floor(sec / 60), ss = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
    elClock.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
    if (elClockMs) elClockMs.textContent = '.' + ('00' + ms).slice(-3);

    // 温度（新温度箱，温升速率 ∝ 功率，见物理核心）：满量程即 TEMP_MAX
    var heatPct = st.heat / TEMP_MAX;
    gaugeSet(elHeatNeedle, elHeatArc, heatPct);
    if (elHeatVal) elHeatVal.textContent = Math.round(heatPct * 100);
    elHeatGauge.classList.toggle('hot', heatPct > 0.7 && !st.overheated);
    elHeatGauge.classList.toggle('locked', st.overheated);

    var spdPct = st.speedKms / GAUGE_VMAX;
    gaugeSet(elSpdNeedle, elSpdArc, spdPct);
    elSpeed.textContent = st.speedKms.toFixed(1);
    // 指针踩进最佳区间时速度表整体转绿（时机轴同色）—— 表盘就在时机条下面，余光可及
    elSpdGauge.classList.toggle('sweet', st.zone === 'sweet');
    // 门槛刻度：当前行星的判定速度在表盘上的位置（速度够了转绿）。
    // 它取代了旧遥测面板里那行「速度 X / 门槛 Y」中的对照关系 —— 指针与刻度一比对即知还差多远。
    if (elSpdTick) {
      var hasNeed = st.target >= 0 && st.vNeed > 0 && briefClosed;
      elSpdTick.classList.toggle('hide', !hasNeed);
      if (hasNeed) {
        gaugeSet(elSpdTick, null, (st.vNeed * KMS_PER_UNIT) / GAUGE_VMAX);
        elSpdTick.classList.toggle('safe', st.v >= st.vNeed);
      }
    }

    // ---- 发动机功率（功率表）----
    // 物理核心把「这一刻的有效输出」算在 st.thrustEff 里（功率 × 区间效率 × 脉冲乘波，
    // 过热直接归零），这里只负责在没有推力可谈的时候（没按住 / 过热锁定）把它读成 0：
    //   0% = 停机或过热锁定、20% = 过晚残效（白烧）、100% = 额定、160% = 耀斑脉冲乘波。
    // 现在它是一条**起转斜坡**：按住 0.5 s 从 0 涨到额定线（旧版是区间派生的瞬时跳变），
    // 所以指针的高度同时读出「按了多久」与「此刻的发热强度」—— 温度就是按它积出来的。
    // 刻度换算：st.thrustEff 是**小数**（1.0 = 额定），先 ×100 折成百分数再除以满量程 160%。
    // （历史 bug：直接 power / PWR_VMAX = 1/160 = 0.006 → 指针全程只转 1°，看着像死的。）
    // 2026-09-27：读数改由 **st.pwr（油门本身）** 驱动 —— 旧写法被 st.burning 闸住，
    // 一松手指针直接归零，而发动机明明还有 0.5 s 的熄火斜坡（「功率不可能一松手就归零」）。
    // 物理核心那边没动（推力与温升仍按 thrustEff），所以数值与梯度一格没变，
    // 只是表盘现在**看得见**熄火那段下坡。过热锁定仍然读 0（那是熄火完成，不是斜坡）。
    var power = st.overheated ? 0
      : (st.pwr / PWR_MAX) * zoneEff(st.zone) * (pulseActive(st.t) ? PULSE_THRUST_BOOST : 1);
    gaugeSet(elPwNeedle, elPwArc, power * 100 / PWR_VMAX);
    if (elPwVal) elPwVal.textContent = Math.round(power * 100);
    elPwGauge.classList.toggle('idle', power <= 0.001);
    // 「过晚残效」这个红态只给 late 区间：它不能按「功率 < 50%」判，否则每次按住的起转前 0.25 s
    // 都会闪一次红 —— 那是正常的发动机起转，不是「白烧」。
    elPwGauge.classList.toggle('weak', st.zone === 'late' && power > 0.001);
    elPwGauge.classList.toggle('boost', power > 1.001);

    elDist.textContent = st.rSunAU.toFixed(2) + ' AU';
    elGap.textContent = (st.gap / AU).toFixed(2) + ' AU';
    elGap.className = 'dr-v' + (st.gap < 12 ? ' bad' : (st.gap < 28 ? ' warn' : ''));

    // ---- 警报灯（驾驶舱指示灯）：红=已经出事、琥珀=即将发生、绿=弹弓正在生效 ----
    // 与底部那条消息槽分工：灯负责「有没有事」，文案负责「该怎么做」。
    elLampHot.classList.toggle('on', heatPct > 0.85 || st.overheated);
    elLampHot.classList.toggle('warn', heatPct > 0.7 && heatPct <= 0.85 && !st.overheated);
    elLampHot.classList.toggle('bad', !!st.overheated);
    elLampFlare.classList.toggle('warn', !!st.pulseHot || st.warnKind === 'pulse');
    elLampShell.classList.toggle('bad', st.gap < 12);
    elLampShell.classList.toggle('warn', st.gap >= 12 && st.gap < 28);
    // 弹弓灯：绿 = 弹弓正在生效（.on）；红 = 这次掠过的弹弓已经烧废（.bad，CSS 里排在 .on 之后所以红色优先）
    var tgLamp = st.target;
    elLampSling.classList.toggle('on', !!st.slinging);
    elLampSling.classList.toggle('bad', !!(tgLamp >= 0 && st.results[tgLamp].lostSling));

    elProgFill.style.width = (st.progress * 100).toFixed(0) + '%';
    elProgLabel.textContent = '逃逸进度 ' + (st.progress * 100).toFixed(0) + '%';

    // ---- 加速时机条（核心 HUD，压在仪表行之上）----
    // 时机条只在窗口内出现：head 报「哪颗行星 + 现在踩在哪一段 + 速度 / 门槛」。
    // 速度用 km/s —— 与身边那三张表盘同一个单位，
    // 不然屏幕会同时出现两套速度读数（98 单位 vs 41.3 km/s）谁也读不懂。
    var showBar = briefClosed && st.status === 'flying' && st.target >= 0 && st.phase >= 0;
    // 巡航段（窗口还没开）：同一条带改成「下一站进度条」—— 玩家反馈「点火前不知道离下一站还有多远」。
    // 按**弧长**填（上一站 → 下一站），不报秒数：窗口临近仍然靠行星越长越大与进度条走满来表达。
    var showNext = briefClosed && st.status === 'flying' && st.target >= 0 && st.phase < 0;
    if (showBar) {
      var def = flybys[st.target].def;
      elFlyby.classList.remove('hide');
      elFbTrack.style.display = ''; elFbNext.style.display = 'none';
      elFbName.textContent = def.name;
      // 时机条的三个区间**逐行星**：引力越强（质量越大）绿色区间越宽、窗口越长。
      // 宽度只由 def.sweet0/sweet1 驱动，CSS 里那套百分比只是初始值。
      elFbEarly.style.flexBasis = (def.sweet0 * 100).toFixed(1) + '%';
      elFbSweet.style.flexBasis = ((def.sweet1 - def.sweet0) * 100).toFixed(1) + '%';
      elFbLate.style.flexBasis = ((1 - def.sweet1) * 100).toFixed(1) + '%';
      elFbNeedle.style.left = (Math.min(1, Math.max(0, st.phase)) * 100).toFixed(1) + '%';
      elFbCur.textContent = (st.v * KMS_PER_UNIT).toFixed(1);
      elFbNeed.textContent = (st.vNeed * KMS_PER_UNIT).toFixed(1);
      elFbCur.className = 'fb-v' + (st.safe ? ' good' : ' bad');
      // 三态 = 红绿灯：绿 = 命中区；琥珀（.risk）= 过早（弹弓会作废）；红（.late）= 过晚。
      // 「过早」不看速度也算危险 —— 在那里点过火，这次弹弓就没了。
      elFlyby.classList.toggle('sweet', st.zone === 'sweet');
      elFlyby.classList.toggle('risk', st.zone === 'early');
      elFlyby.classList.toggle('late', st.zone === 'late');
      if (st.zone === 'sweet') elFbTag.textContent = '引力窗口 · 全功率推进';
      else if (st.zone === 'late') elFbTag.textContent = '窗口关闭';
      else if (st.zone === 'early') elFbTag.textContent = '窗口外点火 · 增益作废';
      else elFbTag.textContent = '';
    } else if (showNext) {
      var nf = flybys[st.target], nFrom = st.target > 0 ? flybys[st.target - 1].s : 0;
      // 终点不是行星本身，而是**窗口开启的那一刻**：窗口会提前 winTime（2.5~2.8 s）亮起，
      // 而木星那一腿总共只有约 4.6 s —— 按「到行星的弧长」算，窗口已开时条才走到 50%（实测）。
      // 现在把这段提前量（v × winTime）从终点里扣掉，条走到 100% 就是窗口亮起的同一刻。
      var nGoal = Math.max(nFrom + 1, nf.s - st.v * (nf.def.winTime || 0));
      var ap = (st.s - nFrom) / (nGoal - nFrom);
      ap = ap < 0 ? 0 : (ap > 1 ? 1 : ap);
      elFlyby.classList.remove('hide');
      elFbTrack.style.display = 'none'; elFbNext.style.display = '';
      elFbNextFill.style.width = (ap * 100).toFixed(1) + '%';
      elFbNextPct.textContent = Math.round(ap * 100) + '%';
      elFbName.textContent = nf.def.name;
      elFbTag.textContent = '下一站 · 逼近中';
      elFbCur.textContent = (st.v * KMS_PER_UNIT).toFixed(1);
      elFbNeed.textContent = (st.vNeed * KMS_PER_UNIT).toFixed(1);
      elFbCur.className = 'fb-v' + (st.safe ? ' good' : ' bad');
      elFlyby.classList.toggle('sweet', false);
      elFlyby.classList.toggle('risk', false);
      elFlyby.classList.toggle('late', false);
    } else {
      elFlyby.classList.add('hide');
    }

    // ---- 消息槽（时机条正上方）：整屏唯一一条状态提示 ----
    // 优先级：过热 / 耀斑脉冲 > 掠过评级 > 巡航倒计时。
    // 「过晚 · 已来不及」在时机条自己的 tag 上已经写着，这里不再重复刷一条；
    // 巡航倒计时也要给评级条让位（两者同一位置，同时出现就是叠字）。
    var urgent = !!st.overheated || st.warnKind === 'pulse';
    if (urgent) {                       // 紧急提示抢屏：评级条让位
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      if (elToast) elToast.classList.remove('show');
    }
    var laneBusy = !!(elToast && elToast.classList.contains('show'));
    var showWarn = st.status === 'flying' && briefClosed && !!st.warn &&
      (urgent || (!showBar && !laneBusy));
    if (showWarn) { elWarn.textContent = st.warn; elWarn.classList.add('show'); }
    else elWarn.classList.remove('show');
    elWarn.classList.toggle('pulse', st.warnKind === 'pulse');
    elWarn.classList.toggle('hot', !!st.overheated);



    // ---- 全屏边缘光：红色 = 危险，绿色 = 最佳区间到了、该按了 ----
    // 没有按钮可点之后，「该按了」只能靠屏幕本身喊出来：绿色呼吸比红边优先级更高，
    // 因为此刻玩家需要的是「现在按」而不是「正在变危险」。
    var ready = st.status === 'flying' && st.zone === 'sweet' && !st.burning && !st.overheated;
    // 红边只在脉冲**生效**的那 1 s 内亮：预警期有 2 s，全程血红会把红边变成噪声
    var danger = st.pulseHot || st.gap < 18 || (st.zone === 'late' && !st.safe);
    elDanger.classList.toggle('ready', ready);
    elDanger.classList.toggle('active', !ready && danger && st.status === 'flying');
  }

  // 小地图：位图固定 **160×160**，CSS 里按 **80px**（= --top-sq）显示 —— 正好 2× 超采样
  // （真机 2~3x DPR 下也够锐）。因此**所有线宽与点半径都按「2 位图像素 = 1 CSS 像素」给**：
  // 屏幕上要 1px 的线，这里就写 2；要 2px 的点，这里写 4。改 CSS 尺寸时这一组要跟着改。
  // ⓘ 2026-09-26：位图基准由 104 提到 160（配上 80px 的显示尺寸，继续守住上面那条换算）。
  // 除线宽外的一切几何都乘 RS —— 放大的是**整张图**，不是把线一起吹粗（线宽仍写 2 = 1 CSS px）。
  function drawRadar() {
    var RS = 160 / 104;
    var rw = 160, cx = 80, cy = 80;
    var scl = (48 * RS) / (ROUTE_R1 * 1.05);
    radarCtx.clearRect(0, 0, rw, rw);
    // 小地图与 HUD 同一套配色：底 = 绿黑、航线与地球 = 机器绿、太阳与壳 = 琥珀。
    // 这里全是 canvas 现画，颜色**不受 CSS 变量影响**，改界面配色时要同步改这一处。
    // 底不透明度 .88（原 .72）：小地图现在挂在**右上角**，掠到木星时背后就是半屏奶油色，
    // 72% 的黑底会被透亮成灰绿、航线与行星点全糊 —— 这一块是「一眼读位置」的图，先保证读得清。
    radarCtx.fillStyle = 'rgba(5,20,15,.88)'; radarCtx.fillRect(0, 0, rw, rw);
    radarCtx.strokeStyle = 'rgba(70,232,178,.16)'; radarCtx.lineWidth = 2; radarCtx.strokeRect(1, 1, rw - 2, rw - 2);
    // 航线
    radarCtx.strokeStyle = 'rgba(70,232,178,.38)'; radarCtx.lineWidth = 2;
    radarCtx.beginPath();
    var p = [0, 0, 0];
    for (var k = 0; k <= 60; k++) {
      routeSample(route, route.len * k / 60, p, null);
      var X = cx + p[0] * scl, Y = cy + p[2] * scl;
      if (k === 0) radarCtx.moveTo(X, Y); else radarCtx.lineTo(X, Y);
    }
    radarCtx.stroke();
    radarCtx.fillStyle = '#ffb84d'; radarCtx.beginPath(); radarCtx.arc(cx, cy, 5 * RS, 0, 6.283); radarCtx.fill();
    radarCtx.strokeStyle = 'rgba(255,184,77,.55)'; radarCtx.lineWidth = 2;
    radarCtx.beginPath(); radarCtx.arc(cx, cy, st.shellR * scl, 0, 6.283); radarCtx.stroke();
    for (var ri = 0; ri < flybys.length; ri++) {
      var fb = flybys[ri], pc = fb.def.procColor != null ? fb.def.procColor : fb.def.color;
      radarCtx.fillStyle = 'rgb(' + ((pc >> 16) & 255) + ',' + ((pc >> 8) & 255) + ',' + (pc & 255) + ')';
      radarCtx.beginPath(); radarCtx.arc(cx + fb.pos[0] * scl, cy + fb.pos[2] * scl, 4 * RS, 0, 6.283); radarCtx.fill();
    }
    // 场上的其他行星：更小更暗的点。水星/金星在地球内侧 —— 小地图上永远看得见，
    // 也解释了为什么正前方看不到它们（它们是真的在身后）。
    for (var si = 0; si < scenery.length; si++) {
      var scm = scenery[si], cm = scm.def.color;
      radarCtx.fillStyle = 'rgba(' + ((cm >> 16) & 255) + ',' + ((cm >> 8) & 255) + ',' + (cm & 255) + ',.62)';
      radarCtx.beginPath(); radarCtx.arc(cx + scm.pos[0] * scl, cy + scm.pos[2] * scl, 3 * RS, 0, 6.283); radarCtx.fill();
    }
    var ex = cx + st.pos[0] * scl, ey = cy + st.pos[2] * scl;
    radarCtx.fillStyle = '#45e0b0'; radarCtx.beginPath(); radarCtx.arc(ex, ey, 5 * RS, 0, 6.283); radarCtx.fill();
    radarCtx.strokeStyle = 'rgba(70,232,178,.5)'; radarCtx.lineWidth = 2;
    radarCtx.beginPath(); radarCtx.arc(ex, ey, 10 * RS, 0, 6.283); radarCtx.stroke();
  }

  // ---- 结算：主角是「逃逸用时」，其余都是注脚 ----
  // 目标就是比谁快，所以用时给最大的字号，其余（完美弹弓数/末速/距日）压缩成一行注脚；
  // 本站最快记在 localStorage，只有「成功逃出」的成绩才作数（失败的时间没有可比性）。
  var bestTime = null;
  try {
    var _bt = parseFloat(localStorage.getItem('we3d_best'));
    if (isFinite(_bt) && _bt > 0) bestTime = _bt;
  } catch (e) { bestTime = null; }

  function showResult() {
    var win = st.status === 'escaped';
    elRsTitle.textContent = win ? '冲出太阳系' : '逃逸失败';
    elRsTitle.className = 'rs-title ' + (win ? 'win' : 'lose');
    // 没逃出去就不是「逃逸用时」——标签跟着胜负换，和分享卡片保持同一套说法
    if (elRsLabel) elRsLabel.textContent = win ? '逃逸用时' : '航至';
    elRsTime.innerHTML = st.t.toFixed(1) + '<i>s</i>';
    elRsTimeBox.classList.toggle('bad', !win);

    var isNew = win && (bestTime === null || st.t < bestTime);
    if (isNew) {
      bestTime = st.t;
      try { localStorage.setItem('we3d_best', String(bestTime)); } catch (e) { }
    }
    if (bestTime !== null) {
      elRsBest.textContent = (isNew ? '★ 新纪录 ' : '本站最快 ') + bestTime.toFixed(1) + ' s';
      elRsBest.classList.toggle('new', isNew);
    } else {
      elRsBest.textContent = '尚无逃逸记录。完成首次逃逸。';
      elRsBest.classList.remove('new');
    }

    // 失败原因（被谁捕获 / 撞毁 / 被壳吞没）留给 body；成功时标题已经说了「冲出太阳系」，
    // 再复述一遍那句 reason 是纯重复，这里换成一句收尾。
    elRsText.textContent = win ? '地球已脱离太阳系引力束缚。比邻星航程，约两千五百年。' : st.reason;
    // 注脚统计改成**终端清单**：每行「名目 …… 数值」，名目灰、数值亮且右对齐，
    // 中间那条点线引导由 CSS 给（.rsr-l 自己撑满余下宽度，不靠空格拼）。
    // 四行等高、左缘对齐，比旧版两条用全角空格拼起来的横排更好比对 ——
    // 一眼扫完名目，再看右端数值。「速度不足」只在真的发生过时才写进那一行。
    var passed = st.score.perfect + st.score.pass + st.score.slow;
    var statRows = [
      ['完美弹弓', st.score.perfect + ' / ' + flybys.length],
      ['引力助推', st.score.slow ? passed + ' 次 · 速度不足 ' + st.score.slow + ' 次' : passed + ' 次'],
      ['末速', st.speedKms.toFixed(0) + ' km/s'],
      ['距日', st.rSunAU.toFixed(1) + ' AU']
    ];
    var statHtml = '', si;
    for (si = 0; si < statRows.length; si++) {
      statHtml += '<span class="rsr"><em>' + statRows[si][0] + '</em><i class="rsr-l"></i><b>' +
        statRows[si][1] + '</b></span>';
    }
    elRsStat.innerHTML = statHtml;
    if (elRsHint) elRsHint.textContent = '';
    // 结算页盖住整个 HUD：评级条先撤掉，免得在面板背后透出一条
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (elToast) elToast.classList.remove('show');
    elWarn.classList.remove('show');
    elResult.classList.add('show');
    // 分享入口：按钮文案随当下可用能力定（§3.9 评论区 / §3.3 发笔记 / 无端能力），
    // 战绩卡与本地句柄在面板亮出来时就备好 —— 点击时才能不带异步地发起（§3.9 要求用户主动触发）
    refreshShareButton();
    prepareShareCard();
    if (win) sfxWin(); else sfxLose();
  }

  // ---- 分享战绩：走小工具容器的 JSBridge ----
  //   官方文档 §3.2 里唯一标注「分享」的能力是 §3.9 interactionOpenApi（唤起评论区、带图文评论
  //   草稿、可同步存相册，客户端 9.49+）—— 首选；拿不到就回退 §3.3 postNote（唤起笔记发布页）。
  //   两条路都必须带媒体（postNote 的 mediaInfo 必填），图仍是 Canvas 现画，不引用任何外部图片、
  //   不碰被容器禁用的网络请求 API（扫描清单会 grep 标识符）。
  //   §3.9 的两条硬约束决定了调用顺序：
  //     ① 媒体**只收本地文件句柄**（data: URI / 网络地址 / 绝对路径都不可用）→ 必须先 writeTempFile；
  //     ② 要求「用户点击等主动操作触发」，且容器会**先关闭本页**再拉起评论区 →
  //        战绩卡与临时文件在结算页亮出来时就备好，点击时带着现成的 filePath 同步发起，
  //        不把异步步骤夹进手势栈里（点得太快没备好时才补一次落盘）。
  //   能力检测一律在调用时做（§3.1：调用前用 window.xhs && window.xhs.miniTool 判空），
  //   不缓存脚本加载那一刻的 window 状态；全程不碰禁用能力（剪贴板 / 网络请求 / 长按菜单）。

  var COMMENT_MIN_CLIENT = 9490;    // §3.9：评论区能力需客户端 9.49+（9462 即 9.46.2）
  var clientVersion = 0;            // buildVersion / 1000；0 = 尚未取到

  // §3.6：buildVersion 末尾三位是编译序号，比较前先取整；同步值缺失且 getLaunchOptions 在时才异步取
  function readBuildVersion(launchOptions) {
    var env = launchOptions && launchOptions.miniToolEnv;
    return Number((env && env.buildVersion) || 0) || 0;
  }
  function probeClientVersion() {
    var xhs = window.xhs, raw = readBuildVersion(xhs && xhs.launchOptions);
    if (raw) { clientVersion = Math.floor(raw / 1000); return; }
    // 同步值缺失才异步取（§3.6）；取不到就一直保持「未知」，交给方法存在性判断
    var p = callBridge(xhs && xhs.miniTool, 'getLaunchOptions');
    if (!p) return;
    p.then(function (lo) {
      var v = readBuildVersion(lo);
      if (v) { clientVersion = Math.floor(v / 1000); refreshShareButton(); }
    }, function () { });
  }

  function shareBridge() { return (window.xhs && window.xhs.miniTool) || null; }
  function hasApi(b, name) { return !!(b && typeof b[name] === 'function'); }
  // 统一发起：端能力在参数不合法时会**同步失败**（§3.1「在本地直接失败，不上行」），也可能返回非
  // Promise —— 这里都兜住，返回 null 表示这次没发出去，异常不会冒进渲染循环 / 手势回调
  function callBridge(b, api, options) {
    if (!hasApi(b, api)) return null;
    try {
      var p = b[api](options);
      return (p && typeof p.then === 'function') ? p : null;
    } catch (e) { return null; }
  }
  // 首选路径的前置条件：方法都在（硬信号）+ 版本够。版本取不到时以方法存在为准 ——
  // 低版本客户端本就不会注入这个方法（§3.6：两种方式都取不到版本号时按「不支持」处理）。
  function commentMode(b) {
    if (!hasApi(b, 'interactionOpenApi') || !hasApi(b, 'writeTempFile')) return false;
    return clientVersion === 0 || clientVersion >= COMMENT_MIN_CLIENT;
  }
  function shareMode() {
    var b = shareBridge();
    if (commentMode(b)) return 'comment';      // §3.9 分享到评论区
    if (hasApi(b, 'postNote')) return 'note';  // §3.3 发布笔记（低版本回退）
    return '';                                 // 未注入端能力：只剩「选中文案」
  }
  function refreshShareButton() {
    if (!elRsShare) return;
    var mode = shareMode();
    elRsShare.textContent = mode === 'comment' ? '分享到评论区'
      : (mode === 'note' ? '分享到小红书' : '分享战绩');
  }
  probeClientVersion();
  refreshShareButton();

  function shareTitle() {
    // postNote 的 title 上限 20 字
    return ('引力弹弓 · ' + st.t.toFixed(1) + ' 秒').slice(0, 20);
  }
  function shareContent() {
    var win = st.status === 'escaped';
    var head = win
      ? '氦闪前壳追上来之前，我把地球开出了太阳系：' + st.t.toFixed(1) + ' 秒，完美弹弓 ' + st.score.perfect + ' / ' + flybys.length + '。'
      : '第 ' + st.t.toFixed(1) + ' 秒：' + st.reason + '。';
    var best = (bestTime !== null && bestTime <= st.t) ? '本站最快 ' + bestTime.toFixed(1) + ' 秒。' : '';
    return head + best + '\n全程只有一个动作：决定何时点燃行星发动机。看谁先把地球送出太阳系。\n' +
      '\n#小红书vibecoding大赛 #vibegame #小红书小工具 #流浪地球';
  }
  // 评论草稿（§3.9）：评论是短文本，只留成绩 + 挑战，不搬整篇笔记正文
  function shareComment() {
    var win = st.status === 'escaped';
    var head = win
      ? '我把地球开出太阳系只用了 ' + st.t.toFixed(1) + ' 秒，完美弹弓 ' + st.score.perfect + ' / ' + flybys.length + '。'
      : '这次第 ' + st.t.toFixed(1) + ' 秒就交代了（' + st.reason + '）。';
    return head + '全程只有一个操作：决定何时点火 —— 看谁先把地球送出去。 #小红书vibecoding大赛 #vibegame';
  }

  // 战绩图：纯 Canvas 现画（不引用任何外部图片，避免画布被污染）
  var gradeColor = { perfect: '#ffd24a', good: '#7fd0a8', early: '#ffb84d', late: '#ff4d5e', none: '#ff4d5e', fail: '#ff4d5e' };
  function drawShareCard() {
    var CW = 900, CH = 1200, i;
    var cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    var g = cv.getContext('2d');
    if (!g) return null;
    var FONT = '"PingFang SC","Microsoft YaHei",-apple-system,sans-serif';

    var bg = g.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#030807'); bg.addColorStop(0.5, '#071a16'); bg.addColorStop(1, '#030807');
    g.fillStyle = bg; g.fillRect(0, 0, CW, CH);

    // 星点
    for (i = 0; i < 300; i++) {
      g.globalAlpha = 0.18 + Math.random() * 0.6;
      g.fillStyle = '#dbf5ec';
      g.beginPath(); g.arc(Math.random() * CW, Math.random() * CH, Math.random() * 1.7 + 0.3, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;

    // 左下角氦闪（琥珀族，与界面里的「氦闪」警报灯同色）
    var sg = g.createRadialGradient(90, CH - 90, 6, 90, CH - 90, 320);
    sg.addColorStop(0, 'rgba(255,233,163,.95)');
    sg.addColorStop(0.3, 'rgba(255,184,77,.5)');
    sg.addColorStop(1, 'rgba(140,74,0,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(90, CH - 90, 320, 0, 6.283); g.fill();

    var win = st.status === 'escaped';
    g.textAlign = 'center';

    g.fillStyle = '#7fa79a'; g.font = '30px ' + FONT;
    g.fillText('流浪地球 · 引力弹弓', CW / 2, 130);

    g.fillStyle = '#7fa79a'; g.font = '28px ' + FONT;
    g.fillText(win ? '逃逸用时' : '航至', CW / 2, 300);

    g.fillStyle = win ? '#ffd24a' : '#cfe8e0';
    g.font = '800 168px ' + FONT;
    g.fillText(st.t.toFixed(1), CW / 2 - 24, 452);
    g.fillStyle = '#7fa79a'; g.font = '600 52px ' + FONT;
    g.fillText('秒', CW / 2 + 150, 452);

    g.fillStyle = win ? '#7fd0a8' : '#ff4d5e';
    g.font = '800 46px ' + FONT;
    g.fillText(win ? '逃逸成功' : '被氦闪前壳吞没', CW / 2, 540);

    if (bestTime !== null) {
      g.fillStyle = '#7fa79a'; g.font = '26px ' + FONT;
      g.fillText('本站最快 ' + bestTime.toFixed(1) + ' 秒 · 完美弹弓 ' + st.score.perfect + ' / ' + flybys.length, CW / 2, 600);
    }

    // 五颗行星的评级色标
    var n = flybys.length, gap = 132, x0 = CW / 2 - (n - 1) * gap / 2;
    for (i = 0; i < n; i++) {
      var r = st.results[i];
      var ok = r.result === 'perfect' || r.result === 'pass';
      var col = r.result ? (gradeColor[gradeFlyby(r, ok).key] || '#7fa79a') : '#2c4a42';
      g.fillStyle = col; g.globalAlpha = r.result ? 1 : 0.4;
      g.beginPath(); g.arc(x0 + i * gap, 730, 22, 0, 6.283); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#7fa79a'; g.font = '22px ' + FONT;
      g.fillText(flybys[i].def.name.slice(-1), x0 + i * gap, 786);
    }

    g.fillStyle = '#eafff6'; g.font = '700 36px ' + FONT;
    g.fillText('只决定一件事：何时点火', CW / 2, 920);
    g.fillStyle = '#7fa79a'; g.font = '30px ' + FONT;
    g.fillText('看谁先把地球送出太阳系', CW / 2, 976);

    g.fillStyle = '#5cc8ff'; g.font = '24px ' + FONT;
    g.fillText('#小红书vibecoding大赛  #vibegame', CW / 2, 1108);
    g.fillStyle = '#3d5a52'; g.font = '22px ' + FONT;
    g.fillText('小红书小工具 · 搜「流浪地球 引力弹弓」', CW / 2, 1152);

    var url = cv.toDataURL('image/webp', 0.92);
    if (url.indexOf('data:image/webp') !== 0) url = cv.toDataURL('image/jpeg', 0.92);
    return url;
  }

  // 战绩图缓存：结算页亮出来时就画好、并落成临时文件（§3.9 的媒体只收本地句柄，必须提前换）
  var cardKey = '', cardData = '', cardFile = '';
  function runKey() { return st.status + '|' + st.t.toFixed(3); }
  function clearShareCard() { cardKey = ''; cardData = ''; cardFile = ''; }
  function prepareShareCard() {
    clearShareCard();
    if (!shareMode()) return;              // 没注入端能力（桌面 / 预览）就不画：退路用不上图
    cardKey = runKey();
    cardData = drawShareCard() || '';
    var b = shareBridge(), key = cardKey;
    if (!cardData || !hasApi(b, 'writeTempFile')) return;
    var p = callBridge(b, 'writeTempFile', { data: cardData });
    if (!p) return;
    p.then(function (res) {
      // 期间可能已经点了「再来一次」：不是同一局就丢弃这个句柄（临时文件本就要求即用即弃）
      if (res && res.filePath && key === cardKey) cardFile = res.filePath;
    }, function () { /* 落盘失败：postNote 仍可吃 data: URI；§3.9 这条路会回退成发笔记 */ });
  }
  function ensureShareCard() {
    if (!cardData || cardKey !== runKey()) prepareShareCard();
    return cardData;
  }

  function shareSnapshot() {
    return JSON.stringify({
      page: 'result', status: st.status, t: Number(st.t.toFixed(1)),
      perfect: st.score.perfect, flyby: flybys.length,
      best: bestTime === null ? null : Number(bestTime.toFixed(1))
    });
  }
  // §3.9 分享到评论区：图文评论草稿 + 同步存相册（媒体必须是本地文件句柄）
  function commentOptions(filePath) {
    return {
      payload: {
        action: 'post_comment',
        content: shareComment(),
        media_bean: [{ media_type: 'image', cover_image_url: filePath }],
        // 用户从评论区重新打开小工具时可据此恢复结算状态（上限 2KB）。文档未给「读回」入口，这里只写入
        miniToolSnapshotInfo: shareSnapshot()
      },
      saveToAlbum: true
    };
  }
  // §3.3 发布笔记：低版本回退；有本地句柄就交句柄，没有就把 data: URI 交出去（§3.3 两种都收）
  function noteOptions(dataURL, filePath) {
    return {
      title: shareTitle(),
      content: shareContent().slice(0, 1000),   // postNote 的 content 上限 1000
      pageType: 'photo_publish',
      mediaInfo: { image_resources: [{ url: filePath || dataURL }] }
    };
  }

  // 拿不到容器 bridge 时的退路：**不「复制」，改为「把文案选中 + 引导长按复制」**。
  // 剪贴板类 API 全都在小工具容器的**禁用能力扫描清单**里，写了会被 verify-minitool.mjs
  // 直接判不合规（连标识符都不许出现），所以走「选中文本」这条同源做法
  // （同 vibeknow/china-rail-atlas 的 copyPrompt）。
  function selectShareText(text) {
    if (!elRsHint) return;
    elRsHint.textContent = text;
    try {
      var range = document.createRange();
      range.selectNodeContents(elRsHint);
      var sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    } catch (e) { /* 选中失败也不影响阅读与手动长按 */ }
  }

  function doShare() {
    if (!elRsShare || elRsShare.disabled) return;
    var mode = shareMode();
    if (!mode) {
      // 未注入端能力（桌面 / 预览）：退化为「选中文案 + 引导长按复制」
      selectShareText(shareTitle() + '\n' + shareContent());
      elRsShare.textContent = '已选中 · 长按复制';
      return;
    }
    elRsShare.disabled = true;
    var b = shareBridge();
    var dataURL = ensureShareCard();
    var hint = function (t) { if (elRsHint) elRsHint.textContent = t; };
    var release = function () { elRsShare.disabled = false; };
    var why = function (err) { return (err && err.errMsg) || '未知原因'; };
    if (!dataURL) { hint('战绩图生成失败 · 换台设备再试'); release(); return; }

    function asNote() {   // §3.3：唤起 App 的笔记发布页
      var p = callBridge(b, 'postNote', noteOptions(dataURL, cardFile));
      if (!p) { hint('唤起发布页失败 · 稍后再试'); release(); return; }
      p.then(function () {
        hint('已唤起发布页 · 在那边补完正文就能发');
      }, function (err) {
        hint('唤起发布页失败：' + why(err));
      }).then(release, release);
    }
    function asComment(filePath) {   // §3.9：带图文草稿打开评论区（容器随后会关闭本页）
      var p = callBridge(b, 'interactionOpenApi', commentOptions(filePath));
      if (!p) { hint('打开评论区失败 · 稍后再试'); release(); return; }
      p.then(function (res) {
        if (!res || res.routed === false) { hint('评论区没打开 · 稍后再试'); return; }
        hint('已打开评论区，战绩和配图都带过去了' +
          (res.savedToAlbum ? ' · 配图已存相册' : (res.albumFailReason ? ' · 配图存相册没成功' : '')));
      }, function (err) {
        hint('打开评论区失败：' + why(err));
      }).then(release, release);
    }

    if (mode !== 'comment') { asNote(); return; }
    // 句柄已在结算页备好 → 点击手势栈里直接发起（§3.9 要求用户点击等主动操作触发）
    if (cardFile) { asComment(cardFile); return; }
    // 点得太快、落盘还没回来：补一次 writeTempFile；仍拿不到句柄就回退发笔记
    var retry = callBridge(b, 'writeTempFile', { data: dataURL });
    if (!retry) { asNote(); return; }
    retry.then(function (res) {
      var fp = res && res.filePath;
      if (fp) { cardFile = fp; asComment(fp); } else { asNote(); }
    }, function () { asNote(); });
  }
  if (elRsShare) elRsShare.addEventListener('click', doShare);

  function restart() {
    elResult.classList.remove('show');
    game.reset();
    pointer = null; userZoom = 1; pinchDist = 0; pointers = {};
    prevT = 0; prevOverheated = false; prevFlybyState = '';
    judgedCount = 0;
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (elToast) elToast.className = '';
    elWarn.classList.remove('show');
    elWarn.classList.remove('pulse', 'hot');
    if (elTip) elTip.classList.remove('hide');
    if (elRsHint) elRsHint.textContent = '';
    clearShareCard();
    refreshShareButton();
    introT = 0; briefClosed = false;
    camPos.set(0, 900, 0.01); camLook.set(0, 0, 0);
    elBrief.classList.remove('show');
  }

  elRsBtn.addEventListener('click', restart);
  elBfBtn.addEventListener('click', function () { briefClosed = true; elBrief.classList.remove('show'); });
  // ⓘ 2026-09-27：删掉「点结算页任意处就再来一次」。它和分享按钮同处一屏，
  //   玩家想点分享、手指落在正文上就直接重开 —— 战绩与分享入口一起被跳过（反馈：容易错过分享）。
  //   现在结算页**只有屏底两个按钮有动作**（分享战绩 / 再来一次），点正文什么都不发生。

  // ---- 启动页：MOSS 自检（§5b）----
  // 真实加载早就完成了，这里做的是「**至少停留 BOOT_MIN_MS**」：
  // 每帧按已停留时长刷新清单打勾与自检条，走满 + 已经渲染出画面才交出操控权。
  var bootT0 = performance.now();
  var bootDone = false, bootFrames = 0;
  var elLoader = document.getElementById('loader');
  var elLdFill = document.getElementById('ld-fill');
  var elLdStatus = document.getElementById('ld-status');
  var ldLines = (function () {
    var out = [], log = document.getElementById('ld-log');
    if (!log) return out;
    for (var i = 0; i < log.children.length; i++) out.push(log.children[i]);
    return out;
  })();

  function updateBoot(now) {
    var p = (now - bootT0) / BOOT_MIN_MS;
    if (p > 1) p = 1;
    var i, last = -1;
    for (i = 0; i < BOOT_STEPS.length; i++) {
      var on = p >= BOOT_STEPS[i].t;
      if (on) last = i;
      var ln = ldLines[i];
      if (!ln) continue;
      if (on && !ln.classList.contains('done')) {
        ln.classList.add('done');
        var b = ln.getElementsByTagName('b')[0];
        if (b) b.textContent = 'OK';
      }
    }
    if (elLdFill) elLdFill.style.width = (p * 100).toFixed(1) + '%';
    if (elLdStatus) {
      // 状态行只报**当前正在校验的那一句**（全貌由清单给）；走满则换成收尾那句
      var txt = p >= 1 ? BOOT_DONE_MSG : '正在校验' + BOOT_STEPS[last < 0 ? 0 : last].k + '…';
      if (elLdStatus.textContent !== txt) elLdStatus.textContent = txt;
    }
    return (now - bootT0) >= (BOOT_MIN_MS + BOOT_TAIL_MS);
  }

  // ---- 主循环 ----
  var last = performance.now();
  var prevT = 0, prevOverheated = false;
  function flashScreen() {
    if (!elFlash) return;
    elFlash.classList.remove('on');
    void elFlash.offsetWidth;
    elFlash.classList.add('on');
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // 启动页还没走完 → 连过场镜头也不推进（否则 2.6 s 的过场会在启动页背后放完，
    // 玩家一进来就只看到简报，白白少了一段「出发」的镜头）
    if (!bootDone) {
      var bootFull = updateBoot(now);
      bootFrames++;
      // 多等一帧：确保自检条 100% 与画面第一帧都真的画出来了再撤屏
      if (bootFull && bootFrames >= 2) {
        bootDone = true;
        if (elLoader) elLoader.classList.add('hide');
      }
    } else if (introT < INTRO_TIME) {
      introT += dt;
      var s = Math.min(1, introT / INTRO_TIME);
      var e = s * s * (3 - 2 * s);
      chasePose(route, flybys, camState(), _tp, _tl);
      camPos.set(0 * (1 - e) + _tp[0] * e, 900 * (1 - e) + _tp[1] * e, 0.01 * (1 - e) + _tp[2] * e);
      camLook.set(0 * (1 - e) + _tl[0] * e, 0 * (1 - e) + _tl[1] * e, 0 * (1 - e) + _tl[2] * e);
      camera.position.copy(camPos); camera.lookAt(camLook);
    } else if (briefClosed && st.status === 'flying') {
      game.step(dt);
      for (var pj = 0; pj < PULSE_TIMES.length; pj++) {
        if (prevT < PULSE_TIMES[pj] && st.t >= PULSE_TIMES[pj]) { flashScreen(); sfxBoom(); }
      }
      if (st.overheated !== prevOverheated) {
        prevOverheated = st.overheated;
        if (st.overheated) sfxOverheat(); else sfxReady();
      }
      // 进入最佳区间 → 弹弓音（掠过评级的提示音在 showFlybyToast 里按等级给）
      if (st.zone === 'sweet' && prevFlybyState !== 'sweet') sfxSling();
      prevFlybyState = st.zone;
      prevT = st.t;
    }
    if (introT >= INTRO_TIME && !briefClosed) elBrief.classList.add('show');
    if (rumbleGain && actx && actx.state === 'running') {
      rumbleGain.gain.setTargetAtTime((st.burning ? 1 : 0) * 0.25, actx.currentTime, 0.06);
    }

    // 地球位姿：位置沿航线，朝向 = 航线切向（发动机喷流朝后）
    earthGroup.position.set(st.pos[0], st.pos[1], st.pos[2]);
    _flameDir.set(st.tan[0], st.tan[1], st.tan[2]);
    if (_flameDir.lengthSq() > 1e-6) {
      _flameDir.normalize();
      _targetQuat.setFromUnitVectors(_zAxis, _flameDir);
      earthGroup.quaternion.slerp(_targetQuat, 1 - Math.exp(-dt * 8));
    }
    // 发动机：本体亮度跟推力走；点火时每台喷出一道随推力伸缩、带高频抖动的等离子柱
    var engOp = st.burning ? 1.0 : 0.35;
    for (var egi = 0; egi < engines.length; egi++) engines[egi].material.opacity = engOp;
    if (st.burning) {
      // 柱长 = 起转斜坡（0.5 s 到额定）× 抖动：等离子不该是一根死板的水柱
      var pk = 0.45 + Math.min(1.3, st.thrustEff) * 0.75;
      if (st.slinging) pk *= 1.25;
      plumeMat.opacity = st.slinging ? 0.7 : 0.5;
      for (var pi = 0; pi < plumes.length; pi++) {
        var pl = plumes[pi];
        var k = pk * (0.86 + 0.14 * Math.sin(now * 0.021 + pl.userData.seed));
        pl.visible = true;
        pl.scale.set(1, k, 1);
        pl.position.z = pl.userData.z0 - PLUME_LEN * k / 2;
      }
      thrustFlame.visible = true;
      thrustFlame.position.set(0, 0, -EARTH_R * 1.0);
      thrustFlame.quaternion.setFromUnitVectors(_flameAxis, _negZAxis);
      var boost = st.slinging ? 2.4 : 1.0;
      thrustFlame.scale.set(boost, boost * (0.7 + Math.min(1, st.thrustEff / 8) * 1.6), boost);
    } else {
      for (var pi2 = 0; pi2 < plumes.length; pi2++) plumes[pi2].visible = false;
      thrustFlame.visible = false;
    }

    // 太阳壳膨胀
    sunGroup.scale.setScalar(Math.max(1, st.shellR / SUN_R));

    // 行星光晕随距离收放：远看是一圈柔光（帮玩家提前发现行星），
    // 贴近到 ~2 倍半径以内就完全收掉——加色 sprite 不会因为离得近而变小，
    // 不收的话掠过瞬间整屏会被它糊白。
    for (var pgi = 0; pgi < planetMeshes.length; pgi++) {
      var pg = planetMeshes[pgi], pm = pg.mesh, pr = pg.rad;
      var pdx = camPos.x - pm.position.x, pdy = camPos.y - pm.position.y, pdz = camPos.z - pm.position.z;
      var pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
      var fade = (pdist - pr * 1.9) / (pr * 4.5);
      fade = fade < 0 ? 0 : (fade > 1 ? 1 : fade);
      pg.glow.material.opacity = PLANET_GLOW_MAX * fade;
      if (pg.ring) pg.ring.material.opacity = 0.55 * (0.55 + 0.45 * fade);
    }

    // 判定环配色：接近→蓝，最佳区间→绿，过晚/速度不足→红
    for (var gi = 0; gi < gateMeshes.length; gi++) {
      var gm = gateMeshes[gi];
      if (gi === st.target && st.phase >= 0) {
        // 判定环三态仍按「时机轴」上色，但**默认态从青蓝改成机器绿 0x45e0b0**：
        // 命中态是更亮更柔的 0x7fd0a8 + 不透明度 0.95 —— 转绿这件事变成了「转亮」。
        if (st.zone === 'sweet') { gm.material.color.setHex(0x7fd0a8); gm.material.opacity = 0.95; }
        else if (st.zone === 'late' || !st.safe) { gm.material.color.setHex(0xff4d5e); gm.material.opacity = 0.9; }
        else { gm.material.color.setHex(0x45e0b0); gm.material.opacity = 0.7; }
      } else if (gi < st.target) { gm.material.color.setHex(0x1e4a3d); gm.material.opacity = 0.18; }
      else { gm.material.color.setHex(0x45e0b0); gm.material.opacity = 0.4; }
    }

    if (introT >= INTRO_TIME) updateCamera(dt);

    if (briefClosed && st.status === 'flying') {
      mirrorOn = true;
      elProg.classList.remove('hide');
      elDash.classList.remove('hide');
      elRadar.classList.remove('hide');
      elClockWrap.classList.remove('hide');
      if (elMute) elMute.classList.remove('hide');
      if (elMirrorFrame) elMirrorFrame.classList.remove('hide');
    } else {
      mirrorOn = false;
      elProg.classList.add('hide'); elDash.classList.add('hide');
      elRadar.classList.add('hide'); elFlyby.classList.add('hide');
      elClockWrap.classList.add('hide');
      if (elMute) elMute.classList.add('hide');
      if (elMirrorFrame) elMirrorFrame.classList.add('hide');
      // 简报 / 结算盖上来时，局内的消息条与评级条一起撤掉（否则会从半透明面板后面透出来）
      elWarn.classList.remove('show');
      if (elToast) elToast.classList.remove('show');
    }

    updateHUD();
    drawRadar();
    pollJudged();

    if (st.status !== 'flying' && !elResult.classList.contains('show')) showResult();

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.render(scene, camera);

    if (mirrorOn && mirrorRect.ok) {
      updateMirrorCamera();
      var my = H - (mirrorRect.y + mirrorRect.h);
      renderer.setScissorTest(true);
      renderer.setViewport(mirrorRect.x, my, mirrorRect.w, mirrorRect.h);
      renderer.setScissor(mirrorRect.x, my, mirrorRect.w, mirrorRect.h);
      renderer.render(scene, mirrorCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
    }

    requestAnimationFrame(frame);
  }
  layoutMirror();
  requestAnimationFrame(frame);

  addEventListener('resize', function () {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    layoutMirror();
  });
})(typeof window !== 'undefined' ? window : this);
