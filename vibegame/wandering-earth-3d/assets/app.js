/**
 * UI 协调层：渲染循环、滑屏操控、HUD、胜负弹窗。
 *
 * 操控约定：滑动方向 = 行星发动机推力方向（世界 XZ 平面）。
 * 相机固定方位俯视（不随玩家旋转），因此屏幕方向可稳定映射到世界方向：
 *   屏幕右 → 世界 +X，屏幕下 → 世界 +Z。
 * 玩家"滑一段距离后按住不动"可保持当前方向持续加速，松手即停。
 */
(function () {
  'use strict';
  var M3D = window.M3D;
  var W = M3D.WORLD;

  var canvas = document.getElementById('stage');
  var fallback = document.getElementById('fallback');
  var loader = document.getElementById('loader');
  var hudDist = document.getElementById('hud-dist');
  var hudSpeed = document.getElementById('hud-speed');
  var hudTime = document.getElementById('hud-time');
  var fuelFill = document.getElementById('fuel-fill');
  var warnEl = document.getElementById('warn');
  var hintEl = document.getElementById('hint');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlayText = document.getElementById('overlay-text');
  var btnRestart = document.getElementById('btn-restart');
  var tsBtns = [].slice.call(document.querySelectorAll('.ts-btn'));

  var renderer = null;
  try { renderer = M3D.createRenderer(canvas); } catch (e) { renderer = null; }
  if (!renderer) {
    if (loader) loader.classList.add('hide');
    if (fallback) fallback.style.display = 'flex';
    return;
  }

  renderer.camera.near = 0.6;
  renderer.camera.far = 40000;
  renderer.setClearColor(0.006, 0.010, 0.020);
  renderer.stars.setAlpha(1);

  var world = M3D.buildWorld(renderer);
  var game = M3D.createGame();
  var st = game.state;

  // ---- 相机：跟随地球，固定方位（只允许缩放） ----
  var cam = { dist: 150, elev: 0.92, minDist: 30, maxDist: 3600 };
  var targetPos = [st.pos[0], st.pos[1], st.pos[2]];

  function updateCamera(dt) {
    // 相机平滑跟随地球，避免逐帧硬切造成抖动
    var k = Math.min(1, dt * 6) || 1;
    targetPos[0] += (st.pos[0] - targetPos[0]) * k;
    targetPos[1] += (st.pos[1] - targetPos[1]) * k;
    targetPos[2] += (st.pos[2] - targetPos[2]) * k;
    var c = renderer.camera;
    var ce = Math.cos(cam.elev) * cam.dist, se = Math.sin(cam.elev) * cam.dist;
    c.eye[0] = targetPos[0];
    c.eye[1] = targetPos[1] + se;
    c.eye[2] = targetPos[2] + ce;
    c.target[0] = targetPos[0]; c.target[1] = targetPos[1]; c.target[2] = targetPos[2];
    c.up[0] = 0; c.up[1] = 1; c.up[2] = 0;
    c.fov = 50 * Math.PI / 180;
  }

  function updateLight() {
    var c = renderer.camera;
    var dx = c.eye[0] - c.target[0], dy = c.eye[1] - c.target[1], dz = c.eye[2] - c.target[2];
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    renderer.light.dir[0] = dx / l; renderer.light.dir[1] = dy / l; renderer.light.dir[2] = dz / l;
  }

  // ---- 滑屏操控：屏幕方向 → 世界 XZ 方向 ----
  var drag = { active: false, sx: 0, sy: 0, dir: [0, 0, 0], mag: 0, id: null };
  var DIR_EPS = 10;   // 拖动死区（像素）

  function setThrustFromDrag(x, y) {
    var dx = x - drag.sx, dy = y - drag.sy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < DIR_EPS) return;
    var w = Math.min(canvas.clientWidth, canvas.clientHeight) || 400;
    var mag = Math.max(0.25, Math.min(1, d / (w * 0.22)));
    drag.dir[0] = dx / d; drag.dir[1] = 0; drag.dir[2] = dy / d;
    drag.mag = mag;
    game.setThrust(drag.dir, mag);
  }

  canvas.addEventListener('pointerdown', function (e) {
    // 前置剧情播放时，滑动/点击用于推进剧情，而非操控地球
    if (prologue && prologue.active) { prologue.tap(); return; }
    drag.active = true; drag.sx = e.clientX; drag.sy = e.clientY; drag.id = e.pointerId;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag.active || (drag.id != null && e.pointerId !== drag.id)) return;
    setThrustFromDrag(e.clientX, e.clientY);
  });
  function endDrag() {
    if (!drag.active) return;
    drag.active = false; drag.mag = 0; drag.id = null;
    game.setThrust(null, 0);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', endDrag);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var f = e.deltaY > 0 ? 1.14 : 0.88;
    cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, cam.dist * f));
  }, { passive: false });

  // ---- 时间倍率 ----
  function setTimeScale(v) {
    st.timeScale = v;
    for (var i = 0; i < tsBtns.length; i++) {
      tsBtns[i].classList.toggle('active', parseFloat(tsBtns[i].dataset.ts) === v);
    }
  }
  tsBtns.forEach(function (b) {
    b.addEventListener('click', function () { setTimeScale(parseFloat(b.dataset.ts)); });
  });
  setTimeScale(1);

  // ---- 重开 ----
  function restart() {
    game.reset();
    targetPos[0] = st.pos[0]; targetPos[1] = st.pos[1]; targetPos[2] = st.pos[2];
    cam.dist = 150;
    if (overlay) overlay.classList.remove('show');
    if (prologue && prologue.finish) prologue.finish();
  }
  if (btnRestart) btnRestart.addEventListener('click', restart);

  // ============================================================
  //  前置剧情（开场过场）：自转暂停 → 行星发动机启动 → 月球剧情
  //  纯表现层，不改动物理内核：剧情期间游戏停在 ready，地球自转与月球由本模块脚本化驱动。
  // ============================================================
  var audio = (M3D.createAudio ? M3D.createAudio() : null);
  function unlockAudio() { if (audio && audio.unlock) audio.unlock(); }

  var prologue = (function () {
    var root = document.getElementById('prologue');
    var elTitle = document.getElementById('pro-title');
    var elText = document.getElementById('pro-text');
    var elHint = document.getElementById('pro-hint');
    var elSkip = document.getElementById('pro-skip');
    var flashEl = document.getElementById('flash');
    var moon = world.moon;

    // t：该幕停留秒数（到点自动推进）；spin：地球自转目标角速度；moon：月球表现模式
    var beats = [
      { t: 3.0, title: '流浪地球 · 逃出太阳系', text: '带着家园，逃离太阳系。', spin: 1.0, moon: 'orbit', flash: 0, sound: null },
      { t: 4.6, title: '刹车时代 · 自转暂停', text: '为了让发动机推力不再被自转抵消，地球缓缓停下亿万年的自转。', spin: 0.0, moon: 'orbit', flash: 0, sound: null },
      { t: 4.6, title: '行星发动机启动', text: '一万二千台行星发动机同时点火，蓝色烈焰刺破长夜。', spin: 0.0, moon: 'orbit', flash: 1, sound: 'ignite' },
      { t: 5.2, title: '月球 · 地球的旧伴侣', text: '家园启程之时，月球被留在原处，独自绕日。这一次，地球独自上路。', spin: 0.0, moon: 'leave', flash: 0, sound: 'chime' }
    ];

    var api = { active: true, done: false, update: update, tap: tap, finish: finish, start: start };
    var idx = -1, timer = 0;
    var spinRate = 1.0;            // 当前自转角速度（rad/s 视觉量）
    var moonMode = 'orbit', moonAngle = 0, moonR = W.EARTH_R * 4, moonAlpha = 1, flash = 0;
    var moonPos = [0, 0, 0];

    function spawnIgnition() {
      if (!renderer || !renderer.particles) return;
      var p = st.pos, R = W.EARTH_R;
      for (var i = 0; i < 170; i++) {
        var a = Math.random() * Math.PI * 2, s = Math.random();
        var dx = Math.cos(a) * s, dz = Math.sin(a) * s, dy = (Math.random() - 0.5) * 0.4;
        var sp = 16 + Math.random() * 22;
        renderer.particles.spawn(
          p[0] - dx * R, p[1] - dy * R, p[2] - dz * R,
          -dx * sp, -dy * sp, -dz * sp,
          0.40 + Math.random() * 0.5, 0.72, 1.0,
          0.5 + Math.random() * 0.5, 1.4 + Math.random() * 1.6, 0, 0);
      }
    }

    function applyBeat(b) {
      if (elTitle) elTitle.textContent = b.title;
      if (elText) { elText.textContent = b.text; elText.classList.remove('pop'); void elText.offsetWidth; elText.classList.add('pop'); }
      spinRate = b.spin;
      moonMode = b.moon;
      if (b.flash) flash = 0.9;
      if (b.sound === 'ignite') { if (audio) { audio.clank(1.1); audio.beep('go'); } spawnIgnition(); }
      if (b.sound === 'chime' && audio) audio.chime();
    }

    function next() {
      idx++;
      if (idx >= beats.length) { finish(); return; }
      applyBeat(beats[idx]);
      timer = 0;
    }

    function finish() {
      api.active = false; api.done = true;
      if (moon) moon.visible = false;
      if (root) root.classList.remove('show');
      if (elHint) elHint.textContent = '';
      document.body.classList.remove('prologuing');
      if (audio) audio.silence();
    }

    function start() {
      if (root) root.classList.add('show');
      document.body.classList.add('prologuing');
      if (elHint) elHint.textContent = '点击任意处继续 · 右上角可跳过';
      next();
    }

    function tap() {
      if (!api.active) return;
      unlockAudio();
      if (idx >= beats.length - 1) { finish(); return; }
      next();
    }

    function update(dt) {
      if (!api.active) return;
      timer += dt;

      // 地球自转：以脚本角速度积分（覆盖 ready 状态下 game 的自转增量）
      st.spin += spinRate * dt;

      // 月球表现
      if (moon) {
        if (moonMode === 'orbit') {
          moonAngle += dt * 0.5; moonR = W.EARTH_R * 4; moonAlpha = 1; moon.visible = true;
        } else if (moonMode === 'leave') {
          moonAngle += dt * 0.5;
          moonR += dt * (W.EARTH_R * 2.4);                 // 逐渐远离地球
          moonAlpha = Math.max(0, moonAlpha - dt * 0.5);    // 淡出
          moon.visible = moonAlpha > 0.02;
        } else { moon.visible = false; }
        if (moon.visible) {
          moonPos[0] = st.pos[0] + Math.cos(moonAngle) * moonR;
          moonPos[1] = 0;
          moonPos[2] = st.pos[2] + Math.sin(moonAngle) * moonR;
          M3D.placeSphere(moon.modelMatrix, moonPos, moonAngle * 0.5, 0);
          moon.alpha = moonAlpha;
        }
      }

      // 点火白闪衰减
      if (flash > 0) flash = Math.max(0, flash - dt * 1.1);
      if (flashEl) flashEl.style.opacity = (flash * 0.9).toFixed(3);

      if (timer >= beats[idx].t) next();
    }

    if (elSkip) elSkip.addEventListener('click', function () { unlockAudio(); finish(); });
    return api;
  })();

  // ---- 场景渲染 ----
  function renderScene() {
    M3D.placeEarth(world.earth, st.pos, st.spin);
    for (var i = 0; i < world.planets.length; i++) {
      var p = world.planets[i], ps = st.planets[i];
      M3D.placeSphere(p.mesh.modelMatrix, ps.pos, p.angle, 0.32);
      if (p.ring) M3D.placeSphere(p.ring.modelMatrix, ps.pos, p.angle * 0.4, 0.47);
    }

    // 推力尾焰：沿推力反方向喷出，紧贴地球背面（滑屏方向的另一侧）
    var th = world.thruster;
    if (st.thrustMag > 0 && st.fuel > 0) {
      var d = st.thrustDir;
      var bx = st.pos[0] - d[0] * W.EARTH_R, by = st.pos[1] - d[1] * W.EARTH_R, bz = st.pos[2] - d[2] * W.EARTH_R;
      M3D.orientUp(th.modelMatrix, [-d[0], -d[1], -d[2]]);
      M3D.mat4.translate(th.modelMatrix, th.modelMatrix, [bx, by, bz]);
      th.visible = true;
      th.alpha = 0.5 + 0.4 * st.thrustMag;
    } else {
      th.visible = false;
    }
  }

  // ---- HUD（限频更新，减少 DOM 开销） ----
  var hudTick = 0;
  function updateHud() {
    hudTick++;
    if (hudTick % 5 !== 0) return;
    if (hudDist) hudDist.textContent = st.rSunAU.toFixed(2) + ' AU';
    if (hudSpeed) hudSpeed.textContent = st.speedKms.toFixed(1) + ' km/s';
    if (hudTime) hudTime.textContent = st.years.toFixed(2) + ' 年';
    if (fuelFill) fuelFill.style.width = (st.fuel * 100).toFixed(1) + '%';
    if (fuelFill) fuelFill.classList.toggle('low', st.fuel < 0.25);
    if (warnEl) {
      warnEl.textContent = st.warn || '';
      warnEl.style.opacity = st.warn ? '1' : '0';
    }
    if (hintEl) {
      var showHint = st.status === 'ready' && (!prologue || prologue.done);
      hintEl.textContent = showHint ? '滑动屏幕，点火推动地球 · 甩出太阳系' : '';
      hintEl.classList.toggle('show', showHint);
    }
  }

  var OVERLAY = {
    crashed: { t: '任务失败', cls: 'bad' },
    caught: { t: '任务失败', cls: 'bad' },
    escaped: { t: '任务成功', cls: 'good' }
  };
  var overlayShown = '';
  function updateOverlay() {
    if (!overlay) return;
    var cfg = OVERLAY[st.status];
    if (!cfg) { overlayShown = ''; return; }
    if (overlayShown === st.status) return;
    overlayShown = st.status;
    overlayTitle.textContent = cfg.t;
    overlayTitle.className = 'ov-title ' + cfg.cls;
    overlayText.textContent = st.reason + (st.status === 'escaped'
      ? '（用时 ' + st.years.toFixed(2) + ' 年 · 最远 ' + (st.maxR / W.AU).toFixed(1) + ' AU）' : '');
    overlay.classList.add('show');
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  function doResize() {
    renderer.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, dpr);
  }
  window.addEventListener('resize', doResize);

  var last = 0, loaderHidden = false;
  function frame(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    game.step(dt);
    if (prologue) prologue.update(dt);
    renderScene();
    updateCamera(dt);
    updateLight();
    if (renderer.particles && renderer.particles.update) renderer.particles.update(dt);
    renderer.render(dt);
    updateHud();
    updateOverlay();
    if (!loaderHidden) { if (loader) loader.classList.add('hide'); loaderHidden = true; }
    requestAnimationFrame(frame);
  }

  doResize();
  if (prologue) prologue.start();
  requestAnimationFrame(frame);
})();
