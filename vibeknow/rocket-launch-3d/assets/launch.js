(function (global) {
  'use strict';
  var M3D = global.M3D, mat4 = M3D.mat4;
  var E = M3D.EARTH;
  var R_E = E.R, MU = E.mu, G0 = E.g0, H_ORB = E.alt, R_ORB = E.r;
  var V_ORB = Math.sqrt(MU / R_ORB);
  var DEG = Math.PI / 180;

  // ---- 显示换算（地球半径按真实 6371 km）----
  var KM_PER_UNIT = E.kmPerUnit;
  var TIME_SCALE = E.timeScale;                 // 1 场景秒 ≈ 6 任务秒（rocket.js）
  var MS_PER_UNIT = KM_PER_UNIT * 1000 / TIME_SCALE;
  // 进度条满程按 MET 585 s（神舟任务船箭分离节点）；实际入轨约 MET 562 s
  var T_TOTAL = 97.5;
  // 船箭分离后镜头/尾迹的跟随中心：飞船组合体（服务舱+返回舱+轨道舱）
  // 在箭体坐标系中的高度（服务舱底 ~6.9 → 轨道舱顶 ~8.6 的中点）
  var SHIP_CENTER = 7.72;

  // ---- 质量模型（归一化；总质量 1.02，载荷比 ~1.7%）----
  var PAY = 0.017, FAIR = 0.004, TOW = 0.007;
  var S2D = 0.013;
  var S1D = 0.026;
  var BD = 0.006;
  // 单枚助推器：MET ≈ 131 s 抛（较真实 MET 152 提前：视觉上与 MET 156 的
  //   一二级分离拉开 ~25 s，避免两组分离事件挤在一起看不出先后）
  var BF0 = 0.075;
  // 芯一级：MET ≈ 156 s 一二级分离
  var S1F0 = 0.3584;
  // 二级主推力：全程连续燃烧（配合末段 ~2% 推进剂余度补燃）完成入轨
  var F2 = 0.01672;
  // ---- 推力与排气速度（比冲 ≈ 270 s / 336 s）----
  // 场景值按 TIME_SCALE=10 标定，随时间倍率整体缩放：F ∝ TS²、VE ∝ TS
  // （与 rocket.js 的 G0 ∝ TS² 同步），保证任意 TIME_SCALE 下 MET 弹道一致。
  // 当前 TS=6 → F×0.36、VE×0.6。
  var F1 = 0.06412, FB = 0.01603;
  var VE1 = 4.4922, VE2 = 5.5938;
  // 二级燃料量：主机推进剂。关机后允许按推进剂"余度"再补燃少许
  // （见 GHOST_LIMIT，等效真实火箭的推进剂误差余量），保证在燃料数值
  // 误差范围内仍能完成入轨判据；超过余度即彻底关机。
  var S2F0 = 0.200;
  var GHOST_LIMIT = -0.015;   // 燃料可透支上限（场景质量单位）

  // ---- 俯仰程序（分段插值，基于 MET 秒）----
  // α = 推力方向与当地铅垂线的夹角。MET 12 s 程序转弯（与真实一致），
  // 前段转平偏快会停在 ~330 km，偏慢则冲过头——该曲线经仿真标定可
  // 在远地点附近满足入轨判据。
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

  // ---- 末段高度闭环（沿用原 KG/KH 思路，参数微调使插入高度贴近 R_ORB）----
  // KH/VR_CAP 是速度量纲、A_RATE 是姿态角速度：均随 TIME_SCALE 等比缩放
  //（TS=10 标定值 0.10/2.4/5.83°，当前 TS=6 → ×0.6）；KG/W_TERM 为无量纲比值
  var KG = 0.85, KH = 0.06, VR_CAP = 1.44, W_TERM = 0.62;
  var A_RATE = 3.5 * DEG, AOA_MAX = 10 * DEG;

  // ---- 时序（场景秒）----
  var IGN_RAMP = 0.54, SEP_DELAY = 0.3;          // 一二级分离到二级点火的间隔
  // 真实锚点的 MET 时刻（直接转场景秒）
  var MET_PITCH = 12, MET_MAXQ = 75, MET_TOWER = 120, MET_FAIRING = 210;
  // 助推/一二级燃尽由燃料量自动落到 MET 152/156（见 BF0/S1F0）
  var WARP = 20;
  var HOLD_WARP = 3;   // 长按加速倍率：与当前基础倍率相乘（上升段 1→3，在轨 20→60）
  var NOZZLE_S1_Y = 0.12, NOZZLE_S2_Y = 5.26;

  // ---- 高度阈值（按真实 km 转场景单位）----
  // 整流罩内真空羽流膨胀：> 80 km；稠密烟雾区：< 8 km；过渡段：8~22 km
  var ALT_DENSE_KM = 8, ALT_MID_KM = 22, ALT_THIN_KM = 80;
  var ALT_DENSE = ALT_DENSE_KM / KM_PER_UNIT;     // ~2.26 单位
  var ALT_MID = ALT_MID_KM / KM_PER_UNIT;          // ~6.22 单位
  var ALT_THIN = ALT_THIN_KM / KM_PER_UNIT;        // ~22.6 单位

  // ---- 显示高度映射：解决"火箭被画 600×" 与"真实位移按 km 计" 的比例失真 ----
  // 真实爬升在前 ~ 20 单位（约 70 km）内远小于一个箭身长度（约 10 单位），
  // 不放大就会"钉在发射台上"。这里用径向映射：真实地心距 r → 显示地心距
  // ρ = R_E + h·(1 + A/(C+h))，方位角 θ 保持真实不变。
  //   · h 单调递增 ⇒ 增益单调衰减、显示高度永不倒退（旧方案按到发射点
  //     距离驱动增益，越过天顶后 dy 回落会让显示高度倒退）；
  //   · f'(h) = 1 + A·C/(C+h)² > 1 恒成立：显示爬速永不低于真实爬速；
  //   · 低空增益 ≈ 1+A/C，起飞后 ~1 场景秒（MET ≈ 16 s）显示脱塔，与真实
  //     离塔节拍一致；高空偏移收敛为常数 ≈ A（入轨点偏差 ~2% 轨道半径）。
  // 遥测显示的是真实高度。
  var GAIN_A = 40, GAIN_TAU = 0.5;
  // 脱塔门控：显示高度未超过 TOWER_CLEAR 前箭体保持垂直（物理俯仰程序
  // 仍按真实 MET 12 s 开始，只是显示层延迟混入）；GATE_SPAN 内平滑过渡。
  // 阈值与 app.js 的发射台淡出区间（altVis 12~30）联动：
  // 台架在 altVis≈30 完全消失，altVis=28 才开始可见倾斜、46 全部转出。
  var TOWER_CLEAR = 28, GATE_SPAN = 18;

  var PHASES = {
    ignition: '点火 · 发动机启动，尾焰喷涌',
    liftoff: '起飞 · 垂直上升，离开塔架',
    pitch: '程序转弯 · 按俯仰程序缓缓侧转',
    maxQ: '最大动压 · 穿越气动载荷最强区',
    towerSep: '逃逸塔分离 · 抛离逃逸塔',
    boosterSep: '助推器分离 · 四枚助推器脱落',
    stage1Sep: '一二级分离 · 一级箭体脱落',
    stage2Ignition: '二级点火 · 继续加速爬升',
    fairingSep: '整流罩分离 · 飞船露出太空',
    cruise: '二级巡航 · 持续加速接近环绕速度',
    seco: '二级关机 · 飞船精确入轨',
    shipSep: '船箭分离 · 飞船与二级火箭分离',
    orbit: '在轨运行 · 环绕地球飞行'
  };

  function createLaunchSystem(renderer, rocketModel, pad, hooks) {
    hooks = hooks || {};
    var parts = rocketModel.parts;
    var state = {
      phase: 'prelaunch', t: 0,
      r: R_E, theta: 0, vr: 0, vt: 0,
      alpha: 0, gamma: Math.PI / 2, tilt: Math.PI / 2,
      x: 0, y: 0, alt: 0, altVis: 0, speed: 0, vCirc: V_ORB,
      mass: 1.02, accel: 0, gForce: 1, met: 0,
      fuel1: S1F0, fuel2: S2F0, fuelBoost: BF0,
      boostersAttached: true, stage1Attached: true, towerAttached: true, fairingAttached: true,
      ignited: false, inserted: false, orbitBlend: 0, warp: 1, scale: 1,
      hold: false,
      shipAttached: true, focus: rocketModel.center,
      progress: 0, sepT: 0, _altMax: 0,
      camDist: 20
    };
    var fired = {}, acc = {};
    var panels = [];
    for (var pi = 0; pi < parts.length; pi++) if (parts[pi].detachGroup === 'panel') panels.push(parts[pi]);

    function firePhase(key) {
      if (fired[key]) return;
      fired[key] = true;
      if (PHASES[key] && hooks.onPhase) hooks.onPhase(key, PHASES[key]);
    }

    // ---- 常驻尾焰：亮核心 + 半透外焰 + 喷口白热盘 ----
    var flameCoreG = M3D.geom.cylinder(0.30, 0.0001, 2.0, 16);
    var flameOuterG = M3D.geom.cylinder(0.46, 0.0001, 1.45, 16);
    var flameBoostG = M3D.geom.cylinder(0.19, 0.0001, 1.3, 12);
    var flameCore = renderer.createMesh(flameCoreG, [1.0, 0.55, 0.15], { group: 'fx' });
    flameCore.alpha = 0; flameCore.glow = 1; flameCore.visible = false;
    var flameOuter = renderer.createMesh(flameOuterG, [1.0, 0.40, 0.06], { group: 'fx', blend: 'add', depthWrite: false });
    flameOuter.alpha = 0; flameOuter.glow = 1; flameOuter.visible = false;
    var glowDisc = renderer.createMesh(M3D.geom.disk(0.30, 16), [1.0, 0.88, 0.60], { group: 'fx', blend: 'add', depthWrite: false });
    glowDisc.alpha = 0; glowDisc.glow = 1; glowDisc.visible = false;
    var flameBoost = [];
    for (var fb = 0; fb < 4; fb++) {
      var fm = renderer.createMesh(flameBoostG, [1.0, 0.5, 0.12], { group: 'fx' });
      fm.alpha = 0; fm.glow = 1; fm.visible = false;
      flameBoost.push(fm);
    }
    // ---- 马赫环：高空过膨胀羽流中的等距激波亮环（青白色，附加混合）----
    // 共享同一几何，沿核心焰轴等距排布、随核心焰锥收缩；仅稠密大气外可见
    var machRingG = M3D.geom.torus(0.30, 0.045, 20, 7);
    var machRings = [];
    for (var mr = 0; mr < 4; mr++) {
      var mm = renderer.createMesh(machRingG, [0.72, 0.84, 1.0],
        { group: 'fx', blend: 'add', depthWrite: false });
      mm.glow = 1; mm.visible = false; mm.alpha = 0;
      machRings.push(mm);
    }
    // 喷管部件引用：燃烧时做余辉发热
    var nozParts = { s1: [], boost: [], s2: [] };
    for (var np = 0; np < parts.length; np++) {
      var pn = parts[np].name;
      if (pn === 'nozMain' || pn.indexOf('vernier') === 0) nozParts.s1.push(parts[np]);
      else if (pn.indexOf('boostNoz') === 0) nozParts.boost.push(parts[np]);
      else if (pn === 'nozS2' || pn.indexOf('nozS2V') === 0) nozParts.s2.push(parts[np]);
    }

    // ---- 轨道参考圈 ----
    var orbitRing = renderer.createMesh(M3D.geom.torus(R_ORB, 12, 220, 6), [0.25, 0.42, 1.0],
      { group: 'fx', blend: 'add', depthWrite: false });
    orbitRing.glow = 1;
    mat4.identity(orbitRing.modelMatrix);
    mat4.translate(orbitRing.modelMatrix, orbitRing.modelMatrix, E.center);
    mat4.rotateX(orbitRing.modelMatrix, orbitRing.modelMatrix, Math.PI / 2);
    orbitRing.alpha = 0; orbitRing.visible = false;

    // ---- 局部坐标 → 世界坐标（Rz(-tilt)）----
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
      out[0] = dx * c + dy * s;
      out[1] = -dx * s + dy * c;
      out[2] = dz;
      return out;
    }

    function syncWorld() {
      // 物理位置 → 显示位置：径向映射（方位角真实、地心距按高度增益放大）。
      // 起飞初期真实位移远小于一个箭身长度（模型放大约 600 倍所致），
      // 不放大就会"钉在发射台上"；增益随高度单调衰减，高空收敛为常数偏移。
      var h = Math.max(0, state.r - R_E);
      var gain = 1 + GAIN_A / (GAIN_TAU + h);
      var hv = h * gain;
      // 显示高度单调钳制：入轨末段物理高度会有 ~0.005 单位/任务秒的微小回落
      // （重力转弯压平轨迹所致），显示层不允许火箭视觉下坠；切向运动不受影响。
      if (hv < state._altMax) hv = state._altMax; else state._altMax = hv;
      var rho = R_E + hv;                                // 显示地心距
      state.x = rho * Math.sin(state.theta);
      state.y = E.center[1] + rho * Math.cos(state.theta);
      state.altVis = hv;                                 // 显示高度（含增益），仅用于镜头与门控
      state.tilt = state.theta + state.alpha;
      // 显示倾角：脱塔前保持垂直（tilt=0），过塔后平滑混入物理倾角
      var g8 = (state.altVis - TOWER_CLEAR) / GATE_SPAN;
      g8 = g8 < 0 ? 0 : (g8 > 1 ? 1 : g8 * g8 * (3 - 2 * g8));
      state.tiltVis = state.tilt * g8;
      state.alt = state.r - R_E;
      state.speed = Math.sqrt(state.vr * state.vr + state.vt * state.vt);
      state.vCirc = Math.sqrt(MU / state.r);
      state.gForce = state.accel / G0;
      state.met = state.t * TIME_SCALE;
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
    function currentMdot() {
      if (state.phase === 'ignition') return currentThrust() / VE1;
      if (state.phase === 'burn1') return (F1 + (state.boostersAttached ? 4 * FB : 0)) / VE1;
      if (state.phase === 'burn2') return state.fuel2 > GHOST_LIMIT ? F2 / VE2 : 0;
      return 0;
    }
    function isBurning() {
      if (state.phase === 'ignition') return true;
      if (state.phase === 'burn1') return true;
      if (state.phase === 'burn2') return state.fuel2 > GHOST_LIMIT;
      return false;
    }

    // ---- 分离 ----
    function detach(group) {
      var w = [0, 0, 0];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.detachGroup !== group || p.detached) continue;
        p.detached = true; p.detachT = state.t;
        p.detachBaseY = state.y; p.detachX = state.x; p.detachPitch = state.tilt;
        p.detachOff = [0, 0, 0]; p.detachRot = [0, 0, 0];
        // 分离相对速度（本箭体视觉尺度下的观感值，非真实 m/s）
        if (group === 'booster') {
          var len = Math.sqrt(p.ox * p.ox + p.oz * p.oz) || 1;
          p.detachV = localDirToWorld((p.ox / len) * 1.45, -0.9, (p.oz / len) * 1.45, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 1.5];
        } else if (group === 'tower') {
          p.detachV = localDirToWorld(0.5, 3.4, 0.2, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2];
        } else if (group === 'fairing') {
          var fsd = p.side || 1;   // 左右半壳按 side 镜像，向两侧翻开
          p.detachV = localDirToWorld(fsd * 1.35, 1.7, 0.4, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 0.9, fsd * (1.1 + Math.random() * 0.5)];
        } else if (group === 'stage1') {
          p.detachV = localDirToWorld((Math.random() - 0.5) * 0.32, -2.2, (Math.random() - 0.5) * 0.32, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7];
        } else if (group === 'stage2') {
          // 船箭分离：期望的世界分离方向 = 沿轨道切向向后 + 少量径向内。
          // 分离体的 detachOff 是在“冻结的分离姿态系”里积分的
          // （updatePartTransforms 会再乘 Rz(-detachPitch)），直接存世界向量
          // 会被再转一次，所以这里按该系做一次逆旋转预补偿，保证世界方向正确
          var cT = Math.cos(state.tiltVis), sT = Math.sin(state.tiltVis);
          var dxb = -Math.cos(state.theta) * 0.38 - Math.sin(state.theta) * 0.14;
          var dyb = Math.sin(state.theta) * 0.38 - Math.cos(state.theta) * 0.14;
          p.detachV = [dxb * cT - dyb * sT, dxb * sT + dyb * cT, (Math.random() - 0.5) * 0.05];
          p.detachSpin = [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4];
        }
      }
      // 分离火光
      var n = group === 'tower' ? 22 : (group === 'stage1' ? 26 : 20);
      var ly = group === 'tower' ? 9.4 : (group === 'stage1' ? 5.0 : (group === 'fairing' ? 8.1 : (group === 'stage2' ? 7.5 : 1.6)));
      if (group === 'booster') {
        for (var b = 0; b < 4; b++) {
          var ba = b * Math.PI / 2;
          localToWorld(Math.cos(ba) * rocketModel.boosterDist, 1.75, Math.sin(ba) * rocketModel.boosterDist, w);
          flashAt(w[0], w[1], w[2], 16);
        }
      } else {
        if (group === 'stage2') ly *= state.scale;   // 在轨段箭体已放大，闪点位置与火花尺寸同步放大
        localToWorld(0, ly, 0, w);
        flashAt(w[0], w[1], w[2], n, group === 'stage2' ? state.scale * 0.5 : 1);
      }
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

    // ---- 尾焰 / 烟 / 尾迹粒子 ----
    function spawnFlames(dt, camDist) {
      var burning = isBurning() && !state.inserted;
      if (!burning) return;
      var ramp = Math.min(state.t / IGN_RAMP, 1);
      var stage2 = !state.stage1Attached;
      var nozzleY = stage2 ? NOZZLE_S2_Y : NOZZLE_S1_Y;
      var noz = localToWorld(0, nozzleY, 0, [0, 0, 0]);
      var down = localDirToWorld(0, -1, 0, [0, 0, 0]);
      var thin = state.alt > ALT_THIN;             // > 80 km：真空羽流膨胀
      var coreRate = (stage2 ? 34 : 58) * (thin ? 0.55 : 1);
      acc.core = (acc.core || 0) + coreRate * dt * ramp;
      while (acc.core >= 1) {
        acc.core -= 1;
        var a = Math.random() * Math.PI * 2, rr = Math.random() * 0.16 * (thin ? 2.2 : 1);
        var lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
        var off = localDirToWorld(lx, 0, lz, [0, 0, 0]);
        var sp = (6 + Math.random() * 5) * ramp;
        renderer.particles.spawn(
          noz[0] + off[0], noz[1] + off[1], noz[2] + off[2],
          off[0] * 4 + down[0] * sp + (Math.random() - 0.5) * 1.4,
          down[1] * sp + (Math.random() - 0.5) * 0.5,
          off[2] * 4 + down[2] * sp + (Math.random() - 0.5) * 1.4,
          1.0, 0.36 + Math.random() * 0.35, 0.05 + Math.random() * 0.12, 0.4 + Math.random() * 0.35, thin ? 1.6 : 1.0);
      }
      acc.hot = (acc.hot || 0) + (stage2 ? 14 : 24) * dt * ramp;
      while (acc.hot >= 1) {
        acc.hot -= 1;
        var ha = Math.random() * Math.PI * 2, hr = Math.random() * 0.07;
        var off2 = localDirToWorld(Math.cos(ha) * hr, 0, Math.sin(ha) * hr, [0, 0, 0]);
        var hs = (3.5 + Math.random() * 2.5) * ramp;
        renderer.particles.spawn(
          noz[0] + off2[0], noz[1] + off2[1], noz[2] + off2[2],
          down[0] * hs + (Math.random() - 0.5) * 0.8,
          down[1] * hs + (Math.random() - 0.5) * 0.3,
          down[2] * hs + (Math.random() - 0.5) * 0.8,
          1.0, 0.9, 0.72, 0.15 + Math.random() * 0.1, 0.8);
      }
      if (state.boostersAttached) {
        acc.boost = (acc.boost || 0) + 44 * dt * ramp;
        while (acc.boost >= 1) {
          acc.boost -= 1;
          var bi = (Math.random() * 4) | 0, ba2 = bi * Math.PI / 2;
          var bw = localToWorld(Math.cos(ba2) * rocketModel.boosterDist, 0.12, Math.sin(ba2) * rocketModel.boosterDist, [0, 0, 0]);
          var a3 = Math.random() * Math.PI * 2, r3 = Math.random() * 0.11;
          var off3 = localDirToWorld(Math.cos(a3) * r3, 0, Math.sin(a3) * r3, [0, 0, 0]);
          var bs = (5 + Math.random() * 4) * ramp;
          renderer.particles.spawn(
            bw[0] + off3[0], bw[1] + off3[1], bw[2] + off3[2],
            off3[0] * 3 + down[0] * bs + (Math.random() - 0.5) * 0.9,
            down[1] * bs + (Math.random() - 0.5) * 0.4,
            off3[2] * 3 + down[2] * bs + (Math.random() - 0.5) * 0.9,
            1.0, 0.32 + Math.random() * 0.3, 0.04 + Math.random() * 0.1, 0.4 + Math.random() * 0.3, 0.95);
        }
      }
      // 稠密大气内的烟气拖尾：随高度升高变淡，进入稀薄大气后停止
      if (state.alt < ALT_THIN) {
        var dense = state.alt < ALT_DENSE;            // < 8 km：低空段烟最浓、团絮最大
        var thinAir = state.alt > ALT_MID;            // > 22 km：稀薄大气
        acc.smoke = (acc.smoke || 0) + (dense ? 60 : (thinAir ? 24 : 42)) * dt;
        while (acc.smoke >= 1) {
          acc.smoke -= 1;
          var sa = Math.random() * Math.PI * 2, sr = 0.15 + Math.random() * 0.55;
          var sw = localToWorld(Math.cos(sa) * sr, nozzleY - 0.6, Math.sin(sa) * sr, [0, 0, 0]);
          var sv = (dense ? 1.1 : 0.7) + Math.random() * (dense ? 1.9 : 1.3);
          var st = 0.55 + Math.random() * 0.22;
          renderer.particles.spawnSmoke(sw[0], sw[1], sw[2],
            down[0] * sv + (Math.random() - 0.5) * 2.2,
            down[1] * sv + (Math.random() - 0.5) * 0.7,
            down[2] * sv + (Math.random() - 0.5) * 2.2,
            st, st, st * 1.03,
            (dense ? 3.0 : 2.2) + Math.random() * (dense ? 2.8 : 2.4),
            (dense ? 1.1 : 0.8) + Math.random() * (dense ? 1.1 : 0.9),
            (dense ? 1.4 : 1.1) + Math.random() * 1.1,
            thinAir ? 0.7 : 1.3);
        }
      }
    }

    // 发射台烟云：导流槽把火焰推向四周，烟团一边翻滚外扩一边上升、逐渐稀薄。
    // 按真实任务看，前 ~6 s 烟最浓；之后只要火箭还在近场（< 30 单位显示）就持续。
    function spawnPadSmoke(dt) {
      var k = state.t < IGN_RAMP ? 0.6 : Math.max(0, 1 - (state.t - IGN_RAMP) / 5.0);
      if (k <= 0.02 && state.altVis >= 6) return;
      var rate = 95 * Math.max(k, 0.18) + (state.altVis < 6 ? 26 : 0);
      acc.pad = (acc.pad || 0) + rate * dt;
      while (acc.pad >= 1) {
        acc.pad -= 1;
        var a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 3.8;
        var ca = Math.cos(a), sa2 = Math.sin(a);
        var outV = 1.2 + Math.random() * 3.2;
        var swirl = (Math.random() - 0.5) * 3.2;
        var upV = 1.2 + Math.random() * 3.4;
        var tint = 0.46 + Math.random() * 0.22;
        var warm = Math.random() < 0.22;
        renderer.particles.spawnSmoke(
          ca * r, 0.15 + Math.random() * 0.7, sa2 * r,
          ca * outV - sa2 * swirl, upV, sa2 * outV + ca * swirl,
          warm ? 0.82 : tint, warm ? 0.55 : tint, warm ? 0.36 : tint * 1.05,
          3.2 + Math.random() * 3.2,
          1.6 + Math.random() * 2.0,
          1.2 + Math.random() * 1.2,
          1.5, 0.06);
      }
    }

    function spawnTrail(dt, camDist) {
      // 入轨尾迹：细颗粒青蓝光点沿航迹排成一条纤细光弧，随年龄收缩消隐。
      // 关机后发动机早已停止工作，这条线只是“轨道殷迹”提示，绝不能做成
      // 大团白色烟雾（会被误读成尾烟/漏气），因此颗粒小、亮度低、拖尾短。
      acc.trail = (acc.trail || 0) + 34 * dt;
      var sz = Math.max(1.5, Math.min(12, camDist * 0.0022));
      var hw = localToWorld(0, state.focus * state.scale, 0, [0, 0, 0]);
      // 信标光晕：尺寸跟随在轨放大倍数（≈ 船体长度的 1/3）、淡蓝低亮度，
      // 只起“飞船在这里”的提示作用，不再用纯白大光球盖住飞船本体
      var beacon = state.scale * 2.4;
      renderer.particles.spawn(hw[0], hw[1], hw[2], 0, 0, 0,
        0.45, 0.75, 1.0, Math.max(dt * 2.4, 0.05), beacon, 0);
      while (acc.trail >= 1) {
        acc.trail -= 1;
        var w = localToWorld((Math.random() - 0.5) * 0.12 * state.scale, state.focus * state.scale, (Math.random() - 0.5) * 0.12 * state.scale, [0, 0, 0]);
        renderer.particles.spawn(w[0], w[1], w[2], 0, 0, 0,
          0.30, 0.72, 1.0, 3.5, sz * (0.8 + Math.random() * 0.4), 0, -0.45);
      }
    }

    function syncFlames() {
      var thrust = isBurning() && !state.inserted;
      var flick = 1 + Math.sin(state.t * 42) * 0.16 + Math.sin(state.t * 23 + 1.7) * 0.1;
      var stage2 = !state.stage1Attached;
      var localY = stage2 ? NOZZLE_S2_Y : NOZZLE_S1_Y;
      var fs = stage2 ? 0.62 : 1.0;
      var widen = 1 + Math.min(state.alt / ALT_THIN, 1) * 1.4;
      var nozW = localToWorld(0, localY, 0, [0, 0, 0]);
      var m = flameCore.modelMatrix;
      mat4.identity(m);
      mat4.translate(m, m, [nozW[0], nozW[1], nozW[2]]);
      mat4.scale(m, m, [state.scale, state.scale, state.scale]);
      mat4.rotateZ(m, m, -state.tiltVis);
      mat4.scale(m, m, [fs * widen, flick * fs, fs * widen]);
      mat4.translate(m, m, [0, -2.0, 0]);
      flameCore.visible = thrust; flameCore.alpha = thrust ? 0.8 : 0;

      // 外焰：更宽更短、附加混合的半透明橙壳，随高度膨胀
      var mo = flameOuter.modelMatrix;
      mat4.identity(mo);
      mat4.translate(mo, mo, [nozW[0], nozW[1], nozW[2]]);
      mat4.scale(mo, mo, [state.scale, state.scale, state.scale]);
      mat4.rotateZ(mo, mo, -state.tiltVis);
      mat4.scale(mo, mo, [fs * widen * 1.35, flick * fs * 0.78, fs * widen * 1.35]);
      mat4.translate(mo, mo, [0, -1.45, 0]);
      flameOuter.visible = thrust; flameOuter.alpha = thrust ? 0.30 : 0;

      // 马赫环：> 4 km 起羽流过膨胀使激波串可见，14 km 全亮；
      // 环间距随核心焰同步缩放，沿焰轴收缩，亮度受闪烁与相机距离调制
      var altKm = state.alt * KM_PER_UNIT;
      var machK = Math.max(0, Math.min(1, (altKm - 4) / 10));
      var mRamp = Math.min(state.t / IGN_RAMP, 1);
      var dFade = Math.max(0.3, Math.min(1, 1.35 - state.camDist / 90));
      var machOn = thrust && machK > 0.01;
      for (var mi = 0; mi < machRings.length; mi++) {
        var hM = 0.45 + mi * 0.38;                    // 等距分布（核心焰内段）
        var rFac = 0.75 - mi * 0.13;                  // 沿焰轴收缩的激波节点
        var mmr = machRings[mi].modelMatrix;
        mat4.identity(mmr);
        mat4.translate(mmr, mmr, [nozW[0], nozW[1], nozW[2]]);
        mat4.scale(mmr, mmr, [state.scale, state.scale, state.scale]);
        mat4.rotateZ(mmr, mmr, -state.tiltVis);
        mat4.scale(mmr, mmr, [fs * widen * rFac, flick * fs, fs * widen * rFac]);
        mat4.translate(mmr, mmr, [0, -hM, 0]);
        machRings[mi].visible = machOn;
        machRings[mi].alpha = machOn ? 0.55 * machK * mRamp * dFade * (1 - mi * 0.14) * (0.7 + 0.3 * flick) : 0;
      }

      // 喷口白热盘：贴喷口的炽热发光面
      var md = glowDisc.modelMatrix;
      mat4.identity(md);
      mat4.translate(md, md, [nozW[0], nozW[1], nozW[2]]);
      mat4.scale(md, md, [state.scale * fs, state.scale * fs, state.scale * fs]);
      mat4.rotateZ(md, md, -state.tiltVis);
      mat4.rotateX(md, md, Math.PI);
      glowDisc.visible = thrust; glowDisc.alpha = thrust ? 0.85 : 0;

      // 喷管余辉：燃烧段喷管发红发热
      var ramp = Math.min(state.t / IGN_RAMP, 1);
      var heat = thrust ? (0.30 + 0.08 * Math.sin(state.t * 36)) * ramp : 0;
      var s1Heat = (state.stage1Attached && state.phase !== 'burn2') ? heat : 0;
      var bHeat = (state.boostersAttached && s1Heat) || 0;
      for (var hi = 0; hi < nozParts.s1.length; hi++) nozParts.s1[hi].mesh.glow = s1Heat;
      for (hi = 0; hi < nozParts.boost.length; hi++) nozParts.boost[hi].mesh.glow = bHeat;
      var s2Glow = (state.phase === 'burn2' && thrust) ? heat * 1.2 : 0;
      for (hi = 0; hi < nozParts.s2.length; hi++) nozParts.s2[hi].mesh.glow = s2Glow;

      var boostOn = thrust && state.boostersAttached;
      for (var i = 0; i < 4; i++) {
        var ba = i * Math.PI / 2;
        var w = localToWorld(Math.cos(ba) * rocketModel.boosterDist, 0.1, Math.sin(ba) * rocketModel.boosterDist, [0, 0, 0]);
        var bm = flameBoost[i].modelMatrix;
        mat4.identity(bm);
        mat4.translate(bm, bm, [w[0], w[1], w[2]]);
        mat4.scale(bm, bm, [state.scale, state.scale, state.scale]);
        mat4.rotateZ(bm, bm, -state.tiltVis);
        mat4.scale(bm, bm, [widen, flick, widen]);
        mat4.translate(bm, bm, [0, -1.3, 0]);
        flameBoost[i].visible = boostOn; flameBoost[i].alpha = boostOn ? 0.8 : 0;
      }
    }

    // ---- 物理步进（极坐标中心引力场）----
    function step(dt) {
      state.t += dt;
      var m = state.mass = currentMass();
      var F = currentThrust();
      var A = F / m;
      var g = MU / (state.r * state.r);
      var h = state.r - R_E;
      var v = Math.sqrt(state.vr * state.vr + state.vt * state.vt) || 1e-6;
      var gamma = Math.atan2(state.vr, state.vt);

      // ---- 姿态指令 α：开环 MET 插值 + 末段高度闭环 ----
      var aCmd = 0;
      if (state.phase === 'orbit') {
        aCmd = Math.PI / 2;                        // 入轨后保持水平（顺行）姿态
      } else if (state.phase !== 'ignition' && state.met >= MET_PITCH) {
        aCmd = openLoopAlpha(state.met);
        // 末段高度闭环：按剩余高度差收紧爬升率，保证关机时高度与径向速度同时归零
        var vCircNow = Math.sqrt(MU / state.r);
        var w = Math.max(0, Math.min(1, (v / vCircNow - W_TERM) / (1 - W_TERM)));
        var vrWant = Math.max(-VR_CAP, Math.min(VR_CAP, KH * (H_ORB - h)));
        var gRef = Math.atan2(vrWant, Math.max(state.vt, 0.02));
        aCmd += Math.max(-AOA_MAX, Math.min(AOA_MAX, w * KG * (gamma - gRef)));
        aCmd = Math.max(0, Math.min(100 * DEG, aCmd));
      }
      var dA = aCmd - state.alpha, lim = A_RATE * dt;
      state.alpha += Math.max(-lim, Math.min(lim, dA));

      // 点火段：推力未超过重量前留在台上
      if (state.phase === 'ignition') {
        if (state.t >= IGN_RAMP && F > m * g) {
          state.phase = 'burn1';
          firePhase('liftoff');
        } else {
          state.vr = 0; state.vt = 0; state.accel = 0;
          return;
        }
      }

      var burning = isBurning();
      var ar = (burning ? A * Math.cos(state.alpha) : 0) - g + state.vt * state.vt / state.r;
      var at = (burning ? A * Math.sin(state.alpha) : 0) - state.vr * state.vt / state.r;
      state.accel = burning ? A : 0;
      state.vr += ar * dt;
      state.vt += at * dt;
      state.r += state.vr * dt;
      state.theta += (state.vt / state.r) * dt;
      if (state.r < R_E) { state.r = R_E; state.vr = Math.max(0, state.vr); }
      state.gamma = Math.atan2(state.vr, state.vt);

      // 燃料与级间转换
      if (state.phase === 'burn1') {
        state.fuel1 -= F1 / VE1 * dt;
        if (state.boostersAttached) {
          state.fuelBoost -= FB / VE1 * dt;
          if (state.fuelBoost <= 0) {
            state.fuelBoost = 0; state.boostersAttached = false;
            detach('booster'); firePhase('boosterSep');
          }
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
        // 允许少量"推进剂余度"补燃（不越过 GHOST_LIMIT），用于收敛数值误差
        if (state.fuel2 > GHOST_LIMIT) state.fuel2 = Math.max(GHOST_LIMIT, state.fuel2 - F2 / VE2 * dt);
      }

      // ---- 事件触发（按真实 CZ-2F MET 锚点）----
      if (!fired.pitch && state.met >= MET_PITCH) firePhase('pitch');
      if (!fired.maxQ && state.met >= MET_MAXQ && h > ALT_DENSE) firePhase('maxQ');
      // 逃逸塔：抛离通常发生在 120 s 前后；按真实锚点按时间触发，姿态不再卡在塔顶
      if (state.towerAttached && state.met >= MET_TOWER) {
        state.towerAttached = false; detach('tower'); firePhase('towerSep');
      }
      // 整流罩：约 210 s 在气动加热基本消失后抛离
      if (state.fairingAttached && state.met >= MET_FAIRING) {
        state.fairingAttached = false; detach('fairing'); firePhase('fairingSep');
      }
      // 二级巡航段：俯仰程序接近水平时给出阶段性提示
      if (!fired.cruise && state.phase === 'burn2' && state.met >= 320 && state.met < 600) firePhase('cruise');

      // 关机入轨：达到当地环绕速度且径向速度接近 0（即完成圆轨道插入）
      if (state.phase === 'burn2') {
        var vCirc = Math.sqrt(MU / state.r);
        if (state.vt >= vCirc * 0.999 && Math.abs(state.vr) < 0.15) {
          state.phase = 'orbit'; state.inserted = true;
          for (var k = 0; k < panels.length; k++) panels[k].mesh.visible = true;
          firePhase('seco');
        }
      }

      // 船箭分离：真实任务在 MET ≈ 585 s（入轨后约 23 s）进行；在轨段时间被
      // 20× 加速，MET 585 会在关机后一闪而过，因此等在轨过渡（镜头拉远、
      // 箭体放大）基本完成后触发，保证分离画面清晰可辨
      if (state.shipAttached && state.inserted && state.orbitBlend > 0.95) {
        state.shipAttached = false;
        detach('stage2'); firePhase('shipSep');
      }
    }

    function update(dt, cam) {
      if (!state.ignited) { syncFlames(); return; }
      var warp = 1 + (WARP - 1) * state.orbitBlend;
      if (state.hold) warp *= HOLD_WARP;   // 长按加速：在基础倍率上再乘
      state.warp = warp;
      var simDt = dt * warp;
      var remaining = simDt, hMax = 1 / 120;
      var guard = 0;
      while (remaining > 1e-6 && guard++ < 400) {
        var hs = Math.min(hMax, remaining);
        step(hs);
        remaining -= hs;
      }
      syncWorld();

      var camDist = cam ? cam.distance : 20;
      state.camDist = camDist;

      spawnFlames(dt, camDist);
      if (state.t < 7.5 || state.altVis < 6) spawnPadSmoke(dt);
      if (state.inserted) spawnTrail(dt, camDist);

      // 入轨后镜头过渡 + 视觉放大
      var target = state.inserted ? 1 : 0;
      state.orbitBlend += (target - state.orbitBlend) * Math.min(1, dt * 0.34);
      // 在轨放大 24×：镜头拉到全景（~5200 单位）后飞船本体仍需可辨，
      // 放大与拉远同步进行，屏幕占比全程基本恒定（近景 ~36px → 全景 ~30px）
      state.scale = 1 + state.orbitBlend * 23;
      // 船箭分离后，镜头/尾迹/信标的跟随中心从整箭中心平滑移到飞船组合体中心
      var focusTarget = state.shipAttached ? rocketModel.center : SHIP_CENTER;
      state.focus += (focusTarget - state.focus) * Math.min(1, dt * 1.5);
      if (state.orbitBlend > 0.92 && !fired.orbit) firePhase('orbit');

      orbitRing.visible = state.orbitBlend > 0.01;
      orbitRing.alpha = Math.min(0.5, state.orbitBlend * 0.5);

      if (pad.ember) {
        var glow = state.t < IGN_RAMP ? state.t / IGN_RAMP
          : Math.max(0, 1 - (state.t - IGN_RAMP) / 2.5);
        pad.ember.glow = glow * 0.9;
      }
      state.progress = Math.min(1, state.t / T_TOTAL);
      syncFlames();
    }

    function directCamera(cam, dt) {
      if (!state.ignited) return;
      var k = state.orbitBlend;
      var s = state.scale;
      var noseX = Math.sin(state.tilt), noseY = Math.cos(state.tilt);
      var cx = state.x + noseX * state.focus * s;
      var cy = state.y + noseY * state.focus * s;
      var chaseDist = Math.max(20, Math.min(115, 20 + Math.max(state.alt, state.altVis) * 0.55));
      var tx = cx + (E.center[0] - cx) * k;
      var ty = cy + (E.center[1] - cy) * k;
      var tz = 0 + (E.center[2] - 0) * k;
      var dist = chaseDist + (cam.fitDist - chaseDist) * k;
      var lerpK = Math.min(1, dt * 5);
      cam.targetX += (tx - cam.targetX) * lerpK;
      cam.targetY += (ty - cam.targetY) * lerpK;
      cam.targetZ += (tz - cam.targetZ) * lerpK;
      cam.distance += (dist - cam.distance) * Math.min(1, dt * 2.2);
      // 镜头环绕率必须低于地球自转速（SPIN_RATE=0.06）：否则画面上地表
      // 会呈现"向左退"的反向旋转。在轨段降到 0.03，地表以 +0.03 rad/s
      // 自西向东转，飞船仍以 ~0.105 rad/s 向东超越，物理观感一致。
      cam.yaw += dt * (0.035 * (1 - k) + 0.03 * k);
      cam.pitch += ((0.05 + 0.20 * k) - cam.pitch) * Math.min(1, dt * 1.5);
      var shake = 0;
      // 场景秒窗口按 MET 锚点换算（TS=6）：12/20 场景秒 ≈ MET 72/120
      if (state.t > IGN_RAMP && state.t < 12) shake = 0.05;
      else if (state.t >= 12 && state.t < 20) shake = 0.028;
      cam.shake = shake;
    }

    function reset() {
      state.phase = 'prelaunch'; state.t = 0;
      state.r = R_E; state.theta = 0; state.vr = 0; state.vt = 0;
      state.alpha = 0; state.gamma = Math.PI / 2; state.tilt = 0; state.tiltVis = 0;
      state.fuel1 = S1F0; state.fuel2 = S2F0; state.fuelBoost = BF0;
      state.boostersAttached = true; state.stage1Attached = true;
      state.towerAttached = true; state.fairingAttached = true;
      state.ignited = false; state.inserted = false; state.orbitBlend = 0;
      state.hold = false;
      state.shipAttached = true; state.focus = rocketModel.center;
      state.warp = 1; state.scale = 1; state.progress = 0; state.sepT = 0;
      state.accel = 0; state.gForce = 1; state.met = 0; state._altMax = 0;
      pad.armSwing = 0;
      M3D.setArmSwing(pad, 0);
      // 地球自转归零并立即重建矩阵：否则回到展示模式后发射场仍停在
      // 上次发射累计转过的经度上
      pad.earthSpin = 0;
      M3D.spinEarth(pad, 0, 0);
      syncWorld();
      fired = {}; acc = {};
      if (pad.ember) pad.ember.glow = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.detached = false; p.detachOff = [0, 0, 0]; p.detachV = [0, 0, 0];
        p.detachRot = [0, 0, 0]; p.detachSpin = [0, 0, 0];
        p.mesh.alpha = 1;
        p.mesh.visible = p.detachGroup !== 'panel';
      }
      orbitRing.visible = false; orbitRing.alpha = 0;
      renderer.particles.reset();
      syncFlames();
    }

    reset();

    return {
      state: state, V_ORB: V_ORB, KM_PER_UNIT: KM_PER_UNIT, MS_PER_UNIT: MS_PER_UNIT, TIME_SCALE: TIME_SCALE,
      ignite: function () { state.ignited = true; state.phase = 'ignition'; firePhase('ignition'); },
      setHoldWarp: function (on) { state.hold = !!on; },
      update: update, reset: reset, directCamera: directCamera, syncFlames: syncFlames,
      updateDetachedParts: function (dt) {
        var A = (isBurning() && !state.inserted) ? currentThrust() / state.mass : 0;
        var c = Math.cos(state.tiltVis), s = Math.sin(state.tiltVis);
        var ax = s * A, ay = c * A, az = 0;
        if (state.inserted) {
          // 入轨后箭体本身处于自由落体（引力恰好充当向心加速度），把引力计入
          // 参考系加速度，分离体才不会相对飞船凭空向地心加速坠落
          var gMag = MU / (state.r * state.r);
          ax -= Math.sin(state.theta) * gMag;
          ay -= Math.cos(state.theta) * gMag;
        }
        M3D.updateDetached(parts, dt, MU, E.center[0], E.center[1], E.center[2], ax, ay, az);
      },
      setFitDistance: function (d) { /* 由 app 写入 cam.fitDist */ }
    };
  }

  M3D.createLaunchSystem = createLaunchSystem;
})(typeof window !== 'undefined' ? window : this);