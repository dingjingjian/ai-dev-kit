(function (global) {
  'use strict';
  var M3D = global.M3D, mat4 = M3D.mat4;
  var E = M3D.EARTH;
  var R_E = E.R, MU = E.mu, G0 = E.g0, H_ORB = E.alt, R_ORB = E.r;
  var V_ORB = Math.sqrt(MU / R_ORB);
  var DEG = Math.PI / 180;

  // ---- 显示换算（地球半径按真实 6371 km）----
  var KM_PER_UNIT = E.kmPerUnit;
  var TIME_SCALE = E.timeScale;                 // 1 场景秒 ≈ 6 任务秒
  var MS_PER_UNIT = KM_PER_UNIT * 1000 / TIME_SCALE;
  var T_TOTAL = 92;                             // 进度条满程（场景秒，对应 MET ≈ 552 s）

  // ---- 质量模型（归一化，起飞总质量 1.02，载荷比 1.7%）----
  var PAY = 0.017, FAIR = 0.004, TOW = 0.007;
  var S2D = 0.013, S2F0 = 0.1917;
  var S1D = 0.026, S1F0 = 0.3805;
  var BD = 0.006, BF0 = 0.0892;                 // 单枚助推器 干 / 燃（共 4 枚）
  // ---- 推力与有效排气速度（≈ 比冲 270 s / 336 s；起飞推重比 1.26，末级关机约 5.6 g）----
  var F1 = 0.0641, FB = 0.01603, F2 = 0.01672;
  var VE1 = 4.492, VE2 = 5.594;
  // ---- 俯仰程序（开环）+ 末段高度闭环 ----
  // α = 推力方向与当地铅垂线的夹角：0° 竖直向上，90° 水平指向下程方向
  var T_PITCH = 3.0;                            // 起飞后 18 任务秒开始程序转弯
  var T_TURN = 130.0, A_END = 91 * DEG, TURN_P = 3.0;
  var A_RATE = 3.5 * DEG, AOA_MAX = 10 * DEG;   // 姿态角速率上限 / 攻角上限
  var KG = 0.8, KH = 0.05, VR_CAP = 2.0, W_TERM = 0.62;
  // ---- 时序（场景秒）----
  var IGN_RAMP = 0.9, SEP_DELAY = 0.8;
  var TOWER_ALT = 11.3, FAIRING_ALT = 31.1;     // 40 km / 110 km
  var WARP = 20;                                // 在轨时间加速
  var NOZZLE_S1_Y = 0.12, NOZZLE_S2_Y = 5.26;   // 二级喷口位于二级箭体底部（级间段随一级分离）

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
    cruise: '二级爬升 · 持续加速接近环绕速度',
    seco: '二级关机 · 飞船精确入轨',
    orbit: '在轨运行 · 环绕地球飞行'
  };

  function createLaunchSystem(renderer, rocketModel, pad, hooks) {
    hooks = hooks || {};
    var parts = rocketModel.parts;
    var state = {
      phase: 'prelaunch', t: 0,
      r: R_E, theta: 0, vr: 0, vt: 0,
      alpha: 0, gamma: Math.PI / 2, tilt: Math.PI / 2,
      x: 0, y: 0, alt: 0, speed: 0, vCirc: V_ORB,
      mass: 1.02, accel: 0, gForce: 1, met: 0,
      fuel1: S1F0, fuel2: S2F0, fuelBoost: BF0,
      boostersAttached: true, stage1Attached: true, towerAttached: true, fairingAttached: true,
      ignited: false, inserted: false, orbitBlend: 0, warp: 1, scale: 1,
      progress: 0, sepT: 0
    };
    var fired = {}, acc = {};
    var panels = [];
    for (var pi = 0; pi < parts.length; pi++) if (parts[pi].detachGroup === 'panel') panels.push(parts[pi]);

    function firePhase(key) {
      if (fired[key]) return;
      fired[key] = true;
      if (PHASES[key] && hooks.onPhase) hooks.onPhase(key, PHASES[key]);
    }

    // ---- 常驻尾焰锥 ----
    var flameCoreG = M3D.geom.cylinder(0.30, 0.0001, 2.0, 16);
    var flameBoostG = M3D.geom.cylinder(0.19, 0.0001, 1.3, 12);
    var flameCore = renderer.createMesh(flameCoreG, [1.0, 0.55, 0.15], { group: 'fx' });
    flameCore.alpha = 0; flameCore.glow = 1; flameCore.visible = false;
    var flameBoost = [];
    for (var fb = 0; fb < 4; fb++) {
      var fm = renderer.createMesh(flameBoostG, [1.0, 0.5, 0.12], { group: 'fx' });
      fm.alpha = 0; fm.glow = 1; fm.visible = false;
      flameBoost.push(fm);
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
      var c = Math.cos(state.tilt), s = Math.sin(state.tilt);
      out = out || _lw;
      out[0] = lx * c + ly * s + state.x;
      out[1] = -lx * s + ly * c + state.y;
      out[2] = lz;
      return out;
    }
    function localDirToWorld(dx, dy, dz, out) {
      var c = Math.cos(state.tilt), s = Math.sin(state.tilt);
      out = out || _lw;
      out[0] = dx * c + dy * s;
      out[1] = -dx * s + dy * c;
      out[2] = dz;
      return out;
    }

    function syncWorld() {
      state.x = state.r * Math.sin(state.theta);
      state.y = E.center[1] + state.r * Math.cos(state.theta);
      state.tilt = state.theta + state.alpha;
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
      if (state.phase === 'burn2') return F2;
      return 0;
    }
    function currentMdot() {
      if (state.phase === 'ignition') return currentThrust() / VE1;
      if (state.phase === 'burn1') return (F1 + (state.boostersAttached ? 4 * FB : 0)) / VE1;
      if (state.phase === 'burn2') return F2 / VE2;
      return 0;
    }
    function isBurning() { return state.phase === 'ignition' || state.phase === 'burn1' || state.phase === 'burn2'; }

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
          p.detachV = localDirToWorld(1.25, 1.7, 0.4, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.0];
        } else if (group === 'stage1') {
          p.detachV = localDirToWorld((Math.random() - 0.5) * 0.32, -2.2, (Math.random() - 0.5) * 0.32, [0, 0, 0]).slice();
          p.detachSpin = [(Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7];
        }
      }
      // 分离火光
      var n = group === 'tower' ? 22 : (group === 'stage1' ? 26 : 20);
      var ly = group === 'tower' ? 9.4 : (group === 'stage1' ? 5.0 : (group === 'fairing' ? 8.1 : 1.6));
      if (group === 'booster') {
        for (var b = 0; b < 4; b++) {
          var ba = b * Math.PI / 2;
          localToWorld(Math.cos(ba) * rocketModel.boosterDist, 1.6, Math.sin(ba) * rocketModel.boosterDist, w);
          flashAt(w[0], w[1], w[2], 16);
        }
      } else {
        localToWorld(0, ly, 0, w);
        flashAt(w[0], w[1], w[2], n);
      }
    }

    function flashAt(x, y, z, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, rr = Math.random() * 0.5, sp = 2 + Math.random() * 3;
        renderer.particles.spawn(
          x + Math.cos(a) * rr, y + (Math.random() - 0.4) * 0.5, z + Math.sin(a) * rr,
          Math.cos(a) * sp, (Math.random() - 0.2) * sp, Math.sin(a) * sp,
          1.0, 0.92, 0.6, 0.22 + Math.random() * 0.2, 1.2);
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
      var thin = state.alt > 60;                 // 高空羽流膨胀变淡
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
      if (state.alt < 55) {
        var thinAir = state.alt > 22;
        acc.smoke = (acc.smoke || 0) + (thinAir ? 24 : 40) * dt;
        while (acc.smoke >= 1) {
          acc.smoke -= 1;
          var sa = Math.random() * Math.PI * 2, sr = 0.15 + Math.random() * 0.45;
          var sw = localToWorld(Math.cos(sa) * sr, nozzleY - 0.5, Math.sin(sa) * sr, [0, 0, 0]);
          var sv = 0.7 + Math.random() * 1.3;
          var st = 0.60 + Math.random() * 0.18;
          renderer.particles.spawnSmoke(sw[0], sw[1], sw[2],
            down[0] * sv + (Math.random() - 0.5) * 1.7,
            down[1] * sv + (Math.random() - 0.5) * 0.6,
            down[2] * sv + (Math.random() - 0.5) * 1.7,
            st, st, st * 1.03,
            2.2 + Math.random() * 2.4,          // 寿命
            0.8 + Math.random() * 0.9,          // 初始尺寸
            1.1 + Math.random() * 1.1,          // 膨胀
            thinAir ? 0.7 : 1.3);               // 高空空气稀薄，阻尼小、飘得更远
        }
      }
    }

    // 发射台烟云：导流槽把火焰推向四周，烟团一边翻滚外扩一边上升、逐渐稀薄
    function spawnPadSmoke(dt) {
      acc.pad = (acc.pad || 0) + 70 * dt;
      while (acc.pad >= 1) {
        acc.pad -= 1;
        var a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 3.6;
        var ca = Math.cos(a), sa2 = Math.sin(a);
        var outV = 1.0 + Math.random() * 2.6;          // 径向铺开
        var swirl = (Math.random() - 0.5) * 2.8;       // 切向涡旋，避免整齐的圆环
        var upV = 1.5 + Math.random() * 2.8;           // 受热抬升
        var tint = 0.50 + Math.random() * 0.16;
        renderer.particles.spawnSmoke(
          ca * r, 0.2 + Math.random() * 0.6, sa2 * r,
          ca * outV - sa2 * swirl, upV, sa2 * outV + ca * swirl,
          tint, tint, tint * 1.05,
          2.8 + Math.random() * 2.6,                   // 寿命
          1.5 + Math.random() * 1.7,                   // 初始尺寸
          1.0 + Math.random() * 0.9,                   // 膨胀
          1.6, 0.12);                                  // 阻尼 / 轻微下沉
      }
    }

    function spawnTrail(dt, camDist) {
      acc.trail = (acc.trail || 0) + 40 * dt;
      var sz = Math.max(2, Math.min(100, camDist * 0.017));
      // 头部光点（每帧补一个短寿命亮点，形成发光标记）
      var hw = localToWorld(0, rocketModel.center * state.scale, 0, [0, 0, 0]);
      renderer.particles.spawn(hw[0], hw[1], hw[2], 0, 0, 0,
        0.98, 1.0, 1.0, Math.max(dt * 2.4, 0.05), sz * 3.6, 0);
      while (acc.trail >= 1) {
        acc.trail -= 1;
        var w = localToWorld((Math.random() - 0.5) * 0.4 * state.scale, rocketModel.center * state.scale, (Math.random() - 0.5) * 0.4 * state.scale, [0, 0, 0]);
        renderer.particles.spawn(w[0], w[1], w[2], 0, 0, 0,
          0.60, 0.88, 1.0, 10.0, sz, 0);
      }
    }

    // ---- 尾焰锥网格同步 ----
    function syncFlames() {
      var thrust = isBurning() && !state.inserted;
      var flick = 1 + Math.sin(state.t * 42) * 0.16 + Math.sin(state.t * 23 + 1.7) * 0.1;
      var stage2 = !state.stage1Attached;
      var localY = stage2 ? NOZZLE_S2_Y : NOZZLE_S1_Y;
      var fs = stage2 ? 0.62 : 1.0;
      var widen = 1 + Math.min(state.alt / 70, 1) * 1.4;   // 真空羽流膨胀
      // 尾焰挂在“当前工作级”的喷口上：一二级分离后随二级喷口上移
      var nozW = localToWorld(0, localY, 0, [0, 0, 0]);
      var m = flameCore.modelMatrix;
      mat4.identity(m);
      mat4.translate(m, m, [nozW[0], nozW[1], nozW[2]]);
      mat4.scale(m, m, [state.scale, state.scale, state.scale]);
      mat4.rotateZ(m, m, -state.tilt);
      mat4.scale(m, m, [fs * widen, flick * fs, fs * widen]);
      mat4.translate(m, m, [0, -2.0, 0]);
      flameCore.visible = thrust; flameCore.alpha = thrust ? 0.8 : 0;

      var boostOn = thrust && state.boostersAttached;
      for (var i = 0; i < 4; i++) {
        var ba = i * Math.PI / 2;
        var w = localToWorld(Math.cos(ba) * rocketModel.boosterDist, 0.1, Math.sin(ba) * rocketModel.boosterDist, [0, 0, 0]);
        var bm = flameBoost[i].modelMatrix;
        mat4.identity(bm);
        mat4.translate(bm, bm, [w[0], w[1], w[2]]);
        mat4.scale(bm, bm, [state.scale, state.scale, state.scale]);
        mat4.rotateZ(bm, bm, -state.tilt);
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

      // ---- 姿态指令 α（推力方向相对当地铅垂线）----
      var aCmd = 0;
      if (state.phase === 'orbit') {
        aCmd = Math.PI / 2;                        // 入轨后保持水平（顺行）姿态
      } else if (state.phase !== 'ignition' && state.t >= T_PITCH) {
        // 1) 开环俯仰程序：起飞后按预定曲线由竖直平滑转到接近水平。
        //    一级只完成前半段转弯（分离时 α ≈ 43°），后半段由二级完成。
        var u = Math.min(1, (state.t - T_PITCH) / (T_TURN - T_PITCH));
        aCmd = A_END * (1 - Math.pow(1 - u, TURN_P));
        // 2) 末段高度闭环：按剩余高度差收紧爬升率，保证关机时高度与径向速度同时归零。
        //    权重随速度接近环绕速度而上升——低速段交给程序，避免指令超出控制能力。
        var vCircNow = Math.sqrt(MU / state.r);
        var w = Math.max(0, Math.min(1, (v / vCircNow - W_TERM) / (1 - W_TERM)));
        var vrWant = Math.max(-VR_CAP, Math.min(VR_CAP, KH * (H_ORB - h)));
        var gRef = Math.atan2(vrWant, Math.max(state.vt, 0.02));
        aCmd += Math.max(-AOA_MAX, Math.min(AOA_MAX, w * KG * (gamma - gRef)));
        // α 恒 ≥ 0：推力永不指向上程方向，杜绝起飞初期“往反方向倒一下”
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
        state.fuel2 -= F2 / VE2 * dt;
      }

      // 高度触发分离
      if (state.towerAttached && h > TOWER_ALT) { state.towerAttached = false; detach('tower'); firePhase('towerSep'); }
      if (state.fairingAttached && h > FAIRING_ALT) { state.fairingAttached = false; detach('fairing'); firePhase('fairingSep'); }
      if (!fired.pitch && state.t >= T_PITCH) firePhase('pitch');
      if (!fired.maxQ && state.t > 10.5 && h > 2.2) firePhase('maxQ');   // MET ≈ 63 s，约 8 km
      if (!fired.cruise && state.phase === 'burn2' && state.t > 40) firePhase('cruise');

      // 关机入轨：达到当地环绕速度且径向速度接近 0
      if (state.phase === 'burn2') {
        var vCirc = Math.sqrt(MU / state.r);
        if (state.vt >= vCirc * 0.999 && Math.abs(state.vr) < 0.25) {
          state.phase = 'orbit'; state.inserted = true;
          for (var k = 0; k < panels.length; k++) panels[k].mesh.visible = true;
          firePhase('seco');
        }
      }
    }

    function update(dt, cam) {
      if (!state.ignited) { syncFlames(); return; }
      var warp = 1 + (WARP - 1) * state.orbitBlend;
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
      spawnFlames(dt, camDist);
      if (state.t < 3.0) spawnPadSmoke(dt);
      if (state.inserted) spawnTrail(dt, camDist);

      // 入轨后镜头过渡 + 视觉放大
      var target = state.inserted ? 1 : 0;
      state.orbitBlend += (target - state.orbitBlend) * Math.min(1, dt * 0.34);
      state.scale = 1 + state.orbitBlend * 11.5;
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
      var cx = state.x + noseX * rocketModel.center * s;
      var cy = state.y + noseY * rocketModel.center * s;
      var chaseDist = Math.max(20, Math.min(115, 20 + state.alt * 0.55));
      var tx = cx + (E.center[0] - cx) * k;
      var ty = cy + (E.center[1] - cy) * k;
      var tz = 0 + (E.center[2] - 0) * k;
      var dist = chaseDist + (cam.fitDist - chaseDist) * k;
      var lerpK = Math.min(1, dt * 5);
      cam.targetX += (tx - cam.targetX) * lerpK;
      cam.targetY += (ty - cam.targetY) * lerpK;
      cam.targetZ += (tz - cam.targetZ) * lerpK;
      cam.distance += (dist - cam.distance) * Math.min(1, dt * 2.2);
      cam.yaw += dt * (0.035 + 0.075 * k);
      cam.pitch += ((0.05 + 0.20 * k) - cam.pitch) * Math.min(1, dt * 1.5);
      var shake = 0;
      if (state.t > IGN_RAMP && state.t < 12) shake = 0.05;
      else if (state.t >= 12 && state.t < 20) shake = 0.028;
      cam.shake = shake;
    }

    function reset() {
      state.phase = 'prelaunch'; state.t = 0;
      state.r = R_E; state.theta = 0; state.vr = 0; state.vt = 0;
      state.alpha = 0; state.gamma = Math.PI / 2; state.tilt = Math.PI / 2;
      state.fuel1 = S1F0; state.fuel2 = S2F0; state.fuelBoost = BF0;
      state.boostersAttached = true; state.stage1Attached = true;
      state.towerAttached = true; state.fairingAttached = true;
      state.ignited = false; state.inserted = false; state.orbitBlend = 0;
      state.warp = 1; state.scale = 1; state.progress = 0; state.sepT = 0;
      state.accel = 0; state.gForce = 1; state.met = 0;
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
      update: update, reset: reset, directCamera: directCamera, syncFlames: syncFlames,
      updateDetachedParts: function (dt) {
        // 箭体当前加速度（世界系），用于分离体相对运动
        var A = (isBurning() && !state.inserted) ? currentThrust() / state.mass : 0;
        var c = Math.cos(state.tilt), s = Math.sin(state.tilt);
        M3D.updateDetached(parts, dt, MU, E.center[0], E.center[1], E.center[2],
          s * A, c * A, 0);
      },
      setFitDistance: function (d) { /* 由 app 写入 cam.fitDist */ }
    };
  }

  M3D.createLaunchSystem = createLaunchSystem;
})(typeof window !== 'undefined' ? window : this);
