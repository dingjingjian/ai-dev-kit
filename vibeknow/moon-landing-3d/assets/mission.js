(function (global) {
  'use strict';
  var M3D = global.M3D, mat4 = M3D.mat4;
  var E = M3D.EARTH, MO = M3D.MOON;
  var R_E = E.R, MU = E.mu, G0 = E.g0, H_ORB = E.alt, R_ORB = E.r;
  var V_ORB = Math.sqrt(MU / R_ORB);
  var DEG = Math.PI / 180;
  var EC = E.center, MC = MO.center, MR = MO.R, MLORB = MO.orbitR;

  var KM_PER_UNIT = E.kmPerUnit;
  var TIME_SCALE = E.timeScale;
  var MS_PER_UNIT = KM_PER_UNIT * 1000 / TIME_SCALE;

  // ---- 上升段质量 / 推力（沿用经仿真标定的参数，保证精确入轨）----
  var PAY = 0.017, FAIR = 0.004, TOW = 0.007;
  var S2D = 0.013, S1D = 0.026, BD = 0.006;
  var BF0 = 0.075, S1F0 = 0.3584, F2 = 0.01672;
  var F1 = 0.06412, FB = 0.01603;
  var VE1 = 4.4922, VE2 = 5.5938;
  var S2F0 = 0.200, GHOST_LIMIT = -0.015;

  var ALPHA_SCHED = [
    [0, 0], [12, 0], [30, 5], [60, 15], [100, 25],
    [156, 35], [210, 55], [320, 72], [400, 80], [580, 90]
  ];
  function openLoopAlpha(met) {
    var A = ALPHA_SCHED;
    if (met <= A[0][0]) return A[0][1] * DEG;
    if (met >= A[A.length - 1][0]) return A[A.length - 1][1] * DEG;
    for (var i = 0; i < A.length - 1; i++) {
      if (met >= A[i][0] && met <= A[i + 1][0]) {
        var u = (met - A[i][0]) / (A[i + 1][0] - A[i][0]);
        return (A[i][1] + (A[i + 1][1] - A[i][1]) * u) * DEG;
      }
    }
    return 0;
  }
  var KG = 0.85, KH = 0.06, VR_CAP = 1.44, W_TERM = 0.62;
  var A_RATE = 3.5 * DEG, AOA_MAX = 10 * DEG;

  var IGN_RAMP = 0.54, SEP_DELAY = 0.3;
  var MET_PITCH = 12, MET_MAXQ = 75, MET_TOWER = 120, MET_FAIRING = 210;
  var HOLD_WARP = 3;

  var ALT_DENSE = 8 / KM_PER_UNIT, ALT_MID = 22 / KM_PER_UNIT, ALT_THIN = 80 / KM_PER_UNIT;
  var GAIN_A = 40, GAIN_TAU = 0.5;
  var TOWER_CLEAR = 28, GATE_SPAN = 18;

  // ---- 转移 / 环月几何 ----
  var R_AP = MR * 2.0;
  var dirToEarth = (function () {
    var dx = EC[0] - MC[0], dy = EC[1] - MC[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / l, dy / l];
  })();
  var PSI_EARTH = Math.atan2(dirToEarth[0], dirToEarth[1]);
  var APPROACH = [MC[0] + dirToEarth[0] * R_AP, MC[1] + dirToEarth[1] * R_AP];
  var THETA_A = Math.atan2(APPROACH[0] - EC[0], APPROACH[1] - EC[1]);
  var RHO_A = Math.hypot(APPROACH[0] - EC[0], APPROACH[1] - EC[1]);
  var LAW_SWEEP = 0.45, LOI_SWEEP = 0.40;
  var LAND_RM = MR + 1.7;                 // 触地时着陆器原点半径（留出让着陆腿恰好触面的余量）

  // ---- 真实任务时间锚点（秒）----
  //  两段式：第一次发射（揽月着陆器）MET 0 → 5 天，着陆器就位环月轨道；
  //  第二次发射（梦舟飞船）MET 5 天 → 10 天，环月交会对接；随后船器分离、动力下降、软着陆。
  var SEG2_BASE = 432000;              // 第二次发射的绝对时间基准（第一次发射后约 5 天）
  var MET_INSERT = 540, MET_TLI = 5400;         // 上升段锚点（相对本段发射时刻，两段共用）
  var MET_LOI = 360000, MET_LORB = 361200;      // 近月制动 / 入环月（相对本段发射时刻）
  var MET1_PARK = 432000;                        // 第一次发射：着陆器就位（相对，= 5 天）
  var MET2_RENDEZ = 428000, MET2_DOCK = 432000;  // 第二次发射：交会 / 对接（相对，= 9.9 / 10 天）
  var MET_LSEP = 866000, MET_LAND = 870000;      // 对接后：船器分离 / 月面软着陆（绝对时间）
  var DUR = { park: 6, tli: 7, transit: 42, loi: 12, lorb: 9, transition: 3, rendezvous: 11, dock: 7, descent: 30 };
  var LORB_RATE = 0.028;
  var PARK_RATE = 0.028;              // 驻留着陆器在第二次发射期间的环月角速度
  var DOCK_GAP = 1.55;                // 对接后着陆器质心位于飞船质心下方的间距（组合体系）
  var DOCK_PSI_TOL = 0.012;           // 交会对接触发阈值（飞船与着陆器环月角差，弧度）
  var ORB_VIS = 8;                  // 停泊轨道可视自转倍率：真实轨道角速度太慢，放大后一圈可见

  var PHASES = {
    ignition: '点火 · 三芯并联发动机启动，尾焰喷涌',
    liftoff: '起飞 · 长征十号垂直上升，离开塔架',
    pitch: '程序转弯 · 按俯仰程序缓缓侧转',
    maxQ: '最大动压 · 穿越气动载荷最强区',
    towerSep: '逃逸塔分离 · 抛离逃逸塔',
    boosterSep: '助推芯分离 · 两枚 5 米助推芯脱落',
    stage1Sep: '芯一级分离 · 中心芯级脱落',
    stage2Ignition: '二级点火 · 氢氧上面级继续加速',
    fairingSep: '整流罩分离 · 露出揽月着陆器',
    parkOrbit: '入轨 · 进入近地停泊轨道',
    parkOrbitLander: '入轨 · 揽月着陆器进入近地停泊轨道',
    parkOrbitShip: '入轨 · 梦舟飞船进入近地停泊轨道',
    tli: '地月转移点火 · 上面级二次点火奔月',
    stage2Sep: '船箭分离 · 上面级关机分离',
    transit: '地月转移轨道 · 飞向月球',
    loi: '近月制动 · 减速被月球引力捕获',
    lunarOrbit: '环月飞行 · 环绕月球运行',
    landerPark: '着陆器就位 · 揽月着陆器驻留环月轨道，静候飞船',
    transition: '数日后 · 第二次发射 · 梦舟载人飞船',
    rendezvous: '交会 · 梦舟飞船靠近环月轨道上的着陆器',
    docking: '对接 · 环月轨道交会对接，航天员转入着陆器',
    landerSep: '船器分离 · 揽月着陆器与梦舟飞船分离',
    descent: '动力下降 · 下降发动机反推制动',
    approach: '着陆末段 · 展开着陆腿，悬停避障',
    landing: '月面软着陆 · 揽月着陆器稳稳落在月面',
    landed: '着陆成功 · 航天员即将出舱，踏足月球'
  };

  function shortAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function smoothstep(u) { u = u < 0 ? 0 : (u > 1 ? 1 : u); return u * u * (3 - 2 * u); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function createMissionSystem(renderer, rocketModel, pad, hooks) {
    hooks = hooks || {};
    var parts = rocketModel.parts;
    var SHIP_OFFSET = M3D.SHIP_OFFSET;
    var LANDER_SOLO_CENTER = M3D.LANDER_SOLO_CENTER;   // 第一次发射船箭分离后，着陆器单体再归零中心
    var SHIP_SOLO_CENTER = M3D.SHIP_SOLO_CENTER;       // 第二次发射船箭分离后，飞船单体再归零中心
    // 入轨时活动栈质心（箭体系）：
    var C1_L = 8.75;               // 第一次发射：二级 + 着陆器
    var C1_S = 8.15;               // 第二次发射：二级 + 下移后的飞船 + 太阳翼
    var C2_L = LANDER_SOLO_CENTER; // 第一次发射船箭分离后：着陆器单体
    var C2_S = SHIP_SOLO_CENTER;   // 第二次发射船箭分离后：飞船单体

    var baseY0 = parts.map(function (p) { return p.baseY; });
    var legRot0 = parts.map(function (p) { return p.localRotX; });

    var state = {
      regime: 'ascent', phase: 'prelaunch', t: 0, phaseT: 0,
      r: R_E, theta: 0, vr: 0, vt: 0,
      alpha: 0, gamma: Math.PI / 2, tilt: Math.PI / 2, tiltVis: 0,
      x: 0, y: 0, alt: 0, altVis: 0, speed: 0, vCirc: V_ORB,
      mass: 1.02, accel: 0, gForce: 1, met: 0,
      fuel1: S1F0, fuel2: S2F0, fuelBoost: BF0,
      boostersAttached: true, stage1Attached: true, towerAttached: false, fairingAttached: true, stage2Attached: true,
      ignited: false, inserted: false, landed: false, warp: 1, scale: 1, hold: false,
      shipAttached: true, focus: rocketModel.center, progress: 0, sepT: 0, _altMax: 0, camDist: 20,
      engLocalY: 0.18, engSize: 1, burning: false, legsDeploy: 0,
      distEarth: 0, distMoon: MO.dist * KM_PER_UNIT, moonAlt: 0,
      psi: PSI_EARTH, rm: R_AP, rm0: MLORB, psi0: PSI_EARTH, psiSep: PSI_EARTH,
      transitTheta0: 0, transitRho0: R_E, parkAng: null,
      moonBlend: 0, surfCamBlend: 0, rezero1: false, rezero2: false,
      // ---- 两段式（双箭发射）状态 ----
      segment: 1, metBase: 0, landerParked: false, parkPsi: PSI_EARTH, docked: false,
      rendezOffset: 0, psiSepDock: PSI_EARTH, camSnap: false, segFade: 0, segFadeT: 0
    };
    var fired = {}, acc = {};
    var panels = [], landerParts = [], legParts = [], shipParts = [];
    var stack2Parts = [], stack1Parts = [];       // 第一次发射：入轨活动栈 / 船箭分离后活动栈
    var stackS1Parts = [], stackS2Parts = [];     // 第二次发射：入轨活动栈 / 船箭分离后活动栈
    for (var pi = 0; pi < parts.length; pi++) {
      var g = parts[pi].detachGroup, nm = parts[pi].name;
      if (g === 'panel') panels.push(parts[pi]);
      if (g === 'lander') landerParts.push(parts[pi]);
      if (nm.indexOf('leg') === 0) legParts.push(parts[pi]);
      if (g === 'ship') shipParts.push(parts[pi]);
      // 第一次发射：入轨活动栈 = 二级 + 着陆器；船箭分离后 = 着陆器
      if (g === 'lander' || g === 'stage2') stack1Parts.push(parts[pi]);
      if (g === 'lander') stack2Parts.push(parts[pi]);
      // 第二次发射：入轨活动栈 = 二级 + 飞船 + 太阳翼；船箭分离后 = 飞船 + 太阳翼
      if (g === 'ship' || g === 'panel' || g === 'stage2') stackS1Parts.push(parts[pi]);
      if (g === 'ship' || g === 'panel') stackS2Parts.push(parts[pi]);
    }

    // 部件在箭体系中的当前质心（baseY + centerY 的均值）
    function centroidOf(list) {
      if (!list.length) return 0;
      var s = 0;
      for (var i = 0; i < list.length; i++) s += list[i].baseY + list[i].centerY;
      return s / list.length;
    }

    function captionFor(key) {
      if (key === 'parkOrbit') return state.segment === 2 ? PHASES.parkOrbitShip : PHASES.parkOrbitLander;
      return PHASES[key];
    }
    function firePhase(key) {
      if (fired[key]) return;
      fired[key] = true;
      var text = captionFor(key);
      if (text && hooks.onPhase) hooks.onPhase(key, text);
    }
    function rezero(list, delta) { for (var i = 0; i < list.length; i++) list[i].baseY -= delta; }

    // ---- 尾焰网格 ----
    var flameCore = renderer.createMesh(M3D.geom.cylinder(0.30, 0.0001, 2.0, 16), [1.0, 0.55, 0.15], { group: 'fx' });
    flameCore.alpha = 0; flameCore.glow = 1; flameCore.visible = false;
    var flameOuter = renderer.createMesh(M3D.geom.cylinder(0.46, 0.0001, 1.45, 16), [1.0, 0.40, 0.06], { group: 'fx', blend: 'add', depthWrite: false });
    flameOuter.alpha = 0; flameOuter.glow = 1; flameOuter.visible = false;
    var glowDisc = renderer.createMesh(M3D.geom.disk(0.30, 16), [1.0, 0.88, 0.60], { group: 'fx', blend: 'add', depthWrite: false });
    glowDisc.alpha = 0; glowDisc.glow = 1; glowDisc.visible = false;
    var flameBoost = [];
    for (var fb = 0; fb < 2; fb++) {
      var fm = renderer.createMesh(M3D.geom.cylinder(0.22, 0.0001, 1.5, 12), [1.0, 0.5, 0.12], { group: 'fx' });
      fm.alpha = 0; fm.glow = 1; fm.visible = false; flameBoost.push(fm);
    }
    var machRingG = M3D.geom.torus(0.30, 0.045, 20, 7), machRings = [];
    for (var mr = 0; mr < 4; mr++) {
      var mm = renderer.createMesh(machRingG, [0.72, 0.84, 1.0], { group: 'fx', blend: 'add', depthWrite: false });
      mm.glow = 1; mm.visible = false; mm.alpha = 0; machRings.push(mm);
    }
    var nozParts = { s1: [], boost: [], s2: [], lander: [], ship: [] };
    for (var np = 0; np < parts.length; np++) {
      var pn = parts[np].name;
      if (pn === 'nozMain' || pn.indexOf('vernier') === 0) nozParts.s1.push(parts[np]);
      else if (pn.indexOf('boostNoz') === 0) nozParts.boost.push(parts[np]);
      else if (pn === 'nozS2') nozParts.s2.push(parts[np]);
      else if (pn === 'landerNozzle') nozParts.lander.push(parts[np]);
      else if (pn === 'svcModule') nozParts.ship.push(parts[np]);   // 梦舟服务舱主发动机（第二次发射深空段）
    }
    function engY(which) {
      var l = which === 's1' ? nozParts.s1 : (which === 's2' ? nozParts.s2 : (which === 'ship' ? nozParts.ship : nozParts.lander));
      return l.length ? l[0].baseY : 0;
    }

    var orbitRing = renderer.createMesh(M3D.geom.torus(R_ORB, 12, 220, 6), [0.25, 0.42, 1.0], { group: 'fx', blend: 'add', depthWrite: false });
    orbitRing.glow = 1;
    mat4.identity(orbitRing.modelMatrix);
    mat4.translate(orbitRing.modelMatrix, orbitRing.modelMatrix, EC);
    mat4.rotateX(orbitRing.modelMatrix, orbitRing.modelMatrix, Math.PI / 2);
    orbitRing.alpha = 0; orbitRing.visible = false;

    var moonRing = renderer.createMesh(M3D.geom.torus(MLORB, 5, 200, 6), [0.62, 0.74, 1.0], { group: 'fx', blend: 'add', depthWrite: false });
    moonRing.glow = 1;
    mat4.identity(moonRing.modelMatrix);
    mat4.translate(moonRing.modelMatrix, moonRing.modelMatrix, MC);
    mat4.rotateX(moonRing.modelMatrix, moonRing.modelMatrix, Math.PI / 2);
    moonRing.alpha = 0; moonRing.visible = false;

    // ---- 坐标变换 ----
    var _lw = [0, 0, 0];
    function localToWorld(lx, ly, lz, out) {
      var c = Math.cos(state.tiltVis), s = Math.sin(state.tiltVis);
      out = out || _lw;
      out[0] = lx * c + ly * s + state.x;
      out[1] = -lx * s + ly * c + state.y;
      out[2] = lz;
      return out;
    }
    function localDirToWorld(dx, dy, dz, out) {
      var c = Math.cos(state.tiltVis), s = Math.sin(state.tiltVis);
      out = out || _lw;
      out[0] = dx * c + dy * s; out[1] = -dx * s + dy * c; out[2] = dz;
      return out;
    }
    function bodyToWorld(lx, ly, lz, out) {
      var s = state.scale;
      return localToWorld(lx * s, ly * s, lz * s, out);
    }

    function syncWorldAscent() {
      var h = Math.max(0, state.r - R_E);
      var gain = 1 + GAIN_A / (GAIN_TAU + h);
      var hv = h * gain;
      if (hv < state._altMax) hv = state._altMax; else state._altMax = hv;
      var rho = R_E + hv;
      state.x = EC[0] + rho * Math.sin(state.theta);
      state.y = EC[1] + rho * Math.cos(state.theta);
      state.altVis = hv;
      state.tilt = state.theta + state.alpha;
      var g8 = (state.altVis - TOWER_CLEAR) / GATE_SPAN;
      g8 = g8 < 0 ? 0 : (g8 > 1 ? 1 : g8 * g8 * (3 - 2 * g8));
      state.tiltVis = state.tilt * g8;
      state.alt = state.r - R_E;
      state.speed = Math.sqrt(state.vr * state.vr + state.vt * state.vt);
      state.met = state.metBase + state.t * TIME_SCALE;
      state.distEarth = state.r * KM_PER_UNIT;
      state.distMoon = Math.hypot(state.x - MC[0], state.y - MC[1]) * KM_PER_UNIT;
      if (state.segment === 2) state.progress = 0.50 + Math.min(0.20, (state.t / 95) * 0.20);
      else state.progress = Math.min(0.30, (state.t / 95) * 0.30);
    }

    function currentMass() {
      var m = PAY + S2D + state.fuel2;
      if (state.stage1Attached) m += S1D + state.fuel1;
      if (state.boostersAttached) m += 4 * (BD + state.fuelBoost);
      if (state.towerAttached) m += TOW;
      if (state.fairingAttached) m += FAIR;
      return m;
    }
    function currentThrust() {
      if (state.phase === 'ignition') return (F1 + 4 * FB) * Math.min(state.t / IGN_RAMP, 1);
      if (state.phase === 'burn1') return F1 + (state.boostersAttached ? 4 * FB : 0);
      if (state.phase === 'burn2') return state.fuel2 > GHOST_LIMIT ? F2 : 0;
      return 0;
    }
    function isBurningPhys() {
      if (state.phase === 'ignition' || state.phase === 'burn1') return true;
      if (state.phase === 'burn2') return state.fuel2 > GHOST_LIMIT;
      return false;
    }

    function detach(group) {
      var w = [0, 0, 0];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.detachGroup !== group || p.detached) continue;
        p.detached = true; p.detachT = state.t;
        p.detachBaseY = state.y; p.detachX = state.x; p.detachPitch = state.tiltVis; p.detachScale = state.scale;
        p.detachOff = [0, 0, 0]; p.detachRot = [0, 0, 0];
        if (group === 'booster') {
          var len = Math.sqrt(p.ox * p.ox + p.oz * p.oz) || 1;
          p.detachV = localDirToWorld((p.ox / len) * 1.5, -0.9, (p.oz / len) * 1.5, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.2];
        } else if (group === 'tower') {
          p.detachV = localDirToWorld(0.5, 3.4, 0.2, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2];
        } else if (group === 'fairing') {
          var fsd = p.side || 1;
          p.detachV = localDirToWorld(fsd * 1.35, 1.7, 0.4, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 0.9, fsd * (1.1 + Math.random() * 0.5)];
        } else if (group === 'stage1') {
          p.detachV = localDirToWorld((Math.random() - 0.5) * 0.32, -2.2, (Math.random() - 0.5) * 0.32, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7];
        } else if (group === 'stage2') {
          p.detachV = localDirToWorld((Math.random() - 0.5) * 0.2, -1.6, (Math.random() - 0.5) * 0.2, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4];
        }
      }
      var n = group === 'tower' ? 22 : (group === 'stage1' ? 26 : 20);
      if (group === 'booster') {
        for (var b = 0; b < 2; b++) {
          var ba = b * Math.PI + Math.PI / 2;
          localToWorld(Math.cos(ba) * rocketModel.boosterDist, 1.9, Math.sin(ba) * rocketModel.boosterDist, w);
          flashAt(w[0], w[1], w[2], 16);
        }
      } else {
        var ly = group === 'tower' ? (11.8 - (state.segment === 2 ? SHIP_OFFSET : 0))
          : (group === 'stage1' ? 6.2 : (group === 'fairing' ? 9.4 : (group === 'stage2' ? engY('s2') : 1.6)));
        bodyToWorld(0, ly, 0, w);
        flashAt(w[0], w[1], w[2], n, 1);
      }
    }

    function separateLander() {
      var w = [0, 0, 0];
      // 着陆器质心相对当前原点（对接后的组合体，focus=0 位于飞船质心附近）；
      // 用实时质心而非固定常量，兼容「双箭对接」后着陆器位于飞船下方的构型。
      var landerLocal = centroidOf(landerParts);
      bodyToWorld(0, landerLocal, 0, w);
      var lx = w[0], ly = w[1];
      // 飞船 + 太阳翼分离漂离（沿飞行方向）
      for (var i = 0; i < shipParts.length; i++) {
        var p = shipParts[i];
        p.detached = true; p.detachT = state.t;
        p.detachBaseY = state.y; p.detachX = state.x; p.detachPitch = state.tiltVis; p.detachScale = state.scale;
        p.detachOff = [0, 0, 0]; p.detachRot = [0, 0, 0];
        p.detachV = [(Math.random() - 0.5) * 0.15, 1.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15];
        p.detachSpin = [(Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08];
      }
      for (var j = 0; j < panels.length; j++) {
        var q = panels[j];
        q.detached = true; q.detachT = state.t;
        q.detachBaseY = state.y; q.detachX = state.x; q.detachPitch = state.tiltVis; q.detachScale = state.scale;
        q.detachOff = [0, 0, 0]; q.detachRot = [0, 0, 0];
        q.detachV = [(q.ox > 0 ? 0.7 : -0.7), 1.2, 0]; q.detachSpin = [0, (q.ox > 0 ? 0.25 : -0.25)];
      }
      flashAt(lx, ly, 0, 26, 1.1);
      // 着陆器成为活动体：重心归零、原点移到着陆器质心
      rezero(landerParts, landerLocal);
      state.x = lx; state.y = ly; state.focus = 0;
      state.shipAttached = false;
      // 由着陆器质心反推月心极坐标，作为动力下降起点（保证连续无跳变）
      state.rm0 = Math.hypot(lx - MC[0], ly - MC[1]);
      state.psi0 = Math.atan2(lx - MC[0], ly - MC[1]);
      state.psiSep = state.psi0;
      for (var k = 0; k < legParts.length; k++) legParts[k].mesh.visible = true;
    }

    // ---- 第一次发射结束：着陆器「驻留」环月轨道 ----
    //  着陆器转为独立渲染体（parked），第二次发射期间持续绕月，等待飞船交会。
    function parkLander() {
      state.parkPsi = state.psi;
      state.landerParked = true;
      for (var i = 0; i < landerParts.length; i++) {
        var p = landerParts[i];
        p.parked = true; p.detached = true; p.detachT = state.t;
        p.detachOff = [0, 0, 0]; p.detachV = [0, 0, 0];
        p.detachRot = [0, 0, 0]; p.detachSpin = [0, 0, 0]; p.detachScale = state.scale;
      }
    }

    // ---- 每帧直接写入驻留着陆器的模型矩阵（复刻 updatePartTransforms 数学）----
    function positionParkedLander() {
      if (!state.landerParked) return;
      var psi = state.parkPsi;
      var ox = MC[0] + MLORB * Math.sin(psi);
      var oy = MC[1] + MLORB * Math.cos(psi);
      var tilt = progradeTilt(psi);
      var s = state.scale;
      var alpha = state.moonBlend;             // 随月球一同淡入淡出
      var vis = alpha > 0.01;
      for (var i = 0; i < landerParts.length; i++) {
        var p = landerParts[i];
        var m = p.tmp;
        mat4.identity(m);
        mat4.translate(m, m, [ox, oy, 0]);
        if (s !== 1) mat4.scale(m, m, [s, s, s]);
        mat4.rotateZ(m, m, -tilt);
        mat4.translate(m, m, [p.ox, p.baseY + p.centerY, p.oz]);
        if (p.localRotY) mat4.rotateY(m, m, p.localRotY);
        if (p.localRotX) mat4.rotateX(m, m, p.localRotX);
        mat4.translate(m, m, [0, -p.centerY, 0]);
        var mm = p.mesh.modelMatrix;
        for (var k = 0; k < 16; k++) mm[k] = m[k];
        // 着陆腿驻留轨道时收起隐藏（与飞行段一致），其余部件随月球淡入
        var isLeg = p.name.indexOf('leg') === 0;
        p.mesh.alpha = isLeg ? 0 : alpha;
        p.mesh.visible = isLeg ? false : vis;
      }
    }

    // ---- 段间过渡：把箭体复原为「第二次发射（载人飞船）」构型 ----
    function resetForSegment2() {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], g = p.detachGroup;
        if (g === 'lander') continue;              // 着陆器保持驻留，独立渲染，不复位
        p.detached = false; p.parked = false;
        p.detachOff = [0, 0, 0]; p.detachV = [0, 0, 0];
        p.detachRot = [0, 0, 0]; p.detachSpin = [0, 0, 0];
        p.detachScale = 1; p.mesh.alpha = 1;
        if (g === 'booster' || g === 'stage1' || g === 'stage2') {
          p.baseY = baseY0[i]; p.mesh.visible = true;         // 共用箭体复原到发射前
        } else if (g === 'ship' || g === 'tower') {
          p.baseY = baseY0[i] - SHIP_OFFSET; p.mesh.visible = true;  // 载人构型：整体下移
        } else if (g === 'panel') {
          p.baseY = baseY0[i] - SHIP_OFFSET; p.mesh.visible = false;  // 太阳翼入轨后展开
        } else if (g === 'fairing') {
          p.baseY = baseY0[i]; p.mesh.visible = false;        // 整流罩已在第一次发射用毕
        }
      }
      // 上升段物理状态复位（同一枚长征十号，物理参数不变）
      state.segment = 2; state.metBase = SEG2_BASE;
      state.regime = 'ascent'; state.phase = 'ignition'; state.phaseT = 0; state.t = 0;
      state.r = R_E; state.theta = 0; state.vr = 0; state.vt = 0;
      state.alpha = 0; state.gamma = Math.PI / 2; state.tilt = Math.PI / 2; state.tiltVis = 0;
      state.x = 0; state.y = 0; state.alt = 0; state.altVis = 0; state._altMax = 0;
      state.fuel1 = S1F0; state.fuel2 = S2F0; state.fuelBoost = BF0;
      state.boostersAttached = true; state.stage1Attached = true; state.stage2Attached = true;
      state.towerAttached = true; state.fairingAttached = false;
      state.inserted = false; state.scale = 1; state.focus = rocketModel.center;
      state.rezero1 = false; state.rezero2 = false;
      state.shipAttached = true; state.docked = false; state.sepT = 0;
      state.engLocalY = 0.18; state.engSize = 1; state.burning = false; state.legsDeploy = 0;
      state.parkAng = null; state.moonBlend = 0; state.surfBlend = 0; state.surfCamBlend = 0;
      state.rm = R_AP; state.psi = PSI_EARTH;
      state.distEarth = 0; state.distMoon = MO.dist * KM_PER_UNIT; state.moonAlt = 0;
      state.met = SEG2_BASE; state.progress = 0.50; state.camSnap = true;
      state.segFade = 1; state.segFadeT = 1.0;      // 黑场保持，随后淡入到第二次发射的箭体
      // 发射台 / 地球复位
      pad.armSwing = 0; M3D.setArmSwing(pad, 0);
      pad.earthSpin = 0; M3D.spinEarth(pad, 0, 0);
      if (pad.ember) pad.ember.glow = 0;
      for (var li = 0; li < legParts.length; li++) legParts[li].localRotX = legRot0[parts.indexOf(legParts[li])];
      // 清除已触发标记，第二次发射重新播报；驻留着陆器仍绕月
      fired = {};
      firePhase('ignition');
    }

    // ---- 交会对接：解除着陆器驻留，接合到飞船下方构成环月组合体 ----
    function dockLander() {
      var w = [0, 0, 0];
      var curC = centroidOf(landerParts);      // 驻留时着陆器质心（≈ 0）
      var targetC = -DOCK_GAP;                 // 置于飞船（focus≈0）下方
      rezero(landerParts, curC - targetC);
      for (var i = 0; i < landerParts.length; i++) {
        var p = landerParts[i];
        p.parked = false; p.detached = false; p.detachT = state.t;
        p.detachOff = [0, 0, 0]; p.detachV = [0, 0, 0];
        p.detachRot = [0, 0, 0]; p.detachSpin = [0, 0, 0];
        p.detachScale = 1; p.mesh.alpha = 1;
      }
      state.landerParked = false; state.docked = true; state.shipAttached = true; state.focus = 0;
      state.psiSepDock = state.psi;      // 对接后组合体环月起始角
      bodyToWorld(0, targetC, 0, w);
      flashAt(w[0], w[1], 0, 24, 1.0);
    }

    function flashAt(x, y, z, n, szK) {
      var k = szK || 1;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, rr = Math.random() * 0.5, sp = (2 + Math.random() * 3) * k;
        renderer.particles.spawn(
          x + Math.cos(a) * rr * k, y + (Math.random() - 0.4) * 0.5 * k, z + Math.sin(a) * rr * k,
          Math.cos(a) * sp, (Math.random() - 0.2) * sp, Math.sin(a) * sp,
          1.0, 0.92, 0.6, 0.22 + Math.random() * 0.2, 1.2 * k);
      }
    }

    // ---- 粒子 ----
    function spawnFlames(dt) {
      if (!state.burning) return;
      var ramp = state.phase === 'ignition' ? Math.min(state.t / IGN_RAMP, 1) : 1;
      var noz = bodyToWorld(0, state.engLocalY, 0, [0, 0, 0]);
      var down = localDirToWorld(0, -1, 0, [0, 0, 0]);
      var ascent = state.regime === 'ascent';
      var thin = ascent ? (state.alt > ALT_THIN) : true;
      var sizeK = state.engSize * state.scale;
      var coreRate = (ascent ? (state.stage1Attached ? 58 : 34) : 30) * (thin ? 0.6 : 1);
      acc.core = (acc.core || 0) + coreRate * dt * ramp;
      while (acc.core >= 1) {
        acc.core -= 1;
        var a = Math.random() * Math.PI * 2, rr = Math.random() * 0.16 * (thin ? 2.0 : 1);
        var off = localDirToWorld(Math.cos(a) * rr, 0, Math.sin(a) * rr, [0, 0, 0]);
        var sp = (6 + Math.random() * 5) * ramp * sizeK;
        renderer.particles.spawn(
          noz[0] + off[0] * sizeK, noz[1] + off[1] * sizeK, noz[2] + off[2] * sizeK,
          off[0] * 4 + down[0] * sp + (Math.random() - 0.5) * 1.4,
          down[1] * sp + (Math.random() - 0.5) * 0.5,
          off[2] * 4 + down[2] * sp + (Math.random() - 0.5) * 1.4,
          1.0, 0.36 + Math.random() * 0.35, 0.05 + Math.random() * 0.12, 0.4 + Math.random() * 0.35, (thin ? 1.6 : 1.0) * sizeK);
      }
      if (ascent && state.boostersAttached && state.stage1Attached) {
        acc.boost = (acc.boost || 0) + 40 * dt * ramp;
        while (acc.boost >= 1) {
          acc.boost -= 1;
          var bi = (Math.random() * 2) | 0, ba2 = bi * Math.PI + Math.PI / 2;
          var bw = localToWorld(Math.cos(ba2) * rocketModel.boosterDist, 0.14, Math.sin(ba2) * rocketModel.boosterDist, [0, 0, 0]);
          var a3 = Math.random() * Math.PI * 2, r3 = Math.random() * 0.12;
          var off3 = localDirToWorld(Math.cos(a3) * r3, 0, Math.sin(a3) * r3, [0, 0, 0]);
          var bs = (5 + Math.random() * 4) * ramp;
          renderer.particles.spawn(
            bw[0] + off3[0], bw[1] + off3[1], bw[2] + off3[2],
            off3[0] * 3 + down[0] * bs + (Math.random() - 0.5) * 0.9,
            down[1] * bs + (Math.random() - 0.5) * 0.4,
            off3[2] * 3 + down[2] * bs + (Math.random() - 0.5) * 0.9,
            1.0, 0.32 + Math.random() * 0.3, 0.04 + Math.random() * 0.1, 0.4 + Math.random() * 0.3, 1.0);
        }
      }
      if (ascent && state.alt < ALT_THIN) {
        var dense = state.alt < ALT_DENSE, thinAir = state.alt > ALT_MID;
        acc.smoke = (acc.smoke || 0) + (dense ? 60 : (thinAir ? 24 : 42)) * dt;
        while (acc.smoke >= 1) {
          acc.smoke -= 1;
          var sa = Math.random() * Math.PI * 2, sr = 0.15 + Math.random() * 0.55;
          var sw = localToWorld(Math.cos(sa) * sr, state.engLocalY - 0.6, Math.sin(sa) * sr, [0, 0, 0]);
          var sv = (dense ? 1.1 : 0.7) + Math.random() * (dense ? 1.9 : 1.3);
          var st = 0.55 + Math.random() * 0.22;
          renderer.particles.spawnSmoke(sw[0], sw[1], sw[2],
            down[0] * sv + (Math.random() - 0.5) * 2.2, down[1] * sv + (Math.random() - 0.5) * 0.7, down[2] * sv + (Math.random() - 0.5) * 2.2,
            st, st, st * 1.03,
            (dense ? 3.0 : 2.2) + Math.random() * (dense ? 2.8 : 2.4),
            (dense ? 1.1 : 0.8) + Math.random() * (dense ? 1.1 : 0.9),
            (dense ? 1.4 : 1.1) + Math.random() * 1.1, thinAir ? 0.7 : 1.3);
        }
      }
    }

    function spawnPadSmoke(dt) {
      var k = state.t < IGN_RAMP ? 0.6 : Math.max(0, 1 - (state.t - IGN_RAMP) / 5.0);
      if (k <= 0.02 && state.altVis >= 6) return;
      var rate = 95 * Math.max(k, 0.18) + (state.altVis < 6 ? 26 : 0);
      acc.pad = (acc.pad || 0) + rate * dt;
      while (acc.pad >= 1) {
        acc.pad -= 1;
        var a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 4.4;
        var ca = Math.cos(a), sa2 = Math.sin(a);
        var outV = 1.2 + Math.random() * 3.4, swirl = (Math.random() - 0.5) * 3.2, upV = 1.2 + Math.random() * 3.6;
        var tint = 0.46 + Math.random() * 0.22, warm = Math.random() < 0.22;
        renderer.particles.spawnSmoke(ca * r, 0.15 + Math.random() * 0.7, sa2 * r,
          ca * outV - sa2 * swirl, upV, sa2 * outV + ca * swirl,
          warm ? 0.82 : tint, warm ? 0.55 : tint, warm ? 0.36 : tint * 1.05,
          3.2 + Math.random() * 3.2, 1.6 + Math.random() * 2.0, 1.2 + Math.random() * 1.2, 1.5, 0.06);
      }
    }

    function spawnLunarDust(dt, intensity) {
      var noz = bodyToWorld(0, state.engLocalY - 0.2, 0, [0, 0, 0]);
      var up = localDirToWorld(0, 1, 0, [0, 0, 0]);
      acc.dust = (acc.dust || 0) + 110 * intensity * dt;
      while (acc.dust >= 1) {
        acc.dust -= 1;
        var a = Math.random() * Math.PI * 2;
        var t1x = -up[1], t1y = up[0], tl = Math.hypot(t1x, t1y) || 1; t1x /= tl; t1y /= tl;
        var sp = (2 + Math.random() * 6) * (0.5 + intensity);
        var dx = t1x * Math.cos(a), dy = t1y * Math.cos(a), dz = Math.sin(a) * 0.7;
        renderer.particles.spawnSmoke(
          noz[0] + dx * 0.3, noz[1] + dy * 0.3, noz[2],
          dx * sp - up[0] * sp * 0.2, dy * sp - up[1] * sp * 0.2, dz * sp * 0.5,
          0.56, 0.54, 0.51, 2.4 + Math.random() * 2.2, 0.8 + Math.random() * 1.5, 1.5 + Math.random() * 1.6, 1.3, 0.0);
      }
    }

    function spawnTrail(dt) {
      acc.trail = (acc.trail || 0) + 30 * dt;
      var sz = Math.max(1.5, Math.min(14, state.camDist * 0.0022));
      var hw = bodyToWorld(0, state.focus, 0, [0, 0, 0]);
      renderer.particles.spawn(hw[0], hw[1], hw[2], 0, 0, 0, 0.45, 0.75, 1.0, Math.max(dt * 2.4, 0.05), state.scale * 2.2, 0);
      while (acc.trail >= 1) {
        acc.trail -= 1;
        var w = bodyToWorld((Math.random() - 0.5) * 0.12, state.focus + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, [0, 0, 0]);
        renderer.particles.spawn(w[0], w[1], w[2], 0, 0, 0, 0.30, 0.72, 1.0, 3.2, sz * (0.8 + Math.random() * 0.4), 0, -0.45);
      }
    }

    function syncFlames() {
      var thrust = state.burning;
      var flick = 1 + Math.sin(state.t * 42) * 0.16 + Math.sin(state.t * 23 + 1.7) * 0.1;
      var sizeK = state.engSize * state.scale;
      var nozW = bodyToWorld(0, state.engLocalY, 0, [0, 0, 0]);
      var widen = 1 + (state.regime === 'ascent' ? Math.min(state.alt / ALT_THIN, 1) : 1) * 1.3;
      var m = flameCore.modelMatrix;
      mat4.identity(m);
      mat4.translate(m, m, [nozW[0], nozW[1], nozW[2]]);
      mat4.rotateZ(m, m, -state.tiltVis);
      mat4.scale(m, m, [sizeK * widen, flick * sizeK, sizeK * widen]);
      mat4.translate(m, m, [0, -2.0, 0]);
      flameCore.visible = thrust; flameCore.alpha = thrust ? 0.8 : 0;

      var mo = flameOuter.modelMatrix;
      mat4.identity(mo);
      mat4.translate(mo, mo, [nozW[0], nozW[1], nozW[2]]);
      mat4.rotateZ(mo, mo, -state.tiltVis);
      mat4.scale(mo, mo, [sizeK * widen * 1.35, flick * sizeK * 0.78, sizeK * widen * 1.35]);
      mat4.translate(mo, mo, [0, -1.45, 0]);
      flameOuter.visible = thrust; flameOuter.alpha = thrust ? 0.30 : 0;

      var machOn = thrust && state.regime === 'ascent' && state.alt * KM_PER_UNIT > 4 && state.alt * KM_PER_UNIT < 90;
      var machK = Math.max(0, Math.min(1, (state.alt * KM_PER_UNIT - 4) / 10));
      for (var mi = 0; mi < machRings.length; mi++) {
        var hM = 0.45 + mi * 0.38, rFac = 0.75 - mi * 0.13;
        var mmr = machRings[mi].modelMatrix;
        mat4.identity(mmr);
        mat4.translate(mmr, mmr, [nozW[0], nozW[1], nozW[2]]);
        mat4.rotateZ(mmr, mmr, -state.tiltVis);
        mat4.scale(mmr, mmr, [sizeK * widen * rFac, flick * sizeK, sizeK * widen * rFac]);
        mat4.translate(mmr, mmr, [0, -hM, 0]);
        machRings[mi].visible = machOn;
        machRings[mi].alpha = machOn ? 0.5 * machK * (1 - mi * 0.14) * (0.7 + 0.3 * flick) : 0;
      }

      var md = glowDisc.modelMatrix;
      mat4.identity(md);
      mat4.translate(md, md, [nozW[0], nozW[1], nozW[2]]);
      mat4.scale(md, md, [sizeK, sizeK, sizeK]);
      mat4.rotateZ(md, md, -state.tiltVis);
      mat4.rotateX(md, md, Math.PI);
      glowDisc.visible = thrust; glowDisc.alpha = thrust ? 0.85 : 0;

      var heat = thrust ? (0.30 + 0.08 * Math.sin(state.t * 36)) : 0;
      var s1On = state.regime === 'ascent' && state.stage1Attached && state.phase !== 'burn2';
      for (var hi = 0; hi < nozParts.s1.length; hi++) nozParts.s1[hi].mesh.glow = s1On ? heat : 0;
      for (hi = 0; hi < nozParts.boost.length; hi++) nozParts.boost[hi].mesh.glow = (s1On && state.boostersAttached) ? heat : 0;
      var s2On = (state.phase === 'burn2' || state.phase === 'tli') && state.stage2Attached;
      for (hi = 0; hi < nozParts.s2.length; hi++) nozParts.s2[hi].mesh.glow = s2On ? heat * 1.2 : 0;
      var ldOn = (state.phase === 'loi' || state.phase === 'descent' || state.phase === 'approach' || state.phase === 'landing');
      for (hi = 0; hi < nozParts.lander.length; hi++) nozParts.lander[hi].mesh.glow = ldOn ? heat * 1.1 : 0;

      var boostOn = thrust && state.regime === 'ascent' && state.boostersAttached && state.stage1Attached;
      for (var i = 0; i < 2; i++) {
        var ba = i * Math.PI + Math.PI / 2;
        var w = localToWorld(Math.cos(ba) * rocketModel.boosterDist, 0.1, Math.sin(ba) * rocketModel.boosterDist, [0, 0, 0]);
        var bm = flameBoost[i].modelMatrix;
        mat4.identity(bm);
        mat4.translate(bm, bm, [w[0], w[1], w[2]]);
        mat4.rotateZ(bm, bm, -state.tiltVis);
        mat4.scale(bm, bm, [widen, flick, widen]);
        mat4.translate(bm, bm, [0, -1.5, 0]);
        flameBoost[i].visible = boostOn; flameBoost[i].alpha = boostOn ? 0.8 : 0;
      }
    }

    // ============ 上升段物理 ============
    function stepAscent(dt) {
      state.t += dt;
      var metL = state.t * TIME_SCALE;      // 本段发射的任务时刻（用于上升段事件触发，两段共用同一套阈值）
      var m = state.mass = currentMass();
      var F = currentThrust();
      var A = F / m;
      var g = MU / (state.r * state.r);
      var h = state.r - R_E;
      var v = Math.sqrt(state.vr * state.vr + state.vt * state.vt) || 1e-6;
      var gamma = Math.atan2(state.vr, state.vt);

      var aCmd = 0;
      if (state.phase !== 'ignition' && metL >= MET_PITCH) {
        aCmd = openLoopAlpha(metL);
        var vCircNow = Math.sqrt(MU / state.r);
        var w = Math.max(0, Math.min(1, (v / vCircNow - W_TERM) / (1 - W_TERM)));
        var vrWant = Math.max(-VR_CAP, Math.min(VR_CAP, KH * (H_ORB - h)));
        var gRef = Math.atan2(vrWant, Math.max(state.vt, 0.02));
        aCmd += Math.max(-AOA_MAX, Math.min(AOA_MAX, w * KG * (gamma - gRef)));
        aCmd = Math.max(0, Math.min(100 * DEG, aCmd));
      }
      var dA = aCmd - state.alpha, lim = A_RATE * dt;
      state.alpha += Math.max(-lim, Math.min(lim, dA));

      if (state.phase === 'ignition') {
        if (state.t >= IGN_RAMP && F > m * g) { state.phase = 'burn1'; firePhase('liftoff'); }
        else { state.vr = 0; state.vt = 0; state.accel = 0; return; }
      }

      var burning = isBurningPhys();
      var ar = (burning ? A * Math.cos(state.alpha) : 0) - g + state.vt * state.vt / state.r;
      var at = (burning ? A * Math.sin(state.alpha) : 0) - state.vr * state.vt / state.r;
      state.accel = burning ? A : 0;
      state.vr += ar * dt; state.vt += at * dt;
      state.r += state.vr * dt; state.theta += (state.vt / state.r) * dt;
      if (state.r < R_E) { state.r = R_E; state.vr = Math.max(0, state.vr); }
      state.gamma = Math.atan2(state.vr, state.vt);

      if (state.phase === 'burn1') {
        state.fuel1 -= F1 / VE1 * dt;
        if (state.boostersAttached) {
          state.fuelBoost -= FB / VE1 * dt;
          if (state.fuelBoost <= 0) { state.fuelBoost = 0; state.boostersAttached = false; detach('booster'); firePhase('boosterSep'); }
        }
        if (state.fuel1 <= 0) {
          state.fuel1 = 0; state.stage1Attached = false;
          detach('stage1'); firePhase('stage1Sep');
          state.phase = 'sep'; state.sepT = 0;
        }
      } else if (state.phase === 'sep') {
        state.sepT += dt;
        if (state.sepT >= SEP_DELAY) { state.phase = 'burn2'; firePhase('stage2Ignition'); }
      } else if (state.phase === 'burn2') {
        if (state.fuel2 > GHOST_LIMIT) state.fuel2 = Math.max(GHOST_LIMIT, state.fuel2 - F2 / VE2 * dt);
      }

      if (!fired.pitch && metL >= MET_PITCH) firePhase('pitch');
      if (!fired.maxQ && metL >= MET_MAXQ && h > ALT_DENSE) firePhase('maxQ');
      if (state.towerAttached && metL >= MET_TOWER) { state.towerAttached = false; detach('tower'); firePhase('towerSep'); }
      if (state.fairingAttached && metL >= MET_FAIRING) { state.fairingAttached = false; detach('fairing'); firePhase('fairingSep'); }

      if (state.phase === 'burn2') {
        var vCirc = Math.sqrt(MU / state.r);
        if (state.vt >= vCirc * 0.999 && Math.abs(state.vr) < 0.15) {
          state.inserted = true;
          if (state.segment === 2) {
            // 第二次发射：展开太阳翼，重心归零到「二级 + 飞船 + 太阳翼」活动栈质心
            for (var k = 0; k < panels.length; k++) panels[k].mesh.visible = true;
            rezero(stackS1Parts, C1_S);
          } else {
            // 第一次发射：重心归零到「二级 + 着陆器」活动栈质心（无飞船 / 太阳翼）
            rezero(stack1Parts, C1_L);
          }
          state.rezero1 = true;
          state.focus = 0;
          state.regime = 'space'; state.phase = 'parkOrbit'; state.phaseT = 0;
          state.parkAng = state.theta;
          state.fuel2 = S2F0 * 0.5;
          firePhase('parkOrbit');
        }
      }
    }

    // ============ 脚本段 ============
    function setPose(px, py, tiltTarget, rate) {
      state.x = px; state.y = py;
      state.tilt += shortAngle(tiltTarget - state.tilt) * Math.min(1, rate);
      state.tiltVis = state.tilt;
    }
    function progradeTilt(psi) { return Math.atan2(Math.cos(psi), -Math.sin(psi)); }

    function stepScripted(dt) {
      var ph = state.phase, u, pos, psi, rm, tiltT;
      var seg2 = state.segment === 2;
      state.phaseT += dt * state.warp;

      // 第二次发射期间，驻留着陆器持续绕月（与飞船同向），供交会段收敛
      if (seg2 && state.landerParked &&
          (ph === 'transit' || ph === 'loi' || ph === 'lunarOrbit' || ph === 'rendezvous')) {
        state.parkPsi += PARK_RATE * dt * state.warp;
      }

      if (ph === 'parkOrbit') {
        var wOrb = Math.sqrt(MU / (R_ORB * R_ORB * R_ORB));
        state.parkAng += wOrb * dt * state.warp * ORB_VIS;
        var rhoP = R_E + (R_ORB - R_E) * (1 + GAIN_A / (GAIN_TAU + (R_ORB - R_E)));
        pos = [EC[0] + rhoP * Math.sin(state.parkAng), EC[1] + rhoP * Math.cos(state.parkAng)];
        setPose(pos[0], pos[1], progradeTilt(state.parkAng), dt * 2);
        state.theta = state.parkAng;
        state.alt = R_ORB - R_E; state.altVis = rhoP - R_E;
        state.speed = V_ORB * MS_PER_UNIT;
        state.met = state.metBase + lerp(MET_INSERT, MET_TLI, Math.min(1, state.phaseT / DUR.park));
        state.distEarth = R_ORB * KM_PER_UNIT;
        state.distMoon = Math.hypot(pos[0] - MC[0], pos[1] - MC[1]) * KM_PER_UNIT;
        state.scale += (20 - state.scale) * Math.min(1, dt * 0.8);
        state.engLocalY = engY('s2'); state.engSize = 0.6; state.burning = false;
        state.progress = seg2 ? lerp(0.70, 0.72, Math.min(1, state.phaseT / DUR.park))
                              : lerp(0.30, 0.34, Math.min(1, state.phaseT / DUR.park));
        if (state.phaseT >= DUR.park) { state.phase = 'tli'; state.phaseT = 0; state.burning = true; firePhase('tli'); }
        return;
      }

      if (ph === 'tli') {
        u = Math.min(1, state.phaseT / DUR.tli);
        var wO = Math.sqrt(MU / (R_ORB * R_ORB * R_ORB));
        state.parkAng += wO * dt * state.warp * ORB_VIS * (1 + u * 2.4);
        var rhoT = (R_E + (R_ORB - R_E) * 1.41) * (1 + u * u * 0.5);
        pos = [EC[0] + rhoT * Math.sin(state.parkAng), EC[1] + rhoT * Math.cos(state.parkAng)];
        setPose(pos[0], pos[1], progradeTilt(state.parkAng), dt * 3);
        state.theta = state.parkAng;
        state.speed = V_ORB * MS_PER_UNIT * (1 + u * 0.16);
        state.met = state.metBase + lerp(MET_TLI, MET_TLI + 900, u);
        state.distEarth = Math.hypot(pos[0] - EC[0], pos[1] - EC[1]) * KM_PER_UNIT;
        state.distMoon = Math.hypot(pos[0] - MC[0], pos[1] - MC[1]) * KM_PER_UNIT;
        state.scale += (20 - state.scale) * Math.min(1, dt * 0.8);
        state.engLocalY = engY('s2'); state.engSize = 0.75; state.burning = true;
        state.progress = seg2 ? lerp(0.72, 0.74, u) : lerp(0.34, 0.38, u);
        if (u >= 1) {
          // 上面级关机分离，重心归零到本段单独飞行的活动体（第一次=着陆器，第二次=飞船），捕获转移起点
          detach('stage2');
          state.stage2Attached = false;
          var activeStack2 = seg2 ? stackS2Parts : stack2Parts;
          var d2 = seg2 ? (C2_S - C1_S) : (C2_L - C1_L), w2 = [0, 0, 0];
          bodyToWorld(0, d2, 0, w2);
          rezero(activeStack2, d2);
          state.x = w2[0]; state.y = w2[1];
          state.transitTheta0 = Math.atan2(state.x - EC[0], state.y - EC[1]);
          state.transitRho0 = Math.hypot(state.x - EC[0], state.y - EC[1]);
          state.phase = 'transit'; state.phaseT = 0; state.burning = false;
          firePhase('stage2Sep'); firePhase('transit');
        }
        return;
      }

      if (ph === 'transit') {
        u = Math.min(1, state.phaseT / DUR.transit);
        var e = smoothstep(u);
        var th = state.transitTheta0 + shortAngle(THETA_A - state.transitTheta0) * u;
        var rho = state.transitRho0 + (RHO_A - state.transitRho0) * e;
        var px = EC[0] + rho * Math.sin(th), py = EC[1] + rho * Math.cos(th);
        var u2 = Math.min(1, u + 0.004);
        var th2 = state.transitTheta0 + shortAngle(THETA_A - state.transitTheta0) * u2;
        var rho2 = state.transitRho0 + (RHO_A - state.transitRho0) * smoothstep(u2);
        var qx = EC[0] + rho2 * Math.sin(th2), qy = EC[1] + rho2 * Math.cos(th2);
        setPose(px, py, Math.atan2(qx - px, qy - py), dt * 2);
        state.scale += (28 - state.scale) * Math.min(1, dt * 0.6);
        state.distEarth = Math.hypot(px - EC[0], py - EC[1]) * KM_PER_UNIT;
        state.distMoon = Math.hypot(px - MC[0], py - MC[1]) * KM_PER_UNIT;
        state.speed = lerp(10200, 950, e);
        state.met = state.metBase + lerp(MET_TLI + 900, MET_LOI, u);
        state.engLocalY = seg2 ? engY('ship') : engY('lander'); state.engSize = 0.75; state.burning = false;
        state.moonBlend = Math.max(state.moonBlend, smoothstep((u - 0.02) / 0.4));
        state.progress = seg2 ? lerp(0.74, 0.80, u) : lerp(0.38, 0.46, u);
        if (u >= 1) { state.phase = 'loi'; state.phaseT = 0; state.rm = R_AP; state.psi = PSI_EARTH; state.burning = true; firePhase('loi'); }
        return;
      }

      if (ph === 'loi') {
        u = Math.min(1, state.phaseT / DUR.loi);
        var eL = smoothstep(u);
        rm = lerp(R_AP, MLORB, eL);
        psi = PSI_EARTH + LOI_SWEEP * u;
        state.rm = rm; state.psi = psi;
        pos = [MC[0] + rm * Math.sin(psi), MC[1] + rm * Math.cos(psi)];
        setPose(pos[0], pos[1], shortAngle(progradeTilt(psi) + Math.PI), dt * 2);
        state.scale += (11 - state.scale) * Math.min(1, dt * 0.7);
        state.engLocalY = seg2 ? engY('ship') : engY('lander'); state.engSize = 0.85; state.burning = true;
        state.moonAlt = (rm - MR) * KM_PER_UNIT;
        state.distMoon = rm * KM_PER_UNIT;
        state.distEarth = Math.hypot(pos[0] - EC[0], pos[1] - EC[1]) * KM_PER_UNIT;
        state.speed = lerp(950, 1630, eL);
        state.met = state.metBase + lerp(MET_LOI, MET_LORB, u);
        state.moonBlend = 1;
        state.progress = seg2 ? lerp(0.80, 0.83, u) : lerp(0.46, 0.49, u);
        if (u >= 1) { state.phase = 'lunarOrbit'; state.phaseT = 0; state.burning = false; firePhase('lunarOrbit'); }
        return;
      }

      if (ph === 'lunarOrbit') {
        u = Math.min(1, state.phaseT / DUR.lorb);
        psi = (PSI_EARTH + LOI_SWEEP) + LORB_RATE * state.phaseT;
        state.psi = psi; state.rm = MLORB;
        pos = [MC[0] + MLORB * Math.sin(psi), MC[1] + MLORB * Math.cos(psi)];
        setPose(pos[0], pos[1], progradeTilt(psi), dt * 2);
        state.scale += (10 - state.scale) * Math.min(1, dt * 0.7);
        state.engLocalY = seg2 ? engY('ship') : engY('lander'); state.engSize = 0.85; state.burning = false;
        state.moonAlt = (MLORB - MR) * KM_PER_UNIT;
        state.distMoon = MLORB * KM_PER_UNIT;
        state.distEarth = Math.hypot(pos[0] - EC[0], pos[1] - EC[1]) * KM_PER_UNIT;
        state.speed = 1630;
        state.moonBlend = 1;
        state.progress = seg2 ? lerp(0.83, 0.86, u) : lerp(0.49, 0.50, u);
        if (u >= 1) {
          if (seg2) {
            // 第二次发射：进入交会段，飞船向驻留着陆器靠拢
            state.rendezOffset = shortAngle(state.psi - state.parkPsi);
            state.phase = 'rendezvous'; state.phaseT = 0;
            state.met = state.metBase + MET2_RENDEZ;
            firePhase('rendezvous');
          } else {
            // 第一次发射：着陆器就位环月轨道，转入段间过渡
            state.met = SEG2_BASE;
            parkLander();
            state.phase = 'transition'; state.phaseT = 0; state.burning = false;
            firePhase('landerPark'); firePhase('transition');
          }
        }
        return;
      }

      if (ph === 'transition') {
        // 段间过渡：镜头停留在月球，展示驻留着陆器；画面渐隐至黑场，末段切到第二次发射
        u = Math.min(1, state.phaseT / DUR.transition);
        state.segFade = u < 0.4 ? smoothstep(u / 0.4) : 1;
        state.parkPsi += PARK_RATE * dt * state.warp * 0.4;
        psi = state.parkPsi;
        state.psi = psi; state.rm = MLORB;
        pos = [MC[0] + MLORB * Math.sin(psi), MC[1] + MLORB * Math.cos(psi)];
        setPose(pos[0], pos[1], progradeTilt(psi), dt * 2);
        state.moonAlt = (MLORB - MR) * KM_PER_UNIT;
        state.distMoon = MLORB * KM_PER_UNIT;
        state.distEarth = Math.hypot(pos[0] - EC[0], pos[1] - EC[1]) * KM_PER_UNIT;
        state.met = SEG2_BASE;
        state.moonBlend = 1; state.burning = false; state.speed = 1630;
        state.progress = 0.50;
        if (u >= 1) { resetForSegment2(); }
        return;
      }

      if (ph === 'rendezvous') {
        u = Math.min(1, state.phaseT / DUR.rendezvous);
        var eR = smoothstep(u);
        // 飞船环月角向驻留着陆器收敛：角差从 rendezOffset 平滑归零
        psi = state.parkPsi + state.rendezOffset * (1 - eR);
        state.psi = psi; state.rm = MLORB;
        pos = [MC[0] + MLORB * Math.sin(psi), MC[1] + MLORB * Math.cos(psi)];
        setPose(pos[0], pos[1], progradeTilt(psi), dt * 2);
        state.scale += (10 - state.scale) * Math.min(1, dt * 0.7);
        state.engLocalY = engY('ship'); state.engSize = 0.5; state.burning = u < 0.92;
        state.moonAlt = (MLORB - MR) * KM_PER_UNIT;
        state.distMoon = MLORB * KM_PER_UNIT;
        state.distEarth = Math.hypot(pos[0] - EC[0], pos[1] - EC[1]) * KM_PER_UNIT;
        state.speed = lerp(1630, 1580, eR);
        state.met = state.metBase + lerp(MET2_RENDEZ, MET2_DOCK, u);
        state.moonBlend = 1;
        state.progress = lerp(0.86, 0.89, u);
        if (u >= 1 || Math.abs(shortAngle(psi - state.parkPsi)) < DOCK_PSI_TOL) {
          dockLander();
          state.phase = 'docked'; state.phaseT = 0; state.burning = false;
          firePhase('docking');
        }
        return;
      }

      if (ph === 'docked') {
        // 对接后组合体短暂环月飞行，随后船器分离、动力下降
        u = Math.min(1, state.phaseT / DUR.dock);
        psi = state.psiSepDock + LORB_RATE * state.phaseT;
        state.psi = psi; state.rm = MLORB;
        pos = [MC[0] + MLORB * Math.sin(psi), MC[1] + MLORB * Math.cos(psi)];
        setPose(pos[0], pos[1], progradeTilt(psi), dt * 2);
        state.scale += (10 - state.scale) * Math.min(1, dt * 0.7);
        state.engLocalY = engY('lander'); state.engSize = 0.6; state.burning = false;
        state.moonAlt = (MLORB - MR) * KM_PER_UNIT;
        state.distMoon = MLORB * KM_PER_UNIT;
        state.distEarth = Math.hypot(pos[0] - EC[0], pos[1] - EC[1]) * KM_PER_UNIT;
        state.speed = 1630;
        state.met = lerp(SEG2_BASE + MET2_DOCK, MET_LSEP, u);
        state.moonBlend = 1;
        state.progress = lerp(0.89, 0.91, u);
        if (u >= 1) {
          separateLander();
          state.phase = 'descent'; state.phaseT = 0; state.burning = true;
          firePhase('landerSep'); firePhase('descent');
        }
        return;
      }

      if (ph === 'descent' || ph === 'approach' || ph === 'landing') {
        u = Math.min(1, state.phaseT / DUR.descent);
        var eD = smoothstep(u);
        rm = lerp(state.rm0, LAND_RM, eD);
        psi = state.psi0 + LAW_SWEEP * eD;
        state.rm = rm; state.psi = psi;
        pos = [MC[0] + rm * Math.sin(psi), MC[1] + rm * Math.cos(psi)];
        var proD = progradeTilt(psi), vert = psi;
        var kVert = smoothstep((u - 0.12) / 0.42);
        setPose(pos[0], pos[1], proD + shortAngle(vert - proD) * kVert, dt * 2.5);
        var scaleTarget = lerp(10, 1.4, smoothstep((u - 0.30) / 0.62));
        state.scale += (scaleTarget - state.scale) * Math.min(1, dt * 0.9);
        state.engLocalY = engY('lander'); state.engSize = 0.75;
        state.moonAlt = Math.max(0, lerp((state.rm0 - MR), 0, eD) * KM_PER_UNIT);
        state.distMoon = rm * KM_PER_UNIT;
        state.distEarth = Math.hypot(pos[0] - EC[0], pos[1] - EC[1]) * KM_PER_UNIT;
        state.speed = lerp(1630, 0, Math.pow(eD, 0.7));
        state.met = lerp(MET_LSEP, MET_LAND, u);
        state.surfBlend = smoothstep((u - 0.5) / 0.5);
        var deployTarget = smoothstep((u - 0.5) / 0.28);
        state.legsDeploy += (deployTarget - state.legsDeploy) * Math.min(1, dt * 2.5);
        for (var li = 0; li < legParts.length; li++) legParts[li].localRotX = lerp(2.9, 0.72, state.legsDeploy);
        if (!fired.approach && u > 0.6) firePhase('approach');
        state.burning = u < 0.995;
        state.progress = lerp(0.91, 0.995, u);
        if (u > 0.85) spawnLunarDust(dt, (u - 0.85) / 0.15);
        if (u >= 1) {
          state.phase = 'landed'; state.landed = true; state.burning = false; state.phaseT = 0;
          state.rm = LAND_RM; state.psi = state.psi0 + LAW_SWEEP;
          state.x = MC[0] + LAND_RM * Math.sin(state.psi);
          state.y = MC[1] + LAND_RM * Math.cos(state.psi);
          state.tilt = state.psi; state.tiltVis = state.psi;
          state.moonAlt = 0; state.speed = 0; state.surfBlend = 1; state.surfCamBlend = 1;
          state.progress = 1;
          firePhase('landing'); firePhase('landed');
          if (hooks.onTouchdown) hooks.onTouchdown();
        }
        return;
      }

      if (ph === 'landed') {
        state.burning = false;
        state.met = MET_LAND + state.phaseT * 6;
        state.speed = 0; state.moonAlt = 0; state.distMoon = MR * KM_PER_UNIT;
        state.surfCamBlend = 1;
        return;
      }
    }

    function update(dt, cam) {
      if (!state.ignited) { syncFlames(); return; }
      // 时间倍率：仅由「长按加速」驱动；脚本段 DUR 为墙钟场景秒，正常速下按真实节奏推进
      var warp = state.hold ? HOLD_WARP : 1;
      state.warp = warp;

      if (state.regime === 'ascent') {
        var remaining = dt * warp, hMax = 1 / 120, guard = 0;
        while (remaining > 1e-6 && guard++ < 400) { var hs = Math.min(hMax, remaining); stepAscent(hs); remaining -= hs; }
        syncWorldAscent();
        state.engLocalY = (state.phase === 'ignition' || state.phase === 'burn1') ? engY('s1') : engY('s2');
        state.engSize = (state.phase === 'ignition' || state.phase === 'burn1') ? 1.0 : 0.7;
        state.burning = isBurningPhys();
      } else {
        state.t += dt * warp;
        stepScripted(dt);
      }

      state.camDist = cam ? cam.distance : 20;
      // 段间黑场淡入（第二次发射）：按真实时间平滑揭开，避免受加速倍率影响观感
      if (state.segFadeT > 0) {
        state.segFadeT = Math.max(0, state.segFadeT - dt);
        state.segFade = state.segFadeT / 1.0;
      }
      spawnFlames(dt);
      if (state.regime === 'ascent' && (state.t < 7.5 || state.altVis < 6)) spawnPadSmoke(dt);
      if (state.phase === 'transit' || state.phase === 'lunarOrbit' || state.phase === 'rendezvous') spawnTrail(dt);

      // 驻留着陆器（第一次发射就位后）每帧独立定位，第二次发射全程可见其绕月等待
      if (state.landerParked) positionParkedLander();

      // 着陆腿可见性：未点火（展示/拆解）与下降段之后可见，上升段隐藏（收于整流罩内）
      var legsOn = !state.ignited || state.phase === 'descent' || state.phase === 'approach' || state.phase === 'landing' || state.phase === 'landed';
      for (var li = 0; li < legParts.length; li++) legParts[li].mesh.visible = legsOn;

      orbitRing.visible = (state.phase === 'parkOrbit' || state.phase === 'tli');
      orbitRing.alpha = orbitRing.visible ? 0.4 : 0;
      moonRing.visible = (state.phase === 'lunarOrbit' || state.phase === 'loi' || state.phase === 'rendezvous' || state.phase === 'docked');
      moonRing.alpha = moonRing.visible ? 0.5 : 0;

      if (pad.ember && state.regime === 'ascent') {
        var glow = state.t < IGN_RAMP ? state.t / IGN_RAMP : Math.max(0, 1 - (state.t - IGN_RAMP) / 2.5);
        pad.ember.glow = glow * 0.9;
      }
      syncFlames();
    }

    function directCamera(cam, dt) {
      if (!state.ignited) return;
      var nose = [Math.sin(state.tiltVis), Math.cos(state.tiltVis)];
      var craftX = state.x + nose[0] * state.focus * state.scale;
      var craftY = state.y + nose[1] * state.focus * state.scale;
      var gTX, gTY, gDist, gPitch, gYaw = cam.yaw;

      if (state.regime === 'ascent') {
        gTX = craftX; gTY = craftY;
        gDist = Math.max(22, Math.min(130, 22 + Math.max(state.alt, state.altVis) * 0.6));
        gYaw = cam.yaw + dt * 0.035; gPitch = 0.05;
        cam.shake = (state.t > IGN_RAMP && state.t < 12) ? 0.05 : (state.t < 20 ? 0.028 : 0);
        state.surfCamBlend = 0;
      } else if (state.phase === 'parkOrbit' || state.phase === 'tli') {
        gTX = craftX; gTY = craftY;
        gDist = cam.fitEarth || 5200; gYaw = cam.yaw + dt * 0.02; gPitch = 0.06;
        cam.shake = state.phase === 'tli' ? 0.012 : 0;
        state.surfCamBlend = 0;
      } else if (state.phase === 'transit') {
        gTX = (EC[0] + MC[0]) * 0.5; gTY = (EC[1] + MC[1]) * 0.5;
        gDist = cam.fitSystem || MO.dist * 0.82;
        gYaw = cam.yaw + (0 - cam.yaw) * Math.min(1, dt * 0.6);
        gPitch = cam.pitch + (0.02 - cam.pitch) * Math.min(1, dt * 0.6);
        cam.shake = 0; state.surfCamBlend = 0;
      } else if (state.phase === 'loi' || state.phase === 'lunarOrbit' ||
                 state.phase === 'transition' || state.phase === 'rendezvous' || state.phase === 'docked') {
        gTX = MC[0]; gTY = MC[1];
        gDist = (cam.fitMoon || MR * 2.9) * 1.15;
        gYaw = cam.yaw + (0.18 - cam.yaw) * Math.min(1, dt * 0.6);
        gPitch = cam.pitch + (0.10 - cam.pitch) * Math.min(1, dt * 0.6);
        cam.shake = 0; state.surfCamBlend = 0;
      } else {
        var u = Math.min(1, state.phaseT / DUR.descent);
        var close = state.phase === 'landed' ? 1 : smoothstep((u - 0.28) / 0.6);
        gTX = lerp(MC[0], state.x, close);
        gTY = lerp(MC[1], state.y, close);
        gDist = lerp((cam.fitMoon || MR * 2.6) * 2.0, 14, close);
        var surfYaw = state.psi + Math.PI * 0.30;
        gYaw = cam.yaw + ((1 - close) * 0.18 + close * surfYaw - cam.yaw) * Math.min(1, dt * (0.5 + close));
        gPitch = cam.pitch + ((1 - close) * 0.10 + close * 0.14 - cam.pitch) * Math.min(1, dt * 0.8);
        cam.shake = state.burning && close > 0.6 ? 0.02 * close : 0;
        state.surfCamBlend = close;
      }

      if (state.camSnap) {
        // 段间切换：直接把镜头瞬移到新箭体（配合 app 层黑场过渡，避免可见的横扫）
        cam.targetX = gTX; cam.targetY = gTY; cam.targetZ = 0;
        cam.distance = gDist; cam.yaw = gYaw; cam.pitch = gPitch;
        state.camSnap = false;
        return;
      }
      var lk = Math.min(1, dt * (state.regime === 'ascent' ? 5 : 1.7));
      cam.targetX += (gTX - cam.targetX) * lk;
      cam.targetY += (gTY - cam.targetY) * lk;
      cam.targetZ += (0 - cam.targetZ) * lk;
      cam.distance += (gDist - cam.distance) * Math.min(1, dt * 1.4);
      cam.yaw = gYaw;
      cam.pitch += (gPitch - cam.pitch) * Math.min(1, dt * 1.4);
    }

    function restoreAll() {
      for (var i = 0; i < parts.length; i++) { parts[i].baseY = baseY0[i]; parts[i].localRotX = legRot0[i]; }
    }

    // 第一次发射（着陆器）构型：隐藏飞船 / 逃逸塔 / 太阳翼，仅显示 助推 + 芯一级 + 二级 + 整流罩 + 着陆器
    function setupSegment1Launch() {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], g = p.detachGroup;
        p.mesh.visible = !(g === 'ship' || g === 'tower' || g === 'panel');
      }
      state.segment = 1; state.metBase = 0;
      state.towerAttached = false;      // 第一次发射无逃逸塔
      state.fairingAttached = true;     // 第一次发射有整流罩（护着陆器）
    }

    function reset() {
      state.regime = 'ascent'; state.phase = 'prelaunch'; state.t = 0; state.phaseT = 0;
      state.r = R_E; state.theta = 0; state.vr = 0; state.vt = 0;
      state.alpha = 0; state.gamma = Math.PI / 2; state.tilt = 0; state.tiltVis = 0;
      state.fuel1 = S1F0; state.fuel2 = S2F0; state.fuelBoost = BF0;
      state.boostersAttached = true; state.stage1Attached = true;
      state.towerAttached = true; state.fairingAttached = true; state.stage2Attached = true;
      state.ignited = false; state.inserted = false; state.landed = false;
      state.hold = false; state.warp = 1; state.scale = 1; state.progress = 0; state.sepT = 0;
      state.accel = 0; state.gForce = 1; state.met = 0; state._altMax = 0;
      state.shipAttached = true; state.focus = rocketModel.center;
      state.engLocalY = 0.18; state.engSize = 1; state.burning = false; state.legsDeploy = 0;
      state.parkAng = null; state.moonBlend = 0; state.surfBlend = 0; state.surfCamBlend = 0;
      state.rezero1 = false; state.rezero2 = false;
      state.rm = R_AP; state.psi = PSI_EARTH; state.rm0 = MLORB; state.psi0 = PSI_EARTH; state.psiSep = PSI_EARTH;
      state.distEarth = 0; state.distMoon = MO.dist * KM_PER_UNIT; state.moonAlt = 0;
      // 两段式状态复位
      state.segment = 1; state.metBase = 0; state.landerParked = false; state.parkPsi = PSI_EARTH;
      state.docked = false; state.rendezOffset = 0; state.psiSepDock = PSI_EARTH; state.camSnap = false;
      state.segFade = 0; state.segFadeT = 0;
      pad.armSwing = 0; M3D.setArmSwing(pad, 0);
      pad.earthSpin = 0; M3D.spinEarth(pad, 0, 0);
      fired = {}; acc = {};
      if (pad.ember) pad.ember.glow = 0;
      restoreAll();
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.detached = false; p.parked = false; p.detachOff = [0, 0, 0]; p.detachV = [0, 0, 0];
        p.detachRot = [0, 0, 0]; p.detachSpin = [0, 0, 0]; p.detachScale = 1;
        p.mesh.alpha = 1;
        p.mesh.visible = p.detachGroup !== 'panel';
      }
      orbitRing.visible = false; orbitRing.alpha = 0;
      moonRing.visible = false; moonRing.alpha = 0;
      renderer.particles.reset();
      syncFlames();
    }

    reset();

    return {
      state: state, V_ORB: V_ORB, KM_PER_UNIT: KM_PER_UNIT, MS_PER_UNIT: MS_PER_UNIT, TIME_SCALE: TIME_SCALE,
      ignite: function () {
        setupSegment1Launch();
        state.ignited = true; state.phase = 'ignition'; state.regime = 'ascent'; firePhase('ignition');
      },
      prepareLaunch: setupSegment1Launch,
      setHoldWarp: function (on) { state.hold = !!on; },
      update: update, directCamera: directCamera, syncFlames: syncFlames, reset: reset,
      updateDetachedParts: function (dt) {
        var earthPhase = state.regime === 'ascent' || state.phase === 'parkOrbit' || state.phase === 'tli' || state.phase === 'transit';
        if (earthPhase) {
          var A = (isBurningPhys() || state.phase === 'tli') ? currentThrust() / state.mass : 0;
          var c = Math.cos(state.tiltVis), s = Math.sin(state.tiltVis);
          var ax = s * A, ay = c * A, az = 0;
          if (state.inserted) { var gMag = MU / (state.r * state.r); ax -= Math.sin(state.theta) * gMag; ay -= Math.cos(state.theta) * gMag; }
          M3D.updateDetached(parts, dt, MU, EC[0], EC[1], EC[2], ax, ay, az);
        } else {
          M3D.updateDetached(parts, dt, 0, MC[0], MC[1], MC[2], 0, 0, 0);
        }
      }
    };
  }

  M3D.createMissionSystem = createMissionSystem;
})(typeof window !== 'undefined' ? window : this);
