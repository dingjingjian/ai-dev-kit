/*
 * defcon — ui.js
 * HUD 更新：顶栏（DEFCON / 危机值 / 阶段）、阵营列表、目标城市列表、
 *          事件卡（危机博弈阶段的玩家决策入口）、战争操作条、终局计分
 * 依赖：data.js → geo.js → sim.js（本文件在 render 之后加载）
 * 命名空间：window.DC（经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → sim.js → ai.js → render.js → ui.js → game.js
 *
 * 交互绑定一律走 addEventListener —— 小工具红线禁止 onclick= 行内事件（DESIGN §7.6）。
 * 本文件只负责「画」和「把点击翻译成意图」；意图通过 init 时传入的 cmd 回调交给 game.js 执行，
 * 因此 UI 不直接改游戏状态，无头测试也能绕过 DOM 直接测命令层。
 * 列表重建有节流：仅在内容签名变化时重排 DOM，避免每帧刷 DOM 拖垮帧率。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};
  var CONFIG = DC.CONFIG || {};
  var S = DC.sim;

  var el = {};
  var cmd = {};
  var cur = null;                 // 最近一次 update 的 state，供行点击回调判断当前阶段
  var sig = { factions: '', cities: '', card: '', choice: -2, war: -1, over: false };

  var PHASE_NAME = {
    briefing: '态势简报', crisis: '危机博弈', war: '热核战争', over: '终局'
  };

  // 事件卡附加效果的中文说明（与 sim.applyEffects 的实现一一对应）
  var EFFECT_TEXT = {
    reveal_radar: '暴露全部敌方雷达',
    expose_silo: '暴露己方全部发射井',
    radar_down: '己方预警网失效',
    pop_loss: '己方人口损失',
    city_defense: '己方城市获得防御层'
  };

  function $(id) { return document.getElementById(id); }

  function init(state, commands) {
    cmd = commands || {};
    el.dcBox = $('defcon'); el.dcLv = $('dcLv');
    el.crVal = $('crVal'); el.crBar = $('crBar');
    el.phName = $('phName'); el.phTime = $('phTime');
    el.fList = $('fList'); el.cList = $('cList');
    el.card = $('card'); el.cTitle = $('cTitle'); el.cDesc = $('cDesc');
    el.cTimer = $('cTimer'); el.cOpts = $('cOpts');
    el.warbar = $('warbar'); el.wbAmmo = $('wbAmmo'); el.wbTip = $('wbTip');
    el.over = $('over'); el.ovBody = $('ovBody');
    sig.factions = ''; sig.cities = ''; sig.card = ''; sig.choice = -2; sig.war = -1; sig.over = false;
    buildCityList(state);
  }

  /* ───────────────────────── 顶栏 ───────────────────────── */

  function updateTop(state) {
    el.dcLv.textContent = state.defcon;
    el.dcBox.className = (state.defcon === 1) ? 'd1' : (state.defcon === 2 ? 'd2' : '');
    el.crVal.textContent = Math.round(state.crisis);
    el.crBar.style.width = Math.max(0, Math.min(100, state.crisis)) + '%';
    el.phName.textContent = PHASE_NAME[state.phase] || state.phase;

    var left = 0;
    if (state.phase === 'briefing') left = Math.max(0, CONFIG.briefingSeconds - state.t);
    else if (state.phase === 'crisis') left = Math.max(0, CONFIG.roundSeconds - state.t);
    else if (state.phase === 'war') left = Math.max(0, CONFIG.warSeconds - state.t);
    el.phTime.textContent = state.phase === 'over'
      ? '第 ' + state.round + ' 回合'
      : ('第 ' + Math.max(1, state.round) + ' 回合 · ' + left.toFixed(0) + 's');
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

  /* ───────────────────────── 目标城市列表 ───────────────────────── */

  function buildCityList(state) {
    el.cList.textContent = '';
    state.cities.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'crow';
      row.setAttribute('data-city', c.id);
      var nm = document.createElement('span');
      nm.className = 'cn'; nm.textContent = c.name;
      var pp = document.createElement('span');
      pp.className = 'cp';
      row.appendChild(nm); row.appendChild(pp);
      // 战争阶段点敌方城市 = 发射；其余时候点击 = 相机飞过去
      // （砍掉 2D 视图后的操作补偿，DESIGN §2.3）
      row.addEventListener('click', function () {
        var isTarget = cur && cur.phase === 'war' &&
                       c.alive && c.faction !== cur.playerFaction;
        if (isTarget && cmd.onFire) { cmd.onFire(c.id); return; }
        if (DC.render && DC.render.flyTo) DC.render.flyTo(c.lat, c.lon);
      });
      el.cList.appendChild(row);
    });
  }

  function updateCities(state) {
    var s = state.cities.map(function (c) {
      var t = (state.phase === 'war' && c.alive && c.faction !== state.playerFaction) ? 't' : '';
      return c.id + (c.alive ? Math.round(c.pop * 10) : 'x') + t;
    }).join('|');
    if (s === sig.cities) return;
    sig.cities = s;
    var rows = el.cList.children;
    for (var i = 0; i < rows.length; i++) {
      var c = state.cities[i];
      if (!c) continue;
      var tgt = state.phase === 'war' && c.alive && c.faction !== state.playerFaction;
      rows[i].className = 'crow' + (c.alive ? '' : ' gone') + (tgt ? ' tgt' : '');
      rows[i].children[1].textContent = c.alive ? c.pop.toFixed(1) + 'M' : '——';
    }
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
    el.cTitle.textContent = '第 ' + state.round + ' 回合 · ' + c.title;
    el.cDesc.textContent = c.desc;
    el.cOpts.textContent = '';

    c.options.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('data-opt', String(i));

      var lb = document.createElement('span');
      lb.className = 'ol'; lb.textContent = o.label;
      var ex = document.createElement('span');
      ex.className = 'oe';
      ex.textContent = o.effect ? (EFFECT_TEXT[o.effect.type] || o.effect.type) : '';

      var right = document.createElement('span');
      right.className = 'or';
      var cc = document.createElement('span');
      cc.className = 'cc ' + (o.crisis > 0 ? 'up' : o.crisis < 0 ? 'down' : 'zero');
      cc.textContent = (o.crisis > 0 ? '+' : '') + o.crisis;
      var kbd = document.createElement('span');
      kbd.className = 'kk'; kbd.textContent = String(i + 1);
      right.appendChild(cc); right.appendChild(kbd);

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

  /* ───────────────────────── 战争操作条 ───────────────────────── */

  function updateWarBar(state) {
    if (state.phase !== 'war') {
      if (sig.war !== -1) { sig.war = -1; el.warbar.classList.remove('show'); }
      return;
    }
    var ammo = S.totalMissiles(state, state.playerFaction);
    if (sig.war !== ammo) {
      sig.war = ammo;
      el.wbAmmo.textContent = ammo;
      el.warbar.classList.toggle('empty', ammo <= 0);
      el.wbTip.textContent = ammo > 0
        ? '点击敌方城市或地球上的光点发射'
        : '弹头耗尽 —— 等待终局结算';
    }
    el.warbar.classList.add('show');
  }

  /* ───────────────────────── 终局 ───────────────────────── */

  function showOver(state) {
    if (sig.over) return;
    sig.over = true;
    var rk = S.ranking(state);
    el.ovBody.textContent = '';
    rk.forEach(function (r, i) {
      var tr = document.createElement('tr');
      if (r.code === state.playerFaction) tr.className = 'me';
      [String(i + 1), r.name, r.killed.toFixed(1) + 'M', r.casualties.toFixed(1) + 'M']
        .forEach(function (t) {
          var td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
        });
      var sc = document.createElement('td');
      sc.className = 'sc';
      sc.textContent = (r.score >= 0 ? '+' : '') + r.score.toFixed(1);
      sc.style.color = r.score >= 0 ? 'var(--cyan)' : 'var(--red)';
      tr.appendChild(sc);
      el.ovBody.appendChild(tr);
    });
    el.over.classList.add('show');
  }

  /* ───────────────────────── 每帧 ───────────────────────── */

  function update(state) {
    cur = state;
    updateTop(state);
    updateFactions(state);
    updateCities(state);
    updateCard(state);
    updateWarBar(state);
    if (state.phase === 'over') showOver(state);
  }

  // 指令被拒（射不到 / 没弹了）时的抖一下，代替弹窗
  function deny() {
    if (!el.warbar) return;
    el.warbar.classList.remove('deny');
    void el.warbar.offsetWidth;          // 强制回流，让动画可以连续触发
    el.warbar.classList.add('deny');
  }

  DC.ui = {
    init: init,
    update: update,
    buildCityList: buildCityList,
    showOver: showOver,
    deny: deny,
    el: el
  };

})(typeof window !== 'undefined' ? window : globalThis);
