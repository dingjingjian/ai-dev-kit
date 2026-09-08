// 星航者 · 数据层：静态配置、火箭解算、存档
// 经典脚本，挂到全局 SV。禁止 ES module / import / eval / 联网。
(function (global) {
  'use strict';

  var SV = global.SV || (global.SV = {});

  // ------------------------------------------------------------
  // 工具
  // ------------------------------------------------------------
  var U = SV.util = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    fmt: function (n) { return String(Math.round(n)); },
    sign: function (n) { return (n > 0 ? '+' : '') + U.fmt(n); },
    rnd: function (a, b) { return a + Math.random() * (b - a); },
    irnd: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    ease: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    seed: function (s0) {
      var s = s0 % 2147483647; if (s <= 0) s += 2147483646;
      return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
    },
    sum: function (arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) t += f ? f(arr[i], i) : arr[i]; return t; },
    keys: function (o) { var r = []; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r.push(k); return r; }
  };

  // ------------------------------------------------------------
  // 稀有资源（3 种）
  // 只能靠成功抵达对应星球「带回」，基地无法产出，也不参与回合结算。
  // ------------------------------------------------------------
  var RARE = SV.RARE = [
    { id: 'ti', name: '钛晶', sym: 'Ti', css: 'ti', color: '#f0b45a',
      desc: '月壤与铁核行星里富集的高能结构金属。加强舱与中大型零件的骨架，地球上挖不出来。',
      from: '月球 · 水星 · 小行星带' },
    { id: 'he', name: '氦三', sym: 'He', css: 'he', color: '#6fe3c8',
      desc: '行星风化物与巨行星大气中富集的清洁聚变同位素。远程航行与大型推进系统的燃料基石。',
      from: '火星 · 金星 · 木星 · 土星 · 天王星' },
    { id: 'ice', name: '冰核', sym: 'Ic', css: 'ice', color: '#a8d8ff',
      desc: '深空冰层下取出的低温晶核。零损耗超导与离子推进唯一的工质。',
      from: '木卫二 · 土卫六 · 海王星 · 冥王星' }
  ];
  SV.rareById = function (id) { for (var i = 0; i < RARE.length; i++) if (RARE[i].id === id) return RARE[i]; return null; };

  // ------------------------------------------------------------
  // 科技树（15 节点 / 9 层）
  // cost = 科研点；rare = 稀有资源需求（只能远征带回）
  //
  // 稀有资源依赖链（每档原料的产地必须由更前面的科技解锁，且产地必须在
  // 玩家「脚下这颗之外」—— 否则把主基地搬过去就再也采不到，会死锁）：
  //   月球 → 钛晶 → t4/t5/t6 → 火星·金星 → 氦三 → t7 → 水星·小行星带
  //        → t8/t9/t10 → 木星·土星 → 氦三 → 木卫二·土卫六 → 冰核
  //        → t11/t12 → t13 → 天王星·海王星 → 氦三·冰核 → t14 → 冥王星
  // ------------------------------------------------------------
  var TECH = SV.TECH = [
    { id: 't0',  lv: 0, name: '基础冶金',   cost: 0,   deps: [],            desc: '从矿石中提炼结构金属的基础工艺，远征的起点。' },
    { id: 't1',  lv: 1, name: '化学燃料',   cost: 14,  deps: ['t0'],        desc: '精炼可贮存推进剂。解锁燃料产出，并使月球航线可用。' },
    { id: 't2',  lv: 2, name: '小推力引擎', cost: 24,  deps: ['t1'],        desc: '解锁零件：小推力引擎（推力 30）。' },
    { id: 't3',  lv: 2, name: '小燃料罐',   cost: 24,  deps: ['t1'],        desc: '解锁零件：小燃料罐（燃料 20）。' },
    { id: 't4',  lv: 3, name: '中推力引擎', cost: 52,  deps: ['t2'],        rare: { ti: 4 },  desc: '解锁零件：中推力引擎（推力 72）。需要钛晶强化燃烧室。' },
    { id: 't5',  lv: 3, name: '中燃料罐',   cost: 48,  deps: ['t3'],        rare: { ti: 4 },  desc: '解锁零件：中燃料罐（燃料 55）。钛晶内衬让它能承受高压。' },
    { id: 't8',  lv: 4, name: '大推力引擎', cost: 85,  deps: ['t4'],        rare: { ti: 18 }, desc: '解锁零件：大推力引擎（推力 165）。' },
    // 钛晶需求刻意压到 6：月球（t1）到水星（t6）之间，钛晶只有月球一个产地，
    // 玩家一旦把主基地搬上月球，月面就不再是合法飞行目标。t4+t5+t6 合计只需 14，
    // 一趟月球首访（20）就能走完这段 —— 让「过早搬家」不再是一个看不见的陷阱。
    { id: 't6',  lv: 4, name: '生命维持',   cost: 78,  deps: ['t4', 't5'],  rare: { ti: 6 }, desc: '解锁加强舱（2 挂载位、1 层护盾），可抵达火星、金星与水星。' },
    { id: 't9',  lv: 4, name: '大燃料罐',   cost: 95,  deps: ['t5'],        rare: { he: 18 }, desc: '解锁零件：大燃料罐（燃料 130）。低温氦三才能压住这么多推进剂。' },
    { id: 't7',  lv: 5, name: '远程导航',   cost: 105, deps: ['t6'],        rare: { he: 8 },  desc: '解锁小行星带航线。需要氦三驱动的深空信标。' },
    { id: 't10', lv: 5, name: '重型舰体',   cost: 150, deps: ['t8', 't9'],  rare: { ti: 16, he: 14 }, desc: '解锁重型舱（3 挂载位、2 层护盾），可抵达木星、木卫二与土星、土卫六。' },
    { id: 't11', lv: 6, name: '低温超导',   cost: 190, deps: ['t10'],       rare: { ice: 8 },  desc: '冰核绕组的零损耗线圈。所有火箭航程 +25%，起飞燃料消耗 −12%。' },
    { id: 't12', lv: 6, name: '离子推进',   cost: 230, deps: ['t11'],       rare: { ice: 14 }, desc: '以冰核做工质的离子推进器。所有引擎推力 +18%。' },
    // t13 挂在 t11 之后而不是 t12 之后：t12 只给推力加成、不开新航线，
    // 若把它设为必经前置，玩家在「土卫六 → 天王星」之间会出现二十多回合
    // 只能空点下一回合的死区（实测 T84–T105 连续 22 回合无目标）。
    // 现在 t12 是可选支线：花 230 科研 + 14 冰核换 +18% 推力，还是直冲冥王星，由玩家选。
    { id: 't13', lv: 7, name: '外行星引航', cost: 245, deps: ['t11'],       rare: { he: 26 }, desc: '天王星与海王星航线。两颗冰巨星的引力摄动复杂，导航阵列要靠氦三供能的信标网喂食。' },
    { id: 't14', lv: 8, name: '柯伊伯跃迁', cost: 300, deps: ['t13'],       rare: { he: 18, ice: 26 }, desc: '解锁冥王星航线。飞出柯伊伯带前的最后一跳，需要氦三与冰核双路冗余。' }
  ];
  SV.techById = function (id) { for (var i = 0; i < TECH.length; i++) if (TECH[i].id === id) return TECH[i]; return null; };
  SV.techName = function (id) { var t = SV.techById(id); return t ? t.name : ''; };

  // ------------------------------------------------------------
  // 零件
  // 舱体 cap = 燃料罐位 / 引擎位 / 载荷位；maxTwr = 结构能承受的推重比
  // 引擎 flow = 燃料流量（每秒），推力越大越费油
  // 载荷 slot 互斥，每种最多装 1 件，效果在远征结算时生效
  // ------------------------------------------------------------
  var PARTS = SV.PARTS = {
    pod_s: { name: '基础舱', slot: 'pod', mass: 4, tech: 't0', cap: { t: 1, e: 1, p: 1, b: 0 }, fuelCap: 45, maxTwr: 4, shield: 0, cost: 8,
      w: 24, h: 32, desc: '1 罐 1 引擎 1 载荷，无助推位无护盾。轻，飞得远，但经不起撞击。' },
    pod_m: { name: '加强舱', slot: 'pod', mass: 6, tech: 't6', cap: { t: 2, e: 2, p: 2, b: 2 }, fuelCap: 170, maxTwr: 8, shield: 1, cost: 20,
      w: 28, h: 40, desc: '2 罐 2 引擎 2 载荷 2 助推，1 层护盾，可硬抗一次撞击。' },
    pod_l: { name: '重型舱', slot: 'pod', mass: 9, tech: 't10', cap: { t: 3, e: 3, p: 3, b: 4 }, fuelCap: 400, maxTwr: 12, shield: 2, cost: 45,
      w: 32, h: 48, desc: '3 罐 3 引擎 3 载荷 4 助推，2 层护盾。远征外太阳系的唯一选择。' },

    tank_s: { name: '小燃料罐', slot: 'tank', mass: 2, tech: 't3', fuel: 20, cost: 4, w: 18, h: 24, desc: '燃料 20 · 造价 4' },
    tank_m: { name: '中燃料罐', slot: 'tank', mass: 4, tech: 't5', fuel: 55, cost: 12, w: 22, h: 32, desc: '燃料 55 · 造价 12' },
    tank_l: { name: '大燃料罐', slot: 'tank', mass: 7, tech: 't9', fuel: 130, cost: 30, w: 26, h: 42, desc: '燃料 130 · 造价 30' },

    engine_s: { name: '小推力引擎', slot: 'engine', mass: 3, tech: 't2', thrust: 30, eff: 1.25, cost: 8, w: 22, h: 22,
      desc: '推力 30 · 燃效 ×1.25。最省油，但推不动重装，也躲不开密集障碍。' },
    engine_m: { name: '中推力引擎', slot: 'engine', mass: 5, tech: 't4', thrust: 72, eff: 1.00, cost: 22, w: 22, h: 22,
      desc: '推力 72 · 燃效 ×1.00。推力与燃效的平衡点。' },
    engine_l: { name: '大推力引擎', slot: 'engine', mass: 8, tech: 't8', thrust: 165, eff: 0.78, cost: 55, w: 22, h: 22,
      desc: '推力 165 · 燃效 ×0.78。带得动重装甲与满载荷，机动性强，代价是费油且造价高。' },

    booster_s: { name: '小助推器', slot: 'booster', mass: 4, tech: 't4', thrust: 55, eff: 0.82, cost: 14, w: 12, h: 38,
      desc: '侧挂固体助推 · 推力 55 · 燃效 ×0.82。廉价的大推力，拉低平均燃效，适合冲危险航线。' },
    booster_l: { name: '大助推器', slot: 'booster', mass: 8, tech: 't8', thrust: 130, eff: 0.68, cost: 34, w: 14, h: 48,
      desc: '侧挂固体助推 · 推力 130 · 燃效 ×0.68。推力巨大但死重也大，外太阳系机动专用。' },

    inst: { name: '科学仪', slot: 'payload', mass: 1, tech: 't0', cost: 6, w: 12, h: 12, eff: 'crystal',
      desc: '航程 +15% · 途中可拾取数据晶体换科研点' },
    cargo: { name: '货舱', slot: 'payload', mass: 3, tech: 't5', cost: 10, w: 14, h: 14, eff: 'rare',
      desc: '带回的稀有资源 +50%。去月球拉钛晶时最划算。' },
    drill: { name: '钻探器', slot: 'payload', mass: 3, tech: 't4', cost: 12, w: 14, h: 14, eff: 'metal',
      desc: '小行星带等无基地星球的采集金属 ×2' },
    armor: { name: '装甲板', slot: 'payload', mass: 5, tech: 't6', cost: 18, w: 12, h: 16, eff: 'shield',
      desc: '护盾 +1 层。危险航线的保命件，代价是 5 吨死重。' },
    nav: { name: '导航阵列', slot: 'payload', mass: 1, tech: 't7', cost: 14, w: 14, h: 12, eff: 'range',
      desc: '航程 +30%。不增加油耗，是纯赚的航程 —— 但占一个载荷位。' },
    sampler: { name: '取样臂', slot: 'payload', mass: 3, tech: 't9', cost: 16, w: 14, h: 14, eff: 'first',
      desc: '首次勘探奖励 ×1.5。开图专用，去过的地方就没用了。' }
  };
  SV.partsOf = function (slot) { var r = []; for (var k in PARTS) if (PARTS[k].slot === slot) r.push(k); return r; };
  SV.PAYLOADS = ['inst', 'cargo', 'drill', 'armor', 'nav', 'sampler'];

  // ------------------------------------------------------------
  // 天体（12 个）
  //
  // kind 决定渲染方式：
  //   rock  岩质星球（球形贴图 + 终止线 + 边缘光）
  //   gas   气态巨行星（球形条带贴图，无固态地表；基地为「浮空站」）
  //   ice   冰巨星（球形，冷色条带 + 稀薄雾霾；基地为「浮空站」）
  //   dwarf 矮行星（岩质，小）
  //   belt  小行星带 —— 不是星球，是一片碎块带，走专用绘制分支
  //
  // dist 为「自地球起算的航行成本」，不等于日心距：水星虽最近太阳，
  // 却陷在太阳引力井里，抵达所需的速度增量远高于火星，因此排在小行星带之后。
  // 其余天体按真实日心序排列。
  // ------------------------------------------------------------
  var PLANETS = SV.PLANETS = [
    { id: 'earth', name: '地球', kind: 'rock', dist: 0, tech: null, canBase: true, haz: 0, rare: null,
      color: '#4a90e2', dark: '#12325e', sky: ['#1b3f7a', '#050a1c'], ground: '#2b4a35', groundDark: '#16241c',
      mod: { metal: 1, research: 1, fuel: 1, food: 1 }, yield: '起始基地 · 口粮 ×1',
      desc: '一切开始的地方。厚厚的大气层与液态水，让这里成为唯一不需要加压舱就能呼吸的世界。' },

    { id: 'moon', name: '月球', kind: 'rock', dist: 15, tech: 't1', canBase: true, haz: 1, rare: { id: 'ti', first: 20, per: 10 },
      color: '#cfcfcf', dark: '#6e6e78', sky: ['#0a0d18', '#02030a'], ground: '#8d8d95', groundDark: '#3e3e46',
      mod: { metal: 2, research: 1, fuel: 1, food: 0.5 }, yield: '金属 ×2 · 口粮 ×0.5',
      desc: '没有风，没有云，脚印能留存百万年。贫瘠的表土下埋着富集的钛与稀土，是天然的金属仓库。' },

    // 金星排在火星之前：它离地球更近，抵达所需的速度增量也更低。
    // 与火星同档（t6）—— 氦三必须始终有「脚下这颗以外」的产地，
    // 否则玩家把主基地搬到火星后，会因 t7 需要氦三而再也采不到氦三。
    { id: 'venus', name: '金星', kind: 'rock', dist: 38, tech: 't6', canBase: true, haz: 2, rare: { id: 'he', first: 32, per: 16 },
      color: '#e8c97a', dark: '#8a6a20', sky: ['#7a5a20', '#1a1206'], ground: '#a08040', groundDark: '#4a3818',
      mod: { metal: 1, research: 2, fuel: 1, food: 0.5 }, yield: '科研 ×2 · 口粮 ×0.5',
      desc: '表面 460 摄氏度，铅在这里会融化。真正的价值在 50 公里高空——那里气压与温度近乎宜人，云城就建在那里。' },

    { id: 'mars', name: '火星', kind: 'rock', dist: 62, tech: 't6', canBase: true, haz: 2, rare: { id: 'he', first: 20, per: 10 },
      color: '#e27b4a', dark: '#7a3418', sky: ['#5a2a18', '#160705'], ground: '#9c4a28', groundDark: '#4a2010',
      mod: { metal: 1, research: 1.5, fuel: 1, food: 0.8 }, yield: '科研 ×1.5 · 口粮 ×0.8',
      desc: '氧化铁染红了整颗星球。干涸的河床与极冠冰层写满水的往事，是研究行星演化最完整的样本。' },

    { id: 'belt', name: '小行星带', kind: 'belt', dist: 88, tech: 't7', canBase: false, haz: 3, rare: { id: 'ti', first: 40, per: 20 },
      color: '#b8a888', dark: '#4a3e2c', sky: ['#0a0812', '#02030a'], ground: '#6a5c44', groundDark: '#2a2418',
      mod: { metal: 1, research: 1, fuel: 1, food: 1 }, yield: '一次性金属（70 + 危险 × 25）',
      desc: '火星与木星之间没有星球，只有数百万块没能聚成行星的残骸。无地可落脚，但遍地是矿。' },

    // 水星与金星、火星同档（t6）而不是 t7：钛晶原本只有「月球 / 小行星带 / 水星」
    // 三个产地，后两个都要 t7。玩家把主基地搬到月球后，脚下的月球不再是合法
    // 飞行目标，钛晶就彻底采不到了 —— 推演里实测会连续 21 回合无事可做。
    // 水星提到 t6 后，钛晶在任意时刻都至少有「脚下这颗以外」的第二个产地。
    { id: 'mercury', name: '水星', kind: 'rock', dist: 105, tech: 't6', canBase: true, haz: 2, rare: { id: 'ti', first: 34, per: 18 },
      color: '#a89a8a', dark: '#4a4038', sky: ['#0a0808', '#02030a'], ground: '#6a6058', groundDark: '#2e2a26',
      mod: { metal: 3, research: 1, fuel: 1, food: 0.4 }, yield: '金属 ×3 · 口粮 ×0.4',
      desc: '离太阳最近，也被太阳烤得最狠。巨大的铁核占去整颗星球的七成，像一颗被剥了壳的行星核。' },

    // 气态巨行星：没有可以落脚的地表，基地是悬在云顶的浮空站。
    // 科研与燃料极高，口粮极低 —— 与卫星地表基地形成明确取舍。
    { id: 'jupiter', name: '木星', kind: 'gas', dist: 145, tech: 't10', canBase: true, haz: 3, rare: { id: 'he', first: 26, per: 14 },
      color: '#d8a878', dark: '#7a4a24', sky: ['#6a4a28', '#0a0608'], ground: '#b08858', groundDark: '#4a3020',
      mod: { metal: 0.7, research: 2.5, fuel: 2, food: 0.3 }, yield: '浮空站 · 科研 ×2.5 · 燃料 ×2 · 口粮 ×0.3',
      desc: '太阳系里最重的那一个，质量是其余七颗行星总和的两倍半。风暴刮了几百年也没停过，磁场强到能把探测器撕碎。' },

    { id: 'europa', name: '木卫二', kind: 'rock', dist: 150, tech: 't10', canBase: true, haz: 3, rare: { id: 'ice', first: 18, per: 10 },
      color: '#d8c8b8', dark: '#6a5a4a', sky: ['#3a2a20', '#0a0608'], ground: '#a89888', groundDark: '#4a3e34',
      mod: { metal: 1, research: 1.5, fuel: 1.5, food: 1.2 }, yield: '科研 ×1.5 · 燃料 ×1.5 · 口粮 ×1.2',
      desc: '冰壳之下是比地球全部海洋更深的液态水。木星的潮汐力持续揉捏着它，也许那里正有东西在游动。' },

    { id: 'saturn', name: '土星', kind: 'gas', dist: 205, tech: 't10', canBase: true, haz: 3, ring: true, rare: { id: 'he', first: 30, per: 16 },
      color: '#e8cf9a', dark: '#8a6a30', sky: ['#6a5828', '#100c06'], ground: '#c0a068', groundDark: '#4e3c1c',
      mod: { metal: 1.2, research: 2, fuel: 3, food: 0.3 }, yield: '浮空站 · 科研 ×2 · 燃料 ×3 · 金属 ×1.2 · 口粮 ×0.3',
      desc: '那道环由无数冰块构成，宽得能塞进一个地球，厚度却常常不到一公里。它轻到能浮在水上——如果有那么大的海。' },

    { id: 'titan', name: '土卫六', kind: 'rock', dist: 210, tech: 't10', canBase: true, haz: 3, needBase: 'europa', rare: { id: 'ice', first: 32, per: 16 },
      color: '#e0b070', dark: '#8a5a28', sky: ['#8a5a28', '#1a1006'], ground: '#c08840', groundDark: '#5a3c18',
      mod: { metal: 1.5, research: 1.5, fuel: 2, food: 1.2 }, yield: '全资源 ×1.5 · 燃料 ×2 · 口粮 ×1.2',
      desc: '浓密的橙色雾霾下，流淌着液态甲烷的河与湖。这是最后一颗能踩在实地上、又还有大气的星球。' },

    { id: 'uranus', name: '天王星', kind: 'ice', dist: 255, tech: 't13', canBase: true, haz: 3, rare: { id: 'he', first: 38, per: 20 },
      color: '#8fd8e0', dark: '#2a6a78', sky: ['#1a4a58', '#040a0e'], ground: '#5aa8b8', groundDark: '#204048',
      mod: { metal: 0.8, research: 2.5, fuel: 2.5, food: 0.35 }, yield: '浮空站 · 科研 ×2.5 · 燃料 ×2.5 · 口粮 ×0.35',
      desc: '整颗星球侧躺着自转，一极要先晒四十二年太阳才轮到另一极。甲烷吸走了红光，于是它青得像一块冰。' },

    { id: 'neptune', name: '海王星', kind: 'ice', dist: 295, tech: 't13', canBase: true, haz: 3, rare: { id: 'ice', first: 34, per: 18 },
      color: '#5a7ae8', dark: '#1a2a70', sky: ['#142a70', '#04060f'], ground: '#3a50a8', groundDark: '#161e46',
      mod: { metal: 1.2, research: 2, fuel: 2.5, food: 0.35 }, yield: '浮空站 · 科研 ×2 · 燃料 ×2.5 · 金属 ×1.2 · 口粮 ×0.35',
      desc: '太阳系刮得最凶的地方，风速能到每小时两千公里。它是先被算出来、再被看见的行星——笔尖上发现的星球。' },

    { id: 'pluto', name: '冥王星', kind: 'dwarf', dist: 340, tech: 't14', canBase: true, haz: 3, rare: { id: 'ice', first: 44, per: 24 },
      color: '#d8c8b0', dark: '#6a5a48', sky: ['#0a0810', '#02030a'], ground: '#9a8a70', groundDark: '#3a3228',
      mod: { metal: 1.2, research: 2.5, fuel: 1, food: 0.3 }, yield: '科研 ×2.5 · 金属 ×1.2 · 口粮 ×0.3',
      desc: '被除名的第九颗行星，也是柯伊伯带里最亮的一块。这里的太阳只是一颗特别亮的星，冷得连氮气都冻成了霜。' }
  ];
  SV.planetById = function (id) { for (var i = 0; i < PLANETS.length; i++) if (PLANETS[i].id === id) return PLANETS[i]; return null; };

  // ------------------------------------------------------------
  // 建筑
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // 口粮：人口的维持成本
  // 每回合按在岗人数扣减；产出靠农业岗，且各星球适宜度不同 ——
  // 地球最好养人，外星球养得起的人数明显更少，于是「把主基地搬到前线」有了代价。
  // ------------------------------------------------------------
  SV.EAT_PER_POP = 0.5;     // 每人在岗每回合吃掉
  SV.FOOD_COEFF = 2;        // 农业岗单人产出系数（与采矿的 2 对齐）
  SV.SHORTAGE_MULT = 0.5;   // 口粮不足时，当回合非口粮产出的折扣

  // 人口是整条经济的总闸门：产出 = 岗位人数 × 岗位位 × 系数，
  // 岗位位可以靠堆设施涨，岗位人数却只能靠居住舱 —— 于是人口决定了
  // 后期产出能不能跟上科技成本。数值由 tests/balance-sweep.js 定量选定，
  // 改动前先跑扫描，不要凭手感调。
  // 取值由 tests/balance-sweep.js 在 24 组组合里定量选定：
  // 原值 4 / +2 下，基地人口被锁死在 6 人，科研产出恒定在 6~13 点/回合，
  // 而科技树总成本 1620 点 —— 结果是 84% 的回合玩家无事可做，只能点下一回合等科研。
  // 改为 5 / +3 后：新基地人口上限 8，通关 117 → 75 回合，最长空转 26 → 16 回合。
  SV.POP_BASE = 5;          // 无居住舱时的人口上限
  SV.HAB_POP = 3;           // 每座居住舱提供的人口上限

  // 首次抵达某天体的一次性科研奖励。
  //
  // 存在理由：科技门控期间，玩家常出现十几甚至二十几个回合「没有任何可做的事，
  // 只能点下一回合等科研」的空转（实测空转占全部回合的 74%~87%）。
  // 给首次勘探加一笔科研，等于给玩家一条「出去飞」换科研的第二条路 ——
  // 只要还有已解锁但没去过的天体，等科研时就始终有事可做。
  // 这也是 DESIGN 里「把推进节奏从等科研让给出去飞」这条既定方向的收口。
  SV.FIRST_VISIT_R = 18;    // 基础值
  SV.FIRST_VISIT_PER_DIST = 0.28;  // 每单位航段的追加值
  SV.firstVisitResearch = function (pl) {
    return SV.FIRST_VISIT_R + Math.round((pl.dist || 0) * SV.FIRST_VISIT_PER_DIST);
  };

  SV.BUILDINGS = [
    { id: 'mine', name: '采矿场', cost: 22, desc: '采矿岗位位 +1', key: 'mining' },
    { id: 'lab', name: '研究所', cost: 26, desc: '科研岗位位 +1', key: 'research' },
    // 精炼厂有科技前置：没解锁「化学燃料」时建了也只是空厂，岗位位不开
    { id: 'refinery', name: '精炼厂', cost: 22, desc: '精炼岗位位 +1', key: 'refine', tech: 't1' },
    { id: 'farm', name: '水培舱', cost: 28, desc: '农业岗位位 +1', key: 'farming' },
    { id: 'hab', name: '居住舱', cost: 32, desc: '人口上限 +2', key: null }
  ];
  // 设施造价递增：同类型第 n 座成本 = 基础价 × 1.55^(已建数)
  // 用来抑制「无脑堆设施刷产出」——每多一座，回本周期显著变长。
  SV.BUILD_STEP = 1.55;
  SV.buildCost = function (s, bd) {
    var n = (SV.helpers.curBase(s).built[bd.id] || 0);
    return Math.round(bd.cost * Math.pow(SV.BUILD_STEP, n));
  };
  SV.JOBS = [
    { key: 'mining', label: '采矿', hint: '金属' },
    { key: 'research', label: '科研', hint: '科研点' },
    { key: 'refine', label: '精炼', hint: '燃料' },
    { key: 'farming', label: '农业', hint: '口粮' }
  ];

  // ------------------------------------------------------------
  // 火箭解算
  // ------------------------------------------------------------
  // 新基地的初始状态：各一处生产设施 + 一座水培舱 + 一座居住舱（人口上限 6）。
  // 配 5 人上岗、留 1 人闲置，既保证口粮自给，也给玩家一个「还有人没派活」的钩子。
  SV.newBase = function () {
    return { built: { mine: 1, lab: 1, refinery: 0, farm: 1, hab: 1 }, pop: { mining: 2, research: 1, refine: 0, farming: 1 } };
  };
  SV.newDesign = function () { return { pod: 'pod_s', tanks: [], engines: [], payloads: [], boosters: [] }; };

  // 燃料经济常量。航程与飞行消耗是同一个模型：
  //   航程   range = RANGE_K × (燃料 ÷ 干质量)^RANGE_POW × 平均燃效 × 载荷加成
  //   消耗   fuelUsed = 燃料 × (航段距离 ÷ 航程)      —— 飞满航程正好烧光一箱油
  // 干质量已包含所有零件（含燃料罐自重），所以多加罐的收益是次线性的。
  SV.RANGE_K = 48;               // 航程系数
  SV.RANGE_POW = 0.8;            // 燃料/干重比的指数，<1 制造边际递减
  SV.FLIGHT_BASE_T = 12;         // 飞行基础时长（秒）
  SV.FLIGHT_T_PER_DIST = 0.085;  // 每单位航段的额外时长（秒）
  SV.OVERLOAD_FLOW = 0.35;       // 每级过载带来的航程损失

  // 航线危险等级决定最低机动要求 —— 推重比不只是「能不能起飞」，
  // 而是「躲不躲得开」。这是大推力引擎存在的理由。
  SV.minTwrFor = function (haz) { return 1.2 + Math.max(0, (haz || 1) - 1) * 0.9; };

  SV.calcDesign = function (d, s) {
    d = d || {};
    var H2 = SV.helpers;
    var pod = PARTS[d.pod] || PARTS.pod_s;
    var tanks = d.tanks || [], engines = d.engines || [], boosters = d.boosters || [];
    var payloads = (d.payloads && d.payloads.length) ? d.payloads : (d.inst ? [d.inst] : []);
    var i, p;

    var mass = pod.mass, fuel = 0, thrust = 0, effSum = 0, effN = 0, cost = pod.cost || 0;
    for (i = 0; i < tanks.length; i++) { p = PARTS[tanks[i]]; if (!p) continue; mass += p.mass; fuel += p.fuel; cost += p.cost || 0; }
    for (i = 0; i < engines.length; i++) { p = PARTS[engines[i]]; if (!p) continue; mass += p.mass; thrust += p.thrust; effSum += p.eff; effN++; cost += p.cost || 0; }
    for (i = 0; i < boosters.length; i++) { p = PARTS[boosters[i]]; if (!p) continue; mass += p.mass; thrust += p.thrust; effSum += p.eff; effN++; cost += p.cost || 0; }
    for (i = 0; i < payloads.length; i++) { p = PARTS[payloads[i]]; if (!p) continue; mass += p.mass; cost += p.cost || 0; }

    // 终局科技：离子推进 —— 推力 +18%
    if (s && H2.hasTech(s, 't12')) thrust *= 1.18;

    var twr = mass > 0 ? thrust / mass : 0;

    // 过载：推重比超出舱体结构承受上限，结构要吃掉一部分余量
    var overload = (pod.maxTwr > 0 && twr > pod.maxTwr) ? Math.ceil(twr / pod.maxTwr) - 1 : 0;

    // 航程 = 燃料/干重比（边际递减）× 平均燃效 × 载荷与科技加成
    var avgEff = effN ? effSum / effN : 1;
    var range = 0;
    if (mass > 0 && (engines.length || boosters.length)) {
      range = SV.RANGE_K * Math.pow(fuel / mass, SV.RANGE_POW) * avgEff;
      if (payloads.indexOf('inst') >= 0) range *= 1.15;
      if (payloads.indexOf('nav') >= 0) range *= 1.30;
      if (s && H2.hasTech(s, 't11')) range *= 1.25;
      if (overload > 0) range *= Math.pow(1 - SV.OVERLOAD_FLOW, overload);
    }

    // 终局科技：低温超导 —— 起飞消耗 −12%
    var takeoff = mass * 1.5 * ((s && H2.hasTech(s, 't11')) ? 0.88 : 1);
    var climb = 42 + twr * 11;

    // 护盾：舱体 + 装甲板，再扣掉过载造成的结构损伤
    var shield0 = (pod.shield || 0) + (payloads.indexOf('armor') >= 0 ? 1 : 0);
    var shield = Math.max(0, shield0 - overload);

    var problems = [];
    if (!engines.length && !boosters.length) problems.push('没有引擎，火箭上不了天');
    else if (twr < 1.2) problems.push('推重比不足 1.2，无法脱离重力');
    if (!tanks.length) problems.push('没有燃料罐，装不了推进剂');
    else if (fuel < takeoff) problems.push('燃料不足以完成起飞（需 ' + U.fmt(takeoff) + '）');
    if (pod.fuelCap && fuel > pod.fuelCap) {
      problems.push('装了 ' + U.fmt(fuel) + ' 燃料，超过' + pod.name + '的容量上限 ' + pod.fuelCap + '——换个更大的舱体或减一个罐');
    }
    if (shield0 <= 0 && overload > 0) {
      problems.push('严重过载（推重比 ' + twr.toFixed(1) + ' > ' + pod.maxTwr + '）且没有护盾吸收应力，结构会在起飞时解体');
    }

    return {
      pod: pod, podId: d.pod || 'pod_s', tanks: tanks, engines: engines, boosters: boosters, payloads: payloads,
      mass: mass, thrust: thrust, avgEff: avgEff, twr: twr, fuel: fuel, range: range,
      takeoff: takeoff, climb: climb,
      shield: shield, shield0: shield0, overload: overload,
      cost: cost, cap: pod.cap, maxTwr: pod.maxTwr, fuelCap: pod.fuelCap || 0,
      canFly: problems.length === 0 && mass > 0,
      problems: problems
    };
  };

  // 某架火箭飞某条航段够不够格（航程 + 该航线要求的机动性）
  SV.routeBlockers = function (c, gap, haz) {
    var out = [];
    if (c.range < gap) out.push('航程 ' + U.fmt(c.range) + ' < 航段 ' + gap);
    var minTwr = SV.minTwrFor(haz);
    if (c.twr < minTwr) out.push('推重比 ' + c.twr.toFixed(2) + ' < ' + minTwr.toFixed(1) + '（危险度 ' + haz + ' 航线的机动要求）');
    return out;
  };

  // ------------------------------------------------------------
  // 任务链
  // ------------------------------------------------------------
  SV.MISSIONS = [
    { id: 'm0', name: '第一次产出', desc: '推进一回合，看看基地能产出什么。',
      check: function (s) { return s.turn >= 2; },
      reward: { metal: 8 }, rewardTxt: '金属 +8' },
    { id: 'm1', name: '点燃推进剂', desc: '在科技树中解锁「化学燃料」，让精炼岗开始产燃料。',
      check: function (s) { return s.tech.indexOf('t1') >= 0; },
      reward: { research: 6 }, rewardTxt: '科研 +6' },
    { id: 'm2', name: '第一架火箭', desc: '在装配车间装一架能飞的火箭并保存它。',
      check: function (s) { return s.saved.length >= 1; },
      reward: { fuel: 18 }, rewardTxt: '燃料 +18' },
    { id: 'm3', name: '月球，第一步', desc: '发射火箭并成功抵达月球。',
      check: function (s) { return s.arrived.indexOf('moon') >= 0; },
      reward: { metal: 45 }, rewardTxt: '金属 +45' },
    { id: 'm4', name: '月面定居', desc: '在月球建立基地，把金属产能翻倍。',
      check: function (s) { return !!s.bases.moon; },
      reward: { research: 30 }, rewardTxt: '科研 +30' },
    { id: 'm41', name: '稀有矿产', desc: '从月球远征中累计带回 24 单位钛晶——基地里挖不出这东西。',
      check: function (s) { return (s.stat.gained.ti || 0) >= 24; },
      reward: { research: 25 }, rewardTxt: '科研 +25' },
    { id: 'm5', name: '红色地平线', desc: '抵达火星。',
      check: function (s) { return s.arrived.indexOf('mars') >= 0; },
      reward: { metal: 70 }, rewardTxt: '金属 +70' },
    { id: 'm6', name: '三足鼎立', desc: '同时拥有 3 座基地。',
      check: function (s) { return U.keys(s.bases).length >= 3; },
      reward: { research: 45 }, rewardTxt: '科研 +45' },
    { id: 'm7', name: '木星之下', desc: '抵达木卫二。',
      check: function (s) { return s.arrived.indexOf('europa') >= 0; },
      reward: { metal: 120, research: 60 }, rewardTxt: '金属 +120 · 科研 +60' },
    { id: 'm71', name: '深空冰晶', desc: '累计带回 20 单位冰核，让低温超导与离子推进成为可能。',
      check: function (s) { return (s.stat.gained.ice || 0) >= 20; },
      reward: { metal: 90, research: 50 }, rewardTxt: '金属 +90 · 科研 +50' },
    { id: 'm75', name: '甲烷湖畔', desc: '抵达土卫六。',
      check: function (s) { return s.arrived.indexOf('titan') >= 0; },
      reward: { metal: 150, research: 80 }, rewardTxt: '金属 +150 · 科研 +80' },
    { id: 'm85', name: '笔尖上的星球', desc: '抵达海王星，把航线推过天王星。',
      check: function (s) { return s.arrived.indexOf('neptune') >= 0; },
      reward: { metal: 180, research: 120 }, rewardTxt: '金属 +180 · 科研 +120' },
    { id: 'm9', name: '星海尽头', desc: '抵达冥王星，把人类的坐标推到太阳系边缘。',
      check: function (s) { return s.arrived.indexOf('pluto') >= 0; },
      reward: {}, rewardTxt: '解锁结局' }
  ];

  // ------------------------------------------------------------
  // 随机事件
  // ------------------------------------------------------------
  SV.EVENTS = [
    { id: 'e_solar', kind: 'bad', w: 12, name: '太阳风暴',
      run: function (s) { var v = Math.min(s.res.research, U.irnd(4, 10)); s.res.research -= v; return '带电粒子流扫过基地，科研数据受损，科研 −' + v + '。'; } },
    { id: 'e_meteor', kind: 'good', w: 12, name: '陨石雨',
      run: function (s) { var v = U.irnd(14, 30); s.res.metal += v; return '一夜陨石雨落在基地外围，捡回大量富矿残骸，金属 +' + v + '。'; } },
    { id: 'e_break', kind: 'good', w: 11, name: '科研突破',
      run: function (s) { var v = U.irnd(8, 18); s.res.research += v; return '一组关键实验跑通了，科研 +' + v + '。'; } },
    { id: 'e_leak', kind: 'bad', w: 8, name: '管道泄漏',
      run: function (s) { var v = Math.min(s.res.fuel, U.irnd(5, 14)); s.res.fuel -= v; return '精炼厂一段管路老化，损失燃料 −' + v + '。'; } },
    { id: 'e_trade', kind: 'neutral', w: 10, name: '游商来访',
      run: function (s) { var v = Math.min(s.res.metal, U.irnd(10, 20)); s.res.metal -= v; var f = Math.round(v * 0.8); s.res.fuel += f; return '一支流浪商队路过，用 ' + v + ' 金属换了 ' + f + ' 燃料。'; } },
    { id: 'e_vein', kind: 'good', w: 10, name: '新矿脉',
      run: function (s) { var v = U.irnd(18, 34); s.res.metal += v; return '钻探队打穿了一层富矿，金属 +' + v + '。'; } },
    { id: 'e_signal', kind: 'neutral', w: 9, name: '深空信号',
      run: function (s) { var v = U.irnd(6, 14); s.res.research += v; return '射电阵截获一段重复信号，译解后带来新思路，科研 +' + v + '。'; } },
    { id: 'e_dust', kind: 'bad', w: 8, name: '沙尘暴',
      run: function (s) { var v = Math.min(s.res.metal, U.irnd(6, 14)); s.res.metal -= v; return '持续数日的沙尘磨损了设备，维修花掉金属 −' + v + '。'; } },
    { id: 'e_crew', kind: 'good', w: 9, name: '新人报到',
      run: function (s) { var b = s.bases[s.base]; if (!b) return null; b.pop.mining += 1; return '一艘补给船送来新的工程师，已安排进采矿岗。'; } },
    { id: 'e_harvest', kind: 'good', w: 9, name: '水培丰收',
      run: function (s) { var v = U.irnd(8, 18); s.res.food = (s.res.food || 0) + v; return '水培舱换了新的光照配方，这一茬长得极好，口粮 +' + v + '。'; } },
    { id: 'e_blight', kind: 'bad', w: 7, name: '培养基染菌',
      run: function (s) { var v = Math.min(s.res.food || 0, U.irnd(6, 15)); s.res.food = (s.res.food || 0) - v; return '循环管路里混进了杂菌，整架作物报废，口粮 −' + v + '。'; } },
    { id: 'e_quiet', kind: 'neutral', w: 20, name: '平静的一回合',
      run: function () { return '没有什么特别的事发生。远征大部分时候就是这样。'; } }
  ];
  SV.rollEvent = function () {
    var total = U.sum(SV.EVENTS, function (e) { return e.w; });
    var r = Math.random() * total;
    for (var i = 0; i < SV.EVENTS.length; i++) { r -= SV.EVENTS[i].w; if (r <= 0) return SV.EVENTS[i]; }
    return SV.EVENTS[SV.EVENTS.length - 1];
  };

  // ------------------------------------------------------------
  // 成就
  // ------------------------------------------------------------
  SV.ACH = [
    { id: 'a_first', ic: '▲', name: '首航', check: function (s) { return s.stat.launches >= 1; } },
    { id: 'a_clean', ic: '◎', name: '零伤抵达', check: function (s) { return s.stat.clean >= 1; } },
    { id: 'a_tech', ic: '✦', name: '全科技', check: function (s) { return s.tech.length >= SV.TECH.length; } },
    { id: 'a_base5', ic: '⌂', name: '五座基地', check: function (s) { return U.keys(s.bases).length >= 5; } },
    { id: 'a_far', ic: '➤', name: '越土星', check: function (s) { return s.arrived.indexOf('saturn') >= 0; } },
    { id: 'a_edge', ic: '➹', name: '柯伊伯之畔', check: function (s) { return s.arrived.indexOf('pluto') >= 0; } },
    { id: 'a_rich', ic: '◆', name: '千金', check: function (s) { return s.res.metal >= 500; } },
    { id: 'a_heavy', ic: '⬢', name: '重型远征', check: function (s) { return s.stat.heavyLaunch >= 1; } },
    { id: 'a_speed', ic: '⚡', name: '疾行者', check: function (s) { return s.turn <= 25 && s.arrived.indexOf('mars') >= 0; } },
    { id: 'a_rare', ic: '◈', name: '星海采掘', check: function (s) {
      var g = s.stat.gained || {};
      return (g.ti || 0) >= 20 && (g.he || 0) >= 20 && (g.ice || 0) >= 20;
    } },
    { id: 'a_pop', ic: '☗', name: '丰衣足食', check: function (s) {
      return SV.helpers.popTotal(s) >= 16 && s.res.food >= SV.helpers.foodNeed(s) * 4;
    } },
    { id: 'a_famine', ic: '⚠', name: '勒紧裤带', check: function (s) { return (s.stat.famine || 0) >= 1; } }
  ];

  // ------------------------------------------------------------
  // 存档
  // ------------------------------------------------------------
  var KEY = 'sv_save_v4';
  var KEY_OLD = 'sv_save_v3';
  var KEY_V2 = 'sv_save_v2';

  // v3 → v4：木卫二 / 土卫六的 id 从 jupiter / saturn 改为 europa / titan，
  // 腾出这两个名字给真正的木星与土星。所有引用天体 id 的字段都要一起换，
  // 否则旧档读进来会指向不存在的天体。
  var ID_MAP = { jupiter: 'europa', saturn: 'titan' };
  var remapId = function (id) { return ID_MAP[id] || id; };

  function migrateV4(s) {
    if (!s || s.v >= 4) return s;
    var nb = {}, k;
    for (k in s.bases) if (Object.prototype.hasOwnProperty.call(s.bases, k)) {
      nb[remapId(k)] = s.bases[k];
    }
    s.bases = nb;
    if (s.base) s.base = remapId(s.base);
    if (s.launchTarget) s.launchTarget = remapId(s.launchTarget);
    if (s.arrived) for (var i = 0; i < s.arrived.length; i++) s.arrived[i] = remapId(s.arrived[i]);
    s.v = 4;
    return s;
  }
  SV.migrateV4 = migrateV4;

  var store = SV.store = {
    state: null,
    fresh: function () {
      return {
        v: 4, turn: 1, base: 'earth',
        bases: { earth: { built: { mine: 1, lab: 1, refinery: 0, farm: 1, hab: 1 }, pop: { mining: 2, research: 2, refine: 0, farming: 1 } } },
        res: { metal: 34, fuel: 8, research: 0, food: 12 },
        rare: { ti: 0, he: 0, ice: 0 },
        tech: ['t0'],
        design: SV.newDesign(),
        saved: [], launchDesign: -1, launchTarget: null,
        done: [], ach: [], arrived: [], log: [],
        opts: { bgm: true },
        stat: { launches: 0, wins: 0, clean: 0, heavyLaunch: 0, crystals: 0, famine: 0, gained: { ti: 0, he: 0, ice: 0 } }
      };
    },
    load: function () {
      try {
        var raw = global.localStorage.getItem(KEY);
        if (!raw) {
          // 兼容 v3 旧档：读出来后改名再升级
          raw = global.localStorage.getItem(KEY_OLD);
          if (raw) global.localStorage.removeItem(KEY_OLD);
        }
        if (!raw) {
          // 再兼容 v2 旧档：按 v3 结构补齐后再走 v4 改名
          raw = global.localStorage.getItem(KEY_V2);
          if (raw) global.localStorage.removeItem(KEY_V2);
        }
        if (!raw) return null;
        var s = JSON.parse(raw);
        if (!s || !s.res || !s.bases) return null;
        // 补齐字段，兼容旧档
        var base = store.fresh();
        for (var k in base) if (!(k in s)) s[k] = base[k];
        if (!s.stat) s.stat = base.stat;
        if (!s.stat.gained) s.stat.gained = { ti: 0, he: 0, ice: 0 };
        if (!s.rare) s.rare = { ti: 0, he: 0, ice: 0 };
        for (var r = 0; r < SV.RARE.length; r++) {
          var rid = SV.RARE[r].id;
          if (typeof s.rare[rid] !== 'number') s.rare[rid] = 0;
          if (typeof s.stat.gained[rid] !== 'number') s.stat.gained[rid] = 0;
        }
        if (!s.design.tanks) s.design = SV.newDesign();
        if (!s.design.boosters) s.design.boosters = [];
        // 口粮系统（v3 中期加入）：补资源、水培舱与农业岗，并从别处挪一个人去种地
        if (typeof s.res.food !== 'number') s.res.food = 12;
        if (typeof s.stat.famine !== 'number') s.stat.famine = 0;
        for (var bk in s.bases) {
          var bb = s.bases[bk];
          if (!bb.built) bb.built = { mine: 1, lab: 1, refinery: 0, farm: 1, hab: 0 };
          if (!bb.pop) bb.pop = { mining: 2, research: 1, refine: 0, farming: 1 };
          if (typeof bb.built.farm !== 'number') bb.built.farm = 1;
          if (typeof bb.pop.farming !== 'number') {
            bb.pop.farming = 0;
            if (bb.pop.mining > 1) bb.pop.mining--;
            else if (bb.pop.research > 1) bb.pop.research--;
            bb.pop.farming = 1;
          }
        }
        // v3 → v4：天体改名（jupiter→europa、saturn→titan）
        migrateV4(s);
        return s;
      } catch (e) { return null; }
    },
    save: function () {
      try { global.localStorage.setItem(KEY, JSON.stringify(store.state)); } catch (e) {}
    },
    clear: function () {
      try { global.localStorage.removeItem(KEY); } catch (e) {}
      try { global.localStorage.removeItem(KEY_OLD); } catch (e) {}
      try { global.localStorage.removeItem(KEY_V2); } catch (e) {}
    },
    has: function () {
      try {
        return !!global.localStorage.getItem(KEY) ||
          !!global.localStorage.getItem(KEY_OLD) ||
          !!global.localStorage.getItem(KEY_V2);
      } catch (e) { return false; }
    }
  };

  // ------------------------------------------------------------
  // 派生状态
  // ------------------------------------------------------------
  SV.helpers = {
    hasTech: function (s, id) { return s.tech.indexOf(id) >= 0; },
    // 科技解锁校验 ------------------------------------------------
    // 返回该科技当前的稀有资源明细：[{id, need, have, lack}]
    techRare: function (s, t) {
      var out = [];
      if (!t || !t.rare) return out;
      for (var i = 0; i < SV.RARE.length; i++) {
        var r = SV.RARE[i], need = t.rare[r.id];
        if (!need) continue;
        var have = (s.rare && s.rare[r.id]) || 0;
        out.push({ id: r.id, need: need, have: have, lack: Math.max(0, need - have) });
      }
      return out;
    },
    // 只返回「还差」的部分
    techLack: function (s, t) {
      return SV.helpers.techRare(s, t).filter(function (x) { return x.lack > 0; });
    },
    techDepsOk: function (s, t) {
      for (var i = 0; i < t.deps.length; i++) if (!SV.helpers.hasTech(s, t.deps[i])) return false;
      return true;
    },
    // 前置 + 科研 + 稀有资源全部满足
    techReady: function (s, t) {
      if (SV.helpers.hasTech(s, t.id)) return false;
      if (!SV.helpers.techDepsOk(s, t)) return false;
      if (s.res.research < t.cost) return false;
      return SV.helpers.techLack(s, t).length === 0;
    },
    // 给人看的缺口文案
    techLackText: function (s, t) {
      var lk = SV.helpers.techLack(s, t);
      var parts = [];
      for (var i = 0; i < lk.length; i++) parts.push(SV.rareById(lk[i].id).name + ' 还差 ' + lk[i].lack);
      return parts.join('、');
    },
    // 带回稀有资源（远征结算用）
    gainRare: function (s, id, n) {
      if (!s.rare) s.rare = { ti: 0, he: 0, ice: 0 };
      if (!s.stat.gained) s.stat.gained = { ti: 0, he: 0, ice: 0 };
      s.rare[id] = (s.rare[id] || 0) + n;
      s.stat.gained[id] = (s.stat.gained[id] || 0) + n;
      return n;
    },
    // 远征可带回量：首访给 first，之后每次给 per
    rareYield: function (s, pl, firstVisit) {
      if (!pl.rare) return null;
      return { id: pl.rare.id, n: firstVisit ? pl.rare.first : pl.rare.per, first: !!firstVisit };
    },
    curBase: function (s) { return s.bases[s.base]; },
    popMax: function (s) { var b = SV.helpers.curBase(s).built; return SV.POP_BASE + (b.hab || 0) * SV.HAB_POP; },
    popTotal: function (s) {
      var p = SV.helpers.curBase(s).pop, t = 0;
      for (var i = 0; i < SV.JOBS.length; i++) t += (p[SV.JOBS[i].key] || 0);
      return t;
    },
    // 每回合吃掉的量 —— 按在岗人数算，所以「养不起」是人口的真实上限
    foodNeed: function (s) { return SV.helpers.popTotal(s) * SV.EAT_PER_POP; },
    jobCap: function (s, job) {
      var b = SV.helpers.curBase(s).built;
      if (job === 'mining') return 1 + (b.mine || 0);
      if (job === 'research') return 1 + (b.lab || 0);
      if (job === 'refine') return SV.helpers.hasTech(s, 't1') ? (1 + (b.refinery || 0)) : 0;
      if (job === 'farming') return 1 + (b.farm || 0);
      return 1;
    },
    produce: function (s) {
      var p = SV.helpers.curBase(s).pop;
      var pl = SV.planetById(s.base) || PLANETS[0];
      var m = pl.mod;
      return {
        metal: p.mining * SV.helpers.jobCap(s, 'mining') * 2 * m.metal,
        research: p.research * SV.helpers.jobCap(s, 'research') * 1.5 * m.research,
        // 精炼系数 1.8：与采矿 2 / 科研 1.5 对等。发射按整箱燃料扣费，
        // 精炼太弱会让长途远征变成几十回合的干等。
        fuel: p.refine * SV.helpers.jobCap(s, 'refine') * 1.8 * m.fuel,
        food: p.farming * SV.helpers.jobCap(s, 'farming') * SV.FOOD_COEFF * (m.food || 1)
      };
    },
    // 本回合口粮收支：产出 − 吃掉。负数即为短缺
    foodNet: function (s) { return SV.helpers.produce(s).food - SV.helpers.foodNeed(s); },
    planetUnlocked: function (s, pl) {
      if (!pl.tech) return true;
      if (!SV.helpers.hasTech(s, pl.tech)) return false;
      if (pl.needBase && !s.bases[pl.needBase]) return false;
      return true;
    },
    // 人力重分配：设定某岗位人数，余量按当前比例摊给其余岗位。
    // 写成 N 岗位通用 —— 加农业岗后「其余岗位」有 3 个，原来写死两个的写法会直接错。
    setJob: function (s, job, n) {
      var p = SV.helpers.curBase(s).pop;
      var max = SV.helpers.popMax(s);
      var cap = SV.helpers.jobCap(s, job);
      n = U.clamp(Math.round(n), 0, Math.min(max, cap));
      p[job] = n;

      var others = SV.JOBS.filter(function (j) { return j.key !== job; });
      var i, k;
      var caps = [];
      for (i = 0; i < others.length; i++) caps.push(SV.helpers.jobCap(s, others[i].key));

      var rest = max - n;
      var alloc = [];
      var curSum = 0;
      for (i = 0; i < others.length; i++) curSum += (p[others[i].key] || 0);

      if (curSum <= 0) {
        // 其余岗位都是空的：先均分，余数给前面的
        var each = Math.floor(rest / others.length);
        for (i = 0; i < others.length; i++) alloc.push(each);
        alloc[0] += rest - each * others.length;
      } else {
        for (i = 0; i < others.length; i++) alloc.push(Math.round((p[others[i].key] || 0) / curSum * rest));
      }

      // 按岗位位上限裁剪，多出来的收回来
      var left = rest;
      for (i = 0; i < others.length; i++) {
        if (alloc[i] > caps[i]) alloc[i] = caps[i];
        if (alloc[i] < 0) alloc[i] = 0;
        left -= alloc[i];
      }
      // 把收回来的量顺延给还没满的岗位
      var guard = 0;
      while (left > 0 && guard++ < 64) {
        var moved = false;
        for (i = 0; i < others.length && left > 0; i++) {
          if (alloc[i] < caps[i]) { alloc[i]++; left--; moved = true; }
        }
        if (!moved) break; // 全顶到上限了，剩下的人闲置
      }
      // 若按比例分超了（舍入导致），从有余量的岗位里回收
      guard = 0;
      while (left < 0 && guard++ < 64) {
        var took = false;
        for (i = 0; i < others.length && left < 0; i++) {
          if (alloc[i] > 0) { alloc[i]--; left++; took = true; }
        }
        if (!took) break;
      }

      for (k = 0; k < others.length; k++) p[others[k].key] = alloc[k];
    },
    fixPop: function (s) {
      var p = SV.helpers.curBase(s).pop;
      var max = SV.helpers.popMax(s);
      var jobs = SV.JOBS, i;
      for (i = 0; i < jobs.length; i++) {
        if (typeof p[jobs[i].key] !== 'number') p[jobs[i].key] = 0;
        var cap = SV.helpers.jobCap(s, jobs[i].key);
        if (p[jobs[i].key] > cap) p[jobs[i].key] = cap;
      }
      var sum = SV.helpers.popTotal(s);
      if (sum > max) {
        // 从人最多的岗位开始裁，直到总数达标
        var guard = 0;
        while (SV.helpers.popTotal(s) > max && guard++ < 64) {
          var big = jobs[0].key;
          for (i = 1; i < jobs.length; i++) if (p[jobs[i].key] > p[big]) big = jobs[i].key;
          if (p[big] <= 0) break;
          p[big]--;
        }
      }
    }
  };

})(window);
