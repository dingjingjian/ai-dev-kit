/*
 * air-tycoon — sim.js
 * 回合制经营状态机 / 航线网络 / 城市发展飞轮 / 竞对 AI 竞争 / 季度结算
 * 依赖：data.js（CONFIG、城市、机型、事件卡）→ geo.js（大圆距离）
 * 命名空间：window.AT（经典脚本，无 import/export/type=module）
 *
 * 设计约束（沿用 defcon 的三条硬约束，这是它能被无头测试的前提）：
 * - 逻辑 10 Hz 固定步长，渲染 60 fps 插值 —— 固定步长让经营结果完全确定。
 * - 所有随机走 state.rng（种子化 mulberry32），同种子同输入必然同结果。
 * - 本文件不含任何 THREE / DOM 依赖，可在纯 Node 下跑完一整局。
 * - 不做网络、不做计时器；推进完全由外部调用 tick(state, dt) 驱动。
 *
 * ── 核心飞轮（「交通促进地区发展」的数值表达）──
 *   开通航线 → 运送旅客 → 城市开发度 dev 上涨 → 城市升级
 *   → 该城需求倍率 levelDemandMul 放大 → 相邻航线客流变大 → 再开新线
 * 反向也成立：航线关停 → dev 自然衰减 → 城市退化 → 需求萎缩。
 * 这条正反馈是本作与「纯粹算航线利润」的模拟经营的分野所在。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};
  var CONFIG = AT.CONFIG || {};
  var G = AT.geo;

  var TICK = 0.1;                 // 10 Hz 固定步长（秒）
  var RAD2DEG = 180 / Math.PI;

  /* ───────────────────────── 1. 确定性随机 ───────────────────────── */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randRange(rng, lo, hi) { return lo + (hi - lo) * rng(); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  /* ───────────────────────── 2. 建局 ───────────────────────── */

  /* opts:
   *   seed          —— 随机种子（不传则用默认，便于复现）
   *   companyName   —— 玩家公司名（开局自定义；不传则用默认值）
   *   homeCityId    —— 基地城市 id（玩家在 Setup 界面选的「虚拟公司总部」）
   *   autoPlayer    —— 玩家席位交给 AI 托管（无头测试 / 无人值守演示）
   *   rivalCount    —— 竞对数量（默认 CONFIG.rivals）
   */
  function create(opts) {
    opts = opts || {};
    var seed = (opts.seed != null) ? opts.seed : 20260914;
    var homeId = opts.homeCityId || 'C01';

    var state = {
      seed: seed,
      rng: makeRng(seed),
      phase: 'briefing',        // briefing → operating → over
      t: 0,                     // 当前阶段已过秒数
      quarter: 0,               // 当前回合（季度）
      speed: 1,
      autoPlayer: !!opts.autoPlayer,
      companyName: opts.companyName || '环球航空',
      homeCityId: homeId,
      /* 全局修正器：事件卡的持续效果挂在这里，每回合递减。
       * 分开存是为了让 UI 能直接显示「当前生效的几项影响」，玩家看得见因果。 */
      mods: [],                 // { type, mult, turns, region?, note }
      groundUntil: [],          // { planeId, until } 停场飞机
      priceWars: [],            // { routeKey, until, mult } 竞对挑起的价格战
      cities: [],
      routes: [],
      planes: [],               // 玩家机队
      rivals: [],
      fleet: [],                // 玩家机队的机位分配（每回合结算后重算）
      events: [],
      card: null,               // 当前事件卡（无事件时为 null）
      choice: null,             // 玩家对当前事件卡的选择
      eventCount: 0,
      nextEventAt: 0,
      routeSeq: 0,
      planeSeq: 0,
      log: [],
      fx: [],                   // 特效事件队列（render.js 消费）
      /* 累计经营指标（终局复盘与审计用） */
      stats: {
        paxTotal: 0, cashEarned: 0, cashSpent: 0,
        routesOpened: 0, routesClosed: 0, planesBought: 0,
        devPushed: 0, citiesUpgraded: 0
      },
      history: []               // 每回合快照（用于终局画出成长曲线）
    };

    /* ── 城市 ──
     * 每城持有一个 dev（开发度）。初始 level 由 dev0 推出。
     * demandBoost 记录「本城因通航而获得的额外需求」—— 飞轮的直接产物。 */
    AT.CITIES.forEach(function (c) {
      var dev = c.dev0;
      state.cities.push({
        id: c.id, region: c.region, name: c.name,
        lat: c.lat, lon: c.lon,
        pop0: c.pop, pop: c.pop,
        wealth: c.wealth, hub: !!c.hub,
        dev0: dev, dev: dev,
        level: AT.levelOf(dev),
        level0: AT.levelOf(dev),
        bonus: 0,                // 通航带来的额外需求（飞轮累积）
        routes: 0,               // 当前通航的航线数（每回合由 recalcCityRoutes 刷新）
        paxLast: 0,              // 上回合经停客流（驱动 dev 增长的主力）
        isHome: c.id === homeId
      });
    });

    /* ── 竞对航空公司 ──
     * 没有国家，竞争者就是同行。每家有一个母城、资金、以及「激进程度」。
     * 它们会抢热门航线、发起价格战；玩家无法消灭它们，只能超越。 */
    var nRiv = (opts.rivalCount != null) ? opts.rivalCount : (CONFIG.rivals || 5);
    var rivals = [];
    /* 母城挑选：从**非玩家基地**的枢纽城里，按人口×富裕度排序取前 nRiv 个，
     * 且尽量分散到不同地区 —— 五家竞对挤在同一地区会让全球网络缺乏张力。 */
    var hubPool = state.cities.filter(function (c) { return c.hub && !c.isHome; })
      .sort(function (a, b) { return (b.pop * b.wealth) - (a.pop * a.wealth); });
    var usedRegions = {};
    for (var hi = 0; hi < hubPool.length && rivals.length < nRiv; hi++) {
      var hc = hubPool[hi];
      // 优先选尚未被占用的地区，凑不齐再放宽
      if (usedRegions[hc.region] && rivals.length < nRiv - 1) continue;
      usedRegions[hc.region] = 1;
      rivals.push({
        id: 'R' + (rivals.length + 1),
        name: RIVAL_NAMES[rivals.length % RIVAL_NAMES.length],
        homeCityId: hc.id,
        cash: (CONFIG.rivalStartCash && CONFIG.rivalStartCash[rivals.length]) || 1000,
        aggression: (CONFIG.rivalAggression && CONFIG.rivalAggression[rivals.length]) || 0.55,
        fleet: [],
        routes: [],
        scale: 0,                 // 综合规模（终局排名用）
        alive: true,
        lastAction: null
      });
    }
    // 竞对开局机队（按资金能负担的机型给）
    rivals.forEach(function (r) {
      r.fleet.push({ type: CONFIG.startPlaneType, count: 2 + Math.floor(r.cash / 1200) });
    });
    state.rivals = rivals;

    /* ── 玩家开局：单基地 + 少量飞机 ──
     * 用户定稿「单基地虚拟公司」：总部一座城，2 架支线机，800 万资金。
     * 飞机构造出来先闲置，由玩家在 UI 里指派到航线 —— 开局即做第一个决策。 */
    var nStart = CONFIG.startPlanes || 2;
    for (var pi = 0; pi < nStart; pi++) {
      state.planes.push(makePlane(state, CONFIG.startPlaneType));
    }

    // 玩家初始资金（开局自带 2 架飞机的价值不计入现金）
    state.cash = CONFIG.startCash || 800;
    state.debt = 0;
    state.equityLoss = 0;         // 接受注资带来的股权稀释累计
    state.reputation = 50;        // 品牌声誉 0..100，影响需求与票价承受力

    // 首位事件卡：开局第 4 回合之后才可能出现，给玩家喘息时间熟悉操作
    state.nextEventAt = 4 + Math.floor(state.rng() * 3);

    log(state, '公司「' + state.companyName + '」成立于 ' + cityName(state, homeId) +
              '，机队 ' + nStart + ' 架，启动资金 ' + state.cash + ' 万元');

    return state;
  }

  /* 竞对名池（虚构，不影射任何真实航司） */
  var RIVAL_NAMES = ['天穹航空', '蓝翼航空', '跨洲快线', '恒星航空', '云海集团', '新航路航空'];

  function makePlane(state, typeId) {
    var T = AT.planeOf(typeId);
    return {
      id: 'P' + (state.planeSeq++),
      type: typeId,
      reg: 'AT-' + String(1000 + state.planeSeq),
      routeKey: null,           // 当前执飞的航线（null = 闲置）
      ageQ: 0,                  // 机龄（季度），影响残值
      onGround: 0               // 剩余停场回合（罢工/检修）
    };
  }

  /* ───────────────────────── 3. 查找辅助 ───────────────────────── */

  function findCity(state, id) {
    for (var i = 0; i < state.cities.length; i++) if (state.cities[i].id === id) return state.cities[i];
    return null;
  }
  function cityName(state, id) {
    var c = findCity(state, id);
    return c ? c.name : id;
  }
  function findPlane(state, id) {
    for (var i = 0; i < state.planes.length; i++) if (state.planes[i].id === id) return state.planes[i];
    return null;
  }
  function findRoute(state, a, b) {
    var k = AT.routeKey(a, b);
    for (var i = 0; i < state.routes.length; i++) if (state.routes[i].key === k) return state.routes[i];
    return null;
  }
  function findRouteByKey(state, key) {
    for (var i = 0; i < state.routes.length; i++) if (state.routes[i].key === key) return state.routes[i];
    return null;
  }
  function routeDistance(state, a, b) {
    var ca = findCity(state, a), cb = findCity(state, b);
    if (!ca || !cb) return 0;
    return G.distKm(ca, cb);
  }
  // 玩家某条航线上的飞机
  function planesOnRoute(state, key) {
    return state.planes.filter(function (p) { return p.routeKey === key && p.onGround <= 0; });
  }
  // 未指派航线的飞机
  function idlePlanes(state) {
    return state.planes.filter(function (p) { return !p.routeKey && p.onGround <= 0; });
  }
  // 全机队座位总数
  function totalSeats(state) {
    return state.planes.reduce(function (s, p) { return s + AT.planeOf(p.type).seats; }, 0);
  }

  /* 资产的机队残值：按机龄折旧，每季度 3.2%。
   * 用于净资产计算（终局排名与购机决策的参考量）。 */
  function fleetValue(state, planes) {
    planes = planes || state.planes;
    return planes.reduce(function (s, p) {
      var T = AT.planeOf(p.type);
      return s + T.price * Math.pow(0.968, p.ageQ);
    }, 0);
  }

  /* 净资产 = 现金 − 负债 + 机队残值
   * 这是终局排名的核心指标（比单纯比现金更公平：重资产与轻资产可以比较）。 */
  function netWorth(state) {
    return state.cash - state.debt + fleetValue(state);
  }

  /* ───────────────────────── 4. 需求模型（飞轮的第一半）─────────────────────────

   * 一条航线的季度客流 = 人口渗透率天花板 × 修正器
   *
   * ⚠ 2026-09-14 重写：**单一来源 = 人口渗透率**。
   *
   * 首版是「乘积幂」模型：demand = baseDemand × (popA×popB)^0.31 × …，
   * 它有两个致命问题：
   *   ① 无上限 —— 上海(24.9M)-东京(37.4M) 算出 1.0+ 百万客/季度，
   *      一季运走两市 1/8 人口，导致运力顶格满载、利润率 60~75%；
   *   ② 与真实数据无法对齐 —— 该模型的量级完全由 baseDemand 这个魔数决定，
   *      改一个参数全盘漂移，无法用「真实航线客流」反推标定。
   *
   * 改用**现实锚定**的模型：两城之间的季度航空出行量 ≈ 两端人口之和 × 渗透率。
   *   cap = POP_REF × penRate × (popSum/POP_REF)^penPopExp × lvF × bonusF × distAdj
   *
   * 锚点（伦敦-纽约，全球最忙洲际干线）：popSum = 29.2M，季度客流 ≈ 1.0 百万客
   *   → 30 × penRate = 1.0  →  penRate = 0.033
   *
   * 各因子的现实含义：
   *   (popSum/POP_REF)^penPopExp —— penPopExp=0.9 表示渗透率随城市规模轻微递减
   *       （小城市人均航空出行率反而高于人口占比所暗示的水平）。
   *       恒 <1，故大城市对永远比小城市对大 —— 天然形成「枢纽 vs 支线」的层次。
   *   lvF   —— 城市等级倍率的几何平均。城市升级 → 天花板抬高 → 飞轮成立。
   *   bonusF—— 通航累积的城市增长红利。
   *   distAdj—— 长途线人流略少（0.80~1.00），但洲际仍有刚需底盘。
   *
   * 距离衰减不再需要单独的 distF 乘数：真实数据里「短途高频」的现象已经由
   * 渗透率本身包含（同一个城市对之间的出行总量就是那么多），
   * 再乘一次 distF 反而是重复计算 —— 这正是首版长途线虚高的成因之一。
   */
  function routePotential(state, aId, bId) {
    var ca = findCity(state, aId), cb = findCity(state, bId);
    if (!ca || !cb) return 0;
    var C = AT.CONFIG;

    /* 两端人口之和 —— 天花板的一阶驱动量 */
    var popSum = ca.pop + cb.pop;

    /* 城市等级因子：两端等级倍率的几何平均 —— 「交通促进发展」的收益落在这里 */
    var lvF = Math.sqrt(AT.levelDemandMul(ca.level) * AT.levelDemandMul(cb.level));

    /* 飞轮加成：城市因通航而累积的 bonus（dev 超过初值的部分转化而来） */
    var bonusF = 1 + (ca.bonus + cb.bonus) / 2;

    /* 声誉：50 为中性，每偏离 1 点影响 0.5% 需求 */
    var repF = 1 + (state.reputation - 50) * 0.005;

    /* 长途折减：把距离换算成 0.80~1.00 的温和系数（不重复表达「短途高频」） */
    var dist = G.distKm(ca, cb);
    var distAdj = 0.80 + 0.20 / (1 + Math.pow(dist / 9000, 0.8));

    /* 富裕度 —— 航空出行率的二阶驱动量。
     *
     * ⚠ 这是 2026-09-14 标定的关键发现（tools/fit-demand.js）。
     *   只看人口时，「人口多但穷」的城市对被系统性高估：
     *     内罗毕-开罗 每百万人口仅 2.43 客流，而迪拜-伦敦是 41.44 —— 差 17 倍，
     *     人口无法解释，收入能解释：航空出行是**收入弹性 >1** 的消费
     *     （恩格尔规律：收入越高，旅行支出占比越高）。
     *
     * 指数 3.2 来自对 11 条真实航线的对数空间回归（R²=0.80）：
     *   样本 = Jetpunk「全球最忙国际航线日班次」(2024-11) 等公开数据，
     *          季度客流 = 日班次 × 90 × 平均座位 × 客座率。
     * 基准 wealth 取 1.15（全球均值），使 wealthF 在中位城市对上 ≈ 1。
     *
     * ⚠ 注意：指数 3.2 偏大（接近立方），意味着富裕城市对的需求优势被强烈放大。
     *   这在「真实客流拟合」上是最优解，但玩家视角下会让「发达国家航线」明显
     *   优于「新兴市场航线」，削弱策略多样性。若后续试玩觉得单调，
     *   优先下调这个指数（2.0~2.4 更均衡），而不是动人口指数。 */
    var wealthF = Math.pow(Math.max(0.4, (ca.wealth + cb.wealth) / 2) /
      (C.wealthRef == null ? 1.15 : C.wealthRef), (C.wealthExp == null ? 3.2 : C.wealthExp));

    var POP_REF = 30;                          /* 锚点人口规模（百万），与 penRate 联动 */
    var penExp = (C.penetrationPopExp == null ? 0.9 : C.penetrationPopExp);
    var penRate = (C.penetrationRate == null ? 0.0126 : C.penetrationRate);

    var demand = POP_REF * penRate *
      Math.pow(popSum / POP_REF, penExp) *
      lvF * bonusF * repF * distAdj * wealthF;

    demand *= modMul(state, 'demand_all', null, ca, cb);
    return Math.max(0, demand);
  }

  /* 事件修正器查询：把所有生效中的同类修正连乘。
   * region 传 null 表示只取全局修正；传地区码时再乘该地区的修正。
   * ca/cb 传航线两端城市时，地区修正匹配任一端所属地区（demand_region 落点）。 */
  function modMul(state, type, region, ca, cb) {
    var m = 1;
    for (var i = 0; i < state.mods.length; i++) {
      var d = state.mods[i];
      if (d.type !== type) continue;
      if (d.region) {
        if (d.region === region) { m *= (1 + d.mult); continue; }
        if (ca && d.region === ca.region) { m *= (1 + d.mult); continue; }
        if (cb && d.region === cb.region) { m *= (1 + d.mult); continue; }
        continue;
      }
      m *= (1 + d.mult);
    }
    return Math.max(0.2, m);
  }

  /* 运营成本修正（油价等）—— 与需求修正同一套机制 */
  function costMul(state) {
    var m = 1;
    for (var i = 0; i < state.mods.length; i++) {
      var d = state.mods[i];
      if (d.type === 'cost_all') m *= (1 + d.mult);
    }
    return Math.max(0.3, m);
  }

  /* ───────────────────────── 5. 航线结算（一个季度的完整账）─────────────────────────

   * 每条航线的季度账目分四块：
   *   ① 运力   = 该航线上飞机数 × 座位数 × 每季度可飞班次
   *   ② 客流   = min(潜在需求, 运力) × 客座率修正 × 成熟度
   *   ③ 收入   = 客流 × 单人票价（含商务舱溢价）
   *   ④ 成本   = 油耗 + 起降费 + 机组 + 维护
   * 返回明细对象，供 UI 逐项展示 —— 玩家要能看懂「这条线到底赚不赚」。
   */
  /* 频次档位查询：把「每日 N 班」换算成季度班次 */
  function tierOf(perDay) {
    var tiers = CONFIG.freqTiers || [];
    var best = tiers[0] || { perDay: 1, label: '每日 1 班' };
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].perDay === perDay) return tiers[i];
      if (tiers[i].perDay <= perDay) best = tiers[i];
    }
    return best;
  }

  /* 单条航线的季度班次 = 每日班次 × 90 天。
   *
   * ⚠ 2026-09-14 重写（用户拍板的「频次档位」玩法）：
   *   旧版 quarterFlights 把一架飞机的产能限定为「一天最多飞几个往返」，
   *   于是「一架机」= 一天 2.2 个往返 —— 这既不真实（真实窄体机一天 6~8 航段），
   *   也让「一架机撑起一条干线」变成不可能，逼出堆几十架飞机的荒谬循环。
   *
   *   新版把「架数」与「频次」解耦：运力 = 飞机数 × 每日班次 × 座位数，
   *   每日班次由玩家选的档位决定（1/3/6/12/20），单架最高 6 班。
   *   这样一架飞机就能撑起像样的业务，想再扩就买第二架。 */
  function routeFlights(perDay) {
    var p = Math.max(1, Math.min(CONFIG.routeMaxPerDay || 20, perDay || 1));
    return Math.round(p * 90);
  }

  /* 机型在该航线上「单架班次/日」的物理上限 ——
   * 由**日利用率**决定：航程越远，一天能飞的航段越少。
   *
   * 口径校准（2026-09-14，对齐真实航司利用率）：
   *   真实窄体机日利用率 9~11 小时（含过站），宽体机 13~15 小时（洲际线红眼航班）。
   *   本函数用「可用轮挡小时 / 单往返耗时」算往返数，再折算成单向班次。
   *
   *   标定样例（信风320 / 840km/h）：
   *     875km  → 单程 1.04h，往返+过站 3.9h → 10.5/3.9 ≈ 2 往返 ≈ 4 班/日  ✓真实
   *     1755km → 单程 2.09h，往返+过站 6.0h → 10.5/6.0 ≈ 1 往返 ≈ 2 班/日
   *       （真实上海-东京单架机一天约 1~2 个往返，与本式一致）
   *     5570km → 单程 6.63h，往返+过站 18.3h → 10.5/18.3 <1 → 至少 1 班/日
   *   （洲际线靠机组轮换做到「一天一班」，故下限锁 1 班 —— 这是宽体机的红眼常态）
   */
  function maxPerDayFor(planeType, dist) {
    var T = AT.planeOf(planeType);
    /* 可用轮挡小时：日利用率 × 过站弹性。窄体短线可多过站，宽体远程少过站。 */
    var blockHours = dist > 6000 ? 15.0 : (dist > 2000 ? 11.0 : 10.5);
    var legH = dist / Math.max(1, T.speed);
    var turnaround = dist > 6000 ? 5.0 : (dist > 2000 ? 3.0 : 1.8);
    var perRound = legH * 2 + turnaround;
    if (perRound <= 0.1) perRound = 0.5;
    var rounds = blockHours / perRound;                // 一天能飞的往返数（可含小数）
    /* 每个往返 = 往返各一班 → 单向班次 = 往返数 × 2，向上取整到整数班 */
    var byPlane = Math.max(1, Math.round(rounds * 2));
    return Math.min(CONFIG.maxPerDayPerPlane || 6, byPlane);
  }

  /* 航线时段槽位 —— 一条航线双向合计的「每日总班次」供给上限。
   *
   * 这是本作的**扩张终点**：需求永远吃不完（真实客流本身就远大于单个航司的运力），
   * 但机场的时刻资源是硬的。玩家把一条线的槽位用满之后，
   * 再加飞机不会增加任何运力，只能换更大的机型 ——
   * 这就是真实航司的成长路径（伦敦-纽约从 737 换到 777 再换到 A380）。
   *
   * 拥挤度来源（两端取平均，都是公开可感知的属性）：
   *   · hub 属性 —— 天然枢纽机场的时刻天然紧张（希思罗、羽田、肯尼迪）
   *   · 城市等级 —— 越发达的城市空中交通越繁忙（飞轮带动，等级涨则槽位紧）
   *
   * ⚠ 为什么槽位会随城市等级**下降**：这是刻意的反直觉设计 ——
   *   玩家养线把城市养发达了（这是「交通促进发展」的收益），
   *   但发达之后的机场开始拥堵，同一航线的航班增量被压缩。
   *   于是玩家面临真实的两难：**是继续在成熟航线上加密（受槽位限制），
   *   还是去开新的未开发航线（槽位宽松但需求薄）**。
   *   这正是现实中航司的战略取舍，比无限堆机有意思得多。
   */
  function routeSlots(state, aId, bId) {
    var ca = findCity(state, aId), cb = findCity(state, bId);
    if (!ca || !cb) return CONFIG.slotBase || 42;
    /* 拥挤度 0（通畅）~ 1（极度饱和）：枢纽 + 发达城市 = 拥挤 */
    function crowd(c) {
      var byHub = c.hub ? 0.34 : 0.10;
      var byLevel = Math.max(0, (c.level - 1)) / 4 * 0.34;   // Lv1→0，Lv5→0.34
      return Math.min(1, byHub + byLevel);
    }
    var c = (crowd(ca) + crowd(cb)) / 2;
    var base = CONFIG.slotBase == null ? 42 : CONFIG.slotBase;
    var exp = CONFIG.slotCrowdExp == null ? 0.85 : CONFIG.slotCrowdExp;
    /* 拥挤度越高，可分配槽位越少 */
    var slots = base * Math.pow(1 - c, exp);

    /* ⚠ 扣除竞对已占用的时刻（2026-09-14 补）——
     * 这是让「竞争」真正有意义的最后一环。
     * 此前槽位只由城市属性决定，竞对在同一条线上开多少航班都不影响玩家 ——
     * 于是「抢先占位」这个真实航司最重要的战略完全没有体现在游戏里，
     * 玩家也没有动机去「抢在竞对之前开线」。
     *
     * 现在：竞对在该线上的运力会吃掉一部分时刻资源。
     * 效果：
     *   · 玩家晚一步开线 → 可分配槽位更少 → 运力上限更低（先手优势）✓
     *   · 竞对越多 → 干线越挤 → 逼玩家转去未开发市场（符合真实干线拥挤）✓
     *   · 双寡头线上双方互相挤占（玩家加运力也会让竞对难受，虽然它们不抱怨）✓
     *
     * 口径：竞对按「每日班次」占用槽位（与玩家的 perDay 同口径）。
     * 注意这里只算竞对的**航班数**，不算它们的机型大小 ——
     * 槽位是「起降时刻」，与飞机大小无关（真实世界里一架 A380 和一个 E175
     * 各占一个时刻），所以这个口径是正确的。 */
    var occupied = 0;
    state.rivals.forEach(function (r) {
      if (!r.alive) return;
      r.routes.forEach(function (rk) {
        if (rk.key === AT.routeKey(aId, bId)) {
          occupied += Math.max(1, rk.perDay || 1);
        }
      });
    });
    slots = slots - occupied;
    slots = Math.max(CONFIG.slotMinPerDay || 6, Math.min(CONFIG.slotMaxPerDay || 60, slots));
    return slots;
  }

  function settleRoute(state, route) {
    var ca = findCity(state, route.a), cb = findCity(state, route.b);
    if (!ca || !cb) return null;
    var dist = G.distKm(ca, cb);
    var T = AT.planeOf(route.type);

    var planes = planesOnRoute(state, route.key);
    var nPlanes = planes.length;

    /* ① 排班 —— 「频次档位」模型（2026-09-14 用户拍板）
     *
     * 玩家对每条航线选一个频次档位（每架每日 1/3/6/12/20 班），
     * 航线总运力 = 飞机数 × 每架每日班次 × 座位数。
     *
     * ⚠ 语义要钉死（2026-09-14 修）：「档位」的物理含义是**每架飞机的日排班**，
     *   不是整条航线的总班次。这样：
     *     · 玩家加飞机 → 同样档位下运力与班次同步翻倍（符合直觉）；
     *     · 「每架最高 6 班」（maxPerDayPerPlane）是物理利用率上限，
     *       想再加密只能加飞机 —— 这正是本作鼓励扩张的机制；
     *     · 航线总班次上限 20 班/日是安全阀（routeMaxPerDay）。
     *
     *   ⚠ 早先一版把 flights 当成「整条线总班次」，再除以架数求「每架班次」，
     *   又在 capacity 里乘回架数 —— 两次操作互相抵消，导致
     *   **加再多飞机运力也不涨**（4 架与 20 架容量完全相同），
     *   是极隐蔽的严重 bug：玩家买飞机花钱却看不到运力变化。
     *   现在的写法只做一次乘法（perPlane → 总班次），不会再抵消。
     *
     * 这个设计同时解决了三个问题：
     *   ① 量级矛盾 —— 一架机标「每日 6 班」= 540 班/季，
     *      是旧版（198 班/季）的 2.7 倍，让「一架机撑起一条干线」成为可能；
     *   ② 操作粒度 —— 玩家调的是「每日几班」这个直观概念，不是抽象的运力数字；
     *   ③ 扩张决策 —— 单架最高 6 班，想吃更多市场必须买第二架、第三架。
     *
     * 频次受两个上限约束：
     *   · 单架机型物理上限（maxPerDayFor：洲际宽体一天只能飞 1~2 个往返）
     *   · 航线总上限（routeMaxPerDay = 20 班/日）
     */
    var nP = Math.max(1, nPlanes);
    /* 每架每日班次（档位值），先按单架物理上限夹一次 */
    var perPlanePerDay = Math.max(1, Math.min(
      maxPerDayFor(route.type, dist),
      route.perDay || CONFIG.defaultFreqPerDay || 3
    ));
    /* 单架机型每日物理上限（洲际宽体一天只飞 1~2 班） */
    var perDayCap = maxPerDayFor(route.type, dist) * nP;
    /* ③ 航线时段槽位 —— 真实民航的「供给天花板」（2026-09-14 补）
     *
     * ⚠ 这是扩张终点的落点。玩家能做的运力（0.08~0.14 百万客/季）远小于
     *   市场需求（0.19~2.75），所以需求永远不会成为约束；
     *   真正卡住玩家的是**机场时刻**。槽位用满后：
     *     · 加飞机 → 总班次不再增长（被槽位夹住），却仍付持有成本 → 亏
     *     · 换大机型 → 同槽位运更多客 → 唯一出路（机型升级链的意义）
     *   这条约束同时让「加机边际收益递减」自然成立 ——
     *   此前它是恒定的（堆机纯线性放大），玩家没有取舍。
     *
     * 注意两个上限的分工（不要混为一谈）：
     *   perDayCap  = 物理利用率上限（机型 × 架数，飞不快就是飞不快）
     *   slotCap    = 时刻供给上限（整条线的硬天花板，与机型无关）
     *   实际每日班次取两者与「档位 × 架数」的最小值。 */
    var slotCap = routeSlots(state, route.a, route.b);
    /* ⚠ 班次必须是整数（真实航班没有「9.87 班/日」）。
     * 槽位由拥挤度幂律算出，天然是小数，这里向下取整 ——
     * 取整方向选「向下」而非「四舍五入」：宁可少给一班也不能超发时刻。 */
    slotCap = Math.floor(slotCap);
    var perDay = Math.max(1, Math.min(
      CONFIG.routeMaxPerDay || 20,
      slotCap,
      perPlanePerDay * nP
    ));
    /* 槽位是否已被顶满（UI 提示：「该线时刻已饱和，请换更大机型」） */
    var slotTight = slotCap <= 1e-9 ? false : (perPlanePerDay * nP >= slotCap - 1e-9);
    var flights = routeFlights(perDay);
    var flightsPerPlane = Math.round(flights / nP);

    var potential = routePotential(state, route.a, route.b);

    /* 成熟度：新线前几季度客流打折，逼玩家养线而不是开完就走 */
    var mature = Math.min(1, (CONFIG.routeMaturityFloor || 0.45) +
      (1 - (CONFIG.routeMaturityFloor || 0.45)) *
      Math.min(1, route.ageQ / Math.max(1, CONFIG.routeMaturityQuarters || 6)));

    /* 客座率：基准 ± 定价弹性 ± 声誉（这是「按现有运力能卖出多少座」的比例） */
    var lf = (CONFIG.loadFactorBase || 0.74)
      + (state.reputation - 50) * 0.0028
      - (route.fareMul - 1) * (CONFIG.loadFactorPriceK || 0.9) * 0.22;
    lf = Math.max(0.28, Math.min(0.96, lf));

    /* 竞对分流：同航线若竞对也在飞，双方分客流（按运力占比） */
    var rivalCap = 0;
    state.rivals.forEach(function (r) {
      if (!r.alive) return;
      r.routes.forEach(function (rk) {
        if (rk.key === route.key) rivalCap += rk.capacity || 0;
      });
    });

    /* ② 运力 = 航线总班次 × 座位数（flights 已含架数，勿再乘 nPlanes） */
    var capacity = T.seats * flights / 1e6;   // 座位 → 百万座

    /* ③ 市场争抢层 —— 「航线只吃市场的一部分」
     *
     * ⚠ 2026-09-14 引入（用户拍板的玩法尺度），同日**四次**修正后定型。
     *
     * 背景矛盾：routePotential() 给的是**整条城市对的市场总量**
     *   （上海-东京 2.75 百万客/季，与现实的每日约 45 班相符）；
     *   而一架 76 座支线机一天飞 3 班、一季运 0.021 百万客 ——
     *   市场是单架机运力的 **134 倍**。
     *
     * ⚠ 前三版 formula 全失败了，失败原因极有教育意义，务必读完再动：
     *   v1  share = cap/(cap+HALF)：份额正比于运力 → 各机型客座率完全相同，
     *       利润率只由单位座位经济性决定，机型之间没有取舍只有优劣。
     *   v2  share = cap^e/(cap^e+HALF^e)、HALF 取绝对量：因为 cap 与市场差 58 倍，
     *       要压住它需要 marketShareK ≈ 14 这种荒谬数值，参数失去物理意义。
     *   v3  share = f(loadRatio)、loadRatio = cap / (marketCap × halfAt)：
     *       **看似把量纲归一化了，实则仍是死代码** —— 因为
     *         marketCap = marketSize / lf 是 capacity 的 181 倍，
     *       于是 loadRatio ≈ 0.018 × (0.3/halfAt)，恒远小于 1，
     *       幂律在小自变量区近似线性 → share ≈ ceil×0.55%/(0.3/halfAt)，
     *       随 halfAt 变化的幅度被 ceil 与 g 完全掩盖；
     *       实测 halfAt 从 0.3 扫到 1.5 结果一模一样，要让它生效需 halfAt≈2.3
     *       ——比 v2 的 14 好一点，但依然没有物理意义。
     *
     * v4（定型版）：问题的本质不是「公式形状」，而是**参照系选错了**。
     *   拿「我的运力」去比「整个市场需要多少座位」本来就没有意义 ——
     *   真实航司在一条航线上永远只占市场的一小块，它们比的是**竞对**。
     *
     *   真实航司的份额逻辑（也是本作要表达的）：
     *     · 无人竞争时，需求就是需求，客座率由「运力 vs 需求」自然决定；
     *     · 有竞对时，双方按**运力份额**瓜分市场 —— 我加运力就抢走更多客流；
     *     · 市场总量本身就应当成为约束（需求不足时飞得再密也卖不满）。
     *
     *   所以正确写法是把「运力」与「需求」直接相比，份额只用于描述竞对瓜分：
     *
     *     demandWanted = marketSize                      // 本季该航线总需求（百万客）
     *     myCapEquiv   = capacity × (基准客座率 lf)       // 我的运力能承载多少客
     *     rivalEquiv   = rivalCap × lf                   // 竞对同样口径
     *     share        = 我 / (我 + 竞对)                 // 无竞对时 share = 1
     *     pax          = demandWanted × share            // 我分到的需求
     *     pax          = min(pax, capacity × lf)         // 物理上限（装不下就装不下）
     *     realLf       = pax / capacity                  // 真实客座率
     *
     *   这样：
     *     · 无竞对、运力小于需求 → 客座率 = lf（满载，说明该加机）✓
     *     · 无竞对、运力超过需求 → 客座率 = demand / capacity < lf（该减机）✓
     *     · 有竞对 → 按运力瓜分，加运力能抢份额，但双方都加则双双掉客座率 ✓
     *
     *   marketShareK / Exp / Ceil 三个参数随之**废除** ——
     *   它们试图解决的「跑道份额」问题，现在由「需求 vs 运力」直接回答，
     *   不再需要一个额外的人造份额曲线。参数越少，标定越可靠。
     *
     * ⚠ 后人的陷阱提示：如果以后想让「品牌力」影响份额（比如声誉高抢客更多），
     *   正确做法是调 share 公式里的**权重**，例如
     *     share = (我×brandW) / (我×brandW + 竞对)
     *   **不要**再引入一个乘在 demand 或 capacity 上的全局系数 ——
     *   那会重新掉进 v3 的「量纲看似对、实则压不动」的坑。 */
    var marketSize = potential * mature;             // 本季度的有效市场总量（百万客）

    /* 运力口径统一：「能承运多少客」而不是「有多少座位」。
     * 这样容量与需求（都为百万客/季）可以直接比较，不会出现量纲混淆。 */
    var sellable = capacity * lf;                    // 我的运力能承运的客量（百万客）
    var rivalEquiv = rivalCap * lf;                  // 竞对同口径运力（百万客）

    /* 份额 = 按运力瓜分市场。无竞对时 share 恒为 1（独吞整条线）。 */
    var myCapEquiv = Math.max(1e-9, sellable);
    var share = myCapEquiv / (myCapEquiv + rivalEquiv);

    var demandWanted = marketSize * share;           // 我分到的市场（百万客）
    var pax = Math.min(demandWanted, sellable);      // 受「装不下就装不下」约束
    pax = Math.max(0, pax);

    /* 真实客座率：需求不足时低于基准 lf（这就是「该减机」的信号） */
    var realLf = capacity > 1e-9 ? pax / capacity : 0;

    /* ③ 收入：基础票价 + 商务舱溢价。
     * 换算推导（关键，勿改）：
     *   pax 单位「百万客」= pax×1e6 人次；票价单位「元」；
     *   收入(元) = pax×1e6×fare → 收入(万元) = pax×1e6×fare/1e4 = pax×fare×100
     *
     * 票价模型（2026-09-14 标定后重写）：
     * 真实民航的单位距离票价随距离**递减**（短途约 1.1 元/km，洲际约 0.75 元/km）：
     *   1000km ≈ 1.05 | 3000km ≈ 0.95 | 6000km ≈ 0.85 | 10000km ≈ 0.75
     * 首版用 (1 - dist/40000) 的线性折扣，长途只降 15%，导致洲际线利润率虚高到 70%+。
     * 现改用幂律衰减（下方 distFareFactor），并把「富裕度」从**直接乘数**降级为
     * **温和调整**（wealthAdj 只 ±20%）—— 富裕城市确实票价更高，但真实世界里
     * 它们的机场费、人工、地勤成本同样更高，不能变成纯粹的印钞机。 */
    var distFareFactor = Math.pow(1 / (1 + dist / 26000), 0.30);
    var wealthAdj = 1 + (((ca.wealth + cb.wealth) / 2) - 1.15) * 0.45;
    wealthAdj = Math.max(0.75, Math.min(1.3, wealthAdj));
    var farePerKm = (CONFIG.ticketPerKm || 0.78) * distFareFactor * wealthAdj
      * (1 + (state.reputation - 50) * 0.004);
    /* 商务舱：premium 比例的座位卖 firstClassMul 倍价，其余卖基础价 */
    var avgFareAdj = farePerKm * dist *
      ((1 - T.premium) + T.premium * (CONFIG.firstClassMul || 2.1));
    avgFareAdj *= route.fareMul;
    /* 价格战：竞对对该线发起价格战时，玩家被迫跟进降价（rivalPriceWarMul 折扣票价）。
     * 此前 priceWars 只被创建与递减、从未被 settleRoute 读取，竞对价格战纯属日志摆设。 */
    if (routeAtWar(state, route.key)) {
      avgFareAdj *= (CONFIG.rivalPriceWarMul || 0.86);
    }
    var revenue = pax * avgFareAdj * 100;

    /* ④ 成本 —— 按真实成本结构配比（标定目标：油费/收入 25~40%、全成本/收入 82~93%）
     *
     * 系数标定经过（2026-09-14，tools/calib.js 三轮扫描）：
     *   v1 起降 3.4 / 机组 2.2  → 短途航线在任何需求下都亏（固定成本高估 3~4 倍）
     *   v2 起降 1.25 / 机组 0.82 → 短途转正，但全成本只占收入 30~55%（真实 85~92%），
     *                              普遍净利率 40~80%，失去经营压力
     *   v3（当前）非油成本整体 ×1.5，落到真实航司区间
     * 真实结构（国内中型机场、支线机型）：
     *   起降费+地勤 ≈ 1.9~2.1 万元/班 | 机组 ≈ 1.2~1.5 万元/班 | 航油按 7.6 元/升
     * 维护同时含「按机型的固定费用」（upkeep）与「按起降循环的浮动费用」。 */
    var cm = costMul(state);
    /* 每班非油成本 —— 距离档位 × 座位规模因子
     *
     * ⚠ 座位规模因子（2026-09-14 补上，这是成本模型的最后一个缺口）：
     * 首版的起降/机组只按距离分档，与机型大小无关 —— 结果宽体机与支线机
     * 一样贵，导致「宽体机飞中程高需求航线」的利润率虚高到 70%+。
     * 真实世界里起降费按**最大起飞重量**分级、机组按**机型配置**配员，
     * 二者都随飞机规模上升。用次线性指数 0.62 而非线性 1.0 的原因：
     * 座位密度提升与复合材料减重使重量增长慢于座位数。
     *   76 座 → 0.60（支线机更便宜）| 174 座 → 1.00（基准）
     *   288 座 → 1.37 | 384 座 → 1.63
     *
     * ⚠⚠ 2026-09-14 第二次修正 —— 距离乘数必须够强（这是关键教训）：
     *   上一版把距离乘数设得太弱（1.95 / 3.8 / 7.2，只涨 3.7 倍），
     *   而**收入随距离涨 22 倍**（上海-北京 1426 万 → 东京-洛杉矶 31961 万，
     *   因为长航线用更大的飞机、载更多的客、卖更贵的票）。
     *   于是出现系统性偏差：短途全成本占收入 89%（正确），
     *   洲际只有 33%（只有真实的一半），远程线变成印钞机。
     *
     *   真实的长航线成本为什么高？不只是飞得远 —— 还要看**多少人上了飞机**：
     *     · 起降费按最大起飞重量收：777X(384座) 是支线机(76座)的 5 倍以上
     *     · 机组配置：宽体洲际要双机组甚至加强机组，支线机 2 人驾驶舱就够
     *     · 客舱服务：洲际长航班的餐食、毛毯、娱乐系统开销按人头算
     *   座位规模因子（seatFactor）已经把「机型大小」计入了，
     *   距离乘数只需再表达「同样一班的固定开销随航程增加」——
     *   这部分主要是**机组工时与飞机周转损耗**，随航程近似线性增长。
     *
     *   所以距离乘数改为**分段但强得多**的取值，并让短途基数略微下调：
     *     短途（<2000km）    1.7   —— 支线机单班固定开销本来就低
     *     中程（2000~6000）  6.5   —— 4 倍航程，机组与周转损耗大幅上升
     *     远程（>6000km）   14.0   —— 跨洋远程，双机组 + 长周转 + 高耗损
     *   配合 seatFactor 后，洲际宽体的单位成本与真实航司对齐。
     *
     * ⚠⚠⚠ 2026-09-14 第三次修正 —— 标定方法从根本上换掉（前两次都在「猜系数」）。
     *
     * 前两次失败的共同模式：调 landPerFlight / crewPerFlight 的档位系数，
     *  然后看「全成本占收入比」是否落进 82~92%。结果永远是
     *    短途 85~108%（偏高）、洲际 37~48%（偏低），且**调不拢** ——
     *  因为系数是按「每班」给的固定值，而收入按「每班 × 座位 × 票价」算，
     *  长航线恰好三项都大，固定成本天然跟不上。
     *
     * ★ 换思路：真实航司的非油成本，主要驱动量是**承运旅客数**而非航段数。
     *   · 客舱服务（餐食、毛毯、清洁、娱乐耗材）—— 严格按人头
     *   · 机组配员 —— 按客舱座位数（服务比），宽体机 12~16 人 vs 支线 4~6 人
     *   · 地服（值机、行李、登机口）—— 按客流规模
     *   · 机场起降费 —— 按最大起飞重量（与座位数强相关的幂律）
     *  这些**都已经通过 seatFactor 表达了机型差异**，但还差一层：
     *  同一机型飞不同距离时，客座成本不变而收入变 —— 所以距离不该再由
     *  landPerFlight 的档位承担，而应该只体现在**航油**（真正与距离成正比）。
     *
     * 于是最终写法：非油成本 = 每客成本 × 载客数。
     *   每客非油成本（元/客）按机型与距离微调，主体是「服务一个人要花多少钱」：
     *     短途 支线机 ≈ 85 元/客（低成本、无餐食）
     *     中程 窄体   ≈ 165 元/客（简餐 + 常规地服）
     *     洲际 宽体   ≈ 320 元/客（正餐 + 行李 + 长时服务 + 双机组摊销）
     *   这个口径的好处：**薄线用大飞机必亏**（客座率低则每客成本不变但收不到钱），
     *   而加密航班能摊薄固定部分 —— 与真实经营直觉完全一致。
     *
     * 为什么用「座位数」而不是「载客数」：空座位也要服务成本（清洁、配餐预备），
     *   所以按**投放的座位量**算更真实 —— 这也让「客座率低则单位成本高」成立。
     *
     * ⚠ 数值来自**反解 + 幂律拟合**（tools/calib-cost.js 表③，勿凭直觉改）。
     *
     * 反解逻辑：非油 = capacity × rate，收入 = capacity × lf × fare，
     *   故 非油/收入 = rate / (lf × fare)。
     *   令全成本 = 收入的 86%（真实航司区间 85~92%），
     *   扣掉油费与折旧后剩下的就是非油应占比例，反推 rate：
     *     rate = (0.86 − 油占比 − 折旧占比) × lf × fare
     *
     * 对 8 条真实航线反解得到的 (距离, rate) 数据点，
     *   在双对数空间做最小二乘，得幂律：
     *
     *     rate = 0.076 × dist^1.205      （元/座）
     *
     *   ⚠ 最终系数 0.076（而非拟合出的 0.0741）：
     *     拟合值只保证「反解点最优」，但按**设计目标区间**（支线 3~12%、
     *     窄体 10~20%、宽体 12~24%）逐条判分，0.076 命中 6/8 且零亏损、
     *     平均利润率 12.8% —— 优于 0.0741（5/8）。标定要以设计目标为准，
     *     不能只追求拟合残差最小。
     *
     *   拟合残差多数在 ±15% 内，最大的两个是上海-北京(+27%)与东京-洛杉矶(+14%)：
     *     · 上海-北京 偏高：支线机油耗率天然高于窄体，反解值被抬高，
     *       幂律给出 331 元/座（低于反解 261 —— 因为幂律要兼顾所有点）
     *     · 东京-洛杉矶 偏低：超远程的机组轮换成本有额外跳升，幂律略低估
     *   这两端偏差在可接受范围，且方向互抵，整体平均利润率接近设计目标。
     *
     * 为什么用幂律而不是分档：
     *   分档会在边界产生跳变，出现「差 1 公里，成本跳一档」的荒谬结果
     *   （内罗毕-迪拜 3553km 与上海-新加坡 3806km 同档，真实成本却不同）。
     *   幂律连续、可导，玩家感觉不到「档位墙」。
     *
     * 指数 1.205 > 1 的含义：非油成本随距离**超线性**增长。
     *   这不是拟合伪影，而是真实规律 —— 长航段的机组轮换、外站保障、
     *   航食补给、飞机周转损耗都会以略高于距离的速度累积。 */
    var nonFuelPerSeat = (CONFIG.nonFuelCoef == null ? 0.076 : CONFIG.nonFuelCoef)
      * Math.pow(Math.max(1, dist), (CONFIG.nonFuelExp == null ? 1.205 : CONFIG.nonFuelExp));

    /* ⚠⚠⚠ 2026-09-14 第四次修正 —— 座位规模成本因子（机型梯队机制的救星）。
     *
     * 问题（tools/audit-econ.js 穷举「机型 × 架数 × 档位」后暴露）：
     *   **所有航线的最优解都是最大的那架机（cWB2 极星 777X）**。
     *   12 条样本航线里 12 条都选了 384 座宽体，包括 2924km 的薄线 ——
     *   机型梯队彻底失效，玩家只需要「无脑买最贵的」。
     *
     * 根因：非油成本写成 `capacity × rate`，rate 与座位数**完全无关**，
     *   于是单位座位成本是常数，大飞机没有任何规模劣势。
     *   而宽体的商务舱占比 premium 最高（0.22 vs 0.06）→ 平均票价更高，
     *   大机型在「单位成本相同、单位收入更高」下必然全场景占优。
     *
     * 真实世界里不是这样 —— 大飞机的单位成本**更高**，因为：
     *   · 起降费按最大起飞重量分级：777X (351t) 的起降费是 E175 (38t) 的数倍，
     *     而重量增长快于座位数增长（机体结构、起落架、四发/大涵道比发动机）
     *   · 机组配员：宽体洲际需 2 组乘务 + 加强机组，支线 2 人驾驶舱 + 2 名乘务
     *   · 客舱设备：娱乐系统、多舱位厨房、平躺座椅的重量与维护成本
     *   · 周转时间更长：大型机上下客慢，单位时间的停机坪占用成本更高
     *
     * 用**次线性但显著**的幂律表达：seatCostF = (seats / 174)^0.42
     *   76 座 → 0.74（支线机单位成本低 26%）
     *   174 座 → 1.00（基准）
     *   288 座 → 1.23
     *   384 座 → 1.38（宽体单位成本高 38%）
     *
     * 指数 0.42 的标定依据：使「薄线用小机、厚线用大机」的取舍成立。
     *   实测若取 0.30，大机型仍在多数航线占优；取 0.55 则宽体在干线上都不划算
     *   （真实宽体在 5000km+ 干线上是有优势的）。0.42 让「机型梯队」出现
     *   清晰的分界：需求密度（客流 ÷ 槽位）低的线用小机、高的线用大机。
     *   ⚠ 指数比 nonFuelExp 更敏感，改前必须跑 tools/audit-econ.js 表③
     *     看「最优机型是否随航线厚度变化」。 */
    var seatCostF = Math.pow(T.seats / 174, (CONFIG.seatCostExp == null ? 0.42 : CONFIG.seatCostExp));
    nonFuelPerSeat *= seatCostF;

    /* capacity 单位为百万座/季 → ×1e6 得座位数 → ×元/座 → ÷1e4 得万元 */
    var nonFuelTotal = capacity * 1e6 * nonFuelPerSeat / 1e4;
    var landing = nonFuelTotal * 0.45 * cm;   // 起降+地服（受成本修正器影响）
    var crew = nonFuelTotal * 0.55;           // 机组+客舱服务
    /* ⚠ 油耗：flights 已经是「全航线总班次」（= 每架班次 × 飞机数），
     *   这里**不能再乘 nPlanes** —— 首版写成 flights * nPlanes 使油耗按飞机数平方增长，
     *   是「加机越多单位成本越高」这一反直觉现象的来源。 */
    var fuel = flights * dist * T.fuelPerKm * 7.6 / 1e4;                // 元 → 万元
    /* 维护：按飞行量 × 座位规模因子。
     * ⚠ 不要用 nPlanes × upkeep 那一项 —— 它已被「飞机持有成本」覆盖，
     *   重复计入会让大机队凭空多出一笔固定支出。 */
    var maint = flights * 1.2 * Math.pow(T.seats / 174, 0.75);

    /* ⑤ 飞机持有成本（折旧/租金）—— 2026-09-14 补上的最后一个缺口。
     *
     * ⚠ 为什么必须有这一项：
     *   真实航司的成本结构里，**飞机折旧+租赁**是与航油并列的两大成本，
     *   通常占收入 12~18%（洲际长航线因飞机更贵、利用率更低，占比更高）。
     *   本作首版完全漏掉了它 —— 结果是「买飞机只花一次钱，之后白飞」，
     *   洲际宽体线利润率虚高到 60~68%，玩家没有动力精算投放。
     *
     * ⚠⚠ 2026-09-14 第二次修正 —— 摊销口径选错了（差 28 倍的教训）：
     *   上一版按「机价 × 2.2%/季」直接计入航线成本。问题在于：一架宽体机
     *   一季只飞 90 班，摊到每班是 3900万×2.2%/90 = 0.95 万元/班 ——
     *   而真实的洲际宽体单班折旧约 **25 万元/班**（见下），差了 26 倍。
     *
     *   为什么差这么多？因为真实飞机的折旧是**按 15~20 年寿命**摊销的，
     *   一架 777 约 3.5 亿美元（折合人民币约 25 亿？不，约 25,000 万元），
     *   每年飞约 4,000 飞行小时、约 800 个航段 ——
     *     年折旧 25,000万/20年 = 1,250 万/年
     *     每航段摊销 = 1,250万/800 = 1.56 万/班
     *   嗯，这个数字远低于我上面假设的 25 万 —— 说明**真实的折旧没那么重**，
     *   25 万/班的口径是把「整机价」错当成「单班成本」了。
     *
     *   ★ 正确的做法：不猜，用「季度折旧率 × 机价 / 季度班次」，
     *     但要提高季度折旧率以覆盖真实航司的**融资租赁成本**
     *     （多数航司是融资租赁而非全款购买，实际资金成本远高于账面折旧）。
     *     取 4.5%/季 ≈ 18%/年，接近真实航司「折旧+租赁利息+保险」的综合负担，
     *     也使「买贵机飞薄线」真正变成一个会亏钱的决策。 */
    var ownershipRatePerQ = (CONFIG.ownershipPerQuarter == null ? 0.045 : CONFIG.ownershipPerQuarter);
    var ownership = nPlanes * T.price * ownershipRatePerQ;

    var cost = fuel + landing + crew + maint + ownership;

    var profit = revenue - cost;

    return {
      key: route.key, a: route.a, b: route.b, type: route.type,
      planes: nPlanes, flights: flights, flightsPerPlane: flightsPerPlane,
      perDay: perDay, perDayCap: perDayCap, slotCap: slotCap, slotTight: slotTight,
      capacity: capacity, sellable: sellable, realLf: realLf,
      potential: potential, pax: pax, loadFactor: lf, share: share, mature: mature,
      /* 运力是否吃紧 —— 需求撑满运力：说明该加机/提频了（UI 提示） */
      capacityTight: capacity > 1e-9 && demandWanted > sellable * 0.98,
      /* 需求是否填不满运力 —— 说明该减机/降频/降价了（UI 提示） */
      demandThin: capacity > 1e-9 && demandWanted < sellable * 0.62,
      fare: avgFareAdj, revenue: revenue, cost: cost, profit: profit,
      fuel: fuel, landing: landing, crew: crew, maint: maint, ownership: ownership
    };
  }

  function routeAtWar(state, key) {
    for (var i = 0; i < state.priceWars.length; i++) {
      if (state.priceWars[i].key === key) return true;
    }
    return false;
  }

  /* ───────────────────────── 6. 城市发展飞轮（第二半）─────────────────────────

   * 每回合按「本城上季度被运走的旅客量 + 通航航线数 + 执飞机型等级」推高开发度。
   * dev 每涨 devPerLevel 点即升一级，等级又反过来放大需求（routePotential 的 lvF）。
   * 这是「交通促进地区发展」闭环的落点。
   */
  function recalcCityRoutes(state) {
    state.cities.forEach(function (c) { c.routes = 0; c.paxLast = 0; });
    state.routes.forEach(function (r) {
      var ca = findCity(state, r.a), cb = findCity(state, r.b);
      if (ca) ca.routes++;
      if (cb) cb.routes++;
    });
  }

  function growCities(state, routeDetail) {
    var C = AT.CONFIG;
    var paxOfCity = {};
    var tierOfCity = {};

    /* 汇总每座城市本季度经停客流与服务的最高机型等级 */
    routeDetail.forEach(function (d) {
      var ca = findCity(state, d.a), cb = findCity(state, d.b);
      var tier = AT.planeOf(d.type).tier;
      [ca, cb].forEach(function (c) {
        if (!c) return;
        paxOfCity[c.id] = (paxOfCity[c.id] || 0) + d.pax / 2;   // 两端各分一半
        tierOfCity[c.id] = Math.max(tierOfCity[c.id] || 0, tier);
      });
    });

    state.cities.forEach(function (c) {
      var pax = paxOfCity[c.id] || 0;
      var tier = tierOfCity[c.id] || 0;
      var oldLevel = c.level;
      var growth = 0;

      if (c.routes > 0) {
        /* 增长量三个来源：
         *   ① 客流本身（pax）—— 运的人越多发展越快，这是最直接的正反馈
         *   ② 通航城市数（routes）—— 网络效应：连接越多越像枢纽
         *   ③ 机型等级（tier）—— 大飞机带来的是国际客流与高端投资 */
        growth = C.cityDevGrowth *
          (1 + pax * 0.55) *                       // 客流项
          (1 + Math.min(1.6, c.routes * 0.28)) *   // 网络项
          (1 + tier * 0.11) *                      // 机型项
          /* 枢纽城市发展上限更高（大城更容易吃到网络红利），小城增长更快（追赶效应） */
          (c.hub ? 1.0 : 1.24);
        c.dev = Math.min(100, c.dev + growth);
      } else {
        /* 无航线：开发度自然衰减 —— 不经营就退化，这是玩家的机会也是压力 */
        c.dev = Math.max(0, c.dev - C.cityDevDecay * 100 * 0.1);
      }

      c.level = AT.levelOf(c.dev);
      if (c.level !== oldLevel) {
        if (c.level > oldLevel) {
          state.stats.citiesUpgraded++;
          pushFx(state, 'upgrade', { cityId: c.id, level: c.level });
          log(state, c.name + ' 升级为 ' + c.level + ' 级城市（开发度 ' + c.dev.toFixed(0) + '）');
        } else {
          log(state, c.name + ' 降级为 ' + c.level + ' 级城市');
        }
      }
      /* 统计「本季推动的城市开发度总量」—— 终局面板要用它向玩家汇报
       * 「交通促进地区发展」这件事到底做了多少。
       * ⚠ 这里曾写成 `if (growth0(c) > 0) ...` 而 growth0 是恒返回 0 的占位函数，
       *   导致该统计**永远是 0**（实机终局截图：城市开发贡献 0 点）。
       *   现直接累加上面算出的 growth —— 它才是真实增量，且只在有航线时为正。 */
      if (growth > 0) state.stats.devPushed += growth;
      c.paxLast = pax;

      /* 飞轮加成 bonus：把「超出初始开发度的那部分成长」折算成需求加成。
       * 上限 0.55（+55% 需求）—— 不给无限放大，否则后期会指数爆炸，节奏失控。 */
      var gain = Math.max(0, c.dev - c.dev0) / 100 * 0.42;
      c.bonus = Math.min(0.55, gain);
    });
  }

  /* ───────────────────────── 7. 竞对 AI ─────────────────────────

   * 竞对每回合做三件事：赚钱、抢航线、偶尔打价格战。
   * 目的不是「打垮玩家」，而是让热门航线变得不那么好赚，
   * 逼玩家去开拓别人没看到的航线 —— 那正是「交通促进地区发展」的机会窗口。
   */
  function rivalTurn(state) {
    var C = AT.CONFIG;
    state.rivals.forEach(function (r) {
      if (!r.alive) return;

      /* ① 经营收益 —— 2026-09-14 重写：竞对也走**真实航线结算**。
       *
       * ⚠ 旧版的问题（难度曲线坍塌的根因）：
       *   竞对收益是一条公式 `base × (1+航线数×0.14) × (1+aggression×0.35) × 10`，
       *   与航线本身的经济性**完全脱钩**。后果是竞对战报很好看
       *   （有 13~24 条线、16~27 架机），净资产却只有 4~19 万；
       *   而玩家走真实结算能滚到 28 万 —— 冒烟测试 Q60 时玩家净资产
       *   是第 2 名的 1.5 倍、是末位的 7 倍，中后期完全没有对手。
       *
       *   一个经营模拟的对手如果不用同一套经济规则，那它就不是对手，
       *   只是一段装饰性的数字。现在改为：竞对的每条航线都调用 settleRoute
       *   的同一套逻辑（用一条模拟 route 对象），按真实收入减成本计利润。
       *
       *   竞对仍然「粗略」的地方：不精算机型/档位/票价（用机型默认档），
       *   不含事件卡影响，不做财务杠杆。这些是玩家独有的决策深度。 */
      var income = 0;
      r.routes.forEach(function (rk) {
        var ca = findCity(state, rk.a), cb = findCity(state, rk.b);
        if (!ca || !cb) return;
        var dist = G.distKm(ca, cb);
        var T = AT.planeOf(rk.type);
        /* 竞对的运力：按自己登记的架数（fleet 里同型机的台数摊到各线，简化处理） */
        var rPlanes = Math.max(1, Math.round(
          r.fleet.reduce(function (s, f) { return f.type === rk.type ? s + f.count : s; }, 0)
          / Math.max(1, r.routes.length)));
        var perPlane = Math.max(1, Math.min(
          maxPerDayFor(rk.type, dist), rk.perDay || CONFIG.defaultFreqPerDay || 3));
        var slotCap = Math.floor(routeSlots(state, rk.a, rk.b));
        var perDay = Math.max(1, Math.min(CONFIG.routeMaxPerDay || 20, slotCap, perPlane * rPlanes));
        var flights = routeFlights(perDay);
        var capacity = T.seats * flights / 1e6;

        /* 需求与份额：与玩家同口径（玩家运力也算进竞争） */
        var mature = Math.min(1, (CONFIG.routeMaturityFloor || 0.45) +
          (1 - (CONFIG.routeMaturityFloor || 0.45)) *
          Math.min(1, rk.ageQ / Math.max(1, CONFIG.routeMaturityQuarters || 6)));
        var marketSize = routePotential(state, rk.a, rk.b) * mature;
        var lf = CONFIG.loadFactorBase || 0.74;
        var sellable = capacity * lf;

        /* 玩家在同线的运力（把玩家的份额扣掉）+ 其他竞对 */
        var otherCap = 0;
        state.routes.forEach(function (pr) {
          if (pr.key === rk.key && pr.planes > 0) {
            var pd = Math.max(1, Math.min(CONFIG.routeMaxPerDay || 20,
              Math.floor(routeSlots(state, pr.a, pr.b)),
              Math.min(maxPerDayFor(pr.type, dist), pr.perDay || 3) * pr.planes));
            otherCap += AT.planeOf(pr.type).seats * routeFlights(pd) / 1e6 * lf;
          }
        });
        state.rivals.forEach(function (o) {
          if (o === r || !o.alive) return;
          o.routes.forEach(function (ok2) {
            if (ok2.key === rk.key) otherCap += (ok2.capacity || 0) * lf;
          });
        });
        var share = sellable / Math.max(1e-9, sellable + otherCap);
        var pax = Math.min(marketSize * share, sellable);

        /* 收入与成本：与玩家同公式 */
        var distFareFactor = Math.pow(1 / (1 + dist / 26000), 0.30);
        var wealthAdj = 1 + (((ca.wealth + cb.wealth) / 2) - 1.15) * 0.45;
        wealthAdj = Math.max(0.75, Math.min(1.3, wealthAdj));
        var farePerKm = (CONFIG.ticketPerKm || 0.78) * distFareFactor * wealthAdj;
        var avgFare = farePerKm * dist *
          ((1 - T.premium) + T.premium * (CONFIG.firstClassMul || 2.1));
        var revenue = pax * avgFare * 100;

        var seatCostF = Math.pow(T.seats / 174, (CONFIG.seatCostExp == null ? 0.22 : CONFIG.seatCostExp));
        var nonFuelPerSeat = (CONFIG.nonFuelCoef == null ? 0.155 : CONFIG.nonFuelCoef)
          * Math.pow(Math.max(1, dist), (CONFIG.nonFuelExp == null ? 1.08 : CONFIG.nonFuelExp))
          * seatCostF;
        var nonFuelTotal = capacity * 1e6 * nonFuelPerSeat / 1e4;
        var fuel = flights * dist * T.fuelPerKm * 7.6 / 1e4;
        var cost = nonFuelTotal + fuel
          + flights * 1.2 * Math.pow(T.seats / 174, 0.75)
          + rPlanes * T.price * (CONFIG.ownershipPerQuarter == null ? 0.045 : CONFIG.ownershipPerQuarter);
        income += (revenue - cost);
      });
      /* 竞对的规模效应：小公司有隐性补贴（真实世界里新兴航司靠补贴与低人力成本活着），
       * 否则开局就全灭。1.18 使它们能撑住但不至于反超玩家的精细经营。 */
      r.cash += income * 1.18;
      r.cash -= r.routes.length * 18;      // 总部与销售等固定开销

      /* ② 扩张：钱够了就买飞机 —— 但**先看该深耕还是该铺线**。
       *
       * ⚠ 2026-09-14 二次修正（竞对只铺线不深耕）：
       *   上一版把「买机 → 抢一条新线」写死成唯一动作，后果与玩家托管 AI
       *   曾经的退化一模一样：竞对终局 38 架机飞 35 条线、每条线恒定 1 架、
       *   perDay 恒为 1 —— 而玩家 AI 深耕后单线可达 15 架。
       *   结构上被碾压（玩家 7.9 架/线 vs 竞对 1.1 架/线），
       *   难度曲线因此从 Q10 起就是「玩家第一、一路拉大」。
       *
       *   现在竞对也做**二选一**：
       *     ① 若存在「运力吃紧且槽位没满」的自有航线 → 加一架到那条线上（深耕）
       *     ② 否则 → 抢一条新航线（铺线）
       *   判据用与玩家同口径的 settleRoute 结果（capacityTight / slotTight），
       *   保证双方的「吃紧」定义一致。
       *
       *   竞对仍然「粗略」的地方：不做机型置换升级、不精算档位与票价、
       *   不含事件卡影响、不做财务杠杆 —— 这些仍是玩家独有的决策深度，
       *   也正是玩家应当领先的地方。目标是**能拉锯**，不是势均力敌。 */
      var cheapest = 320;                      // 最便宜机型（云雀 100）的机价
      var totalPlanes = r.fleet.reduce(function (s, f) { return s + f.count; }, 0);
      var canAfford = r.cash > cheapest * 1.15;
      if (canAfford && (totalPlanes < 4 || state.rng() < 0.34 + r.aggression * 0.36)) {

        /* ── 深耕 or 铺线？──
         * ⚠ 不能用「运力是否吃紧」当绝对判据：需求/运力在几乎所有线上都 > 2.5
         *   （这是 slotCap 偏紧的必然结果），若「吃紧就深耕」会变成永远深耕、
         *   永不铺线 —— 实测竞对航线数从 35 掉到 2，净资产反而更低。
         *   改成**按比例分流**：先把航线网络铺到一定规模，再逐步转向深耕。
         *   这与真实航司的路径一致（先开航点、再把干线做厚），
         *   也保证竞对不会「too deep, too narrow」。 */
        var ROUTE_FLOOR = 18;                  // 航线数下限：未到这个数就优先铺线
        var wantDeepen = r.cash > AT.planeOf('cWB1').price * 2.2 &&
          r.routes.length >= ROUTE_FLOOR;

        /* 找「值得深耕」的自有航线：运力吃紧、槽位没满 */
        var deepen = null;
        if (wantDeepen) {
          r.routes.forEach(function (rk) {
            if (deepen) return;
            var T = AT.planeOf(rk.type);
            if (!T) return;
            var have = r.fleet.reduce(function (s, f) { return f.type === rk.type ? s + f.count : s; }, 0);
            if (have <= 0) return;
            var dist = G.distKm(findCity(state, rk.a), findCity(state, rk.b));
            var perPlane = Math.max(1, Math.min(maxPerDayFor(rk.type, dist),
              rk.perDay || CONFIG.defaultFreqPerDay || 3));
            var slotCap = Math.floor(routeSlots(state, rk.a, rk.b));
            var curPlanes = Math.max(1, Math.round(have / Math.max(1, r.routes.length)));
            var perDayNow = Math.max(1, Math.min(CONFIG.routeMaxPerDay || 20, slotCap, perPlane * curPlanes));
            /* 槽位已满 → 加机无用，跳过（与玩家的 slotTight 判据一致） */
            if (perDayNow >= slotCap) return;
            /* 需求远未吃饱才值得加厚 */
            var pot = routePotential(state, rk.a, rk.b);
            var capNow = T.seats * routeFlights(perDayNow) / 1e6;
            if (capNow > 1e-9 && pot / capNow > 3.5) deepen = rk;
          });
        }

        if (deepen) {
          /* 深耕：买一架该线已有车型，加到这条线上 */
          var tyD = deepen.type;
          r.cash -= AT.planeOf(tyD).price * 0.85;
          var slotD = null;
          for (var di = 0; di < r.fleet.length; di++) if (r.fleet[di].type === tyD) slotD = r.fleet[di];
          if (slotD) slotD.count++; else r.fleet.push({ type: tyD, count: 1 });
          r.lastAction = '加厚 ' + cityName(state, deepen.a) + '—' + cityName(state, deepen.b);
        } else {
          /* 铺线：买机 + 抢新航线 */
          var ty = pickRivalPlane(state, r, totalPlanes);
          r.cash -= AT.planeOf(ty).price * 0.85;
          var slot = null;
          for (var i = 0; i < r.fleet.length; i++) if (r.fleet[i].type === ty) slot = r.fleet[i];
          if (slot) slot.count++; else r.fleet.push({ type: ty, count: 1 });

          /* 抢航线：从「玩家还没开、但需求最高」的城市对里挑一条 */
          var best = pickRivalRoute(state, r);
          if (best) {
            /* 竞对也按「频次档位」投放运力，取默认档 3 班/日，
             * 但受该机型在该航线上的物理上限约束（洲际线宽体一天飞不了 3 班）。
             * 单位与玩家的 capacity 严格同口径（百万座/季）。 */
            var rivalPerDay = Math.min(CONFIG.defaultFreqPerDay || 3,
              maxPerDayFor(ty, best.dist));
            r.routes.push({
              key: best.key, a: best.a, b: best.b, type: ty,
              perDay: rivalPerDay,
              ageQ: 0,
              capacity: AT.planeOf(ty).seats * routeFlights(rivalPerDay) / 1e6
            });
            r.lastAction = '开通 ' + cityName(state, best.a) + '—' + cityName(state, best.b);
          }
        }
      }

      /* ③ 价格战：对玩家的高利润航线发起降价，持续数回合 */
      if (state.rng() < r.aggression * 0.16 && r.cash > 700) {
        var targets = state.routes.filter(function (rt) {
          return rt.planes > 0 && !routeAtWar(state, rt.key);
        });
        if (targets.length) {
          var t = targets[Math.floor(state.rng() * targets.length)];
          state.priceWars.push({ key: t.key, turns: C.priceWarQuarters || 3, by: r.id });
          log(state, r.name + ' 对 ' + cityName(state, t.a) + '—' + cityName(state, t.b) + ' 航线发起价格战');
        }
      }

      // 规模：航线数 × 平均运力 + 机队价值
      var fv = r.fleet.reduce(function (s, f) { return s + AT.planeOf(f.type).price * f.count; }, 0);
      r.scale = fv + r.routes.length * 260;
      // 航线成熟度递增
      r.routes.forEach(function (rt) { rt.ageQ++; });
      // 破产退出
      if (r.cash < -800) { r.alive = false; log(state, r.name + ' 资金链断裂，退出市场'); }
    });
  }

  /* ─────────────────── 玩家托管 AI（autoPlayer）───────────────────
   *
   * ⚠ 为什么必须有：本作是经济模拟，**没有玩家 AI 就无法做平衡测试**。
   *   此前 tests/smoke.js 跑出来的「Q60 净利 7632 恒定、机队停在 3 架」
   *   等读数，全都是「玩家 60 回合什么都不做」造成的假象 ——
   *   把「测试装置没有玩家」误读成了「游戏没有成长空间」。
   *   这与「机队缺目标机型导致静默失败」是同一类陷阱。
   *
   * 策略（模拟一个「懂行的普通玩家」，不是最优解器）：
   *   ① 有闲机 → 派到最吃紧（capacityTight）的航线；
   *   ② 没吃紧的线 → 给一条线提频（一次一档），提升运力利用率；
   *   ③ 都没得做且钱够 → 买「推荐新航线」需要的机型，供下一步开线；
   *   ④ 有闲机且没吃紧线 → 用「智能推荐」开新线。
   *
   * ⚠⚠ 每回合动作数必须限制（这是节奏的标尺，不是 AI 性能问题）。
   *   首版让 AI 每回合 while 循环最多做 12 个动作，结果 60 回合开满
   *   **全部 261 条航线**、净资产 3200~4000 万，碾压所有竞对 ——
   *   看起来像「游戏太简单」，实际是「AI 一回合做了 12 个决策」这个
   *   装置问题。真实玩家一个季度（假设 5~10 分钟）通常只做 1~3 个决策：
   *   开一条线、买一架机、调一次频次。**动作数就是节奏**。
   *   现在限制为每回合 **2 个动作**（1 个主要 + 1 个补充）——
   *   这既符合真实操作节奏，也让 60 回合的扩张幅度落在合理区间。
   *
   * 这个 AI 的产出是**难度的标尺**：一个懂行且节奏正常的玩家应该
   * 能与竞对缠斗到中后期，而不是开局就碾压。tools/balance.js 用它跑分布。
   */
  /* 玩家托管 AI —— 只服务于无头测试与工具（autoPlayer=true 时才跑）。
   *
   * ⚠ 它同时是「玩家行为的替身」，所以它的策略偏好会被 balance.js 当成
   *   人类玩家的行为来统计。它的偏好若是错的，统计出来的平衡就是错的。
   *
   * 设计要点（v2，修掉了「只知道铺线、从不深耕」的退化）：
   *   旧版把「开新线」放在最高优先级且无条件执行，配合 ACTIONS_PER_QUARTER=2，
   *   结果是每季度开 2 条新线、永远轮不到加机/提频/换大机 —— 终局 62 架飞 62 条线，
   *   每条线恒定 1 架，全公司总座位只有 2 万座。这与「做满一条线」的设计意图相反。
   *
   *   新版改为**比较边际收益**：每个动作候选都折算成「每架机每季度能多赚多少」，
   *   取最高者执行。于是「给一条槽位没满、需求吃紧的线加一架」和
   *   「开一条全新的线」会在同一把尺子上比较 —— 深耕与铺线各得其所。
   *
   *   评分口径：
   *     · 加深现有线：加机后的利润 − 加机前的利润（即那一架机的边际利润）
   *     · 提频现有线：提频后的利润 − 提频前的利润（零成本，原地增班）
   *     · 开新线：新线满客座率运行时的估算利润 − 那架机的持有成本
   *   所有分数都除以「投入的机数」以便可比（新线 = 1 架，加深 = 1 架）。
   */
  function playerTurn(state) {
    if (!state.autoPlayer) return;
    var ACTIONS_PER_QUARTER = 2;
    var guard = 0;
    /* ⚠ 每次动作都从候选里**重新评选**（actOnce 内部重算），所以这里
     *   只负责「做够 2 个动作」与「没有可做动作时停手」。
     *   actOnce 返回 false 表示「这一回合确实没有能带来正收益的动作」。 */
    while (guard++ < ACTIONS_PER_QUARTER) {
      if (!actOnce(state)) break;
    }
  }

  /* 执行一个「最优动作」；没有可行动作时返回 false。 */
  function actOnce(state) {
    var free = idlePlanes(state);
    var best = { kind: null, score: -Infinity };

    /* ⚠ 候选 A 与 C 都**包含买机**，这样两者才是同尺比较。
     *   旧版的候选 A 要求 `free.length`（必须有闲机），但 AI 每季度都把新机
     *   立刻塞进新线，闲机恒为 0 → 候选 A 永远不入选 → 只会一路铺线。
     *   正解：把「买一架机 + 加到某条老线」当成一个完整动作来评估，
     *   与「买一架机 + 开一条新线」正面比较。 */

    /* ── 候选 A：给现有线加机（有闲机直接用；没有就买一架）── */
    state.routes.forEach(function (r) {
      var T = AT.planeOf(r.type);
      if (!T) return;
      var dNow = settleRoute(state, r);
      if (!dNow) return;
      /* 槽位已满时，加机纯属烧钱 —— 直接跳过，别让 AI 做傻事 */
      if (dNow.slotTight) return;
      /* 需要一架该线执飞机型的飞机：优先用闲机，否则买（要算钱） */
      var spare = free.filter(function (p) { return p.type === r.type; });
      var needBuyA = !spare.length;
      if (needBuyA) {
        if (state.cash < T.price * 1.25) return;   // 买不起就别考虑
      }
      /* 造一个「加 1 架」的假想状态来评估边际利润。
       * settleRoute 的班次取决于架数，所以必须真的改 routeKey ——
       * 用「临时挂上一架、算完再摘掉」的办法，避免污染状态。 */
      var probePlane;
      if (needBuyA) {
        probePlane = { id: '__probeA__', type: r.type, routeKey: null, onGround: 0, ageQ: 0 };
        state.planes.push(probePlane);
      } else {
        probePlane = spare[0];
      }
      var savedKey = probePlane.routeKey;
      probePlane.routeKey = r.key;
      var dAfter = settleRoute(state, r);
      probePlane.routeKey = savedKey;
      if (needBuyA) state.planes.pop();
      if (!dAfter) return;
      var delta = dAfter.profit - dNow.profit;
      /* 边际利润为负说明这架机加进去只会更亏 —— 不作为候选 */
      if (delta <= 0) return;
      /* ⚠ 用「每架机」归一化，让「加机」「开新线」在同一个尺子上比。
       *   分数 = 这一架机每年带来的利润增量 ÷ 它的购机成本（资本回报率）。
       *   不做除法也能跑，但铺线（花 3900 万）与加机（花 3900 万）成本相同，
       *   除以成本后才是真正的「钱该花在哪」。 */
      var scoreA = needBuyA ? delta / T.price : delta / Math.max(1, T.price * 0.15);
      if (scoreA > best.score) {
        best = { kind: 'add', score: scoreA, route: r, needBuy: needBuyA,
          plane: needBuyA ? null : spare[0] };
      }
    });

    /* ── 候选 B：给现有线提频（零机队成本，不消耗闲机）──
     * ⚠ 必须用与 setFrequency **完全相同**的夹取口径来判断「提得动吗」，
     *   否则会出现「B 被选为最优 → 执行时被夹 → 返回 false → 整个回合
     *   直接 break、连 A/C 都不再尝试」的死锁。
     *   这个 bug 曾让某个种子从 Q20 起完全停滞（3 条线、53 万现金趴着不动）。 */
    state.routes.forEach(function (r) {
      var dNow = settleRoute(state, r);
      if (!dNow) return;
      if (dNow.slotTight) return;
      var cur = r.perDay || CONFIG.defaultFreqPerDay || 3;
      var ca = findCity(state, r.a), cb = findCity(state, r.b);
      if (!ca || !cb) return;
      var dist = G.distKm(ca, cb);
      var nPlanes = Math.max(1, r.planes || 1);
      var typeCap = maxPerDayFor(r.type, dist);
      var routeMax = CONFIG.routeMaxPerDay || 20;
      var slot = routeSlots(state, r.a, r.b);
      var totalCap = Math.min(routeMax, slot);
      /* 复刻 setFrequency 的夹取：applied = min(want, typeCap)，再按总班次夹 */
      var want = Math.max(1, Math.round(cur + 1));
      var applied = Math.max(1, Math.min(want, typeCap));
      if (applied * nPlanes > totalCap) {
        applied = Math.max(1, Math.floor(totalCap / nPlanes));
      }
      /* 夹完没有真提升 → 这个候选作废（不要选它！） */
      if (applied <= cur) return;
      /* 用一次性的假想结算估收益：临时改 perDay，算完还原 */
      var savedPD = r.perDay;
      r.perDay = applied;
      var dUp = settleRoute(state, r);
      r.perDay = savedPD;
      if (!dUp) return;
      var delta2 = dUp.profit - dNow.profit;
      if (delta2 <= 0) return;
      /* 提频几乎不花资本（只是把现有机队飞得更满），所以资本回报率天然极高。
       * 为了不让它无限压过买机类动作，用一个「等效资本」= 该线现有机队价值的
       * 15% 作为分母 —— 表示「这条线的机会成本」。 */
      var planelessCap = Math.max(1, dNow.planes * AT.planeOf(r.type).price * 0.15);
      var score2 = delta2 / planelessCap;
      if (score2 > best.score) {
        best = { kind: 'freq', score: score2, route: r, toPerDay: applied };
      }
    });

    /* ── 候选 C：开新线（含买机成本，与候选 A 同尺）── */
    var rec = pickBestNewRoute(state);
    if (rec) {
      var profitC = estimateNewRouteProfit(state, rec);
      if (profitC > -Infinity) {
        var T3 = AT.planeOf(rec.type);
        /* 开新线必然要一架机：有闲机则边际成本视为很低，没有就要买。
         * 与候选 A 用同一口径（利润 ÷ 资本投入）才可比。 */
        var spareC = free.filter(function (p) { return p.type === rec.type; });
        var capitalC = (spareC.length && !rec.needBuy) ? T3.price * 0.15 : T3.price;
        /* 买不起就不作为候选 */
        if (!(spareC.length && !rec.needBuy) && state.cash < T3.price * 1.25) {
          capitalC = Infinity;
        }
        if (isFinite(capitalC)) {
          var scoreC = profitC / capitalC;
          if (scoreC > best.score) {
            best = { kind: 'open', score: scoreC, rec: rec };
          }
        }
      }
    }

    /* ── 候选 D：给「槽位已满但运力吃紧」的线换更大机型（机型升级链）──
     * 这是槽位饱和后唯一的增长出路：同样 15 个时刻，换大机 = 运力翻数倍。
     * 评分口径 = 升级后的利润增量 ÷ 升级投入的机数，与 A/C 同尺。
     *
     * ⚠ 首版把「买得起」当成唯一门槛，结果 AI 在第 1 回合就把启动资金 800 万
     *   全部砸进「上海—东京 云雀100 → 极星777X」（补差价 3615 万），
     *   当场现金 −2891 万破产。教训：**买得起 ≠ 该买**。
     *   升级是重资产决策，必须同时满足：
     *     ① 现金充裕（升级后仍留足安全垫，不能靠借贷硬上）
     *     ② 回本够快（补差价 ÷ 每季利润增量 ≤ 8 个季度，否则不如开新线）
     *   这两条也正好对应真实航司的换机决策逻辑。 */
    state.routes.forEach(function (r) {
      var dNow = settleRoute(state, r);
      if (!dNow) return;
      /* 只有「槽位已满 + 运力吃紧」才值得换大机 —— 槽位没满时加机更便宜 */
      if (!(dNow.slotTight || dNow.capacityTight)) return;
      var T = AT.planeOf(r.type);
      if (!T) return;
      /* 新线爬坡期不升级：还没证明这条线值得投，先让它跑一跑 */
      if ((r.ageQ || 0) < 4) return;
      var ca = findCity(state, r.a), cb = findCity(state, r.b);
      if (!ca || !cb) return;
      var dist = G.distKm(ca, cb);
      /* 候选机型：能飞、座位数明显更大（≥1.5 倍，否则升级没意义） */
      var cands = AT.PLANES.filter(function (p) {
        return p.range >= dist && p.seats >= T.seats * 1.5;
      });
      cands.forEach(function (p) {
        var onRoute = state.planes.filter(function (x) { return x.routeKey === r.key; });
        var n = onRoute.length;
        if (!n) return;
        /* 净投入 = 新机总价 − 旧机残值 */
        var tradeIn = 0;
        onRoute.forEach(function (x) {
          tradeIn += AT.planeOf(x.type).price * Math.pow(0.968, x.ageQ) * 0.92;
        });
        var netCost = p.price * n - tradeIn;
        if (netCost <= 0) return;
        /* ① 现金纪律：升级后必须仍留下 25% 的现金安全垫，不许借钱硬上。
         *    （只有现金、不算贷款额度 —— 借来的钱换机正是首版破产的原因） */
        if (state.cash < netCost * 1.25) return;
        /* 试算利润增量：临时换型，算完还原 */
        var savedType = r.type;
        var savedPlaneTypes = onRoute.map(function (x) { return x.type; });
        r.type = p.id;
        onRoute.forEach(function (x) { x.type = p.id; });
        var dUp = settleRoute(state, r);
        r.type = savedType;
        onRoute.forEach(function (x, i2) { x.type = savedPlaneTypes[i2]; });
        if (!dUp) return;
        var gain = dUp.profit - dNow.profit;
        if (gain <= 0) return;
        /* ② 回本期纪律：补差价 ÷ 每季增量 ≤ 8 季，否则不如把钱拿去开新线 */
        var payback = netCost / gain;
        if (!(payback <= 8)) return;
        /* 评分口径与候选 A/C 统一为「利润增量 ÷ 资本投入」 */
        var scoreD = gain / netCost;
        if (scoreD > best.score) {
          best = { kind: 'upgrade', score: scoreD, route: r, newType: p.id };
        }
      });
    });

    /* ── 执行 ── */
    if (best.kind === 'add') {
      var planeA = best.plane;
      if (best.needBuy || !planeA) {
        /* 没有闲机 —— 买一架。购入的飞机有交付期，本回合先把它挂到线上，
         * 交付完成后自然生效（settleRoute 只数 routeKey 匹配的飞机）。 */
        var Tb = AT.planeOf(best.route.type);
        var bres = buyPlane(state, best.route.type, 1);
        if (!bres.ok) return false;
        /* 找到刚买的那架（makePlane 会 append 到末尾） */
        var bought = state.planes[state.planes.length - 1];
        if (!bought) return false;
        bought.routeKey = best.route.key;
        recalcCityRoutes(state);
        return true;
      }
      var oa = assignPlane(state, planeA.id, best.route.key);
      return !!(oa && oa.ok);
    }
    if (best.kind === 'freq') {
      /* 用候选评估时算好的目标班次，不再现算 +1（避免与夹取口径不一致） */
      var target = best.toPerDay != null
        ? best.toPerDay
        : (best.route.perDay || CONFIG.defaultFreqPerDay || 3) + 1;
      var cur2 = best.route.perDay || CONFIG.defaultFreqPerDay || 3;
      var res = setFrequency(state, best.route.key, target);
      return !!(res && res.ok && res.perDay > cur2);
    }
    if (best.kind === 'upgrade') {
      var up = upgradeRouteType(state, best.route.key, best.newType);
      return !!(up && up.ok);
    }
    if (best.kind === 'open') {
      var rec2 = best.rec;
      if (!free.length) {
        /* 没有闲机 —— 若买得起且新线收益高，买一架（保留安全垫）。
         * 新买的飞机有交付期，本回合拿不到；下个季度它到货后自然会被派上。 */
        var T2 = AT.planeOf(rec2.type);
        if (state.cash > T2.price * 1.35) {
          var bres = buyPlane(state, rec2.type, 1);
          if (!bres.ok) return false;
          /* 买完仍无闲机（在交付期），本回合到此为止 */
          if (!idlePlanes(state).length) return true;
        } else return false;
      }
      var fresh = idlePlanes(state);
      if (!fresh.length) return false;
      var oo = openRoute(state, rec2.a, rec2.b, rec2.type, 1);
      if (oo.ok && oo.route) {
        assignPlane(state, fresh[0].id, oo.route.key);
        return true;
      }
      return false;
    }
    return false;
  }

  /* 新线收益估算：假想「新线开起来、爬坡完成后、1 架机成熟运营」的季度利润。
   * 用于与「加深现有线」的边际利润在同一把尺子上比较。
   *
   * ⚠ 必须复用 settleRoute 而不是重抄一遍成本公式 —— 抄一遍迟早与真身漂移，
   *   那样 AI 的判断就与真实账本不一致了（这类「影子公式」是本项目反复踩的坑）。
   *   做法：临时 push 一条假航线 + 把一架闲机挂上去 → settleRoute → 立刻还原。
   *   全程同步操作、不跨 tick，因此不会污染 state。 */
  function estimateNewRouteProfit(state, rec) {
    var T = AT.planeOf(rec.type);
    if (!T) return -Infinity;
    /* 需要一架「能挂上去」的实体机 —— 若全在忙，就借一架闲机来试算；
     * 若连闲机都没有（要买机的情形），用一架临时假机。 */
    var free = idlePlanes(state);
    var borrowed = null;
    if (free.length) {
      borrowed = free[0];
    } else {
      borrowed = { id: '__probe__', type: rec.type, routeKey: null, onGround: 0, ageQ: 0 };
      state.planes.push(borrowed);
    }

    var key = AT.routeKey(rec.a, rec.b);
    var route = {
      key: key, a: rec.a, b: rec.b, type: rec.type,
      ageQ: 99,                      /* 视为已成熟，免得被爬坡期算法打折 */
      fareMul: 1,
      perDay: Math.min(CONFIG.defaultFreqPerDay || 3, maxPerDayFor(rec.type, rec.dist))
    };
    var savedKey = borrowed.routeKey;
    borrowed.routeKey = key;
    state.routes.push(route);

    var d = null;
    try { d = settleRoute(state, route); } finally {
      /* 无论成败都要还原，绝不能让试算污染真实状态 */
      state.routes.pop();
      borrowed.routeKey = savedKey;
      if (borrowed.id === '__probe__') state.planes.pop();
    }
    if (!d) return -Infinity;
    return d.profit;
  }

  /* 竞对选机型：按「现有最大机队规模」和「想开的航线距离」决定。
   * ⚠ 上限原本停在 cWB1（288 座），导致竞对永远摸不到顶级宽体 cWB2，
   *   在深耕后的玩家面前结构性落后（玩家清一色 384 座）。
   *   现在 20 架以上开放 cWB2，让竞对也能进入顶级机型梯队。 */
  function pickRivalPlane(state, r, totalPlanes) {
    if (totalPlanes >= 20) return 'cWB2';
    if (totalPlanes >= 10) return 'cWB1';
    if (totalPlanes >= 6) return 'cNB2';
    if (totalPlanes >= 3) return 'cNB1';
    return 'cRJ1';
  }

  /* 竞对抢航线：在「两端都不是自己母城、玩家未开通」的城市对里，
   * 取潜在需求最高的一条。这样竞对会自然地占据热门干线，
   * 玩家必须去挖掘次级城市 —— 而那些城市正是「待发展」的，符合主题。 */
  function pickRivalRoute(state, r) {
    var best = null, bestD = -1;
    var cities = state.cities;
    /* 只用枢纽 + 母城作为候选端点，避免竞对去开两条小城之间的线（那不合理） */
    for (var i = 0; i < cities.length; i++) {
      for (var j = i + 1; j < cities.length; j++) {
        var a = cities[i], b = cities[j];
        if (!a.hub && a.id !== r.homeCityId) continue;
        if (!b.hub && b.id !== r.homeCityId) continue;
        var key = AT.routeKey(a.id, b.id);
        var taken = false;
        for (var k = 0; k < r.routes.length; k++) if (r.routes[k].key === key) { taken = true; break; }
        if (taken) continue;
        /* 玩家已经开的线竞对也会抢，但优先级降低（更有价值的是空白市场） */
        var playerHas = !!findRouteByKey(state, key);
        var d = routePotential(state, a.id, b.id) * (playerHas ? 0.55 : 1);
        if (d > bestD) { bestD = d; best = { key: key, a: a.id, b: b.id, dist: G.distKm(a, b) }; }
      }
    }
    return best;
  }

  /* ───────────────────────── 8. 阶段机 ───────────────────────── */

  function log(state, text) {
    state.log.push({ quarter: state.quarter, phase: state.phase, text: text });
    if (state.log.length > 300) state.log.shift();
  }
  function pushFx(state, type, data) {
    state.fx.push({ type: type, t: state.t, data: data || {} });
    if (state.fx.length > 120) state.fx.shift();
  }

  function enterPhase(state, phase) {
    state.phase = phase;
    state.t = 0;
    if (phase === 'operating') {
      state.quarter = 1;
      log(state, '正式运营开始 —— 共 ' + (CONFIG.totalQuarters || 60) + ' 个季度');
    } else if (phase === 'over') {
      state.ranking = ranking(state);
      log(state, '经营期结束，开始清算');
    }
  }

  /* ───────────────────────── 9. 季度结算 ───────────────────────── */

  function resolveQuarter(state) {
    var C = AT.CONFIG;

    /* ① 先把本季度每条航线的账算出来（纯计算，不改状态） */
    var detail = [];
    state.routes.forEach(function (r) {
      var d = settleRoute(state, r);
      if (d) detail.push(d);
    });

    /* ② 结算收入与成本 */
    var revenue = 0, cost = 0, pax = 0;
    detail.forEach(function (d) { revenue += d.revenue; cost += d.cost; pax += d.pax; });

    /* ③ 固定支出：总部与销售管理费用 + 停场飞机的维护（停场也要养） */
    var overhead = 60 + state.planes.length * 8;
    var grounded = state.planes.filter(function (p) { return p.onGround > 0; });
    var groundCost = grounded.reduce(function (s, p) { return s + AT.planeOf(p.type).upkeep * 0.5; }, 0);

    /* ④ 债务利息 */
    var interest = state.debt * (C.loanRatePerQuarter || 0.022);

    var net = revenue - cost - overhead - groundCost - interest;
    state.cash += net;

    /* ⑤ 城市发展飞轮：按本季度客流推进 dev */
    recalcCityRoutes(state);
    growCities(state, detail);

    /* ⑥ 航线与飞机的年龄、成熟度推进 */
    state.routes.forEach(function (r) {
      r.ageQ++;
      var d = null;
      for (var i = 0; i < detail.length; i++) if (detail[i].key === r.key) { d = detail[i]; break; }
      r.pax = d ? d.pax : 0;
      r.profit = d ? d.profit : -1;
      r.planes = planesOnRoute(state, r.key).length;
    });
    state.planes.forEach(function (p) {
      p.ageQ++;
      if (p.onGround > 0) p.onGround--;
    });

    /* ⑦ 修正器与价格战递减 */
    state.mods = state.mods.filter(function (m) {
      m.turns--;
      return m.turns > 0;
    });
    state.priceWars = state.priceWars.filter(function (w) {
      w.turns--;
      if (w.turns <= 0) {
        log(state, '针对 ' + cityName(state, findRouteByKey(state, w.key) ? findRouteByKey(state, w.key).a : '') + ' 航线的价格战结束');
        return false;
      }
      return true;
    });

    /* ⑧ 竞对行动 */
    rivalTurn(state);

    /* ⑧b 玩家托管（autoPlayer）—— 无头测试用，见 playerTurn 注释 */
    playerTurn(state);

    /* ⑨ 累计统计与快照 */
    state.stats.paxTotal += pax;
    if (net > 0) state.stats.cashEarned += net; else state.stats.cashSpent += -net;
    /* ⚠ 快照必须带上收入/成本分解，不能只存 net。
     *   原因：季报面板要逐项列出「收入 − 运营成本 − 管理支出 − 利息 = 净利」，
     *   若快照只有 net，UI 就只能去读**当前**的 forecast（那是下一季的预测值），
     *   于是「收入 3.63亿 − 成本 2.59亿」与「净利 5,092万」对不上账 ——
     *   实测里差了一倍，玩家一眼就能看出数字是错的。
     *   财务面板的数字必须自洽，这是经营类游戏的底线。 */
    state.history.push({
      quarter: state.quarter,
      cash: Math.round(state.cash),
      netWorth: Math.round(netWorth(state)),
      routes: state.routes.length,
      planes: state.planes.length,
      pax: Math.round(pax * 100) / 100,
      net: Math.round(net),
      revenue: Math.round(revenue),
      cost: Math.round(cost),
      overhead: Math.round(overhead),
      interest: Math.round(interest),
      groundCost: Math.round(groundCost)
    });

    log(state, '第 ' + state.quarter + ' 季度结算：收入 ' + revenue.toFixed(0) +
              ' 成本 ' + (cost + overhead + groundCost).toFixed(0) +
              ' 利息 ' + interest.toFixed(0) + ' → 净利 ' + net.toFixed(0) +
              '（现金 ' + state.cash.toFixed(0) + '）');

    /* ⑩ 事件卡：按 nextEventAt 触发（不是每回合都有） */
    if (state.quarter >= state.nextEventAt && state.eventCount < (C.eventsPerGameCap || 14)) {
      var ev = drawEvent(state);
      if (ev) {
        state.card = ev;
        state.choice = null;
        state.eventCount++;
        state.nextEventAt = state.quarter + 3 + Math.floor(state.rng() * 5);
      }
    }

    /* ⑪ 终局检查 */
    if (state.cash < (C.bankruptcyCash || -1500)) {
      state.bankrupt = true;
      log(state, '资金跌破警戒线，公司进入破产程序');
      enterPhase(state, 'over');
      return;
    }
    if (state.quarter >= (C.totalQuarters || 60)) { enterPhase(state, 'over'); return; }
    state.quarter++;
  }

  /* 抽事件卡：优先抽「当前情境下有意义」的卡。
   * 例如没有飞机在停场时，抽到「检修」类卡片毫无意义 —— 换成更能产生决策张力的卡。 */
  function drawEvent(state) {
    var pool = AT.EVENTS.slice();
    // 剔除与当前状态无关的卡
    pool = pool.filter(function (e) {
      if (e.id === 'ev_pilot_strike' || e.id === 'ev_safety') return state.planes.length >= 3;
      if (e.id === 'ev_rival_crisis') return state.rivals.some(function (r) { return r.alive; });
      if (e.id === 'ev_new_route_right') return state.cash > 900;
      return true;
    });
    if (!pool.length) pool = AT.EVENTS.slice();
    // 避免最近 3 张重复
    var recent = state.events.slice(-3).map(function (e) { return e.id; });
    var fresh = pool.filter(function (e) { return recent.indexOf(e.id) < 0; });
    if (fresh.length) pool = fresh;
    var ev = pool[Math.floor(state.rng() * pool.length)];
    state.events.push(ev);
    return ev;
  }

  /* 玩家（或 AI）对事件卡做出选择 → 立即结算该选项的影响 */
  function chooseEvent(state, idx) {
    if (!state.card) return false;
    if (idx < 0 || idx >= state.card.options.length) return false;
    var opt = state.card.options[idx];
    state.choice = idx;
    applyEventEffect(state, opt);
    state.card = null;
    state.choice = null;
    return true;
  }

  function applyEventEffect(state, opt) {
    var e = opt.effect;
    if (!e) return;
    var C = AT.CONFIG;

    if (e.type === 'cash') {
      state.cash += e.amount || 0;
      log(state, '事件「' + state.card.title + '」→ ' + opt.label + '：资金 ' +
                ((e.amount || 0) > 0 ? '+' : '') + (e.amount || 0) + ' 万元');
    } else if (e.type === 'demand_all' || e.type === 'demand_region') {
      state.mods.push({ type: 'demand_all', mult: e.mult || 0, turns: e.turns || 2,
                        region: e.region || null, note: state.card.title });
      log(state, '事件「' + state.card.title + '」→ ' + opt.label + '：需求 ' +
                ((e.mult || 0) > 0 ? '+' : '') + Math.round((e.mult || 0) * 100) + '% 持续 ' + (e.turns || 2) + ' 回合');
    } else if (e.type === 'cost_all') {
      state.mods.push({ type: 'cost_all', mult: e.mult || 0, turns: e.turns || 3, note: state.card.title });
      log(state, '事件「' + state.card.title + '」→ ' + opt.label + '：成本 ' +
                ((e.mult || 0) > 0 ? '+' : '') + Math.round((e.mult || 0) * 100) + '% 持续 ' + (e.turns || 3) + ' 回合');
    } else if (e.type === 'reputation') {
      state.reputation = Math.max(0, Math.min(100, state.reputation + (e.amount || 0)));
      log(state, '事件「' + state.card.title + '」→ ' + opt.label + '：声誉 ' +
                ((e.amount || 0) > 0 ? '+' : '') + (e.amount || 0));
    } else if (e.type === 'fleet_ground') {
      var n = e.count || 1, turns = e.turns || 2;
      /* 优先停场机龄最老的飞机 —— 老飞机更容易出问题，符合直觉 */
      var sorted = state.planes.slice().sort(function (a, b) { return b.ageQ - a.ageQ; });
      var grounded = 0;
      for (var i = 0; i < sorted.length && grounded < n; i++) {
        sorted[i].onGround = turns;
        grounded++;
      }
      // 停场期间航线由剩余飞机支撑；若整条线无飞机，运力自然归零
      log(state, '事件「' + state.card.title + '」→ ' + opt.label + '：' + grounded + ' 架飞机停场 ' + turns + ' 回合');
    } else if (e.type === 'dev_push') {
      /* 给「玩家已通航的城市」推高开发度 —— 体现「抓住机会深耕已有市场」 */
      var linked = {};
      state.routes.forEach(function (r) { linked[r.a] = 1; linked[r.b] = 1; });
      var pushed = 0;
      state.cities.forEach(function (c) {
        if (!linked[c.id]) return;
        c.dev = Math.min(100, c.dev + (e.amount || 8));
        pushed++;
      });
      log(state, '事件「' + state.card.title + '」→ ' + opt.label + '：' + pushed + ' 座通航城市开发度 +' + (e.amount || 8));
    } else if (e.type === 'rival_gain') {
      state.rivals.forEach(function (r) {
        if (r.alive) { r.cash += 400; r.scale += (e.amount || 0.05) * 2000; }
      });
      log(state, '事件「' + state.card.title + '」→ ' + opt.label + '：主要竞对规模扩大');
    }

    /* extra 通用效果 */
    if (e.extra) {
      if (e.extra.reputation) {
        state.reputation = Math.max(0, Math.min(100, state.reputation + e.extra.reputation));
      }
      if (e.extra.equityHit) {
        state.equityLoss += e.extra.equityHit;
      }
      if (e.extra.costTurns && e.extra.costMult) {
        state.mods.push({ type: 'cost_all', mult: e.extra.costMult, turns: e.extra.costTurns, note: state.card.title });
      }
      if (e.extra.cash) state.cash += e.extra.cash;
      /* freeRoute / stealRoute / closeWeakRoute 都会改变航线网络，
       * 由下面的辅助函数处理（它们需要知道「哪条线最优 / 最差」）。 */
      if (e.extra.freeRoute) grantFreeRoute(state);
      if (e.extra.stealRoute) grantFreeRoute(state, true);
      if (e.extra.closeWeakRoute) closeWeakestRoute(state);
    }
  }

  /* 免费获得一条航线（航权竞标成功 / 接手对手航线）：自动补 1 架合适机型 */
  function grantFreeRoute(state, fromRival) {
    var best = pickBestNewRoute(state);
    if (!best) return;
    // 先看有没有闲置飞机，没有就买一架能飞这条线的
    var plane = idlePlanes(state)[0];
    if (!plane) {
      var ty = bestNeededType(state, best.dist);
      var T = AT.planeOf(ty);
      if (state.cash < T.price * 0.3) return;      // 连首付都不够就放弃
      state.cash -= T.price;
      plane = makePlane(state, ty);
      state.planes.push(plane);
      state.stats.planesBought++;
    }
    openRoute(state, best.a, best.b, plane.type, 1, plane.id);
    log(state, (fromRival ? '接手对手航线：' : '获得新航权：') +
              cityName(state, best.a) + '—' + cityName(state, best.b));
  }

  /* 关闭最不赚钱的航线（把飞机释放回机队） */
  function closeWeakestRoute(state) {
    var worst = null, worstP = Infinity;
    state.routes.forEach(function (r) {
      var d = settleRoute(state, r);
      if (d && d.profit < worstP) { worstP = d.profit; worst = r; }
    });
    if (!worst) return;
    closeRoute(state, worst.key);
    log(state, '收缩航线：关闭 ' + cityName(state, worst.a) + '—' + cityName(state, worst.b));
  }

  /* ───────────────────────── 10. 玩家指令 ───────────────────────── */

  /* 开通航线：玩家指定两端城市与投放的飞机。
   * 校验：飞机闲置、机型航程足够、没有重复航线、距离不为零。
   * 返回 { ok, route } 或 { ok:false, reason }（UI 据此给出人话提示）。 */
  function openRoute(state, aId, bId, typeId, planeCount, firstPlaneId) {
    if (state.phase !== 'operating') return { ok: false, reason: '尚未开始运营' };
    if (aId === bId) return { ok: false, reason: '出发地与目的地不能相同' };
    var key = AT.routeKey(aId, bId);
    if (findRouteByKey(state, key)) return { ok: false, reason: '该航线已开通' };

    var dist = routeDistance(state, aId, bId);
    if (dist <= 0) return { ok: false, reason: '航线距离无效' };
    var T = AT.planeOf(typeId);
    if (dist > T.range) return { ok: false, reason: T.name + ' 航程 ' + T.range + ' km，不足以执飞该航线（' + Math.round(dist) + ' km）' };

    /* 找可用飞机：优先用指定的那架，其次按机型匹配闲置飞机 */
    var candidates = idlePlanes(state).filter(function (p) { return p.type === typeId; });
    if (firstPlaneId) {
      var fp = findPlane(state, firstPlaneId);
      if (fp && !fp.routeKey && fp.onGround <= 0) candidates = [fp];
    }
    var need = Math.max(1, planeCount || 1);
    if (candidates.length < need) {
      return { ok: false, reason: '没有足够的闲置 ' + T.name + '（需 ' + need + ' 架，可用 ' + candidates.length + ' 架）' };
    }

    candidates.slice(0, need).forEach(function (p) { p.routeKey = key; });

    var route = {
      key: key, a: aId, b: bId, type: typeId,
      ageQ: 0, fareMul: 1, planes: need,
      /* 频次档位：默认「每架每日 3 班」，但受该机型的单架物理上限约束
       * （例如宽体机飞洲际线一天最多 1 个往返 → 只能标到每日 2 班以下）。 */
      perDay: Math.min(CONFIG.defaultFreqPerDay || 3, maxPerDayFor(typeId, dist)),
      pax: 0, profit: 0
    };
    state.routes.push(route);
    state.stats.routesOpened++;
    recalcCityRoutes(state);
    pushFx(state, 'routeOpen', { a: aId, b: bId });
    log(state, '开通航线 ' + cityName(state, aId) + '—' + cityName(state, bId) +
              '（' + T.name + ' ×' + need + '）');
    return { ok: true, route: route };
  }

  /* 关闭航线：把飞机释放回机队（飞机不消失，可再指派） */
  function closeRoute(state, key) {
    var r = findRouteByKey(state, key);
    if (!r) return { ok: false, reason: '航线不存在' };
    planesOnRoute(state, key).forEach(function (p) { p.routeKey = null; });
    state.routes = state.routes.filter(function (x) { return x.key !== key; });
    state.priceWars = state.priceWars.filter(function (w) { return w.key !== key; });
    state.stats.routesClosed++;
    recalcCityRoutes(state);
    log(state, '关闭航线 ' + cityName(state, r.a) + '—' + cityName(state, r.b));
    return { ok: true };
  }

  /* 在航线上增派/撤回飞机 */
  function assignPlane(state, planeId, routeKey) {
    var p = findPlane(state, planeId);
    if (!p) return { ok: false, reason: '飞机不存在' };
    if (p.onGround > 0) return { ok: false, reason: '该飞机正在停场检修' };
    if (!routeKey) { p.routeKey = null; return { ok: true }; }
    var r = findRouteByKey(state, routeKey);
    if (!r) return { ok: false, reason: '航线不存在' };
    var T = AT.planeOf(p.type);
    var dist = routeDistance(state, r.a, r.b);
    if (dist > T.range) return { ok: false, reason: T.name + ' 航程不足' };
    p.routeKey = routeKey;
    recalcCityRoutes(state);
    return { ok: true };
  }

  /* 购买飞机：现金支付；不足可贷款（由 UI 决定，sim 只做校验） */
  function buyPlane(state, typeId, count) {
    count = Math.max(1, count || 1);
    var T = AT.planeOf(typeId);
    var total = T.price * count;
    if (state.cash + (CONFIG.loanLimit || 0) - state.debt < total) {
      return { ok: false, reason: '资金不足（需 ' + total + ' 万元，现金 ' + Math.round(state.cash) +
                                  '，可贷额度 ' + Math.round((CONFIG.loanLimit || 0) - state.debt) + '）' };
    }
    /* 现金不够就自动用贷款补足 —— 让玩家不必先手动借钱再买机（少一步操作） */
    if (state.cash < total) {
      var need = total - state.cash;
      state.debt += need;
      state.cash += need;
    }
    state.cash -= total;
    for (var i = 0; i < count; i++) state.planes.push(makePlane(state, typeId));
    state.stats.planesBought += count;
    log(state, '购入 ' + T.name + ' ×' + count + '（' + total + ' 万元）');
    return { ok: true };
  }

  /* 出售飞机：回收残值（新机约 96.8%/季度 递减） */
  function sellPlane(state, planeId) {
    var p = findPlane(state, planeId);
    if (!p) return { ok: false, reason: '飞机不存在' };
    var T = AT.planeOf(p.type);
    var value = Math.round(T.price * Math.pow(0.968, p.ageQ) * 0.92);   // 交易折价 8%
    p.routeKey = null;
    state.planes = state.planes.filter(function (x) { return x.id !== planeId; });
    state.cash += value;
    recalcCityRoutes(state);
    log(state, '出售 ' + T.name + '（' + p.reg + '），回收 ' + value + ' 万元');
    return { ok: true, value: value };
  }

  /* 航线换机型（机型升级链的落点）—— 2026-09-14 补
   *
   * ⚠ 为什么必须有这个操作：
   *   时段槽位是**按航线**给的、与机型无关，所以「槽位满了」之后
   *   唯一的增长出路就是**换更大的机型** —— 同样 15 个时刻，
   *   76 座机只能运 0.041 百万客/季，384 座机能运 0.207，差 5 倍。
   *   slotCap 那段注释写明了「换大机型 → 同槽位运更多客 → 唯一出路」，
   *   但此前一直没有实现这个函数，导致玩家/AI 被永久锁死在「小机 + 槽位已满」
   *   的饥饿状态（实测终局 113/114 条线「运力吃紧」却无计可施）。
   *
   * 语义 = 「退役该线现有飞机 + 购入新机型同架数 + 把航线指向新机型」。
   * 旧机按残值回收冲抵购机款（净值口径即「补差价」）。
   * 返回可用净额（新机总价 − 旧机回收）供 UI 显示「需补 X 万元」。 */
  function upgradeRouteType(state, key, newTypeId) {
    var r = findRouteByKey(state, key);
    if (!r) return { ok: false, reason: '航线不存在' };
    var T2 = AT.planeOf(newTypeId);
    if (!T2) return { ok: false, reason: '机型不存在' };
    if (r.type === newTypeId) return { ok: false, reason: '已经是该机型' };
    var dist = routeDistance(state, r.a, r.b);
    if (dist > T2.range) {
      return { ok: false, reason: T2.name + ' 航程 ' + T2.range + ' km，不足以执飞该航线（' + Math.round(dist) + ' km）' };
    }
    var onRoute = state.planes.filter(function (p) { return p.routeKey === key; });
    var n = onRoute.length;
    if (!n) return { ok: false, reason: '该航线没有执飞飞机' };

    /* ① 先算钱：回收旧机 + 购入新机 = 净支出 */
    var tradeIn = 0;
    onRoute.forEach(function (p) {
      var T = AT.planeOf(p.type);
      tradeIn += T.price * Math.pow(0.968, p.ageQ) * 0.92;
    });
    var cost = T2.price * n;
    var net = cost - tradeIn;
    var available = state.cash + (CONFIG.loanLimit || 0) - state.debt;
    if (net > available) {
      return { ok: false, reason: '资金不足（需补 ' + Math.round(net) + ' 万元，可用 ' +
        Math.round(available) + ' 万元）', need: Math.round(net) };
    }

    /* ② 退役旧机（不写日志，合并成一条更易读） */
    var oldTypeName = AT.planeOf(r.type).name;
    var ids = {};
    onRoute.forEach(function (p) { ids[p.id] = 1; });
    state.planes = state.planes.filter(function (p) { return !ids[p.id]; });
    state.cash += tradeIn;

    /* ③ 购入新机并直接挂到该线上 */
    for (var i = 0; i < n; i++) {
      var np = makePlane(state, newTypeId);
      np.onGround = 0;              /* 置换是即时交割，不走交付期 */
      np.routeKey = key;
      state.planes.push(np);
    }
    state.cash -= cost;
    state.stats.planesBought += n;

    /* ④ 航线指向新机型 */
    r.type = newTypeId;
    recalcCityRoutes(state);
    log(state, '航线 ' + cityName(state, r.a) + '—' + cityName(state, r.b) +
      ' 机型升级：' + oldTypeName + ' ×' + n + ' → ' + T2.name +
      ' ×' + n + '（补差价 ' + Math.round(net) + ' 万元）');
    return { ok: true, net: Math.round(net), count: n, from: oldTypeName, to: T2.name };
  }

  /* 贷款 / 还款 */
  function borrow(state, amount) {
    amount = Math.max(0, Math.round(amount || 0));
    var limit = (CONFIG.loanLimit || 4000);
    if (state.debt + amount > limit) return { ok: false, reason: '超出贷款额度上限（' + limit + ' 万元）' };
    state.debt += amount;
    state.cash += amount;
    log(state, '贷款 ' + amount + ' 万元（累计负债 ' + state.debt + '）');
    return { ok: true };
  }
  function repay(state, amount) {
    amount = Math.max(0, Math.min(state.debt, Math.round(amount || 0)));
    if (amount <= 0) return { ok: false, reason: '没有可偿还的负债' };
    if (state.cash < amount) return { ok: false, reason: '现金不足' };
    state.debt -= amount;
    state.cash -= amount;
    log(state, '偿还贷款 ' + amount + ' 万元（剩余负债 ' + state.debt + '）');
    return { ok: true };
  }

  /* 调整票价：fareMul 0.7~1.4。降价拉客座率但压单价，提价反之 —— 真实取舍。 */
  function setFare(state, key, mul) {
    var r = findRouteByKey(state, key);
    if (!r) return { ok: false, reason: '航线不存在' };
    r.fareMul = Math.max(0.7, Math.min(1.4, mul));
    return { ok: true, fareMul: r.fareMul };
  }

  /* 调整航线频次档位（每日 N 班）。
   *
   * 这是本作的核心操作之一（2026-09-14 用户拍板的玩法）：
   *   · 加密 → 运力上升 → 能抢更多市场份额，但变动成本等比上升
   *   · 减班 → 成本下降，但抢不到市场、可能被竞对压份额
   * 上限受「机型物理利用率 × 飞机数」与「航线总上限」双重约束。
   * 返回实际生效的档位 —— 若玩家请求超过物理上限，会被**降档到可行值**并如实告知。 */
  /* 设置航线频次档位。
   *
   * ⚠ 语义（2026-09-14 钉死，勿改）：perDay 是**每架飞机**的每日班次，
   *   与 settleRoute 的排班段保持一致。整条航线的总班次 = perDay × 架数。
   *   因此架数越多，同样的档位能开出的总班次越多 —— 这就是「加机能加密」。
   *
   * 上限有三层（按物理性与硬度的顺序）：
   *   · 单架物理上限 maxPerDayFor（洲际宽体一天只能 1~2 个往返）；
   *     档位本身若超过它（如宽体洲际选「每日 6 班」），会被夹到物理上限。
   *   · 航线时段槽位 routeSlots（机场时刻供给上限，整条线的硬天花板）。
   *     这是**扩张终点**：槽位满后加机不再增班，只能换更大机型。
   *   · 航线总上限 routeMaxPerDay（20 班/日，兜底安全阀）。
   */
  function setFrequency(state, key, perDay) {
    var r = findRouteByKey(state, key);
    if (!r) return { ok: false, reason: '航线不存在' };
    var ca = findCity(state, r.a), cb = findCity(state, r.b);
    if (!ca || !cb) return { ok: false, reason: '航线城市无效' };
    var dist = G.distKm(ca, cb);
    var nPlanes = Math.max(1, r.planes || 1);
    var typeCap = maxPerDayFor(r.type, dist);
    var routeMax = CONFIG.routeMaxPerDay || 20;
    var slotCap = routeSlots(state, r.a, r.b);

    var want = Math.max(1, Math.round(perDay));
    /* 先按单架物理上限夹（档位含义就是每架班次） */
    var applied = Math.max(1, Math.min(want, typeCap));
    /* 再按「航线总班次」夹 —— 取槽位与兜底上限的较小者 */
    var totalCap = Math.min(routeMax, slotCap);
    var total = applied * nPlanes;
    var clampedByRoute = false, clampedBySlot = false;
    if (total > totalCap) {
      applied = Math.max(1, Math.floor(totalCap / nPlanes));
      clampedBySlot = slotCap <= routeMax;
      clampedByRoute = !clampedBySlot;
    }
    r.perDay = applied;

    if (applied < want) {
      var why;
      if (clampedBySlot) {
        why = ca.name + '—' + cb.name + ' 的时刻已饱和（整条线每日最多 ' +
          Math.round(slotCap) + ' 班，' + nPlanes + ' 架时每架最多 ' + applied + ' 班/日）。';
      } else if (clampedByRoute) {
        why = '整条航线总班次上限 ' + routeMax + ' 班/日，' + nPlanes + ' 架时每架最多 ' + applied + ' 班/日。';
      } else {
        why = AT.planeOf(r.type).name + ' 在该航线上单架最高 ' + typeCap + ' 班/日。';
      }
      return {
        ok: true, perDay: applied, clamped: true,
        clampedBySlot: clampedBySlot,
        reason: why + '想再加密请换更大机型或另开新线。'
      };
    }
    return { ok: true, perDay: applied, clamped: false };
  }

  /* 推荐一条新航线：给玩家「该开哪条线」的建议。
   *
   * ⚠ 2026-09-14 修正（重要，这是会把新手带进死胡同的 bug）：
   *   旧版只按「需求量 × 未开发加成」评分，唯一约束是「有航程够的机型」
   *   —— 而这个约束在**玩家买不起时也成立**（只要某个机型航程够就算通过）。
   *   实测后果：上海基地、只有 2 架云雀 100（航程 2400km）的玩家，
   *   点「智能推荐」得到的是 **上海—纽约（11859km）** —— 点下去必然失败，
   *   提示「云雀 100 航程不足」。新手会以为游戏坏了。
   *
   *   现在改为**分两档推荐，且明确给出建议机型**：
   *     · 首选：玩家现有机队能直接执飞的航线（推荐了就能马上开）✓
   *     · 次选：现有机队飞不了，但玩家**买得起**建议机型的航线
   *       （返回 needBuy 字段 + 建议机型，UI 可提示「需购入 XX」）
   *   两档分数不混在一起比 —— 否则「远但需求高」的线总会压过「近且马上能飞」，
   *   新手依然会被引向买不起的线。只有当首选档完全为空时才回退到次选。
   *
   * 返回值：{ a, b, dist, potential, type, needBuy, score }
   *   type    —— 建议机型（现有机队里能飞的，或需购买的那款）
   *   needBuy —— true 表示需要先购买该机型 */
  function pickBestNewRoute(state, fromCityId) {
    var cities = state.cities;
    var bases = fromCityId ? cities.filter(function (c) { return c.id === fromCityId; })
      : state.cities.filter(function (c) {
          // 候选出发点：玩家已有航线的城市（网络延伸）+ 基地
          if (c.isHome) return true;
          return state.routes.some(function (r) { return r.a === c.id || r.b === c.id; });
        });
    /* 玩家机队里「能马上用」的机型（含未交付的，因为可以等） */
    var ownedTypes = {};
    state.planes.forEach(function (p) { ownedTypes[p.type] = true; });
    var affordable = state.cash + (CONFIG.loanLimit || 0) - state.debt;

    var feasible = null, feasibleScore = -1;   // 档 1：现有机队能飞
    var buyable = null, buyableScore = -1;     // 档 2：需购入机型但买得起

    bases.forEach(function (a) {
      cities.forEach(function (b) {
        if (a.id === b.id) return;
        var key = AT.routeKey(a.id, b.id);
        if (findRouteByKey(state, key)) return;
        var dist = G.distKm(a, b);
        var pot = routePotential(state, a.id, b.id);
        /* 评分：需求量为主，扣除竞对已占（竞对在线上的会分流），并给「未开发城市」加成
         * —— 引导玩家去「交通促进发展」的空白地带，而不是挤在成熟干线上。 */
        var rivalOn = state.rivals.some(function (r) {
          return r.alive && r.routes.some(function (rt) { return rt.key === key; });
        });
        var score = pot * (rivalOn ? 0.6 : 1.0) * (1 + (100 - b.dev) / 220);

        /* 档 1：机队里已有能飞的机型 —— 选其中**最合适的**（按该线需求密度） */
        var canFlyNow = AT.PLANES.filter(function (p) {
          return ownedTypes[p.id] && p.range >= dist;
        });
        if (canFlyNow.length) {
          var ideal = idealSeatsFor(state, a.id, b.id);
          var pick = canFlyNow[0], pd = Infinity;
          canFlyNow.forEach(function (p) {
            var dd = Math.abs(p.seats - ideal);
            if (dd < pd) { pd = dd; pick = p; }
          });
          if (score > feasibleScore) {
            feasibleScore = score;
            feasible = { a: a.id, b: b.id, dist: dist, potential: pot,
              type: pick.id, needBuy: false, score: score };
          }
          return;
        }
        /* 档 2：需要买新机 —— 取「能飞且最买得起」的那款 */
        var cands = AT.PLANES.filter(function (p) {
          return p.range >= dist && p.price <= affordable;
        }).sort(function (x, y) { return x.price - y.price; });
        if (!cands.length) return;
        var ideal2 = idealSeatsFor(state, a.id, b.id);
        var pick2 = cands[0], pd2 = Infinity;
        cands.forEach(function (p) {
          var dd = Math.abs(p.seats - ideal2);
          if (dd < pd2) { pd2 = dd; pick2 = p; }
        });
        if (score > buyableScore) {
          buyableScore = score;
          buyable = { a: a.id, b: b.id, dist: dist, potential: pot,
            type: pick2.id, needBuy: true, score: score };
        }
      });
    });
    /* 优先给「马上能开」的线 —— 这是新手引导最重要的一点 */
    return feasible || buyable;
  }

  /* 一条航线的「理想机型座位数」：需求 ÷ 槽位上的班次 ÷ 90 天 ÷ 目标客座率。
   * 用于在可选机型里挑最匹配的那款（既不会用小机拉稀，也不会用巨机空飞）。 */
  function idealSeatsFor(state, aId, bId) {
    var pot = routePotential(state, aId, bId);
    var slot = Math.max(1, Math.floor(routeSlots(state, aId, bId)));
    /* 假设用 3 架机填满槽位 */
    var perPlaneFlights = Math.max(1, slot / 3) * 90;
    return pot * 1e6 / (perPlaneFlights * (CONFIG.loadFactorBase || 0.74));
  }

  /* 为一条航线挑选「刚好够用」的机型：能飞且价格最低 */
  function bestNeededType(state, dist) {
    var cands = AT.PLANES.filter(function (p) { return p.range >= dist; })
      .sort(function (a, b) { return a.price - b.price; });
    return cands.length ? cands[0].id : AT.PLANES[AT.PLANES.length - 1].id;
  }

  /* ───────────────────────── 11. tick ───────────────────────── */

  function tick(state, dt) {
    if (!state || state.phase === 'over') return state;
    dt = (dt == null) ? TICK : dt;

    if (state.phase === 'briefing') {
      state.t += dt;
      if (state.t >= (CONFIG.briefingSeconds || 8)) enterPhase(state, 'operating');
      return state;
    }

    if (state.phase === 'operating') {
      state.t += dt;
      /* 有未处理的事件卡时暂停回合计时 —— 玩家要先做出决策才能继续，
       * 否则「事件卡弹出 → 玩家还在读 → 回合已经跳过了」的体验很糟。 */
      if (state.card) return state;
      if (state.t >= (CONFIG.quarterSeconds || 22)) {
        state.t = 0;
        resolveQuarter(state);
      }
      return state;
    }

    return state;
  }

  function advance(state, seconds) {
    var remain = seconds;
    while (remain > 1e-9 && state.phase !== 'over') {
      var step = Math.min(TICK, remain);
      tick(state, step);
      remain -= step;
    }
    return state;
  }

  /* 立即结算当前季度并进入下一季 —— 供 UI 的「加速本回合」按钮调用。
   *
   * ⚠ 为什么需要它：季度推进原本只由 tick 里的 22 秒倒计时驱动，
   *   玩家想快进就得干等。真实经营游戏（如《铁路大亨》）都给一个「推进」按钮，
   *   让熟练玩家跳过等待 —— 这是节奏控制权，不是作弊。
   *
   * ⚠ 与 tick 的关系：本函数**不绕过 tick**，而是把 t 直接推到阈值，
   *   再调一次 tick 让它走正常的结算路径。这样事件卡触发、终局检查、
   *   历史快照等全部逻辑与自然推进完全一致，不存在「两条路径结果不同」的风险
   *   （对比：直接调 resolveQuarter 会跳过 tick 里的阶段守卫）。
   *
   * ⚠ 事件卡未决时拒绝推进：那会让玩家「跳过」一个必须做的决策。
   *   返回 {ok:false, reason} 让 UI 提示「请先处理事件卡」。 */
  function nextQuarter(state) {
    if (!state || state.phase !== 'operating') return { ok: false, reason: '尚未进入运营阶段' };
    if (state.card) return { ok: false, reason: '有未处理的事件卡' };
    state.t = (AT.CONFIG.quarterSeconds || 22);
    tick(state, TICK);
    return { ok: true, quarter: state.quarter };
  }

  /* 剩余秒数（供 UI 画回合计时条）。
   * 事件卡未决时返回 null —— 此时计时是暂停的，显示「待决策」而不是一个不动的数字。 */
  function quarterRemain(state) {
    if (!state || state.phase !== 'operating') return null;
    if (state.card) return null;
    var total = AT.CONFIG.quarterSeconds || 22;
    return Math.max(0, total - state.t);
  }

  /* ───────────────────────── 12. 排名与终局 ─────────────────────────

   * 排名口径：**净资产降序**（现金 − 负债 + 机队残值）。
   * 为什么不用航线数或客流：重资产扩张与轻资产高效运营都能赢，
   * 用净资产才能让两种打法在同一天平上比较。
   * 竞对规模用同一套公式折算（它们的 fleet/routes 是简化模型），
   * 保证玩家与竞对可比。
   */
  function ranking(state) {
    var list = [];
    list.push({
      id: 'PLAYER', name: state.companyName, isPlayer: true,
      netWorth: netWorth(state),
      cash: Math.round(state.cash), debt: Math.round(state.debt),
      fleet: state.planes.length, routes: state.routes.length,
      pax: state.stats.paxTotal, color: '#F5C542'
    });
    state.rivals.forEach(function (r) {
      var fv = r.fleet.reduce(function (s, f) { return s + AT.planeOf(f.type).price * f.count; }, 0);
      list.push({
        id: r.id, name: r.name, isPlayer: false,
        netWorth: r.cash + fv * 0.85,
        cash: Math.round(r.cash), debt: 0,
        fleet: r.fleet.reduce(function (s, f) { return s + f.count; }, 0),
        routes: r.routes.length, pax: 0, color: '#8C93A8',
        alive: r.alive
      });
    });
    return list.sort(function (a, b) { return b.netWorth - a.netWorth; });
  }

  function myRank(state) {
    var rk = state.ranking;
    if (!rk) return 0;
    for (var i = 0; i < rk.length; i++) if (rk[i].isPlayer) return i + 1;
    return 0;
  }

  /* 终局评价：三档。
   *   巨企（达成胜条件）/ 区域强者 / 勉强存活 / 破产退市 */
  function verdict(state) {
    var C = AT.CONFIG;
    var rank = myRank(state);
    if (state.bankrupt) return { tier: 'bankrupt', label: '破产退市', desc: '资金链断裂，公司进入清算程序。' };
    var nw = netWorth(state);
    if (rank <= (C.winRank || 3) && (nw >= (C.winNetWorth || 60000) || state.planes.length >= (C.winFleetSize || 40))) {
      return { tier: 'giant', label: '全球航空巨企', desc: '你建成了一张真正的全球航线网络，成为航空业不可忽视的力量。' };
    }
    if (rank <= (C.winRank || 3)) {
      return { tier: 'major', label: '区域级强者', desc: '规模已进入全球前列，但离真正的巨企还差一步。' };
    }
    if (nw > 0) return { tier: 'survivor', label: '稳健经营者', desc: '公司在竞争中活了下来，规模稳步增长。' };
    return { tier: 'failing', label: '艰难维持', desc: '资产已不足以覆盖负债，需要重新审视航线网络。' };
  }

  /* 全球化程度：已通航城市 × 覆盖地区数 / 全球城市数。
   * 它是「成为全球航空巨企」这一目标的直观进度条，UI 顶栏常驻显示。 */
  function globalization(state) {
    var cities = {}, regions = {};
    state.routes.forEach(function (r) {
      cities[r.a] = 1; cities[r.b] = 1;
      var ca = findCity(state, r.a), cb = findCity(state, r.b);
      if (ca) regions[ca.region] = 1;
      if (cb) regions[cb.region] = 1;
    });
    var nCities = Object.keys(cities).length;
    var nRegions = Object.keys(regions).length;
    /* 覆盖度：城市占 60% 权重、地区占 40%。两者都满即 100。 */
    var cover = (nCities / state.cities.length) * 60 + (nRegions / AT.REGIONS.length) * 40;
    return {
      cities: nCities, totalCities: state.cities.length,
      regions: nRegions, totalRegions: AT.REGIONS.length,
      pct: Math.round(Math.min(100, cover)),
      hubs: state.routes.length          // 航线数（网络密度）
    };
  }

  /* 下一季度预估（不改状态）—— 供 UI 在航线面板显示「预期利润」。
   * 与 resolveQuarter 用同一个 settleRoute，口径必然一致。 */
  function forecast(state) {
    var detail = state.routes.map(function (r) { return settleRoute(state, r); }).filter(Boolean);
    var revenue = 0, cost = 0, pax = 0;
    detail.forEach(function (d) { revenue += d.revenue; cost += d.cost; pax += d.pax; });
    var overhead = 60 + state.planes.length * 8;
    var interest = state.debt * (CONFIG.loanRatePerQuarter || 0.022);
    return {
      detail: detail, revenue: revenue, cost: cost, pax: pax,
      overhead: overhead, interest: interest,
      net: revenue - cost - overhead - interest
    };
  }

  /* ───────────────────────── 导出 ───────────────────────── */
  AT.sim = {
    TICK: TICK,
    makeRng: makeRng,
    create: create,
    tick: tick,
    advance: advance,
    // 查询
    findCity: findCity, findPlane: findPlane, findRoute: findRoute,
    findRouteByKey: findRouteByKey, routeDistance: routeDistance,
    planesOnRoute: planesOnRoute, idlePlanes: idlePlanes,
    totalSeats: totalSeats, fleetValue: fleetValue, netWorth: netWorth,
    routePotential: routePotential, routeFlights: routeFlights,
    maxPerDayFor: maxPerDayFor, tierOf: tierOf, routeSlots: routeSlots,
    settleRoute: settleRoute, costMul: costMul, modMul: modMul,
    // 指令
    openRoute: openRoute, closeRoute: closeRoute, assignPlane: assignPlane,
    buyPlane: buyPlane, sellPlane: sellPlane, upgradeRouteType: upgradeRouteType,
    borrow: borrow, repay: repay, setFare: setFare, setFrequency: setFrequency,
    chooseEvent: chooseEvent,
    pickBestNewRoute: pickBestNewRoute, bestNeededType: bestNeededType,
    idealSeatsFor: idealSeatsFor, playerTurn: playerTurn,
    // 结算与终局
    resolveQuarter: resolveQuarter, forecast: forecast, ranking: ranking,
    myRank: myRank, verdict: verdict, globalization: globalization,
    recalcCityRoutes: recalcCityRoutes,
    // UI 节奏控制
    nextQuarter: nextQuarter, quarterRemain: quarterRemain
  };

})(typeof window !== 'undefined' ? window : globalThis);
