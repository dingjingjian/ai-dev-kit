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
 *   热核战争 —— 两段式：先轻点敌方城市（地球光点或抽屉列表）选中，再按「发 射」确认；
 *               已选中的目标再点一次等价于确认。核弹不可逆，不做一键发射。
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

    /* 先做 WebGL 预检，再弹阵营选择 —— 顺序不能反：
     * 不支持 WebGL 的设备上，让玩家挑完阵营才告诉他跑不了 3D，是纯粹的浪费。
     * 预检用临时 canvas，不会占用真实画布的上下文。 */
    if (!DC.render.probe()) {
      loader.classList.add('hide');
      fallback.classList.add('show');
      return;
    }
    loader.classList.add('hide');
    DC.ui.showSetup(start);

  /* ── 选定阵营后真正开局 ─────────────────────────────────
   * 阵营必须在 create 时就定下来：雷达环、己方单位可见性、城市列表敌我划分
   * 全部依赖 playerFaction，开局后再改要重建半个渲染层。 */
  function start(factionCode) {
    DC.ui.hideSetup();

    /* 声音默认开启：此处正处在「点选阵营」的真实手势回调里，
     * 是解锁 AudioContext（resume suspended）的唯一可靠时机 ——
     * 过了这一村，后面就没有必然会发生的用户手势了。 */
    if (DC.audio) DC.audio.unlock();

    // autoPlayer=false：玩家席位不再由 AI 托管（D3 曾临时开启以便无人值守跑完整局）
    var state = S.create({
      seed: Date.now() % 2147483647, autoPlayer: false, playerFaction: factionCode
    });

    var ok = false;
    try {
      ok = DC.render.init(state, canvas);
    } catch (e) {
      ok = false;
    }
    if (!ok || !DC.render.ok) {
      fallback.classList.add('show');
      return;
    }

    // 开局定位到所选阵营的中心位置（DESIGN §2.4）：相机飞到该阵营城市质心
    var ctr = DC.geo.centroid(DC.CITIES_BY_FACTION[factionCode]);
    DC.render.flyTo(ctr.lat, ctr.lon);

    /* ── 玩家指令 ───────────────────────────────────────────── */

    function chooseOption(i) {
      if (!S.choose(state, state.playerFaction, i)) DC.ui.deny();
    }

    // 齐射：同一目标连打 n 发。逐发调用 playerFire 而非一次扣 n 枚 ——
    // 每发都要单独过「井里还有没有弹」的检查，井打空了就自然停在第 k 发。
    function fireAt(cityId, count) {
      var n = (count > 0) ? count : 1, fired = 0, m = null;
      for (var i = 0; i < n; i++) {
        var r = S.playerFire(state, cityId);
        if (!r) break;
        m = r; fired++;
      }
      if (!fired) DC.ui.deny();
      return m;
    }

    // 主动引爆：跳过剩下的危机博弈，直接进入热核战争
    function maxCrisis() {
      if (state.phase !== 'crisis') return;
      S.forceWar(state, '我方主动全面开战');
    }

    /* 倍速：只放大每帧累积的时间，逻辑仍是 10 Hz 固定步长 ——
     * 加速不会改变任何一次判定，只是把同样的战局快进播放。 */
    var speed = 1;
    function setSpeed(v) { speed = (v > 0) ? v : 1; }

    DC.ui.init(state, {
      onChoose: chooseOption, onFire: fireAt, onCrisisMax: maxCrisis, onSpeed: setSpeed
    });

    var again = document.getElementById('again');
    if (again) again.addEventListener('click', function () { global.location.reload(); });

    /* ── 地球点击：轻点 = 发射/选中，拖动 = 转视角 ─────────────────
     * 相机控制已吃掉 pointerdown/move/up，这里只在同一组事件里量位移，
     * 位移小且时间短才判定为「点击」，否则视为转视角误触。
     */
    var downX = 0, downY = 0, downT = 0;
    canvas.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY; downT = Date.now();
      // 抽屉开着时点地球 = 收起抽屉：竖屏上抽屉盖掉 84% 宽度，
      // 先让它自己消失，玩家才看得见自己点在哪。
      if (DC.ui.isDrawerOpen()) DC.ui.closeDrawer();
    }, { passive: true });
    canvas.addEventListener('pointerup', function (e) {
      if (Date.now() - downT > 400) return;
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
      var r = canvas.getBoundingClientRect();
      var c = DC.render.pickCity(state, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      if (!c) return;
      if (state.phase === 'war' && c.faction !== state.playerFaction) {
        // 两段式：首次轻点只是选中目标，再点同一座城才真的发射（与城市列表同一口径）
        if (DC.ui.getPending() === c.id) DC.ui.fire();
        else DC.ui.selectTarget(c.id);
        return;
      }
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
      acc += dt * speed;

      var guard = 0;
      while (acc >= S.TICK && guard < 40) { S.tick(state, S.TICK); acc -= S.TICK; guard++; }

      DC.render.frame(state, dt);
      DC.ui.update(state);
      global.requestAnimationFrame(loop);
    }
    global.requestAnimationFrame(loop);

    // 便于调试与无头核查
    DC.game = {
      state: state, autoPlay: false,
      fireAt: fireAt, chooseOption: chooseOption, maxCrisis: maxCrisis,
      selectTarget: function (id) { return DC.ui.selectTarget(id); }
    };
  }                                  // ── end start ──
  }                                  // ── end boot ──

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(typeof window !== 'undefined' ? window : globalThis);
