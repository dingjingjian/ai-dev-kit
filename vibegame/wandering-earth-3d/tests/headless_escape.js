#!/usr/bin/env node
/**
 * 无头自检：在 Node 沙箱加载 app.js 跑物理核心。
 *
 * 断言：工程导出 / 常量换算 / 物理（稳定绕日·顺向外飞·逆向坠日）/
 *       弹弓（低速捕获·高速掠过）/ 氦闪（持续膨胀·脉冲加速·吞没判定）/ 胜负（逃逸判定）。
 *
 * 用法：node tests/headless_escape.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

let pass = 0, fail = 0;
function ok(item, note) { console.log('  [PASS] ' + item + (note ? ' — ' + note : '')); pass++; }
function bad(item, note) { console.log('  [FAIL] ' + item + (note ? ' — ' + note : '')); fail++; }
function check(cond, item, note) { cond ? ok(item, note) : bad(item, note); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
function len3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

// ---------- 沙箱 ----------
const sandbox = { console, Math, Date, JSON, Array, Object, String, Number, parseFloat, parseInt, isNaN };
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

// 加载 app.js（物理核心；渲染部分因 THREE undefined 跳过）
try { vm.runInContext(fs.readFileSync(path.join(ASSETS, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' }); }
catch (e) { console.error('加载 app.js 失败:', e.message); process.exit(1); }

const M3D = sandbox.M3D || {};
const W = M3D.WORLD || {};
const C = M3D.CONST || {};

console.log('\n=== 工程 ===');
check(typeof M3D.createGame === 'function', 'app.js 导出 createGame');
check(typeof W.AU === 'number' && W.AU === 100, 'WORLD.AU = 100');
check(typeof C.KMS_PER_UNIT === 'number', 'CONST.KMS_PER_UNIT 导出');

console.log('\n=== 常量 ===');
check(near(C.KMS_PER_UNIT, 2.844, 0.01), '1 单位/秒 ≈ 2.844 km/s', C.KMS_PER_UNIT.toFixed(4));
check(near(C.YEARS_PER_GAME_SEC, 1 / 60, 1e-4), '60 游戏秒 ≈ 1 年', C.YEARS_PER_GAME_SEC.toFixed(6));
// 1 AU 圆轨道速度 × KMS ≈ 29.8 km/s
check(near(W.V_CIRC * C.KMS_PER_UNIT, 29.8, 0.1), '1 AU 圆轨道速度 ≈ 29.8 km/s', (W.V_CIRC * C.KMS_PER_UNIT).toFixed(2));

console.log('\n=== 物理 ===');
// 不操作短时间内稳定绕日（壳还没追上）
(function () {
  var g = M3D.createGame(); var st = g.state;
  for (var i = 0; i < 100 && st.status === 'flying'; i++) g.step(0.1);
  check(st.status === 'flying', '不操作时短时间内稳定绕日', 'rSun=' + (st.rSun / W.AU).toFixed(3) + ' AU');
  check(near(st.rSun, W.AU, 8), '绕日半径稳定在 1 AU ±8', '偏差 ' + (st.rSun - W.AU).toFixed(1));
})();

// 不操作长时间会被壳追上（验证壳膨胀机制）
(function () {
  var g = M3D.createGame(); var st = g.state;
  for (var i = 0; i < 600 && st.status === 'flying'; i++) g.step(0.1);
  check(st.status === 'burned', '不操作长时间被氦闪壳追上吞没', 'status=' + st.status + ' t=' + st.t.toFixed(1));
})();

// 顺向推力外飞，逃逸比上升
(function () {
  var g = M3D.createGame(); var st = g.state;
  g.setThrust([st.vel[0], 0, st.vel[2]], 1); // 沿速度方向满推
  for (var i = 0; i < 200 && st.status === 'flying'; i++) g.step(0.1);
  check(st.rSun > W.AU * 2 || st.status === 'escaped', '顺向推力外飞', 'rSun=' + (st.rSun / W.AU).toFixed(2) + ' AU esc=' + st.escapeRatio.toFixed(2));
})();

// 引力坠日（近处零速度，引力直接拉向太阳，壳还没胀到）
(function () {
  var g = M3D.createGame(); var st = g.state;
  g.debugSet([14, 0, 0], [0, 0, 0]);
  for (var i = 0; i < 100 && st.status === 'flying'; i++) g.step(0.02);
  check(st.status === 'crashed' && st.culprit === '太阳', '引力坠日', 'status=' + st.status);
})();

console.log('\n=== 弹弓 ===');
// 低速进木星影响球被捕获（摆到木星实际位置附近）
(function () {
  var g = M3D.createGame(); var st = g.state;
  var jup = W.planets[3]; // 木星
  var jupAng = 1.3; // START_ANGLES[3]
  var jx = Math.cos(jupAng) * jup.orbitR, jz = Math.sin(jupAng) * jup.orbitR;
  g.debugSet([jx + 30, 0, jz], [0, 0, 2]); // 木星附近 30 单位，低速
  for (var i = 0; i < 400 && st.status === 'flying'; i++) g.step(0.05);
  check(st.status === 'caught' && st.culprit === '木星', '低速进木星影响球被捕获', 'status=' + st.status + (st.culprit ? '·' + st.culprit : ''));
})();

// 高速掠过木星安全且获得弹弓加速
(function () {
  var g = M3D.createGame(); var st = g.state;
  var jup = W.planets[3];
  var jupAng = 1.3;
  var jx = Math.cos(jupAng) * jup.orbitR, jz = Math.sin(jupAng) * jup.orbitR;
  g.debugSet([jx + 30, 0, jz], [0, 0, 25]); // 高速掠过
  var initSpeed = len3(st.vel);
  for (var i = 0; i < 200 && st.status === 'flying'; i++) g.step(0.05);
  var finalSpeed = len3(st.vel);
  check(st.status !== 'caught', '高速掠过木星不被捕获', 'status=' + st.status);
  check(finalSpeed > initSpeed * 0.95, '高速掠过后速度未大幅损失', initSpeed.toFixed(1) + '→' + finalSpeed.toFixed(1));
})();

console.log('\n=== 氦闪 ===');
// 壳从第 0 秒持续膨胀
(function () {
  var g = M3D.createGame(); var st = g.state;
  var r0 = st.shellR;
  for (var i = 0; i < 50; i++) g.step(0.1);
  check(st.shellR > r0 + 5, '壳从第 0 秒持续膨胀', 'shellR ' + r0.toFixed(1) + '→' + st.shellR.toFixed(1));
})();

// 脉冲时生长率 ×4（t=10 脉冲，对比 t=5 无脉冲）
(function () {
  var g1 = M3D.createGame(); var st1 = g1.state;
  // 跑到 t=5，测 shellR 增量
  while (st1.t < 5) g1.step(0.05);
  var r5a = st1.shellR; g1.step(0.1); var grow5 = (st1.shellR - r5a) / 0.1;

  var g2 = M3D.createGame(); var st2 = g2.state;
  while (st2.t < 10) g2.step(0.05);
  var r10a = st2.shellR; g2.step(0.1); var grow10 = (st2.shellR - r10a) / 0.1;

  check(grow10 > grow5 * 2, '脉冲时生长率显著高于常态', 't5=' + grow5.toFixed(2) + ' t10=' + grow10.toFixed(2));
})();

// 壳追上地球判吞没
(function () {
  var g = M3D.createGame(); var st = g.state;
  // 把地球摆在壳内
  g.debugSet([W.SUN_R + 1, 0, 0], [0, 0, 0]);
  g.step(0.1);
  check(st.status === 'burned' || st.status === 'crashed', '壳内地球被判吞没/坠日', 'status=' + st.status);
})();

console.log('\n=== 胜负 ===');
// 逃逸比 ≥ 1 且飞出 42 AU 判胜利
(function () {
  var g = M3D.createGame(); var st = g.state;
  g.debugSet([4500, 0, 0], [0, 0, 80]); // 45 AU 高速
  g.step(0.1);
  check(st.status === 'escaped', '逃逸比≥1且飞出42AU判逃逸成功', 'status=' + st.status + ' esc=' + st.escapeRatio.toFixed(2));
})();

// 间歇推+脉冲乘波 90 秒能逃到冥王星外（玩家核心路径可达成）
(function () {
  var g = M3D.createGame(); var st = g.state;
  for (var i = 0; i < 900 && st.status === 'flying'; i++) {
    var px = st.pos[0], pz = st.pos[2], pr = Math.sqrt(px * px + pz * pz) || 1;
    var dir = [px / pr, 0, pz / pr];
    var inPulse = (st.t % 10 < 1 && st.t > 5); // 近似脉冲窗口
    if (st.energy > 15 || inPulse) g.setThrust(dir, 1);
    else g.setThrust(null, 0);
    g.step(0.1);
  }
  check(st.status === 'escaped', '间歇推+脉冲乘波90秒逃出冥王星', 'status=' + st.status + ' rSun=' + (st.rSun / W.AU).toFixed(2) + 'AU esc=' + st.escapeRatio.toFixed(2));
})();

// 纯满推逃不出（能量耗尽后无力加速，验证"一直拖"不是最优解）
(function () {
  var g = M3D.createGame(); var st = g.state;
  g.setThrust([1, 0, 0], 1);
  for (var i = 0; i < 900 && st.status === 'flying'; i++) g.step(0.1);
  check(st.status !== 'escaped', '纯满推逃不出（能量约束生效）', 'status=' + st.status + ' rSun=' + (st.rSun / W.AU).toFixed(2) + 'AU');
})();

// 30 秒耗尽仍飞行 → 超时失败（亚逃逸速度在远处巡航，壳追不上）
(function () {
  var g = M3D.createGame(); var st = g.state;
  g.debugSet([W.AU * 40, 0, 0], [0, 0, 3]); // 40 AU 切向 3 单位/秒（亚逃逸，壳追不上）
  for (var i = 0; i < 950 && st.status === 'flying'; i++) g.step(0.1);
  check(st.status === 'timeout', '90 秒耗尽判超时失败', 'status=' + st.status + ' t=' + st.t.toFixed(1));
})();

console.log('\n=== 汇总 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail + ' / 共 ' + (pass + fail));
process.exit(fail > 0 ? 1 : 0);
