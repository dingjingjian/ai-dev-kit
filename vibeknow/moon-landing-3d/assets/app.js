(function () {
  'use strict';
  var M3D = window.M3D;
  var E = M3D.EARTH, MO = M3D.MOON;
  var R_E = E.R, MC = MO.center, MR = MO.R;

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
  var missionTagEl = document.getElementById('mission-tag');

  var renderer = M3D.createRenderer(canvas);
  if (!renderer) {
    if (loader) loader.classList.add('hide');
    if (canvas) canvas.style.display = 'none'; if (fallback) fallback.style.display = 'flex'; return;
  }

  var audio = M3D.createAudio ? M3D.createAudio() : null;
  var rocketModel = M3D.buildCZ10(renderer);
  var pad = M3D.buildPad(renderer);
  var parts = rocketModel.parts;

  canvas.addEventListener('webglcontextlost', function () {
    hideLoader();
    if (fallback) fallback.style.display = 'flex';
  }, false);

  // 地球卫星影像（内联 data URI，file:// 下亦可加载）
  var earthTex = renderer.createTexture('assets/earth.jpg', function (ok) {
    if (ok && pad.earth) pad.earth.texture = earthTex;
  });

  var mode = 'show', explodeAmount = 0, explodeTarget = 0, groupRotY = 0;
  var countdown = 0, lastCount = -1, igniteFlash = 0;
  var padAlpha = 1, spinGate = 0, spaceLightK = 0, surfCamBlend = 0;
  var cam = {
    yaw: 0.42, pitch: 0.06, distance: 22, fitDist: 5200,
    fitEarth: 5200, fitSystem: 60000, fitMoon: 2400,
    targetX: 0, targetY: rocketModel.center, targetZ: 0, shake: 0
  };

  var mission = M3D.createMissionSystem(renderer, rocketModel, pad, {
    onPhase: function (key, text) {
      queuePhase(text);
      if (!audio) return;
      if (key === 'towerSep') audio.clank(0.8);
      else if (key === 'boosterSep') audio.clank(1.1);
      else if (key === 'stage1Sep') audio.clank(1.2);
      else if (key === 'stage2Ignition' || key === 'tli') audio.clank(0.5);
      else if (key === 'fairingSep') audio.clank(0.9);
      else if (key === 'stage2Sep' || key === 'landerSep') audio.clank(0.7);
      else if (key === 'parkOrbit' || key === 'loi' || key === 'lunarOrbit') audio.chime();
    },
    onTouchdown: function () { if (audio) audio.thud(); }
  });
  var S = mission.state;

  // ---- 阶段字幕队列 ----
  var PHASE_MIN_SHOW = 2.4;
  var phaseQueue = [], phaseTimer = 0;
  function queuePhase(text) {
    if (!text) return;
    if (phaseQueue.length >= 4) phaseQueue.shift();
    phaseQueue.push(text);
  }
  function showPhaseText(text) {
    if (!phaseText) return;
    phaseText.textContent = text;
    phaseText.classList.remove('phase-in');
    void phaseText.offsetWidth;
    phaseText.classList.add('phase-in');
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var qualityDrop = false, frameTimes = [], lastCheck = 0;

  var BG = {
    ground: [0.23, 0.43, 0.74], mid: [0.05, 0.105, 0.26], high: [0.012, 0.018, 0.045], space: [0.005, 0.007, 0.014]
  };
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
    var minHalf = Math.min(vHalf, hHalf);
    var t = Math.tan(minHalf) || 0.4;
    cam.fitDist = Math.min(16000, R_E * 1.16 / t);
    cam.fitEarth = R_E * 1.22 / t;                       // 整个地球 + 停泊轨道
    cam.fitSystem = (MO.dist * 0.5 + R_E + 400) / t;     // 地球 + 月球同框（地月转移）
    cam.fitMoon = (MR * 1.30) / t;                       // 整个月球
  }

  function updateCamera() {
    var d = cam.distance, sh = cam.shake;
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var tx = cam.targetX, ty = cam.targetY, tz = cam.targetZ;
    // 标准轨道镜头（up = 世界 +Y）
    var exS = tx + d * cp * sy, eyS = ty + d * sp, ezS = tz + d * cp * cy;
    var up = renderer.camera.up, eye = renderer.camera.eye;
    var ux = 0, uy = 1, uz = 0;

    var sb = surfCamBlend;
    if (sb > 0.002) {
      // ---- 月面着陆镜头：以月面法线为 up，从背地球一侧斜上方取景，把地球纳入天空 ----
      var rx = tx - MC[0], ry = ty - MC[1], rl = Math.sqrt(rx * rx + ry * ry) || 1;
      var urx = rx / rl, ury = ry / rl;                       // 月面外法线（当地天顶）
      var tox = E.center[0] - tx, toy = E.center[1] - ty, tol = Math.sqrt(tox * tox + toy * toy) || 1;
      tox /= tol; toy /= tol;                                  // 指向地球
      var dproj = tox * urx + toy * ury;
      var hx = tox - urx * dproj, hy = toy - ury * dproj, hl = Math.sqrt(hx * hx + hy * hy) || 1;
      hx /= hl; hy /= hl;                                      // 当地水平朝向地球方向
      var elev = 0.24, az = 0.48;
      if (S.phase === 'landed') { az += Math.sin(S.phaseT * 0.2) * 0.42; elev += Math.sin(S.phaseT * 0.13) * 0.05; }
      var e1x = -hx * Math.cos(az), e1y = -hy * Math.cos(az);  // 背地球水平方向
      var horiz = d * Math.cos(elev), vert = d * Math.sin(elev);
      var exL = tx + e1x * horiz + vert * urx;
      var eyL = ty + e1y * horiz + vert * ury;
      var ezL = tz + Math.sin(az) * horiz;                     // 出平面分量制造 3/4 视角
      exS += (exL - exS) * sb; eyS += (eyL - eyS) * sb; ezS += (ezL - ezS) * sb;
      ux += (urx - ux) * sb; uy += (ury - uy) * sb; uz += (0 - uz) * sb;
      var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    }

    eye[0] = exS + (sh ? (Math.random() - 0.5) * sh : 0);
    eye[1] = eyS + (sh ? (Math.random() - 0.5) * sh : 0);
    eye[2] = ezS + (sh ? (Math.random() - 0.5) * sh : 0);
    up[0] = ux; up[1] = uy; up[2] = uz;

    // 避免相机钻入地球 / 月球内部
    clampOutside(eye, E.center, R_E + 4);
    clampOutside(eye, MC, MR + 2.5);

    renderer.camera.target[0] = tx; renderer.camera.target[1] = ty; renderer.camera.target[2] = tz;
    renderer.camera.near = Math.max(0.15, d * 0.02);
    var deep = (S.regime !== 'ascent' || S.inserted);
    renderer.camera.far = d + (deep ? (MO.dist + R_E + MR + 3000) : (R_E * 2.4 + 900));
  }
  function clampOutside(eye, c, minR) {
    var dx = eye[0] - c[0], dy = eye[1] - c[1], dz = eye[2] - c[2];
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < minR && len > 1e-6) {
      var s = minR / len;
      eye[0] = c[0] + dx * s; eye[1] = c[1] + dy * s; eye[2] = c[2] + dz * s;
    }
  }

  function updateLight() {
    var d = renderer.light.dir;
    // 上升段：光随镜头，保证箭体受光不背光
    var la = cam.yaw + 0.45;
    var ax = Math.sin(la) * 0.80, ay = 0.45, az = Math.cos(la) * 0.80;
    var l = Math.sqrt(ax * ax + ay * ay + az * az) || 1; ax /= l; ay /= l; az /= l;
    if (spaceLightK < 0.002) { d[0] = ax; d[1] = ay; d[2] = az; return; }
    // 深空段：以“头灯”方式从镜头方向打光，保证地球/月球/器体始终清晰可见，略带天顶偏置增加立体感
    var ex = renderer.camera.eye, tgt = renderer.camera.target;
    var lx = ex[0] - tgt[0], ly = ex[1] - tgt[1], lz = ex[2] - tgt[2];
    var ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
    lx /= ll; ly /= ll; lz /= ll;
    var sx = lx * 0.82 + 0.05, sy = ly * 0.82 + 0.42, sz = lz * 0.82 + 0.18;
    var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    d[0] = ax + (sx - ax) * spaceLightK;
    d[1] = ay + (sy - ay) * spaceLightK;
    d[2] = az + (sz - az) * spaceLightK;
    l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
    d[0] /= l; d[1] /= l; d[2] /= l;
  }

  function updateSceneBg() {
    var sb = studioBlend, s0 = 1 - sb;
    var bgAlt = (S.regime === 'ascent' && !S.inserted) ? S.alt : 999;
    var bg = bgColor(bgAlt);
    renderer.setClearColor(bg[0] * s0 + STUDIO_BG[0] * sb, bg[1] * s0 + STUDIO_BG[1] * sb, bg[2] * s0 + STUDIO_BG[2] * sb);
    var sceneK = Math.max(0, 1 - sb * 2.5);
    var starA = (!S.ignited || S.regime === 'ascent') ? (S.altVis > 18 ? Math.min((S.altVis - 18) / 60, 1) : 0) : 1;
    renderer.stars.setAlpha(Math.max(starA * sceneK, Math.max(0, (sb - 0.35) / 0.65) * 0.85));

    // 发射台淡出（上升段）
    var altVis = S.altVis;
    var fadeAlt = (S.regime !== 'ascent') ? 0 : (altVis < 12 ? 1 : Math.max(0, 1 - (altVis - 12) / 18));
    var pa = fadeAlt * sceneK;
    padAlpha = pa;
    for (var i = 0; i < pad.parts.length; i++) {
      var pm = pad.parts[i];
      if (pm === pad.ember) continue;
      pm.alpha = pa; pm.visible = pa > 0.01;
    }
    pad.ember.visible = pa > 0.01;

    // 地球 / 云 / 大气：始终随场景可见（着陆时作为天空中的蓝色星球）
    pad.earth.alpha = sceneK; pad.earth.visible = sceneK > 0.005;
    if (pad.clouds) { pad.clouds.alpha = 0.62 * sceneK; pad.clouds.visible = sceneK > 0.005; }
    pad.atmo.visible = sceneK > 0.005;
    pad.atmo.atmoStrength = (pad.atmo.atmoMode ? 0.62 : 1.25) * sceneK;
    var ax = renderer.camera.eye[0] - E.center[0], ay = renderer.camera.eye[1] - E.center[1], az = renderer.camera.eye[2] - E.center[2];
    var shellR = R_E * E.atmoScale;
    pad.atmo.atmoMode = (ax * ax + ay * ay + az * az < shellR * shellR) ? 1 : 0;

    // 月球：转移段随 moonBlend 渐显，环月段起常显
    var moonK;
    if (S.regime === 'ascent' || S.phase === 'parkOrbit' || S.phase === 'tli') moonK = 0;
    else if (S.phase === 'transit') moonK = S.moonBlend;
    else moonK = 1;
    moonK *= sceneK;
    pad.moon.visible = moonK > 0.01;
    pad.moon.alpha = moonK;
  }

  function updateEarthSpin(dt) {
    var target = (S.regime === 'ascent') ? 0 : 1;
    spinGate += (target - spinGate) * Math.min(1, dt * 0.4);
    if (Math.abs(target - spinGate) < 0.004) spinGate = target;
    M3D.spinEarth(pad, dt, spinGate * (mode === 'launch' ? 1 : 0));
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

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtMet(sec) {
    sec = Math.max(0, Math.floor(sec));
    if (sec < 3600) return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
    if (sec < 86400) return pad2(Math.floor(sec / 3600)) + ':' + pad2(Math.floor(sec / 60) % 60) + ':' + pad2(sec % 60);
    var dd = Math.floor(sec / 86400);
    return dd + '天 ' + pad2(Math.floor(sec / 3600) % 24) + ':' + pad2(Math.floor(sec / 60) % 60);
  }

  function updateTelemetry() {
    if (!telemetryEl) return;
    if (mode !== 'launch' || !S.ignited) { telemetryEl.style.display = 'none'; return; }
    telemetryEl.style.display = 'block';
    var t = 'T+' + fmtMet(S.met);
    var ph = S.phase;
    if (S.regime === 'ascent' && !S.inserted) {
      var altKm = Math.max(0, S.alt * mission.KM_PER_UNIT);
      var vel = Math.round(S.speed * mission.MS_PER_UNIT);
      t += ' · 高度 ' + altKm.toFixed(0) + ' km · 速度 ' + vel + ' m/s · 过载 ' + (S.accel / E.g0).toFixed(1) + ' g';
    } else if (ph === 'parkOrbit' || ph === 'tli') {
      t += ' · 轨道高度 ' + (S.alt * mission.KM_PER_UNIT).toFixed(0) + ' km · 速度 ' + Math.round(S.speed) + ' m/s';
    } else if (ph === 'transit') {
      t += ' · 距地 ' + (S.distEarth / 10000).toFixed(2) + ' 万km · 距月 ' + (S.distMoon / 10000).toFixed(2) + ' 万km';
    } else if (ph === 'loi' || ph === 'lunarOrbit') {
      t += ' · 环月高度 ' + S.moonAlt.toFixed(0) + ' km · 速度 ' + Math.round(S.speed) + ' m/s';
    } else if (ph === 'descent' || ph === 'approach' || ph === 'landing') {
      var a = S.moonAlt;
      t += ' · 月面高度 ' + (a < 1 ? (a * 1000).toFixed(0) + ' m' : a.toFixed(1) + ' km') + ' · 下降速度 ' + Math.round(S.speed) + ' m/s';
    } else if (ph === 'landed') {
      t = '已着陆 · 月球表面 · 揽月着陆器安全落月';
    }
    if (S.hold && ph !== 'landed') t += ' · ' + S.warp.toFixed(0) + '×加速';
    telemetryEl.textContent = t;
  }

  function updateMissionTag() {
    if (!missionTagEl) return;
    var show = mode === 'launch' && S.ignited;
    missionTagEl.style.display = show ? 'block' : 'none';
    if (!show) return;
    var seg = '上升段';
    if (S.phase === 'parkOrbit' || S.phase === 'tli') seg = '停泊轨道 · 地月转移';
    else if (S.phase === 'transit') seg = '地月转移轨道';
    else if (S.phase === 'loi' || S.phase === 'lunarOrbit') seg = '环月阶段';
    else if (S.phase === 'landerSep' || S.phase === 'descent' || S.phase === 'approach' || S.phase === 'landing' || S.phase === 'landed') seg = '着陆下降';
    missionTagEl.textContent = seg;
  }

  function updateAudio() {
    if (!audio) return;
    var lvl = 0, bright = 0;
    if (mode === 'launch' && S.burning && S.regime === 'ascent') {
      var ramp = Math.min(S.t / 0.54, 1);
      var altKm = Math.max(0, S.alt * mission.KM_PER_UNIT);
      var air = altKm <= 10 ? 1 : Math.max(0.22, 1 - (altKm - 10) / 60);
      lvl = ramp * air * Math.max(0.55, 1 - (cam.distance - 20) / 180);
      bright = Math.min(1, altKm / 45);
    } else if (mode === 'launch' && S.burning) {
      // 深空发动机（TLI / 近月制动 / 动力下降）：真空中偏闷、随镜头距离衰减
      lvl = 0.42 * Math.max(0.4, 1 - (cam.distance - 20) / 400);
      bright = 0.15;
    }
    audio.setRumble(lvl, bright);
  }

  function updateParts() {
    M3D.updatePartTransforms(parts, {
      rotY: groupRotY, explode: explodeAmount, launchY: S.y, launchX: S.x,
      tilt: S.tiltVis, launchT: S.t, scale: S.scale,
      fade: S.inserted ? 0.12 : 0.17
    });
  }

  var lastTime = 0, running = true, rafId = 0, loaderHidden = false;
  function hideLoader() {
    if (loaderHidden || !loader) return;
    loaderHidden = true; loader.classList.add('hide');
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (renderer.isLost()) return;
    var dt = lastTime ? (now - lastTime) / 1000 : 0.016; lastTime = now;
    if (dt > 0.05) dt = 0.05;

    if (mode === 'show') groupRotY = 0;

    var studioTarget = (mode === 'explode') ? 1 : 0;
    if (studioBlend !== studioTarget) {
      studioBlend += (studioTarget - studioBlend) * Math.min(1, dt * 3.2);
      if (Math.abs(studioTarget - studioBlend) < 0.003) studioBlend = studioTarget;
    }
    if (explodeAmount !== explodeTarget) {
      var dd = explodeTarget - explodeAmount;
      if (Math.abs(dd) < 0.002) explodeAmount = explodeTarget; else explodeAmount += dd * Math.min(1, dt * 5);
    }

    // 倒计时
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
          countdownEl.classList.remove('pop'); void countdownEl.offsetWidth; countdownEl.classList.add('pop');
          if (audio) audio.beep('count');
        }
      }
      if (phaseText && n > 0) phaseText.textContent = '倒计时 ' + n + ' · 各系统准备就绪';
      if (countdown <= 0) {
        countdown = 0; mission.ignite(); igniteFlash = 1.0; lastCount = -1;
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

    if (phaseTimer > 0) phaseTimer -= dt;
    if (phaseQueue.length && phaseTimer <= 0) { showPhaseText(phaseQueue.shift()); phaseTimer = PHASE_MIN_SHOW; }

    if (mode === 'launch') {
      if (pad.armSwing < 1 && (S.ignited || (countdown > 0 && countdown < 2.4))) {
        M3D.setArmSwing(pad, Math.min(1, pad.armSwing + dt * 0.8));
      }
      mission.update(dt, cam);
      mission.updateDetachedParts(dt);
      mission.directCamera(cam, dt);
      if (progressFill) progressFill.style.width = (S.progress * 100) + '%';
      // 深空光照 / 月面镜头混合因子平滑
      var spaceTarget = S.inserted ? 1 : 0;
      spaceLightK += (spaceTarget - spaceLightK) * Math.min(1, dt * 0.8);
      surfCamBlend += ((S.surfCamBlend || 0) - surfCamBlend) * Math.min(1, dt * 2.2);
    } else {
      spaceLightK += (0 - spaceLightK) * Math.min(1, dt * 2);
      surfCamBlend += (0 - surfCamBlend) * Math.min(1, dt * 3);
    }
    updateAudio();
    mission.syncFlames();

    updateSceneBg();
    updateEarthSpin(dt);
    updateLight();
    renderer.particles.update(dt);
    updateParts();
    updateCamera();
    updateLabels();
    updateTelemetry();
    updateMissionTag();
    renderer.render(dt);
    hideLoader();

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

  function resetMission() {
    mission.reset();
    if (audio) audio.silence();
    if (btnWarp) { btnWarp.style.display = 'none'; btnWarp.classList.remove('holding'); }
    spinGate = 0; surfCamBlend = 0; spaceLightK = 0;
    countdown = 0; lastCount = -1; igniteFlash = 0; cam.shake = 0;
    cam.targetX = 0; cam.targetY = rocketModel.center; cam.targetZ = 0;
    if (mode === 'launch') { cam.targetY = 4.0; cam.distance = 22; cam.pitch = 0.05; cam.yaw = 0.42; }
    if (phaseText) phaseText.textContent = '准备就绪 · 点击点火，开启登月之旅';
    phaseQueue.length = 0; phaseTimer = 0;
    if (progressFill) progressFill.style.width = '0%';
    if (btnIgnite) { btnIgnite.disabled = false; btnIgnite.textContent = '点火发射'; btnIgnite.style.display = (mode === 'launch') ? 'flex' : 'none'; }
    if (descBox) descBox.style.display = 'none';
    if (countdownEl) { countdownEl.style.display = 'none'; countdownEl.style.opacity = '1'; countdownEl.classList.remove('cd-ignite'); }
    if (telemetryEl) telemetryEl.style.display = 'none';
    if (missionTagEl) missionTagEl.style.display = 'none';
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
    resetMission();
    if (m === 'show') {
      explodeTarget = 0;
      cam.targetX = 0; cam.targetY = rocketModel.center; cam.targetZ = 0;
      cam.distance = 22; cam.pitch = 0.06; cam.yaw = 0.42;
      if (phaseText) phaseText.textContent = '长征十号 · 静态展示 · 拖动旋转视角';
    } else if (m === 'explode') {
      explodeTarget = 1;
      cam.targetX = 0; cam.targetY = 6.6; cam.targetZ = 0;
      cam.distance = 34; cam.pitch = 0.12; cam.yaw = 0.42;
      if (phaseText) phaseText.textContent = '结构拆解 · 点击标签查看各舱段说明';
    } else if (m === 'launch') {
      explodeTarget = 0;
      if (phaseText) phaseText.textContent = '准备就绪 · 点击点火，开启登月之旅';
    }
  }

  function ignite() {
    if (S.ignited || countdown > 0) return;
    if (audio) audio.arm();
    countdown = 3;
    if (btnIgnite) btnIgnite.style.display = 'none';
  }

  if (btnShow) btnShow.addEventListener('click', function () { if (audio) audio.click(); setMode('show'); });
  if (btnExplode) btnExplode.addEventListener('click', function () { if (audio) audio.click(); setMode('explode'); });
  if (btnLaunch) btnLaunch.addEventListener('click', function () { if (audio) audio.click(); setMode('launch'); });
  if (btnIgnite) btnIgnite.addEventListener('click', ignite);

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

  function setHold(on) {
    mission.setHoldWarp(on);
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
    if (e.code === 'Space' && mode === 'launch' && S.ignited && !S.landed && !e.repeat) { e.preventDefault(); setHold(true); }
  });
  window.addEventListener('keyup', function (e) { if (e.code === 'Space') setHold(false); });
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
      var a = pointers[ids[0]], b = pointers[ids[1]], dd = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) { cam.distance *= pinchDist / dd; if (cam.distance < 8) cam.distance = 8; if (cam.distance > 90) cam.distance = 90; }
      pinchDist = dd; return;
    }
    if (drag && mode !== 'launch') {
      var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      cam.yaw -= dx * 0.01; cam.pitch += dy * 0.01;
      if (cam.pitch > 1.2) cam.pitch = 1.2; if (cam.pitch < -0.35) cam.pitch = -0.35;
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
    canvas.addEventListener('wheel', function (e) {
      if (mode === 'launch') return;
      e.preventDefault();
      cam.distance *= (e.deltaY > 0) ? 1.1 : 1 / 1.1;
      if (cam.distance < 8) cam.distance = 8;
      if (cam.distance > 90) cam.distance = 90;
    }, { passive: false });
  }
  window.addEventListener('resize', doResize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false; setHold(false);
      if (rafId) cancelAnimationFrame(rafId); rafId = 0;
      if (audio) audio.suspend();
    } else if (!running) {
      running = true; lastTime = 0; rafId = requestAnimationFrame(frame);
      if (audio) audio.resume();
    }
  });

  doResize(); setMode('show'); rafId = requestAnimationFrame(frame);
})();
