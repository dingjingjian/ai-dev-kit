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
 *   · 已通航城市套**橙黄定位环**（你的网络）；竞对独飞的城套**紫罗兰细环**；
 *     既无我的航线也无竞对航线的城，只有冰青光点（待开拓）
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
   * 改用**航线所有权**配色。
   *
   * ⚠ 2026-09-30 改版（用户：「公司的航线按照公司的颜色来」）：
   *   旧版是「暖金 = 我 / 紫罗兰 = 竞对」的两色制 —— 能分出「我的」与「对手的」，
   *   但分不出**是哪个对手**，五家竞对在地图上糊成一支紫色。
   *   现在：航线与客机一律取**该航司的识别色**（玩家 = state.airlineColor，
   *   竞对 = rival.color，两者同源于 data.js §2.5 的六色板）。
   *   城市光点/城市环仍保留旧的两色制（暖金=我的网络 / 紫罗兰=有人竞对通航），
   *   因为那是「归属桶」而不是「具体哪一家」，六色化只会让地图信息过载。
   *
   * ⚠ 双方都必须醒目，靠**色相**区分，而不是靠「把竞对压暗」来区分（2026-09-29 三次修订）。
   *   早先把竞对设成低饱和冷灰蓝（0x5f8aa4）、客机也调成近白的淡蓝，意图是
   *   「让玩家的注意力被自己的网络吸走，而不是去数竞对有多少条线」。这条意图与
   *   「一眼分出谁是我的线」**直接矛盾 —— 看不到的东西无从区分**。玩家在决定往哪扩张时，
   *   恰恰最需要看清竞对已经铺到哪了。故两边亮度都拉到能看清；
   *   「谁是主角」改由抬升量（我的线飞得更高）表达，不再用「谁更看不见」表达。
   *
   * ⚠ 城市光点的配色（2026-09-29 二次修订）：
   *   地球贴图（Blue Marble）满屏只有四种色相 —— 深蓝海洋、土黄/褐陆地、橄榄绿植被、白冰盖。
   *   ① **已通航城市 = 橙黄 0xffc76b**，与面板里「资金」（--amber）是同一个色值。
   *      这个呼应是有意的：顶栏「橙色 = 我的钱」、地图「橙色 = 我的网络」，
   *      玩家的航线本就是他最关心的资产，两处共用一支颜色，省掉一次学习成本。
   *   ② **未通航城市 = 冰青 0x2fc4ff** 保持不变：橙（约 38°）与青（约 197°）在色环上
   *      相隔约 160°，且地图上没有青色 —— 「待开拓的城」与「我的网络」一眼可分。
   *   ③ **竞对独飞的城**（我不通航、但至少一家竞对有航线）—— 光点仍是冰青，
   *      只多套一圈**紫罗兰细环**（rivalHex，与竞对弧线同一支色）。这一圈是玩家唯一能
   *      「看出竞对铺到哪了」的通道（竞对航线不进任何面板），所以它必须看得清 ——
   *      不再像早先那样压暗。与我的橙黄环同尺寸、亮度相近，靠色相区分归属。
   *   ④ 亮度必须压在 bloom 的高亮阈值之下（POST_BRIGHT_FS 用 luma 0.86 提取亮部）。
   *      橙黄本身 luma 已达 0.80，若仍乘旧公式的 1.22 倍等级增益就会到 0.98，
   *      点核被 bloom 拉成白点、橙黄色相反被烧掉 —— 这正是暖金版老配色翻过的车。
   *      故本版把「已通航」的等级增益重标定为 0.792→1.0（见 syncCities 的 g 公式），
   *      峰值 luma ≈ 0.80，既保住橙黄又不过曝。
   *
   * ── 归属色的分工（2026-09-30 修订后）──
   *   航司识别色（六色板）  = **航线与客机**：我的线用我选的航司色，竞对各自一色。
   *   暖金 / 橙黄（0xffc76b 系）= **我的城市**：我通航的城市点与环。
   *   紫罗兰（0xb48cff 系）   = **竞对的城市**：仅竞对通航的城市环（不区分到具体哪家）。
   *   冰青（0x2fc4ff）        = **无人通航**（不属于任何人，是「待开拓」而非「归属」）。 */
  var PALETTE = {
    homeHex:      0xffd488,    // 基地城市：更亮的橙黄（同色相更亮，配 1.25 倍尺寸与更亮的定位环）
    mineHex:      0xffc76b,    // 已通航航点：橙黄 = 面板「资金」的 --amber
    rivalHex:     0xb48cff,    // 仅竞对通航的城市：紫罗兰细环（不区分是哪一家，见注释 ③）
    virginHex:    0x2fc4ff,    // 未通航城市：冰青（地图上没有的色相；够饱和才能在蓝海上不被读成白点）
    arcMine:      0xffcd5c,    // **缺省回落**：没选航司的旧路径（工具/测试）才用它，暖金
    arcRival:     0xb48cff,    // **缺省回落**：竞对无 color 字段时（旧路径）才用它，紫罗兰
    arcOpen:      0xfff4d0,    // 开航瞬间的弧线辉光（比任何归属色都亮，越过 bloom 阈值）
    planeMine:    0xfff6da,    // 缺省回落：我的客机（暖白）
    planeRival:   0xd9c6ff,    // 缺省回落：竞对客机（提亮版紫罗兰）
    level: [                   // 城市按开发度等级的配色（1→5 级，越亮越繁盛）
      0x93aabb, 0xaecbdc, 0xcfe6ee, 0xf2e3b4, 0xffd88a
    ]
  };

  var api = { ok: false };
  var renderer, scene, camera, globe, gridGroup;
  var cityPoints, cityGeom, cityPos, cityColor, citySize, cityAlpha;
  var haloPoints;                         // 城市柔光光晕层（与 cityGeom 共用几何，只换贴图与倍数）
  var cityLevel, cityRinged;              // 每城当前等级 / 是否已通航（我的网络）
  var cityRingTone;                       // 每城当前环色：0=我的网络(橙黄) 1=仅竞对(紫罗兰) -1=无环
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
   * 先铺一道宽而淡的底、再压一道窄而实的线，任何尺寸下都是完整的一圈。
   * ⚠ 柔光底要「淡而窄」：早先 0.24/13px 的宽柔光叠上 bloom 后，
   *   环会糊成一坨发光厚圈，像贴在球上的准星，故收成 0.16/9px。 */
  function ringTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.16)';
    x.lineWidth = 9;
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.9)';
    x.lineWidth = 3.2;
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    return new THREE.CanvasTexture(c);
  }

  /* 城市符号：一枚干净的小圆点 —— 实心核 + 极短软边。
   * 2026-09-28 精简：去掉四向刻度与外环装饰，回到最简的「点」。
   * ⚠ 软边只铺到 28px（≈半个符号的 0.44）就收干净：宽柔光铺满整张贴图，
   *   再叠 additive + bloom 会糊成一团白雾（实机踩过的坑）；小而快地收边才是「点」。
   *   需要外圈柔光时不要放宽这里，而是用单独的低透明度光晕层（cityHaloTex）。 */
  function cityMarkTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 28);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');   // 平顶段 → 实心核
    g.addColorStop(1, 'rgba(255,255,255,0)');      // 出核即收 → 极短软边
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /* 城市柔光光晕：叠在符号外围的一圈软光（对齐 world-food-atlas 的 haloTex）。
   * 单独一层而不是并进「点」里：点核要保持小而利落，光晕要柔而铺得开，
   * 两者尺寸/透明度都得分开调；并入同一张贴图就只剩一个固定的比例。 */
  function cityHaloTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0,    'rgba(255,255,255,0.92)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.58)');
    g.addColorStop(0.38, 'rgba(255,255,255,0.24)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.015)');
    g.addColorStop(1,    'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /* 已通航外环：一根**柔化渐变**细环（对齐 world-food-atlas 的 ringLineTex）。
   * 早先是硬边描线，缩到 30 来像素既发死、又像贴在球上的 UI 准星；
   * 改成从环心向两侧羽化（.64→.70→.74 的窄带），小尺寸下自动融进光晕里，
   * 读作「城市外面淡淡一圈」，而不是一根画上去的线。
   * ⚠ 半径停在 .70（与旧描线的 45/64≈.703 基本一致），环的视觉直径不变。
   * ⚠ 与 TEX.ring（开航波纹）分开：波纹要靠柔光底做扩散感，这里只要一圈细环。 */
  function markRingTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0,    'rgba(255,255,255,0)');
    g.addColorStop(0.60, 'rgba(255,255,255,0)');
    g.addColorStop(0.64, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.70, 'rgba(255,255,255,1)');
    g.addColorStop(0.74, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.78, 'rgba(255,255,255,0)');
    g.addColorStop(1,    'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
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
    /* 城市标记：柔光光晕 + 亮核 + 已通航细环（形制对齐 world-food-atlas）。 */
    TEX.halo = cityHaloTex();
    TEX.dot = cityMarkTex();
    TEX.ring = ringTex();
    TEX.markRing = markRingTex();     // 已通航外环用的柔化细环（与开航波纹分开）
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

  /* ── 航司识别色 → 渲染用色（2026-09-30）──
   * data.js §2.5 的 color 是 CSS 字符串（'#E24B4A'），而色板其余项是 0x 数字，
   * 故这里统一收口：字符串与数字都吃，解析不出来返回 null（调用方回落到旧色板）。
   *
   * ⚠ tint（向白插值 0..1）不是装饰，是**可读性刚需**：
   *   航司色取自地区色，都是深饱和色（绿 0x1D9E75 的 luma 只有 0.45），
   *   而航线是 1px、additive 混合的细线，压在深蓝海面上会糊得几乎看不见。
   *   按 tint 提亮后色相不变、亮度够 —— 提亮量与 bloom 阈值无关（这些色的
   *   luma 提亮后仍在 0.7 以下，不会像橙黄那样被 bloom 烧成白点）。 */
  function ownerRgb(color, tint) {
    var c = null;
    if (typeof color === 'string' && color.charAt(0) === '#') {
      var n = parseInt(color.substr(1), 16);
      if (!isNaN(n) && color.length === 7) c = hexToRgb(n);
    } else if (typeof color === 'number' && !isNaN(color)) {
      c = hexToRgb(color);
    }
    if (!c || isNaN(c[0])) return null;
    var k = tint || 0;
    return [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
  }
  /* 取某公司的航线/客机色：有航司识别色就用它，没有就回落旧色板 */
  function toneRgb(color, fallbackHex, tint) {
    return ownerRgb(color, tint) || ownerRgb(fallbackHex, tint);
  }
  var ARC_TINT = 0.30;      // 航线提亮量（细线要更亮才看得清）
  var PLANE_TINT = 0.55;    // 客机提亮量（小点比线更吃亏，提得更多）

  function v3(lat, lon, r) {
    var v = G.ll2v(lat, lon, r);
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  /* ───────────────────────── 场景搭建 ───────────────────────── */

  function buildGlobe() {
    var seg = quality ? 64 : 32;
    /* ⚠ 基色保持纯白（原色）：早先用 0xcfe2f0 的冷蓝白「调和」贴图，等于给整颗球蒙了层蓝灰。
     *   现在让 albedo 完全等于贴图本身，颜色交给贴图。 */
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.82, metalness: 0.06
    });
    globe = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg / 2), mat);
    scene.add(globe);

    loadGlobeTexture(mat, 0);

    // 冷色壳：早先用来「压暗 + 叠蓝」，把贴图往夜空星球推。
    // ⚠ 本次要求贴图回到原色 + 整体提亮，这层是主要的压暗来源之一，故从 0.12 降到 0.04 ——
    //   只留一丝冷调，几乎不参与压暗；想彻底去蓝调就设成 0。
    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.0015, seg, seg / 2),
      new THREE.MeshBasicMaterial({
        color: 0x123a58, transparent: true, opacity: 0.04,
        depthWrite: false, side: THREE.FrontSide
      })
    );
    scene.add(shell);

    // 矢量经纬网：保留球面朝向感（没有它，转动地球时判断不出转到哪了）
    gridGroup = new THREE.Group();
    var gR = R * 1.003;
    var gmat = new THREE.LineBasicMaterial({
      color: 0x86bad8, transparent: true, opacity: 0.2
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
      mat.color.setHex(0x8fb4cc);      // 纯色兜底：不白屏、不中断
      mat.needsUpdate = true;
    }
    if (!src) { fallback(); return; }
    try {
      new THREE.TextureLoader().load(src, function (tex) {
        if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = quality ? 4 : 1;
        mat.map = tex;
        mat.color.setHex(0xffffff);    // 原色：贴图不再叠冷蓝
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
        '  gl_FragColor = vec4(0.84, 0.92, 1.0, (1.0 - d * 2.0) * 0.9);',
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
      uniforms: { uColor: { value: new THREE.Color(0x86d8f8) }, uInt: { value: 1.0 } },
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
   * 光点要表达四件事，且必须一眼可读：
   *   ① 繁盛程度 —— 等级 1..5 → 尺寸与亮度（同一色相上提亮）
   *   ② 是否在我的网络里 —— 已通航的城多一圈橙黄定位环
   *   ③ 是否已被竞对占领（我不通航）—— 套一圈紫罗兰细环（与竞对弧线同色，要看得清）
   *   ④ 是否我的基地 —— 基地尺寸额外加成 + 最亮色
   *
   * 为什么把「等级」和「归属」分成尺寸与环两个通道：
   * 若都用颜色表达，「亮」既可能是「高等级」也可能是「已通航」，玩家分不清。
   * 尺寸管发展度（连续信息，看大小），环管归属（离散信息，看有无），互不干扰。
   * 归属再分两档色相：**橙黄环 = 我的网络**、**紫罗兰环 = 只有竞对** —— 两档都要看得清，
   * 区分归属的是色相而不是亮度（把对手画暗等于不画，见色板注释的三次修订）。
   * 色相只承担一件事：把城市从地球贴图里拎出来（见 PALETTE 注释）。
   * ⚠ 竞对环只在「我未通航」时才画 —— 同一座城两种环叠在一起会互相抵消，也读不出优先级。
   *
   * 视觉语言（2026-09-28 对齐 world-food-atlas 的「点 + 光晕 + 细环」）：
   *   ① 柔光光晕（TEX.halo / cityHaloTex）—— 最外一层软光，跟着城市色走，
   *      让每个点在暗夜球面上「晕」开一小圈，不再是硬贴上去的一粒白；
   *   ② 实心小圆点（TEX.dot / cityMarkTex）—— 亮核，一眼认出是个「点」；
   *   ③ 已通航细环（TEX.markRing / markRingTex）—— 柔化渐变的一圈，套在光晕之上。
   * ⚠ 三层一律 depthTest:false：标记是屏幕空间 billboard，贴到球面边缘时外缘会落到
   *   曲面「后方」被地球深度剪掉（＝光圈陷进地球）。改由 syncCities 逐帧背面剔除
   *   兜底，与 world-food-atlas 的做法一致。
   * 三个信息通道原样保留；装饰元素仍不做刻度、不做缺口。 */

  var CITY_VS = [
    'attribute float aSize;',
    'attribute float aAlpha;',
    'attribute vec3 aColor;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'uniform float uScale;',
    'uniform float uSizeMul;',       // 层尺寸倍数：城市点/环为 1，光晕层放大
    'void main(){',
    '  vColor = aColor; vAlpha = aAlpha;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * uSizeMul * uScale / max(0.001, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var CITY_FS = [
    'uniform sampler2D uTex;',
    'uniform float uAlphaMul;',      // 层透明度倍数：光晕层压低，点/环为 1
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main(){',
    '  vec4 t = texture2D(uTex, gl_PointCoord);',
    '  gl_FragColor = vec4(vColor, 1.0) * t * vAlpha * uAlphaMul;',
    '  if (gl_FragColor.a < 0.01) discard;',
    '}'
  ].join('\n');

  var RING_MUL = 1.5;           // 定位环直径 / 城市符号直径
  /* ⚠ 符号精简成小圆点后，可见的点核只占符号的 ~0.24，环落在 0.35×RING_MUL：
   *   1.5 → 0.53，点与环之间留出约 0.3 倍半径的空当，读作「点 + 一圈细环」。 */
  /* 柔光光晕层（对齐 world-food-atlas 的 haloTex）：与城市共用几何，只把贴图换成软光、
   *   尺寸倍数放大、整体透明度压低 —— 于是每个点外围都有一圈淡淡的柔光，
   *   亮度自动跟随城市色（未通航冰青 / 已通航橙黄），不额外开信息通道。
   * ⚠ HALO_ALPHA 压到 0.38：光晕峰值 × 色亮度 ≈ 0.3，落在 bloom 阈值 0.72 之下，
   *   不会像早先的宽柔光那样被 bloom 拉成一团白雾。 */
  var HALO_MUL = 1.6;           // 光晕层直径 / 城市符号直径
  var HALO_ALPHA = 0.38;        // 光晕层整体透明度

  function buildCities(state) {
    var n = state.cities.length;
    var ringRgb = hexToRgb(PALETTE.mineHex);
    cityPos = new Float32Array(n * 3);
    cityColor = new Float32Array(n * 3);
    citySize = new Float32Array(n);
    cityAlpha = new Float32Array(n);
    cityLevel = new Float32Array(n);
    cityRinged = new Float32Array(n);
    cityRingTone = new Float32Array(n);
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
      /* 环取「归属」色，不再是纯白。两档：
       *   · 我的网络 → 橙黄（暖）
       *   · 仅竞对   → 紫罗兰（PALETTE.rivalHex，与竞对弧线同一支色）
       * 白环叠加 additive + bloom 会直接烧成高亮白圈，既刺眼又像 UI 准星；
       * 暖/紫两档色相在深蓝海洋上拉得很开，读起来是「谁的网络轮廓」而不是贴上去的标记。
       * ⚠ 实际颜色由 syncCities 按 status 逐帧改（城市可能从「仅竞对」变成「我的」）。 */
      ringColor[i * 3] = ringRgb[0]; ringColor[i * 3 + 1] = ringRgb[1]; ringColor[i * 3 + 2] = ringRgb[2];

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
      /* -1 = 尚未判定过环色。用 -1 而不是 0（0 是「我的网络」），
       * 保证首帧 syncCities 一定写一遍环色，不必依赖 buildCities 里填的默认值。 */
      cityRingTone[i] = -1;
    });

    cityGeom = new THREE.BufferGeometry();
    cityGeom.setAttribute('position', new THREE.BufferAttribute(cityPos, 3));
    cityGeom.setAttribute('aColor', new THREE.BufferAttribute(cityColor, 3));
    cityGeom.setAttribute('aSize', new THREE.BufferAttribute(citySize, 1));
    cityGeom.setAttribute('aAlpha', new THREE.BufferAttribute(cityAlpha, 1));

    var mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: TEX.dot }, uScale: { value: 400 },
                  uSizeMul: { value: 1 }, uAlphaMul: { value: 1 } },
      vertexShader: CITY_VS, fragmentShader: CITY_FS,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    cityPoints = new THREE.Points(cityGeom, mat);
    scene.add(cityPoints);

    /* 柔光光晕：与城市共用几何 —— 位置、颜色、尺寸、透明度全跟着城市走，
     * 只把材质换成软光贴图、尺寸倍数放大、整体透明度压低，故无需单独维护属性。
     * renderOrder=-1：让光晕先画，点核再压在中间（加性混合下顺序不影响颜色，
     * 但这样在观感调试时更符合「光晕在点后面」的直觉）。
     * ⚠ depthTest:false（城市三层都关）：光晕比点大 1.6 倍，城市转到球体边缘时，
     *   光晕外缘在 3D 空间落到地球曲面「后方」，被地球的深度缓冲剪掉 ——
     *   看上去就是「光圈陷进地球里面」。关掉深度测试后改由 syncCities 的
     *   背面剔除兜底（背对相机的城市 alpha 收 0，不会透穿地球）；
     *   这也是 world-food-atlas 的做法：标记一律 depthTest:false + 朝相机判定。 */
    var hmat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: TEX.halo }, uScale: { value: 400 },
                  uSizeMul: { value: HALO_MUL }, uAlphaMul: { value: HALO_ALPHA } },
      vertexShader: CITY_VS, fragmentShader: CITY_FS,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    haloPoints = new THREE.Points(cityGeom, hmat);
    haloPoints.renderOrder = -1;
    scene.add(haloPoints);

    ringGeom = new THREE.BufferGeometry();
    ringGeom.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    ringGeom.setAttribute('aColor', new THREE.BufferAttribute(ringColor, 3));
    ringGeom.setAttribute('aSize', new THREE.BufferAttribute(ringSize, 1));
    ringGeom.setAttribute('aAlpha', new THREE.BufferAttribute(ringAlpha, 1));
    var rmat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: TEX.markRing }, uScale: { value: 400 },
                  uSizeMul: { value: 1 }, uAlphaMul: { value: 1 } },
      vertexShader: CITY_VS, fragmentShader: CITY_FS,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    ringPoints = new THREE.Points(ringGeom, rmat);
    scene.add(ringPoints);
  }

  // 点大小随画布高度缩放，保证不同分辨率下城市光点视觉尺寸一致
  function syncPointScale() {
    var h = (renderer ? renderer.domElement.height : global.innerHeight) || 800;
    if (cityPoints) cityPoints.material.uniforms.uScale.value = h * 0.5;
    if (haloPoints) haloPoints.material.uniforms.uScale.value = h * 0.5;
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

  /* 判断某城是否「仅被竞对通航」（我不通航，但至少一家存活竞对有航线）。
   * 与 cityConnected 对称，只是查 state.rivals[].routes。
   * ⚠ 调用处一律写成 `!connected && cityRivaled(...)`（短路在前）：
   *   我自己的城优先，不必再扫一遍竞对，省掉一半比较。
   * 代价量级与 cityConnected 相同（24 城 × 6 家 × ~15 条 ≈ 2160 次/帧），可忽略；
   * 换来的是「竞对刚开线、冷环立刻出现」。 */
  function cityRivaled(state, cityId) {
    for (var i = 0; i < state.rivals.length; i++) {
      var rv = state.rivals[i];
      if (!rv.alive) continue;                       // 已退市的竞对不算占位
      for (var j = 0; j < rv.routes.length; j++) {
        var r = rv.routes[j];
        if (r.a === cityId || r.b === cityId) return true;
      }
    }
    return false;
  }

  var CITY_PULSE_SEC = 0.6;

  function syncCities(state, dt) {
    if (!cityGeom) return;
    var dirty = false, sizeDirty = false, colorDirty = false;
    var rDirty = false, rSizeDirty = false, rColorDirty = false, aDirty = false;
    var decay = (dt > 0) ? dt / CITY_PULSE_SEC : 0;

    /* 背面剔除（城市三层关掉 depthTest 后必须自己做）：
     * 球面上某点「可见」的判据是 dot(法线, 相机方向) ≥ R/|相机| —— 相机越近，可见的球面盖越小。
     * 城市法线就是它的位置方向。早先靠地球的深度遮挡背面城市，现在逐帧把背对相机的城市
     * alpha 收回 0（点、光晕、环一起），免得透穿地球 —— 与 world-food-atlas 的 refreshMarkers
     * 同路数。在可见边界两侧留 0.08 的软过渡，转球时城市不会在边缘「啪」地闪一下。 */
    if (!_pn) { _pv = new THREE.Vector3(); _pn = new THREE.Vector3(); _cd = new THREE.Vector3(); }
    var hasCam = !!(camera && camera.position.lengthSq() > 1e-6);
    var camSil = 0;
    if (hasCam) { _cd.copy(camera.position).normalize(); camSil = R / camera.position.length(); }

    for (var i = 0; i < state.cities.length; i++) {
      var c = state.cities[i];

      // 朝向系数：可见边界（dot = camSil）处 0.5，边界内 0.08 淡入到 1，边界外淡出到 0
      var face = 1;
      if (hasCam) {
        _pn.set(cityPos[i * 3], cityPos[i * 3 + 1], cityPos[i * 3 + 2]).normalize();
        face = (_pn.dot(_cd) - camSil) / 0.08 + 0.5;
        if (face < 0) face = 0; else if (face > 1) face = 1;
      }
      if (Math.abs(cityAlpha[i] - face) > 1e-3) { cityAlpha[i] = face; aDirty = true; }

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
      /* 环的归属：0 = 我的网络（橙黄）、1 = 仅竞对（紫罗兰）、-1 = 无环。
       * ⚠ 「仅竞对」必须排除我已通航的城：同一座城叠两种环既互相抵消，也读不出优先级。
       * 竞对航线在面板里看不到，这圈紫环是玩家唯一能「看出竞对铺到哪了」的通道 ——
       * 因此它与我的橙黄环同尺寸、亮度相近，只靠**色相**归属，不靠「谁更暗」。 */
      var tone;
      if (connected) tone = 0;
      else tone = cityRivaled(state, c.id) ? 1 : -1;
      if (cityRingTone[i] !== tone) {
        cityRingTone[i] = tone;
        // 无环时色值无所谓（alpha=0），仍写回我的橙黄，保持缓冲内容确定
        var rc = hexToRgb(tone === 1 ? PALETTE.rivalHex : PALETTE.mineHex);
        ringColor[i * 3] = rc[0]; ringColor[i * 3 + 1] = rc[1]; ringColor[i * 3 + 2] = rc[2];
        rColorDirty = true;
      }
      var ringed = tone >= 0 ? 1 : 0;
      if (cityRinged[i] !== ringed) { cityRinged[i] = ringed; rDirty = true; }

      // 尺寸：等级 1..5 → 0.72 / 0.88 / 1.0 / 1.16 / 1.34 倍基准；基地额外 1.25 倍
      var lvMul = [0, 0.72, 0.88, 1.0, 1.16, 1.34][lv];
      var s = cityBaseSize[i] * lvMul * (c.isHome ? 1.25 : 1);
      if (p > 0) s *= (1 + 0.45 * p);
      if (Math.abs(citySize[i] - s) > 1e-6) { citySize[i] = s; sizeDirty = true; }

      /* 颜色：基地 > 已通航 > 未通航。已通航的城在橙黄上叠等级亮度（发展可视），
       * 未通航统一冰青 —— 待开拓的地图上不该出现「我还没去过的城」的高亮橙黄。 */
      var col;
      if (c.isHome) col = PALETTE.homeHex;
      else if (connected) col = PALETTE.mineHex;
      else col = PALETTE.virginHex;

      var cr = hexToRgb(col);
      /* 等级对「我的城市」施加亮度增益：⚠ 上限 1.0 是硬约束，不是随便定的 ——
       * 橙黄 0xffc76b 的 luma 已达 0.80，乘 1.0 仍在 bloom 阈值 0.86 之下；
       * 沿用旧暖金公式（最高 1.22）会冲到 0.98，点核被 bloom 拉成白点、橙黄被烧掉。
       * 未通航城市不受等级影响 —— 它们本来就该是均匀的背景色，
       * 否则地图上会出现一堆高亮的「我还没去过的城」，误导玩家以为已经有网络覆盖。 */
      var g = 1;
      if (c.isHome) g = 0.96 + (lv - 3) * 0.02;
      else if (connected) g = 0.74 + lv * 0.052;
      if (p > 0) g *= (1 + 1.6 * p);

      if (lvChanged || colorDirty || Math.abs(cityColor[i * 3] - cr[0] * g) > 1e-6) {
        cityColor[i * 3] = cr[0] * g;
        cityColor[i * 3 + 1] = cr[1] * g;
        cityColor[i * 3 + 2] = cr[2] * g;
        colorDirty = true;
      }

      /* 环透明度：两档都要求「看得清」，归属靠**色相**区分，不再靠亮度压差。
       * 我的环随等级上升（大城更醒目）；竞对环给固定 0.65，与我的最低档（0.49）同量级 ——
       * 玩家在决定往哪扩张之前，必须看清竞对已经铺到哪了（见色板注释的三次修订）。
       * 上限压到 0.9/0.85：环是加性混合，再叠满亮度会被 bloom 拉出一圈光边。
       * 竞对环有效 luma ≈ 0.65 × 0.647 ≈ 0.42，仍远在阈值 0.86 之下。 */
      var ra = 0;
      if (tone === 0) ra = c.isHome ? 0.9 : (0.40 + lv * 0.09);
      else if (tone === 1) ra = 0.65;
      if (p > 0) ra = Math.min(1.4, ra * (1 + 1.5 * p));
      ra *= face;                       // 背面城市连环一起收掉，否则环会透穿地球
      if (Math.abs(ringAlpha[i] - ra) > 1e-6) { ringAlpha[i] = ra; rDirty = true; }
      var rs = s * RING_MUL;
      if (Math.abs(ringSize[i] - rs) > 1e-6) { ringSize[i] = rs; rSizeDirty = true; }
    }

    if (colorDirty) cityGeom.getAttribute('aColor').needsUpdate = true;
    if (sizeDirty) cityGeom.getAttribute('aSize').needsUpdate = true;
    if (aDirty) cityGeom.getAttribute('aAlpha').needsUpdate = true;
    if (rDirty) ringGeom.getAttribute('aAlpha').needsUpdate = true;
    if (rColorDirty) ringGeom.getAttribute('aColor').needsUpdate = true;
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
      wanted.push({ key: r.key, a: r.a, b: r.b, owner: 'mine', glow: !!arcGlow[r.key],
                    color: state.airlineColor });
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
        wanted.push({ key: key, a: rr.a, b: rr.b, owner: 'rival', glow: false,
                      color: rv.color });
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
      var col;
      if (w.glow) {
        /* 开航瞬间：先闪一道比任何归属色都亮的暖白，随后落回该航司的识别色 */
        col = hexToRgb(PALETTE.arcOpen);
      } else if (w.owner === 'mine') {
        col = toneRgb(w.color, PALETTE.arcMine, ARC_TINT);
      } else {
        col = toneRgb(w.color, PALETTE.arcRival, ARC_TINT);
      }
      // 我的航线抬得更高 —— 这是「谁是主角」的空间线索（主次不再靠压暗竞对来表达）
      var lift = w.owner === 'mine' ? 0.035 : 0.018;
      writeArc(i, c, c2, col, lift);
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
          /* 客机与它飞的航线同色（2026-09-30）：客机是「骑在这条线上」的亮点，
           * 若线与点在颜色上分家，读者会以为是两套信息。 */
          c: toneRgb(state.airlineColor, PALETTE.planeMine, PLANE_TINT)
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
          c: toneRgb(rv.color, PALETTE.planeRival, PLANE_TINT)
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

      col = _color.setRGB(p.c[0], p.c[1], p.c[2]);
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

  /* ⚠ depthTest:false —— 扩散环比地球大得多（开航环直径 0.75 世界单位，球半径才 1.6）：
   *   它的外缘在 3D 空间上落到球面「后方」，开着深度测试就会被地球的深度缓冲剪掉半圈，
   *   看上去正是「光圈跑到地球底下去了」。这与城市三层是同一个坑（见 buildCities 注释），
   *   这里的特效精灵当初漏了。关掉深度测试后，背对相机的光环改由 pumpFx 逐帧朝向剔除兜底，
   *   否则球背面的环会透穿地球。 */
  function buildFxPool() {
    fxPool.length = 0;
    ringPool.length = 0;
    for (var i = 0; i < FX_POOL; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.flash, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      sp.visible = false;
      scene.add(sp);
      fxPool.push({ sp: sp, t: -1, dur: 1.4, lat: 0, lon: 0 });
    }
    for (var j = 0; j < RING_POOL; j++) {
      var m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.ring, transparent: true, depthWrite: false, depthTest: false,
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

    /* 背面剔除：特效精灵都关了 depthTest，必须自己判朝向，否则球背面的环/闪会透穿地球。
     * 判据与 syncCities 逐字一致 —— 法线就是位置方向，可见边界 dot = R/|相机|。 */
    if (!_cd) { _pv = new THREE.Vector3(); _pn = new THREE.Vector3(); _cd = new THREE.Vector3(); }
    var hasCam = !!(camera && camera.position.lengthSq() > 1e-6);
    var camSil = 0;
    if (hasCam) { _cd.copy(camera.position).normalize(); camSil = R / camera.position.length(); }

    // 推进闪光
    for (var i = 0; i < fxPool.length; i++) {
      var f = fxPool[i];
      if (f.t < 0) continue;
      f.t += dt;
      var u = f.t / f.dur;
      if (u >= 1) { f.t = -1; f.sp.visible = false; continue; }
      var v = G.ll2v(f.lat, f.lon, R * (CITY_LIFT + 0.01));
      var fa = faceAt(v, hasCam, camSil);
      if (fa <= 0) { f.sp.visible = false; continue; }
      f.sp.position.set(v.x, v.y, v.z);
      f.sp.scale.setScalar(0.10 + u * 0.32);
      f.sp.material.opacity = (1 - u) * 0.85 * fa;
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
      var fa2 = faceAt(v2, hasCam, camSil);
      if (fa2 <= 0) { rr.sp.visible = false; continue; }
      rr.sp.position.set(v2.x, v2.y, v2.z);
      var sc = rr.scale0 + (rr.scale1 - rr.scale0) * (1 - Math.pow(1 - u2, 2.2));
      rr.sp.scale.setScalar(sc);
      // 先亮后灭：环扩散时逐渐透明，形成「涟漪」感
      rr.sp.material.opacity = (1 - u2) * (1 - u2) * 0.9 * fa2;
      rr.sp.visible = true;
    }
  }

  /* 朝向系数：可见边界（dot = R/|相机|）处 0.5，往内 0.08 淡入到 1、往外淡出到 0。
   * v 是球面上的点（长度≈R），故先归一化再与相机方向点乘。 */
  function faceAt(v, hasCam, camSil) {
    if (!hasCam) return 1;
    var ln = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (ln < 1e-6) return 1;
    var d = (v.x * _cd.x + v.y * _cd.y + v.z * _cd.z) / ln;
    var face = (d - camSil) / 0.08 + 0.5;
    return face < 0 ? 0 : (face > 1 ? 1 : face);
  }

  /* ───────────────────────── 后处理 bloom ─────────────────────────
   * 与 defcon 同一套（手写，不依赖 three 的 EffectComposer —— r149 的 examples
   * 不在 three.min.js 里，引进来要额外打包）。三段式：亮部提取 → 两轮可分离高斯 → 叠加。
   * 阈值取 0.86：**这是「过曝」的第二处闸门**。ACES 曲线把球面亮部（极地冰盖、沙漠）
   *   滚降到 0.85~0.9，若阈值仍是 0.72，这些区域会被亮部提取 → 高斯模糊 → 叠加回来，
   *   在已经接近满值的地表上再加一层 → 直接顶到 255、纹理糊成一片白（实测正是如此）。
   *   抬到 0.86 后地表基本不参与泛光，而城市光核 / 航线辉光 / 开航闪光按设计都在 0.9 以上
   *   （且 8bit 中间缓冲把它们钳在 1.0），该亮的地方照样发光。 */

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
    '  float k = smoothstep(0.86, 1.0, l);',
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
    /* 线性 → sRGB：与 three 的 outputEncoding = sRGBEncoding 同一套分段传输函数。
     * ⚠ 这一句才是「又亮、又不过曝」的关键，也是本轮过曝的真正根因：
     *   中间缓冲 rtScene 是**线性**的，而合成着色器此前直接把这些线性值当 8bit 输出
     *   ——没有 gamma 编码。于是线性 0.15（地表陆地）只显示成 38/255，整球发暗；
     *   唯一的「提亮」手段就只剩加大光照，而光照一加，冰盖（albedo≈1）必然顶成一片纯白。
     *   补上编码后：陆地 0.15 → 0.42（108/255）看得见，冰盖 0.87 → 0.94 几乎不涨 ——
     *   中调抬起来、亮部不溢出，正是 vibeknow/earth-3d 直出 canvas 时天然得到的曲线。 */
    'vec3 lin2srgb(vec3 c){',
    '  vec3 lo = c * 12.92;',
    '  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;',
    '  return mix(lo, hi, step(vec3(0.0031308), c));',
    '}',
    'void main(){',
    '  vec3 c = texture2D(tScene, vUv).rgb;',
    '  vec3 b = texture2D(tBloom, vUv).rgb;',
    '  gl_FragColor = vec4(lin2srgb(clamp(c + b * uStrength, 0.0, 1.0)), 1.0);',
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
    /* 曝光曲线：对齐 vibeknow/earth-3d 的原始配方 —— ACES 胶片曲线（含 1.08 曝光）。
     * ⚠ 这是「过曝」的正解：没有它时，环境光一提亮，极地冰盖/沙漠这些本来就亮的贴图区域
     *   直接顶到 255 被硬切（实测 p99=255、5.6% 画面过曝）；ACES 让高光滚降（roll-off），
     *   亮部保持在 250 以下的同时中调反而更通透。
     * 能力检测而非版本判断（基线 Chrome 61）。 */
    if (THREE.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d2942);
    /* ⚠ 上面这行色值是在「合成不做 gamma 编码」的年代定的，现在合成补上了 sRGB 编码，
     * 若还传原始 sRGB 值，天空会被再编码一次而变亮（0d2942 → 约 41718d）。
     * 先转到线性，让它在编码后还原成原本的深空蓝。 */
    if (scene.background.convertSRGBToLinear) scene.background.convertSRGBToLinear();
    camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 5000);
    clock = new THREE.Clock();

    /* 光照：对齐 vibeknow/earth-3d 的原始配方 —— 冷而弱的环境光 + 一盏主导的**暖**主光，
     * 昼夜交界由主光自然形成，而不是拿大面积环境光把整颗球「泛白」。
     * ⚠ 上一版过曝的根因就在这里：环境光 0x9db8cc×4.0（又亮又中性）+ 主光 2.4 叠加后，
     *   本来就亮的贴图区域（极地冰盖、沙漠）直接顶到 255 被硬切。
     * earth-3d 原值：环境 0x223044×0.5、暖光 0xfff2d0×2.4（那边是点光，这里用平行光）。
     * 三盏灯的强度是「ACES 已生效」前提下配的，想整体再加亮就抬 exposure（见 renderer 初始化）。 */
    scene.add(new THREE.AmbientLight(0x223044, 2.6));
    var key = new THREE.DirectionalLight(0xfff2d0, 3.0);
    key.position.set(4, 3, 5);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x4aa8d6, 0.8);
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
