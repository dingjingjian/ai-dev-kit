#!/usr/bin/env node
/**
 * 无头自检：在 Node 里以 vm 沙箱加载 assets/ 并**真的跑一遍玩法内核**。
 *
 * 断言三类：
 *   1) 工程：脚本可求值、模块导出齐全；
 *   2) 常量：真实单位换算自洽（1 AU 圆轨道速度 ≈ 29.8 km/s，60 游戏秒 ≈ 1 年）；
 *   3) 玩法：不操作能稳定绕日；顺向点火能爬到逃逸能量；朝太阳点火会坠毁。
 *
 * 用法：node tests/headless_wandering.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

let pass = 0, fail = 0;
const rows = [];
function ok(item, note) { rows.push({ s: 'PASS', item, note: note || '' }); pass++; }
function bad(item, note) { rows.push({ s: 'FAIL', item, note: note || '' }); fail++; }
function check(cond, item, note) { cond ? ok(item, note) : bad(item, note); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// ---------- 沙箱 ----------
const sandbox = {
  console, Math, Date, JSON, Array, Object, String, Number,
  Float32Array, Uint16Array, Uint8Array, isNaN, parseInt, parseFloat, setTimeout, clearTimeout
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.document = {
  getElementById: () => null,
  createElement: () => ({ width: 0, height: 0, getContext: () => null, toDataURL: () => '' }),
  querySelectorAll: () => [],
  addEventListener: () => {}
};
sandbox.requestAnimationFrame = () => 0;
vm.createContext(sandbox);

const SCRIPTS = ['math.js', 'earth-data.js', 'clouds-data.js', 'mercury-data.js', 'venus-data.js',
  'mars-data.js', 'jupiter-data.js', 'saturn-data.js', 'engine.js', 'bodies.js', 'game.js', 'audio.js', 'app.js'];

const loadErrors = [];
for (const f of SCRIPTS) {
  const abs = path.join(ASSETS, f);
  if (!fs.existsSync(abs)) { loadErrors.push(`${f}: 缺失`); continue; }
  try { vm.runInContext(fs.readFileSync(abs, 'utf8'), sandbox, { filename: f }); }
  catch (e) { loadErrors.push(`${f}: ${e && e.message}`); }
}
check(loadErrors.length === 0, 'assets 脚本顶层可求值', loadErrors.length ? loadErrors.join(' | ') : `${SCRIPTS.length} 个脚本`);

const M3D = sandbox.M3D || {};
const W = M3D.WORLD || {};
check(typeof M3D.buildWorld === 'function', 'bodies.js 导出 buildWorld');
check(typeof M3D.createGame === 'function', 'game.js 导出 createGame');
check(typeof M3D.orientUp === 'function', 'bodies.js 导出 orientUp');

// ---------- 常量与单位换算 ----------
const U = M3D.GAME_UNITS || {};
check(near(U.KMS_PER_UNIT, 2.844, 0.01), '速度换算自洽（游戏单位/秒 → km/s）', '1 单位/秒 ≈ ' + U.KMS_PER_UNIT.toFixed(3) + ' km/s');
check(near(U.YEARS_PER_GAME_SEC, 1 / 60, 0.002), '时间换算自洽（60 游戏秒 ≈ 1 年）', '1 游戏秒 ≈ ' + (U.YEARS_PER_GAME_SEC * 365.25).toFixed(2) + ' 天');

// ---------- 玩法模拟 ----------
const DT = 1 / 60;
function simulate(game, strategy, maxGameSeconds) {
  const st = game.state;
  if (st.status === 'ready') game.start();
  const steps = Math.ceil(maxGameSeconds / (DT * st.timeScale));
  let escapedEnergy = false;
  const rMin = () => st.minR / W.AU;
  for (let i = 0; i < steps; i++) {
    if (st.status !== 'flying') break;
    strategy(game, i);
    const p = st.pos, v = st.vel;
    const r = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    const e = 0.5 * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) - W.G_SUN / r;
    if (e > 0) escapedEnergy = true;
    game.step(DT);
  }
  return { st, escapedEnergy, rMinAU: rMin() };
}

// 1) 不操作：应稳定绕日，不失败、不坠毁
{
  const g = M3D.createGame();
  g.state.timeScale = 8;
  g.start();
  const res = simulate(g, () => {}, 600);
  check(res.st.status === 'flying', '不操作时任务持续（无输入不判负）', res.st.status);
  check(res.st.rSunAU > 0.8 && res.st.rSunAU < 1.3, '不操作时稳定在地球轨道附近',
    res.st.rSunAU.toFixed(3) + ' AU（最远 ' + (res.st.maxR / W.AU).toFixed(2) + ' AU）');
  check(res.st.years > 9.5 && res.st.years < 10.5, '600 游戏秒 ≈ 10 年（时间换算一致）', res.st.years.toFixed(2) + ' 年');
}

// 2) 顺向点火：应把地球推上逃逸轨道（比机械能转正）
{
  const g = M3D.createGame();
  g.state.timeScale = 8;
  const res = simulate(g, (game, i) => {
    const v = game.state.vel;
    const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    if (i % 4 === 0) game.setThrust([v[0] / l, v[1] / l, v[2] / l], 1);   // 模拟"持续按住"
  }, 2600);
  check(res.escapedEnergy, '顺向点火能把地球推到逃逸能量（比能 > 0）',
    '最终 ' + res.st.rSunAU.toFixed(2) + ' AU · ' + res.st.speedKms.toFixed(1) + ' km/s');
  check(res.st.status === 'escaped', '持续加速最终飞出太阳系（胜利）',
    res.st.status + (res.st.reason ? ' · ' + res.st.reason : '') + ' · 用时 ' + res.st.years.toFixed(2) + ' 年');
}

// 3) 逆向减速（反着公转方向推）：轨道衰减，最终坠入太阳
{
  const g = M3D.createGame();
  g.state.timeScale = 8;
  const res = simulate(g, (game, i) => {
    const v = game.state.vel;
    const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    if (i % 4 === 0) game.setThrust([-v[0] / l, -v[1] / l, -v[2] / l], 1);
  }, 900);
  check(res.st.status === 'crashed' && res.st.culprit === '太阳', '逆向减速会让轨道衰减并坠入太阳（失败）',
    res.st.reason || res.st.status);
}

// 4) 核心机制：掠过行星时"相对速度"决定生死（低速被吸走 / 高速安全掠过）
{
  const jup = W.planets[3];
  const jIndex = 3;

  // 4a) 低速进入木星影响球 → 被引力捕获
  const g1 = M3D.createGame();
  g1.start();
  const jp1 = g1.state.planets[jIndex];
  const d1 = jup.capR * 0.9;
  g1.debugSet([jp1.pos[0] + d1, 0, jp1.pos[2]], [jp1.vel[0] * 0.4, 0, jp1.vel[2] * 0.4]);
  g1.step(DT);
  check(g1.state.status === 'caught' && g1.state.culprit === '木星', '低速进入行星影响球会被引力捕获（失败）',
    g1.state.reason || g1.state.status);

  // 4b) 高速进入同一影响球 → 安全掠过（引力弹弓可行）
  const g2 = M3D.createGame();
  g2.start();
  const jp2 = g2.state.planets[jIndex];
  g2.debugSet([jp2.pos[0] + d1, 0, jp2.pos[2]], [jp2.vel[0] * 2.2, 0, jp2.vel[2] * 2.2]);
  g2.step(DT);
  check(g2.state.status === 'flying', '高速掠过行星影响球不会被捕获（引力弹弓）',
    g2.state.status + (g2.state.warn ? ' · ' + g2.state.warn : ''));
}

// 5) 燃料耗尽后推力失效
{
  const g = M3D.createGame();
  g.state.timeScale = 8;
  let sawExhaust = false;
  simulate(g, (game) => {
    const v = game.state.vel;
    const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    game.setThrust([v[0] / l, v[1] / l, v[2] / l], 1);
    if (game.state.fuel <= 0) sawExhaust = true;
  }, 40);
  check(sawExhaust, '燃料会被耗尽（推力资源有限）', '剩余燃料 ' + (g.state.fuel * 100).toFixed(1) + '%');
  check(g.state.thrustMag === 0, '燃料耗尽后推力自动归零');
}

// ---------- 输出 ----------
const w = Math.max(...rows.map((r) => r.item.length), 10);
const icon = { PASS: '✅', FAIL: '❌' };
console.log('\n流浪地球 · 逃出太阳系 —— 无头自检\n' + '─'.repeat(w + 34));
for (const r of rows) console.log(`${icon[r.s]} ${r.item.padEnd(w)}  ${r.note}`);
console.log('─'.repeat(w + 34));
console.log(`合计 ${rows.length} 项：通过 ${pass} · 失败 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
