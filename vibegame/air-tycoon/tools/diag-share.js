/* ═══════════════════════════════════════════════════════════════════════
 * diag-share.js —— 市场份额层诊断（只读，不调参）
 *
 * 症状：扫描 marketShareK（0.15~1.5 / 甚至 14）各机型利润率与客座率
 *       完全不变，说明 marketShareK 不是有效杠杆，或 sellable 恒为约束方。
 *
 * 本脚本不猜，直接把 settleRoute 内部各中间量打出来：
 *   marketSize / marketCapacity / capacity / sellable /
 *   loadRatio / share / marketSize×share / 约束方 / 比值
 * 用法：node tools/diag-share.js [perDay]
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');

global.window = global;
['data', 'geo', 'landmask', 'sim'].forEach(function (f) {
  require(path.join(SRC, f + '.js'));
});
var AT = global.AT, S = AT.sim, C = AT.CONFIG;

var PERDAY = parseInt(process.argv[2], 10) || 6;

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

function makeState(ty, nPlanes) {
  var st = S.create({ seed: 7, homeCityId: 'C01' });
  S.advance(st, 9);
  st.cash = 1e9; st.debt = 0;
  var r = S.buyPlane(st, ty, nPlanes);
  if (!r || r.ok === false) console.error('  买机失败:', ty, r && r.reason);
  return st;
}

function probe(ty, nPlanes, perDay) {
  var T = AT.planeOf(ty);
  var st = makeState(ty, nPlanes);
  var o = S.openRoute(st, 'C01', 'C03', ty, nPlanes);
  if (!o.ok) { console.error('  开线失败:', ty, o.reason); return null; }
  var route = st.routes[st.routes.length - 1];
  route.ageQ = 99;
  S.setFrequency(st, route.key, perDay);
  var d = S.settleRoute(st, route);
  if (!d) return null;

  var ms = d.potential * d.mature;
  var lf = d.loadFactor;
  var mxs = ms * d.share;
  return {
    ty: ty, seats: T.seats, name: T.name,
    perDay: d.perDay, flights: d.flights, nPlanes: d.planes,
    capacity: d.capacity, sellable: d.sellable, lf: lf, realLf: d.realLf,
    marketSize: ms, marketCapacity: ms / Math.max(0.05, lf),
    share: d.share, marketXshare: mxs,
    bind: (mxs <= d.sellable + 1e-12) ? '市场' : '运力',
    ratio: d.sellable > 1e-12 ? mxs / d.sellable : Infinity,
    fare: d.fare, profit: d.profit,
    margin: d.revenue > 1e-9 ? d.profit / d.revenue : 0
  };
}

var TYPES = AT.PLANES.map(function (p) { return p.id; });

console.log('═'.repeat(100));
console.log('市场份额层诊断 —— 航线 shanghai → tokyo，每型机 1 架，频次 ' + PERDAY + ' 班/日');
console.log('═'.repeat(100));

var rows = [];
TYPES.forEach(function (ty) {
  var r = probe(ty, 1, PERDAY);
  if (r) rows.push(r);
});

rows.forEach(function (r) {
  console.log('');
  console.log('── ' + r.ty + ' ' + r.name + ' （' + r.seats + ' 座 × ' + r.nPlanes + ' 架，' + r.perDay +
    ' 班/日 → ' + r.flights + ' 班/季）');
  console.log('   市场总量 marketSize      = ' + r.marketSize.toFixed(5) + '  百万客/季');
  console.log('   我方运力 capacity        = ' + r.capacity.toFixed(5) + '  百万座/季');
  console.log('   可售 sellable(=cap×lf)   = ' + r.sellable.toFixed(5) + '  百万客/季');
  console.log('   share（无竞对应为 100%） = ' + (r.share * 100).toFixed(3) + ' %');
  console.log('   我分到的需求             = ' + r.marketXshare.toFixed(5) + '  百万客/季');
  console.log('   → 约束方 = ' + r.bind + '   比值(需求 / 可售) = ' + r.ratio.toFixed(3));
  console.log('   实际客座率 realLf        = ' + (r.realLf * 100).toFixed(1) + ' %   (基准 lf=' + (r.lf * 100).toFixed(1) + '%)');
  console.log('   单价 fare                = ' + r.fare.toFixed(0) + ' 元');
  console.log('   利润                    = ' + r.profit.toFixed(1) + ' 万元   利润率 = ' + (r.margin * 100).toFixed(1) + ' %');
});

console.log('');
console.log('═'.repeat(100));
console.log('总表（上海→东京，每条线都是「1 架机 + ' + PERDAY + ' 班/日」）');
console.log('═'.repeat(100));
console.log(pad('机型', 12) + pad('座', 5) + pad('班/季', 8) + pad('运力', 10) + pad('市场', 10) +
  pad('份额', 9) + pad('约束', 6) + pad('客座', 8) + pad('利润率', 8));
rows.forEach(function (r) {
  console.log(pad(r.ty, 12) + pad(String(r.seats), 5) + pad(String(r.flights), 8) +
    pad(r.capacity.toFixed(5), 10) + pad(r.marketSize.toFixed(4), 10) +
    pad((r.share * 100).toFixed(2) + '%', 9) + pad(r.bind, 6) +
    pad((r.realLf * 100).toFixed(1) + '%', 8) + pad((r.margin * 100).toFixed(1) + '%', 8));
});
