(function (global) {
  'use strict';
  var M3D = global.M3D, mat4 = M3D.mat4, geom = M3D.geom;

  // ---- 全局尺度（发射/在轨共用同一套物理尺度）----
  var EARTH_R = 1800;                 // 地球半径（场景单位）
  var EARTH_CENTER = [0, -EARTH_R, 0]; // 球心：地表发射点位于世界原点
  var ORBIT_ALT = 97;                 // 目标轨道高度（场景单位）≈ 343 km，与神舟轨道一致
  var TIME_SCALE = 6.0;               // 1 场景秒 ≈ 6 任务秒：起飞→入轨约 94 场景秒（MET ≈ 9 分 24 秒）
                                      // 放慢整体节奏让各分离事件的字幕有足够停留时间；改此值时
                                      // launch.js 的推力/排气速度/闭环参数必须按 F∝TS²、VE∝TS 同步缩放
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
    apron: [0.58, 0.50, 0.38], slab: [0.50, 0.51, 0.53], padSteel: [0.34, 0.36, 0.40], duct: [0.10, 0.10, 0.12],
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
      var mesh = renderer.createMesh(def.geom, def.color, { group: def.group || 'rocket', cull: def.cull || 'back' });
      var p = {
        name: def.name, mesh: mesh,
        baseY: def.y, ox: def.x || 0, oz: def.z || 0,
        localRotY: def.rotY || 0, localRotX: def.rotX || 0,
        centerY: def.centerY != null ? def.centerY : 0,
        label: def.label || '', desc: def.desc || '',
        detachGroup: def.detachGroup || null,
        side: def.side || 0,
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
    // 逃逸发动机斜置喷管（塔顶四周外倾）与塔身栅格舵
    var escNozG = geom.cylinder(0.016, 0.040, 0.10, 8);
    var escFinG = geom.box(0.15, 0.10, 0.012);
    for (var te = 0; te < 4; te++) {
      var tea = te * Math.PI / 2;
      addPart({ name: 'escNoz' + te, geom: escNozG, color: COLORS.nozzle,
        y: 9.55, x: Math.cos(tea) * 0.062, z: Math.sin(tea) * 0.062, rotY: tea, rotX: 0.42, centerY: 0.05,
        detachGroup: 'tower', explodeOff: [0, 5.0, 0] });
      addPart({ name: 'escFin' + te, geom: escFinG, color: COLORS.dark,
        y: 8.62, x: Math.cos(tea) * 0.125, z: Math.sin(tea) * 0.125, rotY: tea + Math.PI / 2, centerY: 0.05,
        detachGroup: 'tower', explodeOff: [0, 5.0, 0] });
    }

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
    // 整流罩左右半壳：分离时沿纵向剖面向两侧翻开抛离（cull:'none' 让壳体内侧可见）
    addPart({ name: 'fairingR', geom: geom.lathe(fairingProfile, SEG, -Math.PI / 2, Math.PI / 2), color: COLORS.white, y: 7.50, centerY: 0.58,
      label: '整流罩', desc: '穿越稠密大气层时保护飞船的气动外壳，飞出大气层后不再需要，沿纵向对半剖开抛离。',
      detachGroup: 'fairing', side: 1, cull: 'none', explodeOff: [1.5, 3.2, 0] });
    addPart({ name: 'fairingL', geom: geom.lathe(fairingProfile, SEG, Math.PI / 2, Math.PI * 1.5), color: COLORS.white, y: 7.50, centerY: 0.58,
      detachGroup: 'fairing', side: -1, cull: 'none', explodeOff: [-1.5, 3.2, 0] });
    addPart({ name: 'fairingRingR', geom: geom.torus(0.505, 0.018, SEG, 8, -Math.PI / 2, Math.PI / 2), color: COLORS.gold, y: 7.50, detachGroup: 'fairing', side: 1, explodeOff: [1.5, 3.2, 0] });
    addPart({ name: 'fairingRingL', geom: geom.torus(0.505, 0.018, SEG, 8, Math.PI / 2, Math.PI * 1.5), color: COLORS.gold, y: 7.50, detachGroup: 'fairing', side: -1, explodeOff: [-1.5, 3.2, 0] });

    var capProfile = [[0.02, 0], [0.30, 0.075], [0.42, 0.225], [0.44, 0.39], [0.30, 0.54], [0.14, 0.60], [0.12, 0.63]];
    addPart({ name: 'capsule', geom: geom.lathe(sphereProfile(capProfile), SEG), color: COLORS.capsule, y: 7.72, centerY: 0.32,
      label: '飞船返回舱', desc: '载人飞船的核心舱段，航天员往返太空的“座舱”，再入大气层时独自返回地面。',
      detachGroup: 'never', explodeOff: [0, 4.6, 0] });
    // 轨道舱坐在返回舱颈部；尺寸收敛在整流罩卵形段内（顶端罩体半径 ~0.18）
    addPart({ name: 'orbitalModule', geom: geom.cylinder(0.10, 0.14, 0.22, 24), color: COLORS.capsule, y: 8.35, centerY: 0.11,
      label: '轨道舱', desc: '航天员在轨工作生活的前端舱段，带有对接机构，任务后期与返回舱组合体分离。',
      detachGroup: 'never', explodeOff: [0, 5.2, 0] });
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
      label: '二级', desc: '芯二级：装有高空发动机与推进剂贮箱，负责把飞船加速到入轨速度，船箭分离后抛离。',
      detachGroup: 'stage2', explodeOff: [0, 1.9, 0] });
    addPart({ name: 'upperStripe1', geom: geom.cylinder(0.505, 0.505, 0.10, SEG), color: COLORS.stripe, y: 7.40, detachGroup: 'fairing', explodeOff: [0, 1.5, 0] });
    addPart({ name: 'upperStripe2', geom: geom.torus(0.505, 0.014, SEG, 8), color: COLORS.gold, y: 6.45, detachGroup: 'stage2', explodeOff: [0, 1.9, 0] });

    // ---- 级间段 ----
    addPart({ name: 'inter', geom: geom.cylinder(0.47, CORE_R, 0.22, SEG), color: COLORS.dark, y: 5.08, centerY: 0.11,
      label: '级间段', desc: '连接一级与二级的锥段，一二级分离时在此断开，二级发动机在罩内点火。',
      detachGroup: 'stage1', explodeOff: [0, 0.3, 0] });

    // ---- 二级发动机（主喷管 + 4 游机）：分离前藏在级间段内，分离后露出 ----
    addPart({ name: 'nozS2', geom: geom.cylinder(0.14, 0.30, 0.24, SEG), color: COLORS.nozzle, y: 5.06, centerY: 0.12,
      label: '二级发动机', desc: '二级主发动机高空喷管，一二级分离后点火工作，把飞船一路加速到环绕速度。',
      detachGroup: 'stage2', explodeOff: [0, 1.15, 0] });
    var s2vG = geom.cylinder(0.030, 0.062, 0.12, 10);
    for (var sv = 0; sv < 4; sv++) {
      var sva = sv * Math.PI / 2 + Math.PI / 4, svr = 0.37;
      addPart({ name: 'nozS2V' + sv, geom: s2vG, color: COLORS.nozzle,
        y: 5.10, x: Math.cos(sva) * svr, z: Math.sin(sva) * svr, rotY: sva, rotX: 0.35, centerY: 0.06,
        detachGroup: 'stage2', explodeOff: [0, 1.15, 0] });
    }

    // ---- 一级 ----
    addPart({ name: 'lower', geom: geom.cylinder(CORE_R, CORE_R, 4.58, SEG), color: COLORS.white, y: 0.50, centerY: 2.29,
      label: '一级', desc: '芯一级：全箭最大的推进模块，氧化剂与燃料贮箱加上发动机舱，提供上升主推力。',
      detachGroup: 'stage1', explodeOff: [0, -2.6, 0] });
    addPart({ name: 'lowerStripe1', geom: geom.cylinder(0.505, 0.505, 0.14, SEG), color: COLORS.stripe, y: 4.40, detachGroup: 'stage1', explodeOff: [0, -2.4, 0] });
    addPart({ name: 'lowerStripe2', geom: geom.cylinder(0.505, 0.505, 0.14, SEG), color: COLORS.stripe, y: 1.35, detachGroup: 'stage1', explodeOff: [0, -2.8, 0] });
    addPart({ name: 'badgeRed', geom: geom.torus(0.512, 0.016, SEG, 8), color: COLORS.red, y: 3.30, detachGroup: 'stage1', explodeOff: [0, -2.6, 0] });
    addPart({ name: 'badgeGold', geom: geom.torus(0.512, 0.013, SEG, 8), color: COLORS.gold, y: 2.75, detachGroup: 'stage1', explodeOff: [0, -2.6, 0] });
    // 箭体标识：红旗贴在二级 +X 面（弧面贴合箭体），
    // 载人航天徽标贴在整流罩圆柱段 +X 侧半罩上，抛罩时随半罩一起飞走
    var FLAG_R = 0.515, FLAG_W = 0.45, FLAG_H = 0.30, FLAG_Y = 6.52;
    var flagSpan = FLAG_W / FLAG_R;   // 旗面宽度对应的周向角
    addPart({ name: 'flagCN', geom: geom.arcPatch(FLAG_R, FLAG_H, -flagSpan / 2, flagSpan / 2, 16), color: COLORS.red,
      y: FLAG_Y, centerY: FLAG_H / 2, detachGroup: 'stage2', explodeOff: [0, 1.9, 0] });
    // 载人航天徽标：整流罩圆柱段（y 7.50~7.95）弧形贴片，随右半罩分离
    var BADGE_H = 0.22, badgeSpan = 0.26 / FAIRING_R;
    addPart({ name: 'cmsBadge', geom: geom.arcPatch(FAIRING_R + 0.01, BADGE_H, -badgeSpan / 2, badgeSpan / 2, 12), color: [0.08, 0.28, 0.62],
      y: 7.58, centerY: BADGE_H / 2, detachGroup: 'fairing', side: 1, explodeOff: [1.5, 3.2, 0] });
    addPart({ name: 'pipeLine', geom: geom.box(0.07, 4.0, 0.06), color: COLORS.silver, y: 0.66, x: -0.53, rotY: Math.PI / 2, centerY: 2.0,
      detachGroup: 'stage1', explodeOff: [-1.2, -2.6, 0] });

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
    // 喷管底端停在发射平台顶面(y=0.16)之上：baseY 最小取 0.17，
    // 四件部件统一抬高 0.14，保持组合体相对关系与拆解偏移不变
    var boostBodyG = geom.cylinder(BOOSTER_R, BOOSTER_R, 2.30, SEG);
    var boostConeG = geom.cone(BOOSTER_R, 0.42, SEG);
    var boostNozG = geom.cylinder(0.14, 0.22, 0.22, SEG);
    var boostRingG = geom.torus(BOOSTER_R + 0.01, 0.016, SEG, 8);
    for (var bi = 0; bi < 4; bi++) {
      var ba = bi * Math.PI / 2, bx = Math.cos(ba) * BOOSTER_DIST, bz = Math.sin(ba) * BOOSTER_DIST;
      addPart({ name: 'boostCone' + bi, geom: boostConeG, color: COLORS.silver, y: 2.69, x: bx, z: bz, centerY: 0.21,
        detachGroup: 'booster', explodeOff: [0, 1.2, 0] });
      addPart({ name: 'boostBody' + bi, geom: boostBodyG, color: COLORS.boostWhite, y: 0.39, x: bx, z: bz, centerY: 1.15,
        label: bi === 0 ? '助推器' : '', desc: bi === 0 ? '四枚液体助推器围绕芯一级，提供起飞阶段的附加推力，燃料耗尽后分离坠落。' : '',
        detachGroup: 'booster', explodeOff: [0, -2.2, 0] });
      addPart({ name: 'boostRing' + bi, geom: boostRingG, color: COLORS.red, y: 2.64, x: bx, z: bz, detachGroup: 'booster', explodeOff: [0, 1.1, 0] });
      addPart({ name: 'boostNoz' + bi, geom: boostNozG, color: COLORS.nozzle, y: 0.17, x: bx, z: bz, centerY: 0.11,
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

    // ---- 云层壳：独立于地表的半透明云球（参考“口袋地球”的云层做法）----
    // 半径 1.012×地球（≈ 76 km 高），不写深度、按半透明批次渲染；
    // 云量分布来自 clouds.png（clouds-data.js 内联，file:// 下也能加载），
    // 贴图缺失时着色器退回 fbm 噪声；自转比地表稍快形成漂移
    pad.clouds = renderer.createMesh(geom.sphere(EARTH_R * 1.012, 128, 80), [0.95, 0.96, 0.98],
      { group: 'earth', isCloud: true, depthWrite: false, fill: 0 });
    pad.clouds.alpha = 0.62;
    mat4.identity(pad.clouds.modelMatrix);
    mat4.translate(pad.clouds.modelMatrix, pad.clouds.modelMatrix, EARTH_CENTER);
    // 加载成功后再挂贴图：挂载前 uUseTex=0，走噪声后备，避免 1×1 白图占位导致整球发白
    var cloudTex = renderer.createTexture('assets/clouds.png', function (ok) {
      if (ok && pad.clouds) pad.clouds.texture = cloudTex;
    }, (typeof global.CLOUDS_TEXTURE_URI === 'string') ? global.CLOUDS_TEXTURE_URI : undefined);

    // 大气辉光壳：只画背面 + 附加混合 → 轨道上是光晕，地面上是天空梯度与地平线霞光
    // 分段取密一些：地面模式下整片天空都由这层壳绘制，段数不足会让天空出现直边方块感
    var atmoG = geom.sphere(EARTH_R * ATMO_SCALE, 192, 112);
    pad.atmo = renderer.createMesh(atmoG, COLORS.sky, { group: 'earth', blend: 'add', cull: 'front', atmoShader: true });
    pad.atmo.atmoInner = 1 / ATMO_SCALE;
    pad.atmo.atmoStrength = 1.25;
    mat4.identity(pad.atmo.modelMatrix);
    mat4.translate(pad.atmo.modelMatrix, pad.atmo.modelMatrix, EARTH_CENTER);

    // ---- 场坪：方形混凝土底座（真实发射场样式）----
    // 主台面罩住发射台、勤务塔基与四角避雷塔（±5.4）；半宽 6.3 留出人员通道边距。
    // 台面略高出地表（顶面 +0.06），混凝土浇筑会形成一个矮台阶。
    pad.apron = renderer.createMesh(geom.box(12.6, 0.12, 12.6), COLORS.slab, { group: 'pad' });
    mat4.identity(pad.apron.modelMatrix);
    mat4.translate(pad.apron.modelMatrix, pad.apron.modelMatrix, [0, -0.06, 0]);   // 下沉半高：顶面 +0.06，底面埋入地表
    // 压边垫层：比主台面宽一圈、低一阶（顶面 +0.03），形成浇筑台阶层次，颜色更深的旧混凝土
    pad.apronBase = renderer.createMesh(geom.box(13.4, 0.10, 13.4), COLORS.concrete, { group: 'pad' });
    mat4.identity(pad.apronBase.modelMatrix);
    mat4.translate(pad.apronBase.modelMatrix, pad.apronBase.modelMatrix, [0, -0.07, 0]);
    // 台面安全标线：围绕发射台一圈的黄色警戒圈（漆面，微高于台面避免深度冲突）
    pad.apronMark = renderer.createMesh(geom.ring(1.9, 2.0, 48), COLORS.gold, { group: 'pad' });
    mat4.identity(pad.apronMark.modelMatrix);
    mat4.translate(pad.apronMark.modelMatrix, pad.apronMark.modelMatrix, [0, 0.065, 0]);

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
    mat4.translate(pad.towerBase.modelMatrix, pad.towerBase.modelMatrix, [towerX, 0, towerZ]);
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
      mat4.translate(beam.modelMatrix, beam.modelMatrix, [towerX, by, towerZ]);
      pad.towerBeams.push(beam);
    }
    pad.towerTop = renderer.createMesh(geom.box(0.5, 0.7, 0.5), COLORS.dark, { group: 'pad' });
    mat4.identity(pad.towerTop.modelMatrix);
    mat4.translate(pad.towerTop.modelMatrix, pad.towerTop.modelMatrix, [towerX, 9.9, towerZ]);
    pad.towerAntenna = renderer.createMesh(geom.cylinder(0.015, 0.015, 1.1, 8), COLORS.red, { group: 'pad' });
    mat4.identity(pad.towerAntenna.modelMatrix);
    mat4.translate(pad.towerAntenna.modelMatrix, pad.towerAntenna.modelMatrix, [towerX, 10.6, towerZ]);

    // 回转平台摆臂（连接勤务塔与火箭），由 M3D.setArmSwing 驱动摆开/复位
    // 最低高度必须高于助推器锥顶(y≈3.11)：摆臂绕塔侧枢轴扫过的圆弧半径(2.2)
    // 覆盖 −z 侧助推器，摆臂若落在助推器高度带内，收回与摆开时都会穿模
    pad.arms = [];
    var armG = geom.box(2.2, 0.09, 0.26);
    var armHeights = [3.4, 5.2, 7.0];
    for (var ai = 0; ai < armHeights.length; ai++) {
      var arm = renderer.createMesh(armG, COLORS.tower, { group: 'pad' });
      mat4.identity(arm.modelMatrix);
      mat4.translate(arm.modelMatrix, arm.modelMatrix, [towerX + 0.43 + 1.1, armHeights[ai], towerZ - 0.13]);
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

    // 场坪四角避雷塔（真实发射场标志性设施）
    pad.lightning = [];
    var ltG = geom.cylinder(0.045, 0.075, 11.5, 8);
    var ltTipG = geom.sphere(0.11, 10, 6);
    var ltPos = [[5.4, 5.4], [-5.4, 5.4], [-5.4, -5.4], [5.4, -5.4]];
    for (var lt = 0; lt < 4; lt++) {
      var ltM = renderer.createMesh(ltG, COLORS.tower, { group: 'pad' });
      mat4.identity(ltM.modelMatrix);
      mat4.translate(ltM.modelMatrix, ltM.modelMatrix, [ltPos[lt][0], 0, ltPos[lt][1]]);
      var ltT = renderer.createMesh(ltTipG, COLORS.red, { group: 'pad' });
      mat4.identity(ltT.modelMatrix);
      mat4.translate(ltT.modelMatrix, ltT.modelMatrix, [ltPos[lt][0], 11.55, ltPos[lt][1]]);
      pad.lightning.push(ltM, ltT);
    }

    pad.parts = [pad.apron, pad.apronBase, pad.apronMark, pad.platform, pad.ductRing, pad.ember, pad.deflector, pad.towerBase, pad.towerTop, pad.towerAntenna]
      .concat(pad.towerRails, pad.towerBeams, pad.arms, pad.legs, pad.lightning);
    pad.all = pad.parts;
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
  // 自转速率：真实值按 20× 时间加速换算只有 ~0.015 rad/s，远景几乎看不出。
  // 这里放大到 0.06 rad/s 做视觉夸张，保证在轨镜头（环绕率 0.03）下
  // 地表呈现清晰的自西向东旋转（方向不能反：必须与飞船顺行同向）。
  var SPIN_RATE = 0.06;

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
    // 云层壳与地表同轴、同倾斜，但自转快 12% → 云相对地表缓慢漂移
    if (pad.clouds) {
      var cm = pad.clouds.modelMatrix;
      mat4.identity(cm);
      mat4.translate(cm, cm, EARTH_CENTER);
      mat4.rotateY(cm, cm, Math.PI / 2);
      mat4.rotateZ(cm, cm, -AXIS_TILT);
      mat4.rotateY(cm, cm, SPIN0 + pad.earthSpin * 1.12);
    }
  }

  // 回转平台摆臂收回：绕塔架侧端点的竖轴旋转约 112°，为点火/起飞让出通道。
  // k: 0 = 连接箭体（初始），1 = 完全摆开。
  function setArmSwing(pad, k) {
    if (!pad.arms) return;
    pad.armSwing = k;
    var ang = k * 1.95;   // 朝 -z（导流墙一侧）摆开，避开 +z 侧的箭体
    var px = pad.towerX + 0.43, pz = pad.towerZ - 0.13;   // 摆臂塔侧端点（枢轴）
    for (var i = 0; i < pad.arms.length; i++) {
      var m = pad.arms[i].modelMatrix;
      mat4.identity(m);
      mat4.translate(m, m, [px, 0, pz]);
      mat4.rotateY(m, m, ang);
      mat4.translate(m, m, [1.1, pad.armYs[i], 0]);
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
        var fadeRate = env.fade || 0.28;
        p.mesh.alpha = Math.max(0, 1 - Math.max(0, since - 3) * fadeRate);
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
    mu: MU, g0: G0, atmoScale: ATMO_SCALE, timeScale: TIME_SCALE, kmPerUnit: KM_PER_UNIT,
    axisTilt: AXIS_TILT
  };
  M3D.buildCZ2F = buildCZ2F;
  M3D.buildPad = buildPad;
  M3D.spinEarth = spinEarth;
  M3D.setArmSwing = setArmSwing;
  M3D.updatePartTransforms = updatePartTransforms;
  M3D.updateDetached = updateDetached;
  M3D.COLORS = COLORS;
})(typeof window !== 'undefined' ? window : this);
