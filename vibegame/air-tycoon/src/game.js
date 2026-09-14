/*
 * air-tycoon — game.js
 * 主循环 / 阶段推进 / 渲染与 UI 的接线
 * 依赖：data.js → geo.js → landmask.js → sim.js → render.js → ui.js
 * 命名空间：window.AT（经典脚本，无 import/export/type=module）
 *
 * ── 职责边界（与 defcon 同一套分工，这是它能被无头测试的前提）──
 *   sim.js    —— 纯逻辑，10 Hz 固定步长，无 DOM / 无 THREE，可在 Node 下跑完一整局
 *   render.js —— 只读 state，负责画面
 *   ui.js     —— 只读 state + 发指令，负责 DOM
 *   game.js   —— 唯一持有「真实时间」的地方，把 dt 分发给三者
 *
 * ⚠ 固定步长为什么重要：经营类游戏的结果必须**可复现**——
 *   同样的种子、同样的操作，必须得到同样的财报。若把 dt 直接喂给 sim，
 *   帧率波动就会改变结算结果（60fps 与 30fps 跑出不同利润），
 *   存档、测试、平衡标定全部失效。故 sim 一律按 0.1s 的整数倍推进。
 *
 * ⚠ 累加器上限：切后台再回来时，rAF 的 dt 可能是几十秒。
 *   若不加限制，一次 tick 会补跑几千步、直接把一局跑完，玩家回来发现游戏结束了。
 *   上限取 MAX_CATCHUP 秒 —— 补不上就算了，宁可「时间跳了一下」也不能跳掉一局。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};
  var S = AT.sim;
  var R = AT.render;
  var UI = AT.ui;
  var A = AT.audio;      // audio.js 在本脚本之前加载；缺失时全链路静默降级

  var MAX_CATCHUP = 2.0;        // 单帧最多补跑的真实秒数
  var LOAD_TIMEOUT = 12000;     // 贴图/首帧加载超时（毫秒）

  var game = {
    state: null,
    running: false,
    canvas: null,
    raf: 0,
    last: 0,
    acc: 0,
    started: false,
    renderOk: false,
    /* 帧率统计（供诊断；不参与逻辑） */
    fps: 0, _fpsAcc: 0, _fpsN: 0
  };

  /* 开局：建 state → 初始化渲染 → 起主循环。
   * opts: { seed, homeCityId, companyName, autoPlayer } */
  function boot(opts) {
    game.state = S.create(opts || {});

    var canvas = document.getElementById('stage');
    if (!canvas) { console.error('[AT] 找不到 #stage 画布'); return false; }
    game.canvas = canvas;

    game.renderOk = false;
    if (R && R.probe()) {
      try {
        game.renderOk = R.init(game.state, canvas);
      } catch (e) {
        console.error('[AT] 渲染初始化失败：', e);
        game.renderOk = false;
      }
    }

    if (UI && UI.init) UI.init(game.state, game);

    /* 渲染不可用时不阻断游戏：把 3D 关掉、只留 HUD。
     * 本作的经营决策全部在面板上完成，地图是「看清网络」的辅助 ——
     * 所以哪怕 WebGL 挂了，游戏仍然可玩（这在低端机上不是小概率事件）。 */
    if (!game.renderOk) {
      var fb = document.getElementById('fallback');
      if (fb) fb.classList.add('show');
    }

    /* 进入简报阶段 → 自动推进到运营。
     * briefing 只用于展示「你的公司、你的基地」这一屏，8 秒后自动开局。 */
    game.started = true;
    game.running = true;
    game.last = (global.performance || Date).now();
    game.acc = 0;

    /* 音频：boot 由「开始经营」那次点击触发 → 处在用户手势里，可安全解锁。
     * ⚠ AudioContext 必须在手势中创建/resume()，否则首次 play() 会被自动播放
     *   策略拦下、且**不报错**（表现为「音效时有时无」）。故解锁放在这里而非
     *   等到第一声真的响起。BGM 的 cue 由主循环按公司规模设置。 */
    if (A) {
      A.unlock();
      A.setCue('startup');
      A.bgm.start();
    }

    game.raf = global.requestAnimationFrame(loop);
    return true;
  }

  function loop(now) {
    if (!game.running) return;
    game.raf = global.requestAnimationFrame(loop);

    var dt = (now - game.last) / 1000;
    game.last = now;
    if (!(dt > 0)) dt = 0;
    // 补跑上限：切后台回来的超大 dt 不补，直接丢弃多余部分
    if (dt > MAX_CATCHUP) dt = MAX_CATCHUP;

    // 帧率统计（1 秒窗口）
    game._fpsAcc += dt; game._fpsN++;
    if (game._fpsAcc >= 1) {
      game.fps = Math.round(game._fpsN / game._fpsAcc);
      game._fpsAcc = 0; game._fpsN = 0;
    }

    var st = game.state;
    var phaseBefore = st.phase;

    /* ① 逻辑：按固定步长推进（accumulator 模式）。
     * 倍速通过「一帧内跑几次 tick」实现，而不是把 dt 乘大 ——
     * 后者会让状态推进的粒度随倍速变化，结算结果不再与 1 倍速一致。 */
    var speed = st.speed || 1;
    game.acc += dt * speed;
    var guard = 0;
    while (game.acc >= S.TICK && guard++ < 600) {
      S.tick(st, S.TICK);
      game.acc -= S.TICK;
    }
    // 兜底：加速倍率极高或卡顿时，直接对齐到最近步长，避免 accumulator 无限膨胀
    if (guard >= 600) game.acc = 0;

    /* 阶段切换钩子：briefing → operating 时给一条示范航线。
     *
     * ⚠ 必须在**这里**做，不能在启动脚本里直接调 openRoute ——
     *   开局时 phase 还是 briefing，而 openRoute 第一句就检查
     *   `if (state.phase !== 'operating') return {ok:false, reason:'尚未开始运营'}`，
     *   直接调用必定失败（实机确认：routes 恒为 0）。
     *   阶段切换只有 sim 内部 tick 知道，所以钩子必须挂在主循环里。 */
    if (phaseBefore === 'briefing' && st.phase === 'operating') {
      seedFirstRoute(st);
    }

    /* ② 表现：渲染层拿真实 dt（它只做插值与动画，不需要确定性） */
    if (game.renderOk && R.frame) {
      try { R.frame(st, dt); } catch (e) {
        // 渲染抛错不能拖死游戏：关掉渲染、留 HUD，让玩家至少能继续经营
        console.error('[AT] 渲染帧异常，已降级为纯 HUD：', e);
        game.renderOk = false;
        var fb = document.getElementById('fallback');
        if (fb) fb.classList.add('show');
      }
    }

    /* ③ UI：同样拿真实 dt（打字机、缓动、toast 计时都在 UI 内部） */
    if (UI && UI.frame) {
      try { UI.frame(st, dt); } catch (e) { console.error('[AT] UI 帧异常：', e); }
    }

    /* ④ 音频：音序器必须每帧泵一次（它按 currentTime 排下一个音），
     * 换段判据用「公司规模」而不是时间 —— 见 audio.js 文件头。
     * 音频异常绝不能拖死主循环，故整段包在 try 里。 */
    if (A) {
      try {
        A.pump();
        var cue = cueFor(st);
        if (cue !== lastCue) { lastCue = cue; A.setCue(cue); }
      } catch (e) { console.error('[AT] 音频帧异常：', e); }
    }
  }

  /* BGM 段落判据：按公司**规模**换段，与玩家的成就感同步。
   *   支线起家 < 8 条线 → 网络扩张 8~20 条 → 全球巨企 > 20 条或进入全球前二。
   * 「进入前二」为什么要算进去：有的玩法是「少而精」——
   *   只飞 6 条超级干线就能夺冠，若只看航线数，这类打法永远听不到最终段落，
   *   而它明明已经是全球巨企了（评价与音乐的口径必须一致）。 */
  var lastCue = null;
  function cueFor(st) {
    if (st.phase === 'over') return lastCue || 'startup';
    if (st.routes.length > 20) return 'global';
    var rk = S.ranking(st);
    if (rk.length > 1 && rk[0] && rk[0].isPlayer) return 'global';
    if (st.routes.length >= 8) return 'expand';
    return 'startup';
  }

  /* 开局示范航线：从基地飞往一个可达的大城。
   *
   * 为什么需要：开局 2 架闲置飞机 + 0 条航线，画面上只有 24 个光点、一条线都没有 ——
   * 「这是个航线经营游戏」这件事无法自证。给一条起始线，玩家立刻看到：
   * 弧线怎么画、客机怎么飞、城市怎么被点亮。之后所有扩张由玩家自己做。
   *
   * 选址策略：在航程内挑**需求潜力最大**的城市对，优先基地出发 ——
   * 用 sim 自己的 routePotential 排序，不另写一套判断（避免与真身漂移）。 */
  function seedFirstRoute(st) {
    if (st.routes.length) return;
    var home = st.homeCityId;
    var T = AT.planeOf(AT.CONFIG.startPlaneType);
    var best = null, bestPot = -1;
    st.cities.forEach(function (c) {
      if (c.id === home) return;
      var d = S.routeDistance(st, home, c.id);
      if (d <= 0 || d > T.range) return;                  // 航程外飞不到
      if (!S.idlePlanes(st).filter(function (p) { return p.type === T.id; }).length) return;
      var pot = S.routePotential(st, home, c.id);
      if (pot > bestPot) { bestPot = pot; best = c.id; }
    });
    if (!best) return;
    var o = S.openRoute(st, home, best, T.id, 1);
    if (!o.ok) console.warn('[AT] 示范航线开通失败：' + o.reason);
  }

  function stop() {
    game.running = false;
    if (game.raf) global.cancelAnimationFrame(game.raf);
    game.raf = 0;
  }

  /* 窗口尺寸变化：画布交给 CSS 撑，这里只同步渲染器缓冲尺寸 */
  function onResize() {
    if (game.renderOk && R && R.resize) {
      try { R.resize(); } catch (e) { console.error('[AT] resize 异常：', e); }
    }
    if (UI && UI.onResize) UI.onResize();
  }

  function init() {
    global.addEventListener('resize', onResize, false);
    global.addEventListener('orientationchange', function () {
      // 旋屏后尺寸要等一拍才稳定（移动端地址栏/安全区回填），故延迟同步
      global.setTimeout(onResize, 260);
    }, false);
    // 切后台暂停主循环，回来重新校准时间戳（避免回来后一次性补跑）
    global.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stop();
        /* 主循环停了，音序器也就不再泵 —— 但**已在排程里的音符仍会继续播完**，
         * 浏览器对后台标签的 WebAudio 不做自动暂停，于是「切走后还有几秒音乐」。
         * 直接停 BGM 而不是只停音序：回来后 bgm.start() 会从 0 步重排，
         * 听感上是「重开一段」——对经营游戏是可接受的，比听见半截音乐好。 */
        if (A) { try { A.bgm.stop(); } catch (e) {} }
      } else if (game.started && !game.running) {
        game.running = true;
        game.last = (global.performance || Date).now();
        game.acc = 0;
        if (A) { try { A.bgm.start(); } catch (e) {} }
        game.raf = global.requestAnimationFrame(loop);
      }
    }, false);
    return game;
  }

  AT.game = {
    boot: boot,
    stop: stop,
    init: init,
    onResize: onResize,
    get state() { return game.state; },
    get running() { return game.running; },
    get renderOk() { return game.renderOk; },
    get fps() { return game.fps; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
