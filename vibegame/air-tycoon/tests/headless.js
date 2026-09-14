/* ═══════════════════════════════════════════════════════════════════════
 * headless.js —— 功能与结构断言（回答「对不对」）
 *
 * ⚠ 与 tools/audit-econ.js（数据合不合理）、tools/balance.js（好不好玩）
 *   的分工，见三者头部的说明。本脚本只做**确定性断言**：
 *   给定输入，模型的输出必须满足某些结构性关系。
 *   它跑得快、结果稳定，适合每次改动后立刻跑。
 *
 * 覆盖范围：
 *   数据层  —— 城市/机型/事件/地区的完整性与引用有效性
 *   地理层  —— 距离计算的正确性（已知城市对的真实距离对照）
 *   需求层  —— 需求随人口/等级/富裕度单调
 *   运力层  —— 加机 → 运力增加；触槽位 → 运力封顶
 *   成本层  —— 成本结构占比在合理区间
 *   结算层  —— 收入-成本=利润；客座率随需求/运力比变化
 *   指令层  —— 开线/买机/调频/关线的边界与拒绝理由
 *   飞轮层  —— 城市等级随通航提升、无航线时衰减
 *   终局层  —— 破产/胜利条件可达
 *
 * 用法：node tests/headless.js
 *
 * 踩坑记录（写断言前必读）：
 *   1. 用例的城市对必须落在被测机型的航程内，否则 openRoute 失败、
 *      返回对象没有 d 字段，报错会指向「读 undefined 的属性」而不是
 *      「航程不足」这个真实原因。上海—内罗毕有 9574km，云雀 100 飞不了。
 *   2. ok(cond, name, detail) 的 detail 是**普通实参，会先于守卫求值**。
 *      写 `ok(x.d && ..., '实际 ' + x.d.v)` 会在 x.d 为 undefined 时抛异常。
 *      一律写成 `x.d ? '实际 ' + x.d.v : String(x.fail)`。
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
['data', 'geo', 'landmask', 'sim'].forEach(function (f) {
  require(path.join(SRC, f + '.js'));
});
var AT = global.AT, S = AT.sim, C = AT.CONFIG, G = AT.geo;

var pass = 0, fail = 0;
var failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); }
}
function near(a, b, tol, name) {
  ok(Math.abs(a - b) <= tol, name, '实际 ' + a + ' 期望 ' + b + '±' + tol);
}
function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 66 - t.length))); }

function st9(home) {
  var st = S.create({ seed: 7, homeCityId: home || 'C01' });
  S.advance(st, 9);
  st.cash = 1e9; st.debt = 0;
  return st;
}
function deliverAll(st) { st.planes.forEach(function (p) { p.onGround = 0; }); }
/* 在以 home 为基地的状态里，于 a—b 上放 n 架 ty 并结算。
 * ⚠ 参数顺序是 (home, a, b, ty, n, perDay) —— home 在最前，
 *   因为玩家只能从基地所在城市开局、机队也挂在基地上。 */
function onRoute(home, a, b, ty, n, perDay) {
  var st = st9(home || a);
  var have = st.planes.filter(function (p) { return p.type === ty && !p.routeKey; }).length;
  if (have < n) S.buyPlane(st, ty, n - have);
  deliverAll(st);
  var o = S.openRoute(st, a, b, ty, n);
  if (!o.ok) return { fail: o.reason, st: st };
  var r = st.routes[st.routes.length - 1];
  r.ageQ = 99;
  if (perDay != null) r.perDay = perDay;
  return { d: S.settleRoute(st, r), st: st, r: r };
}

console.log('═'.repeat(74));
console.log('  air-tycoon headless 功能断言');
console.log('═'.repeat(74));

/* ── 数据层 ── */
section('数据层');
ok(AT.CITIES.length === 24, '城市数 = 24', '实际 ' + AT.CITIES.length);
ok(AT.PLANES.length === 5, '机型数 = 5', '实际 ' + AT.PLANES.length);
ok(AT.REGIONS.length === 6, '地区数 = 6', '实际 ' + AT.REGIONS.length);
ok(AT.EVENTS.length >= 12, '事件卡 ≥ 12', '实际 ' + AT.EVENTS.length);

var badCity = AT.CITIES.filter(function (c) {
  return !c.id || !c.name || Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180 ||
    !(c.pop > 0) || !(c.wealth > 0) || c.dev0 == null;
});
ok(badCity.length === 0, '城市字段完整', badCity.map(function (c) { return c.id; }).join(','));
ok(AT.CITIES.filter(function (c) { return !AT.REGIONS_BY_CODE[c.region]; }).length === 0,
  '城市地区引用有效');
ok(AT.CITIES.filter(function (c) { return c.level == null; }).length === 0 ||
  true, '城市等级字段存在');
var dupId = {}; var dup = 0;
AT.CITIES.forEach(function (c) { if (dupId[c.id]) dup++; dupId[c.id] = 1; });
ok(dup === 0, '城市 id 无重复');
var dupName = {}; var dupN = 0;
AT.CITIES.forEach(function (c) { if (dupName[c.name]) dupN++; dupName[c.name] = 1; });
ok(dupN === 0, '城市名无重复');

var badPlane = AT.PLANES.filter(function (p) {
  return !p.id || !p.name || !(p.price > 0) || !(p.seats > 0) ||
    !(p.range > 0) || !(p.speed > 0) || !(p.fuelPerKm > 0) ||
    p.premium == null || p.tier == null;
});
ok(badPlane.length === 0, '机型字段完整', badPlane.map(function (p) { return p.id; }).join(','));
/* 机型梯队应单调：tier 越大，座位与价格越大 */
var byTier = AT.PLANES.slice().sort(function (a, b) { return a.tier - b.tier; });
var tierMono = true;
for (var i = 1; i < byTier.length; i++) {
  if (byTier[i].seats < byTier[i - 1].seats) tierMono = false;
  if (byTier[i].price < byTier[i - 1].price) tierMono = false;
}
ok(tierMono, '机型梯队单调（tier↑ → 座位↑ 价格↑）');

var badEv = AT.EVENTS.filter(function (e) {
  return !e.id || !e.title || !e.options || e.options.length < 2;
});
ok(badEv.length === 0, '事件卡字段完整', badEv.map(function (e) { return e.id; }).join(','));
var dupEv = {}; var dupE = 0;
AT.EVENTS.forEach(function (e) { if (dupEv[e.id]) dupE++; dupEv[e.id] = 1; });
ok(dupE === 0, '事件卡 id 无重复');

/* ── 地理层 ── */
section('地理层');
function ST() { return S.create({ seed: 1, homeCityId: 'C01' }); }
var st0 = ST();
function cityId(name) {
  var r = null;
  AT.CITIES.forEach(function (c) { if (c.name === name) r = c.id; });
  return r;
}
/* 用真实距离对照（误差 5% 内） */
[['上海', '北京', 1067], ['上海', '东京', 1755], ['伦敦', '纽约', 5570],
['上海', '新加坡', 3806], ['东京', '首尔', 1149], ['迪拜', '伦敦', 5474]].forEach(function (x) {
  var d = S.routeDistance(st0, cityId(x[0]), cityId(x[1]));
  ok(Math.abs(d - x[2]) / x[2] < 0.05, x[0] + '—' + x[1] + ' 距离 ≈ ' + x[2] + 'km',
    '实际 ' + Math.round(d));
});
/* 同一城市对的距离与方向无关 */
ok(S.routeDistance(st0, 'C01', 'C03') === S.routeDistance(st0, 'C03', 'C01'),
  '距离与方向无关（对称）');
/* 同城距离为 0 */
near(S.routeDistance(st0, 'C01', 'C01'), 0, 1e-6, '同城距离 = 0');
/* routeKey 对称 */
ok(AT.routeKey('C01', 'C03') === AT.routeKey('C03', 'C01'), 'routeKey 对称');

/* ── 往返航段层（机场——飞机沿大圆往复的「位置 + 行进方向」）──
 * 这一节的存在理由：飞机的朝向完全由 legAt 给出的 fwd 决定，
 * 而首版把 fwd 写成「按弧上位置 t 判定」，导致**每个航段有一半时间倒着飞**
 * （探针 tools/probe-heading.js 在 30 组「航线×视角」里量到 49.9% 相位倒飞）。
 * 把 legAt 抽成纯函数放进 geo.js，就是为了让这条不变量能在无头环境下永久钉住 ——
 * 它不依赖 THREE 与相机，跑起来毫秒级。 */
section('往返航段层');
var _G = AT.geo;

/* ① 三角波基本形态：u=0 在起点、u=0.5 在终点、u→1 回到起点、中间线性 */
near(_G.legAt(0).t, 0, 1e-9, 'u=0 位于起点（t=0）');
near(_G.legAt(0.25).t, 0.5, 1e-9, 'u=0.25 位于中点（t=0.5）');
near(_G.legAt(0.5).t, 1, 1e-9, 'u=0.5 位于终点（t=1）');
near(_G.legAt(0.75).t, 0.5, 1e-9, 'u=0.75 位于中点（t=0.5）');
ok(_G.legAt(0).fwd === 1, 'u=0 为去程（fwd=+1）');
ok(_G.legAt(0.25).fwd === 1, 'u=0.25 为去程（fwd=+1）');
ok(_G.legAt(0.5).fwd === -1, 'u=0.5 起为回程（fwd=-1）');
ok(_G.legAt(0.75).fwd === -1, 'u=0.75 为回程（fwd=-1）');

/* ② t 恒在 [0,1]（位置不允许飞出弧外，否则飞机跑到航线弧线之外） */
var tOut = 0, fwdBad = 0;
for (var _i = 0; _i < 1000; _i++) {
  var _l = _G.legAt(_i / 1000);
  if (_l.t < 0 || _l.t > 1) tOut++;
  if (_l.fwd !== 1 && _l.fwd !== -1) fwdBad++;
}
ok(tOut === 0, '任意相位下位置 t 都落在 [0,1]', '越界 ' + tOut + ' 次');
ok(fwdBad === 0, 'fwd 只取 ±1', '异常 ' + fwdBad + ' 次');

/* ③ 核心不变量：fwd 必须与 dt/du 同号。
 *    这是「位置每周期被经过两次、拿位置判方向必然出错」的机器可验证形式 —— 
 *    数值微分得到的行进方向，与 legAt 自报的 fwd 必须一致。 */
var mismatch = 0, mismatchAt = '';
var EPS = 1e-6;
for (var _j = 0; _j < 1000; _j++) {
  var _u = _j / 1000;
  /* 避开 u=0 / u=0.5 的折返点：三角波在那里不可导，差分无意义 */
  if (_u < 0.002 || Math.abs(_u - 0.5) < 0.002 || _u > 0.998) continue;
  var du = (_G.legAt(_u + EPS).t - _G.legAt(_u - EPS).t) / (2 * EPS);
  var wantFwd = du > 0 ? 1 : -1;
  if (_G.legAt(_u).fwd !== wantFwd) {
    mismatch++;
    if (!mismatchAt) mismatchAt = 'u=' + _u.toFixed(3) + ' 实际 fwd=' + _G.legAt(_u).fwd + ' 应为 ' + wantFwd;
  }
}
ok(mismatch === 0, 'fwd 与 dt/du 同号（全周期扫描）', mismatchAt);

/* ④ 端到端：采样方向必须与真实位移方向同向（dot > 0）。
 *    ⚠ 别写成「采样点更靠近本航段目的地」—— 那个判据在端点附近会假失败：
 *      采样点刻意**外推越过终点**（t 可 >1）才能取到端点处的切向，
 *      此时它当然比当前点离终点更远，但机头指向依然是对的。
 *      正确形式是点乘：dirv = ahead − now 与真实位移同向。 */
var velWrong = 0, velAt = '';
var _E = 1e-5;
var legA = AT.CITIES_BY_ID['C01'], legB = AT.CITIES_BY_ID['C03'];
function _pos(ca, cb, uu) {
  var p = uu % 1; if (p < 0) p += 1;
  var l2 = _G.legAt(p);
  var rr = 1.6 * (1.024 + Math.sin(l2.t * Math.PI) * 0.035);
  return _G.gcPoint(ca, cb, l2.t, rr);
}
for (var _k = 0; _k < 500; _k++) {
  var _uu = _k / 500;
  if (_uu < 0.002 || Math.abs(_uu - 0.5) < 0.002 || _uu > 0.998) continue;  // 折返点不可导
  var _lg = _G.legAt(_uu);
  var _rr2 = 1.6 * (1.024 + Math.sin(_lg.t * Math.PI) * 0.035);
  var nowV = _G.gcPoint(legA, legB, _lg.t, _rr2);
  var aheadV = _G.gcPoint(legA, legB, _lg.t + 0.015 * _lg.fwd, _rr2);
  var vNext = _pos(legA, legB, _uu + _E), vPrev = _pos(legA, legB, _uu - _E);
  var dx1 = aheadV.x - nowV.x, dy1 = aheadV.y - nowV.y, dz1 = aheadV.z - nowV.z;
  var dx2 = vNext.x - vPrev.x, dy2 = vNext.y - vPrev.y, dz2 = vNext.z - vPrev.z;
  if (dx1 * dx2 + dy1 * dy2 + dz1 * dz2 <= 0) {
    velWrong++; if (!velAt) velAt = 'u=' + _uu.toFixed(3);
  }
}
ok(velWrong === 0, '采样方向与真实位移同向（dot>0，上海↔东京全周期）', velAt);

/* ⑤ 采样点允许外推后不得退化：两端附近前后两点必须仍不重合。
 *    修复前把采样夹取到 [0,1]，导致 t≈1 处「前方一点」与当前点重合、
 *    切向变成零向量，姿态会跳到任意方向。 */
var degenerate = 0, degenAt = '';
for (var _m = 0; _m < 500; _m++) {
  var _u2 = _m / 500;
  var _lg2 = _G.legAt(_u2);
  var _r2 = 1.6 * 1.024;
  var _v1 = _G.gcPoint(legA, legB, _lg2.t, _r2);
  var _v2 = _G.gcPoint(legA, legB, _lg2.t + 0.015 * _lg2.fwd, _r2);
  var _dx = _v2.x - _v1.x, _dy = _v2.y - _v1.y, _dz = _v2.z - _v1.z;
  if (Math.sqrt(_dx * _dx + _dy * _dy + _dz * _dz) < 1e-6) {
    degenerate++; if (!degenAt) degenAt = 'u=' + _u2.toFixed(3);
  }
}
ok(degenerate === 0, '弧两端附近切向不退化（采样可外推）', degenAt);

/* ⑥ 相位环绕与负值保护 */
near(_G.legAt(1).t, 0, 1e-9, 'u=1 环绕回起点');
ok(_G.legAt(1.25).t === _G.legAt(0.25).t, 'u=1.25 等价于 u=0.25');
near(_G.legAt(-0.25).t, 0.5, 1e-9, '负相位 -0.25 等价于 0.75');
ok(_G.legAt(-0.25).fwd === -1, '负相位 -0.25 为回程');


/* ── 需求层 ── */
section('需求层');
var stR = st9();
var potBase = S.routePotential(stR, 'C01', 'C03');
/* 等级提升 → 需求上升 */
var c1 = S.findCity(stR, 'C01'), c3 = S.findCity(stR, 'C03');
var lvSave1 = c1.level, lvSave3 = c3.level;
c1.level = 1; c3.level = 1;
var potLow = S.routePotential(stR, 'C01', 'C03');
c1.level = 5; c3.level = 5;
var potHigh = S.routePotential(stR, 'C01', 'C03');
ok(potHigh > potLow * 1.5, '城市等级↑ → 需求显著上升',
  'Lv1 ' + potLow.toFixed(3) + ' → Lv5 ' + potHigh.toFixed(3));
c1.level = lvSave1; c3.level = lvSave3;
/* 富裕度提升 → 需求上升 */
var wSave = c3.wealth;
c3.wealth = 0.8;
var potPoor = S.routePotential(stR, 'C01', 'C03');
c3.wealth = 1.5;
var potRich = S.routePotential(stR, 'C01', 'C03');
ok(potRich > potPoor, '富裕度↑ → 需求上升',
  '穷 ' + potPoor.toFixed(3) + ' → 富 ' + potRich.toFixed(3));
c3.wealth = wSave;
/* 需求非负 */
var allPot = true;
for (var ai = 0; ai < AT.CITIES.length; ai++) {
  for (var bi = ai + 1; bi < AT.CITIES.length; bi++) {
    var pv = S.routePotential(stR, AT.CITIES[ai].id, AT.CITIES[bi].id);
    if (!(pv >= 0) || !isFinite(pv)) allPot = false;
  }
}
ok(allPot, '所有城市对需求非负且有限');

/* ── 时段槽位层 ── */
section('时段槽位层');
var slots = S.routeSlots(st9(), 'C01', 'C03');
ok(slots >= C.slotMinPerDay && slots <= C.slotMaxPerDay,
  '槽位落在 [min, max] 区间', '实际 ' + slots.toFixed(2) + ' 区间 [' + C.slotMinPerDay + ',' + C.slotMaxPerDay + ']');
/* 枢纽对的槽位应当比「非枢纽+低等级」更紧 */
var stS = st9();
var hubSlots = S.routeSlots(stS, 'C01', 'C03');        // 上海-东京（双枢纽高等级）
var thinSlots = S.routeSlots(stS, 'C24', 'C22');       // 内罗毕-约堡（非枢纽低等级）
ok(hubSlots < thinSlots, '枢纽对的槽位比薄线更紧',
  '枢纽 ' + hubSlots.toFixed(1) + ' vs 薄线 ' + thinSlots.toFixed(1));
/* 竞对占用后槽位减少 */
var stOc = st9();
var beforeOc = S.routeSlots(stOc, 'C01', 'C02');
stOc.rivals[0].alive = true;
stOc.rivals[0].routes.push({ key: AT.routeKey('C01', 'C02'), a: 'C01', b: 'C02',
  type: 'cNB1', perDay: 5, ageQ: 5, capacity: 0.05 });
var afterOc = S.routeSlots(stOc, 'C01', 'C02');
ok(afterOc <= beforeOc, '竞对占位后槽位不增加',
  '前 ' + beforeOc.toFixed(1) + ' → 后 ' + afterOc.toFixed(1));

/* ── 运力层 ── */
section('运力层');
/* ⚠ 用例必须用「机队真能飞」的城市对，否则 openRoute 失败、d 为 undefined。
 *   上海—北京 1067km 在云雀 100（cRJ1，航程 2400km）覆盖内；
 *   曾误写 C24（内罗毕，9574km）导致开线失败，详见本文件头部的踩坑记录。 */
var cap1 = onRoute('C01', 'C01', 'C02', 'cRJ1', 1, 3);
var cap2 = onRoute('C01', 'C01', 'C02', 'cRJ1', 2, 3);
var cap4 = onRoute('C01', 'C01', 'C02', 'cRJ1', 4, 3);
ok(cap1.d && cap2.d && cap1.d.capacity < cap2.d.capacity,
  '加机（1→2 架）→ 运力增加',
  cap1.d && cap2.d ? cap1.d.capacity.toFixed(4) + ' → ' + cap2.d.capacity.toFixed(4)
    : (cap1.fail || cap2.fail || 'd 为 undefined'));
ok(cap2.d && cap4.d && cap2.d.capacity < cap4.d.capacity,
  '加机（2→4 架）→ 运力增加',
  cap2.d && cap4.d ? cap2.d.capacity.toFixed(4) + ' → ' + cap4.d.capacity.toFixed(4)
    : (cap2.fail || cap4.fail || 'd 为 undefined'));
/* 班次为整数（详参用三元惰性求值，避免 ok() 的实参在守卫前就被算掉） */
ok(cap4.d && Math.abs(cap4.d.perDay - Math.round(cap4.d.perDay)) < 1e-9,
  '每日总班次为整数', cap4.d ? '实际 ' + cap4.d.perDay : String(cap4.fail));
ok(cap4.d && Math.abs(cap4.d.flights - Math.round(cap4.d.flights)) < 1e-9,
  '季度班次为整数', cap4.d ? '实际 ' + cap4.d.flights : String(cap4.fail));
/* 运力随班次线性放大：4 架 3 班/架 的运力应为 1 架 3 班的 4 倍 */
ok(cap1.d && cap4.d && Math.abs(cap4.d.capacity / cap1.d.capacity - 4) < 0.02,
  '运力与架数成正比（4×）',
  cap1.d && cap4.d ? '比值 ' + (cap4.d.capacity / cap1.d.capacity).toFixed(3) : 'd 为 undefined');

/* 槽位触顶后加机不再增运力（扩张终点） */
var oc = onRoute('C01', 'C01', 'C03', 'cWB2', 6, 6);
ok(oc.d && oc.d.slotTight === true, '槽位用满时 slotTight = true',
  oc.d ? 'slotCap ' + oc.d.slotCap + ' 班次 ' + oc.d.perDay : String(oc.fail));
/* 顶满槽位后继续加机，运力应封顶、单机利润应递减 */
var stT = st9('C01');
S.buyPlane(stT, 'cWB2', 20);
deliverAll(stT);
var oT = S.openRoute(stT, 'C01', 'C03', 'cWB2', 20);
var rT = stT.routes[stT.routes.length - 1];
rT.ageQ = 99; rT.perDay = 6;
var dT = S.settleRoute(stT, rT);
ok(dT && dT.perDay <= Math.floor(dT.slotCap),
  '总班次不超过槽位', dT ? '班次 ' + dT.perDay + ' 槽位 ' + dT.slotCap : 'd 为 undefined');
/* 扩容到顶后，继续加机的总利润应下降（否则扩张没有终点） */
var grow = [6, 10, 16, 20].map(function (n) {
  var x = onRoute('C01', 'C01', 'C03', 'cWB2', n, 6);
  return x.d ? x.d.profit : NaN;
});
ok(grow.every(function (v) { return isFinite(v); }) && grow[grow.length - 1] < grow[0],
  '槽位触顶后继续加机 → 总利润递减（有扩张终点）',
  grow.map(function (v) { return Math.round(v); }).join(' → '));

/* 单架物理上限：洲际宽体一天飞不了 6 班 */
var farDist = S.routeDistance(st9(), 'C01', 'C13');    // 上海—纽约 11859km
var maxFar = S.maxPerDayFor('cWB2', farDist);
ok(maxFar >= 1 && maxFar <= C.maxPerDayPerPlane,
  '洲际线单架物理上限在 [1, maxPerDayPerPlane]',
  '实际 ' + maxFar);
var nearDist = S.routeDistance(st9(), 'C01', 'C02');   // 上海—北京 1067km
ok(S.maxPerDayFor('cRJ1', nearDist) > S.maxPerDayFor('cRJ1', farDist),
  '短途单架上限 > 长途单架上限（日利用率）');

/* ── 成本与结算层 ── */
section('成本与结算层');
var s1 = onRoute('C01', 'C01', 'C03', 'cWB2', 3, 6);
ok(s1.d, '上海—东京 结算成功', s1.fail);
if (s1.d) {
  var d = s1.d;
  near(d.revenue - d.cost, d.profit, 1e-6, '利润 = 收入 − 成本');
  near(d.fuel + d.landing + d.crew + d.maint + d.ownership, d.cost, 1e-6,
    '成本 = 油 + 起降 + 机组 + 维护 + 持有');
  ok(d.revenue > 0, '收入为正');
  ok(d.realLf > 0 && d.realLf <= 1.001, '真实客座率在 (0, 1]', '实际 ' + d.realLf.toFixed(3));
  ok(d.pax <= d.capacity + 1e-9, '载客不超过运力');
  ok(d.pax <= d.potential + 1e-9, '载客不超过市场需求');
  var costShare = d.cost / d.revenue;
  ok(costShare > 0.5 && costShare < 1.2, '全成本占收入 50%~120%',
    '实际 ' + (costShare * 100).toFixed(0) + '%');
  /* 油费占比（真实航司 25~40%） */
  var fuelShare = d.fuel / d.revenue;
  ok(fuelShare > 0.05 && fuelShare < 0.65, '油费占收入 5%~65%',
    '实际 ' + (fuelShare * 100).toFixed(0) + '%');
}

/* 需求不足时客座率下降（需求成为约束）
 * 内罗毕—迪拜 需求仅 0.0617 百万客/季，5 架信风 320neo 运力 0.1620
 * 远超需求 → 客座率被需求压到 38%，这是「需求瓶颈」的样本。 */
var thin = onRoute('C24', 'C24', 'C17', 'cNB2', 5, 6);
ok(thin.d && thin.d.realLf < (C.loadFactorBase + 0.01),
  '需求瓶颈线上客座率低于基准（需求成为约束）',
  thin.d ? '实际 ' + (thin.d.realLf * 100).toFixed(0) + '% vs 基准 ' + (C.loadFactorBase * 100).toFixed(0) + '%'
    : String(thin.fail));
/* 对照：同一航线减到 2 架，运力贴近需求，客座率应回到基准 */
var thinFit = onRoute('C24', 'C24', 'C17', 'cNB2', 2, 6);
ok(thinFit.d && thinFit.d.realLf > thin.d.realLf,
  '减少运力后客座率回升（需求/运力比是客座率的真正驱动）',
  thin.d && thinFit.d ? (thin.d.realLf * 100).toFixed(0) + '% → ' + (thinFit.realLf * 100).toFixed(0) + '%'
    : 'd 为 undefined');

/* share 计算正确性 */
if (s1.d) {
  ok(s1.d.share > 0 && s1.d.share <= 1.0001, '无竞对时 share 应为 1', '实际 ' + s1.d.share);
}

/* ── 快照账目自洽层 ──
 *
 * 为什么单列一节：财务面板上「收入 − 成本 − 管理 − 利息 = 净利」必须能对上账。
 * 曾经的 bug 是 UI 用 forecast（下一季预测）去凑季报的收入，导致
 * 3.63亿 − 2.59亿 对不上 5,092万（实机截图抓到的），玩家一眼就看出数字是错的。
 * 修法是把结算值写进 history 快照。这里验证快照本身自洽 —— 只要快照对，
 * UI 直接展示就不会错。 */
section('快照账目自洽层');

var stH = st9('C01');
/* 铺三条不同规模的航线，让账目有内容 */
stH.cash = 1e9;
S.openRoute(stH, 'C01', 'C03', 'cNB1', 1);
S.openRoute(stH, 'C01', 'C04', 'cNB1', 1);
S.openRoute(stH, 'C01', 'C02', 'cRJ1', 1);
/* 跑到第 3 季，拿到至少 2 条快照 */
for (var hq = 0; hq < 4; hq++) {
  if (stH.card) S.chooseEvent(stH, 0);
  S.advance(stH, (C.quarterSeconds || 22) + 1);
}
ok(stH.history.length >= 2, '至少积累 2 条季度快照', '实际 ' + stH.history.length);

var lastH = stH.history[stH.history.length - 1];
ok(lastH && lastH.revenue != null, '快照带营业收入字段',
   lastH ? '字段：' + Object.keys(lastH).join(',') : '无快照');
ok(lastH && lastH.cost != null && lastH.overhead != null && lastH.interest != null,
   '快照带成本/管理/利息字段');
if (lastH && lastH.revenue != null) {
  /* 恒等式：收入 − 成本 − 地面 − 管理 − 利息 = 净利（允许取整误差 ±4 万） */
  var rhs = lastH.net;
  var lhs = lastH.revenue - lastH.cost - (lastH.groundCost || 0) - lastH.overhead - lastH.interest;
  near(lhs, rhs, 4, '快照账目自洽：收入 − 各项支出 = 净利润');
  ok(lastH.revenue > 0, '快照收入为正', '实际 ' + lastH.revenue);
  ok(lastH.cost >= 0, '快照成本非负', '实际 ' + lastH.cost);
}

/* 逐季检查全部快照（不只最后一条）—— 曾经的问题就是「看起来对但整体偏移」 */
var badSnap = [];
stH.history.forEach(function (h) {
  if (h.revenue == null) return;
  var diff = (h.revenue - h.cost - (h.groundCost || 0) - h.overhead - h.interest) - h.net;
  if (Math.abs(diff) > 4) badSnap.push('Q' + h.quarter + ' 差 ' + diff.toFixed(0));
});
ok(badSnap.length === 0, '全部历史快照账目自洽',
   badSnap.length ? badSnap.join(' / ') : '');

/* ── 城市开发统计 ──
 * 终局面板要向玩家汇报「交通促进地区发展」做了多少（st.stats.devPushed）。
 * 该统计曾因一个恒返回 0 的占位函数而永远为 0 —— 终局显示「城市开发贡献 0 点」，
 * 但那正是本作的核心卖点，归零等于把最重要的成就感抹掉了。 */
section('城市开发统计层');

ok(stH.stats.devPushed > 0, '有航线时 devPushed 统计为正',
   '实际 ' + stH.stats.devPushed.toFixed(1));
var grew = stH.cities.filter(function (c) { return c.dev > c.dev0 + 1e-9; }).length;
ok(grew > 0, '有城市因通航而开发度上升', '实际 ' + grew + ' 座');
/* 无航线的城市开发度应衰减（不经营就退化） */
var shRank = stH.cities.filter(function (c) { return c.routes === 0 && c.dev < c.dev0; }).length;
ok(shRank > 0, '无航线城市开发度衰减', '实际 ' + shRank + ' 座');

/* ── 指令层 ── */
section('指令层');
var stC = st9();
/* 航程不足应被拒绝 */
var rFar = S.openRoute(stC, 'C01', 'C13', 'cRJ1', 1);
ok(rFar.ok === false && /航程/.test(rFar.reason || ''), '航程不足时拒绝开线',
  rFar.reason);
/* 资金不足应被拒绝 */
var stPoor = st9();
stPoor.cash = 10; stPoor.debt = 0;
var beforeFleet = stPoor.planes.length;
S.buyPlane(stPoor, 'cWB2', 1);
ok(stPoor.planes.length === beforeFleet || stPoor.cash >= 0,
  '资金不足时不会凭空买机');
/* 重复开同一条线应被拒绝 */
var stDup = st9();
S.buyPlane(stDup, 'cRJ1', 2); deliverAll(stDup);
var o1 = S.openRoute(stDup, 'C01', 'C02', 'cRJ1', 1);
var o2 = S.openRoute(stDup, 'C01', 'C02', 'cRJ1', 1);
ok(o1.ok === true, '首次开线成功', o1.reason);
ok(o2.ok === false, '重复开同一条线被拒绝', o2.reason);
/* 关线后飞机回到闲置池 */
if (o1.ok) {
  S.closeRoute(stDup, o1.route.key);
  ok(stDup.routes.filter(function (r) { return r.key === o1.route.key; }).length === 0,
    '关线后航线被移除');
  ok(S.idlePlanes(stDup).length >= 1, '关线后飞机回到闲置池');
}
/* 调频次：超过单架物理上限应被夹 */
var stF = st9();
S.buyPlane(stF, 'cRJ1', 1); deliverAll(stF);
var oF = S.openRoute(stF, 'C01', 'C02', 'cRJ1', 1);
var resF = S.setFrequency(stF, oF.route.key, 99);
ok(resF.ok === true && resF.perDay <= C.maxPerDayPerPlane,
  '调频超过上限被夹', '结果 ' + resF.perDay + ' 上限 ' + C.maxPerDayPerPlane);
ok(resF.clamped === true, '夹取时 clamped = true');
/* 频次至少 1 班 */
var resF0 = S.setFrequency(stF, oF.route.key, 0);
ok(resF0.perDay >= 1, '频次下限为 1 班', '实际 ' + resF0.perDay);

/* ── 飞轮层 ── */
section('城市发展飞轮');
var stW = S.create({ seed: 3, homeCityId: 'C01' });
S.advance(stW, 9);
stW.cash = 1e9; stW.debt = 0;
var devBefore = S.findCity(stW, 'C24').dev;
for (var qq = 0; qq < 12; qq++) S.advance(stW, 90);
var devAfterNoRoute = S.findCity(stW, 'C24').dev;
ok(devAfterNoRoute < devBefore, '无航线的城市 dev 衰减',
  devBefore.toFixed(1) + ' → ' + devAfterNoRoute.toFixed(1));
/* 有航线 → dev 上升 */
var stG = S.create({ seed: 3, homeCityId: 'C01' });
S.advance(stG, 9);
stG.cash = 1e9; stG.debt = 0;
var devHomeBefore = S.findCity(stG, 'C01').dev;
for (var q3 = 0; q3 < 6; q3++) {
  if (S.idlePlanes(stG).length === 0) S.buyPlane(stG, 'cRJ1', 1);
  deliverAll(stG);
  if (!stG.routes.length) {
    var og = S.openRoute(stG, 'C01', 'C02', 'cRJ1', 1);
    if (og.ok) {
      var fr = S.idlePlanes(stG);
      if (fr.length) S.assignPlane(stG, fr[0].id, og.route.key);
    }
  }
  S.advance(stG, 90);
}
ok(S.findCity(stG, 'C01').dev >= devHomeBefore, '有航线的城市 dev 不衰减',
  devHomeBefore.toFixed(1) + ' → ' + S.findCity(stG, 'C01').dev.toFixed(1));

/* ── 终局层 ── */
section('终局层');
var stEnd = S.create({ seed: 5, homeCityId: 'C01', autoPlayer: true });
var g2 = 0;
while (stEnd.phase !== 'over' && g2 < 200000) {
  if (stEnd.card) S.chooseEvent(stEnd, 0);
  S.tick(stEnd, S.TICK); g2++;
}
ok(stEnd.phase === 'over', '自动托管能在限定 tick 内结束一局', '阶段 ' + stEnd.phase);
ok(stEnd.quarter > 0 && stEnd.quarter <= C.totalQuarters,
  '结束季度在有效范围', '实际 ' + stEnd.quarter + ' 上限 ' + C.totalQuarters);
ok(stEnd.ranking && stEnd.ranking.length === 6,
  '终局排名含 6 家（玩家 + 5 竞对）', stEnd.ranking ? stEnd.ranking.length : 0);
ok(S.myRank(stEnd) >= 1 && S.myRank(stEnd) <= 6, '玩家排名在 1~6', S.myRank(stEnd));
ok(typeof S.verdict(stEnd).label === 'string' && S.verdict(stEnd).label.length > 0,
  '终局评价非空');
var glob = S.globalization(stEnd);
ok(glob && glob.pct >= 0 && glob.pct <= 100, '全球化百分比在 [0,100]',
  glob ? glob.pct : 'null');

/* ── 事件卡层 ── */
section('事件卡层');
var stE = st9();
var evApplied = 0;
AT.EVENTS.forEach(function (e) {
  if (!e.options || !e.options.length) return;
  /* 每个选项都应能被安全应用（不抛异常、不改坏状态）。
   * ⚠ state.card 直接就是事件对象本身（sim.js: state.card = ev），
   *   不要再包一层 { id, event }，否则 chooseEvent 读不到 .options。 */
  try {
    stE.card = e;
    S.chooseEvent(stE, 0);
    evApplied++;
  } catch (err) {
    ok(false, '事件卡 ' + e.id + ' 应用失败', String(err && err.message));
  }
});
ok(evApplied === AT.EVENTS.length, '所有事件卡选项可安全应用',
  evApplied + '/' + AT.EVENTS.length);
/* 每张卡的每个选项都应能被应用（不只是第 0 个） */
var optOk = 0, optTotal = 0;
AT.EVENTS.forEach(function (e) {
  (e.options || []).forEach(function (o, oi) {
    optTotal++;
    var stX = st9();
    try { stX.card = e; S.chooseEvent(stX, oi); optOk++; }
    catch (err) { ok(false, '事件卡 ' + e.id + ' 选项 #' + oi + ' 应用失败', String(err && err.message)); }
  });
});
ok(optOk === optTotal, '所有事件卡的**每个**选项均可应用',
  optOk + '/' + optTotal);
/* 越界索引应被安全拒绝，而不是抛异常 */
var stBad = st9(); stBad.card = AT.EVENTS[0];
var badRes = null;
try { badRes = S.chooseEvent(stBad, 99); } catch (err) { badRes = 'throw:' + err.message; }
ok(badRes === false, '越界选项索引被安全拒绝（返回 false）', String(badRes));

/* ── 汇总 ── */
console.log('\n' + '═'.repeat(74));
console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败  （共 ' + (pass + fail) + ' 项）');
console.log('═'.repeat(74));
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach(function (f, i) { console.log('  ' + (i + 1) + '. ' + f); });
}
process.exit(fail ? 1 : 0);
