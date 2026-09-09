/*
 * defcon — tests/balance.js
 * 大样本节奏与平衡审计（Node 运行，不进提交包）。
 *
 * 与另两个脚本的分工：
 *   headless.js  —— 管「对不对」：功能断言，跑得快，10 局小样本防退化
 *   balance.js   —— 管「好不好玩」：60 局大样本统计节奏与胜负分布，调参依据
 *   audit-d1.js  —— 管「数据合不合理」：D1 数据层可读性报告
 *
 * 调参后必跑本脚本：改了事件卡 crisis、hawkishness、aiDistWeight/aiTargetTopK、
 * 拦截参数、飞行时间任一项，都可能把节奏推出 8–14 回合或让某阵营一家独大。
 *
 * 运行：node tests/balance.js [局数]
 */
'use strict';

var path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'src', 'data.js'));
require(path.join(__dirname, '..', 'src', 'geo.js'));
require(path.join(__dirname, '..', 'src', 'landmask.js'));   // 布阵走真实海陆（与线上一致）
require(path.join(__dirname, '..', 'src', 'sim.js'));
require(path.join(__dirname, '..', 'src', 'ai.js'));

var DC = global.DC, S = DC.sim, CFG = DC.CONFIG;
var N = parseInt(process.argv[2], 10) || 60;

function stat(a) {
  a = a.slice().sort(function (x, y) { return x - y; });
  return {
    min: a[0], max: a[a.length - 1],
    med: a[Math.floor(a.length / 2)],
    avg: a.reduce(function (x, y) { return x + y; }, 0) / a.length
  };
}
function pad(v, n) { return String(v).padStart(n); }

var rounds = [], warSecs = [], launched = [], intercepted = [], stuck = 0;
var wins = {}, popLeft = {}, cas = {}, killed = {}, citiesLost = {};
DC.FACTIONS.forEach(function (f) {
  wins[f.code] = 0; popLeft[f.code] = 0; cas[f.code] = 0; killed[f.code] = 0; citiesLost[f.code] = 0;
});

for (var s = 1; s <= N; s++) {
  var st = S.create({ seed: s, autoPlayer: true });
  var guard = 0;
  while (st.phase !== 'over' && guard < 30000) { S.tick(st, S.TICK); guard++; }
  if (st.phase !== 'over') { stuck++; continue; }

  rounds.push(st.round);
  warSecs.push(st.warEndedEarly ? st.t : CFG.warSeconds);
  var tl = 0, ti = 0;
  Object.keys(st.stats).forEach(function (k) { tl += st.stats[k].launched; ti += st.stats[k].intercepts; });
  launched.push(tl); intercepted.push(ti);

  var rk = S.ranking(st);
  wins[rk[0].code]++;
  rk.forEach(function (r) {
    popLeft[r.code] += r.popLeft;
    cas[r.code] += r.casualties;
    killed[r.code] += r.killed;
    // 各阵营城市数不同（FOXTROT 12 城），不能写死 10 —— 否则它的失城数恒少 2
    citiesLost[r.code] += (DC.CITIES_BY_FACTION[r.code].length - r.citiesAlive);
  });
}

var done = N - stuck;
var rs = stat(rounds), ls = stat(launched), is = stat(intercepted);

console.log('\n==== DEFCON 节奏与平衡审计（' + done + ' 局）====\n');

console.log('【节奏】达 DEFCON 1 的回合数（DESIGN §6.1：中位 8–14，允许极少数 7 回合快速局）');
console.log('  min ' + rs.min + ' / 中位 ' + rs.med + ' / max ' + rs.max + ' / 均值 ' + rs.avg.toFixed(1));
var outside = rounds.filter(function (r) { return r < 7 || r > 14; }).length;
console.log('  落在区间外: ' + outside + '/' + done + '   ' + (outside === 0 ? '✓' : '⚠ 需调 crisis 数值或 hawkishness'));
console.log('  卡死未终局: ' + stuck + (stuck ? '  ✗' : '  ✓'));

console.log('\n【核战】每局总发射 ' + ls.avg.toFixed(0) + ' 枚 / 总拦截 ' + is.avg.toFixed(0) + ' 枚');
console.log('  拦截率 ' + (is.avg / ls.avg * 100).toFixed(0) + '%  （CONFIG.samInterceptProb = ' +
  (CFG.samInterceptProb * 100).toFixed(0) + '%，实际偏低因部分导弹未进入 SAM 覆盖）');

// 主列是「平均剩余人口」—— §11.8 起它就是 ranking 的排序键。
// 旧的「平均得分 = 造成 − 伤亡」不再是排序键，继续摆在主列会把调参引向错误方向。
console.log('\n【平衡】阵营    胜率    平均剩余人口  平均伤亡    平均造成    平均失城');
DC.FACTIONS.forEach(function (f) {
  var c = f.code;
  console.log('        ' + c.padEnd(8) +
    pad((wins[c] / done * 100).toFixed(0) + '%', 6) + '   ' +
    pad((popLeft[c] / done).toFixed(1) + 'M', 11) + '   ' +
    pad((cas[c] / done).toFixed(1) + 'M', 9) + '   ' +
    pad((killed[c] / done).toFixed(1) + 'M', 9) + '   ' +
    pad((citiesLost[c] / done).toFixed(1), 8));
});

var wv = DC.FACTIONS.map(function (f) { return wins[f.code] / done; });
var cv = DC.FACTIONS.map(function (f) { return cas[f.code] / done; });
var maxW = Math.max.apply(null, wv), minW = Math.min.apply(null, wv);
var casRatio = Math.max.apply(null, cv) / Math.max(1e-9, Math.min.apply(null, cv));

console.log('\n【判定】理想胜率 ' + (100 / 6).toFixed(0) + '%');
console.log('  胜率区间 ' + (minW * 100).toFixed(0) + '% ~ ' + (maxW * 100).toFixed(0) + '%   ' +
  (maxW <= 0.40 ? '✓ 无阵营独大' : '⚠ ' + DC.FACTIONS[wv.indexOf(maxW)].code + ' 过强，需调 aiDistWeight/aiTargetTopK'));
console.log('  伤亡极差 ' + Math.min.apply(null, cv).toFixed(1) + ' ~ ' + Math.max.apply(null, cv).toFixed(1) +
  'M（' + casRatio.toFixed(1) + 'x）   ' + (casRatio <= 4 ? '✓ 地缘未压倒决策' : '⚠ 地缘决定胜负'));

if (outside > 0 || stuck > 0 || maxW > 0.40 || casRatio > 4) {
  console.log('\n结论：未达标，需调参后重跑。');
  process.exit(1);
} else {
  console.log('\n结论：节奏与平衡均在可接受区间。');
}
