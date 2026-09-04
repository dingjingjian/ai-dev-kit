(function (global) {
  'use strict';
  var M3D = global.M3D, mat4 = M3D.mat4, geom = M3D.geom;

  // ---- 全局尺度（发射/在轨共用同一套物理尺度）----
  var EARTH_R = 1800;                 // 地球半径（场景单位）
  var EARTH_CENTER = [0, -EARTH_R, 0]; // 球心：地表发射点位于世界原点
  var ORBIT_ALT = 97;                 // 目标轨道高度（场景单位）≈ 343 km，与神舟轨道一致
  var TIME_SCALE = 10.0;              // 1 场景秒 ≈ 10 任务秒：起飞→入轨约 55 场景秒（MET ≈ 9 分 15 秒）
  var KM_PER_UNIT = 6371 / EARTH_R;   // 1 场景单位 ≈ 3.539 km
  // 场景重力加速度：由真实 9.81 m/s² 按上述单位/时间换算反推，
  // 保证“场景里的物理”与“MET 显示的真实物理”自洽（改 TIME_SCALE 时必须同步改这里）
  var G0 = 9.81 * TIME_SCALE * TIME_SCALE / (KM_PER_UNIT * 1000);  // ≈ 0.09978
  var MU = G0 * EARTH_R * EARTH_R;    // 引力常数
  var ATMO_SCALE = 1.035;             // 大气层外壳相对地球半径（≈ 223 km）

  var SEG = 32;
  var COLORS = {
    white: [0.90, 0.91, 0.93], boostWhite: [0.87, 0.88, 0.91], dark: [0.20, 0.22, 0.26],
    red: [0.82, 0.16, 0.12], gold: [0.80, 0.62, 0.26], nozzle: [0.13, 0.13, 0.16],
    silver: [0.72, 0.74, 0.78], stripe: [0.13, 0.14, 0.17], tower: [0.66, 0.68, 0.72],
    capsule: [0.88, 0.88, 0.86], svc: [0.55, 0.60, 0.55], concrete: [0.23, 0.24, 0.27],
    apron: [0.58, 0.50, 0.38], padSteel: [0.34, 0.36, 0.40], duct: [0.10, 0.10, 0.12],
    ember: [1.0, 0.45, 0.10], sky: [0.36, 0.58, 1.0]
  };

  var CORE_R = 0.50;
  var BOOSTER_R = 0.335, BOOSTER_DIST = 0.90;
  var ROCKET_HEIGHT = 10.05;
  var ROCKET_CENTER = 5.0;
  var APRON_R = 34;   // 场坪弧长半径

  function sphereProfile(points) { return points; }

  function buildCZ2F(renderer) {
    var parts = [];
    function addPart(def) {
      var mesh = renderer.createMesh(def.geom, def.color, { group: def.group || 'rocket' });
      var p = {
        name: def.name, mesh: mesh,
        baseY: def.y, ox: def.x || 0, oz: def.z || 0,
        localRotY: def.rotY || 0, localRotX: def.rotX || 0,
        centerY: def.centerY != null ? def.centerY : 0,
        label: def.label || '', desc: def.desc || '',
        detachGroup: def.detachGroup || null,
        explodeOff: def.explodeOff || [0, 0, 0],
        detached: false, detachT: 0, detachBaseY: 0, detachX: 0, detachPitch: 0,
        detachV: [0, 0, 0], detachSpin: [0, 0, 0], detachOff: [0, 0, 0], detachRot: [0, 0, 0],
        tmp: mat4.create()
      };
      parts.push(p);
      return p;
    }

    // ---- 逃逸塔 ----
    addPart({ name: 'towerTip', geom: geom.cone(0.075, 0.42, 16), color: COLORS.red, y: 9.63, centerY: 0.21,
      label: '逃逸塔', desc: '发射段应急逃逸系统：一旦火箭出现致命故障，逃逸发动机点火，把飞船迅速拽离危险区。',
      detachGroup: 'tower', explodeOff: [0, 5.0, 0] });
    addPart({ name: 'towerNozzle', geom: geom.cylinder(0.10, 0.055, 0.10, 12), color: COLORS.nozzle, y: 9.53, centerY: 0.05, detachGroup: 'tower', explodeOff: [0, 5.0, 0] });
    addPart({ name: 'towerBody', geom: geom.cylinder(0.085, 0.10, 0.72, 16), color: COLORS.white, y: 8.81, centerY: 0.36, detachGroup: 'tower', explodeOff: [0, 5.0, 0] });
    addPart({ name: 'towerSkirt', geom: geom.cylinder(0.13, 0.085, 0.16, 16), color: COLORS.dark, y: 8.65, centerY: 0.08, detachGroup: 'tower', explodeOff: [0, 5.0, 0] });

    // ---- 整流罩 + 飞船 ----
    var FAIRING_R = 0.52, FAIRING_H = 1.15, FAIRING_CYL = 0.45;
    var ogH = FAIRING_H - FAIRING_CYL;
    var ogRho = (FAIRING_R * FAIRING_R + ogH * ogH) / (2 * FAIRING_R);
    var ogOff = Math.sqrt(ogRho * ogRho - ogH * ogH);
    var fairingProfile = [];
    for (var fp = 0; fp <= 16; fp++) {
      var fy = (fp / 16) * FAIRING_H;
      var r;
      if (fy <= FAIRING_CYL) {
        r = FAIRING_R;
      } else {
        var fy2 = fy - FAIRING_CYL;
        r = Math.sqrt(Math.max(0, ogRho * ogRho - fy2 * fy2)) - ogOff;
      }
      fairingProfile.push([r, fy]);
    }
    addPart({ name: 'fairing', geom: geom.lathe(fairingProfile, SEG), color: COLORS.white, y: 7.50, centerY: 0.58,
      label: '整流罩', desc: '穿越稠密大气层时保护飞船的气动外壳，飞出大气层后不再需要，对半剖开抛离。',
      detachGroup: 'fairing', explodeOff: [2.6, 3.2, 0] });
    addPart({ name: 'fairingRing', geom: geom.torus(0.505, 0.018, SEG, 8), color: COLORS.gold, y: 7.50, detachGroup: 'fairing', explodeOff: [2.6, 3.2, 0] });

    var capProfile = [[0.02, 0], [0.30, 0.10], [0.42, 0.30], [0.44, 0.52], [0.30, 0.72], [0.12, 0.82], [0.02, 0.84]];
    addPart({ name: 'capsule', geom: geom.lathe(sphereProfile(capProfile), SEG), color: COLORS.capsule, y: 7.72, centerY: 0.42,
      label: '飞船返回舱', desc: '载人飞船的核心舱段，航天员往返太空的“座舱”，再入大气层时独自返回地面。',
      detachGroup: 'never', explodeOff: [0, 4.6, 0] });
    addPart({ name: 'svcModule', geom: geom.cylinder(0.40, 0.40, 0.55, SEG), color: COLORS.svc, y: 7.72 - 0.55, centerY: 0.28,
      label: '服务舱', desc: '为飞船提供推进、电源与环控保障的舱段，返回前与返回舱分离。',
      detachGroup: 'never', explodeOff: [0, 3.9, 0] });
    // 在轨时展开的太阳翼（入轨后显现）
    for (var sp = 0; sp < 2; sp++) {
      var sgn = sp ? 1 : -1;
      addPart({ name: 'panel' + sp, geom: geom.box(2.6, 0.035, 0.5), color: [0.10, 0.16, 0.36], y: 7.34, x: sgn * 1.7, centerY: 0.02,
        detachGroup: 'panel', explodeOff: [0, 3.6, 0] });
    }

    // ---- 二级 ----
    addPart({ name: 'upper', geom: geom.cylinder(CORE_R, CORE_R, 2.40, SEG), color: COLORS.white, y: 5.30, centerY: 1.20,
      label: '二级', desc: '芯二级：装有高空发动机与推进剂贮箱，负责把飞船加速到入轨速度。',
      detachGroup: 'never', explodeOff: [0, 1.6, 0] });
    addPart({ name: 'upperStripe1', geom: geom.cylinder(0.505, 0.505, 0.10, SEG), color: COLORS.stripe, y: 7.40, detachGroup: 'fairing', explodeOff: [0, 1.5, 0] });
    addPart({ name: 'upperStripe2', geom: geom.torus(0.505, 0.014, SEG, 8), color: COLORS.gold, y: 6.45, detachGroup: 'never', explodeOff: [0, 1.6, 0] });

    // ---- 级间段 ----
    addPart({ name: 'inter', geom: geom.cylinder(0.47, CORE_R, 0.22, SEG), color: COLORS.dark, y: 5.08, centerY: 0.11,
      label: '级间段', desc: '连接一级与二级的锥段，一二级分离时在此断开，二级发动机在罩内点火。',
      detachGroup: 'stage1', explodeOff: [0, 0.5, 0] });

    // ---- 一级 ----
    addPart({ name: 'lower', geom: geom.cylinder(CORE_R, CORE_R, 4.58, SEG), color: COLORS.white, y: 0.50, centerY: 2.29,
      label: '一级', desc: '芯一级：全箭最大的推进模块，氧化剂与燃料贮箱加上发动机舱，提供上升主推力。',
      detachGroup: 'stage1', explodeOff: [0, -2.6, 0] });
    addPart({ name: 'lowerStripe1', geom: geom.cylinder(0.505, 0.505, 0.14, SEG), color: COLORS.stripe, y: 4.40, detachGroup: 'stage1', explodeOff: [0, -2.4, 0] });
    addPart({ name: 'lowerStripe2', geom: geom.cylinder(0.505, 0.505, 0.14, SEG), color: COLORS.stripe, y: 1.35, detachGroup: 'stage1', explodeOff: [0, -2.8, 0] });
    addPart({ name: 'badgeRed', geom: geom.torus(0.512, 0.016, SEG, 8), color: COLORS.red, y: 3.30, detachGroup: 'stage1', explodeOff: [0, -2.6, 0] });
    addPart({ name: 'badgeGold', geom: geom.torus(0.512, 0.013, SEG, 8), color: COLORS.gold, y: 2.75, detachGroup: 'stage1', explodeOff: [0, -2.6, 0] });

    // ---- 尾翼 ----
    var finG = geom.fin(0.30, 1.50, 0.62, 0.18, 0.045);
    for (var fi = 0; fi < 4; fi++) {
      addPart({ name: 'fin' + fi, geom: finG, color: COLORS.red, y: 0.62, rotY: fi * Math.PI / 2 + Math.PI / 4, centerY: 0.90,
        label: fi === 0 ? '尾翼' : '', desc: fi === 0 ? '四片气动稳定面，在大气层内飞行时保持箭体稳定。' : '',
        detachGroup: 'stage1', explodeOff: [0, -2.8, 0] });
    }

    // ---- 主发动机群（1 主机 + 4 游机）----
    addPart({ name: 'nozMain', geom: geom.cylinder(0.20, 0.36, 0.30, SEG), color: COLORS.nozzle, y: 0.20, centerY: 0.15,
      label: '主发动机', desc: '芯一级主发动机喷管，起飞时与助推器一起产生巨大推力。',
      detachGroup: 'stage1', explodeOff: [0, -3.6, 0] });
    for (var vn = 0; vn < 4; vn++) {
      var va = vn * Math.PI / 2 + Math.PI / 4, vrad = 0.34;
      addPart({ name: 'vernier' + vn, geom: geom.cylinder(0.06, 0.10, 0.16, 12), color: COLORS.nozzle,
        y: 0.30, x: Math.cos(va) * vrad, z: Math.sin(va) * vrad, detachGroup: 'stage1', explodeOff: [0, -3.5, 0] });
    }

    // ---- 四个助推器 ----
    var boostBodyG = geom.cylinder(BOOSTER_R, BOOSTER_R, 2.30, SEG);
    var boostConeG = geom.cone(BOOSTER_R, 0.42, SEG);
    var boostNozG = geom.cylinder(0.14, 0.22, 0.22, SEG);
    var boostRingG = geom.torus(BOOSTER_R + 0.01, 0.016, SEG, 8);
    for (var bi = 0; bi < 4; bi++) {
      var ba = bi * Math.PI / 2, bx = Math.cos(ba) * BOOSTER_DIST, bz = Math.sin(ba) * BOOSTER_DIST;
      addPart({ name: 'boostCone' + bi, geom: boostConeG, color: COLORS.silver, y: 2.55, x: bx, z: bz, centerY: 0.21,
        detachGroup: 'booster', explodeOff: [0, 1.2, 0] });
      addPart({ name: 'boostBody' + bi, geom: boostBodyG, color: COLORS.boostWhite, y: 0.25, x: bx, z: bz, centerY: 1.15,
        label: bi === 0 ? '助推器' : '', desc: bi === 0 ? '四枚液体助推器围绕芯一级，提供起飞阶段的附加推力，燃料耗尽后分离坠落。' : '',
        detachGroup: 'booster', explodeOff: [0, -2.2, 0] });
      addPart({ name: 'boostRing' + bi, geom: boostRingG, color: COLORS.red, y: 2.50, x: bx, z: bz, detachGroup: 'booster', explodeOff: [0, 1.1, 0] });
      addPart({ name: 'boostNoz' + bi, geom: boostNozG, color: COLORS.nozzle, y: 0.03, x: bx, z: bz, centerY: 0.11,
        detachGroup: 'booster', explodeOff: [0, -2.9, 0] });
    }

    return { parts: parts, height: ROCKET_HEIGHT, center: ROCKET_CENTER, coreR: CORE_R, boosterDist: BOOSTER_DIST, boosterR: BOOSTER_R };
  }

  function buildPad(renderer) {
    var pad = {};

    // ---- 地球：完整球体，程序化海陆/冰盖/云层 ----
    var earthG = geom.sphere(EARTH_R, 168, 104);
    pad.earth = renderer.createMesh(earthG, [1, 1, 1], { group: 'earth', isEarth: true });
    pad.earth.atmo = 0.18;
    mat4.identity(pad.earth.modelMatrix);
    mat4.translate(pad.earth.modelMatrix, pad.earth.modelMatrix, EARTH_CENTER);
    pad.earthSpin = 0;

    // 大气辉光壳：只画背面 + 附加混合 → 轨道上是光晕，地面上是天空梯度与地平线霞光
    // 分段取密一些：地面模式下整片天空都由这层壳绘制，段数不足会让天空出现直边方块感
    var atmoG = geom.sphere(EARTH_R * ATMO_SCALE, 192, 112);
    pad.atmo = renderer.createMesh(atmoG, COLORS.sky, { group: 'earth', blend: 'add', cull: 'front', atmoShader: true });
    pad.atmo.atmoInner = 1 / ATMO_SCALE;
    pad.atmo.atmoStrength = 1.25;
    mat4.identity(pad.atmo.modelMatrix);
    mat4.translate(pad.atmo.modelMatrix, pad.atmo.modelMatrix, EARTH_CENTER);

    // ---- 场坪：贴合球面的球冠 ----
    pad.apron = renderer.createMesh(geom.cap(EARTH_R, APRON_R, 96, 6), COLORS.apron, { group: 'pad', fill: 0.10 });
    pad.ground = renderer.createMesh(geom.disk(9, 64), COLORS.concrete, { group: 'pad' });
    pad.ground.modelMatrix[13] = 0.05;

    pad.platform = renderer.createMesh(geom.cylinder(1.15, 1.35, 0.16, 32), COLORS.padSteel, { group: 'pad' });
    pad.ductRing = renderer.createMesh(geom.ring(0.42, 0.95, 32), COLORS.duct, { group: 'pad' });
    pad.ductRing.modelMatrix[13] = 0.165;
    pad.ember = renderer.createMesh(geom.disk(0.42, 24), COLORS.ember, { group: 'pad' });
    pad.ember.modelMatrix[13] = 0.17;
    pad.ember.glow = 0;

    // 导流槽挡焰墙
    pad.deflector = renderer.createMesh(geom.box(2.6, 0.55, 0.5), COLORS.concrete, { group: 'pad' });
    mat4.identity(pad.deflector.modelMatrix);
    mat4.translate(pad.deflector.modelMatrix, pad.deflector.modelMatrix, [0, 0, -2.1]);

    // 勤务塔
    // 勤务塔放在射向反侧（火箭下程方向为 +X），避免程序转弯后箭体从塔顶扫过
    var towerX = -2.35, towerZ = -0.4;
    pad.towerBase = renderer.createMesh(geom.box(0.9, 0.3, 0.9), COLORS.concrete, { group: 'pad' });
    mat4.identity(pad.towerBase.modelMatrix);
    mat4.translate(pad.towerBase.modelMatrix, pad.towerBase.modelMatrix, [towerX - 0.45, 0, towerZ - 0.45]);
    var railG = geom.box(0.10, 9.6, 0.10);
    var railPos = [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]];
    pad.towerRails = [];
    for (var ri = 0; ri < 4; ri++) {
      var rail = renderer.createMesh(railG, COLORS.tower, { group: 'pad' });
      mat4.identity(rail.modelMatrix);
      mat4.translate(rail.modelMatrix, rail.modelMatrix, [towerX + railPos[ri][0] - 0.05, 0.3, towerZ + railPos[ri][1] - 0.05]);
      pad.towerRails.push(rail);
    }
    pad.towerBeams = [];
    var beamG = geom.box(0.86, 0.07, 0.86);
    for (var by = 1.4; by <= 9.4; by += 1.6) {
      var beam = renderer.createMesh(beamG, COLORS.tower, { group: 'pad' });
      mat4.identity(beam.modelMatrix);
      mat4.translate(beam.modelMatrix, beam.modelMatrix, [towerX - 0.43, by, towerZ - 0.43]);
      pad.towerBeams.push(beam);
    }
    pad.towerTop = renderer.createMesh(geom.box(0.5, 0.7, 0.5), COLORS.dark, { group: 'pad' });
    mat4.identity(pad.towerTop.modelMatrix);
    mat4.translate(pad.towerTop.modelMatrix, pad.towerTop.modelMatrix, [towerX - 0.25, 9.9, towerZ - 0.25]);
    pad.towerAntenna = renderer.createMesh(geom.cylinder(0.015, 0.015, 1.1, 8), COLORS.red, { group: 'pad' });
    mat4.identity(pad.towerAntenna.modelMatrix);
    mat4.translate(pad.towerAntenna.modelMatrix, pad.towerAntenna.modelMatrix, [towerX, 10.6, towerZ]);

    // 回转平台摆臂（连接勤务塔与火箭），由 M3D.setArmSwing 驱动摆开/复位
    pad.arms = [];
    var armG = geom.box(1.5, 0.09, 0.26);
    var armHeights = [2.2, 4.6, 7.0];
    for (var ai = 0; ai < armHeights.length; ai++) {
      var arm = renderer.createMesh(armG, COLORS.tower, { group: 'pad' });
      mat4.identity(arm.modelMatrix);
      mat4.translate(arm.modelMatrix, arm.modelMatrix, [towerX + 0.4 + 1.45, armHeights[ai], towerZ - 0.13]);
      pad.arms.push(arm);
    }
    pad.armYs = armHeights;
    pad.armSwing = 0;

    // 支撑腿
    pad.legs = [];
    var legG = geom.box(0.14, 0.6, 0.14);
    for (var li = 0; li < 6; li++) {
      var la = (li / 6) * Math.PI * 2 + Math.PI / 6;
      var leg = renderer.createMesh(legG, COLORS.padSteel, { group: 'pad' });
      mat4.identity(leg.modelMatrix);
      mat4.translate(leg.modelMatrix, leg.modelMatrix, [Math.cos(la) * 1.05 - 0.07, 0, Math.sin(la) * 1.05 - 0.07]);
      pad.legs.push(leg);
    }

    pad.parts = [pad.ground, pad.platform, pad.ductRing, pad.ember, pad.deflector, pad.towerBase, pad.towerTop, pad.towerAntenna]
      .concat(pad.towerRails, pad.towerBeams, pad.arms, pad.legs);
    pad.all = pad.parts.concat([pad.apron]);
    pad.towerX = towerX; pad.towerZ = towerZ;
    return pad;
  }

  // 地球自转：地轴相对世界 Y 轴倾斜 AXIS_TILT，使发射场（世界 +Y 极点）落在
  // 贴图的北纬 40°、东经 100°（戈壁发射场），自转仍绕地球自身极轴、自西向东。
  // 世界坐标约定：天顶=+Y，东=+X（与火箭下程方向一致，顺行发射可借助地球自转），北=-Z。
  // 外层 Ry(90°) 负责把“东向”从 +Z 转到 +X（否则火箭是朝南北方向发射的）；
  // SPIN0 必须取 -100°，台面才会压在东经 100°（取 +100° 会落到西经 100°）。
  var AXIS_TILT = 50 * Math.PI / 180;
  var SPIN0 = -100 * Math.PI / 180;
  var SPIN_RATE = 0.016;

  // rate：自转速度倍率。发射台还立在地表时传 0（地球静止，发射台不会在地表漂移），
  // 等发射台淡出后再由调用方把 rate 平滑拉到 1，地球才慢慢转起来。
  function spinEarth(pad, dt, rate) {
    if (!pad.earth) return;
    pad.earthSpin += dt * SPIN_RATE * (rate || 0);
    var m = pad.earth.modelMatrix;
    mat4.identity(m);
    mat4.translate(m, m, EARTH_CENTER);
    mat4.rotateY(m, m, Math.PI / 2);     // 东向 → 世界 +X（与火箭下程一致）
    mat4.rotateZ(m, m, -AXIS_TILT);
    mat4.rotateY(m, m, SPIN0 + pad.earthSpin);
  }

  // 回转平台摆臂收回：绕塔架侧端点的竖轴旋转约 112°，为点火/起飞让出通道。
  // k: 0 = 连接箭体（初始），1 = 完全摆开。
  function setArmSwing(pad, k) {
    if (!pad.arms) return;
    pad.armSwing = k;
    var ang = -k * 1.95;
    var px = pad.towerX + 0.4, pz = pad.towerZ - 0.13;   // 摆臂塔侧端点（枢轴）
    for (var i = 0; i < pad.arms.length; i++) {
      var m = pad.arms[i].modelMatrix;
      mat4.identity(m);
      mat4.translate(m, m, [px, 0, pz]);
      mat4.rotateY(m, m, ang);
      mat4.translate(m, m, [1.45, pad.armYs[i], 0]);
    }
  }

  // env: { rotY, explode, launchY, launchX, tilt, launchT, scale }
  function updatePartTransforms(parts, env) {
    var g = env.rotY, radScale = 1 + env.explode * 1.7;
    var tilt = env.tilt || 0, launchX = env.launchX || 0;
    var s = env.scale || 1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var detached = p.detached;
      var launchY = detached ? p.detachBaseY : env.launchY;
      var curTilt = detached ? (p.detachPitch || 0) : tilt;
      var curX = detached ? (p.detachX || 0) : launchX;
      var px = p.ox * radScale + p.detachOff[0] + p.explodeOff[0] * env.explode;
      var pz = p.oz * radScale + p.detachOff[2] + p.explodeOff[2] * env.explode;
      var py = p.baseY + p.detachOff[1] + p.explodeOff[1] * env.explode;
      var m = p.tmp;
      mat4.identity(m);
      mat4.translate(m, m, [curX, launchY, 0]);
      if (s !== 1) mat4.scale(m, m, [s, s, s]);
      mat4.rotateZ(m, m, -curTilt);
      mat4.rotateY(m, m, g);
      mat4.translate(m, m, [px, py + p.centerY, pz]);
      if (detached) {
        mat4.rotateY(m, m, p.localRotY + p.detachRot[1]);
        mat4.rotateX(m, m, p.detachRot[0]);
      } else {
        if (p.localRotY) mat4.rotateY(m, m, p.localRotY);
        if (p.localRotX) mat4.rotateX(m, m, p.localRotX);
      }
      mat4.translate(m, m, [0, -p.centerY, 0]);
      var mm = p.mesh.modelMatrix;
      for (var k = 0; k < 16; k++) mm[k] = m[k];
      if (detached) {
        var since = env.launchT - p.detachT;
        p.mesh.alpha = Math.max(0, 1 - Math.max(0, since - 3) * 0.28);
        if (p.mesh.alpha <= 0) p.mesh.visible = false;
      }
    }
  }

  // 分离体：相对箭体做弹道运动（重力矢量 + 箭体加速度差）
  function updateDetached(parts, dt, mu, cx, cy, cz, aVehX, aVehY, aVehZ) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.detached) continue;
      var m = p.mesh.modelMatrix;
      var dx = cx - m[12], dy = cy - m[13], dz = cz - m[14];
      var d2 = dx * dx + dy * dy + dz * dz;
      var d = Math.sqrt(d2) || 1;
      var gMag = mu / d2;
      var ax = dx / d * gMag - aVehX, ay = dy / d * gMag - aVehY, az = dz / d * gMag - aVehZ;
      p.detachV[0] += ax * dt; p.detachV[1] += ay * dt; p.detachV[2] += az * dt;
      p.detachOff[0] += p.detachV[0] * dt;
      p.detachOff[1] += p.detachV[1] * dt;
      p.detachOff[2] += p.detachV[2] * dt;
      p.detachRot[0] += p.detachSpin[0] * dt;
      p.detachRot[1] += p.detachSpin[1] * dt;
    }
  }

  M3D.EARTH = {
    R: EARTH_R, center: EARTH_CENTER, alt: ORBIT_ALT, r: EARTH_R + ORBIT_ALT,
    mu: MU, g0: G0, atmoScale: ATMO_SCALE, timeScale: TIME_SCALE, kmPerUnit: KM_PER_UNIT
  };
  M3D.buildCZ2F = buildCZ2F;
  M3D.buildPad = buildPad;
  M3D.spinEarth = spinEarth;
  M3D.setArmSwing = setArmSwing;
  M3D.updatePartTransforms = updatePartTransforms;
  M3D.updateDetached = updateDetached;
  M3D.COLORS = COLORS;
})(typeof window !== 'undefined' ? window : this);
