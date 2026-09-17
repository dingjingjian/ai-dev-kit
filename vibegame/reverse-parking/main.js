/* =============================================================================
 * 倒车入库模拟 · main.js
 * 设计文档：DESIGN.md（唯一真源）
 * 兼容基线：Android 8.1 出场 Chrome / WebView 61（ES2017），零外部资源
 *
 * 文件结构：
 *   §1 常量与关卡数据        §2 程序化贴图 / 材质工厂     §3 世界场景（地面/库位/环境）
 *   §4 车模与座舱内饰        §5 视图与后视镜             §6 玩法（物理/输入/判定/计分）
 *   §7 音效（WebAudio 现场合成）  §8 UI 与主循环
 * ========================================================================== */
"use strict";

/* ============================ §1 常量与关卡数据 ============================ */

var DEG = Math.PI / 180;
var CAR_L = 2.6;          // 轴距
var CAR_LEN = 4.5;        // 车长
var CAR_W = 1.8;          // 车宽
var WHEEL_R = 0.33;       // 轮胎半径
var DELTA_MAX = 35 * DEG; // 前轮最大转角
var V_MAX = 3.2;          // 最大速度 m/s
var V_REV = 2.0;          // 倒车最大速度
var ACCEL = 2.2, BRAKE = 8, DRAG = 1.8;

var SKY_TOP = 0x2f6ea8, SKY_BOT = 0xcfe0ea;

var LEVELS = [
  { id: 1, name: "直线倒车", short: "直线", bay: { x: 0, y: 0, w: 3.0, h: 5.0, theta: 0 }, start: { x: 0, y: 9, theta: Math.PI / 2 }, timeLimit: 0, tip: "挂 <b>R</b> 挡，按住油门，看后视镜压住库口两角，直线倒入后停车" },
  { id: 2, name: "右倒库", short: "右倒库", bay: { x: 1.5, y: 0, w: 2.5, h: 5.0, theta: 0 }, start: { x: -1.5, y: 9, theta: Math.PI / 2 }, timeLimit: 60, tip: "直倒至<b>右后视镜见库角</b>时向右打满，车身进库后回正" },
  { id: 3, name: "左倒库", short: "左倒库", bay: { x: -1.5, y: 0, w: 2.5, h: 5.0, theta: 0 }, start: { x: 1.5, y: 9, theta: Math.PI / 2 }, timeLimit: 60, tip: "直倒至<b>左后视镜见库角</b>时向左打满，车身进库后回正" },
  { id: 4, name: "侧方停车", short: "侧方", bay: { x: 0, y: 0, w: 6.6, h: 2.4, theta: Math.PI / 2 }, start: { x: -3.2, y: 3.2, theta: 0 }, timeLimit: 90, tip: "与前车尾部平齐后<b>右打满</b>倒车，车尾进库回正，再<b>左打满</b>摆正车头" },
  { id: 5, name: "斜角入库", short: "斜角", bay: { x: 0, y: 0, w: 2.6, h: 5.0, theta: 45 * DEG }, start: { x: -5, y: 7, theta: Math.PI / 2 }, timeLimit: 60, tip: "库位斜置，先调整车头朝向与库口平行，再倒入" },
  { id: 6, name: "限时挑战", short: "限时", bay: { x: 1.5, y: 0, w: 2.5, h: 5.0, theta: 0 }, start: { x: -1.5, y: 9, theta: Math.PI / 2 }, timeLimit: 30, tip: "30 秒内完成右倒库，考的是熟练度" },
  { id: 7, name: "窄库精停", short: "窄库", bay: { x: 1.5, y: 0, w: 2.1, h: 5.0, theta: 0 }, start: { x: -1.5, y: 9, theta: Math.PI / 2 }, timeLimit: 60, tip: "库宽仅 2.1m，左右各留不足 15cm，方向要提前回正" },
  { id: 8, name: "移库挑战", short: "移库", bay: { x: 1.5, y: 0, w: 2.5, h: 5.0, theta: 0 }, start: { x: -1.5, y: 0, theta: Math.PI / 2 }, timeLimit: 120, challenge: true, tip: "二进二倒，从 A 库移到相邻的 B 库（不压线）" }
];

var state = {
  screen: "menu",
  levelIdx: 0,
  practice: false,
  view: "cockpit",   // cockpit | chase
  lookBack: false,   // 座舱视角回头看
  mirrorLook: 0,     // 0 前视 / 1 左镜 / 2 内镜 / 3 右镜
  overlayMap: false, // 跟车视角下的小地图
  stars: loadStars(),
  settings: { map: false, autoCenter: true, predict: true, autoLook: true, tip: true, sfx: true, lowQ: false },
  isRecord: false
};

var sim = {
  x: 0, y: 0, theta: 0, v: 0, delta: 0, gear: "N",
  steerInput: 0, throttle: 0, brake: 0,
  elapsed: 0, modifyCount: 0, lastDeltaSign: 0, pressCount: 0, wasPress: false,
  finished: false, failed: false, failReason: "", running: false,
  completeTime: 0, wheelSpin: 0
};

var keys = {};
var btnState = { left: false, right: false, gas: false, brake: false };
var look = { yaw: 0, pitch: 0 };   // 玩家拖动环顾
var camYawSmooth = 0, camLookSmooth = 0;

function loadStars() { try { return JSON.parse(localStorage.getItem("rp_stars") || "{}"); } catch (e) { return {}; } }
function saveStars() { try { localStorage.setItem("rp_stars", JSON.stringify(state.stars)); } catch (e) { } }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function normAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function $(id) { return document.getElementById(id); }

/* ======================== §2 程序化贴图 / 材质工厂 ======================== */

var HAS_SRGB = (typeof THREE.sRGBEncoding !== "undefined");
var TEX_CACHE = {};

function cv(size) {
  var c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}
function texFromCanvas(canvas, rx, ry) {
  var t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 1;
  if (HAS_SRGB) t.encoding = THREE.sRGBEncoding;
  return t;
}
// 确定性伪随机，保证每次进入场景纹理一致
function rnd(seed) {
  var s = seed;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** 沥青地坪：深灰底 + 骨料颗粒 + 轻微色块 + 细裂纹 */
function texAsphalt() {
  if (TEX_CACHE.asphalt) return TEX_CACHE.asphalt;
  var S = 256, c = cv(S), g = c.getContext("2d"), r = rnd(97);
  g.fillStyle = "#4a4f55"; g.fillRect(0, 0, S, S);
  var i, x, y, s;
  for (i = 0; i < 240; i++) { // 大色块（修补痕迹）
    x = r() * S; y = r() * S; s = 18 + r() * 46;
    g.fillStyle = "rgba(255,255,255," + (0.012 + r() * 0.02).toFixed(3) + ")";
    g.beginPath(); g.arc(x, y, s, 0, 6.2832); g.fill();
  }
  for (i = 0; i < 5200; i++) { // 骨料颗粒
    x = r() * S; y = r() * S; s = 0.4 + r() * 1.5;
    var l = r();
    g.fillStyle = l > 0.72 ? "rgba(226,230,234," + (0.05 + r() * 0.16).toFixed(3) + ")"
      : l > 0.34 ? "rgba(24,26,30," + (0.06 + r() * 0.2).toFixed(3) + ")"
        : "rgba(120,126,134," + (0.04 + r() * 0.1).toFixed(3) + ")";
    g.beginPath(); g.arc(x, y, s, 0, 6.2832); g.fill();
  }
  g.strokeStyle = "rgba(20,22,26,0.30)"; g.lineWidth = 1; // 细裂纹
  for (i = 0; i < 5; i++) {
    g.beginPath();
    x = r() * S; y = r() * S; g.moveTo(x, y);
    for (var k = 0; k < 5; k++) { x += (r() - 0.5) * 46; y += (r() - 0.5) * 46; g.lineTo(x, y); }
    g.stroke();
  }
  var t = texFromCanvas(c, 26, 26);
  TEX_CACHE.asphalt = t;
  return t;
}

/** 混凝土（路缘、挡轮杆、柱） */
function texConcrete() {
  if (TEX_CACHE.concrete) return TEX_CACHE.concrete;
  var S = 128, c = cv(S), g = c.getContext("2d"), r = rnd(311);
  g.fillStyle = "#9a9791"; g.fillRect(0, 0, S, S);
  for (var i = 0; i < 2600; i++) {
    var l = r();
    g.fillStyle = l > 0.6 ? "rgba(255,255,255," + (0.05 + r() * 0.14).toFixed(3) + ")"
      : "rgba(60,58,54," + (0.04 + r() * 0.14).toFixed(3) + ")";
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  var t = texFromCanvas(c, 2, 2);
  TEX_CACHE.concrete = t;
  return t;
}

/** 天空竖直渐变（贴在大球内壁，必须有 fog:false） */
function texSky() {
  if (TEX_CACHE.sky) return TEX_CACHE.sky;
  var c = document.createElement("canvas");
  c.width = 8; c.height = 256;
  var g = c.getContext("2d");
  var grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, "#2b6ba6");
  grd.addColorStop(0.34, "#5b9ecb");
  grd.addColorStop(0.60, "#9dc9dd");
  grd.addColorStop(0.78, "#d8e6ec");
  grd.addColorStop(1.00, "#eef2f2");
  g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (HAS_SRGB) t.encoding = THREE.sRGBEncoding;
  TEX_CACHE.sky = t;
  return t;
}

/** 建筑立面：混凝土框 + 玻璃窗格（随机明暗，模拟反光） */
function texFacade(seed, base, glassDark, glassLight) {
  var key = "facade" + seed;
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  var W = 256, H = 256, c = document.createElement("canvas");
  c.width = W; c.height = H;
  var g = c.getContext("2d"), r = rnd(seed);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  var cols = 8, rows = 8, pw = W / cols, ph = H / rows;
  for (var i = 0; i < cols; i++) {
    for (var j = 0; j < rows; j++) {
      var v = r();
      g.fillStyle = v > 0.62 ? glassLight : glassDark;
      g.fillRect(i * pw + pw * 0.16, j * ph + ph * 0.18, pw * 0.68, ph * 0.58);
      g.fillStyle = "rgba(255,255,255," + (0.05 + r() * 0.14).toFixed(3) + ")";
      g.fillRect(i * pw + pw * 0.16, j * ph + ph * 0.18, pw * 0.68, ph * 0.2);
    }
    g.fillStyle = "rgba(0,0,0,0.10)";
    g.fillRect(i * pw, 0, 1.5, H);
  }
  for (var j2 = 0; j2 <= rows; j2++) { g.fillStyle = "rgba(0,0,0,0.14)"; g.fillRect(0, j2 * ph - 1, W, 2); }
  var t = texFromCanvas(c, 3, 3);
  TEX_CACHE[key] = t;
  return t;
}

/** 条纹贴图：用于雪糕筒（橙白）与标杆（红白） */
function texStripe(colorA, colorB, bands) {
  var key = "stripe" + colorA + colorB + bands;
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  var c = document.createElement("canvas");
  c.width = 16; c.height = 128;
  var g = c.getContext("2d");
  var h = 128 / (bands * 2);
  for (var i = 0; i < bands * 2; i++) {
    g.fillStyle = (i % 2 === 0) ? colorA : colorB;
    g.fillRect(0, i * h, 16, h + 1);
  }
  var t = texFromCanvas(c, 1, 1);
  TEX_CACHE[key] = t;
  return t;
}

/** 径向渐变圆：用作接地软阴影 / 库位光晕 */
function texRadial(inner, outer) {
  var key = "rad" + inner + outer;
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  var c = cv(128), g = c.getContext("2d");
  var grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (HAS_SRGB) t.encoding = THREE.sRGBEncoding;
  TEX_CACHE[key] = t;
  return t;
}

/** 库位编号牌 */
function texPlate(text, bg, fg) {
  var key = "plate" + text + bg + fg;
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  var c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  var g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg;
  g.font = "bold 86px Arial, Helvetica, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 64, 68);
  var t = texFromCanvas(c, 1, 1);
  TEX_CACHE[key] = t;
  return t;
}

/* ========================= §3 世界场景 ========================= */

var renderer, scene, canvas, worldGroup, bayGroup, propGroup;

/** 地面标线合并器：把大量细长矩形/三角合成单个 BufferGeometry，控制 draw call */
function LineBuilder() { this.pos = []; this.idx = []; this.n = 0; }
LineBuilder.prototype.quad = function (ax, az, bx, bz, cx, cz, dx, dz, y) {
  var p = this.pos, i = this.idx, n = this.n;
  p.push(ax, y, az, bx, y, bz, cx, y, cz, dx, y, dz);
  i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  this.n += 4;
  return this;
};
/** 沿 (x0,z0)→(x1,z1) 的带宽线段，hw 为半宽 */
LineBuilder.prototype.seg = function (x0, z0, x1, z1, hw, y) {
  var dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-6) return this;
  dx /= len; dz /= len;
  var nx = -dz * hw, nz = dx * hw;
  return this.quad(x0 + nx, z0 + nz, x1 + nx, z1 + nz, x1 - nx, z1 - nz, x0 - nx, z0 - nz, y);
};
/** 实心三角形（箭头、箭头头部） */
LineBuilder.prototype.tri = function (ax, az, bx, bz, cx, cz, y) {
  var p = this.pos, i = this.idx, n = this.n;
  p.push(ax, y, az, bx, y, bz, cx, y, cz);
  i.push(n, n + 1, n + 2);
  this.n += 3;
  return this;
};
LineBuilder.prototype.mesh = function (mat) {
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
  g.setIndex(this.idx);
  g.computeVertexNormals();
  var m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false;
  return m;
};

function lineMat(color, opacity) {
  return new THREE.MeshLambertMaterial({
    color: color, transparent: opacity < 1, opacity: opacity === undefined ? 1 : opacity,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
  });
}

var MAT = {};
function initMaterials() {
  MAT.asphalt = new THREE.MeshLambertMaterial({ map: texAsphalt() });
  MAT.concrete = new THREE.MeshLambertMaterial({ map: texConcrete() });
  MAT.line = lineMat(0xf2f4f5, 0.96);
  MAT.lineDim = lineMat(0xd8dcdf, 0.72);
  MAT.lineYellow = lineMat(0xf2c948, 0.95);
  MAT.paintRed = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  MAT.paintBlue = new THREE.MeshLambertMaterial({ color: 0x2d6ca8 });
  MAT.metalDark = new THREE.MeshLambertMaterial({ color: 0x59626a });
  MAT.metal = new THREE.MeshLambertMaterial({ color: 0x9aa3ab });
  MAT.pole = new THREE.MeshLambertMaterial({ color: 0xb9c0c6 });
  MAT.thinStripe = new THREE.MeshLambertMaterial({ map: texStripe("#e8e8e8", "#d94f3d", 3) });
  MAT.cone = new THREE.MeshLambertMaterial({ map: texStripe("#e2603c", "#f2f2f2", 2) });
  MAT.coneBase = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  MAT.foliage = new THREE.MeshLambertMaterial({ color: 0x4a7c46, flatShading: true });
  MAT.foliage2 = new THREE.MeshLambertMaterial({ color: 0x3e6b3c, flatShading: true });
  MAT.trunk = new THREE.MeshLambertMaterial({ color: 0x6b5540 });
  MAT.curb = new THREE.MeshLambertMaterial({ color: 0xb4b2ac, map: texConcrete() });
  MAT.shadow = new THREE.MeshBasicMaterial({ map: texRadial("rgba(0,0,0,0.55)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false, opacity: 0.75 });
  MAT.glow = new THREE.MeshBasicMaterial({ map: texRadial("rgba(120,235,190,0.45)", "rgba(120,235,190,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}

function buildSky() {
  var sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 24, 16),
    new THREE.MeshBasicMaterial({ map: texSky(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -1;
  scene.add(sky);
}

function buildGround() {
  var g = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), MAT.asphalt);
  g.rotation.x = -Math.PI / 2;
  scene.add(g);
  MAT.asphalt.map.repeat.set(26, 26);

  var lb = new LineBuilder(), Y = 0.018;
  var i, x;
  // 库位一排（装饰用，目标库位由 buildBay 绘制）：中心距 3.0m
  var bayW = 2.5, pitch = 3.0, baseX = 1.5;
  for (i = -3; i <= 3; i++) {
    if (i === 0) continue;                       // 0 号留给目标库位
    var cx = baseX + i * pitch;
    lb.seg(cx - bayW / 2, 2.5, cx - bayW / 2, -2.5, 0.06, Y);
    lb.seg(cx - bayW / 2, -2.5, cx + bayW / 2, -2.5, 0.06, Y);
    lb.seg(cx + bayW / 2, -2.5, cx + bayW / 2, 2.5, 0.06, Y);
  }
  // 库底外侧的黄色禁停网格线
  for (i = -10; i <= 10; i++) lb.seg(baseX + i * 1.2, -4.4, baseX + i * 1.2 - 1.2, -2.9, 0.05, Y);
  lb.seg(baseX - 12, -4.6, baseX + 12, -4.6, 0.07, Y);
  // 通道两侧车道边线
  lb.seg(baseX - 11.5, 8.6, baseX + 11.5, 8.6, 0.07, Y);
  lb.seg(baseX - 11.5, 3.2, baseX - 2.2, 3.2, 0.07, Y);
  lb.seg(baseX + 2.2, 3.2, baseX + 11.5, 3.2, 0.07, Y);
  // 车道中央虚线
  for (x = -11; x < 11; x += 2.4) lb.seg(baseX + x, 5.9, baseX + x + 1.3, 5.9, 0.06, Y);
  // 库口停止线 + 直行箭头（沿 -z 方向倒车）
  for (i = -1; i <= 1; i++) {
    var acx = baseX + i * pitch;
    lb.seg(acx - 0.9, 3.9, acx + 0.9, 3.9, 0.09, Y);
    lb.seg(acx, 3.1, acx, 4.2, 0.09, Y);
    lb.tri(acx, 5.0, acx - 0.42, 4.4, acx + 0.42, 4.4, Y);
  }
  var linesMesh = lb.mesh(MAT.lineDim);
  linesMesh.position.z = 0;
  worldGroup.add(linesMesh);
}

function makeLamp(x, z) {
  var g = new THREE.Group();
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.2, 10), MAT.pole);
  pole.position.y = 3.6; g.add(pole);
  var arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.11, 0.11), MAT.pole);
  arm.position.set(-0.8, 7.15, 0); g.add(arm);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.42), MAT.metalDark);
  head.position.set(-1.55, 7.05, 0); g.add(head);
  var bulb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
  bulb.position.set(-1.55, 6.96, 0); g.add(bulb);
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.22, 12), MAT.curb);
  base.position.y = 0.11; g.add(base);
  g.position.set(x, 0, z);
  return g;
}

function makeTree(x, z, s) {
  var g = new THREE.Group();
  var tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.9, 7), MAT.trunk);
  tr.position.y = 0.95; g.add(tr);
  var c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 0), MAT.foliage);
  c1.position.y = 2.6; c1.rotation.set(0.4, 0.7, 0.2); g.add(c1);
  var c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), MAT.foliage2);
  c2.position.set(0.55, 3.25, -0.35); g.add(c2);
  g.scale.set(s, s, s);
  g.position.set(x, 0, z);
  return g;
}

function makeBuilding(x, z, w, d, h, seed) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ map: texFacade(seed, "#b9b6ae", "#4a6a80", "#8fb4c8") }));
  body.position.y = h / 2;
  g.add(body);
  var cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), MAT.concrete);
  cap.position.y = h + 0.25; g.add(cap);
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(-x, 30) * 0.25;
  return g;
}

/** 立体停车楼：多层楼板 + 立柱，作为远景轮廓 */
function makeCarPark(x, z) {
  var g = new THREE.Group();
  var W = 16, D = 11, slabs = 3, lh = 2.7;
  for (var i = 0; i < slabs; i++) {
    var slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.28, D), MAT.concrete);
    slab.position.y = i * lh + 0.14; g.add(slab);
    for (var k = 0; k < 4; k++) {
      var col = new THREE.Mesh(new THREE.BoxGeometry(0.42, lh - 0.28, 0.42), MAT.concrete);
      col.position.set((k % 2 ? 1 : -1) * (W / 2 - 0.4), i * lh + lh / 2, (k < 2 ? 1 : -1) * (D / 2 - 0.4));
      g.add(col);
    }
  }
  var roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.34, D + 0.8), MAT.concrete);
  roof.position.y = slabs * lh + 0.2; g.add(roof);
  var parapet = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.7, D + 0.9),
    new THREE.MeshLambertMaterial({ color: 0xa8a49c }));
  parapet.position.y = slabs * lh + 0.62; g.add(parapet);
  g.position.set(x, 0, z);
  return g;
}

function makeCone(x, z) {
  var g = new THREE.Group();
  var b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), MAT.coneBase);
  b.position.y = 0.025; g.add(b);
  var c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.17, 0.62, 12), MAT.cone);
  c.position.y = 0.34; g.add(c);
  g.position.set(x, 0, z);
  return g;
}

/** 车轮挡（挡轮杆） */
function makeWheelStop(x, z) {
  var m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 10), MAT.thinStripe);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, 0.1, z);
  return m;
}

function makeSign(x, z, rotY) {
  var g = new THREE.Group();
  var p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), MAT.pole);
  p1.position.set(-0.45, 1.25, 0); g.add(p1);
  var p2 = p1.clone(); p2.position.x = 0.45; g.add(p2);
  var board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.07), MAT.paintBlue);
  board.position.y = 2.35; g.add(board);
  var glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6),
    new THREE.MeshBasicMaterial({ map: texPlate("P", "#2d6ca8", "#ffffff") }));
  glyph.position.set(0, 2.35, 0.045); g.add(glyph);
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  return g;
}

function buildStaticWorld() {
  var i, x, z;
  buildSky();
  buildGround();

  // 库底外侧绿化带 + 路缘
  var lawn = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.4), new THREE.MeshLambertMaterial({ color: 0x5f7a4a }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.02, -7.2); worldGroup.add(lawn);
  var curb1 = new THREE.Mesh(new THREE.BoxGeometry(26, 0.16, 0.3), MAT.curb);
  curb1.position.set(0, 0.08, -5.5); worldGroup.add(curb1);

  // 通道另一侧路缘
  var curb2 = new THREE.Mesh(new THREE.BoxGeometry(26, 0.16, 0.3), MAT.curb);
  curb2.position.set(0, 0.08, 12.6); worldGroup.add(curb2);

  // 灯柱
  for (i = -1; i <= 1; i++) worldGroup.add(makeLamp(i * 12 - 1.5, -6.2));
  worldGroup.add(makeLamp(-9, 13.6)); worldGroup.add(makeLamp(9, 13.6));

  // 树 + 建筑 + 停车楼
  for (i = 0; i < 5; i++) worldGroup.add(makeTree(-13 + i * 6.5, -8.6, 0.85 + (i % 3) * 0.12));
  for (i = 0; i < 4; i++) worldGroup.add(makeTree(-16 + i * 10.5, 15.4, 0.95 + (i % 2) * 0.15));
  worldGroup.add(makeBuilding(-40, 44, 18, 14, 16, 11));
  worldGroup.add(makeBuilding(42, 48, 22, 15, 12, 23));
  worldGroup.add(makeBuilding(6, 62, 34, 18, 21, 37));
  worldGroup.add(makeBuilding(-15, 68, 26, 16, 17, 53));
  worldGroup.add(makeCarPark(-28, -22));
  worldGroup.add(makeCarPark(30, -20));

  // 库底侧的围栏
  for (x = -13; x <= 13; x += 2.6) {
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.4, 0.09), MAT.metalDark);
    post.position.set(x, 0.7, -9.2); worldGroup.add(post);
  }
  for (i = 0; i < 2; i++) {
    var rail = new THREE.Mesh(new THREE.BoxGeometry(26.4, 0.07, 0.07), MAT.metalDark);
    rail.position.set(0, 1.0 - i * 0.42, -9.2); worldGroup.add(rail);
  }

  // 雪糕筒（通道边桩）
  for (i = -2; i <= 2; i++) if (i !== 0) worldGroup.add(makeCone(i * 4.2 - 1.5, 10.6));
  // 库底挡轮杆（装饰库位）
  for (i = -3; i <= 3; i++) if (i !== 0) worldGroup.add(makeWheelStop(1.5 + i * 3.0, -2.05));
  // 入口指示牌
  worldGroup.add(makeSign(-8.4, 4.6, 0.35));
  worldGroup.add(makeSign(9.2, 4.6, -0.35));
}

/* ---------------------- 库位（每关重新生成） ---------------------- */

function makeMarkerPole() {
  var g = new THREE.Group();
  var p = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.35, 10), MAT.thinStripe);
  p.position.y = 0.68; g.add(p);
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.09, 12), MAT.coneBase);
  base.position.y = 0.045; g.add(base);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
  cap.position.y = 1.39; g.add(cap);
  return g;
}

/** 生成当前关卡的库位：目标库位用亮线高亮，两侧补一个装饰库位形成"一排库"的视觉 */
function buildBay(lvl) {
  while (bayGroup.children.length) bayGroup.remove(bayGroup.children[0]);
  var b = lvl.bay, ct = Math.cos(b.theta), st = Math.sin(b.theta);
  function loc(ux, uy) { return [b.x + ux * ct - uy * st, b.y + ux * st + uy * ct]; }
  var ux = b.w / 2, uy = b.h / 2;
  var c = [loc(-ux, uy), loc(ux, uy), loc(ux, -uy), loc(-ux, -uy)]; // 口左 口右 底右 底左
  lvl._corners = c;

  var lb = new LineBuilder(), Y = 0.022;
  // 目标库位：白色亮线（口 / 右 / 底 / 左）
  lb.seg(c[0][0], c[0][1], c[1][0], c[1][1], 0.065, Y);
  lb.seg(c[1][0], c[1][1], c[2][0], c[2][1], 0.065, Y);
  lb.seg(c[2][0], c[2][1], c[3][0], c[3][1], 0.065, Y);
  lb.seg(c[3][0], c[3][1], c[0][0], c[0][1], 0.065, Y);
  // 库底内侧黄色警示线（库底往前 0.35m）
  var kw = 0.35 / b.h;
  var w1 = loc(-ux, uy - b.h * kw), w2 = loc(ux, uy - b.h * kw);
  lb.seg(w1[0], w1[1], w2[0], w2[1], 0.05, Y);
  bayGroup.add(lb.mesh(MAT.line));

  // 库位地面淡青染色 + 中心倒车箭头
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h),
    new THREE.MeshBasicMaterial({ color: 0x5fd8b0, transparent: true, opacity: 0.10, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = -b.theta;
  floor.position.set(b.x, 0.014, b.y);
  bayGroup.add(floor);

  var lb2 = new LineBuilder();
  var a1 = loc(0, uy - 0.6), a2 = loc(0.30, uy - 1.2), a3 = loc(-0.30, uy - 1.2);
  lb2.tri(a1[0], a1[1], a2[0], a2[1], a3[0], a3[1], 0.02);
  var a4 = loc(0.10, uy - 1.2), a5 = loc(-0.10, uy - 1.2), a6 = loc(-0.10, uy - 2.1), a7 = loc(0.10, uy - 2.1);
  lb2.quad(a4[0], a4[1], a5[0], a5[1], a6[0], a6[1], a7[0], a7[1], 0.02);
  bayGroup.add(lb2.mesh(new THREE.MeshBasicMaterial({
    color: 0x7de6c0, transparent: true, opacity: 0.55, depthWrite: false
  })));

  // 库口地面光晕
  var glow = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 2.4, b.h * 1.1), MAT.glow);
  glow.rotation.x = -Math.PI / 2;
  glow.rotation.z = -b.theta;
  glow.position.set(b.x, 0.03, b.y + 0.2);
  glow.renderOrder = 2;
  bayGroup.add(glow);

  // 库口两角标杆
  bayGroup.add(markerAt(c[0][0], c[0][1]));
  bayGroup.add(markerAt(c[1][0], c[1][1]));

  // 库底编号牌（贴地）
  var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8),
    new THREE.MeshBasicMaterial({ map: texPlate(lvl.short.charAt(0) === "直" ? "1" : String(lvl.id), "#f2f4f5", "#2b3238"), transparent: true }));
  plate.rotation.x = -Math.PI / 2;
  plate.rotation.z = -b.theta;
  var pp = loc(0, uy - 0.15);
  plate.position.set(pp[0], 0.024, pp[1]);
  bayGroup.add(plate);

  function markerAt(x, z) {
    var m = makeMarkerPole();
    m.position.set(x + (x - b.x) * 0.12, 0, z + (z - b.y) * 0.12);
    return m;
  }

  // 相邻库位（左侧 / 右侧各一个，仅作视觉参照）
  var side = new LineBuilder();
  var cosv = ct, sinv = st;
  function locOff(offU, u2, v2) {
    var x = b.x + offU * cosv - u2 * cosv + v2 * sinv;
    var z = b.y + offU * sinv - u2 * sinv - v2 * cosv;
    return [x, z];
  }
  for (var s = -1; s <= 1; s += 2) {
    var off = s * (b.w / 2 + 0.25 + 1.25);
    var q0 = locOff(off, 1.25, b.h / 2), q1 = locOff(off, -1.25, b.h / 2),
      q2 = locOff(off, -1.25, -b.h / 2), q3 = locOff(off, 1.25, -b.h / 2);
    side.seg(q0[0], q0[1], q1[0], q1[1], 0.06, Y);
    side.seg(q1[0], q1[1], q2[0], q2[1], 0.06, Y);
    side.seg(q2[0], q2[1], q3[0], q3[1], 0.06, Y);
    side.seg(q3[0], q3[1], q0[0], q0[1], 0.06, Y);
  }
  bayGroup.add(side.mesh(MAT.lineDim));
}

/* ======================= §4 车模与座舱内饰 ======================= */

/** 把物体局部 +z 轴对准方向 n */
function orientTo(obj, n) {
  var len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
  var nx = n[0] / len, ny = n[1] / len, nz = n[2] / len;
  // 必须先偏航再俯仰，否则 +z 无法对准含 y 分量的方向
  obj.rotation.order = "YXZ";
  obj.rotation.y = Math.atan2(nx, nz);
  var xz = Math.sqrt(nx * nx + nz * nz);
  obj.rotation.x = -Math.atan2(ny, xz);
}

/**
 * 车身下装侧轮廓（x 为纵向：-1 车尾 … 3.6 车头；后轴中心在 x=0）
 * 座舱区域向内挖空到地板高度，这样舱内才是真空腔（否则相机悬在车壳上方，只会看到车漆顶面）
 */
function lowerBodyShape() {
  var s = new THREE.Shape();
  s.moveTo(-0.88, 0.30);
  s.lineTo(3.42, 0.30);      // 底边
  s.lineTo(3.60, 0.66);      // 前保险杠
  s.lineTo(3.46, 0.93);      // 车头上沿
  s.lineTo(2.62, 0.99);      // 引擎盖前段
  s.lineTo(1.62, 1.03);      // 引擎盖后端
  s.lineTo(1.58, 0.46);      // ↓ 座舱前壁（内侧）
  s.lineTo(-0.42, 0.46);     // ← 座舱地板
  s.lineTo(-0.50, 1.03);     // ↑ 座舱后壁（内侧）
  s.lineTo(-0.99, 1.03);     // 后备箱上沿
  s.lineTo(-1.00, 0.62);     // 车尾立面
  s.closePath();
  return s;
}
/** 由四个角点构造四边形面片（座舱玻璃用薄壳，避免实心体包住相机） */
function quadMesh(a, b, c, d, mat) {
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([
    a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]
  ], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function extrudeShape(shape, depth, bevel) {
  var g = new THREE.ExtrudeGeometry(shape, {
    depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 6
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

function makeWheel(front) {
  var pivot = new THREE.Group();          // 转向
  var spin = new THREE.Group();           // 滚动
  var tireMat = new THREE.MeshPhongMaterial({ color: 0x141518, shininess: 12 });
  var tire = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.235, 22, 1), tireMat);
  tire.rotation.x = Math.PI / 2;
  spin.add(tire);
  var sidewall = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.05, 0.05, 6, 20), tireMat);
  sidewall.position.z = 0.118; spin.add(sidewall);
  var sidewall2 = sidewall.clone(); sidewall2.position.z = -0.118; spin.add(sidewall2);
  var rimMat = new THREE.MeshPhongMaterial({ color: 0xb9c0c7, shininess: 90, specular: 0xffffff });
  var rim = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R - 0.09, WHEEL_R - 0.09, 0.24, 18, 1), rimMat);
  rim.rotation.x = Math.PI / 2; spin.add(rim);
  for (var i = 0; i < 5; i++) {
    var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.052, 0.26), rimMat);
    spoke.rotation.z = i * Math.PI * 0.4;
    spin.add(spoke);
  }
  var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.27, 10),
    new THREE.MeshPhongMaterial({ color: 0x3a4046 }));
  cap.rotation.x = Math.PI / 2; spin.add(cap);
  pivot.add(spin);
  pivot.userData.spin = spin;
  return pivot;
}

/**
 * 造车。
 * opts = { color, interior, mirrors }
 * 车体局部坐标：+x 车头，+z 车左（驾驶员侧），原点 = 后轴中心
 */
function makeCar(opts) {
  opts = opts || {};
  var body = new THREE.Group();
  var paintColor = opts.color === undefined ? 0xc73b34 : opts.color;
  var paint = new THREE.MeshPhongMaterial({ color: paintColor, shininess: 70, specular: 0x9aa4ad });
  var paintDark = new THREE.MeshPhongMaterial({ color: 0x2f343a, shininess: 40 });
  var chrome = new THREE.MeshPhongMaterial({ color: 0xd4dbe1, shininess: 120, specular: 0xffffff });
  var trim = new THREE.MeshPhongMaterial({ color: 0x1c1f23, shininess: 30 });
  function glassMat(color, opacity, specular) {
    return new THREE.MeshPhongMaterial({
      color: color, shininess: 120, specular: specular || 0xcfe4f0,
      transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false
    });
  }
  var glassFront = glassMat(0xaecad8, 0.10, 0xe8f4ff);   // 前挡风几乎全透
  var glassSide = glassMat(0x2b4453, 0.52);              // 侧窗带色
  var glassRear = glassMat(0x223845, 0.46);              // 后窗

  // 下装
  var lower = new THREE.Mesh(extrudeShape(lowerBodyShape(), CAR_W - 0.09, 0.045), paint);
  body.add(lower);
  // 座舱玻璃（薄壳：挡风 / 后窗 / 左右侧窗）
  var cz = CAR_W / 2 - 0.09;
  body.add(quadMesh([1.60, 1.01, -cz], [1.60, 1.01, cz], [1.16, 1.45, cz], [1.16, 1.45, -cz], glassFront));
  body.add(quadMesh([-0.04, 1.47, -cz], [-0.04, 1.47, cz], [-0.56, 1.08, cz], [-0.56, 1.08, -cz], glassRear));
  body.add(quadMesh([1.55, 1.05, cz], [-0.48, 1.09, cz], [-0.02, 1.44, cz], [1.16, 1.43, cz], glassSide));
  body.add(quadMesh([-0.48, 1.09, -cz], [1.55, 1.05, -cz], [1.16, 1.43, -cz], [-0.02, 1.44, -cz], glassSide));
  // 车顶
  var roof = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.06, cz * 2 + 0.06), paint);
  roof.position.set(0.56, 1.46, 0); body.add(roof);
  // A / B / C 柱
  function pillar(x, y, len, rotZ) {
    var p = new THREE.Mesh(new THREE.BoxGeometry(0.085, len, 0.075), paintDark);
    p.position.set(x, y, 0);
    p.rotation.z = rotZ;
    return p;
  }
  var pA = [pillar(1.38, 1.23, 0.62, 0.81), pillar(1.38, 1.23, 0.62, 0.81)];
  pA[0].position.z = CAR_W / 2 - 0.10; pA[1].position.z = -CAR_W / 2 + 0.10;
  body.add(pA[0]); body.add(pA[1]);
  var pB = [pillar(0.60, 1.25, 0.46, 0), pillar(0.60, 1.25, 0.46, 0)];
  pB[0].position.z = CAR_W / 2 - 0.10; pB[1].position.z = -CAR_W / 2 + 0.10;
  body.add(pB[0]); body.add(pB[1]);
  var pC = [pillar(-0.30, 1.27, 0.66, 2.21), pillar(-0.30, 1.27, 0.66, 2.21)];
  pC[0].position.z = CAR_W / 2 - 0.10; pC[1].position.z = -CAR_W / 2 + 0.10;
  body.add(pC[0]); body.add(pC[1]);

  // 轮拱装饰
  var archMat = new THREE.MeshPhongMaterial({ color: 0x22262b, shininess: 20 });
  var archGeo = new THREE.TorusGeometry(0.45, 0.048, 6, 18);
  var zs = [CAR_W / 2 - 0.045, -CAR_W / 2 + 0.045];
  for (var a = 0; a < 2; a++) {
    for (var b2 = 0; b2 < 2; b2++) {
      var arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(b2 === 0 ? 2.6 : 0, 0.35, zs[a]);
      arch.scale.set(1, 1, 1);
      body.add(arch);
    }
  }
  // 侧裙 + 门缝 + 门把手
  for (a = 0; a < 2; a++) {
    var skirt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.11, 0.07), paintDark);
    skirt.position.set(0.9, 0.34, zs[a]); body.add(skirt);
    var seam = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.42, 0.02), trim);
    seam.position.set(1.02, 0.80, zs[a] * 1.02); body.add(seam);
    var seam2 = seam.clone(); seam2.position.x = 0.22; body.add(seam2);
    var seam3 = seam.clone(); seam3.position.x = -0.60; body.add(seam3);
    var handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.03), chrome);
    handle.position.set(0.78, 0.97, zs[a] * 1.03); body.add(handle);
    var handle2 = handle.clone(); handle2.position.x = 0.02; body.add(handle2);
  }

  // 车轮
  var wheels = [], spins = [];
  var wheelPos = [[2.6, CAR_W / 2 - 0.08], [2.6, -CAR_W / 2 + 0.08], [0, CAR_W / 2 - 0.08], [0, -CAR_W / 2 + 0.08]];
  for (var w = 0; w < 4; w++) {
    var wh = makeWheel(w < 2);
    wh.position.set(wheelPos[w][0], WHEEL_R, wheelPos[w][1]);
    body.add(wh);
    wheels.push(wh); spins.push(wh.userData.spin);
  }

  // 车灯 / 格栅 / 保险杠 / 车牌
  var headMat = new THREE.MeshPhongMaterial({ color: 0xf3f6f8, shininess: 100, emissive: 0x33383c });
  for (a = 0; a < 2; a++) {
    var hl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.42), headMat);
    hl.position.set(3.44, 0.86, (a === 0 ? 0.5 : -0.5));
    hl.rotation.y = (a === 0 ? -1 : 1) * 0.16;
    body.add(hl);
    var fogl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.22), headMat);
    fogl.position.set(3.53, 0.52, (a === 0 ? 0.55 : -0.55)); body.add(fogl);
  }
  var grille = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.20, 1.02), trim);
  grille.position.set(3.56, 0.82, 0); body.add(grille);
  var grilleBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 1.06), chrome);
  grilleBar.position.set(3.59, 0.88, 0); body.add(grilleBar);
  var grilleBar2 = grilleBar.clone(); grilleBar2.position.y = 0.76; body.add(grilleBar2);
  var bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.34, CAR_W - 0.04), paintDark);
  bumperF.position.set(3.58, 0.50, 0); body.add(bumperF);
  var bumperR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, CAR_W - 0.04), paintDark);
  bumperR.position.set(-1.02, 0.50, 0); body.add(bumperR);
  var plateF = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.42), MAT.paintBlue);
  plateF.position.set(3.72, 0.55, 0); body.add(plateF);
  var plateR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.42), MAT.paintBlue);
  plateR.position.set(-1.14, 0.58, 0); body.add(plateR);

  var brakeLights = [], reverseLights = [];
  for (a = 0; a < 2; a++) {
    var tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.17, 0.46),
      new THREE.MeshPhongMaterial({ color: 0x9c1f1a, shininess: 90, emissive: 0x2a0503 }));
    tl.position.set(-1.02, 0.88, (a === 0 ? 0.56 : -0.56));
    body.add(tl); brakeLights.push(tl);
    var rl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.16),
      new THREE.MeshPhongMaterial({ color: 0xd8dde0, emissive: 0x101314 }));
    rl.position.set(-1.02, 0.72, (a === 0 ? 0.30 : -0.30));
    body.add(rl); reverseLights.push(rl);
  }

  // 接地软阴影
  var shadow = new THREE.Mesh(new THREE.PlaneGeometry(CAR_LEN + 0.6, CAR_W + 0.9), MAT.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(1.28, 0.028, 0);
  shadow.renderOrder = 1;
  body.add(shadow);

  body.userData = {
    spins: spins, wheels: wheels, brakeLights: brakeLights,
    reverseLights: reverseLights, mirrors: [], mirrorCams: []
  };

  if (opts.mirrors !== false) buildCarMirrors(body, !!opts.interior);
  if (opts.interior) buildInterior(body);
  return body;
}

/**
 * 后视镜镜面：独立 RenderTarget + 材质。
 * 平面镜的物理成像 = 朝后看的画面的水平镜像，故对贴图做 U 方向翻转（repeat.x=-1, offset.x=1）。
 */
var MIRROR_RTS = [];
function makeMirrorPane(w, h, px) {
  var py = Math.max(48, Math.round(px * h / w));
  var rt = new THREE.WebGLRenderTarget(px, py, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true
  });
  if (HAS_SRGB) rt.texture.encoding = THREE.sRGBEncoding;
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.repeat.set(-1, 1);
  rt.texture.offset.set(1, 0);
  var mat = new THREE.MeshBasicMaterial({ map: rt.texture });
  // 渲染某面镜子时，该镜面自身必须换成不透明黑，否则形成 Framebuffer/Texture 反馈环
  var dark = new THREE.MeshBasicMaterial({ color: 0x0e141b });
  MIRROR_RTS.push({ rt: rt, cam: null, pane: null, mat: mat, dark: dark });
  return { mat: mat, dark: dark, rt: rt, slot: MIRROR_RTS.length - 1 };
}

/** 车外左右后视镜 + 车内后视镜：镜面用 RenderTarget 实时反射 */
function buildCarMirrors(body, interior) {
  var specs = [
    { pos: [1.50, 1.07, CAR_W / 2 + 0.14], n: [-0.94, -0.15, 0.31], w: 0.20, h: 0.13, aim: [-1, -0.12, 0.34] },
    { pos: [1.50, 1.07, -CAR_W / 2 - 0.14], n: [-0.94, -0.15, -0.31], w: 0.20, h: 0.13, aim: [-1, -0.12, -0.34] }
  ];
  var housingMat = new THREE.MeshPhongMaterial({ color: 0x22262b, shininess: 50 });
  var darkPane = new THREE.MeshBasicMaterial({ color: 0x141b23 });
  var i, s;
  for (i = 0; i < specs.length; i++) {
    s = specs[i];
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.05), housingMat);
    arm.position.set(s.pos[0] - 0.04, s.pos[1], s.pos[2] * 0.93);
    body.add(arm);
    var shell = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.055, s.h + 0.055, 0.05), housingMat);
    shell.position.set(s.pos[0], s.pos[1], s.pos[2]);
    orientTo(shell, s.n);
    body.add(shell);
    var pane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), darkPane);
    var px = s.pos[0] + s.n[0] * 0.05, py2 = s.pos[1] + s.n[1] * 0.05, pz = s.pos[2] + s.n[2] * 0.05;
    pane.position.set(px, py2, pz);
    orientTo(pane, s.n);
    body.add(pane);
    if (interior) {
      var mp = makeMirrorPane(s.w, s.h, 160);
      pane.material = mp.mat;
      var cam = new THREE.PerspectiveCamera(52, s.w / s.h, 0.05, 90);
      cam.position.set(px + s.n[0] * 0.03, py2 + s.n[1] * 0.06, pz + s.n[2] * 0.06);
      cam.lookAt(cam.position.x + s.aim[0], cam.position.y + s.aim[1], cam.position.z + s.aim[2]);
      var slot = MIRROR_RTS[mp.slot];
      slot.cam = cam; slot.pane = pane;
      body.add(cam);
      body.userData.mirrors.push({ pane: pane, cam: cam });
    }
  }
  if (!interior) return;

  // 车内后视镜
  var cPivot = new THREE.Group();
  cPivot.position.set(0.68, 1.40, 0.0);
  cPivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.115, 0.35), housingMat));
  var cN = [-1, 0.07, 0];
  var cw = 0.30, ch = 0.085;
  var cPane = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), darkPane);
  cPane.position.set(cN[0] * 0.03, cN[1] * 0.03, 0);
  orientTo(cPane, cN);
  cPivot.add(cPane);
  body.add(cPivot);
  var cmp = makeMirrorPane(cw, ch, 192);
  cPane.material = cmp.mat;
  var cCam = new THREE.PerspectiveCamera(48, cw / ch, 0.05, 90);
  cCam.position.set(cPivot.position.x + 0.07, cPivot.position.y - 0.08, cPivot.position.z);
  cCam.lookAt(cCam.position.x - 1, cCam.position.y - 0.12, cCam.position.z);
  MIRROR_RTS[cmp.slot].cam = cCam;
  MIRROR_RTS[cmp.slot].pane = cPane;
  body.add(cCam);
  body.userData.mirrors.push({ pane: cPane, cam: cCam });
  // 供"看镜子"注视使用（车体局部坐标：左镜 / 右镜 / 内镜）
  body.userData.mirrorLocals = [
    [specs[0].pos[0], specs[0].pos[1], specs[0].pos[2]],
    [specs[1].pos[0], specs[1].pos[1], specs[1].pos[2]],
    [cPivot.position.x, cPivot.position.y, cPivot.position.z]
  ];
}

/** 座舱内饰：仪表台 / 方向盘 / 座椅 / 车门板 / 车顶内衬 */
function buildInterior(body) {
  var dark = new THREE.MeshPhongMaterial({ color: 0x1d2126, shininess: 18 });
  var soft = new THREE.MeshPhongMaterial({ color: 0x272c32, shininess: 8 });
  var piano = new THREE.MeshPhongMaterial({ color: 0x121519, shininess: 130, specular: 0x8898a4 });
  var screenMat = new THREE.MeshBasicMaterial({ color: 0x0d1a24 });
  var chrome = new THREE.MeshPhongMaterial({ color: 0xb9c2c9, shininess: 120 });

  var floor = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, CAR_W - 0.2), dark);
  floor.position.set(0.58, 0.48, 0); body.add(floor);

  var dash = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.26, CAR_W - 0.18), soft);
  dash.position.set(1.22, 0.84, 0); body.add(dash);
  var dashTop = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, CAR_W - 0.22), piano);
  dashTop.position.set(1.14, 0.99, 0); body.add(dashTop);
  var cowl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, CAR_W - 0.16), dark);
  cowl.position.set(1.60, 0.98, 0); body.add(cowl);

  // 仪表遮光罩 + 双圆仪表
  var hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.56), dark);
  hood.position.set(1.00, 1.00, 0.36); hood.rotation.z = 0.1; body.add(hood);
  for (var k = 0; k < 2; k++) {
    var dial = new THREE.Mesh(new THREE.CircleGeometry(0.068, 20), piano);
    dial.position.set(0.97, 0.95, 0.36 + (k === 0 ? 0.082 : -0.082));
    dial.rotation.y = -Math.PI / 2; body.add(dial);
    var need = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.008), chrome);
    need.position.set(0.965, 0.96, dial.position.z);
    need.rotation.x = 0.6 + k * 1.1; body.add(need);
  }

  // 中控屏 + 出风口 + 换挡杆
  var ctrl = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.42, 0.44), piano);
  ctrl.position.set(1.00, 0.82, -0.10); body.add(ctrl);
  var scr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.30, 0.36), screenMat);
  scr.position.set(0.94, 0.87, -0.10); body.add(scr);
  for (k = 0; k < 2; k++) {
    var vent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.30), piano);
    vent.position.set(1.54, 0.92, k === 0 ? 0.62 : -0.62); body.add(vent);
  }
  var tunnel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 0.28), soft);
  tunnel.position.set(0.72, 0.53, -0.14); body.add(tunnel);
  var lever = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.30, 8), chrome);
  lever.position.set(0.60, 0.78, -0.16); lever.rotation.z = 0.22; body.add(lever);
  var knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), piano);
  knob.position.set(0.63, 0.93, -0.16); body.add(knob);
  var handbrake = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.05), chrome);
  handbrake.position.set(0.56, 0.63, 0.02); handbrake.rotation.z = 0.35; body.add(handbrake);

  // 方向盘（可随转向转动）
  var swPivot = new THREE.Group();
  swPivot.position.set(0.88, 0.92, 0.36);
  var swMesh = new THREE.Group();
  swMesh.rotation.y = -Math.PI / 2;
  var ringMat = new THREE.MeshPhongMaterial({ color: 0x1b1e22, shininess: 40 });
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.026, 8, 26), ringMat);
  swMesh.add(ring);
  for (k = 0; k < 3; k++) {
    var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.03), dark);
    spoke.position.set(0, 0, 0);
    spoke.rotation.z = k * 2.094 + 0.52;
    spoke.translateX(0.085);
    swMesh.add(spoke);
  }
  var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 14), dark);
  hub.rotation.x = Math.PI / 2; swMesh.add(hub);
  swPivot.add(swMesh);
  swPivot.rotation.z = -0.42;
  body.add(swPivot);
  body.userData.steer = swMesh;
  var column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.34, 10), dark);
  column.position.set(1.04, 0.88, 0.36);
  column.rotation.z = Math.PI / 2 - 0.42; body.add(column);

  // 座椅
  function seat(z) {
    var g = new THREE.Group();
    var cushion = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.17, 0.50), soft);
    cushion.position.set(0.42, 0.60, 0); g.add(cushion);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.48), soft);
    back.position.set(0.17, 0.93, 0); back.rotation.z = -0.15; g.add(back);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.24), dark);
    head.position.set(0.10, 1.28, 0); g.add(head);
    g.position.z = z;
    return g;
  }
  body.add(seat(0.36)); body.add(seat(-0.36));

  // 车门内饰板
  for (k = 0; k < 2; k++) {
    var zz = (k === 0 ? 1 : -1) * (CAR_W / 2 - 0.07);
    var panel = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.64, 0.05), soft);
    panel.position.set(0.58, 0.76, zz); body.add(panel);
    var armrest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.09, 0.12), dark);
    armrest.position.set(0.45, 0.99, zz * 0.94); body.add(armrest);
  }

  // 车顶内衬 + 遮阳板 + 安全带
  var headliner = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, CAR_W - 0.2), soft);
  headliner.position.set(0.56, 1.42, 0); body.add(headliner);
  for (k = 0; k < 2; k++) {
    var visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.02, 0.36), soft);
    visor.position.set(1.05, 1.35, (k === 0 ? 0.38 : -0.38));
    visor.rotation.z = 0.16; body.add(visor);
  }
  var belt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.03), new THREE.MeshPhongMaterial({ color: 0x3c4349 }));
  belt.position.set(0.28, 1.00, 0.56); belt.rotation.y = 0.25; belt.rotation.z = 0.22; body.add(belt);

  // 踏板
  for (k = 0; k < 2; k++) {
    var pedal = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 0.10), dark);
    pedal.position.set(1.60, 0.53, 0.30 + k * 0.01); pedal.rotation.z = 0.05; body.add(pedal);
  }

  // 座舱氛围光：让内饰有明暗层次（作用范围有限，不影响车外场景）
  var cabinLight = new THREE.PointLight(0xffe9d2, 0.38, 2.8);
  cabinLight.position.set(0.62, 1.34, 0.12);
  body.add(cabinLight);

  // 后排：隔板 + 坐垫 + 靠背 + 头枕（挡住座舱后壁，回头看时看到的是后排而不是车漆）
  var bulk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.60, CAR_W - 0.18), dark);
  bulk.position.set(-0.40, 0.79, 0); body.add(bulk);
  var rCushion = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 1.34), soft);
  rCushion.position.set(-0.02, 0.60, 0); body.add(rCushion);
  var rBack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.54, 1.34), soft);
  rBack.position.set(-0.28, 0.92, 0); rBack.rotation.z = -0.14; body.add(rBack);
  for (k = 0; k < 2; k++) {
    var rHead = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.26), dark);
    rHead.position.set(-0.34, 1.22, k === 0 ? 0.34 : -0.34); body.add(rHead);
  }
}

/* ===================== §5 视图与后视镜 ===================== */

var mainCam;
var car, carsStatic = [];
var dprCap = 1.5;

function initThree() {
  canvas = $("canvas");
  var opts = { canvas: canvas, antialias: true, alpha: false, powerPreference: "high-performance" };
  try {
    renderer = new THREE.WebGLRenderer(opts);
  } catch (e) {
    showFallback("无法初始化 WebGL，请更换浏览器或开启硬件加速");
    return false;
  }
  if (HAS_SRGB && "outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x9fb8c8);
  renderer.sortObjects = true;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc6d8e2, 80, 230);

  scene.add(new THREE.HemisphereLight(0xdfeaf4, 0x54534a, 0.85));
  var sun = new THREE.DirectionalLight(0xfff4e2, 0.85);
  sun.position.set(28, 42, 18); scene.add(sun);
  var fill = new THREE.DirectionalLight(0xa9c6ff, 0.28);
  fill.position.set(-24, 20, -26); scene.add(fill);

  worldGroup = new THREE.Group(); scene.add(worldGroup);
  bayGroup = new THREE.Group(); scene.add(bayGroup);
  propGroup = new THREE.Group(); scene.add(propGroup);

  initMaterials();
  buildStaticWorld();

  // 玩家车
  car = makeCar({ color: 0xc8403a, interior: true });
  car.rotation.order = "YXZ";
  scene.add(car);

  // 别的学员车（停在相邻库位，纯装饰）
  var colors = [0x2f6ca8, 0xd9d9dc, 0x2f7d63, 0x8a6f3f];
  var slots = [[-4.5, 0.1], [7.5, -0.15], [10.5, 0.05], [-7.5, -0.1]];
  for (var i = 0; i < slots.length; i++) {
    var oc = makeCar({ color: colors[i % colors.length], interior: false });
    oc.position.set(slots[i][0], 0, slots[i][1]);
    oc.rotation.y = Math.PI / 2 * (i % 2 === 0 ? 1 : 1); // 车头朝外停在库里
    oc.userData.spins = [];
    propGroup.add(oc);
    carsStatic.push(oc);
  }

  // 预测轨迹
  predictLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: 0x7de6c0, dashSize: 0.36, gapSize: 0.24, transparent: true, opacity: 0.9 })
  );
  predictLine.renderOrder = 3;
  scene.add(predictLine);

  mainCam = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.08, 260);
  onResize();
  return true;
}

var predictLine = null;

function onResize() {
  if (!renderer) return;
  var w = window.innerWidth, h = window.innerHeight;
  var dpr = Math.min(window.devicePixelRatio || 1, state.settings.lowQ ? 1 : dprCap);
  // 像素预算：不按高 DPR 直接开大缓冲
  var maxPx = state.settings.lowQ ? 1000000 : 2000000;
  if (w * h * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (w * h));
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  mainCam.aspect = w / h;
  mainCam.updateProjectionMatrix();
  if (mapCanvas) resizeMap();
}

var COCKPIT_EYE = [0.32, 1.16, 0.36];
var lookBackAmt = 0;
var gazeVec = [1, 0, 0];   // 当前注视方向（已平滑），用于在"前视 / 回头看 / 三面镜子"之间平滑转头

/** 座舱（第一人称）视角：驾驶座上，可回头看、可转头看三面后视镜、可拖动环顾 */
function updateCockpitCam(dt) {
  var lbTarget = state.lookBack ? 1 : 0;
  lookBackAmt += (lbTarget - lookBackAmt) * Math.min(1, dt * 7);
  var ct = Math.cos(sim.theta), st = Math.sin(sim.theta);
  var ex = COCKPIT_EYE[0], ey = COCKPIT_EYE[1], ez = COCKPIT_EYE[2];
  var wx = sim.x + ex * ct - ez * st, wy = ey, wz = sim.y + ex * st + ez * ct;
  mainCam.position.set(wx, wy, wz);

  // 目标注视方向
  var dx, dy, dz;
  var mode = state.mirrorLook;
  if (mode > 0 && car.userData.mirrorLocals) {
    var m = car.userData.mirrorLocals[mode - 1];
    var mx = sim.x + m[0] * ct - m[2] * st, my = m[1], mz = sim.y + m[0] * st + m[2] * ct;
    dx = mx - wx; dy = my - wy; dz = mz - wz;
  } else {
    var b = lookBackAmt, sgn = 1 - 2 * b;
    dx = ct * sgn; dy = -0.13; dz = st * sgn;
  }
  var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;
  // 拖动环顾：绕竖直轴偏航 + 抬低头
  var cy = Math.cos(look.yaw), sy = Math.sin(look.yaw);
  var ndx = dx * cy - dz * sy, ndz = dx * sy + dz * cy;
  dx = ndx; dz = ndz;
  dy += look.pitch;
  var k = Math.min(1, dt * 9);
  gazeVec[0] += (dx - gazeVec[0]) * k;
  gazeVec[1] += (dy - gazeVec[1]) * k;
  gazeVec[2] += (dz - gazeVec[2]) * k;
  var gl = Math.sqrt(gazeVec[0] * gazeVec[0] + gazeVec[1] * gazeVec[1] + gazeVec[2] * gazeVec[2]) || 1;
  mainCam.lookAt(wx + gazeVec[0] / gl * 12, wy + gazeVec[1] / gl * 12, wz + gazeVec[2] / gl * 12);

  // 车体轻微侧倾（转弯时的身体感受）
  var roll = -sim.delta * sim.v * 0.06;
  mainCam.rotateZ(roll);
  car.rotation.z = roll;
}

/** 跟车视角：前进时跟在车后上方，倒车时移到车前上方俯看库位 */
function updateChaseCam(dt) {
  var reversing = (sim.gear === "R") || (sim.v < -0.05);
  var ct = Math.cos(sim.theta), st = Math.sin(sim.theta);
  var along, side, height, lookAhead;
  if (reversing) { along = 4.5; side = 0; height = 3.85; lookAhead = -3.6; }
  else { along = -6.0; side = 0; height = 2.75; lookAhead = 5.5; }
  var camX = sim.x + along * ct + side * -st;
  var camZ = sim.y + along * st + side * ct;
  var tx = sim.x + lookAhead * ct, tz = sim.y + lookAhead * st;
  var k = Math.min(1, dt * 6);
  mainCam.position.x += (camX - mainCam.position.x) * k;
  mainCam.position.y += (height - mainCam.position.y) * k;
  mainCam.position.z += (camZ - mainCam.position.z) * k;
  mainCam.rotation.order = "YXZ";
  mainCam.lookAt(tx, 0.9, tz);
  car.rotation.z *= 0.85;
}

/** 后视镜：把每面镜子的相机渲染进各自的 RenderTarget */
function renderMirrors() {
  for (var i = 0; i < MIRROR_RTS.length; i++) {
    var m = MIRROR_RTS[i];
    if (!m.cam || !m.pane) continue;
    m.pane.material = m.dark;               // 断开自身纹理，避免反馈环
    renderer.setRenderTarget(m.rt);
    renderer.render(scene, m.cam);
    m.pane.material = m.mat;
  }
  renderer.setRenderTarget(null);
}

function buildPredictLine() {
  if (!state.settings.predict || !sim.running || Math.abs(sim.v) < 0.12) {
    predictLine.visible = false;
    return;
  }
  predictLine.visible = true;
  var pts = [], x = sim.x, y = sim.y, th = sim.theta, v = sim.v, d = sim.delta;
  for (var i = 0; i < 34; i++) {
    pts.push(new THREE.Vector3(x, 0.05, y));
    var dt = 0.06;
    x += v * Math.cos(th) * dt; y += v * Math.sin(th) * dt;
    th += (v / CAR_L) * Math.tan(d) * dt;
  }
  predictLine.geometry.setFromPoints(pts);
  predictLine.computeLineDistances();
}

/* ---------------- 俯视小地图（Canvas 2D，独立 DOM 图层） ---------------- */
var mapCanvas, mapCtx;

function initMap() {
  mapCanvas = $("map");
  if (!mapCanvas) return;
  mapCtx = mapCanvas.getContext("2d");
  resizeMap();
}
function resizeMap() {
  if (!mapCanvas) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var size = mapCanvas.clientWidth || 132;
  mapCanvas.width = Math.round(size * dpr);
  mapCanvas.height = Math.round(size * dpr);
  mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function drawMap() {
  if (!mapCanvas || !state.settings.map) return;
  var g = mapCtx, size = mapCanvas.clientWidth || 132;
  var half = size / 2;
  var span = 9.5;                       // 视野半宽（米）
  var s = half / span;
  var lvl = LEVELS[state.levelIdx];
  g.clearRect(0, 0, size, size);
  g.save();
  g.translate(half, half);
  function px(wx, wz) { return [wx * s, wz * s]; }

  // 道路与相邻库位
  g.strokeStyle = "rgba(255,255,255,0.16)";
  g.lineWidth = 1;
  for (var i = -3; i <= 3; i++) {
    if (i === 0) continue;
    var cx = 1.5 + i * 3.0;
    g.strokeRect((cx - 1.25) * s, -2.5 * s, 2.5 * s, 5 * s);
  }
  // 目标库位
  var c = lvl._corners;
  g.beginPath();
  for (i = 0; i < 4; i++) {
    var p = px(c[i][0], c[i][1]);
    if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
  }
  g.closePath();
  g.fillStyle = "rgba(95,216,176,0.16)";
  g.fill();
  g.strokeStyle = "rgba(126,230,192,0.95)";
  g.lineWidth = 1.6;
  g.stroke();

  // 车（矩形 + 朝向）
  var cc = carCorners();
  g.beginPath();
  for (i = 0; i < 4; i++) {
    var q = px(cc[i][0], cc[i][1]);
    if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]);
  }
  g.closePath();
  g.fillStyle = "rgba(232,66,58,0.9)";
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 1;
  g.stroke();
  var nose = px(sim.x + (CAR_LEN / 2 + 0.35) * Math.cos(sim.theta), sim.y + (CAR_LEN / 2 + 0.35) * Math.sin(sim.theta));
  var tail = px(sim.x - (CAR_LEN / 2 + 0.3) * Math.cos(sim.theta), sim.y - (CAR_LEN / 2 + 0.3) * Math.sin(sim.theta));
  g.beginPath(); g.moveTo(tail[0], tail[1]); g.lineTo(nose[0], nose[1]);
  g.strokeStyle = "rgba(255,230,120,0.75)"; g.lineWidth = 1.2; g.stroke();

  // 预测轨迹
  if (state.settings.predict && Math.abs(sim.v) > 0.12) {
    g.beginPath();
    var x = sim.x, y = sim.y, th = sim.theta, v = sim.v, d = sim.delta;
    for (i = 0; i < 34; i++) {
      var pp = px(x, y);
      if (i === 0) g.moveTo(pp[0], pp[1]); else g.lineTo(pp[0], pp[1]);
      var dtt = 0.06;
      x += v * Math.cos(th) * dtt; y += v * Math.sin(th) * dtt;
      th += (v / CAR_L) * Math.tan(d) * dtt;
    }
    g.setLineDash([4, 3]);
    g.strokeStyle = "rgba(126,230,192,0.85)";
    g.lineWidth = 1.2;
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}

/* ======================= §6 玩法（物理/输入/判定） ======================= */

function carCorners() {
  var ct = Math.cos(sim.theta), st = Math.sin(sim.theta);
  var cx = sim.x + (CAR_LEN / 2 - 1.0) * ct, cy = sim.y + (CAR_LEN / 2 - 1.0) * st;
  var hx = CAR_LEN / 2, hz = CAR_W / 2;
  return [
    [cx + hx * ct - hz * st, cy + hx * st + hz * ct],
    [cx + hx * ct + hz * st, cy + hx * st - hz * ct],
    [cx - hx * ct + hz * st, cy - hx * st - hz * ct],
    [cx - hx * ct - hz * st, cy - hx * st + hz * ct]
  ];
}
function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
function segIntersect(p1, p2, p3, p4) {
  var d1 = cross(p4[0] - p3[0], p4[1] - p3[1], p1[0] - p3[0], p1[1] - p3[1]);
  var d2 = cross(p4[0] - p3[0], p4[1] - p3[1], p2[0] - p3[0], p2[1] - p3[1]);
  var d3 = cross(p2[0] - p1[0], p2[1] - p1[1], p3[0] - p1[0], p3[1] - p1[1]);
  var d4 = cross(p2[0] - p1[0], p2[1] - p1[1], p4[0] - p1[0], p4[1] - p1[1]);
  return (d1 * d2 < 0) && (d3 * d4 < 0);
}
function pointInBay(pt, lvl) {
  var c = lvl._corners;
  for (var i = 0; i < 4; i++) {
    var a = c[i], b = c[(i + 1) % 4];
    if (cross(b[0] - a[0], b[1] - a[1], pt[0] - a[0], pt[1] - a[1]) < 0) return false;
  }
  return true;
}
function bayLines(lvl) {
  var c = lvl._corners;
  return [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
}
/** 返回 null / "mouth"（库口线，可扣分）/ "hard"（库底或边线，一票否决） */
function checkLinePress(lvl) {
  var cc = carCorners();
  var edges = [[cc[0], cc[1]], [cc[1], cc[2]], [cc[2], cc[3]], [cc[3], cc[0]]];
  var lines = bayLines(lvl);
  for (var e = 0; e < 4; e++) {
    for (var l = 0; l < lines.length; l++) {
      if (segIntersect(edges[e][0], edges[e][1], lines[l][0], lines[l][1])) return l === 2 ? "mouth" : "hard";
    }
  }
  return null;
}
function pointSegDist(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.sqrt((p[0] - a[0]) * (p[0] - a[0]) + (p[1] - a[1]) * (p[1] - a[1]));
  var t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
  return Math.sqrt((p[0] - (a[0] + t * dx)) * (p[0] - (a[0] + t * dx)) + (p[1] - (a[1] + t * dy)) * (p[1] - (a[1] + t * dy)));
}
function radarDistances(lvl) {
  var cc = carCorners(), lines = bayLines(lvl);
  var sensors = [
    { name: "前", pt: [(cc[0][0] + cc[1][0]) / 2, (cc[0][1] + cc[1][1]) / 2] },
    { name: "后", pt: [(cc[2][0] + cc[3][0]) / 2, (cc[2][1] + cc[3][1]) / 2] },
    { name: "左", pt: [(cc[0][0] + cc[3][0]) / 2, (cc[0][1] + cc[3][1]) / 2] },
    { name: "右", pt: [(cc[1][0] + cc[2][0]) / 2, (cc[1][1] + cc[2][1]) / 2] }
  ];
  var res = [];
  for (var s = 0; s < 4; s++) {
    var md = 99;
    for (var l = 0; l < lines.length; l++) md = Math.min(md, pointSegDist(sensors[s].pt, lines[l][0], lines[l][1]));
    res.push({ name: sensors[s].name, d: md });
  }
  return res;
}

function physics(dt) {
  if (!sim.running) return;
  var targetV = 0;
  if (sim.gear === "D") targetV = sim.throttle * V_MAX;
  else if (sim.gear === "R") targetV = -sim.throttle * V_REV;
  var diff = targetV - sim.v;
  if (Math.abs(diff) < BRAKE * dt) sim.v = targetV;
  else sim.v += (diff > 0 ? 1 : -1) * BRAKE * dt;
  if (sim.throttle < 0.01 && sim.brake < 0.01) {
    if (Math.abs(sim.v) < DRAG * dt) sim.v = 0;
    else sim.v -= (sim.v > 0 ? 1 : -1) * DRAG * dt;
  }
  if (sim.brake > 0.01) {
    if (Math.abs(sim.v) < BRAKE * sim.brake * dt) sim.v = 0;
    else sim.v -= (sim.v > 0 ? 1 : -1) * BRAKE * sim.brake * dt;
  }
  sim.v = clamp(sim.v, -V_MAX, V_MAX);
  if (state.settings.autoCenter && !btnState.left && !btnState.right && !keys.left) {
    sim.steerInput *= Math.pow(0.02, dt);
    if (Math.abs(sim.steerInput) < 0.01) sim.steerInput = 0;
  }
  sim.delta = -sim.steerInput * DELTA_MAX;
  sim.x += sim.v * Math.cos(sim.theta) * dt;
  sim.y += sim.v * Math.sin(sim.theta) * dt;
  sim.theta += (sim.v / CAR_L) * Math.tan(sim.delta) * dt;
  sim.wheelSpin += sim.v * dt / WHEEL_R;
  var ds = sim.delta > 0 ? 1 : sim.delta < 0 ? -1 : 0;
  if (ds !== 0 && sim.lastDeltaSign !== 0 && ds !== sim.lastDeltaSign && Math.abs(sim.delta) > 6 * DEG) sim.modifyCount++;
  if (ds !== 0) sim.lastDeltaSign = ds;
}

function updateCar() {
  car.position.set(sim.x, 0, sim.y);
  car.rotation.y = -sim.theta;
  car.updateMatrixWorld(true);
  var spins = car.userData.spins;
  for (var i = 0; i < spins.length; i++) spins[i].rotation.z = -sim.wheelSpin;
  var wheels = car.userData.wheels;
  for (i = 0; i < 2; i++) wheels[i].rotation.y = -sim.delta;
  if (car.userData.steer) car.userData.steer.rotation.z = -sim.steerInput * 2.2;
  var braking = sim.brake > 0.05 || (sim.gear === "R" && sim.v > 0.1);
  for (i = 0; i < car.userData.brakeLights.length; i++) {
    car.userData.brakeLights[i].material.emissive.setHex(braking ? 0x8e1208 : 0x2a0503);
    car.userData.brakeLights[i].material.color.setHex(braking ? 0xff4030 : 0x9c1f1a);
  }
  var rev = sim.gear === "R";
  for (i = 0; i < car.userData.reverseLights.length; i++) {
    car.userData.reverseLights[i].material.emissive.setHex(rev ? 0xbfc9cf : 0x101314);
  }
}

function computeScore(lvl) {
  var stopAng = Math.abs(normAng(sim.theta - lvl.bay.theta - Math.PI / 2));
  var carCx = sim.x + (CAR_LEN / 2 - 1.0) * Math.cos(sim.theta);
  var carCy = sim.y + (CAR_LEN / 2 - 1.0) * Math.sin(sim.theta);
  var offX = carCx - lvl.bay.x, offY = carCy - lvl.bay.y;
  var ct = Math.cos(lvl.bay.theta), st = Math.sin(lvl.bay.theta);
  var lateral = Math.abs(ct * offX + st * offY);
  var sStop = stopAng < 2 * DEG ? 100 : stopAng > 10 * DEG ? 0 : 100 * (1 - (stopAng - 2 * DEG) / (8 * DEG));
  var sCenter = lateral < 0.1 ? 100 : lateral > 0.3 ? 0 : 100 * (1 - (lateral - 0.1) / 0.2);
  var sTime = 100;
  if (lvl.timeLimit > 0) {
    var ratio = sim.elapsed / lvl.timeLimit;
    sTime = ratio < 0.7 ? 100 : ratio > 1 ? 0 : 100 * (1 - (ratio - 0.7) / 0.3);
  }
  var sModify = sim.modifyCount === 0 ? 100 : sim.modifyCount <= 5 ? 60 + 40 * (1 - sim.modifyCount / 5) : 0;
  var total = 0.35 * sStop + 0.25 * sCenter + 0.20 * sTime + 0.20 * sModify - sim.pressCount * 5;
  if (total < 0) total = 0;
  var stars = total >= 50 ? 1 : 0;
  if (stars >= 1 && stopAng < 5 * DEG && lateral < 0.2) stars = 2;
  if (stars >= 2 && stopAng < 2 * DEG && lateral < 0.1 && sim.pressCount === 0) {
    if (lvl.timeLimit > 0 && sim.elapsed < lvl.timeLimit * 0.7) stars = 3;
    if (lvl.timeLimit === 0) stars = 3;
  }
  return { total: total, stopAng: stopAng / DEG, lateral: lateral * 100, stars: stars, sStop: sStop, sCenter: sCenter, sTime: sTime, sModify: sModify };
}

var flashEl, toastTimer = 0;
function flashRed() {
  flashEl.style.opacity = "0.34";
  setTimeout(function () { flashEl.style.opacity = "0"; }, 140);
}
function showToast(msg) {
  var el = $("hudToast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1200);
}

function checkComplete(lvl, dt) {
  if (sim.finished || sim.failed) return;
  var press = checkLinePress(lvl);
  if (press === "hard") {
    sim.failed = true; sim.failReason = "压库底线或边线，本轮结束"; sim.running = false;
    sfxFail(); showToast("压线！"); showResult(); return;
  }
  var mouthPress = (press === "mouth");
  if (mouthPress && !sim.wasPress) {
    sim.pressCount++; flashRed(); sfxBeep(220, 0.12, 0.12); showToast("压库口线 -5");
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { } }
  }
  sim.wasPress = mouthPress;
  if (Math.abs(sim.x) > 42 || Math.abs(sim.y) > 42) {
    sim.failed = true; sim.failReason = "驶出练习场地"; sim.running = false;
    sfxFail(); showResult(); return;
  }
  if (lvl.timeLimit > 0 && sim.elapsed > lvl.timeLimit) {
    sim.failed = true; sim.failReason = "超时未完成"; sim.running = false;
    sfxFail(); showResult(); return;
  }
  if (Math.abs(sim.v) < 0.12) {
    var carCx = sim.x + (CAR_LEN / 2 - 1.0) * Math.cos(sim.theta);
    var carCy = sim.y + (CAR_LEN / 2 - 1.0) * Math.sin(sim.theta);
    var cc = carCorners(), inCount = 0;
    for (var i = 0; i < 4; i++) if (pointInBay(cc[i], lvl)) inCount++;
    if (pointInBay([carCx, carCy], lvl) && inCount === 4) {
      sim.completeTime += dt;
      if (sim.completeTime > 0.4) {
        sim.finished = true; sim.running = false;
        sfxSuccess(); showResult();
      }
    } else sim.completeTime = 0;
  } else sim.completeTime = 0;
}

/* ===================== §7 音效（WebAudio 现场合成） ===================== */

var audioCtx = null, engOsc = null, engOsc2 = null, engGain = null;

function initAudio() {
  if (audioCtx) { resumeAudio(); return; }
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { audioCtx = new AC(); } catch (e) { return; }
  engOsc = audioCtx.createOscillator();
  engOsc2 = audioCtx.createOscillator();
  engGain = audioCtx.createGain();
  engOsc.type = "sawtooth"; engOsc.frequency.value = 62;
  engOsc2.type = "triangle"; engOsc2.frequency.value = 31;
  engGain.gain.value = 0;
  var lp = audioCtx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 420;
  engOsc.connect(lp); engOsc2.connect(lp); lp.connect(engGain);
  engGain.connect(audioCtx.destination);
  engOsc.start(); engOsc2.start();
}
function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended" && audioCtx.resume) audioCtx.resume();
}
function updateAudio() {
  if (!audioCtx || !state.settings.sfx) { if (engGain) engGain.gain.value = 0; return; }
  var load = Math.abs(sim.throttle) * 0.6 + Math.abs(sim.v) / V_MAX;
  var f = 58 + Math.abs(sim.v) * 16;
  engOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.08);
  engOsc2.frequency.setTargetAtTime(f * 0.5, audioCtx.currentTime, 0.08);
  var vol = (sim.running ? 0.018 + load * 0.035 : 0);
  engGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.12);
}
function sfxBeep(freq, dur, gain, type) {
  if (!audioCtx || !state.settings.sfx) return;
  var now = audioCtx.currentTime;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || "square";
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(now); o.stop(now + dur + 0.02);
}
function playArp(notes, type) {
  if (!audioCtx || !state.settings.sfx) return;
  var now = audioCtx.currentTime;
  for (var i = 0; i < notes.length; i++) {
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || "triangle";
    o.frequency.value = notes[i];
    var t = now + i * 0.11;
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.34);
  }
}
function sfxSuccess() { playArp([523, 659, 784, 1046]); }
function sfxFail() { playArp([392, 311, 233], "sawtooth"); }
function sfxGear() { sfxBeep(150, 0.05, 0.10, "square"); }

var lastBeep = 0;
function radarBeep(dist) {
  if (!audioCtx || !state.settings.sfx) return;
  var now = audioCtx.currentTime;
  var hz = dist > 1 ? 0 : dist > 0.5 ? 1 : dist > 0.3 ? 3 : dist > 0.15 ? 8 : 20;
  if (hz === 0) return;
  if (now - lastBeep < 1 / hz) return;
  lastBeep = now;
  sfxBeep(920, 0.05, 0.10, "square");
}

/* ============================ §8 UI 与主循环 ============================ */

function setGear(g) {
  if (sim.gear !== g) sfxGear();
  sim.gear = g;
  if (state.settings.autoLook && state.view === "cockpit") {
    state.lookBack = (g === "R");
    if (state.lookBack) state.mirrorLook = 0;
  }
  updateViewButtons();
  var btns = document.querySelectorAll(".gbtn");
  for (var i = 0; i < btns.length; i++) {
    var on = btns[i].getAttribute("data-g") === g;
    btns[i].className = on ? "gbtn active" : "gbtn";
  }
}

function loadLevel(idx) {
  state.levelIdx = idx;
  var lvl = LEVELS[idx];
  sim.x = lvl.start.x; sim.y = lvl.start.y; sim.theta = lvl.start.theta;
  sim.v = 0; sim.delta = 0; sim.steerInput = 0; sim.throttle = 0; sim.brake = 0;
  sim.elapsed = 0; sim.modifyCount = 0; sim.lastDeltaSign = 0; sim.pressCount = 0;
  sim.wasPress = false; sim.finished = false; sim.failed = false; sim.failReason = "";
  sim.completeTime = 0; sim.wheelSpin = 0; sim.running = true;
  look.yaw = 0; look.pitch = 0; lookBackAmt = 0;
  state.lookBack = false;
  state.mirrorLook = 0;
  gazeVec = [Math.cos(lvl.start.theta), -0.055, Math.sin(lvl.start.theta)];
  buildBay(lvl);
  initRadarRows();
  $("hudLvlName").textContent = "第 " + lvl.id + " 关 · " + lvl.name;
  var tip = $("hudTip");
  if (state.settings.tip && lvl.tip) { tip.innerHTML = lvl.tip; tip.classList.remove("hidden"); }
  else tip.classList.add("hidden");
  setGear("R");
  updateCar();
  mainCam.position.set(sim.x, 4.2, sim.y + 7);
  $("result").classList.add("hidden");
  $("pauseOverlay").classList.add("hidden");
  updateHUD();
}

function showResult() {
  var lvl = LEVELS[state.levelIdx];
  $("resTitle").textContent = sim.finished ? "入库成功" : "挑战失败";
  var fail = $("resFail");
  fail.classList.toggle("hidden", !sim.failed);
  if (sim.failed) fail.textContent = sim.failReason;
  var sc = computeScore(lvl);
  var stars = sim.finished ? sc.stars : 0;
  state.isRecord = false;
  if (sim.finished) {
    var key = "" + lvl.id, prev = state.stars[key] || 0;
    if (stars > prev) { state.stars[key] = stars; saveStars(); state.isRecord = true; }
  }
  var s = "";
  for (var i = 0; i < 3; i++) {
    s += "<span class='" + (i < stars ? "on pop" : "") + "' style='animation-delay:" + (i * 0.16) + "s'>★</span>";
  }
  $("resStars").innerHTML = s;
  var rows = [
    ["停正度", sc.stopAng.toFixed(1) + "°", sc.sStop],
    ["居中偏移", sc.lateral.toFixed(0) + " cm", sc.sCenter],
    ["用时", sim.elapsed.toFixed(1) + " s", sc.sTime],
    ["修正次数", sim.modifyCount + " 次", sc.sModify],
    ["库口压线", sim.pressCount + " 次", Math.max(0, 100 - sim.pressCount * 20)]
  ];
  var html = "";
  for (var r = 0; r < rows.length; r++) {
    var v = rows[r][2];
    html += "<div class='srow" + (v < 60 ? " low" : "") + "'>" +
      "<div class='sl'><span>" + rows[r][0] + "</span><b>" + rows[r][1] + "</b></div>" +
      "<div class='sbar'><i style='width:" + Math.round(v) + "%'></i></div></div>";
  }
  $("resScore").innerHTML = html;
  $("resTotal").textContent = Math.round(sim.finished ? sc.total : 0);
  $("resNewRec").classList.toggle("hidden", !state.isRecord);
  var nxt = $("btnNext");
  var hasNext = state.levelIdx < LEVELS.length - 1;
  nxt.classList.toggle("hidden", !sim.finished || !hasNext);
  $("result").classList.remove("hidden");
  initAudio();
}

var UI = {};
function initUI() {
  UI.speed = $("speedVal");
  UI.timer = $("hudTimer");
  UI.radar = $("radarRows");
  UI.needle = $("steerNeedle");
  UI.radarRows = null;
}
/** 雷达四行只建一次 DOM，之后仅改样式，避免每帧重建 */
function initRadarRows() {
  var names = ["前", "后", "左", "右"];
  UI.radar.innerHTML = "";
  UI.radarRows = [];
  for (var i = 0; i < 4; i++) {
    var row = document.createElement("div");
    row.className = "rrow";
    row.innerHTML = "<span class='rn'>" + names[i] + "</span>" +
      "<span class='rb'><i></i></span><span class='rv'>--</span>";
    UI.radar.appendChild(row);
    UI.radarRows.push({
      row: row,
      bar: row.getElementsByTagName("i")[0],
      val: row.getElementsByClassName("rv")[0]
    });
  }
}

function updateHUD() {
  var lvl = LEVELS[state.levelIdx];
  UI.speed.textContent = Math.round(Math.abs(sim.v) * 3.6);
  if (lvl.timeLimit > 0) {
    var left = Math.max(0, lvl.timeLimit - sim.elapsed);
    UI.timer.textContent = left.toFixed(1) + "s";
    UI.timer.className = left < 10 ? "timer warn" : "timer";
  } else if (sim.finished || sim.failed) {
    UI.timer.textContent = "";
  } else {
    UI.timer.textContent = sim.elapsed.toFixed(1) + "s";
    UI.timer.className = "timer";
  }
  var rd = radarDistances(lvl), minD = 99;
  for (var i = 0; i < rd.length; i++) {
    var d = rd[i].d, r = UI.radarRows[i];
    if (d < minD) minD = d;
    var cls = d < 0.3 ? "danger" : d < 0.7 ? "warn" : "";
    if (r.row.className !== "rrow " + cls) r.row.className = "rrow " + cls;
    r.bar.style.width = (d > 2 ? 100 : Math.round(clamp(1 - d / 2, 0, 1) * 100)) + "%";
    r.val.textContent = d > 9 ? "--" : d.toFixed(2);
  }
  radarBeep(minD);
  UI.needle.style.transform = "rotate(" + (-sim.steerInput * 62).toFixed(1) + "deg)";
}

function updateViewButtons() {
  $("btnViewCockpit").className = state.view === "cockpit" ? "vbtn active" : "vbtn";
  $("btnViewChase").className = state.view === "chase" ? "vbtn active" : "vbtn";
  $("btnViewMap").className = state.settings.map ? "vbtn active" : "vbtn";
  var isCockpit = state.view === "cockpit";
  $("lookbar").classList.toggle("hidden", !isCockpit);
  $("btnGazeFront").className = (isCockpit && state.mirrorLook === 0 && !state.lookBack) ? "vbtn active" : "vbtn";
  $("btnGazeBack").className = (isCockpit && state.lookBack) ? "vbtn active" : "vbtn";
  $("btnGazeL").className = (isCockpit && state.mirrorLook === 1) ? "vbtn active" : "vbtn";
  $("btnGazeC").className = (isCockpit && state.mirrorLook === 2) ? "vbtn active" : "vbtn";
  $("btnGazeR").className = (isCockpit && state.mirrorLook === 3) ? "vbtn active" : "vbtn";
  if (mapCanvas) mapCanvas.classList.toggle("hidden", !state.settings.map);
}

/** 切换注视目标（座舱视角）：0 前视 1 左镜 2 内镜 3 右镜，-1 回头看 */
function setGaze(mode) {
  if (mode === -1) {
    state.lookBack = !state.lookBack;
    if (state.lookBack) state.mirrorLook = 0;
  } else {
    if (state.mirrorLook === mode) mode = 0;
    state.mirrorLook = mode;
    state.lookBack = false;
    if (state.view !== "cockpit") state.view = "cockpit";
  }
  updateViewButtons();
}

function showScreen(name) {
  state.screen = name;
  $("menu").classList.toggle("hidden", name !== "menu");
  $("levelSelect").classList.toggle("hidden", name !== "levelSelect");
  $("game").classList.toggle("hidden", name !== "game");
  if (name !== "game") { updateAudio(); if (engGain) engGain.gain.value = 0; }
}

function isUnlocked(idx) {
  if (state.practice) return true;
  var lvl = LEVELS[idx];
  if (lvl.challenge) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (!LEVELS[i].challenge && !(state.stars["" + LEVELS[i].id] > 0)) return false;
    }
    return true;
  }
  return idx === 0 || (state.stars["" + LEVELS[idx - 1].id] || 0) > 0;
}

function levelCard(idx) {
  var lvl = LEVELS[idx], stars = state.stars["" + lvl.id] || 0;
  var card = document.createElement("div");
  var unlocked = isUnlocked(idx);
  card.className = "lvlcard" + (unlocked ? "" : " locked") + (stars > 0 ? " best" : "");
  var sh = "";
  for (var s = 0; s < 3; s++) sh += "<span class='" + (s < stars ? "on" : "") + "'>★</span>";
  card.innerHTML = "<div class='no'>第 " + lvl.id + " 关</div>" +
    "<div class='nm'>" + lvl.name + "</div>" +
    "<div class='meta'>" + (lvl.timeLimit > 0 ? "限时 " + lvl.timeLimit + "s" : "不限时") +
    " · 库 " + lvl.bay.w.toFixed(1) + "m" + "</div>" +
    "<div class='stars'>" + sh + "</div>" +
    (unlocked ? "" : "<div class='lock'>🔒</div>");
  if (unlocked) {
    card.onclick = function () { initAudio(); startGame(idx); };
  }
  return card;
}

function buildLevelGrid() {
  var grid = $("lvlGrid"), ch = $("lvlGridCh");
  grid.innerHTML = ""; ch.innerHTML = "";
  var done = 0, total = 0;
  for (var i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].challenge) ch.appendChild(levelCard(i));
    else {
      total++;
      if ((state.stars["" + LEVELS[i].id] || 0) > 0) done++;
      grid.appendChild(levelCard(i));
    }
  }
  $("challengeTtl").style.display = state.practice || isUnlocked(LEVELS.length - 1) ? "block" : "none";
  $("lvlProgress").textContent = "已通关 " + done + " / " + total + " 关" + (state.practice ? " · 自由练习模式" : "");
}

function startGame(idx) {
  state.practice = false;
  showScreen("game");
  onResize();
  loadLevel(idx);
  lastT = 0;
  initAudio();
}

var lastT = 0, rafId = 0, hidden = false;

function loop(t) {
  rafId = requestAnimationFrame(loop);
  if (state.screen !== "game" || hidden) { lastT = 0; return; }
  if (!lastT) lastT = t;
  var dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  applyInput();
  physics(dt);
  if (sim.running && (sim.gear !== "N" || Math.abs(sim.v) > 0.01)) sim.elapsed += dt;
  updateCar();
  buildPredictLine();
  updateAudio();
  updateHUD();
  drawMap();
  checkComplete(LEVELS[state.levelIdx], dt);
  if (state.view === "cockpit") updateCockpitCam(dt); else updateChaseCam(dt);
  renderMirrors();
  renderer.render(scene, mainCam);
}

function applyInput() {
  var steer = 0;
  if (keys.left) steer += keys.left;
  if (btnState.left) steer -= 1;
  if (btnState.right) steer += 1;
  sim.steerInput = clamp(steer, -1, 1);
  var thr = 0;
  if (keys.up && keys.up > 0) thr += keys.up;
  if (btnState.gas) thr += 1;
  sim.throttle = clamp(thr, 0, 1);
  var br = 0;
  if (keys.up && keys.up < 0) br -= keys.up;
  if (btnState.brake) br += 1;
  sim.brake = clamp(br, 0, 1);
}

function bindHold(el, key) {
  function press(e) {
    if (e && e.cancelable) e.preventDefault();
    btnState[key] = true; el.classList.add("held"); initAudio(); resumeAudio();
  }
  function release() { btnState[key] = false; el.classList.remove("held"); }
  el.addEventListener("pointerdown", press);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("pointerleave", release);
  if (!window.PointerEvent) {
    el.addEventListener("touchstart", press, { passive: false });
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    el.addEventListener("mousedown", press);
    el.addEventListener("mouseup", release);
  }
}

function setupControls() {
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") keys.left = -1;
    if (e.key === "ArrowRight") keys.left = 1;
    if (e.key === "ArrowUp") keys.up = 1;
    if (e.key === "ArrowDown") keys.up = -1;
    if (e.key === "r" || e.key === "R") setGear("R");
    if (e.key === "n" || e.key === "N") setGear("N");
    if (e.key === "d" || e.key === "D") setGear("D");
    if (e.key === " ") { setGaze(-1); e.preventDefault(); }
    if (e.key === "v" || e.key === "V") toggleView();
  });
  window.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") keys.left = 0;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") keys.up = 0;
  });

  bindHold($("btnLeft"), "left");
  bindHold($("btnRight"), "right");
  bindHold($("btnGas"), "gas");
  bindHold($("btnBrake"), "brake");

  var btns = document.querySelectorAll(".gbtn");
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.addEventListener("click", function () { initAudio(); setGear(b.getAttribute("data-g")); });
    })(btns[i]);
  }

  // 拖动环顾（仅座舱视角有意义，跟车视角下忽略）
  var vActive = false, vLastX = 0, vLastY = 0, vLastTap = 0;
  canvas.addEventListener("pointerdown", function (e) {
    vActive = true; vLastX = e.clientX; vLastY = e.clientY;
    var now = Date.now();
    if (now - vLastTap < 300) { look.yaw = 0; look.pitch = 0; }
    vLastTap = now;
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!vActive) return;
    look.yaw -= (e.clientX - vLastX) * 0.006;
    look.pitch = clamp(look.pitch - (e.clientY - vLastY) * 0.005, -0.55, 0.55);
    look.yaw = clamp(look.yaw, -2.4, 2.4);
    vLastX = e.clientX; vLastY = e.clientY;
  });
  canvas.addEventListener("pointerup", function () { vActive = false; });
  canvas.addEventListener("pointercancel", function () { vActive = false; });

  document.addEventListener("visibilitychange", function () {
    hidden = document.hidden;
    if (hidden) {
      if (engGain) engGain.gain.value = 0;
      if (state.screen === "game" && sim.running) {
        sim.running = false;
        $("pauseOverlay").classList.remove("hidden");
      }
    }
    lastT = 0;
  });
}

function toggleView() {
  state.view = state.view === "cockpit" ? "chase" : "cockpit";
  if (state.view === "chase") state.lookBack = false;
  updateViewButtons();
}

function setupUI() {
  flashEl = $("flash");
  initUI();
  initMap();
  $("btnStart").onclick = function () { initAudio(); state.practice = false; buildLevelGrid(); showScreen("levelSelect"); };
  $("btnPractice").onclick = function () { initAudio(); state.practice = true; buildLevelGrid(); showScreen("levelSelect"); };
  $("btnSettings").onclick = function () { $("settings").classList.remove("hidden"); };
  $("btnCloseSet").onclick = function () { $("settings").classList.add("hidden"); };
  $("btnBackMenu").onclick = function () { showScreen("menu"); };
  $("btnPause").onclick = function () {
    if (!sim.running) return;
    sim.running = false;
    $("pauseLvl").textContent = LEVELS[state.levelIdx].name;
    $("pauseOverlay").classList.remove("hidden");
  };
  $("btnResume").onclick = function () { sim.running = true; lastT = 0; $("pauseOverlay").classList.add("hidden"); };
  $("btnRestart").onclick = function () { loadLevel(state.levelIdx); lastT = 0; };
  $("btnPauseMenu").onclick = function () { $("pauseOverlay").classList.add("hidden"); showScreen("menu"); };
  $("btnRetry").onclick = function () { loadLevel(state.levelIdx); lastT = 0; };
  $("btnNext").onclick = function () {
    if (state.levelIdx < LEVELS.length - 1) startGame(state.levelIdx + 1);
    else showScreen("levelSelect");
  };
  $("btnResMenu").onclick = function () { showScreen("menu"); };

  $("btnViewCockpit").onclick = function () { state.view = "cockpit"; updateViewButtons(); };
  $("btnViewChase").onclick = function () { state.view = "chase"; state.lookBack = false; updateViewButtons(); };
  $("btnViewMap").onclick = function () {
    state.settings.map = !state.settings.map;
    syncToggles();
    updateViewButtons();
  };
  $("btnGazeFront").onclick = function () { setGaze(0); };
  $("btnGazeBack").onclick = function () { setGaze(-1); };
  $("btnGazeL").onclick = function () { setGaze(1); };
  $("btnGazeC").onclick = function () { setGaze(2); };
  $("btnGazeR").onclick = function () { setGaze(3); };

  function bindToggle(id, key, after) {
    var el = $(id);
    el.onclick = function () {
      state.settings[key] = !state.settings[key];
      el.classList.toggle("on", state.settings[key]);
      if (after) after();
    };
  }
  bindToggle("tgMap", "map", updateViewButtons);
  bindToggle("tgAutoCenter", "autoCenter");
  bindToggle("tgPredict", "predict");
  bindToggle("tgAutoLook", "autoLook");
  bindToggle("tgTip", "tip");
  bindToggle("tgSfx", "sfx");
  bindToggle("tgLowQ", "lowQ", onResize);
  syncToggles();
  updateViewButtons();
}

function syncToggles() {
  var map = { tgMap: "map", tgAutoCenter: "autoCenter", tgPredict: "predict", tgAutoLook: "autoLook", tgTip: "tip", tgSfx: "sfx", tgLowQ: "lowQ" };
  for (var id in map) {
    if (!map.hasOwnProperty(id)) continue;
    var el = $(id);
    el.classList.toggle("on", !!state.settings[map[id]]);
  }
}

function showFallback(msg) {
  var d = document.createElement("div");
  d.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;" +
    "justify-content:center;padding:32px;text-align:center;font-size:15px;line-height:1.8;" +
    "color:#cfe0ec;background:#0b1017;z-index:99";
  d.textContent = msg;
  document.body.appendChild(d);
}

/* ------------------------------ 启动 ------------------------------ */
function boot() {
  if (!initThree()) return;
  setupControls();
  setupUI();
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    cancelAnimationFrame(rafId);
    showFallback("渲染上下文已丢失，请刷新页面重试");
  });
  showScreen("menu");
  rafId = requestAnimationFrame(loop);
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", function () { setTimeout(onResize, 220); });
boot();
