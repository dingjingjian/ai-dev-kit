/**
 * 流浪地球 · 逃逸截断 —— 主程序
 *
 * 结构：
 *   1. 物理核心 createGame（纯 JS，不依赖 THREE，无头自检可直接调用）
 *   2. 渲染层（依赖 THREE + DOM，无 THREE 时跳过）
 *
 * 玩法：太阳氦闪壳从第 0 秒持续膨胀追击，玩家以第三人称实时拖动地球往外飞，
 *       管理发动机能量节奏、乘耀斑脉冲、躲八颗行星、借木星弹弓，90 秒内飞出 42 AU。
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
  var SAFE_TIME = 0.5;                         // 开局保护：前 0.5 游戏秒不判行星碰撞（按时间计，不能按帧数，否则保护窗口随帧率变化）

  var INTRO_TIME = 2.8;                        // 开场过场时长（秒）：俯视太阳系 → 聚焦地球
  var BASE_GROW = 4.0;                         // 壳基础生长率（单位/秒）
  var PULSE_TIMES = [10, 20, 35, 55, 75];      // 耀斑脉冲触发时刻（5 次）
  var PULSE_GAIN = 4;                          // 脉冲期生长率倍数
  var PULSE_DUR = 1.0;                         // 脉冲持续（秒）
  var PULSE_WARN = 0.3;                        // 脉冲前预警时长（秒）

  var HEAT_MAX = 100;                // 过热条满值
  var HEAT_RATE = 30;                // 满推每秒升温（~3.3 秒烧到过热锁定）
  var COOL_RATE = 12;                // 停机每秒降温（从满到归零需 ~8.3 秒）
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
  // 行星初始相位。曾用离线数值求解（逐颗在 ±180° 内扫描、取参考路线逃逸用时最短者），
  // 但实测收益只有 0.3%（弹弓在当前 gm/推力比下贡献极小，见 DESIGN §9），
  // 而求解出的火星相位会让参考路线在 t≈3.8s 擦过火星、对帧率极度敏感 —— 收益不值这个风险，故保留原相位。
  var START_ANGLES = [0.6, 2.4, 4.6, 1.3, 3.8, 5.2, 2.0, 4.0];

  // 真实单位换算
  var AU_KM = 1.495978707e8;
  var REAL_SEC_PER_GAME_SEC = 5.26e5;
  var KM_PER_UNIT = AU_KM / AU;
  var YEARS_PER_GAME_SEC = REAL_SEC_PER_GAME_SEC / 3.15576e7;
  var KMS_PER_UNIT = KM_PER_UNIT / REAL_SEC_PER_GAME_SEC;

  var TAU = Math.PI * 2;
  function len3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

  // ---- 相机常量（纯数值，渲染层与无头自检共用）----
  var CAM_BACK = 55;          // 基础跟拍距离
  var CAM_UP = 28;            // 相机相对地球的抬升
  var CAM_GAP_EASE = 60;      // 距壳该范围内开始拉远
  var CAM_PANIC_MAX = 1.6;    // 拉远上限倍率
  var CAM_FOV = 60;           // 垂直视场角（度），与 PerspectiveCamera 共用
  var CAM_LOOK_AHEAD = 0.7;   // 注视点前移到地球前方该比例处 → 地球落在画面中心偏下，前方留出视野
  // 星点的点精灵尺寸（CSS 像素）。这是「整张贴图被铺到多少个像素上」的画布尺寸，
  // 不是视觉直径 —— 视觉直径由贴图亮核决定。但两者有硬耦合，见下。
  //   点精灵把整张贴图线性映射到 N×N 像素：第 i 个像素中心采样到的 UV 横坐标是 (i+0.5)/N，
  //   即 UV 只能落在 [0.5/N, 1-0.5/N] 内。N=3.5 时该区间是 [0.14, 0.86]，
  //   离贴图中心最近的一个像素在归一化半径 0.14 处 —— 那里必然是纯白亮核，
  //   而更外侧的像素直接落到已透明区（半径 >0.5）。于是每个星点都被画成一个实心白方块，
  //   贴图上的渐变曲线根本没有被采样到。这就是「满屏白色方格子」的成因。
  //   要让衰减曲线被完整采样（即采到径向形状），至少要 N ≈ 8；取 9 兼顾锐利与柔光。
  var STAR_SIZE = 9;

  // 后视镜：从地球前上方回望，看到地球背面与身后追来的氦闪壳
  var MIRROR_BACK = 26;       // 机位在地球运动方向前方多远
  var MIRROR_UP = 6;          // 机位抬高
  var MIRROR_LOOK = 200;      // 注视点落在地球后方多远
  var MIRROR_FOV = 68;        // 后视镜视场角（比主视角略广）

  // 跟拍距离（纯函数，无 THREE 依赖，供渲染层与无头自检共用）
  // 设计意图：地球在屏幕上的大小基本恒定；壳逼近时最多拉远 CAM_PANIC_MAX 倍制造压迫感。
  // 反例（历史 bug）：直接用无界膨胀的 shellR 线性驱动 → 终局 camBack 逼近 1000，地球缩成一个点。
  function followDist(rSun, shellR) {
    var gap = rSun - shellR;
    var d = CAM_BACK;
    if (gap < CAM_GAP_EASE) {
      d *= 1 + (CAM_GAP_EASE - Math.max(0, gap)) / CAM_GAP_EASE * (CAM_PANIC_MAX - 1);
    }
    return Math.min(d, Math.max(14, rSun - SUN_R));   // 且不越过太阳表面
  }

  // 跟拍方向（纯函数）：地球**运动方向**的单位向量（XZ 平面），相机锚在它正后方看地球向前冲。
  // 速度退化（近零）时回退到径向（远离太阳），避免方向抖动。
  function followDir(vel, pos) {
    var v = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);
    if (v > 1e-3) return [vel[0] / v, vel[2] / v];
    var r = Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]) || 1;
    return [pos[0] / r, pos[2] / r];
  }

  // ---- 行星发动机常量（纯数值，渲染层与无头自检共用）----
  var ENGINE_COUNT = 48;        // 发动机光柱数量（密集分布模拟万台）
  var ENGINE_SHELL = 1.08;      // 安装球半径（EARTH_R 的倍数，需 > 大气 1.06）
  var ENGINE_AXIS = [0, 0, -1]; // 喷流方向：一律平行朝后（局部 -Z），净推力才指向 +Z

  // 行星发动机布局（纯函数，无 THREE 依赖，供渲染层与无头自检共用）
  // 位置：-Z 半球球面（黄金角螺旋，近赤道铺到极点）× EARTH_R × ENGINE_SHELL
  // 朝向：全部平行对齐 ENGINE_AXIS —— 48 台推力同向叠加，净推力指向 +Z
  // 反例（历史 bug）：位置正确但朝向取「球面法线」——赤道附近几乎横向喷射，实测与 -Z 夹角 0°–87°，
  //   仅 7/48 朝后、23/48 侧向，合成方向只剩 0.53，一半推力互相抵消（推不动地球），视觉也成了「刺球」。
  function engineLayout() {
    var out = [];
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < ENGINE_COUNT; i++) {
      var ez = -0.05 - (i / (ENGINE_COUNT - 1)) * 0.95;
      var err = Math.sqrt(Math.max(0, 1 - ez * ez));
      var th = i * golden;
      out.push({
        pos: [Math.cos(th) * err * EARTH_R * ENGINE_SHELL,
              Math.sin(th) * err * EARTH_R * ENGINE_SHELL,
              ez * EARTH_R * ENGINE_SHELL],
        dir: ENGINE_AXIS.slice()
      });
    }
    return out;
  }

  // 屏幕拖动 → 世界推力方向（纯函数，无 THREE 依赖，供渲染层与无头自检共用）
  // 屏幕的「上下左右」映射到世界 XZ 平面的一组**正交基**：
  //   上方 = 相机前向的水平投影（即地球当前运动方向），右方 = 前向绕 Y 轴转 90°。
  // 这样拖动方向与推力方向 1:1、各向同性，斜拖 45° 就是世界 45°。
  // 反例（历史 bug：拖动不跟手）：先按相机基算方向再把 y 归零——相机有俯角，up 的 XZ 投影只剩
  //   sinθ(≈0.45) 而 right 仍是 1，垂直轴灵敏度被压掉一半以上，斜拖 45° 实际偏到 65.6°。
  function screenDragToWorld(dx, dy, fwdX, fwdZ) {
    var fl = Math.sqrt(fwdX * fwdX + fwdZ * fwdZ);
    if (fl < 1e-4) return null;            // 相机几乎垂直俯视，无有效映射
    var fx = fwdX / fl, fz = fwdZ / fl;    // 屏幕上方 → 世界
    // 屏幕位移 (dx 向右、dy 向下) → 世界 = 右*dx + 前*(-dy)，其中右 = (-fz, fx)
    var wx = -fz * dx - fx * dy;
    var wz = fx * dx - fz * dy;
    var l = Math.sqrt(wx * wx + wz * wz);
    if (l < 1e-6) return null;
    return [wx / l, 0, wz / l];
  }

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
      planetCheck: false,    // 开局保护：t > SAFE_TIME 后启用行星碰撞判定
      pulseWarn: 0,
      heat: 0,               // 过热条：推力时上升，停机时回落
      overheated: false,     // 过热锁定：烧到满值置位，必须冷却归零才解锁
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

    // 是否处于耀斑脉冲窗口：脉冲触发后 PULSE_DUR 秒内（唯一判据，生长率与推力加成共用）
    function pulseActive(t) {
      for (var i = 0; i < PULSE_TIMES.length; i++) {
        var pt = PULSE_TIMES[i];
        if (t >= pt && t < pt + PULSE_DUR) return true;
      }
      return false;
    }

    // 氦闪膨胀生长率
    function growRate(t) {
      var r = pulseActive(t) ? BASE_GROW * PULSE_GAIN : BASE_GROW;
      if (t > 20) r += (t - 20) * (t - 20) * 0.01;   // 终局大爆发：随时间二次加速
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
      if (st.planetCheck) {
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
      // 过热管理：推力时升温、松手时自然冷却。
      // 未烧满时可以随意断续使用；一旦烧满触发过热锁定，**必须松手**才能降温，且要冷却归零才解锁。
      // （若锁定期按着也能降温，"一直拖"就几乎没有代价，节奏管理形同虚设。）
      if (st.overheated) {
        if (st.thrustMag === 0) st.heat = Math.max(0, st.heat - COOL_RATE * dt);   // 按着不降温
        if (st.heat <= 0) st.overheated = false;                                   // 归零解锁
      } else if (st.thrustMag > 0) {
        st.heat = Math.min(HEAT_MAX, st.heat + HEAT_RATE * st.thrustMag * dt);
        if (st.heat >= HEAT_MAX) st.overheated = true;                             // 烧满锁定
      } else {
        st.heat = Math.max(0, st.heat - COOL_RATE * dt);
      }
      // 推力效率：过热锁定期间推力无效（0）；非锁定恒为 1（不再随余量衰减）；脉冲窗口内乘波加成
      var eff = st.overheated ? 0 : 1;
      if (eff > 0 && pulseActive(st.t)) eff *= PULSE_THRUST_BOOST;
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
      if (!st.planetCheck && st.t > SAFE_TIME) st.planetCheck = true;   // 开局保护按时间解锁
      var sp = len3(st.vel);
      st.speedKms = sp * KMS_PER_UNIT;
      st.pulseWarn = pulseWarnLevel(st.t);
      syncPlanets();
      // 不设时限：st.t 仅作计时显示，唯一的死线是追在身后的氦闪壳
    };

    g.debugSet = function (pos, vel) {
      st.pos[0] = pos[0]; st.pos[1] = pos[1]; st.pos[2] = pos[2];
      st.vel[0] = vel[0]; st.vel[1] = vel[1]; st.vel[2] = vel[2];
      st.planetCheck = true;   // 直接摆位后立即启用行星判定
    };

    // 调参/自检钩子：写入行星初始相位（长度与 PLANETS 对齐）。START_ANGLES 由数值求解得到，见 DESIGN。
    g.setPlanetAngles = function (arr) {
      for (var i = 0; i < PLANETS.length; i++) if (i < arr.length) START_ANGLES[i] = arr[i];
      for (i = 0; i < PLANETS.length; i++) pAng[i] = START_ANGLES[i];
      syncPlanets();
    };

    g.reset = function () {
      st.status = 'flying'; st.reason = ''; st.culprit = '';
      st.t = 0; st.pos[0] = AU; st.pos[1] = 0; st.pos[2] = 0;
      st.vel[0] = 0; st.vel[1] = 0; st.vel[2] = V_CIRC;
      st.spin = 0; st.thrustMag = 0;
      st.rSun = AU; st.rSunAU = 1; st.speedKms = V_CIRC * KMS_PER_UNIT;
      st.shellR = SUN_R; st.shellV = BASE_GROW; st.escapeRatio = 0;
      st.warn = ''; st.planetCheck = false; st.pulseWarn = 0;
      st.heat = 0; st.overheated = false; st.thrustEff = 1;
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
  global.M3D.followDist = followDist;
  global.M3D.followDir = followDir;
  global.M3D.screenDragToWorld = screenDragToWorld;
  global.M3D.engineLayout = engineLayout;
  global.M3D.WORLD = { AU: AU, SUN_R: SUN_R, EARTH_R: EARTH_R, G_SUN: G_SUN, V_CIRC: V_CIRC, planets: PLANETS };
  global.M3D.CONST = {
    THRUST_ACC: THRUST_ACC, BASE_GROW: BASE_GROW,
    PULSE_TIMES: PULSE_TIMES, PULSE_GAIN: PULSE_GAIN, PULSE_DUR: PULSE_DUR,
    HEAT_MAX: HEAT_MAX, HEAT_RATE: HEAT_RATE, COOL_RATE: COOL_RATE,
    PULSE_THRUST_BOOST: PULSE_THRUST_BOOST,
    ESCAPE_R: ESCAPE_R, KMS_PER_UNIT: KMS_PER_UNIT, YEARS_PER_GAME_SEC: YEARS_PER_GAME_SEC,
    CAM_BACK: CAM_BACK, CAM_UP: CAM_UP, CAM_GAP_EASE: CAM_GAP_EASE, CAM_PANIC_MAX: CAM_PANIC_MAX,
    CAM_FOV: CAM_FOV, CAM_LOOK_AHEAD: CAM_LOOK_AHEAD, STAR_SIZE: STAR_SIZE,
    ENGINE_COUNT: ENGINE_COUNT, ENGINE_SHELL: ENGINE_SHELL, ENGINE_AXIS: ENGINE_AXIS.slice()
  };

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
  var camera = new THREE.PerspectiveCamera(CAM_FOV, W / H, 0.5, 8000);

  // ---- 星空：天球底色与银河带改用「顶点色」画（无贴图），星点用 Points 点精灵 ----
  // 两轮失败的反例都出在天球贴图上，根因是同一个：相机在半径 4000 的天球内部，屏幕只截取约 60° 视场，
  //   贴图每纹素被放大到数屏幕像素 —— ① 第一版把星点画进贴图，1px 星点变成 ~4px 模糊方块；
  //   ② 星点改点精灵后底色与银河雾仍留在贴图上，底色渐变的 8bit 色阶被拉成等距横条，
  //      银河雾（半透明圆斑依次 source-over 叠加）的合成量化台阶被放大成斜向网格，合起来就是「白色方格子」。
  //   提高分辨率只能把格子等比缩小，根除不了。
  // 顶点色是 GPU 在三角形内线性插值的连续量，与纹素、与 canvas 的 8bit 合成精度都无关，放大多少倍都平滑；
  //   代价是球体要够密才撑得住渐变与斜带（96×64 ≈ 6.3k 顶点，静态开销可忽略）。
  // 颜色一律按「线性空间」给：材质输出要过 ACES tone mapping，暗部有死区 ——
  //   线性 <0.003 基本被压成纯黑，所以底色取值比直觉要高一个量级。
  (function () {
    var SKY_R = 4000;
    var geo = new THREE.SphereGeometry(SKY_R, 96, 64);
    var pos = geo.attributes.position, n = pos.count;
    var col = new Float32Array(n * 3);
    var DARK = [0.0022, 0.0032, 0.0070];    // 黄道极方向：接近纯黑
    var LIGHT = [0.0032, 0.0048, 0.0115];   // 黄道面方向：略亮
    var GLOW = [0.0100, 0.0130, 0.0245];    // 银河带叠加
    var GBX = -Math.sin(0.35), GBY = Math.cos(0.35), GSIG = 0.30;   // 银河带：绕 Z 轴倾斜 20° 的大圆
    for (var i = 0; i < n; i++) {
      var vx = pos.getX(i) / SKY_R, vy = pos.getY(i) / SKY_R, vz = pos.getZ(i) / SKY_R;
      var k = Math.pow(1 - Math.abs(vy), 0.7);
      var d = vx * GBX + vy * GBY;
      // 沿带方向的低频絮状起伏，避免带子像一条均匀色块；三元正弦相乘 → 偏向稀疏云絮
      var f = Math.sin(vx * 4.1 + 1.3) * Math.sin(vz * 3.7 - 0.6) * Math.sin(vy * 5.9 + 2.4);
      var band = Math.exp(-(d * d) / (2 * GSIG * GSIG)) * (0.6 + 0.4 * f);
      for (var ch = 0; ch < 3; ch++) {
        col[i * 3 + ch] = DARK[ch] + (LIGHT[ch] - DARK[ch]) * k + GLOW[ch] * band;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false })));
  })();

  (function () {
    // 星点贴图：很小的亮核 + 快速衰减到全透明。
    // 半径归一化到 0.5（即内切圆），衰减曲线的前半段是「亮核」，后半段是柔光。
    // 这条曲线只有在 STAR_SIZE 足够大（见上方注释）时才会被采样到；否则每个点退化成实心白方块。
    var s = 32, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.2)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.04)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    var tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    var n = 3200, R = 3800;
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * TAU, rr = Math.sqrt(Math.max(0, 1 - u * u));
      pos[i * 3] = Math.cos(th) * rr * R; pos[i * 3 + 1] = u * R; pos[i * 3 + 2] = Math.sin(th) * rr * R;
      var b = 0.22 + Math.random() * 0.73;
      col[i * 3] = b; col[i * 3 + 1] = b * (0.96 + Math.random() * 0.06); col[i * 3 + 2] = Math.min(1, b * 1.06);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: STAR_SIZE * DPR,        // sizeAttenuation=false → size 即绘制缓冲像素（× DPR 换算成固定 CSS 像素）
      sizeAttenuation: false, map: tex, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.Points(geo, mat));
  })();

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
  var _zAxis = new THREE.Vector3(0, 0, 1), _negZAxis = new THREE.Vector3(0, 0, -1);
  var _targetQuat = new THREE.Quaternion();

  // ---- 行星发动机光柱（布局见 engineLayout()；earthGroup 转向时随之整体转向）----
  var engineGroup = new THREE.Group(); earthGroup.add(engineGroup);
  var engines = [];
  var engineGeo = new THREE.ConeGeometry(EARTH_R * 0.05, EARTH_R * 0.45, 6);
  var engineMatTpl = { color: 0x5cc8ff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false };
  var engineQuat = new THREE.Quaternion().setFromUnitVectors(_flameAxis, _negZAxis);  // 喷流平行朝后
  var engineSlots = engineLayout();
  for (var ei = 0; ei < engineSlots.length; ei++) {
    var cone = new THREE.Mesh(engineGeo, new THREE.MeshBasicMaterial(engineMatTpl));
    cone.position.set(engineSlots[ei].pos[0], engineSlots[ei].pos[1], engineSlots[ei].pos[2]);
    cone.quaternion.copy(engineQuat);
    engineGroup.add(cone);
    engines.push(cone);
  }

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
  function sfxOverheat() { sfxOsc('square', 360, 110, 0.4, 0.2); }                                  // 过热锁定告警
  function sfxReady() { sfxOsc('sine', 660, 990, 0.25, 0.14); }                                     // 冷却归零可再次点火
  function sfxWin()  { sfxOsc('sine', 523, 784, 0.5, 0.25); setTimeout(function () { sfxOsc('sine', 659, 1046, 0.8, 0.25); }, 220); }
  function sfxLose() { sfxOsc('sine', 220, 60, 1.1, 0.35); }

  // ---- 输入：触屏拖动 = 推力方向 + 强度 ----
  var AIM_DEAD = 12, AIM_FULL = 0.25;
  var pointer = null, pinchDist = 0, userZoom = 1;
  var shortSide = Math.min(W, H);

  function screenToWorldDir(dx, dy) {
    // 取相机前向，交给纯函数映射到世界 XZ 平面（各向同性，见 screenDragToWorld）
    var fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    return screenDragToWorld(dx, dy, fwd.x, fwd.z);
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
    hideHint();
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
  var introT = 0;
  function updateCamera(dt) {
    var ep = st.pos;
    var dir = followDir(st.vel, ep);        // 跟拍方向 = 地球运动方向（XZ 平面单位向量）
    // 自动跟拍距离由纯函数给出（有界），用户捏合缩放作为独立相对倍率叠加
    var camBack = followDist(st.rSun, st.shellR) * userZoom;
    // 相机锚在地球运动方向的正后方，看地球向前冲（同时露出背面发动机与尾焰）
    var tx = ep[0] - dir[0] * camBack;
    var ty = ep[1] + CAM_UP * userZoom;
    var tz = ep[2] - dir[1] * camBack;
    // 注视点前移到地球前方（沿运动方向）→ 地球不居中，落在画面中心偏下，前方留出视野
    var ahead = camBack * CAM_LOOK_AHEAD;
    var lx = ep[0] + dir[0] * ahead;
    var lz = ep[2] + dir[1] * ahead;
    var k = 1 - Math.exp(-dt * 4);
    camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
    camLook.x += (lx - camLook.x) * k; camLook.y += (ep[1] - camLook.y) * k; camLook.z += (lz - camLook.z) * k;
    camera.position.copy(camPos); camera.lookAt(camLook);
  }

  // ---- 后视镜：单 renderer + scissor 画在同一块 canvas 的顶部矩形里（不额外开 WebGL context）----
  var mirrorCam = new THREE.PerspectiveCamera(MIRROR_FOV, 132 / 68, 0.5, 8000);
  var elMirrorFrame = document.getElementById('mirror-frame');
  var mirrorOn = false;
  var mirrorRect = { x: 0, y: 0, w: 0, h: 0, ok: false };

  // 矩形位置直接读 DOM（CSS 负责安全区），JS 不重复实现一套安全区计算
  function layoutMirror() {
    if (!elMirrorFrame) return;
    var r = elMirrorFrame.getBoundingClientRect();
    mirrorRect.x = r.left; mirrorRect.y = r.top; mirrorRect.w = r.width; mirrorRect.h = r.height;
    mirrorRect.ok = r.width > 4 && r.height > 4;
    if (mirrorRect.ok) { mirrorCam.aspect = r.width / r.height; mirrorCam.updateProjectionMatrix(); }
  }

  function updateMirrorCamera() {
    var ep = st.pos;
    var dir = followDir(st.vel, ep);
    mirrorCam.position.set(ep[0] + dir[0] * MIRROR_BACK, ep[1] + MIRROR_UP, ep[2] + dir[1] * MIRROR_BACK);
    mirrorCam.lookAt(ep[0] - dir[0] * MIRROR_LOOK, ep[1], ep[2] - dir[1] * MIRROR_LOOK);
  }

  // ---- HUD ----
  var elClock = document.getElementById('clock-num');
  var elDist = document.getElementById('tm-dist'), elSpeed = document.getElementById('tm-speed'), elEsc = document.getElementById('tm-esc');
  var elWarn = document.getElementById('warn'), elDanger = document.getElementById('danger'), elHint = document.getElementById('hint');
  var elBrief = document.getElementById('brief'), elBfBtn = document.getElementById('bf-btn'), briefClosed = false;
  var elCompass = document.getElementById('compass'), elCmpSvg = document.getElementById('cmp-svg');
  var elProg = document.getElementById('progress'), elProgFill = document.getElementById('prog-fill'), elProgLabel = document.getElementById('prog-label');
  var elHeatWrap = document.getElementById('heat-wrap'), elHeatFill = document.getElementById('heat-fill'), elHeatTag = document.getElementById('heat-tag');
  var elAim = document.getElementById('aim'), elAimName = document.getElementById('aim-name'),
    elAimDist = document.getElementById('aim-dist'), elAimTag = document.getElementById('aim-tag');
  var elRadar = document.getElementById('radar'), radarCtx = elRadar.getContext('2d');
  elRadar.width = 104; elRadar.height = 104;
  var elResult = document.getElementById('result'), elRsTitle = document.getElementById('rs-title'), elRsText = document.getElementById('rs-text'), elRsStat = document.getElementById('rs-stat'), elRsBtn = document.getElementById('rs-btn'), elFlash = document.getElementById('flash');

  function hideHint() { if (elHint) elHint.classList.add('hide'); }

  function updateHUD() {
    // 计时（正计时，不设时限）
    var sec = Math.max(0, st.t);
    elClock.textContent = Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + Math.floor(sec % 60);
    elDist.textContent = st.rSunAU.toFixed(2) + ' AU';
    elSpeed.textContent = st.speedKms.toFixed(1) + ' km/s';
    elEsc.textContent = st.escapeRatio.toFixed(2);
    elEsc.className = 'tm-v' + (st.escapeRatio >= 1 ? ' good' : '');
    var prog = Math.min(1, st.rSun / ESCAPE_R);
    elProgFill.style.width = (prog * 100).toFixed(0) + '%';
    elProgLabel.textContent = '逃逸进度 ' + (prog * 100).toFixed(0) + '%';
    // 过热条：满值 = 过热锁定（必须冷却归零才能再用）
    var heatPct = st.heat / HEAT_MAX;
    elHeatFill.style.width = (heatPct * 100).toFixed(0) + '%';
    elHeatWrap.classList.toggle('hot', heatPct > 0.7 && !st.overheated);
    elHeatWrap.classList.toggle('locked', st.overheated);
    elHeatTag.textContent = st.overheated ? '过热锁定 · 松手冷却' : '发动机温度';
    if (st.pulseWarn > 0) { elWarn.textContent = '⚠ 耀斑脉冲 · 乘波加速全推！'; elWarn.classList.add('show'); }
    else if (st.warn) { elWarn.textContent = st.warn; elWarn.classList.add('show'); }
    else elWarn.classList.remove('show');
    // 危险红边：脉冲预警 或 接近壳
    var danger = st.pulseWarn > 0 || (st.rSun - st.shellR < 30);
    elDanger.classList.toggle('active', danger && st.status === 'flying');
  }

  // 弹弓引导：把「下一颗要穿越轨道的行星」投影到屏幕上，并直读能否安全掠射。
  // 判定用当前相对速度对比「在影响球边缘不被捕获所需速度」√(2gm/capR)。
  var _aimV = new THREE.Vector3();
  function updateAim() {
    if (!elAim) return;
    if (!briefClosed || st.status !== 'flying') { elAim.classList.add('hide'); return; }
    var idx = -1;
    for (var i = 0; i < PLANETS.length; i++) { if (PLANETS[i].orbitR > st.rSun) { idx = i; break; } }
    if (idx < 0) { elAim.classList.add('hide'); return; }
    var def = PLANETS[idx], pp = st.planets[idx];
    _aimV.set(pp.pos[0], pp.pos[1], pp.pos[2]).project(camera);
    if (_aimV.z > 1) { elAim.classList.add('hide'); return; }   // 目标在相机身后
    elAim.style.left = ((_aimV.x * 0.5 + 0.5) * W).toFixed(0) + 'px';
    elAim.style.top = ((-_aimV.y * 0.5 + 0.5) * H).toFixed(0) + 'px';
    var dx = pp.pos[0] - st.pos[0], dy = pp.pos[1] - st.pos[1], dz = pp.pos[2] - st.pos[2];
    var wx = st.vel[0] - pp.vel[0], wy = st.vel[1] - pp.vel[1], wz = st.vel[2] - pp.vel[2];
    var vrel = Math.sqrt(wx * wx + wy * wy + wz * wz);
    var need = Math.sqrt(2 * def.gm / def.capR);   // 掠射影响球而不被捕获的最低相对速度
    var safe = vrel > need * 1.15;
    elAimName.textContent = def.name;
    elAimDist.textContent = (Math.sqrt(dx * dx + dy * dy + dz * dz) / AU).toFixed(2) + ' AU';
    elAimTag.textContent = safe ? '可掠射加速' : '相对速度偏低';
    elAim.classList.toggle('risk', !safe);
    elAim.classList.remove('hide');
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
    prevT = 0; prevOverheated = false; introT = 0;
    camPos.set(0, 380, 0.01); camLook.set(0, 0, 0);
    if (elHint) elHint.classList.remove('hide');
    briefClosed = false; elBrief.classList.remove('show');
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
  var prevT = 0, prevOverheated = false;
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
      // 终点与 updateCamera 的跟拍位姿严格对齐（机位 = 地球 - 运动方向*CAM_BACK，注视点 = 地球前方），
      // 避免过场结束时镜头甩一下
      camPos.set(AU * e, 380 * (1 - e) + CAM_UP * e, 0.01 * (1 - e) - CAM_BACK * e);
      camLook.set(AU * e, 0, CAM_BACK * CAM_LOOK_AHEAD * e);
      camera.position.copy(camPos); camera.lookAt(camLook);
    } else if (briefClosed && st.status === 'flying') {
      game.step(dt);
      // 耀斑脉冲触发边沿：白闪 + 爆音
      for (var pi2 = 0; pi2 < PULSE_TIMES.length; pi2++) {
        if (prevT < PULSE_TIMES[pi2] && st.t >= PULSE_TIMES[pi2]) { flashScreen(); sfxBoom(); }
      }
      // 过热锁定 / 冷却归零解锁的边沿音
      if (st.overheated !== prevOverheated) {
        prevOverheated = st.overheated;
        if (st.overheated) sfxOverheat(); else sfxReady();
      }
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

    if (introT >= INTRO_TIME) updateCamera(dt);

    // 顶部罗盘：箭头指向逃离太阳方向
    if (briefClosed && st.status === 'flying') {
      mirrorOn = true;
      elCompass.classList.remove('hide');
      elProg.classList.remove('hide');
      elHeatWrap.classList.remove('hide');
      elRadar.classList.remove('hide');
      if (elMirrorFrame) elMirrorFrame.classList.remove('hide');
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
    } else {
      mirrorOn = false;
      elCompass.classList.add('hide'); elProg.classList.add('hide');
      elHeatWrap.classList.add('hide'); elRadar.classList.add('hide');
      if (elMirrorFrame) elMirrorFrame.classList.add('hide');
    }

    updateHUD();
    drawRadar();

    if (st.status !== 'flying' && !elResult.classList.contains('show')) showResult();

    if (!loaderHidden) { document.getElementById('loader').classList.add('hide'); loaderHidden = true; }

    // 主视角
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.render(scene, camera);
    updateAim();   // 放在 render 之后：project() 依赖本帧刚更新的相机矩阵

    // 后视镜：只重绘顶部那块矩形（scissor 限制清屏范围，避免整屏重画两遍）
    if (mirrorOn && mirrorRect.ok) {
      updateMirrorCamera();
      var my = H - (mirrorRect.y + mirrorRect.h);   // WebGL 视口原点在左下角
      renderer.setScissorTest(true);
      renderer.setViewport(mirrorRect.x, my, mirrorRect.w, mirrorRect.h);
      renderer.setScissor(mirrorRect.x, my, mirrorRect.w, mirrorRect.h);
      renderer.render(scene, mirrorCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
    }

    requestAnimationFrame(frame);
  }
  layoutMirror();
  requestAnimationFrame(frame);

  // 窗口缩放
  addEventListener('resize', function () {
    W = innerWidth; H = innerHeight; shortSide = Math.min(W, H);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    layoutMirror();
  });
})(typeof window !== 'undefined' ? window : this);
