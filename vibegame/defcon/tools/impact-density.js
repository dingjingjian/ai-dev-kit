/*
 * defcon — tools/impact-density.js
 * 落地密度实测：一局里两次「核爆音」触发的间隔分布（Node 运行，不进提交包）。
 *
 * 为什么需要它：
 *   src/audio.js 的 play() 在 MIN_GAP 窗口内不是丢弃而是**叠加升调**（MAX_STACK）。
 *   这条规则对拦截是对的、对核爆是错的 —— 但「错得有多严重」取决于触发密度。
 *   本脚本用真实对局（autoPlayer，10 Hz 步进）统计间隔分布，回答两个问题：
 *     ① 有多少比例的落地会走进叠加分支（< MIN_GAP.nuke = 0.35 s）；
 *     ② 有多少比例会叠到第三层（≤ 0.25 s）。
 *   「叠加把核爆变成鼓点」这个判断必须挂在真实密度上，不能靠直觉。
 *
 * 运行：node tools/impact-density.js [局数]
 * 实测（8 局 / 515 个间隔）：中位数 1.6 s，13.4% 走进叠加分支，9.9% 叠到第三层。
 *   —— 结论：叠加是次要因素（87% 的核爆本来就是单发），不是「像在打鼓」的主因。
 */
'use strict';

var path = require('path');

var ROOT = path.join(__dirname, '..');
global.window = global;
['data.js', 'geo.js', 'landmask.js', 'sim.js', 'ai.js'].forEach(function (f) {
  require(path.join(ROOT, 'src', f));
});

var S = global.DC.sim;
var GAP = 0.35;          // 与 src/audio.js 的 MIN_GAP.nuke 保持一致
var runs = parseInt(process.argv[2], 10) || 8;

var allGaps = [];
for (var seed = 1; seed <= runs; seed++) {
  var st = S.create({ seed: seed, autoPlayer: true });
  var t = 0, lastImpact = null, guard = 0, gaps = [];
  while (st.phase !== 'over' && guard < 30000) {
    var before = st.impacts;
    S.tick(st, S.TICK);
    t += S.TICK;
    guard++;
    if (st.impacts > before) {
      if (lastImpact != null) gaps.push(+(t - lastImpact).toFixed(1));
      lastImpact = t;
    }
  }
  allGaps = allGaps.concat(gaps);
  var sorted = gaps.slice().sort(function (a, b) { return a - b; });
  console.log('seed ' + seed + '  总落地 ' + st.impacts + ' 次   间隔中位数 ' +
    (sorted.length ? sorted[Math.floor(sorted.length / 2)] : '-') + ' s');
}

allGaps.sort(function (a, b) { return a - b; });
function pct(p) { return allGaps[Math.min(allGaps.length - 1, Math.floor(allGaps.length * p))]; }
function share(limit) {
  var n = allGaps.filter(function (g) { return g <= limit + 1e-9; }).length;
  return n + ' 个 = ' + (100 * n / allGaps.length).toFixed(1) + '%';
}

console.log('\n=== ' + runs + ' 局 / ' + allGaps.length + ' 个相邻间隔 ===');
console.log('  中位数 ' + pct(0.5) + ' s    25% ' + pct(0.25) + ' s    75% ' + pct(0.75) + ' s');
console.log('  ≤ ' + GAP + ' s（走叠加分支，不是丢弃）      : ' + share(GAP - 1e-9));
console.log('  ≤ 0.10 s（叠加第 1 层：原调 + 升 2 半音）: ' + share(0.1));
console.log('  ≤ 0.25 s（再叠第 2 层：升 4 半音）      : ' + share(0.25));
