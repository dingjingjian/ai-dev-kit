(function (global) {
  'use strict';
  var M3D = global.M3D, mat4 = M3D.mat4;

  // ---- 物理参数（场景单位）参照 rocket-launch 的真实物理模型 ----
  // a = (F - m·g·cos(pitch)) / m，燃料消耗驱动质量变化，重力随高度衰减
  var G0 = 1.6;            // 地表重力加速度
  var RE = 600;            // 地球半径（场景单位）
  var S1 = { F: 5.5, mdot: 0.011, fuel0: 0.15, dry: 1.5 };  // 芯一级
  var BOOST = { F: 0.35, mdot: 0.005, fuel0: 0.05, dry: 0.2 }; // 单枚助推器（共4枚）
  var S2 = { F: 1.2, mdot: 0.02, fuel0: 0.15, dry: 0.5 };   // 芯二级
  var PAY = 0.08;          // 载荷（飞船）
  var TOWER_MASS = 0.02;   // 逃逸塔质量
  var FAIRING_MASS = 0.04; // 整流罩质量
  var IGNITION_RAMP = 1.5; // 点火推力上升时间(s)
  var SEP_DELAY = 1.0;     // 一二级分离到二级点火的延迟(s)
  var TOWER_SEP_ALT = 8;   // 逃逸塔分离高度
  var FAIRING_SEP_ALT = 20;// 整流罩分离高度
  var LAUNCH_END = 28;

  // 二级发动机在箭体局部 y≈5.08（级间段位置）；一级喷口在 y≈0.1
  var NOZZLE_STAGE1_Y = 0.12;
  var NOZZLE_STAGE2_Y = 5.08;

  var PHASE_MAP = {
    ignition: { key: 'ignition', text: '点火 · 发动机启动，尾焰喷涌' },
    liftoff: { key: 'liftoff', text: '起飞 · 离开发射台垂直升空' },
    boosterSep: { key: 'boosterSep', text: '助推器分离 · 四枚助推器脱落' },
    towerSep: { key: 'towerSep', text: '逃逸塔分离 · 抛离逃逸塔' },
    stage1Sep: { key: 'stage1Sep', text: '一二级分离 · 一级脱落，二级即将点火' },
    fairingSep: { key: 'fairingSep', text: '整流罩分离 · 飞船露出' },
    stage2Burn: { key: 'stage2Burn', text: '二级燃烧 · 继续加速冲向太空' },
    coast: { key: 'coast', text: '关机滑行 · 依靠惯性上升' },
    done: { key: 'done', text: '发射成功 · 飞船入轨' }
  };

  function createLaunchSystem(renderer, rocketModel, pad, hooks) {
    hooks = hooks || {};
    var parts = rocketModel.parts;
    var state = {
      phase: 'prelaunch', t: 0, x: 0, y: 0, v: 0, pitch: 0, ignited: false, done: false,
      fuel1: S1.fuel0, fuel2: S2.fuel0, fuelBoost: BOOST.fuel0,
      boostersAttached: true, stage1Attached: true, towerAttached: true, fairingAttached: true,
      sepT: 0
    };
    var fired = {};
    var acc = { core: 0, boost: 0, smoke: 0 };

    function firePhase(key) {
      if (fired[key]) return;
      fired[key] = true;
      var ph = PHASE_MAP[key];
      if (ph && hooks.onPhase) hooks.onPhase(ph);
    }

    // 常驻尾焰锥（粒子之外的持续喷流）
    var flameCoreG = M3D.geom.cylinder(0.26, 0.0001, 1.8, 16);
    var flameBoostG = M3D.geom.cylinder(0.18, 0.0001, 1.2, 12);
    var flameCore = renderer.createMesh(flameCoreG, [1.0, 0.55, 0.15], { group: 'fx' });
    flameCore.alpha = 0; flameCore.glow = 1; flameCore.visible = false;
    var flameBoost = [];
    for (var fb = 0; fb < 4; fb++) {
      var fm = renderer.createMesh(flameBoostG, [1.0, 0.5, 0.12], { group: 'fx' });
      fm.alpha = 0; fm.glow = 1; fm.visible = false;
      flameBoost.push(fm);
    }

    function isBurning() {
      return state.phase === 'ignition' || state.phase === 'burn1' || state.phase === 'burn2';
    }

    function updateFlames(rotYG) {
      var thrust = state.ignited && !state.done && isBurning();
      var flick = 1 + Math.sin(state.t * 42) * 0.16 + Math.sin(state.t * 23 + 1.7) * 0.1;
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      // 主火焰：一级分离前从一级底部喷出，分离后从二级底部喷出
      var stage2 = !state.stage1Attached;
      var localNozzleY = stage2 ? NOZZLE_STAGE2_Y : NOZZLE_STAGE1_Y;
      var flameScale = stage2 ? 0.62 : 1.0;
      var nx = localNozzleY * sp + state.x;
      var ny = localNozzleY * cp + state.y;
      var m = flameCore.modelMatrix;
      mat4.identity(m);
      mat4.translate(m, m, [nx, ny, 0]);
      mat4.rotateZ(m, m, -state.pitch);
      mat4.scale(m, m, [flameScale, flick * flameScale, flameScale]);
      mat4.translate(m, m, [0, -1.8, 0]);
      flameCore.visible = thrust; flameCore.alpha = thrust ? 0.8 : 0;
      // 助推器火焰（助推器未分离时）
      var boostOn = thrust && state.boostersAttached;
      for (var i = 0; i < 4; i++) {
        var ba = i * Math.PI / 2;
        var lx = Math.cos(ba) * rocketModel.boosterDist;
        var lz = Math.sin(ba) * rocketModel.boosterDist;
        var ly = 0.08;
        var bx = lx * cp + ly * sp + state.x;
        var by = -lx * sp + ly * cp + state.y;
        var bm = flameBoost[i].modelMatrix;
        mat4.identity(bm);
        mat4.translate(bm, bm, [bx, by, lz]);
        mat4.rotateZ(bm, bm, -state.pitch);
        mat4.scale(bm, bm, [1, flick, 1]);
        mat4.translate(bm, bm, [0, -1.2, 0]);
        flameBoost[i].visible = boostOn; flameBoost[i].alpha = boostOn ? 0.8 : 0;
      }
    }

    // 当前总质量 = 结构干重 + 剩余燃料
    function currentMass() {
      var m = PAY + S2.dry + state.fuel2;
      if (state.towerAttached) m += TOWER_MASS;
      if (state.fairingAttached) m += FAIRING_MASS;
      if (state.stage1Attached) m += S1.dry + state.fuel1;
      if (state.boostersAttached) m += 4 * (BOOST.dry + state.fuelBoost);
      return m;
    }

    // 当前推力（点火阶段推力渐升）
    function currentThrust() {
      var ramp = 1;
      if (state.phase === 'ignition') ramp = Math.min(state.t / IGNITION_RAMP, 1);
      if (state.phase === 'ignition' || state.phase === 'burn1') {
        var F = S1.F;
        if (state.boostersAttached) F += 4 * BOOST.F;
        return F * ramp;
      }
      if (state.phase === 'burn2') return S2.F;
      return 0;
    }

    // 当前燃料消耗率
    function currentMdot() {
      var ramp = 1;
      if (state.phase === 'ignition') ramp = Math.min(state.t / IGNITION_RAMP, 1);
      if (state.phase === 'ignition' || state.phase === 'burn1') {
        var md = S1.mdot;
        if (state.boostersAttached) md += 4 * BOOST.mdot;
        return md * ramp;
      }
      if (state.phase === 'burn2') return S2.mdot;
      return 0;
    }

    // 重力转弯程序：起飞数秒后开始倾斜，角度较小避免飞出视野
    function pitchAt(t) {
      if (t < 8) return 0;
      if (t < 15) return (t - 8) / 7 * 0.15;
      if (t < 24) return 0.15 + (t - 15) / 9 * 0.2;
      return 0.35;
    }

    // 火箭局部坐标 → 世界坐标（Rz(-pitch) 让倾斜方向与飞行方向一致）
    function localToWorld(lx, ly, lz) {
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      return [lx * cp + ly * sp + state.x, -lx * sp + ly * cp + state.y, lz];
    }
    function localDirToWorld(dx, dy, dz) {
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      return [dx * cp + dy * sp, -dx * sp + dy * cp, dz];
    }

    function rotY(x, z, g) {
      var c = Math.cos(g), s = Math.sin(g);
      return [x * c - z * s, z * c + x * s];
    }

    function flashAt(x, y, z, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
        var sp = 2 + Math.random() * 3;
        renderer.particles.spawn(
          x + Math.cos(a) * r, y + (Math.random() - 0.4) * 0.5, z + Math.sin(a) * r,
          Math.cos(a) * sp, (Math.random() - 0.2) * sp, Math.sin(a) * sp,
          1.0, 0.92, 0.6, 0.22 + Math.random() * 0.2, 1.4);
      }
    }

    function detach(group) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.detachGroup !== group || p.detached) continue;
        p.detached = true; p.detachT = state.t; p.detachBaseY = state.y;
        p.detachX = state.x; p.detachPitch = state.pitch;
        p.detachOff = [0, 0, 0]; p.detachRot = [0, 0, 0];
        if (group === 'booster') {
          var len = Math.sqrt(p.ox * p.ox + p.oz * p.oz) || 1;
          p.detachV = [(p.ox / len) * 2.6, -1.2 + Math.random() * 0.4, (p.oz / len) * 2.6];
          p.detachSpin = [(Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.0];
        } else if (group === 'tower') {
          p.detachV = [1.1, 4.6, 0.4];
          p.detachSpin = [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6];
        } else if (group === 'fairing') {
          p.detachV = [1.7, 2.4, 0.6];
          p.detachSpin = [(Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.4];
        } else if (group === 'stage1') {
          // 一级沿箭体后方分离（局部 -Y），略带侧向扰动
          p.detachV = [(Math.random() - 0.5) * 0.4, -3.2, (Math.random() - 0.5) * 0.4];
          p.detachSpin = [(Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9];
        }
      }
      if (group === 'booster') {
        for (var b = 0; b < 4; b++) {
          var ba = b * Math.PI / 2;
          var wp = localToWorld(Math.cos(ba) * rocketModel.boosterDist, 1.6, Math.sin(ba) * rocketModel.boosterDist);
          flashAt(wp[0], wp[1], wp[2], 18);
        }
      } else if (group === 'tower') {
        var wt = localToWorld(0, 9.4, 0); flashAt(wt[0], wt[1], wt[2], 22);
      } else if (group === 'stage1') {
        var ws = localToWorld(0, 5.0, 0); flashAt(ws[0], ws[1], ws[2], 24);
      } else if (group === 'fairing') {
        var wf = localToWorld(0, 8.1, 0); flashAt(wf[0], wf[1], wf[2], 20);
      }
    }

    function spawnFlames(dt, rotYG) {
      var ramp = Math.min(state.t / IGNITION_RAMP, 1);
      var burning = isBurning();
      var stage2 = !state.stage1Attached;
      var coreOn = burning && !state.done;
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      var nozzleY = stage2 ? NOZZLE_STAGE2_Y : NOZZLE_STAGE1_Y;
      var nozzleW = localToWorld(0, nozzleY, 0);
      var downDir = [-sp, -cp, 0]; // 局部 -Y 方向旋转到世界（向后下方喷）
      var coreRate = stage2 ? 38 : 60;
      var hotRate = stage2 ? 16 : 26;
      // 主火焰
      acc.core += (coreOn ? coreRate : 0) * dt * ramp;
      while (acc.core >= 1) {
        acc.core -= 1;
        var a = Math.random() * Math.PI * 2, r = Math.random() * 0.16;
        var lx = Math.cos(a) * r, lz = Math.sin(a) * r;
        var ox = lx * cp, oy = -lx * sp;
        var speed = (6 + Math.random() * 5) * ramp;
        renderer.particles.spawn(
          nozzleW[0] + ox, nozzleW[1] + oy, nozzleW[2] + lz,
          ox * 5 + (Math.random() - 0.5) * 1.4 + downDir[0] * speed,
          downDir[1] * speed + (Math.random() - 0.5) * 0.5,
          lz * 5 + (Math.random() - 0.5) * 1.4 + downDir[2] * speed,
          1.0, 0.36 + Math.random() * 0.35, 0.05 + Math.random() * 0.12, 0.4 + Math.random() * 0.35, 1.2);
      }
      // 高温内焰
      acc.hot = (acc.hot || 0) + (coreOn ? hotRate : 0) * dt * ramp;
      while (acc.hot >= 1) {
        acc.hot -= 1;
        var ha = Math.random() * Math.PI * 2, hr = Math.random() * 0.07;
        var hlx = Math.cos(ha) * hr, hlz = Math.sin(ha) * hr;
        var hox = hlx * cp, hoy = -hlx * sp;
        var hspeed = (3.5 + Math.random() * 2.5) * ramp;
        renderer.particles.spawn(
          nozzleW[0] + hox, nozzleW[1] + hoy, nozzleW[2] + hlz,
          (Math.random() - 0.5) * 0.8 + downDir[0] * hspeed,
          downDir[1] * hspeed + (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.8 + downDir[2] * hspeed,
          1.0, 0.9, 0.72, 0.15 + Math.random() * 0.1, 0.9);
      }
      // 助推器火焰
      if (state.boostersAttached && burning) {
        acc.boost += 46 * dt * ramp;
        while (acc.boost >= 1) {
          acc.boost -= 1;
          var bi = (Math.random() * 4) | 0, ba2 = bi * Math.PI / 2;
          var blx = Math.cos(ba2) * rocketModel.boosterDist;
          var blz = Math.sin(ba2) * rocketModel.boosterDist;
          var bwp = localToWorld(blx, 0.12, blz);
          var a3 = Math.random() * Math.PI * 2, r3 = Math.random() * 0.11;
          var olx = Math.cos(a3) * r3, olz = Math.sin(a3) * r3;
          var box = olx * cp, boy = -olx * sp;
          var bspeed = (5 + Math.random() * 4) * ramp;
          renderer.particles.spawn(
            bwp[0] + box, bwp[1] + boy, bwp[2] + olz,
            box * 3.4 + (Math.random() - 0.5) * 0.9 + downDir[0] * bspeed,
            downDir[1] * bspeed + (Math.random() - 0.5) * 0.4,
            olz * 3.4 + (Math.random() - 0.5) * 0.9 + downDir[2] * bspeed,
            1.0, 0.32 + Math.random() * 0.3, 0.04 + Math.random() * 0.1, 0.4 + Math.random() * 0.3, 1.1);
        }
      }
      // 烟气拖尾（沿喷流方向下方扩散，高空稀薄不再生成）
      if (state.y < 35) {
        acc.smoke += 14 * dt;
        while (acc.smoke >= 1) {
          acc.smoke -= 1;
          var sa = Math.random() * Math.PI * 2, sr = 0.2 + Math.random() * 0.3;
          var slx = Math.cos(sa) * sr, slz = Math.sin(sa) * sr;
          var smkW = localToWorld(slx, nozzleY - 0.5, slz);
          var sms = 1 + Math.random();
          renderer.particles.spawn(
            smkW[0], smkW[1], smkW[2],
            downDir[0] * sms * 0.5 + (Math.random() - 0.5) * 1.2,
            downDir[1] * sms + (Math.random() - 0.5) * 0.5,
            downDir[2] * sms * 0.5 + (Math.random() - 0.5) * 1.2,
            0.36, 0.33, 0.31, 0.9 + Math.random() * 0.7, 1.8);
        }
      }
    }

    function spawnPadSmoke(dt) {
      acc.pad = (acc.pad || 0) + 40 * dt;
      while (acc.pad >= 1) {
        acc.pad -= 1;
        var a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 2.8;
        renderer.particles.spawn(Math.cos(a) * r, 0.18, Math.sin(a) * r,
          Math.cos(a) * (1.2 + Math.random() * 2.4), 0.6 + Math.random() * 1.4, Math.sin(a) * (1.2 + Math.random() * 2.4),
          0.56, 0.56, 0.59, 1.3 + Math.random() * 0.9, 2.4);
      }
    }

    function directCamera(cam, dt) {
      if (!state.ignited) return;
      var centerW = localToWorld(0, rocketModel.center, 0);
      var lookDown = Math.max(0, 1 - state.y / 5);
      var lead = state.done ? 0 : state.v * 0.16;
      var ty = centerW[1] - 0.6 - lookDown * 2.6 + lead;
      cam.targetY += (ty - cam.targetY) * Math.min(1, dt * 6);
      cam.targetX += (centerW[0] - cam.targetX) * Math.min(1, dt * 6);
      var dist = state.done ? 42 : (13 + Math.min(state.y * 0.05, 6));
      cam.distance += (dist - cam.distance) * Math.min(1, dt * 1.4);
      cam.yaw += dt * (state.done ? 0.12 : 0.06);
      var shake = 0;
      if (state.t > IGNITION_RAMP && state.t < 11) shake = 0.055;
      else if (state.t >= 11 && state.t < 17) shake = 0.03;
      cam.shake = shake;
      // 让主光随相机偏航，避免飞行中转到背光面
      var la = cam.yaw + 0.8;
      renderer.light.dir[0] = Math.cos(la) * 0.7;
      renderer.light.dir[1] = 0.75;
      renderer.light.dir[2] = Math.sin(la) * 0.7;
    }

    // ---- 物理步进（参照 rocket-launch 的 step 函数）----
    function step(dt) {
      state.t += dt;
      var F = currentThrust();
      var md = currentMdot();
      var m = currentMass();
      var g = G0 * Math.pow(RE / (RE + Math.max(0, state.y)), 2);
      // 沿飞行方向加速度：推力沿飞行方向，重力在飞行方向反向分量 g·cos(pitch)
      var a = (F - m * g * Math.cos(state.pitch)) / m;

      // 点火阶段：推力渐升，未达起飞条件时留在台上
      if (state.phase === 'ignition') {
        if (state.t >= IGNITION_RAMP && F > m * g) {
          state.phase = 'burn1';
          firePhase('liftoff');
        } else {
          state.v = 0;
          state.pitch = 0;
          return;
        }
      }

      // 速度、位置更新
      state.v += a * dt;
      if (state.v < 0) state.v = 0;
      state.pitch = pitchAt(state.t);
      state.x += state.v * Math.sin(state.pitch) * dt;
      state.y += state.v * Math.cos(state.pitch) * dt;
      if (state.y < 0) state.y = 0;

      // 燃料消耗与阶段转换
      if (state.phase === 'burn1') {
        if (state.boostersAttached) {
          state.fuelBoost -= BOOST.mdot * dt;
          if (state.fuelBoost <= 0) {
            state.fuelBoost = 0;
            state.boostersAttached = false;
            detach('booster');
            firePhase('boosterSep');
          }
        }
        state.fuel1 -= S1.mdot * dt;
        if (state.fuel1 <= 0) {
          state.fuel1 = 0;
          state.stage1Attached = false;
          detach('stage1');
          firePhase('stage1Sep');
          state.phase = 'sep';
          state.sepT = SEP_DELAY;
        }
      } else if (state.phase === 'sep') {
        state.sepT -= dt;
        if (state.sepT <= 0) {
          state.phase = 'burn2';
          firePhase('stage2Burn');
        }
      } else if (state.phase === 'burn2') {
        state.fuel2 -= S2.mdot * dt;
        if (state.fuel2 <= 0) {
          state.fuel2 = 0;
          state.phase = 'coast';
          firePhase('coast');
        }
      } else if (state.phase === 'coast') {
        // 惯性滑行，速度降至阈值或到 LAUNCH_END 即入轨
        if (state.v < 4 || state.t > LAUNCH_END) {
          state.done = true;
          state.phase = 'done';
          firePhase('done');
        }
      }

      // 高度触发的分离（逃逸塔、整流罩）
      if (state.towerAttached && state.y > TOWER_SEP_ALT) {
        state.towerAttached = false;
        detach('tower');
        firePhase('towerSep');
      }
      if (state.fairingAttached && state.y > FAIRING_SEP_ALT) {
        state.fairingAttached = false;
        detach('fairing');
        firePhase('fairingSep');
      }
    }

    function update(dt, rotYG) {
      if (!state.ignited) return;
      if (state.done) {
        // 入轨后保持位置，姿态缓慢趋于水平飞行
        var targetPitch = 0.35;
        state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 1.5);
        return;
      }
      // 子步进积分（参照 rocket-launch：hMax=1/120 保证精度）
      var remaining = dt, hMax = 1 / 120;
      while (remaining > 1e-6 && !state.done) {
        var h = Math.min(hMax, remaining);
        step(h);
        remaining -= h;
      }
      spawnFlames(dt, rotYG);
      if (state.t < 3.2) spawnPadSmoke(dt);
      if (pad.ember) {
        var glow = state.t < IGNITION_RAMP ? state.t / IGNITION_RAMP : Math.max(0, 1 - (state.t - IGNITION_RAMP) / 2.5);
        pad.ember.glow = glow * 0.9;
      }
    }

    function reset() {
      state.phase = 'prelaunch'; state.t = 0; state.x = 0; state.y = 0; state.v = 0; state.pitch = 0;
      state.ignited = false; state.done = false;
      state.fuel1 = S1.fuel0; state.fuel2 = S2.fuel0; state.fuelBoost = BOOST.fuel0;
      state.boostersAttached = true; state.stage1Attached = true;
      state.towerAttached = true; state.fairingAttached = true;
      state.sepT = 0;
      fired = {}; acc.core = 0; acc.boost = 0; acc.smoke = 0; acc.hot = 0; acc.pad = 0;
      if (pad.ember) pad.ember.glow = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.detached = false; p.detachOff = [0, 0, 0]; p.detachV = [0, 0, 0];
        p.detachRot = [0, 0, 0]; p.detachSpin = [0, 0, 0];
        p.mesh.visible = true; p.mesh.alpha = 1;
      }
      renderer.particles.reset();
    }

    return {
      state: state, end: LAUNCH_END,
      ignite: function () { state.ignited = true; state.phase = 'ignition'; firePhase('ignition'); },
      update: update, reset: reset, directCamera: directCamera,
      syncFlames: updateFlames,
      updateDetachedParts: function (dt) { M3D.updateDetached(parts, dt); }
    };
  }

  M3D.createLaunchSystem = createLaunchSystem;
})(typeof window !== 'undefined' ? window : this);
