/*
 * defcon — tests/headless.js
 * 无头校验脚本（Node 运行，不进提交包）。
 * 加载 data.js + geo.js（注入 window=global），对数据与几何层做确定性断言，
 * 并扫描两文件是否违反小工具红线（fetch / Worker / eval / new Function / import / export）。
 *
 * 运行：node tests/headless.js
 */
'use strict';

var path = require('path');
var fs = require('fs');
var assert = require('assert');

// 让经典脚本把命名空间挂到 global（模拟浏览器 window）
global.window = global;
require(path.join(__dirname, '..', 'src', 'data.js'));
require(path.join(__dirname, '..', 'src', 'geo.js'));
require(path.join(__dirname, '..', 'src', 'sim.js'));
require(path.join(__dirname, '..', 'src', 'ai.js'));

var DC = global.DC;
var G = DC.geo;
var S = DC.sim;
var AI = DC.ai;
var CFG = DC.CONFIG;

var pass = 0, fail = 0;
var failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? '  →  ' + detail : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-6 : eps); }

/* ───────────────────────── 数据层断言 ───────────────────────── */

// 1. 阵营
ok('阵营数量 = 6', DC.FACTIONS.length === 6, 'got ' + DC.FACTIONS.length);
var codes = DC.FACTIONS.map(function (f) { return f.code; }).sort().join(',');
ok('阵营代号 = ALFA..FOXTROT', codes === 'ALFA,BRAVO,CHARLIE,DELTA,ECHO,FOXTROT', codes);
ok('每个阵营有名称/主色/区块', DC.FACTIONS.every(function (f) {
  return f.name && /^#[0-9A-Fa-f]{6}$/.test(f.color) && f.region;
}), '检查颜色与字段');

// 2. 城市
ok('城市总数 = 60', DC.CITIES.length === 60, 'got ' + DC.CITIES.length);
var perFaction = {};
DC.CITIES.forEach(function (c) { perFaction[c.faction] = (perFaction[c.faction] || 0) + 1; });
var everyTen = DC.FACTIONS.every(function (f) { return perFaction[f.code] === 10; });
ok('每阵营恰好 10 城', everyTen, JSON.stringify(perFaction));

var popOk = DC.CITIES.every(function (c) { return c.pop >= 3 && c.pop <= 18 && c.pop % 1 === 0; });
ok('人口在 3–18 百万且为整数', popOk);

var latOk = DC.CITIES.every(function (c) { return c.lat >= -90 && c.lat <= 90; });
var lonOk = DC.CITIES.every(function (c) { return c.lon >= -180 && c.lon <= 180; });
ok('经纬度范围合法', latOk && lonOk);

// 每阵营人口总量约 90 百万（容许 75–95）
var sums = {};
DC.FACTIONS.forEach(function (f) {
  sums[f.code] = DC.CITIES_BY_FACTION[f.code].reduce(function (s, c) { return s + c.pop; }, 0);
});
var sumsOk = Object.keys(sums).every(function (k) { return sums[k] >= 75 && sums[k] <= 95; });
ok('每阵营人口约 90M（75–95）', sumsOk, JSON.stringify(sums));

// id 唯一
var ids = DC.CITIES.map(function (c) { return c.id; });
ok('城市 id 唯一', new Set(ids).size === ids.length);

// 查找表
ok('CITIES_BY_FACTION 可用', DC.FACTIONS.every(function (f) {
  return DC.CITIES_BY_FACTION[f.code].length === 10;
}));

// 3. 事件卡
ok('事件卡数量 = 22', DC.EVENTS.length === 22, 'got ' + DC.EVENTS.length);
var validEvent = DC.EVENTS.every(function (e) {
  if (!e.id || !e.title || !e.desc) return false;
  if (!Array.isArray(e.options) || e.options.length < 2 || e.options.length > 3) return false;
  return e.options.every(function (o) {
    if (typeof o.label !== 'string' || typeof o.crisis !== 'number') return false;
    if (o.effect) {
      var t = o.effect.type;
      var allowed = ['expose_silo', 'reveal_radar', 'city_defense', 'pop_loss', 'radar_down'];
      if (allowed.indexOf(t) < 0) return false;
      if (o.effect.target && ['self', 'enemy', 'random'].indexOf(o.effect.target) < 0) return false;
    }
    return true;
  });
});
ok('事件卡结构合法（2–3 选项 / crisis 数值 / effect 类型）', validEvent);
var evIds = DC.EVENTS.map(function (e) { return e.id; });
ok('事件卡 id 唯一', new Set(evIds).size === evIds.length, evIds.join(','));

// 配置
ok('CONFIG.defconLevels 含 DEFCON 1 解锁', DC.CONFIG.defconLevels.some(function (d) { return d.level === 1 && d.min >= 80; }));
ok('CONFIG 单位参数存在', DC.CONFIG.silosPerFaction === 6 && DC.CONFIG.missilesPerSilo === 3);

/* ───────────────────────── 几何层断言 ───────────────────────── */

// ll2v 模长恒为 r
var vEq = G.ll2v(0, 0, 100);
ok('ll2v 模长 = r', approx(Math.sqrt(vEq.x * vEq.x + vEq.y * vEq.y + vEq.z * vEq.z), 100, 1e-6));
var vNp = G.ll2v(90, 123, 50);
ok('北极点 ll2v → (0,r,0)', approx(vNp.x, 0, 1e-6) && approx(vNp.y, 50, 1e-6) && approx(vNp.z, 0, 1e-6));

// 大圆距离已知值
var dEq90 = G.distKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 });
ok('赤道 90° 经度差 ≈ 10007 km', approx(dEq90, 10007.5, 5), 'got ' + dEq90.toFixed(1));
var dHalf = G.distKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
ok('对跖 180° 经度差 ≈ 20015 km', approx(dHalf, 20015.1, 10), 'got ' + dHalf.toFixed(1));
ok('同点距离 = 0', approx(G.distKm({ lat: 12, lon: 34 }, { lat: 12, lon: 34 }), 0, 1e-6));

// gcPoint 端点对齐
var A = { lat: 10, lon: 20 }, B = { lat: 50, lon: -30 };
var g0 = G.gcPoint(A, B, 0, 10), g1 = G.gcPoint(A, B, 1, 10);
var a0 = G.ll2v(A.lat, A.lon, 10), b0 = G.ll2v(B.lat, B.lon, 10);
ok('gcPoint(t=0) ≈ 起点', approx(g0.x, a0.x, 1e-6) && approx(g0.y, a0.y, 1e-6) && approx(g0.z, a0.z, 1e-6));
ok('gcPoint(t=1) ≈ 终点', approx(g1.x, b0.x, 1e-6) && approx(g1.y, b0.y, 1e-6) && approx(g1.z, b0.z, 1e-6));

// ballistic 顶点高于地表，端点贴地
var r0 = 100, apex = 12;
var bMid = G.ballistic(A, B, 0.5, r0, apex);
var bMidR = Math.sqrt(bMid.x * bMid.x + bMid.y * bMid.y + bMid.z * bMid.z);
ok('ballistic 顶点半径 > r', bMidR > r0, 'midR=' + bMidR.toFixed(2));
var b0v = G.ballistic(A, B, 0, r0, apex), b1v = G.ballistic(A, B, 1, r0, apex);
ok('ballistic 端点贴地（t=0/1 半径≈r）',
  approx(Math.sqrt(b0v.x * b0v.x + b0v.y * b0v.y + b0v.z * b0v.z), r0, 1e-6) &&
  approx(Math.sqrt(b1v.x * b1v.x + b1v.y * b1v.y + b1v.z * b1v.z), r0, 1e-6));

// traceSigma 单调
ok('traceSigma 随角距增大', G.traceSigma(1.5, 0.06, 0) < G.traceSigma(1.5, 0.06, 45) &&
  G.traceSigma(1.5, 0.06, 45) < G.traceSigma(1.5, 0.06, 90));

// reverseTrace 回归 start（任意 tc）
var rtOk = [0, 0.25, 0.5, 0.75, 0.999].every(function (tc) {
  var est = G.reverseTrace(A, B, tc);
  return approx(est.lat, A.lat, 1e-6) && approx(est.lon, A.lon, 1e-6);
});
ok('reverseTrace 几何估计 = 真实发射点', rtOk);

// offsetLL 确定性 + 非零
var off1 = G.offsetLL({ lat: 0, lon: 0 }, 5, 0.3, 0.7);
var off2 = G.offsetLL({ lat: 0, lon: 0 }, 5, 0.3, 0.7);
ok('offsetLL 确定性可复现', off1.lat === off2.lat && off1.lon === off2.lon);
ok('offsetLL 在非零 sigma 下产生偏移', (off1.lat !== 0 || off1.lon !== 0));

// flightSeconds 单调且落在 [15,40]
ok('flightSeconds(0) = 下限', approx(G.flightSeconds(0), DC.CONFIG.missileFlightMin, 1e-6));
ok('flightSeconds(满程) = 上限', approx(G.flightSeconds(20000), DC.CONFIG.missileFlightMax, 1e-6));
ok('flightSeconds 随距离增大', G.flightSeconds(5000) < G.flightSeconds(15000));

/* ───────────────────────── D2 期新增的几何原语 ───────────────────────── */

// ll2v ↔ v2ll 必须严格往返，否则布阵落点会整体偏移
var rtPts = [[0, 0], [45, -90], [-33, 151], [71, 90], [12, -179], [-60, 45]];
ok('ll2v↔v2ll 往返一致', rtPts.every(function (p) {
  var ll = G.v2ll(G.ll2v(p[0], p[1], 1));
  var dLon = Math.abs(ll.lon - p[1]);
  return approx(ll.lat, p[0], 1e-9) && (dLon < 1e-9 || Math.abs(dLon - 360) < 1e-9);
}));

// destination 走出的角距必须等于指定角距
ok('destination 角距准确', [0, 15, 45, 90].every(function (d) {
  var a = { lat: 10, lon: 20 };
  return approx(G.angular(a, G.destination(a, 37, d)) * 180 / Math.PI, d, 1e-9);
}));

// bearing + destination 组合必须能复原终点（D5 弹道溯源依赖这条）
var bA = { lat: 10, lon: 20 }, bB = { lat: 50, lon: -30 };
var bC = G.destination(bA, G.bearing(bA, bB), G.angular(bA, bB) * 180 / Math.PI);
ok('bearing+destination 复原终点', approx(bC.lat, bB.lat, 1e-9) && approx(bC.lon, bB.lon, 1e-9));

// 质心：单点应等于自身；完全对跖的两点应退化为 (0,0) 而非 NaN
var cOne = G.centroid([{ lat: 33, lon: -77 }]);
ok('centroid 单点 = 自身', approx(cOne.lat, 33, 1e-9) && approx(cOne.lon, -77, 1e-9));
var cOpp = G.centroid([{ lat: 0, lon: 0 }, { lat: 0, lon: 180 }]);
ok('centroid 对跖点退化而非 NaN', cOpp.lat === 0 && cOpp.lon === 0, JSON.stringify(cOpp));

/* ───────────────────────── 数据合理性（D1 复核后补） ───────────────────────── */

// 任意两城不得重合/过近：重合会让光点重叠、点击无法区分、核打击归属歧义
var minPairKm = Infinity, minPairWho = '';
for (var ci = 0; ci < DC.CITIES.length; ci++) {
  for (var cj = ci + 1; cj < DC.CITIES.length; cj++) {
    var dd = G.distKm(DC.CITIES[ci], DC.CITIES[cj]);
    if (dd < minPairKm) { minPairKm = dd; minPairWho = DC.CITIES[ci].name + '↔' + DC.CITIES[cj].name; }
  }
}
ok('任意两城间距 > 400 km', minPairKm > 400, '最近 ' + minPairKm.toFixed(0) + ' km (' + minPairWho + ')');

// 每城同阵营邻居不得比异阵营邻居远太多（避免城市孤悬在别家腹地）
var stray = [];
DC.CITIES.forEach(function (c) {
  var own = Infinity, other = Infinity, otherF = '';
  DC.CITIES.forEach(function (o) {
    if (o.id === c.id) return;
    var d = G.distKm(c, o);
    if (o.faction === c.faction) { if (d < own) own = d; }
    else if (d < other) { other = d; otherF = o.faction; }
  });
  if (own > other * 3) stray.push(c.name + '/' + otherF);
});
ok('无城市孤悬在别家腹地', stray.length === 0, stray.join(', '));

// 事件卡文本：不得混入英文单词、不得有首尾空格（均由 D1 复核发现的缺陷反推）
var txtBad = [];
DC.EVENTS.forEach(function (e) {
  [['title', e.title], ['desc', e.desc]].forEach(function (p) {
    if (/[A-Za-z]{2,}/.test(p[1])) txtBad.push(e.id + '.' + p[0]);
  });
  e.options.forEach(function (o, oi) {
    if (/[A-Za-z]{2,}/.test(o.label)) txtBad.push(e.id + '.opt' + oi + ' 英文');
    if (o.label !== o.label.trim()) txtBad.push(e.id + '.opt' + oi + ' 空格');
  });
});
ok('事件卡文本无英文残留 / 空格异常', txtBad.length === 0, txtBad.join(', '));

// 每卡须有博弈区分度：最鸽与最鹰的 crisis 差 ≥ 8，否则 AI 性格无从体现
var flat = DC.EVENTS.filter(function (e) {
  var cs = e.options.map(function (o) { return o.crisis; });
  return (Math.max.apply(null, cs) - Math.min.apply(null, cs)) < 8;
}).map(function (e) { return e.id; });
ok('每张事件卡鸽鹰幅度 ≥ 8', flat.length === 0, flat.join(', '));

// 节奏约束：全鹰须能打起来、全鸽须能拖住（否则博弈失去张力）
var crisisLo = 0, crisisHi = 0;
DC.EVENTS.forEach(function (e) {
  var cs = e.options.map(function (o) { return o.crisis; });
  crisisLo += Math.min.apply(null, cs);
  crisisHi += Math.max.apply(null, cs);
});
var nEv = DC.EVENTS.length, drift = DC.CONFIG.crisisDrift + 0;
function roundsToWar(avgChoice) {
  var c = DC.CONFIG.initialCrisis, r = 0;
  while (c < 80 && r < 40) { c += drift + avgChoice; r++; }
  return r;
}
ok('六方全鹰可在 8 回合内进入 DEFCON 1', roundsToWar(crisisHi / nEv) <= 8, roundsToWar(crisisHi / nEv) + ' 回合');
ok('六方全鸽可拖住（>20 回合）', roundsToWar(crisisLo / nEv) > 20, roundsToWar(crisisLo / nEv) + ' 回合');

/* ───────────────────────── 几何边界 ───────────────────────── */

// 经纬度归一化：极区叠加误差后不得越界（越界会让 ll2v 算出镜面翻转的位置）
ok('wrapLat 折叠越过北极的纬度', approx(G.wrapLat(95), 85, 1e-9), 'got ' + G.wrapLat(95));
ok('wrapLat 折叠越过南极的纬度', approx(G.wrapLat(-95), -85, 1e-9), 'got ' + G.wrapLat(-95));
ok('wrapLon 环绕经度', approx(G.wrapLon(190), -170, 1e-9) && approx(G.wrapLon(-190), 170, 1e-9));
ok('wrapLat/wrapLon 幂等', G.wrapLat(G.wrapLat(123)) === G.wrapLat(123) && G.wrapLon(G.wrapLon(400)) === G.wrapLon(400));

// offsetLL 在极点附近大 sigma 下输出仍合法
var poleOff = G.offsetLL({ lat: 88, lon: 30 }, 12, 0.05, 0.4);
ok('offsetLL 极区输出纬度合法', poleOff.lat >= -90 && poleOff.lat <= 90, 'lat=' + poleOff.lat);
ok('offsetLL 极区输出经度合法', poleOff.lon >= -180 && poleOff.lon <= 180, 'lon=' + poleOff.lon);

/* ───────────────────────── D2：模拟层断言 ───────────────────────── */

// 建局与开局布阵（DESIGN §3：六阵营合计 78 个单位，开局固定）
var st0 = S.create({ seed: 42 });
ok('单位总数 = 78', st0.units.length === 78, 'got ' + st0.units.length);
ok('城市 60 / 阵营 6', st0.cities.length === 60 && st0.factions.length === 6);
ok('每阵营 6 井 / 4 SAM / 3 雷达', DC.FACTIONS.every(function (f) {
  return S.unitsOf(st0, f.code, 'silo').length === 6 &&
         S.unitsOf(st0, f.code, 'sam').length === 4 &&
         S.unitsOf(st0, f.code, 'radar').length === 3;
}));
ok('每井 3 枚 ICBM', st0.units.filter(function (u) { return u.type === 'silo'; })
  .every(function (u) { return u.missiles === CFG.missilesPerSilo; }));
ok('每阵营 18 枚可发', DC.FACTIONS.every(function (f) { return S.totalMissiles(st0, f.code) === 18; }));
ok('单位经纬度合法', st0.units.every(function (u) {
  return u.lat >= -90 && u.lat <= 90 && u.lon >= -180 && u.lon <= 180;
}));
// 布阵不得重合（重合会让渲染叠在一起、溯源误判）
var minU = Infinity, minUWho = '';
for (var ui = 0; ui < st0.units.length; ui++) {
  for (var uj = ui + 1; uj < st0.units.length; uj++) {
    var du = G.distKm(st0.units[ui], st0.units[uj]);
    if (du < minU) { minU = du; minUWho = st0.units[ui].id + '↔' + st0.units[uj].id; }
  }
}
ok('单位间距 > 100 km', minU > 100, '最近 ' + minU.toFixed(0) + ' km (' + minUWho + ')');

// 确定性：同种子必须逐位一致，否则无头断言失去意义
var rngA = S.makeRng(7), rngB = S.makeRng(7);
ok('RNG 同种子可复现', rngA() === rngB() && rngA() === rngB() && rngA() === rngB());
var rngC = S.makeRng(7);
var inRange = true;
for (var ri = 0; ri < 1000; ri++) { var rv = rngC(); if (!(rv >= 0 && rv < 1)) inRange = false; }
ok('RNG 输出落在 [0,1)', inRange);

function playOut(seed) {
  var st = S.create({ seed: seed, autoPlayer: true });
  var guard = 0;
  while (st.phase !== 'over' && guard < 30000) { S.tick(st, S.TICK); guard++; }
  return st;
}
var runA = playOut(11), runB = playOut(11);
var scoresA = JSON.stringify(S.ranking(runA).map(function (r) { return r.score.toFixed(9); }));
var scoresB = JSON.stringify(S.ranking(runB).map(function (r) { return r.score.toFixed(9); }));
ok('同种子整局完全一致（回合/危机值/计分）',
  runA.round === runB.round && runA.crisis === runB.crisis && scoresA === scoresB,
  runA.round + ' vs ' + runB.round);

// 阶段机顺序
var seq = [], lastPhase = null;
var stp = S.create({ seed: 5, autoPlayer: true });
var pg = 0;
while (pg < 30000) {
  if (stp.phase !== lastPhase) { seq.push(stp.phase); lastPhase = stp.phase; }
  if (stp.phase === 'over') break;      // 先记录再退出，否则末尾的 over 永远记不到
  S.tick(stp, S.TICK); pg++;
}
ok('阶段顺序 briefing→crisis→war→over', seq.join('>') === 'briefing>crisis>war>over', seq.join('>'));

// DEFCON 映射（DESIGN §4.1）
ok('DEFCON 映射 5/4/3/2/1',
  S.defconOf(10) === 5 && S.defconOf(25) === 4 && S.defconOf(45) === 3 &&
  S.defconOf(65) === 2 && S.defconOf(85) === 1);

// 计分公式（DESIGN §6.2）
ok('得分 = 造成伤亡 − 己方伤亡', S.ranking(runA).every(function (r) {
  return Math.abs(r.score - (r.killed - r.casualties)) < 1e-9;
}));

// 发射与命中结算：隔离出一个只剩一枚弹的局面，避免其他 AI 干扰断言
var stw = S.create({ seed: 3, autoPlayer: true });
S.advance(stw, CFG.briefingSeconds);
stw.crisis = 95;                                  // 推过阈值，下回合必进 war
S.advance(stw, CFG.roundSeconds + 0.2);
ok('危机值过阈值即进入 war', stw.phase === 'war', 'phase=' + stw.phase);

if (stw.phase === 'war') {
  DC.FACTIONS.forEach(function (f) {
    if (f.code === 'DELTA') return;
    S.unitsOf(stw, f.code, 'silo').forEach(function (u) { u.missiles = 0; });
  });
  S.unitsOf(stw, 'DELTA', 'silo').forEach(function (u, i) { u.missiles = (i === 0 ? 1 : 0); });
  var siloD = S.unitsOf(stw, 'DELTA', 'silo')[0];
  var tgt = S.enemyCities(stw, 'DELTA')[0];
  var pop0 = tgt.pop;
  S.unitsOf(stw, tgt.faction, 'sam').forEach(function (u) { u.ammo = 0; u.maxAmmo = 0; });  // 排除拦截
  var m1 = S.launch(stw, 'DELTA', siloD.id, tgt.id);
  ok('发射后井存量 −1', siloD.missiles === 0 && m1 != null);
  ok('飞行时间落在 15–40 s（§3.1）', m1.dur >= CFG.missileFlightMin - 1e-9 && m1.dur <= CFG.missileFlightMax + 1e-9,
    'dur=' + m1.dur.toFixed(1));
  S.advance(stw, m1.dur + 0.5);
  ok('命中后城市人口按 killRate 扣减', Math.abs(tgt.pop - pop0 * (1 - CFG.killRate)) < 1e-9,
    pop0 + ' → ' + tgt.pop);
  ok('伤害双向计入统计', stw.stats.DELTA.killed > 0 && stw.stats[tgt.faction].casualties > 0);
}

// 节奏回归：小样本确认仍落在 DESIGN §6.1 的 8–14 回合（大样本见 tests/balance.js）
var rnds = [];
for (var si = 1; si <= 10; si++) rnds.push(playOut(si).round);
ok('10 局达 DEFCON 1 的回合数落在 8–14', rnds.every(function (r) { return r >= 8 && r <= 14; }), rnds.join(','));

// AI 性格确实生效：同一张卡，极端鹰派选最激化项、极端鸽派选最缓和项
var stCard = S.create({ seed: 8 });
stCard.card = DC.EVENTS[1];                       // E02 雷达误报：选项 30 / -6 / 8
var hawkPick = [], dovePick = [];
for (var k = 0; k < 200; k++) {
  hawkPick.push(AI.chooseEvent(stCard, 'DELTA'));   // hawkishness +0.90
  dovePick.push(AI.chooseEvent(stCard, 'BRAVO'));   // hawkishness -0.60
}
function mode(arr) {
  var cnt = {}, best = null, bn = -1;
  arr.forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; if (cnt[v] > bn) { bn = cnt[v]; best = v; } });
  return { v: best, n: bn / arr.length };
}
var hm = mode(hawkPick), dm = mode(dovePick);
ok('鹰派倾向最激化选项（crisis 最大）', hm.v === 0 && hm.n > 0.6, '选 ' + hm.v + ' 占 ' + (hm.n * 100).toFixed(0) + '%');
ok('鸽派倾向最缓和选项（crisis 最小）', dm.v === 1 && dm.n > 0.6, '选 ' + dm.v + ' 占 ' + (dm.n * 100).toFixed(0) + '%');
ok('副作用权重换算正确（敌方揭示雷达对己方为正）',
  AI.effectWeight({ type: 'reveal_radar', target: 'enemy' }) > 0 &&
  AI.effectWeight({ type: 'expose_silo', target: 'self' }) < 0);

/* ───────────────────────── D4：玩家指令 + 事件卡效果 ───────────────────────── */

// 命令层放在 sim 而非 ui/game，就是为了让这些分支可以脱离 DOM 直接断言。
// ⚠ advance(N) 是 N/0.1 次浮点累加，跑完 t 停在 9.9999… 而非 10，阶段切换差一步不触发。
// 所有「推进到某阶段」的调用一律多给 0.2s，别再踩这个坑。

// —— nearestSilo
var stn = S.create({ seed: 21, autoPlayer: true });
var tCity = S.enemyCities(stn, 'ALFA')[0];
var sN = S.nearestSilo(stn, 'ALFA', tCity);
ok('nearestSilo 返回己方有弹的井', !!sN && sN.faction === 'ALFA' && sN.missiles > 0);
var minD = Math.min.apply(null, S.unitsOf(stn, 'ALFA', 'silo')
  .filter(function (u) { return u.missiles > 0; })
  .map(function (u) { return G.distKm(u, tCity); }));
ok('nearestSilo 确实是最近的可用井', sN && approx(G.distKm(sN, tCity), minD, 1e-6));
S.unitsOf(stn, 'ALFA', 'silo').forEach(function (u) { u.missiles = 0; });
ok('弹尽时 nearestSilo 返回 null', S.nearestSilo(stn, 'ALFA', tCity) === null);

// —— playerFire 的拒绝路径与成功路径
var stf = S.create({ seed: 33, autoPlayer: false });
S.advance(stf, CFG.briefingSeconds + 0.2);
ok('非战争阶段 playerFire 被拒', S.playerFire(stf, stf.cities[0].id) === null);
stf.crisis = 95;
S.advance(stf, CFG.roundSeconds + 0.2);
ok('推过阈值后进入 war（玩家席位未托管）', stf.phase === 'war', 'phase=' + stf.phase);
ok('不能打自家城市', S.playerFire(stf, S.citiesOf(stf, 'ALFA')[0].id) === null);
var ec0 = S.enemyCities(stf, 'ALFA')[0];
var ammo0 = S.totalMissiles(stf, 'ALFA');
var mPlay = S.playerFire(stf, ec0.id);
ok('玩家点击敌方城市可发射', !!mPlay && mPlay.faction === 'ALFA' && mPlay.targetCityId === ec0.id);
ok('发射后己方弹头 −1', S.totalMissiles(stf, 'ALFA') === ammo0 - 1);

// —— S.choose 的边界
var stch = S.create({ seed: 44, autoPlayer: false });
S.advance(stch, CFG.briefingSeconds + 0.2);
ok('S.choose 在危机阶段接受合法索引', S.choose(stch, 'ALFA', 0) === true && stch.choices.ALFA === 0);
ok('S.choose 拒绝越界索引', S.choose(stch, 'ALFA', 99) === false);
ok('S.choose 拒绝非危机阶段', S.choose(S.create({ seed: 9 }), 'ALFA', 0) === false);

// —— 玩家超时兜底：按最保守（crisis 最小）项计入
var stto = S.create({ seed: 91, autoPlayer: false });
S.advance(stto, CFG.briefingSeconds + 0.2);
ok('玩家席位未被 AI 代选', stto.choices[stto.playerFaction] === undefined);
var cd0 = stto.card;
var minC = Math.min.apply(null, cd0.options.map(function (o) { return o.crisis; }));
var maxC = Math.max.apply(null, cd0.options.map(function (o) { return o.crisis; }));
stto.factions.forEach(function (f) {
  if (f.isPlayer) return;
  stto.choices[f.code] = cd0.options.findIndex(function (o) { return o.crisis === maxC; });
});
delete stto.choices[stto.playerFaction];
var cBefore = stto.crisis;
S.advance(stto, CFG.roundSeconds + 0.2);
var expectC = Math.max(0, Math.min(100, cBefore + CFG.crisisDrift + (5 * maxC + minC) / 6));
ok('玩家超时按最保守项兜底', approx(stto.crisis, expectC, 1e-6),
  stto.crisis.toFixed(3) + ' vs ' + expectC.toFixed(3));

/* —— 事件卡附加效果（D2 曾漏实现，D4 补齐）
 * 手法：把 card 与 choices 摆成指定局面，再 tick 过回合线触发 resolveRound → applyEffects。 */
function optIdxOf(cardId, type) {
  var c = DC.EVENTS_BY_ID[cardId];
  for (var i = 0; i < c.options.length; i++) {
    if (c.options[i].effect && c.options[i].effect.type === type) return i;
  }
  return -1;
}
function resolveWith(cardId, type, who) {
  var s = S.create({ seed: 1234, autoPlayer: true });
  S.advance(s, CFG.briefingSeconds + 0.2);
  s.crisis = 0;                                   // 压低危机值，避免结算时提前开战
  s.card = DC.EVENTS_BY_ID[cardId];
  s.choices = {};
  s.choices[who] = optIdxOf(cardId, type);
  s.t = CFG.roundSeconds;
  S.tick(s, 0.1);                                 // 触发一次 resolveRound
  return s;
}

var sRev = resolveWith('E01', 'reveal_radar', 'ALFA');
ok('reveal_radar 暴露全部敌方雷达',
  S.unitsOf(sRev, 'BRAVO', 'radar').length > 0 &&
  S.unitsOf(sRev, 'BRAVO', 'radar').every(function (u) { return u.exposed === true; }));
ok('reveal_radar 不暴露自家雷达',
  S.unitsOf(sRev, 'ALFA', 'radar').every(function (u) { return !u.exposed; }));

var sExp = resolveWith('E08', 'expose_silo', 'ALFA');
ok('expose_silo 暴露己方全部发射井',
  S.unitsOf(sExp, 'ALFA', 'silo').every(function (u) { return u.exposed === true; }));
ok('expose_silo 不影响他方',
  S.unitsOf(sExp, 'BRAVO', 'silo').every(function (u) { return !u.exposed; }));

var sDown = resolveWith('E04', 'radar_down', 'ALFA');
ok('radar_down 置入失效计数（2 回合 − 已过 1 回合）', sDown.radarDown.ALFA === 1,
  'got ' + sDown.radarDown.ALFA);

var sLoss = resolveWith('E13', 'pop_loss', 'ALFA');
var popAfter = S.citiesOf(sLoss, 'ALFA').reduce(function (a, c) { return a + c.pop; }, 0);
ok('pop_loss 扣减己方人口 2M', approx(popAfter, 88 - 2, 1e-6), 'got ' + popAfter);
ok('pop_loss 计入己方伤亡（§6.2 口径）', approx(sLoss.stats.ALFA.casualties, 2, 1e-9),
  'got ' + sLoss.stats.ALFA.casualties);

var sDef = resolveWith('E14', 'city_defense', 'ALFA');
var defended = S.citiesOf(sDef, 'ALFA').filter(function (c) { return c.defCharges > 0; });
ok('city_defense 给人口最多的城市挂 1 层防御', defended.length === 1 && defended[0].defCharges === 1);
ok('city_defense 选中的确实是最大城市',
  defended.length === 1 &&
  defended[0].pop0 === Math.max.apply(null, S.citiesOf(sDef, 'ALFA').map(function (c) { return c.pop0; })));

// 防御层在命中时生效：杀伤压到 killRate × cityDefenseFactor，且一次性消耗
var stdf = S.create({ seed: 41, autoPlayer: true });
S.advance(stdf, CFG.briefingSeconds + 0.2);
stdf.crisis = 95;
S.advance(stdf, CFG.roundSeconds + 0.2);
if (stdf.phase === 'war') {
  DC.FACTIONS.forEach(function (f) {
    if (f.code !== 'DELTA') S.unitsOf(stdf, f.code, 'silo').forEach(function (u) { u.missiles = 0; });
  });
  S.unitsOf(stdf, 'DELTA', 'silo').forEach(function (u, i) { u.missiles = (i === 0 ? 1 : 0); });
  var tgtF = S.enemyCities(stdf, 'DELTA')[0];
  tgtF.defCharges = 1;
  S.unitsOf(stdf, tgtF.faction, 'sam').forEach(function (u) { u.ammo = 0; u.maxAmmo = 0; });
  var pF0 = tgtF.pop;
  var mF = S.launch(stdf, 'DELTA', S.unitsOf(stdf, 'DELTA', 'silo')[0].id, tgtF.id);
  S.advance(stdf, mF.dur + 0.5);
  ok('防御层把杀伤压到 killRate × cityDefenseFactor',
    approx(tgtF.pop, pF0 * (1 - CFG.killRate * CFG.cityDefenseFactor), 1e-6),
    pF0 + ' → ' + tgtF.pop);
  ok('防御层一次性消耗', tgtF.defCharges === 0);
}

/* ───────────────────────── 红线扫描 ───────────────────────── */
function scanForbidden(file) {
  var txt = fs.readFileSync(file, 'utf8');
  var banned = [
    { re: /\bfetch\s*\(/, msg: 'fetch(' },
    { re: /\bWorker\b/, msg: 'Worker' },
    { re: /\beval\s*\(/, msg: 'eval(' },
    { re: /new\s+Function\b/, msg: 'new Function' },
    { re: /\bimport\s+/, msg: 'import 语句' },
    { re: /\bexport\s+(default|function|var|let|const|class|\{)/, msg: 'export 语句' },
    { re: /type\s*=\s*["']module["']/, msg: 'type="module"' }
  ];
  var hits = banned.filter(function (b) { return b.re.test(txt); }).map(function (b) { return b.msg; });
  return hits;
}
['data.js', 'geo.js', 'sim.js', 'ai.js', 'ui.js', 'game.js'].forEach(function (f) {
  var hits = scanForbidden(path.join(__dirname, '..', 'src', f));
  ok('红线扫描 ' + f + ' 无禁用的 ' + (hits.join('/') || '—'), hits.length === 0, hits.join(', '));
});

/* ───────────────────────── 入口页红线扫描 ───────────────────────── */
var HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var htmlBanned = [
  { re: /on(click|load|error|mouse\w+)\s*=/i, msg: '行内事件属性' },
  { re: /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/i, msg: '内联 <script>' },
  { re: /<base\b/i, msg: '<base>' },
  { re: /<iframe\b/i, msg: '<iframe>' },
  { re: /http-equiv\s*=\s*["']Content-Security-Policy/i, msg: 'CSP meta' },
  { re: /type\s*=\s*["']module["']/i, msg: 'type="module"' },
  { re: /https?:\/\//i, msg: '外部 URL' }
];
var htmlHits = htmlBanned.filter(function (b) { return b.re.test(HTML); }).map(function (b) { return b.msg; });
ok('index.html 红线扫描无违规（' + (htmlHits.join('/') || '—') + '）', htmlHits.length === 0, htmlHits.join(', '));

// 加载顺序即依赖顺序：three + 内联贴图 → data → geo → sim → ai → render → ui → game
var order = ['assets/three.min.js', 'assets/earth-tex.js', 'src/data.js', 'src/geo.js', 'src/sim.js',
             'src/ai.js', 'src/render.js', 'src/ui.js', 'src/game.js'];
var idxs = order.map(function (s) { return HTML.indexOf('src="' + s + '"'); });
ok('9 个脚本全部以相对路径引入', idxs.every(function (i) { return i > 0; }),
  order.filter(function (s, i) { return idxs[i] <= 0; }).join(', '));
ok('脚本加载顺序 = 依赖顺序', idxs.every(function (v, i) { return i === 0 || v > idxs[i - 1]; }),
  idxs.join(','));
ok('引入的脚本文件都真实存在', order.every(function (s) {
  return fs.existsSync(path.join(__dirname, '..', s));
}));

/* ───────────────────────── 汇总 ───────────────────────── */
console.log('\n==== DEFCON 无头校验（D1 数据 + D2 模拟）====');
console.log('阵营人口总量(百万): ' + JSON.stringify(sums));
console.log('10 局达 DEFCON 1 回合数: ' + rnds.join(',') + '（设计区间 8–14）');
console.log('通过 ' + pass + ' / 失败 ' + fail);
if (fail > 0) {
  console.log('\n失败项：');
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}
