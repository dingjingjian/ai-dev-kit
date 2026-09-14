/*
 * air-tycoon — data.js
 * 城市 / 机型 / 事件卡 / 全局配置（纯 JS 字面量，不 fetch，不联网）
 * 命名空间：window.AT（离线小工具经典脚本，无 import/export/type=module）
 * 加载顺序：compat → data → geo → sim → ai → render → audio → ui → game
 *
 * 设定口径（用户 2026-09-14 定稿）：
 *   - **不设国家**。地图上只有城市与地区，没有国界、没有军队、没有政治实体。
 *     玩家的身份是一家**虚拟航空公司**，公司名开局自定义。
 *   - 城市名用**真实城市名**（用户拍板）—— 城市是经营对象，不是打击对象，
 *     用真名能让玩家一眼看出「上海 → 东京」这条线该不该开，上手成本最低。
 *   - 地区（region）只作**经济地理聚类**用：同地区航线短、需求稳；
 *     跨地区航线贵、需求高。地区名是地理概念（东亚、西欧），不是政治实体。
 *
 * ⚠ 与 defcon 的分野：defcon 的红线是「不出现真实城市/国家名」（核打击题材）；
 *   本作题材是民航经营，打击对象是竞争对手而非城市，用真名不构成合规风险，
 *   且「开一条上海到东京的航线」正是玩家的直觉。两作口径不同是有意为之。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};

  /* ───────────────────────── 1. 全局配置 ─────────────────────────
   * 数值改动必须重跑 tests/balance.js —— 经济类参数对节奏的影响比战斗类更敏感，
   * 一个 5% 的客座率改动就能把 60 回合的终局资金拉差一倍。
   */
  AT.CONFIG = {
    /* ── 局节奏 ──
     * 一局设计为 1 个季度/回合、共 60 回合（15 年）。玩家目标：终局时进入
     * 全球航空企业前三（或达到指定规模），体验「从 1 架小飞机做到全球巨企」。 */
    quarterSeconds: 22,        // 每回合（季度）时长（秒）—— 与 defcon 的 roundSeconds 同量级
    briefingSeconds: 8,        // 开局简报
    totalQuarters: 60,         // 总回合数（15 年）
    minQuarters: 24,           // 最短局（防止速通）
    speedOptions: [1, 2, 4],   // 倍速档位

    /* ── 起家资源（单基地虚拟公司）── */
    startCash: 800,            // 启动资金（万元）—— 800 万，够买 2 架支线机 + 开 3~4 条短线
    startPlanes: 2,            // 开局自带飞机数
    startPlaneType: 'cRJ1',    // 开局机型（支线喷气）
    startRoutePerPlane: 1,     // 每架开局的飞机默认已开通几条航线

    /* ── 资金与成本 ── */
    loanLimit: 4000,           // 贷款额度上限（万元）
    loanRatePerQuarter: 0.022, // 贷款季度利率
    bankruptcyCash: -1500,     // 资金跌破此线 = 破产退市

    /* ── 需求模型（2026-09-14 用真实航线数据回归标定）──
     *
     * 需求单位 = **百万客/季度**（与运力同口径）。
     * 公式：pax = POP_REF × penRate × (popSum/POP_REF)^penExp
     *              × wealthF × distAdj × lvF × bonusF × repF
     *
     * 标定方法见 tools/fit-demand.js：把 11 条真实国际干线（日班次/座位/客座率
     * 取自 Jetpunk 2024-11 全球最忙航线榜）作观测样本，在对数空间做受约束回归。
     * 结果 R² = 0.80，最大残差 2 倍（出现在悉尼-约翰内斯堡这类极薄长程线）。
     * 关键结论：**单靠人口解释不了真实客流** —— 内罗毕-开罗每百万人口仅 2.43 客流，
     * 迪拜-伦敦是 41.44，差 17 倍，必须引入收入弹性。
     *
     * ⚠⚠ 2026-09-14 第二次关键修正 —— 回归值之上再乘「游戏尺度系数」。
     *
     * 问题：回归直接产出**真实世界总客流**（上海-东京 2.75 百万客/季 ≈ 每日 45 班，
     *   与现实吻合），这是很好的真实性。但玩家在一条线上最多只能做到
     *   0.10~0.52 百万客/季（槽位 + 机队规模决定的运力上限），
     *   于是「需求 / 可达运力」在 5~27 倍之间 —— 后果是：
     *     · 客座率恒定等于基准 lf（74%），1 架与 5 架完全相同；
     *     · 玩家永远体会不到「这条线被我做满了」的成就反馈；
     *     · 淡旺季、降价促销、竞对抢客这些机制全部失去作用面
     *       （需求远大于运力时，怎么让利都卖得掉）。
     *
     * ★ 决策（用户拍板）：**需求压缩到玩家可达量级**，优先保证玩法闭环。
     *   压缩系数 1/3 —— 使「需求 / 槽位运力」的中位数落在 1.13（跨 14 条样本航线），
     *   即：一部分线是需求瓶颈（薄线，客流撑不满航班 → 客座率掉 → 该降频或换小机），
     *       一部分线是槽位瓶颈（干线，航班挤不进时刻 → 该换大机型）。
     *   两类约束并存，玩家每次扩张都要先判断「这条线卡在哪」—— 这才有经营感。
     *
     *   代价（明确记录，不回避）：需求数字**不再等于真实客流**。
     *     上海-东京 0.92 百万客/季（真实约 2.75）。城市人口、城市名、
     *     票价曲线、收入弹性、渗透率模型全部保留真实性，只有绝对尺度缩放。
     *     若要恢复真实尺度（例如做科普向展示），把 penetrationRate 乘 3 即可，
     *     但需同时把 slotBase 与机型座位数放大 3 倍，否则玩法闭环会破裂。 */
    penetrationRate: 0.0042,   // 尺度系数 = 回归值 0.0126 × 游戏压缩系数 1/3
    penetrationPopExp: 0.90,   // 人口指数（<1：大城市对客流更大，但有递减）
    wealthExp: 3.2,            // 富裕度指数（回归解出；航空是收入弹性 >1 的消费）
    wealthRef: 1.15,           // 富裕度基准（全球中位），使中位城市对 wealthF ≈ 1

    /* ── 市场争抢（「航线只吃市场的一部分」）──
     *
     * ⚠ 2026-09-14 第四次修正后，原本的 marketShareK / marketShareExp /
     *   marketShareCeil 三个参数已**整体废除**。它们试图用一条人造份额曲线
     *   （份额 = f(我的运力 / 市场服务能力)）来表达「一条航线吃市场多少」，
     *   但根子上选错了参照系：市场服务能力是单架机运力的 181 倍，
     *   任何形状的曲线在这么小的自变量下都被压成常数，参数扫描完全无响应
     *   （详见 src/sim.js settleRoute「市场争抢层」注释里的三版失败复盘）。
     *
     * 现在份额由「需求 vs 运力」直接回答，不需要额外系数：
     *   · 无竞对 → share = 1（独吞整条线的需求）
     *   · 有竞对 → 双方按运力比例瓜分（加机就能抢份额）
     *   · 需求小于运力 → 客座率自然下降（这就是「该减机」的信号）
     *   · 需求大于运力 → 客座率顶到基准 lf（这就是「该加机」的信号）
     *
     * 因此本段不再有任何市场争抢参数 —— 参数越少，标定越可靠。
     * 若将来要让「品牌力」影响瓜分比例，正确入口是 sim.js 里 share 的
     * 权重项，而不是在 demand / capacity 上再乘系数。 */

    devBonus: 1.35,            // 开发度对需求的放大系数

    routeMaturityQuarters: 6,  // 航线培育期（季度）—— 新线前几季度客流打折，逼玩家养线
    routeMaturityFloor: 0.45,  // 培育期起始折扣（首季客流只有成熟期的 45%）

    /* ── 城市发展（飞轮的另一半）──
     * 每座城市有 dev（开发度 0..100）。已通航的航线数、客流规模、机型等级
     * 共同推动 dev 上涨；dev 越过阈值即升 level，level 反过来抬需求与票价上限。
     * 这就是「交通促进地区发展」的数值表达。 */
    cityDevGrowth: 0.16,       // 每回合开发度基础增量（按通航规模加权）
    cityDevDecay: 0.012,       // 无航线时的自然衰减（不经营就退化）
    devPerLevel: 20,           // 每 devPerLevel 点开发度升 1 级
    maxCityLevel: 5,           // 城市最高 5 级（全球枢纽）
    levelDemandMul: [1, 1.22, 1.5, 1.85, 2.3],   // 各等级需求倍率（index = level-1）

    /* ── 票价与收入 ──
     * ticketPerKm 标定依据（2026-09-14）：真实民航经济舱全价约 1.0~1.3 元/公里
     * （国内干线 1067km ≈ 1100~1300 元；洲际 5570km ≈ 6000~9000 元）。
     * 但玩家实际卖的是**折扣后的平均票价**（真实航司平均票价约全价的 6~7 折），
     * 且本模型已用 loadFactorBase 体现「卖低价换客座率」，故取 0.78 元/公里 =
     * 全价 1.15 元/公里的 68 折 —— 与真实航司的平均收益水平一致。 */
    ticketPerKm: 0.78,         // 平均票价（元/公里，已含折扣）
    firstClassMul: 2.1,        // 头等/商务舱溢价（按机型的 premium 比例加权）
    loadFactorBase: 0.74,      // 基准客座率（真实航司 0.78~0.84，但对玩家留出改善空间）
    loadFactorPriceK: 0.9,     // 票价对客座率的弹性系数（定价高则客座率掉）

    /* ── 非油成本（起降 + 地服 + 机组 + 客舱服务）──
     * 口径：**每座每季的运营成本**，按「投放座位量」而非「载客量」计
     * （空座也要清洁与配餐预备，这也让「客座率低则单位成本高」成立）。
     *
     *   nonFuelPerSeat = nonFuelCoef × dist^nonFuelExp     （元/座）
     *
     * 标定方式（tools/calib-cost.js，2026-09-14）：
     *   1. 对 8 条真实航线反解出「令全成本 = 收入 86%」的每座非油成本：
     *        1067km→261 | 1755km→676 | 3553km→1268 | 5570km→2746 | 8820km→3688
     *   2. 在双对数空间做最小二乘，得 coef=0.0741、exp=1.205
     *   3. 再按**设计目标区间**逐条判分（支线 3~12% / 窄体 10~20% / 宽体 12~24%），
     *      微调 coef 到 0.076 —— 命中 6/8、零亏损、平均利润率 12.8%。
     *
     * ⚠ exp 的含义与敏感度：exp > 1 表示成本随距离**超线性**增长（长航段的
     *   机组轮换、外站保障、航食补给、飞机周转损耗以略高于距离的速度累积）。
     *
     * ⚠⚠ 2026-09-14 第五次修正 —— 需求压缩后必须同步下调 exp，否则远程线全亏。
     *
     *   前因：用户拍板把需求压缩到 1/3（见 penetrationRate 注释）后，
     *     收入端整体缩水，而 exp=1.205 对远程线的成本惩罚原样保留 ——
     *     实测所有 6000km 以上航线全部转负（约翰内斯堡-开罗 −19.7%、
     *     法兰克福-洛杉矶 −13.6%、上海-洛杉矶 −20.0%），
     *     玩家将无法经营任何远程航线，机型升级链在宽体这一档直接断掉。
     *
     *   修正：exp 从 1.205 降到 **1.08**（仍大于 1，保留「远距离单位成本更高」
     *     的真实规律，但不再过度惩罚）。同时 coef 从 0.076 上调到 0.155 ——
     *     两个参数**必须成对调**：降 exp 会让整体成本变松（利润率从 5% 跳到 48%），
     *     再抬 coef 把总成本水尺拉回设计区间。单独改任一个都会跑偏。
     *
     *   标定方法（tools/audit-econ.js 穷举「机型 × 架数 × 档位」取最优解）：
     *     目标 = 14 条样本航线全部为正、平均 18~22%、最高 ≤ 34%。
     *     实测 coef 每涨 0.01 → 平均利润率降约 3.3 个百分点（线性可控）。
     *     取 0.155 得：平均 20.6%、最低 −1.7%、最高 32.5%。
     *
     *   ⚠ 若日后要恢复真实需求尺度（penetrationRate ×3），
     *     coef 必须同步调回 0.076 附近、exp 调回 1.20 —— 这两个参数是
     *     **与需求尺度绑定的**，任何一侧变动都要重跑 audit-econ.js。 */
    nonFuelCoef: 0.155,
    nonFuelExp: 1.08,

    /* ── 座位规模成本因子（2026-09-14 第四次成本修正）──
     * 非油成本的「每座单价」随机型座位数**上升**：seatCostF = (seats/174)^exp。
     * 表达真实世界里大飞机的规模劣势：起降费按最大起飞重量分级（重量增长快于
     * 座位数）、机组配员更多、客舱设备更重更贵、周转时间更长。
     *
     * ⚠ 为什么必须有这一项：没有它，非油成本与座位数无关 →
     *   大飞机单位成本与支线机相同，但商务舱占比更高（票价更高），
     *   于是**所有航线的最优解都是最大的那架机**，机型梯队彻底失效。
     *
     * 标定（tools/audit-econ.js 表③「同槽位下比较各机型」验证）：
     *   76座 → 0.86 | 174座 → 1.00 | 288座 → 1.16 | 384座 → 1.24
     *
     *   ⚠⚠ exp 的定值过程（三档对比，勿凭直觉改）：
     *     0.42（初版）→ 宽体全线劣势：东京-洛杉矶 288座 +0.7%、384座 **−3.1%**，
     *                   机型升级链在宽体这一档**完全断掉**（升上去反而亏）；
     *     0.15/0.10  → 大机型全面碾压：上海-东京 384座 23.1% vs 76座 6.6%，
     *                   小机型没有任何存在意义，「买最贵的」成为唯一解；
     *     **0.22（选定）** → 上海-东京 174→180→288→384 座利润率 17.3%→20.4%
     *                   →16.7%→18.0%（波动但绝对利润 4900→6108→8432→12589 单调递增），
     *                   东京-洛杉矶 288→384 座 7.7%→8.5%（超远程大机更优，符合真实），
     *                   **梯队方向正确且两种机型都有存在意义**。
     *
     *   ⚠ 极其敏感：0.30 时宽体在干线上已不划算，0.15 时小机失去价值。
     *     改前必须跑 tools/audit-econ.js 表③，看三条航线的利润率是否仍「有交错」。 */
    seatCostExp: 0.22,

    /* ── 飞机持有成本（折旧/租金）──
     * 真实航司两大成本之一（另一是航油），占收入 12~18%。
     * 本作按「机价 × 季度折旧率」计入每条航线的成本，见 sim.js settleRoute。
     * 0.045/季 ≈ 18%/年，涵盖直线折旧 + 融资租赁利息 + 保险的综合负担。
     * ⚠ 这是让「宽体机飞薄线必亏」成立的关键参数：飞机按架折旧，
     *   飞得少则单位成本高，逼玩家把大飞机投到真正吃得下的大市场。 */
    ownershipPerQuarter: 0.045,

    /* ── 竞对 AI ──
     * 无国家的世界里，竞争者是同行航空公司。开局有 5 家竞对，
     * 各自有母城、资金、机队与扩张倾向；它们会抢热门航线、打价格战。
     * 玩家击败它们的方式不是消灭，是市值/规模超越。 */
    rivals: 5,
    rivalStartCash: [1600, 1400, 1200, 1000, 900],
    rivalAggression: [0.72, 0.58, 0.64, 0.48, 0.55],   // 抢线激进程度
    rivalPriceWarMul: 0.86,    // 竞对价格战的票价折扣
    priceWarQuarters: 3,       // 价格战持续回合

    /* ── 频次档位（2026-09-14 用户拍板的核心玩法妥协）──
     * 设计背景：需求模型给出的是「整条城市对的真实客流」（上海-北京 1.9 百万客/季），
     * 而一架 76 座支线机按「一天 2 个往返」的旧口径一季只能运 0.015 百万客，差 127 倍。
     * 若坚持「一架机 = 一天往返一次」，玩家要堆几十架才填满一条干线 —— 不可玩。
     *
     * 妥协方案（真实性与游戏性各让一步）：
     *   一架飞机不再等价于「一天一个往返」，而是**每架飞机的日排班量**——
     *   它可以「每日 3 班 / 6 班」地加密。这正是真实航司的运作方式：
     *   同一架窄体机一天飞 6~8 个航段，从早飞到晚，而不是一天只飞一个来回。
     *
     * ⚠ 档位口径（2026-09-14 钉死，勿改）：**档位是「每架飞机」的日班次**。
     *   整条航线的总班次 = 档位 × 飞机数。所以：
     *     · 广体洲际线选「每日 6 班」会被物理上限夹到 1~2 班（飞不快那么多趟）
     *     · 加飞机 → 同样档位下总班次与运力同步翻倍（这是核心扩张动机）
     *     · 航线总班次另受 routeMaxPerDay = 20 班/日的安全阀约束
     *
     * 于是运力 = 飞机数 × 档位班次 × 座位数，玩家对每条航线选一个档位：
     *   · 薄线调到「每日 1 班」保底，不会因为运力过剩而巨亏
     *   · 干线调到「每日 6 班」拉满，一架机就能撑起像样的业务
     *   · 想吃更多市场就买第二架 —— 架数仍是有意义的扩张决策
     *
     * 真实性守住：城市人口、真实城市名、市场总量、票价曲线、渗透率全部不动。
     * 游戏性让步：不再追究「这架飞机停在哪个机场、今天第几个航段」。 */
    freqTiers: [
      { id: 1,  label: '每架每日 1 班',  perDay: 1  },
      { id: 3,  label: '每架每日 3 班',  perDay: 3  },
      { id: 6,  label: '每架每日 6 班',  perDay: 6  },
      { id: 12, label: '每架每日 12 班', perDay: 12 },
      { id: 20, label: '每架每日 20 班', perDay: 20 }
    ],
    maxPerDayPerPlane: 6,      // 单架飞机的日利用率上限（档位超过它会被夹）
    routeMaxPerDay: 20,        // 单条航线全部飞机合计的最高「每日 20 班」
    defaultFreqPerDay: 3,      // 新开航线默认档位（每架每日 3 班）

    /* ── 航线时段槽位（2026-09-14 补上的「扩张终点」）──
     *
     * ⚠ 为什么必须有这个约束（这是本作经济层最后一个结构性缺口）：
     *   需求模型（routePotential）标定的是**真实世界整条城市对的总客流** ——
     *   上海-东京 2.75 百万客/季，与现实的每日约 45 班吻合，这是刻意的真实性。
     *   但玩家能做到的运力是 **0.08~0.14 百万客/季**（4 架窄体拉满的极限）。
     *   实测比值：上海-北京 13.9×、上海-东京 33.5×、伦敦-纽约 27.6×。
     *
     *   这带来三个致命后果（tools/audit-econ.js 实测确认）：
     *     ① **需求永远不是约束** —— 客座率恒等于基准 lf（74%），
     *        1 架与 5 架完全相同，玩家感觉不到「市场被我做满了」；
     *     ② **加机收益零递减** —— 利润率恒定（上海-东京 28.3% 从头到尾），
     *        堆机是纯线性放大，没有取舍，扩张失去决策乐趣；
     *     ③ **没有扩张终点** —— 一条线可以永远加下去，游戏失去节奏。
     *
     * ★ 修法选择：不去压缩需求（那会毁掉真实客流标定），而是补一个
     *   **真实民航本来就有、且玩家能理解** 的约束 —— 航权/时段槽位。
     *   现实中一条航线能飞多少班，受限于**机场起降时刻（slot）**：
     *   伦敦希思罗、东京羽田这类饱和机场，航司挤破头也拿不到新时刻。
     *   这就是真实航司扩张的天花板，也正是本作该有的扩张终点。
     *
     * ⚠ 口径：slotMaxPerDay 是**整条航线双向合计的每日总班次上限**，
     *   由两端机场的拥挤度共同决定（越繁忙的枢纽槽位越紧张）。
     *   它不是「需求约束」而是「供给约束」—— 需求依然远大于它，
     *   但玩家飞不了那么多班，于是客座率会真正被顶满，
     *   此时唯一的出路是 **换更大的飞机**（这正是真实航司的做法）。
     *
     * 设计效果：
     *   · 槽位内：加机 → 运力线性增长（扩张有正反馈）✓
     *   · 触顶后：加机 → 运力不再涨，白付持有成本（扩张有终点）✓
     *   · 破局手段：换更大机型（同槽位运更多客）→ 机型升级链有了意义 ✓
     *
     * ⚠ 基数标定（2026-09-14 实测后定）：
     *   目标是「主流机型 3~5 架填满一条线」——
     *     · 太小（如 26 → 干线只剩 9 班/日）：2 架就触顶，买第 3 架毫无意义，
     *       扩张空间被压死，玩家感觉「没什么可做」；
     *     · 太大（如 60 → 干线 20 班/日）：拉满需要 5 架以上宽体，
     *       单条线投资过千万，开局阶段完全够不着，节奏太慢。
     *   取 42 使：繁忙枢纽对（拥挤度 0.62）→ 约 17 班/日，
     *   按窄体每架 5~6 班算正好 3 架填满，与「开局买 3 架机」的节奏吻合。
     */
    slotBase: 42,              // 一条「畅通航线」的每日总班次基数（两端都不繁忙时）
    slotCrowdExp: 0.85,        // 机场拥挤度的换算指数（hub 属性与等级的加权）
    slotMinPerDay: 6,          // 任何航线的最低保障槽位（不至于让薄线完全不能飞）
    slotMaxPerDay: 60,         // 全球最繁忙干线的槽位天花板

    /* ── 机型数量（见 §3 机型表）── */
    fleetTypes: 5,

    /* ── 事件卡 ── */
    eventChance: 0.55,         // 每回合触发事件卡的概率（不是每回合都有，避免刷屏）
    eventsPerGameCap: 14,      // 一局最多触发的事件数

    /* ── 终局判定 ── */
    winRank: 3,                // 进入全球前 N 即为「航空巨企」
    winFleetSize: 40,          // 或机队达到此规模
    winNetWorth: 60000         // 或净资产（现金+机队残值+航线资产）达标
  };

  /* ───────────────────────── 2. 地区（经济地理聚类，6 个）─────────────────────────
   * 只作经济参数与航线定价的地理聚类，不是政治实体，也没有任何政治含义。
   *   demandMul  —— 该地区的出行需求热度
   *   costMul    —— 该地区的运营成本（油价、地勤、机场费）
   *   hubBonus   —— 在该地区设基地的加成
   */
  AT.REGIONS = [
    { code: 'EASIA',  name: '东亚',     demandMul: 1.18, costMul: 1.05, hubBonus: 1.10, color: '#E24B4A' },
    { code: 'SEASIA', name: '东南亚',   demandMul: 1.22, costMul: 0.86, hubBonus: 1.06, color: '#EF9F27' },
    { code: 'EUR',    name: '西欧',     demandMul: 1.15, costMul: 1.20, hubBonus: 1.08, color: '#1D9E75' },
    { code: 'NAMER',  name: '北美',     demandMul: 1.16, costMul: 1.12, hubBonus: 1.10, color: '#378ADD' },
    { code: 'MIDEAST',name: '中东',     demandMul: 1.05, costMul: 0.92, hubBonus: 1.14, color: '#7F77DD' },
    { code: 'OTHER',  name: '其他地区', demandMul: 0.92, costMul: 0.94, hubBonus: 1.00, color: '#888780' }
  ];

  /* ───────────────────────── 3. 城市（24 座，精简首版）─────────────────────────
   * 首版刻意收到 24 座（用户选了「精简首版，先验证玩法」）：
   * 城市是经营的**目标池**，24 座足以撑起 6 地区 × 4 城的网络骨架，
   * 又不至于让开局选择过载。玩法定稿后再按需扩到 60 座（defcon 量级）。
   *
   * 字段：
   *   pop     —— 城市人口（百万），决定需求基数
   *   dev0    —— 初始开发度（0..100），level 由它除 devPerLevel 得出
   *   wealth  —— 富裕度（0.6~1.5），影响票价承受力
   *   hub     —— 是否为天然枢纽（开局就有较高开发度与更多需求）
   *   region  —— 所属地区（见 §2）
   */
  AT.CITIES = [
    /* ── 东亚 EASIA ── */
    { id: 'C01', region: 'EASIA',  name: '上海',   lat: 31.23, lon: 121.47, pop: 24.9, dev0: 88, wealth: 1.30, hub: true  },
    { id: 'C02', region: 'EASIA',  name: '北京',   lat: 39.90, lon: 116.41, pop: 21.9, dev0: 86, wealth: 1.32, hub: true  },
    { id: 'C03', region: 'EASIA',  name: '东京',   lat: 35.68, lon: 139.65, pop: 37.4, dev0: 92, wealth: 1.42, hub: true  },
    { id: 'C04', region: 'EASIA',  name: '首尔',   lat: 37.57, lon: 126.98, pop: 25.6, dev0: 84, wealth: 1.28, hub: true  },

    /* ── 东南亚 SEASIA ── */
    { id: 'C05', region: 'SEASIA', name: '新加坡', lat: 1.35,  lon: 103.82, pop: 5.9,  dev0: 90, wealth: 1.45, hub: true  },
    { id: 'C06', region: 'SEASIA', name: '曼谷',   lat: 13.76, lon: 100.50, pop: 10.7, dev0: 72, wealth: 0.96, hub: false },
    { id: 'C07', region: 'SEASIA', name: '雅加达', lat: -6.21, lon: 106.85, pop: 10.6, dev0: 66, wealth: 0.88, hub: false },
    { id: 'C08', region: 'SEASIA', name: '马尼拉', lat: 14.60, lon: 120.98, pop: 13.9, dev0: 62, wealth: 0.84, hub: false },

    /* ── 西欧 EUR ── */
    { id: 'C09', region: 'EUR',    name: '伦敦',   lat: 51.51, lon: -0.13,  pop: 9.6,  dev0: 94, wealth: 1.48, hub: true  },
    { id: 'C10', region: 'EUR',    name: '巴黎',   lat: 48.86, lon: 2.35,   pop: 11.1, dev0: 90, wealth: 1.40, hub: true  },
    { id: 'C11', region: 'EUR',    name: '法兰克福',lat: 50.11,lon: 8.68,   pop: 5.6,  dev0: 86, wealth: 1.44, hub: true  },
    { id: 'C12', region: 'EUR',    name: '伊斯坦布尔',lat: 41.01,lon: 28.98,pop: 15.8, dev0: 74, wealth: 0.92, hub: true  },

    /* ── 北美 NAMER ── */
    { id: 'C13', region: 'NAMER',  name: '纽约',   lat: 40.71, lon: -74.01, pop: 19.6, dev0: 93, wealth: 1.50, hub: true  },
    { id: 'C14', region: 'NAMER',  name: '洛杉矶', lat: 34.05, lon: -118.24,pop: 12.9, dev0: 88, wealth: 1.34, hub: true  },
    { id: 'C15', region: 'NAMER',  name: '芝加哥', lat: 41.88, lon: -87.63, pop: 8.9,  dev0: 82, wealth: 1.28, hub: true  },
    { id: 'C16', region: 'NAMER',  name: '墨西哥城',lat: 19.43,lon: -99.13, pop: 22.1, dev0: 68, wealth: 0.90, hub: false },

    /* ── 中东 MIDEAST ── */
    { id: 'C17', region: 'MIDEAST',name: '迪拜',   lat: 25.20, lon: 55.27,  pop: 3.5,  dev0: 89, wealth: 1.46, hub: true  },
    { id: 'C18', region: 'MIDEAST',name: '多哈',   lat: 25.29, lon: 51.53,  pop: 2.4,  dev0: 82, wealth: 1.42, hub: true  },
    { id: 'C19', region: 'MIDEAST',name: '开罗',   lat: 30.04, lon: 31.24,  pop: 21.3, dev0: 60, wealth: 0.78, hub: false },
    { id: 'C20', region: 'MIDEAST',name: '孟买',   lat: 19.08, lon: 72.88,  pop: 20.7, dev0: 64, wealth: 0.82, hub: false },

    /* ── 其他地区 OTHER（大洋洲 / 非洲 / 南美）── */
    { id: 'C21', region: 'OTHER',  name: '悉尼',   lat: -33.87,lon: 151.21, pop: 5.3,  dev0: 84, wealth: 1.32, hub: true  },
    { id: 'C22', region: 'OTHER',  name: '约翰内斯堡',lat:-26.20,lon: 28.05,pop: 6.0,  dev0: 62, wealth: 0.86, hub: false },
    { id: 'C23', region: 'OTHER',  name: '圣保罗', lat: -23.55,lon: -46.63, pop: 22.4, dev0: 70, wealth: 0.88, hub: true  },
    { id: 'C24', region: 'OTHER',  name: '内罗毕', lat: -1.29, lon: 36.82,  pop: 5.1,  dev0: 56, wealth: 0.74, hub: false }
  ];

  /* ───────────────────────── 4. 机型（5 款）─────────────────────────
   * 首版 5 款，覆盖「支线 → 窄体 → 宽体 → 超远程」的完整升级链，
   * 让玩家每一阶段都有明确的购机目标。
   *
   * 字段：
   *   price     —— 单机价格（万元）
   *   seats     —— 座位数（满舱一趟的运力）
   *   range     —— 航程（公里）—— 航线距离超过 range 不能执飞
   *   speed     —— 巡航速度（公里/小时）—— 决定单机一年能飞几趟
   *   fuelPerKm —— 每公里油耗（升）—— 油价波动直接打在这里
   *   premium   —— 商务/头等舱座位占比（享 firstClassMul 溢价）
   *   upkeep    —— 每季度固定维护成本（万元）
   *   tier      —— 等级（1 支线 / 2 窄体 / 3 宽体 / 4 超远程），用于城市开发度加成
   */
  /* 机型表（2026-09-14 油耗复核后修正）
   *
   * ⚠ fuelPerKm 必读：这是「满载全经济布局下的巡航升/公里」，不是实际油耗。
   *   首版取值整体高估 1.23~1.46 倍，导致油费占收入虚高到 47%（短途线），
   *   而真实支线线约 34~38%。修正依据：
   *     云雀100  对标 E175/ARJ21  → 2.3 L/km（首版 3.1）
   *     信风320  对标 A320neo     → 3.7 L/km（首版 5.4）
   *     信风neo  对标 A320neo 改进 → 3.5 L/km（首版 4.6）
   *     远洋330  对标 A330-900    → 6.5 L/km（首版 8.2）
   *     极星777X 对标 777-9       → 8.0 L/km（首版 9.8）
   *   换算方式：巡航燃油流量(kg/h) ÷ 航速(km/h) ÷ 航油密度(0.8 kg/L)。
   *   例：A320neo 巡航 2,500 kg/h ÷ 840 km/h ÷ 0.8 ≈ 3.7 L/km。
   *
   * ⚠ 油耗同时受「油价」影响，见 sim.js 的航油单价 7.6 元/升 ——
   *   这是 2024~2025 年国内航煤综合采购价的合理水平（含税）。
   *   若日后调整油价，所有航线的利润率会同向漂移，需重跑 tools/calib-cost.js。 */
  AT.PLANES = [
    { id: 'cRJ1',  name: '云雀 100',   tier: 1, price: 320,  seats: 76,  range: 2400,  speed: 780,  fuelPerKm: 2.3, premium: 0.06, upkeep: 26 },
    { id: 'cNB1',  name: '信风 320',   tier: 2, price: 980,  seats: 174, range: 5600,  speed: 840,  fuelPerKm: 3.7, premium: 0.10, upkeep: 62 },
    { id: 'cNB2',  name: '信风 320neo',tier: 2, price: 1180, seats: 180, range: 6300,  speed: 858,  fuelPerKm: 3.5, premium: 0.12, upkeep: 68 },
    { id: 'cWB1',  name: '远洋 330',   tier: 3, price: 2350, seats: 288, range: 11700, speed: 880,  fuelPerKm: 6.5, premium: 0.18, upkeep: 128 },
    { id: 'cWB2',  name: '极星 777X',  tier: 4, price: 3900, seats: 384, range: 15800, speed: 905,  fuelPerKm: 8.0, premium: 0.22, upkeep: 186 }
  ];

  /* ───────────────────────── 5. 事件卡（15 张，精简首版）─────────────────────────
   * 每张卡对玩家给出 2~3 个选项，选项带「资金变动 / 需求修正 / 成本修正」等效果。
   * 与 defcon 的事件卡一样，选项要构成**真实取舍**：没有纯赚的选项。
   *
   * effect 类型：
   *   cash          —— 立即增减资金（万元）
   *   demand_all    —— 下 N 回合全局需求 ×(1+x)
   *   demand_region —— 指定地区需求 ×(1+x)
   *   cost_all      —— 下 N 回合全局成本 ×(1+x)（油价）
   *   route_boost   —— 指定已有航线客流 ×(1+x)，持续 N 回合
   *   fleet_ground  —— 随机若干架飞机停场 N 回合（不可执飞）
   *   rival_gain    —— 竞对资产与规模增长（如果不应对）
   *   dev_push      —— 已通航城市开发度 +x
   *   reputation    —— 品牌声誉变动（影响需求与票价承受力）
   */
  AT.EVENTS = [
    { id: 'ev_oil_spike', title: '原油价格跳涨', desc: '主要产油区局势紧张，航空煤油现货价格一周内上涨三成。行业内所有航司的每公里油耗成本同步抬升。',
      options: [
        { label: '全额承受，维持票价不变', crisis: 0, effect: { type: 'cost_all', mult: 0.22, turns: 3 } },
        { label: '套期保值锁定油价', crisis: 0, effect: { type: 'cash', amount: -420, note: '支付套保保证金' } },
        { label: '把成本转嫁给乘客', crisis: 0, effect: { type: 'demand_all', mult: -0.12, turns: 3, note: '提价损失客流' } }
      ] },

    { id: 'ev_boom', title: '跨太平洋出行热潮', desc: '长假期与商务往来叠加，跨洋航线一票难求，订座率连续数周爆满。',
      options: [
        { label: '加开加班机', crisis: 0, effect: { type: 'demand_all', mult: 0.20, turns: 2 } },
        { label: '趁势上调票价', crisis: 0, effect: { type: 'cash', amount: 520, note: '短期超额收益' } },
        { label: '投入品牌广告', crisis: 0, effect: { type: 'reputation', amount: 8 } }
      ] },

    { id: 'ev_budget_rival', title: '廉价航空入场', desc: '一家新成立的廉价航司宣布以极低票价切入多条干线，行业价格战一触即发。',
      options: [
        { label: '跟进降价守住份额', crisis: 0, effect: { type: 'demand_all', mult: 0.06, turns: 3, extra: { cash: -260 } } },
        { label: '坚持定位不降价', crisis: 0, effect: { type: 'demand_all', mult: -0.10, turns: 3 } },
        { label: '与对方谈判划分市场', crisis: 0, effect: { type: 'cash', amount: -180, note: '支付和解成本' } }
      ] },

    { id: 'ev_new_airport', title: '新机场落成', desc: '一座新兴城市的国际机场正式通航，初期为吸引航司提供起降费减免与航线补贴。',
      options: [
        { label: '抢先开通航线', crisis: 0, effect: { type: 'dev_push', amount: 12, note: '抢得先机的城市开发度提升' } },
        { label: '观望一段时间', crisis: 0, effect: { type: 'cash', amount: 120, note: '省下开辟成本' } }
      ] },

    { id: 'ev_pilot_strike', title: '飞行员工会罢工', desc: '工会要求提高薪酬与改善排班，谈判陷入僵局，部分航班面临停飞风险。',
      options: [
        { label: '接受涨薪诉求', crisis: 0, effect: { type: 'cost_all', mult: 0.10, turns: 4, extra: { cash: -200 } } },
        { label: '强硬拒绝，承受停飞', crisis: 0, effect: { type: 'fleet_ground', count: 2, turns: 2 } },
        { label: '紧急招募替代机组', crisis: 0, effect: { type: 'cash', amount: -480, note: '高昂的临时成本' } }
      ] },

    { id: 'ev_tech_break', title: '新一代省油发动机', desc: '制造商发布新型发动机，油耗较上一代降低一成半，可对现有机队进行改装。',
      options: [
        { label: '全面改装现役机队', crisis: 0, effect: { type: 'cash', amount: -860, extra: { costTurns: 99, costMult: -0.13 } } },
        { label: '只改装主力机型', crisis: 0, effect: { type: 'cash', amount: -380, extra: { costTurns: 99, costMult: -0.06 } } },
        { label: '暂不改装，维持现状', crisis: 0, effect: { type: 'cash', amount: 60 } }
      ] },

    { id: 'ev_typhoon', title: '超强台风袭击枢纽', desc: '一场罕见的超强台风正面袭击你的枢纽机场，连续多日关闭跑道，航班大面积取消。',
      options: [
        { label: '紧急转运旅客', crisis: 0, effect: { type: 'cash', amount: -340, note: '赔偿与转运成本' } },
        { label: '按规退票，不多赔付', crisis: 0, effect: { type: 'reputation', amount: -10 } }
      ] },

    { id: 'ev_visa', title: '签证便利化协议', desc: '数个地区之间达成互免签证安排，跨境出行门槛大幅降低，短途国际航线需求激增。',
      options: [
        { label: '立即加密区域航线', crisis: 0, effect: { type: 'demand_region', region: 'SEASIA', mult: 0.26, turns: 3 } },
        { label: '布局跨区中转网络', crisis: 0, effect: { type: 'demand_all', mult: 0.12, turns: 3 } }
      ] },

    { id: 'ev_fuel_efficiency', title: '空管航路优化', desc: '新一代空管系统上线，主干航路的飞行距离与等待时间缩短，全行业运营效率提升。',
      options: [
        { label: '接入新系统', crisis: 0, effect: { type: 'cost_all', mult: -0.09, turns: 5 } },
        { label: '观望他航使用效果', crisis: 0, effect: { type: 'cash', amount: 80 } }
      ] },

    { id: 'ev_investor', title: '资本市场看好航空业', desc: '航空板块估值整体上行，多家投资机构主动接触，希望注资扩张。',
      options: [
        { label: '接受注资，稀释股权换现金', crisis: 0, effect: { type: 'cash', amount: 1600, extra: { equityHit: 0.08 } } },
        { label: '拒绝注资，独立发展', crisis: 0, effect: { type: 'reputation', amount: 5 } }
      ] },

    { id: 'ev_safety', title: '机队老龄化的隐忧', desc: '监管机构提出新的适航要求，部分机龄偏高的飞机需要额外检修才能继续执飞。',
      options: [
        { label: '按规全面检修', crisis: 0, effect: { type: 'cash', amount: -520 } },
        { label: '分批检修，拖延部分机队', crisis: 0, effect: { type: 'fleet_ground', count: 1, turns: 3 } }
      ] },

    { id: 'ev_new_route_right', title: '优质航权公开招标', desc: '监管机构放出一批高价值的跨洲航权，多家航司参与竞标，价格不菲。',
      options: [
        { label: '高价竞得航权', crisis: 0, effect: { type: 'cash', amount: -980, extra: { freeRoute: 1 } } },
        { label: '放弃竞标', crisis: 0, effect: { type: 'rival_gain', amount: 0.05 } }
      ] },

    { id: 'ev_recession', title: '全球经济放缓', desc: '主要经济体增速下行，企业差旅预算普遍压缩，商务舱需求明显走弱。',
      options: [
        { label: '转向休闲客源市场', crisis: 0, effect: { type: 'demand_all', mult: -0.06, turns: 4, extra: { cash: -150 } } },
        { label: '维持商务定位静待回暖', crisis: 0, effect: { type: 'demand_all', mult: -0.16, turns: 4 } },
        { label: '收缩航线减少亏损', crisis: 0, effect: { type: 'cash', amount: 300, extra: { closeWeakRoute: 1 } } }
      ] },

    { id: 'ev_green', title: '可持续航空燃料强制掺混', desc: '多地下达强制掺混指令，可持续航空燃料用量必须达到一定比例，成本高于传统航油。',
      options: [
        { label: '提前锁定长期供应', crisis: 0, effect: { type: 'cash', amount: -600, extra: { costTurns: 6, costMult: -0.05 } } },
        { label: '按最低比例执行', crisis: 0, effect: { type: 'cost_all', mult: 0.08, turns: 6 } }
      ] },

    { id: 'ev_rival_crisis', title: '竞争对手陷入困境', desc: '一家主要竞争对手因资金链紧张被迫停飞部分航线，其航线网络出现明显空缺。',
      options: [
        { label: '迅速接手其核心航线', crisis: 0, effect: { type: 'cash', amount: -700, extra: { stealRoute: 1 } } },
        { label: '挖走其飞行员队伍', crisis: 0, effect: { type: 'cash', amount: -340, extra: { reputation: 6 } } },
        { label: '按兵不动，观察局势', crisis: 0, effect: { type: 'cash', amount: 100 } }
      ] }
  ];

  /* ───────────────────────── 6. 查找表 ───────────────────────── */

  AT.CITIES_BY_ID = {};
  AT.CITIES.forEach(function (c) { AT.CITIES_BY_ID[c.id] = c; });

  AT.PLANES_BY_ID = {};
  AT.PLANES.forEach(function (p) { AT.PLANES_BY_ID[p.id] = p; });

  AT.REGIONS_BY_CODE = {};
  AT.REGIONS.forEach(function (r) { AT.REGIONS_BY_CODE[r.code] = r; });

  AT.EVENTS_BY_ID = {};
  AT.EVENTS.forEach(function (e) { AT.EVENTS_BY_ID[e.id] = e; });

  /* 按地区分组的城市（开局选基地时用） */
  AT.CITIES_BY_REGION = {};
  AT.CITIES.forEach(function (c) {
    (AT.CITIES_BY_REGION[c.region] = AT.CITIES_BY_REGION[c.region] || []).push(c);
  });

  /* ───────────────────────── 7. 纯函数工具（供 sim / ui / tests 共用）───────────────────────── */

  // 城市等级：开发度 → 1..maxCityLevel
  AT.levelOf = function (dev) {
    var lv = 1 + Math.floor(Math.max(0, dev) / AT.CONFIG.devPerLevel);
    return Math.max(1, Math.min(AT.CONFIG.maxCityLevel, lv));
  };

  // 城市等级对需求的倍率
  AT.levelDemandMul = function (level) {
    var arr = AT.CONFIG.levelDemandMul;
    var i = Math.max(0, Math.min(arr.length - 1, (level || 1) - 1));
    return arr[i];
  };

  // 地区参数
  AT.regionOf = function (city) {
    return AT.REGIONS_BY_CODE[city.region] || { code: 'OTHER', name: '其他', demandMul: 1, costMul: 1, hubBonus: 1 };
  };

  // 机型查找
  AT.planeOf = function (typeId) { return AT.PLANES_BY_ID[typeId] || AT.PLANES[0]; };

  /* 航线距离（两种口径）：
   *   球面大圆距离 —— 用于 flyDistKm 相关逻辑（渲染、航程判定）
   *   distKm 由 geo.js 提供；data.js 不引 geo（保持 data 无依赖，便于 §6 测试单载） */
  AT.routeKey = function (a, b) {
    return (a < b) ? (a + '-' + b) : (b + '-' + a);
  };

  /* 事件卡选项的「危机值」等价值（供 AI 打分与审计统计用）。
   * 本作没有危机值，但保留同名接口可以让 AI 打分逻辑结构上与 defcon 同构；
   * 这里把「资金净收益 + 需求修正加权」折算成一个可比较的分数。
   * 返回越大表示选项越激进/越有攻击性。 */
  AT.eventScore = function (opt) {
    if (!opt || !opt.effect) return 0;
    var e = opt.effect, s = 0;
    if (e.type === 'cash') s = e.amount / 100;
    else if (e.type === 'demand_all' || e.type === 'demand_region') s = (e.mult || 0) * 30;
    else if (e.type === 'cost_all') s = -(e.mult || 0) * 25;
    else if (e.type === 'reputation') s = (e.amount || 0) / 2;
    else if (e.type === 'dev_push') s = (e.amount || 0) / 3;
    else if (e.type === 'fleet_ground') s = -(e.count || 1) * 4;
    else if (e.type === 'rival_gain') s = -(e.amount || 0) * 20;
    else s = 0;
    // extra 里的现金也计入（如「跟进降价」的额外支出）
    if (e.extra && e.extra.cash) s += e.extra.cash / 200;
    return s;
  };

})(typeof window !== 'undefined' ? window : globalThis);
