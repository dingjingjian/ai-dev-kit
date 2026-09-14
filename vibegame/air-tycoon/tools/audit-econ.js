/* ═══════════════════════════════════════════════════════════════════════
 * audit-econ.js —— 经济合理性审计报告（只读，输出给人看）
 *
 * 与 tools/calib.js（参数扫描，回答「调哪个值」）不同，
 * 本脚本回答的是「**这个经济系统合不合理**」——
 * 检查真实性问题，例如「有没有哪条航线能让玩家躺着无限赚钱」。
 *
 * ⚠ 2026-09-14 重写 —— 旧版的检查口径是错的（教训记录）：
 *   旧版用 `buyPlane(st, ty, n)` 之后立刻 openRoute，**忽略了飞机交付期**。
 *   新买的飞机 onGround > 0（在途），而 planesOnRoute() 要求 onGround <= 0，
 *   于是航线上实际只有交付完成的那几架 —— 「8 架」「16 架」这两列全是错的读数，
 *   看起来像「加机没有任何影响」，实际是测试装置根本没把飞机算进去。
 *   这与此前「机队缺目标机型导致静默失败」是同一类陷阱：
 *   **测试装置的 bug 会被误读成模型的问题**。现在统一用 deliverAll() 强制交付。
 *
 * 检查项：
 *   ① 全部 24 城之间可开通航线的利润率分布（应无「白送钱」的线）
 *   ② 加机边际收益（应递减 —— 且在槽位触顶后必然转负）
 *   ③ 两条可达运力上限下的机型梯队（更大机型是否更能在槽位内做厚）
 *   ④ 城市等级飞轮是否真的让需求增长
 *   ⑤ 双瓶颈验证：需求瓶颈线 vs 槽位瓶颈线（本轮新增的核心检查）
 *   ⑥ 航线深度分布：玩家托管 AI 的终局形态是否在「深耕」而非「只铺线」
 *
 * 用法：node tools/audit-econ.js
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
['data', 'geo', 'landmask', 'sim'].forEach(function (f) {
  require(path.join(SRC, f + '.js'));
});
var AT = global.AT, S = AT.sim, C = AT.CONFIG;

function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
function rpad(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }
function n2(x) { return (x == null || isNaN(x)) ? '—' : x.toFixed(1); }

function stateAt(home) {
  var st = S.create({ seed: 11, homeCityId: home });
  S.advance(st, 9);
  st.cash = 1e9; st.debt = 0;
  return st;
}

/* 强制交付所有在途飞机 —— 审计要在「飞机已到位」的假设下测，
 * 否则新买的飞机 onGround > 0，不会计入航线运力（见文件头注释）。 */
function deliverAll(st) {
  st.planes.forEach(function (p) { p.onGround = 0; });
}

/* 为一条航线的距离挑「玩家会选的机型」——
 * ⚠ 不能用「航程够用的最大机型」（那会让 2924km 的薄线被硬塞一台宽体，
 *   得出 −154% 的荒谬读数），也不能用「座位数与需求匹配」（薄线的理想座位
 *   小到没有机型能满足，仍然会选错）。
 * 正确口径：**穷举所有可用机型 × 架数 × 档位，取利润最高的组合** ——
 *   这才是玩家实际会做的决策（试几种配置，挑最赚的）。
 * 返回该最优解，供 ① 表使用。 */
function optimalConfig(state, aId, bId) {
  var dist = S.routeDistance(state, aId, bId);
  var best = null;
  AT.PLANES.forEach(function (p) {
    if (p.range < dist) return;
    var perMax = Math.min(C.maxPerDayPerPlane, S.maxPerDayFor(p.id, dist));
    for (var n = 1; n <= 6; n++) {
      for (var per = 1; per <= perMax; per++) {
        var st = S.create({ seed: 11, homeCityId: 'C01' });
        S.advance(st, 9);
        st.cash = 1e9; st.debt = 0;
        var have = st.planes.filter(function (x) {
          return x.type === p.id && !x.routeKey;
        }).length;
        if (have < n) S.buyPlane(st, p.id, n - have);
        deliverAll(st);
        var o = S.openRoute(st, aId, bId, p.id, n);
        if (!o.ok) continue;
        var r = st.routes[st.routes.length - 1];
        r.ageQ = 99; r.perDay = per;
        var d = S.settleRoute(st, r);
        if (!d || d.revenue <= 0) continue;
        if (!best || d.profit > best.d.profit) best = { d: d, ty: p.id, n: n, per: per };
      }
    }
  });
  return best;
}

/* 在一条航线上放 n 架机，返回完整结算（走真实决策口径） */
function probe(state, aId, bId, ty, n, perDay) {
  var have = state.planes.filter(function (p) {
    return p.type === ty && !p.routeKey;
  }).length;
  if (have < n) S.buyPlane(state, ty, n - have);
  deliverAll(state);
  var o = S.openRoute(state, aId, bId, ty, n);
  if (!o.ok) return null;
  var r = state.routes[state.routes.length - 1];
  r.ageQ = 99;                       // 测稳态，不测培育期
  if (perDay != null) r.perDay = perDay;
  return S.settleRoute(state, r);
}

console.log('═'.repeat(96));
console.log('  air-tycoon 经济合理性审计');
console.log('═'.repeat(96));

/* ── ① 全城市对利润率分布 ── */
var margins = [], samples = [], unserved = 0;
for (var i = 0; i < AT.CITIES.length; i++) {
  for (var j = i + 1; j < AT.CITIES.length; j++) {
    var ca = AT.CITIES[i], cb = AT.CITIES[j];
    var st = stateAt('C01');
    var dist = S.routeDistance(st, ca.id, cb.id);
    var canFly = AT.PLANES.some(function (p) { return p.range >= dist; });
    if (!canFly) { unserved++; continue; }
    var best = optimalConfig(st, ca.id, cb.id);
    if (!best) continue;
    var d = best.d;
    margins.push(d.profit / d.revenue);
    samples.push({
      a: ca.name, b: cb.name, dist: dist, ty: best.ty, n: best.n, per: best.per,
      slot: Math.floor(d.slotCap), m: d.profit / d.revenue, lf: d.realLf,
      cap: d.capacity, pot: d.potential, profit: d.profit
    });
  }
}

samples.sort(function (x, y) { return y.m - x.m; });
console.log('');
console.log('① 全城市对利润率分布（' + samples.length + ' 条可开航线，机型/架数/档位取最优组合）');
console.log('   无可用机型（超所有航程）: ' + unserved + ' 条');
var pos = samples.filter(function (s) { return s.m > 0; }).length;
var neg = samples.filter(function (s) { return s.m <= 0; }).length;
var avg = margins.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, margins.length);
console.log('   盈利 ' + pos + ' 条 | 亏损 ' + neg + ' 条 | 平均利润率 ' + (avg * 100).toFixed(1) + '%');
console.log('');
console.log('   ── 最赚的 8 条（检查是否有「白送钱」的线）──');
console.log('   ' + rpad('航线', 18) + pad('距离', 8) + pad('机型', 12) + pad('架', 5) +
  pad('客座率', 9) + pad('利润率', 9));
samples.slice(0, 8).forEach(function (s) {
  var T = AT.planeOf(s.ty);
  console.log('   ' + rpad(s.a + '—' + s.b, 18) + pad(Math.round(s.dist), 8) + pad(T.name, 12) +
    pad(s.n, 5) + pad((s.lf * 100).toFixed(0) + '%', 9) + pad(n2(s.m * 100) + '%', 9));
});
console.log('');
console.log('   ── 最亏的 5 条（这些不该被玩成主力）──');
samples.slice(-5).forEach(function (s) {
  var T = AT.planeOf(s.ty);
  console.log('   ' + rpad(s.a + '—' + s.b, 18) + pad(Math.round(s.dist), 8) + pad(T.name, 12) +
    pad(s.n, 5) + pad((s.lf * 100).toFixed(0) + '%', 9) + pad(n2(s.m * 100) + '%', 9));
});

/* ── ② 加机边际收益（走真实口径，含槽位） ── */
console.log('');
console.log('② 加机边际收益（应递减；槽位触顶后应转负 —— 这是扩张终点）');
console.log('   ' + rpad('航线', 18) + pad('槽位', 7) +
  [1, 2, 3, 5, 8].map(function (n) { return pad(n + '架', 10); }).join(''));
[['C01', 'C01', 'C03', 'cWB2', '上海—东京'],
['C01', 'C01', 'C05', 'cNB2', '上海—新加坡'],
['C24', 'C24', 'C17', 'cNB2', '内罗毕—迪拜'],
['C09', 'C09', 'C13', 'cWB2', '伦敦—纽约']].forEach(function (x) {
  var line = '   ' + rpad(x[4], 18);
  var st0 = stateAt(x[0]);
  line += pad(Math.floor(S.routeSlots(st0, x[1], x[2])), 7);
  [1, 2, 3, 5, 8].forEach(function (n) {
    var st = stateAt(x[0]);
    var d = probe(st, x[1], x[2], x[3], n, 6);
    if (!d) { line += pad('—', 10); return; }
    line += pad(n2(d.profit / d.revenue * 100) + '%', 10);
  });
  console.log(line);
});
console.log('   （每格 = 该架数下的利润率。注意槽位触顶后利润率下滑 —— 多买的机在烧持有成本）');

/* ── ③ 机型梯队（在槽位内，大机型能否做厚） ── */
console.log('');
console.log('③ 机型梯队（同槽位下的机型升级 —— 大机型应能承运更多客、赚更多钱）');
['C01|C05|上海—新加坡', 'C01|C14|上海—洛杉矶', 'C01|C03|上海—东京'].forEach(function (spec) {
  var parts = spec.split('|');
  console.log('   ── ' + parts[2] + ' ──');
  console.log('   ' + rpad('机型', 16) + pad('座', 6) + pad('架数', 6) +
    pad('班次/日', 9) + pad('客座率', 9) + pad('年利润', 10) + pad('利润率', 9));
  AT.PLANES.forEach(function (p) {
    var st = stateAt(parts[0]);
    if (S.routeDistance(st, parts[0], parts[1]) > p.range) return;
    /* 每种机型都用「填满槽位所需的架数」—— 这才是公平比较 */
    var slot = Math.floor(S.routeSlots(st, parts[0], parts[1]));
    var per = Math.min(C.maxPerDayPerPlane, S.maxPerDayFor(p.id, S.routeDistance(st, parts[0], parts[1])));
    var n = Math.max(1, Math.ceil(slot / per));
    var d = probe(st, parts[0], parts[1], p.id, n, per);
    if (!d) return;
    console.log('   ' + rpad(p.name, 16) + pad(p.seats, 6) + pad(n, 6) +
      pad(d.perDay, 9) + pad((d.realLf * 100).toFixed(0) + '%', 9) +
      pad(d.profit.toFixed(0), 10) + pad(n2(d.profit / d.revenue * 100) + '%', 9));
  });
});

/* ── ④ 城市飞轮 ── */
console.log('');
console.log('④ 城市发展飞轮（等级提升是否真的抬高需求）');
var st0 = S.create({ seed: 5, homeCityId: 'C01' });
S.advance(st0, 9);
var c1 = null, c2 = null;
st0.cities.forEach(function (c) { if (c.id === 'C01') c1 = c; if (c.id === 'C03') c2 = c; });
console.log('   上海 Lv' + c1.level + ' / 东京 Lv' + c2.level +
  ' → 上海-东京需求 = ' + S.routePotential(st0, 'C01', 'C03').toFixed(4) +
  ' | 槽位 = ' + Math.floor(S.routeSlots(st0, 'C01', 'C03')));
c1.level = 1; c2.level = 1;
console.log('   降到 Lv1/Lv1        → 需求 = ' + S.routePotential(st0, 'C01', 'C03').toFixed(4) +
  ' | 槽位 = ' + Math.floor(S.routeSlots(st0, 'C01', 'C03')));
c1.level = 5; c2.level = 5;
console.log('   升到 Lv5/Lv5        → 需求 = ' + S.routePotential(st0, 'C01', 'C03').toFixed(4) +
  ' | 槽位 = ' + Math.floor(S.routeSlots(st0, 'C01', 'C03')));
console.log('   （注意：等级涨 → 需求涨（收益）但槽位降（瓶颈）—— 这是故意设计的取舍）');

/* ── ⑤ 双瓶颈验证 ── */
console.log('');
console.log('⑤ 双瓶颈验证（每条线的约束到底在哪 —— 需求瓶颈 vs 槽位瓶颈）');
console.log('   ' + rpad('航线', 18) + pad('距离', 8) + pad('需求', 9) + pad('槽位', 7) +
  pad('槽位运力', 11) + pad('需求/运力', 11) + pad('瓶颈', 12));
[['C01', 'C03'], ['C01', 'C05'], ['C03', 'C04'], ['C09', 'C13'], ['C24', 'C17'],
['C22', 'C19'], ['C17', 'C09'], ['C11', 'C14']].forEach(function (x) {
  var st = stateAt('C01');
  var ca = S.findCity(st, x[0]), cb = S.findCity(st, x[1]);
  var dist = S.routeDistance(st, x[0], x[1]);
  var pot = S.routePotential(st, x[0], x[1]);
  var slot = Math.floor(S.routeSlots(st, x[0], x[1]));
  /* 用中等机型（180 座窄体）估「槽位运力」，作为需求的对照尺 ——
   * 这样不同航线的比值可比（否则机型差异会混进来）。 */
  var T = AT.planeOf('cNB2');
  var capSlot = slot * 90 * T.seats / 1e6;
  var ratio = pot / capSlot;
  var bind = ratio < 0.85 ? '需求瓶颈' : (ratio > 1.5 ? '槽位瓶颈' : '两者接近');
  console.log('   ' + rpad(ca.name + '—' + cb.name, 18) + pad(Math.round(dist), 8) +
    pad(pot.toFixed(3), 9) + pad(slot, 7) + pad(capSlot.toFixed(3), 11) +
    pad(ratio.toFixed(2) + 'x', 11) + pad(bind, 12));
});
console.log('   需求/运力 < 0.85 → 客流撑不满航班（该降频/换小机）');
console.log('   需求/运力 > 1.50 → 航班挤不进时刻（该换大机型）');

/* ── ⑥ 航线深度分布（玩家托管 AI 的最终形态）───────────────
 *
 * ⚠ 本节是 2026-09-14 补的，对应一个**断言测试抓不到**的退化：
 *   当时 headless 70 项全绿、balance 各项读数健康，但玩家的终局形态是
 *   「112 架飞机飞 112 条航线，每条线恒定 1 架」—— 全公司总座位才 2 万座。
 *   这是「只铺线不深耕」的策略退化，功能上完全合法（没有断言能说它错），
 *   但玩法上是坏的：它让「做满一条线」的正反馈彻底消失。
 *   所以这里专门检查**深度**：航线数应远少于机队数，且存在明显的阶梯。 */
console.log('');
console.log('⑥ 航线深度分布（玩家托管 AI 跑满 60 季的最终形态）');
var deepRuns = [];
[1000, 1037, 1074, 1111, 1148].forEach(function (sd) {
  var st = S.create({ seed: sd, companyName: '审计', homeCityId: 'C01', autoPlayer: true });
  var g = 0;
  while (st.phase !== 'over' && g < 400000) {
    if (st.card) S.chooseEvent(st, 0);
    S.tick(st, S.TICK); g++;
  }
  deepRuns.push(st);
});
console.log('   ' + rpad('种子', 8) + pad('航线', 7) + pad('机队', 7) + pad('机/线', 8) +
  pad('总座位', 10) + pad('槽位打满', 11) + pad('净资产', 13) + pad('最大深度', 11));
var allDepths = [];
deepRuns.forEach(function (st, i) {
  var depths = st.routes.map(function (r) {
    return st.planes.filter(function (p) { return p.routeKey === r.key; }).length;
  });
  allDepths = allDepths.concat(depths);
  var seats = st.planes.reduce(function (s, p) { return s + AT.planeOf(p.type).seats; }, 0);
  var full = st.routes.filter(function (r) { return S.settleRoute(st, r).slotTight; }).length;
  console.log('   ' + rpad('#' + (i + 1), 8) + pad(st.routes.length, 7) +
    pad(st.planes.length, 7) +
    pad((st.planes.length / Math.max(1, st.routes.length)).toFixed(1), 8) +
    pad(seats, 10) + pad(full + '/' + st.routes.length, 11) +
    pad(Math.round(S.netWorth(st)), 13) +
    pad(depths.length ? Math.max.apply(null, depths) : 0, 11));
});
var avgDepth = allDepths.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, allDepths.length);
var onePlane = allDepths.filter(function (d) { return d <= 1; }).length;
console.log('   平均每线机数 ' + avgDepth.toFixed(1) + ' 架 | 单机线占比 ' +
  (onePlane / Math.max(1, allDepths.length) * 100).toFixed(0) + '% | 最深 ' +
  Math.max.apply(null, allDepths) + ' 架');
console.log('   判据：平均每线 ≥ 3 架且存在深度阶梯 → 玩家在「深耕」；');
console.log('         若几乎全是「1 架/线」→ 退化成只铺线不深耕，「做满一条线」的正反馈消失');

console.log('');
console.log('═'.repeat(96));
console.log('  审计结论速查');
console.log('═'.repeat(96));
console.log('  · 若「最赚的线」利润率 > 35% → 存在白送钱的航线，需上调 nonFuelCoef');
console.log('  · 若「加机边际收益」不递减 → 扩张无成本，游戏失去取舍');
console.log('  · 若「加机」在槽位触顶后仍不转负 → 槽位没起作用，扩张没有终点');
console.log('  · 若「城市飞轮」需求倍率 < 1.5 → 交通促进发展的闭环太弱');
console.log('  · 若可开航线中亏损占比 > 50% → 门槛过高，玩家开局就会卡住');
console.log('  · 若「双瓶颈」里没有需求瓶颈的线 → 玩家永远不会遇到「飞机坐不满」的局面');
console.log('  · 若「航线深度」几乎全是 1 架/线 → 玩家只会铺线，不会深耕（机制失效）');
