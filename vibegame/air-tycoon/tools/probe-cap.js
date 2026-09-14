/* probe-cap.js —— 只读诊断：检查「渗透率天花板」是否落在现实量级
 *
 * 用法：node tools/probe-cap.js
 *
 * 不参与标定，不做权衡，只回答一个问题：
 *   给定城市对，routePotential() 算出的季度需求是多少？和真实世界比对不对？
 *
 * 判据（真实民航口径，季度客流）：
 *   伦敦-纽约   ：年 3.5~4.5 百万客 → 季度 0.9~1.1 百万客（全球最忙干线之一）
 *   上海-北京   ：年 9~10 百万客    → 季度 2.3~2.5 百万客（全球前列国内干线）
 *   上海-东京   ：年 1.5~2 百万客   → 季度 0.4~0.5 百万客
 *   迪拜-伦敦   ：年 1.2~1.6 百万客 → 季度 0.3~0.4 百万客
 *   曼谷-马尼拉 ：年 0.8~1.2 百万客 → 季度 0.2~0.3 百万客
 *   小城市对    ：年 <0.2 百万客    → 季度 <0.05 百万客
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');

global.window = global;
require(path.join(SRC, 'data.js'));
require(path.join(SRC, 'geo.js'));
require(path.join(SRC, 'landmask.js'));
require(path.join(SRC, 'sim.js'));

var AT = global.AT;
var S = AT.sim;

/* 城市 id 查询表 */
var byName = {};
AT.CITIES.forEach(function (c) { byName[c.name] = c.id; });

/* 参照表：真实世界季度客流（百万客），来源为公开航线客流统计的量级估计 */
var REF = [
  ['伦敦', '纽约', 0.90, 1.10],
  ['上海', '北京', 2.30, 2.50],
  ['上海', '东京', 0.40, 0.50],
  ['迪拜', '伦敦', 0.30, 0.40],
  ['曼谷', '马尼拉', 0.20, 0.30],
  ['上海', '新加坡', 0.35, 0.50],
  ['纽约', '洛杉矶', 1.20, 1.60],
  ['法兰克福', '芝加哥', 0.25, 0.40],
  ['内罗毕', '开罗', 0.04, 0.10],
  ['悉尼', '约翰内斯堡', 0.05, 0.12]
];

var st = S.create({ seed: 20260914 });
/* 让城市都处于初始等级（1 级），先看「裸需求」对不对 */
st.cities.forEach(function (c) { c.level = 1; c.bonus = 0; });

console.log('');
console.log('═══ 渗透率天花板体检：模型需求 vs 真实世界量级 ═══');
console.log('');
console.log('航线'.padEnd(22) + '距离km'.padStart(8) + '  pop和'.padStart(8) + '模型需求'.padStart(11) + '真实区间'.padStart(13) + '  判定');
console.log('─'.repeat(78));

var ok = 0, warn = 0, bad = 0;
REF.forEach(function (r) {
  var a = byName[r[0]], b = byName[r[1]];
  if (!a || !b) { console.log('  (缺少城市: ' + r[0] + ' / ' + r[1] + ')'); return; }
  var ca = st.cities.filter(function (c) { return c.id === a; })[0];
  var cb = st.cities.filter(function (c) { return c.id === b; })[0];
  var p = S.routePotential(st, a, b);
  var d = AT.geo.distKm(ca, cb);
  var lo = r[2], hi = r[3];
  var ratio = p / ((lo + hi) / 2);
  var verdict;
  if (ratio >= 0.55 && ratio <= 1.8) { verdict = '✓ 合拍'; ok++; }
  else if (ratio >= 0.3 && ratio <= 3.0) { verdict = '△ 偏离'; warn++; }
  else { verdict = '✗ 失真'; bad++; }

  var label = (r[0] + '–' + r[1]);
  /* 中文宽度按 2 计，手工补位 */
  var pad = 24 - label.length * 2;
  console.log('  ' + label + ' '.repeat(Math.max(1, pad)) +
    String(Math.round(d)).padStart(6) +
    String(Math.round(ca.pop + cb.pop)).padStart(8) +
    p.toFixed(4).padStart(11) +
    (' ' + lo + '~' + hi).padStart(13) +
    '   ' + verdict);
});

console.log('');
console.log('  合计  ✓' + ok + '  △' + warn + '  ✗' + bad);
console.log('');

/* 等级飞轮验证：把上海、东京都拉到 5 级，看天花板是否抬升 */
console.log('═══ 等级飞轮：城市升级后天花板是否抬高 ═══');
console.log('');
var pairs = [['上海', '北京'], ['上海', '东京'], ['内罗毕', '开罗']];
console.log('航线'.padEnd(22) + 'L1 需求'.padStart(11) + 'L3 需求'.padStart(11) + 'L5 需求'.padStart(11) + '  L5/L1');
console.log('─'.repeat(62));
pairs.forEach(function (p) {
  var a = byName[p[0]], b = byName[p[1]];
  var ca = st.cities.filter(function (c) { return c.id === a; })[0];
  var cb = st.cities.filter(function (c) { return c.id === b; })[0];
  var vals = [];
  [1, 3, 5].forEach(function (lv) {
    ca.level = lv; cb.level = lv;
    vals.push(S.routePotential(st, a, b));
  });
  var label = p[0] + '–' + p[1];
  var pad = 24 - label.length * 2;
  console.log('  ' + label + ' '.repeat(Math.max(1, pad)) +
    vals[0].toFixed(4).padStart(11) +
    vals[1].toFixed(4).padStart(11) +
    vals[2].toFixed(4).padStart(11) +
    ('  ' + (vals[2] / Math.max(1e-9, vals[0])).toFixed(2) + 'x'));
});
st.cities.forEach(function (c) { c.level = 1; });
console.log('');
