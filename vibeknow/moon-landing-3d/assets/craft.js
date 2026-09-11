(function (global) {
  'use strict';
  var M3D = global.M3D, mat4 = M3D.mat4, geom = M3D.geom;

  // ============================================================
  //  全局尺度（发射 / 在轨 / 地月转移 / 环月共用同一套物理尺度）
  // ============================================================
  var EARTH_R = 1800;                  // 地球半径（场景单位）
  var EARTH_CENTER = [0, -EARTH_R, 0]; // 球心：地表发射点位于世界原点
  var ORBIT_ALT = 97;                  // 近地停泊轨道高度（场景单位）≈ 343 km
  var TIME_SCALE = 6.0;                // 1 场景秒 ≈ 6 任务秒（上升段）
  var KM_PER_UNIT = 6371 / EARTH_R;    // 1 场景单位 ≈ 3.539 km
  var G0 = 9.81 * TIME_SCALE * TIME_SCALE / (KM_PER_UNIT * 1000);
  var MU = G0 * EARTH_R * EARTH_R;     // 地球引力常数
  var ATMO_SCALE = 1.035;

  // ---- 月球（真实比例半径，地月距离做科普压缩）----
  // 真实月球半径 1737 km ≈ 491 单位（与地球 6371 km ≈ 1800 单位同比），
  // 真实地月距离 38.4 万 km ≈ 60 倍地球半径——若按真实值，转移段镜头
  // 要拉到 10 万单位外，月球只是一个像素点。这里把地月距离压缩到 ~12 倍
  // 地球半径，保证「地球 + 奔月航迹 + 月球」能同框呈现，遥测仍显示真实 km。
  var MOON_R = 1737 / KM_PER_UNIT;     // ≈ 491
  var MOON_DIST = EARTH_R * 12;        // 21600（压缩后的地月距离）
  var MOON_TH = 90 * Math.PI / 180;    // 月球相对地心的方位角（+Y 为 0，朝 +X 增大）
  var MOON_CENTER = [
    EARTH_CENTER[0] + MOON_DIST * Math.sin(MOON_TH),
    EARTH_CENTER[1] + MOON_DIST * Math.cos(MOON_TH),
    0
  ];
  // 环月轨道半径：月面以上 ~100 km（28 单位）
  var MOON_ORBIT_R = MOON_R + 100 / KM_PER_UNIT;

  var SEG = 32;
  var COLORS = {
    white: [0.90, 0.91, 0.93], boostWhite: [0.85, 0.86, 0.89], dark: [0.20, 0.22, 0.26],
    red: [0.82, 0.16, 0.12], gold: [0.80, 0.62, 0.26], nozzle: [0.13, 0.13, 0.16],
    silver: [0.72, 0.74, 0.78], stripe: [0.13, 0.14, 0.17], tower: [0.66, 0.68, 0.72],
    capsule: [0.88, 0.88, 0.86], svc: [0.55, 0.60, 0.55], concrete: [0.23, 0.24, 0.27],
    apron: [0.58, 0.50, 0.38], slab: [0.50, 0.51, 0.53], padSteel: [0.34, 0.36, 0.40], duct: [0.10, 0.10, 0.12],
    ember: [1.0, 0.45, 0.10], sky: [0.36, 0.58, 1.0],
    // 着陆器：金色多层隔热膜 + 银白上升舱
    foil: [0.78, 0.60, 0.22], landerBody: [0.80, 0.82, 0.85], landerDark: [0.32, 0.33, 0.36],
    panelBlue: [0.10, 0.16, 0.36], flagRed: [0.86, 0.14, 0.10]
  };

  // ---- 箭体尺度 ----
  var CORE_R = 0.50;             // 5 m 芯级半径
  var BOOSTER_R = 0.50;          // 侧助推 = 同直径 5 m 模块
  var BOOSTER_DIST = 1.02;       // 两侧芯沿 ±Z 并联（垂直于俯仰平面，转弯时对称）
  var ROCKET_HEIGHT = 12.30;
  var ROCKET_CENTER = 6.15;

  // ============================================================
  //  长征十号（三芯并联）+ 梦舟飞船 + 揽月着陆器
  // ============================================================
  //  科普示意构型（自上而下）：
  //    逃逸塔 → 整流罩（载人构型内装梦舟返回舱 / 服务舱；无人构型内装揽月着陆器：上升段 + 下降段 + 四腿）
  //    → 芯二级（液氧煤油；真实长征十号另有芯三级承担地月转移，此处合并示意）
  //    → 芯一级 + 两枚 5 m 助推器（均装 7 台 YF-100K，起飞共 21 台）
  //  真实登月为「双箭发射 + 环月对接」：第一枚长征十号发射揽月着陆器并驻留环月轨道，
  //  数日后第二枚发射梦舟载人飞船，二者环月交会对接后，航天员转入着陆器落月。
  //  本应用按该真实双箭架构呈现（详见 mission.js 的两段式任务时序）。
  // ============================================================
  // ---- 真实「双箭发射」构型（两枚箭共用同一套几何基准）----
  //  两次发射都是「芯二级 → 整流罩」：整流罩直径与芯级同为 5 米。
  //    第一次发射：罩内装揽月着陆器，无逃逸塔（不载人）。
  //    第二次发射：罩内装梦舟飞船（返回舱 + 服务舱），罩顶装逃逸塔（载人构型带逃逸系统）。
  //  因此飞船 / 逃逸塔 / 太阳翼的基准位置在两种构型下相同，无需再整体下移。
  //  各活动栈的质心也不写死：mission.js 在入轨 / 船箭分离时用 centroidOf() 现场求值，
  //  模型改动后自动跟随，避免常量漂移。

  function buildCZ10(renderer) {
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
        detached: false, detachT: 0, detachBaseY: 0, detachX: 0, detachPitch: 0, detachScale: 1,
        detachV: [0, 0, 0], detachSpin: [0, 0, 0], detachOff: [0, 0, 0], detachRot: [0, 0, 0],
        parked: false,
        tmp: mat4.create()
      };
      parts.push(p);
      return p;
    }

    // ---- 逃逸塔 ----（真实构型：逃逸塔坐在整流罩顶端，罩内为梦舟飞船）
    addPart({ name: 'towerTip', geom: geom.cone(0.075, 0.40, 16), color: COLORS.red, y: 11.37, centerY: 0.20,
      label: '逃逸塔', desc: '发射段应急逃逸系统：火箭一旦出现致命故障，逃逸发动机点火，把梦舟飞船迅速拽离危险区。长征十号载人构型为「逃逸塔 + 整流罩」，逃逸塔位于整流罩顶端。',
      detachGroup: 'tower', explodeOff: [0, 5.4, 0] });
    addPart({ name: 'towerNozzle', geom: geom.cylinder(0.10, 0.055, 0.10, 12), color: COLORS.nozzle, y: 11.27, centerY: 0.05, detachGroup: 'tower', explodeOff: [0, 5.4, 0] });
    addPart({ name: 'towerBody', geom: geom.cylinder(0.085, 0.10, 0.66, 16), color: COLORS.white, y: 10.61, centerY: 0.33, detachGroup: 'tower', explodeOff: [0, 5.4, 0] });
    addPart({ name: 'towerSkirt', geom: geom.cylinder(0.135, 0.085, 0.16, 16), color: COLORS.dark, y: 10.45, centerY: 0.08, detachGroup: 'tower', explodeOff: [0, 5.4, 0] });
    var escNozG = geom.cylinder(0.016, 0.040, 0.10, 8);
    var escFinG = geom.box(0.15, 0.10, 0.012);
    for (var te = 0; te < 4; te++) {
      var tea = te * Math.PI / 2 + Math.PI / 4;
      addPart({ name: 'escNoz' + te, geom: escNozG, color: COLORS.nozzle,
        y: 11.29, x: Math.cos(tea) * 0.062, z: Math.sin(tea) * 0.062, rotY: tea, rotX: 0.42, centerY: 0.05,
        detachGroup: 'tower', explodeOff: [0, 5.4, 0] });
      addPart({ name: 'escFin' + te, geom: escFinG, color: COLORS.dark,
        y: 10.43, x: Math.cos(tea) * 0.125, z: Math.sin(tea) * 0.125, rotY: tea + Math.PI / 2, centerY: 0.05,
        detachGroup: 'tower', explodeOff: [0, 5.4, 0] });
    }

    // ---- 梦舟飞船（服务舱 + 返回舱），装在整流罩内（载人构型） ----
    var capProfile = [[0.02, 0], [0.30, 0.08], [0.44, 0.24], [0.46, 0.40], [0.30, 0.52], [0.14, 0.58], [0.12, 0.61]];
    addPart({ name: 'capsule', geom: geom.lathe(capProfile, SEG), color: COLORS.capsule, y: 8.98, centerY: 0.30,
      label: '梦舟返回舱', desc: '新一代载人飞船「梦舟」的返回舱（乘员舱）：航天员往返地月的座舱，最终独自再入大气层返回地面。发射时与整船一起包在整流罩内。',
      detachGroup: 'ship', explodeOff: [0, 4.4, 0] });
    addPart({ name: 'svcModule', geom: geom.cylinder(0.46, 0.46, 0.58, SEG), color: COLORS.svc, y: 8.40, centerY: 0.29,
      label: '梦舟服务舱', desc: '为飞船提供推进、电源与环控生保支持的舱段：承担地月往返的主推进，与着陆器对接后驻留环月轨道。',
      detachGroup: 'ship', explodeOff: [0, 3.8, 0] });
    addPart({ name: 'svcRing', geom: geom.torus(0.465, 0.016, SEG, 8), color: COLORS.gold, y: 8.96, detachGroup: 'ship', explodeOff: [0, 4.1, 0] });
    // 入轨后展开的太阳翼（默认隐藏）
    for (var sp = 0; sp < 2; sp++) {
      var sgn = sp ? 1 : -1;
      addPart({ name: 'panel' + sp, geom: geom.box(2.4, 0.035, 0.52), color: COLORS.panelBlue, y: 8.64, x: sgn * 1.55, centerY: 0.02,
        detachGroup: 'panel', explodeOff: [0, 3.6, 0] });
    }

    // ---- 整流罩 + 揽月着陆器 ----
    var FAIRING_R = 0.62, FAIRING_H = 2.05, FAIRING_CYL = 1.02;
    var ogH = FAIRING_H - FAIRING_CYL;
    var ogRho = (FAIRING_R * FAIRING_R + ogH * ogH) / (2 * FAIRING_R);
    var ogOff = Math.sqrt(ogRho * ogRho - ogH * ogH);
    var fairingProfile = [];
    for (var fp = 0; fp <= 16; fp++) {
      var fy = (fp / 16) * FAIRING_H, r;
      if (fy <= FAIRING_CYL) r = FAIRING_R;
      else { var fy2 = fy - FAIRING_CYL; r = Math.sqrt(Math.max(0, ogRho * ogRho - fy2 * fy2)) - ogOff; }
      fairingProfile.push([r, fy]);
    }
    addPart({ name: 'fairingR', geom: geom.lathe(fairingProfile, SEG, -Math.PI / 2, Math.PI / 2), color: COLORS.white, y: 8.40, centerY: 1.03,
      label: '整流罩', desc: '穿越稠密大气层时保护罩内载荷（第一次发射为揽月着陆器，第二次发射为梦舟飞船）的气动外壳，飞出大气层后沿纵向对半剖开抛离。长征十号的整流罩为全新研制、直径与芯级同为 5 米；载人构型下罩顶还装有逃逸塔。',
      detachGroup: 'fairing', side: 1, cull: 'none', explodeOff: [1.7, 2.6, 0] });
    addPart({ name: 'fairingL', geom: geom.lathe(fairingProfile, SEG, Math.PI / 2, Math.PI * 1.5), color: COLORS.white, y: 8.40, centerY: 1.03,
      detachGroup: 'fairing', side: -1, cull: 'none', explodeOff: [-1.7, 2.6, 0] });
    addPart({ name: 'fairingRingR', geom: geom.torus(0.605, 0.018, SEG, 8, -Math.PI / 2, Math.PI / 2), color: COLORS.gold, y: 8.40, detachGroup: 'fairing', side: 1, explodeOff: [1.7, 2.6, 0] });
    addPart({ name: 'fairingRingL', geom: geom.torus(0.605, 0.018, SEG, 8, Math.PI / 2, Math.PI * 1.5), color: COLORS.gold, y: 8.40, detachGroup: 'fairing', side: -1, explodeOff: [-1.7, 2.6, 0] });

    // ---- 揽月着陆器（上升段 + 下降段 + 四腿），藏于整流罩内 ----
    // 下降段：八棱柱感的主承力 + 下降发动机
    addPart({ name: 'landerDescent', geom: geom.cylinder(0.48, 0.52, 0.60, 8), color: COLORS.foil, y: 8.72, centerY: 0.30,
      label: '揽月下降段', desc: '揽月着陆器下降段：装有变推力下降发动机与着陆缓冲机构，负责把着陆器从环月轨道减速、安全送至月面。',
      detachGroup: 'lander', explodeOff: [0, -1.6, 0] });
    addPart({ name: 'landerDescentTop', geom: geom.cylinder(0.50, 0.48, 0.10, 8), color: COLORS.landerDark, y: 9.32, centerY: 0.05, detachGroup: 'lander', explodeOff: [0, -1.2, 0] });
    // 下降发动机喷管（朝下，动力下降时反推制动）
    addPart({ name: 'landerNozzle', geom: geom.cylinder(0.12, 0.24, 0.22, 20), color: COLORS.nozzle, y: 8.56, centerY: 0.11,
      label: '下降发动机', desc: '变推力下降发动机：动力下降段持续反推制动，把着陆速度降到近乎为零，实现月面软着陆。',
      detachGroup: 'lander', explodeOff: [0, -2.2, 0] });
    // 上升段：乘员舱 + 顶部对接/天线
    addPart({ name: 'landerAscent', geom: geom.cylinder(0.44, 0.46, 0.52, 16), color: COLORS.landerBody, y: 9.42, centerY: 0.26,
      label: '揽月上升段', desc: '着陆器上升段：两名航天员进入月面作业后，乘上升段从月面起飞，回到环月轨道与梦舟飞船对接。',
      detachGroup: 'lander', explodeOff: [0, 1.4, 0] });
    addPart({ name: 'landerCabin', geom: geom.lathe([[0.02, 0], [0.30, 0.06], [0.42, 0.18], [0.44, 0.30], [0.26, 0.40], [0.16, 0.44]], 16), color: COLORS.landerBody, y: 9.94, centerY: 0.22,
      detachGroup: 'lander', explodeOff: [0, 1.9, 0] });
    addPart({ name: 'landerDock', geom: geom.cylinder(0.10, 0.12, 0.12, 12), color: COLORS.landerDark, y: 10.36, centerY: 0.06, detachGroup: 'lander', explodeOff: [0, 2.2, 0] });
    // 着陆器舷窗 / 国旗标识
    addPart({ name: 'landerFlag', geom: geom.arcPatch(0.475, 0.20, -0.28, 0.28, 12), color: COLORS.flagRed, y: 9.46, centerY: 0.10, detachGroup: 'lander', explodeOff: [0, 1.4, 0] });
    // 四条着陆腿：hip 在下降段四角，飞行中向上收拢（收于整流罩内），着陆前向下展开撑地
    var legG = geom.box(0.055, 0.90, 0.055);
    for (var li = 0; li < 4; li++) {
      var la = li * Math.PI / 2 + Math.PI / 4;
      addPart({ name: 'leg' + li, geom: legG, color: COLORS.landerDark,
        y: 7.88, x: Math.cos(la) * 0.44, z: Math.sin(la) * 0.44, rotY: -la - Math.PI / 2, rotX: 2.9, centerY: 0.90,
        detachGroup: 'lander', explodeOff: [0, -1.6, 0] });
    }

    // ---- 芯二级（液氧煤油，真实构型安装 2 台 YF-100M）----
    addPart({ name: 'upper', geom: geom.cylinder(CORE_R, CORE_R, 1.90, SEG), color: COLORS.white, y: 6.50, centerY: 0.95,
      label: '芯二级', desc: '长征十号芯二级：5 米直径液氧煤油级（真实构型 2 台 YF-100M，真空推力 146 吨级），负责把着陆器 / 飞船加速到入轨速度。注：真实长征十号为三级半构型，地月转移由芯三级完成，本应用把芯二级 / 芯三级合并为一个上面级示意。',
      detachGroup: 'stage2', explodeOff: [0, 1.4, 0] });
    addPart({ name: 'upperStripe', geom: geom.torus(0.505, 0.014, SEG, 8), color: COLORS.gold, y: 6.72, detachGroup: 'stage2', explodeOff: [0, 1.4, 0] });
    var nozS2G = geom.cylinder(0.09, 0.20, 0.24, 16);
    for (var sn = 0; sn < 2; sn++) {
      addPart({ name: 'nozS2_' + sn, geom: nozS2G, color: COLORS.nozzle, y: 6.28, x: (sn ? 1 : -1) * 0.20, centerY: 0.12,
        label: sn === 0 ? '芯二级发动机' : '',
        desc: sn === 0 ? '芯二级 2 台 YF-100M 液氧煤油发动机（真空推力 146 吨级）：一二级分离后点火，把组合体加速到入轨速度。真实长征十号的地月转移由芯三级完成。' : '',
        detachGroup: 'stage2', explodeOff: [0, 0.9, 0] });
    }

    // ---- 级间段 ----
    addPart({ name: 'inter', geom: geom.cylinder(0.47, CORE_R, 0.22, SEG), color: COLORS.dark, y: 6.28, centerY: 0.11,
      label: '级间段', desc: '连接芯一级与芯二级的过渡段：级间分离时在此断开，芯二级发动机随即点火。',
      detachGroup: 'stage1', explodeOff: [0, 0.2, 0] });

    // ---- 芯一级 ----
    addPart({ name: 'lower', geom: geom.cylinder(CORE_R, CORE_R, 5.85, SEG), color: COLORS.white, y: 0.45, centerY: 2.925,
      label: '芯一级', desc: '5 米直径芯一级：全箭主推进模块，装 7 台 YF-100K 液氧煤油发动机；与两枚同样装 7 台发动机的助推器并联（起飞共 21 台、约 2678 吨推力）。',
      detachGroup: 'stage1', explodeOff: [0, -2.8, 0] });
    addPart({ name: 'lowerStripe1', geom: geom.cylinder(0.505, 0.505, 0.14, SEG), color: COLORS.stripe, y: 5.10, detachGroup: 'stage1', explodeOff: [0, -2.4, 0] });
    addPart({ name: 'lowerStripe2', geom: geom.cylinder(0.505, 0.505, 0.14, SEG), color: COLORS.stripe, y: 1.30, detachGroup: 'stage1', explodeOff: [0, -3.0, 0] });
    addPart({ name: 'badgeRed', geom: geom.torus(0.512, 0.016, SEG, 8), color: COLORS.red, y: 3.60, detachGroup: 'stage1', explodeOff: [0, -2.8, 0] });
    // 箭体标识：红旗贴在芯一级 +X 面
    var FLAG_R = 0.515, FLAG_W = 0.46, FLAG_H = 0.30, FLAG_Y = 4.20;
    var flagSpan = FLAG_W / FLAG_R;
    addPart({ name: 'flagCN', geom: geom.arcPatch(FLAG_R, FLAG_H, -flagSpan / 2, flagSpan / 2, 16), color: COLORS.red,
      y: FLAG_Y, centerY: FLAG_H / 2, detachGroup: 'stage1', explodeOff: [0, -2.8, 0] });
    addPart({ name: 'pipeLine', geom: geom.box(0.07, 4.6, 0.06), color: COLORS.silver, y: 0.66, x: -0.53, rotY: Math.PI / 2, centerY: 2.3,
      detachGroup: 'stage1', explodeOff: [-1.2, -2.8, 0] });

    // ---- 尾翼（对角四片）----
    var finG = geom.fin(0.30, 1.40, 0.60, 0.18, 0.045);
    for (var fi = 0; fi < 4; fi++) {
      addPart({ name: 'fin' + fi, geom: finG, color: COLORS.dark, y: 0.60, rotY: fi * Math.PI / 2 + Math.PI / 4, centerY: 0.85,
        label: fi === 0 ? '尾翼' : '', desc: fi === 0 ? '气动稳定翼面：在大气层内飞行时保持箭体姿态稳定。' : '',
        detachGroup: 'stage1', explodeOff: [0, -3.0, 0] });
    }

    // ---- 芯一级发动机群：7 台 YF-100K 液氧煤油发动机（1 台居中 + 6 台环绕）----
    // 真实构型：芯一级 7 台、两个助推器各 7 台 —— 起飞共 21 台、约 2678 吨推力
    var nozCoreG = geom.cylinder(0.075, 0.135, 0.26, 16);
    addPart({ name: 'nozCore0', geom: nozCoreG, color: COLORS.nozzle, y: 0.18, centerY: 0.13,
      label: '芯一级发动机', desc: '芯一级 7 台 130 吨级 YF-100K 液氧煤油发动机（1 台居中、6 台环绕）；与两枚助推器各自的 7 台一起，起飞时共 21 台。',
      detachGroup: 'stage1', explodeOff: [0, -3.8, 0] });
    for (var vn = 0; vn < 6; vn++) {
      var va = vn * Math.PI / 3, vrad = 0.27;
      addPart({ name: 'nozCore' + (vn + 1), geom: nozCoreG, color: COLORS.nozzle,
        y: 0.18, x: Math.cos(va) * vrad, z: Math.sin(va) * vrad, centerY: 0.13,
        detachGroup: 'stage1', explodeOff: [0, -3.8, 0] });
    }

    // ---- 两枚 5 m 助推器（通用芯级模块，沿 ±Z 并联）----
    var boostBodyG = geom.cylinder(BOOSTER_R, BOOSTER_R, 5.20, SEG);
    var boostConeG = geom.cone(BOOSTER_R, 0.62, SEG);
    var boostNozG = geom.cylinder(0.075, 0.135, 0.26, 16);
    var boostRingG = geom.torus(BOOSTER_R + 0.01, 0.016, SEG, 8);
    for (var bi = 0; bi < 2; bi++) {
      var ba = bi * Math.PI + Math.PI / 2;   // +Z 与 -Z
      var bx = Math.cos(ba) * BOOSTER_DIST, bz = Math.sin(ba) * BOOSTER_DIST;
      addPart({ name: 'boostCone' + bi, geom: boostConeG, color: COLORS.silver, y: 5.65, x: bx, z: bz, centerY: 0.31,
        detachGroup: 'booster', explodeOff: [0, 1.2, 0] });
      addPart({ name: 'boostBody' + bi, geom: boostBodyG, color: COLORS.boostWhite, y: 0.45, x: bx, z: bz, centerY: 2.60,
        label: bi === 0 ? '助推器' : '', desc: bi === 0 ? '两枚 5 米直径助推器（通用芯级模块）与芯一级并联，各装 7 台 YF-100K：提供起飞阶段的主要附加推力，推进剂耗尽后先行分离。' : '',
        detachGroup: 'booster', explodeOff: [0, -2.4, 0] });
      addPart({ name: 'boostRing' + bi, geom: boostRingG, color: COLORS.red, y: 5.58, x: bx, z: bz, detachGroup: 'booster', explodeOff: [0, 1.1, 0] });
      // 每个助推器 7 台 YF-100K（1 台居中 + 6 台环绕），与芯一级的 7 台构成起飞 21 台
      for (var bn = 0; bn < 7; bn++) {
        var bna = (bn - 1) * Math.PI / 3, bnr = bn === 0 ? 0 : 0.27;
        addPart({ name: 'boostNoz' + bi + '_' + bn, geom: boostNozG, color: COLORS.nozzle,
          y: 0.19, x: bx + Math.cos(bna) * bnr, z: bz + Math.sin(bna) * bnr, centerY: 0.13,
          detachGroup: 'booster', explodeOff: [0, -3.1, 0] });
      }
    }

    return {
      parts: parts, height: ROCKET_HEIGHT, center: ROCKET_CENTER,
      coreR: CORE_R, boosterDist: BOOSTER_DIST, boosterR: BOOSTER_R
    };
  }

  // ============================================================
  //  发射场 + 地球 + 大气 + 云层 + 月球
  // ============================================================
  function buildPad(renderer) {
    var pad = {};

    // ---- 地球 ----
    pad.earth = renderer.createMesh(geom.sphere(EARTH_R, 168, 104), [1, 1, 1], { group: 'earth', isEarth: true });
    pad.earth.atmo = 0.18;
    mat4.identity(pad.earth.modelMatrix);
    mat4.translate(pad.earth.modelMatrix, pad.earth.modelMatrix, EARTH_CENTER);
    pad.earthSpin = 0;

    // ---- 云层壳 ----
    pad.clouds = renderer.createMesh(geom.sphere(EARTH_R * 1.012, 128, 80), [0.95, 0.96, 0.98],
      { group: 'earth', isCloud: true, depthWrite: false, fill: 0 });
    pad.clouds.alpha = 0.62;
    mat4.identity(pad.clouds.modelMatrix);
    mat4.translate(pad.clouds.modelMatrix, pad.clouds.modelMatrix, EARTH_CENTER);
    var cloudTex = renderer.createTexture('assets/clouds.png', function (ok) {
      if (ok && pad.clouds) pad.clouds.texture = cloudTex;
    }, (typeof global.CLOUDS_TEXTURE_URI === 'string') ? global.CLOUDS_TEXTURE_URI : undefined);

    // ---- 大气辉光壳 ----
    pad.atmo = renderer.createMesh(geom.sphere(EARTH_R * ATMO_SCALE, 192, 112), COLORS.sky, { group: 'earth', blend: 'add', cull: 'front', atmoShader: true });
    pad.atmo.atmoInner = 1 / ATMO_SCALE;
    pad.atmo.atmoStrength = 1.25;
    mat4.identity(pad.atmo.modelMatrix);
    mat4.translate(pad.atmo.modelMatrix, pad.atmo.modelMatrix, EARTH_CENTER);

    // ---- 月球 ----（初始隐藏，转移段淡入）
    pad.moon = renderer.createMesh(geom.sphere(MOON_R, 128, 80), [1, 1, 1], { group: 'moon', fill: 0.10 });
    // 定向：rotateX(-90°) 把月球极轴转到世界 -Z（XY 转移面即月球赤道面），
    // rotateZ(spin) 让等距圆柱贴图近地面中心（u=0.5）正对地球。
    var mDirX = EARTH_CENTER[0] - MOON_CENTER[0], mDirY = EARTH_CENTER[1] - MOON_CENTER[1];
    var moonSpin = Math.atan2(mDirY, mDirX) - Math.PI;
    mat4.identity(pad.moon.modelMatrix);
    mat4.translate(pad.moon.modelMatrix, pad.moon.modelMatrix, MOON_CENTER);
    mat4.rotateZ(pad.moon.modelMatrix, pad.moon.modelMatrix, moonSpin);
    mat4.rotateX(pad.moon.modelMatrix, pad.moon.modelMatrix, -Math.PI / 2);
    pad.moon.visible = false; pad.moon.alpha = 1;
    var moonTex = renderer.createTexture('assets/moon.jpg', function (ok) {
      if (ok && pad.moon) pad.moon.texture = moonTex;
    }, (typeof global.MOON_TEXTURE_URI === 'string') ? global.MOON_TEXTURE_URI : undefined);

    // ---- 场坪（发射场尺寸随更宽更高的箭体放大）----
    pad.apron = renderer.createMesh(geom.box(14.4, 0.12, 14.4), COLORS.slab, { group: 'pad' });
    mat4.identity(pad.apron.modelMatrix);
    mat4.translate(pad.apron.modelMatrix, pad.apron.modelMatrix, [0, -0.06, 0]);
    pad.apronBase = renderer.createMesh(geom.box(15.2, 0.10, 15.2), COLORS.concrete, { group: 'pad' });
    mat4.identity(pad.apronBase.modelMatrix);
    mat4.translate(pad.apronBase.modelMatrix, pad.apronBase.modelMatrix, [0, -0.07, 0]);
    pad.apronMark = renderer.createMesh(geom.ring(2.4, 2.52, 48), COLORS.gold, { group: 'pad' });
    mat4.identity(pad.apronMark.modelMatrix);
    mat4.translate(pad.apronMark.modelMatrix, pad.apronMark.modelMatrix, [0, 0.065, 0]);

    pad.platform = renderer.createMesh(geom.cylinder(1.55, 1.80, 0.16, 32), COLORS.padSteel, { group: 'pad' });
    pad.ductRing = renderer.createMesh(geom.ring(0.52, 1.15, 32), COLORS.duct, { group: 'pad' });
    pad.ductRing.modelMatrix[13] = 0.165;
    pad.ember = renderer.createMesh(geom.disk(0.52, 24), COLORS.ember, { group: 'pad' });
    pad.ember.modelMatrix[13] = 0.17;
    pad.ember.glow = 0;

    pad.deflector = renderer.createMesh(geom.box(3.2, 0.60, 0.55), COLORS.concrete, { group: 'pad' });
    mat4.identity(pad.deflector.modelMatrix);
    mat4.translate(pad.deflector.modelMatrix, pad.deflector.modelMatrix, [0, 0, -2.6]);

    // ---- 勤务塔（射向反侧）----
    var towerX = -2.9, towerZ = -0.4;
    pad.towerBase = renderer.createMesh(geom.box(1.0, 0.32, 1.0), COLORS.concrete, { group: 'pad' });
    mat4.identity(pad.towerBase.modelMatrix);
    mat4.translate(pad.towerBase.modelMatrix, pad.towerBase.modelMatrix, [towerX, 0, towerZ]);
    var railG = geom.box(0.10, 11.6, 0.10);
    var railPos = [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]];
    pad.towerRails = [];
    for (var ri = 0; ri < 4; ri++) {
      var rail = renderer.createMesh(railG, COLORS.tower, { group: 'pad' });
      mat4.identity(rail.modelMatrix);
      mat4.translate(rail.modelMatrix, rail.modelMatrix, [towerX + railPos[ri][0] - 0.05, 0.3, towerZ + railPos[ri][1] - 0.05]);
      pad.towerRails.push(rail);
    }
    pad.towerBeams = [];
    var beamG = geom.box(0.94, 0.07, 0.94);
    for (var by = 1.5; by <= 11.4; by += 1.65) {
      var beam = renderer.createMesh(beamG, COLORS.tower, { group: 'pad' });
      mat4.identity(beam.modelMatrix);
      mat4.translate(beam.modelMatrix, beam.modelMatrix, [towerX, by, towerZ]);
      pad.towerBeams.push(beam);
    }
    pad.towerTop = renderer.createMesh(geom.box(0.55, 0.8, 0.55), COLORS.dark, { group: 'pad' });
    mat4.identity(pad.towerTop.modelMatrix);
    mat4.translate(pad.towerTop.modelMatrix, pad.towerTop.modelMatrix, [towerX, 11.9, towerZ]);
    pad.towerAntenna = renderer.createMesh(geom.cylinder(0.015, 0.015, 1.2, 8), COLORS.red, { group: 'pad' });
    mat4.identity(pad.towerAntenna.modelMatrix);
    mat4.translate(pad.towerAntenna.modelMatrix, pad.towerAntenna.modelMatrix, [towerX, 12.7, towerZ]);

    // ---- 回转平台摆臂 ----
    pad.arms = [];
    var armG = geom.box(2.4, 0.09, 0.26);
    var armHeights = [4.4, 6.9, 9.4];
    for (var ai = 0; ai < armHeights.length; ai++) {
      var arm = renderer.createMesh(armG, COLORS.tower, { group: 'pad' });
      mat4.identity(arm.modelMatrix);
      mat4.translate(arm.modelMatrix, arm.modelMatrix, [towerX + 0.47 + 1.2, armHeights[ai], towerZ - 0.13]);
      pad.arms.push(arm);
    }
    pad.armYs = armHeights;
    pad.armSwing = 0;

    // ---- 支撑腿 ----
    pad.legs = [];
    var legG = geom.box(0.15, 0.62, 0.15);
    for (var lj = 0; lj < 6; lj++) {
      var lja = (lj / 6) * Math.PI * 2 + Math.PI / 6;
      var leg = renderer.createMesh(legG, COLORS.padSteel, { group: 'pad' });
      mat4.identity(leg.modelMatrix);
      mat4.translate(leg.modelMatrix, leg.modelMatrix, [Math.cos(lja) * 1.35 - 0.075, 0, Math.sin(lja) * 1.35 - 0.075]);
      pad.legs.push(leg);
    }

    // ---- 场坪四角避雷塔 ----
    pad.lightning = [];
    var ltG = geom.cylinder(0.05, 0.08, 13.4, 8);
    var ltTipG = geom.sphere(0.12, 10, 6);
    var ltPos = [[6.3, 6.3], [-6.3, 6.3], [-6.3, -6.3], [6.3, -6.3]];
    for (var lt = 0; lt < 4; lt++) {
      var ltM = renderer.createMesh(ltG, COLORS.tower, { group: 'pad' });
      mat4.identity(ltM.modelMatrix);
      mat4.translate(ltM.modelMatrix, ltM.modelMatrix, [ltPos[lt][0], 0, ltPos[lt][1]]);
      var ltT = renderer.createMesh(ltTipG, COLORS.red, { group: 'pad' });
      mat4.identity(ltT.modelMatrix);
      mat4.translate(ltT.modelMatrix, ltT.modelMatrix, [ltPos[lt][0], 13.45, ltPos[lt][1]]);
      pad.lightning.push(ltM, ltT);
    }

    pad.parts = [pad.apron, pad.apronBase, pad.apronMark, pad.platform, pad.ductRing, pad.ember, pad.deflector, pad.towerBase, pad.towerTop, pad.towerAntenna]
      .concat(pad.towerRails, pad.towerBeams, pad.arms, pad.legs, pad.lightning);
    pad.all = pad.parts;
    pad.towerX = towerX; pad.towerZ = towerZ;
    return pad;
  }

  // ---- 地球自转 ----
  var AXIS_TILT = 50 * Math.PI / 180;
  var SPIN0 = -100 * Math.PI / 180;
  var SPIN_RATE = 0.06;
  function spinEarth(pad, dt, rate) {
    if (!pad.earth) return;
    pad.earthSpin += dt * SPIN_RATE * (rate || 0);
    var m = pad.earth.modelMatrix;
    mat4.identity(m);
    mat4.translate(m, m, EARTH_CENTER);
    mat4.rotateY(m, m, Math.PI / 2);
    mat4.rotateZ(m, m, -AXIS_TILT);
    mat4.rotateY(m, m, SPIN0 + pad.earthSpin);
    if (pad.clouds) {
      var cm = pad.clouds.modelMatrix;
      mat4.identity(cm);
      mat4.translate(cm, cm, EARTH_CENTER);
      mat4.rotateY(cm, cm, Math.PI / 2);
      mat4.rotateZ(cm, cm, -AXIS_TILT);
      mat4.rotateY(cm, cm, SPIN0 + pad.earthSpin * 1.12);
    }
  }

  function setArmSwing(pad, k) {
    if (!pad.arms) return;
    pad.armSwing = k;
    var ang = k * 1.95;
    var px = pad.towerX + 0.47, pz = pad.towerZ - 0.13;
    for (var i = 0; i < pad.arms.length; i++) {
      var m = pad.arms[i].modelMatrix;
      mat4.identity(m);
      mat4.translate(m, m, [px, 0, pz]);
      mat4.rotateY(m, m, ang);
      mat4.translate(m, m, [1.2, pad.armYs[i], 0]);
    }
  }

  // env: { rotY, explode, launchY, launchX, tilt, launchT, scale, fade }
  function updatePartTransforms(parts, env) {
    var g = env.rotY, radScale = 1 + env.explode * 1.7;
    var tilt = env.tilt || 0, launchX = env.launchX || 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      // 已「驻留」的部件（第一次发射后就位环月轨道的着陆器）由 mission 每帧直接写矩阵，此处跳过
      if (p.parked) continue;
      var detached = p.detached;
      // 分离体冻结在分离时刻的显示倍数，避免主体后续放大/缩小时分离体跟着形变
      var s = detached ? (p.detachScale || 1) : (env.scale || 1);
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
        // detachFade === false 的分离体（如按方案要驻留环月轨道的梦舟）保持完整可见，不淡出
        if (p.detachFade === false) {
          p.mesh.alpha = 1;
        } else {
          var since = env.launchT - p.detachT;
          var fadeRate = env.fade || 0.28;
          p.mesh.alpha = Math.max(0, 1 - Math.max(0, since - 3) * fadeRate);
          if (p.mesh.alpha <= 0) p.mesh.visible = false;
        }
      }
    }
  }

  function updateDetached(parts, dt, mu, cx, cy, cz, aVehX, aVehY, aVehZ) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.detached || p.parked) continue;
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
  M3D.MOON = {
    R: MOON_R, center: MOON_CENTER, dist: MOON_DIST, th: MOON_TH, orbitR: MOON_ORBIT_R,
    kmPerUnit: KM_PER_UNIT
  };
  M3D.buildCZ10 = buildCZ10;
  M3D.buildPad = buildPad;
  M3D.spinEarth = spinEarth;
  M3D.setArmSwing = setArmSwing;
  M3D.updatePartTransforms = updatePartTransforms;
  M3D.updateDetached = updateDetached;
  M3D.COLORS = COLORS;
})(typeof window !== 'undefined' ? window : this);
