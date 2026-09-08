// 星航者 · 绘制层：星云 / 星点 / 行星 / 火箭 / 粒子 / 场景
(function (global) {
  'use strict';

  var SV = global.SV, U = SV.util;
  var V = SV.vfx = {};

  // ------------------------------------------------------------
  // 基础
  // ------------------------------------------------------------
  V.dpr = Math.min(2, global.devicePixelRatio || 1);

  V.fit = function (cv, ctx) {
    var w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    var W = Math.round(w * V.dpr), H = Math.round(h * V.dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    return { w: w, h: h };
  };

  V.roundRect = function (x, px, py, w, h, r) {
    if (r > w / 2) r = w / 2; if (r > h / 2) r = h / 2;
    x.beginPath();
    x.moveTo(px + r, py);
    x.lineTo(px + w - r, py); x.quadraticCurveTo(px + w, py, px + w, py + r);
    x.lineTo(px + w, py + h - r); x.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
    x.lineTo(px + r, py + h); x.quadraticCurveTo(px, py + h, px, py + h - r);
    x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py);
    x.closePath();
  };

  V.hexA = function (hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  V.mix = function (h1, h2, t) {
    var a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    var r = Math.round(U.lerp((a >> 16) & 255, (b >> 16) & 255, t));
    var g = Math.round(U.lerp((a >> 8) & 255, (b >> 8) & 255, t));
    var c = Math.round(U.lerp(a & 255, b & 255, t));
    return 'rgb(' + r + ',' + g + ',' + c + ')';
  };
  V.lighten = function (hex, t) { return V.mix(hex, '#ffffff', t); };
  V.darken = function (hex, t) { return V.mix(hex, '#000000', t); };

  function off(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // 横向金属渐变（模拟圆柱受光）
  V.metal = function (x, x0, x1, tint) {
    var g = x.createLinearGradient(x0, 0, x1, 0);
    var t = tint || 1;
    g.addColorStop(0.00, V.mix('#1b2338', '#000000', 1 - t));
    g.addColorStop(0.18, '#6d7896');
    g.addColorStop(0.42, '#eef3ff');
    g.addColorStop(0.58, '#c9d3e8');
    g.addColorStop(0.80, '#5d6883');
    g.addColorStop(1.00, '#161c2c');
    return g;
  };

  // ------------------------------------------------------------
  // 星云（离屏缓存）
  // ------------------------------------------------------------
  var nebCache = {};
  V.nebula = function (w, h, key, hue) {
    var d = V.dpr;
    key = (key || ('n' + Math.round(w) + 'x' + Math.round(h))) + '@' + d;
    if (nebCache[key]) return nebCache[key];
    var c = off(w * d, h * d), x = c.getContext('2d');
    x.setTransform(d, 0, 0, d, 0, 0);
    var rnd = U.seed(9137 + Math.round(w) + Math.round(h) * 7);
    x.fillStyle = '#03040a'; x.fillRect(0, 0, w, h);
    var pal = hue || [
      'rgba(64,30,120,0.50)', 'rgba(20,52,128,0.46)', 'rgba(10,84,104,0.30)',
      'rgba(122,40,60,0.24)', 'rgba(38,30,92,0.40)'
    ];
    for (var i = 0; i < 7; i++) {
      var bx = rnd() * w, by = rnd() * h, br = (0.32 + rnd() * 0.42) * Math.max(w, h);
      var col = pal[i % pal.length];
      var g = x.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, col); g.addColorStop(0.55, col.replace(/[\d.]+\)$/, '0.12)')); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(bx, by, br, 0, 6.2832); x.fill();
    }
    // 细密星尘噪点，压掉渐变的塑料感
    x.globalAlpha = 0.05;
    for (var k = 0; k < 900; k++) {
      x.fillStyle = rnd() < 0.5 ? '#8fb6ff' : '#ffffff';
      x.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
    x.globalAlpha = 1;
    nebCache[key] = c;
    return c;
  };

  // ------------------------------------------------------------
  // 星点层
  // ------------------------------------------------------------
  V.makeStars = function (w, h, count, bigRatio) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.25 + Math.random() * 1.15,
        a: Math.random() * 6.2832, sp: 0.4 + Math.random() * 1.8,
        big: Math.random() < (bigRatio || 0.05),
        hue: Math.random() < 0.18 ? (Math.random() < 0.5 ? '#cfe0ff' : '#ffe0c8') : '#ffffff'
      });
    }
    return arr;
  };
  V.drawStars = function (x, stars, t, scroll, H) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var sy = s.y + (scroll || 0);
      if (H) sy = ((sy % H) + H) % H;
      var o = 0.30 + 0.70 * Math.abs(Math.sin(s.a + t * 0.0009 * s.sp));
      if (s.big) {
        x.fillStyle = s.hue; x.globalAlpha = o;
        x.beginPath(); x.arc(s.x, sy, s.r * 1.7, 0, 6.2832); x.fill();
        x.globalAlpha = o * 0.36; x.strokeStyle = '#bed7ff'; x.lineWidth = 0.6;
        x.beginPath();
        x.moveTo(s.x - s.r * 4.5, sy); x.lineTo(s.x + s.r * 4.5, sy);
        x.moveTo(s.x, sy - s.r * 4.5); x.lineTo(s.x, sy + s.r * 4.5);
        x.stroke();
        x.globalAlpha = 1;
      } else {
        x.globalAlpha = o; x.fillStyle = s.hue;
        x.beginPath(); x.arc(s.x, sy, s.r, 0, 6.2832); x.fill();
        x.globalAlpha = 1;
      }
    }
  };

  // ------------------------------------------------------------
  // 行星纹理（4R 宽，横向可无缝滚动 = 自转）
  // ------------------------------------------------------------
  var texCache = {};
  function planetTex(pl, R) {
    var d = V.dpr;
    var key = pl.id + '@' + Math.round(R) + '@' + d;
    if (texCache[key]) return texCache[key];
    var W = Math.round(R * 4), H = Math.round(R * 2);
    var c = off(W * d, H * d), x = c.getContext('2d');
    x.setTransform(d, 0, 0, d, 0, 0);
    var rnd = U.seed((pl.id.charCodeAt(0) * 977 + pl.id.length * 131 + Math.round(R)) % 2147483647);
    var i, k;

    function blob(cx, cy, rx, ry, col) {
      x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); x.fill();
    }
    function crater(cx, cy, r) {
      x.fillStyle = 'rgba(40,38,48,0.42)'; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.20)'; x.lineWidth = Math.max(0.5, r * 0.16);
      x.beginPath(); x.arc(cx, cy, r * 0.94, Math.PI * 0.75, Math.PI * 1.85); x.stroke();
    }

    function vGrad(c0, c1, c2) {
      var g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    function hBands(cols) {
      for (i = 0; i < cols.length; i++) {
        x.fillStyle = cols[i];
        x.fillRect(0, i * H / cols.length, W, H / cols.length + 1);
      }
    }
    function streak(cy, len, w, col) {
      x.strokeStyle = col; x.lineWidth = w;
      x.beginPath(); x.moveTo(ox, cy);
      x.bezierCurveTo(ox + P * 0.3, cy + (rnd() - 0.5) * H * 0.06,
        ox + P * 0.7, cy + (rnd() - 0.5) * H * 0.06, ox + P * len, cy);
      x.stroke();
    }

    // 底色
    if (pl.kind === 'gas') {
      // 气态巨行星：横向条带，没有可以落脚的表面
      if (pl.id === 'jupiter') {
        hBands(['#e6cda4', '#c99a6a', '#eeddbf', '#a87a52', '#e0bb92', '#b58e64', '#f2e2c8', '#c9a276', '#d8b184', '#a87a52']);
      } else {
        hBands(['#f4e4be', '#dcc188', '#f7e8c8', '#c8a868', '#ebd6a4', '#bda068']);
      }
    } else if (pl.kind === 'ice') {
      // 冰巨星：条带极淡，几乎是一整块冷色
      if (pl.id === 'neptune') {
        hBands(['#4a68d8', '#3a54b8', '#5a78e8', '#2e4696', '#4866d0', '#3852ac', '#4462cc']);
      } else {
        hBands(['#b2e6ec', '#8fd0da', '#c0ecef', '#7cc4d0', '#a4dce4', '#7ac2ce', '#b6e6ea']);
      }
    } else if (pl.id === 'earth') {
      vGrad('#2f7fd0', '#1a5ba8', '#123f7e');
    } else if (pl.id === 'europa') {
      vGrad('#f4ece0', '#dccfbe', '#9d8d7c');
    } else if (pl.id === 'titan') {
      vGrad('#f0c988', '#d8a860', '#b8843c');
    } else if (pl.id === 'venus') {
      vGrad('#f7e6b0', '#e0bf72', '#c79a44');
    } else if (pl.id === 'mars') {
      vGrad('#d9713f', '#b04e26', '#7a3418');
    } else {
      vGrad(V.lighten(pl.color, 0.06), V.mix(pl.color, pl.dark, 0.5), pl.dark);
    }

    // 特征（在 x 与 x+2R 两处重复，保证滚动无缝）
    var P = Math.round(R * 2);
    for (k = 0; k < 2; k++) {
      var ox = k * P;
      if (pl.id === 'earth') {
        for (i = 0; i < 14; i++) {
          var ex = ox + rnd() * P, ey = rnd() * H;
          blob(ex, ey, R * (0.10 + rnd() * 0.26), R * (0.07 + rnd() * 0.17),
            rnd() < 0.55 ? '#39764a' : (rnd() < 0.5 ? '#4f8c3a' : '#8a7a42'));
        }
        // 极冠
        blob(ox + P * 0.25, 1, R * 0.55, R * 0.16, 'rgba(255,255,255,0.9)');
        blob(ox + P * 0.78, 1, R * 0.42, R * 0.12, 'rgba(255,255,255,0.85)');
        blob(ox + P * 0.5, H - 1, R * 0.5, R * 0.14, 'rgba(255,255,255,0.82)');
        // 云
        for (i = 0; i < 7; i++) {
          x.fillStyle = 'rgba(255,255,255,' + (0.18 + rnd() * 0.24).toFixed(2) + ')';
          x.beginPath();
          x.ellipse(ox + rnd() * P, rnd() * H, R * (0.12 + rnd() * 0.3), R * (0.03 + rnd() * 0.07), rnd() * 0.6 - 0.3, 0, 6.2832);
          x.fill();
        }
      } else if (pl.id === 'moon' || pl.id === 'mercury') {
        var n = pl.id === 'moon' ? 20 : 34;
        for (i = 0; i < n; i++) crater(ox + rnd() * P, rnd() * H, R * (0.03 + rnd() * 0.13));
        for (i = 0; i < 6; i++) blob(ox + rnd() * P, rnd() * H, R * (0.1 + rnd() * 0.2), R * (0.08 + rnd() * 0.16), 'rgba(70,68,80,0.22)');
      } else if (pl.id === 'mars') {
        for (i = 0; i < 16; i++) {
          blob(ox + rnd() * P, rnd() * H, R * (0.08 + rnd() * 0.22), R * (0.06 + rnd() * 0.16),
            rnd() < 0.5 ? '#8f3a1c' : (rnd() < 0.5 ? '#a85028' : '#6a2a14'));
        }
        blob(ox + P * 0.3, 1, R * 0.42, R * 0.13, 'rgba(255,250,244,0.9)');
        blob(ox + P * 0.72, H - 1, R * 0.34, R * 0.10, 'rgba(255,250,244,0.85)');
        // 水手谷
        x.strokeStyle = 'rgba(70,26,12,0.45)'; x.lineWidth = Math.max(1, R * 0.06);
        x.beginPath(); x.moveTo(ox + P * 0.18, H * 0.58); x.lineTo(ox + P * 0.62, H * 0.66); x.stroke();
      } else if (pl.id === 'venus') {
        // 硫酸云：Y 形拉丝 + 极区暗涡
        for (i = 0; i < 9; i++) {
          streak(rnd() * H, 1, Math.max(0.7, R * 0.026), 'rgba(255,252,232,' + (0.07 + rnd() * 0.11).toFixed(3) + ')');
        }
        x.fillStyle = 'rgba(120,88,30,0.20)';
        x.beginPath(); x.ellipse(ox + P * 0.32, H * 0.14, R * 0.30, R * 0.12, 0.3, 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(ox + P * 0.80, H * 0.86, R * 0.26, R * 0.11, -0.3, 0, 6.2832); x.fill();
      } else if (pl.id === 'jupiter') {
        // 大红斑 + 白色椭圆风暴
        for (i = 0; i < 11; i++) {
          x.fillStyle = 'rgba(255,242,218,' + (0.06 + rnd() * 0.09).toFixed(2) + ')';
          x.beginPath(); x.ellipse(ox + rnd() * P, rnd() * H, R * (0.10 + rnd() * 0.24), R * (0.02 + rnd() * 0.05), 0, 0, 6.2832); x.fill();
        }
        var sx = ox + P * 0.62, sy = H * 0.63;
        var rg = x.createRadialGradient(sx, sy, 0, sx, sy, R * 0.32);
        rg.addColorStop(0, 'rgba(200,78,52,0.94)'); rg.addColorStop(0.55, 'rgba(170,58,40,0.74)'); rg.addColorStop(1, 'rgba(166,58,40,0)');
        x.fillStyle = rg; x.beginPath(); x.ellipse(sx, sy, R * 0.32, R * 0.17, 0, 0, 6.2832); x.fill();
        x.strokeStyle = 'rgba(255,214,180,0.28)'; x.lineWidth = Math.max(0.5, R * 0.018);
        x.beginPath(); x.ellipse(sx, sy, R * 0.24, R * 0.12, 0, 0, 6.2832); x.stroke();
      } else if (pl.id === 'saturn') {
        // 条带很淡，主要靠柔和的明暗过渡与北极六边形
        for (i = 0; i < 8; i++) {
          x.fillStyle = 'rgba(255,248,224,' + (0.05 + rnd() * 0.07).toFixed(2) + ')';
          x.beginPath(); x.ellipse(ox + rnd() * P, rnd() * H, R * (0.12 + rnd() * 0.26), R * (0.02 + rnd() * 0.04), 0, 0, 6.2832); x.fill();
        }
        x.strokeStyle = 'rgba(150,116,58,0.30)'; x.lineWidth = Math.max(0.6, R * 0.024);
        x.beginPath(); x.ellipse(ox + P * 0.28, H * 0.10, R * 0.26, R * 0.10, 0, 0, 6.2832); x.stroke();
      } else if (pl.id === 'uranus') {
        // 几乎是均无特征的表面，只给极淡的亮带
        for (i = 0; i < 5; i++) {
          x.fillStyle = 'rgba(255,255,255,' + (0.04 + rnd() * 0.05).toFixed(2) + ')';
          x.beginPath(); x.ellipse(ox + rnd() * P, rnd() * H, R * (0.14 + rnd() * 0.28), R * (0.02 + rnd() * 0.04), 0, 0, 6.2832); x.fill();
        }
      } else if (pl.id === 'neptune') {
        // 大暗斑 + 高速白云
        var nx = ox + P * 0.36, ny = H * 0.60;
        var ng = x.createRadialGradient(nx, ny, 0, nx, ny, R * 0.30);
        ng.addColorStop(0, 'rgba(20,32,92,0.80)'); ng.addColorStop(0.6, 'rgba(28,42,110,0.52)'); ng.addColorStop(1, 'rgba(30,46,120,0)');
        x.fillStyle = ng; x.beginPath(); x.ellipse(nx, ny, R * 0.30, R * 0.15, 0, 0, 6.2832); x.fill();
        for (i = 0; i < 9; i++) {
          var cy2 = rnd() * H;
          x.strokeStyle = 'rgba(255,255,255,' + (0.30 + rnd() * 0.34).toFixed(2) + ')';
          x.lineWidth = Math.max(0.5, R * 0.016);
          x.beginPath(); x.moveTo(ox + rnd() * P * 0.5, cy2);
          x.lineTo(ox + P * (0.4 + rnd() * 0.5), cy2 + (rnd() - 0.5) * H * 0.02);
          x.stroke();
        }
      } else if (pl.id === 'europa') {
        // 冰壳裂纹（linea）：锈红色交叉细线 + 少量暗斑
        x.lineCap = 'round';
        for (i = 0; i < 16; i++) {
          var lx = ox + rnd() * P, ly2 = rnd() * H;
          var a2 = rnd() * 6.2832, l2 = R * (0.18 + rnd() * 0.5);
          x.strokeStyle = 'rgba(' + (150 + rnd() * 40 | 0) + ',' + (92 + rnd() * 30 | 0) + ',66,' + (0.26 + rnd() * 0.30).toFixed(2) + ')';
          x.lineWidth = Math.max(0.5, R * (0.010 + rnd() * 0.022));
          x.beginPath(); x.moveTo(lx, ly2);
          x.quadraticCurveTo(lx + Math.cos(a2) * l2 * 0.5 + (rnd() - 0.5) * R * 0.16,
            ly2 + Math.sin(a2) * l2 * 0.5 + (rnd() - 0.5) * R * 0.16,
            lx + Math.cos(a2) * l2, ly2 + Math.sin(a2) * l2);
          x.stroke();
        }
        x.lineCap = 'butt';
        for (i = 0; i < 5; i++) {
          x.fillStyle = 'rgba(150,132,116,0.16)';
          x.beginPath(); x.ellipse(ox + rnd() * P, rnd() * H, R * (0.06 + rnd() * 0.14), R * (0.05 + rnd() * 0.10), rnd(), 0, 6.2832); x.fill();
        }
      } else if (pl.id === 'titan') {
        // 雾霾横向条纹 + 亮赤道带
        for (i = 0; i < 7; i++) {
          streak(rnd() * H, 1, Math.max(0.7, R * 0.05), 'rgba(255,232,190,' + (0.07 + rnd() * 0.10).toFixed(3) + ')');
        }
        x.fillStyle = 'rgba(255,236,196,0.16)';
        x.fillRect(ox, H * 0.44, P, H * 0.12);
        // 甲烷湖（暗斑）
        for (i = 0; i < 4; i++) {
          x.fillStyle = 'rgba(96,58,20,0.34)';
          x.beginPath(); x.ellipse(ox + rnd() * P, H * (0.62 + rnd() * 0.24), R * (0.08 + rnd() * 0.16), R * (0.03 + rnd() * 0.07), 0, 0, 6.2832); x.fill();
        }
      } else if (pl.id === 'pluto') {
        // 斑驳地形 + 心形亮冰原（Tombaugh Regio）
        for (i = 0; i < 14; i++) {
          x.fillStyle = rnd() < 0.5 ? 'rgba(96,80,62,0.20)' : 'rgba(255,248,232,0.16)';
          x.beginPath(); x.ellipse(ox + rnd() * P, rnd() * H, R * (0.07 + rnd() * 0.20), R * (0.06 + rnd() * 0.14), rnd(), 0, 6.2832); x.fill();
        }
        var hx = ox + P * 0.42, hy = H * 0.56, hr = R * 0.30;
        x.fillStyle = 'rgba(255,250,236,0.62)';
        x.beginPath();
        x.moveTo(hx, hy + hr * 0.72);
        x.bezierCurveTo(hx - hr * 1.15, hy + hr * 0.05, hx - hr * 0.52, hy - hr * 0.92, hx, hy - hr * 0.34);
        x.bezierCurveTo(hx + hr * 0.52, hy - hr * 0.92, hx + hr * 1.15, hy + hr * 0.05, hx, hy + hr * 0.72);
        x.closePath(); x.fill();
      }
    }
    texCache[key] = c;
    return c;
  }
  V.clearPlanetCache = function () { texCache = {}; };

  // ------------------------------------------------------------
  // 小行星带 —— 它不是星球
  // 没有圆盘、没有终止线、没有边缘光、没有球形光晕。
  // 只有一条倾斜的碎石带：三层深度的岩石各自公转与自转，加一层极淡的尘带。
  // ------------------------------------------------------------
  var beltRocksCache = {};
  function beltRocks(pl) {
    if (beltRocksCache[pl.id]) return beltRocksCache[pl.id];
    var rnd = U.seed((pl.id.charCodeAt(0) * 733 + pl.id.length * 97) % 2147483647);
    var arr = [];
    var N = 46;
    for (var i = 0; i < N; i++) {
      var z = rnd();                                  // 0 = 远，1 = 近
      var nv = 6 + Math.floor(rnd() * 3);             // 6~8 个顶点
      var verts = [];
      for (var v = 0; v < nv; v++) verts.push(0.66 + rnd() * 0.52);
      arr.push({
        a: rnd() * 6.2832,                            // 初始相位
        rad: 0.52 + rnd() * 0.62,                     // 轨道半径（相对 R）
        s: 0.030 + rnd() * 0.052,                     // 基准尺寸（相对 R）
        z: z,
        orb: 0.55 + rnd() * 0.9,                      // 公转速度
        rot: rnd() * 6.2832,
        spin: (rnd() - 0.5) * 2.4,                    // 自转（可正可反）
        tilt: -0.6 + rnd() * 1.2,                     // 竖直抖动，避免像一条完美椭圆
        verts: verts
      });
    }
    // 近的画在后面（后画在上层）
    arr.sort(function (p, q) { return p.z - q.z; });
    beltRocksCache[pl.id] = arr;
    return arr;
  }

  function drawRock(x, cx, cy, r, rot, fill, rim, verts) {
    x.save();
    x.translate(cx, cy); x.rotate(rot);
    x.beginPath();
    for (var v = 0; v < verts.length; v++) {
      var a = v / verts.length * 6.2832, rr = r * verts[v];
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (v === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fillStyle = fill; x.fill();
    x.strokeStyle = rim; x.lineWidth = Math.max(0.35, r * 0.13); x.stroke();
    // 向光面的一点高光
    x.globalAlpha = 0.20; x.fillStyle = '#fff6e2';
    x.beginPath(); x.ellipse(-r * 0.26, -r * 0.30, r * 0.36, r * 0.24, -0.5, 0, 6.2832); x.fill();
    x.globalAlpha = 1;
    x.restore();
  }

  V.drawBeltField = function (x, cx, cy, R, pl, t, opt) {
    opt = opt || {};
    R = Math.max(4, R);
    var rocks = beltRocks(pl);
    var i, rk;

    // 尘带：倾斜的椭圆薄雾，替代球体的光晕
    x.save();
    x.translate(cx, cy); x.rotate(-0.20); x.scale(1, 0.44);
    var dg = x.createRadialGradient(0, 0, R * 0.42, 0, 0, R * 1.7);
    dg.addColorStop(0, 'rgba(196,178,142,0)');
    dg.addColorStop(0.42, 'rgba(196,178,142,0.15)');
    dg.addColorStop(0.72, 'rgba(150,132,104,0.09)');
    dg.addColorStop(1, 'rgba(120,104,80,0)');
    x.fillStyle = dg; x.beginPath(); x.arc(0, 0, R * 1.7, 0, 6.2832); x.fill();
    x.restore();

    // 细碎的远处尘点
    x.save();
    x.translate(cx, cy); x.rotate(-0.20); x.scale(1, 0.44);
    for (i = 0; i < rocks.length; i++) {
      rk = rocks[i];
      if (rk.z > 0.34) continue;
      var ad = rk.a + t * 0.00009 * rk.orb;
      var rd = R * (0.46 + (rk.rad - 0.52) * 1.06);
      x.globalAlpha = 0.10 + rk.z * 0.34;
      x.fillStyle = '#d8c8a8';
      x.beginPath(); x.arc(Math.cos(ad) * rd, Math.sin(ad) * rd, Math.max(0.4, R * rk.s * 0.30), 0, 6.2832); x.fill();
    }
    x.globalAlpha = 1;
    x.restore();

    // 岩石本体
    for (i = 0; i < rocks.length; i++) {
      rk = rocks[i];
      var ang = rk.a + t * 0.00012 * rk.orb;
      var px = cx + Math.cos(ang) * R * rk.rad;
      var py = cy + Math.sin(ang) * R * rk.rad * 0.44 + rk.tilt * R * 0.10;
      var sz = R * rk.s * (0.52 + rk.z * 0.92);
      var sh = 0.30 + rk.z * 0.55;                       // 近的更亮
      var fill = 'rgb(' + Math.round(74 + sh * 96) + ',' + Math.round(64 + sh * 82) + ',' + Math.round(48 + sh * 60) + ')';
      var rim = 'rgba(255,240,212,' + (0.10 + rk.z * 0.26).toFixed(2) + ')';
      drawRock(x, px, py, sz, rk.rot + t * 0.0007 * rk.spin, fill, rim, rk.verts);
    }
  };

  // 行星（含光晕 / 自转 / 终止线 / 边缘光 / 土星环）
  V.drawPlanet = function (x, cx, cy, R, pl, t, opt) {
    opt = opt || {};
    R = Math.max(3, R);

    // 小行星带不是星球，走碎块带分支
    if (pl.kind === 'belt') { V.drawBeltField(x, cx, cy, R, pl, t, opt); return; }

    var spin = (t * (opt.spinSpeed || 0.012)) % (R * 2);

    if (!opt.noHalo) {
      var halo = x.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.85);
      halo.addColorStop(0, V.hexA(V.lighten(pl.color, 0.25), 0.30));
      halo.addColorStop(0.5, V.hexA(pl.color, 0.12));
      halo.addColorStop(1, V.hexA(pl.color, 0));
      x.fillStyle = halo; x.beginPath(); x.arc(cx, cy, R * 1.85, 0, 6.2832); x.fill();
    }

    // 土星环（后半）
    if (pl.ring) drawRing(x, cx, cy, R, t, false);

    var tex = planetTex(pl, R);
    var P = Math.round(R * 2);
    x.save();
    x.beginPath(); x.arc(cx, cy, R, 0, 6.2832); x.clip();
    x.drawImage(tex, spin * V.dpr, 0, P * V.dpr, P * V.dpr, cx - R, cy - R, P, P);

    // 球面高光
    var spec = x.createRadialGradient(cx - R * 0.34, cy - R * 0.38, R * 0.05, cx - R * 0.3, cy - R * 0.3, R * 1.25);
    spec.addColorStop(0, 'rgba(255,255,255,0.26)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = spec; x.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 终止线
    var sh = x.createRadialGradient(cx - R * 0.38, cy - R * 0.38, R * 0.16, cx, cy, R * 1.02);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.58, 'rgba(0,0,0,0)');
    sh.addColorStop(0.88, 'rgba(0,0,0,0.36)'); sh.addColorStop(1, 'rgba(0,0,0,0.72)');
    x.fillStyle = sh; x.fillRect(cx - R, cy - R, R * 2, R * 2);
    x.restore();

    // 边缘光
    x.strokeStyle = V.hexA(V.lighten(pl.color, 0.5), 0.5); x.lineWidth = Math.max(0.7, R * 0.03);
    x.beginPath(); x.arc(cx, cy, R - 0.5, 0, 6.2832); x.stroke();

    // 土星环（前半）
    if (pl.ring) drawRing(x, cx, cy, R, t, true);
  };

  function drawRing(x, cx, cy, R, t, front) {
    var tilt = 0.30;
    x.save();
    x.translate(cx, cy); x.rotate(-0.32); x.scale(1, Math.sin(tilt) + 0.18);
    for (var i = 0; i < 3; i++) {
      var rr = R * (1.42 + i * 0.20);
      var a = 0.30 - i * 0.07;
      if (front) {
        x.strokeStyle = 'rgba(224,196,150,' + a + ')';
        x.lineWidth = R * (0.13 - i * 0.02);
        x.beginPath(); x.arc(0, 0, rr, 0, Math.PI); x.stroke();
      } else {
        x.strokeStyle = 'rgba(224,196,150,' + a + ')';
        x.lineWidth = R * (0.13 - i * 0.02);
        x.beginPath(); x.arc(0, 0, rr, Math.PI, 6.2832); x.stroke();
      }
    }
    x.restore();
  }

  // 太阳
  V.drawSun = function (x, cx, cy, R, t) {
    R = Math.max(5, R);
    var pulse = 1 + 0.045 * Math.sin(t * 0.0022);
    var corona = x.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 5.2);
    corona.addColorStop(0, 'rgba(255,186,80,0.42)');
    corona.addColorStop(0.35, 'rgba(255,138,50,0.16)');
    corona.addColorStop(1, 'rgba(255,110,32,0)');
    x.fillStyle = corona; x.beginPath(); x.arc(cx, cy, R * 5.2, 0, 6.2832); x.fill();
    var g = x.createRadialGradient(cx - R * 0.22, cy - R * 0.22, R * 0.15, cx, cy, R * pulse);
    g.addColorStop(0, '#fff8e0'); g.addColorStop(0.45, '#ffc851'); g.addColorStop(1, '#ff7a28');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * pulse, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(176,76,18,0.34)';
    x.beginPath(); x.arc(cx + R * 0.32, cy - R * 0.12, R * 0.13, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(cx - R * 0.22, cy + R * 0.34, R * 0.08, 0, 6.2832); x.fill();
    x.strokeStyle = 'rgba(255,224,160,0.28)'; x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(cx - R * 3.4, cy); x.lineTo(cx + R * 3.4, cy);
    x.moveTo(cx, cy - R * 3.4); x.lineTo(cx, cy + R * 3.4);
    x.stroke();
  };

  // ------------------------------------------------------------
  // 火箭
  // ------------------------------------------------------------
  // 计算装配后各零件的相对位置（以火箭"底部"为 y=0，向上为负）
  V.rocketLayout = function (c, s) {
    s = s || 1;
    var P = SV.PARTS, items = [], y = 0, i;
    var engines = c.engines || [], tanks = c.tanks || [], pod = c.pod, boosters = c.boosters || [];

    // 引擎（并排，底部对齐；尺寸已统一故顶部齐平）
    var engW = 0, gap = 3 * s;
    for (i = 0; i < engines.length; i++) engW += P[engines[i]].w * s + (i ? gap : 0);
    var ex = -engW / 2;
    for (i = 0; i < engines.length; i++) {
      var e = P[engines[i]];
      items.push({ kind: 'engine', id: engines[i], p: e, x: ex + e.w * s / 2, y: y - e.h * s / 2, w: e.w * s, h: e.h * s });
      ex += e.w * s + gap;
    }
    var engH = engines.length ? P[engines[0]].h * s : 0;
    y -= engH + 1 * s;
    var engTop = y;

    // 燃料罐（堆叠）
    for (i = 0; i < tanks.length; i++) {
      var tk = P[tanks[i]];
      items.push({ kind: 'tank', id: tanks[i], p: tk, x: 0, y: y - tk.h * s / 2, w: tk.w * s, h: tk.h * s });
      y -= tk.h * s + 1 * s;
    }

    // 舱体
    items.push({ kind: 'pod', id: c.podId, p: pod, x: 0, y: y - pod.h * s / 2, w: pod.w * s, h: pod.h * s });

    // 主体宽度（助推器/载荷定位基准）
    var bodyW = pod.w * s;
    for (i = 0; i < tanks.length; i++) { var tw = P[tanks[i]].w * s; if (tw > bodyW) bodyW = tw; }
    if (engW > bodyW) bodyW = engW;

    // 助推器（侧挂主体两侧，底部贴近引擎顶部，向上延伸）
    for (i = 0; i < boosters.length; i++) {
      var bs = P[boosters[i]];
      var side = (i % 2 === 0) ? -1 : 1;
      var col = Math.floor(i / 2);
      var bx = side * (bodyW / 2 + bs.w * s * 0.55 + col * (bs.w * s + 2 * s));
      var by = engTop - bs.h * s / 2 + 2 * s;
      items.push({ kind: 'booster', id: boosters[i], p: bs, x: bx, y: by, w: bs.w * s, h: bs.h * s, side: side });
    }

    // 载荷（互斥多选，对称挂在舱体两侧）
    var pl = c.payloads || [];
    for (i = 0; i < pl.length; i++) {
      var pd = P[pl[i]];
      if (!pd) continue;
      var pside = (i % 2 === 0) ? -1 : 1;
      var row = Math.floor(i / 2);
      var px2 = pside * (pod.w * s / 2 + pd.w * s * 0.45);
      var py2 = y - pod.h * s * (0.30 + row * 0.34);
      items.push({ kind: 'payload', id: pl[i], p: pd, x: px2, y: py2, w: pd.w * s, h: pd.h * s });
    }

    // 总宽度：遍历所有零件外缘
    var minX = -bodyW / 2, maxX = bodyW / 2;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'payload' || it.kind === 'booster') {
        if (it.x - it.w / 2 < minX) minX = it.x - it.w / 2;
        if (it.x + it.w / 2 > maxX) maxX = it.x + it.w / 2;
      }
    }
    return { items: items, engBottom: engH, top: y - pod.h * s, bottom: 0, width: maxX - minX };
  };

  var ROCKET_ORDER = { engine: 0, booster: 0, tank: 1, pod: 2, payload: 3 };
  // 各载荷的着色，让火箭侧面一眼能看出带了什么
  var PAYLOAD_TINT = {
    inst: ['#7a5cff', '#b98cff'],
    cargo: ['#c08a3e', '#f0b45a'],
    drill: ['#8a7f6a', '#d6c6a0'],
    armor: ['#5a7f8a', '#a8d8ff'],
    nav: ['#2d7fc0', '#8fd8ff'],
    sampler: ['#4a8a5a', '#9df0c0']
  };

  V.drawRocket = function (x, cx, cyBase, s, c, t, flame, anim) {
    var lay = V.rocketLayout(c, s);
    var P = SV.PARTS;
    // 整体装配进度（用于尾焰淡入）
    var gk = 1;
    if (anim) {
      var last = 0;
      for (var z = 0; z < lay.items.length; z++) last = Math.max(last, ROCKET_ORDER[lay.items[z].kind] || 0);
      gk = U.clamp((anim.t - last * 0.07) / 0.30, 0, 1);
    }
    // 尾焰
    if (flame > 0 && gk > 0) {
      x.save();
      x.globalAlpha = U.ease(gk);
      for (var q = 0; q < lay.items.length; q++) {
        var it = lay.items[q];
        if (it.kind !== 'engine' && it.kind !== 'booster') continue;
        var fy = cyBase + it.y + it.h / 2;
        var flick = 0.78 + 0.22 * Math.sin(t * 0.03 + it.x);
        var boostF = it.kind === 'booster' ? 1.18 : 1;          // 助推器喷焰更浓
        var fl = it.h * (1.5 + flame * 1.5) * flick * boostF;
        var fw = it.w * (it.kind === 'booster' ? 0.36 : 0.42);
        var g = x.createLinearGradient(0, fy, 0, fy + fl);
        g.addColorStop(0, 'rgba(255,255,225,0.95)');
        g.addColorStop(0.28, 'rgba(255,206,110,0.85)');
        g.addColorStop(0.66, 'rgba(255,132,52,0.42)');
        g.addColorStop(1, 'rgba(255,90,30,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(cx + it.x - fw, fy);
        x.lineTo(cx + it.x + fw, fy);
        x.quadraticCurveTo(cx + it.x + fw * 0.5, fy + fl * 0.6, cx + it.x, fy + fl);
        x.quadraticCurveTo(cx + it.x - fw * 0.5, fy + fl * 0.6, cx + it.x - fw, fy);
        x.closePath(); x.fill();
        // 内焰
        x.fillStyle = 'rgba(255,252,235,0.75)';
        x.beginPath();
        x.moveTo(cx + it.x - fw * 0.42, fy);
        x.lineTo(cx + it.x + fw * 0.42, fy);
        x.lineTo(cx + it.x, fy + fl * 0.44 * flick);
        x.closePath(); x.fill();
      }
      x.restore();
    }

    for (var i = 0; i < lay.items.length; i++) {
      var o = lay.items[i];
      var k = 1;
      if (anim) {
        k = U.clamp((anim.t - (ROCKET_ORDER[o.kind] || 0) * 0.07) / 0.30, 0, 1);
        if (k <= 0) continue;
        x.save();
        x.globalAlpha = U.ease(k);
        x.translate(0, (1 - U.ease(k)) * -46);
      }
      var px = cx + o.x, py = cyBase + o.y;
      if (o.kind === 'engine') {
        var hw = o.w / 2, hh = o.h / 2;
        var thrust = (o.p && o.p.thrust) || 60;
        var nozR, glowCol;
        if (thrust < 50) { nozR = 0.40; glowCol = '#7fd0ff'; }
        else if (thrust < 120) { nozR = 0.54; glowCol = '#ffd66b'; }
        else { nozR = 0.68; glowCol = '#ff9b5c'; }
        x.fillStyle = V.metal(x, px - hw, px + hw);
        x.beginPath();
        x.moveTo(px - hw * 0.78, py - hh);
        x.lineTo(px + hw * 0.78, py - hh);
        x.lineTo(px + hw, py - hh * 0.5);
        x.lineTo(px + hw * nozR, py + hh);
        x.lineTo(px - hw * nozR, py + hh);
        x.lineTo(px - hw, py - hh * 0.5);
        x.closePath(); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 0.8; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.18)';
        x.fillRect(px - hw * 0.78, py - hh, hw * 1.56, hh * 0.16);
        x.fillStyle = glowCol; x.shadowColor = glowCol; x.shadowBlur = o.w * 0.45;
        x.fillRect(px - hw * 0.6, py - hh * 0.1, hw * 1.2, hh * 0.16);
        x.shadowBlur = 0;
        x.fillStyle = '#1a0e14';
        x.beginPath(); x.ellipse(px, py + hh * 0.86, hw * nozR * 0.82, hh * 0.22, 0, 0, 6.2832); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(px - hw * 0.92, py + hh * 0.2); x.lineTo(px + hw * 0.92, py + hh * 0.2); x.stroke();
      } else if (o.kind === 'tank') {
        var tw = o.w, th = o.h, tx = px - tw / 2, ty = py - th / 2;
        V.roundRect(x, tx, ty, tw, th, tw * 0.2);
        x.fillStyle = V.metal(x, tx, tx + tw); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 0.9; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.16)';
        x.fillRect(tx + tw * 0.08, ty, tw * 0.84, th * 0.06);
        x.fillRect(tx + tw * 0.08, ty + th * 0.94, tw * 0.84, th * 0.06);
        x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(tx + tw * 0.08, ty + th * 0.06); x.lineTo(tx + tw * 0.92, ty + th * 0.06); x.stroke();
        x.beginPath(); x.moveTo(tx + tw * 0.08, ty + th * 0.94); x.lineTo(tx + tw * 0.92, ty + th * 0.94); x.stroke();
        for (var k = 1; k <= 2; k++) {
          var ly = ty + th * k / 3;
          x.beginPath(); x.moveTo(tx, ly); x.lineTo(tx + tw, ly); x.stroke();
        }
        x.fillStyle = 'rgba(127,208,255,0.55)'; x.shadowColor = '#7fd0ff'; x.shadowBlur = tw * 0.3;
        x.fillRect(px - tw * 0.08, ty + th * 0.18, tw * 0.16, th * 0.64);
        x.shadowBlur = 0;
        x.fillStyle = 'rgba(255,255,255,0.5)';
        x.fillRect(px - tw * 0.06, ty + th * 0.2, tw * 0.025, th * 0.6);
      } else if (o.kind === 'pod') {
        var pw = o.w, ph = o.h, pxt = px - pw / 2, pyt = py - ph / 2;
        V.roundRect(x, pxt, pyt, pw, ph, pw * 0.28);
        x.fillStyle = V.metal(x, pxt, pxt + pw); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.26)'; x.lineWidth = 0.9; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.16)';
        x.fillRect(pxt + pw * 0.06, pyt + ph * 0.9, pw * 0.88, ph * 0.06);
        x.strokeStyle = 'rgba(0,0,0,0.26)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(pxt + pw * 0.06, pyt + ph * 0.9); x.lineTo(pxt + pw * 0.94, pyt + ph * 0.9); x.stroke();
        var winR = pw * 0.1;
        var winY = pyt + ph * 0.34;
        var winCols = pw > 26 ? 3 : 2;
        for (var wi = 0; wi < winCols; wi++) {
          var wx = pxt + pw * (0.5 + (wi - (winCols - 1) / 2) * 0.5);
          x.fillStyle = '#7fd0ff'; x.shadowColor = '#7fd0ff'; x.shadowBlur = pw * 0.4;
          x.beginPath(); x.arc(wx, winY, winR, 0, 6.2832); x.fill(); x.shadowBlur = 0;
          x.fillStyle = 'rgba(255,255,255,0.7)';
          x.beginPath(); x.arc(wx - winR * 0.3, winY - winR * 0.3, winR * 0.36, 0, 6.2832); x.fill();
        }
        x.strokeStyle = 'rgba(0,0,0,0.24)'; x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(pxt, pyt + ph * 0.62); x.lineTo(pxt + pw, pyt + ph * 0.62); x.stroke();
        x.fillStyle = V.metal(x, pxt, pxt + pw);
        x.beginPath();
        x.moveTo(pxt, pyt + ph * 0.2);
        x.quadraticCurveTo(pxt + pw * 0.12, pyt - ph * 0.34, px, pyt - ph * 0.5);
        x.quadraticCurveTo(pxt + pw * 0.88, pyt - ph * 0.34, pxt + pw, pyt + ph * 0.2);
        x.closePath(); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.22)'; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.4)';
        x.beginPath(); x.arc(px, pyt - ph * 0.42, pw * 0.05, 0, 6.2832); x.fill();
      } else if (o.kind === 'booster') {
        var bw = o.w, bh = o.h, bxt = px - bw / 2, byt = py - bh / 2;
        var sd = o.side || 1;
        V.roundRect(x, bxt, byt + bh * 0.1, bw, bh * 0.78, bw * 0.3);
        x.fillStyle = V.metal(x, bxt, bxt + bw); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.2)'; x.lineWidth = 0.7; x.stroke();
        x.fillStyle = V.metal(x, bxt, bxt + bw);
        x.beginPath();
        x.moveTo(bxt, byt + bh * 0.1);
        x.quadraticCurveTo(px, byt - bh * 0.06, bxt + bw, byt + bh * 0.1);
        x.closePath(); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.18)'; x.stroke();
        x.fillStyle = 'rgba(255,155,92,0.7)';
        x.fillRect(bxt, byt + bh * 0.24, bw, bh * 0.07);
        x.fillRect(bxt, byt + bh * 0.64, bw, bh * 0.07);
        x.strokeStyle = 'rgba(0,0,0,0.26)'; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(bxt, byt + bh * 0.45); x.lineTo(bxt + bw, byt + bh * 0.45); x.stroke();
        x.fillStyle = V.metal(x, bxt, bxt + bw);
        x.beginPath();
        x.moveTo(bxt, byt + bh * 0.88);
        x.lineTo(bxt + bw, byt + bh * 0.88);
        x.lineTo(bxt + bw * 0.72, byt + bh);
        x.lineTo(bxt + bw * 0.28, byt + bh);
        x.closePath(); x.fill();
        x.fillStyle = '#1a0e14';
        x.beginPath(); x.ellipse(px, byt + bh * 0.97, bw * 0.28, bh * 0.06, 0, 0, 6.2832); x.fill();
        x.strokeStyle = 'rgba(180,190,210,0.5)'; x.lineWidth = 1;
        x.beginPath();
        x.moveTo(px - sd * bw * 0.5, byt + bh * 0.3);
        x.lineTo(px - sd * bw * 1.1, byt + bh * 0.3);
        x.moveTo(px - sd * bw * 0.5, byt + bh * 0.7);
        x.lineTo(px - sd * bw * 1.1, byt + bh * 0.7);
        x.stroke();
      } else if (o.kind === 'payload') {
        var tint = PAYLOAD_TINT[o.id] || ['#7a5cff', '#b98cff'];
        x.fillStyle = tint[0]; x.shadowColor = tint[1]; x.shadowBlur = o.w * 0.6;
        V.roundRect(x, px - o.w / 2, py - o.h / 2, o.w, o.h, 2); x.fill(); x.shadowBlur = 0;
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(px - o.w * 0.28, py - o.h * 0.28, o.w * 0.2, o.h * 0.2);
        if (o.id === 'inst') {
          // 天线
          x.strokeStyle = 'rgba(200,180,255,0.6)'; x.lineWidth = 0.8;
          x.beginPath(); x.moveTo(px, py - o.h / 2); x.lineTo(px + o.w * 0.5, py - o.h * 1.3); x.stroke();
        } else if (o.id === 'armor') {
          x.strokeStyle = 'rgba(168,216,255,0.5)'; x.lineWidth = 1;
          x.strokeRect(px - o.w / 2, py - o.h / 2, o.w, o.h);
        } else if (o.id === 'drill') {
          x.fillStyle = 'rgba(214,198,160,0.9)';
          x.beginPath(); x.moveTo(px, py + o.h / 2); x.lineTo(px - o.w * 0.2, py + o.h * 0.95);
          x.lineTo(px + o.w * 0.2, py + o.h * 0.95); x.closePath(); x.fill();
        }
      }
      if (anim) x.restore();
    }
    return lay;
  };

  // ------------------------------------------------------------
  // 粒子系统
  // ------------------------------------------------------------
  function PS(max) { this.max = max || 220; this.a = []; }
  PS.prototype.emit = function (o) {
    if (this.a.length >= this.max) this.a.shift();
    this.a.push({
      x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 1, t: 0, r: o.r || 2, g: o.g || 0,
      c: o.c || '255,200,120', fade: o.fade === undefined ? 1 : o.fade, kind: o.kind || 'dot'
    });
  };
  PS.prototype.burst = function (x, y, n, opt) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, sp = U.rnd(opt.sp0 || 30, opt.sp1 || 130);
      this.emit({
        x: x + Math.cos(a) * U.rnd(0, opt.jitter || 3),
        y: y + Math.sin(a) * U.rnd(0, opt.jitter || 3),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: U.rnd(opt.life0 || 0.4, opt.life1 || 1.0),
        r: U.rnd(opt.r0 || 1.2, opt.r1 || 3.6),
        g: opt.g || 0, c: opt.c || '255,190,110', kind: opt.kind || 'dot'
      });
    }
  };
  PS.prototype.update = function (dt) {
    for (var i = this.a.length - 1; i >= 0; i--) {
      var p = this.a[i];
      p.t += dt;
      if (p.t >= p.life) { this.a.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      p.vx *= (1 - dt * 1.1); p.vy *= (1 - dt * 0.5);
    }
  };
  PS.prototype.draw = function (x) {
    for (var i = 0; i < this.a.length; i++) {
      var p = this.a[i];
      var k = 1 - p.t / p.life;
      x.globalAlpha = Math.max(0, k) * p.fade;
      x.fillStyle = 'rgb(' + p.c + ')';
      if (p.kind === 'spark') {
        x.beginPath(); x.arc(p.x, p.y, p.r * k, 0, 6.2832); x.fill();
      } else {
        x.beginPath(); x.arc(p.x, p.y, p.r * (0.4 + k * 0.6), 0, 6.2832); x.fill();
      }
      x.globalAlpha = 1;
    }
  };
  PS.prototype.clear = function () { this.a.length = 0; };
  V.PS = PS;

  // ------------------------------------------------------------
  // 小行星（飞行障碍）
  // ------------------------------------------------------------
  V.drawRock = function (x, cx, cy, r, rot, spots, tint) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    var n = spots && spots.length ? spots.length : 9;
    x.beginPath();
    for (var i = 0; i < n; i++) {
      var a = i / n * 6.2832;
      var rr = r * (0.78 + (spots ? spots[i].d : Math.random() * 0.4));
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) x.moveTo(px, py);
      else {
        var pa = (i - 0.5) / n * 6.2832;
        x.quadraticCurveTo(Math.cos(pa) * r * 1.06, Math.sin(pa) * r * 1.06, px, py);
      }
    }
    x.closePath();
    var g = x.createRadialGradient(-r * 0.34, -r * 0.34, r * 0.1, 0, 0, r * 1.15);
    g.addColorStop(0, tint || '#9c8a70'); g.addColorStop(0.62, '#6a5a46'); g.addColorStop(1, '#2e271c');
    x.fillStyle = g; x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 1; x.stroke();
    if (spots) {
      for (var k = 0; k < spots.length; k++) {
        var sp = spots[k];
        x.fillStyle = 'rgba(38,30,20,0.5)';
        x.beginPath(); x.arc(Math.cos(sp.a) * r * sp.d, Math.sin(sp.a) * r * sp.d, r * sp.r, 0, 6.2832); x.fill();
      }
    }
    x.restore();
  };

  // ------------------------------------------------------------
  // 场景：机库（设计台背景）
  // ------------------------------------------------------------
  V.drawHangar = function (x, w, h, t) {
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1024'); g.addColorStop(0.55, '#070b1a'); g.addColorStop(1, '#04060f');
    x.fillStyle = g; x.fillRect(0, 0, w, h);

    // 后墙桁架
    x.strokeStyle = 'rgba(120,150,220,0.10)'; x.lineWidth = 1;
    for (var i = 0; i < 9; i++) {
      var px = w * (i + 0.5) / 9;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h * 0.72); x.stroke();
    }
    for (var j = 1; j < 4; j++) {
      var py = h * 0.18 * j;
      x.beginPath(); x.moveTo(0, py); x.lineTo(w, py); x.stroke();
    }
    // 斜撑
    x.strokeStyle = 'rgba(120,150,220,0.07)';
    for (var k = 0; k < 8; k++) {
      x.beginPath();
      x.moveTo(w * k / 8, 0); x.lineTo(w * (k + 1) / 8, h * 0.54); x.stroke();
    }

    // 顶部射灯光锥
    for (var s = 0; s < 3; s++) {
      var lx = w * (0.2 + s * 0.3);
      var lg = x.createLinearGradient(lx, 0, lx, h * 0.9);
      lg.addColorStop(0, 'rgba(150,190,255,0.14)');
      lg.addColorStop(1, 'rgba(150,190,255,0)');
      x.fillStyle = lg;
      x.beginPath();
      x.moveTo(lx - 6, 0); x.lineTo(lx + 6, 0);
      x.lineTo(lx + w * 0.19, h * 0.92); x.lineTo(lx - w * 0.19, h * 0.92);
      x.closePath(); x.fill();
      x.fillStyle = 'rgba(200,225,255,' + (0.5 + 0.18 * Math.sin(t * 0.002 + s)) + ')';
      x.beginPath(); x.arc(lx, 4, 2.6, 0, 6.2832); x.fill();
    }

    // 地板网格（透视）
    var horizon = h * 0.90;
    var fg = x.createLinearGradient(0, horizon, 0, h);
    fg.addColorStop(0, 'rgba(30,44,80,0.55)'); fg.addColorStop(1, 'rgba(10,16,34,0.9)');
    x.fillStyle = fg; x.fillRect(0, horizon, w, h - horizon);
    x.strokeStyle = 'rgba(150,180,255,0.13)'; x.lineWidth = 0.8;
    for (var gx = -6; gx <= 6; gx++) {
      x.beginPath(); x.moveTo(w / 2 + gx * w * 0.035, horizon); x.lineTo(w / 2 + gx * w * 0.20, h); x.stroke();
    }
    for (var gy = 1; gy <= 5; gy++) {
      var yy = horizon + (h - horizon) * (gy / 5) * (gy / 5);
      x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy); x.stroke();
    }
    x.strokeStyle = 'rgba(150,180,255,0.22)';
    x.beginPath(); x.moveTo(0, horizon); x.lineTo(w, horizon); x.stroke();

    // 底部暗角
    var vg = x.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.2, w / 2, h * 0.55, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
  };

  // ------------------------------------------------------------
  // 场景：基地全景
  // ------------------------------------------------------------
  var ridgeCache = {};
  function ridge(pl, idx, w) {
    var key = pl.id + '_r' + idx + '_' + Math.round(w);
    if (ridgeCache[key]) return ridgeCache[key];
    var rnd = U.seed((pl.id.charCodeAt(0) * 31 + idx * 977 + Math.round(w)) % 2147483647);
    var pts = [], n = 22;
    for (var i = 0; i <= n; i++) {
      pts.push({ x: i / n * w, y: (rnd() * 0.5 + (idx === 0 ? 0.18 : 0.42)) });
    }
    ridgeCache[key] = pts;
    return pts;
  }

  V.drawBaseScene = function (x, w, h, t, pl, built, homeDist) {
    // 浮空站：气态与冰巨星没有可以落脚的地表，脚下是翻涌的云顶
    var isSky = (pl.kind === 'gas' || pl.kind === 'ice');

    // 天空
    var sky = x.createLinearGradient(0, 0, 0, h * 0.78);
    sky.addColorStop(0, pl.sky[1]); sky.addColorStop(1, pl.sky[0]);
    x.fillStyle = sky; x.fillRect(0, 0, w, h);

    // 星点（夜面）—— 离太阳越远天越黑，星星越显眼
    var starA = U.clamp(0.28 + homeDist / 300, 0.28, 0.98);
    if (!V._bs || V._bs.w !== w) V._bs = { arr: V.makeStars(w, h * 0.7, 70, 0.05), w: w };
    x.globalAlpha = starA * 0.85;
    V.drawStars(x, V._bs.arr, t, 0, h * 0.7);
    x.globalAlpha = 1;

    // 远处恒星（越远越小越暗）
    var sunR = U.clamp(17 - homeDist * 0.075, 2.4, 17);
    V.drawSun(x, w * 0.79, h * 0.19, sunR, t);

    // 远山两层（缓视差）；浮空站改为两层漂移的云带
    var groundY = h * 0.68;
    for (var L = 0; L < 2; L++) {
      if (isSky) {
        var cShift = (t * (L === 0 ? 0.008 : 0.014)) % (w + 220);
        // 远云带更白更亮 —— 是云，不是山
        var cCol = L === 0 ? V.hexA(V.lighten(pl.color, 0.55), 0.50) : V.hexA(V.lighten(pl.color, 0.30), 0.60);
        for (var q2 = -1; q2 < 9; q2++) {
          var qx = ((q2 * (w / 7) + cShift) % (w + 220)) - 110;
          x.fillStyle = cCol;
          x.beginPath();
          x.ellipse(qx, groundY - h * (L === 0 ? 0.028 : 0.012), w * 0.19, h * (L === 0 ? 0.055 : 0.038), 0, 0, 6.2832);
          x.fill();
        }
        continue;
      }
      var pts = ridge(pl, L, w);
      var amp = L === 0 ? h * 0.13 : h * 0.09;
      var shift = (t * (L === 0 ? 0.0016 : 0.0034)) % w;
      var col = L === 0 ? V.mix(pl.groundDark, pl.sky[0], 0.42) : V.mix(pl.groundDark, pl.sky[0], 0.18);
      x.fillStyle = col;
      x.beginPath(); x.moveTo(-2, groundY + 4);
      for (var i = 0; i < pts.length; i++) {
        var px = (pts[i].x + shift) % w;
        x.lineTo(px, groundY - pts[i].y * amp);
      }
      x.lineTo(w + 2, groundY + 4); x.closePath(); x.fill();
    }

    if (isSky) {
      // 云顶：脚下不是地表，是翻涌的云海。顶层被太阳照亮呈亮白，
      // 向下渐变到行星色 → 行星暗面，让「云顶」读起来比「沙地」更白更亮。
      var cd = x.createLinearGradient(0, groundY - h * 0.04, 0, h);
      cd.addColorStop(0, V.hexA('#ffffff', 0.78));
      cd.addColorStop(0.18, V.hexA(V.lighten(pl.color, 0.55), 0.72));
      cd.addColorStop(0.45, V.hexA(pl.color, 0.78));
      cd.addColorStop(1, V.hexA(pl.dark, 0.94));
      x.fillStyle = cd;
      x.beginPath(); x.moveTo(0, groundY + h * 0.03);
      for (var g2 = 0; g2 <= 24; g2++) {
        var gx = g2 / 24 * w;
        var gy = groundY - Math.sin(g2 * 0.9 + t * 0.0006) * h * 0.013 - Math.sin(g2 * 2.3 + t * 0.0011) * h * 0.007;
        x.lineTo(gx, gy);
      }
      x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fill();
    } else {
      // 地表（大弧）
      var R = w * 1.9, cyG = groundY + R - h * 0.10;
      var gg = x.createLinearGradient(0, groundY, 0, h);
      gg.addColorStop(0, V.lighten(pl.ground, 0.10));
      gg.addColorStop(0.35, pl.ground);
      gg.addColorStop(1, pl.groundDark);
      x.fillStyle = gg;
      x.beginPath(); x.arc(w / 2, cyG, R, Math.PI * 1.5 - 0.62, Math.PI * 1.5 + 0.62); x.closePath(); x.fill();
      // 地表高光边
      x.strokeStyle = V.hexA(V.lighten(pl.ground, 0.45), 0.5); x.lineWidth = 1.4;
      x.beginPath(); x.arc(w / 2, cyG, R, Math.PI * 1.5 - 0.62, Math.PI * 1.5 + 0.62); x.stroke();
    }

    // 建筑
    var order = [
      { id: 'mine', col: '#dfe6f5' },
      { id: 'refinery', col: '#7fd0ff' },
      { id: 'lab', col: '#b98cff' },
      { id: 'hab', col: '#6ee0a0' }
    ];
    var slots = [];
    for (var o = 0; o < order.length; o++) {
      var cnt = Math.min(built[order[o].id] || 0, 6);
      for (var c2 = 0; c2 < cnt; c2++) slots.push(order[o]);
    }
    var n = slots.length;
    var y0 = groundY + h * 0.05;
    for (var b = 0; b < n; b++) {
      var frac = n === 1 ? 0.5 : b / (n - 1);
      var bx = w * (0.10 + frac * 0.80);
      var arcT = (frac - 0.5) * 1.24;
      var by = y0 + Math.abs(arcT) * Math.abs(arcT) * h * 0.075;
      var sc = U.clamp(1 - Math.abs(arcT) * 0.22, 0.66, 1);
      drawBuilding(x, bx, by, sc * h * 0.055, slots[b].id, slots[b].col, t, b);
    }

    // 雾霾层（浮空站始终有，地表星球只有浓大气的几颗有）
    if (isSky || pl.id === 'venus' || pl.id === 'titan') {
      var hz = x.createLinearGradient(0, 0, 0, h);
      hz.addColorStop(0, V.hexA(pl.color, 0.16));
      hz.addColorStop(0.5, V.hexA(pl.color, 0.08));
      hz.addColorStop(1, V.hexA(pl.dark, 0.22));
      x.fillStyle = hz; x.fillRect(0, 0, w, h);
    }

    // 前景尘埃
    if (!V._dust || V._dust.w !== w) {
      V._dust = { w: w, arr: [] };
      for (var d = 0; d < 26; d++) {
        V._dust.arr.push({ x: Math.random() * w, y: h * 0.45 + Math.random() * h * 0.55, r: 0.5 + Math.random() * 1.4, sp: 3 + Math.random() * 12, ph: Math.random() * 6.28 });
      }
    }
    for (var q = 0; q < V._dust.arr.length; q++) {
      var dd = V._dust.arr[q];
      var dx = (dd.x + t * 0.001 * dd.sp) % (w + 20) - 10;
      var dy = dd.y + Math.sin(t * 0.0012 + dd.ph) * 3;
      x.globalAlpha = 0.14 + 0.16 * Math.sin(t * 0.002 + dd.ph);
      x.fillStyle = '#cfe0ff';
      x.beginPath(); x.arc(dx, dy, dd.r, 0, 6.2832); x.fill();
      x.globalAlpha = 1;
    }

    // 暗角
    var vg = x.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.22, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
  };

  function drawBuilding(x, bx, by, s, kind, col, t, idx) {
    var flick = 0.65 + 0.35 * Math.sin(t * 0.0035 + idx * 2.1);
    x.save(); x.translate(bx, by);
    // 地基阴影
    x.fillStyle = 'rgba(0,0,0,0.32)';
    x.beginPath(); x.ellipse(0, s * 0.14, s * 0.95, s * 0.16, 0, 0, 6.2832); x.fill();

    if (kind === 'mine') {
      // 井架
      x.strokeStyle = 'rgba(20,24,38,0.92)'; x.lineWidth = Math.max(1.2, s * 0.10);
      x.beginPath();
      x.moveTo(-s * 0.42, s * 0.12); x.lineTo(0, -s * 1.5); x.lineTo(s * 0.42, s * 0.12);
      x.moveTo(-s * 0.26, -s * 0.28); x.lineTo(s * 0.26, -s * 0.28);
      x.moveTo(-s * 0.16, -s * 0.82); x.lineTo(s * 0.16, -s * 0.82);
      x.stroke();
      x.fillStyle = col; x.globalAlpha = flick;
      x.beginPath(); x.arc(0, -s * 1.56, s * 0.09, 0, 6.2832); x.fill();
      x.globalAlpha = 1;
      // 矿斗
      x.fillStyle = 'rgba(26,32,50,0.95)';
      x.fillRect(-s * 0.2, -s * 0.5, s * 0.4, s * 0.34);
    } else if (kind === 'lab') {
      // 穹顶
      var g = x.createLinearGradient(0, -s * 0.9, 0, s * 0.1);
      g.addColorStop(0, '#2a3350'); g.addColorStop(1, '#0e1426');
      x.fillStyle = g;
      x.beginPath(); x.arc(0, s * 0.10, s * 0.62, Math.PI, 0); x.closePath(); x.fill();
      x.strokeStyle = V.hexA(col, 0.55); x.lineWidth = 1.1; x.stroke();
      x.fillStyle = col; x.globalAlpha = flick * 0.9;
      x.beginPath(); x.arc(-s * 0.2, -s * 0.24, s * 0.07, 0, 6.2832); x.fill();
      x.beginPath(); x.arc(s * 0.2, -s * 0.24, s * 0.07, 0, 6.2832); x.fill();
      x.globalAlpha = 1;
      // 天线
      x.strokeStyle = 'rgba(180,160,255,0.5)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, -s * 0.62); x.lineTo(s * 0.18, -s * 1.15); x.stroke();
    } else if (kind === 'refinery') {
      // 罐体 + 管道
      x.fillStyle = '#141a2c';
      V.roundRect(x, -s * 0.42, -s * 1.05, s * 0.84, s * 1.12, s * 0.16); x.fill();
      x.strokeStyle = V.hexA(col, 0.5); x.lineWidth = 1; x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(-s * 0.42, -s * 0.5); x.lineTo(s * 0.42, -s * 0.5); x.stroke();
      x.beginPath(); x.moveTo(-s * 0.42, -s * 0.86); x.lineTo(s * 0.42, -s * 0.86); x.stroke();
      // 顶灯
      x.fillStyle = col; x.globalAlpha = flick;
      x.beginPath(); x.arc(0, -s * 1.16, s * 0.08, 0, 6.2832); x.fill();
      x.globalAlpha = 1;
      // 火炬臂
      x.strokeStyle = '#141a2c'; x.lineWidth = Math.max(1, s * 0.08);
      x.beginPath(); x.moveTo(s * 0.42, -s * 0.9); x.lineTo(s * 0.72, -s * 1.3); x.stroke();
      x.fillStyle = 'rgba(255,170,80,' + (0.5 * flick).toFixed(2) + ')';
      x.beginPath(); x.arc(s * 0.72, -s * 1.32, s * 0.09, 0, 6.2832); x.fill();
    } else {
      // 居住舱
      x.fillStyle = '#161d31';
      V.roundRect(x, -s * 0.62, -s * 0.42, s * 1.24, s * 0.5, s * 0.22); x.fill();
      x.strokeStyle = V.hexA(col, 0.5); x.lineWidth = 1; x.stroke();
      for (var i = 0; i < 3; i++) {
        var wy = -s * 0.16 + i * s * 0.15;
        var on = (Math.sin(t * 0.0018 + idx + i * 1.7) > -0.2);
        x.fillStyle = on ? V.hexA(col, 0.85) : 'rgba(120,140,180,0.22)';
        x.beginPath(); x.arc(-s * 0.3 + i * s * 0.3, wy, s * 0.065, 0, 6.2832); x.fill();
      }
      // 太阳能板
      x.fillStyle = 'rgba(40,70,130,0.7)';
      x.fillRect(-s * 1.05, -s * 0.3, s * 0.4, s * 0.22);
      x.fillRect(s * 0.65, -s * 0.3, s * 0.4, s * 0.22);
    }
    x.restore();
  }

  // ------------------------------------------------------------
  // 场景：启动首屏
  // ------------------------------------------------------------
  V.drawIntro = function (x, w, h, t) {
    var neb = V.nebula(w, h, 'intro');
    x.drawImage(neb, 0, 0, w, h);
    if (!V._is || V._is.w !== w) {
      V._is = { w: w, far: V.makeStars(w, h, 150, 0.05), near: V.makeStars(w, h, 46, 0.12) };
    }
    V.drawStars(x, V._is.far, t, 0, h);
    V.drawStars(x, V._is.near, t, (t * 0.012) % h, h);

    var cx = w / 2, cy = h * 0.40, R = Math.min(w, h) * 0.15;
    // 太阳（画面左上远处）
    V.drawSun(x, w * 0.13, h * 0.13, 13, t);
    // 轨道
    x.strokeStyle = 'rgba(150,180,255,0.13)'; x.lineWidth = 1;
    x.beginPath(); x.ellipse(cx, cy, R * 2.5, R * 0.82, 0, 0, 6.2832); x.stroke();
    x.beginPath(); x.ellipse(cx, cy, R * 3.3, R * 1.12, 0, 0, 6.2832); x.stroke();
    // 轨道行星
    var orbs = [
      { r: R * 2.5, k: R * 0.82, sp: 0.00052, pl: 'moon', s: 0.10 },
      { r: R * 3.3, k: R * 1.12, sp: 0.00036, pl: 'mars', s: 0.13 }
    ];
    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i], a = t * o.sp + i * 2.3;
      var ox = cx + Math.cos(a) * o.r, oy = cy + Math.sin(a) * o.k;
      var sc = 0.82 + 0.18 * (Math.sin(a) + 1) / 2;
      V.drawPlanet(x, ox, oy, R * o.s * sc, SV.planetById(o.pl), t, { spinSpeed: 0.01 });
    }
    V.drawPlanet(x, cx, cy, R, SV.planetById('earth'), t, { spinSpeed: 0.009 });
  };

})(window);
