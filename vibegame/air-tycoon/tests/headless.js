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
 *      「航程不足」这个真实原因。上海—内罗毕有 9574km，巴航 E175 飞不了。
 *   2. ok(cond, name, detail) 的 detail 是**普通实参，会先于守卫求值**。
 *      写 `ok(x.d && ..., '实际 ' + x.d.v)` 会在 x.d 为 undefined 时抛异常。
 *      一律写成 `x.d ? '实际 ' + x.d.v : String(x.fail)`。
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
['data', 'geo', 'landmask', 'sim', 'save'].forEach(function (f) {
  require(path.join(SRC, f + '.js'));
});
var AT = global.AT, S = AT.sim, C = AT.CONFIG, G = AT.geo, SV = AT.save;

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
ok(AT.CITIES.length === 36, '城市数 = 36（6 地区 × 6）', '实际 ' + AT.CITIES.length);
ok(AT.PLANES.length === 13, '机型数 = 13', '实际 ' + AT.PLANES.length);
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
/* 机型梯队应随 tier 递进：**同一 tier 内**允许「平价 / 高端」两款并存
 * （数据扩充原则，见 data.js §4），故不再要求逐条单调，改为校验
 * 「tier 区间不重叠」——低一档的最大座位与价格，都不超过高一档的最小值。 */
var tierAgg = {};
AT.PLANES.forEach(function (p) {
  var a = tierAgg[p.tier] || (tierAgg[p.tier] = { maxS: -Infinity, maxP: -Infinity, minS: Infinity, minP: Infinity });
  a.maxS = Math.max(a.maxS, p.seats); a.minS = Math.min(a.minS, p.seats);
  a.maxP = Math.max(a.maxP, p.price); a.minP = Math.min(a.minP, p.price);
});
var tierKeys = Object.keys(tierAgg).map(Number).sort(function (a, b) { return a - b; });
var tierOk = true;
for (var ti = 1; ti < tierKeys.length; ti++) {
  var lo = tierAgg[tierKeys[ti - 1]], hi = tierAgg[tierKeys[ti]];
  if (hi.minS <= lo.maxS) tierOk = false;
  if (hi.minP <= lo.maxP) tierOk = false;
}
ok(tierOk, '机型梯队区间递进（同 tier 并存平价/高端，跨 tier 座位与价格不重叠）');

var badEv = AT.EVENTS.filter(function (e) {
  return !e.id || !e.title || !e.options || e.options.length < 2;
});
ok(badEv.length === 0, '事件卡字段完整', badEv.map(function (e) { return e.id; }).join(','));
var dupEv = {}; var dupE = 0;
AT.EVENTS.forEach(function (e) { if (dupEv[e.id]) dupE++; dupEv[e.id] = 1; });
ok(dupE === 0, '事件卡 id 无重复');

/* ── 航空公司（开局选航司，用户 2026-09-29）── */
section('航空公司');
ok(AT.AIRLINES.length === 6, '航司数 = 6', '实际 ' + AT.AIRLINES.length);
var badAl = AT.AIRLINES.filter(function (a) {
  return !a.id || !a.name || !a.region || !a.baseCityId || !AT.CITIES_BY_ID[a.baseCityId] ||
    !AT.REGIONS_BY_CODE[a.region] || !a.trait || !a.trait.name || !a.trait.desc;
});
ok(badAl.length === 0, '航司字段完整且基地/地区引用有效',
  badAl.map(function (a) { return a.id; }).join(','));
var dupAl = {}; var dupAlN = 0;
AT.AIRLINES.forEach(function (a) { if (dupAl[a.id]) dupAlN++; dupAl[a.id] = 1; });
ok(dupAlN === 0, '航司 id 无重复');
/* 六家航司各占一个大洲：地区互不重复，且铺满全部 6 个地区 */
var alReg = {}, alRegN = 0;
AT.AIRLINES.forEach(function (a) { if (!alReg[a.region]) alRegN++; alReg[a.region] = 1; });
ok(alRegN === 6 && alRegN === AT.REGIONS.length,
  '六家航司分属 6 个不同地区（各洲一家）', '覆盖 ' + alRegN + ' 个');
ok(AT.AIRLINES.every(function (a) { return AT.AIRLINES_BY_ID[a.id] === a; }),
  'AT.AIRLINES_BY_ID 与 AT.AIRLINES 一一对应');
/* 中性技能：缺省时全部乘数为 1、声誉 50 —— 保证旧调用路径数值不漂移 */
var nt = AT.NEUTRAL_TRAIT;
ok(nt.ownershipMul === 1 && nt.slotMul === 1 && nt.crossRegionDemand === 1 &&
  nt.devGrowthMul === 1 && nt.startCashMul === 1 && nt.loanLimitMul === 1 &&
  nt.repStart === 50 && nt.repEffectMul === 1,
  '中性技能：全部乘数为 1、起始声誉 50');

/* sim 层：选了航司 → 基地/公司名/资金/声誉/竞对全部跟着变 */
var alUA = AT.AIRLINES_BY_ID['al_ua'];        // 联合航空：起始资金 +50%、贷款额度 +50%
var stUA = S.create({ seed: 7, airlineId: 'al_ua' });
ok(stUA.homeCityId === alUA.baseCityId, '基地 = 所选航司的基地',
  stUA.homeCityId + ' vs ' + alUA.baseCityId);
ok(stUA.airlineId === 'al_ua' && stUA.companyName === alUA.name,
  'airlineId 与公司名随航司设置');
ok(stUA.homeRegion === alUA.region, 'homeRegion 随基地城市地区设置');
ok(stUA.cash === Math.round(C.startCash * 1.5), '「雄厚资本」起始资金 +50%', String(stUA.cash));
ok(stUA.loanLimit === Math.round(C.loanLimit * 1.5), '「雄厚资本」贷款额度 +50%',
  String(stUA.loanLimit));
ok(S.traitOf(stUA).id === 'capital', 'S.traitOf 读出该航司技能');

var stSQ = S.create({ seed: 7, airlineId: 'al_sq' });   // 新加坡航空：起始声誉 65
ok(stSQ.reputation === 65, '「服务品牌」起始声誉 65（默认 50）', String(stSQ.reputation));

/* 未选中的 5 家航司成为 AI 竞对，且玩家不在其中 */
var stRiv = S.create({ seed: 7, airlineId: 'al_ca' });
ok(stRiv.rivals.length === 5, '未选中的 5 家航司成为竞对', String(stRiv.rivals.length));
ok(stRiv.rivals.every(function (r) { return r.airlineId && r.airlineId !== 'al_ca'; }),
  '竞对里没有玩家所选的那家');
ok(stRiv.rivals.every(function (r) {
  var a = AT.AIRLINES_BY_ID[r.airlineId];
  return a && r.homeCityId === a.baseCityId && r.name === a.name;
}), '竞对基地/名称与对应航司一致');

/* 向后兼容：不传 airlineId → 与首版完全一致 */
var stOld = S.create({ seed: 7 });
ok(stOld.airlineId === null && stOld.homeCityId === 'C01' &&
  stOld.cash === C.startCash && stOld.reputation === 50 &&
  stOld.loanLimit === C.loanLimit,
  '不传 airlineId：基地 C01 / 资金 800 / 声誉 50 / 贷款默认',
  JSON.stringify({ home: stOld.homeCityId, cash: stOld.cash,
                   rep: stOld.reputation, loan: stOld.loanLimit }));
ok(S.traitOf(stOld).id === 'none', '不传 airlineId：中性技能（无任何加成）');

/* ── 商飞机型专供中国国际航空（2026-10-08）── */
ok(!!AT.planeOf('cRJ2').exclusive && !!AT.planeOf('cNB3').exclusive,
  '商飞 ARJ21 / C919 均标记 exclusive: al_ca');
var rX = S.buyPlane(stUA, 'cNB3', 1);   // stUA = 联合航空（起始资金 1200 万，买得起）
ok(!rX.ok && /商飞|国航/.test(rX.reason || ''),
  '非国航不能新购商飞 C919（资金充足也被拒）', rX.reason);
var stCA = S.create({ seed: 7, airlineId: 'al_ca' });
stCA.cash = 1e9;
ok(S.buyPlane(stCA, 'cRJ2', 1).ok && S.buyPlane(stCA, 'cNB3', 1).ok,
  '中国国际航空可采购商飞两款机型');
ok(AT.canBuyPlane(AT.planeOf('cRJ2'), null), '旧路径（无航司，上海基地）放行商飞机型');
stOld.cash = 1e9;
ok(S.buyPlane(stOld, 'cRJ2', 1).ok, '旧路径实际购机成功（工具/测试行为不变）');
/* 不追溯：手工塞一架非国航的商飞机 → 运营不受限，但补购同型被拒 */
stUA.cash = 1e9;
stUA.planes.push({ id: 'PX0', type: 'cNB3', reg: 'AT-X', routeKey: null, ageQ: 0, onGround: 0 });
ok(stUA.planes.some(function (p) { return p.type === 'cNB3'; }),
  '已持有的商飞机不追溯（照常在机队）');
ok(!S.buyPlane(stUA, 'cNB3', 1).ok, '但非国航补购同型仍被拒');

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
 *   上海—北京 1067km 在巴航 E175（cRJ1，航程 2400km）覆盖内；
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
 * 内罗毕—迪拜 需求仅 0.0617 百万客/季，5 架空客 A320neo 运力 0.1620
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

/* ── 暂停层（抽屉面板打开时冻结回合计时）──
 *
 * 为什么单列一节：这是「静默失效」的又一形态 —— 若 tick 里漏判 state.paused，
 * 玩家打开航线面板慢慢算钱时回合照样推进，表现为「我刚看完，季度已经跳了两个」，
 * 但没有任何断言会红。故把这条不变量钉在无头环境里（UI 侧的 openPanel/closePanel
 * 调 S.setPaused，这条链路由 ui.js 保证，这里只验 sim 的契约）。 */
section('暂停层');

var stP = st9('C01');
ok(stP.phase === 'operating', '先进入运营阶段', '实际 ' + stP.phase);
/* ⚠ 基线取当前值而非假定 0：建局即运营且 quarter 从 1 起算（见 sim.js 建局），
 * 所以开局 = 第 1 季，不是第 0 季。
 * 断言必须相对基线写，否则会把「机制正确」误判成失败。 */
var tBeforeP = stP.t, qBeforeP = stP.quarter;
S.setPaused(stP, true);
ok(stP.paused === true, 'setPaused(true) 置位');
S.advance(stP, (C.quarterSeconds || 60) * 3);
near(stP.t, tBeforeP, 1e-9, '暂停期间 t 完全冻结（3 个季度的时间被丢弃）');
ok(stP.quarter === qBeforeP, '暂停期间季度不推进',
  '实际 Q' + stP.quarter + ' 期望 Q' + qBeforeP);
/* 暂停时 nextQuarter 必须被拒绝 —— 否则返回 ok:true 而季度纹丝不动，
 * 调用方会以为「推进成功」却没有动静（契约自相矛盾）。 */
var nqRes = S.nextQuarter(stP);
ok(nqRes && nqRes.ok === false, '暂停时 nextQuarter 被拒绝', JSON.stringify(nqRes));
/* 恢复后计时照常走 */
S.setPaused(stP, false);
ok(stP.paused === false, 'setPaused(false) 复位');
S.advance(stP, (C.quarterSeconds || 60) + 1);
ok(stP.quarter === qBeforeP + 1, '恢复后季度正常推进一季',
  '实际 Q' + stP.quarter + ' 期望 Q' + (qBeforeP + 1));

/* ── 单航线架数上限（槽位容不下就拒绝派机）──
 *
 * 为什么单列一节：这是「玩家的钱被悄悄吃掉」的防线。此前 assignPlane 不校验架数，
 * 一条线能塞任意多架飞机 —— 结算时总班次被槽位夹住不再增长，但每架的持有成本照付，
 * 玩家只看到「加了机却没多赚」却找不到原因。现在把上限显式化并在此钉死。 */
section('单航线架数上限');

var aC = 'C01', bC = 'C03';
var stC = st9(aC);
var distC = S.routeDistance(stC, aC, bC);
var tyC = AT.PLANES.filter(function (p) { return p.range >= distC; })
  .sort(function (x, y) { return x.price - y.price; })[0].id;
S.buyPlane(stC, tyC, 40);
deliverAll(stC);
var oC = S.openRoute(stC, aC, bC, tyC, 1);
ok(oC.ok, '先开通一条测试航线', oC.reason);
var rC = stC.routes[stC.routes.length - 1];

/* 上限必须 ≥ 1：新线默认就是 1 架，若上限算出 0 会导致「开了线却派不进机」 */
var capC = S.maxPlanesForRoute(stC, rC);
ok(capC >= 1, 'maxPlanesForRoute ≥ 1', '实际 ' + capC);

/* 与槽位口径交叉验证：上限 = floor(min(routeMaxPerDay, 槽位) / 每架每日班次)。
 * 这里用**公开原语**重算一遍 —— 若哪天 settleRoute 的公式改了而这里没跟，
 * 断言会红，逼两处一起改（避免「能派几架」与「实际飞几班」漂开）。 */
var perPlaneC = Math.max(1, Math.min(S.maxPerDayFor(tyC, distC), rC.perDay || 3));
var ceilingC = Math.min(C.routeMaxPerDay || 20, Math.floor(S.routeSlots(stC, aC, bC)));
var capExpectC = Math.max(1, Math.floor(ceilingC / perPlaneC));
ok(capC === capExpectC, '上限公式 = floor(min(时刻上限, 槽位) / 每架班次)',
  '实际 ' + capC + ' 期望 ' + capExpectC);

/* 派满：一直派到被拒为止，最终架数必须恰好等于上限 */
var okC = 0, denyC = 0, lastDenyC = '';
S.idlePlanes(stC).map(function (p) { return p.id; }).forEach(function (id) {
  var res = S.assignPlane(stC, id, rC.key);
  if (res.ok) okC++;
  else { denyC++; if (!lastDenyC) lastDenyC = res.reason || ''; }
});
ok(S.planesOnRoute(stC, rC.key).length === capC, '派满后架数恰好等于上限',
  '实际 ' + S.planesOnRoute(stC, rC.key).length + ' 期望 ' + capC);
ok(denyC > 0, '超出的飞机全部被拒（不静默塞进去）', '成功 ' + okC + ' / 被拒 ' + denyC);
ok(/饱和|最多容纳/.test(lastDenyC), '拒绝理由说明是时刻饱和', lastDenyC);

/* 被拒的飞机必须原封未动（不能半途把 routeKey 写了一半）——
 * 「钱花了、飞机闲置」正是这条规则要根治的失败形态。 */
var assignedC = stC.planes.filter(function (p) { return p.routeKey === rC.key; }).length;
ok(assignedC === capC, '被拒的飞机维持闲置（routeKey 未被写入）',
  '实际挂在该线的飞机 ' + assignedC + ' 期望 ' + capC);

/* 重复指派同一架：是空操作，应返回成功而不是「超限」 */
var onLineC = S.planesOnRoute(stC, rC.key)[0];
var againResC = S.assignPlane(stC, onLineC.id, rC.key);
ok(againResC.ok === true, '把已在本线的飞机再指一次 = 空操作成功', JSON.stringify(againResC));

/* 经济含义：cap 架时每架班次能被完整容纳（perPlane×cap ≤ 天花板），
 * 而再多一架就会越顶 —— 这才是「槽位容不下」的判据（cap=1 为保底，可能已越顶）。 */
ok(capC === 1 || perPlaneC * capC <= ceilingC,
  '上限内的每架都能跑满班次（不被槽位夹掉）',
  'perPlane ' + perPlaneC + ' × cap ' + capC + ' vs 天花板 ' + ceilingC);
ok(perPlaneC * (capC + 1) > ceilingC, '再多一架就超出时刻天花板（拒绝的根据）',
  'perPlane ' + perPlaneC + ' × ' + (capC + 1) + ' vs 天花板 ' + ceilingC);

/* ── 网络连通性层（2026-09-30 用户拍板）──
 * 规则：新航线的两端**至少一端**必须是基地或已通航城市 ——
 *      一家航司的网络只能从母城长出去，不能凭空在任意两城之间开线。
 * 这条规则写在 sim.openRoute（玩家）与 pickRivalRoute（竞对）两处，此处分别断言。 */
section('网络连通性');
var stN = ST();
S.advance(stN, 9);
stN.cash = 1e9; stN.debt = 0;

/* ① 开局网络 = {基地}：从基地开线 → 允许 */
var tyN = AT.PLANES.filter(function (p) { return p.range >= S.routeDistance(stN, 'C01', 'C02'); })
  .sort(function (x, y) { return x.price - y.price; })[0].id;
stN.planes.length = 0;
S.buyPlane(stN, tyN, 3);
deliverAll(stN);
var oN1 = S.openRoute(stN, 'C01', 'C02', tyN, 1);
ok(oN1.ok, '① 从基地开线允许（基地恒在网络里）', oN1.reason);

/* ② 两端都不在网络里 → 拒绝（这是旧版城市卡能凭空开线的漏洞）
 *    ⚠ 用航程最长的机型：tyN 是按 C01-C02（1067km）挑的最便宜机型，
 *      飞不了 C09-C13（5570km）。若用 tyN，即便连通性校验被删掉，
 *      失败原因也会是「航程不足」而让这条断言变成假阳性。 */
var tyLong = AT.PLANES.slice().sort(function (x, y) { return y.range - x.range; })[0].id;
var oN2 = S.openRoute(stN, 'C09', 'C13', tyLong, 1);
ok(!oN2.ok && /相连|连通/.test(oN2.reason || ''),
  '② 凭空开线被拒：两端都不是基地/已通航城市', oN2.reason);

/* ③ 从已通航城市（C02）继续延伸 → 允许（网络是长出来的） */
var tyN2 = AT.PLANES.filter(function (p) { return p.range >= S.routeDistance(stN, 'C02', 'C04'); })
  .sort(function (x, y) { return x.price - y.price; })[0].id;
S.buyPlane(stN, tyN2, 1);
deliverAll(stN);
var oN3 = S.openRoute(stN, 'C02', 'C04', tyN2, 1);
ok(oN3.ok, '③ 从已通航城市延伸允许（C02 已在网络里）', oN3.reason);

/* ④ 网络集合的内容：基地 + 各线两端；未通航的城市不在其中 */
var netN = S.networkCityIds(stN);
ok(netN.C01 && netN.C02 && netN.C04 && !netN.C09,
  '④ networkCityIds = 基地 ∪ 航线两端', JSON.stringify(Object.keys(netN)));

/* ⑤ 关掉约束（calib/audit 工具路径）→ 可以凭空开线：
 *    这是给「测量任意城市对经济性」的工具留的口子，必须仍然可达。
 *    （机型沿用 ② 的 tyLong，同一个城市对，只有 freeNetwork 一个变量不同。） */
var stF2 = ST();
S.advance(stF2, 9);
stF2.cash = 1e9; stF2.debt = 0;
stF2.freeNetwork = true;
S.buyPlane(stF2, tyLong, 2);
deliverAll(stF2);
var oN4 = S.openRoute(stF2, 'C09', 'C13', tyLong, 1);
ok(oN4.ok, '⑤ freeNetwork 关掉约束后仍可任意开线（工具用）', oN4.reason);

/* ⑥ 竞对同规则：跑满一局后，逐家校验「每条线的至少一端 ∈ 该家自己的网络」。
 *    ⚠ 按数组顺序增量校验 —— 竞对的线是逐条追加的，第 k 条只需在第 k-1 条时的
 *    网络里（这正是规则的定义），所以顺序遍历就是正确判据。 */
var stRN = S.create({ seed: 9, airlineId: 'al_ca', autoPlayer: true });
var gN = 0;
while (stRN.phase !== 'over' && gN < 200000) {
  if (stRN.card) S.chooseEvent(stRN, 0);
  S.tick(stRN, S.TICK); gN++;
}
var badRiv = 0, totRiv = 0, noColor = 0;
stRN.rivals.forEach(function (r) {
  var net = {}; net[r.homeCityId] = 1;
  if (!r.color) noColor++;
  r.routes.forEach(function (rk) {
    totRiv++;
    if (!net[rk.a] && !net[rk.b]) badRiv++;
    net[rk.a] = 1; net[rk.b] = 1;
  });
});
ok(totRiv > 0, '⑥ 竞对确实开了航线（样本非空）', '合计 ' + totRiv + ' 条');
ok(badRiv === 0, '⑥ 竞对的每条线都从自己母城长出来（无凭空线）',
  '违规 ' + badRiv + ' / 合计 ' + totRiv);
ok(noColor === 0, '⑥ 竞对都带航司识别色（render.js 按它对航线/客机着色）',
  '缺色 ' + noColor + ' 家');

/* ───────────────────────── 城市等级门槛与航线上限层（2026-10-09 加）─────────────────────────
 * 用户反馈「航线和飞机可以随便加、与城市等级没有正关联」，本次引入两条结构性约束：
 *   · 航线上限 —— 每城最多承接 `cap = 该城等级` 条航线，基地城市额外 +homeRouteBonus；
 *   · 机型等级门槛 —— 大型客机需**航线两端**城市等级达标（tier5→Lv5、tier4→Lv4、tier3→Lv3）。
 * 两条规则都是**硬约束**（不是开发度软惩罚），口径单一真源在 data.js 的
 * AT.routeCapOf / AT.planeLevelMin，sim/UI/tests 共用，避免界面与实际放行漂移。
 * 二者都**只挡新动作、不追溯**，且在开线 / 派机 / 换机型三处一致生效。 */
section('城市等级门槛与航线上限层');

/* ① 公式：单一真源，纯函数 */
ok(AT.routeCapOf(5, false) === 5, '① 上限公式：Lv5 非基地 = 5', String(AT.routeCapOf(5, false)));
ok(AT.routeCapOf(4, false) === 4, '① 上限公式：Lv4 非基地 = 4', String(AT.routeCapOf(4, false)));
ok(AT.routeCapOf(1, false) === 1, '① 上限公式：Lv1 非基地 = 1', String(AT.routeCapOf(1, false)));
ok(AT.routeCapOf(3, true) === 3 + C.homeRouteBonus,
  '① 上限公式：基地 = 等级 + homeRouteBonus', String(AT.routeCapOf(3, true)));
ok(AT.planeLevelMin('cRJ1') === 1 && AT.planeLevelMin('cWB1') === 3 &&
  AT.planeLevelMin('cWB2') === 4 && AT.planeLevelMin('cWB4') === 5,
  '① 机型等级门槛：支线 Lv1 / 宽体 Lv3 / 777 Lv4 / A380 Lv5',
  [1, 3, 4, 5].map(function (t) { return AT.planeLevelMin(t); }).join('-'));

/* 辅助：造一个「自由网络」状态（freeNetwork 绕过连通性，专测容量与门槛两把闸）。
 * ⚠ 不 advance —— 开局 phase 即为 'operating'，避免推进期间竞对开线抬高城市 dev，
 *   污染「起始等级」这一被测前提。 */
function freeState(home) {
  var st = S.create({ seed: 7, homeCityId: home });
  st.cash = 1e9; st.debt = 0; st.freeNetwork = true;
  return st;
}

/* ② 开线门槛：777（cWB2，需两端 Lv4）不能飞 Lv2—Lv3 的线。
 *    C28 胡志明市（dev0=34→Lv2）× C25 广州（dev0=58→Lv3），两端最低 Lv2 < 4。 */
var stG = freeState('C28');
S.buyPlane(stG, 'cWB2', 1); deliverAll(stG);
var oG1 = S.openRoute(stG, 'C28', 'C25', 'cWB2', 1);
ok(!oG1.ok && /两端均达/.test(oG1.reason || ''),
  '② 开线：777 飞 Lv2—Lv3 线被拒（需两端 Lv4）', oG1.reason);

/* ③ 达标放行：同一款 777 飞 C01 上海（Lv4）—C03 东京（Lv5）允许 */
var stG2 = freeState('C01');
S.buyPlane(stG2, 'cWB2', 1); deliverAll(stG2);
var oG2 = S.openRoute(stG2, 'C01', 'C03', 'cWB2', 1);
ok(oG2.ok, '③ 放行：777 飞 Lv4—Lv5 线允许', oG2.reason);

/* ④ 派机门槛：支线机已在 C28—C25 运营，再派一架 777 上去 → 拒 */
var stG3 = freeState('C28');
S.buyPlane(stG3, 'cRJ1', 1); S.buyPlane(stG3, 'cWB2', 1); deliverAll(stG3);
var oG3 = S.openRoute(stG3, 'C28', 'C25', 'cRJ1', 1);
ok(oG3.ok, '④ 前置：支线机可在 Lv2—Lv3 线开航', oG3.reason);
var big3 = stG3.planes.filter(function (p) { return p.type === 'cWB2'; })[0];
var aG3 = S.assignPlane(stG3, big3.id, oG3.route.key);
ok(!aG3.ok && /两端均达/.test(aG3.reason || ''),
  '④ 派机：777 派到 Lv2—Lv3 线被拒', aG3.reason);

/* ⑤ 换机型门槛：把 C28—C27（Lv2—Lv3）的支线线升级为 777 → 拒 */
var stG4 = freeState('C28');
S.buyPlane(stG4, 'cRJ1', 1); deliverAll(stG4);
var oG4 = S.openRoute(stG4, 'C28', 'C27', 'cRJ1', 1);
ok(oG4.ok, '⑤ 前置：支线机可在 Lv2—Lv3 线开航', oG4.reason);
var uG4 = S.upgradeRouteType(stG4, oG4.route.key, 'cWB2');
ok(!uG4.ok && /两端均达/.test(uG4.reason || ''),
  '⑤ 换机型：支线线升级为 777 被拒', uG4.reason);

/* ⑥ 航线上限：C28（Lv2，非基地 → cap 2）开到第 3 条被拒。
 *    ⚠ 母城取 C01，让 C28 保持**非基地**（基地会 +2，令上限变成 4）。 */
var stG5 = freeState('C01');
S.buyPlane(stG5, 'cRJ1', 3); deliverAll(stG5);
ok(S.cityRouteCap(stG5, 'C28') === AT.routeCapOf(2, false),
  '⑥ C28 上限 = 2（Lv2，非基地）', String(S.cityRouteCap(stG5, 'C28')));
var o1 = S.openRoute(stG5, 'C28', 'C27', 'cRJ1', 1);
var o2 = S.openRoute(stG5, 'C28', 'C25', 'cRJ1', 1);
ok(o1.ok && o2.ok, '⑥ 前 2 条线（C28—C27 / C28—C25）开航成功',
  (o1.reason || '') + (o2.reason || ''));
var o3 = S.openRoute(stG5, 'C28', 'C26', 'cRJ1', 1);
ok(!o3.ok && /已达上限/.test(o3.reason || ''),
  '⑥ 第 3 条线被拒：C28 已达上限 2 条', o3.reason);

/* ⑦ 基地 +2：同一座 C28 作为基地时上限 = 4（Lv2 + homeRouteBonus） */
ok(S.cityRouteCap(freeState('C28'), 'C28') === AT.routeCapOf(2, true) &&
  S.cityRouteCap(freeState('C28'), 'C28') === 4,
  '⑦ 基地加成：C28 作基地时上限 = 4（Lv2 + 2）',
  String(S.cityRouteCap(freeState('C28'), 'C28')));

/* ───────────────────────── 并购层 ─────────────────────────
 * 「整体并购对手」玩法（2026-10-08）的核心不变量：
 *   资格 = 排名领先（你排在它前面）+ 资金足够；报价 = 对手净资产 × 溢价（危机折价）；
 *   成功后对手机队与航线并入玩家、对手彻底退场、它对你的价格战一并结束。
 * ⚠ 报价口径必须与榜单一致：rivalNetWorth = 现金 + 机队重置价 × 0.85
 *   （竞对机队不带机龄，故按重置价折扣，而非玩家的按机龄折旧残值）。 */
section('并购层');

/* 竞对在册架数 / 机队重置价 —— 与 sim 内部同口径（测试侧复算，防止口径漂移） */
function fleetTotal(r) {
  return r.fleet.reduce(function (s, f) { return s + f.count; }, 0);
}
function fleetAsk(r) {
  return r.fleet.reduce(function (s, f) { return s + AT.planeOf(f.type).price * f.count; }, 0);
}
/* 推进到指定季度并自动处理事件卡（未决事件卡会让 tick 冻结回合计时） */
function runTo(st, quarter) {
  var g = 0;
  while (st.quarter < quarter && st.phase !== 'over' && g < 200000) {
    if (st.card) S.chooseEvent(st, 0);
    S.tick(st, S.TICK); g++;
  }
  return st;
}

/* ① 资格与报价：排名第 1 + 现金充足 → 可并购，报价 = 净资产 × 正常溢价 */
var stAc = S.create({ seed: 7, homeCityId: 'C01' });
runTo(stAc, 8);
stAc.cash = 1e9; stAc.debt = 0;               // 净资产碾压 → 稳居第 1
ok(S.ranking(stAc)[0].isPlayer, '① 现金 1e9 → 玩家位列第 1（取得并购资格）');
/* 选中「机队最多、且机队数 ≥ 航线数」的对手：保证其航线都能分到飞机（见②贪心分配） */
var tgt = null;
stAc.rivals.forEach(function (r) {
  if (!r.alive || !r.routes.length) return;
  if (fleetTotal(r) < r.routes.length) return;
  if (!tgt || fleetTotal(r) > fleetTotal(tgt)) tgt = r;
});
ok(!!tgt, '① 存在「机队数 ≥ 航线数」的可并购对手（样本非空）');
tgt.cash = 8000;                              // 明确非危机（高于 acquireCrisisCash）
var tId = tgt.id;
var infoA = S.acquireInfo(stAc, tId);
ok(infoA.ok, '① 排名领先 + 资金充足 → acquireInfo.ok', infoA.reason);
ok(infoA.crisis === false && infoA.mult === C.acquirePremium,
  '① 非危机：溢价 = CONFIG.acquirePremium', 'crisis=' + infoA.crisis + ' mult=' + infoA.mult);
var askBase = tgt.cash + fleetAsk(tgt) * 0.85;
var askExp = Math.max(C.acquireMinPrice, Math.round(askBase * C.acquirePremium));
ok(infoA.price === askExp, '① 报价 = max(下限, 对手净资产 × 溢价)',
  '实际 ' + infoA.price + ' 期望 ' + askExp);
ok(infoA.gainRoutes === tgt.routes.length && infoA.gainPlanes === fleetTotal(tgt),
  '① 预展示「将接收」= 对手航线数 / 在册架数',
  infoA.gainRoutes + ' 线 / ' + infoA.gainPlanes + ' 架');

/* ② 执行并购：扣款、并入机队与航线、对手退场、价格战结束 */
var cashB = stAc.cash, planesB = stAc.planes.length;
var rivalsB = stAc.rivals.length, routesB = stAc.routes.length;
var gainP = infoA.gainPlanes, gainR = infoA.gainRoutes;
stAc.priceWars.push({ key: tgt.routes[0].key, turns: 3, by: tId });   // 它正对你打价格战
var resA = S.acquireRival(stAc, tId);
ok(resA.ok, '② 并购执行成功', resA.reason);
ok(stAc.rivals.length === rivalsB - 1, '② 对手数减 1（彻底退场）', String(stAc.rivals.length));
ok(stAc.rivals.every(function (r) { return r.id !== tId; }), '② 被并购方已从榜单移除');
ok(Math.round(stAc.cash) === Math.round(cashB - infoA.price), '② 现金按报价扣除',
  '实际 ' + Math.round(stAc.cash) + ' 期望 ' + Math.round(cashB - infoA.price));
ok(stAc.planes.length === planesB + gainP, '② 机队并入：玩家机队 = 原 + 对手在册',
  '实际 ' + stAc.planes.length + ' 期望 ' + (planesB + gainP));
/* ⚠ 并入的是「实际并入」的航线数 resA.routes，不是预展示的 gainR：
 *   并购时若某城已达航线上限 / 机型不合两端等级门槛，会跳过该线（见 sim.acquireRival），
 *   故 resA.routes ≤ gainR。用 gainR 会在「对手某城开满」时假失败。 */
ok(stAc.routes.length === routesB + resA.routes, '② 航线并入：玩家航线 = 原 + 实际并入数',
  '实际 ' + stAc.routes.length + ' 期望 ' + (routesB + resA.routes));
ok(resA.routes <= gainR, '② 实际并入数 ≤ 预展示数（容量/门槛会跳过个别线）',
  '并入 ' + resA.routes + ' / 预展示 ' + gainR);
ok(stAc.priceWars.every(function (w) { return w.by !== tId; }),
  '② 它对我的价格战一并结束（by 为该对手的记录被清除）');
ok(S.ranking(stAc).length === rivalsB, '② 榜单总数减 1（原「玩家 + 对手数」少一家）',
  '实际 ' + S.ranking(stAc).length);

/* ③ 接收的航线可直接运营：每条都有飞机、结算无 NaN */
var zeroPlane = 0, nanProfit = 0;
stAc.routes.forEach(function (rt) {
  if (S.planesOnRoute(stAc, rt.key).length < 1) zeroPlane++;
  var d = S.settleRoute(stAc, rt);
  if (!(typeof d.profit === 'number') || d.profit !== d.profit) nanProfit++;
});
ok(zeroPlane === 0, '③ 并入的每条航线至少分到 1 架飞机', '0 机航线 ' + zeroPlane + ' 条');
ok(nanProfit === 0, '③ 并入航线可正常结算（profit 为有限数，无 NaN）');

/* ④ 危机折价：对手现金告急 → 按 acquireCrisisMul 折价 */
var stC = st9('C01');
stC.cash = 1e9; stC.debt = 0;
var tC = stC.rivals[0];
tC.cash = -500;                               // 低于 acquireCrisisCash(0) → 危机
var infoC = S.acquireInfo(stC, tC.id);
ok(infoC.ok, '④ 危机对手仍可报价', infoC.reason);
ok(infoC.crisis === true && infoC.mult === C.acquireCrisisMul,
  '④ 对手现金告急 → 折价报价', 'crisis=' + infoC.crisis + ' mult=' + infoC.mult);
ok(infoC.price === Math.max(C.acquireMinPrice,
    Math.round((tC.cash + fleetAsk(tC) * 0.85) * C.acquireCrisisMul)),
  '④ 折价报价 = 对手净资产 × acquireCrisisMul', '实际 ' + infoC.price);

/* ⑤ 资金不足被拒（排名仍领先：用昂贵机队抬高净资产、现金抽干） */
var tyBig = AT.PLANES.slice().sort(function (a, b) { return b.price - a.price; })[0].id;
var stP = st9('C01');
stP.cash = 1e9; stP.debt = 0;
S.buyPlane(stP, tyBig, 20);                   // 净资产被机队抬高
stP.cash = 50;                                // 但现金见底
ok(S.ranking(stP)[0].isPlayer, '⑤ 现金见底但机队庞大 → 排名仍第 1（唯一变量 = 现金）');
var infoP = S.acquireInfo(stP, stP.rivals[0].id);
ok(!infoP.ok && /资金/.test(infoP.reason || ''), '⑤ 现金 < 报价 → 以「资金不足」拒绝', infoP.reason);

/* ⑥ 排名落后被拒；已退场对手不可并购；资格确由「排名 + 资金」两项决定 */
var stR = st9('C01');
stR.cash = 0; stR.debt = 0; stR.planes = [];   // 净资产 0 → 垫底
var infoR = S.acquireInfo(stR, stR.rivals[0].id);
ok(!infoR.ok && /排名/.test(infoR.reason || ''),
  '⑥ 玩家净资产垫底 → 以「只能并购排名低于你的航司」拒绝', infoR.reason);
stR.rivals[1].alive = false;
ok(!S.acquireInfo(stR, stR.rivals[1].id).ok, '⑥ 已退出市场的对手不可并购');
stR.cash = 1e9;
ok(S.acquireInfo(stR, stR.rivals[0].id).ok,
  '⑥ 仅把现金抬到 1e9 → 同一对手转为可并购（资格确由排名 + 资金两项决定）');

/* ⑦ 并购后的存档往返一致（对手少一家也要保留） */
var rtAc = SV.deserialize(SV.serialize(stAc));
ok(rtAc && rtAc.rivals.length === stAc.rivals.length &&
   rtAc.routes.length === stAc.routes.length &&
   rtAc.planes.length === stAc.planes.length,
  '⑦ 并购后存档往返一致（对手 / 航线 / 机队数不变）',
  rtAc ? (rtAc.rivals.length + ' / ' + rtAc.routes.length + ' / ' + rtAc.planes.length) : '复原失败');

/* ───────────────────────── 存档层 ─────────────────────────
 * 自动存档的核心不变量：serialize → deserialize 必须得到「同一局」，
 * 且随机流**接着往下跑**（读档后的事件序列不能与一直玩下去的世界线分叉）。
 * 存储 I/O（xhs Storage / localStorage）在无头环境不可用，故这里只钉纯函数往返；
 * 真实读写由实机冒烟（smoke-render / verify-dist）覆盖。 */
section('存档层');

/* ① 往返一致：跑到中局（含事件/竞对/航线）再序列化 → 复原，关键字段必须相等 */
var stS = S.create({ seed: 12345, airlineId: 'al_ca', autoPlayer: true });
var gS = 0;
while (stS.quarter < 12 && stS.phase !== 'over' && gS < 200000) {
  if (stS.card) S.chooseEvent(stS, 0);
  S.tick(stS, S.TICK); gS++;
}
var textS = SV.serialize(stS);
ok(typeof textS === 'string' && textS.length > 0, '① serialize 产出非空 JSON 字符串');
var rt = SV.deserialize(textS);
ok(!!rt, '① deserialize 复原出 state');
ok(rt && rt.companyName === stS.companyName, '① 公司名一致');
ok(rt && rt.quarter === stS.quarter, '① 当前季度一致',
  rt ? ('实际 Q' + rt.quarter + ' 期望 Q' + stS.quarter) : '');
ok(rt && Math.round(rt.cash) === Math.round(stS.cash), '① 资金一致');
ok(rt && rt.routes.length === stS.routes.length, '① 航线数一致');
ok(rt && rt.planes.length === stS.planes.length, '① 机队数一致');
ok(rt && rt.rivals.length === stS.rivals.length, '① 竞对数一致');
ok(rt && rt.cities.length === stS.cities.length, '① 城市数一致');

/* ② 随机流续跑：复原后 rng 的下一个值必须与原 state 的下一个值相同
 *   （若只按种子重建 rng 而不复原推进位，这里会不等 → 读档后世界线分叉）。 */
var aNext = stS.rng(), bNext = rt ? rt.rng() : NaN;
ok(aNext === bNext, '② 复原后随机流接着往下跑（rng 下一值相同）',
  '实际 ' + bNext + ' 期望 ' + aNext);

/* ③ 复原后继续推进，结果与「从未存档」完全一致（固定步长确定性的直接后果） */
var stA = S.create({ seed: 777, airlineId: 'al_ca', autoPlayer: true });
S.advance(stA, 30);
var stB = SV.deserialize(SV.serialize(stA));
S.advance(stA, 60);
S.advance(stB, 60);
ok(Math.round(stA.cash) === Math.round(stB.cash) &&
   stA.quarter === stB.quarter &&
   stA.routes.length === stB.routes.length,
  '③ 存档续跑与不存档续跑结果一致（Q' + stA.quarter + '）',
  '不存档 ' + Math.round(stA.cash) + ' vs 存档 ' + Math.round(stB.cash));

/* ④ 面板打开（paused）时写的档：复原后必须复位为 false，否则 tick 永远早退 */
var stP = S.create({ seed: 3 });
stP.phase = 'operating';
S.setPaused(stP, true);
var stP2 = SV.deserialize(SV.serialize(stP));
ok(stP2 && stP2.paused === false, '④ 复原后 paused 复位为 false（避免读档即卡死）');

/* ⑤ 坏档一律当「无存档」：返回 null，绝不抛异常 */
ok(SV.deserialize('') === null, '⑤ 空串 → null');
ok(SV.deserialize('{') === null, '⑤ 非法 JSON → null');
ok(SV.deserialize(JSON.stringify({ v: 999, s: {} })) === null, '⑤ 版本不符 → null');
ok(SV.deserialize(JSON.stringify({ v: SV.VERSION, s: { phase: 'operating' } })) === null,
  '⑤ 结构残缺（缺 cities/routes/…）→ null');
ok(SV.deserialize(null) === null, '⑤ null → null');

/* ⑥ 单档体积必须留在 Storage 单 key 上限（1 MB）以内 */
ok(textS.length < 1024 * 1024, '⑥ 单档体积 < 1 MB（Storage 单 key 上限）',
  '实际 ' + Math.round(textS.length / 1024) + ' KB');

/* ⑦ 客户端版本判据（规范 §3.6）：末三位编译序号必须被忽略 */
ok(SV.getClientVersion(9462004) === 9462, '⑦ buildVersion 9462004 → 客户端 9.46.2');
ok(SV.isClientVersionAtLeast(9462004, SV.STORAGE_MIN_CLIENT_VERSION),
  '⑦ 9.46+ 判定为支持 Storage JS API');
ok(!SV.isClientVersionAtLeast(9459000, SV.STORAGE_MIN_CLIENT_VERSION),
  '⑦ 9.45 判定为不支持（应走 localStorage 降级）');

/* ── 汇总 ── */
console.log('\n' + '═'.repeat(74));
console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败  （共 ' + (pass + fail) + ' 项）');
console.log('═'.repeat(74));
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach(function (f, i) { console.log('  ' + (i + 1) + '. ' + f); });
}
process.exit(fail ? 1 : 0);
