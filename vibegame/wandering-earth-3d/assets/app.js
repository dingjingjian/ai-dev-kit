/**
 * 表现层：状态机、相机、输入、2D 叠加层、HUD。
 *
 * 三段式：
 *   prologue  刹车时代过场（不可操作，点击推进 / 可跳过）
 *   play      逃逸时代（玩家拖出箭头点火，绕日加速）
 *   rebellion 第 10 圈触发：叛乱 → 处决 → 太阳氦闪（前两幕冻结时间）
 *   over      结算
 *
 * 相机是**双档自动切换**：平时拉远以太阳为中心看整条轨道（轨道变化一目了然，
 * 这是判断"这一推有没有用"的唯一依据），点火执行时拉近看地球与尾焰。
 * 拖动瞄准期间相机冻结 —— 否则锚在地球上的箭头会跟着乱飘。
 *
 * 屏幕方向 → 世界方向的映射（相机方位固定俯视，故为常量）：
 *   屏幕右 → 世界 +X，屏幕下 → 世界 +Z。
 */
(function () {
  'use strict';
  var M3D = window.M3D;
  var W = M3D.WORLD;
  var mat4 = M3D.mat4;
  var O = M3D.orbit;
  var G_SUN = W.G_SUN;
  var FLASH_LAP = M3D.GAME_CONST.FLASH_LAP;

  // 单次点火的速度增量上限（游戏单位/秒）；满燃料 19 → 约 6 次点火机会
  var DV_MAX = 3.0;
  var AIM_DEAD = 12;        // 拖动死区（px）
  var AIM_FULL = 0.30;      // 达满推力所需拖动距离（屏幕短边比例）

  // ---- DOM ----
  var canvas = document.getElementById('stage');
  var elPhase = document.getElementById('phase');
  var elLap = document.getElementById('lap');
  var elDist = document.getElementById('tm-dist');
  var elSpeed = document.getElementById('tm-speed');
  var elEsc = document.getElementById('tm-esc');
  var elApa = document.getElementById('tm-apa');
  var elYear = document.getElementById('tm-year');
  var elFuelFill = document.getElementById('fuel-fill');
  var elFuelNum = document.getElementById('fuel-num');
  var elWarn = document.getElementById('warn');
  var elAim = document.getElementById('aim');
  var elGuide = document.getElementById('guide');
  var elStory = document.getElementById('story');
  var elStYear = document.getElementById('st-year');
  var elStTitle = document.getElementById('st-title');
  var elStText = document.getElementById('st-text');
  var elStFill = document.getElementById('st-fill');
  var elStHint = document.getElementById('st-hint');
  var elStSkip = document.getElementById('st-skip');
  var elResult = document.getElementById('result');
  var elRsTitle = document.getElementById('rs-title');
  var elRsText = document.getElementById('rs-text');
  var elRsStat = document.getElementById('rs-stat');
  var elRsBtn = document.getElementById('rs-btn');
  var elFlash = document.getElementById('flash');
  var elLoader = document.getElementById('loader');
  var elFallback = document.getElementById('fallback');
  var elSound = document.getElementById('btn-sound');
  var tsBtns = [].slice.call(document.querySelectorAll('.ts-btn'));

  // ---- 渲染器 ----
  var renderer = null;
  try { renderer = M3D.createRenderer(canvas); } catch (e) { renderer = null; }
  if (!renderer) {
    if (elLoader) elLoader.classList.add('hide');
    if (elFallback) elFallback.style.display = 'flex';
    return;
  }
  renderer.camera.near = 0.5;
  renderer.camera.far = 60000;
  renderer.setClearColor(0.006, 0.010, 0.020);
  renderer.stars.setAlpha(1);

  // 2D 叠加层（轨道线 / 箭头 / 标注）：与 WebGL 画布同尺寸，纯绘制、不收事件
  var fxCanvas = document.getElementById('fx');
  var fctx = fxCanvas ? fxCanvas.getContext('2d') : null;

  var world = M3D.buildWorld(renderer);
  var game = M3D.createGame();
  var st = game.state;
  var audio = M3D.createAudio ? M3D.createAudio() : null;

  var mode = 'prologue';        // prologue | play | rebellion | over
  var rebellionDone = false;
  var flash = 0;                // 白闪强度 0..1
  var nearTimer = 0;            // 点火后保持近景的余时（秒）
  var elapsed = 0;              // 用于脉冲动画

  // ============================================================
  //  剧情
  // ============================================================
  var story = M3D.createStory({
    onSound: function (name) { playSound(name); },
    onBeat: function (phase, i, beat) { syncStory(); },
    onEnd: function (phase) {
      if (phase === 'prologue') enterPlay();
      else endRebellion();
    }
  });

  function syncStory() {
    if (!story.active) return;
    var v = story.view;
    if (elStTitle) elStTitle.textContent = v.title;
    if (elStText) elStText.textContent = v.text;
    if (elStYear) {
      elStYear.textContent = story.phase === 'prologue'
        ? '刹车时代 · 第 ' + Math.round(v.year) + ' 年'
        : '逃逸时代';
    }
  }

  function showStoryLayer(on) {
    if (elStory) elStory.classList.toggle('show', !!on);
    document.body.classList.toggle('in-story', !!on);
    if (on && elStHint) elStHint.textContent = '点击任意处继续 · 右上角可跳过';
  }

  function startPrologue() {
    mode = 'prologue';
    showStoryLayer(true);
    story.play('prologue');
    syncStory();
  }

  function enterPlay() {
    mode = 'play';
    showStoryLayer(false);
    game.start();
    if (elPhase) elPhase.textContent = '逃逸时代';
    startTutorial();
  }

  function startRebellion() {
    rebellionDone = true;
    mode = 'rebellion';
    showStoryLayer(true);
    story.play('rebellion');
    syncStory();
  }

  function endRebellion() {
    mode = 'play';
    showStoryLayer(false);
    if (elPhase) elPhase.textContent = '逃逸时代';
  }

  // ============================================================
  //  音效
  // ============================================================
  function unlockAudio() { if (audio && audio.unlock) audio.unlock(); }

  function playSound(name) {
    if (!audio) return;
    if (name === 'ignite') { audio.clank(1.2); audio.beep('go'); flash = Math.max(flash, 0.5); }
    else if (name === 'chime') audio.chime();
    else if (name === 'boom') { audio.clank(2.0); audio.thud(); flash = 1; }
  }

  // ============================================================
  //  相机：双档自动切换
  // ============================================================
  var camT = [0, 0, 0], camDist = 320, camElev = 0.92;

  function cameraWants() {
    if (mode === 'prologue') {
      var sc = story.scene;
      if (sc && sc.cam === 'near') return { t: st.pos, d: 44 };
      return { t: [0, 0, 0], d: 330 };
    }
    if (st.burning || nearTimer > 0) return { t: st.pos, d: 54 };
    var el = st.orbit;
    var apo = (el && isFinite(el.ra)) ? el.ra : st.rSun;
    return { t: [0, 0, 0], d: Math.max(320, Math.min(2800, apo * 2.4)) };
  }

  function updateCamera(dt) {
    if (!aim.active) {                       // 瞄准期间冻结相机
      var want = cameraWants();
      var k = 1 - Math.exp(-dt * 2.4);
      camT[0] += (want.t[0] - camT[0]) * k;
      camT[1] += (want.t[1] - camT[1]) * k;
      camT[2] += (want.t[2] - camT[2]) * k;
      camDist += (want.d - camDist) * k;
    }
    var c = renderer.camera;
    var d = camDist * wheelBias;                  // wheelBias：用户滚轮的额外缩放
    var ce = Math.cos(camElev) * d, se = Math.sin(camElev) * d;
    c.eye[0] = camT[0]; c.eye[1] = camT[1] + se; c.eye[2] = camT[2] + ce;
    c.target[0] = camT[0]; c.target[1] = camT[1]; c.target[2] = camT[2];
    c.up[0] = 0; c.up[1] = 1; c.up[2] = 0;
    c.fov = 50 * Math.PI / 180;
  }

  function updateLight() {
    var c = renderer.camera;
    var dx = c.eye[0] - c.target[0], dy = c.eye[1] - c.target[1], dz = c.eye[2] - c.target[2];
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    renderer.light.dir[0] = dx / l; renderer.light.dir[1] = dy / l; renderer.light.dir[2] = dz / l;
  }

  // ============================================================
  //  输入：拖出箭头 → 松手执行点火
  // ============================================================
  var aim = { active: false, sx: 0, sy: 0, x: 0, y: 0, dirX: 0, dirZ: 0, dv: 0, valid: false };
  var predictEl = null;      // 瞄准时的预测轨道要素

  function canControl() {
    if (mode === 'play') return true;
    if (mode === 'rebellion' && !story.freeze) return true;   // 氦闪幕允许自救
    return false;
  }

  function localXY(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function updateAim() {
    var dx = aim.x - aim.sx, dy = aim.y - aim.sy;
    var d = Math.sqrt(dx * dx + dy * dy);
    aim.valid = d >= AIM_DEAD;
    var w = Math.min(canvas.clientWidth, canvas.clientHeight) || 400;
    var mag = Math.max(0, Math.min(1, (d - AIM_DEAD) / (w * AIM_FULL)));
    aim.dv = mag * DV_MAX;
    var l = d || 1;
    aim.dirX = dx / l; aim.dirZ = dy / l;
    predictEl = aim.valid
      ? O.afterDv(st.pos[0], st.pos[2], st.vel[0], st.vel[2], G_SUN, aim.dirX * aim.dv, aim.dirZ * aim.dv, predictEl || {})
      : null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    unlockAudio();
    if (mode === 'prologue') { story.tap(); syncStory(); return; }
    if (mode === 'over') return;
    if (!canControl()) return;
    if (st.status !== 'ready' && st.status !== 'flying') return;
    var p = localXY(e);
    aim.active = true; aim.sx = p[0]; aim.sy = p[1]; aim.x = p[0]; aim.y = p[1];
    aim.dv = 0; aim.valid = false; predictEl = null;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    advanceTutorial(1);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!aim.active) return;
    var p = localXY(e);
    aim.x = p[0]; aim.y = p[1];
    updateAim();
  });

  function endAim(commit) {
    if (!aim.active) return;
    aim.active = false;
    if (commit && aim.valid && st.fuel > 0) {
      var got = game.commitBurn(aim.dirX, aim.dirZ, aim.dv);
      if (got > 0) nearTimer = 1.4;
      advanceTutorial(2);
    }
    aim.valid = false; aim.dv = 0; predictEl = null;
  }
  canvas.addEventListener('pointerup', function () { endAim(true); });
  canvas.addEventListener('pointercancel', function () { endAim(false); });
  canvas.addEventListener('pointerleave', function () { endAim(false); });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    wheelBias = Math.max(0.5, Math.min(2.2, wheelBias * (e.deltaY > 0 ? 1.12 : 0.89)));
  }, { passive: false });
  var wheelBias = 1;

  // ============================================================
  //  引导（三步，学会后不再出现）
  // ============================================================
  var TUT_KEY = 'we3d_tutorial_done';
  var tut = { on: false, step: 0, t: 0 };

  function startTutorial() {
    var seen = false;
    try { seen = window.localStorage.getItem(TUT_KEY) === '1'; } catch (e) { seen = false; }
    if (seen) { tut.on = false; return; }
    tut.on = true; tut.step = 1; tut.t = 0;
    setGuide('在屏幕上拖出箭头，为行星发动机设定点火方向');
  }

  function advanceTutorial(toStep) {
    if (!tut.on) return;
    if (toStep === 1 && tut.step === 1) { tut.step = 2; setGuide('松手执行点火。橙色虚线是点火后的新轨道'); }
    else if (toStep === 2 && tut.step === 2) { tut.step = 3; tut.t = 0; setGuide('近日点附近点火最省力。留意轨道上的近日点标记'); }
  }

  function setGuide(text) {
    if (!elGuide) return;
    elGuide.textContent = text;
    elGuide.classList.toggle('show', !!text);
  }

  function updateTutorial(dt) {
    if (!tut.on) return;
    if (tut.step === 3) {
      tut.t += dt;
      if (tut.t > 5) {
        tut.on = false;
        setGuide('');
        try { window.localStorage.setItem(TUT_KEY, '1'); } catch (e) { /* 隐私模式下忽略 */ }
      }
    }
  }

  // ============================================================
  //  场景表现：发动机阵列 / 月球 / 太阳膨胀 / 地表
  // ============================================================
  var moonAngle = 0, moonR = W.EARTH_R * 4, moonAlpha = 1, moonGone = false;
  var burnGlow = 0;
  var swallowed = [false, false, false, false, false];   // 被氦闪吞没的行星（轨道环一并隐藏）

  function setSunScale(s) {
    var m = world.sun.core.modelMatrix;
    mat4.identity(m);
    mat4.scale(m, m, [s, s, s]);
    mat4.copy(world.sun.glow.modelMatrix, m);
    mat4.copy(world.sun.halo.modelMatrix, m);
  }

  function updateScene(dt) {
    var sc = story.scene;
    var engines = sc ? sc.engines : 1;
    var spinRate = sc ? sc.spin : 0;
    var city = sc ? sc.city : 0.1;
    var flood = sc ? sc.flood : 0;
    var storm = sc ? sc.storm : 0.2;
    var sunAnom = sc ? sc.sunAnom : 0.3;
    var sunMul = sc ? sc.sunMul : 1;

    // 序章期间自转由剧情脚本驱动；进入逃逸时代后地球已停转
    if (mode === 'prologue') st.spin += spinRate * dt;

    // 行星发动机：常亮微光 + 点火时全亮
    var want = engines * (0.28 + 0.72 * burnGlow);
    M3D.updateEngines(world.engines, world.earth.body.modelMatrix, want);

    // 地表：迁入地下城后城市灯光熄灭，只剩发动机的光
    var c = 0.5 + city * 0.5;
    world.earth.body.color[0] = c; world.earth.body.color[1] = c; world.earth.body.color[2] = c;
    // 海啸：云层加厚翻涌；风暴：大气壳增强
    world.earth.clouds.alpha = 0.55 + flood * 0.4;
    world.earth.atmo.atmoStrength = 1.0 + storm * 0.9;

    // 太阳：异常增亮 → 氦闪膨胀
    world.sun.halo.alpha = 0.22 + sunAnom * 0.5;
    setSunScale(sunMul);
    st.flashR = sunMul > 1.25 ? W.SUN_R * sunMul : 0;

    // 被膨胀的太阳吞没的内行星
    var sunR = W.SUN_R * sunMul;
    for (var i = 0; i < world.planets.length; i++) {
      var def = W.planets[i];
      if (sunR > def.orbitR && !swallowed[i]) {
        swallowed[i] = true;
        world.planets[i].mesh.visible = false;
        if (world.planets[i].ring) world.planets[i].ring.visible = false;
      }
    }

    // 月球：绕地 → 被推离 → 消失
    var moon = world.moon, plume = world.moonPlume;
    var mm = sc ? sc.moon : 'gone';
    if (mm === 'orbit') {
      moonAngle += dt * 0.45; moonR = W.EARTH_R * 4; moonAlpha = 1;
    } else if (mm === 'leave') {
      moonAngle += dt * 0.45;
      moonR += dt * W.EARTH_R * 1.5;
      moonAlpha = Math.max(0, moonAlpha - dt * 0.16);
    } else {
      moonAlpha = 0;
    }
    var showMoon = moonAlpha > 0.02;
    moon.visible = showMoon; plume.visible = showMoon && mm === 'leave';
    if (showMoon) {
      var mx = st.pos[0] + Math.cos(moonAngle) * moonR;
      var mz = st.pos[2] + Math.sin(moonAngle) * moonR;
      M3D.placeSphere(moon.modelMatrix, [mx, 0, mz], moonAngle * 0.5, 0);
      moon.alpha = moonAlpha;
      // 尾焰朝远离地球的一侧
      var ox = mx - st.pos[0], oz = mz - st.pos[2];
      var ol = Math.sqrt(ox * ox + oz * oz) || 1;
      M3D.orientUp(plume.modelMatrix, [ox / ol, 0, oz / ol]);
      mat4.translate(plume.modelMatrix, plume.modelMatrix,
        [mx + ox / ol * 1.9, 0, mz + oz / ol * 1.9]);
      plume.alpha = moonAlpha * 0.9;
    }

    // 推力尾焰（预定量点火或持续推力期间）
    var th = world.thruster;
    var dirX = 0, dirZ = 0, mag = 0;
    if (st.burn) { dirX = st.burn.dx; dirZ = st.burn.dz; mag = 1; }
    else if (st.thrustMag > 0) { dirX = st.thrustDir[0]; dirZ = st.thrustDir[2]; mag = st.thrustMag; }
    if (mag > 0) {
      var bx = st.pos[0] - dirX * W.EARTH_R, by = 0 - 0 * W.EARTH_R, bz = st.pos[2] - dirZ * W.EARTH_R;
      M3D.orientUp(th.modelMatrix, [-dirX, 0, -dirZ]);
      mat4.translate(th.modelMatrix, th.modelMatrix, [bx, by, bz]);
      th.visible = true;
      th.alpha = 0.45 + 0.45 * mag;
    } else {
      th.visible = false;
    }

    burnGlow += ((st.burning ? 1 : 0) - burnGlow) * Math.min(1, dt * 6);
  }

  function renderBodies() {
    M3D.placeEarth(world.earth, st.pos, st.spin);
    for (var i = 0; i < world.planets.length; i++) {
      var p = world.planets[i], ps = st.planets[i];
      M3D.placeSphere(p.mesh.modelMatrix, ps.pos, p.angle, 0.32);
      if (p.ring) M3D.placeSphere(p.ring.modelMatrix, ps.pos, p.angle * 0.4, 0.47);
    }
  }

  // ============================================================
  //  2D 叠加层：轨道线 / 预测线 / 近日点 / 影响球 / 箭头
  // ============================================================
  var pr = { x: 0, y: 0, visible: false };
  var pt2 = [0, 0];
  var pv = [0, 0, 0];

  // 世界坐标 → 屏幕像素（renderer.project 收的是 [x,y,z] 数组 + 输出对象）
  function proj(x, z) { pv[0] = x; pv[1] = 0; pv[2] = z; renderer.project(pv, pr); return pr; }

  function strokeOrbit(el, dashed, color, width, maxR) {
    if (!el) return;
    var n = 190;
    var t0 = el.theta;
    var span = el.bound ? Math.PI * 2 : Math.PI * 0.9;
    if (!el.bound) t0 = el.theta - span * 0.5;
    fctx.beginPath();
    var started = false;
    for (var i = 0; i <= n; i++) {
      var th = t0 + span * (i / n);
      O.pointAt(el, th, pt2);
      var r = Math.sqrt(pt2[0] * pt2[0] + pt2[1] * pt2[1]);
      if (maxR && r > maxR) { started = false; continue; }
      var p = proj(pt2[0], pt2[1]);
      if (!p.visible) { started = false; continue; }
      if (!started) { fctx.moveTo(p.x, p.y); started = true; }
      else fctx.lineTo(p.x, p.y);
    }
    fctx.strokeStyle = color;
    fctx.lineWidth = width;
    fctx.setLineDash(dashed ? [5, 6] : []);
    fctx.stroke();
    fctx.setLineDash([]);
  }

  function drawFx() {
    if (!fctx) return;
    var cw = fxCanvas.clientWidth, ch = fxCanvas.clientHeight;
    fctx.clearRect(0, 0, cw, ch);
    var camR = camDist * wheelBias;
    var far = camR > 150;

    // 3D 轨道环只在远景有意义：近景下它们是横穿屏幕的色带
    var showRings = camR > 230;
    world.earthOrbit.visible = showRings;
    for (var r0 = 0; r0 < world.orbits.length; r0++) {
      world.orbits[r0].visible = showRings && !swallowed[r0];
    }

    // 地球当前轨道（序章是近景叙事，不画轨道线）
    if (mode !== 'prologue') strokeOrbit(st.orbit, false, 'rgba(92,200,255,0.55)', 1.3, 0);
    // 瞄准时的预测轨道
    if (aim.valid && predictEl) strokeOrbit(predictEl, true, 'rgba(255,184,77,0.9)', 1.4, 0);

    // 行星影响球（只在靠近时画，避免画面噪音）
    for (var j = 0; j < W.planets.length; j++) {
      var d = W.planets[j], ps = st.planets[j];
      var ddx = st.pos[0] - ps.pos[0], ddz = st.pos[2] - ps.pos[2];
      var dist = Math.sqrt(ddx * ddx + ddz * ddz);
      if (dist > d.capR * 4.5) continue;
      var pc = proj(ps.pos[0], ps.pos[2]);
      if (!pc.visible) continue;
      var edge = proj(ps.pos[0], ps.pos[2] + d.capR);
      var rad = Math.abs(edge.x - pc.x) + Math.abs(edge.y - pc.y);
      if (!(rad > 1)) continue;
      var danger = dist < d.capR;
      fctx.beginPath();
      fctx.arc(pc.x, pc.y, rad, 0, Math.PI * 2);
      fctx.strokeStyle = danger ? 'rgba(255,140,90,0.75)' : 'rgba(140,170,220,0.2)';
      fctx.lineWidth = danger ? 1.4 : 1;
      fctx.setLineDash(danger ? [4, 4] : [2, 6]);
      fctx.stroke();
      fctx.setLineDash([]);
      if (dist < d.capR * 2.6) {
        fctx.fillStyle = danger ? 'rgba(255,170,120,0.95)' : 'rgba(160,185,220,0.6)';
        fctx.font = '11px -apple-system, "PingFang SC", sans-serif';
        fctx.textAlign = 'center';
        fctx.fillText(d.name + (danger ? ' · 引力捕获区' : ''), pc.x, pc.y - rad - 6);
      }
    }

    // 近日点标记（轨道够扁才画；近圆轨道近日点没有意义）
    var el = st.orbit;
    if (el && el.e > 0.03 && mode !== 'prologue') {
      O.pointAt(el, 0, pt2);
      var pp = proj(pt2[0], pt2[1]);
      if (pp.visible) {
        var pulse = st.peri > 0.45 ? 5 + Math.sin(elapsed * 4) * 2.5 + st.peri * 5 : 5;
        fctx.beginPath(); fctx.arc(pp.x, pp.y, pulse, 0, Math.PI * 2);
        fctx.strokeStyle = st.peri > 0.45 ? 'rgba(255,184,77,0.95)' : 'rgba(92,200,255,0.75)';
        fctx.lineWidth = 1.3; fctx.stroke();
        fctx.beginPath(); fctx.arc(pp.x, pp.y, 1.6, 0, Math.PI * 2);
        fctx.fillStyle = st.peri > 0.45 ? 'rgba(255,184,77,1)' : 'rgba(92,200,255,1)';
        fctx.fill();
        fctx.fillStyle = st.peri > 0.45 ? 'rgba(255,184,77,0.95)' : 'rgba(150,180,215,0.7)';
        fctx.font = '11px -apple-system, "PingFang SC", sans-serif';
        fctx.textAlign = 'left';
        fctx.fillText(st.peri > 0.45 ? '近日点 · 点火窗口' : '近日点', pp.x + 9, pp.y + 4);
      }
    }

    // 地球标记：远景下地球只有几个像素 —— 可见时画准星，出画时在屏幕边缘指示方向
    if (far && st.status !== 'crashed' && mode !== 'prologue') {
      var pe = proj(st.pos[0], st.pos[2]);
      var cx = cw / 2, cy = ch / 2, mg = 30;
      var ix, iy, off = false;
      if (pe.visible) { ix = pe.x; iy = pe.y; }
      else {
        off = true;
        var sE = Math.sin(camElev);
        var dxs = st.pos[0], dys = st.pos[2] * sE;
        var dl = Math.sqrt(dxs * dxs + dys * dys) || 1;
        dxs /= dl; dys /= dl;
        var hw = cw / 2 - mg, hh = ch / 2 - mg;
        var tE = Math.min(hw / Math.max(1e-6, Math.abs(dxs)), hh / Math.max(1e-6, Math.abs(dys)));
        ix = cx + dxs * tE; iy = cy + dys * tE;
      }
      var R0 = off ? 7 : 9;
      fctx.strokeStyle = off ? 'rgba(92,200,255,0.95)' : 'rgba(232,238,251,0.9)';
      fctx.lineWidth = 1.2;
      fctx.beginPath(); fctx.arc(ix, iy, R0, 0, Math.PI * 2); fctx.stroke();
      fctx.beginPath();
      fctx.moveTo(ix - R0 - 5, iy); fctx.lineTo(ix - R0 + 1, iy);
      fctx.moveTo(ix + R0 - 1, iy); fctx.lineTo(ix + R0 + 5, iy);
      fctx.moveTo(ix, iy - R0 - 5); fctx.lineTo(ix, iy - R0 + 1);
      fctx.moveTo(ix, iy + R0 - 1); fctx.lineTo(ix, iy + R0 + 5);
      fctx.stroke();
      if (off) {
        var ang = Math.atan2(iy - cy, ix - cx);
        fctx.save();
        fctx.translate(ix, iy);
        fctx.rotate(ang);
        fctx.beginPath();
        fctx.moveTo(R0 + 13, 0);
        fctx.lineTo(R0 + 5, -4.5); fctx.lineTo(R0 + 5, 4.5);
        fctx.closePath();
        fctx.fillStyle = 'rgba(92,200,255,0.95)';
        fctx.fill();
        fctx.restore();
      }
    }

    // 推力箭头（从地球屏幕位置出发，沿拖动方向）
    if (aim.active && aim.valid) {
      var pa = proj(st.pos[0], st.pos[2]);
      var dx = aim.x - aim.sx, dy = aim.y - aim.sy;
      var d2 = Math.sqrt(dx * dx + dy * dy) || 1;
      var len = Math.min(96, 26 + (aim.dv / DV_MAX) * 70);
      var ux = dx / d2, uy = dy / d2;
      var x1 = pa.x + ux * len, y1 = pa.y + uy * len;
      fctx.strokeStyle = 'rgba(255,184,77,0.95)';
      fctx.lineWidth = 2.2; fctx.lineCap = 'round';
      fctx.beginPath(); fctx.moveTo(pa.x, pa.y); fctx.lineTo(x1, y1); fctx.stroke();
      var hs = 8;
      fctx.beginPath();
      fctx.moveTo(x1, y1);
      fctx.lineTo(x1 - ux * hs - uy * hs * 0.6, y1 - uy * hs + ux * hs * 0.6);
      fctx.lineTo(x1 - ux * hs + uy * hs * 0.6, y1 - uy * hs - ux * hs * 0.6);
      fctx.closePath();
      fctx.fillStyle = 'rgba(255,184,77,0.95)'; fctx.fill();
      // 起点圆环
      fctx.beginPath(); fctx.arc(pa.x, pa.y, 4, 0, Math.PI * 2);
      fctx.strokeStyle = 'rgba(255,184,77,0.8)'; fctx.lineWidth = 1.4; fctx.stroke();
    }
  }

  // ============================================================
  //  HUD
  // ============================================================
  var hudTick = 0;
  var KMS = M3D.GAME_UNITS.KMS_PER_UNIT;

  function updateHud() {
    hudTick++;
    if (hudTick % 4 !== 0) return;

    if (mode === 'prologue') {
      if (elPhase) elPhase.textContent = '序章 · 刹车时代';
      if (elLap) elLap.textContent = '刹车时代 · 42 年';
    } else if (mode === 'rebellion') {
      if (elPhase) elPhase.textContent = '叛乱';
      if (elLap) elLap.textContent = '第 ' + st.lap + ' / ' + st.lapTotal + ' 圈';
    } else {
      if (elPhase) elPhase.textContent = '逃逸时代';
      var lapTxt = '第 ' + Math.max(0, Math.min(st.lapTotal, st.lap)) + ' / ' + st.lapTotal + ' 圈';
      if (elLap) {
        elLap.textContent = lapTxt;
        elLap.classList.toggle('reached', st.escapeRatio >= 1);
      }
    }

    if (elDist) elDist.textContent = st.rSunAU.toFixed(2) + ' AU';
    if (elSpeed) elSpeed.textContent = st.speedKms.toFixed(1) + ' km/s';
    if (elEsc) {
      elEsc.textContent = st.escapeRatio.toFixed(2);
      elEsc.className = 'tm-v' + (st.escapeRatio >= 1 ? ' ok' : '');
      elEsc.title = '≥ 1.00 即具备脱离太阳引力的速度';
    }
    if (elApa) {
      elApa.textContent = st.orbit
        ? (isFinite(st.orbit.ra) ? (st.orbit.ra / W.AU).toFixed(2) + ' AU' : '脱离轨道')
        : '—';
    }
    if (elYear) {
      elYear.textContent = mode === 'prologue'
        ? Math.round(story.view.year) + ' 年'
        : st.years.toFixed(1) + ' 年';
    }

    var f = Math.max(0, st.fuel);
    if (elFuelFill) {
      elFuelFill.style.width = (f * 100).toFixed(1) + '%';
      elFuelFill.className = f <= 0.001 ? 'out' : (f < 0.25 ? 'low' : '');
    }
    if (elFuelNum) elFuelNum.textContent = (f * 100).toFixed(0) + '% · 余 ' + (f * W.fuelDv * KMS).toFixed(1) + ' km/s';

    if (elWarn) {
      elWarn.textContent = st.warn || '';
      elWarn.style.opacity = st.warn ? '1' : '0';
    }

    if (elAim) {
      if (aim.active && aim.valid) {
        var gain = Math.round(M3D.GAME_CONST.OBERTH_GAIN * st.peri * 100);
        elAim.textContent = '点火 Δv ' + (aim.dv * KMS).toFixed(1) + ' km/s'
          + (gain > 0 ? '　近日点效率 +' + gain + '%' : '');
        elAim.style.opacity = '1';
      } else {
        elAim.style.opacity = '0';
      }
    }
  }

  // ============================================================
  //  结算
  // ============================================================
  var RESULT_TITLE = { escaped: '飞出太阳系', crashed: '任务失败', caught: '任务失败', burned: '任务失败' };

  function statRow(k, v) {
    return '<div class="tm-row"><span class="tm-k">' + k + '</span><span class="tm-v">' + v + '</span></div>';
  }

  function showResult() {
    mode = 'over';
    var good = st.status === 'escaped';
    if (elRsTitle) {
      elRsTitle.textContent = RESULT_TITLE[st.status] || '任务结束';
      elRsTitle.className = 'rs-title ' + (good ? 'good' : 'bad');
    }
    if (elRsText) elRsText.textContent = st.reason;
    if (elRsStat) {
      elRsStat.innerHTML =
        statRow('任务时间', st.years.toFixed(2) + ' 年') +
        statRow('绕日圈数', Math.max(0, st.lap) + ' 圈') +
        statRow('最远距离', (st.maxR / W.AU).toFixed(2) + ' AU') +
        statRow('剩余燃料', (st.fuel * 100).toFixed(0) + '%');
    }
    if (elResult) elResult.classList.add('show');
    if (audio) audio.silence();
  }

  function restart() {
    game.reset();
    rebellionDone = false;
    flash = 0; nearTimer = 0; burnGlow = 0;
    moonAngle = 0; moonR = W.EARTH_R * 4; moonAlpha = 1;
    setSunScale(1);
    st.flashR = 0;
    swallowed = [false, false, false, false, false];
    for (var i = 0; i < world.planets.length; i++) {
      world.planets[i].mesh.visible = true;
      if (world.planets[i].ring) world.planets[i].ring.visible = true;
      world.orbits[i].visible = true;
    }
    if (elResult) elResult.classList.remove('show');
    if (elFlash) elFlash.style.opacity = '0';
    // 重开不再重播序章（重开成本低是设计的一部分），直接进逃逸时代
    mode = 'play';
    showStoryLayer(false);
    game.start();
    if (elPhase) elPhase.textContent = '逃逸时代';
    tut.on = false; setGuide('');
  }

  if (elRsBtn) elRsBtn.addEventListener('click', restart);
  if (elStSkip) elStSkip.addEventListener('click', function () { unlockAudio(); story.skip(); });

  // ---- 时间倍率与声音 ----
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

  if (elSound) {
    elSound.addEventListener('click', function () {
      if (!audio) return;
      var m = !audio.isMuted();
      audio.setMuted(m);
      elSound.classList.toggle('on', !m);
      elSound.classList.toggle('off', m);
      elSound.textContent = m ? '静音' : '声';
    });
    elSound.classList.add('on');
  }

  // ============================================================
  //  主循环
  // ============================================================
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  function doResize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    renderer.resize(w, h, dpr);
    if (fxCanvas) {
      fxCanvas.width = Math.round(w * dpr);
      fxCanvas.height = Math.round(h * dpr);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  window.addEventListener('resize', doResize);

  var last = 0, loaderHidden = false, audioTick = 0;
  function frame(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    elapsed += dt;

    // 剧情推进
    story.update(dt);
    if (story.active) {
      syncStory();
      if (elStFill) elStFill.style.width = (story.view.progress * 100).toFixed(1) + '%';
    }

    // 物理：叛乱前两幕冻结时间
    if (!(story.active && story.freeze)) game.step(dt);

    // 第 10 圈触发叛乱与氦闪
    if (mode === 'play' && !rebellionDone && st.lap >= FLASH_LAP) startRebellion();

    if (nearTimer > 0) nearTimer -= dt;
    updateTutorial(dt);

    renderBodies();
    updateScene(dt);
    updateCamera(dt);
    updateLight();
    if (renderer.particles && renderer.particles.update) renderer.particles.update(dt);
    renderer.render(dt);
    drawFx();
    updateHud();

    // 白闪衰减
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 1.3);
      if (elFlash) elFlash.style.opacity = (flash * 0.85).toFixed(3);
    }

    // 发动机隆隆声（限频，避免每帧调 WebAudio）
    if (audio) {
      audioTick++;
      if (audioTick % 5 === 0) {
        var sc2 = story.scene;
        audio.setRumble((sc2 ? sc2.engines : 1) * (0.16 + 0.84 * burnGlow), 0.35);
      }
    }

    // 胜负结算
    if (mode === 'play' || mode === 'rebellion') {
      if (st.status === 'crashed' || st.status === 'caught' || st.status === 'burned' || st.status === 'escaped') {
        showResult();
      }
    }

    if (!loaderHidden) { if (elLoader) elLoader.classList.add('hide'); loaderHidden = true; }
    requestAnimationFrame(frame);
  }

  doResize();
  // 初始机位：序章从地球近景开始
  camT[0] = st.pos[0]; camT[1] = st.pos[1]; camT[2] = st.pos[2];
  camDist = 44;
  startPrologue();
  requestAnimationFrame(frame);
})();
