/**
 * 玩法内核：太阳系 N 体（简化）物理 + 胜负判定。
 *
 * 玩家：地球。目标是把地球推出太阳系。本文件是**物理与判定规则的唯一真源**，
 * app.js 只负责渲染、输入与剧情调度。
 *
 * 两种点火方式（共用同一套燃料账）：
 *   1. setThrust(dir, mag)  持续推力：按住就烧，松手就停（自检与兼容路径用）；
 *   2. commitBurn(dx, dz, dv) 预定量点火：先瞄准（不烧燃料），松手后自动烧掉
 *      指定的速度增量 dv 就停。玩家实际走这条 —— 配合轨道预测，
 *      "规划 → 执行 → 观察"的节奏比一直按着更有策略感。
 *
 * 失败：撞上太阳 / 行星（撞毁）、进入行星影响球且相对速度不足逃逸速度（被引力吸走）、
 * 氦闪爆发时仍留在太阳膨胀半径内（被吞没）。
 * 胜利：飞出 ESCAPE_R（脱离太阳系）。
 */
(function (global) {
  'use strict';
  var M3D = global.M3D;
  var W = M3D.WORLD;
  var PLANETS = W.planets;
  var G_SUN = W.G_SUN;

  var SUBSTEP = 0.0045;        // 物理子步长（游戏秒）：近距离掠过时保证积分稳定
  var MAX_SUB = 900;           // 单帧子步上限（防止加速时卡死）
  var SAFE_FRAMES = 90;        // 开局保护帧：前若干帧不判行星碰撞（避免初始相位踩雷）

  var LAP_TOTAL = 15;          // 逃逸时代设定：绕日 15 圈（叙事框架，HUD 进度用）
  var OBERTH_GAIN = 0.55;      // 近日点效率加成上限（奥伯特效应的游戏化）
  var FLASH_LAP = 10;          // 第几圈触发叛乱与太阳氦闪

  // 真实单位换算（HUD 用真实数值，不用游戏单位）
  var AU_KM = 1.495978707e8;
  var REAL_SEC_PER_GAME_SEC = 5.26e5;                    // 游戏 1 秒 ≈ 真实 6.1 天
  var KM_PER_UNIT = AU_KM / W.AU;
  var YEARS_PER_GAME_SEC = REAL_SEC_PER_GAME_SEC / 3.15576e7;
  var KMS_PER_UNIT = KM_PER_UNIT / REAL_SEC_PER_GAME_SEC; // ≈ 2.84 km/s per (单位/秒)

  var EARTH_ANGLE = 0;                                   // 地球初始相位（位置 +X 轴）
  var START_ANGLES = [0.6, 2.4, 4.6, 1.3, 3.8];          // 各行星初始相位（与地球错开）

  var TAU = Math.PI * 2;
  function len3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function wrapPi(a) {
    while (a > Math.PI) a -= TAU;
    while (a <= -Math.PI) a += TAU;
    return a;
  }

  function createGame() {
    var g = {};
    var st = g.state = {
      status: 'ready',           // ready | flying | crashed | caught | burned | escaped
      reason: '',                // 失败 / 胜利文案
      culprit: '',               // 肇事天体名
      t: 0,                      // 游戏时间（秒）
      pos: [W.AU, 0, 0],
      vel: [0, 0, W.V_CIRC],     // 圆轨道速度（逆时针，俯视 XZ 平面）
      spin: 0,
      fuel: 1,                   // 0..1
      thrustDir: [0, 0, 0],
      thrustMag: 0,              // 0..1（持续推力模式）
      timeScale: 1,
      rSun: W.AU, rSunAU: 1, speedKms: W.V_CIRC * KMS_PER_UNIT, years: 0,
      maxR: W.AU, minR: W.AU,
      warn: '',                  // 危险提示（接近行星影响球）
      planets: [],               // [{ pos, vel, angle }] 每帧写入，供渲染读取
      frames: 0,

      // ---- 逃逸时代新增 ----
      laps: 0,                   // 累计绕日圈数（浮点，可为负若绕反）
      lap: 0,                    // 已完成整圈数
      lapTotal: LAP_TOTAL,
      peri: 0,                   // 近日点窗口强度 0..1
      escapeRatio: 0,            // 当前速度 / 当前位置逃逸速度，≥1 即具备逃逸能量
      orbit: null,               // 当前开普勒轨道要素（供 HUD 与轨道线绘制）
      burn: null,                // { dx, dz, remain, total } 正在执行的预定量点火
      flashR: 0,                 // 氦闪期间太阳半径（由剧情层写入，0 = 未膨胀）
      burning: false             // 本帧是否正在点火（供尾焰与音效）
    };
    var pAng = START_ANGLES.slice();
    var pW = [], tmpP = [0, 0, 0], tmpV = [0, 0, 0];
    var lapAccum = 0, lastAng = 0;
    var elTmp = {};

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

    // 轨道要素与派生量：每帧一次，供 HUD / 轨道线 / 点火窗口使用
    function updateDerived(rSunNow) {
      var p = st.pos, v = st.vel;
      if (M3D.orbit) {
        st.orbit = M3D.orbit.elements(p[0], p[2], v[0], v[2], G_SUN, st.orbit || elTmp);
        st.peri = M3D.orbit.periWindow(st.orbit);
      }
      var sp = len3(v);
      st.escapeRatio = sp / Math.sqrt(2 * G_SUN / Math.max(1, rSunNow));
    }

    function fail(status, reason, culprit) {
      st.status = status;
      st.reason = reason;
      st.culprit = culprit || '';
      st.thrustMag = 0;
      st.burn = null;
      st.burning = false;
    }

    function check() {
      var p = st.pos, v = st.vel;
      var rSun = len3(p);
      st.rSun = rSun; st.rSunAU = rSun / W.AU;
      if (rSun > st.maxR) st.maxR = rSun;
      if (rSun < st.minR) st.minR = rSun;

      if (rSun < W.SUN_R + W.EARTH_R) { fail('crashed', '地球坠入太阳，任务失败', '太阳'); return; }
      if (st.flashR > 0 && rSun < st.flashR + W.EARTH_R) {
        fail('burned', '太阳氦闪爆发，地球被烈焰吞没', '太阳'); return;
      }

      st.warn = '';
      if (st.frames > SAFE_FRAMES) {
        for (var i = 0; i < PLANETS.length; i++) {
          var d = PLANETS[i];
          var pp = planetPos(i, tmpP);
          var dx = p[0] - pp[0], dy = p[1] - pp[1], dz = p[2] - pp[2];
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < d.rad + W.EARTH_R) { fail('crashed', '地球撞上' + d.name + '，任务失败', d.name); return; }
          if (dist < d.capR) {
            var pv = planetVel(i, tmpV);
            var vx = v[0] - pv[0], vy = v[1] - pv[1], vz = v[2] - pv[2];
            var vrel = Math.sqrt(vx * vx + vy * vy + vz * vz);
            var vesc = Math.sqrt(2 * d.gm / dist);
            if (vrel < vesc) { fail('caught', '地球被' + d.name + '引力捕获，任务失败', d.name); return; }
            st.warn = '进入' + d.name + '引力范围 · 相对速度 ' + (vrel * KMS_PER_UNIT).toFixed(1) +
              ' / 逃逸阈值 ' + (vesc * KMS_PER_UNIT).toFixed(1) + ' km/s';
          }
        }
      }

      if (rSun > W.ESCAPE_R) {
        st.status = 'escaped';
        st.reason = '飞出太阳系，奔向比邻星';
        st.thrustMag = 0;
        st.burn = null;
        st.burning = false;
      }
    }

    function substep(h) {
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

      // ---- 推力：预定量点火优先，其次持续推力 ----
      st.burning = false;
      if (st.burn && st.fuel > 0) {
        var dvStep = Math.min(st.burn.remain, W.thrustAcc * h);
        var eff = 1 + OBERTH_GAIN * st.peri;      // 近日点效率加成：同样燃料换更多速度
        var acc = (dvStep / h) * eff;
        ax += st.burn.dx * acc; az += st.burn.dz * acc;
        st.fuel -= dvStep / W.fuelDv;
        st.burn.remain -= dvStep;
        st.burning = true;
        if (st.burn.remain <= 1e-6 || st.fuel <= 0) st.burn = null;
      } else if (st.thrustMag > 0 && st.fuel > 0) {
        var td = st.thrustDir, tm = st.thrustMag;
        ax += td[0] * W.thrustAcc * tm;
        ay += td[1] * W.thrustAcc * tm;
        az += td[2] * W.thrustAcc * tm;
        st.fuel -= W.thrustAcc * tm * h / W.fuelDv;
        st.burning = true;
      }
      if (st.fuel <= 0) { st.fuel = 0; st.thrustMag = 0; st.burn = null; }

      v[0] += ax * h; v[1] += ay * h; v[2] += az * h;
      p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
      st.spin += h * 0.35;

      // 绕日圈数：累计极角变化（带符号，绕反了会减少）
      var ang = Math.atan2(p[2], p[0]);
      lapAccum += wrapPi(ang - lastAng);
      lastAng = ang;
      st.laps = lapAccum / TAU;
      st.lap = Math.floor(st.laps);

      check();
    }

    g.start = function () {
      if (st.status !== 'ready') return false;
      st.status = 'flying';
      return true;
    };

    // ---- 持续推力（自检 / 兼容路径） ----
    // dir: 世界空间单位向量（XZ 平面）；mag: 0..1
    g.setThrust = function (dir, mag) {
      if (st.status === 'ready' && mag > 0) g.start();
      if (st.burn) return;                       // 预定量点火执行期间不接受持续推力
      if (st.status !== 'flying' || st.fuel <= 0) { st.thrustMag = 0; return; }
      if (!dir || mag <= 0) { st.thrustMag = 0; return; }
      var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
      st.thrustDir[0] = dir[0] / l; st.thrustDir[1] = dir[1] / l; st.thrustDir[2] = dir[2] / l;
      st.thrustMag = Math.max(0, Math.min(1, mag));
    };

    /**
     * 预定量点火：沿 (dx, dz) 方向烧掉 dv 个速度增量后自动停止。
     * 燃料不足时自动截断为剩余燃料能提供的量。
     * @returns 实际接受的速度增量（0 表示未能点火）
     */
    g.commitBurn = function (dx, dz, dv) {
      if (st.status === 'ready') g.start();
      if (st.status !== 'flying' || st.fuel <= 0 || st.burn) return 0;
      var l = Math.sqrt(dx * dx + dz * dz) || 1;
      var maxDv = st.fuel * W.fuelDv;
      var actual = Math.max(0, Math.min(dv, maxDv));
      if (actual <= 1e-4) return 0;
      st.thrustMag = 0;
      st.burn = { dx: dx / l, dz: dz / l, remain: actual, total: actual };
      return actual;
    };

    g.cancelBurn = function () { st.burn = null; };
    g.isBurning = function () { return !!st.burn || st.thrustMag > 0; };

    g.step = function (dtReal) {
      // 待机（ready）：行星照常公转、地球自转，等玩家点火；任务时间不推进
      if (st.status === 'ready') {
        var dtIdle = dtReal * st.timeScale;
        for (var k = 0; k < PLANETS.length; k++) pAng[k] += pW[k] * dtIdle;
        st.spin += dtIdle * 0.35;
        syncPlanets();
        updateDerived(len3(st.pos));
        return;
      }
      if (st.status !== 'flying') { st.thrustMag = 0; st.burn = null; st.burning = false; return; }
      var dt = dtReal * st.timeScale;
      var n = Math.max(1, Math.min(Math.ceil(dt / SUBSTEP), MAX_SUB));
      var h = dt / n;
      for (var i = 0; i < n; i++) {
        substep(h);
        if (st.status !== 'flying') break;
      }
      st.frames += 1;
      st.t += dt;
      st.years = st.t * YEARS_PER_GAME_SEC;
      var sp = len3(st.vel);
      st.speedKms = sp * KMS_PER_UNIT;
      st.rSunAU = len3(st.pos) / W.AU;
      updateDerived(st.rSun);          // st.rSun 已是游戏单位，不要再乘 AU
      syncPlanets();
    };

    // 自检 / 调试专用：直接摆放地球的位置与速度（跳过开局保护帧，立即参与判定）
    g.debugSet = function (pos, vel) {
      st.pos[0] = pos[0]; st.pos[1] = pos[1]; st.pos[2] = pos[2];
      st.vel[0] = vel[0]; st.vel[1] = vel[1]; st.vel[2] = vel[2];
      st.frames = SAFE_FRAMES + 1;
      lastAng = Math.atan2(pos[2], pos[0]);
    };

    g.reset = function () {
      st.status = 'ready'; st.reason = ''; st.culprit = '';
      st.t = 0; st.pos[0] = W.AU; st.pos[1] = 0; st.pos[2] = 0;
      st.vel[0] = 0; st.vel[1] = 0; st.vel[2] = W.V_CIRC;
      st.spin = 0; st.fuel = 1; st.thrustMag = 0;
      st.rSun = W.AU; st.rSunAU = 1; st.speedKms = W.V_CIRC * KMS_PER_UNIT;
      st.years = 0; st.maxR = W.AU; st.minR = W.AU; st.warn = ''; st.frames = 0;
      st.laps = 0; st.lap = 0; st.peri = 0; st.escapeRatio = 0;
      st.burn = null; st.burning = false; st.flashR = 0; st.orbit = null;
      lapAccum = 0; lastAng = 0;
      for (var i = 0; i < PLANETS.length; i++) pAng[i] = START_ANGLES[i];
      syncPlanets();
    };

    syncPlanets();
    lastAng = Math.atan2(st.pos[2], st.pos[0]);
    st.speedKms = W.V_CIRC * KMS_PER_UNIT;
    updateDerived(W.AU);
    return g;
  }

  M3D.createGame = createGame;
  M3D.GAME_CONST = { LAP_TOTAL: LAP_TOTAL, OBERTH_GAIN: OBERTH_GAIN, FLASH_LAP: FLASH_LAP, TAU: TAU };
  M3D.GAME_UNITS = { KMS_PER_UNIT: KMS_PER_UNIT, YEARS_PER_GAME_SEC: YEARS_PER_GAME_SEC, KM_PER_UNIT: KM_PER_UNIT };
})(typeof window !== 'undefined' ? window : this);
