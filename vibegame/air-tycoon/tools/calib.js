/*
 * air-tycoon — tools/calib.js
 * 经济参数标定扫描器（只读，不改任何文件）
 *
 * 目的：本作是经济模拟，参数之间强耦合（票价 × 载客 − 油费 × 班次），
 * 靠读代码或单点试算**无法**判断平衡性 —— 必须扫描参数网格看分布。
 * 这是 defcon「平衡类 bug 只能靠统计发现」这条经验在经营类游戏上的延续。
 *
 * ⚠ 2026-09-14 重写：需求模型已从「乘积幂 + 魔数 baseDemand」改为
 *   「人口渗透率 × 收入弹性」（见 src/sim.js routePotential 的注释）。
 *   本脚本的扫描维度随之改为 penetrationRate / wealthExp，
 *   不再扫描已废弃的 baseDemand。
 *
 * 运行：node tools/calib.js
 */
'use strict';
var path = require('path');
global.window = global;
['data', 'geo', 'landmask', 'sim'].forEach(function (f) {
  require(path.join(__dirname, '..', 'src', f + '.js'));
});
var AT = global.AT, S = AT.sim, C = AT.CONFIG;

/* 在指定参数下测一条航线的完整账（用完即还，不污染全局 CONFIG）
 *
 * ⚠ 三个标定陷阱（首版踩过，写在这里防止后人重蹈）：
 *   ① 机队里没有目标机型 → openRoute 直接失败。标定必须**先补齐机队**，
 *      否则大量航线显示「开线失败」，看起来像参数问题，实则是测试装置问题。
 *   ② 需求已饱和运力时（客座率 100%），继续抬需求对结果毫无影响 ——
 *      此时瓶颈在运力不在需求，扫描会得到一条平线。要判断这一点，
 *      必须同时看「客座率是否顶到上限」这个读数。
 *   ③ 资金要足够：标定用的是「无限资金」的假设，否则买不起机同样是装置问题。
 */
function probeRoute(overrides, home, a, b, ty, cnt, opts) {
  var saved = {};
  Object.keys(overrides || {}).forEach(function (k) { saved[k] = C[k]; C[k] = overrides[k]; });
  var st = S.create({ seed: 7, homeCityId: home });
  S.advance(st, 9);
  st.cash = 1e9; st.debt = 0;          // 标定假设：不受资金约束（只看航线本身赚不赚）
  var have = st.planes.filter(function (p) { return p.type === ty && !p.routeKey; }).length;
  if (have < cnt) S.buyPlane(st, ty, cnt - have);
  var r = S.openRoute(st, a, b, ty, cnt);
  if (!r.ok) {
    Object.keys(saved).forEach(function (k) { C[k] = saved[k]; });
    return { fail: r.reason };
  }
  /* 让航线「成熟」，测稳态而非培育期 */
  st.routes[0].ageQ = (opts && opts.ageQ != null) ? opts.ageQ : 12;
  var d = S.settleRoute(st, st.routes[0]);
  Object.keys(saved).forEach(function (k) { C[k] = saved[k]; });
  if (!d) return { fail: '结算返回空' };
  return {
    dist: Math.round(S.routeDistance(st, a, b)),
    flights: d.flights, capacity: d.capacity, potential: d.potential, pax: d.pax,
    /* 客座率用「pax / 运力」，但真正要盯的是 pax 是否被 capacity 卡住。
     * saturated = true 表示需求已经顶到运力上限，加需求不会增加客流 ——
     * 这时该加飞机，而不是调需求参数。 */
    loadFactor: d.pax / Math.max(1e-9, d.capacity),
    saturated: d.pax >= d.capacity - 1e-9,
    fare: d.fare, revenue: d.revenue, cost: d.cost, profit: d.profit,
    margin: d.revenue > 0 ? d.profit / d.revenue : 0,
    fuelShare: d.revenue > 0 ? d.fuel / d.revenue : 0,
    costShare: d.revenue > 0 ? d.cost / d.revenue : 0
  };
}

/* 体检路线组：覆盖短途支线 → 洲际宽体 */
var CASES = [
  { label: '上海—北京',     home: 'C01', a: 'C01', b: 'C02', ty: 'cRJ1', cnt: 1, tag: '支线短途' },
  { label: '上海—东京',     home: 'C01', a: 'C01', b: 'C03', ty: 'cNB1', cnt: 1, tag: '窄体中程' },
  { label: '上海—新加坡',   home: 'C01', a: 'C01', b: 'C05', ty: 'cNB2', cnt: 2, tag: '窄体中程双机' },
  { label: '东京—首尔',     home: 'C03', a: 'C03', b: 'C04', ty: 'cNB1', cnt: 2, tag: '窄体干线' },
  { label: '伦敦—纽约',     home: 'C09', a: 'C09', b: 'C13', ty: 'cWB2', cnt: 1, tag: '宽体跨洋' },
  { label: '东京—洛杉矶',   home: 'C03', a: 'C03', b: 'C14', ty: 'cWB1', cnt: 2, tag: '宽体跨洋双机' },
  { label: '迪拜—伦敦',     home: 'C17', a: 'C17', b: 'C09', ty: 'cWB1', cnt: 2, tag: '中东枢纽远程' },
  { label: '内罗毕—迪拜',   home: 'C24', a: 'C24', b: 'C17', ty: 'cNB2', cnt: 1, tag: '新兴市场' },
  { label: '约堡—开罗',     home: 'C22', a: 'C22', b: 'C19', ty: 'cNB1', cnt: 1, tag: '非洲区内' }
];

function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
function rpad(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }

console.log('==============================================================');
console.log('  air-tycoon 经济标定扫描');
console.log('==============================================================');
console.log('需求模型: pax = POP_REF*penRate*(popSum/POP_REF)^0.9');
console.log('                * wealthF * distAdj * lvF * bonusF * repF');
console.log('');
console.log('设计目标：');
console.log('  · 支线短途  利润率  3% ~ 12%（薄利，靠量）');
console.log('  · 窄体中程  利润率 10% ~ 20%（主力机型，健康）');
console.log('  · 宽体跨洋  利润率 12% ~ 24%（高投入高回报）');
console.log('  · 新兴市场  利润率  0% ~ 15%（潜力大但起点低，靠飞轮养起来）');
console.log('  · 全成本占收入 80% ~ 95%（真实航司区间 85~92%）');
console.log('  · 客座率 72% ~ 88%');
console.log('');

/* ── 表①：penetrationRate 扫描（需求整体尺度）── */
console.log('==============================================================');
console.log('  表① 尺度扫描：penetrationRate');
console.log('==============================================================');
[0.0090, 0.0126, 0.0160, 0.0200, 0.0250].forEach(function (pr) {
  console.log('──────────────────────────────────────────────────────────────');
  console.log('penetrationRate = ' + pr);
  console.log('──────────────────────────────────────────────────────────────');
  console.log(rpad('航线', 20) + pad('距离', 7) + pad('班/季', 7) + pad('客座率', 8) +
              pad('票价', 7) + pad('收入', 9) + pad('成本', 9) + pad('利润', 9) + pad('利润率', 9));
  var sumMargin = 0, n = 0, negCount = 0, satCount = 0;
  CASES.forEach(function (cs) {
    var d = probeRoute({ penetrationRate: pr }, cs.home, cs.a, cs.b, cs.ty, cs.cnt, { ageQ: 12 });
    if (d && d.fail) { console.log(rpad(cs.label, 20) + '  —— ' + d.fail); return; }
    if (!d) return;
    sumMargin += d.margin; n++;
    if (d.profit < 0) negCount++;
    if (d.saturated) satCount++;
    console.log(rpad(cs.label, 20) + pad(d.dist, 7) + pad(d.flights, 7) +
                pad((d.loadFactor * 100).toFixed(0) + '%', 8) +
                pad(d.fare.toFixed(0), 7) + pad(d.revenue.toFixed(0), 9) +
                pad(d.cost.toFixed(0), 9) + pad(d.profit.toFixed(0), 9) +
                pad((d.margin * 100).toFixed(1) + '%', 9) + '  ' + cs.tag +
                (d.saturated ? ' [运力饱和]' : ''));
  });
  console.log('  → 平均利润率 ' + (sumMargin / Math.max(1, n) * 100).toFixed(1) + '%' +
              ' | 亏损 ' + negCount + '/' + n +
              ' | 运力饱和 ' + satCount + '/' + n);
  console.log('');
});

/* ── 表②：成本结构拆解 ── */
console.log('==============================================================');
console.log('  表② 成本结构拆解（当前 CONFIG 取值）');
console.log('==============================================================');
CASES.forEach(function (cs) {
  var d = probeRoute(null, cs.home, cs.a, cs.b, cs.ty, cs.cnt, { ageQ: 12 });
  if (!d || d.fail || d.revenue <= 0) { console.log(rpad(cs.label, 20) + '  ' + ((d && d.fail) || '')); return; }
  console.log(rpad(cs.label, 20) +
    '油 ' + pad((d.fuelShare * 100).toFixed(0) + '%', 5) +
    ' | 总成本 ' + pad((d.costShare * 100).toFixed(0) + '%', 5) +
    ' 利润率 ' + pad((d.margin * 100).toFixed(1) + '%', 7) +
    ' 客座率 ' + pad((d.loadFactor * 100).toFixed(0) + '%', 5) +
    (d.saturated ? ' [饱和]' : ''));
});

/* ── 表③：wealthExp 扫描（航线层次分化程度）── */
console.log('');
console.log('==============================================================');
console.log('  表③ wealthExp 扫描：航线间层次分化');
console.log('==============================================================');
console.log('  （值越大，富裕城市对优势越极端 → 策略多样性越低）');
console.log('');
var SHOW = ['内罗毕—迪拜', '约堡—开罗', '上海—东京', '伦敦—纽约', '东京—洛杉矶'];
var header = rpad('wealthExp', 12);
SHOW.forEach(function (L) { header += pad(L, 14); });
console.log(header);
console.log('─'.repeat(12 + 14 * SHOW.length));
[2.0, 2.6, 3.2, 3.8].forEach(function (we) {
  var line = rpad(we.toFixed(1), 12);
  SHOW.forEach(function (L) {
    var cs = null;
    for (var i = 0; i < CASES.length; i++) if (CASES[i].label === L) cs = CASES[i];
    if (!cs) { line += pad('—', 14); return; }
    var d = probeRoute({ wealthExp: we }, cs.home, cs.a, cs.b, cs.ty, cs.cnt, { ageQ: 12 });
    line += pad(d && !d.fail ? (d.margin * 100).toFixed(1) + '%' : '—', 14);
  });
  console.log(line);
});
console.log('');
console.log('  说明：wealthExp 越大，「富裕城市对 vs 新兴市场」的利润率落差越大。');
console.log('        落差过大会让玩家只盯着欧美线，失去经营网络的取舍乐趣。');
console.log('');

/* ── 表④：班次与客座率体检 ── */
console.log('==============================================================');
console.log('  表④ 班次与客座率体检（当前 CONFIG）');
console.log('==============================================================');
console.log('  （班次由 sim.js quarterFlights 的 hours=900 决定）');
console.log('');
CASES.forEach(function (cs) {
  var d = probeRoute(null, cs.home, cs.a, cs.b, cs.ty, cs.cnt, { ageQ: 12 });
  if (!d || d.fail) return;
  console.log(rpad(cs.label, 20) + '班次/季 ' + pad(d.flights, 5) +
    '（日均 ' + pad((d.flights / 90).toFixed(1), 5) + ' 班）' +
    '| 需求 ' + pad(d.potential.toFixed(3), 7) +
    ' | 载客 ' + pad(d.pax.toFixed(3), 7) +
    ' | 客座率 ' + pad((d.loadFactor * 100).toFixed(0) + '%', 5) +
    ' | 利润 ' + pad(d.profit.toFixed(0), 8));
});

console.log('');
console.log('==============================================================');
console.log('  结论速查');
console.log('==============================================================');
console.log('  1. 若多数航线利润率为负 → penetrationRate 偏低，需求撑不起运力');
console.log('  2. 若所有航线利润率都 > 25% → penetrationRate 偏高，失去经营压力');
console.log('  3. 若客座率普遍 < 50% → 需求与班次不匹配，玩家会觉得「飞机飞不满」');
console.log('  4. 若大量航线标记 [运力饱和] → 该航线应加飞机而非加需求');
console.log('');
