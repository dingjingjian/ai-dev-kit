/*
 * defcon — game.js
 * 启动与主循环：固定步长推进逻辑 + 每帧渲染插值（DESIGN §7.3）
 * 依赖：全部脚本（本文件最后加载）
 * 命名空间：window.DC（经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → sim.js → ai.js → render.js → ui.js → game.js
 *
 * 逻辑 10 Hz 固定步长、渲染 60 fps 插值：固定步长让 AI 行为与玩家操作完全确定，
 * 掉帧只影响画面平滑度，不改变战局结果（便于 tests/ 无头断言复现）。
 *
 * 玩家指令入口（D4）：
 *   危机博弈 —— 点事件卡选项，或按数字键 1..n；回合内可改主意，超时按最保守项结算。
 *   热核战争 —— 点敌方城市（列表或地球上的光点）即从最近的可用发射井打一发。
 * 发射井选择规则放在 sim.nearestSilo，玩家与 AI 共用，避免两套口径。
 */
(function (global) {
  'use strict';
  var DC = global.DC;
  var S = DC.sim;

  function boot() {
    var canvas = document.getElementById('stage');
    var loader = document.getElementById('loader');
    var fallback = document.getElementById('fallback');

    // autoPlayer=false：玩家席位不再由 AI 托管（D3 曾临时开启以便无人值守跑完整局）
    var state = S.create({ seed: Date.now() % 2147483647, autoPlayer: false });

    var ok = false;
    try {
      ok = DC.render.init(state, canvas);
    } catch (e) {
      ok = false;
    }
    if (!ok || !DC.render.ok) {
      loader.classList.add('hide');
      fallback.classList.add('show');
      return;
    }

    /* ── 玩家指令 ───────────────────────────────────────────── */

    function chooseOption(i) {
      if (!S.choose(state, state.playerFaction, i)) DC.ui.deny();
    }

    function fireAt(cityId) {
      var m = S.playerFire(state, cityId);
      if (!m) DC.ui.deny();
      return m;
    }

    DC.ui.init(state, { onChoose: chooseOption, onFire: fireAt });

    var again = document.getElementById('again');
    if (again) again.addEventListener('click', function () { global.location.reload(); });

    /* ── 地球点击：轻点 = 发射/选中，拖动 = 转视角 ─────────────────
     * 相机控制已吃掉 pointerdown/move/up，这里只在同一组事件里量位移，
     * 位移小且时间短才判定为「点击」，否则视为转视角误触。
     */
    var downX = 0, downY = 0, downT = 0;
    canvas.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    }, { passive: true });
    canvas.addEventListener('pointerup', function (e) {
      if (Date.now() - downT > 400) return;
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
      var r = canvas.getBoundingClientRect();
      var c = DC.render.pickCity(state, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      if (!c) return;
      if (state.phase === 'war' && c.faction !== state.playerFaction) { fireAt(c.id); return; }
      DC.render.flyTo(c.lat, c.lon);
    }, { passive: true });

    // 数字键 1..n 选事件卡选项
    global.addEventListener('keydown', function (e) {
      if (state.phase !== 'crisis' || !state.card) return;
      var i = parseInt(e.key, 10) - 1;
      if (isNaN(i) || i < 0 || i >= state.card.options.length) return;
      chooseOption(i);
    });

    DC.render.onContextLost = function () { fallback.classList.add('show'); };
    DC.render.onContextRestored = function () { fallback.classList.remove('show'); };
    loader.classList.add('hide');

    global.addEventListener('resize', function () { DC.render.resize(); });

    /* ── 主循环 ─────────────────────────────────────────────── */

    var last = (global.performance && performance.now) ? performance.now() : Date.now();
    var acc = 0;
    var MAX_STEP = 0.25;         // 单帧最多补 0.25s，防止切后台回来后一次性追帧卡死

    function loop(now) {
      var dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > MAX_STEP) dt = MAX_STEP;
      acc += dt;

      var guard = 0;
      while (acc >= S.TICK && guard < 40) { S.tick(state, S.TICK); acc -= S.TICK; guard++; }

      DC.render.frame(state, dt);
      DC.ui.update(state);
      global.requestAnimationFrame(loop);
    }
    global.requestAnimationFrame(loop);

    // 便于调试与无头核查
    DC.game = { state: state, autoPlay: false, fireAt: fireAt, chooseOption: chooseOption };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(typeof window !== 'undefined' ? window : globalThis);
