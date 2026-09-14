/*
 * air-tycoon — render.js
 * three.js r149 渲染：球 + 城市光点 + 航线大圆弧 + 客机沿弧飞行 + 事件特效
 * 依赖：three.min.js → data.js → geo.js → landmask.js → sim.js
 * 命名空间：window.AT（经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → landmask.js → sim.js → render.js → ui.js → game.js
 *
 * ── 视觉定位（对照 defcon 的军事沙盘转向商业蓝海）──
 * defcon 是「青灰压暗 + 矢量经纬网」的军事沙盘；本作的题材是民航经营，
 * 基调换成「夜色地球 + 暖金航线」——真实航司的航线图语言：
 *   · 地球保持真实贴图 + 冷蓝染色（不与 defcon 的暗青撞色）
 *   · 城市光点按**开发度等级**显大小与亮度（等级即玩家经营成果的可视化）
 *   · 已通航城市套**暖金定位环**（你的网络）；未通航城市只有暗白光点（待开拓）
 *   · 航线画成**大圆弧**（真实航路不是平面直线，球面上是大圆）
 *   · 客机是沿弧线移动的**小亮点 + 尾迹线段**，密度体现航班频次
 *
 * ── 性能红线 ──
 * 24 城用 Points、航线用单个 LineSegments 合批、客机用 InstancedMesh。
 * 禁止每帧 new Mesh / new Vector3 —— 所有动态对象走预分配池，满则复用最旧槽位。
 * 这四条与 defcon 同源，理由是移动端 GPU 的 draw call 才是瓶颈，不是顶点数。
 *
 * ── 与 sim 的契约 ──
 * 渲染层**只读** state，绝不改它（除 shift 掉 state.fx 事件队列，这是既定协议）。
 * 物理量（航线距离、大圆插值）一律调 AT.geo，不在渲染层重算 —— 抄一遍公式迟早与真身漂移。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};
  var CONFIG = AT.CONFIG || {};
  var G = AT.geo;
  var THREE = global.THREE;

  var R = 1.6;                 // 球半径（与 defcon / earth-3d 同比例，贴图采样率一致）
  var CITY_LIFT = 1.012;       // 城市光点离地高度
  var ARC_LIFT = 1.004;        // 航线贴地高度（低于城市，避免弧线压住光点）
  var PLANE_LIFT = 1.024;      // 客机离地高度（最高，保证永远不被城市/航线遮住）

  var MAX_ARCS = 96;           // 同时显示的航线数上限（玩家 + 竞对合计约 90 条）
  var ARC_SEG = 48;            // 每条大圆弧的采样段数（48 段在 1.6R 球面上已看不出折角）
  var MAX_PLANES = 320;        // 客机实例上限（玩家 + 竞对机队合计）
  var FX_POOL = 24;            // 事件特效槽位
  var RING_POOL = 6;           // 开航/升级的扩散环槽位

  /* ── 色板（集中管理，避免散落各处各自为政）──
   * 「红涨绿跌」是中国股市惯例，但本作不是股票软件，不使用涨跌色，
   * 改用**航线所有权**配色：我的航线是暖金（争夺焦点），竞对是冷灰蓝（背景干扰）。
   * 这是刻意的：玩家的注意力应该被自己的网络吸走，而不是去数竞对有多少条线。 */
  var PALETTE = {
    homeHex:      0xffd27a,    // 基地城市：明亮暖金
    mineHex:      0xffc247,    // 我的航点：暖金
    rivalHex:     0x5a7d96,    // 竞对航点：暗钢蓝
    virginHex:    0xb8cede,    // 未通航城市：中性冷白（有存在感但不抢眼，不能暗到像噪点）
    arcMine:      0xffc247,    // 我的航线大圆弧
    arcRival:     0x3f5d70,    // 竞对航线大圆弧（更暗，退到背景）
    arcOpen:      0xfff0c0,    // 开航瞬间的弧线辉光（比常色更亮，越过 bloom 阈值）
    planeMine:    0xfff2d0,    // 我的客机
    planeRival:   0x9fb8c8,    // 竞对客机
    level: [                   // 城市按开发度等级的配色（1→5 级，越亮越繁盛）
      0x6f8494, 0x8fb0c0, 0xb8d4dc, 0xe8d9a8, 0xffd27a
    ]
  };

  var api = { ok: false };
  var renderer, scene, camera, globe, gridGroup;
  var cityPoints, cityGeom, cityPos, cityColor, citySize, cityAlpha;
  var cityLevel, cityRinged;              // 每城当前等级 / 是否已通航（我的网络）
  var cityBaseSize;                       // 等级对应的基准尺寸（脉冲在此之上放大）
  var cityPulse, cityLastDev;             // 开发度上涨的辉光脉冲 + 上一帧 dev
  var ringPoints, ringGeom, ringPos, ringColor, ringSize, ringAlpha;
  var arcLines, arcGeom, arcPos, arcCol;  // 合批的航线线段
  var arcSlots = [];                      // { key, a, b, order, owner, pts[] } 占位表
  var arcSet = {};                        // routeKey → 槽位索引，避免每帧线性查重
  var planeMesh, planeDummy, planeList = [];   // InstancedMesh 客机
  var fxPool = [], ringPool = [];
  var clock;
  var shakeAmt = 0, bloomPulse = 0;
  var cam = { theta: 0.9, phi: 1.15, radius: 7.4, tTheta: 0.9, tPhi: 1.15, tRadius: 7.4 };
  var dragging = false, lastX = 0, lastY = 0, pinch = 0;
  var quality = 1;
  var _pv, _pn, _cd;                      // 拾取用的暂存向量（避免每帧 new）
  var _v3 = null;                         // 大圆插值暂存

  /* ───────────────────────── 工具 ───────────────────────── */

  // 程序化径向渐变贴图（与 defcon 同一套做法：全部 GPU 端，零像素读取）
  function radialTex(c0, c1, c2) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, c0); g.addColorStop(0.4, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /* 城市定位环：外圈柔光 + 内圈实线。
   * 只描一圈细线的话，缩到 20 来像素会被纹理过滤吃掉、断成虚线；
   * 先铺一道宽而淡的底、再压一道窄而实的线，任何尺寸下都是完整的一圈。 */
  function ringTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.24)';
    x.lineWidth = 13;
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = 4;
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    return new THREE.CanvasTexture(c);
  }

  /* 客机图标：不用几何体，画成**俯视飞机剪影**的贴图走 billboard。
   * 理由与 defcon 的单位图标一致：缩到十几像素时，立体几何的剪影认不出是什么，
   * 而位于球面边缘时几何体侧视会退化成一个点，形状信息全丢。
   * 画的是民航客机的俯视轮廓（后掠翼 + 尾翼），一眼能认出是飞机。 */
  function planeTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    /* 机头朝上（-Y）绘制：后续 billboard 旋转时以 up 为基准，方向可控 */
    // 机身
    x.beginPath();
    x.moveTo(32, 4);                      // 机头
    x.quadraticCurveTo(35, 10, 35, 20);
    x.lineTo(35, 44);
    x.quadraticCurveTo(35, 56, 32, 58);
    x.quadraticCurveTo(29, 56, 29, 44);
    x.lineTo(29, 20);
    x.quadraticCurveTo(29, 10, 32, 4);
    x.closePath(); x.fill();
    // 主翼（后掠）
    x.beginPath();
    x.moveTo(30, 24);
    x.lineTo(4, 42);
    x.lineTo(4, 46);
    x.lineTo(30, 36);
    x.closePath(); x.fill();
    x.beginPath();
    x.moveTo(34, 24);
    x.lineTo(60, 42);
    x.lineTo(60, 46);
    x.lineTo(34, 36);
    x.closePath(); x.fill();
    // 尾翼
    x.beginPath();
    x.moveTo(30, 48);
    x.lineTo(16, 58);
    x.lineTo(16, 60);
    x.lineTo(30, 56);
    x.closePath(); x.fill();
    x.beginPath();
    x.moveTo(34, 48);
    x.lineTo(48, 58);
    x.lineTo(48, 60);
    x.lineTo(34, 56);
    x.closePath(); x.fill();
    var t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  var TEX = {};
  function buildTextures() {
    TEX.dot = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
    TEX.ring = ringTex();
    TEX.plane = planeTex();
    TEX.flash = radialTex('rgba(255,248,224,1)', 'rgba(255,206,120,0.6)', 'rgba(255,150,60,0)');
  }

  function hexToRgb(hex) {
    var h = hex.toString(16);
    while (h.length < 6) h = '0' + h;
    return [parseInt(h.substr(0, 2), 16) / 255,
            parseInt(h.substr(2, 2), 16) / 255,
            parseInt(h.substr(4, 2), 16) / 255];
  }

  function v3(lat, lon, r) {
    var v = G.ll2v(lat, lon, r);
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  /* ───────────────────────── 场景搭建 ───────────────────────── */

  function buildGlobe() {
    var seg = quality ? 64 : 32;
    var mat = new THREE.MeshStandardMaterial({
      color: 0xa8c4d8, roughness: 0.96, metalness: 0.02
    });
    globe = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg / 2), mat);
    scene.add(globe);

    loadGlobeTexture(mat, 0);

    // 冷色壳：压暗 + 叠一层蓝，把真实贴图往「夜空中的星球」推
    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.0015, seg, seg / 2),
      new THREE.MeshBasicMaterial({
        color: 0x081826, transparent: true, opacity: 0.22,
        depthWrite: false, side: THREE.FrontSide
      })
    );
    scene.add(shell);

    // 矢量经纬网：保留球面朝向感（没有它，转动地球时判断不出转到哪了）
    gridGroup = new THREE.Group();
    var gR = R * 1.003;
    var gmat = new THREE.LineBasicMaterial({
      color: 0x5f8fa8, transparent: true, opacity: 0.13
    });
    var lats = [-60, -30, 0, 30, 60];
    lats.forEach(function (lat) {
      var pts = [], i;
      for (i = 0; i <= 96; i++) pts.push(v3(lat, i / 96 * 360 - 180, gR));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat));
    });
    for (var lon = -180; lon < 180; lon += 30) {
      var mp = [], j;
      for (j = 0; j <= 96; j++) mp.push(v3(j / 96 * 360 - 180, lon, gR));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(mp), gmat));
    }
    scene.add(gridGroup);
  }

  /* 贴图加载链：内联 data URI → assets/earth.jpg → 纯色球。
   *
   * 为什么内联优先：file:// 下 Chrome 把本地图片的 origin 视为 null，
   * 会以 CORS 拒绝它作为 WebGL 纹理（net::ERR_FAILED）—— 而「打 zip 双击 index.html」
   * 正是本工具的主战场（见 minitool-zip-builder 的兼容性要求），不能只在 http 下好看。
   * 内联 data URI 走 <script src> 而非 fetch，不受 CORS 约束。
   * 若 assets/earth-tex.js 存在则用它；不存在就退回 earth.jpg（http 场景可用）。 */
  var GLOBE_TEX_SRC = [
    (typeof global.AT_EARTH_TEX === 'string' && global.AT_EARTH_TEX) ? global.AT_EARTH_TEX : null,
    'assets/earth.jpg'
  ];

  function loadGlobeTexture(mat, attempt) {
    var src = GLOBE_TEX_SRC[attempt];
    function fallback() {
      if (attempt + 1 < GLOBE_TEX_SRC.length) { loadGlobeTexture(mat, attempt + 1); return; }
      mat.color.setHex(0x6b8ca0);      // 纯色兜底：不白屏、不中断
      mat.needsUpdate = true;
    }
    if (!src) { fallback(); return; }
    try {
      new THREE.TextureLoader().load(src, function (tex) {
        if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = quality ? 4 : 1;
        mat.map = tex;
        mat.color.setHex(0xc8dced);
        mat.needsUpdate = true;
        api.texOk = true;              // 供冒烟断言「贴图真加载了」，而不是静默走纯色兜底
      }, undefined, fallback);
    } catch (e) {
      fallback();
    }
  }

  /* 星空：800 个点分布在大球壳上（球面均匀采样，避免两极扎堆）。
   * 静止不动 —— 地球自转由相机拖动表现，星空跟着转会晕。 */
  function buildStars() {
    var n = 800, pos = new Float32Array(n * 3), sz = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var z = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, rxy = Math.sqrt(1 - z * z);
      var R0 = 260;
      pos[i * 3] = R0 * rxy * Math.cos(t);
      pos[i * 3 + 1] = R0 * z;
      pos[i * 3 + 2] = R0 * rxy * Math.sin(t);
      sz[i] = 1.0 + Math.random() * 2.0;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    var m = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: renderer.getPixelRatio() || 1 } },
      vertexShader: [
        'attribute float aSize;',
        'uniform float uPR;',
        'void main(){',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = aSize * uPR;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'void main(){',
        '  float d = length(gl_PointCoord - vec2(0.5));',
        '  if (d > 0.5) discard;',
        '  gl_FragColor = vec4(0.70, 0.80, 0.92, (1.0 - d * 2.0) * 0.85);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false
    });
    var stars = new THREE.Points(g, m);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  /* 大气辉光：1.06R 球壳配 Fresnel，只渲染背面（BackSide），
   * 于是只有星球轮廓外那圈亮起，形成蓝色大气。 */
  var atmoMat = null, atmoPhase = 0, atmoBreath = 0.006;
  var ATMO_PERIOD = 22;

  function buildAtmosphere() {
    atmoMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x5ab4e8) }, uInt: { value: 1.0 } },
      vertexShader: [
        'varying vec3 vN; varying vec3 vP;',
        'void main(){',
        '  vN = normalize(normalMatrix * normal);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vP = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uInt;',
        'varying vec3 vN; varying vec3 vP;',
        'void main(){',
        '  float f = 1.0 - abs(dot(vN, vP));',
        '  f = pow(f, 2.6);',
        '  gl_FragColor = vec4(uColor, f * 0.85 * uInt);',
        '}'
      ].join('\n'),
      transparent: true, blending: THREE.AdditiveBlending,
      side: THREE.BackSide, depthWrite: false
    });
    var m = new THREE.Mesh(new THREE.SphereGeometry(R * 1.055, 48, 24), atmoMat);
    scene.add(m);
  }

  function pumpAtmosphere(dt) {
    if (!atmoMat) return;
    atmoPhase += dt / ATMO_PERIOD * Math.PI * 2;
    atmoMat.uniforms.uInt.value = 1.0 + Math.sin(atmoPhase) * atmoBreath;
  }

  /* ───────────────────────── 城市光点 ─────────────────────────
   *
   * 与 defcon 的关键差异：这里的城市**不是阵营单位，是经济节点**。
   * 光点要表达三件事，且必须一眼可读：
   *   ① 繁盛程度 —— 等级 1..5 → 尺寸与颜色（灰白 → 暖金）
   *   ② 是否在我的网络里 —— 已通航的城多一圈暖金定位环
   *   ③ 是否我的基地 —— 基地尺寸额外加成 + 最亮色
   *
   * 为什么把「等级」和「通航」分成尺寸与环两个通道：
   * 若都用颜色表达，暖金既可能是「高等级」也可能是「已通航」，玩家分不清。
   * 尺寸管发展度（连续信息，看大小），环管归属（离散信息，看有无），互不干扰。 */

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

  var RING_MUL = 1.75;          // 定位环直径 / 光点直径

  function buildCities(state) {
    var n = state.cities.length;
    cityPos = new Float32Array(n * 3);
    cityColor = new Float32Array(n * 3);
    citySize = new Float32Array(n);
    cityAlpha = new Float32Array(n);
    cityLevel = new Float32Array(n);
    cityRinged = new Float32Array(n);
    cityBaseSize = new Float32Array(n);
    cityPulse = new Float32Array(n);
    cityLastDev = new Float32Array(n);
    ringPos = new Float32Array(n * 3);
    ringColor = new Float32Array(n * 3);
    ringSize = new Float32Array(n);
    ringAlpha = new Float32Array(n);

    state.cities.forEach(function (c, i) {
      var v = G.ll2v(c.lat, c.lon, R * CITY_LIFT);
      cityPos[i * 3] = v.x; cityPos[i * 3 + 1] = v.y; cityPos[i * 3 + 2] = v.z;
      // 环贴得比光点略高：两者都不写深度，同深度下绘制顺序无从保证
      var vr = G.ll2v(c.lat, c.lon, R * (CITY_LIFT + 0.003));
      ringPos[i * 3] = vr.x; ringPos[i * 3 + 1] = vr.y; ringPos[i * 3 + 2] = vr.z;

      var rgb = hexToRgb(PALETTE.virginHex);
      cityColor[i * 3] = rgb[0]; cityColor[i * 3 + 1] = rgb[1]; cityColor[i * 3 + 2] = rgb[2];
      // 环一律白色：让光点自己的颜色透出来作主分类信息（环已带色会过曝成实心团）
      ringColor[i * 3] = 1; ringColor[i * 3 + 1] = 1; ringColor[i * 3 + 2] = 1;

      /* aSize 是「期望像素直径 × 距离」的系数；uScale = 画布高/2（见 syncPointScale）。
       *
       * ⚠ 尺寸系数标定过程（2026-09-14 实机两轮）：
       *   首版 0.13 + pop×0.0075 → 390×844 屏上仅 4~6px，24 城糊在地图里看不见；
       *   二版 0.30 + pop×0.0055 → 上海 48px、内罗毕 36px，两座城的光环直接叠在一起
       *                            （截图确认，日本海一片糊）。
       *   现在 0.145 + pop×0.0028 → 上海约 23px、内罗毕约 14px，
       *   叠加 bloom（视觉直径约为光核的 1.8 倍）后大城约 40px、小城约 25px ——
       *   东亚这种城市密集区仍能分辨出是几座城。
       *
       * 换算依据：屏幕像素直径 = aSize × (画布缓冲高/2) ÷ 观察距离，
       *   观察距离 ≈ cam.radius 7.4 − 球半径 1.6 = 5.8（朝前）~ 7.4（侧面）。
       *   改 cam.radius 的默认值或 uScale 的系数都必须重算这一项。 */
      var base = 0.145 + c.pop0 * 0.0028;
      cityBaseSize[i] = base;
      citySize[i] = base;
      cityAlpha[i] = 1;
      ringSize[i] = base * RING_MUL;
      ringAlpha[i] = 0;
      cityLevel[i] = c.level;
      cityLastDev[i] = c.dev;
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

    ringGeom = new THREE.BufferGeometry();
    ringGeom.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    ringGeom.setAttribute('aColor', new THREE.BufferAttribute(ringColor, 3));
    ringGeom.setAttribute('aSize', new THREE.BufferAttribute(ringSize, 1));
    ringGeom.setAttribute('aAlpha', new THREE.BufferAttribute(ringAlpha, 1));
    var rmat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: TEX.ring }, uScale: { value: 400 } },
      vertexShader: CITY_VS, fragmentShader: CITY_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    ringPoints = new THREE.Points(ringGeom, rmat);
    scene.add(ringPoints);
  }

  // 点大小随画布高度缩放，保证不同分辨率下城市光点视觉尺寸一致
  function syncPointScale() {
    var h = (renderer ? renderer.domElement.height : global.innerHeight) || 800;
    if (cityPoints) cityPoints.material.uniforms.uScale.value = h * 0.5;
    if (ringPoints) ringPoints.material.uniforms.uScale.value = h * 0.5;
  }

  /* 判断某城是否在玩家网络里（有航线 = 已被开拓）。
   * sim 每回合会刷新 c.routes，但航线可能在本帧刚开通 —— 为稳妥直接查 state.routes。
   * 24 城 × 90 航线 = 2160 次比较/帧，可忽略；换来的是「开航瞬间环就出现」。 */
  function cityConnected(state, cityId) {
    for (var i = 0; i < state.routes.length; i++) {
      var r = state.routes[i];
      if (r.a === cityId || r.b === cityId) return true;
    }
    return false;
  }

  var CITY_PULSE_SEC = 0.6;

  function syncCities(state, dt) {
    if (!cityGeom) return;
    var dirty = false, sizeDirty = false, colorDirty = false;
    var rDirty = false, rSizeDirty = false;
    var decay = (dt > 0) ? dt / CITY_PULSE_SEC : 0;

    for (var i = 0; i < state.cities.length; i++) {
      var c = state.cities[i];

      /* 开发度上涨 → 辉光脉冲。
       * 触发条件直接看「本帧 dev 比上一帧高」，不必让 sim 多投递一个事件：
       * dev 上涨只有 resolveQuarter 一处来源，语义上就是「这座城市因你而发展了」，
       * 正是本作主题「交通促进地区发展」的视觉落点。 */
      if (c.dev > cityLastDev[i] + 1e-4) cityPulse[i] = 1;
      cityLastDev[i] = c.dev;
      if (cityPulse[i] > 0) {
        cityPulse[i] -= decay;
        if (cityPulse[i] < 0) cityPulse[i] = 0;
        colorDirty = sizeDirty = true;
      }
      var p = cityPulse[i];

      var lv = Math.max(1, Math.min(5, c.level | 0));
      var lvChanged = (cityLevel[i] !== lv);
      cityLevel[i] = lv;

      var connected = cityConnected(state, c.id);
      var ringed = connected ? 1 : 0;
      if (cityRinged[i] !== ringed) { cityRinged[i] = ringed; rDirty = true; }

      // 尺寸：等级 1..5 → 0.72 / 0.88 / 1.0 / 1.16 / 1.34 倍基准；基地额外 1.25 倍
      var lvMul = [0, 0.72, 0.88, 1.0, 1.16, 1.34][lv];
      var s = cityBaseSize[i] * lvMul * (c.isHome ? 1.25 : 1);
      if (p > 0) s *= (1 + 0.45 * p);
      if (Math.abs(citySize[i] - s) > 1e-6) { citySize[i] = s; sizeDirty = true; }

      // 颜色：基地 > 我的网络 > 未通航；已通航的城用等级色（发展可视），
      // 未通航用中性灰白（待开拓的地图上不该有暖色诱惑）
      var col;
      if (c.isHome) col = PALETTE.homeHex;
      else if (connected) col = PALETTE.mineHex;
      else col = PALETTE.virginHex;

      var cr = hexToRgb(col);
      /* 等级对「我的城市」施加亮度增益：1 级 ×0.78、5 级 ×1.22。
       * 未通航城市不受等级影响 —— 它们本来就该是均匀的背景色，
       * 否则地图上会出现一堆高亮的「我还没去过的城」，误导玩家以为已经有网络覆盖。 */
      var g = 1;
      if (c.isHome) g = 1.0 + (lv - 3) * 0.05;
      else if (connected) g = 0.78 + lv * 0.088;
      if (p > 0) g *= (1 + 1.6 * p);

      if (lvChanged || colorDirty || Math.abs(cityColor[i * 3] - cr[0] * g) > 1e-6) {
        cityColor[i * 3] = cr[0] * g;
        cityColor[i * 3 + 1] = cr[1] * g;
        cityColor[i * 3 + 2] = cr[2] * g;
        colorDirty = true;
      }

      // 环：只有我的网络里的城才有环，且亮度随等级上升（大城更醒目）
      var ra = connected ? (c.isHome ? 1.0 : (0.45 + lv * 0.10)) : 0;
      if (p > 0) ra = Math.min(1.4, ra * (1 + 1.5 * p));
      if (Math.abs(ringAlpha[i] - ra) > 1e-6) { ringAlpha[i] = ra; rDirty = true; }
      var rs = s * RING_MUL;
      if (Math.abs(ringSize[i] - rs) > 1e-6) { ringSize[i] = rs; rSizeDirty = true; }
    }

    if (colorDirty) cityGeom.getAttribute('aColor').needsUpdate = true;
    if (sizeDirty) cityGeom.getAttribute('aSize').needsUpdate = true;
    if (rDirty) ringGeom.getAttribute('aAlpha').needsUpdate = true;
    if (rSizeDirty) ringGeom.getAttribute('aSize').needsUpdate = true;
  }

  /* ───────────────────────── 航线大圆弧 ─────────────────────────
   *
   * ⚠ 真实航路不是地图上的直线，是**大圆航线**（球面上两点间最短路径）。
   * 上海—洛杉矶在墨卡托投影上是一条横跨太平洋的弧线，飞的是北极圈附近，
   * 这正是「为什么中美航线要飞阿拉斯加」的地理答案 —— 用平面直线会把这个
   * 反直觉的真实知识丢掉，也让球面地图失去意义。
   *
   * 实现：全部航线合批到一个 LineSegments，每帧只改 position 缓冲。
   * 为什么不用 Line 逐条画：90 条线 = 90 次 draw call，移动端 GPU 直接跪。
   * 这里把每条弧拆成 ARC_SEG 段、每段两个端点展开进同一个 Float32Array，
   * 一次 draw call 画完所有航线。代价是「整条航线只能一个颜色」——
   * 对本作够用（我的线一种色、竞对一种色）。 */

  var ARC_VERTS = MAX_ARCS * ARC_SEG * 2;   // 每个槽位 ARC_SEG 段的 2 个端点

  function buildArcs() {
    arcPos = new Float32Array(ARC_VERTS * 3);
    arcCol = new Float32Array(ARC_VERTS * 3);
    arcGeom = new THREE.BufferGeometry();
    arcGeom.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
    arcGeom.setAttribute('color', new THREE.BufferAttribute(arcCol, 3));
    // 初始化全部顶点到不可见位置（球心），避免开局一帧从原点射出无数条线
    for (var i = 0; i < ARC_VERTS; i++) { arcPos[i * 3] = 0; arcPos[i * 3 + 1] = 0; arcPos[i * 3 + 2] = 0; }
    arcGeom.setDrawRange(0, 0);
    var mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    arcLines = new THREE.LineSegments(arcGeom, mat);
    arcLines.frustumCulled = false;
    arcLines.renderOrder = 1;
    scene.add(arcLines);
  }

  /* 把一条大圆弧写进顶点缓冲。
   *
   * ⚠ 弧线抬升：纯球面大圆会**贴地穿过山脉与海洋**，在球面边缘看起来像嵌进地球里。
   * 真实航班飞在平流层，视觉上应浮在地表之上一点。做法是把插值点沿径向外推，
   * 且抬升量随「进度」呈正弦分布 —— 两端贴地（与城市光点汇合）、中点最高。
   * 这样航线看起来是「从这座城市起飞、弧线越过地球、落回那座城市」，
   * 而不是一根悬空的管子。
   *
   * ⚠ 插值一律走 G.gcPoint(a, b, t, r) —— 它内部做的正是 slerpLL + ll2v，
   * 即「大圆表面点」。不要手写 slerpLL：它的签名是 (a, b, t) 三个参数、
   * a/b 是**城市对象**，传成扁平经纬度会静默返回 NaN。 */
  function writeArc(slot, a, b, rgb, lift) {
    var base = slot * ARC_SEG * 2;
    var i, u, r, p, g;
    for (i = 0; i < ARC_SEG; i++) {
      // 段 i 的两个端点：t = i/SEG 与 t = (i+1)/SEG
      for (var e = 0; e < 2; e++) {
        u = (i + e) / ARC_SEG;
        r = R * (ARC_LIFT + Math.sin(u * Math.PI) * lift);
        p = G.gcPoint(a, b, u, r);
        var vi = (base + i * 2 + e) * 3;
        arcPos[vi] = p.x; arcPos[vi + 1] = p.y; arcPos[vi + 2] = p.z;
        /* 颜色也做渐变：靠近端点更亮（与城市光点衔接），中段略暗（避免弧线抢戏）。
         * 用与高度同相的 sin 包络，让「最高处最亮」—— 视觉上弧顶自然成为焦点。 */
        g = 0.72 + 0.5 * Math.sin(u * Math.PI);
        arcCol[vi] = rgb[0] * g;
        arcCol[vi + 1] = rgb[1] * g;
        arcCol[vi + 2] = rgb[2] * g;
      }
    }
  }

  /* 清空一条弧的顶点（写进球心 + 零色。球心在所有不透明物体内部，
   * 顶点会被深度测试干掉；比改 drawRange 简单，且不必重排槽位）。 */
  function clearArc(slot) {
    var base = slot * ARC_SEG * 2;
    for (var i = 0; i < ARC_SEG * 2; i++) {
      arcPos[(base + i) * 3] = 0; arcPos[(base + i) * 3 + 1] = 0; arcPos[(base + i) * 3 + 2] = 0;
      arcCol[(base + i) * 3] = 0; arcCol[(base + i) * 3 + 1] = 0; arcCol[(base + i) * 3 + 2] = 0;
    }
  }

  /* 同步航线：把 state.routes（我的）与各竞对的 routes 映射到槽位表。
   *
   * 槽位分配策略：**我的航线优先占位**，竞对填充剩余。
   * 理由：玩家的网络是主角，竞对是背景；若按出现顺序分配，玩家的新航线可能
   * 在竞对之后才申请到槽位，导致「我刚开的线不显示」——
   * 这在超过 MAX_ARCS 时必然发生，故必须显式优先。
   *
   * 槽位复用：用 routeKey 索引 arcSet，同一航线每帧复用同一槽位，
   * 避免每帧重算 48 段 slerp（那是 90×48 = 4320 次三角运算，60fps 下纯浪费）。 */
  function syncArcs(state, dt) {
    if (!arcGeom) return;
    var wanted = [];
    var i, r;

    // ① 我的航线（含刚开通的 fx 高亮）
    for (i = 0; i < state.routes.length; i++) {
      r = state.routes[i];
      wanted.push({ key: r.key, a: r.a, b: r.b, owner: 'mine', glow: !!arcGlow[r.key] });
    }
    // ② 竞对航线（只画前若干条，避免把屏幕塞满）
    var rivalShown = 0;
    for (i = 0; i < state.rivals.length; i++) {
      var rv = state.rivals[i];
      if (!rv.alive) continue;
      for (var j = 0; j < rv.routes.length; j++) {
        var rr = rv.routes[j];
        var key = rr.key || AT.routeKey(rr.a, rr.b);
        if (arcSet[key] !== undefined) continue;      // 与我的航线重合：我的优先，跳过
        if (rivalShown >= 40) break;
        wanted.push({ key: key, a: rr.a, b: rr.b, owner: 'rival', glow: false });
        rivalShown++;
      }
    }

    /* 重算所有 wanted 的弧线。
     * ⚠ 这里每帧全量重写是刻意的取舍：弧线一旦开通就**位置不变**
     * （城市坐标固定），理论上只需写一次；但「哪些航线存在」每回合都在变，
     * 维护「新增/删除」增量集比全量重写更容易出错（漏删会留下幽灵线）。
     * 实测 90 条 × 48 段 = 4320 次 slerp 在桌面端约 0.3ms，
     * 相比正确性风险，这个代价可以接受。 */
    var n = Math.min(wanted.length, MAX_ARCS);
    /* ⚠ 只改 .count 而不调 setDrawRange：r149 里 setDrawRange(start, count) 是
     *   唯一入口，但读回来要看 .drawRange.count（没有 getDrawRange 方法）。
     *   这里直接比 .count，避免每次同步都重建 drawRange 对象。 */
    if (arcGeom.drawRange.count !== n * ARC_SEG * 2) {
      arcGeom.setDrawRange(0, n * ARC_SEG * 2);
    }
    // 先记录本轮出现的 key，用于清掉已消失的槽位
    var seen = {};
    for (i = 0; i < n; i++) {
      var w = wanted[i];
      seen[w.key] = 1;
      var c = AT.CITIES_BY_ID[w.a], c2 = AT.CITIES_BY_ID[w.b];
      if (!c || !c2) { clearArc(i); arcSlots[i] = null; continue; }
      var col = w.owner === 'mine'
        ? (w.glow ? PALETTE.arcOpen : PALETTE.arcMine)
        : PALETTE.arcRival;
      // 我的航线抬得更高（视觉上前景），竞对贴地（退后景）
      var lift = w.owner === 'mine' ? 0.035 : 0.018;
      writeArc(i, c, c2, hexToRgb(col), lift);
      arcSlots[i] = { key: w.key, a: w.a, b: w.b };
      arcSet[w.key] = i;
    }
    // 清空多余槽位
    for (i = n; i < MAX_ARCS; i++) {
      if (arcSlots[i]) { clearArc(i); arcSet[arcSlots[i].key] = undefined; arcSlots[i] = null; }
    }
    // 清空本轮消失的键在 arcSet 里的残留
    for (var k in arcSet) {
      if (!seen[k]) delete arcSet[k];
    }
    arcGeom.getAttribute('position').needsUpdate = true;
    arcGeom.getAttribute('color').needsUpdate = true;
  }

  /* 开航瞬间的弧线辉光（fx routeOpen 触发，1.2s 淡出） */
  var arcGlow = {};

  /* ───────────────────────── 客机（沿弧线飞行）─────────────────────────
   *
   * 客机不是实体对象，是**沿大圆弧往复运动的亮点**。
   * 为什么用位置插值而不是给每架飞机存经纬度：
   *   sim 里飞机只有「属于哪条航线」这个信息，没有经纬度 —— 那是刻意的不真实，
   *   因为「这架飞机现在飞到哪了」对经营决策毫无意义。
   *   于是渲染层按「航线 + 相位」反推位置：相位由一个全局时钟驱动，
   *   同一航线上的多架飞机均分相位（n 架 = 0, 1/n, 2/n ... 各占一个位置）。
   *
   * 这样做的效果：一条线上加飞机，画面上真的会**多出一架在飞**，
   * 且多架自动均匀分布在航路上（不会叠在一起）—— 运力决策立刻有视觉反馈。
   *
   * ⚠ 航班频次也影响视觉：高频航线（perDay 大）的飞机飞得更快。
   *   这忠实于「同一架飞机一天飞 6 班 = 往返更快」的设定。 */
  var PLANE_PERIOD = 14;        // 基准往返周期（秒）—— 每日 3 班的线，一个来回约 14 秒
  var planeClock = 0;

  /* 朝向退化阈值：|屏幕投影| / |切向| = |sin θ| 低于此值即认为「机头几乎正对/背对相机」，
   * 屏幕上看不出朝向，此时沿用上一帧角度而不是让 atan2 吃噪声。
   * 取 0.05 ≈ θ < 2.9°。实测退化帧只占 4% 左右，且分布是「要么 ~10px、要么 ~0px」
   * 的清晰双峰（见 tests/verify-heading.py 的机头长度分布输出），故阈值不敏感。 */
  var DEGEN_SIN = 0.05;

  function buildPlanes() {
    var geo = new THREE.PlaneGeometry(0.055, 0.055);
    var mat = new THREE.MeshBasicMaterial({
      map: TEX.plane, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    planeMesh = new THREE.InstancedMesh(geo, mat, MAX_PLANES);
    planeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    planeMesh.frustumCulled = false;
    planeMesh.renderOrder = 2;
    planeHidden.length = 0;
    lastAng.length = 0;
    // instanceColor 需要显式初始化，否则首帧读到未定义颜色（three r149 行为）
    var white = new THREE.Color(1, 1, 1);
    for (var i = 0; i < MAX_PLANES; i++) {
      planeMesh.setColorAt(i, white);
      planeDummy.position.set(0, 0, 0);
      planeDummy.scale.set(0, 0, 0);
      planeDummy.updateMatrix();
      planeMesh.setMatrixAt(i, planeDummy.matrix);
      planeHidden[i] = true;          // 开局全部隐藏，等 syncPlanes 填真实飞机
    }
    planeMesh.instanceMatrix.needsUpdate = true;
    scene.add(planeMesh);
  }

  /* 收集「所有在飞的飞机」：玩家机队 + 竞对机队。
   * 每架产出一条 {key, phase, speed, color} 记录。 */
  function collectPlanes(state) {
    planeList.length = 0;
    var i, j, r, key;

    // ① 玩家：按航线聚合。planesOnRoute 给出该线上的飞机数，均分相位。
    for (i = 0; i < state.routes.length; i++) {
      r = state.routes[i];
      var cnt = 0;
      for (j = 0; j < state.planes.length; j++) {
        if (state.planes[j].routeKey === r.key) cnt++;
      }
      if (!cnt) continue;
      // 频次 → 速度：每日 3 班为基准，越密越快（上限 2.4 倍，避免飞出视觉残影）
      var spd = Math.min(2.4, 0.6 + (r.perDay || 3) / 6);
      for (j = 0; j < cnt; j++) {
        planeList.push({
          key: r.key, a: r.a, b: r.b,
          phase: j / cnt, speed: spd,
          color: PALETTE.planeMine
        });
      }
    }
    // ② 竞对：只显示有航线的那部分（每线最多 1 架示意，避免喧宾夺主）
    for (i = 0; i < state.rivals.length; i++) {
      var rv = state.rivals[i];
      if (!rv.alive) continue;
      for (j = 0; j < rv.routes.length && j < 12; j++) {
        var rr = rv.routes[j];
        key = rr.key || AT.routeKey(rr.a, rr.b);
        // 我的航线已经画了飞机，竞对同线不重复显示
        var mine = false;
        for (var m = 0; m < state.routes.length; m++) {
          if (state.routes[m].key === key) { mine = true; break; }
        }
        if (mine) continue;
        planeList.push({
          key: key, a: rr.a, b: rr.b,
          phase: (i * 0.23 + j * 0.11) % 1, speed: 0.8,
          color: PALETTE.planeRival
        });
      }
    }
  }

  var _q = null, _dir = null, _up = null, _m4 = null;

  /* 上一帧的朝向角（按实例索引）。仅用于「切向投影退化为零向量」时的兜底：
   * 沿用上一帧角度，避免姿态瞬间跳到任意方向。
   * 正常情况下不会走到（采样点不外推即无退化），故它不参与任何正常路径。 */
  var lastAng = [];

  function syncPlanes(state, dt) {
    if (!planeMesh) return;
    planeClock += dt;
    collectPlanes(state);

    var n = Math.min(planeList.length, MAX_PLANES);
    var col = null;
    for (var i = 0; i < n; i++) {
      var p = planeList[i];
      var ca = AT.CITIES_BY_ID[p.a], cb = AT.CITIES_BY_ID[p.b];
      if (!ca || !cb) { hidePlane(i); continue; }

      /* 位置：t 在 [0,1] 之间往复（0→1→0），取三角波。
       * 用三角波而非 sin：sin 会让飞机在两端「慢下来再加速」，
       * 而三角波是匀速的 —— 客机巡航应该匀速，慢下来反而像悬停。 */
      var leg = G.legAt(planeClock * p.speed / PLANE_PERIOD + p.phase);
      var t = leg.t;

      // 抬升与弧线一致（同一 sin 包络），保证飞机正好骑在弧线上方一点
      var r = R * (PLANE_LIFT + Math.sin(t * Math.PI) * 0.035);
      var v = G.gcPoint(ca, cb, t, r);

      /* 朝向：机头对准飞行方向。
       * 用「当前位置」与「稍前方一点」算切向 —— 比解析求导简单且对 slerp 无假设。
       * 前方取 ±0.015（约 1/66 弧长），足够小到不引入可见滞后。
       *
       * ⚠ 两个易错点，都实测踩过（详见 tools/probe-heading.js）：
       *   ① 方向必须取 leg.fwd（由**周期相位**推出），不能用「位置 t 落在哪一半」。
       *      t 一个周期被经过两次（去程一次、回程一次），拿 t 判方向会让每个航段
       *      有一半时间倒着飞 —— 原实现正是如此，量到 49.9% 相位倒飞。
       *   ② 采样点**不要夹取到 [0,1]**。夹取会让弧两端 t≈1（或 0）处的「前方一点」
       *      与当前点重合，切向退化成零向量 → atan2(0,0) 姿态乱跳。
       *      不夹取时 slerp 沿大圆自然外推，切向始终良定义（gcPoint 已支持 t 越界）。 */
      var fwd = leg.fwd;
      var tf = t + 0.015 * fwd;
      var vf = G.gcPoint(ca, cb, tf, r);

      /* 屏幕空间旋转：把 3D 切向投影到相机的屏幕基上，求角度。
       * ① 切向量去掉法向分量（只保留切平面内的方向）
       * ② 投到相机的「右向 / 上向」上得到屏幕空间的 (sx, sy)
       * ③ atan2 得角度；因机头在局部 +Y，故减 90°（见下方贴图方向说明） */
      var dirX = vf.x - v.x, dirY = vf.y - v.y, dirZ = vf.z - v.z;
      var nx = v.x / r, ny = v.y / r, nz = v.z / r;      // 该点法线
      var dn = dirX * nx + dirY * ny + dirZ * nz;
      dirX -= dn * nx; dirY -= dn * ny; dirZ -= dn * nz; // 切向在切平面上的分量
      camera.updateMatrixWorld();
      var rt = _right.setFromMatrixColumn(camera.matrixWorld, 0);   // 相机右向（世界空间）
      var up = _up.setFromMatrixColumn(camera.matrixWorld, 1);      // 相机上向（世界空间）
      var sx = dirX * rt.x + dirY * rt.y + dirZ * rt.z;
      var sy = dirX * up.x + dirY * up.y + dirZ * up.z;
      var ang;
      /* 退化保护：切向几乎平行于视轴时（飞机正朝相机飞来 / 背向飞走），
       * 它在屏幕平面内的分量趋近零向量，atan2 的输入是数值噪声 → 姿态随机跳。
       *
       * 判据用**比值**而非绝对值：sx/sy 的量级取决于航线弧长（长线切向更长），
       * 绝对阈值会在长短航线上表现不一致。而
       *   |(sx,sy)| / |dir| = |sin θ|（θ = 切向与视轴夹角）
       * 是无量纲的，θ 小于约 3° 时屏幕上「指向哪边」本身就没有意义了。
       * 此时沿用上一帧角度 —— 保持姿态稳定，比随机跳要好得多。 */
      var smag = Math.sqrt(sx * sx + sy * sy);
      var dmag = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
      if (dmag < 1e-9 || smag < DEGEN_SIN * dmag) {
        ang = (lastAng[i] != null) ? lastAng[i] : 0;
      } else {
        ang = Math.atan2(sy, sx) - Math.PI / 2;
      }
      lastAng[i] = ang;

      /* billboard + 绕视轴旋转：先让平面正对相机（copy 相机四元数），
       * 再绕自身法线（局部 +Z）转 ang，使机头对准屏幕空间里的飞行方向。
       *
       * ⚠ 贴图方向（已用 PlaneGeometry 的 UV 关系 + CanvasTexture 默认 flipY=true 实证）：
       *   画布把机头画在 y=4（顶部）→ 因 flipY 映射到 uv.v=1 → PlaneGeometry 的
       *   uv.v=1 顶点在局部 **+Y**。故机头 = 局部 +Y，上面减 90° 是正确的。
       *   （源码注释曾误写「-Y」，几何关系以 uv 实证为准，勿改这个 ±90°。） */
      planeDummy.position.set(v.x, v.y, v.z);
      planeDummy.quaternion.copy(camera.quaternion);
      _q.setFromAxisAngle(_axis.set(0, 0, 1), ang);
      planeDummy.quaternion.multiply(_q);
      planeDummy.scale.set(1, 1, 1);
      planeDummy.updateMatrix();
      planeMesh.setMatrixAt(i, planeDummy.matrix);

      col = _color.setHex(p.color);
      col.multiplyScalar(0.85 + 0.5 * Math.sin(t * Math.PI));   // 中段更亮（贴近弧线最高点）
      planeMesh.setColorAt(i, col);
      planeHidden[i] = false;                                    // 标记为「在用」
    }
    // 多余的实例缩到 0（隐藏）。hidePlane 内部有幂等判断，不重复写矩阵。
    for (var k = n; k < MAX_PLANES; k++) hidePlane(k);
    planeMesh.instanceMatrix.needsUpdate = true;
    if (planeMesh.instanceColor) planeMesh.instanceColor.needsUpdate = true;
  }

  var planeHidden = [];
  function hidePlane(i) {
    if (planeHidden[i] === true) return;
    planeDummy.position.set(0, 0, 0);
    planeDummy.scale.set(0, 0, 0);
    planeDummy.quaternion.identity();
    planeDummy.updateMatrix();
    planeMesh.setMatrixAt(i, planeDummy.matrix);
    planeHidden[i] = true;
  }

  /* ───────────────────────── 特效 ─────────────────────────
   * sim 通过 state.fx 投递事件，各类型含义：
   *   routeOpen  —— 开航：弧线辉光 + 城市环扩散
   *   upgrade    —— 城市升级：该城一次明亮的扩散环（「交通促进发展」的演出高潮）
   * 渲染层每帧 shift 清空队列（与 defcon 同一协议）。 */

  function buildFxPool() {
    fxPool.length = 0;
    ringPool.length = 0;
    for (var i = 0; i < FX_POOL; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.flash, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      sp.visible = false;
      scene.add(sp);
      fxPool.push({ sp: sp, t: -1, dur: 1.4, lat: 0, lon: 0 });
    }
    for (var j = 0; j < RING_POOL; j++) {
      var m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.ring, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      m.visible = false;
      scene.add(m);
      ringPool.push({ sp: m, t: -1, dur: 1.5, lat: 0, lon: 0, scale0: 0.2, scale1: 0.5 });
    }
  }

  function spawnFx(lat, lon, dur, kind) {
    var pool = kind === 'ring' ? ringPool : fxPool;
    var slot = null;
    for (var i = 0; i < pool.length; i++) if (pool[i].t < 0) { slot = pool[i]; break; }
    if (!slot) slot = pool[0];            // 池满则抢占最旧槽位
    slot.t = 0; slot.dur = dur; slot.lat = lat; slot.lon = lon;
    return slot;
  }

  function pumpFx(state, dt) {
    // 消费 sim 投递的事件
    while (state.fx.length) {
      var e = state.fx.shift();
      var d = e.data || {};
      if (e.type === 'routeOpen') {
        var ca = AT.CITIES_BY_ID[d.a], cb = AT.CITIES_BY_ID[d.b];
        var key = AT.routeKey(d.a, d.b);
        // 弧线辉光：1.2s 后自动淡出（syncArcs 读 arcGlow 取色）
        arcGlow[key] = 1.2;
        // 两端各放一圈扩散环：环从小扩到大、边扩边淡，形成「从这里牵出一条线」的涟漪
        var s1 = ca ? spawnFx(ca.lat, ca.lon, 1.4, 'ring') : null;
        if (s1) { s1.scale0 = 0.30; s1.scale1 = 0.75; }
        var s2 = cb ? spawnFx(cb.lat, cb.lon, 1.4, 'ring') : null;
        if (s2) { s2.scale0 = 0.30; s2.scale1 = 0.75; }
      } else if (e.type === 'upgrade') {
        var cu = AT.CITIES_BY_ID[d.cityId];
        if (cu) {
          var s3 = spawnFx(cu.lat, cu.lon, 1.6, 'ring');
          if (s3) { s3.scale0 = 0.35; s3.scale1 = 1.15; }
          var s4 = spawnFx(cu.lat, cu.lon, 1.0, 'flash');
          if (s4) { s4.scale = 0.5; }
        }
      }
    }
    // 更新弧线辉光的剩余时间
    for (var k in arcGlow) {
      arcGlow[k] -= dt * 1.0;
      if (arcGlow[k] <= 0) delete arcGlow[k];
    }

    // 推进闪光
    for (var i = 0; i < fxPool.length; i++) {
      var f = fxPool[i];
      if (f.t < 0) continue;
      f.t += dt;
      var u = f.t / f.dur;
      if (u >= 1) { f.t = -1; f.sp.visible = false; continue; }
      var v = G.ll2v(f.lat, f.lon, R * (CITY_LIFT + 0.01));
      f.sp.position.set(v.x, v.y, v.z);
      f.sp.scale.setScalar(0.10 + u * 0.32);
      f.sp.material.opacity = (1 - u) * 0.85;
      f.sp.visible = true;
    }
    // 推进扩散环
    for (var j = 0; j < ringPool.length; j++) {
      var rr = ringPool[j];
      if (rr.t < 0) continue;
      rr.t += dt;
      var u2 = rr.t / rr.dur;
      if (u2 >= 1) { rr.t = -1; rr.sp.visible = false; continue; }
      var v2 = G.ll2v(rr.lat, rr.lon, R * (CITY_LIFT + 0.012));
      rr.sp.position.set(v2.x, v2.y, v2.z);
      var sc = rr.scale0 + (rr.scale1 - rr.scale0) * (1 - Math.pow(1 - u2, 2.2));
      rr.sp.scale.setScalar(sc);
      // 先亮后灭：环扩散时逐渐透明，形成「涟漪」感
      rr.sp.material.opacity = (1 - u2) * (1 - u2) * 0.9;
      rr.sp.visible = true;
    }
  }

  /* ───────────────────────── 后处理 bloom ─────────────────────────
   * 与 defcon 同一套（手写，不依赖 three 的 EffectComposer —— r149 的 examples
   * 不在 three.min.js 里，引进来要额外打包）。三段式：亮部提取 → 两轮可分离高斯 → 叠加。
   * 阈值取 0.72：地球陆地亮度约 0.5~0.6，低了整个星球泛光画面糊掉；
   * 城市光核 / 航线辉光 / 开航闪光都在 0.9 以上。 */

  var POST_VS = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  var POST_BRIGHT_FS = [
    'uniform sampler2D tDiffuse;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  float k = smoothstep(0.72, 1.0, l);',
    '  gl_FragColor = vec4(c * k, 1.0);',
    '}'
  ].join('\n');

  var POST_BLUR_FS = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uDir;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270;',
    '  s += (texture2D(tDiffuse, vUv + uDir * 1.3846154).rgb + texture2D(tDiffuse, vUv - uDir * 1.3846154).rgb) * 0.3162162;',
    '  s += (texture2D(tDiffuse, vUv + uDir * 3.2307692).rgb + texture2D(tDiffuse, vUv - uDir * 3.2307692).rgb) * 0.0702703;',
    '  gl_FragColor = vec4(s, 1.0);',
    '}'
  ].join('\n');

  var POST_COMP_FS = [
    'uniform sampler2D tScene;',
    'uniform sampler2D tBloom;',
    'uniform float uStrength;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tScene, vUv).rgb;',
    '  vec3 b = texture2D(tBloom, vUv).rgb;',
    '  gl_FragColor = vec4(c + b * uStrength, 1.0);',
    '}'
  ].join('\n');

  var bloom = { built: false, ok: false, failed: false,
                rtScene: null, rtA: null, rtB: null,
                quad: null, scene: null, cam: null,
                mBright: null, mBlur: null, mComp: null };

  function makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
    });
  }

  function disposeBloomTargets() {
    ['rtScene', 'rtA', 'rtB'].forEach(function (k) {
      if (bloom[k]) { bloom[k].dispose(); bloom[k] = null; }
    });
  }

  function buildBloom() {
    var cv = renderer.domElement;
    var w = Math.max(2, cv.width), h = Math.max(2, cv.height);
    var q = 4;
    disposeBloomTargets();
    bloom.rtScene = makeRT(w, h);
    bloom.rtA = makeRT(Math.max(2, w / q | 0), Math.max(2, h / q | 0));
    bloom.rtB = makeRT(Math.max(2, w / q | 0), Math.max(2, h / q | 0));
    if (!bloom.scene) {
      bloom.scene = new THREE.Scene();
      bloom.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      bloom.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
      bloom.quad.frustumCulled = false;
      bloom.scene.add(bloom.quad);
      bloom.mBright = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: POST_VS, fragmentShader: POST_BRIGHT_FS, depthTest: false, depthWrite: false
      });
      bloom.mBlur = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
        vertexShader: POST_VS, fragmentShader: POST_BLUR_FS, depthTest: false, depthWrite: false
      });
      bloom.mComp = new THREE.ShaderMaterial({
        uniforms: { tScene: { value: null }, tBloom: { value: null }, uStrength: { value: 1.1 } },
        vertexShader: POST_VS, fragmentShader: POST_COMP_FS, depthTest: false, depthWrite: false
      });
    }
    bloom.built = true;
    bloom.ok = true;
  }

  function bloomPass() {
    renderer.setRenderTarget(bloom.rtScene);
    renderer.render(scene, camera);
    bloom.quad.material = bloom.mBright;
    bloom.mBright.uniforms.tDiffuse.value = bloom.rtScene.texture;
    renderer.setRenderTarget(bloom.rtA);
    renderer.render(bloom.scene, bloom.cam);
    var tw = bloom.rtA.width, th = bloom.rtA.height;
    for (var i = 0; i < 2; i++) {
      bloom.quad.material = bloom.mBlur;
      bloom.mBlur.uniforms.tDiffuse.value = bloom.rtA.texture;
      bloom.mBlur.uniforms.uDir.value.set(1.15 / tw, 0);
      renderer.setRenderTarget(bloom.rtB);
      renderer.render(bloom.scene, bloom.cam);
      bloom.mBlur.uniforms.tDiffuse.value = bloom.rtB.texture;
      bloom.mBlur.uniforms.uDir.value.set(0, 1.15 / th);
      renderer.setRenderTarget(bloom.rtA);
      renderer.render(bloom.scene, bloom.cam);
    }
    bloom.quad.material = bloom.mComp;
    bloom.mComp.uniforms.tScene.value = bloom.rtScene.texture;
    bloom.mComp.uniforms.tBloom.value = bloom.rtA.texture;
    bloom.mComp.uniforms.uStrength.value = 1.1 + bloomPulse * 1.1;
    renderer.setRenderTarget(null);
    renderer.render(bloom.scene, bloom.cam);
  }

  /* ───────────────────────── 相机（手写，无 OrbitControls）───────────────────────── */

  function applyCam() {
    var sp = Math.sin(cam.phi);
    camera.position.set(
      cam.radius * sp * Math.sin(cam.theta),
      cam.radius * Math.cos(cam.phi),
      cam.radius * sp * Math.cos(cam.theta)
    );
    if (shakeAmt > 0.001) {
      var s = shakeAmt * 0.06;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }
    camera.lookAt(0, 0, 0);
  }

  function shake(a) {
    shakeAmt = Math.min(1.2, shakeAmt + (a == null ? 0.6 : a));
  }

  var R_MIN = 2.6, R_MAX = 14;

  /* 相机绑定。指针追踪表 pointerId → 坐标，
   * 只允许「屏上仅一根手指」旋转地球，第二根落下立即交出控制权给缩放 ——
   * 否则两指同时拖动时 lastX/lastY 被轮流覆盖，画面在两指之间来回跳。 */
  function bindCam(canvas) {
    var pointers = {};
    var dragId = null;
    function pointerCount() {
      var n = 0, k;
      for (k in pointers) { if (pointers[k]) n++; }
      return n;
    }
    function stopDrag() { dragging = false; dragId = null; }
    function touchDist(t) {
      return Math.sqrt(
        Math.pow(t[0].clientX - t[1].clientX, 2) +
        Math.pow(t[0].clientY - t[1].clientY, 2)
      );
    }
    function armDrag(id) {
      dragging = true; dragId = id;
      lastX = pointers[id].x; lastY = pointers[id].y;
    }
    canvas.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pointerCount() > 1) { stopDrag(); return; }
      armDrag(e.pointerId);
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    });
    function onPointerEnd(e) {
      delete pointers[e.pointerId];
      if (dragId === e.pointerId) stopDrag();
      if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }
      var n = pointerCount();
      if (n === 0) { stopDrag(); return; }
      if (n === 1) { for (var id in pointers) { if (pointers[id]) { armDrag(Number(id)); break; } } }
    }
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (!dragging || e.pointerId !== dragId) return;
      if (pointerCount() > 1) { stopDrag(); return; }
      cam.tTheta -= (e.clientX - lastX) * 0.005;
      cam.tPhi -= (e.clientY - lastY) * 0.005;
      cam.tPhi = Math.max(0.12, Math.min(Math.PI - 0.12, cam.tPhi));
      lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      cam.tRadius *= 1 + (e.deltaY > 0 ? 0.08 : -0.08);
      cam.tRadius = Math.max(R_MIN, Math.min(R_MAX, cam.tRadius));
    }, { passive: false });
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { stopDrag(); pinch = touchDist(e.touches); }
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) pinch = 0;
    }, { passive: true });
    canvas.addEventListener('touchcancel', function () { pinch = 0; }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      if (dragging) stopDrag();
      var d = touchDist(e.touches);
      // 两指几乎重合时 d→0，pinch/d 会炸成天文数字把镜头甩飞
      if (pinch > 12 && d > 12) {
        cam.tRadius *= pinch / d;
        cam.tRadius = Math.max(R_MIN, Math.min(R_MAX, cam.tRadius));
      }
      pinch = d;
    }, { passive: false });
  }

  /* 相机飞向某城（点城市时用）。
   * ⚠ theta 是角度，目标可能落在 0.1 而当前在 6.2，线性插值会走绕地球一圈的长弧。
   * 把目标 theta 相对当前归一化到 [-π, π]，保证永远走最短弧。 */
  function flyTo(lat, lon) {
    var v = G.ll2v(lat, lon, 1);
    var targetTheta = Math.atan2(v.x, v.z);
    var dTheta = targetTheta - cam.tTheta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    cam.tTheta = cam.tTheta + dTheta;
    var targetPhi = Math.acos(Math.max(-1, Math.min(1, v.y)));
    cam.tPhi = Math.max(0.12, Math.min(Math.PI - 0.12, targetPhi));
  }

  function flyToCity(state, cityId) {
    var c = AT.CITIES_BY_ID[cityId];
    if (c) flyTo(c.lat, c.lon);
  }

  /* 城市拾取：把每城 3D 坐标投到屏幕，找命中半径内最近的一座。
   * 背面（法线与视线夹角余弦 < 0.1）跳过 —— 手指点到的是它前面的地表。
   *
   * ⚠ tolPx 的口径：这是**手指落点到城市光点的允许像素距离**。
   *   旧值 max(22, min(48, w×0.075)) 在 390 宽屏上只有 29px，而人手指的
   *   接触面直径约 40~48px，实测「明明看着点在城上却选不中」（截图确认）。
   *   iOS/Android 人机指南都建议可点区域不小于 44pt。
   *   提高到 max(40, min(64, w×0.14)) → 390 屏上 55px、480 屏上 64px，
   *   与光点含 bloom 后的视觉直径（约 40px）匹配，稍偏一点也能选中。
   *
   *   会不会太宽容、点错邻城？密集区（东亚/西欧）城距约 30~60px，
   *   55px 半径确实可能同时覆盖两城 —— 但本函数取的是**距离最近的那座**，
   *   所以「离哪座近就选哪座」这条直觉仍然成立，只是容许手抖。 */
  function pickCity(state, clientX, clientY, w, h, tolPx) {
    if (!camera) return null;
    if (!_pv) { _pv = new THREE.Vector3(); _pn = new THREE.Vector3(); _cd = new THREE.Vector3(); }
    if (!tolPx) tolPx = Math.max(40, Math.min(64, w * 0.14));
    _cd.copy(camera.position).normalize();
    var best = null, bestD = tolPx;
    for (var i = 0; i < state.cities.length; i++) {
      var c = state.cities[i];
      var p = G.ll2v(c.lat, c.lon, R * CITY_LIFT);
      _pn.set(p.x, p.y, p.z).normalize();
      if (_pn.dot(_cd) < 0.10) continue;
      _pv.set(p.x, p.y, p.z).project(camera);
      var sx = (_pv.x * 0.5 + 0.5) * w;
      var sy = (-_pv.y * 0.5 + 0.5) * h;
      var d = Math.sqrt((sx - clientX) * (sx - clientX) + (sy - clientY) * (sy - clientY));
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /* ───────────────────────── 初始化 / 每帧 ───────────────────────── */

  function probe() {
    if (typeof THREE === 'undefined') return false;
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  function init(state, canvas) {
    var gl = null;
    try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) {}
    if (!gl || typeof THREE === 'undefined') { api.ok = false; return false; }

    var w = canvas.clientWidth || global.innerWidth;
    var h = canvas.clientHeight || global.innerHeight;

    planeDummy = new THREE.Object3D();
    _q = new THREE.Quaternion();
    _dir = new THREE.Vector3();
    _up = new THREE.Vector3();
    _axis = new THREE.Vector3();
    _right = new THREE.Vector3();
    _color = new THREE.Color();

    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: quality === 1, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, quality ? 1.5 : 1));
    renderer.setSize(w, h, false);
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04080e);
    camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 5000);
    clock = new THREE.Clock();

    scene.add(new THREE.AmbientLight(0x4a5c6c, 2.2));
    var key = new THREE.DirectionalLight(0xe8f0f8, 1.7);
    key.position.set(4, 3, 5);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x2f7faf, 0.8);
    rim.position.set(-5, -2, -4);
    scene.add(rim);

    buildTextures();
    buildStars();
    buildGlobe();
    buildAtmosphere();
    atmoPhase = 0;
    buildCities(state);
    syncPointScale();
    buildArcs();
    buildPlanes();
    buildFxPool();
    bindCam(canvas);

    /* 开场镜头：对准玩家的基地城市。
     * ⚠ 必须有这一步：默认 theta=0.9 是随手定的，落在哪个半球纯属运气 ——
     *   实测开局对着南大西洋，玩家第一眼看到的是自己的基地在背面。
     *   开局画面就是「我的公司在哪」，这不是可选的润色。
     *
     * 竖屏宽高比只有 ~0.46，横向视场是短板 ——
     * 球径 R*2 = 3.2 要塞进屏宽，距离至少 3.2 / (2·tan26°·0.46) ≈ 7.1，取 7.4。
     * 大屏（横屏/桌面）可以用更近的距离，让球占满视野。 */
    var home = AT.CITIES_BY_ID[state.homeCityId] || state.cities[0];
    if (home) {
      var hv = G.ll2v(home.lat, home.lon, 1);
      // 城市坐标 → 相机球坐标（与 applyCam 的位置公式互逆，见 tests/smoke-render.py 的 err=0 校验）
      var hTheta = Math.atan2(hv.x, hv.z);
      var hPhi = Math.acos(Math.max(-1, Math.min(1, hv.y)));
      // 稍微偏一点纬度上限，让基地不全在正中（正中会被顶栏压住）
      if (h > w) {
        cam.radius = 12; cam.tRadius = 7.4;
        cam.phi = hPhi; cam.tPhi = hPhi;
      } else {
        cam.radius = 9; cam.tRadius = 5.6;
        cam.phi = hPhi; cam.tPhi = hPhi;
      }
      cam.theta = hTheta; cam.tTheta = hTheta;
    } else if (h > w) {
      cam.radius = 12; cam.tRadius = 7.4; cam.phi = 1.25; cam.tPhi = 1.25;
    }
    applyCam();

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      api.ok = false;
      if (api.onContextLost) api.onContextLost();
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      api.ok = true;
      disposeBloomTargets();
      bloom.built = false; bloom.ok = false; bloom.failed = false;
      if (api.onContextRestored) api.onContextRestored();
    }, false);

    api.ok = true;
    return true;
  }

  /* resize 必须读画布自身的 clientWidth/clientHeight，不能用 window.innerWidth：
   * 竖屏布局下画布被装进 #app（max-width 480px、桌面居中），
   * 窗口宽 1280 而画布只有 480 —— 用窗口尺寸会把宽高比算错，地球被横向拉扁。 */
  function resize() {
    if (!renderer) return;
    var cv = renderer.domElement;
    var w = cv.clientWidth || global.innerWidth;
    var h = cv.clientHeight || global.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    syncPointScale();
    if (bloom.built && !bloom.failed) {
      try { buildBloom(); } catch (e) { bloom.ok = false; bloom.failed = true; }
    }
  }

  function frame(state, dt) {
    if (!api.ok || !renderer) return;
    syncCities(state, dt);
    syncArcs(state, dt);
    syncPlanes(state, dt);
    pumpFx(state, dt);
    pumpAtmosphere(dt);

    cam.theta += (cam.tTheta - cam.theta) * 0.12;
    cam.phi += (cam.tPhi - cam.phi) * 0.12;
    cam.radius += (cam.tRadius - cam.radius) * 0.10;
    if (shakeAmt > 0) { shakeAmt -= dt * 2.2; if (shakeAmt < 0) shakeAmt = 0; }
    if (bloomPulse > 0) { bloomPulse -= dt * 1.7; if (bloomPulse < 0) bloomPulse = 0; }
    applyCam();

    if (quality === 1) {
      if (!bloom.built && !bloom.failed) {
        try { buildBloom(); } catch (e) { bloom.ok = false; bloom.failed = true; }
      }
      if (bloom.ok) { bloomPass(); return; }
    }
    renderer.render(scene, camera);
  }

  function setQuality(level) {
    quality = level ? 1 : 0;
    if (renderer) renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, quality ? 1.5 : 1));
  }

  /* ───────────────────────── 导出 ───────────────────────── */

  AT.render = {
    /* ⚠ ok / texOk 必须走 getter 代理到内部 api 对象。
     *   旧写法把 ok 当作**值**拷进导出对象，而 init() 改的是内部 api.ok ——
     *   于是 AT.render.ok 永远是初始的 false，实机冒烟误判「渲染没起来」
     *   （画面明明在正常出帧）。值为 false 本身就说明这是个 bug，不是测试的问题。 */
    get ok() { return api.ok; },
    get texOk() { return !!api.texOk; },
    probe: probe,
    init: init,
    frame: frame,
    resize: resize,
    flyTo: flyTo,
    flyToCity: flyToCity,
    pickCity: pickCity,
    shake: shake,
    setQuality: setQuality,
    get bloomOk() { return bloom.ok; },
    get scene() { return scene; },
    get camera() { return camera; },
    /* 诊断读数：供 tests/smoke-render.py 断言「画面里真的有东西」，而不是静默空转。
     * ⚠ three r149 的 BufferGeometry 没有 getDrawRange()，只有 .drawRange 属性
     *   （旧版 r1xx 才是 getDrawRange/setDrawRange 方法对）。 */
    get cityCount() { return cityGeom ? cityGeom.getAttribute('position').count : 0; },
    get arcSegments() { return arcGeom ? arcGeom.drawRange.count : 0; },
    get planeActive() {
      var n = 0;
      for (var i = 0; i < planeHidden.length; i++) if (planeHidden[i] !== true) n++;
      return n;
    },
    get fxActive() {
      var n = 0, i;
      for (i = 0; i < fxPool.length; i++) if (fxPool[i].t >= 0) n++;
      for (i = 0; i < ringPool.length; i++) if (ringPool[i].t >= 0) n++;
      return n;
    },
    /* 当前相机朝向（供测试断言 flyTo 真的转过去了） */
    get camTarget() { return { theta: cam.tTheta, phi: cam.tPhi, radius: cam.tRadius }; },
    setAtmoBreath: function (v) {
      atmoBreath = Math.max(0, Math.min(0.5, +v || 0));
    },
    get atmoBreath() { return atmoBreath; }
  };

  /* 渲染层内部暂存变量（延迟初始化，避免模块加载期就 new 一堆 THREE 对象） */
  var _axis = null, _right = null, _color = null;

})(typeof window !== 'undefined' ? window : globalThis);
