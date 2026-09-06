(function () {
  'use strict';
  var M3D = window.M3D;
  var E = M3D.EARTH;
  var R_E = E.R;

  var canvas = document.getElementById('stage');
  var fallback = document.getElementById('fallback');
  var loader = document.getElementById('loader');
  var wrap = document.getElementById('stage-wrap');
  var labelLayer = document.getElementById('labels');
  var phaseText = document.getElementById('phase-text');
  var btnShow = document.getElementById('btn-show');
  var btnExplode = document.getElementById('btn-explode');
  var btnLaunch = document.getElementById('btn-launch');
  var btnIgnite = document.getElementById('btn-ignite');
  var btnWarp = document.getElementById('btn-warp');
  var progressFill = document.getElementById('progress-fill');
  var descBox = document.getElementById('desc-box');
  var descTitle = document.getElementById('desc-title');
  var descText = document.getElementById('desc-text');
  var countdownEl = document.getElementById('countdown');
  var telemetryEl = document.getElementById('telemetry');

  var renderer = M3D.createRenderer(canvas);
  if (!renderer) {
    if (loader) loader.classList.add('hide');
    if (canvas) canvas.style.display = 'none'; if (fallback) fallback.style.display = 'flex'; return;
  }

  var audio = M3D.createAudio ? M3D.createAudio() : null;

  var rocketModel = M3D.buildCZ2F(renderer);
  var pad = M3D.buildPad(renderer);
  var parts = rocketModel.parts;

  // WebGL 上下文丢失：淡出载入层并显示降级提示（与 earth-3d 行为一致）
  canvas.addEventListener('webglcontextlost', function () {
    hideLoader();
    if (fallback) fallback.style.display = 'flex';
  }, false);

  // 地球卫星影像（等距圆柱投影）；加载成功后替换程序化地表，失败则保持后备方案
  var earthTex = renderer.createTexture('assets/earth.jpg', function (ok) {
    if (ok && pad.earth) pad.earth.texture = earthTex;
  });

  var mode = 'show', explodeAmount = 0, explodeTarget = 0, autoRot = 0, groupRotY = 0;
  var countdown = 0, lastCount = -1, igniteFlash = 0;
  var padAlpha = 1, spinGate = 0, axisRoll = 0;   // 发射台可见度 / 自转倍率 / 在轨镜头翻转角
  var transitEye0 = null, transitPrevK = 0;       // 在轨过渡镜头弧线的起点捕获
  var orbitSun = null, lastOrbitK = 0;            // 入轨后冻结的太阳方向（世界系）及上帧过渡因子
  var cam = {
    yaw: 0.42, pitch: 0.06, distance: 16, fitDist: 5200,
    targetX: 0, targetY: rocketModel.center, targetZ: 0, shake: 0
  };

  var launch = M3D.createLaunchSystem(renderer, rocketModel, pad, {
    onPhase: function (key, text) {
      queuePhase(text);
      // 阶段音效：分离类事件给金属反冲闷响，入轨给轻和弦（点火/起飞由隆隆声覆盖）
      if (!audio) return;
      if (key === 'towerSep') audio.clank(0.8);
      else if (key === 'boosterSep') audio.clank(1.0);
      else if (key === 'stage1Sep') audio.clank(1.2);
      else if (key === 'stage2Ignition') audio.clank(0.5);
      else if (key === 'fairingSep') audio.clank(0.9);
      else if (key === 'seco' || key === 'orbit') audio.chime();
      else if (key === 'shipSep') audio.clank(0.7);
    }
  });
  var launchState = launch.state;

  // ---- 阶段字幕队列：每条字幕保证最短停留时间 ----
  // 分离类事件在 MET 上很密集（如一二级分离 MET154 → 二级点火 MET156 仅隔
  // 0.3 场景秒），直接跟着事件刷会让字幕一闪而过。事件只入队，字幕按
  // 最短停留时间依次播出，保证每条都看得清。
  var PHASE_MIN_SHOW = 2.4;   // 每条字幕最短停留（秒）
  var phaseQueue = [], phaseTimer = 0;
  function queuePhase(text) {
    if (!text) return;
    if (phaseQueue.length >= 4) phaseQueue.shift();   // 队列满则丢弃最旧的，保最新事件可见
    phaseQueue.push(text);
  }
  function showPhaseText(text) {
    if (!phaseText) return;
    phaseText.textContent = text;
    phaseText.classList.remove('phase-in');
    void phaseText.offsetWidth;   // 重启动画
    phaseText.classList.add('phase-in');
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var qualityDrop = false, frameTimes = [], lastCheck = 0;

  // ---- 背景：地表蓝天 → 高空深蓝 → 太空黑 ----
  var BG = {
    ground: [0.23, 0.43, 0.74], mid: [0.05, 0.105, 0.26], high: [0.012, 0.018, 0.045], space: [0.006, 0.008, 0.016]
  };
  // 拆解模式的独立展示空间：深空底色 + 星场，地球/发射台/大气淡出
  var STUDIO_BG = [0.026, 0.034, 0.055];
  var studioBlend = 0;
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function bgColor(alt) {
    if (alt < 30) return lerp3(BG.ground, BG.mid, alt / 30);
    if (alt < 90) return lerp3(BG.mid, BG.high, (alt - 30) / 60);
    if (alt < 200) return lerp3(BG.high, BG.space, (alt - 90) / 110);
    return BG.space;
  }

  function computeFit() {
    var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    var aspect = w / h;
    var vHalf = renderer.camera.fov / 2;
    var hHalf = Math.atan(aspect * Math.tan(vHalf));
    var fitR = R_E * 1.16;
    cam.fitDist = Math.min(14000, fitR / Math.tan(Math.min(vHalf, hHalf)));
  }

  function updateCamera() {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var d = cam.distance, sh = cam.shake;
    // 在轨段把镜头（位置偏移 + up 向量）绕世界 X 轴翻转 axisRoll（0 → 地轴倾角）：
    // 翻转后地轴指向屏幕上方、赤道水平，轨道环呈现 40° 倾角的经典构型；
    // 上升段 axisRoll=0，保持发射台铅垂视角不变。绕同一轴同步翻转
    // 偏移与 up，保证镜头始终绕地轴环绕、地球在画面里保持正立。
    var ca = Math.cos(axisRoll), sa = Math.sin(axisRoll);
    var ox = d * cp * sy, oy = d * sp, oz = d * cp * cy;
    var eye = renderer.camera.eye;
    var k = launchState.orbitBlend;
    if (k > 0.002 && k < 0.995) {
      // ---- 在轨过渡的安全镜头弧线 ----
      // 直接对目标点/距离做线性插值时，目标点会沉向地心、而距离还在半途，
      // 镜头位置被压进地球内部（原来只靠 R_E+4 的硬钳制贴地掠过，观感就是
      // “穿模”）。改为在过渡起点捕获一次当前镜头位置（含地表钳制，与过渡
      // 前逐位连续），之后沿“捕获点 → 在轨眼”的 (半径,方向) 球面弧线行进：
      // 方向 slerp、半径单调上升并在中段向外隆起，沿程不再进入大气辉光壳。
      var ke = k * k * (3 - 2 * k);
      var C = E.center;
      if (!transitEye0 || k < transitPrevK) {
        // 过渡起点（含倒放/复位后重入）：捕获当前镜头位置
        var q0x = cam.targetX + ox, q0y = cam.targetY + oy * ca + oz * sa, q0z = cam.targetZ - oy * sa + oz * ca;
        var qdx = q0x - C[0], qdy = q0y - C[1], qdz = q0z - C[2];
        var qlen = Math.sqrt(qdx * qdx + qdy * qdy + qdz * qdz) || 1;
        var qc = Math.max(qlen, R_E + 4) / qlen;   // 与既有地表钳制一致
        transitEye0 = [C[0] + qdx * qc, C[1] + qdy * qc, C[2] + qdz * qc];
      }
      transitPrevK = k;
      var e0x = transitEye0[0] - C[0], e0y = transitEye0[1] - C[1], e0z = transitEye0[2] - C[2];
      var r0 = Math.sqrt(e0x * e0x + e0y * e0y + e0z * e0z) || 1;
      // 在轨眼方向：偏移随 axisRoll 翻转，长度即 d；半径低于安全壳时抬到安全壳
      var SAFE_R = R_E * 1.035 + 25;
      var floor = (R_E + 4) + (SAFE_R - (R_E + 4)) * Math.min(1, k * 20);
      var rO = Math.max(d, floor);
      var dAx = e0x / r0, dAy = e0y / r0, dAz = e0z / r0;
      var dBx = ox / d, dBy = (oy * ca + oz * sa) / d, dBz = (-oy * sa + oz * ca) / d;
      // 方向用球面插值（slerp）：两眼方向接近对跖时 nlerp 会退化跳变
      var dot = dAx * dBx + dAy * dBy + dAz * dBz;
      if (dot > 1) dot = 1; else if (dot < -1) dot = -1;
      var w = Math.acos(dot), sw = Math.sin(w);
      if (sw < 1e-4) {
        // 方向几乎重合或对跖：nlerp 后备；对跖时先给 dirB 加正交微扰绕开奇点
        if (w > 3) {
          var qx = dAy - dAz, qy = dAz - dAx, qz = dAx - dAy;
          var ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
          dBx += qx / ql * 0.1; dBy += qy / ql * 0.1; dBz += qz / ql * 0.1;
          var bl = Math.sqrt(dBx * dBx + dBy * dBy + dBz * dBz) || 1;
          dBx /= bl; dBy /= bl; dBz /= bl;
        }
        var mx = dAx + (dBx - dAx) * ke, my = dAy + (dBy - dAy) * ke, mz = dAz + (dBz - dAz) * ke;
        var ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
        dAx = mx / ml; dAy = my / ml; dAz = mz / ml;
      } else {
        var s0 = Math.sin((1 - ke) * w) / sw, s1 = Math.sin(ke * w) / sw;
        dAx = dAx * s0 + dBx * s1; dAy = dAy * s0 + dBy * s1; dAz = dAz * s0 + dBz * s1;
      }
      var dn = Math.sqrt(dAx * dAx + dAy * dAy + dAz * dAz) || 1;
      // 半径：弧线插值与“前 1/8 过渡内抬升到安全壳”的下限取大者，
      // 再叠加中段向外隆起——起点即最低点，沿程单调远离地表
      var arcR = r0 + (rO - r0) * ke;
      var rLow = r0 + (SAFE_R - r0) * Math.min(1, k * 8);
      var r = Math.max(arcR, rLow) + Math.sin(Math.PI * ke) * 140;
      eye[0] = C[0] + dAx / dn * r;
      eye[1] = C[1] + dAy / dn * r;
      eye[2] = C[2] + dAz / dn * r;
    } else {
      transitEye0 = null; transitPrevK = 0;
      eye[0] = cam.targetX + ox;
      eye[1] = cam.targetY + oy * ca + oz * sa;
      eye[2] = cam.targetZ - oy * sa + oz * ca;
    }
    eye[0] += sh ? (Math.random() - 0.5) * sh : 0;
    eye[1] += sh ? (Math.random() - 0.5) * sh : 0;
    eye[2] += sh ? (Math.random() - 0.5) * sh : 0;
    var up = renderer.camera.up;
    up[0] = 0; up[1] = ca; up[2] = -sa;
    // 避免相机钻到地表以下（安全弧线之外的最后兜底）
    var dx = eye[0] - E.center[0], dy = eye[1] - E.center[1], dz = eye[2] - E.center[2];
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var minLen = R_E + 4;
    if (len < minLen) {
      var s = minLen / (len || 1);
      eye[0] = E.center[0] + dx * s; eye[1] = E.center[1] + dy * s; eye[2] = E.center[2] + dz * s;
    }
    renderer.camera.target[0] = cam.targetX;
    renderer.camera.target[1] = cam.targetY;
    renderer.camera.target[2] = cam.targetZ;
    renderer.camera.near = Math.max(0.06, d * 0.012);
    renderer.camera.far = d + R_E * 2.4 + 900;
  }

  function updateLight() {
    // 太阳光照：上升段贴着相机方向保证箭体始终受光（不出现背光黑箭）；
    // 入轨过渡后收敛为世界系固定的太阳方向——太阳不再跟随镜头，晨昏线
    // 静止在场景里，飞船每圈穿越明暗界线自然出现昼夜交替，夜面城市灯光
    // 随地表转动依次亮灭。
    var k = launchState.orbitBlend;
    var d = renderer.light.dir;
    var la = cam.yaw + 0.45 + 0.15 * k;
    var ax = Math.sin(la) * 0.80, ay = 0.45, az = Math.cos(la) * 0.80;
    var l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    ax /= l; ay /= l; az /= l;
    var kb = k * k * (3 - 2 * k);   // smoothstep：与镜头过渡弧线同节奏收敛
    if (kb > 0.001) {
      // 过渡起点捕获一次固定太阳方位（基于当时的镜头方位外扩偏角，光照
      // 构图连续），此后冻结在世界系；倒放/复位后重入时重新捕获
      if (!orbitSun || k < lastOrbitK) {
        var sa = cam.yaw + 0.45 + 0.15 + 0.55;
        orbitSun = [Math.sin(sa) * 0.94, 0.34, Math.cos(sa) * 0.94];
        l = Math.sqrt(orbitSun[0] * orbitSun[0] + orbitSun[1] * orbitSun[1] + orbitSun[2] * orbitSun[2]) || 1;
        orbitSun[0] /= l; orbitSun[1] /= l; orbitSun[2] /= l;
      }
      d[0] = ax + (orbitSun[0] - ax) * kb;
      d[1] = ay + (orbitSun[1] - ay) * kb;
      d[2] = az + (orbitSun[2] - az) * kb;
      l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
      d[0] /= l; d[1] /= l; d[2] /= l;
    } else {
      orbitSun = null;   // 回到上升段（复位/展示模式）允许下次入轨重新捕获
      d[0] = ax; d[1] = ay; d[2] = az;
    }
    lastOrbitK = k;
  }

  function updateSceneBg() {
    var alt = launchState.alt;
    var sb = studioBlend, s0 = 1 - sb;
    var bg = bgColor(alt);
    renderer.setClearColor(bg[0] * s0 + STUDIO_BG[0] * sb, bg[1] * s0 + STUDIO_BG[1] * sb, bg[2] * s0 + STUDIO_BG[2] * sb);
    // 场景（地球/发射台/大气）先在过渡前段消失，星场随后淡入，避免星点透过半透明地球
    var sceneK = Math.max(0, 1 - sb * 2.5);
    var starA = alt > 18 ? Math.min((alt - 18) / 60, 1) : 0;
    renderer.stars.setAlpha(Math.max(starA, Math.max(0, (sb - 0.35) / 0.65) * 0.85));
    // 发射台淡出挂在显示高度上：起飞脱塔后（altVis 12）开始淡出，
    // ~30（约 6 km）前完全消失——必须早于俯仰程序的门控（TOWER_CLEAR=28），
    // 保证“发射台看不见了火箭才开始倾斜”
    var altVis = launchState.altVis;
    var fadeAlt = altVis < 12 ? 1 : Math.max(0, 1 - (altVis - 12) / 18);
    var pa = fadeAlt * (1 - launchState.orbitBlend) * sceneK;
    padAlpha = pa;
    for (var i = 0; i < pad.parts.length; i++) {
      var pm = pad.parts[i];
      if (pm === pad.ember) continue;
      pm.alpha = pa; pm.visible = pa > 0.01;
    }
    if (pad.apron) { pad.apron.alpha = pa; pad.apron.visible = pa > 0.01; }
    pad.ember.visible = pa > 0.01;
    // 拆解空间：地球与大气整体隐去，箭体悬于星场之中
    pad.earth.alpha = sceneK; pad.earth.visible = sceneK > 0.005;
    if (pad.clouds) { pad.clouds.alpha = 0.62 * sceneK; pad.clouds.visible = sceneK > 0.005; }
    pad.atmo.visible = sceneK > 0.005;
    pad.atmo.atmoStrength = (pad.atmo.atmoMode ? 0.62 : 1.25) * sceneK;
    // 相机在大气层内 → 霞光模式；在大气层外 → 星球边缘光晕模式
    var ax = renderer.camera.eye[0] - E.center[0], ay = renderer.camera.eye[1] - E.center[1], az = renderer.camera.eye[2] - E.center[2];
    var shellR = R_E * E.atmoScale;
    pad.atmo.atmoMode = (ax * ax + ay * ay + az * az < shellR * shellR) ? 1 : 0;
  }

  // 上升段地球保持静止：发射台立在地表时自转会让台面漂移；即使发射台
  // 淡出后，0.06 rad/s 对应的地表线速度（约 108 单位/秒）在镜头贴近地面时
  // 仍会让地面像在飞速后退。因此把自转与入轨过渡（orbitBlend）绑定，
  // 镜头切到在轨远景的同时把自转平滑拉满，远看才自然。
  function updateEarthSpin(dt) {
    var target = launchState.orbitBlend;
    spinGate += (target - spinGate) * Math.min(1, dt * 0.4);
    if (Math.abs(target - spinGate) < 0.004) spinGate = target;
    M3D.spinEarth(pad, dt, spinGate);
  }

  var projOut = { x: 0, y: 0, visible: false };
  function updateLabels() {
    if (!labelLayer) return;
    var showLabels = (mode === 'explode') && explodeAmount > 0.55;
    labelLayer.style.display = showLabels ? 'block' : 'none';
    if (!showLabels) return;
    var shown = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.label || !p._labelEl) continue;
      if (!p.mesh.visible) { p._labelEl.style.display = 'none'; continue; }
      var m = p.mesh.modelMatrix;
      renderer.project([m[12], m[13], m[14]], projOut);
      if (projOut.visible) shown.push({ el: p._labelEl, x: projOut.x, y: projOut.y, w: p.label.length * 11 + 22 });
      else p._labelEl.style.display = 'none';
    }
    // 标签防重叠：按屏幕纵坐标排序，横向交叠且纵向过近的标签依次下推
    shown.sort(function (a, b) { return a.y - b.y; });
    var minGap = 24;
    for (var j = 1; j < shown.length; j++) {
      for (var k = 0; k < j; k++) {
        var a = shown[k], b = shown[j];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && b.y - a.y < minGap) b.y = a.y + minGap;
      }
    }
    for (var s = 0; s < shown.length; s++) {
      shown[s].el.style.display = 'block';
      shown[s].el.style.left = shown[s].x + 'px';
      shown[s].el.style.top = shown[s].y + 'px';
    }
  }

  function buildLabelEls() {
    if (!labelLayer) return;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.label) continue;
      var el = document.createElement('div'); el.className = 'ptag'; el.textContent = p.label;
      (function (pp, ee) {
        ee.addEventListener('click', function () {
          if (audio) audio.click();
          if (descTitle) descTitle.textContent = pp.label;
          if (descText) descText.textContent = pp.desc;
          if (descBox) descBox.style.display = 'block';
          var all = labelLayer.querySelectorAll('.ptag');
          for (var j = 0; j < all.length; j++) all[j].classList.remove('sel');
          ee.classList.add('sel');
        });
      })(p, el);
      labelLayer.appendChild(el); p._labelEl = el;
    }
  }
  buildLabelEls();

  function fmtMet(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateTelemetry() {
    if (!telemetryEl) return;
    if (mode !== 'launch' || !launchState.ignited) { telemetryEl.style.display = 'none'; return; }
    telemetryEl.style.display = 'block';
    var altKm = Math.max(0, launchState.alt * launch.KM_PER_UNIT);
    var vel = Math.round(launchState.speed * launch.MS_PER_UNIT);
    var gf = (launchState.accel / E.g0).toFixed(1);
    var txt = 'T+' + fmtMet(launchState.met) + ' · 高度 ' + altKm.toFixed(0) + ' km · 速度 ' + vel + ' m/s';
    if (launchState.inserted) {
      var laps = launchState.theta / (Math.PI * 2);
      // 入轨后只保留任务时间与环绕圈数，避免状态条过长溢出移动端屏幕
      txt = 'T+' + fmtMet(launchState.met) + ' · 环绕 ' + laps.toFixed(2) + ' 圈 · ' + launchState.warp.toFixed(0) + '× 加速';
    } else {
      txt += ' · 过载 ' + gf + ' g';
      if (launchState.hold) txt += ' · ' + launchState.warp.toFixed(0) + '×加速';
    }
    telemetryEl.textContent = txt;
  }

  // ---- 音效调制：隆隆声随推力/大气密度/镜头距离实时变化 ----
  // 点火爬坡期渐起；高度越高大气越稀薄声音越小（入真空近乎消失）；
  // 入轨关机后彻底静音；长按加速时相机远离，声音按镜头距离衰减。
  function updateAudio() {
    var s = launchState, lvl = 0, bright = 0;
    var burning = mode === 'launch' && s.ignited && !s.inserted &&
      (s.phase === 'ignition' || s.phase === 'burn1' || (s.phase === 'burn2' && s.fuel2 > 0));
    if (burning) {
      var ramp = Math.min(s.t / 0.54, 1);
      var altKm = Math.max(0, s.alt * launch.KM_PER_UNIT);
      var air = altKm <= 10 ? 1 : Math.max(0.22, 1 - (altKm - 10) / 60);
      lvl = ramp * air * Math.max(0.55, 1 - (cam.distance - 20) / 180);
      bright = Math.min(1, altKm / 45);
    }
    audio.setRumble(lvl, bright);
  }

  function updateParts() {
    M3D.updatePartTransforms(parts, {
      rotY: groupRotY, explode: explodeAmount, launchY: launchState.y, launchX: launchState.x,
      tilt: launchState.tiltVis, launchT: launchState.t, scale: launchState.scale,
      // 在轨段任务时间被 20× 加速，固定淡出速率会让船箭分离的二级一闪而过；
      // 速率随 TIME_SCALE 等比缩放，保持各分离事件中碎片可见的 MET 时长不变
      fade: launchState.inserted ? 0.013 : 0.17
    });
  }

  var lastTime = 0, running = true, rafId = 0, loaderHidden = false;
  function hideLoader() {
    if (loaderHidden || !loader) return;
    loaderHidden = true;
    loader.classList.add('hide');
  }
  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (renderer.isLost()) return;
    var dt = lastTime ? (now - lastTime) / 1000 : 0.016; lastTime = now;
    if (dt > 0.05) dt = 0.05;

    if (mode === 'show') { groupRotY = 0; }

    // 拆解空间：实景 ↔ 独立展示空间 平滑过渡
    var studioTarget = (mode === 'explode') ? 1 : 0;
    if (studioBlend !== studioTarget) {
      studioBlend += (studioTarget - studioBlend) * Math.min(1, dt * 3.2);
      if (Math.abs(studioTarget - studioBlend) < 0.003) studioBlend = studioTarget;
    }

    if (explodeAmount !== explodeTarget) {
      var d = explodeTarget - explodeAmount;
      if (Math.abs(d) < 0.002) explodeAmount = explodeTarget; else explodeAmount += d * Math.min(1, dt * 5);
    }

    // ---- 倒计时：3 · 2 · 1 · 点火 ----
    if (mode === 'launch' && countdown > 0) {
      countdown -= dt;
      var n = Math.ceil(countdown);
      if (countdownEl) {
        countdownEl.style.display = 'block';
        if (n !== lastCount) {
          lastCount = n;
          countdownEl.textContent = String(n);
          countdownEl.classList.remove('cd-ignite');
          countdownEl.style.opacity = '1';
          countdownEl.classList.remove('pop');
          void countdownEl.offsetWidth;
          countdownEl.classList.add('pop');
          if (audio) audio.beep('count');
        }
      }
      if (phaseText && n > 0) phaseText.textContent = '倒计时 ' + n + ' · 各系统准备就绪';
      if (countdown <= 0) {
        countdown = 0; launch.ignite(); igniteFlash = 1.0; lastCount = -1;
        if (audio) audio.beep('go');
        if (countdownEl) { countdownEl.textContent = '点火！'; countdownEl.classList.add('cd-ignite'); countdownEl.classList.remove('pop'); void countdownEl.offsetWidth; countdownEl.classList.add('pop'); }
        if (btnWarp) btnWarp.style.display = 'flex';
      }
    }
    if (igniteFlash > 0) {
      igniteFlash -= dt;
      if (countdownEl) {
        countdownEl.style.display = 'block';
        countdownEl.style.opacity = String(Math.max(0, Math.min(1, igniteFlash / 0.7)));
      }
      if (igniteFlash <= 0 && countdownEl) countdownEl.style.display = 'none';
    }

    // ---- 阶段字幕播出：上条停留满最短时间后才切下一条 ----
    if (phaseTimer > 0) phaseTimer -= dt;
    if (phaseQueue.length && phaseTimer <= 0) {
      showPhaseText(phaseQueue.shift());
      phaseTimer = PHASE_MIN_SHOW;
    }

    if (mode === 'launch') {
      // 倒计时末段摆开回转平台摆臂，点火前让出箭体通道（约 1.2 s 完成摆开）
      if (pad.armSwing < 1 && (launchState.ignited || (countdown > 0 && countdown < 2.4))) {
        M3D.setArmSwing(pad, Math.min(1, pad.armSwing + dt * 0.8));
      }
      launch.update(dt, cam);
      launch.updateDetachedParts(dt);
      launch.directCamera(cam, dt);
      if (progressFill) progressFill.style.width = (launchState.progress * 100) + '%';
    }
    if (audio) updateAudio();
    launch.syncFlames();

    updateSceneBg();
    updateEarthSpin(dt);
    updateLight();
    // 在轨过渡：镜头参考系随 orbitBlend 从“台面铅垂”翻转到“地轴朝上”，
    // 与地球自转拉起、镜头拉远共用同一过渡因子，节奏保持一致
    var rollTarget = launchState.orbitBlend * M3D.EARTH.axisTilt;
    axisRoll += (rollTarget - axisRoll) * Math.min(1, dt * 0.8);
    if (Math.abs(rollTarget - axisRoll) < 0.001) axisRoll = rollTarget;
    renderer.particles.update(dt);
    updateParts();
    updateCamera();
    updateLabels();
    updateTelemetry();
    renderer.render(dt);
    hideLoader();   // 首帧渲染完成，淡出载入画面

    frameTimes.push(dt);
    if (now - lastCheck > 4000 && frameTimes.length > 60) {
      var sum = 0; for (var i = 0; i < frameTimes.length; i++) sum += frameTimes[i];
      if ((frameTimes.length / sum) < 26 && !qualityDrop && dpr > 1) { qualityDrop = true; dpr = 1; doResize(); }
      frameTimes = []; lastCheck = now;
    }
  }

  function doResize() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    var w = wrap.clientWidth, h = wrap.clientHeight; if (w === 0 || h === 0) return;
    renderer.resize(w, h, dpr);
    computeFit();
  }

  function resetLaunch() {
    launch.reset();
    if (audio) audio.silence();
    if (btnWarp) { btnWarp.style.display = 'none'; btnWarp.classList.remove('holding'); }
    spinGate = 0;   // 立即停住地球自转（否则平滑衰减期间地面仍在移动）
    axisRoll = 0;   // 镜头参考系复位为台面铅垂
    countdown = 0; lastCount = -1; igniteFlash = 0; cam.shake = 0;
    cam.targetX = 0; cam.targetY = rocketModel.center; cam.targetZ = 0;
    if (mode === 'launch') { cam.targetY = 3.2; cam.distance = 18; cam.pitch = 0.04; cam.yaw = 0.42; }
    if (phaseText) phaseText.textContent = '准备就绪 · 点击点火发射';
    phaseQueue.length = 0; phaseTimer = 0;   // 清空字幕队列
    if (progressFill) progressFill.style.width = '0%';
    if (btnIgnite) {
      btnIgnite.disabled = false;
      btnIgnite.textContent = '点火发射';
      btnIgnite.style.display = (mode === 'launch') ? 'flex' : 'none';
    }
    if (descBox) descBox.style.display = 'none';
    if (countdownEl) { countdownEl.style.display = 'none'; countdownEl.style.opacity = '1'; countdownEl.classList.remove('cd-ignite'); }
    if (telemetryEl) telemetryEl.style.display = 'none';
  }

  function setMode(m) {
    mode = m;
    if (btnShow) btnShow.classList.toggle('active', m === 'show');
    if (btnExplode) btnExplode.classList.toggle('active', m === 'explode');
    if (btnLaunch) btnLaunch.classList.toggle('active', m === 'launch');
    if (btnIgnite) btnIgnite.style.display = (m === 'launch') ? 'flex' : 'none';
    if (descBox) descBox.style.display = 'none';
    if (labelLayer) labelLayer.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
    resetLaunch();
    if (m === 'show') {
      explodeTarget = 0;
      cam.targetX = 0; cam.targetY = rocketModel.center; cam.targetZ = 0;
      cam.distance = 16; cam.pitch = 0.06; cam.yaw = 0.42;
      if (phaseText) phaseText.textContent = '静态展示 · 拖动旋转视角';
    } else if (m === 'explode') {
      explodeTarget = 1;
      // 拆解后零件向上下铺开（约 -3.6 ~ +15），取展开体中心并留出余量
      cam.targetX = 0; cam.targetY = 6.0; cam.targetZ = 0;
      cam.distance = 30; cam.pitch = 0.12; cam.yaw = 0.42;
      if (phaseText) phaseText.textContent = '结构拆解 · 悬于独立展示空间，点击标签查看部件说明';
    } else if (m === 'launch') {
      explodeTarget = 0;
      if (phaseText) phaseText.textContent = '准备就绪 · 点击点火发射';
    }
  }

  function ignite() {
    if (launchState.ignited || launchState.inserted || countdown > 0) return;
    if (audio) audio.arm();
    countdown = 3;
    if (btnIgnite) btnIgnite.style.display = 'none';
  }

  if (btnShow) btnShow.addEventListener('click', function () { if (audio) audio.click(); setMode('show'); });
  if (btnExplode) btnExplode.addEventListener('click', function () { if (audio) audio.click(); setMode('explode'); });
  if (btnLaunch) btnLaunch.addEventListener('click', function () { if (audio) audio.click(); setMode('launch'); });
  if (btnIgnite) btnIgnite.addEventListener('click', ignite);

  // ---- 音效开关 + 自动播放策略解锁：首次用户手势时才创建/恢复 AudioContext ----
  var btnSound = document.getElementById('btn-sound');
  if (btnSound) {
    btnSound.addEventListener('click', function () {
      var muted = !audio.isMuted();
      audio.setMuted(muted);
      btnSound.classList.toggle('muted', muted);
    });
  }
  function unlockAudio() {
    if (!audio) return;
    audio.unlock();
    document.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  }
  document.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // ---- 长按加速：按住按钮（或空格键）期间仿真倍率 ×3，松开立即恢复 ----
  function setHold(on) {
    launch.setHoldWarp(on);
    if (btnWarp) btnWarp.classList.toggle('holding', on);
  }
  if (btnWarp) {
    btnWarp.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (btnWarp.setPointerCapture) { try { btnWarp.setPointerCapture(e.pointerId); } catch (err) {} }
      setHold(true);
    });
    btnWarp.addEventListener('pointerup', function () { setHold(false); });
    btnWarp.addEventListener('pointercancel', function () { setHold(false); });
    btnWarp.addEventListener('lostpointercapture', function () { setHold(false); });
    btnWarp.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && mode === 'launch' && launchState.ignited && !e.repeat) { e.preventDefault(); setHold(true); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') setHold(false);
  });
  window.addEventListener('blur', function () { setHold(false); });

  var pointers = {}, drag = false, lastX = 0, lastY = 0, pinchDist = 0;
  function onDown(e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) { drag = true; lastX = e.clientX; lastY = e.clientY; if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} } }
    else if (ids.length === 2) { drag = false; var a = pointers[ids[0]], b = pointers[ids[1]]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  }
  function onMove(e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2 && mode !== 'launch') {
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) { cam.distance *= pinchDist / d; if (cam.distance < 7) cam.distance = 7; if (cam.distance > 60) cam.distance = 60; }
      pinchDist = d; return;
    }
    if (drag) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      cam.yaw -= dx * 0.01; cam.pitch += dy * 0.01;
      if (cam.pitch > 1.2) cam.pitch = 1.2; if (cam.pitch < -0.35) cam.pitch = -0.35;
      if (mode === 'show') autoRot = cam.yaw;
    }
  }
  function onUp(e) {
    delete pointers[e.pointerId]; var ids = Object.keys(pointers);
    if (ids.length < 2) pinchDist = 0;
    if (ids.length === 0) drag = false; else if (ids.length === 1) { drag = true; lastX = pointers[ids[0]].x; lastY = pointers[ids[0]].y; }
  }
  if (canvas) {
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('pointerleave', onUp);
    canvas.style.touchAction = 'none';
  }
  window.addEventListener('resize', doResize);
  // 鼠标滚轮缩放（展示 / 拆解模式）
  if (canvas) {
    canvas.addEventListener('wheel', function (e) {
      if (mode === 'launch') return;
      e.preventDefault();
      cam.distance *= (e.deltaY > 0) ? 1.1 : 1 / 1.1;
      if (cam.distance < 7) cam.distance = 7;
      if (cam.distance > 60) cam.distance = 60;
    }, { passive: false });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false; setHold(false);
      if (rafId) cancelAnimationFrame(rafId); rafId = 0;
      if (audio) audio.suspend();   // 页面隐藏时停住常驻噪声循环，避免后台持续发声
    } else if (!running) {
      running = true; lastTime = 0; rafId = requestAnimationFrame(frame);
      if (audio) audio.resume();
    }
  });

  doResize(); setMode('show'); rafId = requestAnimationFrame(frame);
})();
