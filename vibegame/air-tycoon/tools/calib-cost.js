/* ═══════════════════════════════════════════════════════════════════════
 * calib-cost.js —— 成本结构标定扫描器（只读）
 *
 * 背景：2026-09-14 诊断发现，成本模型存在**系统性距离偏差**：
 *   上海—北京（1067km）全成本占收入 89%  ✅ 已接近真实
 *   伦敦—纽约（5570km）全成本占收入 33%  ❌ 只有真实的一半
 *
 * 根因：起降/机组按**距离档位**只涨 4 倍（1.95 → 7.2），
 *   而收入随距离 + 座位规模涨 25 倍（1426 → 31961）。
 *   真实世界里起降费按**最大起飞重量**收、机组按**机型配员**，
 *   两者都随飞机规模上升；且长航线还用更大的飞机。
 *
 * 本脚本扫描「座位规模因子指数」与「非油成本整体倍率」两个维度，
 * 目标是让**所有距离档位**的全成本都落在收入的 82~92%。
 *
 * 用法：node tools/calib-cost.js
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
['data', 'geo', 'landmask', 'sim'].forEach(function (f) {
  require(path.join(SRC, f + '.js'));
});
var AT = global.AT, S = AT.sim, C = AT.CONFIG;

/* 真实世界对照样本（覆盖 4 个距离档位 × 5 种机型） */
var CASES = [
  { label: '上海—北京', home: 'C01', a: 'C01', b: 'C02', ty: 'cRJ1', n: 1, tag: '支线短途' },
  { label: '上海—东京', home: 'C01', a: 'C01', b: 'C03', ty: 'cNB1', n: 1, tag: '窄体中程' },
  { label: '上海—新加坡', home: 'C01', a: 'C01', b: 'C05', ty: 'cNB2', n: 2, tag: '窄体中程双机' },
  { label: '东京—首尔', home: 'C03', a: 'C03', b: 'C04', ty: 'cNB1', n: 2, tag: '窄体干线' },
  { label: '内罗毕—迪拜', home: 'C24', a: 'C24', b: 'C17', ty: 'cNB2', n: 1, tag: '新兴市场' },
  { label: '迪拜—伦敦', home: 'C17', a: 'C17', b: 'C09', ty: 'cWB1', n: 2, tag: '中东枢纽' },
  { label: '伦敦—纽约', home: 'C09', a: 'C09', b: 'C13', ty: 'cWB2', n: 1, tag: '宽体跨洋' },
  { label: '东京—洛杉矶', home: 'C03', a: 'C03', b: 'C14', ty: 'cWB1', n: 2, tag: '宽体跨洋双机' }
];

function probe(ov, cs) {
  var saved = {};
  Object.keys(ov || {}).forEach(function (k) { saved[k] = C[k]; C[k] = ov[k]; });
  var st = S.create({ seed: 7, homeCityId: cs.home });
  S.advance(st, 9);
  st.cash = 1e9; st.debt = 0;
  S.buyPlane(st, cs.ty, cs.n);
  var o = S.openRoute(st, cs.a, cs.b, cs.ty, cs.n);
  if (!o.ok) { Object.keys(saved).forEach(function (k) { C[k] = saved[k]; }); return { fail: o.reason }; }
  var r = st.routes[0];
  r.ageQ = 99;
  var d = S.settleRoute(st, r);
  Object.keys(saved).forEach(function (k) { C[k] = saved[k]; });
  if (!d || d.revenue <= 0) return { fail: '结算为空' };
  return {
    dist: Math.round(S.routeDistance(st, cs.a, cs.b)),
    revenue: d.revenue, cost: d.cost, profit: d.profit,
    margin: d.profit / d.revenue, costShare: d.cost / d.revenue,
    fuelShare: d.fuel / d.revenue, landShare: d.landing / d.revenue,
    crewShare: d.crew / d.revenue, maintShare: d.maint / d.revenue,
    ownShare: (d.ownership || 0) / d.revenue
  };
}

function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
function rpad(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }

console.log('==============================================================');
console.log('  成本结构标定 —— 目标：所有距离档位 全成本/收入 = 82~92%');
console.log('==============================================================');
console.log('真实航司成本占比参考：油 25~30% | 起降+地服 8~12% | 机组 8~12%');
console.log('                     维护 6~8% | 折旧 12~18% | 合计 85~92%');
console.log('');

/* ── 表① 现状 ── */
console.log('──────────────────────────────────────────────────────────────');
console.log('表① 现状（seatFactorExp=0.62 未改）');
console.log('──────────────────────────────────────────────────────────────');
console.log(rpad('航线', 16) + pad('距离', 7) + pad('全成本%', 9) + pad('油%', 7) +
  pad('起降%', 8) + pad('机组%', 8) + pad('维护%', 8) + pad('折旧%', 8) + pad('利润率%', 9));
CASES.forEach(function (cs) {
  var d = probe(null, cs);
  if (d.fail) { console.log(rpad(cs.label, 16) + '  ' + d.fail); return; }
  console.log(rpad(cs.label, 16) + pad(d.dist, 7) +
    pad((d.costShare * 100).toFixed(1), 9) + pad((d.fuelShare * 100).toFixed(1), 7) +
    pad((d.landShare * 100).toFixed(1), 8) + pad((d.crewShare * 100).toFixed(1), 8) +
    pad((d.maintShare * 100).toFixed(1), 8) + pad((d.ownShare * 100).toFixed(1), 8) +
    pad((d.margin * 100).toFixed(1), 9));
});

/* ── 表② 非油成本系数扫描 ──
 * nonFuelCoef 是幂律 rate = coef × dist^1.205 的尺度项。
 * 越大 → 所有航线的非油成本越高 → 利润率越低。
 * 目标：平均利润率 12~16%，且无航线亏损。 */
console.log('');
console.log('──────────────────────────────────────────────────────────────');
console.log('表② 非油成本幂律系数扫描（rate = coef × dist^1.205）');
console.log('──────────────────────────────────────────────────────────────');
console.log('目标：平均利润率 12~16%，全部航线无亏损');
console.log('');
var HDR = ['上海—北京', '上海—东京', '东京—首尔', '内罗毕—迪拜', '迪拜—伦敦', '伦敦—纽约', '东京—洛杉矶'];
var head = rpad('coef', 10);
HDR.forEach(function (L) { head += pad(L, 15); });
console.log(head);
console.log('─'.repeat(10 + 15 * HDR.length));
[0.050, 0.062, 0.0741, 0.086, 0.100, 0.120].forEach(function (exp) {
  var line = rpad(exp.toFixed(2), 10);
  HDR.forEach(function (L) {
    var cs = null;
    for (var i = 0; i < CASES.length; i++) if (CASES[i].label === L) cs = CASES[i];
    if (!cs) { line += pad('—', 15); return; }
    var d = probe({ nonFuelCoef: exp }, cs);
    line += pad(d && !d.fail ? (d.margin * 100).toFixed(1) + '%' : '—', 15);
  });
  console.log(line);
});
console.log('');
console.log('（每格 = 利润率；目标 12~16%，且全部为正）');
