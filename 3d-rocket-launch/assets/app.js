(function () {
  'use strict';
  var M3D = window.M3D, mat4 = M3D.mat4;

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

  var mode = 'show', explodeAmount = 0, explodeTarget = 0, autoRot = 0, groupRotY = 0;
  var countdown = 0;
  var cam = { yaw: 0.55, pitch: 0.02, distance: 13, targetX: 0, targetY: rocketModel.center, shake: 0 };

  var launch = M3D.createLaunchSystem(renderer, rocketModel, pad, {
    getRotY: function () { return groupRotY; },
    onPhase: function (ph) {
      if (phaseText) phaseText.textContent = ph.text;
      if (btnIgnite) {
        if (ph.key === 'ignition') { btnIgnite.textContent = '飞行中'; }
        if (ph.key === 'done') { btnIgnite.textContent = '发射完成'; }
      }
    }
  });
  var launchState = launch.state;

  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var qualityDrop = false, frameTimes = [], lastCheck = 0;

  var BG_GROUND = [0.46, 0.54, 0.66], BG_SKY = [0.16, 0.24, 0.40], BG_HIGH = [0.04, 0.06, 0.14], BG_SPACE = [0.01, 0.01, 0.03];
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function bgColor(y) {
    if (y < 8) return lerp3(BG_GROUND, BG_SKY, y / 8);
    if (y < 25) return lerp3(BG_SKY, BG_HIGH, (y - 8) / 17);
    if (y < 50) return lerp3(BG_HIGH, BG_SPACE, (y - 25) / 25);
    return BG_SPACE;
  }

  function updateCamera() {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var d = cam.distance, sh = cam.shake, tx = cam.targetX;
    renderer.camera.eye[0] = tx + d * cp * cy + (sh ? (Math.random() - 0.5) * sh : 0);
    renderer.camera.eye[1] = cam.targetY + d * sp + (sh ? (Math.random() - 0.5) * sh : 0);
    renderer.camera.eye[2] = d * cp * sy;
    renderer.camera.target[0] = tx; renderer.camera.target[1] = cam.targetY; renderer.camera.target[2] = 0;
  }

  function updateSceneBg() {
    var y = launchState.y;
    var bg = bgColor(y);
    renderer.setClearColor(bg[0], bg[1], bg[2]);
    var starA = y > 15 ? Math.min((y - 15) / 25, 1) : 0;
    renderer.stars.setAlpha(starA);
    renderer.stars.setOffsetY(cam.targetY);
    var ga = y < 5 ? 1 : (y < 15 ? (15 - y) / 10 : 0);
    for (var i = 0; i < pad.all.length; i++) {
      var pm = pad.all[i];
      if (pm === pad.horizon || pm === pad.earth) continue;
      pm.alpha = ga; pm.visible = ga > 0.01;
    }
    var ha = y > 25 ? Math.min((y - 25) / 15, 1) : 0;
    pad.horizon.alpha = ha * 0.85; pad.horizon.visible = ha > 0.01;
    pad.horizon.modelMatrix[13] = y - 25;
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

  function updateTelemetry() {
    if (!telemetryEl) return;
    if (mode !== 'launch' || !launchState.ignited) { telemetryEl.style.display = 'none'; return; }
    telemetryEl.style.display = 'block';
    var altKm = (launchState.y * 1.5).toFixed(1);
    var vel = Math.round(launchState.v * 400);
    var pitchDeg = Math.round(launchState.pitch * 180 / Math.PI);
    telemetryEl.textContent = '高度 ' + altKm + ' km · 速度 ' + vel + ' m/s · 俯仰 ' + pitchDeg + '°';
  }

  function updateParts() {
    M3D.updatePartTransforms(parts, {
      rotY: groupRotY, explode: explodeAmount, launchY: launchState.y, launchX: launchState.x, pitch: launchState.pitch, launchT: launchState.t
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

    if (explodeAmount !== explodeTarget) {
      var d = explodeTarget - explodeAmount;
      if (Math.abs(d) < 0.002) explodeAmount = explodeTarget; else explodeAmount += d * Math.min(1, dt * 5);
    }

    if (mode === 'launch' && countdown > 0) {
      countdown -= dt;
      var n = Math.ceil(countdown);
      if (countdownEl) { countdownEl.textContent = n > 0 ? String(n) : '点火'; countdownEl.style.display = 'block'; }
      if (phaseText) phaseText.textContent = n > 0 ? ('倒计时 ' + n) : '点火！';
      if (countdown <= 0) { countdown = 0; launch.ignite(); if (countdownEl) countdownEl.style.display = 'none'; }
    }

    if (mode === 'launch') {
      launch.update(dt, groupRotY);
      launch.updateDetachedParts(dt);
      launch.directCamera(cam, dt);
      if (progressFill) progressFill.style.width = (Math.min(launchState.t / launch.end, 1) * 100) + '%';
    }
    launch.syncFlames(groupRotY);

    updateSceneBg();
    renderer.particles.update(dt);
    updateParts();
    updateCamera();
    updateLabels();
    updateTelemetry();
    renderer.render();

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
  }

  function resetLaunch() {
    launch.reset();
    countdown = 0; cam.shake = 0; cam.targetX = 0;
    if (mode === 'launch') { cam.targetY = 2.4; cam.distance = 13; cam.pitch = -0.04; }
    if (phaseText) phaseText.textContent = '准备就绪 · 点击点火发射';
    if (progressFill) progressFill.style.width = '0%';
    if (btnIgnite) { btnIgnite.disabled = false; btnIgnite.textContent = '点火发射'; }
    if (descBox) descBox.style.display = 'none';
    if (countdownEl) countdownEl.style.display = 'none';
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
      explodeTarget = 0; cam.targetX = 0; cam.targetY = rocketModel.center; cam.distance = 13; cam.pitch = 0.02;
      if (phaseText) phaseText.textContent = '静态展示 · 拖动旋转视角';
    } else if (m === 'explode') {
      explodeTarget = 1; cam.targetX = 0; cam.targetY = 6.2; cam.distance = 24; cam.pitch = 0.16;
      if (phaseText) phaseText.textContent = '结构拆解 · 点击标签查看部件说明';
    } else if (m === 'launch') {
      explodeTarget = 0;
    }
  }

  function ignite() {
    if (launchState.ignited || launchState.done || countdown > 0) return;
    countdown = 3.2;
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
      if (pinchDist > 0) { cam.distance *= pinchDist / d; if (cam.distance < 7) cam.distance = 7; if (cam.distance > 34) cam.distance = 34; }
      pinchDist = d; return;
    }
    if (drag) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      cam.yaw -= dx * 0.01; cam.pitch += dy * 0.01;
      if (cam.pitch > 1.2) cam.pitch = 1.2; if (cam.pitch < -0.5) cam.pitch = -0.5;
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
