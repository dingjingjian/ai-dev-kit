/*
 * defcon — render.js
 * three.js r149 渲染：球 + 风格化滤镜 + 城市光点 + 单位 + 导弹 + 核爆
 * 依赖：three.min.js → data.js → geo.js → sim.js → ai.js
 * 命名空间：window.DC（经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → sim.js → ai.js → render.js → ui.js → game.js
 *
 * 性能红线（DESIGN §7.5）：城市 60 用 Points、单位用 InstancedMesh、导弹尾迹用 Line，
 * 禁止每帧 new Mesh —— 所有动态对象走预分配对象池，池满即复用最旧槽位。
 *
 * 风格化（DESIGN §2.3）：真实地球几何 + earth.jpg 底图，叠青灰压暗 + 矢量经纬网，
 * 做成军事沙盘质感。刻意不做 canvas 像素级滤镜：file:// 下 getImageData 会污染画布抛错，
 * 故风格化全部放到 GPU 端（材质染色 + 半透明冷色壳），零像素读取。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};
  var CONFIG = DC.CONFIG || {};
  var G = DC.geo;
  var THREE = global.THREE;

  var R = 1.6;                 // 球半径（沿用 earth-3d 的比例）
  var CITY_LIFT = 1.012;       // 城市光点离地高度
  var UNIT_LIFT = 1.020;       // 单位离地高度
  var MISSILE_POOL = 128;      // 同时在飞的导弹上限（全局最多 108 枚）
  var FX_POOL = 32;            // 核爆/拦截特效槽位
  var TRAIL_PTS = 8;           // 每枚导弹尾迹采样点数

  var api = { ok: false };
  var renderer, scene, camera, globe, gridGroup;
  var cityPoints, cityGeom, cityPos, cityColor, citySize, cityAlpha;
  var unitMeshes = {};         // type -> InstancedMesh
  var missilePool = [], fxPool = [];
  var scorchMarks = [];
  var raycaster, clock;
  var cam = { theta: 0.9, phi: 1.15, radius: 6.2, tTheta: 0.9, tPhi: 1.15, tRadius: 6.2 };
  var dragging = false, lastX = 0, lastY = 0, pinch = 0;
  var radarRings = [];
  var quality = 1;             // 1=默认档 0=降级档（DESIGN §7.5）

  /* ───────────────────────── 工具 ───────────────────────── */

  // 程序化径向渐变贴图（复用 earth-3d 的 radialTex 思路）
  function radialTex(c0, c1, c2) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, c0); g.addColorStop(0.4, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  var TEX = {};
  function buildTextures() {
    TEX.dot = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)');
    TEX.flash = radialTex('rgba(255,250,225,1)', 'rgba(255,190,90,0.65)', 'rgba(255,120,30,0)');
    TEX.small = radialTex('rgba(200,235,255,0.95)', 'rgba(120,190,255,0.4)', 'rgba(60,120,255,0)');
    TEX.scorch = radialTex('rgba(20,14,10,0.85)', 'rgba(35,25,18,0.45)', 'rgba(40,30,20,0)');
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
  }

  /* ───────────────────────── 场景搭建 ───────────────────────── */

  function buildGlobe() {
    var seg = quality ? 64 : 32;

    // 染色 + 冷色壳 = 降饱和压暗叠青灰，全部在 GPU 端完成
    var mat = new THREE.MeshStandardMaterial({
      color: 0x8fa6b8, roughness: 0.95, metalness: 0.02
    });
    globe = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg / 2), mat);
    scene.add(globe);

    loadGlobeTexture(mat, 0);

    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.0015, seg, seg / 2),
      new THREE.MeshBasicMaterial({
        color: 0x0b1a24, transparent: true, opacity: 0.38,
        depthWrite: false, side: THREE.FrontSide
      })
    );
    scene.add(shell);

    // 矢量经纬网：军事沙盘的网格感（改造自 earth-3d 的 latRing / meridian）
    gridGroup = new THREE.Group();
    var gR = R * 1.004, mat = new THREE.LineBasicMaterial({
      color: 0x5f9fb5, transparent: true, opacity: 0.16
    });
    var lats = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
    lats.forEach(function (lat) {
      var pts = [], i;
      for (i = 0; i <= 128; i++) pts.push(v3(lat, i / 128 * 360 - 180, gR));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    });
    for (var lon = -180; lon < 180; lon += 15) {
      var mp = [], j;
      for (j = 0; j <= 128; j++) mp.push(v3(j / 128 * 360 - 180, lon, gR));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(mp), mat));
    }
    scene.add(gridGroup);
  }

  /* 贴图加载链：内联 data URI → assets/earth.jpg → 纯色球体。
   *
   * 为什么内联优先：file:// 下 Chrome 把本地图片的 origin 视为 null，
   * 会以 CORS 拒绝它作为 WebGL 纹理（net::ERR_FAILED）—— 而「打 zip 双击 index.html」
   * 正是本工具的主战场，不能只在 http 下好看。内联 data URI 由 tools/gen-earth-tex.js
   * 生成，走 <script src> 而非 fetch，不受 CORS 约束也不碰红线。
   * http 场景两者都能用，但 data URI 免去一次网络请求，故仍以它为先。 */
  var GLOBE_TEX_SRC = [
    (typeof global.DC_EARTH_TEX === 'string' && global.DC_EARTH_TEX) ? global.DC_EARTH_TEX : null,
    'assets/earth.jpg'
  ];

  function loadGlobeTexture(mat, attempt) {
    var src = GLOBE_TEX_SRC[attempt];
    function fallback() {
      if (attempt + 1 < GLOBE_TEX_SRC.length) { loadGlobeTexture(mat, attempt + 1); return; }
      mat.color.setHex(0x5c7486);      // 纯色兜底：不白屏、不中断
      mat.needsUpdate = true;
    }
    if (!src) { fallback(); return; }
    try {
      new THREE.TextureLoader().load(src, function (tex) {
        if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = quality ? 4 : 1;
        mat.map = tex;
        mat.color.setHex(0xa8bccb);
        mat.needsUpdate = true;
        api.texOk = true;              // 供冒烟断言「贴图真的加载了」，而不是静默走纯色兜底
      }, undefined, fallback);
    } catch (e) {
      fallback();
    }
  }

  function v3(lat, lon, r) {
    var v = G.ll2v(lat, lon, r);
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  /* ───────────────────────── 城市光点（Points，60 座）─────────────────────────
   * 逐点大小/透明度靠自定义 attribute + ShaderMaterial 实现（PointsMaterial 不支持逐点尺寸）。
   * 这是 GLSL 源码字符串，不涉及 eval。
   */
  var CITY_VS = [
    'attribute float aSize;',
    'attribute float aAlpha;',
    'attribute vec3 aColor;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'uniform float uScale;',
    'void main(){',
    '  vColor = aColor; vAlpha = aAlpha;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * uScale / max(0.001, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var CITY_FS = [
    'uniform sampler2D uTex;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main(){',
    '  vec4 t = texture2D(uTex, gl_PointCoord);',
    '  gl_FragColor = vec4(vColor, 1.0) * t * vAlpha;',
    '  if (gl_FragColor.a < 0.01) discard;',
    '}'
  ].join('\n');

  function buildCities(state) {
    var n = state.cities.length;
    cityPos = new Float32Array(n * 3);
    cityColor = new Float32Array(n * 3);
    citySize = new Float32Array(n);
    cityAlpha = new Float32Array(n);

    state.cities.forEach(function (c, i) {
      var v = G.ll2v(c.lat, c.lon, R * CITY_LIFT);
      cityPos[i * 3] = v.x; cityPos[i * 3 + 1] = v.y; cityPos[i * 3 + 2] = v.z;
      var rgb = hexToRgb((DC.FACTIONS_BY_CODE[c.faction] || {}).color || '#ffffff');
      cityColor[i * 3] = rgb[0]; cityColor[i * 3 + 1] = rgb[1]; cityColor[i * 3 + 2] = rgb[2];
      // aSize 为「期望像素直径 × 距离」的系数；uScale = 画布高/2（见 syncPointScale）。
      // 首版写成 26+pop×1.6 配 uScale=320，在距离 6 时算出 1600+ 像素的巨型白点糊满全屏。
      citySize[i] = 0.30 + c.pop0 * 0.017;
      cityAlpha[i] = 1;
    });

    cityGeom = new THREE.BufferGeometry();
    cityGeom.setAttribute('position', new THREE.BufferAttribute(cityPos, 3));
    cityGeom.setAttribute('aColor', new THREE.BufferAttribute(cityColor, 3));
    cityGeom.setAttribute('aSize', new THREE.BufferAttribute(citySize, 1));
    cityGeom.setAttribute('aAlpha', new THREE.BufferAttribute(cityAlpha, 1));

    var mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: TEX.dot }, uScale: { value: 400 } },
      vertexShader: CITY_VS, fragmentShader: CITY_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    cityPoints = new THREE.Points(cityGeom, mat);
    scene.add(cityPoints);
  }

  // 点大小随画布高度缩放，保证不同分辨率下城市光点视觉尺寸一致
  function syncPointScale() {
    if (!cityPoints) return;
    var h = (renderer ? renderer.domElement.height : global.innerHeight) || 800;
    cityPoints.material.uniforms.uScale.value = h * 0.5;
  }

  // 城市被摧毁后由明转暗（光点熄灭）；焦痕另用 Sprite 贴在球面
  function syncCities(state) {
    if (!cityGeom) return;
    var dirty = false;
    state.cities.forEach(function (c, i) {
      var a = c.alive ? 1 : 0.12;
      if (cityAlpha[i] !== a) { cityAlpha[i] = a; dirty = true; }
    });
    if (dirty) cityGeom.getAttribute('aAlpha').needsUpdate = true;
  }

  function addScorch(lat, lon) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.scorch, transparent: true, depthWrite: false, opacity: 0.9
    }));
    var v = G.ll2v(lat, lon, R * 1.006);
    sp.position.set(v.x, v.y, v.z);
    sp.scale.setScalar(0.16);
    scene.add(sp);
    scorchMarks.push(sp);
    if (scorchMarks.length > 60) { var old = scorchMarks.shift(); scene.remove(old); }
  }

  /* ───────────────────────── 单位（InstancedMesh）─────────────────────────
   * 只渲染玩家阵营与已被标记的敌方单位 —— 敌方单位默认不可见（DESIGN §3 / §5.1）。
   */
  var UNIT_GEOM = {};
  function buildUnits(state) {
    UNIT_GEOM.silo = new THREE.OctahedronGeometry(0.028, 0);
    UNIT_GEOM.sam = new THREE.TetrahedronGeometry(0.030, 0);
    UNIT_GEOM.radar = new THREE.ConeGeometry(0.022, 0.05, 4);

    ['silo', 'sam', 'radar'].forEach(function (type) {
      var count = DC.FACTIONS.length * CONFIG[
        type === 'silo' ? 'silosPerFaction' : (type === 'sam' ? 'samPerFaction' : 'radarPerFaction')
      ];
      var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      var im = new THREE.InstancedMesh(UNIT_GEOM[type], mat, count);
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      scene.add(im);
      unitMeshes[type] = im;
    });
  }

  var _mtx = null, _col = null;
  function syncUnits(state) {
    if (!_mtx) { _mtx = new THREE.Matrix4(); _col = new THREE.Color(); }
    var counts = { silo: 0, sam: 0, radar: 0 };

    state.units.forEach(function (u) {
      // 可见性：己方全部可见；敌方仅在 exposed 时可见（D5 溯源会置位）
      var visible = (u.faction === state.playerFaction) || u.exposed;
      if (!visible) return;
      var im = unitMeshes[u.type];
      if (!im) return;
      var idx = counts[u.type];
      if (idx >= im.instanceMatrix.count) return;

      var v = G.ll2v(u.lat, u.lon, R * UNIT_LIFT);
      _mtx.makeTranslation(v.x, v.y, v.z);
      im.setMatrixAt(idx, _mtx);
      var rgb = hexToRgb((DC.FACTIONS_BY_CODE[u.faction] || {}).color || '#ffffff');
      _col.setRGB(rgb[0], rgb[1], rgb[2]);
      im.setColorAt(idx, _col);
      counts[u.type] = idx + 1;
    });

    Object.keys(unitMeshes).forEach(function (t) {
      var im = unitMeshes[t];
      im.count = counts[t];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
  }

  // 玩家雷达覆盖圈（角半径 → 球面圆环）
  function buildRadarRings(state) {
    radarRings.forEach(function (r) { scene.remove(r); });
    radarRings = [];
    DC.sim.unitsOf(state, state.playerFaction, 'radar').forEach(function (u) {
      var ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(circlePts(u, CONFIG.radarRadiusDeg, R * 1.005)),
        new THREE.LineBasicMaterial({ color: 0x39d0ff, transparent: true, opacity: 0.35 })
      );
      scene.add(ring);
      radarRings.push(ring);
    });
  }

  // 预警网失效期间隐藏覆盖圈 —— 事件卡 radar_down 的唯一即时反馈
  // （完整机制收益在 D5 弹道溯源：没有雷达覆盖就无法反推发射点）
  function syncRadarRings(state) {
    var down = (state.radarDown && state.radarDown[state.playerFaction] > 0);
    for (var i = 0; i < radarRings.length; i++) radarRings[i].visible = !down;
  }

  function circlePts(center, angDeg, r) {
    var pts = [];
    for (var i = 0; i <= 96; i++) {
      var p = G.destination(center, i / 96 * 360, angDeg);
      var v = G.ll2v(p.lat, p.lon, r);
      pts.push(new THREE.Vector3(v.x, v.y, v.z));
    }
    return pts;
  }

  /* ───────────────────────── 导弹对象池 ───────────────────────── */

  function buildMissilePool() {
    for (var i = 0; i < MISSILE_POOL; i++) {
      var head = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.small, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      head.scale.setScalar(0.05);
      head.visible = false;
      scene.add(head);

      var tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_PTS * 3), 3));
      var trail = new THREE.Line(tg, new THREE.LineBasicMaterial({
        color: 0xffd8a0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending
      }));
      trail.frustumCulled = false;
      trail.visible = false;
      scene.add(trail);

      missilePool.push({ head: head, trail: trail });
    }
  }

  function syncMissiles(state) {
    var i, n = Math.min(state.missiles.length, MISSILE_POOL);
    for (i = 0; i < n; i++) {
      var m = state.missiles[i], slot = missilePool[i];
      var p = G.ballistic(m.from, m.to, m.progress, R, 9);
      slot.head.position.set(p.x, p.y, p.z);
      slot.head.visible = true;
      slot.head.material.color.setHex(0xffffff);

      var arr = slot.trail.geometry.getAttribute('position');
      for (var k = 0; k < TRAIL_PTS; k++) {
        var tt = Math.max(0, m.progress - (TRAIL_PTS - 1 - k) * 0.012);
        var q = G.ballistic(m.from, m.to, tt, R, 9);
        arr.setXYZ(k, q.x, q.y, q.z);
      }
      arr.needsUpdate = true;
      slot.trail.visible = true;
    }
    for (; i < MISSILE_POOL; i++) {
      missilePool[i].head.visible = false;
      missilePool[i].trail.visible = false;
    }
  }

  /* ───────────────────────── 核爆 / 拦截特效池 ───────────────────────── */

  function buildFxPool() {
    for (var i = 0; i < FX_POOL; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      sp.visible = false;
      scene.add(sp);

      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.02, 0.028, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffc98a, transparent: true, opacity: 0.9,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        })
      );
      ring.visible = false;
      scene.add(ring);

      fxPool.push({ sp: sp, ring: ring, t: -1, dur: 1.6, big: true });
    }
  }

  // 消费 sim 投递的特效事件（拦截闪光 / 核爆 + 焦痕）
  function pumpFx(state, dt) {
    while (state.fx.length) {
      var e = state.fx.shift();
      var slot = null, i;
      for (i = 0; i < fxPool.length; i++) if (fxPool[i].t < 0) { slot = fxPool[i]; break; }
      if (!slot) { slot = fxPool[0]; }   // 池满则抢占最旧槽位
      var v = G.ll2v(e.lat, e.lon, R * 1.008);
      slot.sp.position.set(v.x, v.y, v.z);
      slot.ring.position.set(v.x, v.y, v.z);
      slot.ring.lookAt(0, 0, 0);
      slot.big = (e.type === 'impact');
      slot.t = 0;
      slot.dur = slot.big ? 1.8 : 0.6;
      slot.sp.visible = true;
      slot.ring.visible = slot.big;
      if (slot.big) addScorch(e.lat, e.lon);
    }

    for (var j = 0; j < fxPool.length; j++) {
      var f = fxPool[j];
      if (f.t < 0) continue;
      f.t += dt;
      var k = f.t / f.dur;
      if (k >= 1) { f.t = -1; f.sp.visible = false; f.ring.visible = false; continue; }
      var ease = 1 - k;
      if (f.big) {
        f.sp.scale.setScalar(0.10 + k * 0.42);
        f.sp.material.opacity = ease * 0.95;
        f.ring.scale.setScalar(1 + k * 7);
        f.ring.material.opacity = ease * 0.55;
      } else {
        f.sp.scale.setScalar(0.07 + k * 0.10);
        f.sp.material.opacity = ease * 0.8;
      }
    }
  }

  /* ───────────────────────── 相机控制（手写，无 OrbitControls）───────────────────────── */

  function applyCam() {
    var sp = Math.sin(cam.phi);
    camera.position.set(
      cam.radius * sp * Math.sin(cam.theta),
      cam.radius * Math.cos(cam.phi),
      cam.radius * sp * Math.cos(cam.theta)
    );
    camera.lookAt(0, 0, 0);
  }

  var R_MIN = 2.4, R_MAX = 14;
  function bindCam(canvas) {
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', function (e) {
      dragging = false;
      if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      cam.tTheta -= (e.clientX - lastX) * 0.005;
      cam.tPhi -= (e.clientY - lastY) * 0.005;
      cam.tPhi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.tPhi));
      lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      cam.tRadius *= 1 + (e.deltaY > 0 ? 0.08 : -0.08);
      cam.tRadius = Math.max(R_MIN, Math.min(R_MAX, cam.tRadius));
    }, { passive: false });
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) {
          cam.tRadius *= pinch / d;
          cam.tRadius = Math.max(R_MIN, Math.min(R_MAX, cam.tRadius));
        }
        pinch = d;
      }
    }, { passive: false });
  }

  // 相机飞向某点（点击城市列表时用；DESIGN §2.3 砍掉 2D 视图后的操作补偿手段）
  function flyTo(lat, lon) {
    var v = G.ll2v(lat, lon, 1);
    cam.tTheta = Math.atan2(v.x, v.z);
    cam.tPhi = Math.acos(Math.max(-1, Math.min(1, v.y)));
    cam.tPhi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.tPhi));
  }

  /* ───────────────────────── 拾取（D4 下发指令用）───────────────────────── */

  function pickCity(state, clientX, clientY, w, h) {
    if (!raycaster) raycaster = new THREE.Raycaster();
    var nd = new THREE.Vector2((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
    raycaster.setFromCamera(nd, camera);
    var hits = raycaster.intersectObject(globe, false);
    if (!hits.length) return null;
    var p = hits[0].point;
    var ll = G.v2ll({ x: p.x, y: p.y, z: p.z });
    var best = null, bestD = Infinity;
    state.cities.forEach(function (c) {
      if (!c.alive) return;
      var d = G.angular({ lat: c.lat, lon: c.lon }, ll) * 180 / Math.PI;
      if (d < bestD) { bestD = d; best = c; }
    });
    return (best && bestD < 4) ? best : null;   // 4° 容差，约 440 km
  }

  /* ───────────────────────── 初始化 / 每帧 ───────────────────────── */

  function init(state, canvas) {
    var gl = null;
    try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) {}
    if (!gl || typeof THREE === 'undefined') { api.ok = false; return false; }

    var w = canvas.clientWidth || global.innerWidth;
    var h = canvas.clientHeight || global.innerHeight;

    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: quality === 1, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, quality ? 1.5 : 1));
    renderer.setSize(w, h, false);
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080d);
    camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 5000);
    clock = new THREE.Clock();

    scene.add(new THREE.AmbientLight(0x2a3a4a, 1.1));
    var key = new THREE.DirectionalLight(0xdfe9f2, 1.5);
    key.position.set(4, 3, 5);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x2f6f8f, 0.7);
    rim.position.set(-5, -2, -4);
    scene.add(rim);

    buildTextures();
    buildGlobe();
    buildCities(state);
    syncPointScale();          // 必须在 setSize 之后：uScale 依赖画布实际像素高
    buildUnits(state);
    buildRadarRings(state);
    buildMissilePool();
    buildFxPool();
    bindCam(canvas);
    applyCam();

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      api.ok = false;
      if (api.onContextLost) api.onContextLost();
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      api.ok = true;
      if (api.onContextRestored) api.onContextRestored();
    }, false);

    api.ok = true;
    return true;
  }

  function resize() {
    if (!renderer) return;
    var w = global.innerWidth, h = global.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    syncPointScale();
  }

  // dt 为真实帧间隔；state 由 game.js 按固定步长推进，这里只做表现层同步
  function frame(state, dt) {
    if (!api.ok || !renderer) return;
    syncCities(state);
    syncUnits(state);
    syncRadarRings(state);
    syncMissiles(state);
    pumpFx(state, dt);

    cam.theta += (cam.tTheta - cam.theta) * 0.12;
    cam.phi += (cam.tPhi - cam.phi) * 0.12;
    cam.radius += (cam.tRadius - cam.radius) * 0.10;
    applyCam();

    renderer.render(scene, camera);
  }

  function setQuality(level) {
    quality = level ? 1 : 0;
    if (renderer) renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, quality ? 1.5 : 1));
  }

  DC.render = {
    ok: false,
    texOk: false,
    init: init,
    frame: frame,
    resize: resize,
    flyTo: flyTo,
    pickCity: pickCity,
    setQuality: setQuality,
    get scene() { return scene; },
    get camera() { return camera; }
  };
  api = DC.render;

})(typeof window !== 'undefined' ? window : globalThis);
