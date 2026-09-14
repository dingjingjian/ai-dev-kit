/* ═══════════════════════════════════════════════════════════════════════
 * balance.js —— 节奏与胜负分布（回答「好不好玩」）
 *
 * ⚠ 为什么必须与 headless 分开（defcon 确立的三件套经验）：
 *   **断言全绿 ≠ 数据合理**。headless 回答「对不对」（功能是否按预期工作），
 *   本脚本回答「好不好玩」（多种子下的成长曲线与胜负分布是否健康）。
 *   平衡类 bug 只能靠统计发现 —— 读代码永远看不出「玩家 60 回合
 *   能不能追上竞对」这种事。任何数值改动后都应重跑本脚本。
 *
 * 检查项：
 *   ① 多种子终局分布：玩家净资产 / 排名 / 机队规模 / 评价档位
 *   ② 成长曲线：每个季度的净资产增量是否平滑（不应有断崖或停滞）
 *   ③ 难度曲线：玩家排名随季度推进的变化（应从中游逐步爬升，
 *      而不是开局即第一或永远垫底）
 *   ④ 破产率与竞对存活率
 *
 * 用法：node tools/balance.js [局数]      默认 30 局
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
['data', 'geo', 'landmask', 'sim'].forEach(function (f) {
  require(path.join(SRC, f + '.js'));
});
var AT = global.AT, S = AT.sim, C = AT.CONFIG;

var ROUNDS = parseInt(process.argv[2], 10) || 30;

function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
function rpad(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }

/* 跑一局（玩家交给托管 AI，见 sim.js playerTurn 注释） */
function runOne(seed, home) {
  var st = S.create({
    seed: seed, companyName: '玩家',
    homeCityId: home || 'C01', autoPlayer: true
  });
  var guard = 0;
  var curve = [];
  /* 采样季度：核心指标都记在这里，避免事后用近似值冒充（见 ③ 的旧坑） */
  var SAMPLE = {};
  for (var sq = 10; sq <= 60; sq += 10) SAMPLE[sq] = true;
  while (st.phase !== 'over' && guard < 200000) {
    if (st.card) S.chooseEvent(st, 0);
    S.tick(st, S.TICK);
    guard++;
    /* 记录季度快照（history 每季 push 一条）。
     * ⚠ 排名必须**当场**算（ranking() 依赖当季的竞对现金/机队），
     *   事后无法反推 —— 这是本脚本 ③ 曾经输出假数据的根因。 */
    var h = st.history[st.history.length - 1];
    if (h && h.quarter !== (curve.length ? curve[curve.length - 1].quarter : -1)) {
      var snap = { quarter: h.quarter, netWorth: h.netWorth, routes: h.routes,
        planes: h.planes, net: h.net, cash: h.cash };
      if (SAMPLE[h.quarter]) {
        var rkNow = S.ranking(st);
        var myNow = null;
        rkNow.forEach(function (x) { if (x.isPlayer) myNow = x; });
        var idx = 0;
        for (var k = 0; k < rkNow.length; k++) if (rkNow[k].isPlayer) idx = k;
        snap.rank = idx + 1;
        snap.total = rkNow.length;
        snap.lead = rkNow.length ? rkNow[0].netWorth : 0;      // 榜首净资产
        snap.rivalMax = rkNow.reduce(function (m, x) {
          return (!x.isPlayer && x.netWorth > m) ? x.netWorth : m;
        }, -Infinity);
        snap.myNw = myNow ? myNow.netWorth : 0;
      }
      curve.push(snap);
    }
  }
  var rk = S.ranking(st);
  var my = null;
  rk.forEach(function (x) { if (x.isPlayer) my = x; });
  return {
    st: st, curve: curve, rank: S.myRank(st), total: rk.length,
    netWorth: my ? my.netWorth : 0,
    routes: st.routes.length, planes: st.planes.length,
    pax: st.stats.paxTotal,
    bankrupt: !!st.bankrupt,
    verdict: S.verdict(st),
    rivalsAlive: st.rivals.filter(function (r) { return r.alive; }).length,
    ranking: rk
  };
}

console.log('═'.repeat(92));
console.log('  air-tycoon 节奏与胜负分布（' + ROUNDS + ' 局，玩家由托管 AI 执行）');
console.log('═'.repeat(92));

/* ── ① 多种子终局分布 ── */
var runs = [];
for (var i = 0; i < ROUNDS; i++) {
  runs.push(runOne(1000 + i * 37));
}

console.log('');
console.log('① 终局分布（多种子）');
var nws = runs.map(function (r) { return r.netWorth; }).sort(function (a, b) { return a - b; });
var med = nws[Math.floor(nws.length / 2)];
var sum = nws.reduce(function (a, b) { return a + b; }, 0);
console.log('   净资产：最低 ' + Math.round(nws[0]) + ' | 中位 ' + Math.round(med) +
  ' | 最高 ' + Math.round(nws[nws.length - 1]) + ' | 平均 ' + Math.round(sum / nws.length));

var rankCount = {};
runs.forEach(function (r) { rankCount[r.rank] = (rankCount[r.rank] || 0) + 1; });
console.log('   排名分布：' + Object.keys(rankCount).sort().map(function (k) {
  return '第' + k + '名×' + rankCount[k];
}).join('  '));

var vd = {};
runs.forEach(function (r) { vd[r.verdict.label] = (vd[r.verdict.label] || 0) + 1; });
console.log('   评价分布：' + Object.keys(vd).map(function (k) { return k + '×' + vd[k]; }).join('  '));

var routesAvg = runs.reduce(function (a, r) { return a + r.routes; }, 0) / runs.length;
var planesAvg = runs.reduce(function (a, r) { return a + r.planes; }, 0) / runs.length;
var bankrupt = runs.filter(function (r) { return r.bankrupt; }).length;
var rivalsAvg = runs.reduce(function (a, r) { return a + r.rivalsAlive; }, 0) / runs.length;
console.log('   平均机队 ' + planesAvg.toFixed(1) + ' 架 | 平均航线 ' + routesAvg.toFixed(1) +
  ' 条 | 破产 ' + bankrupt + '/' + ROUNDS + ' | 竞对平均存活 ' + rivalsAvg.toFixed(1) + '/5');

/* ── ② 成长曲线平滑度 ── */
console.log('');
console.log('② 成长曲线（每 10 季采样的中位净资产 —— 应平滑上升，无断崖/停滞）');
var sampleQ = [];
for (var q = 10; q <= 60; q += 10) sampleQ.push(q);
console.log('   ' + rpad('季度', 8) + sampleQ.map(function (q) { return pad('Q' + q, 12); }).join(''));
var curveRow = '   ' + rpad('净资产', 8);
sampleQ.forEach(function (q) {
  var vals = [];
  runs.forEach(function (r) {
    var pt = null;
    r.curve.forEach(function (c) { if (c.quarter === q) pt = c; });
    if (pt) vals.push(pt.netWorth);
  });
  vals.sort(function (a, b) { return a - b; });
  var m = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  curveRow += pad(Math.round(m), 12);
});
console.log(curveRow);
var planeRow = '   ' + rpad('机队', 8);
sampleQ.forEach(function (q) {
  var vals = [];
  runs.forEach(function (r) {
    var pt = null;
    r.curve.forEach(function (c) { if (c.quarter === q) pt = c; });
    if (pt) vals.push(pt.planes);
  });
  vals.sort(function (a, b) { return a - b; });
  var m = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  planeRow += pad(m, 12);
});
console.log(planeRow);

/* 检查是否有断崖（相邻两个采样的净资产倒退 > 20%） */
var drops = 0;
runs.forEach(function (r) {
  for (var k = 1; k < sampleQ.length; k++) {
    var a = null, b = null;
    r.curve.forEach(function (c) { if (c.quarter === sampleQ[k - 1]) a = c; if (c.quarter === sampleQ[k]) b = c; });
    if (a && b && a.netWorth > 0 && b.netWorth < a.netWorth * 0.8) drops++;
  }
});
console.log('   净资产断崖（相邻采样倒退 >20%）次数：' + drops + ' / ' + (ROUNDS * (sampleQ.length - 1)));

/* ── ③ 难度曲线：玩家排名随季度推进 ── */
console.log('');
console.log('③ 难度曲线（玩家排名随季度推进 —— 应从中游逐步爬升，而非开局即第一）');
console.log('   ' + rpad('季度', 8) + pad('中位排名', 10) + pad('第1名占比', 11) +
  pad('进前3占比', 11) + pad('玩家/榜首', 12) + pad('玩家/最强竞对', 14));
/* 先扫一遍，取采样的实际季度（可能是最后一季提前结束） */
var qSeen = {};
runs.forEach(function (r) {
  r.curve.forEach(function (c) { if (c.rank != null) qSeen[c.quarter] = true; });
});
var qs = Object.keys(qSeen).map(Number).sort(function (a, b) { return a - b; });
qs.forEach(function (q) {
  var ranks = [], first = 0, top3 = 0, n = 0, sumRatio = 0, sumRival = 0;
  runs.forEach(function (r) {
    var pt = null;
    r.curve.forEach(function (c) { if (c.quarter === q) pt = c; });
    if (!pt || pt.rank == null) return;
    n++;
    ranks.push(pt.rank);
    if (pt.rank === 1) first++;
    if (pt.rank <= 3) top3++;
    if (pt.lead > 0) sumRatio += pt.myNw / pt.lead;
    if (isFinite(pt.rivalMax) && pt.rivalMax > 0) sumRival += pt.myNw / pt.rivalMax;
  });
  if (!n) return;
  ranks.sort(function (a, b) { return a - b; });
  var medR = ranks[Math.floor(ranks.length / 2)];
  console.log('   ' + rpad('Q' + q, 8) + pad(medR + '/' + runs[0].total, 10) +
    pad((first / n * 100).toFixed(0) + '%', 11) +
    pad((top3 / n * 100).toFixed(0) + '%', 11) +
    pad((sumRatio / n).toFixed(2) + 'x', 12) +
    pad((sumRival / n).toFixed(2) + 'x', 14));
});
console.log('   （中位排名从 6 逐步降到 1 = 追赶感；开局即 1 名 = 难度过低）');

/* ── ④ 竞对经营状况 ── */
console.log('');
console.log('④ 竞对经营状况（终局）');
console.log('   ' + rpad('竞对', 12) + pad('存活', 7) + pad('净资产中位', 13) + pad('航线中位', 11));
for (var ri = 0; ri < 5; ri++) {
  var vals2 = [];
  runs.forEach(function (r) {
    var rv = null;
    r.st.ranking.forEach(function (x) {
      if (!x.isPlayer && x.id === 'R' + (ri + 1)) rv = x;
    });
    if (!rv) {
      /* ranking 里的 id 可能是其他形式，用索引回落 */
      var others = r.st.ranking.filter(function (x) { return !x.isPlayer; });
      if (others[ri]) rv = others[ri];
    }
    if (rv) vals2.push({ nw: rv.netWorth, routes: rv.routes });
  });
  if (!vals2.length) continue;
  vals2.sort(function (a, b) { return a.nw - b.nw; });
  var mid = vals2[Math.floor(vals2.length / 2)];
  var aliveRate = (vals2.length / runs.length * 100).toFixed(0);
  /* 竞对名字从第一局取 */
  var nm = '竞对' + (ri + 1);
  var firstOthers = runs[0].st.ranking.filter(function (x) { return !x.isPlayer; });
  if (firstOthers[ri]) nm = firstOthers[ri].name;
  console.log('   ' + rpad(nm, 12) + pad(aliveRate + '%', 7) +
    pad(Math.round(mid.nw), 13) + pad(mid.routes, 11));
}

console.log('');
console.log('═'.repeat(92));
console.log('  判据速查');
console.log('═'.repeat(92));
console.log('  · 若「玩家平均净资产」远超竞对中位 → 难度过低，玩家没有对手（需强化竞对）');
console.log('  · 若「净资产断崖」次数 > 总采样数的 5% → 存在过强的随机打击或成本失控');
console.log('  · 若「成长曲线」在某个季度后完全走平 → 缺少资金出口，玩家失去目标');
console.log('  · 若「破产率」> 30% → 开局太难；= 0% 且从未紧张 → 太简单');
console.log('  · 若「竞对存活率」< 50% → 竞对模型太脆，中后期变成独角戏');
