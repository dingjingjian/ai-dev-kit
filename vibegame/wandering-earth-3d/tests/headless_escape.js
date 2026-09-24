#!/usr/bin/env node
/**
 * 无头自检：在 Node 沙箱加载 app.js 跑物理核心。
 *
 * 断言组：工程导出 / 常量（时长·脉冲·能量·行星数·门槛·换算）/
 *         物理（稳定绕日·顺向外飞·逆向坠日）/ 弹弓（低速捕获·高速掠过）/
 *         氦闪（持续膨胀·脉冲加速·壳吞没）/ 推力（脉冲乘波加成）/
 *         相机（跟拍距离有界·随壳逼近拉远·不越过太阳·朝向跟随运动方向·地球偏下构图）/
 *         输入（拖动方向 → 世界推力方向 1:1 各向同性）/
 *         地球模型（行星发动机：装背面·朝向一律平行朝后）/
 *         胜负（逃逸·能量节奏·帧率无关·超时）。
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

// 耀斑脉冲窗口判据（与 app.js pulseActive 同构，供测试构造策略与断言）
const PULSE_TIMES = C.PULSE_TIMES || [];
const PULSE_DUR = C.PULSE_DUR || 1;
const inPulse = (t) => PULSE_TIMES.some((pt) => t >= pt && t < pt + PULSE_DUR);

console.log('\n=== 工程 ===');
check(typeof M3D.createGame === 'function', 'app.js 导出 createGame');
check(typeof W.AU === 'number' && W.AU === 100, 'WORLD.AU = 100');
check(typeof C.KMS_PER_UNIT === 'number', 'CONST.KMS_PER_UNIT 导出');

console.log('\n=== 工程（DOM / 样式契约）===');
// 无头自检只跑物理核心（沙箱里没有 document/THREE，渲染层整段跳过），
// 所以渲染层的改名漏改不会被运行期发现，这里用静态契约把它兜住。
(function () {
  const appSrc = fs.readFileSync(path.join(ASSETS, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ASSETS, 'style.css'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const wanted = [...new Set([...appSrc.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]))];
  const missing = wanted.filter((w) => !htmlIds.has(w));
  check(wanted.length > 0 && missing.length === 0, 'app.js 引用的每个 DOM id 都在 index.html 里',
    missing.length ? '缺失: ' + missing.join(',') : wanted.length + ' 个 id 全部命中');

  // 被 JS 操作的关键样式状态必须有对应 CSS 规则，否则切了类名却没有任何视觉变化
  const need = ['#clock-num', '#mirror-frame', '#heat-wrap', '#heat-fill', '#heat-track'];
  const noRule = need.filter((sel) => css.indexOf(sel) < 0);
  check(noRule.length === 0, '新 HUD 元素的样式规则齐全', noRule.length ? '缺规则: ' + noRule.join(',') : need.join(' '));
  const stateCls = ['hot', 'locked', 'hide', 'show'];
  const missCls = stateCls.filter((c) => css.indexOf('.' + c) < 0);
  check(missCls.length === 0, 'HUD 状态类在 CSS 中有定义', missCls.length ? '缺: ' + missCls.join(',') : stateCls.join(' '));

  // 已删除的旧元素不应再被 JS 引用
  const dead = ['countdown', 'cd-num', 'energy-wrap', 'energy-fill', 'milestones', 'guideArrow'].filter((d) => appSrc.indexOf(d) >= 0);
  check(dead.length === 0, '已删除的旧元素/变量无残留引用', dead.length ? '残留: ' + dead.join(',') : '干净');

  // 星空回归契约：天球一旦回到「贴图」实现，相机在球内只会截取 ~60° 视场，
  // 每纹素被放大数倍，底色渐变与银河雾的 8bit 量化台阶会被放大成「白色方格子」。
  // 这条断言让「又有人把天球改回贴图」在无头自检里立刻暴露。
  check(appSrc.indexOf('starfieldTex') < 0 && appSrc.indexOf('SphereGeometry') >= 0,
    '天球用顶点色而非贴图（贴图在球内被放大 → 白色方格子）');
})();

console.log('\n=== 常量 ===');
check(near(C.KMS_PER_UNIT, 2.844, 0.01), '1 单位/秒 ≈ 2.844 km/s', C.KMS_PER_UNIT.toFixed(4));
check(near(C.YEARS_PER_GAME_SEC, 1 / 60, 1e-4), '60 游戏秒 ≈ 1 年', C.YEARS_PER_GAME_SEC.toFixed(6));
// 1 AU 圆轨道速度 × KMS ≈ 29.8 km/s
check(near(W.V_CIRC * C.KMS_PER_UNIT, 29.8, 0.1), '1 AU 圆轨道速度 ≈ 29.8 km/s', (W.V_CIRC * C.KMS_PER_UNIT).toFixed(2));
check(PULSE_TIMES.length === 5 && PULSE_TIMES.join(',') === '10,20,35,55,75', '耀斑脉冲 5 次 @10/20/35/55/75', PULSE_TIMES.join(','));
check(C.HEAT_MAX === 100 && C.HEAT_RATE > 0 && C.COOL_RATE > 0, '过热常量齐备（升温/降温均 >0）', 'max=' + C.HEAT_MAX + ' rate=' + C.HEAT_RATE + ' cool=' + C.COOL_RATE);
check(C.ROUND_TIME === undefined, '已删除时限常量（改为正计时）');
check(C.STAR_SIZE >= 8 && C.STAR_SIZE <= 16, '星点尺寸 ≥8px（点精灵把整张贴图铺到 N 像素上，N 太小时像素中心只能采到贴图中心那点纯白 → 实心白方块）', C.STAR_SIZE + ' px');
check(Array.isArray(W.planets) && W.planets.length === 8, '行星 8 颗', (W.planets || []).length + ' 颗');
check(C.ESCAPE_R === 4200, '胜利距离门槛 42 AU', C.ESCAPE_R + ' 单位');

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

// 开局保护必须按时间计：同一起始状态在 10fps / 60fps 下都要在同一时刻启用行星判定
// （历史 bug：按帧数计 → 10fps 保护 6 秒、60fps 只保护 1 秒，同一路线在两种帧率下一个撞行星一个不撞）
(function () {
  var ga = M3D.createGame(), gb = M3D.createGame();
  while (ga.state.t < 0.2) ga.step(0.1);
  while (gb.state.t < 0.2) gb.step(1 / 60);
  check(ga.state.planetCheck === false && gb.state.planetCheck === false,
    '保护期内（t<0.5s）两种帧率都不判行星碰撞', 't=' + ga.state.t.toFixed(2) + ' / ' + gb.state.t.toFixed(2));
  while (ga.state.t < 0.6) ga.step(0.1);
  while (gb.state.t < 0.6) gb.step(1 / 60);
  check(ga.state.planetCheck === true && gb.state.planetCheck === true,
    '超过保护时间后两种帧率都启用行星判定（帧率无关）', 't=' + ga.state.t.toFixed(2) + ' / ' + gb.state.t.toFixed(2));
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
// 注意：落点必须在「撞日半径」之外，否则会先命中坠日分支，吞没分支根本不会被覆盖
(function () {
  var g = M3D.createGame(); var st = g.state;
  while (st.t < 15 && st.status === 'flying') g.step(0.1);   // 让壳先膨胀到 ~80 单位
  var shell = st.shellR;
  g.debugSet([50, 0, 0], [0, 0, 5]);                        // 50 > SUN_R + EARTH_R(=13.4) 且 < 壳半径
  check(shell > 50, '前置：壳已膨胀越过 50 单位', 'shellR=' + shell.toFixed(1));
  g.step(0.1);
  check(st.status === 'burned' && st.culprit === '太阳', '壳内地球被判氦闪吞没', 'status=' + st.status);
})();

console.log('\n=== 推力（脉冲乘波）===');
// 同初态、同满推，脉冲窗口内的推力冲量应显著高于窗口外（物理相同，只差 thrustEff）
// 初速取纯切向、推力沿 +x（径向），此时 vel[0] 即纯推力冲量，避免模长的二阶效应
function thrustGain(targetT) {
  var g = M3D.createGame(); var st = g.state;
  while (st.t < targetT) g.step(0.05);
  g.debugSet([250, 0, 0], [0, 0, 10]);   // 远离各行星影响球，排除捕获/碰撞干扰
  g.setThrust([1, 0, 0], 1);
  g.step(0.1);
  return { dvx: st.vel[0], status: st.status, t: st.t };
}
(function () {
  var off = thrustGain(5);    // 窗口外
  var on = thrustGain(10);    // 第 1 次脉冲窗口（10–11s）
  check(off.status === 'flying' && on.status === 'flying', '推力对比前置：两次均未提前失败', 'off=' + off.status + ' on=' + on.status);
  check(on.dvx > off.dvx * 1.6, '脉冲窗口内推力加成生效', '冲量 ' + off.dvx.toFixed(3) + ' → ' + on.dvx.toFixed(3));
})();

console.log('\n=== 相机（跟拍距离与方向）===');
(function () {
  check(typeof M3D.followDist === 'function', 'app.js 导出 followDist');
  var base = C.CAM_BACK, up = C.CAM_UP, panicMax = C.CAM_PANIC_MAX;
  check(near(M3D.followDist(100, 10), base, 1e-9), '开局（1 AU、壳未胀出）跟拍距离 = 基础值', M3D.followDist(100, 10).toFixed(1));
  // 历史 bug 签名：跟拍距离被无界膨胀的壳半径线性驱动 → 终局相机被推飞、地球缩成一个点
  check(near(M3D.followDist(4200, 1500), M3D.followDist(4200, 10), 1e-9),
    '跟拍距离不随壳半径增长', 'shellR 10→1500 均为 ' + M3D.followDist(4200, 10).toFixed(1));
  // 拉远由「壳逼近」驱动：间隙 > 60 不拉远；间隙 0 拉到上限倍率
  check(near(M3D.followDist(200, 100), base, 1e-9), '壳间隙 100（>60）不拉远', M3D.followDist(200, 100).toFixed(1));
  check(near(M3D.followDist(160, 130), base * 1.3, 1e-9), '壳间隙 30 拉远到 1.3×', M3D.followDist(160, 130).toFixed(1));
  check(near(M3D.followDist(200, 200), base * panicMax, 1e-9), '壳贴脸（间隙 0）拉远到上限 ' + panicMax + '×', M3D.followDist(200, 200).toFixed(1));

  // 跟拍方向 = 地球运动方向（而非「相机停在太阳侧」）；与径向正交即为开局圆轨道的正确表现
  check(typeof M3D.followDir === 'function', 'app.js 导出 followDir');
  var dTan = M3D.followDir([0, 0, 10], [100, 0, 0]);   // 开局：速度沿 +z 切向，径向沿 +x
  check(near(dTan[0], 0, 1e-9) && near(dTan[1], 1, 1e-9), '开局跟拍方向 = 运动方向（切向，与径向正交）',
    '[' + dTan[0].toFixed(2) + ', ' + dTan[1].toFixed(2) + ']');
  var dRad = M3D.followDir([10, 0, 0], [100, 0, 0]);   // 后期：速度沿径向向外
  check(near(dRad[0], 1, 1e-9) && near(dRad[1], 0, 1e-9), '径向外飞时跟拍方向 = 运动方向',
    '[' + dRad[0].toFixed(2) + ', ' + dRad[1].toFixed(2) + ']');
  var dZero = M3D.followDir([0, 0, 0], [100, 0, 0]);   // 退化：速度近零
  check(near(dZero[0], 1, 1e-9) && near(dZero[1], 0, 1e-9), '速度退化时回退径向（不抖动）',
    '[' + dZero[0].toFixed(2) + ', ' + dZero[1].toFixed(2) + ']');

  // 地球屏幕占比 = 角直径 / 垂直视场角（60°）；全程不应缩成小点
  var FOV_DEG = 60;
  function screenPct(rSun, shellR) {
    var d = Math.hypot(M3D.followDist(rSun, shellR), up);
    return (2 * Math.atan(W.EARTH_R / d) * 180 / Math.PI) / FOV_DEG * 100;
  }
  var samples = [[100, 10], [200, 30], [920, 158], [4200, 1500], [200, 200]];
  var minPct = Infinity;
  for (var i = 0; i < samples.length; i++) minPct = Math.min(minPct, screenPct(samples[i][0], samples[i][1]));
  check(minPct >= 5, '全程地球占屏高 ≥ 5%（不缩成小点）', '最小 ' + minPct.toFixed(1) + '%');

  // 跟拍距离不得越过太阳表面
  var overSun = 0;
  for (var j = 0; j < samples.length; j++) {
    if (M3D.followDist(samples[j][0], samples[j][1]) > Math.max(14, samples[j][0] - W.SUN_R)) overSun++;
  }
  check(overSun === 0, '跟拍距离不越过太阳表面', samples.length + ' 个采样点全部满足');

  // 构图：注视点沿运动方向前移，使地球不居中而落在画面中心偏下
  // 纵向位置（相对半高比例，负数 = 偏下）= -(camUp·ahead) / (D'²·tan(fov/2))，D' = |注视点 - 机位|
  function dropRatio(camBack, camUp) {
    var ahead = camBack * C.CAM_LOOK_AHEAD;
    var dp = Math.hypot(camBack + ahead, camUp);
    return -(camUp * ahead) / (dp * dp * Math.tan(C.CAM_FOV * Math.PI / 360));
  }
  check(C.CAM_LOOK_AHEAD > 0, '注视点前移量 > 0（地球偏下的成因）', String(C.CAM_LOOK_AHEAD));
  var drBase = dropRatio(C.CAM_BACK, C.CAM_UP);
  check(drBase < -0.12 && drBase > -0.32, '地球不居中：明显位于画面中心偏下', (drBase * 100).toFixed(1) + '% 半高');
  var drFar = dropRatio(C.CAM_BACK * C.CAM_PANIC_MAX, C.CAM_UP);
  check(drFar < -0.08 && drFar > -0.32, '氦闪拉远后地球仍在中心偏下', (drFar * 100).toFixed(1) + '% 半高');
})();

console.log('\n=== 地球模型（行星发动机）===');
(function () {
  check(typeof M3D.engineLayout === 'function', 'app.js 导出 engineLayout');
  var slots = M3D.engineLayout();
  var shell = W.EARTH_R * C.ENGINE_SHELL;
  var back = 0, radiusOk = 0, aligned = 0, sx = 0, sy = 0, sz = 0;
  for (var i = 0; i < slots.length; i++) {
    var p = slots[i].pos, d = slots[i].dir;
    if (p[2] < 0) back++;
    if (near(Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]), shell, 1e-6)) radiusOk++;
    if (near(d[0] * C.ENGINE_AXIS[0] + d[1] * C.ENGINE_AXIS[1] + d[2] * C.ENGINE_AXIS[2], 1, 1e-9)) aligned++;
    sx += d[0]; sy += d[1]; sz += d[2];
  }
  check(slots.length === C.ENGINE_COUNT, '发动机数量 = ENGINE_COUNT', slots.length + ' 台');
  check(back === slots.length, '全部装在 -Z 半球（地球背面）', back + '/' + slots.length);
  check(radiusOk === slots.length, '安装半径统一 = EARTH_R × ENGINE_SHELL',
    shell.toFixed(2) + '（大气 ' + (W.EARTH_R * 1.06).toFixed(2) + '，在地表外）');
  // 关键回归：朝向必须一律平行朝后。历史 bug 是取球面法线朝外 → 赤道附近与 -Z 夹角达 87°，净推力只剩 0.53
  check(aligned === slots.length, '喷流一律平行朝后（不随球面法线发散）', aligned + '/' + slots.length + ' 台与 -Z 夹角 0°');
  var net = Math.sqrt(sx * sx + sy * sy + sz * sz) / slots.length;
  check(near(net, 1, 1e-9), '净推力方向完全同向（无互相抵消）', '合成 ' + net.toFixed(3) + '（修复前 0.525）');
})();

console.log('\n=== 输入（拖动映射）===');
(function () {
  check(typeof M3D.screenDragToWorld === 'function', 'app.js 导出 screenDragToWorld');
  // 世界推力方向相对「相机前向」的夹角（向右为正，单位度）
  function relDeg(dir, fx, fz) {
    var d = Math.atan2(-dir[0], dir[2]) * 180 / Math.PI - Math.atan2(-fx, fz) * 180 / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }
  var dUp = M3D.screenDragToWorld(0, -100, 0, 1);      // 相机前向 = +z，向上拖
  check(near(dUp[0], 0, 1e-9) && near(dUp[2], 1, 1e-9),
    '向上拖 = 相机前向（沿运动方向加速）', '[' + dUp[0].toFixed(2) + ', ' + dUp[2].toFixed(2) + ']');
  var dRight = M3D.screenDragToWorld(100, 0, 0, 1);    // 向右拖
  check(near(dRight[0], -1, 1e-9) && near(dRight[2], 0, 1e-9),
    '向右拖 = 相机右向', '[' + dRight[0].toFixed(2) + ', ' + dRight[2].toFixed(2) + ']');
  // 关键回归：拖动角必须 1:1 映射（各向同性）。旧实现「相机基 + y 归零」会把 30° 拖成 51.8°、45° 拖成 65.6°
  var r30 = relDeg(M3D.screenDragToWorld(50, -86.6, 0, 1), 0, 1);
  check(near(r30, 30, 0.5), '斜拖 30° → 世界 30°（旧实现偏到 51.8°）', r30.toFixed(1) + '°');
  var r45 = relDeg(M3D.screenDragToWorld(70.71, -70.71, 0, 1), 0, 1);
  check(near(r45, 45, 0.5), '斜拖 45° → 世界 45°（旧实现偏到 65.6°）', r45.toFixed(1) + '°');
  var r45b = relDeg(M3D.screenDragToWorld(70.71, -70.71, 0.6, 0.8), 0.6, 0.8);
  check(near(r45b, 45, 0.5), '相机前向有偏角时同样保真（相对前向 45°）', r45b.toFixed(1) + '°');
  check(M3D.screenDragToWorld(100, 0, 0, 0) === null, '相机接近垂直俯视时返回 null（无有效映射）');
  check(M3D.screenDragToWorld(0, 0, 0, 1) === null, '零位移拖动返回 null');
})();

console.log('\n=== 过热系统 ===');
(function () {
  var g = M3D.createGame(), st = g.state;
  check(st.heat === 0 && st.overheated === false, '开局温度 0、未锁定', 'heat=' + st.heat);
  // 持续满推 → 烧到过热锁定（理论 HEAT_MAX / HEAT_RATE 秒）
  g.setThrust([1, 0, 0], 1);
  for (var i = 0; i < 4000 && !st.overheated; i++) g.step(0.05);
  var theory = C.HEAT_MAX / C.HEAT_RATE;
  check(st.overheated === true, '持续满推会烧到过热锁定', 't=' + st.t.toFixed(2) + 's');
  check(Math.abs(st.t - theory) < 0.2, '过热耗时与常量一致', '实测 ' + st.t.toFixed(2) + 's / 理论 ' + theory.toFixed(2) + 's');
  check(st.thrustEff === 0, '锁定期间推力效率为 0（按着也推不动）', 'eff=' + st.thrustEff);
  // 锁定期间仍按着 → 温度不下降（必须松手才降温，否则「一直拖」没有代价）
  var h0 = st.heat;
  g.step(0.5);
  check(st.heat >= h0 - 1e-9, '锁定期间按着不降温（必须松手）', h0.toFixed(1) + ' → ' + st.heat.toFixed(1));
  // 松手后才开始降温，且必须归零才解锁
  g.setThrust(null, 0);
  g.step(0.5);
  check(st.heat < h0, '松手后才开始降温', h0.toFixed(1) + ' → ' + st.heat.toFixed(1));
  var unlockedEarly = false, coolSteps = 0;
  while (st.overheated && coolSteps < 4000) {
    g.step(0.05); coolSteps++;
    if (!st.overheated && st.heat > 1e-9) unlockedEarly = true;
  }
  check(st.overheated === false, '冷却归零后自动解锁', 'heat=' + st.heat.toFixed(3));
  check(!unlockedEarly, '解锁时温度必须已归零（不会中途解锁）');
  check(st.thrustEff === 1, '解锁后推力效率恢复 1', 'eff=' + st.thrustEff);
})();

// 未过热时可以随时断续使用：效率恒为 1，不再随余量线性衰减
(function () {
  var g = M3D.createGame(), st = g.state;
  var bad = 0, n = 0;
  for (var k = 0; k < 24; k++) {
    g.setThrust([1, 0, 0], 1); g.step(0.05); n++; if (st.thrustEff !== 1) bad++;
    g.setThrust(null, 0); g.step(0.05); n++; if (st.thrustEff !== 1) bad++;
  }
  check(bad === 0, '未过热时推力效率恒为 1（断续推不衰减）', n + ' 个采样点全部为 1');
  check(st.overheated === false && st.heat > 0 && st.heat < C.HEAT_MAX, '断续推不会过热', 'heat=' + st.heat.toFixed(1));
})();

console.log('\n=== 胜负 ===');
// 逃逸比 ≥ 1 且飞出 42 AU 判胜利
(function () {
  var g = M3D.createGame(); var st = g.state;
  g.debugSet([4500, 0, 0], [0, 0, 80]); // 45 AU 高速
  g.step(0.1);
  check(st.status === 'escaped', '逃逸比≥1且飞出42AU判逃逸成功', 'status=' + st.status + ' esc=' + st.escapeRatio.toFixed(2));
})();

// 模拟玩家路径：脉冲窗口内必推；其余用「80% 松手 / 55% 续推」的迟滞管理温度（径向向外）
function playRadialWithHeatPolicy(steps, dt) {
  var g = M3D.createGame(); var st = g.state;
  var HOT = C.HEAT_MAX * 0.8, COLD = C.HEAT_MAX * 0.55;
  var push = true;
  for (var i = 0; i < steps && st.status === 'flying'; i++) {
    if (st.overheated) push = false;
    else if (inPulse(st.t)) push = true;
    else if (push && st.heat >= HOT) push = false;
    else if (!push && st.heat <= COLD) push = true;
    var px = st.pos[0], pz = st.pos[2], pr = Math.sqrt(px * px + pz * pz) || 1;
    if (push) g.setThrust([px / pr, 0, pz / pr], 1);
    else g.setThrust(null, 0);
    g.step(dt);
  }
  return st;
}

// 玩家核心路径可达成：逃出冥王星（42 AU）
let T_GOOD = 0;
(function () {
  var st = playRadialWithHeatPolicy(2000, 0.1);
  T_GOOD = st.t;
  check(st.status === 'escaped', '控温+脉冲乘波逃出冥王星（不限时）', 'status=' + st.status + ' t=' + st.t.toFixed(1) + 's rSun=' + (st.rSun / W.AU).toFixed(2) + 'AU esc=' + st.escapeRatio.toFixed(2));
})();

// 帧率无关：60fps 步进下同一策略同样逃出（子步积分不应依赖帧率）
(function () {
  var st = playRadialWithHeatPolicy(12000, 1 / 60);
  check(st.status === 'escaped', '60fps 步进下同一策略仍逃出（帧率无关）', 'status=' + st.status + ' t=' + st.t.toFixed(1) + 's rSun=' + (st.rSun / W.AU).toFixed(2) + 'AU');
})();

// 无脑一直按着：烧满后按着不降温 → 永久锁定，推力再也不会恢复，被壳吞没
(function () {
  var g = M3D.createGame(); var st = g.state;
  for (var i = 0; i < 4000 && st.status === 'flying'; i++) {
    var px = st.pos[0], pz = st.pos[2], pr = Math.sqrt(px * px + pz * pz) || 1;
    g.setThrust([px / pr, 0, pz / pr], 1);
    g.step(0.1);
  }
  check(st.status !== 'escaped', '无脑满推逃不出（烧满后按着不降温 → 永久锁定）',
    'status=' + st.status + ' t=' + st.t.toFixed(1) + 's rSun=' + (st.rSun / W.AU).toFixed(2) + 'AU');
  check(st.overheated === true, '无脑满推最终停在过热锁定状态', 'heat=' + st.heat.toFixed(1));
})();

// 只在脉冲窗口推、其余时间一律停机：推力总量太少，逃出时间被拖长一个量级
(function () {
  var g = M3D.createGame(); var st = g.state;
  for (var i = 0; i < 6000 && st.status === 'flying'; i++) {
    var px = st.pos[0], pz = st.pos[2], pr = Math.sqrt(px * px + pz * pz) || 1;
    if (inPulse(st.t)) g.setThrust([px / pr, 0, pz / pr], 1);
    else g.setThrust(null, 0);
    g.step(0.1);
  }
  check(st.status === 'escaped', '只乘波也能逃出（推力总量够）', 'status=' + st.status + ' t=' + st.t.toFixed(1) + 's');
  check(st.t > T_GOOD * 1.5, '但只乘波明显慢于控温节奏（脉冲只有 5 秒推力窗口）', st.t.toFixed(1) + 's vs 控温 ' + T_GOOD.toFixed(1) + 's（' + (st.t / T_GOOD).toFixed(2) + '×）');
})();

// 不限时：任何时刻都不会出现「时间耗尽」失败（唯一死线是氦闪壳）
(function () {
  var g = M3D.createGame(); var st = g.state;
  g.debugSet([W.AU * 40, 0, 0], [0, 0, 3]);
  for (var i = 0; i < 3000 && st.status === 'flying'; i++) g.step(0.1);
  check(st.status !== 'timeout', '不限时：不存在「时间耗尽」失败', 'status=' + st.status + ' t=' + st.t.toFixed(1) + 's');
})();

console.log('\n=== 汇总 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail + ' / 共 ' + (pass + fail));
process.exit(fail > 0 ? 1 : 0);
