/**
 * 郑和宝船 — 尺寸与形制参数（唯一真源）
 *
 * 供两侧共用：
 *   - HTML 侧：直接 <script src> 引入，读 window.ZH_SHIP
 *   - Blender 侧：node blender/export_params.js 导出为 JSON 后读取
 *     （不让 Blender 用正则去猜 JS —— 那是 v1 的坑）
 *
 * ⚠️ 改动前必读 docs/史料考证.md。
 *    「记载值」不得擅改；「形制值」是照参考图与福船特征做的设计选择。
 *
 * 环境：经典脚本（无 import/export）、ES5 语法（Chrome 61 基线）。
 */
(function (root) {
  'use strict';

  /* ══ 一、记载值（不得擅改）════════════════════════════════
   * 出处见 docs/史料考证.md §1.1 / §1.2
   */
  var CHI_M = 0.311;                 // 一营造尺 ≈ 0.311 m（换算基准）
  var RECORD = {
    lengthZhang: 44.4,               // 长四十四丈四尺
    lengthZhangAlt: 44.0,            // 异文：长四十四丈
    beamZhang: 18.0,                 // 阔十八丈
    mastCount: 9,                    // 九桅
    sailCount: 12,                   // 十二帆
    bulkheadCountMin: 13             // 水密隔舱推定下限
  };
  RECORD.lengthChi = RECORD.lengthZhang * 10;    // 444 尺
  RECORD.beamChi = RECORD.beamZhang * 10;        // 180 尺
  RECORD.lengthM = RECORD.lengthChi * CHI_M;     // ≈ 138.1 m（仅参考，UI 勿直显）
  RECORD.beamM = RECORD.beamChi * CHI_M;         // ≈ 56.0 m
  RECORD.ratio = RECORD.lengthZhang / RECORD.beamZhang;   // ≈ 2.4667

  /* ══ 二、形制值（照参考图设定）════════════════════════════
   * 模型按「1 单位 = 1 米」的示意尺度，长度取 60，长宽比严守记载。
   *
   * 与 v1 的关键差别（v1 的观感问题即源于此）：
   *   hullDepth  2.80 → 6.60   型深过浅是 v1「像驳船」的根因
   *   draft/free 0.95/1.85 → 2.62/3.98   吃水与干舷比照参考图的双色分界
   */
  var LENGTH = 60;
  var BEAM = LENGTH / RECORD.ratio;          // ≈ 24.324

  var SHIP = {
    length: LENGTH,
    beam: BEAM,
    hullDepth: 6.60,               // 型深（龙骨底 → 舷顶）
    draft: 2.62,                   // 吃水（浅色船底高度，占型深 39.7%）
    freeboard: 3.98,               // 干舷（深色舷侧高度）
    ratio: RECORD.ratio,

    // 舷装
    bulwarkHeight: 0.48,           // 舷墙高（甲板以上）
    railPostHeight: 0.52,          // 栏杆立柱高
    railPostSize: 0.085,
    railSpacing: 0.017,            // 立柱间距（占船长）

    // 水密隔舱
    bulkheadCount: 13,
    bulkheadThickness: 0.055,

    // 舷孔（参考图的招牌特征）
    portholeRows: 2,
    portholeSize: 0.34,
    portholeT0: 0.085,
    portholeT1: 0.915,
    portholeCols: 20,
    portholeRowZ: [0.36, 0.66],    // 行高（占总干舷比例，自水线起算）

    // 板材
    strakeCount: 9,
    strakeThickness: 0.05
  };

  /* ══ 三、线型曲线控制点 ══════════════════════════════════
   * 全部以「控制点 + smoothstep 插值」定义，两侧共用同一算法；
   * Blender 侧用下方的采样表，不自己实现插值。
   */

  // 3.1 舷顶半宽比例 g(t)：t=0 为尾，t=1 为首
  //     福船特征：尾部方阔、中段最宽、首部方收（不尖）
  var C_widthT = [0.000, 0.060, 0.180, 0.340, 0.500, 0.640, 0.800, 0.900, 0.960, 1.000];
  var C_widthG = [0.860, 0.940, 0.990, 1.000, 0.998, 0.980, 0.920, 0.840, 0.740, 0.600];

  // 3.2 龙骨线 z_keel(t)：首尾上翘（福船的龙骨弧线）
  var C_keelT = [0.000, 0.080, 0.200, 0.350, 0.500, 0.650, 0.800, 0.900, 1.000];
  var C_keelZ = [1.900, 1.250, 0.550, 0.120, 0.000, 0.100, 0.500, 1.250, 2.200];

  // 3.3 舷弧 sheer(t)：叠加在型深之上的甲板抬升
  var C_sheerT = [0.000, 0.100, 0.250, 0.420, 0.600, 0.780, 0.900, 1.000];
  var C_sheerZ = [0.900, 0.720, 0.380, 0.060, 0.260, 0.620, 0.950, 1.250];

  // 3.4 横剖面型线 profile(u)：u=0 龙骨底（尖底），u=1 舷顶
  //     V 形船底 → 舭部转折 → 近乎垂直的舷侧
  var C_profU = [0.00, 0.05, 0.14, 0.28, 0.45, 0.62, 0.78, 0.90, 1.00];
  var C_profW = [0.00, 0.13, 0.30, 0.50, 0.68, 0.82, 0.92, 0.975, 1.00];

  /** smoothstep 插值（与 Blender 侧采样表完全一致） */
  function interp(xs, ys, x) {
    var n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    var i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    var u = (x - xs[i]) / (xs[i + 1] - xs[i]);
    var s = u * u * (3 - 2 * u);
    return ys[i] + (ys[i + 1] - ys[i]) * s;
  }

  /* ══ 四、采样表（Blender 侧直接查表，避免两侧各写一套插值）══ */
  var N_T = 201, N_U = 121;
  var TABLES = { g: [], keel: [], sheer: [], prof: [] };
  for (var i = 0; i < N_T; i++) {
    var t = i / (N_T - 1);
    TABLES.g.push(interp(C_widthT, C_widthG, t));
    TABLES.keel.push(interp(C_keelT, C_keelZ, t));
    TABLES.sheer.push(interp(C_sheerT, C_sheerZ, t));
  }
  for (var j = 0; j < N_U; j++) {
    TABLES.prof.push(interp(C_profU, C_profW, j / (N_U - 1)));
  }

  /* ══ 五、九桅十二帆排布（推定，见 docs/史料考证.md §四）══════
   * 前四后五：后桅群 5 桅（含尾桅双帆）+ 前桅群 4 桅（主桅三帆）
   *   后 5 桅帆数 2+1+1+1+1 = 6
   *   前 4 桅帆数 3+1+1+1   = 6   合计 12 ✓
   *
   * t 沿船长（0=尾，1=首）；h 桅高（以型深为基准的倍数）；
   * 主桅取在 t=0.62 —— 照参考图，最高桅在首侧约 1/3 处
   */
  var MASTS = [
    { key: 'mast_01', t: 0.075, h: 0.60, sail: 2, name: '尾桅',   sailName: '尾篷 + 头巾顶' },
    { key: 'mast_02', t: 0.165, h: 0.82, sail: 1, name: '后二桅', sailName: '后二篷' },
    { key: 'mast_03', t: 0.265, h: 1.06, sail: 1, name: '后三桅', sailName: '后三篷' },
    { key: 'mast_04', t: 0.375, h: 1.30, sail: 1, name: '后四桅', sailName: '后四篷' },
    { key: 'mast_05', t: 0.500, h: 1.52, sail: 1, name: '中桅',   sailName: '中篷' },
    { key: 'mast_06', t: 0.620, h: 1.60, sail: 3, name: '主桅',   sailName: '主帆 + 上帆 + 下副帆' },
    { key: 'mast_07', t: 0.710, h: 1.34, sail: 1, name: '前四桅', sailName: '前四篷' },
    { key: 'mast_08', t: 0.800, h: 1.06, sail: 1, name: '前三桅', sailName: '前三篷' },
    { key: 'mast_09', t: 0.885, h: 0.78, sail: 1, name: '首桅',   sailName: '首篷' }
  ];

  // 桅 / 帆尺寸系数（照参考图的「高窄篷帆」）
  var RIG = {
    mastHeightPerDepth: 2.15,      // 桅高 = h × hullDepth × 系数
    mastRadiusPerBeam: 0.016,      // 桅径 = beam × 系数（v1 偏细，像竹竿）
    mastTaper: 0.42,               // 桅身向上收细比例
    mastRake: 0.045,               // 桅后倾（顶部向后偏移 / 桅高）
    sailSpanU: [0.16, 0.82],       // 单帆：竖向占桅高区间
    sailSpanU2: [[0.13, 0.46], [0.52, 0.84]],                 // 双帆
    sailSpanU3: [[0.12, 0.40], [0.45, 0.64], [0.69, 0.88]],   // 三帆
    sailAspect: 0.62,              // 帆宽 / 帆高（越小越窄，参考图约 0.6）
    sailTaper: 0.93,               // 帆顶宽 / 帆底宽
    sailCamber: 0.085,             // 兜风弧度（占帆宽比例）——平板帆会显假
    sailBattens: 6,                // 每帆横撑条数
    sailThick: 0.045
  };

  /* ══ 六、上层建筑 ════════════════════════════════════════
   * tiers = 逐层收进的台阶（照参考图的「层楼」形制）。
   * 单层大方盒会读成「飘在甲板上的平板」，必须做收进。
   */
  var CASTLES = [
    { key: 'castle_poop', name: '舵楼', t0: 0.030, t1: 0.215, height: 0.95,
      tiers: [{ t0: 0.056, t1: 0.190, h: 0.88 }, { t0: 0.086, t1: 0.158, h: 1.05 }],
      cabin: true, desc: '尾部高楼，安置舵与指挥，居高瞭望' },
    { key: 'castle_mid', name: '中舱', t0: 0.430, t1: 0.560, height: 1.30,
      tiers: [], cabin: true, desc: '甲板中部的舱室，兼作货舱与居住' },
    { key: 'castle_fore', name: '首楼', t0: 0.872, t1: 0.958, height: 0.72, widthK: 0.76,
      tiers: [], cabin: false, desc: '首部平台，系碇与瞭望处' }
  ];

  /* ══ 七、属具 ════════════════════════════════════════════ */
  var GEAR = {
    rudder: {
      key: 'rudder', name: '大舵',
      desc: '可升降尾舵，随水深调节。龙江船厂遗址出土舵杆长逾 11 m，为宝船尺度的实物旁证',
      chord: 0.075,                // 舵叶弦长（占船长）
      postBite: 0.20,              // 舵叶前缘越过尾柱的比例 —— 让舵「咬」住尾柱
      topK: 0.48,                  // 舵叶顶高（占尾部甲板高的比例）
      belowKeel: 0.40,             // 舵底低于龙骨底（占总吃水比例）——福船大舵特征
      thick: 0.075
    },
    anchor: {
      key: 'anchor', name: '铁锚',
      desc: '四爪铁锚，配绞盘起落。《瀛涯胜览》称「篷帆锚舵，非二三百人莫能举动」',
      length: 1.55, count: 2
    },
    windlass: { key: 'windlass', name: '绞盘', desc: '起锚与张帆用的人力绞盘，置于首甲板', width: 2.30, radius: 0.55 },
    figurehead: { key: 'figurehead', name: '船首饰', desc: '首柱上部装饰，兼作破浪之首' },
    boat: { key: 'boat', name: '随船小艇', desc: '停靠与转运用的小艇，平置于甲板', t: 0.300, length: 6.20 }
  };

  /* ══ 八、拆解分组（按 Object 名前缀匹配，不含 ZH_）════════ */
  var EXPLODE_GROUPS = [
    { key: 'hull',      name: '船体',     order: 1, parts: ['Hull_Shell', 'Hull_Keel', 'Hull_Stem', 'Hull_Stern'] },
    { key: 'bulkhead',  name: '水密隔舱', order: 2, parts: ['Bulkhead'] },
    { key: 'deck',      name: '甲板',     order: 3, parts: ['Deck_Main', 'Deck_Hatches', 'Deck_Crates'] },
    { key: 'castle',    name: '上层建筑', order: 4, parts: ['Castle'] },
    { key: 'mast',      name: '桅樯',     order: 5, parts: ['Mast'] },
    { key: 'sail',      name: '篷帆',     order: 6, parts: ['Sail'] },
    { key: 'outfit',    name: '舷装',     order: 7, parts: ['Hull_Bulwark', 'Hull_Rail', 'Hull_Portholes'] },
    { key: 'gear',      name: '属具',     order: 8, parts: ['Rudder', 'Anchor', 'Windlass', 'Figurehead', 'Boat'] }
  ];

  /* ══ 九、派生与自检 ══════════════════════════════════════ */
  function unitFromT(t) { return (t - 0.5) * SHIP.length; }

  // 帆的竖向区间表（按 sail 数取）
  function sailSpans(n) {
    if (n === 1) return [RIG.sailSpanU];
    if (n === 2) return RIG.sailSpanU2;
    return RIG.sailSpanU3;
  }

  var API = {
    CHI_M: CHI_M,
    RECORD: RECORD,
    SHIP: SHIP,
    RIG: RIG,
    MASTS: MASTS,
    CASTLES: CASTLES,
    GEAR: GEAR,
    EXPLODE_GROUPS: EXPLODE_GROUPS,
    CURVE: { widthT: C_widthT, widthG: C_widthG, keelT: C_keelT, keelZ: C_keelZ,
             sheerT: C_sheerT, sheerZ: C_sheerZ, profU: C_profU, profW: C_profW },
    TABLES: TABLES,
    interp: interp,
    sailSpans: sailSpans,
    unitFromT: unitFromT,

    selfCheck: function () {
      var m = MASTS.length;
      var s = 0;
      for (var i = 0; i < MASTS.length; i++) s += MASTS[i].sail;
      return {
        mastCount: m,
        sailCount: s,
        ok: m === RECORD.mastCount && s === RECORD.sailCount,
        ratio: SHIP.length / SHIP.beam
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ZH_SHIP = API;
})(typeof self !== 'undefined' ? self : this);
