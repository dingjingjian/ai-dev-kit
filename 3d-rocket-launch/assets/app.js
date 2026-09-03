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
  var launchPanel = document.getElementById('launch-panel');
  var btnIgnite = document.getElementById('btn-ignite');
  var btnReset = document.getElementById('btn-reset');
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
  var cam = {
    yaw: 0.42, pitch: 0.06, distance: 16, fitDist: 5200,
    targetX: 0, targetY: rocketModel.center, targetZ: 0, shake: 0
  };

  var launch = M3D.createLaunchSystem(renderer, rocketModel, pad, {
    onPhase: function (key, text) {
      if (phaseText) phaseText.textContent = text;
      if (btnIgnite) {
        if (key === 'ignition') btnIgnite.textContent = '飞行中';
        if (key === 'seco' || key === 'orbit') btnIgnite.textContent = '已入轨';
      }
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
    var eye = renderer.camera.eye;
    eye[0] = cam.targetX + d * cp * sy + (sh ? (Math.random() - 0.5) * sh : 0);
    eye[1] = cam.targetY + d * sp + (sh ? (Math.random() - 0.5) * sh : 0);
    eye[2] = cam.targetZ + d * cp * cy + (sh ? (Math.random() - 0.5) * sh : 0);
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
    var fadeAlt = alt < 150 ? 1 : Math.max(0, 1 - (alt - 150) / 250);
    var pa = fadeAlt * (1 - launchState.orbitBlend) * sceneK;
    for (var i = 0; i < pad.parts.length; i++) {
      var pm = pad.parts[i];
      if (pm === pad.ember) continue;
      pm.alpha = pa; pm.visible = pa > 0.01;
    }
    pad.apron.alpha = pa; pad.apron.visible = pa > 0.01;
    pad.ember.visible = pa > 0.01;
    // 拆解空间：地球与大气整体隐去，箭体悬于星场之中
    pad.earth.alpha = sceneK; pad.earth.visible = sceneK > 0.005;
    pad.atmo.visible = sceneK > 0.005;
    pad.atmo.atmoStrength = (pad.atmo.atmoMode ? 0.62 : 1.25) * sceneK;
    // 相机在大气层内 → 霞光模式；在大气层外 → 星球边缘光晕模式
    var ax = renderer.camera.eye[0] - E.center[0], ay = renderer.camera.eye[1] - E.center[1], az = renderer.camera.eye[2] - E.center[2];
    var shellR = R_E * E.atmoScale;
    pad.atmo.atmoMode = (ax * ax + ay * ay + az * az < shellR * shellR) ? 1 : 0;
  }

  var projOut = { x: 0, y: 0, visible: false };
  function updateLabels() {
    if (!labelLayer) return;
    var showLabels = (mode === 'explode') && explodeAmount > 0.55;
    labelLayer.style.display = showLabels ? 'block' : 'none';
    if (!showLabels) return;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.label || !p._labelEl) continue;
      if (!p.mesh.visible) { p._labelEl.style.display = 'none'; continue; }
      var m = p.mesh.modelMatrix;
      renderer.project([m[12], m[13], m[14]], projOut);
      if (projOut.visible) { p._labelEl.style.display = 'block'; p._labelEl.style.left = projOut.x + 'px'; p._labelEl.style.top = projOut.y + 'px'; }
      else { p._labelEl.style.display = 'none'; }
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
      txt += ' · 环绕 ' + laps.toFixed(2) + ' 圈 · ' + launchState.warp.toFixed(0) + '× 加速';
    } else {
      txt += ' · 过载 ' + gf + ' g';
    }
    telemetryEl.textContent = txt;
  }

  function updateParts() {
    M3D.updatePartTransforms(parts, {
      rotY: groupRotY, explode: explodeAmount, launchY: launchState.y, launchX: launchState.x,
      tilt: launchState.tilt, launchT: launchState.t, scale: launchState.scale
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
          countdownEl.style.opacity = '1';
          countdownEl.classList.remove('pop');
          void countdownEl.offsetWidth;
          countdownEl.classList.add('pop');
        }
      }
      if (phaseText && n > 0) phaseText.textContent = '倒计时 ' + n + ' · 各系统准备就绪';
      if (countdown <= 0) {
        countdown = 0; launch.ignite(); igniteFlash = 1.0; lastCount = -1;
        if (countdownEl) { countdownEl.textContent = '点火！'; countdownEl.classList.remove('pop'); void countdownEl.offsetWidth; countdownEl.classList.add('pop'); }
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

    M3D.spinEarth(pad, dt);

    if (mode === 'launch') {
      launch.update(dt, cam);
      launch.updateDetachedParts(dt);
      launch.directCamera(cam, dt);
      if (progressFill) progressFill.style.width = (launchState.progress * 100) + '%';
    }
    launch.syncFlames();

    updateSceneBg();
    updateLight();
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
    countdown = 0; lastCount = -1; igniteFlash = 0; cam.shake = 0;
    cam.targetX = 0; cam.targetY = rocketModel.center; cam.targetZ = 0;
    if (mode === 'launch') { cam.targetY = 3.2; cam.distance = 18; cam.pitch = 0.04; cam.yaw = 0.42; }
    if (phaseText) phaseText.textContent = '准备就绪 · 点击点火发射';
    if (progressFill) progressFill.style.width = '0%';
    if (btnIgnite) { btnIgnite.disabled = false; btnIgnite.textContent = '点火发射'; }
    if (descBox) descBox.style.display = 'none';
    if (countdownEl) { countdownEl.style.display = 'none'; countdownEl.style.opacity = '1'; }
    if (telemetryEl) telemetryEl.style.display = 'none';
  }

  function setMode(m) {
    mode = m;
    if (btnShow) btnShow.classList.toggle('active', m === 'show');
    if (btnExplode) btnExplode.classList.toggle('active', m === 'explode');
    if (btnLaunch) btnLaunch.classList.toggle('active', m === 'launch');
    if (launchPanel) launchPanel.style.display = (m === 'launch') ? 'flex' : 'none';
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
    if (btnIgnite) { btnIgnite.disabled = true; btnIgnite.textContent = '倒计时中…'; }
  }

  if (btnShow) btnShow.addEventListener('click', function () { setMode('show'); });
  if (btnExplode) btnExplode.addEventListener('click', function () { setMode('explode'); });
  if (btnLaunch) btnLaunch.addEventListener('click', function () { setMode('launch'); });
  if (btnIgnite) btnIgnite.addEventListener('click', ignite);
  if (btnReset) btnReset.addEventListener('click', function () { resetLaunch(); });

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
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
    else if (!running) { running = true; lastTime = 0; rafId = requestAnimationFrame(frame); }
  });

  doResize(); setMode('show'); rafId = requestAnimationFrame(frame);
})();
