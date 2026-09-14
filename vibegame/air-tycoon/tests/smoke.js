/*
 * air-tycoon — tests/smoke.js
 * 快速冒烟：加载数据层与模拟层，跑一局不看画面，确认经济循环能收敛。
 * 正式的三件套（headless / balance / audit）在玩法定稿后再补。
 *
 * 运行：node tests/smoke.js
 */
'use strict';
var path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'src', 'data.js'));
require(path.join(__dirname, '..', 'src', 'geo.js'));
require(path.join(__dirname, '..', 'src', 'landmask.js'));
require(path.join(__dirname, '..', 'src', 'sim.js'));

var AT = global.AT, S = AT.sim, C = AT.CONFIG;

console.log('=== 数据层自检 ===');
console.log('城市数:', AT.CITIES.length, '| 机型数:', AT.PLANES.length, '| 事件卡:', AT.EVENTS.length, '| 地区:', AT.REGIONS.length);
var badCity = AT.CITIES.filter(function (c) { return !c.id || !c.name || Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180; });
console.log('非法城市:', badCity.length);
var badRegion = AT.CITIES.filter(function (c) { return !AT.REGIONS_BY_CODE[c.region]; });
console.log('未知地区引用:', badRegion.length);
var badPlane = AT.PLANES.filter(function (p) { return !p.id || !p.price || !p.seats || !p.range; });
console.log('非法机型:', badPlane.length);
var badEv = AT.EVENTS.filter(function (e) { return !e.id || !e.title || !e.options || e.options.length < 2; });
console.log('非法事件:', badEv.length);

console.log('\n=== 开局状态 ===');
var st = S.create({ seed: 42, companyName: '测试航空', homeCityId: 'C01', autoPlayer: true });
console.log('公司:', st.companyName, '| 基地:', S.findCity(st, st.homeCityId).name);
console.log('现金:', st.cash, '| 机队:', st.planes.length, '架', st.planes.map(function (p) { return AT.planeOf(p.type).name; }).join('/'));
console.log('竞对:', st.rivals.map(function (r) { return r.name + '(' + S.findCity(st, r.homeCityId).name + ')'; }).join(' / '));
console.log('净资产:', Math.round(S.netWorth(st)));

console.log('\n=== 手动开一条航线 ===');
// 先推进过 briefing 阶段（8 秒 brief，10Hz → 80 tick 有余）
S.advance(st, 9);
console.log('阶段:', st.phase, '| 季度:', st.quarter);
// 上海 → 首尔（距离应小于 2400km，支线机能飞）
var r1 = S.openRoute(st, 'C01', 'C02', 'cRJ1', 1);
console.log('上海-北京:', JSON.stringify({ ok: r1.ok, reason: r1.reason }));
var r2 = S.openRoute(st, 'C01', 'C04', 'cRJ1', 1);
console.log('上海-首尔:', JSON.stringify({ ok: r2.ok, reason: r2.reason }));
console.log('距离 上海-北京:', Math.round(S.routeDistance(st, 'C01', 'C02')), 'km');
console.log('距离 上海-首尔:', Math.round(S.routeDistance(st, 'C01', 'C04')), 'km');
console.log('距离 上海-纽约:', Math.round(S.routeDistance(st, 'C01', 'C13')), 'km');

console.log('\n=== 单航线结算预览 ===');
st.routes.forEach(function (r) {
  var d = S.settleRoute(st, r);
  if (!d) return;
  console.log(S.findCity(st, r.a).name + '—' + S.findCity(st, r.b).name,
    '| 运力', d.capacity.toFixed(2), '| 潜需', d.potential.toFixed(2),
    '| 客流', d.pax.toFixed(2), '| 票价', d.fare.toFixed(0),
    '| 收入', d.revenue.toFixed(0), '| 成本', d.cost.toFixed(0),
    '| 利润', d.profit.toFixed(0));
});

console.log('\n=== 跑满 60 回合（AI 不干预，纯看自然演化）===');
var guard = 0;
while (st.phase !== 'over' && guard < 200000) {
  // 事件卡自动选第一个选项
  if (st.card) S.chooseEvent(st, 0);
  S.tick(st, S.TICK);
  guard++;
}
console.log('结束阶段:', st.phase, '| 用了', guard, 'tick | 季度:', st.quarter);
console.log('破产:', !!st.bankrupt);
console.log('现金:', Math.round(st.cash), '| 负债:', Math.round(st.debt), '| 净资产:', Math.round(S.netWorth(st)));
console.log('机队:', st.planes.length, '| 航线:', st.routes.length);
console.log('累计客流:', st.stats.paxTotal.toFixed(1), '百万');
console.log('评价:', S.verdict(st).label, '—', S.verdict(st).desc);
console.log('全球化:', JSON.stringify(S.globalization(st)));

console.log('\n=== 终局排名 ===');
S.ranking(st).forEach(function (r, i) {
  console.log((i + 1) + '.', r.name, r.isPlayer ? '<< 玩家' : '',
    '| 净资产', Math.round(r.netWorth), '| 飞机', r.fleet, '| 航线', r.routes);
});

console.log('\n=== 城市发展飞轮（前 8 座按 dev 变化排序）===');
var changes = st.cities.map(function (c) {
  return { name: c.name, dev0: c.dev0, dev: c.dev, d: c.dev - c.dev0, lv0: c.level0, lv: c.level, routes: c.routes, bonus: c.bonus };
}).sort(function (a, b) { return b.d - a.d; });
changes.slice(0, 8).forEach(function (c) {
  console.log(c.name.padEnd(8), 'dev', c.dev0.toFixed(0), '→', c.dev.toFixed(0),
    '(' + (c.d >= 0 ? '+' : '') + c.d.toFixed(1) + ')',
    '| Lv', c.lv0, '→', c.lv, '| 航线', c.routes, '| 需求加成', (c.bonus * 100).toFixed(1) + '%');
});
console.log('...');
changes.slice(-4).forEach(function (c) {
  console.log(c.name.padEnd(8), 'dev', c.dev0.toFixed(0), '→', c.dev.toFixed(0),
    '(' + (c.d >= 0 ? '+' : '') + c.d.toFixed(1) + ') | Lv', c.lv0, '→', c.lv, '| 航线', c.routes);
});

console.log('\n=== 事件卡触发记录 ===');
console.log('触发', st.events.length, '张:', st.events.map(function (e) { return e.title; }).join(' / '));

console.log('\n=== 阶段快照（每 10 回合）===');
st.history.filter(function (h) { return h.quarter % 10 === 0; }).forEach(function (h) {
  console.log('Q' + String(h.quarter).padStart(2), '| 现金', String(h.cash).padStart(7),
    '| 净资产', String(h.netWorth).padStart(7), '| 航线', h.routes, '| 飞机', h.planes,
    '| 客流', h.pax, '| 净利', h.net);
});
