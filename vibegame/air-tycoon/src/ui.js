/*
 * air-tycoon — ui.js
 * 竖屏 HUD 与全部经营面板：线路、机队、事件卡、季报、终局
 * 依赖：data.js → geo.js → landmask.js → sim.js → render.js
 * 命名空间：window.AT（经典脚本，无 import/export/type=module）
 *
 * ── 架构：HUD + 抽屉 + 模态层（三层，各有明确职责）──
 *   HUD    —— 常驻读数（资金/净资产/排名/回合/计时）。每帧刷新，只改 textContent。
 *   抽屉   —— 左下按钮打开的面板：航线列表、机队、开新线。可开可关，不阻塞计时。
 *   模态   —— 事件卡、季报、终局。**阻塞回合计时**，必须处理完才能继续。
 *
 * ── 为什么事件卡必须阻塞 ──
 *   sim 的 tick 里有 `if (state.card) return state`，事件卡未决策时不推进回合。
 *   若 UI 不把这件事表现出来，玩家会看到「倒计时卡住不动」而不知道要做什么。
 *   故事件卡一出现就盖模态层，并给出明确的操作提示。
 *
 * ── 与 sim 的契约 ──
 *   UI **只调 sim 的导出接口**，绝不自己重算利润/运力/槽位 ——
 *   一旦 UI 里抄一份公式，迟早与 sim 漂移，玩家看到两个不一样的数字。
 *   所有金额、客座率、槽位读数一律来自 S.settleRoute / S.forecast / S.routeSlots。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};
  var S = AT.sim;
  var R = AT.render;
  var C = AT.CONFIG || {};

  var ui = {
    inited: false, game: null, state: null,
    panel: null,              // 'routes' | 'fleet' | 'newroute' | null
    selCity: null,            // 选中城市 id
    selRoute: null,           // 选中航线 key
    lastQuarter: 0,           // 用于检测回合变化 → 弹季报
    reports: [],              // 待看季报队列
    modal: null,              // 'event' | 'report' | 'over' | 'invest' | null
    toastT: 0
  };
  var el = {};
  var dirty = { hud: true, panel: true, modal: true };

  function $(id) { return document.getElementById(id); }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  }); }

  /* ───────────────────────── 数值格式化 ───────────────────────── */

  function money(v) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v), sign = v < 0 ? '-' : '';
    a = Math.abs(a);
    if (a >= 10000) return sign + (a / 10000).toFixed(2) + '亿';
    return sign + Math.round(a) + '万';
  }
  function moneyFull(v) {
    if (v == null || !isFinite(v)) return '—';
    var s = (v > 0 ? '+' : '') + Math.round(v);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 万';
  }
  function pct(v, d) {
    if (v == null || !isFinite(v)) return '—';
    return (v * 100).toFixed(d == null ? 1 : d) + '%';
  }
  function num(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toString(); }

  var LV_NAME = ['', '小镇', '城市', '大城', '枢纽', '全球枢纽'];

  /* ───────────────────────── 初始化 ───────────────────────── */

  function init(state, game) {
    ui.state = state;
    ui.game = game;
    cacheEls();
    bindEvents();
    buildStaticShell();
    ui.inited = true;
    ui.lastQuarter = state.quarter;
    // 音频默认开启（见 audio.js 文件头①），故静音键初始为「亮」
    syncMute(!AT.audio || AT.audio.enabled !== false);
    markAll();
  }

  function cacheEls() {
    /* 别名表：UI 内部的键名 → 页面里真实的 id。
     * 只有不一致的才需要写在这里，其余默认同名。
     * ⚠ uStage 取的是 #stage（画布），uLoader/uFallback 取的是 game.js 启动脚本
     *   已在用的 #loader / #fallback —— 不为了 UI 好看去改启动脚本的 id。 */
    var ALIAS = { uStage: 'stage', uLoader: 'loader', uFallback: 'fallback' };
    ['uCompany', 'uQuarter', 'uSpeed', 'uMute', 'uCash', 'uNet', 'uRank', 'uRoutes', 'uPlanes',
     'uDev', 'uTimer', 'uTimerBar', 'uCityCard', 'uHint', 'uToast', 'uLoader',
     'uMine', 'uPanel', 'uPanelBody', 'uPanelTitle', 'uPanelClose',
     'uModal', 'uModalBody', 'uTabRoutes', 'uTabFleet', 'uTrade',
     'uFallback', 'uStage', 'uBtnRoutes', 'uBtnFleet', 'uBtnNew'
    ].forEach(function (k) { el[k] = $(ALIAS[k] || k); });
  }

  function markAll() { dirty.hud = dirty.panel = dirty.modal = true; }

  /* 音效的唯一入口。为什么不直接写 AT.audio.play(...)：
   *   ① audio.js 与 ui.js 是两个可选模块，任一缺失时游戏仍须能跑
   *      （本作有「渲染挂了也能经营」的降级路径，音频同理）；
   *   ② 集中一处便于测试打桩（测试里替换 ui._sfx 就能断言「该响的响了」）。 */
  function sfx(name, opts) {
    if (ui._sfx) return ui._sfx(name, opts);
    var A = AT.audio;
    if (A && A.play) { try { return A.play(name, opts); } catch (e) {} }
    return false;
  }

  function bindEvents() {
    var cv = $('stage');
    if (cv) bindCanvas(cv);
    if (el.uSpeed) el.uSpeed.addEventListener('click', cycleSpeed, false);
    if (el.uMute) el.uMute.addEventListener('click', onMuteClick, false);
    if (el.uPanelClose) el.uPanelClose.addEventListener('click', function () { closePanel(); }, false);
    if (el.uBtnRoutes) el.uBtnRoutes.addEventListener('click', function () { togglePanel('routes'); }, false);
    if (el.uBtnFleet) el.uBtnFleet.addEventListener('click', function () { togglePanel('fleet'); }, false);
    if (el.uBtnNew) el.uBtnNew.addEventListener('click', function () { togglePanel('newroute'); }, false);
    if (el.uPanelBody) el.uPanelBody.addEventListener('click', onPanelClick, false);
    if (el.uModalBody) el.uModalBody.addEventListener('click', onModalClick, false);
    if (el.uCityCard) el.uCityCard.addEventListener('click', onCityCardClick, false);
    // Esc 关闭面板（桌面端调试方便）
    global.addEventListener('keydown', function (e) {
      if (e.keyCode === 27) {
        if (ui.panel) closePanel();
        else if (el.uCityCard) el.uCityCard.classList.remove('show');
      }
    }, false);
  }

  /* 静音键。为什么不做持久化（localStorage）：
   *   本作的音频**默认开启**是刻意选择（defcon 的教训，见 audio.js 文件头①）——
   *   持久化会让「上次关过」的玩家永远听不到，而那次关闭可能只是当时不方便。
   *   每局重置为开启，是「宁可多响一次」的取舍。 */
  function onMuteClick() {
    var A = AT.audio;
    if (!A) return;
    // 按下去这一声先放出来，再关 —— 否则「关」的瞬间没有任何听觉反馈
    sfx('click');
    var on = A.toggle();
    syncMute(on);
    toast(on ? '声音已开启' : '声音已关闭', on ? 'ok' : 'warn');
  }

  function syncMute(on) {
    if (!el.uMute) return;
    el.uMute.className = on ? '' : 'off';
    el.uMute.textContent = on ? '♪' : '♪̸';
  }

  function buildStaticShell() {
    // 底部操作条与面板容器由 HTML 提供；这里只确保类名初始态正确
    if (el.uPanel) el.uPanel.classList.remove('show');
    if (el.uModal) el.uModal.classList.remove('show');
  }

  /* ───────────────────────── 画布交互 ───────────────────────── */

  /* 点城市 → 飞过去 + 弹卡片；长按/拖动已由 render 处理，这里只区分「点」与「拖」。
   * ⚠ 位移阈值 8px：手指在触屏上按下时几乎必然有几像素抖动，
   *   若不设阈值，每次拖动结束都会误触发一次城市选择。 */
  function bindCanvas(cv) {
    var downX = 0, downY = 0, downT = 0, moved = false;
    cv.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY; downT = Date.now(); moved = false;
    }, false);
    cv.addEventListener('pointermove', function (e) {
      if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) moved = true;
    }, false);
    cv.addEventListener('pointerup', function (e) {
      if (moved) return;
      if (Date.now() - downT > 500) return;
      if (ui.modal) return;                       // 模态层打开时不响应地图
      if (!R || !R.ok) return;
      var rect = cv.getBoundingClientRect();
      var c = R.pickCity(ui.state, e.clientX - rect.left, e.clientY - rect.top,
                         rect.width, rect.height);
      if (c) {
        ui.selCity = c.id;
        R.flyToCity(ui.state, c.id);
        renderCityCard(c);
        dirty.hud = true;
      } else if (el.uCityCard) {
        el.uCityCard.classList.remove('show');    // 点空地 → 收起卡片
      }
    }, false);
  }

  function onCityCardClick(e) {
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    var act = a.getAttribute('data-act');
    if (act === 'open-here') {
      var c = AT.CITIES_BY_ID[ui.selCity];
      if (!c) return;
      ui.newFrom = c.id;
      closePanel();
      openPanel('newroute');
      toast('从 ' + c.name + ' 出发，选择一个目的地');
    }
  }

  function renderCityCard(c) {
    if (!el.uCityCard) return;
    var st = ui.state;
    var mine = st.routes.filter(function (r) { return r.a === c.id || r.b === c.id; });
    var pax = c.paxLast ? c.paxLast.toFixed(2) + ' 百万客/季' : '—';
    var html = '<div class="cc-name">' + h(c.name) +
      (c.isHome ? '<span class="cc-home">基地</span>' : '') + '</div>' +
      '<div class="cc-row"><span>发展度</span><b>' + Math.round(c.dev) + ' / 100</b></div>' +
      '<div class="cc-row"><span>等级</span><b>Lv' + c.level + ' · ' + LV_NAME[Math.max(1, Math.min(5, c.level))] + '</b></div>' +
      '<div class="cc-row"><span>人口</span><b>' + c.pop.toFixed(1) + ' 百万</b></div>' +
      '<div class="cc-row"><span>本季客流</span><b>' + pax + '</b></div>' +
      '<div class="cc-row"><span>我的航线</span><b>' + mine.length + ' 条</b></div>';
    if (mine.length) {
      html += '<div class="cc-lines">';
      mine.forEach(function (r) {
        var other = r.a === c.id ? r.b : r.a;
        var on = AT.CITIES_BY_ID[other];
        html += '<span class="cc-tag">' + h(on ? on.name : other) + '</span>';
      });
      html += '</div>';
    } else {
      html += '<div class="cc-actions"><button class="btn" data-act="open-here" type="button">从这里开新航线</button></div>';
    }
    el.uCityCard.innerHTML = html;
    el.uCityCard.classList.add('show');
  }

  /* ───────────────────────── 速度 ───────────────────────── */

  function cycleSpeed() {
    var opts = C.speedOptions || [1, 2, 4];
    var cur = ui.state.speed || 1;
    var i = opts.indexOf(cur);
    ui.state.speed = opts[(i + 1) % opts.length];
    if (el.uSpeed) el.uSpeed.textContent = ui.state.speed + '×';
  }

  /* ───────────────────────── toast ───────────────────────── */

  function toast(msg, kind) {
    if (!el.uToast) return;
    el.uToast.textContent = msg;
    el.uToast.className = 'show' + (kind ? ' ' + kind : '');
    global.clearTimeout(toast._t);
    toast._t = global.setTimeout(function () { el.uToast.className = ''; }, 2400);
  }

  /* ───────────────────────── 面板 ───────────────────────── */

  function togglePanel(name) {
    if (ui.panel === name) closePanel();
    else openPanel(name);
  }

  function openPanel(name) {
    ui.panel = name;
    if (el.uPanel) el.uPanel.classList.add('show');
    dirty.panel = true;
    dirty.hud = true;
  }

  function closePanel() {
    ui.panel = null;
    if (el.uPanel) el.uPanel.classList.remove('show');
    dirty.hud = true;
  }

  function onPanelClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    var key = t.getAttribute('data-key') || '';
    var val = t.getAttribute('data-val') || '';
    var st = ui.state;
    var res;

    switch (act) {
      /* ── 开新航线 ── */
      /* 三个选择器只响 click：它们随时可改主意（未确认），
       * 若响 confirm 会让「只是看看目的地」也变得像做出了决定。 */
      case 'pick-from':
        sfx('click');
        ui.newFrom = t.getAttribute('data-city');
        dirty.panel = true;
        break;
      case 'pick-to':
        sfx('click');
        ui.newTo = t.getAttribute('data-city');
        dirty.panel = true;
        break;
      case 'pick-type':
        sfx('click');
        ui.newType = t.getAttribute('data-type');
        dirty.panel = true;
        break;
      case 'do-open':
        res = doOpenRoute();
        if (res.ok) { sfx('open'); toast('已开通航线', 'ok'); }
        else { sfx('deny'); toast(res.reason, 'bad'); }
        break;

      /* ── 航线操作 ── */
      case 'sel-route':
        sfx('click');
        ui.selRoute = key;
        dirty.panel = true;
        break;
      case 'add-plane': {
        var o = S.buyPlane(st, val.trim(), 1);
        if (!o.ok) { sfx('deny'); toast(o.reason, 'bad'); break; }
        var np = st.planes[st.planes.length - 1];
        var a2 = S.assignPlane(st, np.id, key);
        if (!a2.ok) { sfx('deny'); toast(a2.reason, 'bad'); }
        else { sfx('confirm'); toast('已增派 1 架', 'ok'); }
        dirty.panel = true; dirty.hud = true;
        break;
      }
      case 'drop-plane': {
        var pr = S.findRouteByKey(st, key);
        if (!pr) break;
        var onl = S.planesOnRoute(st, key);
        if (onl.length <= 1) { sfx('deny'); toast('每航线至少保留 1 架，可改为减班或关线', 'bad'); break; }
        S.assignPlane(st, onl[onl.length - 1].id, null);
        sfx('confirm');
        toast('已撤回 1 架到机队', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }
      case 'freq':
        res = S.setFrequency(st, key, +val);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        /* 档位被夹取时响 deny 而不是 confirm：玩家点的是 20 班、系统只给了 6 班，
         * 这是「你的指令没能完全执行」，用「被拒」的音色比「成功」更诚实 ——
         * 否则玩家会以为自己真的拿到了 20 班。 */
        if (res.clamped) { sfx('deny'); toast(res.reason || '档位已按上限调整', 'warn'); }
        else { sfx('click'); toast('班次已调整为每架每日 ' + res.perDay + ' 班', 'ok'); }
        dirty.panel = true;
        break;
      case 'fare':
        res = S.setFare(st, key, +val);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('click');
        toast('票价倍率 ' + res.fareMul.toFixed(2) + '×', 'ok');
        dirty.panel = true;
        break;
      case 'upgrade':
        /* 换机型要补差价、是重资产决策 → 响 confirm 而不是 click */
        res = S.upgradeRouteType(st, key, val.trim());
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('confirm');
        toast('已置换为 ' + res.to + '（' + res.count + ' 架，补差 ' + money(res.net) + '）', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      case 'close-route': {
        res = S.closeRoute(st, key);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        ui.selRoute = null;
        sfx('confirm');
        toast('航线已关闭，飞机已回到机队', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }

      /* ── 机队 ── */
      case 'buy-plane': {
        res = S.buyPlane(st, val.trim(), 1);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('confirm');
        toast('已购入 ' + AT.planeOf(val.trim()).name, 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }
      case 'sell-plane': {
        res = S.sellPlane(st, key);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('confirm');
        toast('已售出，回收 ' + money(res.value), 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }
    }
  }

  /* 开航线：把三处选择（出发地/目的地/机型）合成一次调用。
   * 校验一律交给 sim（它才是唯一真源），UI 只负责把 reason 展示出来。
   *
   * ⚠ 组合动作：若所选机型在机队里没有闲置的，则**先买一架再开线**。
   *   为什么不让玩家自己去机队面板买两次：openRoute 要求「先有闲置飞机」，
   *   若 UI 只做单步调用，玩家选中最合适的机型后必然撞到
   *   「没有足够的闲置 XX」——而玩家刚刚明明看到这架飞机的价格就在选项里，
   *   这个反馈会被读成 bug 而不是规则。故这里把两件事合成一个动作，
   *   并在按钮上明确写出「购机 1 架并开通（¥XXX万）」，让玩家点之前就知道要花钱。
   *   资金不足时 sim 的 buyPlane 会给出 reason，直接透传即可。 */
  function doOpenRoute() {
    var st = ui.state;
    if (!ui.newTo) return { ok: false, reason: '请选择目的地' };
    if (!ui.newType) return { ok: false, reason: '请选择机型' };
    var from = ui.newFrom || st.homeCityId;

    var idle = S.idlePlanes(st).filter(function (p) { return p.type === ui.newType; }).length;
    if (!idle) {
      var T = AT.planeOf(ui.newType);
      var b = S.buyPlane(st, ui.newType, 1);
      if (!b.ok) return { ok: false, reason: b.reason || ('购置 ' + T.name + ' 失败') };
    }
    var res = S.openRoute(st, from, ui.newTo, ui.newType, 1);
    if (res.ok) {
      ui.newTo = null;
      dirty.panel = true; dirty.hud = true;
    }
    return res;
  }

  /* ───────────────────────── 模态层 ───────────────────────── */

  function onModalClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    var val = t.getAttribute('data-val');

    if (act === 'event-choice') {
      var okc = S.chooseEvent(ui.state, +val);
      if (!okc) { sfx('deny'); toast('选项无效', 'bad'); return; }
      sfx('confirm');
      ui.modal = null;
      if (el.uModal) el.uModal.classList.remove('show');
      dirty.hud = true;
      toast('决策已生效', 'ok');
    } else if (act === 'close-report') {
      sfx('click');
      ui.reports.shift();
      if (ui.reports.length) showReport(ui.reports[0]);
      else { ui.modal = null; if (el.uModal) el.uModal.classList.remove('show'); }
    } else if (act === 'restart') {
      sfx('click');
      global.location.reload();
    }
  }

  function openModal(kind, html) {
    ui.modal = kind;
    if (el.uModalBody) el.uModalBody.innerHTML = html;
    if (el.uModal) el.uModal.classList.add('show');
  }

  /* 事件卡：sim 把当前卡挂在 state.card 上（直接是事件对象本身）。
   * ⚠ 不要读 state.card.event —— 那是旧版写法，sim 里是 state.card = ev。 */
  function showEvent(ev) {
    var html = '<div class="md-kind">突发事件</div>' +
      '<div class="md-title">' + h(ev.title) + '</div>' +
      '<div class="md-desc">' + h(ev.desc) + '</div>' +
      '<div class="md-opts">';
    ev.options.forEach(function (o, i) {
      var tag = '';
      var fx = o.effect || {};
      if (fx.type === 'cash') tag = moneyFull(fx.amount);
      else if (fx.type === 'demand_all' || fx.type === 'demand_region') tag = '需求 ' + (fx.mult > 0 ? '+' : '') + Math.round(fx.mult * 100) + '% · ' + fx.turns + '季';
      else if (fx.type === 'cost_all') tag = '成本 ' + (fx.mult > 0 ? '+' : '') + Math.round(fx.mult * 100) + '% · ' + fx.turns + '季';
      else if (fx.type === 'reputation') tag = '声誉 ' + (fx.amount > 0 ? '+' : '') + fx.amount;
      else if (fx.type === 'fleet_ground') tag = fx.count + ' 架停场 ' + fx.turns + ' 季';
      else if (fx.type === 'dev_push') tag = '城市开发度 +' + fx.amount;
      else if (fx.note) tag = fx.note;
      html += '<button class="mopt" data-act="event-choice" data-val="' + i + '" type="button">' +
        '<span class="mo-label">' + h(o.label) + '</span>' +
        (tag ? '<span class="mo-tag">' + h(tag) + '</span>' : '') +
        (fx.note && tag !== fx.note ? '<span class="mo-note">' + h(fx.note) + '</span>' : '') +
        '</button>';
    });
    html += '</div><div class="md-foot">处理完才能继续下一季度</div>';
    openModal('event', html);
  }

  /* 季报：对比上季净资产，列出收入/成本/净利与航线数变化。
   * 所有数字都来自 sim 写在 history 快照里的真实结算值，
   * 保证「收入 − 各项支出 = 净利润」在面板上能对上账。 */
  function showReport(rep) {
    var html = '<div class="md-kind">第 ' + rep.quarter + ' 季度结算</div>' +
      '<div class="md-title">' + (rep.net >= 0 ? '本季度盈利' : '本季度亏损') + '</div>' +
      '<div class="md-kv">' +
      '<div><span>营业收入</span><b>' + money(rep.revenue) + '</b></div>' +
      '<div><span>运营成本</span><b class="c-bad">−' + money(rep.cost) + '</b></div>' +
      (rep.groundCost ? '<div><span>地面与起降</span><b class="c-bad">−' + money(rep.groundCost) + '</b></div>' : '') +
      '<div><span>管理支出</span><b class="c-bad">−' + money(rep.overhead) + '</b></div>' +
      (rep.interest > 0 ? '<div><span>债务利息</span><b class="c-bad">−' + money(rep.interest) + '</b></div>' : '') +
      '<div class="md-total"><span>净利润</span><b class="' + (rep.net >= 0 ? 'c-good' : 'c-bad') + '">' +
        moneyFull(rep.net) + '</b></div>' +
      '<div><span>现金</span><b>' + money(rep.cash) + '</b></div>' +
      '<div><span>净资产</span><b>' + money(rep.netWorth) + (rep.nwDelta != null ?
        ' <i class="' + (rep.nwDelta >= 0 ? 'c-good' : 'c-bad') + '">(' +
        (rep.nwDelta >= 0 ? '+' : '') + money(rep.nwDelta) + ')</i>' : '') + '</b></div>' +
      '<div><span>客运量</span><b>' + (rep.pax || 0).toFixed(2) + ' 百万客</b></div>' +
      '<div><span>航线 / 机队</span><b>' + rep.routes + ' 条 / ' + rep.planes + ' 架</b></div>' +
      '</div>';
    if (rep.notes && rep.notes.length) {
      html += '<div class="md-notes">' + rep.notes.map(function (n) {
        return '<div>· ' + h(n) + '</div>';
      }).join('') + '</div>';
    }
    html += '<div class="md-actions"><button class="btn btn-pri" data-act="close-report" type="button">继续经营</button></div>';
    openModal('report', html);
  }

  /* 终局：评价 + 成长曲线数字 + 关键统计 */
  function showOver(st) {
    var v = S.verdict(st);
    var g = S.globalization(st);
    var rk = S.ranking(st);
    var my = 0;
    for (var i = 0; i < rk.length; i++) if (rk[i].isPlayer) { my = i + 1; break; }
    var first = st.history[0], last = st.history[st.history.length - 1];
    var html = '<div class="md-kind">经营期结束</div>' +
      '<div class="md-title">' + h(v.label) + '</div>' +
      '<div class="md-desc">' + h(v.desc) + '</div>' +
      '<div class="md-kv">' +
      '<div><span>最终排名</span><b>第 ' + my + ' / ' + rk.length + ' 名</b></div>' +
      '<div><span>净资产</span><b>' + money(st.history.length ? last.netWorth : 0) + '</b></div>' +
      '<div><span>全球化</span><b>' + g.pct + '%（' + g.cities + '/' + g.totalCities + ' 城 · ' +
        g.regions + '/' + g.totalRegions + ' 地区）</b></div>' +
      '<div><span>累计客运</span><b>' + (st.stats.paxTotal || 0).toFixed(1) + ' 百万客</b></div>' +
      '<div><span>机队规模</span><b>' + st.planes.length + ' 架</b></div>' +
      '<div><span>运营航线</span><b>' + st.routes.length + ' 条</b></div>' +
      '<div><span>城市开发贡献</span><b>' + Math.round(st.stats.devPushed) + ' 点 · ' +
        st.stats.citiesUpgraded + ' 次升级</b></div>' +
      (first ? '<div><span>开局净资产</span><b>' + money(first.netWorth) + '</b></div>' : '') +
      '</div>' +
      '<div class="md-actions"><button class="btn btn-pri" data-act="restart" type="button">再来一局</button></div>';
    openModal('over', html);
  }

  /* ───────────────────────── 渲染：HUD ───────────────────────── */

  function syncHud() {
    var st = ui.state;
    if (!st) return;
    if (el.uCompany) el.uCompany.textContent = st.companyName || '—';
    if (el.uQuarter) el.uQuarter.textContent = 'Q' + Math.min(st.quarter, C.totalQuarters || 60) +
      ' / ' + (C.totalQuarters || 60);
    if (el.uSpeed) el.uSpeed.textContent = (st.speed || 1) + '×';
    if (el.uCash) {
      el.uCash.textContent = money(st.cash);
      el.uCash.className = 'v' + (st.cash < 0 ? ' c-bad' : '');
    }
    if (el.uNet) el.uNet.textContent = money(S.netWorth(st));
    if (el.uRank) {
      var rk = S.ranking(st);
      var my = 0;
      for (var i = 0; i < rk.length; i++) if (rk[i].isPlayer) { my = i + 1; break; }
      el.uRank.textContent = rk.length ? (my + ' / ' + rk.length) : '—';
      el.uRank.className = 'v' + (my === 1 ? ' c-good' : '');
    }
    if (el.uRoutes) el.uRoutes.textContent = st.routes.length;
    if (el.uPlanes) {
      var idle = S.idlePlanes(st).length;
      el.uPlanes.textContent = st.planes.length + (idle ? ' (' + idle + ' 闲置)' : '');
      el.uPlanes.className = 'v' + (idle ? ' c-warn' : '');
    }
    if (el.uDev) {
      var g = S.globalization(st);
      el.uDev.textContent = g.pct + '%';
    }
    // 回合计时条
    var rem = S.quarterRemain(st);
    if (el.uTimerBar) {
      var total = C.quarterSeconds || 22;
      var w = rem == null ? 100 : Math.max(0, Math.min(100, (1 - rem / total) * 100));
      el.uTimerBar.style.width = w + '%';
    }
    if (el.uTimer) {
      el.uTimer.textContent = rem == null
        ? (st.card ? '待决策' : (st.phase === 'over' ? '已结束' : '—'))
        : Math.ceil(rem) + 's';
    }
  }

  /* ───────────────────────── 渲染：面板 ───────────────────────── */

  function syncPanel() {
    if (!ui.panel || !el.uPanelBody) return;
    var st = ui.state;
    var html, title;

    if (ui.panel === 'routes') {
      title = '我的航线';
      html = renderRoutes(st);
    } else if (ui.panel === 'fleet') {
      title = '机队管理';
      html = renderFleet(st);
    } else {
      title = '开通新航线';
      html = renderNewRoute(st);
    }
    if (el.uPanelTitle) el.uPanelTitle.textContent = title;
    el.uPanelBody.innerHTML = html;
  }

  function renderRoutes(st) {
    if (!st.routes.length) {
      return '<div class="empty">还没有航线。<br>点左下「新航线」开通第一条 —— ' +
        '飞机不飞就不赚钱，但也会亏持有成本。</div>';
    }
    var out = '<div class="rlist">';
    st.routes.forEach(function (r) {
      var ca = AT.CITIES_BY_ID[r.a], cb = AT.CITIES_BY_ID[r.b];
      // ⚠ 利润/客座率一律取自 sim，不在 UI 重算
      var d = S.settleRoute(st, r);
      var n = S.planesOnRoute(st, r.key).length;
      var T = AT.planeOf(r.type);
      var dist = S.routeDistance(st, r.a, r.b);
      var slot = S.routeSlots(st, r.a, r.b);
      var sel = ui.selRoute === r.key;
      var cls = 'rcard' + (sel ? ' sel' : '') + (d && d.profit < 0 ? ' loss' : '');
      out += '<div class="' + cls + '" data-act="sel-route" data-key="' + h(r.key) + '">' +
        '<div class="rc-top"><span class="rc-name">' + h(ca ? ca.name : r.a) + ' — ' +
          h(cb ? cb.name : r.b) + '</span>' +
          '<span class="rc-profit ' + (d && d.profit >= 0 ? 'c-good' : 'c-bad') + '">' +
          (d ? moneyFull(d.profit) : '—') + '</span></div>' +
        '<div class="rc-sub">' + h(T.name) + ' ×' + n + ' 架 · 每架每日 ' + (r.perDay || 3) + ' 班 · ' +
          num(dist) + ' km</div>' +
        '<div class="rc-bars">' +
          bar('客座率', d ? d.realLf : 0, 1, d ? pct(d.realLf, 0) : '—') +
          bar('槽位', d ? Math.min(1, (d.perDay * n) / Math.max(1, slot)) : 0, 1,
              d ? Math.round(d.perDay * n) + '/' + Math.round(slot) + ' 班' : '—') +
        '</div>' +
        (d && d.slotTight ? '<div class="rc-hint warn">时刻已饱和 —— 加机不再增班，考虑换更大机型</div>' : '') +
        (d && d.demandThin ? '<div class="rc-hint">需求偏薄 —— 客座率偏低，可减班或换小机型</div>' : '') +
        (d && d.capacityTight ? '<div class="rc-hint warn">运力吃紧 —— 需求撑满航班，可加机</div>' : '') +
        '</div>';

      if (sel) out += renderRouteDetail(st, r, d, n, T, dist, slot);
    });
    out += '</div>';
    return out;
  }

  function bar(label, v, max, txt) {
    var w = max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
    return '<div class="brow"><span class="bl">' + h(label) + '</span>' +
      '<span class="bt"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
      '<span class="bv">' + h(txt) + '</span></div>';
  }

  /* 航线详情：频次档位 / 票价 / 加机 / 换机型 / 关线
   * 这是本作操作密度最高的面板，所有按钮都直接映射 sim 的指令接口。 */
  function renderRouteDetail(st, r, d, n, T, dist, slot) {
    var out = '<div class="rdetail">';

    /* 频次档位：档位含义是「每架每日班次」，故列表里要标出换算后的航线总班次 */
    out += '<div class="rd-sec"><div class="rd-h">频次档位（每架每日）</div><div class="rd-btns">';
    var typeCap = S.maxPerDayFor(r.type, dist);
    (C.freqTiers || []).forEach(function (ft) {
      var total = ft.perDay * n;
      var over = ft.perDay > typeCap || total > Math.min(C.routeMaxPerDay || 20, slot);
      var cur = (r.perDay || 3) === ft.perDay;
      out += '<button class="chip' + (cur ? ' on' : '') + (over ? ' over' : '') +
        '" data-act="freq" data-key="' + h(r.key) + '" data-val="' + ft.perDay + '" type="button">' +
        ft.perDay + ' 班' + (cur ? '' : '<i>总' + total + '</i>') + '</button>';
    });
    out += '</div><div class="rd-note">本机单架上限 ' + typeCap + ' 班/日 · 该线时刻上限 ' +
      Math.round(slot) + ' 班/日（合计）</div></div>';

    /* 票价：0.70 ~ 1.40 五档。sim 会夹取，这里按夹取后的值标 on。 */
    out += '<div class="rd-sec"><div class="rd-h">票价策略</div><div class="rd-btns">';
    [['低价', 0.78], ['偏低', 0.90], ['标准', 1.0], ['偏高', 1.12], ['高价', 1.28]].forEach(function (f) {
      var cur = Math.abs((r.fareMul || 1) - f[1]) < 0.02;
      out += '<button class="chip' + (cur ? ' on' : '') + '" data-act="fare" data-key="' + h(r.key) +
        '" data-val="' + f[1] + '" type="button">' + f[0] + '<i>' + f[1].toFixed(2) + '×</i></button>';
    });
    out += '</div></div>';

    /* 运力 */
    out += '<div class="rd-sec"><div class="rd-h">运力</div><div class="rd-btns">' +
      '<button class="btn" data-act="add-plane" data-key="' + h(r.key) + '" data-val="' + h(r.type) +
      '" type="button">加 1 架 ' + h(T.name) + '（' + money(T.price) + '）</button>' +
      '<button class="btn" data-act="drop-plane" data-key="' + h(r.key) + '" type="button">撤回 1 架</button>' +
      '</div></div>';

    /* 换机型：槽位满后唯一出路，故只在机型可升级时给按钮 */
    var cands = AT.PLANES.filter(function (p) { return p.range >= dist && p.id !== r.type && p.price > T.price; });
    if (cands.length) {
      out += '<div class="rd-sec"><div class="rd-h">置换机型（补差价，' + n + ' 架一起换）</div><div class="rd-btns">';
      cands.forEach(function (p) {
        out += '<button class="btn" data-act="upgrade" data-key="' + h(r.key) + '" data-val="' + p.id +
          '" type="button">换 ' + h(p.name) + '<i>' + p.seats + ' 座</i></button>';
      });
      out += '</div><div class="rd-note">旧机按机龄折价回收（约 92% 残值）</div></div>';
    }

    /* 成本明细：把 settleRoute 的分解原样列出，让玩家看得见钱花在哪 */
    if (d) {
      out += '<div class="rd-sec"><div class="rd-h">本季成本构成</div><div class="rd-cost">' +
        costRow('航油', d.fuel) + costRow('起降地服', d.landing) + costRow('机组', d.crew) +
        costRow('维护', d.maint) + costRow('飞机持有', d.ownership) +
        '<div class="cc-total"><span>合计支出</span><b>−' + money(d.cost) + '</b></div>' +
        '<div class="cc-total"><span>收入</span><b class="c-good">' + money(d.revenue) + '</b></div>' +
        '</div></div>';
    }

    out += '<div class="rd-sec"><button class="btn btn-danger" data-act="close-route" data-key="' +
      h(r.key) + '" type="button">关闭这条航线</button></div>';
    out += '</div>';
    return out;
  }

  function costRow(k, v) {
    return '<div class="cc-row"><span>' + h(k) + '</span><b>−' + money(v) + '</b></div>';
  }

  function renderFleet(st) {
    var idle = S.idlePlanes(st);
    var out = '';
    if (idle.length) {
      out += '<div class="fsec warn-sec"><div class="rd-h">闲置飞机 ' + idle.length + ' 架 —— 不飞也在亏持有成本</div>' +
        '<div class="flist">';
      idle.forEach(function (p) {
        out += '<div class="frow"><span>' + h(AT.planeOf(p.type).name) + ' · ' + h(p.reg) +
          ' · 机龄 ' + p.ageQ + ' 季</span>' +
          '<span class="fbtns"><button class="btn btn-sm" data-act="sell-plane" data-key="' +
          h(p.id) + '" type="button">出售</button></span></div>';
      });
      out += '</div><div class="rd-note">在航线详情里「加 1 架」会自动派机；也可先买机再派</div></div>';
    }

    out += '<div class="fsec"><div class="rd-h">购买新机</div><div class="plist">';
    AT.PLANES.forEach(function (p) {
      var afford = st.cash >= p.price;
      out += '<div class="prow' + (afford ? '' : ' no') + '">' +
        '<div class="pinfo"><b>' + h(p.name) + '</b>' +
        '<span>' + p.seats + ' 座 · 航程 ' + p.range + ' km · ' + p.speed + ' km/h · 每季维护 ' + p.upkeep + ' 万</span></div>' +
        '<div class="pact"><span class="price">' + money(p.price) + '</span>' +
        '<button class="btn btn-sm' + (afford ? '' : ' dis') + '" data-act="buy-plane" data-val="' + p.id +
        '" type="button">' + (afford ? '购买' : '资金不足') + '</button></div></div>';
    });
    out += '</div></div>';

    var all = st.planes.slice().sort(function (a, b) { return b.ageQ - a.ageQ; });
    if (all.length) {
      out += '<div class="fsec"><div class="rd-h">全部飞机 ' + all.length + ' 架</div><div class="flist">';
      all.forEach(function (p) {
        var rk = p.routeKey ? S.findRouteByKey(st, p.routeKey) : null;
        var dest = rk ? ((AT.CITIES_BY_ID[rk.a] || {}).name + '—' + (AT.CITIES_BY_ID[rk.b] || {}).name) : null;
        out += '<div class="frow"><span>' + h(AT.planeOf(p.type).name) + ' · ' + h(p.reg) + '</span>' +
          '<span class="fstate">' + (p.onGround > 0 ? '<i class="c-bad">停场 ' + p.onGround + ' 季</i>' :
            (dest ? h(dest) : '<i class="c-warn">闲置</i>')) + '</span></div>';
      });
      out += '</div></div>';
    }
    return out;
  }

  function renderNewRoute(st) {
    var fromId = ui.newFrom || st.homeCityId;
    var from = AT.CITIES_BY_ID[fromId];
    var out = '<div class="nw-sec"><div class="rd-h">① 出发城市</div><div class="chips">';
    // 出发地：基地 + 已通航城市（未通航城市不能作为起点 —— 网络是连通的）
    var fromList = [fromId];
    st.routes.forEach(function (r) {
      if (fromList.indexOf(r.a) < 0) fromList.push(r.a);
      if (fromList.indexOf(r.b) < 0) fromList.push(r.b);
    });
    fromList.slice(0, 12).forEach(function (cid) {
      var c = AT.CITIES_BY_ID[cid];
      if (!c) return;
      out += '<button class="chip' + (cid === fromId ? ' on' : '') + '" data-act="pick-from" data-city="' +
        cid + '" type="button">' + h(c.name) + '</button>';
    });
    out += '</div></div>';

    /* 目的地：列出**所有**未开通的城市，并标注距离与可行性。
     *
     * ⚠ 排序策略（2026-09-14 实机修正）：**先按「当下能不能马上飞」分档，档内再按需求降序**。
     *
     * 旧版纯按需求降序，后果实测如下（开局 800 万、只有支线机）：
     *   列表前几位全是纽约(11859km) / 洛杉矶 / 芝加哥 这类洲际线 —— 需求指数最高，
     *   但现有机型一架都飞不到，且需要的宽体机 3900 万**买不起**。
     *   玩家照着排在第一位的「最赚的线」点进去，看到的是一列「航程不足」，
     *   而唯一可点的机型写着「资金不足」。界面没错，但它把玩家领进了死胡同。
     *
     * 分档规则（两档，语义清楚、不引入新参数）：
     *   ① 现在就能飞：机队里有闲置机，且航程够     → 排最前，tag 不显示
     *   ② 能飞但要买机：航程够，但机队没有、且买得起 → 次之
     *   ③ 航程够但买不起 / 航程不够               → 沉到最后（仍可见，作为长期目标）
     * 档内一律按潜在需求降序 —— 保留「哪条线最赚钱」这个玩家直觉。
     *
     * ⚠ 潜在需求取自 S.routePotential（sim 的真源），不在 UI 重算。 */
    var idleTypes = {};
    S.idlePlanes(st).forEach(function (p) { idleTypes[p.type] = 1; });
    var cands = [];
    st.cities.forEach(function (c) {
      if (c.id === fromId) return;
      if (S.findRoute(st, fromId, c.id)) return;
      var dist = S.routeDistance(st, fromId, c.id);
      var reach = AT.PLANES.filter(function (p) { return p.range >= dist; });
      var canFlyNow = reach.some(function (p) { return idleTypes[p.id]; });
      var canBuy = reach.some(function (p) { return st.cash >= p.price; });
      cands.push({
        c: c, dist: dist, pot: S.routePotential(st, fromId, c.id),
        reach: reach, canFlyNow: canFlyNow, canBuy: canBuy,
        tier: canFlyNow ? 0 : (reach.length && canBuy ? 1 : 2),
        stocked: canFlyNow
      });
    });
    cands.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;   // 先按可行性分档
      return b.pot - a.pot;                            // 档内按需求降序
    });

    out += '<div class="nw-sec"><div class="rd-h">② 目的地（先列现在就能飞的，再按需求排序）' +
      '</div><div class="chips">';
    cands.forEach(function (x) {
      var ok = x.reach.length > 0;
      var tag = '';
      if (ok && !x.canFlyNow) {
        var cheapest = null;
        x.reach.forEach(function (p) {
          if (cheapest === null || p.price < cheapest.price) cheapest = p;
        });
        tag = x.canBuy
          ? '<i class="c-warn">机队没有，需现购 ' + h(cheapest.name) + ' ' + money(cheapest.price) + '</i>'
          : '<i class="c-bad">现有资金买不到能飞的机型（最低 ' + h(cheapest.name) + ' ' +
            money(cheapest.price) + '）</i>';
      } else if (!ok) {
        tag = '<i class="c-bad">超出现有机型航程</i>';
      }
      out += '<button class="chip chip-wide' + (ui.newTo === x.c.id ? ' on' : '') +
        (x.tier < 2 ? '' : ' over') +
        '"' + (x.tier < 2 ? ' data-act="pick-to" data-city="' + x.c.id + '"' : ' disabled') +
        ' type="button">' +
        h(x.c.name) + '<i>' + num(x.dist) + 'km · 需求指数 ' + x.pot.toFixed(1) + '</i>' +
        (tag || '') + '</button>';
    });
    out += '</div></div>';

    /* 机型：只列飞得到的，并按「总价」排序。
     * 用 S.idealSeatsFor 给出建议座位量，帮玩家判断该买哪一档。
     *
     * ⚠ 必须标明「机队里有没有这架」：
     *   openRoute **不会自动购机** —— 它要求有闲置飞机（sim 的语义是
     *   「先买机、再开线」）。若面板只列出可飞机型而不区分库存，
     *   玩家会挑一架看起来最合适的（往往是最贵的宽体），点开通才被告知
     *   「没有足够的闲置 XX」—— 白白浪费一次操作。
     *   故：有库存的显示「可派 N 架」，没库存的显示「需现购」并让按钮
     *   走「先买机再开线」的组合动作（见 doOpenRoute）。 */
    var selDist = ui.newTo ? S.routeDistance(st, fromId, ui.newTo) : null;
    if (ui.newTo) {
      /* ⚠ idealSeatsFor 返回的是**整条线需要的总座位量**（需求 ÷ 总班次 ÷ 客座率），
       *   不是「单机该买多少座」—— 上海—纽约会算出 2000+ 座，那是多架累加的结果。
       *   直接写成「建议约 N 座」会被读成单机指标（实机确认过这个歧义），
       *   故标注清楚「全线合计」，并额外用 bestNeededType 给出「最省的能飞机型」，
       *   两者一起才够玩家做决策。 */
      var ideal = S.idealSeatsFor(st, fromId, ui.newTo);
      var needType = S.bestNeededType(st, selDist);
      out += '<div class="nw-sec"><div class="rd-h">③ 机型（全线需约 ' + Math.round(ideal) +
        ' 座 · 最省能飞 ' + h(AT.planeOf(needType).name) + '）</div><div class="chips">';
      /* 先算出「推荐机型」：在可飞机型里，选单机座位数最接近 `需要座位/3` 的一款。
       * 为什么是 /3：一条线要填满槽位大约需要 3 架（与 sim 的 idealSeatsFor
       * 内部同款假设一致），故单架理想座位 ≈ 总需求 / 3。
       * 这是给玩家的**提示**而非硬约束 —— 真正取舍仍由玩家按价格、
       * 库存、以及后续换机型余地自己决定。 */
      var perPlaneNeed = ideal / 3;
      var flyable = AT.PLANES.filter(function (p) { return p.range >= selDist; });
      var recId = null, recGap = Infinity;
      flyable.forEach(function (p) {
        var gap = Math.abs(p.seats - perPlaneNeed);
        if (gap < recGap) { recGap = gap; recId = p.id; }
      });

      AT.PLANES.forEach(function (p) {
        var idleOf = S.idlePlanes(st).filter(function (x) { return x.type === p.id; }).length;
        if (p.range < selDist) {
          out += '<button class="chip chip-wide over" type="button" disabled>' + h(p.name) +
            '<i>航程不足（需 ' + num(selDist) + 'km）</i></button>';
          return;
        }
        var afford = st.cash >= p.price;
        var stock = idleOf ? '<i class="c-good">机队有 ' + idleOf + ' 架可派</i>'
                           : '<i class="c-warn">机队没有 · 需现购 ' + money(p.price) + '</i>';
        var rec = (p.id === recId) ? '<b class="rec-tag">推荐</b>' : '';
        out += '<button class="chip chip-wide' + (ui.newType === p.id ? ' on' : '') +
          (afford || idleOf ? '' : ' over') +
          '"' + (afford || idleOf ? ' data-act="pick-type" data-type="' + p.id + '"' : '') + ' type="button">' +
          h(p.name) + rec + '<em>' + p.seats + ' 座 · ' + money(p.price) + (afford ? '' : ' · 资金不足') + '</em>' +
          stock + '</button>';
      });
      out += '</div>';
      var pot = S.routePotential(st, fromId, ui.newTo);
      var slot = Math.round(S.routeSlots(st, fromId, ui.newTo));
      out += '<div class="rd-note">该线潜在需求 ' + pot.toFixed(2) + ' 百万客/季 · 时刻上限 ' + slot +
        ' 班/日（竞对已占位会减少）</div>';
      /* 开通按钮：文案随所选机型是否有库存而变，让玩家点之前就知道会发生什么 */
      var selPlane = ui.newType ? AT.planeOf(ui.newType) : null;
      var selIdle = selPlane ? S.idlePlanes(st).filter(function (x) { return x.type === ui.newType; }).length : 0;
      var willBuy = selPlane && !selIdle;
      out += '<div class="nw-actions"><button class="btn btn-pri' +
        (selPlane && !willBuy && selIdle < 1 ? ' dis' : '') + '" data-act="do-open" type="button">' +
        (selPlane
          ? (willBuy ? '购机 1 架并开通（' + money(selPlane.price) + '）' : '开通航线')
          : '开通航线') +
        '（' + h((AT.CITIES_BY_ID[fromId] || {}).name) + ' → ' +
        h((AT.CITIES_BY_ID[ui.newTo] || {}).name) + '）</button></div>';
    } else {
      /* 未选目的地 → 原本这里什么都不渲染，玩家会以为面板坏了（实机反馈：
       *   「点了新航线，下面一片空白」）。给一句明确的下一步指引。 */
      out += '<div class="nw-sec"><div class="rd-note">' +
        '请在 ② 中选一个目的地 —— 选完会显示机型与开通按钮。' +
        '若目的地写着「机队没有，需现购」，说明你手上没有能飞这条线的飞机，' +
        '开通时会自动为你买 1 架（需资金充足）。</div></div>';
    }
    out += '</div>';
    return out;
  }

  /* ───────────────────────── 渲染：模态 ───────────────────────── */

  var lastNetWorth = null;
  /* 上一帧的城市等级总和 —— 用于识别「有城市升级了」这个**世界事件**。
   * 为什么不订阅 sim 的回调：sim 是不认识 DOM/音频的纯逻辑层（它要能在 Node 里
   * 跑完一整局），给它加回调会把它和表现层耦上。改为 UI 对比前后状态，
   * 纯读、无侵入，且**无头测试里天然不触发**（没有 UI 就没有音效）。 */
  var lastDevSum = 0, lastCash = null;

  function syncModal(st) {
    // 终局优先
    if (st.phase === 'over') {
      if (ui.modal !== 'over') {
        // 胜负用不同音色（defcon 的定音长音思路）
        sfx('end', { win: !!playerWon(st) });
        sfx('milestone');
        showOver(st);
      }
      return;
    }
    // 事件卡（sim 已把计时暂停）
    if (st.card) {
      if (ui.modal !== 'event') { sfx('event'); showEvent(st.card); }
      return;
    }
    // 回合变化 → 生成季报
    if (st.quarter !== ui.lastQuarter) {
      ui.lastQuarter = st.quarter;
      var hh = st.history[st.history.length - 1];
      if (hh) {
        var nwDelta = lastNetWorth == null ? null : hh.netWorth - lastNetWorth;
        /* ⚠ 所有数字一律取自历史快照（sim 在结算那一刻写入的真实值）。
         *   曾犯过的错：用 S.forecast(st) 拼收入 —— 那是**下一季的预测**，
         *   于是季报里「收入 − 成本」对不上「净利」，差了近一倍（实机截图确认）。
         *   快照现已带 revenue/cost/overhead/interest/groundCost，直接用即可。
         *   旧存档可能没有这些字段 → 用 net 反推兜底，保证不出现 NaN。 */
        var hasBreak = (hh.revenue != null);
        ui.reports.push({
          quarter: hh.quarter,
          revenue: hasBreak ? hh.revenue : (hh.net + hh.cost + hh.overhead + hh.interest),
          cost: hasBreak ? hh.cost : 0,
          overhead: hasBreak ? hh.overhead : 0,
          interest: hasBreak ? hh.interest : 0,
          groundCost: hasBreak ? (hh.groundCost || 0) : 0,
          net: hh.net, cash: hh.cash, netWorth: hh.netWorth, nwDelta: nwDelta,
          pax: hh.pax, routes: hh.routes, planes: hh.planes
        });
        lastNetWorth = hh.netWorth;
        /* 季度钟 + 盈亏音一起响：钟是「时间推进了」，
         * 盈亏音是「这一季的结果」—— 两者语义不同，都要给。 */
        sfx('quarter');
        sfx(hh.net >= 0 ? 'profit' : 'loss');
      }
    }

    /* ── 世界事件：逐帧对比前后状态，识别「发生过什么」 ──
     * 顺序很重要：先响最紧急的（资金告急），再响正反馈（城市升级）。
     * 理由：两者同帧发生时，玩家更需要立刻知道钱不够了。 */
    watchWorld(st);

    // 有待看季报且没有事件卡 → 弹出（事件卡优先级更高，避免打断决策）
    if (ui.reports.length && ui.modal !== 'report') {
      showReport(ui.reports[0]);
    } else if (!ui.reports.length && ui.modal === 'report') {
      ui.modal = null;
      if (el.uModal) el.uModal.classList.remove('show');
    }
  }

  function playerWon(st) {
    var rk = S.ranking(st);
    return !!(rk.length && rk[0] && rk[0].isPlayer) || S.verdict(st).win === true;
  }

  /* 世界事件观察器：资金告急 / 城市升级 / 竞对抢线。
   *
   * ⚠ 首次调用只做基线，不响 —— 否则开局第一帧就会因为
   *   「lastCash 是 null」或「城市等级和从 0 跳到 N」而误报一次警报。
   *   这个 bug 在声音上很显眼（一进游戏就听见资金告急）。 */
  function watchWorld(st) {
    var devSum = 0;
    st.cities.forEach(function (c) { devSum += (c.level || 0); });
    if (lastCash == null) {           // 首帧：只建立基线
      lastCash = st.cash;
      lastDevSum = devSum;
      return;
    }

    /* 资金告急：跌到 0 以下（负债）才响，且要 crosses 才响一次 ——
     * 若只在「< 0」时响，负债持续十个季度就会一直响（1.2s 间隔也受不了）。 */
    if (st.cash < 0 && lastCash >= 0) sfx('crisis');
    lastCash = st.cash;

    /* 城市升级 → 本作核心正反馈（飞轮转起来了）。
     * 用「等级总和增加」而非「哪些城市升了」：前者一个数就够，
     * 后者要在 sim 之外再维护一份城市等级快照，得不偿失。 */
    if (devSum > lastDevSum) sfx('upgrade');
    lastDevSum = devSum;
  }

  /* ───────────────────────── 帧驱动 ───────────────────────── */

  var ACC = 0;
  function frame(state, dt) {
    if (!ui.inited) return;
    ui.state = state;
    /* HUD 每 100ms 刷一次即可 —— 读数不会更快地变化，而 innerHTML/文本写入
     * 在移动端是真实的成本（每帧刷 10 个节点 ≈ 每秒 600 次 DOM 写）。
     * 面板与模态则「标记脏才重建」，因为它们含 innerHTML（贵得多）。 */
    ACC += dt;
    if (ACC >= 0.1) { ACC = 0; dirty.hud = true; }

    if (dirty.hud) { syncHud(); dirty.hud = false; }
    // 面板里的利润随季推进变化，故低频重刷（1Hz）
    if (ui.panel) {
      panelT += dt;
      if (panelT >= 1) { panelT = 0; dirty.panel = true; }
    }
    if (dirty.panel) { syncPanel(); dirty.panel = false; }
    dirty.modal = true;
    if (dirty.modal) { syncModal(state); dirty.modal = false; }

    // 计时条需要连续变化，单独每帧刷
    var rem = S.quarterRemain(state);
    if (el.uTimerBar) {
      var total = C.quarterSeconds || 22;
      var w = rem == null ? 100 : Math.max(0, Math.min(100, (1 - rem / total) * 100));
      el.uTimerBar.style.width = w + '%';
    }
    if (el.uTimer) {
      el.uTimer.textContent = rem == null
        ? (state.card ? '待决策' : (state.phase === 'over' ? '已结束' : '—'))
        : Math.ceil(rem) + 's';
    }
  }
  var panelT = 0;

  function onResize() { /* 布局交给 CSS */ }

  AT.ui = {
    init: init,
    frame: frame,
    onResize: onResize,
    toast: toast,
    money: money,
    openPanel: openPanel,
    closePanel: closePanel,
    /* 音效入口暴露给测试打桩：测试里替换 ui._sfx = fn 即可断言
     * 「开线响了 open、被拒响了 deny」而不必真的建 AudioContext。 */
    sfx: sfx,
    get panel() { return ui.panel; },
    get modal() { return ui.modal; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
