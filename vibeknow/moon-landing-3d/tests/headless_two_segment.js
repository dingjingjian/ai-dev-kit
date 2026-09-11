'use strict';
// ============================================================
//  无头自检：完整跑通「双箭发射」两段式登月任务时序
//  - 用 vm 沙箱 + 桩渲染器加载 math.js / craft.js / mission.js
//  - 校验：阶段事件顺序、无 NaN、两次发射各自入轨、交会对接先于船器分离、
//    着陆 rm-MR ≈ 1.7
//  运行：node tests/headless_two_segment.js
// ============================================================
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

// ---- 沙箱：window 指向自身，供 IIFE 挂载 M3D ----
const sandbox = { Math: Math, Float32Array: Float32Array, Uint16Array: Uint16Array, console: console };
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(ASSETS, file), 'utf8'), sandbox, { filename: file });
}

load('math.js');           // 定义 M3D.mat4 / M3D.vec3

// ---- geom 桩（engine.js 依赖 WebGL，测试里用空几何替代）----
function emptyGeom() {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint16Array(0) };
}
sandbox.M3D.geom = {
  cone: emptyGeom, cylinder: emptyGeom, box: emptyGeom, sphere: emptyGeom, torus: emptyGeom,
  lathe: emptyGeom, ring: emptyGeom, disk: emptyGeom, arcPatch: emptyGeom, fin: emptyGeom
};

load('craft.js');          // 定义 buildCZ10 / buildPad / updatePartTransforms / updateDetached + 常量
load('mission.js');        // 定义 createMissionSystem

const M3D = sandbox.M3D;

// ---- 桩渲染器 ----
function makeRenderer() {
  return {
    createMesh: function (geo, color, opts) {
      opts = opts || {};
      return {
        geometry: geo, color: color,
        modelMatrix: M3D.mat4.identity(M3D.mat4.create()),
        visible: true, alpha: 1, glow: 0, group: opts.group || 'scene', texture: null,
        atmo: 0, atmoShader: false, atmoMode: 0, fill: 0, blend: 'alpha', cull: 'back',
        depthWrite: true, isEarth: false, isCloud: false
      };
    },
    createTexture: function (url, cb) { if (cb) cb(true); return {}; },
    particles: { spawn: function () {}, spawnSmoke: function () {}, update: function () {}, reset: function () {} },
    project: function () {},
    camera: { up: [0, 1, 0], eye: [0, 0, 0], target: [0, 0, 0], fov: 0.9, near: 0.1, far: 1000 },
    light: { dir: [0, 1, 0] },
    setClearColor: function () {}, isLost: function () { return false; },
    render: function () {}, resize: function () {}, getTime: function () { return 0; }
  };
}

// ---- 断言工具 ----
let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.error('  FAIL: ' + msg); } else { console.log('  ok  : ' + msg); } }
function approx(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, msg + ' (got ' + a.toFixed(4) + ', want ' + b + ' ±' + eps + ')'); }

// ---- 组装场景 ----
const renderer = makeRenderer();
const rocket = M3D.buildCZ10(renderer);
const pad = M3D.buildPad(renderer);

const phaseLog = [];
let touchdown = false;
const mission = M3D.createMissionSystem(renderer, rocket, pad, {
  onPhase: function (key) { phaseLog.push(key); },
  onTouchdown: function () { touchdown = true; }
});
const S = mission.state;
const parts = rocket.parts;

// ---- 部件分组与几何辅助（用于校验两段式构型）----
function byGroup(g) { return parts.filter(p => p.detachGroup === g); }
function getPart(name) { return parts.filter(p => p.name === name)[0]; }
function centroidOf(list) { let s = 0; for (const p of list) s += p.baseY + p.centerY; return list.length ? s / list.length : 0; }
const G = {
  booster: byGroup('booster'), stage1: byGroup('stage1'), stage2: byGroup('stage2'),
  fairing: byGroup('fairing'), lander: byGroup('lander'), ship: byGroup('ship'),
  tower: byGroup('tower'), panel: byGroup('panel')
};
const allVisible = list => list.every(p => p.mesh.visible);
const noneVisible = list => list.every(p => !p.mesh.visible);
const svc0 = getPart('svcModule').baseY;      // 复位后的原始 baseY（baseY0）
const baseY0 = parts.map(p => p.baseY);       // 全部件初始 baseY 快照（createMissionSystem 内部已 reset）

// ---- 真实构型核对：长征十号为三级半，芯一级 7 台 + 两个助推器各 7 台 = 起飞 21 台 ----
const nozCoreList = parts.filter(p => p.name.indexOf('nozCore') === 0);
const nozBoost0 = parts.filter(p => p.name.indexOf('boostNoz0_') === 0);
const nozBoost1 = parts.filter(p => p.name.indexOf('boostNoz1_') === 0);
ok(nozCoreList.length === 7, '芯一级 7 台发动机（实际 ' + nozCoreList.length + '）');
ok(nozBoost0.length === 7 && nozBoost1.length === 7, '两枚助推器各 7 台发动机（实际 ' + nozBoost0.length + '/' + nozBoost1.length + '）');
ok(nozCoreList.length + nozBoost0.length + nozBoost1.length === 21,
  '起飞共 21 台发动机（实际 ' + (nozCoreList.length + nozBoost0.length + nozBoost1.length) + '）');
approx(getPart('svcModule').baseY, 8.40, 1e-9, '梦舟服务舱坐在整流罩内基准面（罩底 8.40）');

const MR = M3D.MOON.R, MC = M3D.MOON.center, EC = M3D.EARTH.center;

const cam = {
  yaw: 0.42, pitch: 0.06, distance: 22, fitEarth: 5200, fitSystem: 60000, fitMoon: 2400,
  targetX: 0, targetY: rocket.center, targetZ: 0, shake: 0, up: [0, 1, 0], eye: [0, 0, 0]
};

// ---- NaN 巡检 ----
let nanReport = null;
function scanNaN(tag) {
  if (nanReport) return;
  const nums = ['x', 'y', 'r', 'theta', 'vr', 'vt', 'alpha', 'tilt', 'tiltVis', 'scale', 'met', 'psi', 'rm', 'parkPsi', 'focus', 'progress', 'moonAlt', 'speed', 'distMoon', 'distEarth'];
  for (const k of nums) { if (typeof S[k] === 'number' && !isFinite(S[k])) { nanReport = tag + ': state.' + k + ' = ' + S[k]; return; } }
  const cn = ['targetX', 'targetY', 'targetZ', 'distance', 'yaw', 'pitch'];
  for (const k of cn) { if (!isFinite(cam[k])) { nanReport = tag + ': cam.' + k + ' = ' + cam[k]; return; } }
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].mesh.modelMatrix;
    for (let j = 0; j < 16; j++) { if (!isFinite(m[j])) { nanReport = tag + ': part[' + parts[i].name + '].modelMatrix[' + j + '] = ' + m[j]; return; } }
  }
}

// ---- 主循环：完整跑完两段式任务 ----
mission.ignite();
mission.setHoldWarp(!process.env.NOWARP);   // 默认长按加速；NOWARP=1 跑正常速度
const dt = 1 / 60;
let steps = 0;
const MAX = 80000;
let sawSegment2 = false, sawParked = false, sawDocked = false, dockStep = -1, landerSepStep = -1;
let seg1LunarOrbit = false, seg2LunarOrbit = false, sawApproach = false;
let metRegress = null, dockJump = -1, sepJump = -1, prevMet = -Infinity, prevLaPos = null;
let tliTrack = null, transitSpeed = -1;   // 地月转移轨迹 / 速度衔接采样（第一次发射）
let shipSepRef = null, shipSepDev = 0, shipSepAlpha = 1;   // 船器分离后飞船是否保持整体刚体
let prevPos = null, prevPhaseLoi = '';
const snap = {};

while (!S.landed && steps < MAX) {
  mission.update(dt, cam);
  mission.updateDetachedParts(dt);
  mission.directCamera(cam, dt);
  // 复刻 app.js 的 updateParts
  M3D.updatePartTransforms(parts, {
    rotY: 0, explode: 0, launchY: S.y, launchX: S.x, tilt: S.tiltVis,
    launchT: S.t, scale: S.scale, fade: S.inserted ? 0.12 : 0.17
  });
  scanNaN('step ' + steps + ' phase=' + S.phase);
  if (nanReport) break;

  // ---- 遥测时钟单调性 / 对接平滑性 / 真实相位巡检 ----
  if (S.met < prevMet - 0.5) metRegress = 'step ' + steps + ' (' + S.phase + '): ' + prevMet.toFixed(0) + ' -> ' + S.met.toFixed(0);
  prevMet = S.met;
  var laM = getPart('landerAscent').mesh.modelMatrix;
  var djCur = 0;
  if (prevLaPos) djCur = Math.hypot(laM[12] - prevLaPos[0], laM[13] - prevLaPos[1], laM[14] - prevLaPos[2]);
  prevLaPos = [laM[12], laM[13], laM[14]];
  if (S.docked && !sawDocked) dockJump = djCur;                 // 交会 → 对接帧
  if (S.phase === 'descent' && sepJump < 0) sepJump = djCur;    // 船器分离 → 动力下降帧
  if (S.phase === 'approach') sawApproach = true;
  // 近月制动段：机头应顺着航迹（姿态收敛需随加速倍率同步，否则滞后明显）
  // 采样点放在近月制动中后段（DUR.loi = 12 s，取 phaseT > 7 s），
  // 校验的是「姿态已追上航迹」，而不是刚切入时的正常调姿过程
  if (!snap.loiAlign && S.phase === 'loi' && prevPhaseLoi === 'loi' && prevPos && S.phaseT > 7) {
    var ldx = S.x - prevPos[0], ldy = S.y - prevPos[1], lL = Math.hypot(ldx, ldy);
    if (lL > 1e-6) {
      var hx2 = Math.sin(S.tiltVis), hy2 = Math.cos(S.tiltVis);
      snap.loiAlign = Math.acos(Math.max(-1, Math.min(1, (hx2 * ldx + hy2 * ldy) / lL))) * 180 / Math.PI;
    }
  }
  prevPos = [S.x, S.y]; prevPhaseLoi = S.phase;

  // ---- 地月转移（TLI）轨迹采样：应「切向加速为主」，末速度与转移段起点衔接 ----
  if (S.phase === 'tli' && S.segment === 1) {
    const rho = Math.hypot(S.x - EC[0], S.y - EC[1]);
    const ang = Math.atan2(S.x - EC[0], S.y - EC[1]);
    if (!tliTrack) tliTrack = { prevRho: rho, prevAng: ang, rad: 0, arc: 0, speedEnd: 0 };
    else {
      tliTrack.rad += Math.abs(rho - tliTrack.prevRho);
      tliTrack.arc += rho * Math.abs(ang - tliTrack.prevAng);
      tliTrack.prevRho = rho; tliTrack.prevAng = ang;
    }
    tliTrack.speedEnd = S.speed;
  }
  if (tliTrack && transitSpeed < 0 && S.phase === 'transit' && S.segment === 1) transitSpeed = S.speed;

  if (S.segment === 2) sawSegment2 = true;

  // ---- 船器分离后：梦舟必须「整体」漂离（不得逐块散开），且不淡出消失 ----
  if (S.phase === 'descent' || S.phase === 'approach') {
    if (!shipSepRef) {
      shipSepRef = G.ship.map(p => { const m = p.mesh.modelMatrix; return [m[12], m[13], m[14]]; });
    } else {
      for (let i = 0; i < G.ship.length; i++) for (let j = i + 1; j < G.ship.length; j++) {
        const a = G.ship[i].mesh.modelMatrix, b = G.ship[j].mesh.modelMatrix;
        const d = Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]);
        const d0 = Math.hypot(shipSepRef[i][0] - shipSepRef[j][0], shipSepRef[i][1] - shipSepRef[j][1], shipSepRef[i][2] - shipSepRef[j][2]);
        shipSepDev = Math.max(shipSepDev, Math.abs(d - d0));
      }
      for (const p of G.ship) shipSepAlpha = Math.min(shipSepAlpha, p.mesh.alpha);
    }
  }
  if (S.landerParked) sawParked = true;
  if (S.phase === 'lunarOrbit' && S.segment === 1) seg1LunarOrbit = true;
  if (S.phase === 'lunarOrbit' && S.segment === 2) seg2LunarOrbit = true;
  if (S.docked && !sawDocked) { sawDocked = true; dockStep = steps; }
  if (S.phase === 'descent' && landerSepStep < 0) landerSepStep = steps;

  // ---- 构型快照 ----
  if (!snap.seg1Ascent && S.segment === 1 && S.phase === 'burn1') {
    const landerBody = G.lander.filter(p => p.name.indexOf('leg') !== 0);
    const legs = G.lander.filter(p => p.name.indexOf('leg') === 0);
    snap.seg1Ascent = {
      shipHidden: noneVisible(G.ship), towerHidden: noneVisible(G.tower), panelHidden: noneVisible(G.panel),
      coreVisible: allVisible(G.booster) && allVisible(G.stage1) && allVisible(G.stage2),
      fairingVisible: allVisible(G.fairing), landerBodyVisible: allVisible(landerBody), legsHidden: noneVisible(legs)
    };
  }
  if (!snap.seg2Ascent && S.segment === 2 && S.phase === 'burn1') {
    snap.seg2Ascent = {
      svcBaseY: getPart('svcModule').baseY,
      shipVisible: allVisible(G.ship), towerVisible: allVisible(G.tower),
      fairingVisible: allVisible(G.fairing), panelHidden: noneVisible(G.panel),
      landerHidden: noneVisible(G.lander),
      coreVisible: allVisible(G.booster) && allVisible(G.stage1) && allVisible(G.stage2),
      towerSkirtY: getPart('towerSkirt').baseY, fairingTopY: getPart('fairingR').baseY + 2.05
    };
  }
  if (!snap.seg2Insert && S.segment === 2 && S.inserted) {
    snap.seg2Insert = { panelVisible: allVisible(G.panel) };
  }
  // 第一次发射 TLI 后：着陆器质心应恰落在活动体原点（质心运行期求值 / 两级重定基自洽）
  if (!snap.seg1Transit && S.segment === 1 && S.phase === 'transit') {
    snap.seg1Transit = { landerCentroid: centroidOf(G.lander), focus: S.focus };
  }
  // 第二次发射环月段：驻留着陆器应位于环月轨道半径处
  if (!snap.parkedPos && S.segment === 2 && S.landerParked && S.phase === 'lunarOrbit') {
    const mp = getPart('landerAscent').mesh.modelMatrix;
    const d = Math.hypot(mp[12] - MC[0], mp[13] - MC[1]);
    snap.parkedPos = { dist: d, alpha: getPart('landerAscent').mesh.alpha };
  }
  // 对接后：着陆器解除驻留、接合到飞船前方
  if (!snap.docked && S.docked) {
    snap.docked = {
      landerParked: S.landerParked,
      landerAttached: G.lander.every(p => !p.detached && !p.parked),
      landerCentroid: centroidOf(G.lander),
      shipCentroid: centroidOf(G.ship)
    };
  }
  steps++;
}

// ============ 校验 ============
console.log('\n=== 运行结果 ===');
console.log('总步数: ' + steps + ' (上限 ' + MAX + ')');
console.log('阶段序列: ' + phaseLog.join(' -> '));

ok(nanReport === null, '全程无 NaN' + (nanReport ? ' [' + nanReport + ']' : ''));
ok(S.landed === true, '任务完成：已着陆 (landed=true)');
ok(steps < MAX, '在步数上限内完成');
ok(touchdown === true, 'onTouchdown 回调触发');
ok(sawApproach, '着陆末段进入 approach 相位（真实相位，而非仅字幕）');
ok(metRegress === null, 'MET 全程单调不回退（含入轨 / 环月段）' + (metRegress ? ' [' + metRegress + ']' : ''));
ok(dockJump >= 0 && dockJump < 1.5,
  '交会→对接着陆器位置连续（对接帧跳变 ' + (dockJump < 0 ? 'n/a' : dockJump.toFixed(3)) + ' < 1.5 单位，仅含驻留体正常环月位移）');
ok(shipSepDev < 0.05,
  '船器分离后梦舟整体漂离、不散架（部件相对位置变化 ' + shipSepDev.toFixed(3) + ' < 0.05 单位）');
ok(shipSepAlpha > 0.99,
  '船器分离后梦舟保持可见、不淡出（最低 alpha ' + shipSepAlpha.toFixed(2) + '）');
ok(sepJump >= 0 && sepJump < 1.5,
  '对接→船器分离连续（着陆器成为独立活动体时跳变 ' + (sepJump < 0 ? 'n/a' : sepJump.toFixed(3)) + ' < 1.5 单位）');
ok(snap.loiAlign !== undefined && snap.loiAlign < 25,
  '近月制动段机头顺着航迹（夹角 ' + (snap.loiAlign === undefined ? 'n/a' : snap.loiAlign.toFixed(1)) + '° < 25°）');

// 位置校验
approx(S.rm - MR, 1.7, 0.02, '着陆时 rm - MR ≈ 1.7');
const landDist = Math.hypot(S.x - MC[0], S.y - MC[1]);
approx(landDist - MR, 1.7, 0.05, '着陆器世界位置距月心 - MR ≈ 1.7');

// 两段式结构
ok(sawSegment2, '进入第二次发射 (segment=2)');
ok(sawParked, '着陆器曾驻留环月轨道 (landerParked)');
ok(seg1LunarOrbit, '第一次发射到达环月轨道');
ok(seg2LunarOrbit, '第二次发射到达环月轨道');
ok(sawDocked, '发生交会对接 (docked=true)');

// 阶段顺序
function idx(k, from) { for (let i = (from || 0); i < phaseLog.length; i++) if (phaseLog[i] === k) return i; return -1; }
const iIgn1 = idx('ignition');
const iTrans = idx('transition');
const iIgn2 = idx('ignition', iTrans + 1);
ok(iIgn1 === 0, '首个事件为 ignition（第一次发射点火）');
ok(iTrans > 0, 'transition（段间过渡）已触发');
ok(iIgn2 > iTrans, '第二次发射 ignition 在 transition 之后');

// 第一次发射：有整流罩分离、无逃逸塔分离
const iTowerSep1 = idx('towerSep');
const iFairingSep = idx('fairingSep');
ok(iFairingSep > 0 && iFairingSep < iTrans, '第一次发射含 fairingSep（整流罩分离）');
ok(iTowerSep1 < 0 || iTowerSep1 > iTrans, '第一次发射不含 towerSep（无逃逸塔）');

// 着陆器就位 → 过渡
const iPark = idx('landerPark');
ok(iPark > 0 && iPark < iTrans, 'landerPark（着陆器就位）在 transition 之前');

// 第二次发射：有逃逸塔分离、无整流罩分离
const iTowerSep2 = idx('towerSep', iTrans + 1);
const iFairingSep2 = idx('fairingSep', iTrans + 1);
ok(iTowerSep2 > iTrans, '第二次发射含 towerSep（逃逸塔分离）');
ok(iFairingSep2 > iTrans, '第二次发射含 fairingSep（载人构型为「逃逸塔 + 整流罩」）');

// 交会 → 对接 → 船器分离 → 下降 → 着陆
const iRend = idx('rendezvous'), iDock = idx('docking'), iLSep = idx('landerSep');
const iDescent = idx('descent'), iApproach = idx('approach'), iLanding = idx('landing'), iLanded = idx('landed');
ok(iRend > iTrans, 'rendezvous（交会）在第二次发射内');
ok(iDock > iRend, 'docking（对接）在 rendezvous 之后');
ok(iLSep > iDock, 'landerSep（船器分离）在 docking 之后（对接先于分离）');
ok(iDescent > iLSep, 'descent 在 landerSep 之后');
ok(iApproach > iDescent, 'approach 在 descent 之后');
ok(iLanding > iApproach, 'landing 在 approach 之后');
ok(iLanded > iLanding, 'landed 在 landing 之后');
ok(dockStep >= 0 && landerSepStep > dockStep, '运行时序：对接步 (' + dockStep + ') 早于下降步 (' + landerSepStep + ')');

// 每次发射都应经历完整上升 → 入轨 → 转移 → 环月
const parkCount = phaseLog.filter(k => k === 'parkOrbit').length;
const lorbCount = phaseLog.filter(k => k === 'lunarOrbit').length;
const transitCount = phaseLog.filter(k => k === 'transit').length;
ok(parkCount === 2, 'parkOrbit 触发两次（两次发射各一次），实际 ' + parkCount);
ok(lorbCount === 2, 'lunarOrbit 触发两次（两次发射各一次），实际 ' + lorbCount);
ok(transitCount === 2, 'transit 触发两次（两次发射各一次），实际 ' + transitCount);
ok(idx('stage2Sep') < idx('transit') && idx('transit') < idx('loi'), '第一次发射 stage2Sep < transit < loi');

// 地月转移：真实 TLI 是「近地点切向加速 + 椭圆滑行」，不是垂直抬升；
// 末速度还必须与地月转移段起点严格衔接（否则遥测在切换帧跳变）。
ok(!!tliTrack && tliTrack.arc > tliTrack.rad * 1.5,
  '地月转移以切向加速为主（切向弧长 ' + (tliTrack ? tliTrack.arc.toFixed(0) : 'n/a') +
  ' > 径向位移 ' + (tliTrack ? tliTrack.rad.toFixed(0) : 'n/a') + ' × 1.5）');
ok(!!tliTrack && transitSpeed > 0 && Math.abs(transitSpeed - tliTrack.speedEnd) < 100,
  'TLI 末速度与地月转移段起点衔接（' + (tliTrack ? tliTrack.speedEnd.toFixed(0) : 'n/a') + ' → ' +
  (transitSpeed > 0 ? transitSpeed.toFixed(0) : 'n/a') + ' m/s，跳变 < 100）');

// 上升段子事件顺序（第一次发射）
ok(idx('liftoff') < idx('pitch') && idx('pitch') < idx('maxQ'), '第一次发射 liftoff < pitch < maxQ');
ok(idx('boosterSep') < idx('stage1Sep') && idx('stage1Sep') < idx('stage2Ignition'), '第一次发射 boosterSep < stage1Sep < stage2Ignition');
ok(idx('stage2Ignition') < idx('parkOrbit'), '第一次发射 stage2Ignition < parkOrbit');

// MET 单调性抽查：着陆时 MET 应约 10 天量级
ok(S.met > 800000 && S.met < 900000, '着陆 MET 处于第二次发射后区间（约 10 天），实际 ' + Math.round(S.met));

// ---- 构型快照校验 ----
const MLORB = M3D.MOON.orbitR;
console.log('\n=== 构型快照 ===');
ok(!!snap.seg1Ascent, '捕获第一次发射上升段快照');
if (snap.seg1Ascent) {
  ok(snap.seg1Ascent.shipHidden, '第一次发射：飞船隐藏');
  ok(snap.seg1Ascent.towerHidden, '第一次发射：逃逸塔隐藏');
  ok(snap.seg1Ascent.panelHidden, '第一次发射：太阳翼隐藏');
  ok(snap.seg1Ascent.coreVisible, '第一次发射：助推/芯一级/二级可见');
  ok(snap.seg1Ascent.fairingVisible, '第一次发射：整流罩可见');
  ok(snap.seg1Ascent.landerBodyVisible, '第一次发射：着陆器舱体可见（藏于罩内）');
  ok(snap.seg1Ascent.legsHidden, '第一次发射：着陆腿收起隐藏');
}
ok(!!snap.seg2Ascent, '捕获第二次发射上升段快照');
if (snap.seg2Ascent) {
  approx(snap.seg2Ascent.svcBaseY, svc0, 1e-9, '第二次发射：飞船基准高度与构型①一致（都在罩内，无下移）');
  ok(snap.seg2Ascent.shipVisible, '第二次发射：梦舟飞船可见（罩内）');
  ok(snap.seg2Ascent.towerVisible, '第二次发射：逃逸塔可见');
  ok(snap.seg2Ascent.fairingVisible, '第二次发射：整流罩可见（包住梦舟）');
  ok(snap.seg2Ascent.landerHidden, '第二次发射：揽月着陆器隐藏');
  ok(snap.seg2Ascent.panelHidden, '第二次发射上升段：太阳翼尚未展开');
  ok(snap.seg2Ascent.coreVisible, '第二次发射：助推/芯一级/二级可见（复原）');
  approx(snap.seg2Ascent.towerSkirtY, snap.seg2Ascent.fairingTopY, 0.05, '第二次发射：逃逸塔坐在整流罩顶端');
}
ok(!!snap.seg2Insert, '捕获第二次发射入轨快照');
if (snap.seg2Insert) ok(snap.seg2Insert.panelVisible, '第二次发射入轨后：太阳翼展开');
ok(!!snap.seg1Transit, '捕获第一次发射地月转移快照');
if (snap.seg1Transit) {
  approx(snap.seg1Transit.landerCentroid, 0, 1e-6, '第一次发射 TLI 后：着陆器质心即活动体原点（质心运行期求值自洽）');
  approx(snap.seg1Transit.focus, 0, 1e-9, '第一次发射 TLI 后：focus 归零到活动体质心');
}
ok(!!snap.parkedPos, '捕获驻留着陆器环月位置快照');
if (snap.parkedPos) {
  approx(snap.parkedPos.dist, MLORB, 6, '驻留着陆器位于环月轨道半径处');
  approx(snap.parkedPos.alpha, 1, 0.02, '驻留着陆器随月球完全显现 (alpha≈1)');
}
ok(!!snap.docked, '捕获对接后快照');
if (snap.docked) {
  ok(snap.docked.landerParked === false, '对接后：着陆器解除驻留');
  ok(snap.docked.landerAttached, '对接后：着陆器接合为活动体（非分离/非驻留）');
  ok(snap.docked.landerCentroid > snap.docked.shipCentroid + 0.5,
    '对接后：着陆器位于飞船前方（对接机构在飞船头部） (lander ' + snap.docked.landerCentroid.toFixed(2) + ' > ship ' + snap.docked.shipCentroid.toFixed(2) + ')');
  approx(snap.docked.landerCentroid, mission.DOCK_GAP, 1e-6,
    '对接后：着陆器质心恰在飞船前方 DOCK_GAP=' + mission.DOCK_GAP + ' 处（两器实体不穿插）');
}

// ---- reset 完整性：restoreAll 必须撤销全部再归零与飞船下移，可重复播放 ----
console.log('\n=== reset 完整性 ===');
mission.reset();
let maxBaseYDrift = 0;
for (let i = 0; i < parts.length; i++) maxBaseYDrift = Math.max(maxBaseYDrift, Math.abs(parts[i].baseY - baseY0[i]));
approx(maxBaseYDrift, 0, 1e-9, 'reset 后全部件 baseY 复原（无残留再归零 / 下移）');
ok(parts.every(p => !p.parked), 'reset 后无部件处于 parked 状态');
ok(parts.every(p => !p.detached), 'reset 后无部件处于 detached 状态');
ok(S.segment === 1 && S.metBase === 0 && S.landerParked === false && S.docked === false, 'reset 后回到第一次发射初始状态');
ok(S.x === 0 && S.y === 0, 'reset 后世界坐标归零（飞行中切回展示 / 拆解时箭体回到原点可见）');
// 可视化高度 / 速度也必须归零：app 层用 altVis 决定发射台淡入淡出，
// 若沿用上一轮飞行末端的高度（约 1100），重新观看时整个倒计时都看不到发射台。
ok(S.altVis === 0 && S.alt === 0 && S.speed === 0,
  'reset 后 altVis / alt / speed 归零（重新观看时发射台正常显示），实际 ' + S.altVis + ' / ' + S.alt + ' / ' + S.speed);
ok(getPart('svcModule').baseY === svc0, 'reset 后飞船服务舱 baseY 复原（下移已撤销）');

// ---- 展示 / 拆解：两枚长征十号构型切换 ----
console.log('\n=== 构型切换 ===');
const landerBody = G.lander.filter(p => p.name.indexOf('leg') !== 0);
mission.setVariant(1);
ok(noneVisible(G.ship) && noneVisible(G.tower) && noneVisible(G.panel), '构型①：飞船 / 逃逸塔 / 太阳翼隐藏');
ok(allVisible(G.fairing) && allVisible(landerBody), '构型①：整流罩 + 揽月着陆器可见');
approx(getPart('svcModule').baseY, svc0, 1e-9, '构型①：飞船不下移（baseY 为原始值）');
mission.setVariant(2);
ok(allVisible(G.ship) && allVisible(G.tower) && allVisible(G.fairing), '构型②：梦舟飞船 + 逃逸塔 + 整流罩可见（罩内梦舟、罩顶逃逸塔）');
ok(noneVisible(G.lander) && noneVisible(G.panel), '构型②：着陆器 / 太阳翼隐藏');
approx(getPart('svcModule').baseY, svc0, 1e-9, '构型②：飞船基准高度与构型①一致（都在罩内）');
ok(S.variant === 2 && S.segment === 2, 'setVariant 同步 state.variant / state.segment');
mission.setVariant(1);
ok(noneVisible(G.ship) && allVisible(G.fairing) && parts.every(p => !p.parked && !p.detached),
  '构型可重复切换：切回构型①无残留状态');

console.log('\n=== 汇总 ===');
console.log('检查项: ' + checks + '，失败: ' + failures);
if (failures > 0) { console.error('\nTEST FAILED'); process.exit(1); }
console.log('\nTEST PASSED');
