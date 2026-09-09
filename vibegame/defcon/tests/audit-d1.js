/*
 * D1 数据合理性审计报告（只读，不改动任何源文件）
 * 与 headless.js 的分工：headless.js 管「对不对」（断言），本脚本管「合不合理」（可读性报告 + 调参依据）。
 * 运行：node tests/_audit_d1.js
 */
'use strict';
var path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'src', 'data.js'));
require(path.join(__dirname, '..', 'src', 'geo.js'));
var DC = global.DC, G = DC.geo;

/* ── 1. 城市名与 DESIGN.md §2.2 逐字比对 ──
 * ⚠ 2026-09-08 全表替换：城市坐标改用真实城市、名称改为别称后，旧名全部作废。
 *   这里比的是新表；real 字段（真实城市原型）单独打印，便于人工核对坐标有没有录错。 */
var DESIGN_CITIES = {
  ALFA: '白京 北港 极港 使城 岭城 新原 湖京 桦岛 雪湾 冻城'.split(' '),
  BRAVO: '雾湾 金岬 雨港 枫湾 风城 油港 长港 湖城 谷京 高城'.split(' '),
  CHARLIE: '雾京 光城 铁京 丘城 台京 平城 峡京 沙京 山京 石港'.split(' '),
  DELTA: '燕京 江口 穗港 锦城 江城 秦城 沈城 东湾 汉阳 原京'.split(' '),
  ECHO: '糖港 松京 旱城 岭京 泻港 河京 高原 椰港 狮港 棕城'.split(' '),
  FOXTROT: '帆港 金湾 晴港 孤港 酒湾 北门 云港 岬城 珠屿 珊屿 塔港 震城'.split(' ')
};
console.log('=== 1. 城市名 vs DESIGN §2.2 ===');
var nmIssues = 0;
Object.keys(DESIGN_CITIES).forEach(function (f) {
  var want = DESIGN_CITIES[f].slice();
  var got = DC.CITIES_BY_FACTION[f].map(function (c) { return c.name; });
  var missing = want.filter(function (n) { return got.indexOf(n) < 0; });
  var extra = got.filter(function (n) { return want.indexOf(n) < 0; });
  if (missing.length || extra.length) {
    nmIssues++;
    console.log('  ✗ ' + f + '  缺:' + (missing.join(',') || '—') + '  多:' + (extra.join(',') || '—'));
  }
});
console.log(nmIssues === 0 ? ('  ✓ ' + DC.CITIES.length + ' 城名称逐字一致') : '  ' + nmIssues + ' 个阵营有出入');
// 真实城市原型对照：坐标一旦录错，肉眼很难从别称看出来，打印出来逐条核
DC.FACTIONS.forEach(function (f) {
  console.log('    ' + f.code.padEnd(8) + DC.CITIES_BY_FACTION[f.code].map(function (c) {
    return c.name + '←' + (c.real || '?');
  }).join(' '));
});

/* ── 2. 阵营主色 vs DESIGN §2.1 ── */
var DESIGN_COLOR = { ALFA: '#378ADD', BRAVO: '#639922', CHARLIE: '#1D9E75', DELTA: '#E24B4A', ECHO: '#EF9F27', FOXTROT: '#7F77DD' };
console.log('\n=== 2. 阵营主色 vs DESIGN §2.1 ===');
DC.FACTIONS.forEach(function (f) {
  var ok = (f.color.toUpperCase() === DESIGN_COLOR[f.code].toUpperCase());
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + f.code + ' ' + f.color + ' 期望 ' + DESIGN_COLOR[f.code]);
});

/* ── 3. 城市间距：重合 / 过近 ── */
console.log('\n=== 3. 城市间距（球面大圆，km） ===');
var pairs = [];
for (var i = 0; i < DC.CITIES.length; i++) {
  for (var j = i + 1; j < DC.CITIES.length; j++) {
    pairs.push({ a: DC.CITIES[i], b: DC.CITIES[j], d: G.distKm(DC.CITIES[i], DC.CITIES[j]) });
  }
}
pairs.sort(function (p, q) { return p.d - q.d; });
var dup = pairs.filter(function (p) { return p.d < 1; });
// 阈值 400 → 150 km：真实城市必然出现同城圈（西雅图↔温哥华 195 km），150 km 仍是「录入错误」的量级
var NEAR_KM = 150;
var near = pairs.filter(function (p) { return p.d >= 1 && p.d < NEAR_KM; });
if (dup.length) {
  console.log('  ✗ 坐标重合（<1km）：');
  dup.forEach(function (p) { console.log('      ' + p.a.id + ' ' + p.a.name + ' (' + p.a.lat + ',' + p.a.lon + ')  ==  ' + p.b.id + ' ' + p.b.name + ' (' + p.b.lat + ',' + p.b.lon + ')'); });
} else console.log('  ✓ 无完全重合');
if (near.length) {
  console.log('  ⚠ 过近（<' + NEAR_KM + 'km）共 ' + near.length + ' 对，最近 8 对：');
  near.slice(0, 8).forEach(function (p) {
    console.log('      ' + p.d.toFixed(0).padStart(5) + ' km  ' + p.a.faction + '/' + p.a.name + '  ↔  ' + p.b.faction + '/' + p.b.name);
  });
} else console.log('  ✓ 无 <' + NEAR_KM + 'km 的近距离对');
// 同阵营内最小间距
var sameMin = pairs.filter(function (p) { return p.a.faction === p.b.faction; })[0];
console.log('  同阵营最小间距: ' + sameMin.d.toFixed(0) + ' km (' + sameMin.a.name + '↔' + sameMin.b.name + ')');
console.log('  全局最小间距: ' + pairs[0].d.toFixed(0) + ' km   中位: ' + pairs[Math.floor(pairs.length / 2)].d.toFixed(0) + ' km');

/* ── 4. 阵营地理区块一致性（看每城最近的同阵营邻居 vs 最近的异阵营邻居） ── */
console.log('\n=== 4. 地理区块：落在别家腹地的城市 ===');
var bad = 0;
DC.CITIES.forEach(function (c) {
  var own = Infinity, other = Infinity, otherF = null;
  DC.CITIES.forEach(function (o) {
    if (o.id === c.id) return;
    var d = G.distKm(c, o);
    if (o.faction === c.faction) { if (d < own) own = d; }
    else if (d < other) { other = d; otherF = o.faction; }
  });
  // 自家最近邻居比别人家最近的还远 3 倍以上 → 说明这座城孤悬在外
  if (own > other * 3) {
    bad++;
    console.log('  ⚠ ' + c.id + ' ' + c.name + ' (' + c.faction + ')  同阵营最近 ' + own.toFixed(0) + ' km, 但离 ' + otherF + ' 仅 ' + other.toFixed(0) + ' km');
  }
});
if (!bad) console.log('  ✓ 各城均成簇，无孤悬');

/* ── 5. 纬度带归属 ── */
console.log('\n=== 5. 纬度带 ===');
DC.FACTIONS.forEach(function (f) {
  var cs = DC.CITIES_BY_FACTION[f.code];
  var lats = cs.map(function (c) { return c.lat; });
  var lons = cs.map(function (c) { return c.lon; });
  console.log('  ' + f.code.padEnd(8) + ' lat ' + Math.min.apply(null, lats) + '~' + Math.max.apply(null, lats) +
    '   lon ' + Math.min.apply(null, lons) + '~' + Math.max.apply(null, lons) + '   人口 ' + cs.reduce(function (s, c) { return s + c.pop; }, 0) + 'M');
});

/* ── 6. 事件卡文本：混入的非中文字符 ── */
console.log('\n=== 6. 事件卡文本异常扫描 ===');
var txtIssues = 0;
DC.EVENTS.forEach(function (e) {
  [['title', e.title], ['desc', e.desc]].forEach(function (p) {
    if (/[A-Za-z]{2,}/.test(p[1])) { txtIssues++; console.log('  ✗ ' + e.id + '.' + p[0] + ' 含英文: ' + p[1]); }
  });
  e.options.forEach(function (o, i) {
    if (/[A-Za-z]{2,}/.test(o.label)) { txtIssues++; console.log('  ✗ ' + e.id + '.options[' + i + '].label 含英文: "' + o.label + '"'); }
    if (o.label !== o.label.trim()) { txtIssues++; console.log('  ✗ ' + e.id + '.options[' + i + '].label 首尾有空格: "' + o.label + '"'); }
  });
});
if (!txtIssues) console.log('  ✓ 无英文残留 / 空格异常');

/* ── 7. 事件卡博弈区分度（每卡 crisis 极差） ── */
console.log('\n=== 7. 事件卡区分度（最鸽 ~ 最鹰） ===');
var lowSum = 0, highSum = 0;
DC.EVENTS.forEach(function (e) {
  // 走 crisisValue：crisis:'MAX' 是字符串，直接塞进 Math.min/max 会算出 NaN
  var cs = e.options.map(DC.crisisValue);
  var lo = Math.min.apply(null, cs), hi = Math.max.apply(null, cs);
  lowSum += lo; highSum += hi;
  var hasMax = e.options.some(function (o) { return DC.isCrisisMax(o); });
  var flag = (hi - lo) < 8 ? '  ⚠ 区分度小' : (hasMax ? '  [含拉满]' : '');
  console.log('  ' + e.id + ' ' + String(lo).padStart(4) + ' ~ ' + String(hi).padStart(3) + '  幅度 ' + String(hi - lo).padStart(3) + '   ' + e.title + flag);
});
var n = DC.EVENTS.length;
console.log('  全鸽均值 ' + (lowSum / n).toFixed(2) + ' / 全鹰均值 ' + (highSum / n).toFixed(2) + ' / 漂移 +' + DC.CONFIG.crisisDrift);

/* ── 8. 危机值节奏推演 ── */
console.log('\n=== 8. 危机值节奏推演（起点 ' + DC.CONFIG.initialCrisis + '，DEFCON1 需 80） ===');
function sim(avgChoice, label) {
  var c = DC.CONFIG.initialCrisis, rounds = 0;
  while (c < 80 && rounds < 40) { c += DC.CONFIG.crisisDrift + avgChoice; rounds++; }
  console.log('  ' + label.padEnd(28) + ' 每回合净 ' + (DC.CONFIG.crisisDrift + avgChoice).toFixed(1).padStart(5) +
    ' → ' + (rounds >= 40 ? '40 回合仍 <80' : rounds + ' 回合达 DEFCON 1'));
}
sim(lowSum / n, '六方全选最鸽');
sim(highSum / n, '六方全选最鹰');
sim(-2, '混合偏鸽 (avg -2)');
sim(0, '混合中性 (avg 0)');
sim(2, '混合偏鹰 (avg +2)');
sim(3.5, '混合鹰派 (avg +3.5)');

/* ── 9. 导弹飞行时间分布（实际城市对） ── */
console.log('\n=== 9. 实际城市对的飞行时间 ===');
var ds = [];
for (var a = 0; a < DC.CITIES.length; a++) {
  for (var b = 0; b < DC.CITIES.length; b++) {
    if (DC.CITIES[a].faction !== DC.CITIES[b].faction) ds.push({ d: G.distKm(DC.CITIES[a], DC.CITIES[b]), p: DC.CITIES[a].name + '→' + DC.CITIES[b].name });
  }
}
ds.sort(function (x, y) { return x.d - y.d; });
var mn = ds[0], mx = ds[ds.length - 1];
console.log('  最近 ' + mn.d.toFixed(0) + ' km  ' + mn.p + '  → ' + G.flightSeconds(mn.d).toFixed(1) + ' s');
console.log('  最远 ' + mx.d.toFixed(0) + ' km  ' + mx.p + '  → ' + G.flightSeconds(mx.d).toFixed(1) + ' s');
var exceed = ds.filter(function (x) { return x.d > DC.CONFIG.missileFullDistKm; });
console.log('  超过满程映射距离(20000km)的敌对城市对: ' + exceed.length + ' / ' + ds.length);

/* ── 10. 溯源误差量级 ── */
console.log('\n=== 10. 溯源误差 σ（σ0=' + DC.CONFIG.traceSigma0 + ', k=' + DC.CONFIG.traceK + '） ===');
[0, 20, 45, 90, 135, 180].forEach(function (deg) {
  var s = DC.CONFIG.traceSigma0 + DC.CONFIG.traceK * deg;
  console.log('  角距 ' + String(deg).padStart(3) + '°  σ = ' + s.toFixed(2) + '°  ≈ ' + (s * 111).toFixed(0) + ' km');
});
