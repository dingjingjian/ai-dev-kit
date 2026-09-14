/* fit-demand.js —— 只读回归工具：用真实航线客流反解需求模型的指数
 *
 * 用法：node tools/fit-demand.js
 *
 * 为什么需要它：
 *   routePotential() 里的每个指数（人口、富裕度、距离）都不该凭直觉定值。
 *   本脚本把 16 条真实航线（含日班次/座位/客座率来源）作为观测样本，
 *   在对数空间做最小二乘，直接解出使模型最贴合现实的指数组合。
 *
 * 参照数据来源：
 *   日班次 —— Jetpunk「Busiest Air Routes in the World by Scheduled Departures」(2024-11)
 *             + BofA/FlightAI 2024 短程航线运力表（上海-东京 pair 运力全球第一）
 *   座位/客座率 —— 按航线实际机型结构估计（短程窄体约 200 座、远程宽体约 290 座，
 *                 客座率 0.70~0.85；中国国际短程线 2024 年普遍 >80%）
 *   季度客流 = 日班次 × 90 × 平均座位 × 客座率 / 1e6
 */

'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
require(path.join(SRC, 'data.js'));
require(path.join(SRC, 'geo.js'));
require(path.join(SRC, 'landmask.js'));

var AT = global.AT;
var G = AT.geo;
var byName = {};
AT.CITIES.forEach(function (c) { byName[c.name] = c; });

/* 观测样本：名称、日班次(双向)、平均座位、客座率 */
var OBS = [
  ['伦敦', '纽约', 40, 300, 0.80],
  ['纽约', '洛杉矶', 60, 190, 0.85],
  ['上海', '北京', 90, 200, 0.85],
  ['上海', '东京', 35, 220, 0.82],
  ['上海', '大阪', 48, 200, 0.82],
  ['上海', '新加坡', 30, 230, 0.82],
  ['曼谷', '马尼拉', 22, 190, 0.80],
  ['迪拜', '伦敦', 26, 290, 0.80],
  ['法兰克福', '芝加哥', 18, 280, 0.80],
  ['内罗毕', '开罗', 6, 170, 0.70],
  ['悉尼', '约翰内斯堡', 4, 250, 0.75],
  ['首尔', '东京', 66, 200, 0.82],
  ['香港', '台北', 70, 190, 0.82],
  ['吉隆坡', '新加坡', 73, 180, 0.82],
  ['开罗', '吉达', 58, 200, 0.80],
  ['迪拜', '利雅得', 50, 200, 0.80]
];

var samples = [];
OBS.forEach(function (o) {
  var ca = byName[o[0]], cb = byName[o[1]];
  if (!ca || !cb) { console.log('  ⚠ 缺少城市：' + o[0] + ' / ' + o[1]); return; }
  var pax = o[2] * 90 * o[3] * o[4] / 1e6;          // 百万客/季度
  samples.push({
    label: o[0] + '-' + o[1],
    pax: pax,
    popSum: ca.pop + cb.pop,
    wealth: (ca.wealth + cb.wealth) / 2,
    dist: G.distKm(ca, cb)
  });
});

console.log('');
console.log('═══ 观测样本（真实季度客流）═══');
console.log('');
console.log('航线'.padEnd(24) + 'popSum'.padStart(8) + 'wealth'.padStart(8) + 'dist'.padStart(8) + '季度客流'.padStart(10) + '每百万人口'.padStart(11));
console.log('─'.repeat(72));
samples.forEach(function (s) {
  var pad = 24 - s.label.length * 2;
  console.log(s.label + ' '.repeat(Math.max(1, pad)) +
    s.popSum.toFixed(1).padStart(8) +
    s.wealth.toFixed(2).padStart(8) +
    Math.round(s.dist).toString().padStart(8) +
    s.pax.toFixed(3).padStart(10) +
    (s.pax / s.popSum * 1000).toFixed(2).padStart(11));
});

/* ── 对数空间最小二乘：ln(pax) = c0 + c1·ln(popSum) + c2·ln(wealth) + c3·ln(distAdj) ── */
function distAdjOf(dist) { return 0.80 + 0.20 / (1 + Math.pow(dist / 9000, 0.8)); }

console.log('');
console.log('═══ 对数空间最小二乘（多元回归）═══');
console.log('');

var X = [], Y = [];
samples.forEach(function (s) {
  X.push([1, Math.log(s.popSum), Math.log(s.wealth), Math.log(distAdjOf(s.dist))]);
  Y.push(Math.log(s.pax));
});

/* 构造 X'X 与 X'Y（4x4 / 4x1） */
var n = 4;
var XTX = [], XTY = [];
for (var i = 0; i < n; i++) { XTX.push([]); for (var j = 0; j < n; j++) XTX[i].push(0); XTY.push(0); }
X.forEach(function (row, k) {
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) XTX[i][j] += row[i] * row[j];
    XTY[i] += row[i] * Y[k];
  }
});

/* 高斯-约当消元解正规方程 */
var M = XTX.map(function (row, i) { return row.concat([XTY[i]]); });
for (var col = 0; col < n; col++) {
  /* 选主元 */
  var piv = col;
  for (var r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
  var t = M[col]; M[col] = M[piv]; M[piv] = t;
  if (Math.abs(M[col][col]) < 1e-12) { console.log('  矩阵奇异，跳过'); return; }
  /* 归一化主元行 */
  var pv = M[col][col];
  for (var c2 = col; c2 <= n; c2++) M[col][c2] /= pv;
  /* 消去其他行的该列 */
  for (var r2 = 0; r2 < n; r2++) {
    if (r2 === col) continue;
    var f = M[r2][col];
    if (f === 0) continue;
    for (var c3 = col; c3 <= n; c3++) M[r2][c3] -= f * M[col][c3];
  }
}
var coef = M.map(function (row, i) { return row[n]; });

console.log('  ln k       = ' + coef[0].toFixed(4) + '   →  k  = ' + Math.exp(coef[0]).toFixed(4));
console.log('  人口指数 a = ' + coef[1].toFixed(4));
console.log('  富裕指数 b = ' + coef[2].toFixed(4));
console.log('  距离指数 c = ' + coef[3].toFixed(4));

/* 拟合优度与残差 */
var ssRes = 0, ssTot = 0;
var meanY = Y.reduce(function (s, v) { return s + v; }, 0) / Y.length;
var preds = [];
X.forEach(function (row, i) {
  var p = 0;
  for (var j = 0; j < n; j++) p += coef[j] * row[j];
  preds.push(Math.exp(p));
  ssRes += Math.pow(Y[i] - p, 2);
  ssTot += Math.pow(Y[i] - meanY, 2);
});
console.log('  R²         = ' + (1 - ssRes / ssTot).toFixed(4));

console.log('');
console.log('═══ 拟合值 vs 真实值 ═══');
console.log('');
console.log('航线'.padEnd(24) + '真实'.padStart(8) + '拟合'.padStart(8) + '比值'.padStart(8) + '  ' + '误差');
console.log('─'.repeat(64));
var worst = 0, worstLabel = '';
samples.forEach(function (s, i) {
  var ratio = preds[i] / s.pax;
  var err = Math.abs(ratio - 1);
  if (err > worst) { worst = err; worstLabel = s.label; }
  var bar = '█'.repeat(Math.min(20, Math.round(err * 40)));
  var pad = 24 - s.label.length * 2;
  console.log(s.label + ' '.repeat(Math.max(1, pad)) +
    s.pax.toFixed(3).padStart(8) +
    preds[i].toFixed(3).padStart(8) +
    ratio.toFixed(2).padStart(8) + '  ' + bar);
});
console.log('');
console.log('  最大偏差：' + worstLabel + '  ' + (worst * 100).toFixed(0) + '%');
console.log('');
console.log('── 建议写入 CONFIG 的取值 ──');
console.log('  penetrationRate   = ' + Math.exp(coef[0]).toFixed(4));
console.log('  penetrationPopExp = ' + coef[1].toFixed(3));
console.log('  wealthExp         = ' + coef[2].toFixed(3));
console.log('');
