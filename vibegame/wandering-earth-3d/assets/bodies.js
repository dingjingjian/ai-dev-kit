/**
 * 太阳系（游戏版）：尺度常量、行星定义、天体网格装配。
 *
 * 本文件是**尺度与行星参数（半径 / 轨道 / 引力 / 影响球）的唯一真源**。
 * 游戏不做真实比例——真实尺度下地球在屏幕上小到不可见，因此：
 *   · 天体半径一律视觉放大（太阳、地球、行星都比真实大得多）；
 *   · 行星引力（gm）与影响球半径（capR）放大到"擦边就可能被抓住"的量级，
 *     这是玩法核心：高速掠过 = 引力弹弓，速度不够 = 被吸走。
 * 所有夸张项在 README 如实标注，遥测里的距离按 1 AU = 100 单位换算回真值。
 */
(function (global) {
  'use strict';
  var M3D = global.M3D;
  var mat4 = M3D.mat4, geom = M3D.geom;

  // ============================================================
  //  尺度（唯一真源）
  // ============================================================
  var AU = 100;                  // 1 天文单位 = 100 游戏单位
  var SUN_R = 10;                // 太阳半径（视觉放大）
  var EARTH_R = 3.4;             // 地球半径（视觉放大）
  var AXIS_TILT = 23.4 * Math.PI / 180;
  var ATMO_SCALE = 1.06;
  var G_SUN = 11000;             // 太阳 GM：使 1 AU 处圆轨道速度 = 10.49 单位/秒
  var V_CIRC = Math.sqrt(G_SUN / AU);   // ≈ 10.49

  // 胜利线：飞出这个半径即脱离太阳系
  var ESCAPE_R = 2000;
  var PROXIMA_POS = [2400, 0, 0];

  // 行星：rad 半径 / orbitR 轨道半径 / gm 引力 / capR 影响球（进入且速度不足即被捕获）/ spin 自转
  // gm 的取值原则：既要让"低速掠过 = 被吸走"，又不能强到干扰地球在 1 AU 的正常公转
  // （内行星若 gm 过大，会在近距交会时把地球轨道拽偏，甚至一开局就坠日）。
  // 木星 / 土星 gm 显著放大：它们是逃逸路上的主要威胁，也是引力弹弓的机会。
  var PLANETS = [
    { key: 'mercury', name: '水星', rad: 2.0, orbitR: 0.39 * AU, gm: 3, capR: 18, spin: 0.35, tex: 'MERCURY_TEXTURE_URI', color: [0.72, 0.68, 0.62] },
    { key: 'venus', name: '金星', rad: 3.2, orbitR: 0.72 * AU, gm: 8, capR: 26, spin: 0.20, tex: 'VENUS_TEXTURE_URI', color: [0.92, 0.84, 0.62] },
    { key: 'mars', name: '火星', rad: 2.4, orbitR: 1.52 * AU, gm: 5, capR: 22, spin: 0.30, tex: 'MARS_TEXTURE_URI', color: [0.80, 0.48, 0.34] },
    { key: 'jupiter', name: '木星', rad: 9.0, orbitR: 5.20 * AU, gm: 500, capR: 45, spin: 0.55, tex: 'JUPITER_TEXTURE_URI', color: [0.86, 0.76, 0.62] },
    { key: 'saturn', name: '土星', rad: 7.6, orbitR: 9.54 * AU, gm: 380, capR: 40, spin: 0.45, tex: 'SATURN_TEXTURE_URI', color: [0.88, 0.82, 0.66], ring: true }
  ];

  // 玩家推力：加速度上限与燃料预算（燃料以"可提供的总速度增量"计，单位 单位/秒）
  var THRUST_ACC = 3.6;
  var FUEL_DV = 19.0;
  var FUEL_BURN = 3.4;           // 每秒燃料消耗（速度增量单位）

  var COLORS = {
    sky: [0.25, 0.48, 0.95],
    sunCore: [1.0, 0.80, 0.40],
    sunGlow: [1.0, 0.62, 0.22],
    orbit: [0.42, 0.62, 0.92],
    orbitEarth: [0.45, 0.85, 1.0],
    proxima: [1.0, 0.72, 0.38],
    thrust: [0.45, 0.88, 1.0]
  };

  // ============================================================
  //  太阳：程序化贴图（代码生成，不占包体）+ 加色光晕壳
  // ============================================================
  function makeSunTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#ffb43c';
    g.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 900; i++) {
      var a = 0.05 + Math.random() * 0.16;
      g.beginPath();
      g.fillStyle = Math.random() > 0.45 ? 'rgba(255,238,190,' + a + ')' : 'rgba(224,96,20,' + a + ')';
      g.arc(Math.random() * 512, Math.random() * 256, 6 + Math.random() * 26, 0, Math.PI * 2);
      g.fill();
    }
    for (var j = 0; j < 2400; j++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,246,214,0.30)' : 'rgba(210,80,14,0.24)';
      g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }
    return c.toDataURL('image/jpeg', 0.9);
  }

  function buildSun(renderer) {
    var sun = {};
    sun.core = renderer.createMesh(geom.sphere(SUN_R, 72, 48), [1, 1, 1], { group: 'sun', fill: 0, glow: 1, useSun: false });
    sun.glow = renderer.createMesh(geom.sphere(SUN_R * 1.20, 56, 36), COLORS.sunGlow,
      { group: 'sun', fill: 0, glow: 1, blend: 'add', cull: 'front', depthWrite: false });
    sun.halo = renderer.createMesh(geom.sphere(SUN_R * 1.62, 44, 28), [1.0, 0.42, 0.12],
      { group: 'sun', fill: 0, glow: 1, alpha: 0.26, blend: 'add', cull: 'front', depthWrite: false });
    var tex = renderer.createTexture('assets/sun.jpg', function (ok) { if (ok) sun.core.texture = tex; }, makeSunTexture());
    sun.all = [sun.core, sun.glow, sun.halo];
    sun.radius = SUN_R;
    return sun;
  }

  // ============================================================
  //  地球：贴图球 + 云壳 + 加色大气壳（玩家本体）
  // ============================================================
  function buildEarth(renderer) {
    var ev = {};
    ev.body = renderer.createMesh(geom.sphere(EARTH_R, 96, 64), [1, 1, 1], { group: 'earth', isEarth: true, useSun: false, atmo: 0.18 });
    ev.clouds = renderer.createMesh(geom.sphere(EARTH_R * 1.014, 72, 48), [0.95, 0.96, 0.98],
      { group: 'earth', isCloud: true, depthWrite: false, fill: 0, useSun: false });
    ev.clouds.alpha = 0.6;
    ev.atmo = renderer.createMesh(geom.sphere(EARTH_R * ATMO_SCALE, 96, 60), COLORS.sky,
      { group: 'earth', blend: 'add', cull: 'front', atmoShader: true, useSun: false });
    ev.atmo.atmoInner = 1 / ATMO_SCALE;
    ev.atmo.atmoStrength = 1.1;

    var bodyTex = renderer.createTexture('assets/earth.jpg', function (ok) { if (ok) ev.body.texture = bodyTex; },
      (typeof global.EARTH_TEXTURE_URI === 'string') ? global.EARTH_TEXTURE_URI : undefined);
    var cloudTex = renderer.createTexture('assets/clouds.png', function (ok) { if (ok) ev.clouds.texture = cloudTex; },
      (typeof global.CLOUDS_TEXTURE_URI === 'string') ? global.CLOUDS_TEXTURE_URI : undefined);

    ev.spin = 0;
    ev.radius = EARTH_R;
    ev.all = [ev.body, ev.clouds, ev.atmo];
    return ev;
  }

  // 把局部 +Y 转到方向 n（推力尾焰等"定向器械"用）
  function orientUp(m, n) {
    var ux = n[0], uy = n[1], uz = n[2];
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    var rx = 0, ry = 0, rz = 0;
    if (Math.abs(uy) < 0.9) { ry = 1; } else { rx = 1; }
    var xx = ry * uz - rz * uy, xy = rz * ux - rx * uz, xz = rx * uy - ry * ux;
    var xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var zx = uy * xz - uz * xy, zy = uz * xx - ux * xz, zz = ux * xy - uy * xx;
    mat4.identity(m);
    m[0] = xx; m[1] = xy; m[2] = xz; m[3] = 0;
    m[4] = ux; m[5] = uy; m[6] = uz; m[7] = 0;
    m[8] = zx; m[9] = zy; m[10] = zz; m[11] = 0;
    return m;
  }

  // 把球体摆到 pos 并绕自身轴自转（地球 / 行星共用）
  function placeSphere(m, pos, spin, tilt) {
    mat4.identity(m);
    mat4.translate(m, m, pos);
    if (tilt) mat4.rotateZ(m, m, tilt);
    mat4.rotateY(m, m, spin);
  }

  function placeEarth(ev, pos, spin) {
    placeSphere(ev.body.modelMatrix, pos, spin, -AXIS_TILT);
    placeSphere(ev.clouds.modelMatrix, pos, spin * 1.12, -AXIS_TILT);
    placeSphere(ev.atmo.modelMatrix, pos, spin * 1.03, -AXIS_TILT);
  }

  // ============================================================
  //  行星（含土星环）与轨道圈
  // ============================================================
  function buildPlanets(renderer) {
    var list = [];
    for (var i = 0; i < PLANETS.length; i++) {
      var def = PLANETS[i];
      var mesh = renderer.createMesh(geom.sphere(def.rad, def.key === 'jupiter' || def.key === 'saturn' ? 96 : 64, 48),
        def.color, { group: 'planet', fill: 0.05, useSun: false });
      var uri = global[def.tex];
      var tex = renderer.createTexture('assets/' + def.key + '.jpg',
        (function (mm) { return function (ok) { if (ok) mm.texture = tex; }; })(mesh),
        (typeof uri === 'string') ? uri : undefined);
      mesh.spin = 0;
      var ring = null;
      if (def.ring) {
        ring = renderer.createMesh(geom.ring(def.rad * 1.4, def.rad * 2.2, 72), [0.82, 0.76, 0.62],
          { group: 'planet', alpha: 0.62, depthWrite: false, cull: 'none', fill: 0 });
      }
      list.push({ def: def, mesh: mesh, ring: ring, angle: 0, pos: [0, 0, 0] });
    }
    return list;
  }

  function buildOrbits(renderer) {
    var orbits = [];
    for (var i = 0; i < PLANETS.length; i++) {
      var def = PLANETS[i];
      var isEarth = false;
      var m = renderer.createMesh(geom.ring(def.orbitR - 0.22, def.orbitR + 0.22, 200),
        isEarth ? COLORS.orbitEarth : COLORS.orbit,
        { group: 'orbit', blend: 'add', depthWrite: false, cull: 'none', fill: 0, alpha: 0.30 });
      orbits.push(m);
    }
    return orbits;
  }

  // 玩家自己的轨道圈（高亮显示，帮助判断是否还在原轨道）
  function buildEarthOrbit(renderer) {
    return renderer.createMesh(geom.ring(AU - 0.28, AU + 0.28, 240), COLORS.orbitEarth,
      { group: 'orbit', blend: 'add', depthWrite: false, cull: 'none', fill: 0, alpha: 0.5 });
  }

  function buildProxima(renderer) {
    var p = renderer.createMesh(geom.sphere(10, 32, 20), COLORS.proxima, { group: 'proxima', fill: 0, glow: 1, useSun: false });
    mat4.identity(p.modelMatrix);
    mat4.translate(p.modelMatrix, p.modelMatrix, PROXIMA_POS);
    var glow = renderer.createMesh(geom.sphere(22, 32, 20), COLORS.proxima,
      { group: 'proxima', fill: 0, glow: 1, blend: 'add', cull: 'front', depthWrite: false, alpha: 0.5 });
    mat4.identity(glow.modelMatrix);
    mat4.translate(glow.modelMatrix, glow.modelMatrix, PROXIMA_POS);
    return { core: p, glow: glow, pos: PROXIMA_POS };
  }

  // 推力尾焰（加色锥体，朝推力反方向喷出）
  function buildThruster(renderer) {
    var f = renderer.createMesh(geom.cylinder(0.12 * EARTH_R, 0.62 * EARTH_R, EARTH_R * 2.6, 16), COLORS.thrust,
      { group: 'fx', blend: 'add', glow: 1, depthWrite: false, cull: 'none', fill: 0 });
    f.visible = false;
    f.alpha = 0.85;
    return f;
  }

  // ============================================================
  //  月球（开场剧情用，程序化贴图，零资源文件）
  // ============================================================
  function makeMoonTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#8c8c92'; g.fillRect(0, 0, 512, 256);
    // 月海：偏暗的灰斑
    for (var i = 0; i < 11; i++) {
      g.fillStyle = 'rgba(64,64,72,' + (0.22 + Math.random() * 0.26) + ')';
      g.beginPath();
      g.ellipse(Math.random() * 512, Math.random() * 256, 26 + Math.random() * 62, 22 + Math.random() * 42, Math.random() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    // 环形山：亮心 + 暗缘
    for (var j = 0; j < 280; j++) {
      var x = Math.random() * 512, y = Math.random() * 256, r = 2 + Math.random() * 9;
      g.fillStyle = 'rgba(150,150,156,0.45)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(40,40,46,0.42)'; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    // 细微亮粒
    for (var k = 0; k < 1300; k++) {
      g.fillStyle = 'rgba(224,224,228,' + (0.04 + Math.random() * 0.12) + ')';
      g.fillRect(Math.random() * 512, Math.random() * 256, 1, 1);
    }
    return c.toDataURL('image/jpeg', 0.85);
  }

  function buildMoon(renderer) {
    var moon = renderer.createMesh(geom.sphere(2.2, 48, 32), [0.8, 0.8, 0.82],
      { group: 'planet', fill: 0.04, useSun: false });
    var tex = renderer.createTexture('assets/moon.jpg', function (ok) { if (ok) moon.texture = tex; }, makeMoonTexture());
    moon.visible = false;
    moon.radius = 2.2;
    return moon;
  }

  // ============================================================
  //  行星发动机阵列：地球表面的加色光柱
  // ============================================================
  // 一万二千台发动机显然不可能逐个建出来，这里用斐波那契球面均匀撒 N 个光柱代表：
  // 数量足够形成"整颗星球被光柱包裹"的观感，代价只是 N 个小圆柱（8 段）。
  // 光柱挂在地球的局部坐标系下（父矩阵 = 地球 modelMatrix），因此随地球自转一起转。
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  function buildEngines(renderer, count) {
    var list = [];
    var h = EARTH_R * 0.95, rIn = EARTH_R * 0.025, rOut = EARTH_R * 0.11;
    var geo = geom.cylinder(rOut, rIn, h, 8);       // 内细外粗：贴地表的一端细，向外扩散变粗
    for (var i = 0; i < count; i++) {
      var y = 1 - (i / Math.max(1, count - 1)) * 2;
      var rr = Math.sqrt(Math.max(0, 1 - y * y));
      var th = i * GOLDEN_ANGLE;
      var n = [Math.cos(th) * rr, y, Math.sin(th) * rr];
      var nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
      n[0] /= nl; n[1] /= nl; n[2] /= nl;

      var m = renderer.createMesh(geo, [0.55, 0.86, 1.0],
        { group: 'fx', blend: 'add', glow: 1, depthWrite: false, cull: 'none', fill: 0 });
      m.visible = false; m.alpha = 0;

      // 局部变换：先沿 +Y 抬到地表外，再把 +Y 转到该点的法线方向
      var rot = orientUp(mat4.create(), n);
      var trans = mat4.identity(mat4.create());
      mat4.translate(trans, trans, [0, EARTH_R + h * 0.5, 0]);
      var local = mat4.identity(mat4.create());
      mat4.multiply(local, rot, trans);

      list.push({ mesh: m, local: local });
    }
    return list;
  }

  // 发动机阵列每帧更新：挂到地球矩阵下，亮度由剧情与推力决定
  var _tmpM = mat4.create();
  function updateEngines(engines, earthMatrix, intensity) {
    var shown = intensity > 0.02;
    for (var i = 0; i < engines.length; i++) {
      var e = engines[i];
      e.mesh.visible = shown;
      if (!shown) continue;
      mat4.multiply(_tmpM, earthMatrix, e.local);
      mat4.copy(e.mesh.modelMatrix, _tmpM);
      e.mesh.alpha = intensity * 0.85;
    }
  }

  // 月球被推离时的尾焰（加色锥体，朝远离地球的一侧）
  function buildMoonPlume(renderer) {
    var f = renderer.createMesh(geom.cylinder(EARTH_R * 0.10, EARTH_R * 0.42, EARTH_R * 2.2, 12),
      [0.62, 0.84, 1.0], { group: 'fx', blend: 'add', glow: 1, depthWrite: false, cull: 'none', fill: 0 });
    f.visible = false; f.alpha = 0.8;
    return f;
  }

  // ============================================================
  //  装配
  // ============================================================
  function buildWorld(renderer) {
    var w = {};
    w.sun = buildSun(renderer);
    w.earth = buildEarth(renderer);
    w.planets = buildPlanets(renderer);
    w.orbits = buildOrbits(renderer);
    w.earthOrbit = buildEarthOrbit(renderer);
    w.proxima = buildProxima(renderer);
    w.thruster = buildThruster(renderer);
    w.moon = buildMoon(renderer);
    w.moonPlume = buildMoonPlume(renderer);
    w.engines = buildEngines(renderer, 56);
    return w;
  }

  M3D.WORLD = {
    AU: AU, SUN_R: SUN_R, EARTH_R: EARTH_R, AXIS_TILT: AXIS_TILT,
    G_SUN: G_SUN, V_CIRC: V_CIRC, ESCAPE_R: ESCAPE_R, PROXIMA_POS: PROXIMA_POS,
    planets: PLANETS, thrustAcc: THRUST_ACC, fuelDv: FUEL_DV, fuelBurn: FUEL_BURN,
    COLORS: COLORS
  };
  M3D.buildWorld = buildWorld;
  M3D.orientUp = orientUp;
  M3D.placeSphere = placeSphere;
  M3D.placeEarth = placeEarth;
  M3D.updateEngines = updateEngines;
  M3D.makeSunTexture = makeSunTexture;
})(typeof window !== 'undefined' ? window : this);
