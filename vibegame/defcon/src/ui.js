/*
 * defcon — ui.js
 * HUD 更新：顶栏（DEFCON / 危机值 / 阶段）、抽屉（阵营 / 图例 / 城市）、
 *          事件卡（危机博弈阶段的玩家决策入口）、两段式发射条、终局计分
 * 依赖：data.js → geo.js → sim.js（本文件在 render 之后加载）
 * 命名空间：window.DC（经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → sim.js → ai.js → render.js → ui.js → game.js
 *
 * 交互绑定一律走 addEventListener —— 小工具红线禁止 onclick= 行内事件（DESIGN §7.6）。
 * 本文件只负责「画」和「把点击翻译成意图」；意图通过 init 时传入的 cmd 回调交给 game.js 执行，
 * 因此 UI 不直接改游戏状态，无头测试也能绕过 DOM 直接测命令层。
 * 列表重建有节流：仅在内容签名变化时重排 DOM，避免每帧刷 DOM 拖垮帧率。
 *
 * ── 竖屏重构（Wave 3）─────────────────────────────────────────
 * 阵营与城市列表收进右侧抽屉，地球让出完整主视觉；常驻信息只剩顶栏一行四格 + 底部情境面板。
 * 核弹不可逆，所以发射必须是两段式：先选目标（点地球 / 点城市行），再按「发 射」确认。
 * 唯一的例外是「已选中目标后再点一次同一目标」—— 两次有意的点击等价于确认，
 * 既保留防误触，又不逼玩家在小屏上把手指从地球挪到底部按钮。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};
  var CONFIG = DC.CONFIG || {};
  var S = DC.sim;

  var el = {};
  var cmd = {};
  var cur = null;                 // 最近一次 update 的 state，供行点击回调判断当前阶段
  var pending = null;             // 已选定但未发射的目标城市 id（两段式发射的第一段）
  var salvo = 1;                  // 单次发射枚数：1 或 3（齐射）
  var bound = false;              // 事件只绑一次：init 若被重入不会叠加出双份监听
  var sig = { factions: '', cities: '', card: '', choice: -2, war: -1, over: false,
              dc: 0, impacts: 0, target: null, fireOk: null, tip: '', sheet: null, tone: '' };

  var PHASE_NAME = {
    briefing: '态势简报', crisis: '危机博弈', war: '热核战争', over: '终局'
  };

  // 事件卡附加效果的中文说明（与 sim.applyEffects 的实现一一对应）
  var EFFECT_TEXT = {
    reveal_radar: '暴露全部敌方雷达',
    expose_silo: '暴露己方全部发射井',
    radar_down: '己方预警网失效',
    pop_loss: '己方规模受损',
    city_defense: '己方城市获得防御层',
    add_radar: '己方增建雷达',
    add_sam: '己方增建防空',
    add_missiles: '己方补充核弹',
    boost_pop: '己方规模回升',
    intel_city: '获取敌方城市情报',
    degrade_facility: '削弱敌方设施',
    destroy_facility: '摧毁敌方设施'
  };

  /* §11.9 城市列表军事单位改用图例图形 × 数量，复用 index.html 图例区的 SVG path。
   * 内联 SVG 在 HTML5 里无需 xmlns，红线扫描不会误判为外部 URL。
   * 图形与图例区一一对应：发射井六边形 / 防空三角形 / 雷达椭圆+竖线。 */
  var SVG_SILO = '<svg width="11" height="11" viewBox="0 0 12 12"><polygon points="6,1 10.3,3.5 10.3,8.5 6,11 1.7,8.5 1.7,3.5" fill="rgba(127,212,232,.22)" stroke="#7fd4e8" stroke-width="1"/></svg>';
  var SVG_SAM = '<svg width="11" height="11" viewBox="0 0 12 12"><polygon points="6,1.5 10.5,10.5 1.5,10.5" fill="rgba(127,212,232,.22)" stroke="#7fd4e8" stroke-width="1"/></svg>';
  var SVG_RADAR = '<svg width="11" height="11" viewBox="0 0 12 12"><ellipse cx="6" cy="5" rx="5" ry="2.6" fill="rgba(127,212,232,.22)" stroke="#7fd4e8" stroke-width="1"/><line x1="6" y1="7.6" x2="6" y2="11" stroke="#7fd4e8" stroke-width="1"/></svg>';
  /* §11.10 战略核潜艇：艇身椭圆 + 指挥塔 + 潜望镜 + 尾舵，与球面图标同一侧影。 */
  var SVG_SUB = '<svg width="11" height="11" viewBox="0 0 12 12"><ellipse cx="5.2" cy="7.4" rx="3.6" ry="1.4" fill="rgba(127,212,232,.22)" stroke="#7fd4e8" stroke-width="1"/><path d="M4,6.2 L4.2,4.4 L6.4,4.4 L6.6,6.2 Z" fill="rgba(127,212,232,.22)" stroke="#7fd4e8" stroke-width="1"/><line x1="5.3" y1="4.4" x2="5.3" y2="2.8" stroke="#7fd4e8" stroke-width="1"/><path d="M8.4,7.4 L11,5.8 L11,9 Z" fill="rgba(127,212,232,.22)" stroke="#7fd4e8" stroke-width="1"/></svg>';

  function $(id) { return document.getElementById(id); }

  /* ───────────────────────── 初始化 ───────────────────────── */

  function init(state, commands) {
    cmd = commands || {};
    el.dcBox = $('defcon'); el.dcLv = $('dcLv');
    el.crVal = $('crVal'); el.crBar = $('crBar');
    el.phName = $('phName');
    // 倒计时下沉到底部统计行最右端（回合数只体现在事件卡的回合徽章上，不再多处重复）
    el.rdTime = $('rdTime');
    el.hudLeft = $('hudLeft');
    el.myPop = $('myPop'); el.myMs = $('myMs');
    el.msLab = $('msLab');
    el.popDelta = $('popDelta'); el.msDelta = $('msDelta');
    el.popGr = $('popGr'); el.msGr = $('msGr');
    el.phase = $('phase');
    // 顶栏中段的当前阵营（色块 + 名称）：阵营在开局就定死，这里写一次即可
    el.facSw = $('facSw'); el.facName = $('facName');
    var fac = DC.FACTIONS_BY_CODE[state.playerFaction] || {};
    if (el.facSw) el.facSw.style.background = fac.color || '#ffffff';
    if (el.facName) el.facName.textContent = fac.name || state.playerFaction;
    el.speedBtn = $('speedBtn');
    el.alert = $('alert');
    el.fs = { silo: $('fsSilo'), sub: $('fsSub'), sam: $('fsSam'), radar: $('fsRadar') };
    el.ft = { silo: $('ftSilo'), sub: $('ftSub'), sam: $('ftSam'), radar: $('ftRadar') };
    el.fsWrap = { silo: $('fsSiloWrap'), sub: $('fsSubWrap'), sam: $('fsSamWrap'), radar: $('fsRadarWrap') };
    el.fList = $('fList'); el.cList = $('cList');
    el.card = $('card'); el.cTitle = $('cTitle'); el.cDesc = $('cDesc');
    el.cTimer = $('cTimer'); el.cOpts = $('cOpts'); el.cMax = $('cMax');
    el.sheet = $('sheet');
    el.warbar = $('warbar'); el.wbAmmo = $('wbAmmo'); el.wbTip = $('wbTip');
    el.tgtPick = $('tgtPick'); el.fireBtn = $('fireBtn'); el.salvoBtn = $('salvoBtn');
    if (el.tgtPick) {
      el.tgtName = el.tgtPick.querySelector('.tn');
      el.tgtHint = el.tgtPick.querySelector('.tp');
    }
    el.drawer = $('drawer'); el.drawerBtn = $('drawerBtn'); el.drawerClose = $('drawerClose');
    el.sndBtn = $('sndBtn');
    el.flash = $('flash'); el.alarm = $('alarm');
    el.over = $('over'); el.ovBody = $('ovBody'); el.ovRecap = $('ovRecap');
    el.ovTotal = $('ovTotal');

    pending = null; salvo = 1;
    sig.factions = ''; sig.cities = ''; sig.card = ''; sig.choice = -2;
    sig.war = -1; sig.over = false; sig.dc = 0; sig.impacts = 0; sig.intercepts = -1;
    lastFlashAt = -1e9;
    sig.target = null; sig.fireOk = null; sig.tip = ''; sig.sheet = null; sig.tone = '';
    sig.pop = null; sig.ms = null; sig.fs = ''; sig.dcAlerted = false;
    speedIdx = 0; renderSpeed(1);

    if (!bound) { bindStatic(); bound = true; }
    buildCityList(state);
    renderTarget(state);
    renderSalvo();
  }

  function bindStatic() {
    // 常驻「拉满」按钮：危机博弈期间玩家随时可以主动引爆，不必等抽到带 MAX 选项的卡
    if (el.cMax) el.cMax.addEventListener('click', function () {
      if (cmd.onCrisisMax) cmd.onCrisisMax();
    });

    if (el.drawerBtn) el.drawerBtn.addEventListener('click', function () { openDrawer(); });
    if (el.drawerClose) el.drawerClose.addEventListener('click', function () { closeDrawer(); });
    // 点「未选定目标」那一行 = 直接去抽屉里挑城市（小屏上比回地球找光点快得多）
    if (el.tgtPick) el.tgtPick.addEventListener('click', function () {
      if (!pending) openDrawer();
    });

    if (el.fireBtn) el.fireBtn.addEventListener('click', function () { fire(); });
    if (el.salvoBtn) el.salvoBtn.addEventListener('click', function () { toggleSalvo(); });

    /* 倍速：危机博弈每回合 20 秒、战争 3 分钟，看熟了会想快进。
     * 只加速时间推进（game.js 的 acc 累积），逻辑仍是 10 Hz 固定步长 —— 战局结果与倍速无关。 */
    if (el.speedBtn) el.speedBtn.addEventListener('click', function () { toggleSpeed(); });

    /* 音效默认开启（audio.js）：init 时把按钮初始态与 DC.audio.enabled 对齐，
     * 开态画声波线、关态画静音斜杠，不靠 HTML 里的写死初始值。 */
    if (el.sndBtn && DC.audio) {
      el.sndBtn.classList.toggle('on', DC.audio.enabled);
      el.sndBtn.setAttribute('aria-pressed', DC.audio.enabled ? 'true' : 'false');
    }

    /* 音效开关：点一下切换。AudioContext 的 resume 必须发生在真实手势里，
     * 所以解锁动作放在这个 click 上，而不是放在 init 里。 */
    if (el.sndBtn) el.sndBtn.addEventListener('click', function () {
      var on = DC.audio ? DC.audio.toggle() : false;
      el.sndBtn.classList.toggle('on', on);
      el.sndBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) DC.audio.play('defcon', 5);      // 开声即给一声提示，否则玩家不知道有没有生效
    });
  }

  function sfx(name, arg) { if (DC.audio) DC.audio.play(name, arg); }

  function openDrawer() { if (el.drawer) el.drawer.classList.add('open'); }
  function closeDrawer() { if (el.drawer) el.drawer.classList.remove('open'); }

  /* ───────────────────────── 开局：阵营选择 ─────────────────────────
   * 在渲染与模拟建立之前先问「你打谁」—— 玩家阵营决定雷达环、己方单位可见性、
   * 城市列表的敌我划分，这些都得在 create 时就定下来，不能开局后再改。
   */
  function showSetup(onPick) {
    var box = $('setup'), list = $('pickList');
    if (!box || !list) return;
    list.textContent = '';
    DC.FACTIONS.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick';
      b.setAttribute('data-faction', f.code);
      var sw = document.createElement('span');
      sw.className = 'sw'; sw.style.background = f.color;
      var nm = document.createElement('span');
      nm.className = 'nm'; nm.textContent = f.name;
      var rg = document.createElement('span');
      rg.className = 'rg'; rg.textContent = f.region;
      var pk = document.createElement('span');
      pk.className = 'pk'; pk.textContent = f.perkDesc || '';
      var ms = document.createElement('span');
      ms.className = 'ms'; ms.textContent = DC.factionMissiles(f.code) + ' 枚';
      b.appendChild(sw); b.appendChild(nm); b.appendChild(rg); b.appendChild(pk); b.appendChild(ms);
      b.addEventListener('click', function () { if (onPick) onPick(f.code); });
      list.appendChild(b);
    });
    box.classList.add('show');
  }

  function hideSetup() {
    var box = $('setup');
    if (box) box.classList.remove('show');
  }

  /* ───────────────────────── 顶栏 ───────────────────────── */

  function updateTop(state) {
    el.dcLv.textContent = state.defcon;
    // 用 classList 而不是整体覆写 className —— 否则每帧覆写会把正在播的 bump 动画抹掉
    el.dcBox.classList.toggle('d1', state.defcon === 1);
    el.dcBox.classList.toggle('d2', state.defcon === 2);
    if (sig.dc !== state.defcon) {
      sig.dc = state.defcon;
      sfx('defcon', state.defcon);
      el.dcBox.classList.remove('bump');
      void el.dcBox.offsetWidth;             // 强制回流，动画才能连续触发
      el.dcBox.classList.add('bump');
    }
    el.crVal.textContent = Math.round(state.crisis);
    el.crBar.style.width = Math.max(0, Math.min(100, state.crisis)) + '%';
    /* DEFCON 跌到 1 = 核打击权限解锁，这是一局里唯一不可回头的门槛，
     * 必须有一次明确的告知（红脉冲 + 音效是氛围，这条横幅才是"说清楚"）。 */
    if (state.defcon === 1 && sig.dcAlerted !== true && state.phase !== 'over') {
      sig.dcAlerted = true;
      el.alert.classList.remove('show');
      void el.alert.offsetWidth;
      el.alert.classList.add('show');
      if (DC.render && DC.render.shake) DC.render.shake(0.6);
    }
    /* 危机值条分档着色（2026-09-09）：旧版是一条固定的 蓝→琥珀→红 渐变，
     * 宽度一变整条渐变就被压缩，危机值 10 的时候右侧照样是红的 —— 等于"永远在警戒"。
     * 改为按危机值本身分三档整条换色：开局是纯蓝，越接近开战越烫。 */
    var tone = state.crisis >= 80 ? 'hot' : state.crisis >= 45 ? 'mid' : 'low';
    if (sig.tone !== tone) { sig.tone = tone; el.crBar.className = tone; }
    el.phName.textContent = PHASE_NAME[state.phase] || state.phase;
    // 阶段着色（§11.15）：简报青 / 危机琥珀 / 战争红 / 终局灰
    if (el.phase) {
      var pc = 'p-' + state.phase;
      if (el.phase._pc !== pc) {
        el.phase._pc = pc;
        el.phase.classList.remove('p-briefing', 'p-crisis', 'p-war', 'p-over');
        el.phase.classList.add(pc);
      }
    }

    var left = 0;
    if (state.phase === 'briefing') left = Math.max(0, CONFIG.briefingSeconds - state.t);
    else if (state.phase === 'crisis') left = Math.max(0, CONFIG.roundSeconds - state.t);
    else if (state.phase === 'war') left = Math.max(0, CONFIG.warSeconds - state.t);
    /* 倒计时：统计行最右端。终局没有倒计时，显示「本局结束」。
     * 回合数不再单独展示 —— 危机期看事件卡的回合徽章，战争期只剩倒计时重要。 */
    if (el.rdTime) {
      var rt = state.phase === 'over' ? '本局结束'
        : state.phase === 'war' ? ('剩 ' + left.toFixed(0) + 's')
        : (left.toFixed(0) + 's');
      if (el.rdTime.textContent !== rt) el.rdTime.textContent = rt;
    }

    // 两档红脉冲：DEFCON 1 全力警报；危机博弈期临界（≥85）先用心跳预警吊住紧张感
    el.alarm.classList.toggle('on', state.defcon === 1 && state.phase !== 'over');
    el.alarm.classList.toggle('warn', state.phase === 'crisis' && state.crisis >= 85);
  }

  /* ───────────────────────── 我方存量（规模 / 核弹）与回合变化 ─────────────────────────
   * §11.11：每回合的规模与弹头变化必须在界面上看得见 —— 否则玩家只知道自己按了个选项，
   * 不知道这一按换来了什么（事件卡加成、城市被核平、打出去的弹头都是在这里体现）。
   * Δ 显示 2.5s 后淡出，不常驻，免得变成又一个需要解读的数字。
   * §11.13：旁边常驻一格「+X/回合」的基础产能标记 —— 即使什么都不选，回合结算也有进账，
   * 玩家据此能算出「还拖得起几个回合」。 */
  function bumpDelta(node, d, unit) {
    if (!node) return;
    node.textContent = (d > 0 ? '+' : '') + d + (unit || '');
    node.classList.toggle('up', d > 0);
    node.classList.toggle('down', d < 0);
    node.classList.add('show');
    if (node._t) clearTimeout(node._t);
    node._t = setTimeout(function () { node.classList.remove('show'); }, 2500);
  }

  function pumpDelta(state) {
    var pop = 0;
    S.citiesOf(state, state.playerFaction).forEach(function (c) { pop += c.pop; });
    var ms = S.totalMissiles(state, state.playerFaction);
    /* §11.17 热核阶段（含终局）：弹头存量在发射条里已有且更醒目，
     * 左上这格改口径为「战损」（己方累计伤亡规模）—— 遵循 §11.16 回避「人」的表述。 */
    var war = state.phase === 'war' || state.phase === 'over';

    // 产能标记仅简报期展示（§11.17）：进入危机博弈后「还拖得起几个回合」不再有意义
    if (el.hudLeft) {
      var ng = state.phase !== 'briefing';
      if (el.hudLeft._ng !== ng) { el.hudLeft._ng = ng; el.hudLeft.classList.toggle('nogrowth', ng); }
    }

    if (el.myPop) {
      var ps = pop.toFixed(1);
      if (el.myPop.textContent !== ps) el.myPop.textContent = ps;
    }
    if (el.msLab) {
      var lab = war ? '战损' : '弹头';
      if (el.msLab.textContent !== lab) el.msLab.textContent = lab;
    }
    if (el.myMs) {
      var msText = war
        ? (((state.stats[state.playerFaction] || {}).casualties) || 0).toFixed(1) + 'M'
        : String(ms);
      if (el.myMs.textContent !== msText) el.myMs.textContent = msText;
    }

    // 基础产能常驻标记（§11.13）：读 sim.roundGrowthOf，与回合结算完全同一套口径
    if ((el.popGr || el.msGr) && state.phase === 'briefing') {
      var g = S.roundGrowthOf(state, state.playerFaction);
      var pgs = '+' + g.pop.toFixed(1) + '/回合';
      var mgs = '+' + g.missiles + '/回合';
      if (el.popGr && el.popGr.textContent !== pgs) el.popGr.textContent = pgs;
      if (el.msGr && el.msGr.textContent !== mgs) el.msGr.textContent = mgs;
    }

    if (sig.pop == null) { sig.pop = pop; sig.ms = ms; return; }   // 首帧只记基线
    if (Math.abs(pop - sig.pop) > 0.05) {
      bumpDelta(el.popDelta, +((pop - sig.pop).toFixed(1)), 'M');
      sig.pop = pop;
    }
    if (ms !== sig.ms) {
      // 热核阶段这格已换成战损口径，弹头增减不再闪烁 Δ（发射条自己会扣数字）
      if (!war) bumpDelta(el.msDelta, ms - sig.ms, '');
      sig.ms = ms;
    }
  }

  /* ───────────────────────── 我方军事设备在线统计（热核阶段）─────────────────────────
   * 「在线 / 总数」两个口径：设施被核平 → disabled → 在线数实时扣除，红色标出。
   * 玩家在战争期唯一能判断"我还有多少还手之力"的地方，比只看弹头数更完整
   * （发射井打空但还在 = 能补弹；发射井没了 = 彻底没了）。 */
  function updateForceStat(state) {
    if (!el.fs || !el.fs.silo) return;
    var me = state.playerFaction;
    var vals = {}, key = [];
    ['silo', 'sub', 'sam', 'radar'].forEach(function (t) {
      var all = 0, on = 0;
      state.units.forEach(function (u) {
        if (u.faction !== me || u.type !== t) return;
        all++;
        if (!u.disabled) on++;
      });
      vals[t] = [on, all];
      key.push(t + on + '/' + all);
    });
    var s = key.join('|');
    if (s === sig.fs) return;
    sig.fs = s;
    ['silo', 'sub', 'sam', 'radar'].forEach(function (t) {
      if (el.fs[t]) el.fs[t].textContent = vals[t][0];
      if (el.ft[t]) el.ft[t].textContent = vals[t][1];
      if (el.fsWrap[t]) el.fsWrap[t].classList.toggle('hit', vals[t][0] < vals[t][1]);
    });
  }

  /* ───────────────────────── 演出：核爆白闪 ───────────────────────── */

  /* state.impacts 是逻辑层的单调计数（sim 在 resolveImpact 里 +1）。
   * 不能读 state.fx —— render.frame 每帧 shift 清空队列，UI 永远读不到。 */
  /* 白闪节流：齐射落地时 impacts 短时间连跳多次，每次都重播动画就是频闪（手机上尤其刺眼）。
   * 两次白闪之间至少隔 FLASH_GAP —— 被跳过的命中依然有音效、震屏和球面焦痕，演出不缺席，只是不闪眼。 */
  var FLASH_GAP = 1100;              // ms，与 CSS 动画时长一致：上一次退光结束前不重播
  var lastFlashAt = -1e9;
  function pumpImpacts(state) {
    if (state.impacts === sig.impacts) return;
    sig.impacts = state.impacts;
    sfx('nuke');
    var now = Date.now();
    if (now - lastFlashAt >= FLASH_GAP) {
      lastFlashAt = now;
      el.flash.classList.remove('on');
      void el.flash.offsetWidth;         // 强制回流，动画才能连续触发
      el.flash.classList.add('on');
    }
    if (DC.render && DC.render.shake) DC.render.shake(1);
  }

  /* ───────────────────────── 阵营列表 ───────────────────────── */

  function updateFactions(state) {
    var rows = state.factions.map(function (f) {
      var pop = S.citiesOf(state, f.code).reduce(function (s, c) { return s + c.pop; }, 0);
      return { code: f.code, name: f.name, color: f.color, pop: pop, me: f.isPlayer };
    });
    // 签名比对：内容没变就不碰 DOM
    var s = rows.map(function (r) { return r.code + Math.round(r.pop * 10); }).join('|');
    if (s === sig.factions) return;
    sig.factions = s;

    el.fList.textContent = '';
    rows.forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'frow' + (r.me ? ' me' : '') + (r.pop <= 0 ? ' dead' : '');
      var sw = document.createElement('span');
      sw.className = 'sw'; sw.style.background = r.color;
      var nm = document.createElement('span');
      nm.className = 'nm'; nm.textContent = r.me ? r.name + '（你）' : r.name;
      var pp = document.createElement('span');
      pp.className = 'pp'; pp.textContent = r.pop.toFixed(0) + 'M';
      d.appendChild(sw); d.appendChild(nm); d.appendChild(pp);
      el.fList.appendChild(d);
    });
  }

  /* ───────────────────────── 城市列表（抽屉内）───────────────────────── */

  function buildCityList(state) {
    el.cList.textContent = '';
    state.cities.forEach(function (c) {
      var fc = DC.FACTIONS_BY_CODE[c.faction] || {};
      var row = document.createElement('div');
      row.className = 'crow';
      row.setAttribute('data-city', c.id);
      var sw = document.createElement('span');
      sw.className = 'sw'; sw.style.background = fc.color || '#ffffff';
      var nm = document.createElement('span');
      nm.className = 'cn'; nm.textContent = c.name;
      var cf = document.createElement('span');
      cf.className = 'cf';
      var pp = document.createElement('span');
      pp.className = 'cp';
      row.appendChild(sw); row.appendChild(nm); row.appendChild(cf); row.appendChild(pp);
      /* 战争阶段：第一下 = 选中目标，第二下 = 确认发射（防误触）。
       * 其余阶段：点击 = 相机飞过去（砍掉 2D 视图后的操作补偿，DESIGN §2.3）。 */
      row.addEventListener('click', function () {
        var isTarget = cur && cur.phase === 'war' &&
                       c.alive && c.faction !== cur.playerFaction;
        if (isTarget) {
          /* 从抽屉里选完必须收起抽屉：抽屉 z-index 30 且满屏高，
           * 会把 z-index 12 的底部发射条整个盖住 —— 不关掉玩家就再也按不到「发 射」。 */
          if (pending === c.id) { closeDrawer(); fire(); }
          else { selectTarget(c.id); closeDrawer(); }
          return;
        }
        if (DC.render && DC.render.flyTo) DC.render.flyTo(c.lat, c.lon);
        closeDrawer();
      });
      el.cList.appendChild(row);
    });
  }

  function updateCities(state) {
    var s = state.cities.map(function (c) {
      var t = (state.phase === 'war' && c.alive && c.faction !== state.playerFaction) ? 't' : '';
      var us = S.unitsOfCity(state, c.id);
      var intel = us.some(function (u) { return u.exposed; });
      return c.id + (c.alive ? Math.round(c.pop * 10) : 'x') + t + (pending === c.id ? 'S' : '') + (intel ? 'I' : '');
    }).join('|');
    if (s === sig.cities) return;
    sig.cities = s;
    var rows = el.cList.children;
    for (var i = 0; i < rows.length; i++) {
      var c = state.cities[i];
      if (!c) continue;
      var tgt = state.phase === 'war' && c.alive && c.faction !== state.playerFaction;
      rows[i].className = 'crow' + (c.alive ? '' : ' gone') +
                          (tgt ? ' tgt' : '') + (pending === c.id ? ' sel' : '');
      // 关联设施：己方直接显示，敌方需情报（任一关联设施 exposed）才显示，否则 "?"
      // §11.9 改用图例 SVG 图形 × 数量徽章，复用 index.html 图例区 path
      // §11.12 失效设施单独成组、整组染灰（opacity .35）—— 与球面灰图标同一口径
      var cfHtml = '';
      if (c.alive) {
        var us = S.unitsOfCity(state, c.id);
        var isOurs = c.faction === state.playerFaction;
        var hasIntel = us.some(function (u) { return u.exposed; });
        if (isOurs || hasIntel) {
          var ICONS = { silo: SVG_SILO, sub: SVG_SUB, sam: SVG_SAM, radar: SVG_RADAR };
          var TYPES = ['silo', 'sub', 'sam', 'radar'];
          cfHtml = TYPES.map(function (t) {
            var on = 0, off = 0;
            us.forEach(function (u) { if (u.type === t) { u.disabled ? off++ : on++; } });
            var html = '';
            if (on) html += ICONS[t] + '<b>' + on + '</b>';
            if (off) html += ICONS[t].replace('<svg ', '<svg style="opacity:.35" ') + '<b style="opacity:.35">' + off + '</b>';
            return html;
          }).join('') || '—';
        } else {
          cfHtml = '?';
        }
      }
      rows[i].children[2].innerHTML = cfHtml;
      rows[i].children[3].textContent = c.alive ? c.pop.toFixed(1) + 'M' : '——';
    }
  }

  /* ───────────────────────── 目标选择（两段式发射 · 第一段）───────────────────────── */

  function selectTarget(cityId) {
    var c = cur ? S.findCity(cur, cityId) : null;
    if (!c) return false;
    pending = cityId;
    renderTarget(cur);
    // 选目标的同时把地球转过去，并在球面上打一圈锁定环（§12）：
    // flyTo 只解决「看不看得见」，锁定环解决「62 个环里哪一个是它」。
    if (DC.render && DC.render.flyTo) DC.render.flyTo(c.lat, c.lon);
    if (DC.render && DC.render.setTarget) DC.render.setTarget(c.lat, c.lon);
    return true;
  }

  function clearTarget() {
    if (DC.render && DC.render.clearTarget) DC.render.clearTarget();
    if (!pending) return;
    pending = null;
    renderTarget(cur);
  }

  function renderTarget(state) {
    if (!el.tgtPick) return;
    var c = pending && state ? S.findCity(state, pending) : null;
    var key = c ? (c.id + Math.round(c.pop * 10)) : '';
    if (key === sig.target) return;
    sig.target = key;
    if (!c) {
      el.tgtPick.classList.add('empty');
      el.tgtName.textContent = '未选定目标';
      el.tgtHint.textContent = '点选敌方坐标，或从城市列表挑选';
      return;
    }
    el.tgtPick.classList.remove('empty');
    el.tgtName.textContent = c.name + ' · ' + c.pop.toFixed(1) + 'M';
    var f = DC.FACTIONS_BY_CODE[c.faction];
    el.tgtHint.textContent = (f ? f.name : c.faction) + ' · 再点一次确认';
  }

  var SPEEDS = [1, 2, 4];
  var speedIdx = 0;
  function toggleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    var v = SPEEDS[speedIdx];
    renderSpeed(v);
    if (cmd.onSpeed) cmd.onSpeed(v);
  }
  function renderSpeed(v) {
    if (!el.speedBtn) return;
    el.speedBtn.textContent = '×' + v;
    el.speedBtn.classList.toggle('on', v !== 1);
  }

  function toggleSalvo() {
    salvo = (salvo === 1) ? 3 : 1;
    renderSalvo();
  }

  function renderSalvo() {
    if (!el.salvoBtn) return;
    // 显示当前状态（而非"切换到的目标"）：单发就显示单发，齐射就显示齐射
    el.salvoBtn.textContent = salvo === 1 ? '单发 ×1' : '齐射 ×3';
    el.salvoBtn.classList.toggle('on', salvo !== 1);
  }

  function fire() {
    if (!pending) { deny(); return; }
    var id = pending;
    // 打完立刻清空：连点不会在没重新选目标的情况下把剩下的弹头一口气泼出去
    clearTarget();
    sfx('launch');
    if (cmd.onFire) cmd.onFire(id, salvo);
  }

  /* ───────────────────────── 事件卡（玩家决策入口）───────────────────────── */

  function hideCard() {
    if (sig.card === '') return;
    sig.card = ''; sig.choice = -2;
    el.card.classList.remove('show');
    el.cOpts.textContent = '';
  }

  function buildCard(state) {
    var c = state.card;
    /* 标题行 = 回合徽章 + 事件名：回合从标题文本里拆出来做成描边小徽章，
     * 与底部统计行不再有重复的「第 X 回合」纯文本（底部已删）。 */
    el.cTitle.innerHTML = '<span class="cr">第 ' + state.round + ' 回合</span>';
    el.cTitle.appendChild(document.createTextNode(c.title));
    el.cDesc.textContent = c.desc;
    el.cOpts.textContent = '';

    c.options.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('data-opt', String(i));

      var lb = document.createElement('span');
      lb.className = 'ol'; lb.textContent = o.label;
      var isMax = DC.isCrisisMax(o);
      var ex = document.createElement('span');
      ex.className = 'oe';
      ex.textContent = isMax ? '危机值直接拉满' : (o.effect ? (EFFECT_TEXT[o.effect.type] || o.effect.type) : '');

      var right = document.createElement('span');
      right.className = 'or';
      var cc = document.createElement('span');
      cc.className = 'cc ' + (isMax ? 'max' : DC.crisisValue(o) > 0 ? 'up' : DC.crisisValue(o) < 0 ? 'down' : 'zero');
      cc.textContent = isMax ? '拉满' : ((o.crisis > 0 ? '+' : '') + o.crisis);
      right.appendChild(cc);

      b.appendChild(lb); b.appendChild(ex); b.appendChild(right);
      // 立即回显选中态，不等下一帧：一是点击反馈必须符合直觉，
      // 二是依赖下一帧会让外部（如冒烟测试）读到「状态已改、UI 未变」的不一致窗口。
      b.addEventListener('click', function () {
        if (cmd.onChoose) cmd.onChoose(i);
        if (cur) updateCard(cur);
      });
      el.cOpts.appendChild(b);
    });
    el.card.classList.add('show');
  }

  function updateCard(state) {
    if (state.phase !== 'crisis' || !state.card) { hideCard(); return; }

    if (sig.card !== state.card.id + '#' + state.round) {
      sig.card = state.card.id + '#' + state.round;
      sig.choice = -2;
      buildCard(state);
    }
    // 已选项高亮（回合内可改主意；超时未选由 sim 兜底为最保守项）
    var pick = state.choices[state.playerFaction];
    if (pick !== sig.choice) {
      sig.choice = (pick == null) ? -1 : pick;
      var bs = el.cOpts.children;
      for (var i = 0; i < bs.length; i++) {
        if (i === pick) bs[i].classList.add('sel'); else bs[i].classList.remove('sel');
      }
    }
    // 倒计时条：回合内剩余时间
    var left = Math.max(0, 1 - state.t / CONFIG.roundSeconds);
    el.cTimer.style.width = (left * 100).toFixed(1) + '%';
  }

  /* ───────────────────────── 战争操作条（两段式发射 · 第二段）───────────────────────── */

  function updateWarBar(state) {
    if (state.phase !== 'war') {
      if (sig.war !== -1) { sig.war = -1; el.warbar.classList.remove('show'); }
      clearTarget();
      return;
    }
    var ammo = S.totalMissiles(state, state.playerFaction);
    if (sig.war !== ammo) {
      sig.war = ammo;
      el.wbAmmo.textContent = ammo;
      el.warbar.classList.toggle('empty', ammo <= 0);
    }
    // 目标被别人抢先打掉 → 自动清空，避免对着废墟按下发射
    if (pending) {
      var pc = S.findCity(state, pending);
      if (!pc || !pc.alive) clearTarget();
    }
    renderTarget(state);

    var ok = !!pending && ammo > 0;
    if (sig.fireOk !== ok) { sig.fireOk = ok; el.fireBtn.disabled = !ok; }
    var tip = ammo <= 0 ? '弹头耗尽 —— 转入终局战果结算'
      : pending ? '再按一次确认发射 —— 弹道不可撤收'
      : '先装订敌方目标坐标，再按发射';
    if (sig.tip !== tip) { sig.tip = tip; el.wbTip.textContent = tip; }
    el.warbar.classList.add('show');
  }

  /* ───────────────────────── 终局 ───────────────────────── */

  function showOver(state) {
    if (sig.over) return;
    sig.over = true;
    var rk = S.ranking(state);
    el.ovBody.textContent = '';
    /* 全球战损总数：整局最该被看见的数字（§11.8b）。
     * 单位是百万，写成「X.XX 亿」比「XXX.XM」更像一条新闻标题 —— 反战表达要的是体感。 */
    if (el.ovTotal) {
      var dead = S.globalCasualties ? S.globalCasualties(state) : 0;
      el.ovTotal.textContent = (dead / 100).toFixed(2);
    }
    /* §11.8 终局面板：排名按剩余存续规模降序，最后一列显示存续规模（主排序键）。
     * 保留造成/战损供参考，但主胜负判定是「谁的存续规模大」。 */
    rk.forEach(function (r, i) {
      var tr = document.createElement('tr');
      if (r.code === state.playerFaction) tr.className = 'me';
      [String(i + 1), r.name, r.killed.toFixed(1) + 'M', r.casualties.toFixed(1) + 'M']
        .forEach(function (t) {
          var td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
        });
      var sc = document.createElement('td');
      sc.className = 'sc';
      sc.textContent = r.popLeft.toFixed(1) + 'M';
      sc.style.color = 'var(--cyan)';
      tr.appendChild(sc);
      el.ovBody.appendChild(tr);
    });
    buildRecap(state);
    el.over.classList.add('show');
  }

  /* 终局复盘（§12 P1）：三行关键节点。
   * 排名表给出的是结果，玩家真正想知道的是原因 ——
   * 「是谁先把局势推过线的」「第一发砸在谁头上」「我打出去的弹有多少真的落地了」。
   * 三行都从 state 已有的字段里读，不额外维护一份统计。 */
  function buildRecap(state) {
    if (!el.ovRecap) return;
    el.ovRecap.textContent = '';

    function row(key, html) {
      var d = document.createElement('div');
      d.className = 'rc';
      var k = document.createElement('span');
      k.className = 'rk'; k.textContent = key;
      var v = document.createElement('span');
      v.className = 'rv'; v.innerHTML = html;
      d.appendChild(k); d.appendChild(v);
      el.ovRecap.appendChild(d);
      return v;
    }
    function nameOf(code) {
      var f = DC.FACTIONS_BY_CODE[code];
      return f ? f.name : code;
    }

    // 1. 导火索：触发全面开战的那一下（MAX 选项 / 核弹落地 / 回合数失控）
    var fuse = state.maxedBy
      ? '第 <b>' + state.round + '</b> 回合 · ' + state.maxedBy
      : '危机失控 —— 未触发拉满就打满了回合上限';
    row('导火索', fuse);

    // 2. 首枚落地：谁先开的第一枪
    var fi = state.firstImpact;
    row('首枚落地', fi
      ? '第 <b>' + fi.round + '</b> 回合 · <span class="hl">' + nameOf(fi.from) +
        '</span> 命中 ' + nameOf(fi.to) + ' 的 <b>' + fi.city + '</b>'
      : '本局无核弹落地 —— 六方全部克制住了');

    // 3. 你的战果：发射/命中/被拦三件套，回答「我的弹都去哪了」
    var st = state.stats[state.playerFaction] || { launched: 0, hits: 0, lost: 0, casualties: 0 };
    var rate = (st.hits + st.lost) > 0 ? (st.hits / (st.hits + st.lost) * 100) : 0;
    row('你的战果', '发射 <b>' + st.launched + '</b> 枚 · 命中 <span class="hl">' + st.hits +
      '</span>（' + rate.toFixed(0) + '%）· 被拦 ' + st.lost +
      ' · 己方战损 <b>' + st.casualties.toFixed(1) + 'M</b>');
  }

  /* ───────────────────────── 每帧 ───────────────────────── */

  /* 拦截音效：sim 没有为「拦截发生」单独投递事件，只有 stats 里的累计计数。
   * 比对累计和即可判定；战争期一秒内可能有十几次拦截，去抖交给 audio.js 的 MIN_GAP。
   * 初值 -1 是为了跳过开局那一次「0 ≠ -1」，否则一进游戏就先响一声。 */
  function pumpAudio(state) {
    var it = 0;
    Object.keys(state.stats).forEach(function (k) { it += state.stats[k].intercepts; });
    if (it === sig.intercepts) return;
    if (sig.intercepts >= 0 && it > sig.intercepts) sfx('intercept');
    sig.intercepts = it;
  }

  function update(state) {
    cur = state;
    updateTop(state);
    updateFactions(state);
    updateCities(state);
    pumpDelta(state);
    updateForceStat(state);
    updateCard(state);
    updateWarBar(state);
    pumpImpacts(state);
    pumpAudio(state);
    if (state.phase === 'over') showOver(state);

    // 情境面板在简报期是空的（既没有卡也没有战争条），不该占掉屏幕底部一条
    var any = (state.phase === 'crisis' && state.card) || state.phase === 'war';
    if (sig.sheet !== any) { sig.sheet = any; el.sheet.classList.toggle('none', !any); }
  }

  // 指令被拒（射不到 / 没弹了）时的抖一下，代替弹窗
  function deny() {
    sfx('deny');
    if (!el.warbar) return;
    el.warbar.classList.remove('deny');
    void el.warbar.offsetWidth;          // 强制回流，让动画可以连续触发
    el.warbar.classList.add('deny');
  }

  DC.ui = {
    init: init,
    showSetup: showSetup,
    hideSetup: hideSetup,
    update: update,
    buildCityList: buildCityList,
    showOver: showOver,
    deny: deny,
    selectTarget: selectTarget,
    clearTarget: clearTarget,
    fire: fire,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    isDrawerOpen: function () { return !!el.drawer && el.drawer.classList.contains('open'); },
    getPending: function () { return pending; },
    getSalvo: function () { return salvo; },
    el: el
  };

})(typeof window !== 'undefined' ? window : globalThis);
