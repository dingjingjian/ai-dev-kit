// 星航者 · 飞行关卡
(function (global) {
  'use strict';

  var SV = global.SV, U = SV.util, V = SV.vfx;
  var doc = global.document;

  var F = null, RAF = null;

  // ------------------------------------------------------------
  // 音效见 src/sfx.js（BGM 与音效共用同一个 AudioContext）
  // ------------------------------------------------------------

  // ------------------------------------------------------------
  // 关卡生成
  // ------------------------------------------------------------
  function buildLevel(f) {
    var gap = f.gap, haz = f.pl.haz || 1;
    var groups = U.clamp(Math.round(gap / 13) + haz, 5, 20);
    var rnd = U.seed(Math.floor(Math.random() * 1e9));
    var W = f.W;
    var margin = 34;

    for (var i = 0; i < groups; i++) {
      var wy = f.worldTotal * (i + 0.75) / (groups + 0.8);
      var roll = rnd();

      if (roll < 0.15) {
        // 引力井
        f.obs.push({
          type: 'well', wy: wy,
          x: margin + rnd() * (W - margin * 2),
          R: 78 + rnd() * 46,
          pull: 210 + rnd() * 150,
          dir: rnd() < 0.5 ? -1 : 1,
          ph: rnd() * 6.28
        });
      } else if (roll < 0.40) {
        // 碎片带（留一个缺口）
        var gw = 96 + rnd() * 54;
        var gx = margin + rnd() * Math.max(1, W - margin * 2 - gw);
        var cnt = U.irnd(4, 6);
        for (var k = 0; k < cnt; k++) {
          var fx = margin + rnd() * (W - margin * 2);
          if (fx > gx - 26 && fx < gx + gw + 26) continue;
          f.obs.push(mkRock(fx, wy + (rnd() - 0.5) * 46, 11 + rnd() * 11, rnd));
        }
      } else {
        var n2 = roll < 0.72 ? 1 : 2;
        for (var m = 0; m < n2; m++) {
          f.obs.push(mkRock(
            margin + rnd() * (W - margin * 2),
            wy + (rnd() - 0.5) * 60,
            14 + rnd() * 16, rnd
          ));
        }
      }

      // 拾取物
      if (i % 4 === 2) f.picks.push({ type: 'fuel', wy: wy + 70, x: margin + rnd() * (W - margin * 2), r: 15, got: 0 });
      if (i % 6 === 4) f.boosts.push({ wy: wy + 40, x: margin + rnd() * (W - margin * 2), w: 92, got: 0 });
      if (f.c.payloads.indexOf('inst') >= 0 && i % 5 === 3) f.picks.push({ type: 'crystal', wy: wy + 30, x: margin + rnd() * (W - margin * 2), r: 14, got: 0 });
    }
    f.obs.sort(function (a, b) { return a.wy - b.wy; });
  }
  function mkRock(x, wy, r, rnd) {
    var spots = [];
    for (var i = 0; i < 9; i++) spots.push({ a: i / 9 * 6.2832 + (rnd() - 0.5) * 0.3, d: 0.76 + rnd() * 0.42, r: 0.13 + rnd() * 0.22 });
    return {
      type: 'rock', x: x, wy: wy, r: r,
      rot: rnd() * 6.28, vr: (rnd() - 0.5) * 1.1,
      drift: (rnd() - 0.5) * 34, ph: rnd() * 6.28, spots: spots
    };
  }

  // ------------------------------------------------------------
  // 启动
  // ------------------------------------------------------------
  function start(opt) {
    var s = SV.store.state;
    doc.getElementById('flight').classList.add('on');
    var cv = doc.getElementById('flightCanvas');
    var x = cv.getContext('2d');
    var size = V.fit(cv, x);
    var W = size.w, H = size.h;

    var c = opt.calc, pl = opt.planet, from = opt.from;
    var gap = Math.abs(pl.dist - from.dist);
    var T = SV.FLIGHT_BASE_T + gap * SV.FLIGHT_T_PER_DIST;  // 目标飞行时长（秒）
    var vy0 = c.climb;                        // 基础上升速度 px/s
    var worldTotal = vy0 * T;
    // 消耗与航程严格同一套模型：飞满航程正好烧光一箱油，
    // 所以「航段 ≤ 航程」等价于「油够用」，面板数字不再骗人。
    var fuelUsed = c.range > 0 ? U.clamp(c.fuel * (gap / c.range), 0, c.fuel) : c.fuel;
    var fuelPerSec = fuelUsed / Math.max(0.1, T);

    F = {
      cv: cv, x: x, W: W, H: H,
      c: c, sv: opt.sv, pl: pl, from: from, gap: gap,
      worldTotal: worldTotal, worldY: 0, vy0: vy0, vy: vy0,
      boostT: 0,
      rocket: { x: W / 2, tx: W / 2, y: H * 0.74, vx: 0, tilt: 0 },
      fuel: c.fuel, fuel0: c.fuel, burnRate: fuelPerSec,
      shield: c.shield, shield0: c.shield, hits: 0, invT: 0,
      obs: [], picks: [], boosts: [],
      psT: new V.PS(150), psF: new V.PS(260),
      shake: 0, over: false, won: false, endT: 0, dead: false,
      last: global.performance.now(), crystals: 0, deadReason: '',
      // 音效冷却：引力井 / 燃料告急都是持续状态，不能每帧都响
      wellT: 0, lowFuel: 0,
      neb: V.nebula(W, H, 'fly'),
      sFar: V.makeStars(W, H, 70, 0.03),
      sNear: V.makeStars(W, H, 46, 0.09),
      onEnd: opt.onEnd, tipHide: 0
    };
    buildLevel(F);

    doc.getElementById('flightTarget').innerHTML = pl.name + '<span id="flightSub">ASCENDING</span>';
    doc.getElementById('progFrom').textContent = from.name;
    doc.getElementById('progTo').textContent = pl.name;
    var tip = doc.getElementById('flightTip');
    tip.textContent = c.shield > 0 ? '左右拖动控制火箭 · 护盾可抗 ' + c.shield + ' 次撞击' : '左右拖动控制火箭 · 没有护盾，一次撞击即失败';
    tip.style.opacity = '1';

    renderShields();
    if (SV.bgm) SV.bgm.setScene('flight');
    SV.sfx.launch();
    if (!RAF) RAF = global.requestAnimationFrame(loop);
  }

  function renderShields() {
    var host = doc.getElementById('shields');
    host.innerHTML = '';
    if (F.shield0 === 0) {
      var s0 = doc.createElement('i'); s0.className = 'off'; host.appendChild(s0);
      return;
    }
    for (var i = 0; i < F.shield0; i++) {
      var s = doc.createElement('i');
      if (i >= F.shield) s.className = 'off';
      host.appendChild(s);
    }
  }

  // ------------------------------------------------------------
  // 输入
  // ------------------------------------------------------------
  function pointer(e) {
    if (!F || F.over) return;
    var r = F.cv.getBoundingClientRect();
    F.rocket.tx = U.clamp(e.clientX - r.left, 16, F.W - 16);
  }
  function bindInput() {
    var cv = doc.getElementById('flightCanvas');
    cv.addEventListener('pointerdown', function (e) {
      pointer(e); try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener('pointermove', function (e) {
      if (e.buttons === 0 && e.pointerType === 'mouse') return;
      pointer(e);
    });
  }

  // ------------------------------------------------------------
  // 主循环
  // ------------------------------------------------------------
  function loop(now) {
    if (!F) { RAF = null; return; }
    var dt = (now - F.last) / 1000; F.last = now;
    if (dt > 0.05) dt = 0.05;

    update(dt, now);
    draw(now);

    if (F.over && F.endT > (F.won ? 1.5 : 1.7)) {
      var payload = {
        won: F.won, hits: F.hits, fuelLeft: Math.max(0, F.fuel),
        crystals: F.crystals, deadReason: F.deadReason
      };
      var cb = F.onEnd;
      F = null; RAF = null;
      doc.getElementById('flight').classList.remove('on');
      if (cb) cb(payload);
      return;
    }
    RAF = global.requestAnimationFrame(loop);
  }

  function update(dt, now) {
    var r = F.rocket;
    F.psT.update(dt); F.psF.update(dt);
    if (F.shake > 0) F.shake = Math.max(0, F.shake - dt * 2.6);
    if (F.invT > 0) F.invT -= dt;
    if (F.wellT > 0) F.wellT -= dt;

    if (F.over) {
      F.endT += dt;
      if (F.won) {
        r.y -= 120 * dt;
        for (var i = 0; i < 3; i++) {
          F.psT.emit({ x: r.x + U.rnd(-6, 6), y: r.y + 16, vx: U.rnd(-30, 30), vy: U.rnd(60, 130), life: 0.5, r: 3, c: '255,210,140' });
        }
      } else if (!F.dead) {
        r.y += 60 * dt; r.tilt += dt * 1.4;
      }
      return;
    }

    // 加速环计时
    if (F.boostT > 0) { F.boostT -= dt; F.vy = F.vy0 * 1.75; }
    else F.vy = F.vy0;

    // 前进
    var prevY = F.worldY;
    F.worldY += F.vy * dt;
    F.fuel -= F.burnRate * dt;

    // 横向控制（带惯性上限）
    var maxVX = 400 + F.c.twr * 40;
    var want = (r.tx - r.x) * 7.5;
    r.vx = U.clamp(want, -maxVX, maxVX);
    r.x += r.vx * dt;

    // 引力井横向拉扯
    var pulled = 0;
    for (var w = 0; w < F.obs.length; w++) {
      var o = F.obs[w];
      if (o.type !== 'well') continue;
      var d = Math.abs(o.wy - F.worldY);
      if (d > 260) continue;
      var dx = o.x - r.x;
      var dist = Math.abs(dx);
      if (dist < o.R) {
        var k = (1 - dist / o.R);
        r.x += Math.sign(dx || 1) * o.pull * k * k * dt;
        if (k > pulled) pulled = k;        // 取最强的那口井，免得多井叠加时响成一片
      }
    }
    // 被拽走时给一声下行低鸣：横向失控是最容易「莫名其妙就撞了」的时刻，
    // 光有画面不够，得让玩家听见。冷却 0.9s，一口井只提醒一次。
    if (pulled > 0.28 && F.wellT <= 0) {
      F.wellT = 0.9;
      SV.sfx.well();
      flash('引力异常', '#b98cff');
    }
    r.x = U.clamp(r.x, 15, F.W - 15);
    r.tilt = U.clamp((r.tx - r.x) / 90, -0.42, 0.42);

    // 障碍（只处理视口附近的）
    for (var i = 0; i < F.obs.length; i++) {
      var ob = F.obs[i];
      var sy = r.y + (F.worldY - ob.wy);
      if (sy < -140 || sy > F.H + 160) continue;
      if (ob.type === 'rock') {
        ob.rot += ob.vr * dt;
        if (F.invT <= 0) {
          var ddx = r.x - ob.x, ddy = r.y - sy;
          var rr = ob.r + 11;
          if (ddx * ddx + ddy * ddy < rr * rr) onHit(ob.x, sy);
        }
      } else if (ob.type === 'boost') continue;
    }

    // 加速环（穿越检测）
    for (var b = 0; b < F.boosts.length; b++) {
      var bo = F.boosts[b];
      if (bo.got) continue;
      if (prevY < bo.wy && F.worldY >= bo.wy) {
        if (Math.abs(r.x - bo.x) < bo.w / 2 + 8) {
          bo.got = 1; F.boostT = 1.6;
          F.fuel = Math.min(F.fuel0, F.fuel + F.fuel0 * 0.06);
          F.psF.burst(r.x, r.y, 18, { c: '150,225,255', sp0: 60, sp1: 190, life0: 0.3, life1: 0.7, r0: 1.4, r1: 3.4 });
          SV.sfx.boost();
          flash('加速！', '#8fd8ff');
        }
      }
    }

    // 拾取
    for (var q = 0; q < F.picks.length; q++) {
      var pk = F.picks[q];
      if (pk.got) continue;
      var sy2 = r.y + (F.worldY - pk.wy);
      if (sy2 < -60 || sy2 > F.H + 60) continue;
      var pdx = r.x - pk.x, pdy = r.y - sy2;
      if (pdx * pdx + pdy * pdy < (pk.r + 14) * (pk.r + 14)) {
        pk.got = 1;
        if (pk.type === 'fuel') {
          var add = F.fuel0 * 0.14;
          F.fuel = Math.min(F.fuel0, F.fuel + add);
          F.psF.burst(pk.x, sy2, 16, { c: '255,206,110', sp0: 50, sp1: 170, r0: 1.4, r1: 3.4 });
          SV.sfx.pick(); flash('燃料 +' + U.fmt(add), '#ffd66b');
        } else {
          F.crystals++;
          F.psF.burst(pk.x, sy2, 16, { c: '185,140,255', sp0: 50, sp1: 170, r0: 1.4, r1: 3.4 });
          SV.sfx.crystal(); flash('数据晶体', '#b98cff');
        }
      }
    }

    // HUD
    var pct = U.clamp(F.worldY / F.worldTotal, 0, 1);
    doc.getElementById('progFill').style.width = (pct * 100).toFixed(1) + '%';
    doc.getElementById('progPct').textContent = Math.round(pct * 100) + '%';
    var ff = doc.getElementById('fuelFill');
    var fp = U.clamp(F.fuel / F.fuel0, 0, 1);
    ff.style.width = (fp * 100) + '%';
    ff.className = 'f' + (fp < 0.25 ? ' low' : '');
    // 燃料见底：只响一次。油价条变红是看的，这一声是听的
    if (fp < 0.25 && !F.lowFuel) {
      F.lowFuel = 1;
      SV.sfx.alarm();
      flash('燃料告急', '#ff9b5c');
    }

    if (F.tipHide === 0 && now - (F.t0 || (F.t0 = now)) > 3200) {
      doc.getElementById('flightTip').style.opacity = '0';
      F.tipHide = 1;
    }

    // 结束判定
    if (F.fuel <= 0 && !F.over) {
      F.over = true; F.won = false; F.deadReason = 'fuel';
      SV.sfx.fail();
    } else if (F.worldY >= F.worldTotal && !F.over) {
      F.over = true; F.won = true;
      SV.sfx.win();
      F.psF.burst(r.x, r.y, 34, { c: '160,230,255', sp0: 60, sp1: 220, life0: 0.4, life1: 1.0 });
    }
  }

  function onHit(hx, hy) {
    F.hits++;
    F.shake = 1;
    if (F.shield > 0) {
      F.shield--; F.invT = 1.3;
      F.psF.burst(hx, hy, 26, { c: '255,170,90', sp0: 70, sp1: 230, life0: 0.3, life1: 0.8 });
      F.psF.burst(F.rocket.x, F.rocket.y, 14, { c: '150,220,255', sp0: 40, sp1: 160 });
      // 最后一层护盾破掉要和「还有余量」区分开：下一次撞击就是终局
      if (F.shield === 0) { SV.sfx.shield(); flash('护盾归零', '#ff7a7a'); }
      else SV.sfx.hit();
      renderShields();
      if (F.shield > 0) flash('护盾 −1', '#ff9b5c');
    } else {
      F.over = true; F.won = false; F.dead = true; F.deadReason = 'crash';
      F.psF.burst(F.rocket.x, F.rocket.y, 46, { c: '255,150,70', sp0: 80, sp1: 320, life0: 0.4, life1: 1.2, r0: 1.6, r1: 5 });
      F.psF.burst(F.rocket.x, F.rocket.y, 20, { c: '255,250,230', sp0: 40, sp1: 180, life0: 0.2, life1: 0.6 });
      SV.sfx.boom();
    }
  }

  var flashT = null;
  function flash(txt, color) {
    var el = doc.getElementById('flightTip');
    el.textContent = txt; el.style.color = color; el.style.opacity = '1';
    if (flashT) global.clearTimeout(flashT);
    flashT = global.setTimeout(function () {
      el.style.color = '';
      el.textContent = '左右拖动控制火箭';
      el.style.opacity = '0';
    }, 1400);
  }

  // ------------------------------------------------------------
  // 绘制
  // ------------------------------------------------------------
  function draw(now) {
    var x = F.x, r = F.rocket;
    var sz = V.fit(F.cv, x);
    if (sz.w !== F.W || sz.h !== F.H) {
      F.W = sz.w; F.H = sz.h;
      r.x = U.clamp(r.x, 15, F.W - 15);
      r.tx = U.clamp(r.tx, 16, F.W - 16);
    }
    var W = F.W, H = F.H, scroll = F.worldY;

    x.fillStyle = '#03040a';
    x.fillRect(0, 0, W, H);

    x.save();
    if (F.shake > 0) {
      var s = F.shake * 9;
      x.translate(U.rnd(-s, s), U.rnd(-s, s));
    }

    // 背景
    x.drawImage(F.neb, 0, 0, W, H);
    V.drawStars(x, F.sFar, now, scroll * 0.22 % H, H);
    V.drawStars(x, F.sNear, now, scroll * 0.85 % H, H);

    // 出发星球（随进度缩小下沉）
    var dep = U.clamp(1 - F.worldY / (F.worldTotal * 0.35), 0, 1);
    if (dep > 0.02) {
      var dR = Math.min(W, H) * 0.30 * dep;
      V.drawPlanet(x, W * 0.5, H * (1.02 + (1 - dep) * 0.5), dR, F.from, now, { spinSpeed: 0.008, noHalo: true });
    }
    // 目标星球（随进度放大）
    var prog = U.clamp(F.worldY / F.worldTotal, 0, 1);
    var tR = 13 + Math.pow(prog, 2.1) * Math.min(W, H) * 0.34;
    V.drawPlanet(x, W * 0.5, H * 0.11, tR, F.pl, now, { spinSpeed: 0.014 });

    // 引力井
    for (var i = 0; i < F.obs.length; i++) {
      var o = F.obs[i];
      if (o.type !== 'well') continue;
      var sy = r.y + (F.worldY - o.wy);
      if (sy < -220 || sy > H + 220) continue;
      var rg = x.createRadialGradient(o.x, sy, o.R * 0.1, o.x, sy, o.R);
      rg.addColorStop(0, 'rgba(150,110,255,0.30)');
      rg.addColorStop(0.5, 'rgba(120,80,220,0.13)');
      rg.addColorStop(1, 'rgba(90,60,180,0)');
      x.fillStyle = rg;
      x.beginPath(); x.arc(o.x, sy, o.R, 0, 6.2832); x.fill();
      // 旋涡
      x.strokeStyle = 'rgba(190,160,255,0.24)'; x.lineWidth = 1.1;
      for (var a = 0; a < 3; a++) {
        x.beginPath();
        for (var t2 = 0; t2 <= 1.001; t2 += 0.05) {
          var ang = now * 0.0022 * (a % 2 ? -1 : 1) + t2 * 5.2 + a * 2.1;
          var rr2 = o.R * (0.16 + t2 * 0.78);
          var px = o.x + Math.cos(ang) * rr2, py = sy + Math.sin(ang) * rr2 * 0.55;
          if (t2 === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
      }
      x.fillStyle = 'rgba(210,190,255,0.5)';
      x.beginPath(); x.arc(o.x, sy, 3.4, 0, 6.2832); x.fill();
    }

    // 加速环
    for (var b = 0; b < F.boosts.length; b++) {
      var bo = F.boosts[b];
      var by = r.y + (F.worldY - bo.wy);
      if (by < -40 || by > H + 40) continue;
      var alpha = bo.got ? 0.15 : (0.55 + 0.35 * Math.sin(now * 0.006));
      x.strokeStyle = 'rgba(140,220,255,' + alpha + ')';
      x.lineWidth = bo.got ? 1 : 3;
      x.beginPath(); x.moveTo(bo.x - bo.w / 2, by); x.lineTo(bo.x + bo.w / 2, by); x.stroke();
      if (!bo.got) {
        x.fillStyle = 'rgba(140,220,255,' + (alpha * 0.5) + ')';
        x.beginPath(); x.arc(bo.x - bo.w / 2, by, 5, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(bo.x + bo.w / 2, by, 5, 0, 6.2832); x.fill();
        // 箭头
        x.strokeStyle = 'rgba(210,245,255,' + alpha + ')'; x.lineWidth = 2;
        for (var q = -1; q <= 1; q++) {
          var ax = bo.x + q * 22, ay = by - 8 + Math.sin(now * 0.008 + q) * 3;
          x.beginPath(); x.moveTo(ax - 5, ay + 6); x.lineTo(ax, ay); x.lineTo(ax + 5, ay + 6); x.stroke();
        }
      }
    }

    // 拾取物
    for (var p = 0; p < F.picks.length; p++) {
      var pk = F.picks[p];
      if (pk.got) continue;
      var py2 = r.y + (F.worldY - pk.wy);
      if (py2 < -40 || py2 > H + 40) continue;
      var bob = Math.sin(now * 0.004 + pk.wy) * 3;
      if (pk.type === 'fuel') {
        x.save(); x.translate(pk.x, py2 + bob); x.rotate(Math.sin(now * 0.001) * 0.2);
        x.fillStyle = '#ffd66b'; x.shadowColor = '#ffd66b'; x.shadowBlur = 14;
        V.roundRect(x, -9, -11, 18, 22, 4); x.fill(); x.shadowBlur = 0;
        x.fillStyle = 'rgba(60,40,10,0.55)'; x.fillRect(-9, -3, 18, 3);
        x.restore();
      } else {
        x.save(); x.translate(pk.x, py2 + bob); x.rotate(now * 0.0016);
        x.fillStyle = '#b98cff'; x.shadowColor = '#c9a4ff'; x.shadowBlur = 14;
        x.beginPath();
        x.moveTo(0, -11); x.lineTo(8, 0); x.lineTo(0, 11); x.lineTo(-8, 0);
        x.closePath(); x.fill(); x.shadowBlur = 0;
        x.fillStyle = 'rgba(255,255,255,0.6)';
        x.beginPath(); x.moveTo(0, -7); x.lineTo(4, 0); x.lineTo(0, 4); x.lineTo(-4, 0); x.closePath(); x.fill();
        x.restore();
      }
    }

    // 小行星
    for (var k = 0; k < F.obs.length; k++) {
      var ob = F.obs[k];
      if (ob.type !== 'rock') continue;
      var oy = r.y + (F.worldY - ob.wy);
      if (oy < -80 || oy > H + 80) continue;
      V.drawRock(x, ob.x, oy, ob.r, ob.rot, ob.spots);
    }

    // 粒子
    F.psF.draw(x);
    F.psT.draw(x);

    // 火箭
    if (!F.dead) {
      x.save();
      x.translate(r.x, r.y);
      x.rotate(r.tilt * 0.55);
      if (F.invT > 0 && Math.floor(now / 90) % 2 === 0) x.globalAlpha = 0.45;
      // 护盾光环
      if (F.shield > 0) {
        var sg = x.createRadialGradient(0, 0, 14, 0, 0, 30);
        sg.addColorStop(0, 'rgba(127,208,255,0)');
        sg.addColorStop(0.72, 'rgba(127,208,255,0.10)');
        sg.addColorStop(1, 'rgba(127,208,255,0.30)');
        x.fillStyle = sg; x.beginPath(); x.arc(0, 0, 30, 0, 6.2832); x.fill();
      }
      V.drawRocket(x, 0, 16, 1, {
        pod: F.c.pod, podId: F.sv.pod, tanks: F.sv.tanks, engines: F.sv.engines, boosters: F.sv.boosters || [], payloads: F.sv.payloads || []
      }, now, F.boostT > 0 ? 1.5 : 1);
      x.globalAlpha = 1;
      x.restore();
    }

    // 速度线
    if (F.boostT > 0) {
      x.strokeStyle = 'rgba(160,225,255,0.3)'; x.lineWidth = 1.4;
      for (var v = 0; v < 9; v++) {
        var vx = (now * 0.9 + v * 71) % W;
        var vy2 = (now * 1.4 + v * 137) % H;
        x.beginPath(); x.moveTo(vx, vy2); x.lineTo(vx, vy2 + 26); x.stroke();
      }
    }

    x.restore();

    // 低燃料红闪
    var fp = U.clamp(F.fuel / F.fuel0, 0, 1);
    if (fp < 0.2 && !F.over) {
      x.fillStyle = 'rgba(255,80,60,' + (0.05 + 0.05 * Math.sin(now * 0.012)) + ')';
      x.fillRect(0, 0, W, H);
    }
    // 无敌闪烁
    if (F.invT > 0 && !F.over) {
      x.strokeStyle = 'rgba(127,208,255,' + (0.10 + 0.10 * Math.sin(now * 0.02)) + ')';
      x.lineWidth = 12; x.strokeRect(6, 6, W - 12, H - 12);
    }
  }

  SV.flight = {
    start: start,
    bind: bindInput,
    active: function () { return !!F; }
  };

})(window);
