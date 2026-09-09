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
  var TRAIL_PTS = 24;           // 每枚导弹尾迹采样点数（完整弹道从发射井到当前位置）

  /* §11.7 来袭导弹与拦截弹统一色板（集中管理，避免散落各处各自为政）。
   * 2026-09-09 冷暖彻底分家：核弹（来袭弹）走暖色系 —— 弹头暖琥珀、尾焰冷白偏暖→炽橙，
   * 与核爆火球色呼应；拦截弹走高饱和冷青 —— 弹头与尾线同用一个青蓝 hex。
   * 旧版核弹弹头是炽白，在 bloom 泛光下与浅青的拦截弹几乎分不出来，玩家分不清
   * 「哪条是来袭的核弹、哪条是我方拦截」，故把核弹弹头染成尾焰同系的暖色。
   * 尾焰用 RGB 分量表达，便于按 progress 在 hot/cool 间线性插值。 */
  var PALETTE = {
    missileHeadHex: 0xffd9a0,                  // 弹头核心：暖琥珀（与尾焰/火球同色系）
    missileTrailHot:  [1.00, 0.88, 0.66],      // 尾焰起始（冷白偏暖，平飞段）
    missileTrailCool: [1.00, 0.52, 0.16],      // 尾焰末端（炽橙偏暗红，再入段，与火球色呼应）
    interceptorHex:   0x53c8ff,                // 拦截弹头与尾线：高饱和青蓝，与核弹暖色系一眼区分
    trailFadeHex:     0xff7a30                 // 落地尾痕渐隐：暖橙（与尾焰末端同色系）
  };

  var api = { ok: false };
  var renderer, scene, camera, globe, gridGroup;
  var cityPoints, cityGeom, cityPos, cityColor, citySize, cityAlpha;
  var cityBaseColor;                       // 阵营色基准，脉冲时在其上乘亮（见 syncCities）
  var cityPulse;                           // 城市受击辉光脉冲剩余量 0..1（§11.6 剩余项）
  var cityLastPop;                         // 上一帧人口，用于检测「本帧挨打了」
  // §12 城市定位环：与光点同一批坐标的第二层 Points，只是贴图是空心圆环
  var ringPoints, ringGeom, ringPos, ringColor, ringSize, ringAlpha;
  var unitMeshes = {};         // type -> InstancedMesh
  var missilePool = [], fxPool = [];
  var scorchMarks = [];
  var clock;
  var shakeAmt = 0;            // 核爆冲击的相机震动强度，每帧衰减
  var bloomPulse = 0;          // 核爆瞬间的辉光强度脉冲（0→1，0.6s 衰减回 0）
  var _sn = null;              // 蘑菇云抬升用的法线暂存（避免每帧 new Vector3）
  var cam = { theta: 0.9, phi: 1.15, radius: 6.2, tTheta: 0.9, tPhi: 1.15, tRadius: 6.2 };
  var dragging = false, lastX = 0, lastY = 0, pinch = 0;
  var radarRings = [];
  var tgtRing = null, tgtRingT = 0;        // 选中目标的锁定环（§12，独立于城市环，带脉冲）
  var quality = 1;             // 1=默认档 0=降级档（DESIGN §7.5）
  var CITY_RING_MUL = 1.55;    // 定位环直径 / 光点直径
  var CITY_RING_ALPHA = 0.55;  // 定位环基础亮度（环是辅助信息，不能盖过光点）
  var CITY_PULSE_SEC = 0.25;   // 受击辉光脉冲时长（DESIGN §11.6）

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

  // §12 城市定位环的空心圆环贴图：外圈柔光 + 内圈实线。
  // 只用一圈细线的话，缩到 20 来像素会被纹理过滤吃掉，环断成虚线；
  // 先描一道宽而淡的底、再压一道窄而实的线，任何尺寸下都是完整的一圈。
  function ringTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.26)';
    x.lineWidth = 14;
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = 4;
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    return new THREE.CanvasTexture(c);
  }

  var TEX = {};
  function buildTextures() {
    TEX.dot = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
    TEX.ring = ringTex();
    TEX.flash = radialTex('rgba(255,250,225,1)', 'rgba(255,190,90,0.65)', 'rgba(255,120,30,0)');
    TEX.small = radialTex('rgba(200,235,255,0.95)', 'rgba(120,190,255,0.4)', 'rgba(60,120,255,0)');
    TEX.scorch = radialTex('rgba(20,14,10,0.85)', 'rgba(35,25,18,0.45)', 'rgba(40,30,20,0)');
    // 蘑菇云：烟灰色的柔和团块，叠在火球上方模拟升起的尘柱
    TEX.smoke = radialTex('rgba(150,140,130,0.85)', 'rgba(90,82,74,0.5)', 'rgba(50,46,42,0)');
  }

  /* ───────────── 单位图标贴图（与 HUD 图例同一套图形）─────────────
   * 早期用 3D 几何体（六棱柱 / 四棱锥 / 扁圆台）表示三种单位，问题有两个：
   *   1) 缩到十几个像素时，光照下的立体剪影与图例里的**线稿**对不上，玩家认不出；
   *   2) 位于球面边缘时几何体侧视会退化成一条线，形状信息全丢。
   * 改为把图例里那三个图形（六边形 / 三角 / 椭圆+支杆）画到 canvas 上做成贴图，
   * 用永远正对镜头的平面片（billboard）渲染 —— 所见即图例，且任何角度形状不变。
   * 图标画成白色，实际颜色由 InstancedMesh 的 instanceColor 乘上阵营色。 */
  function iconTex(kind) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    x.lineWidth = 6; x.lineJoin = 'round';
    x.strokeStyle = '#ffffff';
    x.fillStyle = 'rgba(255,255,255,0.30)';
    var i, a, pts = [];

    function poly() {
      x.beginPath();
      pts.forEach(function (p, k) { if (k === 0) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]); });
      x.closePath(); x.fill(); x.stroke();
    }

    if (kind === 'silo') {                       // 六边形（图例：发射井）
      /* 正六边形：横纵半径必须相等。旧版 rx=20 / ry=26，画出来是压扁的六边形，
       * 与图例里端正的六边形对不上 —— 2026-09-09 修正为 22/22。 */
      for (i = 0; i < 6; i++) {
        a = (Math.PI / 180) * (60 * i - 90);
        pts.push([32 + 22 * Math.cos(a), 32 + 22 * Math.sin(a)]);
      }
      poly();
    } else if (kind === 'sam') {                 // 三角（图例：防空）
      /* 2026-09-09 尺寸对齐发射井：旧版底 52 × 高 50，比六边形还大一圈，
       * 防空阵地看着比发射井更抢眼。改为底 42 × 高 40（面积约为六边形的 2/3），
       * 尖角形状天生比六边形"满"，面积略小才显得与发射井同量级。 */
      pts = [[32, 10], [53, 50], [11, 50]];
      poly();
    } else if (kind === 'sub') {                 // 潜艇侧影（图例：战略核潜艇）
      // 艇身 + 指挥塔（帆罩）+ 潜望镜 + 尾舵 —— 侧影要一眼区别于六边形的固定发射井
      x.beginPath();
      x.ellipse(30, 38, 21, 8, 0, 0, Math.PI * 2);
      x.fill(); x.stroke();
      x.beginPath();
      x.moveTo(24, 32); x.lineTo(25.5, 22); x.lineTo(35, 22); x.lineTo(36, 32);
      x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(30, 22); x.lineTo(30, 14); x.stroke();
      x.beginPath();
      x.moveTo(48, 38); x.lineTo(57, 29); x.lineTo(57, 47); x.closePath();
      x.fill(); x.stroke();
    } else {                                     // 椭圆 + 支杆（图例：雷达）
      x.beginPath();
      x.ellipse(32, 24, 24, 13, 0, 0, Math.PI * 2);
      x.fill(); x.stroke();
      x.beginPath(); x.moveTo(32, 37); x.lineTo(32, 58); x.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  var ICON = {};
  function buildIcons() {
    ICON.silo = iconTex('silo');
    ICON.sam = iconTex('sam');
    ICON.radar = iconTex('radar');
    ICON.sub = iconTex('sub');       // §11.10 战略核潜艇（机动发射平台）
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
  }

  /* ───────────────────────── 场景搭建 ───────────────────────── */

  function buildGlobe() {
    var seg = quality ? 64 : 32;

    // 染色 + 冷色壳 = 降饱和压暗叠青灰，全部在 GPU 端完成
    // 提亮（2026-09-08）：原 0x8fa6b8 + shell 0.38 压得太暗看不清，提到 0xc0d4e0 + 0.20
    var mat = new THREE.MeshStandardMaterial({
      color: 0xc0d4e0, roughness: 0.95, metalness: 0.02
    });
    globe = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg / 2), mat);
    scene.add(globe);

    loadGlobeTexture(mat, 0);

    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.0015, seg, seg / 2),
      new THREE.MeshBasicMaterial({
        color: 0x0b1a24, transparent: true, opacity: 0.20,
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
        mat.color.setHex(0xd0e0ec);
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

  /* ───────────────────────── 星空与大气辉光 ─────────────────────────
   * 「震撼」的第一层不是爆炸，是**环境**：一颗悬在深空里的星球。
   * 星空 —— 900 个点分布在大球壳上，静止不动（地球自转由相机拖动表现，星空跟着转会晕）。
   * 大气 —— 1.06R 的球壳配 Fresnel 边缘光，只渲染背面（side: BackSide），
   *          于是只有星球轮廓外那圈会亮起来，形成蓝色大气辉光。 */
  function buildStars() {
    var n = 900, pos = new Float32Array(n * 3), sz = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      // 球面均匀采样：z 均匀、方位角均匀，避免两极扎堆
      var z = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, rxy = Math.sqrt(1 - z * z);
      var R0 = 260;
      pos[i * 3] = R0 * rxy * Math.cos(t);
      pos[i * 3 + 1] = R0 * z;
      pos[i * 3 + 2] = R0 * rxy * Math.sin(t);
      sz[i] = 1.1 + Math.random() * 2.2;
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
        '  gl_PointSize = aSize * uPR;',       // 不随距离衰减；必须乘 DPR，否则高分屏上星星小于 1 物理像素
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'void main(){',
        '  float d = length(gl_PointCoord - vec2(0.5));',
        '  if (d > 0.5) discard;',
        '  gl_FragColor = vec4(0.72, 0.82, 0.92, (1.0 - d * 2.0) * 0.9);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false
    });
    var stars = new THREE.Points(g, m);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  function buildAtmosphere() {
    var m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x54b4e8) }, uInt: { value: 1.0 } },
      vertexShader: [
        'varying vec3 vN; varying vec3 vP;',
        'void main(){',
        '  vN = normalize(normalMatrix * normal);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vP = mv.xyz;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uInt;',
        'varying vec3 vN; varying vec3 vP;',
        'void main(){',
        '  float f = 1.0 - abs(dot(normalize(vN), normalize(-vP)));',
        '  f = pow(f, 4.2);',
        '  gl_FragColor = vec4(uColor * f * uInt, 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32), m));
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
    cityBaseColor = new Float32Array(n * 3);
    citySize = new Float32Array(n);
    cityAlpha = new Float32Array(n);
    cityPulse = new Float32Array(n);
    cityLastPop = new Float32Array(n);
    ringPos = new Float32Array(n * 3);
    ringColor = new Float32Array(n * 3);
    ringSize = new Float32Array(n);
    ringAlpha = new Float32Array(n);

    state.cities.forEach(function (c, i) {
      var v = G.ll2v(c.lat, c.lon, R * CITY_LIFT);
      cityPos[i * 3] = v.x; cityPos[i * 3 + 1] = v.y; cityPos[i * 3 + 2] = v.z;
      // 环贴得比光点略高一点点：两者都不写深度，同深度下不同层的绘制顺序无从保证
      var vr = G.ll2v(c.lat, c.lon, R * (CITY_LIFT + 0.004));
      ringPos[i * 3] = vr.x; ringPos[i * 3 + 1] = vr.y; ringPos[i * 3 + 2] = vr.z;
      var rgb = hexToRgb((DC.FACTIONS_BY_CODE[c.faction] || {}).color || '#ffffff');
      cityBaseColor[i * 3] = rgb[0]; cityBaseColor[i * 3 + 1] = rgb[1]; cityBaseColor[i * 3 + 2] = rgb[2];
      cityColor[i * 3] = rgb[0]; cityColor[i * 3 + 1] = rgb[1]; cityColor[i * 3 + 2] = rgb[2];
      // §12 环是「位置锚」、不抢阵营色：写成白色让光点的阵营色透出来作主分类信息。
      // 一开始让环也带阵营色，结果 DELTA 红环套红光点过曝成实心团，反而看不清边缘。
      ringColor[i * 3] = 1; ringColor[i * 3 + 1] = 1; ringColor[i * 3 + 2] = 1;
      // aSize 为「期望像素直径 × 距离」的系数；uScale = 画布高/2（见 syncPointScale）。
      // 首版 26+pop×1.6 配 uScale=320 糊满全屏；光核收紧到 ~20px，余下的辉光交给 bloom，
      // 「亮核 + 泛光」比「一个大软斑」干净得多。
      citySize[i] = 0.15 + c.pop0 * 0.010;
      cityAlpha[i] = 1;
      // §12 定位环：直径取光点的 1.55 倍 —— 环要套在光点外侧（光点纹理的亮核只占约 1/3），
      // 再大就会在城市密集区（欧洲、东亚）互相压圈，反而看不清有几座城。
      ringSize[i] = (0.15 + c.pop0 * 0.010) * CITY_RING_MUL;
      ringAlpha[i] = CITY_RING_ALPHA;
      cityLastPop[i] = c.pop;      // 初值取当前人口，避免开局把「创建」误判成「挨打」
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

    // 定位环：与光点共用同一套 shader，只换贴图（环是空心线，不是径向渐变）
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

  /* §11.6 城市受击→熄灭→焦痕连贯演出：
   * - 存活且未受打击（pop >= pop0）：alpha=1, size=base
   * - 存活但受打击（0 < pop < pop0）：alpha 按人口比例衰减（最低 0.35），size 按比例缩
   * - 被毁（!alive 或 pop<=0）：alpha=0 彻底淡出（原 0.12 会叠 bloom 残留「幽灵光点」）
   * 按比例变暗让「挨了一半打击」的城市自然变暗缩点，而非二值化骤变。 */
  function syncCities(state, dt) {
    if (!cityGeom) return;
    var dirty = false, sizeDirty = false, colorDirty = false;
    var rDirty = false, rSizeDirty = false;
    var decay = (dt > 0) ? dt / CITY_PULSE_SEC : 0;
    for (var i = 0; i < state.cities.length; i++) {
      var c = state.cities[i];
      /* §11.6 剩余项 —— 受击瞬间辉光脉冲。
       * 触发条件直接看「本帧人口比上一帧少」，不必让 sim 为表现层多投递一个事件：
       * pop 变化只有 resolveImpact 一处来源，语义上就是「挨了一发」。
       * 脉冲把颜色乘到 2.8 倍，正好越过 bloom 阈值 0.72，只在这一瞬炸开一圈光晕。 */
      if (c.pop < cityLastPop[i] - 1e-4) cityPulse[i] = 1;
      cityLastPop[i] = c.pop;
      if (cityPulse[i] > 0) {
        cityPulse[i] -= decay;
        if (cityPulse[i] < 0) cityPulse[i] = 0;
        dirty = sizeDirty = colorDirty = true;
      }
      var p = cityPulse[i];
      var base = 0.15 + c.pop0 * 0.010;
      var rbase = base * CITY_RING_MUL;
      var a, s, ra, rs;
      if (!c.alive || c.pop <= 0) {
        a = 0;                                   // 彻底淡出，不残留
        s = base * 0.5;                           // 缩点
        ra = 0; rs = rbase * 0.6;
      } else if (c.pop0 > 0 && c.pop < c.pop0) {
        var ratio = c.pop / c.pop0;               // 人口损失比例
        a = 0.35 + 0.65 * ratio;                  // 0.35 ~ 1.0
        s = base * (0.6 + 0.4 * ratio);
        ra = CITY_RING_ALPHA * (0.4 + 0.6 * ratio);
        rs = rbase * (0.7 + 0.3 * ratio);
      } else {
        a = 1; s = base; ra = CITY_RING_ALPHA; rs = rbase;
      }
      if (p > 0) {
        a = Math.min(1.6, a * (1 + 0.9 * p));     // alpha 允许 >1：additive 下就是过曝
        s = s * (1 + 0.35 * p);
        rs = rs * (1 + 0.25 * p);
        ra = Math.min(1.2, ra * (1 + 1.4 * p));
      }
      if (cityAlpha[i] !== a) { cityAlpha[i] = a; dirty = true; }
      if (Math.abs(citySize[i] - s) > 1e-6) { citySize[i] = s; sizeDirty = true; }
      var br = cityBaseColor[i * 3], bg = cityBaseColor[i * 3 + 1], bb = cityBaseColor[i * 3 + 2];
      var k = 1 + 1.8 * p;
      if (Math.abs(cityColor[i * 3] - br * k) > 1e-6) {
        cityColor[i * 3] = br * k; cityColor[i * 3 + 1] = bg * k; cityColor[i * 3 + 2] = bb * k;
        colorDirty = true;
      }
      if (ringAlpha[i] !== ra) { ringAlpha[i] = ra; rDirty = true; }
      if (Math.abs(ringSize[i] - rs) > 1e-6) { ringSize[i] = rs; rSizeDirty = true; }
    }
    if (dirty) cityGeom.getAttribute('aAlpha').needsUpdate = true;
    if (sizeDirty) cityGeom.getAttribute('aSize').needsUpdate = true;
    if (colorDirty) cityGeom.getAttribute('aColor').needsUpdate = true;
    if (rDirty) ringGeom.getAttribute('aAlpha').needsUpdate = true;
    if (rSizeDirty) ringGeom.getAttribute('aSize').needsUpdate = true;
  }

  /* §12 锁定环：选中的目标在球面上要有明确标记。
   * 城市环是「这里有城」，锁定环是「我要打的是这一座」——
   * 62 个同色同形的环里没有这个标记，玩家只能靠底部文字确认自己锁了谁。
   * 用 Sprite 而非 Points：它是一个独立对象，位置可以直接 setTarget 改，不必动 buffer。 */
  function setTarget(lat, lon) {
    if (!scene || !TEX.ring) return;
    if (!tgtRing) {
      tgtRing = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.ring, color: 0xff6a5a, transparent: true,
        depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending
      }));
      tgtRing.visible = false;
      scene.add(tgtRing);
    }
    var v = G.ll2v(lat, lon, R * (CITY_LIFT + 0.008));
    tgtRing.position.set(v.x, v.y, v.z);
    tgtRing.visible = true;
    tgtRingT = 0;
  }

  function clearTarget() {
    if (tgtRing) { tgtRing.visible = false; tgtRingT = 0; }
  }

  // 锁定环按屏幕像素恒定缩放 + 呼吸脉冲：Sprite 的世界尺寸会随距离透视缩放，
  // 不每帧按距离反算的话，镜头拉近时环会大到糊住整座城。
  function pumpTargetRing(dt) {
    if (!tgtRing || !tgtRing.visible || !camera) return;
    tgtRingT += dt;
    var d = camera.position.distanceTo(tgtRing.position);
    var breathe = 1 + 0.11 * Math.sin(tgtRingT * 5.2);
    // 0.050：与 Points 层口径对齐经验值 —— d≈4.6 时约 40px，比城市环略大一圈
    tgtRing.scale.setScalar(d * 0.050 * breathe);
    tgtRing.material.opacity = 0.72 + 0.24 * Math.sin(tgtRingT * 5.2);
  }

  /* §11.6 焦痕柔和浮现：初始 opacity=0、scale 偏小，在 pumpScorch 里 0.6s 渐入到目标值，
   * 与城市光点熄灭形成连贯过渡（光点淡出 → 焦痕柔和浮现），而非焦痕突兀贴上。 */
  function addScorch(lat, lon) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.scorch, transparent: true, depthWrite: false, opacity: 0
    }));
    var v = G.ll2v(lat, lon, R * 1.006);
    sp.position.set(v.x, v.y, v.z);
    sp.scale.setScalar(0.08);
    scene.add(sp);
    scorchMarks.push({ sp: sp, t: 0, target: { opacity: 0.85, scale: 0.16 } });
    if (scorchMarks.length > 60) { var old = scorchMarks.shift(); scene.remove(old.sp); }
  }

  // §11.6 焦痕渐入动画：0.6s 内 opacity 0→target、scale 0.08→target
  function pumpScorch(dt) {
    for (var i = 0; i < scorchMarks.length; i++) {
      var s = scorchMarks[i];
      if (s.t >= 1) continue;
      s.t = Math.min(1, s.t + dt / 0.6);
      var k = 1 - Math.pow(1 - s.t, 2);           // ease-out
      s.sp.material.opacity = k * s.target.opacity;
      s.sp.scale.setScalar(0.08 + k * (s.target.scale - 0.08));
    }
  }

  /* ───────────────────────── 单位（InstancedMesh）─────────────────────────
   * 只渲染玩家阵营与已被标记的敌方单位 —— 敌方单位默认不可见（DESIGN §3 / §5.1）。
   */
  /* 2026-09-09 由 0.115 缩到 0.082：单位图标和城市光点抢视觉，
   * 球面上密密麻麻一片图形反而看不清城市在哪 —— 军事符号应该比城市小一号。 */
  var UNIT_SIZE = 0.082;         // 图标边长
  /* 失效设施的灰（§11.12）：低饱和青灰，与 HUD 的 --text-dim 同族。
   * 存成 [r,g,b]（0–1）供 instanceColor 直接 setRGB。 */
  var DISABLED_RGB = [0x64, 0x74, 0x7c].map(function (v) { return v / 255; });
  function buildUnits(state) {
    /* 三种单位 = 三张与图例同形的图标贴图，贴在永远朝向镜头的方片上（billboard）。
     * 用 InstancedMesh + PlaneGeometry，每帧把实例矩阵的旋转设为相机旋转即可实现朝向。 */
    ['silo', 'sam', 'radar', 'sub'].forEach(function (type) {
      // 容量按各阵营 perk 实际单位数求和 + 事件奖励（add_radar/add_sam）余量
      var count = 0;
      DC.FACTIONS.forEach(function (f) {
        var k = DC.perkOf(f.code);
        count += type === 'silo' ? k.silos
               : type === 'sam' ? k.sam
               : type === 'sub' ? k.subs : k.radar;
      });
      count += DC.FACTIONS.length * 4;   // 事件奖励增建的单位余量
      var mat = new THREE.MeshBasicMaterial({
        map: ICON[type], color: 0xffffff,
        transparent: true, depthWrite: false, alphaTest: 0.02
      });
      var im = new THREE.InstancedMesh(new THREE.PlaneGeometry(UNIT_SIZE, UNIT_SIZE), mat, count);
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      im.frustumCulled = false;
      scene.add(im);
      unitMeshes[type] = im;
    });
  }

  var _mtx = null, _col = null, _q = null, _pos = null, _nrm = null, _scl = null, _up = null;

  /* ── 单位 ↔ 关联城市的连线池（2026-09-09 新增）──
   * 每个军事单位都带 cityId（sim.deployUnits 部署时绑定）。单位缩小之后，
   * 「这个六边形属于哪座城」靠肉眼已经对不上号 —— 用一条细线把它拴回所属城市。
   * 只画可见单位（己方 + 被溯源标记的敌方），与单位本体同一套可见性口径。 */
  var LINK_POOL = 96;            // 己方 ~15 条 + 战争后期大量被溯源的敌方单位，留足余量
  var linkPool = [];
  function buildUnitLinks() {
    for (var i = 0; i < LINK_POOL; i++) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0x7fd4e8, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      linkPool.push(line);
    }
  }

  function syncUnits(state) {
    if (!_mtx) {
      _mtx = new THREE.Matrix4(); _col = new THREE.Color();
      _q = new THREE.Quaternion(); _pos = new THREE.Vector3();
      _nrm = new THREE.Vector3(); _scl = new THREE.Vector3(1, 1, 1);
      _up = new THREE.Vector3(0, 1, 0);
    }
    var counts = { silo: 0, sam: 0, radar: 0, sub: 0 };
    var linkIdx = 0;

    state.units.forEach(function (u) {
      // 可见性：己方全部可见；敌方仅在 exposed 时可见（D5 溯源会置位）。
      // 失效设施（关联城市被核平 / 事件卡被毁）不再隐藏 —— §11.12：它应该灰着留在原地，
      // 玩家需要看到"这里曾经有一口井，现在没了"，隐藏会让战损看起来凭空蒸发。
      var visible = (u.faction === state.playerFaction) || u.exposed;
      if (!visible) return;
      var im = unitMeshes[u.type];
      if (!im) return;
      var idx = counts[u.type];
      if (idx >= im.instanceMatrix.count) return;

      var v = G.ll2v(u.lat, u.lon, R * UNIT_LIFT);
      /* billboard：旋转直接取相机旋转，图标永远正对镜头。
       * 旧版把「上方向」对齐球面法线，边缘处仍会退化成一条线；正对镜头则任何角度形状不变。 */
      _pos.set(v.x, v.y, v.z);
      _q.copy(camera.quaternion);
      _mtx.compose(_pos, _q, _scl);
      im.setMatrixAt(idx, _mtx);
      /* 失效设施染灰（§11.12）：阵营色只属于还在线的单位；
       * 灰用低饱和青灰，与 HUD 的 --text-dim 一族，一眼读出"下线"。 */
      var rgb = u.disabled
        ? DISABLED_RGB
        : hexToRgb((DC.FACTIONS_BY_CODE[u.faction] || {}).color || '#ffffff');
      _col.setRGB(rgb[0], rgb[1], rgb[2]);
      im.setColorAt(idx, _col);
      counts[u.type] = idx + 1;

      /* 连线到所属城市：略抬高两端避免与地表/单位贴图打架。
       * 潜艇 cityId 为 null（大洋深处巡逻，§11.10b）—— 不画线，
       * 否则会有一条横跨半个地球的长线把球面图面搅乱。
       * 失效设施保留连线但同样染灰 —— 灰线指向的正是那座把它带走的废墟城市。 */
      var city = (u.cityId && DC.sim && DC.sim.findCity) ? DC.sim.findCity(state, u.cityId) : null;
      if (city && linkIdx < linkPool.length) {
        var line = linkPool[linkIdx++];
        var vu = G.ll2v(u.lat, u.lon, R * (UNIT_LIFT + 0.004));
        var vc = G.ll2v(city.lat, city.lon, R * (CITY_LIFT + 0.003));
        var arr = line.geometry.getAttribute('position');
        arr.setXYZ(0, vu.x, vu.y, vu.z);
        arr.setXYZ(1, vc.x, vc.y, vc.z);
        arr.needsUpdate = true;
        line.material.color.setRGB(rgb[0], rgb[1], rgb[2]);
        line.visible = true;
      }
    });

    // 本帧没用到的连线槽位全部熄灭
    for (; linkIdx < linkPool.length; linkIdx++) linkPool[linkIdx].visible = false;

    Object.keys(unitMeshes).forEach(function (t) {
      var im = unitMeshes[t];
      im.count = counts[t];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
  }

  // 玩家雷达覆盖圈（角半径 → 球面圆环）
  // §11.3 配色改为玩家阵营色（原写死洋红 0xff4fa0 与阵营色体系脱节）。
  // 阵营色与经纬网（青灰 0x5f9fb5）对比不足时，靠 opacity 0.55 + 加法混合提亮，
  // 而非脱离阵营色换一个不相关的颜色。
  function buildRadarRings(state) {
    radarRings.forEach(function (r) { scene.remove(r); });
    radarRings = [];
    var fac = DC.FACTIONS_BY_CODE[state.playerFaction] || {};
    var ringColor = new THREE.Color(fac.color || '#7fd4e8');
    DC.sim.unitsOf(state, state.playerFaction, 'radar').forEach(function (u) {
      var ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(circlePts(u, u.radiusDeg || CONFIG.radarRadiusDeg, R * 1.005)),
        new THREE.LineBasicMaterial({ color: ringColor, transparent: true, opacity: 0.55,
                                       blending: THREE.AdditiveBlending })
      );
      ring.userData.unitId = u.id;
      scene.add(ring);
      radarRings.push(ring);
    });
  }

  /* 覆盖圈的可见性（2026-09-09 修）：
   * 旧版只在 init 时建一次圈、且只处理「预警网临时失效（radar_down）」一种情况 ——
   * 结果是雷达站被摧毁（关联城市被核平 → unit.disabled）后探测圈还挂在球上，
   * 而事件卡增建的新雷达（add_radar）反倒一个圈都没有。
   * 改为每帧比对签名（id + 失效态 + 半径），有变化就重建，再按单位状态逐个决定显隐。 */
  var radarSig = '';
  function syncRadarRings(state) {
    var us = DC.sim.unitsOf(state, state.playerFaction, 'radar');
    var sig = us.map(function (u) {
      return u.id + (u.disabled ? 'x' : 'o') + (u.radiusDeg || 0);
    }).join('|');
    if (sig !== radarSig) { radarSig = sig; buildRadarRings(state); }

    var down = (state.radarDown && state.radarDown[state.playerFaction] > 0);
    for (var i = 0; i < radarRings.length; i++) {
      var u = us[i];
      // 雷达被摧毁（disabled）或全网临时失效（down）→ 圈消失
      radarRings[i].visible = !down && !!u && !u.disabled;
    }
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
      /* §11.7 尾迹基色用 PALETTE（每帧会被 syncMissiles 按 progress 覆盖，
       * 这里只是初始值，但保持与统一色板一致避免首帧闪烁）。 */
      var trail = new THREE.Line(tg, new THREE.LineBasicMaterial({
        color: PALETTE.missileTrailHot[0] * 255 * 65536 + PALETTE.missileTrailHot[1] * 255 * 256 + PALETTE.missileTrailHot[2] * 255,
        transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending
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
      /* §11.7 弹头用 PALETTE 统一色板：暖琥珀核心，与尾焰同色系（冷青留给拦截弹）。
       * 再入段增亮增粗：弹头越接近目标越亮越大。 */
      slot.head.material.color.setHex(PALETTE.missileHeadHex);
      slot.head.scale.setScalar(0.045 + m.progress * 0.038);
      /* 尾焰：从冷白偏暖（hot）→ 炽橙偏暗红（cool），与核爆火球色呼应，
       * 「最后几秒」的紧张感全靠这条渐变，平飞的白色细线没人会盯着看。 */
      var p01 = m.progress;
      var tr = PALETTE.missileTrailHot[0] + (PALETTE.missileTrailCool[0] - PALETTE.missileTrailHot[0]) * p01;
      var tg = PALETTE.missileTrailHot[1] + (PALETTE.missileTrailCool[1] - PALETTE.missileTrailHot[1]) * p01;
      var tb = PALETTE.missileTrailHot[2] + (PALETTE.missileTrailCool[2] - PALETTE.missileTrailHot[2]) * p01;
      slot.trail.material.opacity = 0.55 + p01 * 0.35;
      slot.trail.material.color.setRGB(tr, tg, tb);
      /* §11.5 拦截已判定但视觉尚未抵达：核弹 head 渐隐（与拦截弹升空同步），
       * 尾迹保留至接触点。interceptT 从 0 增到 interceptDelaySec，opacity 从 1 衰减到 0。 */
      if (m.intercepted) {
        var k = Math.min(1, (m.interceptT || 0) / (DC.CONFIG.interceptDelaySec || 0.34));
        slot.head.material.opacity = Math.pow(1 - k, 1.5);
        slot.trail.material.opacity *= (1 - k * 0.6);
      } else {
        slot.head.material.opacity = 1;
      }

      var arr = slot.trail.geometry.getAttribute('position');
      // 完整尾痕：从发射井（t=0）到当前位置（t=progress）均匀采样
      for (var k = 0; k < TRAIL_PTS; k++) {
        var tt = (k / (TRAIL_PTS - 1)) * m.progress;
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
      /* 核爆三层结构（各一份独立材质，便于逐槽调色/调透明度）：
       *   sp  —— 瞬态白闪：0.4s 内炸到最大再熄灭，负责「第一眼的亮」
       *   fb  —— 火球：2s 慢速膨胀，白 → 橙 → 暗红，负责「余烬感」
       *   ring —— 冲击波：贴着地表扩散的环，负责「能量掠过球面」 */
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      sp.visible = false;
      scene.add(sp);

      var fb = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      fb.visible = false;
      scene.add(fb);

      // 蘑菇云：核爆后半拍升起的尘柱，沿球面法线抬升并转暗
      var sh = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.smoke, transparent: true, depthWrite: false
      }));
      sh.visible = false;
      scene.add(sh);

      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.02, 0.032, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffc98a, transparent: true, opacity: 0.9,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        })
      );
      ring.visible = false;
      scene.add(ring);

      fxPool.push({ sp: sp, fb: fb, sh: sh, ring: ring, t: -1, dur: 2.2, big: true,
                    lat: 0, lon: 0 });
    }
  }

  /* ───────────────────────── 拦截弹演出 ─────────────────────────
   * 早期拦截只是「空中凭空爆一团光」，玩家根本不知道是谁打的、从哪打的。
   * 现在补上完整过程：防空阵地点火 → 拦截弹沿弧线爬升 → 撞上来袭弹 → 爆闪。
   * 起飞点由 sim 记在 m.interceptor 上随 fx 事件带出（见 sim.tryIntercept）。 */
  var INT_POOL = 14, INT_RISE = 0.34, INT_FLASH = 0.5;
  var INT_DUR = INT_RISE + INT_FLASH;
  var intPool = [];
  var _ia = null, _ib = null;

  function buildInterceptorPool() {
    for (var i = 0; i < INT_POOL; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.small, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      /* §11.7 拦截弹头也用青蓝色，与拦截线统一，区别于来袭导弹的暖色系。 */
      sp.material.color.setHex(PALETTE.interceptorHex);
      sp.visible = false;
      scene.add(sp);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      /* §11.7 拦截弹用青蓝色（PALETTE.interceptorHex），与来袭导弹的暖色系形成清晰对比，
       * 让玩家一眼区分「我方拦截」与「敌方来袭」。 */
      var line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: PALETTE.interceptorHex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
      }));
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      intPool.push({ sp: sp, line: line, t: -1, from: null, to: null });
    }
  }

  function spawnInterceptor(from, to) {
    var slot = null;
    for (var i = 0; i < intPool.length; i++) if (intPool[i].t < 0) { slot = intPool[i]; break; }
    if (!slot) slot = intPool[0];            // 池满则抢占最旧槽位
    slot.from = from; slot.to = to; slot.t = 0;
    slot.sp.visible = true; slot.line.visible = true;
  }

  function pumpInterceptors(dt) {
    if (!_ia) { _ia = new THREE.Vector3(); _ib = new THREE.Vector3(); }
    for (var i = 0; i < intPool.length; i++) {
      var s = intPool[i];
      if (s.t < 0) continue;
      s.t += dt;
      if (s.t >= INT_DUR) { s.t = -1; s.sp.visible = false; s.line.visible = false; continue; }

      var a = G.ll2v(s.from.lat, s.from.lon, R * 1.012);
      _ia.set(a.x, a.y, a.z);
      if (s.t < INT_RISE) {
        var k = s.t / INT_RISE;
        var b = G.ll2v(s.to.lat, s.to.lon, R * 1.012);
        _ib.set(b.x, b.y, b.z);
        // 直线插值后按归一化抬升 —— 得到一条离地的上升弧线，而不是贴着地表的直线
        _pos.copy(_ia).lerp(_ib, k).normalize()
            .multiplyScalar(R * (1.012 + Math.sin(k * Math.PI) * 0.07));
        s.sp.position.copy(_pos);
        s.sp.scale.setScalar(0.030 + k * 0.022);
        s.sp.material.opacity = 0.95;
        var arr = s.line.geometry.getAttribute('position');
        arr.setXYZ(0, _ia.x, _ia.y, _ia.z);
        arr.setXYZ(1, _pos.x, _pos.y, _pos.z);
        arr.needsUpdate = true;
        s.line.material.opacity = 0.6;
      } else {
        var k2 = (s.t - INT_RISE) / INT_FLASH;
        var q = G.ll2v(s.to.lat, s.to.lon, R * 1.014);
        s.sp.position.set(q.x, q.y, q.z);
        s.sp.scale.setScalar(0.05 + k2 * 0.24);
        s.sp.material.opacity = Math.pow(1 - k2, 1.4) * 0.95;
        s.line.visible = false;
      }
    }
  }

  /* ───────────────────────── 落地尾痕渐隐池 ─────────────────────────
   * 核弹落地后尾痕保留约 1.5s 渐隐再消失（DESIGN §7.9 演出）：
   * 在飞时 syncMissiles 画从发射井到当前位置的完整尾痕，
   * 落地后由本池接管，画从发射井到目的地的完整弹道线，opacity 随时间衰减。 */
  var TRAIL_POOL = 24, TRAIL_DUR = 1.5;
  var trailPool = [];

  function buildTrailPool() {
    for (var i = 0; i < TRAIL_POOL; i++) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_PTS * 3), 3));
      /* §11.7 落地尾痕用 PALETTE.trailFadeHex，与尾焰末端同色系。 */
      var line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: PALETTE.trailFadeHex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending
      }));
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      trailPool.push({ line: line, t: -1, from: null, to: null });
    }
  }

  function spawnTrail(from, to) {
    var slot = null;
    for (var i = 0; i < trailPool.length; i++) if (trailPool[i].t < 0) { slot = trailPool[i]; break; }
    if (!slot) slot = trailPool[0];
    slot.from = from; slot.to = to; slot.t = 0;
    slot.line.visible = true;
  }

  function pumpTrails(dt) {
    for (var i = 0; i < trailPool.length; i++) {
      var s = trailPool[i];
      if (s.t < 0) continue;
      s.t += dt;
      if (s.t >= TRAIL_DUR) { s.t = -1; s.line.visible = false; continue; }
      var arr = s.line.geometry.getAttribute('position');
      for (var k = 0; k < TRAIL_PTS; k++) {
        var tt = k / (TRAIL_PTS - 1);
        var q = G.ballistic(s.from, s.to, tt, R, 9);
        arr.setXYZ(k, q.x, q.y, q.z);
      }
      arr.needsUpdate = true;
      s.line.material.opacity = Math.pow(1 - s.t / TRAIL_DUR, 1.3) * 0.8;
    }
  }

  // 消费 sim 投递的特效事件（拦截闪光 / 核爆 + 焦痕）
  function pumpFx(state, dt) {
    while (state.fx.length) {
      var e = state.fx.shift();
      // 拦截且带得上起飞点 → 走拦截弹演出（升空 → 撞击 → 爆闪），不吃特效池的槽位
      if (e.type === 'intercept' && e.sam) {
        spawnInterceptor(e.sam, { lat: e.lat, lon: e.lon });
        continue;
      }
      var slot = null, i;
      for (i = 0; i < fxPool.length; i++) if (fxPool[i].t < 0) { slot = fxPool[i]; break; }
      if (!slot) { slot = fxPool[0]; }   // 池满则抢占最旧槽位
      var v = G.ll2v(e.lat, e.lon, R * 1.008);
      slot.sp.position.set(v.x, v.y, v.z);
      slot.fb.position.set(v.x, v.y, v.z);
      slot.sh.position.set(v.x, v.y, v.z);
      slot.ring.position.set(v.x, v.y, v.z);
      slot.ring.lookAt(0, 0, 0);
      slot.big = (e.type === 'impact');
      slot.lat = e.lat; slot.lon = e.lon;
      slot.t = 0;
      slot.dur = slot.big ? 2.6 : 0.6;
      slot.sp.visible = true;
      slot.fb.visible = slot.big;
      slot.sh.visible = slot.big;
      slot.ring.visible = slot.big;
      if (slot.big) {
        if (e.from && e.to) spawnTrail(e.from, e.to);   // 落地尾痕渐隐
        addScorch(e.lat, e.lon);   // 白闪/震动由 ui 监听 state.impacts 触发，这里只管 3D 侧
        bloomPulse = 1;            // 核爆瞬间把辉光强度顶上去，0.6s 内衰减回来
      }
    }

    for (var j = 0; j < fxPool.length; j++) {
      var f = fxPool[j];
      if (f.t < 0) continue;
      f.t += dt;
      if (f.t >= f.dur) {
        f.t = -1;
        f.sp.visible = false; f.fb.visible = false; f.sh.visible = false; f.ring.visible = false;
        continue;
      }

      if (!f.big) {                                    // 拦截：一枚小蓝白闪光
        var ki = f.t / f.dur;
        f.sp.scale.setScalar(0.06 + ki * 0.10);
        f.sp.material.opacity = (1 - ki) * 0.85;
        continue;
      }

      /* ── 核爆四层的逐帧动画 ── */
      var t = f.t;
      // 白闪：0.45s 打满然后急灭（ease-out 的幂曲线，前 20% 时间就贡献 80% 亮度）
      var kf = Math.min(1, t / 0.45);
      f.sp.scale.setScalar(0.12 + kf * 0.70);
      f.sp.material.opacity = Math.pow(1 - kf, 1.3);
      // 火球：先快涨后慢涨，颜色白 → 橙 → 暗红
      var kb = Math.min(1, t / f.dur);
      var grow = 1 - Math.pow(1 - Math.min(1, kb * 1.7), 2);
      f.fb.scale.setScalar(0.10 + grow * 0.36);
      f.fb.material.opacity = Math.pow(1 - kb, 1.5) * 0.95;
      f.fb.material.color.setRGB(1, 0.95 - kb * 0.72, 0.75 - kb * 0.70);
      /* 蘑菇云：比火球延后 0.35s 才起来，沿球面法线抬升、边升边暗边散。
       * 没有它，爆炸只是「一团光散掉」；有尘柱才有核爆该有的重量感。 */
      var km = Math.max(0, Math.min(1, (t - 0.35) / (f.dur - 0.35)));
      if (km > 0) {
        if (!_sn) _sn = new THREE.Vector3();
        var bv = G.ll2v(f.lat, f.lon, R * 1.008);
        _sn.set(bv.x, bv.y, bv.z).normalize();
        f.sh.position.set(
          bv.x + _sn.x * km * 0.30,
          bv.y + _sn.y * km * 0.30,
          bv.z + _sn.z * km * 0.30);
        f.sh.scale.setScalar(0.12 + km * 0.30);
        f.sh.material.opacity = Math.pow(1 - km, 1.2) * 0.55;
      }
      // 冲击波：1.4s 内掠过 15° 左右的地表弧长
      var kr = Math.min(1, t / 1.4);
      f.ring.scale.setScalar(1 + kr * 15);
      f.ring.material.opacity = Math.pow(1 - kr, 1.6) * 0.75;
    }
  }

  /* ───────────────────────── 手写 bloom 后处理 ─────────────────────────
   * 包里只带 three.min.js 核心（608 KB），没有 examples 的 EffectComposer/UnrealBloomPass，
   * 所以 bloom 自己写：场景先渲到离屏 RT → 亮度提取（smoothstep 软阈值）→
   * 两趟可分离高斯模糊（1/4 分辨率，各迭代 2 次）→ 与原画面加法叠加。
   * 全屏三角形走 OrthographicCamera + PlaneGeometry(2,2)，材质复用同一个 quad 切换。
   *
   * 降级策略（DESIGN §7.5）：建 RT 或编 shader 抛错 → bloom.failed = true，
   * 之后永远直渲不重试；quality=0（降级档）也直接不用。context restored 后重建。
   */
  var POST_VS = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  // 亮度提取：阈值取得偏高（0.72 起），因为染色后的地球陆地亮度能摸到 0.5~0.6，
  // 阈值低了整个星球都会泛光，画面直接糊掉；城市光核 / 导弹头 / 核爆都在 0.9 以上。
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

  // 5 采样可分离高斯（线性采样优化版：3 次纹理读取等效 5 tap）
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
    var q = 4;                                     // 模糊通道 1/4 分辨率
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
        uniforms: { tScene: { value: null }, tBloom: { value: null }, uStrength: { value: 1.25 } },
        vertexShader: POST_VS, fragmentShader: POST_COMP_FS, depthTest: false, depthWrite: false
      });
    }
    bloom.built = true;
    bloom.ok = true;
  }

  function bloomPass() {
    // 1) 场景 → rtScene
    renderer.setRenderTarget(bloom.rtScene);
    renderer.render(scene, camera);
    // 2) 亮度提取 → rtA
    bloom.quad.material = bloom.mBright;
    bloom.mBright.uniforms.tDiffuse.value = bloom.rtScene.texture;
    renderer.setRenderTarget(bloom.rtA);
    renderer.render(bloom.scene, bloom.cam);
    // 3) 横→纵高斯，迭代两轮让辉光铺得开
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
    // 4) 叠加回屏
    bloom.quad.material = bloom.mComp;
    bloom.mComp.uniforms.tScene.value = bloom.rtScene.texture;
    bloom.mComp.uniforms.uStrength.value = 1.25 + bloomPulse * 1.35;   // 核爆瞬间把辉光顶到 2.6
    bloom.mComp.uniforms.tBloom.value = bloom.rtA.texture;
    renderer.setRenderTarget(null);
    renderer.render(bloom.scene, bloom.cam);
  }

  /* ───────────────────────── 相机控制（手写，无 OrbitControls）───────────────────────── */

  function applyCam() {
    var sp = Math.sin(cam.phi);
    camera.position.set(
      cam.radius * sp * Math.sin(cam.theta),
      cam.radius * Math.cos(cam.phi),
      cam.radius * sp * Math.cos(cam.theta)
    );
    /* 震动：核爆落地时给相机一个衰减的随机偏移。
     * 用 Math.random 而非 state.rng —— 这是纯表现层，绝不能污染决定性模拟的随机序列。 */
    if (shakeAmt > 0.001) {
      var s = shakeAmt * 0.10;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }
    camera.lookAt(0, 0, 0);
  }

  // 核爆落地时调用；多次爆炸叠加，上限 1.6 防止多弹齐爆把画面甩飞
  function shake(a) {
    shakeAmt = Math.min(1.6, shakeAmt + (a == null ? 1 : a));
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
    var targetTheta = Math.atan2(v.x, v.z);
    /* §11.4 修复绕大圈 bug：theta 是 0–2π 的角度，目标可能落在 0.1 而当前在 6.2，
     * 线性插值会走 6.2 → 0.1 的长弧（约 6 rad）而不是 +0.1 的短弧。
     * 把目标 theta 相对当前 cam.tTheta 归一到 [-π, π]，保证永远走最短弧。
     * phi 被 clamp 到 [0.08, π-0.08]，不存在环绕问题，无需归一。 */
    var dTheta = targetTheta - cam.tTheta;
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    cam.tTheta = cam.tTheta + dTheta;
    cam.tPhi = Math.acos(Math.max(-1, Math.min(1, v.y)));
    cam.tPhi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.tPhi));
  }

  /* ───────────────────────── 拾取（D4 下发指令用）───────────────────────── */

  /* 屏幕空间拾取（移动端重做）：
   * 旧版走「射线打球面 → 反算经纬度 → 找 4° 内最近城市」，两条硬伤：
   *   1) 4° 是角度常量，不随画布尺寸/缩放变化 —— 390px 宽的手机屏上 1° 只有约 1.6px，
   *      4° 才 6~7px，手指根本点不中，而缩放到大陆尺度时 4° 又会误抓邻城。
   *   2) 射线必须命中球体才有效，点在地球边缘外侧时会直接返回 null，手感断。
   * 改为把城市投影到屏幕坐标比距离，容差按画布宽度取 7%（22~44px），
   * 与「手指能点到的范围」同一量纲；背面城市用视向点乘剔除，避免穿透球体选中。 */
  var _pv = null, _pn = null, _cd = null;
  function pickCity(state, clientX, clientY, w, h, tolPx) {
    if (!camera) return null;
    if (!_pv) { _pv = new THREE.Vector3(); _pn = new THREE.Vector3(); _cd = new THREE.Vector3(); }
    if (!tolPx) tolPx = Math.max(22, Math.min(44, w * 0.07));
    _cd.copy(camera.position).normalize();
    var best = null, bestD = tolPx;
    for (var i = 0; i < state.cities.length; i++) {
      var c = state.cities[i];
      if (!c.alive) continue;
      var p = G.ll2v(c.lat, c.lon, R * CITY_LIFT);
      _pn.set(p.x, p.y, p.z).normalize();
      if (_pn.dot(_cd) < 0.10) continue;        // 背面：手指点到的是它前面的地表
      _pv.set(p.x, p.y, p.z).project(camera);
      var sx = (_pv.x * 0.5 + 0.5) * w;
      var sy = (-_pv.y * 0.5 + 0.5) * h;
      var d = Math.sqrt((sx - clientX) * (sx - clientX) + (sy - clientY) * (sy - clientY));
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /* ───────────────────────── 初始化 / 每帧 ───────────────────────── */

  /* WebGL 预检：在开局阵营选择弹窗之前判断能不能跑 3D。
   * 用**临时 canvas** 而非真实画布 —— 真实画布一旦取过上下文，
   * 后续 WebGLRenderer 会复用它，探测与初始化纠缠在一起不好排查。 */
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

    scene.add(new THREE.AmbientLight(0x3a4a5a, 2.0));
    var key = new THREE.DirectionalLight(0xdfe9f2, 1.8);
    key.position.set(4, 3, 5);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x2f6f8f, 0.7);
    rim.position.set(-5, -2, -4);
    scene.add(rim);

    buildTextures();
    buildIcons();
    buildStars();
    buildGlobe();
    buildAtmosphere();
    buildCities(state);
    syncPointScale();          // 必须在 setSize 之后：uScale 依赖画布实际像素高
    buildUnits(state);
    buildUnitLinks();
    buildRadarRings(state);
    buildMissilePool();
    buildFxPool();
    buildInterceptorPool();
    buildTrailPool();
    bindCam(canvas);
    /* 竖屏开场镜头：竖屏宽高比只有 ~0.46，横向视场是短板 ——
     * 球径 R*2=3.2 要塞进屏宽，距离至少 3.2 / (2·tan26°·0.46) ≈ 7.1，
     * 取 7.4（球占屏宽 93%，上下留出 HUD 空间）；再从 12 缓推进场。 */
    if (h > w) { cam.radius = 12; cam.tRadius = 7.4; cam.phi = 1.25; cam.tPhi = 1.25; }
    applyCam();

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      api.ok = false;
      if (api.onContextLost) api.onContextLost();
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      api.ok = true;
      // 上下文重建后旧 RT 全部失效：置回未构建，下一帧 lazy 重建
      disposeBloomTargets();
      bloom.built = false; bloom.ok = false; bloom.failed = false;
      if (api.onContextRestored) api.onContextRestored();
    }, false);

    api.ok = true;
    return true;
  }

  /* 必须读画布自身的 clientWidth/clientHeight，不能用 window.innerWidth/Height：
   * 竖屏重构后画布被装进 #app（max-width:480px、桌面端居中），
   * 桌面浏览器里窗口宽 1280 而画布只有 480 —— 用窗口尺寸 setSize 会把宽高比算错，
   * 地球被横向拉扁（改竖屏布局后第一版就踩了这个坑）。 */
  function resize() {
    if (!renderer) return;
    var cv = renderer.domElement;
    var w = cv.clientWidth || global.innerWidth;
    var h = cv.clientHeight || global.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    syncPointScale();
    // 画布缓冲尺寸变了，离屏 RT 必须跟着重建，否则 bloom 分辨率错位（画面被拉伸重影）
    if (bloom.built && !bloom.failed) {
      try { buildBloom(); } catch (e) { bloom.ok = false; bloom.failed = true; }
    }
  }

  // dt 为真实帧间隔；state 由 game.js 按固定步长推进，这里只做表现层同步
  function frame(state, dt) {
    if (!api.ok || !renderer) return;
    syncCities(state, dt);
    syncUnits(state);
    syncRadarRings(state);
    syncMissiles(state);
    pumpFx(state, dt);
    pumpInterceptors(dt);
    pumpTrails(dt);
    pumpScorch(dt);
    pumpTargetRing(dt);

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
    renderer.render(scene, camera);   // 降级档 / bloom 构建失败：直渲
  }

  function setQuality(level) {
    quality = level ? 1 : 0;
    if (renderer) renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, quality ? 1.5 : 1));
  }

  DC.render = {
    ok: false,
    texOk: false,
    probe: probe,
    init: init,
    frame: frame,
    resize: resize,
    flyTo: flyTo,
    pickCity: pickCity,
    setTarget: setTarget,
    clearTarget: clearTarget,
    shake: shake,
    setQuality: setQuality,
    get bloomOk() { return bloom.ok; },
    // 正在演出的拦截弹数量（供冒烟断言「拦截不是只改了数字，画面上真有东西」）
    get intActive() {
      var n = 0;
      for (var i = 0; i < intPool.length; i++) if (intPool[i].t >= 0) n++;
      return n;
    },
    get scene() { return scene; },
    get camera() { return camera; },
    /* 各雷达覆盖圈的可见性（供冒烟断言「雷达站被摧毁后圈同步消失」）。
     * 顺序与 DC.sim.unitsOf(state, playerFaction, 'radar') 一致。 */
    get radarRingsVisible() {
      return radarRings.map(function (r) { return !!r.visible; });
    }
  };
  api = DC.render;

})(typeof window !== 'undefined' ? window : globalThis);
