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
 *   · 已通航城市 = **实心盘 + 橙黄定位环**（你的网络）；未通航的城 = 冰青点 +
 *     **虚线圆**，其中竞对已通航的套紫罗兰双环（虚线圆更大更亮）
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
  /* 夜面城市灯光球壳的离地高度。
   * ⚠ 取 1.002 而非与航线相同的 1.004：两层都是加性混合、都不写深度，
   *   共面虽不会 z-fight（不写深度就不比深度），但把夜壳略微压到航线之下，
   *   观感上更符合「灯火贴在地表、航线浮在其上」的层次。 */
  var NIGHT_LIFT = 1.002;
  /* 夜面压暗壳的离地高度。比灯光壳再低一档 —— 两者都不写深度、不会 z-fight，
   * 错开只是为了让绘制顺序与视觉层次（先压暗、再点灯）在半径上也成立。 */
  var NIGHT_DIM_LIFT = 1.0008;
  /* 夜面灯火的颜色 —— 低彩度冷白。
   *
   * ⚠ 2026-10-09 从暖金 0xfff2e0 改过来，原因不是审美，是**信息可读性**：
   *   暖金的色相 34.8°，而我通航城市 / 基地 / 航线回落色 / 客机回落色分别是
   *   37.3° / 38.3° / 41.6° / 45.4°，连新航的航司色都是 36.0° —— 六个暖色要素
   *   全挤在 11° 以内，夜面上「哪里是灯火」与「哪里是我的网络」根本读不出归属
   *   （实机：灯火中段把标记的视差 ΔE 压到 5.1，核心处归零）。
   *   改冷白之后本作多了一条能写进文档、也能被断言覆盖的规则：
   *     **夜面上唯一有彩度的东西就是信息**（橙黄=我的 / 冰青=未通航 / 紫罗兰=竞对），
   *     灯火只贡献亮度。
   * ⚠ 色相只由这一个值决定：灯火壳的片元着色器取的是贴图的 max(r,g,b)（＝亮度），
   *   贴图本身偏不偏黄完全不参与着色，所以改色**不需要**重跑贴图生成链路。
   * 值取 0xe6ecf6（色相 ≈218°、最大通道差仅 16/255）：与冰青 0x2fc4ff 的彩度比约 1:13，
   *   不会被读成「未通航」；同时与深蓝夜面同温，不再是夜面上唯一的暖色孤岛。 */
  var NIGHT_TINT = 0xe6ecf6;

  /* 夜面灯火的整体增益。⚠ 它作用在**软膝之前**：低段（灯火主体）按它放大，
   *   增益后的高段被 NIGHT_SOFT_KNEE 压住 —— 这正是「保留中低段、只压顶部」的分工。
   *
   * ⚠ 实测这个参数主要削的是**弥漫的雾状光场**（灯火贴图的大半径 glow），
   *   而城市核心的亮度几乎不动 —— 因为核心早就被软膝顶到上界了：
   *     gain   1.0    1.4    1.6    1.9    2.4
   *     峰值  0.387  0.404  0.409  0.419  0.424   （变化仅 ±4%）
   *     光场  0.019  0.023  0.025  0.030  0.033   （变化 ±40%）
   *   而「雾」正是吃掉城市标记对比度的那部分（实测 gain 1.0→2.4 时，
   *   标记的对比度保留率从 0.82 掉到 0.70）。故取 1.6：核心仍然醒目，
   *   雾收到标记读得清的程度。 */
  var NIGHT_GAIN = 1.6;

  /* 灯火亮度的软膝压缩 —— 消掉「纯白斑」的手段。⚠ 它作用在 uGain **之后**的值上。
   *
   * ⚠ 为什么必须压：贴图峰值 luma = 1.00，而实测 **29 个航点里有 22 个**的 5×5 峰值
   *   > 0.70、16 个 > 0.86 —— 也就是绝大多数机场正好压在灯火最亮的像素上。
   *   旧配方 gain 1.9 × 0.88 ≈ 1.67，而 rtScene 是 8bit，超过 1 就被截断成纯白：
   *   城市点叠上去的 ΔE 直接归零（模拟：灯火核心 (1,1,1) 叠橙黄 → (1,1,1)，ΔE 0.0；
   *   叠冰青也一样）。实拍佐证：夜面亮度 >0.90 的像素占比是关灯时的 **11 倍**。
   *
   * ⚠ 为什么不能用「整体乘一个小系数」压：那会把中低段灯火一起压没。贴图是极端
   *   高对比的 —— 非黑像素里 P99 = 0.945，而 P50 只有 0.047。所以要保留中低段、
   *   只压顶部，用软膝（x = 增益后的亮度）：
   *     f(x) = KNEE + (x-KNEE) / (1 + K·(x-KNEE))     (x ≥ KNEE)
   *   渐近上界 = KNEE + 1/K = 0.18 + 1/3.6 ≈ **0.458** —— 数学上不可能截断。
   *   KNEE 以下逐像素不变（k = 0 时 f(x) = x），暗灯火不被牺牲。
   * 标定结果：峰值 1.90 → 0.419（× 冷白最大通道 0.965 → 0.404 线性 → 显示 0.66），
   *   夜面不再有纯白斑，而航点周围留出了足够的亮度余量给城市点。 */
  var NIGHT_SOFT_KNEE = 0.18;
  var NIGHT_SOFT_K = 3.6;

  /* 夜面经纬网的亮度保留比。
   * ⚠ 经纬网是 transparent + 默认 renderOrder 的 Line，排在夜面压暗壳（−3）之后绘制，
   *   所以它此前**根本没被压暗** —— 夜面上最亮的元素之一就是那几圈网格线，
   *   与灯火、城市点抢注意力（压暗壳的旧注释声称「经纬网也一起压暗」，与实现不符）。
   *   太阳方向在开局由真实时间决定（src/solar.js），但**整局不再移动**，所以可以把
   *   晨昏线烘进顶点色：建几何时烘一次，之后每次 setSunDir() 重烘一次，仍零每帧成本。
   *   ⚠ 正因为它是烘焙而非每帧着色，setSunDir() 里**必须**调 rebakeGridNight()，
   *   否则改了太阳方向而经纬网的明暗还停在旧晨昏线上（五处消费点漏掉这一处最隐蔽）。
   * ⚠ 保留 0.28 而不是 0：网格线存在的意义就是「转动地球时判断不出转到哪了」
   *   （见 buildGlobe 的注释），夜面全黑等于把夜半球的朝向参照一起删掉。
   *   压到 0.28 是「不再抢戏、但仍能读」。 */
  var GRID_NIGHT = 0.28;

  /* 夜面压暗系数：夜面片元乘 (1 − 该值 × night)。0 = 不压暗，1 = 夜面全黑。
   *
   * ⚠ 为什么要单独压暗，而不是「把环境光调低」——这是本轮标定最重要的一个发现：
   *   实测把 AmbientLight 从 2.6 一路降到 0.25（降 90%），夜面屏幕上只从 0.195 掉到 0.152。
   *   原因是渲染管线的 sRGB 编码：夜面的**线性**亮度本就极低（≈0.03），
   *   而编码是 pow(x, 1/2.2) —— 0.03 被抬到 0.20，0.006 仍被抬到 0.09。
   *   低值区在编码后被整体抬离黑色，所以「调灯」这条路对夜面几乎无效，
   *   必须显式乘一个压暗系数，把线性值压到编码也抬不起来的量级。
   * 另一个好处：压暗只作用在夜面（乘 night 因子），阳面**逐像素不变**——
   *   不必为了「夜更黑」去牺牲玩家已经熟悉的白昼观感。 */
  var NIGHT_DIM = 0.92;

  /* 主光（太阳）方向 —— 全世界只此一处真源。
   * ⚠ 夜面灯光的晨昏线必须与球体的明暗分界**严丝合缝**：只要两处各写一份坐标，
   *   迟早会出现「白天那半边也亮着灯」或「晨昏线错开一段」的静默走样
   *   （两者都不报错，只是看着别扭）。故 key 光位置与夜壳 uSun 共用这个数组。
   *
   * ⚠ 2026-10-09 起这个方向不再写死，改由 src/solar.js 按**本机真实时间**
   *   算出日下点、再经 AT.geo.ll2v 转成球面向量。这里保留的 [4, 3, 5] 只是
   *   **回退值**（等价于历史上那个固定机位：直射点 25.1°N / 128.7°E）——
   *   solar.js 一旦解析异常就会退回它，保证球体不会整个变黑或整个变亮。
   *   改动这个方向请走 setSunDir()，不要直接改数组元素：四层壳与经纬网顶点色
   *   都需要跟着重算，只改数组会让它们各自停在旧位置（静默错开）。 */
  var SUN_DIR = (AT.solar && AT.solar.FALLBACK_SUN_DIR
    ? AT.solar.FALLBACK_SUN_DIR.slice() : [4, 3, 5]);

  /* 三盏灯的强度（2026-10-09 昼夜重定的唯一可调面）。
   *   amb —— 环境光，决定夜面的**底色**；
   *   key —— 暖主光，决定阳面的亮度与晨昏线的陡峭程度；
   *   rim —— 冷补光，从**主光反方向**打（= 正对夜面），作用只是把球体轮廓
   *          从深空底里勾出来，不能当第二盏照明的灯用。
   *
   * ⚠ 这里保持 2026-09-28 定下的原值不动：夜面变暗改由 buildNightLights 的
   *   **夜面压暗壳**负责（原因见 NIGHT_DIM 的注释 —— 调灯对夜面几乎无效，
   *   且会连带动到白昼面）。三盏灯与 exposure 1.15 是一组，单改其一都会失衡。 */
  var LIGHT = { key: 3.0, amb: 2.6, rim: 0.8 };

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
   *      2026-10-09：未通航的城在冰青点**外加一圈虚线圆**（见 cityRingTex），
   *      「实线 / 虚线」的形制对立与色相差一起承担归属辨识，抗环境压淡。
   *   ③ **竞对独飞的城**（我不通航、但至少一家竞对有航线）—— 紫罗兰（rivalHex，
   *      与竞对弧线同一支色）**双环**：内圈实线细环 + 外圈更大的虚线圆。这一套是玩家唯一能
   *      「看出竞对铺到哪了」的通道（竞对航线不进任何面板），所以它必须看得清 ——
   *      2026-10-09 按用户要求再加强：实线环 alpha 0.65 → 0.85，外圈虚线圆放大到 1.9 倍。
   *   ④ 亮度必须压在 bloom 的高亮阈值之下（POST_BRIGHT_FS 用 luma 0.86 提取亮部）。
   *      橙黄本身 luma 已达 0.80，若仍乘旧公式的 1.22 倍等级增益就会到 0.98，
   *      点核被 bloom 拉成白点、橙黄色相反被烧掉 —— 这正是暖金版老配色翻过的车。
   *      故本版把「已通航」的等级增益重标定为 0.792→1.0（见 syncMarkers），
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

  var api = { ok: false, nightOk: false };
  var renderer, scene, camera, globe, gridGroup;
  var gridGeoms = [];                     // 经纬网几何（读回顶点色做夜面压暗断言用）
  var nightMat = null, nightMesh = null;  // 夜面城市灯光球壳（见 buildNightLights）
  var dimMat = null, dimMesh = null;      // 夜面压暗球壳（见 buildNightLights）
  /* 主光与冷补光。提到模块级是因为太阳方向可变（见 setSunDir）——
   * 光的位置必须跟着太阳一起挪，否则「球体的明暗分界」与「夜壳的晨昏线」
   * 会错开，而这不会报错。 */
  var keyLight = null, rimLight = null;
  /* 太阳方向的临时向量（setSunDir 里 copy 给两个壳的共享 uniform）。
   * 延迟创建，避免模块加载期就 new THREE 对象。 */
  var _sunVec = null;
  /* 上一次按真实时间应用太阳的时刻（null = 还没应用过，仍是回退常量）。 */
  var sunAppliedAt = null;
  /* 开局时玩家的基地是否落在夜面（真实时间下约有一半概率）。UI 据此提示。 */
  var openAtNight = false;
  /* 城市标记点：Sprite 四层（contour 描边 / halo 光晕 / core 核心 / ring 虚线环），
   * 形制对齐 vibeknow/nobel-atlas 的 buildMarkers。每城一个 Group 挂在球面 R*CITY_LIFT，
   * 逐帧 syncMarkers 按归属/等级/脉冲/背面剔除调颜色与尺寸。
   * ⚠ 2026-10-09 从 Points 点云三层（实心盘/实线环/虚线圆 + 加性混合）改为 Sprite 四层
   *   （NormalBlending），复刻 nobel-atlas 的「发光图钉」视觉：深色描边 + 暖色光晕 +
   *   白色实心核 + 自转虚线环。归属（基地/已通航/仅竞对/未通航）靠颜色 + ring 透明度区分。 */
  var markerGroup, markers = [];
  var arcLines, arcGeom, arcPos, arcCol;  // 合批的航线线段
  var arcSlots = [];                      // { key, a, b, order, owner, pts[] } 占位表
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

  /* 程序化径向多色渐变贴图（对齐 nobel-atlas 的 radialStops）。
   * 旧 radialTex 只支持三色，这里支持任意档位的 colorStop 序列。 */
  function radialStops(stops) {
    var s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64), i;
    for (i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    var t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ── 城市标记四层贴图（形制对齐 vibeknow/nobel-atlas）──
   * NormalBlending（非加性）：深色描边 + 暖色光晕 + 白色实心核 + 虚线环，
   * 叠成「发光图钉」。颜色由 SpriteMaterial.color 按归属调制（见 syncMarkers）。 */

  /* contour：深色描边环 —— NormalBlending 下暗色有效，包住光晕给出硬边。 */
  function contourTex() {
    return radialStops([
      [0, 'rgba(3,6,13,0)'], [0.46, 'rgba(3,6,13,0)'], [0.56, 'rgba(3,6,13,.3)'],
      [0.68, 'rgba(3,6,13,.44)'], [0.8, 'rgba(3,6,13,.2)'], [0.92, 'rgba(3,6,13,.04)'], [1, 'rgba(3,6,13,0)']
    ]);
  }

  /* halo：暖白光晕 —— 中心亮向外柔出，给点「发光」感。 */
  function haloTex() {
    return radialStops([
      [0, 'rgba(255,252,246,.96)'], [.16, 'rgba(255,246,230,.78)'], [.34, 'rgba(250,232,204,.4)'],
      [.56, 'rgba(244,214,168,.12)'], [.8, 'rgba(238,204,150,.02)'], [1, 'rgba(236,200,146,0)']
    ]);
  }

  /* core：白色实心核 —— 0→0.7 满白，0.84→1.0 淡出，最亮的一枚点。 */
  function coreTex() {
    return radialStops([
      [0, 'rgba(255,255,255,1)'], [.7, 'rgba(255,255,255,1)'], [.84, 'rgba(255,255,255,.5)'],
      [1, 'rgba(255,255,255,0)']
    ]);
  }

  /* ring：虚线圆环 —— canvas 直绘 setLineDash，配合 SpriteMaterial.rotation 每帧自转，
   * 就是缓慢旋转的「扫描环」（见 syncMarkers）。 */
  function cityRingTex() {
    var s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 7;
    x.setLineDash([13, 8]);
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]);
    var t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* solidRing：实线圆环 —— 与 cityRingTex 同参数但不 setLineDash，
   * 基地城市用此贴图（从虚线变实线），已通航非基地城市也用实线。 */
  function solidRingTex() {
    var s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 7;
    x.beginPath(); x.arc(64, 64, 45, 0, Math.PI * 2); x.stroke();
    var t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
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
    /* 城市标记四层贴图（Sprite，NormalBlending，见 buildMarkers）。 */
    TEX.ring = ringTex();             // 开航波纹（fxPool 用，与城市标记分开）
    TEX.contour = contourTex();
    TEX.halo = haloTex();
    TEX.core = coreTex();
    TEX.cityRing = cityRingTex();
    TEX.solidRing = solidRingTex();
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
  /* 客机提亮量（朝白插值）。2026-10-09 降：原 0.55/0.72 把航司色拉得太白，
   * 六家飞机看起来都是白色、分不出谁是谁。降到 0.32/0.42 让航司识别色
   * （红/橙/绿/蓝/紫/玫红）饱和显现，玩家一眼能认出「哪几架不是我的」。
   * 提亮仍保留：飞机是 0.055 的小点 + AdditiveBlending，完全不提亮会在深色海面上糊掉。 */
  var PLANE_TINT = 0.32;    // 玩家客机提亮量
  /* 竞对客机的额外强调（2026-10-09，用户：其他公司的飞机再明显点）。
   * 本作的客机只有 0.055 世界单位大、又是俯视剪影，混在一堆客机里几乎读不出
   * 「哪几架不是我的」。故竞对客机放大 1.4 倍、提亮量略高于玩家 ——
   * 提亮不破坏航司识别色（色相不变），放大不改变航线走向（只是同一架更显眼）。
   * ⚠ 只放大**竞对**：玩家自己的机队是主角，但已经靠航线更亮、飞得更高区分，
   *   再放大只会让「我的网络」看起来比实际更密。 */
  var PLANE_TINT_RIVAL = 0.42;
  var PLANE_SCALE_RIVAL = 1.4;

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

    /* 矢量经纬网：保留球面朝向感（没有它，转动地球时判断不出转到哪了）
     *
     * ⚠ 顶点色按晨昏线烘焙（2026-10-09）：网格线是 transparent + 默认 renderOrder，
     *   排在夜面压暗壳（−3）之后绘制，所以它此前**根本没被压暗**（压暗壳的旧注释
     *   声称它会被压暗，与实现不符）。故改为把晨昏线烘进顶点色：
     *   夜面保留 GRID_NIGHT 的亮度当朝向参照，阳面逐像素不变（factor = 0）。
     *   用顶点色而不是给材质加着色器，是为了不引入第四条自写着色器链路 ——
     *   网格线只是背景参照，不值得。
     *
     * ⚠ 太阳可变之后，烘焙不能再只在建几何时跑一次：顶点色是**太阳方向的快照**，
     *   太阳一挪，网格的明暗界线就会与夜壳/主光的晨昏线错开。故几何只建一次，
     *   **颜色单独抽成 rebakeGridNight()**，setSunDir() 时重跑（见那边的说明）。 */
    gridGroup = new THREE.Group();
    var gR = R * 1.003;
    var gmat = new THREE.LineBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.2
    });
    var gBase = new THREE.Color(0x86bad8);
    /* 与夜壳 NIGHT_TERM 共用同一条 smoothstep 与同一个太阳方向 —— 两处各写一份
     * 迟早会出现「网格变暗的界线」与「灯火亮起的界线」错开的静默走样。 */
    function addGridLine(pts) {
      var n = pts.length;
      var pos = new Float32Array(n * 3);
      var col = new Float32Array(n * 3);        // 占位，颜色由 rebakeGridNight 填
      for (var i = 0; i < n; i++) {
        var p = pts[i];
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      gridGeoms.push(g);
      gridGroup.add(new THREE.Line(g, gmat));
    }
    var lats = [-60, -30, 0, 30, 60];
    lats.forEach(function (lat) {
      var pts = [], i;
      for (i = 0; i <= 96; i++) pts.push(v3(lat, i / 96 * 360 - 180, gR));
      addGridLine(pts);
    });
    for (var lon = -180; lon < 180; lon += 30) {
      var mp = [], j;
      for (j = 0; j <= 96; j++) mp.push(v3(j / 96 * 360 - 180, lon, gR));
      addGridLine(mp);
    }
    scene.add(gridGroup);
    rebakeGridNight();
  }

  /* 把「当前太阳方向」烘进经纬网顶点色。
   *
   * 拆出来是为了让太阳可变：顶点色是太阳的快照，光改 SUN_DIR 而不管它，
   * 就会出现「网格的明暗界线」与「夜壳灯火亮起的界线」错开 —— 静默走样。
   * 成本：17 条线 × 97 个顶点 = 1649 次点积，只在 setSunDir 时跑一次，
   * 不进每帧循环。
   * ⚠ 必须与 buildNightLights 的 NIGHT_TERM 用同一条 smoothstep 与同一个
   *   SUN_DIR（下面这行是它的 JS 版镜像，改一处要改两处 —— 已由 headless 的
   *   「晨昏线同源」断言锁住：把两者改成不同方向会让断言变红）。 */
  function rebakeGridNight() {
    if (!gridGeoms.length) return;
    var sun = new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize();
    var base = new THREE.Color(0x86bad8);
    var v = new THREE.Vector3();
    gridGeoms.forEach(function (g) {
      var pos = g.getAttribute('position'), col = g.getAttribute('color');
      for (var i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        var d = v.dot(sun);
        var t = (d - 0.08) / (-0.26 - 0.08);
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        var nt = t * t * (3 - 2 * t);                     // smoothstep(0.08, -0.26, d)
        var m = 1 - (1 - GRID_NIGHT) * nt;
        col.setXYZ(i, base.r * m, base.g * m, base.b * m);
      }
      col.needsUpdate = true;
    });
  }

  /* 设置太阳方向 —— 五处消费点必须一起更新（2026-10-09 太阳可变之后）。
   *
   * 为什么必须有一个**统一的写入口**，而不是让调用方直接改 SUN_DIR：
   *   这个方向被**五处**消费，任何一处漏更新，晨昏线就会错开，而且**不报错**：
   *     ① keyLight.position      —— 球体的明暗分界
   *     ② rimLight.position      —— 必须恒为太阳的反方向
   *     ③ dimMat.uniforms.uSun   —— 夜面压暗壳的晨昏线
   *     ④ nightMat.uniforms.uSun —— 夜面灯火壳的晨昏线
   *     ⑤ 经纬网顶点色           —— 烘在几何里的快照（要重烘）
   *   ① ② ③ ④ 是「写一次就跟着走」的，⑤ 必须显式重跑，所以这里集中处理。
   *
   * ⚠ 两个材质的 uSun 是**共享同一个 Vector3 实例**的（buildNightLights 里的
   *   `var sun`）。这里用 `copy()` 原地改，正是为了顺带把两个壳一起更新；
   *   若改成 `uniforms.uSun.value = newVec`，只会换掉其中一个壳的引用 ——
   *   另一个壳继续停在旧方向，静默错开。
   *
   * ⚠ 定义在**模块级**而不是 api 字面量内部：init() 需要调它，而 init 是由
   *   api.init 调用的 —— 若写成 api.setSunDir 就会在字面量求值中途读到
   *   undefined（实测报过 `api.applySunAt is not a function`，且整个渲染
   *   初始化静默失败、画面停在纯黑 0.098）。 */
  function setSunDir(v) {
    var x, y, z;
    if (Array.isArray(v)) { x = +v[0]; y = +v[1]; z = +v[2]; }
    else if (v && typeof v === 'object') { x = +v.x; y = +v.y; z = +v.z; }
    else { return false; }
    var len = Math.sqrt(x * x + y * y + z * z);
    if (!isFinite(len) || len < 1e-6) return false;       // 零向量会让整条链变成 NaN
    x /= len; y /= len; z /= len;
    SUN_DIR[0] = x; SUN_DIR[1] = y; SUN_DIR[2] = z;

    if (keyLight) keyLight.position.set(x, y, z);
    if (rimLight) rimLight.position.set(-x, -y, -z);
    var sv = _sunVec || (_sunVec = new THREE.Vector3());
    sv.set(x, y, z);
    // 原地 copy：两个壳共享同一个 value 实例，故一次 copy 同时生效
    if (dimMat) dimMat.uniforms.uSun.value.copy(sv);
    if (nightMat) nightMat.uniforms.uSun.value.copy(sv);
    rebakeGridNight();                                     // 顶点色是快照，必须重烘
    return true;
  }

  /* 太阳直射点 → 方向向量并应用（solar.js 的唯一对接点）。
   * 传 null 取「现在」；传 Date 可取任意时刻（标定与测试用）。 */
  function applySunAt(when) {
    if (!AT.solar) return false;
    var d = (when instanceof Date) ? when : new Date();
    var ok = setSunDir(AT.solar.sunDirAt(d, G));
    if (ok) sunAppliedAt = d;
    return ok;
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
        /* 各向异性取硬件上限（2026-10-09 由固定 4 改）：球面靠近轮廓处是极端斜视，
         * 4 档会把海岸线糊成一条渐变带 —— 同源的 vibeknow/nobel-atlas 一直用
         * maxAnisotropy，这也是本作「看着比它糊」的原因之一。低画质档仍取 1（省带宽优先）。 */
        tex.anisotropy = quality ? (renderer.capabilities.getMaxAnisotropy() || 1) : 1;
        mat.map = tex;
        mat.color.setHex(0xffffff);    // 原色：贴图不再叠冷蓝
        mat.needsUpdate = true;
        api.texOk = true;              // 供冒烟断言「贴图真加载了」，而不是静默走纯色兜底
      }, undefined, fallback);
    } catch (e) {
      fallback();
    }
  }

  /* 夜面贴图的候选源（内联优先，理由同地球贴图，见 tools/gen-earth-night-tex.js）。
   * 下面 buildNightLights 里那层灯光壳会消费它。 */
  var NIGHT_TEX_SRC = [
    (typeof global.AT_EARTH_NIGHT_TEX === 'string' && global.AT_EARTH_NIGHT_TEX)
      ? global.AT_EARTH_NIGHT_TEX : null,
    'assets/earth-night.jpg'
  ];

  /* ── 夜面两层球壳（2026-10-09，自 vibeknow/nobel-atlas 移植并加强）──
   *
   * 两个壳共用同一条晨昏线公式与同一个太阳方向，保证「压暗到哪里」与「灯亮到哪里」
   * 逐像素一致 —— 若各写一份，迟早出现晨昏线错开的静默走样（不报错，只是看着别扭）。
   *
   * ① **夜面压暗壳**（半透明黑，renderOrder −3）
   *    不是所有「让夜晚更黑」都要靠调灯：实测把环境光降到 1/10，夜面屏幕上只掉 20%
   *    （原因见 NIGHT_DIM 的注释）。这一层直接在线性域乘系数，是唯一能把夜面压到
   *    接近黑色的手段，且**只作用在夜面**——阳面逐像素不变。
   *    ⚠ renderOrder = −3（早于所有城市标记）是本方案成立的关键：它只压暗先于它
   *      绘制的东西 —— 也就是**不透明**的地球本体。城市点/航线/客机/经纬网全是
   *      transparent 层，排在它之后，因此**不会被一起压暗**（这正是想要的：夜幕下
   *      信息层反而更突出）。调到正数会让整片夜景连同灯火一起变灰。
   *    ⚠ 2026-10-09 更正一处与实现不符的旧注释：这里原先写「球体与矢量经纬网
   *      （都是不透明，在 opaque pass 里先画完）」，但经纬网用的是
   *      transparent: true 的 LineBasicMaterial，走的是透明队列、renderOrder 0，
   *      **根本没被压暗** —— 夜面上最亮的元素之一就是那几圈网格线。
   *      经纬网的夜面压暗改由顶点色烘焙（GRID_NIGHT，见 buildGlobe），
   *      不再依赖绘制顺序；这个坑的教训是「注释断言的东西也要能被断言覆盖」。
   *
   * ② **夜面城市灯光壳**（加色混合，renderOrder −2）
   *    贴图是「黑底 + 暖金城市灯光」的等距圆柱图，加性叠在地表之上。
   *    ⚠ 贴图偏暖、而渲染出来是冷白 —— 这不是笔误：着色器只取 max(r,g,b) 当亮度，
   *      颜色 100% 由 NIGHT_TINT 决定（见该常量的注释）。贴图那层暖色只用来在
   *      make_night_texture.py 里「把灯光从蓝调地表里挑出来」，不进最终颜色。
   *    三处照抄 nobel-atlas 的坑：
   *      · 不能用 NASA 黑大理石原图直出：那张图的海洋与陆地本身带冷蓝底噪
   *        （海洋 max 通道 ≈0.15、陆地 ≈0.33），加性叠上去会把夜面糊成一片蓝雾，
   *        而真正的灯光只占 0.2% 的像素。故贴图由 tools/make_night_texture.py
   *        按「暖度 R−B」把灯光从蓝调地表里挑出来、再晕开、压成 JPEG。
   *      · **不做 sRGB 解码**：ShaderMaterial 原始取样，贴图已按显示值调好暖金。
   *      · 晨昏线用 smoothstep(0.08, −0.26, d)，不是 d<0 的一刀切 ——
   *        硬切换会在球面上留下一圈可见接缝。
   *
   * UV 对齐的前提：夜景贴图与 assets/earth.jpg 同一等距圆柱投影生成
   *   （两项目的 earth.jpg 逐字节同源，md5 e15eb8d2…），否则灯光会落在错误的海岸线上。 */
  function buildNightLights() {
    var seg = quality ? 64 : 32;
    /* 太阳方向：两个壳共用同一个 Vector3 实例（只读，故可共享）。 */
    var sun = new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize();

    /* 共用顶点着色器：把法线送到世界空间。
     * ⚠ 用 modelMatrix 而非直接拿 position 当法线：本例球壳虽然无旋转，
     *   但写死「法线 = 位置」在日后加地轴倾角时会静默错位。 */
    var NIGHT_VS = [
      'varying vec2 vUv;',
      'varying vec3 vN;',
      'void main(){',
      '  vUv = uv;',
      '  vN = normalize(mat3(modelMatrix) * normal);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n');
    /* 晨昏线：在向阳侧 (d>0.08) 恒为 0、背阳侧 (d<−0.26) 恒为 1，中间平滑过渡。 */
    var NIGHT_TERM = [
      '  float d = dot(normalize(vN), normalize(uSun));',
      '  float night = smoothstep(0.08, -0.26, d);',
      '  if (night <= 0.003) discard;'          // 白昼侧直接不画，省填充率
    ].join('\n');

    /* ① 压暗壳 */
    dimMat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sun }, uNight: { value: NIGHT_DIM } },
      vertexShader: NIGHT_VS,
      fragmentShader: [
        'uniform vec3 uSun;',
        'uniform float uNight;',
        'varying vec2 vUv;',
        'varying vec3 vN;',
        'void main(){',
        NIGHT_TERM,
        '  gl_FragColor = vec4(0.0, 0.0, 0.0, uNight * night);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false
    });
    dimMesh = new THREE.Mesh(new THREE.SphereGeometry(R * NIGHT_DIM_LIFT, seg, seg / 2), dimMat);
    dimMesh.renderOrder = -3;
    scene.add(dimMesh);

    /* ② 城市灯光壳 */
    nightMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uSun: { value: sun },
        uTint: { value: new THREE.Color(NIGHT_TINT) },
        uGain: { value: NIGHT_GAIN },
        uKnee: { value: NIGHT_SOFT_KNEE },
        uKneeK: { value: NIGHT_SOFT_K }
      },
      vertexShader: NIGHT_VS,
      fragmentShader: [
        'uniform sampler2D uMap;',
        'uniform vec3 uSun;',
        'uniform vec3 uTint;',
        'uniform float uGain;',
        'uniform float uKnee;',
        'uniform float uKneeK;',
        'varying vec2 vUv;',
        'varying vec3 vN;',
        'void main(){',
        NIGHT_TERM,
        '  vec3 c = texture2D(uMap, vUv).rgb;',
        '  float lum = max(max(c.r, c.g), c.b);',
        '  float x = lum * uGain;',
        /* 软膝作用在**增益后**的值上（顺序不能反，否则低段会被一起压掉）：
         * x ≤ uKnee 时 k=0，soft 恰等于 x（灯火主体逐像素不变）；
         * x >  uKnee 时按 1/(1+K·k) 压缩，渐近上界 uKnee + 1/uKneeK < 1，
         * 故**不可能**被 8bit 缓冲截断成纯白（原因见 NIGHT_SOFT_KNEE 的注释）。 */
        '  float k = max(0.0, x - uKnee);',
        '  float soft = (x - k) + k / (1.0 + uKneeK * k);',
        '  gl_FragColor = vec4(uTint * (soft * night), 1.0);',
        '}'
      ].join('\n'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    nightMesh = new THREE.Mesh(new THREE.SphereGeometry(R * NIGHT_LIFT, seg, seg / 2), nightMat);
    nightMesh.renderOrder = -2;
    nightMesh.visible = false;            // 贴图到货前保持隐藏，避免空材质球壳遮住地球
    scene.add(nightMesh);
  }

  /* 夜面贴图的加载链：内联 data URI → assets/earth-night.jpg → 关掉夜景层。
   * 与地球贴图同一个理由（file:// 下 CORS 拒绝本地 jpg 作 WebGL 纹理），
   * 但失败时**不**回落到纯色 —— 夜面没有灯光只是少一层效果，不该退化成一块色斑。 */
  function loadNightTexture(attempt) {
    var src = NIGHT_TEX_SRC[attempt];
    if (!nightMat) return;
    function fallback() {
      if (attempt + 1 < NIGHT_TEX_SRC.length) { loadNightTexture(attempt + 1); return; }
      nightMat.uniforms.uGain.value = 0;   // 兜底：静默关掉这一层，画面其余部分不受影响
      nightMesh.visible = false;
    }
    if (!src) { fallback(); return; }
    try {
      new THREE.TextureLoader().load(src, function (tex) {
        /* ⚠ 刻意**不**设 tex.encoding —— ShaderMaterial 原始取样，见函数头注释 ②。 */
        tex.anisotropy = quality ? (renderer.capabilities.getMaxAnisotropy() || 1) : 1;
        nightMat.uniforms.uMap.value = tex;
        nightMat.needsUpdate = true;
        nightMesh.visible = true;
        api.nightOk = true;                // 供冒烟断言「灯层真加载了」，而不是静默走兜底
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

  /* ───────────────────────── 城市标记点（Sprite 四层）─────────────────────────
   *
   * 形制对齐 vibeknow/nobel-atlas：每城一个 Group 挂在球面 R*CITY_LIFT，
   * 内含四层 Sprite（NormalBlending，非加性）：
   *   ① contour  深色描边环 —— 包住光晕给出硬边，NormalBlending 下暗色才有效
   *   ② halo     暖色光晕   —— 中心亮向外柔出，给点「发光」感
   *   ③ core     白色实心核 —— 最亮的一枚点，颜色由归属调制
   *   ④ ring     虚线圆环   —— setLineDash 直绘 + 每帧自转 = 缓慢旋转的扫描环
   *
   * 归属四档（颜色 + ring 透明度区分）：
   *   · 基地     → homeHex（亮橙黄），尺寸 ×1.25，ring 最亮
   *   · 已通航   → mineHex（橙黄），ring 亮
   *   · 仅竞对   → rivalHex（紫罗兰），ring 中
   *   · 未通航   → virginHex（冰青），ring 淡
   *
   * 等级 1..5 → 尺寸 ×0.72/0.88/1.0/1.16/1.34（尺寸管发展度，颜色管归属，互不干扰）。
   * 开发度上涨 → 辉光脉冲（尺寸 + 透明度呼吸，持续 0.6s 衰减）。
   * 背面剔除：逐帧算朝向系数 face，背对相机的城市 visible=false，不透穿地球。
   *
   * ⚠ 2026-10-09 从 Points 点云三层（加性混合）改为 Sprite 四层（NormalBlending），
   *   复刻 nobel-atlas 的「发光图钉」视觉。深色描边在 NormalBlending 下可见，
   *   不再需要加性混合下「描边必须比盘心亮」的 workaround。 */

  /* 各层相对 base 的尺寸倍数（halo/contour/ring 都比 core 大，包住核心）。
   * 比例参照 nobel-atlas：halo/core ≈ 2.8，contour/core ≈ 1.6，ring/core ≈ 2.8。 */
  var MK_CORE = 1.0, MK_HALO = 2.8, MK_CONTOUR = 1.6, MK_RING = 2.8;
  /* 距离补偿：Sprite 在透视下近大远小，mkScale = cam.radius / REF_DIST 抵消之，
   * 让点在不同距离下视觉尺寸接近（与旧 Points 的恒定像素尺寸行为一致）。
   * REF_DIST 取默认 cam.radius=7.4，此时 mkScale=1。clamp 防止极近/极远时过激。 */
  var REF_DIST = 7.4;
  var CITY_PULSE_SEC = 0.6;
  var _markerTime = 0;
  var _whiteCol = new THREE.Color(0xffffff);

  /* 颜色管理：旧版 three.js（legacy 模式），材质 color 需 convertSRGBToLinear，
   * 否则 outputEncoding=sRGB 会再转一次把颜色洗白（与 nobel-atlas 同坑）。 */
  function mkColor(hex) {
    var c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
  }

  function clearMarkers() {
    if (markerGroup) {
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        m.contour.material.dispose(); m.halo.material.dispose();
        m.core.material.dispose(); m.ring.material.dispose(); m.solidRing.material.dispose();
      }
      scene.remove(markerGroup);
      markerGroup = null;
    }
    markers.length = 0;
  }

  function buildMarkers(state) {
    clearMarkers();
    markerGroup = new THREE.Group();
    scene.add(markerGroup);
    for (var i = 0; i < state.cities.length; i++) {
      var c = state.cities[i];
      var grp = new THREE.Group();
      var v = G.ll2v(c.lat, c.lon, R * CITY_LIFT);
      grp.position.copy(v);
      grp.lookAt(0, 0, 0); grp.rotateX(Math.PI);

      var contour = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.contour, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0.6
      }));
      var halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.halo, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0.5
      }));
      var core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.core, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 1
      }));
      var ring = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.cityRing, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0.4
      }));
      var solidRing = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.solidRing, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0.4
      }));

      contour.renderOrder = 10; halo.renderOrder = 11; ring.renderOrder = 12; solidRing.renderOrder = 12; core.renderOrder = 13;
      grp.add(contour); grp.add(halo); grp.add(ring); grp.add(solidRing); grp.add(core);
      markerGroup.add(grp);

      markers.push({
        city: c, grp: grp, contour: contour, halo: halo, core: core, ring: ring, solidRing: solidRing,
        base: 0.079 + c.pop0 * 0.0015,
        pulse: 0, lastDev: c.dev, face: 1
      });
    }
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

  function syncMarkers(state, dt) {
    if (!markerGroup) return;
    _markerTime += dt;
    var decay = (dt > 0) ? dt / CITY_PULSE_SEC : 0;
    var mkScale = Math.max(0.45, Math.min(2.2, cam.radius / REF_DIST));

    if (!_pn) { _pv = new THREE.Vector3(); _pn = new THREE.Vector3(); _cd = new THREE.Vector3(); }
    var hasCam = !!(camera && camera.position.lengthSq() > 1e-6);
    var camSil = 0;
    if (hasCam) { _cd.copy(camera.position).normalize(); camSil = R / camera.position.length(); }

    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var c = m.city;

      var connected = cityConnected(state, c.id);
      var mine = connected || !!c.isHome;
      var tone = mine ? 0 : (cityRivaled(state, c.id) ? 1 : -1);

      /* 背面剔除：球面可见边界 dot = camSil，边界两侧 0.08 软过渡。 */
      var face = 1;
      if (hasCam) {
        _pn.copy(m.grp.position).normalize();
        face = (_pn.dot(_cd) - camSil) / 0.08 + 0.5;
        if (face < 0) face = 0; else if (face > 1) face = 1;
      }
      m.face = face;
      var show = face > 0.01;
      m.contour.visible = show; m.halo.visible = show;
      m.core.visible = show;
      if (!show) { m.ring.visible = false; m.solidRing.visible = false; continue; }

      /* 开发度上涨 → 脉冲。 */
      if (c.dev > m.lastDev + 1e-4) m.pulse = 1;
      m.lastDev = c.dev;
      if (m.pulse > 0) { m.pulse -= decay; if (m.pulse < 0) m.pulse = 0; }
      var p = m.pulse;

      var lv = Math.max(1, Math.min(5, c.level | 0));
      var lvMul = [0, 0.72, 0.88, 1.0, 1.16, 1.34][lv];
      var s = m.base * lvMul * (c.isHome ? 1.25 : 1) * mkScale;
      if (p > 0) s *= (1 + 0.45 * p);

      /* 归属色：基地 > 已通航 > 仅竞对 > 未通航。 */
      var col;
      if (c.isHome) col = PALETTE.homeHex;
      else if (connected) col = PALETTE.mineHex;
      else if (tone === 1) col = PALETTE.rivalHex;
      else col = PALETTE.virginHex;
      var cLin = mkColor(col);

      /* 持续呼吸（让点「活着」），与开发度脉冲叠加。 */
      var breath = 0.5 + 0.5 * Math.sin(_markerTime * 2.4 + i * 0.7);

      /* halo：归属色光晕，随呼吸微缩放，脉冲时更亮。 */
      m.halo.material.color.copy(cLin);
      var hs = s * MK_HALO * (1 + 0.08 * breath);
      m.halo.scale.set(hs, hs, 1);
      m.halo.material.opacity = (0.42 + 0.14 * breath) * face * (1 + 0.6 * p);

      /* core：归属色实心核（往白提 7%，保留色相但更亮）。 */
      var cCore = cLin.clone().lerp(_whiteCol, 0.07);
      m.core.material.color.copy(cCore);
      var cs = s * MK_CORE;
      m.core.scale.set(cs, cs, 1);
      m.core.material.opacity = face * (1 + 0.4 * p);

      /* contour：深色描边（贴图本身深色，color 保持白不调制）。 */
      var ctS = s * MK_CONTOUR;
      m.contour.scale.set(ctS, ctS, 1);
      m.contour.material.opacity = 0.6 * face;

      /* ring：只有基地城市用实线环（solidRing），已通航但非基地 / 仅竞对 / 未通航
       * 都用虚线环（ring）—— 用户需求：还没建基地但已通航的城市外圈应是虚线。
       * 颜色与不透明度仍按归属（tone）区分：已通航非基地 = mineHex 虚线、
       * 仅竞对 = rivalHex 虚线、未通航 = virginHex 虚线。 */
      var useSolid = !!c.isHome;
      m.ring.visible = !useSolid;
      m.solidRing.visible = useSolid;
      var ringSprite = useSolid ? m.solidRing : m.ring;
      ringSprite.material.color.copy(cLin);
      var rs = s * MK_RING;
      ringSprite.scale.set(rs, rs, 1);
      var ra;
      if (tone === 0) ra = c.isHome ? 0.85 : (0.50 + lv * 0.06);
      else if (tone === 1) ra = 0.70;
      else ra = 0.30;
      if (p > 0) ra = Math.min(1.2, ra * (1 + 0.8 * p));
      ringSprite.material.opacity = ra * face;
      ringSprite.material.rotation = _markerTime * (tone >= 0 ? 0.55 : 0.3) + i * 0.7;
    }
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
   * 重合去重必须用**本帧局部**的 seenKeys，不能用跨帧的槽位索引表 ——
   * 否则上一帧已显示的竞对航线在本帧会被误判为「与我的重合」而跳过、
   * 下一帧又重新出现，逐帧乒乓闪烁（2026-10-08 修复）。 */
  function syncArcs(state, dt) {
    if (!arcGeom) return;
    var wanted = [];
    var i, r;

    // ① 我的航线（含刚开通的 fx 高亮）
    var seenKeys = {};                    // 本帧 wanted 已有的 key（重合去重用）
    for (i = 0; i < state.routes.length; i++) {
      r = state.routes[i];
      seenKeys[r.key] = 1;
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
        if (seenKeys[key]) continue;      // 与本帧已有航线重合（我的优先/竞对间重线）：跳过
        if (rivalShown >= 40) break;
        seenKeys[key] = 1;
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
    for (i = 0; i < n; i++) {
      var w = wanted[i];
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
    }
    // 清空多余槽位
    for (i = n; i < MAX_ARCS; i++) {
      if (arcSlots[i]) { clearArc(i); arcSlots[i] = null; }
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
          c: toneRgb(state.airlineColor, PALETTE.planeMine, PLANE_TINT),
          s: 1
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
          c: toneRgb(rv.color, PALETTE.planeRival, PLANE_TINT_RIVAL),
          s: PLANE_SCALE_RIVAL            // 竞对客机放大一圈（见 PLANE_SCALE_RIVAL）
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
      /* 逐实例缩放：我的机队 1.0，竞对 PLANE_SCALE_RIVAL（放大 + 提亮，见其常量注释）。
       * ⚠ 两个轴都必须显式写 —— 上一帧某个实例被 hidePlane 缩成 (0,0,0) 后，
       *   复用同一 planeDummy 只会覆盖到显式赋值的分量，漏写就会被上一架带飞。 */
      planeDummy.scale.set(p.s, p.s, 1);
      planeDummy.updateMatrix();
      planeMesh.setMatrixAt(i, planeDummy.matrix);

      col = _color.setRGB(p.c[0], p.c[1], p.c[2]);
      /* 中段更亮（贴近弧线最高点），但乘子上限必须 ≤ 1.0 ——
       * 超过 1.0 会让颜色最高通道截断（clamp 到 1.0），色相丢失、飞机变白。
       * 原 0.85+0.5*sin 上限 1.35 正是此病：红色 R 通道 0.92×1.35=1.24→1.0 截断成粉白。
       * 改为 0.55+0.35*sin，范围 [0.55, 0.90]，不截断、色相完整保留。 */
      col.multiplyScalar(0.55 + 0.35 * Math.sin(t * Math.PI));
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
   *   看上去正是「光圈跑到地球底下去了」。这与城市标记点是同一个坑（见 buildMarkers 注释），
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
     * 判据与 syncMarkers 逐字一致 —— 法线就是位置方向，可见边界 dot = R/|相机|。 */
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
     * ⚠ 这一句才是「又亮、又不过曝」的关键：
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
    /* ⚠ 2026-10-09 记一笔：曾在这里实现「夜面 bloom 衰减」（把屏幕像素反投影回球面
     *   求出夜面因子、让 bloom 在夜面打折），理由是怀疑 bloom 把夜面抬亮了。
     *   实测推翻了这个怀疑：bloom 强度 1.1 → 0 时夜面逐像素不变（0.154 → 0.154）。
     *   之前看起来「bloom 让夜面亮 0.096」其实是 setQuality(0) 顺带把 pixelRatio
     *   从 1.5 降到 1 造成的采样差异，不是 bloom 的贡献。
     *   故整段反投影逻辑已删除 —— 每帧 4 个 uniform 更新与逐像素求交的开销，
     *   不该为一个不存在的收益付。 */
    '  gl_FragColor = vec4(lin2srgb(clamp(c + b * uStrength, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n');

  var bloom = { built: false, ok: false, failed: false,
                rtScene: null, rtA: null, rtB: null,
                quad: null, scene: null, cam: null,
                mBright: null, mBlur: null, mComp: null };
  /* bloom 的合成强度（默认值）。拆成变量是为了让标定脚本能在**不改画质档位**的前提下
   * 单独量出 bloom 对画面的贡献 —— 早先只能用 setQuality(0) 关掉整条后处理，
   * 而那同时会改 pixelRatio，两组读数不可比（2026-10-09 昼夜标定时踩过）。 */
  var bloomStrength = 1.1;

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
        uniforms: { tScene: { value: null }, tBloom: { value: null },
                    uStrength: { value: bloomStrength } },
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
    bloom.mComp.uniforms.uStrength.value = bloomStrength + bloomPulse * 1.1;
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

    /* 光照：冷而弱的环境光 + 一盏主导的**暖**主光 + 一盏薄薄的冷补光。
     * 昼夜交界由主光自然形成，而不是拿大面积环境光把整颗球「泛白」。
     *
     * ⚠ 2026-10-09 复核（用户：「黑夜效果也不明显」）：曾尝试靠压低这几盏灯来压暗夜面，
     *   实测无效——环境光 2.6 → 0.25（降 90%）只换来夜面 0.195 → 0.152，
     *   因为夜面在线性域本就极暗（≈0.03），是 sRGB 编码把它抬离了黑色（详见 NIGHT_DIM）。
     *   故这三盏灯保持原值，夜面改由夜面压暗壳处理（见 buildNightLights）。
     *   intensity 与 exposure 1.15 是一组，单改其一都会失衡。 */
    scene.add(new THREE.AmbientLight(0x223044, LIGHT.amb));
    keyLight = new THREE.DirectionalLight(0xfff2d0, LIGHT.key);
    keyLight.position.set(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);   // 与夜壳 uSun 同源
    scene.add(keyLight);
    rimLight = new THREE.DirectionalLight(0x4aa8d6, LIGHT.rim);
    // 冷补光从**太阳反方向**打（= 正对夜面），作用只是把球体轮廓从深空底里勾出来。
    // 太阳一挪，它必须跟着反向 —— 否则会变成一盏从白昼侧打来的多余光源。
    rimLight.position.set(-SUN_DIR[0], -SUN_DIR[1], -SUN_DIR[2]);
    scene.add(rimLight);

    buildTextures();
    buildStars();
    buildGlobe();
    buildNightLights();
    loadNightTexture(0);

    /* ── 按真实时间定太阳位置（2026-10-09）────────────────────────────────
     * 顺序上：buildGlobe 建了经纬网几何并烘了一次顶点色（用的是回退方向），
     * buildNightLights 把两个壳的 uSun 指向同一个 Vector3。
     * 这里再调 applySunAt()，它会把这五处一起改成真实方向（含重新烘焙网格）。
     * 放在开场镜头之前，是因为**基地半球判定要读最终太阳方向**（见下）。
     *
     * ⚠ 必须调**模块级的 applySunAt**，不能写成 api.applySunAt：init 本身就是
     *   被 api.init 调用的，此刻 api 字面量还没求值完，属性全是 undefined ——
     *   实测报 `api.applySunAt is not a function`，且整个渲染初始化静默失败
     *   （画面停在纯黑，全部读数退化成同一个值，五层测试只有夜景探针能看出来）。 */
    applySunAt(null);

    buildAtmosphere();
    atmoPhase = 0;
    buildMarkers(state);
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
    /* 记录开局时基地是不是落在夜面 —— UI 可据此给一句提示
     * （「此刻你基地所在半球是夜晚」）。刻意**不改太阳方向去迁就镜头**：
     * 那样等于把「真实时间」这个功能本身架空了。
     * ⚠ 写的是**模块级变量** openAtNight，导出面用 getter 读它。
     *   别在这里写 `api.openAtNight = ...`：init 是被 api.init 调用的，
     *   此刻 api 字面量还没求值完，赋值只是在临时的未完成对象上打水漂 ——
     *   实测读出来恒为 false（`sunPlan.openAtNight` 却是 true，直接露馅）。 */
    openAtNight = false;
    if (home) {
      var hn = new THREE.Vector3(hv.x, hv.y, hv.z).normalize();
      var sd = new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize();
      openAtNight = hn.dot(sd) < 0;
    }

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
    if (bloom.built && !bloom.failed) {
      try { buildBloom(); } catch (e) { bloom.ok = false; bloom.failed = true; }
    }
  }

  function frame(state, dt) {
    if (!api.ok || !renderer) return;
    syncMarkers(state, dt);
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
    /* 夜面灯光层是否真的加载了贴图（false = 走了兜底，那层被静默关掉）。 */
    get nightOk() { return !!api.nightOk; },
    /* 夜面灯光增益的读写 —— 标定与实机诊断用，不改贴图。 */
    get nightGain() { return nightMat ? nightMat.uniforms.uGain.value : 0; },
    setNightGain: function (v) {
      if (!nightMat) return;
      nightMat.uniforms.uGain.value = Math.max(0, +v || 0);
    },
    /* 夜面压暗系数读写（0 = 不压暗，1 = 夜面全黑）—— 标定用。 */
    get nightDim() { return dimMat ? dimMat.uniforms.uNight.value : 0; },
    setNightDim: function (v) {
      if (!dimMat) return;
      dimMat.uniforms.uNight.value = Math.max(0, Math.min(1, +v || 0));
    },
    /* 夜景的配色与压峰读数（供冒烟断言「灯火是低彩度冷白」「软膝上界 < 1」，
     * 而不是只看源码 —— 改错了断言得能变红）。 */
    get nightPlan() {
      return {
        tint: nightMat ? nightMat.uniforms.uTint.value.getHex() : NIGHT_TINT,
        gain: nightMat ? nightMat.uniforms.uGain.value : 0,
        knee: NIGHT_SOFT_KNEE,
        kneeK: NIGHT_SOFT_K,
        ceil: NIGHT_SOFT_KNEE + 1 / NIGHT_SOFT_K,   // 软膝渐近上界（必须 < 1）
        gridNight: GRID_NIGHT
      };
    },
    /* 灯火颜色读写 —— 与 setNightGain / setNightDim 同类的标定旋钮。
     * ⚠ 为什么要暴露它：冒烟里那条「灯火不再抢标记的色相」如果只写一个绝对阈值，
     *   就成了不可复核的魔法数字（且 Δ(R−B) 还混着夜面底色的蓝，见 light_delta 注释）。
     *   有了这个旋钮，测试可以在同一机位把旧暖金换回来做 A/B，
     *   断言「换回暖金后色相偏移确实更大」—— 机制才算被覆盖。 */
    get nightTint() { return nightMat ? nightMat.uniforms.uTint.value.getHex() : NIGHT_TINT; },
    setNightTint: function (hex) {
      if (!nightMat) return;
      nightMat.uniforms.uTint.value.setHex(hex >>> 0);
    },
    /* 软膝压缩强度读写。⚠ kneeK = 0 时曲线**退化为恒等**（k/(1+0·k) = k ⇒ soft = x），
     * 也就是「软膝没接上」的那条线性链路。暴露它同样是为了让测试能证明
     * 「软膝真的在起作用」：机制写了不等于生效 —— 只有把 kneeK 归零再拍一张，
     * 才能说明夜面的纯白斑确实是被这条曲线消掉的，而不是本来就那么暗。 */
    get nightKneeK() { return nightMat ? nightMat.uniforms.uKneeK.value : 0; },
    setNightKneeK: function (v) {
      if (!nightMat) return;
      nightMat.uniforms.uKneeK.value = Math.max(0, +v || 0);
    },
    /* 经纬网夜面压暗的读数 —— 直接读**烘进顶点色**的暗化系数（也就是真正送到 GPU 的
     * 那份数据），而不是读常量：烘焙发生在构建期与每次 setSunDir()（太阳整局不动，
     * 但开局那一次也是真烘），光看代码断言不了它真的跑过、也断言不了晨昏线与夜壳对齐。
     * dayMul  = 最靠太阳直射点那条线的系数（应 ≈1，阳面不被压暗）
     * nightMul= 最靠反日点那条线的系数（应 ≈GRID_NIGHT）
     * ⚠ 系数由「顶点色的 R 通道 ÷ 基础色 R 通道」还原 —— 读的是颜色本身，
     *   所以若有人把烘焙删掉（顶点色恒为基色），这里会返回 1 而不是 GRID_NIGHT。 */
    get gridNightProbe() {
      var sun = new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize();
      var dayD = -2, nightD = 2, dayM = 0, nightM = 0;
      var v = new THREE.Vector3();
      gridGeoms.forEach(function (g) {
        var pos = g.getAttribute('position'), col = g.getAttribute('color');
        for (var i = 0; i < pos.count; i++) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
          var d = v.dot(sun);
          var m = col.getX(i) / (0x86 / 255);
          if (d > dayD) { dayD = d; dayM = m; }
          if (d < nightD) { nightD = d; nightM = m; }
        }
      });
      return { lines: gridGeoms.length, dayMul: dayM, nightMul: nightM, gridNight: GRID_NIGHT };
    },
    /* bloom 合成强度读写 —— 标定与诊断用。有了它就不必再为「看看 bloom 贡献多少」
     * 去调 setQuality（那会顺带动到 pixelRatio，两组读数不可比）。 */
    get bloomStrength() { return bloomStrength; },
    setBloomStrength: function (v) { bloomStrength = Math.max(0, +v || 0); },
    /* 三盏灯的强度读数（供标定脚本核对页面里的实际配方，而不是只看源码）。 */
    get lightPlan() { return { key: LIGHT.key, amb: LIGHT.amb, rim: LIGHT.rim }; },
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
    get cityCount() { return markers.length; },
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
    /* 太阳直射点经纬度 = SUN_DIR 反算，与主光/夜壳 uSun 同源。
     * 实机冒烟用它取「日面」观察点，反足点即「夜面」——避免测试里再抄一份 (4,3,5)。 */
    get sunLL() { return G.v2ll({ x: SUN_DIR[0], y: SUN_DIR[1], z: SUN_DIR[2] }); },

    /* ── 太阳方向：读 / 写（2026-10-09 起太阳可变）────────────────────────────
     *
     * 为什么必须有一个**统一的写入口**，而不是让调用方直接改 SUN_DIR：
     *   这个方向被**五处**消费，任何一处漏更新，晨昏线就会错开，而且**不报错**：
     *     ① keyLight.position      —— 球体的明暗分界
     *     ② rimLight.position      —— 必须恒为太阳的反方向
     *     ③ dimMat.uniforms.uSun   —— 夜面压暗壳的晨昏线
     *     ④ nightMat.uniforms.uSun —— 夜面灯火壳的晨昏线
     *     ⑤ 经纬网顶点色           —— 烘在几何里的快照（要重烘）
     *   ① ② ③ ④ 是「写一次就跟着走」的，⑤ 必须显式重跑，所以这里集中处理。
     *
     * ⚠ 两个材质的 uSun 是**共享同一个 Vector3 实例**的（buildNightLights 里的
     *   `var sun`）。这里用 `copy()` 原地改，正是为了顺带把两个壳一起更新；
     *   若改成 `uniforms.uSun.value = newVec`，只会换掉其中一个壳的引用 ——
     *   另一个壳继续停在旧方向，静默错开。 */
    get sunDir() { return SUN_DIR.slice(); },
    setSunDir: setSunDir,
    /* 太阳直射点 → 方向向量并应用（solar.js 的唯一对接点）。
     * 传 null 取「现在」；传 Date 可取任意时刻（标定与测试用）。 */
    applySunAt: applySunAt,
    /* 上一次 applySunAt 用的时刻（null = 还没取过真实时间）。 */
    get sunAppliedAt() { return sunAppliedAt; },
    /* 开局时基地是否落在夜面（真实时间驱动下约一半概率为 true）。
     * ⚠ 用 getter 而不是字面量属性：init 在 api 字面量求值完成**之前**就被调用了，
     *   字面量里写 `openAtNight: false` 会把这个初值盖回去（实测恒为 false）。 */
    get openAtNight() { return openAtNight; },
    /* 太阳这条链的完整快照 —— 一次取齐，供探针核对「五处消费点真的同源」。
     * ⚠ 只读快照，不要拿它当写入口（写请用 setSunDir）。 */
    get sunPlan() {
      var lit = keyLight ? keyLight.position : null;
      var rim = rimLight ? rimLight.position : null;
      var du = dimMat ? dimMat.uniforms.uSun.value : null;
      var nu = nightMat ? nightMat.uniforms.uSun.value : null;
      return {
        dir: SUN_DIR.slice(),
        ll: api.sunLL,
        appliedAt: sunAppliedAt ? sunAppliedAt.toISOString() : null,
        openAtNight: openAtNight,
        // 下面三项由探针断言「与 dir 同源」—— 任何一处漏更新都会在这里露出来
        key: lit ? [lit.x, lit.y, lit.z] : null,
        rim: rim ? [rim.x, rim.y, rim.z] : null,
        dimUSun: du ? [du.x, du.y, du.z] : null,
        nightUSun: nu ? [nu.x, nu.y, nu.z] : null
      };
    },
    setAtmoBreath: function (v) {
      atmoBreath = Math.max(0, Math.min(0.5, +v || 0));
    },
    get atmoBreath() { return atmoBreath; }
  };

  /* 渲染层内部暂存变量（延迟初始化，避免模块加载期就 new 一堆 THREE 对象） */
  var _axis = null, _right = null, _color = null;

})(typeof window !== 'undefined' ? window : globalThis);
