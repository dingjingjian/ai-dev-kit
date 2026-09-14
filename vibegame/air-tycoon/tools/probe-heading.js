#!/usr/bin/env node
/*
 * probe-heading.js —— 飞机朝向体检：检测「倒着飞」
 *
 * 为什么需要它：
 *   飞机朝向是**屏幕空间**的旋转量（billboard + 绕视轴旋转），画面上表现为
 *   「有些飞机倒着飞」。这个症状用像素体检查不出来（飞机还在、还在动、只是姿态错），
 *   也无头功能断言覆盖不到（那段代码在 render.js 里、依赖 THREE 与相机）。
 *   故单独做一支探针：**用真实 three.js 复算 render.js 的朝向公式**，
 *   把「机头方向」与「真实速度方向」点乘，dot < 0 就是倒着飞。
 *
 * 三个判据：
 *   ① 朝向一致率  dot(nose, velocity) > 0 的相位占比（应 = 100%）
 *   ② 投影可辨识  |sx,sy| 过小 → atan2 退化 → 姿态乱跳（机头正对/背对相机时）
 *   ③ 帧间跳变    相邻相位之间的朝向角差（应连续，不出现 180° 突翻）
 *
 * 用法：node tools/probe-heading.js [--verbose]
 *   退出码非 0 = 检出倒飞或退化。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

/* ── 以最小 global 加载项目脚本（geo/data 无 THREE 依赖） ── */
var sandbox = { console: console, Math: Math };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['src/data.js', 'src/geo.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});

/* ── 真实 three.js（只用到数学部分，无需 DOM） ── */
var threeSrc = fs.readFileSync(path.join(ROOT, 'assets/three.min.js'), 'utf8');
var threeBox = { console: console };
threeBox.window = threeBox;
threeBox.self = threeBox;
threeBox.globalThis = threeBox;
vm.createContext(threeBox);
vm.runInContext(threeSrc, threeBox, { filename: 'three.min.js' });
var THREE = threeBox.THREE;
if (!THREE) { console.error('无法加载 three.js'); process.exit(2); }

var AT = sandbox.AT;
var G = AT.geo;

/* ── 与 render.js 一致的常量 ── */
var R = 1.6;                 // 球半径（render.js 的 R）
var PLANE_LIFT = 1.024;
var PLANE_PERIOD = 14;

/* 相机：与 render.js applyCam 一致 */
function makeCamera(theta, phi, radius) {
  var cam = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 5000);
  var sp = Math.sin(phi);
  cam.position.set(radius * sp * Math.sin(theta), radius * Math.cos(phi), radius * sp * Math.cos(theta));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

/* ── 复算 render.js 的朝向 ──
 * mode 'prod'   ：走生产路径（G.legAt 定方向 + 采样点允许外推），即当前源码
 * mode 'legacy' ：复刻修复前的错误公式，作为**内置反例** ——
 *                 探针必须能检出它，否则「探针通过」没有任何证明力。 */
var _q = new THREE.Quaternion(), _axis = new THREE.Vector3();
var _right = new THREE.Vector3(), _up = new THREE.Vector3();
var noseLocal = new THREE.Vector3(0, 1, 0);   // 贴图机头在局部 +Y（UV + flipY 实证）

function headingAt(ca, cb, u, cam, mode) {
  var t, fwd;
  if (mode === 'prod') {
    var leg = G.legAt(u);                  // ← 生产代码
    t = leg.t; fwd = leg.fwd;
  } else {
    t = u < 0.5 ? u * 2 : (1 - u) * 2;
    fwd = (t < 0.5) ? 1 : -1;              // ← 修复前的错误：拿位置判方向
  }

  var r = R * (PLANE_LIFT + Math.sin(t * Math.PI) * 0.035);
  var v = G.gcPoint(ca, cb, t, r);

  var tf = t + 0.015 * fwd;
  if (mode !== 'prod') tf = Math.max(0, Math.min(1, tf));   // 旧实现夹取采样点
  var vf = G.gcPoint(ca, cb, tf, r);

  // 切向（去掉法向分量）
  var dirX = vf.x - v.x, dirY = vf.y - v.y, dirZ = vf.z - v.z;
  var nx = v.x / r, ny = v.y / r, nz = v.z / r;
  var dn = dirX * nx + dirY * ny + dirZ * nz;
  dirX -= dn * nx; dirY -= dn * ny; dirZ -= dn * nz;

  // 投到相机的屏幕基
  var rt = _right.setFromMatrixColumn(cam.matrixWorld, 0);
  var up = _up.setFromMatrixColumn(cam.matrixWorld, 1);
  var sx = dirX * rt.x + dirY * rt.y + dirZ * rt.z;
  var sy = dirX * up.x + dirY * up.y + dirZ * up.z;
  var ang = Math.atan2(sy, sx) - Math.PI / 2;

  var q = new THREE.Quaternion().copy(cam.quaternion);
  q.multiply(_q.setFromAxisAngle(_axis.set(0, 0, 1), ang));
  var nose = noseLocal.clone().applyQuaternion(q);

  var dmag = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

  return {
    t: t, fwd: fwd, ang: ang, nose: nose,
    pos: new THREE.Vector3(v.x, v.y, v.z),
    sx: sx, sy: sy, mag: Math.sqrt(sx * sx + sy * sy),
    /* 屏幕平面内的分量占比 = |sin θ|（θ 为切向与视轴夹角）。
     * 这是**无量纲**的退化度量：趋近 0 说明飞机几乎正对/背对相机，
     * 屏幕上「机头指哪」不可测，atan2 的输入变成数值噪声。
     * 渲染层用同一个量做退化保护（见 render.js 的 DEGEN_SIN）。 */
    sinT: dmag > 1e-12 ? Math.sqrt(sx * sx + sy * sy) / dmag : 0,
    dmag: dmag
  };
}

/* 渲染层的退化阈值（render.js 的 DEGEN_SIN）——探针按同一口径统计，避免两处口径漂移 */
var DEGEN_SIN = 0.05;

/* 真实速度方向：对相位 u 做中心差分得到位移，即「飞机实际往哪飞」 */
function velocityDir(ca, cb, u, cam) {
  var e = 1e-4;
  function posAt(uu) {
    var uu2 = (uu + 1) % 1;
    var t = uu2 < 0.5 ? uu2 * 2 : (1 - uu2) * 2;
    var r = R * (PLANE_LIFT + Math.sin(t * Math.PI) * 0.035);
    var v = G.gcPoint(ca, cb, t, r);
    return new THREE.Vector3(v.x, v.y, v.z);
  }
  return posAt(u + e).sub(posAt(u - e)).normalize();
}

/* ────────────────── 场景矩阵 ────────────────── */
var CITIES = AT.CITIES_BY_ID;
var ROUTES = [
  ['C01', 'C03', '短途·东亚'],
  ['C09', 'C13', '长途·跨大西洋'],
  ['C01', 'C14', '长途·跨太平洋'],
  ['C21', 'C23', '南半球'],
  ['C17', 'C09', '中程·欧亚'],
  ['C05', 'C21', '近赤道']
];

/* ⚠ 自检：场景集为空时绝不能「静默通过」——那是最危险的假绿。
 *   本探针首版就踩过：城市 id 写错（用了 SHA/TYO 而项目里是 C01/C03），
 *   过滤后 0 条航线，输出「0 组场景 / 0 倒飞」并被误读成「没问题」。
 *   故：解析结果必须先做形态与数量断言，再喂给下游检查。 */
var missing = ROUTES.filter(function (r) { return !CITIES[r[0]] || !CITIES[r[1]]; });
if (missing.length) {
  console.error('探针失效：以下航线引用了不存在的城市 id → '
    + missing.map(function (r) { return r[0] + '-' + r[1]; }).join(', '));
  console.error('（可用的城市 id 形如 C01…C24，请核对 src/data.js）');
  process.exit(4);
}
if (ROUTES.length < 6) {
  console.error('探针失效：场景集仅 ' + ROUTES.length + ' 条航线，覆盖不足');
  process.exit(4);
}
console.log('（城市 id 自检通过：' + ROUTES.length + ' 条航线全部命中）');


var VIEWS = [
  [0.9, 1.15, 7.4, '默认视角'],
  [0.0, 1.15, 7.4, '赤道正面'],
  [0.0, 0.35, 7.4, '俯视北极'],
  [Math.PI / 2, 1.45, 7.4, '近地平线'],
  [2.4, 0.8, 5.6, '贴近特写']
];

var STEPS = 720;
var verbose = process.argv.indexOf('--verbose') >= 0;

function analyze(mode) {
  var worst = { back: 0, degenerate: 0, flip: 0, badFlip: 0, cases: [] };
  VIEWS.forEach(function (vw) {
    var cam = makeCamera(vw[0], vw[1], vw[2]);
    ROUTES.forEach(function (rt) {
      var ca = CITIES[rt[0]], cb = CITIES[rt[1]];
      var back = 0, degen = 0, flip = 0, badFlip = 0;
      var minSin = 1e9, degenSin = 0;
      var prevNose = null, maxFlip = 0, flipAt = [], badFlipAt = [];
      var backAt = [];
      for (var i = 0; i < STEPS; i++) {
        var u = i / STEPS;
        var h = headingAt(ca, cb, u, cam, mode);
        var vel = velocityDir(ca, cb, u, cam);
        var dot = h.nose.dot(vel);
        if (dot < 0) { back++; if (backAt.length < 4) backAt.push(u.toFixed(3)); }
        if (h.mag < 1e-4) degen++;
        if (h.sinT < minSin) minSin = h.sinT;
        if (h.sinT < DEGEN_SIN) degenSin++;

        /* 帧间突翻：跳过首帧（无前一帧可比）。剩下的突翻要分两类 ——
         *   · 航段掉头（u≈0 或 u≈0.5，飞机正在城市上空「到港即离港」）→ 180° 反转是预期行为；
         *   · 其他地方突翻 → 真 bug（姿态在弧中间无理由翻向）。
         * 分开统计是为了让「预期的那一次掉头」不会掩盖住意外的翻转。 */
        if (prevNose && i > 1) {
          var d = prevNose.angleTo(h.nose);
          if (d > maxFlip) maxFlip = d;
          if (d > Math.PI * 0.66) {
            flip++;
            if (flipAt.length < 4) flipAt.push(u.toFixed(3));
            var isTurn = (Math.abs(u - 0.5) < 0.01) || (u < 0.01) || (u > 0.99);
            if (!isTurn) { badFlip++; if (badFlipAt.length < 4) badFlipAt.push(u.toFixed(3)); }
          }
        }
        prevNose = h.nose;
      }
      worst.minSin = Math.min(worst.minSin == null ? 1e9 : worst.minSin, minSin);
      if (back > worst.back) worst.back = back;
      if (degen > worst.degenerate) worst.degenerate = degen;
      if (flip > worst.flip) worst.flip = flip;
      if (badFlip > worst.badFlip) worst.badFlip = badFlip;
      worst.cases.push({
        view: vw[3], route: rt[2], key: rt[0] + '-' + rt[1],
        back: back, degen: degen, flip: flip, badFlip: badFlip,
        minSin: minSin, degenSin: degenSin,
        maxFlipDeg: (maxFlip * 180 / Math.PI).toFixed(0),
        backAt: backAt, flipAt: flipAt, badFlipAt: badFlipAt
      });
    });
  });
  return worst;
}

/* ────────────────── 输出 ────────────────── */
function pct(n) { return (n / STEPS * 100).toFixed(1) + '%'; }

function report(title, res) {
  console.log('\n' + '═'.repeat(72));
  console.log('  ' + title);
  console.log('═'.repeat(72));
  var bad = res.cases.filter(function (c) { return c.back || c.degen || c.badFlip; });
  console.log('  场景 ' + res.cases.length + ' 组（' + ROUTES.length + ' 航线 × ' + VIEWS.length + ' 视角），'
    + '每组扫描 ' + STEPS + ' 个相位');
  console.log('  倒飞最严重：' + res.back + ' / ' + STEPS + ' 相位（' + pct(res.back) + '）');
  console.log('  投影退化最多：' + res.degenerate + ' / ' + STEPS + ' 相位');
  var worstSin = res.cases.reduce(function (a, c) { return Math.min(a, c.minSin); }, 1e9);
  var degenPhases = res.cases.reduce(function (a, c) { return Math.max(a, c.degenSin); }, 0);
  console.log('  |sinθ| 最小：' + worstSin.toFixed(4)
    + '（< ' + DEGEN_SIN + ' 即机头几乎正对/背对相机）'
    + ' · 单场景最多 ' + degenPhases + ' 个相位不可测');
  console.log('  帧间突翻最多：' + res.flip + ' 相位（最大转角 '
    + (res.cases.reduce(function (a, c) { return Math.max(a, +c.maxFlipDeg); }, 0)) + '°）'
    + '  其中非掉头位置：' + res.badFlip);
  if (bad.length) {
    console.log('\n  异常场景（前 12 条）：');
    console.log('    ' + '航线'.padEnd(20) + '视角'.padEnd(14) + '倒飞'.padEnd(12) + '退化'.padEnd(8) + '意外突翻');
    bad.slice(0, 12).forEach(function (c) {
      console.log('    ' + (c.key + ' ' + c.route).padEnd(20)
        + c.view.padEnd(14)
        + (c.back + ' (' + (c.back / STEPS * 100).toFixed(0) + '%)').padEnd(14)
        + String(c.degen).padEnd(10) + c.badFlip);
    });
  }
  if (verbose) {
    console.log('\n  全场景明细：');
    res.cases.forEach(function (c) {
      console.log('    ' + (c.key + ' ' + c.route).padEnd(20) + c.view.padEnd(14)
        + '倒飞 ' + String(c.back).padEnd(5) + '退化 ' + String(c.degen).padEnd(5)
        + '突翻 ' + String(c.flip).padEnd(5) + '意外 ' + String(c.badFlip).padEnd(5)
        + '最大转角 ' + c.maxFlipDeg + '°'
        + (c.flipAt.length ? ' 翻于 u=' + c.flipAt.join(',') : ''));
    });
  }
  return bad;
}

console.log('air-tycoon 飞机朝向体检（真实 three.js 复算 render.js 公式）');

var legacy = analyze('legacy');
var badLegacy = report('① 反例：修复前的错误公式（fwd 由弧上位置 t 推导 + 采样夹取）', legacy);

var prod = analyze('prod');
var badProd = report('② 生产代码：G.legAt 定方向 + 采样点允许外推', prod);

console.log('\n' + '═'.repeat(72));
if (!badLegacy.length) {
  console.log('  探针失效：内置反例未被检出 —— 说明探针已不能发现倒飞，结论不可信。');
  console.log('═'.repeat(72));
  process.exit(4);
}
if (badProd.length) {
  console.log('  结论：生产代码仍有倒飞 / 退化，见上方 ②。');
  console.log('═'.repeat(72));
  process.exit(1);
}
console.log('  结论：✓ 探针有效（检出反例 '
  + legacy.back + '/' + STEPS + ' 相位倒飞）；'
  + '✓ 生产代码 0 倒飞、0 退化。');
console.log('═'.repeat(72));
process.exit(0);
