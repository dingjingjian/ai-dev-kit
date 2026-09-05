(function () {
  'use strict';
  var M3D = window.M3D;
  var E = M3D.EARTH;
  var R_E = E.R;

  var canvas = document.getElementById('stage');
  var fallback = document.getElementById('fallback');
  var wrap = document.getElementById('stage-wrap');
  var labelLayer = document.getElementById('labels');
  var phaseText = document.getElementById('phase-text');
  var btnShow = document.getElementById('btn-show');
  var btnExplode = document.getElementById('btn-explode');
  var btnLaunch = document.getElementById('btn-launch');
  var btnIgnite = document.getElementById('btn-ignite');
  var progressFill = document.getElementById('progress-fill');
  var descBox = document.getElementById('desc-box');
  var descTitle = document.getElementById('desc-title');
  var descText = document.getElementById('desc-text');
  var countdownEl = document.getElementById('countdown');
  var telemetryEl = document.getElementById('telemetry');

  var renderer = M3D.createRenderer(canvas);
  if (!renderer) { if (canvas) canvas.style.display = 'none'; if (fallback) fallback.style.display = 'flex'; return; }

  var rocketModel = M3D.buildCZ2F(renderer);
  var pad = M3D.buildPad(renderer);
  var parts = rocketModel.parts;

  // 地球卫星影像（等距圆柱投影）；加载成功后替换程序化地表，失败则保持后备方案
  var earthTex = renderer.createTexture('assets/earth.jpg', function (ok) {
    if (ok && pad.earth) pad.earth.texture = earthTex;
  });

  var mode = 'show', explodeAmount = 0, explodeTarget = 0, autoRot = 0, groupRotY = 0;
  var countdown = 0, lastCount = -1, igniteFlash = 0;
  var padAlpha = 1, spinGate = 0, axisRoll = 0;   // 发射台可见度 / 自转倍率 / 在轨镜头翻转角
  var cam = {
    yaw: 0.42, pitch: 0.06, distance: 16, fitDist: 5200,
    targetX: 0, targetY: rocketModel.center, targetZ: 0, shake: 0
  };

  var launch = M3D.createLaunchSystem(renderer, rocketModel, pad, {
    onPhase: function (key, text) {
      if (phaseText) phaseText.textContent = text;
    }
  });
  var launchState = launch.state;

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
    eye[0] = cam.targetX + ox + (sh ? (Math.random() - 0.5) * sh : 0);
    eye[1] = cam.targetY + oy * ca + oz * sa + (sh ? (Math.random() - 0.5) * sh : 0);
    eye[2] = cam.targetZ - oy * sa + oz * ca + (sh ? (Math.random() - 0.5) * sh : 0);
    var up = renderer.camera.up;
    up[0] = 0; up[1] = ca; up[2] = -sa;
    // 避免相机钻到地表以下
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
    // 太阳方位跟随镜头：上升段贴着相机方向保证箭体受光；在轨段外扩偏角，
    // 让明暗界线与夜面城市灯光始终留在画面里
    var k = launchState.orbitBlend;
    var la = cam.yaw + 0.45 + 0.15 * k;
    var d = renderer.light.dir;
    d[0] = Math.sin(la) * 0.80; d[1] = 0.45; d[2] = Math.cos(la) * 0.80;
    var l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
    d[0] /= l; d[1] /= l; d[2] /= l;
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
    }
    telemetryEl.textContent = txt;
  }

  function updateParts() {
    M3D.updatePartTransforms(parts, {
      rotY: groupRotY, explode: explodeAmount, launchY: launchState.y, launchX: launchState.x,
      tilt: launchState.tiltVis, launchT: launchState.t, scale: launchState.scale
    });
  }

  var lastTime = 0, running = true, rafId = 0;
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
        }
      }
      if (phaseText && n > 0) phaseText.textContent = '倒计时 ' + n + ' · 各系统准备就绪';
      if (countdown <= 0) {
        countdown = 0; launch.ignite(); igniteFlash = 1.0; lastCount = -1;
        if (countdownEl) { countdownEl.textContent = '点火！'; countdownEl.classList.add('cd-ignite'); countdownEl.classList.remove('pop'); void countdownEl.offsetWidth; countdownEl.classList.add('pop'); }
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
    spinGate = 0;   // 立即停住地球自转（否则平滑衰减期间地面仍在移动）
    axisRoll = 0;   // 镜头参考系复位为台面铅垂
    countdown = 0; lastCount = -1; igniteFlash = 0; cam.shake = 0;
    cam.targetX = 0; cam.targetY = rocketModel.center; cam.targetZ = 0;
    if (mode === 'launch') { cam.targetY = 3.2; cam.distance = 18; cam.pitch = 0.04; cam.yaw = 0.42; }
    if (phaseText) phaseText.textContent = '准备就绪 · 点击点火发射';
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
    countdown = 3;
    if (btnIgnite) btnIgnite.style.display = 'none';
  }

  if (btnShow) btnShow.addEventListener('click', function () { setMode('show'); });
  if (btnExplode) btnExplode.addEventListener('click', function () { setMode('explode'); });
  if (btnLaunch) btnLaunch.addEventListener('click', function () { setMode('launch'); });
  if (btnIgnite) btnIgnite.addEventListener('click', ignite);

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
    if (document.hidden) { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
    else if (!running) { running = true; lastTime = 0; rafId = requestAnimationFrame(frame); }
  });

  doResize(); setMode('show'); rafId = requestAnimationFrame(frame);
})();
