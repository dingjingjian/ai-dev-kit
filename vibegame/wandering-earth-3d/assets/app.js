/**
 * 流浪地球 · 逃逸截断 —— 主程序
 *
 * 结构：
 *   1. 物理核心 createGame（纯 JS，不依赖 THREE，无头自检可直接调用）
 *   2. 渲染层（依赖 THREE + DOM，无 THREE 时跳过）
 *
 * 玩法：太阳氦闪壳从第 0 秒持续膨胀追击，玩家以第三人称实时拖动地球往外飞，
 *       躲耀斑脉冲、躲五颗行星、借木星弹弓，30 秒内逃出。
 */
(function (global) {
  'use strict';

  // ============================================================
  //  常量（数值真源，与 DESIGN.md 对齐）
  // ============================================================
  var AU = 100;
  var SUN_R = 10;
  var EARTH_R = 3.4;
  var G_SUN = 11000;
  var V_CIRC = Math.sqrt(G_SUN / AU);          // ≈ 10.49
  var ESCAPE_R = 4200;                          // 胜利距离门槛（42 AU，冥王星外）

  var THRUST_ACC = 7.0;
  var SUBSTEP = 0.0045;
  var MAX_SUB = 900;
  var SAFE_FRAMES = 60;

  var ROUND_TIME = 90;
  var INTRO_TIME = 2.8;                        // 开场过场时长（秒）：俯视太阳系 → 聚焦地球
  var BASE_GROW = 4.0;
  var PULSE_TIMES = [10, 20, 35, 55, 75];
  var PULSE_GAIN = 4;
  var PULSE_DUR = 1.0;
  var PULSE_WARN = 0.3;

  var ENERGY_MAX = 100;
  var ENERGY_DRAIN = 32;             // 满推每秒消耗（~3.1 秒耗完）
  var ENERGY_REGEN = 12;             // 不推每秒回复（~8.3 秒回满）
  var PULSE_THRUST_BOOST = 1.8;      // 脉冲时推力效率加成

  var PLANETS = [
    { key: 'mercury', name: '水星', rad: 2.0, orbitR: 0.39 * AU, gm: 3, capR: 18, spin: 0.35, tex: 'MERCURY_TEXTURE_URI', color: 0xb5ada0 },
    { key: 'venus', name: '金星', rad: 3.2, orbitR: 0.72 * AU, gm: 8, capR: 26, spin: 0.20, tex: 'VENUS_TEXTURE_URI', color: 0xebd99f },
    { key: 'mars', name: '火星', rad: 2.4, orbitR: 1.52 * AU, gm: 5, capR: 22, spin: 0.30, tex: 'MARS_TEXTURE_URI', color: 0xcc7a56 },
    { key: 'jupiter', name: '木星', rad: 9.0, orbitR: 5.20 * AU, gm: 500, capR: 45, spin: 0.55, tex: 'JUPITER_TEXTURE_URI', color: 0xdbc29e },
    { key: 'saturn', name: '土星', rad: 7.6, orbitR: 9.54 * AU, gm: 380, capR: 40, spin: 0.45, tex: 'SATURN_TEXTURE_URI', color: 0xe0d4a8, ring: true },
    { key: 'uranus', name: '天王星', rad: 5.0, orbitR: 19.2 * AU, gm: 100, capR: 35, spin: 0.38, procColor: 0x4fd4e0 },
    { key: 'neptune', name: '海王星', rad: 4.8, orbitR: 30.1 * AU, gm: 90, capR: 33, spin: 0.32, procColor: 0x3a5fd8 },
    { key: 'pluto', name: '冥王星', rad: 1.8, orbitR: 39.5 * AU, gm: 2, capR: 15, spin: 0.24, procColor: 0x8a7a6a }
  ];
  var START_ANGLES = [0.6, 2.4, 4.6, 1.3, 3.8, 5.2, 2.0, 4.0];

  // 真实单位换算
  var AU_KM = 1.495978707e8;
  var REAL_SEC_PER_GAME_SEC = 5.26e5;
  var KM_PER_UNIT = AU_KM / AU;
  var YEARS_PER_GAME_SEC = REAL_SEC_PER_GAME_SEC / 3.15576e7;
  var KMS_PER_UNIT = KM_PER_UNIT / REAL_SEC_PER_GAME_SEC;

  var TAU = Math.PI * 2;
  function len3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

  // ============================================================
  //  物理核心（纯 JS，无 THREE 依赖）
  // ============================================================
  function createGame() {
    var g = {};
    var st = g.state = {
      status: 'flying',
      reason: '', culprit: '',
      t: 0,
      pos: [AU, 0, 0],
      vel: [0, 0, V_CIRC],
      spin: 0,
      thrustDir: [0, 0, 0], thrustMag: 0,
      rSun: AU, rSunAU: 1, speedKms: V_CIRC * KMS_PER_UNIT,
      shellR: SUN_R, shellV: BASE_GROW,
      escapeRatio: 0,
      warn: '',
      planets: [],
      frames: 0,
      pulseWarn: 0,
      energy: ENERGY_MAX,
      thrustEff: 1
    };

    var pAng = START_ANGLES.slice();
    var pW = [];
    var tmpP = [0, 0, 0], tmpV = [0, 0, 0];
    for (var i = 0; i < PLANETS.length; i++) {
      pW.push(Math.sqrt(G_SUN / Math.pow(PLANETS[i].orbitR, 3)));
      st.planets.push({ pos: [0, 0, 0], vel: [0, 0, 0], angle: pAng[i] });
    }

    function planetPos(i, out) {
      var d = PLANETS[i];
      out[0] = Math.cos(pAng[i]) * d.orbitR; out[1] = 0; out[2] = Math.sin(pAng[i]) * d.orbitR;
      return out;
    }
    function planetVel(i, out) {
      var d = PLANETS[i], w = pW[i];
      out[0] = -Math.sin(pAng[i]) * d.orbitR * w; out[1] = 0; out[2] = Math.cos(pAng[i]) * d.orbitR * w;
      return out;
    }
    function syncPlanets() {
      for (var i = 0; i < PLANETS.length; i++) {
        st.planets[i].angle = pAng[i];
        planetPos(i, st.planets[i].pos);
        planetVel(i, st.planets[i].vel);
      }
    }

    // 氦闪膨胀生长率
    function growRate(t) {
      var r = BASE_GROW;
      for (var i = 0; i < PULSE_TIMES.length; i++) {
        var pt = PULSE_TIMES[i];
        if (t >= pt && t < pt + PULSE_DUR) r *= PULSE_GAIN;
      }
      if (t > 20) r += (t - 20) * (t - 20) * 0.01;
      return r;
    }

    // 脉冲预警（脉冲前 PULSE_WARN 秒内返回 1）
    function pulseWarnLevel(t) {
      for (var i = 0; i < PULSE_TIMES.length; i++) {
        var pt = PULSE_TIMES[i];
        if (t > pt - PULSE_WARN && t < pt) return 1;
      }
      return 0;
    }

    function fail(status, reason, culprit) {
      st.status = status; st.reason = reason; st.culprit = culprit || '';
      st.thrustMag = 0;
    }

    function check() {
      var p = st.pos, v = st.vel;
      var rSun = len3(p);
      st.rSun = rSun; st.rSunAU = rSun / AU;

      if (rSun < SUN_R + EARTH_R) { fail('crashed', '地球坠入太阳', '太阳'); return; }
      if (rSun < st.shellR) { fail('burned', '被氦闪烈焰吞没', '太阳'); return; }

      st.warn = '';
      if (st.frames > SAFE_FRAMES) {
        for (var i = 0; i < PLANETS.length; i++) {
          var d = PLANETS[i];
          var pp = planetPos(i, tmpP);
          var dx = p[0] - pp[0], dy = p[1] - pp[1], dz = p[2] - pp[2];
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < d.rad + EARTH_R) { fail('crashed', '撞上' + d.name, d.name); return; }
          if (dist < d.capR) {
            var pv = planetVel(i, tmpV);
            var vx = v[0] - pv[0], vy = v[1] - pv[1], vz = v[2] - pv[2];
            var vrel = Math.sqrt(vx * vx + vy * vy + vz * vz);
            var vesc = Math.sqrt(2 * d.gm / dist);
            if (vrel < vesc) { fail('caught', '被' + d.name + '引力捕获', d.name); return; }
            st.warn = '进入' + d.name + '引力范围 · 相对速度 ' + (vrel * KMS_PER_UNIT).toFixed(1) +
              ' / 逃逸阈值 ' + (vesc * KMS_PER_UNIT).toFixed(1) + ' km/s';
          }
        }
      }

      var sp = len3(v);
      st.escapeRatio = sp / Math.sqrt(2 * G_SUN / Math.max(1, rSun));
      // 胜利：达到逃逸能量（逃逸比 ≥ 1）且飞出距离门槛
      if (st.escapeRatio >= 1 && rSun > ESCAPE_R) {
        st.status = 'escaped';
        st.reason = '逃出太阳系，奔向比邻星';
      }
    }

    function substep(h, tNow) {
      for (var i = 0; i < PLANETS.length; i++) pAng[i] += pW[i] * h;

      var p = st.pos, v = st.vel;
      var ax = 0, ay = 0, az = 0;
      var r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
      var r = Math.sqrt(r2) || 1e-6;
      var k = G_SUN / (r2 * r);
      ax -= p[0] * k; ay -= p[1] * k; az -= p[2] * k;

      for (i = 0; i < PLANETS.length; i++) {
        var pp = planetPos(i, tmpP);
        var dx = pp[0] - p[0], dy = pp[1] - p[1], dz = pp[2] - p[2];
        var d2 = dx * dx + dy * dy + dz * dz;
        var d = Math.sqrt(d2) || 1e-6;
        if (d < 1e-4) continue;
        var f = PLANETS[i].gm / (d2 * d);
        ax += dx * f; ay += dy * f; az += dz * f;
      }

      if (st.thrustMag > 0 && st.thrustEff > 0) {
        var ta = THRUST_ACC * st.thrustMag * st.thrustEff;
        ax += st.thrustDir[0] * ta;
        ay += st.thrustDir[1] * ta;
        az += st.thrustDir[2] * ta;
      }

      v[0] += ax * h; v[1] += ay * h; v[2] += az * h;
      p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
      st.spin += h * 0.35;

      // 壳膨胀积分（用子步精确时间，脉冲期内积分不失真）
      st.shellV = growRate(tNow);
      st.shellR += st.shellV * h;

      check();
    }

    g.setThrust = function (dir, mag) {
      if (st.status !== 'flying') { st.thrustMag = 0; return; }
      if (!dir || mag <= 0) { st.thrustMag = 0; return; }
      var l = len3(dir) || 1;
      st.thrustDir[0] = dir[0] / l; st.thrustDir[1] = dir[1] / l; st.thrustDir[2] = dir[2] / l;
      st.thrustMag = Math.max(0, Math.min(1, mag));
    };

    g.step = function (dtReal) {
      if (st.status !== 'flying') { st.thrustMag = 0; return; }
      var dt = dtReal;
      // 能量管理：推力消耗 / 不推回复
      if (st.thrustMag > 0 && st.energy > 0) {
        st.energy = Math.max(0, st.energy - ENERGY_DRAIN * st.thrustMag * dt);
      } else if (st.thrustMag === 0) {
        st.energy = Math.min(ENERGY_MAX, st.energy + ENERGY_REGEN * dt);
      }
      // 实际推力效率：能量低于 25 线性衰减；脉冲时乘波加成
      var eff = st.energy > 25 ? 1 : st.energy / 25;
      if (growRate(st.t) > BASE_GROW) eff *= PULSE_THRUST_BOOST;
      st.thrustEff = eff;
      var n = Math.max(1, Math.min(Math.ceil(dt / SUBSTEP), MAX_SUB));
      var h = dt / n;
      var tNow = st.t;
      for (var i = 0; i < n; i++) {
        tNow += h;
        substep(h, tNow);
        if (st.status !== 'flying') break;
      }
      st.t = tNow;
      st.frames += 1;
      var sp = len3(st.vel);
      st.speedKms = sp * KMS_PER_UNIT;
      st.pulseWarn = pulseWarnLevel(st.t);
      syncPlanets();
      // 30 秒耗尽仍未逃出 → 失败
      if (st.status === 'flying' && st.t >= ROUND_TIME) {
        fail('timeout', '90 秒耗尽，未能逃出太阳系', '');
      }
    };

    g.debugSet = function (pos, vel) {
      st.pos[0] = pos[0]; st.pos[1] = pos[1]; st.pos[2] = pos[2];
      st.vel[0] = vel[0]; st.vel[1] = vel[1]; st.vel[2] = vel[2];
      st.frames = SAFE_FRAMES + 1;
    };

    g.reset = function () {
      st.status = 'flying'; st.reason = ''; st.culprit = '';
      st.t = 0; st.pos[0] = AU; st.pos[1] = 0; st.pos[2] = 0;
      st.vel[0] = 0; st.vel[1] = 0; st.vel[2] = V_CIRC;
      st.spin = 0; st.thrustMag = 0;
      st.rSun = AU; st.rSunAU = 1; st.speedKms = V_CIRC * KMS_PER_UNIT;
      st.shellR = SUN_R; st.shellV = BASE_GROW; st.escapeRatio = 0;
      st.warn = ''; st.frames = 0; st.pulseWarn = 0;
      st.energy = ENERGY_MAX; st.thrustEff = 1;
      for (var i = 0; i < PLANETS.length; i++) pAng[i] = START_ANGLES[i];
      syncPlanets();
    };

    syncPlanets();
    st.speedKms = V_CIRC * KMS_PER_UNIT;
    return g;
  }

  // 导出物理核心（无头自检用）
  global.M3D = global.M3D || {};
  global.M3D.createGame = createGame;
  global.M3D.WORLD = { AU: AU, SUN_R: SUN_R, EARTH_R: EARTH_R, G_SUN: G_SUN, V_CIRC: V_CIRC, planets: PLANETS };
  global.M3D.CONST = { THRUST_ACC: THRUST_ACC, ROUND_TIME: ROUND_TIME, BASE_GROW: BASE_GROW, PULSE_TIMES: PULSE_TIMES, KMS_PER_UNIT: KMS_PER_UNIT, YEARS_PER_GAME_SEC: YEARS_PER_GAME_SEC };

  // ============================================================
  //  渲染层（依赖 THREE + DOM；无 THREE 时跳过，物理核心仍可用）
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
  var camera = new THREE.PerspectiveCamera(60, W / H, 0.5, 8000);

  // ---- 星空天球 ----
  function starfieldTex() {
    var w = 2048, h = 1024, c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d');
    var bg = x.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#04050c'); bg.addColorStop(.5, '#080a1a'); bg.addColorStop(1, '#04050c');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 4200; i++) { x.fillStyle = 'rgba(255,255,255,' + (.15 + Math.random() * .5) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    for (var j = 0; j < 220; j++) { x.fillStyle = 'rgba(255,255,255,' + (.82 + Math.random() * .18) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  var sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 32), new THREE.MeshBasicMaterial({ map: starfieldTex(), side: THREE.BackSide, depthWrite: false }));
  scene.add(sky);

  // ---- 光照 ----
  scene.add(new THREE.AmbientLight(0x223044, 0.6));
  var sunLight = new THREE.PointLight(0xfff2d0, 2.5, 0, 1.2); sunLight.position.set(0, 0, 0); scene.add(sunLight);

  // ---- 工具：base64 data URI → THREE.Texture ----
  function dataTex(uri) {
    if (typeof uri !== 'string') return null;
    var img = new Image();
    var tex = new THREE.Texture(img);
    tex.encoding = THREE.sRGBEncoding;
    img.onload = function () { tex.needsUpdate = true; };
    img.src = uri;
    return tex;
  }
  function plainTex(col) { var c = document.createElement('canvas'); c.width = c.height = 4; c.getContext('2d').fillStyle = col; c.getContext('2d').fillRect(0, 0, 4, 4); return new THREE.CanvasTexture(c); }
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

  // ---- 太阳 ----
  function sunTex() {
    var c = document.createElement('canvas'); c.width = c.height = 512; var x = c.getContext('2d');
    x.fillStyle = '#ff7a14'; x.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 5200; i++) { x.fillStyle = 'rgba(255,' + (170 + Math.random() * 80 | 0) + ',' + (30 + Math.random() * 90 | 0) + ',' + (Math.random() * .45) + ')'; x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 1.5 + Math.random() * 7, 0, 6.283); x.fill(); }
    return new THREE.CanvasTexture(c);
  }
  var sunGroup = new THREE.Group(); scene.add(sunGroup);
  var sunCore = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 48), new THREE.MeshBasicMaterial({ map: sunTex() }));
  sunGroup.add(sunCore);
  var sunGlow = new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.25, 36, 28), new THREE.MeshBasicMaterial({ color: 0xff7a14, side: THREE.BackSide, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false }));
  sunGroup.add(sunGlow);
  var sunHalo = new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.8, 32, 24), new THREE.MeshBasicMaterial({ color: 0xff4a14, side: THREE.BackSide, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false }));
  sunGroup.add(sunHalo);

  // ---- 地球（冰封场景：真实贴图 + 冷色 tint + 半透明冰壳叠加）----
  function iceOverlayTex() {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    var x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,0)'; x.fillRect(0, 0, 1024, 512);
    for (var i = 0; i < 55; i++) {                          // 冰原斑块
      var px = Math.random() * 1024, py = Math.random() * 512, r = 40 + Math.random() * 120;
      var g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(225,238,250,0.55)');
      g.addColorStop(0.55, 'rgba(190,215,238,0.30)');
      g.addColorStop(1, 'rgba(190,215,238,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
    }
    x.fillStyle = 'rgba(245,250,255,0.65)';                 // 极冠加厚
    x.fillRect(0, 0, 1024, 58); x.fillRect(0, 454, 1024, 58);
    x.strokeStyle = 'rgba(18,38,66,0.35)'; x.lineWidth = 1.2; // 冰裂缝
    for (var j = 0; j < 40; j++) {
      x.beginPath(); var sx = Math.random() * 1024, sy = 64 + Math.random() * 384;
      x.moveTo(sx, sy);
      for (var k = 0; k < 5; k++) { sx += (Math.random() - 0.5) * 80; sy += (Math.random() - 0.5) * 80; x.lineTo(sx, sy); }
      x.stroke();
    }
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  var earthGroup = new THREE.Group(); scene.add(earthGroup);
  var earthMat = new THREE.MeshStandardMaterial({ map: dataTex(global.EARTH_TEXTURE_URI) || plainTex('#3a5a7a'), color: 0x8aa8c8, roughness: .8, metalness: .06 });
  var earthMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 48, 32), earthMat); earthGroup.add(earthMesh);
  var iceShellMat = new THREE.MeshStandardMaterial({ map: iceOverlayTex(), transparent: true, opacity: .75, roughness: .9, metalness: .02, depthWrite: false });
  var iceShell = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.004, 48, 32), iceShellMat); earthGroup.add(iceShell);
  var cloudMat = new THREE.MeshStandardMaterial({ color: 0xdde8f5, transparent: true, opacity: .2, roughness: 1, depthWrite: false }); // 冰封地球少云
  var clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.012, 48, 32), cloudMat); earthGroup.add(clouds);
  var atmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.06, 48, 32), new THREE.MeshBasicMaterial({ color: 0x4a86c8, side: THREE.BackSide, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }));
  earthGroup.add(atmo);
  // 推力尾焰
  var thrustFlame = new THREE.Mesh(new THREE.ConeGeometry(EARTH_R * 0.35, EARTH_R * 1.8, 12), new THREE.MeshBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  thrustFlame.visible = false; earthGroup.add(thrustFlame);
  var _flameAxis = new THREE.Vector3(0, 1, 0), _flameDir = new THREE.Vector3();

  // ---- 行星发动机光柱（局部 -Z 半球 = 后方，engineGroup 随推力方向转向）----
  var engineGroup = new THREE.Group(); earthGroup.add(engineGroup);
  var engines = [];
  var goldenAngle = Math.PI * (3 - Math.sqrt(5));
  var engineGeo = new THREE.ConeGeometry(EARTH_R * 0.05, EARTH_R * 0.45, 6);
  var engineMatTpl = { color: 0x5cc8ff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false };
  for (var ei = 0; ei < 48; ei++) {
    var ez = -0.05 - (ei / 47) * 0.95;          // -Z 半球（后方喷射侧），密集分布模拟万台发动机
    var err = Math.sqrt(Math.max(0, 1 - ez * ez));
    var eth = ei * goldenAngle;
    var enx = Math.cos(eth) * err, eny = Math.sin(eth) * err, enz = ez;
    var cone = new THREE.Mesh(engineGeo, new THREE.MeshBasicMaterial(engineMatTpl));
    cone.position.set(enx * EARTH_R * 1.08, eny * EARTH_R * 1.08, enz * EARTH_R * 1.08);
    cone.quaternion.setFromUnitVectors(_flameAxis, new THREE.Vector3(enx, eny, enz));
    engineGroup.add(cone);
    engines.push(cone);
  }
  var _zAxis = new THREE.Vector3(0, 0, 1), _negZAxis = new THREE.Vector3(0, 0, -1);
  var _targetQuat = new THREE.Quaternion();

  // ---- 3D 引导箭头（指向远离太阳方向，第一次推力后消失）----
  var guideArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 28, 0x5cc8ff, 10, 6);
  guideArrow.visible = false; scene.add(guideArrow);
  var guideHidden = false;

  // ---- 八行星 + 轨道线 + 发光标记 ----
  var glowTex = (function () { var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'); var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  var planetMeshes = [];
  for (var pi = 0; pi < PLANETS.length; pi++) {
    (function (def) {
      var pcol = def.procColor != null ? def.procColor : def.color;
      var orbit = new THREE.Mesh(new THREE.RingGeometry(def.orbitR - 1, def.orbitR + 1, 128), new THREE.MeshBasicMaterial({ color: pcol, side: THREE.DoubleSide, transparent: true, opacity: .12, depthWrite: false }));
      orbit.rotation.x = Math.PI / 2; scene.add(orbit);
      var tex = def.procColor != null ? procPlanetTex(def.procColor) : (dataTex(global[def.tex]) || plainTex('#888'));
      var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .85 });
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(def.rad, 40, 28), mat); scene.add(mesh);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: pcol, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(Math.max(def.rad * 3, 10), Math.max(def.rad * 3, 10), 1); scene.add(glow);
      var ring = null;
      if (def.ring) {
        ring = new THREE.Mesh(new THREE.RingGeometry(def.rad * 1.4, def.rad * 2.2, 72), new THREE.MeshBasicMaterial({ color: 0xd4c89c, side: THREE.DoubleSide, transparent: true, opacity: .55, depthWrite: false }));
        ring.rotation.x = Math.PI / 2; scene.add(ring);
      }
      planetMeshes.push({ def: def, mesh: mesh, ring: ring, glow: glow });
    })(PLANETS[pi]);
  }

  // ---- 物理 ----
  var game = createGame();
  var st = game.state;

  // ---- 音效（程序化 WebAudio，首次触摸解锁）----
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null, rumbleGain = null;
  function initAudio() {
    if (!AC || actx) return;
    try { actx = new AC(); } catch (e) { return; }
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    // 点火隆隆声：循环白噪声 + 低通滤波，音量随推力
    var len = (actx.sampleRate * 2) | 0;
    var buf = actx.createBuffer(1, len, actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    var lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130;
    rumbleGain = actx.createGain(); rumbleGain.gain.value = 0;
    src.connect(lp); lp.connect(rumbleGain); rumbleGain.connect(actx.destination);
    src.start();
  }
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
  function sfxBoom() { sfxOsc('sawtooth', 90, 28, 0.9, 0.5); sfxOsc('sine', 55, 20, 1.2, 0.6); }  // 耀斑/氦闪爆音
  function sfxTick() { sfxOsc('square', 1100, 1100, 0.05, 0.08); }                                 // 倒计时滴答
  function sfxWin()  { sfxOsc('sine', 523, 784, 0.5, 0.25); setTimeout(function () { sfxOsc('sine', 659, 1046, 0.8, 0.25); }, 220); }
  function sfxLose() { sfxOsc('sine', 220, 60, 1.1, 0.35); }

  // ---- 输入：触屏拖动 = 推力方向 + 强度 ----
  var AIM_DEAD = 12, AIM_FULL = 0.25;
  var pointer = null, pinchDist = 0, userZoom = 1;
  var shortSide = Math.min(W, H);

  function screenToWorldDir(dx, dy) {
    // 相机朝向：从后方看地球，forward = camera 方向
    var fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    var upW = new THREE.Vector3(0, 1, 0);
    var right = new THREE.Vector3().crossVectors(fwd, upW).normalize();
    var up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    // 屏幕拖动 (dx, dy)，dy 向下为正 → 世界 right*dx - up*dy
    var dir = new THREE.Vector3().addScaledVector(right, dx).addScaledVector(up, -dy);
    dir.y = 0; // 推力在 XZ 平面
    if (dir.lengthSq() < 1e-6) return null;
    dir.normalize();
    return [dir.x, dir.y, dir.z];
  }

  function updateThrustFromPointer() {
    if (!pointer) { game.setThrust(null, 0); return; }
    var dx = pointer.cx - pointer.sx, dy = pointer.cy - pointer.sy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < AIM_DEAD) { game.setThrust(null, 0); return; }
    var dir = screenToWorldDir(dx, dy);
    if (!dir) { game.setThrust(null, 0); return; }
    var mag = Math.min(1, (dist - AIM_DEAD) / (shortSide * AIM_FULL - AIM_DEAD));
    game.setThrust(dir, mag);
  }

  canvas.addEventListener('pointerdown', function (e) {
    initAudio(); // 用户手势内解锁音频
    if (st.status !== 'flying' || introT < INTRO_TIME) return;
    if (e.isPrimary === false) return; // 双指第二指交给 pinch
    pointer = { sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, id: e.pointerId };
    hideHint(); guideHidden = true; guideArrow.visible = false;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (pointer && e.pointerId === pointer.id) { pointer.cx = e.clientX; pointer.cy = e.clientY; updateThrustFromPointer(); }
  });
  function endPointer(e) { if (pointer && e.pointerId === pointer.id) { pointer = null; game.setThrust(null, 0); } }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // 双指捏合缩放
  var pointers = {};
  canvas.addEventListener('pointerdown', function (e) { pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', function (e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinchDist = 0; // 防残留导致下次捏合跳变
  });
  canvas.addEventListener('pointercancel', function (e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinchDist = 0;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
      if (pinchDist > 0) userZoom = Math.max(0.5, Math.min(2.2, userZoom * (d / pinchDist)));
      pinchDist = d;
    }
  });

  // ---- 相机：第三人称跟拍 ----
  var camPos = new THREE.Vector3(0, 380, 0.01), camLook = new THREE.Vector3(0, 0, 0);
  var camBackBase = 55, camUpBase = 28;
  var introT = 0;
  function updateCamera(dt) {
    var ep = st.pos;
    var r = len3(ep) || 1;
    var dirX = ep[0] / r, dirZ = ep[2] / r; // 径向（远离太阳方向）
    var camBack = camBackBase * userZoom;
    if (st.shellR > SUN_R * 2) camBack += (st.shellR - SUN_R * 2) * 0.6;
    // 相机始终从太阳侧看地球往外飞：偏移 = -径向 * camBack（朝太阳方向后退）
    var tx = ep[0] - dirX * camBack;
    var ty = ep[1] + camUpBase * userZoom;
    var tz = ep[2] - dirZ * camBack;
    var k = 1 - Math.exp(-dt * 4);
    camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
    camLook.x += (ep[0] - camLook.x) * k; camLook.y += (ep[1] - camLook.y) * k; camLook.z += (ep[2] - camLook.z) * k;
    camera.position.copy(camPos); camera.lookAt(camLook);
  }

  // ---- HUD ----
  var elCd = document.getElementById('cd-num'), elCdWrap = document.getElementById('countdown');
  var elDist = document.getElementById('tm-dist'), elSpeed = document.getElementById('tm-speed'), elEsc = document.getElementById('tm-esc');
  var elWarn = document.getElementById('warn'), elDanger = document.getElementById('danger'), elHint = document.getElementById('hint');
  var elBrief = document.getElementById('brief'), elBfBtn = document.getElementById('bf-btn'), briefClosed = false;
  var elCompass = document.getElementById('compass'), elCmpSvg = document.getElementById('cmp-svg');
  var elProg = document.getElementById('progress'), elProgFill = document.getElementById('prog-fill'), elProgLabel = document.getElementById('prog-label');
  var elEnergyWrap = document.getElementById('energy-wrap'), elEnergyFill = document.getElementById('energy-fill');
  var elMilestones = document.getElementById('milestones'), msDots = [], maxRSun = 0;
  for (var mi = 0; mi < PLANETS.length; mi++) {
    var dot = document.createElement('div'); dot.className = 'ms-dot'; dot.textContent = PLANETS[mi].name.charAt(0);
    elMilestones.appendChild(dot); msDots.push(dot);
  }
  var elRadar = document.getElementById('radar'), radarCtx = elRadar.getContext('2d');
  elRadar.width = 104; elRadar.height = 104;
  var elResult = document.getElementById('result'), elRsTitle = document.getElementById('rs-title'), elRsText = document.getElementById('rs-text'), elRsStat = document.getElementById('rs-stat'), elRsBtn = document.getElementById('rs-btn'), elFlash = document.getElementById('flash');

  function hideHint() { if (elHint) elHint.classList.add('hide'); }

  function updateHUD() {
    var remain = Math.max(0, ROUND_TIME - st.t);
    elCd.textContent = remain.toFixed(1);
    elCdWrap.classList.toggle('urgent', remain < 10);
    elDist.textContent = st.rSunAU.toFixed(2) + ' AU';
    elSpeed.textContent = st.speedKms.toFixed(1) + ' km/s';
    elEsc.textContent = st.escapeRatio.toFixed(2);
    elEsc.className = 'tm-v' + (st.escapeRatio >= 1 ? ' good' : '');
    var prog = Math.min(1, st.rSun / ESCAPE_R);
    elProgFill.style.width = (prog * 100).toFixed(0) + '%';
    elProgLabel.textContent = '逃逸进度 ' + (prog * 100).toFixed(0) + '%';
    elEnergyFill.style.width = (st.energy / ENERGY_MAX * 100).toFixed(0) + '%';
    maxRSun = Math.max(maxRSun, st.rSun);
    for (var mi2 = 0; mi2 < PLANETS.length; mi2++) {
      if (maxRSun > PLANETS[mi2].orbitR) msDots[mi2].classList.add('passed');
    }
    if (st.pulseWarn > 0) { elWarn.textContent = '⚠ 耀斑脉冲 · 乘波加速全推！'; elWarn.classList.add('show'); }
    else if (st.warn) { elWarn.textContent = st.warn; elWarn.classList.add('show'); }
    else elWarn.classList.remove('show');
    // 危险红边：脉冲预警 或 接近壳
    var danger = st.pulseWarn > 0 || (st.rSun - st.shellR < 30);
    elDanger.classList.toggle('active', danger && st.status === 'flying');
  }

  function drawRadar() {
    var rw = 104, cx = 52, cy = 52, scl = 48 / ESCAPE_R;
    radarCtx.clearRect(0, 0, rw, rw);
    radarCtx.fillStyle = 'rgba(12,18,34,.65)'; radarCtx.fillRect(0, 0, rw, rw);
    radarCtx.strokeStyle = 'rgba(120,160,220,.12)'; radarCtx.lineWidth = 1; radarCtx.strokeRect(0.5, 0.5, rw - 1, rw - 1);
    radarCtx.fillStyle = '#ff7a14'; radarCtx.beginPath(); radarCtx.arc(cx, cy, 3, 0, 6.283); radarCtx.fill();
    radarCtx.strokeStyle = 'rgba(255,74,20,.5)'; radarCtx.beginPath(); radarCtx.arc(cx, cy, st.shellR * scl, 0, 6.283); radarCtx.stroke();
    for (var ri = 0; ri < PLANETS.length; ri++) {
      var pp = st.planets[ri], pc = PLANETS[ri].procColor != null ? PLANETS[ri].procColor : PLANETS[ri].color;
      radarCtx.fillStyle = 'rgb(' + ((pc >> 16) & 255) + ',' + ((pc >> 8) & 255) + ',' + (pc & 255) + ')';
      radarCtx.beginPath(); radarCtx.arc(cx + pp.pos[0] * scl, cy + pp.pos[2] * scl, 2, 0, 6.283); radarCtx.fill();
    }
    var ex = cx + st.pos[0] * scl, ey = cy + st.pos[2] * scl;
    radarCtx.fillStyle = '#5cc8ff'; radarCtx.beginPath(); radarCtx.arc(ex, ey, 2.5, 0, 6.283); radarCtx.fill();
    radarCtx.strokeStyle = 'rgba(92,200,255,.4)'; radarCtx.beginPath(); radarCtx.arc(ex, ey, 5, 0, 6.283); radarCtx.stroke();
  }

  var resultShownAt = 0;
  function showResult() {
    var win = st.status === 'escaped';
    elRsTitle.textContent = win ? '逃出太阳系' : '任务失败';
    elRsTitle.className = 'rs-title ' + (win ? 'win' : 'lose');
    elRsText.textContent = st.reason;
    elRsStat.innerHTML = '距日 ' + st.rSunAU.toFixed(2) + ' AU · 速度 ' + st.speedKms.toFixed(1) + ' km/s · 用时 ' + st.t.toFixed(1) + ' s';
    elResult.classList.add('show');
    resultShownAt = performance.now();
    if (win) sfxWin(); else sfxLose();
  }

  function restart() {
    elResult.classList.remove('show');
    game.reset();
    pointer = null; userZoom = 1; pinchDist = 0;
    prevT = 0; lastTickSec = -1; introT = 0;
    camPos.set(0, 380, 0.01); camLook.set(0, 0, 0);
    if (elHint) elHint.classList.remove('hide');
    briefClosed = false; elBrief.classList.remove('show');
    guideHidden = false; guideArrow.visible = false;
    maxRSun = 0; for (var ri2 = 0; ri2 < msDots.length; ri2++) msDots[ri2].classList.remove('passed');
  }

  elRsBtn.addEventListener('click', restart);
  elBfBtn.addEventListener('click', function () { briefClosed = true; elBrief.classList.remove('show'); });
  // 结算页出现 1 秒后，点面板任意处也可重开（防误触）
  elResult.addEventListener('click', function (e) {
    if (e.target === elRsBtn) return;
    if (performance.now() - resultShownAt > 1000) restart();
  });

  // ---- 主循环 ----
  var last = performance.now();
  var loaderHidden = false;
  var prevT = 0, lastTickSec = -1;
  function flashScreen() {
    if (!elFlash) return;
    elFlash.classList.remove('on');
    void elFlash.offsetWidth; // 强制重排以重启动画
    elFlash.classList.add('on');
  }
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // 开场过场：俯视太阳系 → 聚焦地球（物理冻结）
    if (introT < INTRO_TIME) {
      introT += dt;
      var s = Math.min(1, introT / INTRO_TIME);
      var e = s * s * (3 - 2 * s); // smoothstep
      camPos.set(AU * e, 380 * (1 - e) + camUpBase * e, 0.01 * (1 - e) - camBackBase * e);
      camLook.set(AU * e, 0, 0);
      camera.position.copy(camPos); camera.lookAt(camLook);
    } else if (briefClosed && st.status === 'flying') {
      game.step(dt);
      // 耀斑脉冲触发边沿：白闪 + 爆音
      for (var pi2 = 0; pi2 < PULSE_TIMES.length; pi2++) {
        if (prevT < PULSE_TIMES[pi2] && st.t >= PULSE_TIMES[pi2]) { flashScreen(); sfxBoom(); }
      }
      // 最后 10 秒整秒滴答
      var remain = Math.max(0, ROUND_TIME - st.t);
      var sec = Math.ceil(remain);
      if (remain < 10 && remain > 0 && sec !== lastTickSec) { lastTickSec = sec; sfxTick(); }
      prevT = st.t;
    }
    if (introT >= INTRO_TIME && !briefClosed) elBrief.classList.add('show');
    // 点火隆隆声音量跟随推力
    if (rumbleGain && actx && actx.state === 'running') {
      rumbleGain.gain.setTargetAtTime(st.thrustMag * 0.22, actx.currentTime, 0.06);
    }

    // 更新天体位置
    earthGroup.position.set(st.pos[0], st.pos[1], st.pos[2]);
    // 地球整体（含发动机）平滑转向前进方向；有推力时混入推力方向加快响应
    var sp = len3(st.vel) || 1;
    var vx = st.vel[0] / sp, vz = st.vel[2] / sp;
    if (st.thrustMag > 0) {
      vx = vx * 0.6 + st.thrustDir[0] * st.thrustMag * 0.4;
      vz = vz * 0.6 + st.thrustDir[2] * st.thrustMag * 0.4;
    }
    _flameDir.set(vx, 0, vz);
    if (_flameDir.lengthSq() > 1e-6) {
      _flameDir.normalize();
      _targetQuat.setFromUnitVectors(_zAxis, _flameDir);
      earthGroup.quaternion.slerp(_targetQuat, 1 - Math.exp(-dt * 6));
    }
    var engOp = 0.4 + st.thrustMag * 0.6;
    for (var egi = 0; egi < engines.length; egi++) engines[egi].material.opacity = engOp;
    // 尾焰（局部坐标：earthGroup 已旋转，尾焰固定在局部 -Z 后方）
    if (st.thrustMag > 0) {
      thrustFlame.visible = true;
      thrustFlame.position.set(0, 0, -EARTH_R * 1.0);
      thrustFlame.quaternion.setFromUnitVectors(_flameAxis, _negZAxis);
      thrustFlame.scale.y = 0.6 + st.thrustMag * 1.2;
    } else thrustFlame.visible = false;

    // 太阳壳膨胀
    var scale = st.shellR / SUN_R;
    sunGroup.scale.setScalar(scale);

    // 行星
    for (var i = 0; i < planetMeshes.length; i++) {
      var pm = planetMeshes[i], pp = st.planets[i];
      pm.mesh.position.set(pp.pos[0], pp.pos[1], pp.pos[2]);
      pm.mesh.rotation.y = pp.angle * 3;
      if (pm.ring) pm.ring.position.set(pp.pos[0], pp.pos[1], pp.pos[2]);
      if (pm.glow) pm.glow.position.set(pp.pos[0], pp.pos[1], pp.pos[2]);
    }

    // 3D 引导箭头：指向远离太阳方向
    if (briefClosed && !guideHidden && st.status === 'flying') {
      _flameDir.set(st.pos[0], 0, st.pos[2]);
      var gr = _flameDir.length();
      if (gr > 1) {
        _flameDir.normalize();
        guideArrow.position.set(st.pos[0] + _flameDir.x * EARTH_R * 1.8, EARTH_R * 1.2, st.pos[2] + _flameDir.z * EARTH_R * 1.8);
        guideArrow.setDirection(_flameDir);
        guideArrow.visible = true;
      }
    } else guideArrow.visible = false;

    if (introT >= INTRO_TIME) updateCamera(dt);

    // 顶部罗盘：箭头指向逃离太阳方向
    if (briefClosed && st.status === 'flying') {
      elCompass.classList.remove('hide');
      elProg.classList.remove('hide');
      elEnergyWrap.classList.remove('hide');
      elMilestones.classList.remove('hide');
      elRadar.classList.remove('hide');
      camera.updateMatrixWorld();
      var m = camera.matrixWorld.elements;
      var dx = st.pos[0], dz = st.pos[2], dr = Math.sqrt(dx * dx + dz * dz);
      if (dr > 1) {
        dx /= dr; dz /= dr;
        var sx = dx * m[0] + dz * m[2];
        var sy = dx * m[4] + dz * m[6];
        elCmpSvg.style.transform = 'rotate(' + (Math.atan2(sx, sy) * 180 / Math.PI).toFixed(1) + 'deg)';
        if (st.thrustMag > 0) {
          elCompass.classList.toggle('good', st.thrustDir[0] * dx + st.thrustDir[2] * dz > 0.7);
        } else elCompass.classList.remove('good');
      }
    } else { elCompass.classList.add('hide'); elProg.classList.add('hide'); elEnergyWrap.classList.add('hide'); elMilestones.classList.add('hide'); elRadar.classList.add('hide'); }

    updateHUD();
    drawRadar();

    if (st.status !== 'flying' && !elResult.classList.contains('show')) showResult();

    if (!loaderHidden) { document.getElementById('loader').classList.add('hide'); loaderHidden = true; }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 窗口缩放
  addEventListener('resize', function () {
    W = innerWidth; H = innerHeight; shortSide = Math.min(W, H);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  });
})(typeof window !== 'undefined' ? window : this);
