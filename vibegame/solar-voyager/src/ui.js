// 星航者 · DOM 渲染层
(function (global) {
  'use strict';

  var SV = global.SV, U = SV.util, V = SV.vfx, H = SV.helpers;
  var UI = SV.ui = {};
  var doc = global.document;

  function $(id) { return doc.getElementById(id); }
  UI.$ = $;

  var EL = UI.el = {};
  [
    'screenStart', 'startCanvas', 'btnBegin', 'startHint',
    'baseName', 'baseNameTxt', 'turn', 'rMetal', 'rFuel', 'rResearch', 'rFood', 'rM', 'rF', 'rS', 'rFD',
    'rTi', 'rHe', 'rIce', 'rRT', 'rRH', 'rRI',
    'taskbar', 'taskTxt', 'baseCap', 'alloc', 'popHint', 'produceTxt', 'foodBar', 'builds',
    'designCanvas', 'designCap', 'slots', 'calc', 'capHint', 'verdict', 'verdictTxt', 'savedList',
    'launchPick', 'targetList', 'brief', 'briefSec', 'fuelHint',
    'questList', 'questHint', 'achGrid', 'achHint', 'baseList', 'logList',
    'modal', 'sheet', 'toast', 'toastT', 'toastD', 'toastBtn',
    'coach', 'coachT', 'coachD', 'coachX', 'tabBadge'
  ].forEach(function (k) { EL[k] = $(k); });

  // ------------------------------------------------------------
  // 数字滚动 / 飘字 / 涟漪
  // ------------------------------------------------------------
  UI.setNum = function (el, v) {
    var to = Math.round(v);
    var from = el._v === undefined ? to : el._v;
    if (from === to) { el.textContent = to; return; }
    el._v = to;
    var t0 = global.performance.now(), dur = 480 + Math.min(420, Math.abs(to - from) * 3);
    if (el._raf) global.cancelAnimationFrame(el._raf);
    function step(now) {
      var k = U.clamp((now - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(U.lerp(from, to, e));
      if (k < 1) el._raf = global.requestAnimationFrame(step);
      else { el._raf = null; el.textContent = to; }
    }
    el._raf = global.requestAnimationFrame(step);
  };

  UI.fly = function (host, txt, color) {
    var s = doc.createElement('div');
    s.className = 'fly'; s.textContent = txt; s.style.color = color || '#fff';
    host.appendChild(s);
    global.setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1080);
  };

  doc.addEventListener('pointerdown', function (e) {
    var b = e.target.closest ? e.target.closest('.btn, .btn-main, .btn-sub, .opt, .tnode') : null;
    if (!b) return;
    var r = b.getBoundingClientRect();
    var d = Math.max(r.width, r.height) * 2.1;
    var s = doc.createElement('span');
    s.className = 'ripple';
    s.style.width = d + 'px'; s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left) + 'px';
    s.style.top = (e.clientY - r.top) + 'px';
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.appendChild(s);
    global.setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 560);
  }, true);

  // ------------------------------------------------------------
  // 顶栏
  // ------------------------------------------------------------
  // 稀有资源小标签：rid + 数量
  UI.rareChip = function (rid, n) {
    var r = SV.rareById(rid);
    if (!r) return '';
    return '<span class="rchip ' + r.css + '"><i></i>' + r.name + (n === undefined || n === null ? '' : ' ' + n) + '</span>';
  };

  UI.renderTop = function (s, delta) {
    EL.baseName.classList.toggle('multi', U.keys(s.bases).length > 1);
    EL.baseNameTxt.textContent = (SV.planetById(s.base) || { name: '地球' }).name + '基地';
    EL.turn.textContent = s.turn;
    delta = delta || {};
    var map = [
      { el: EL.rMetal, host: EL.rM, k: 'metal', v: s.res.metal, c: '#e6ecf8' },
      { el: EL.rResearch, host: EL.rS, k: 'research', v: s.res.research, c: '#c39cff' },
      { el: EL.rFuel, host: EL.rF, k: 'fuel', v: s.res.fuel, c: '#8fd8ff' },
      { el: EL.rFood, host: EL.rFD, k: 'food', v: s.res.food, c: '#a8e060' }
    ];
    for (var i = 0; i < map.length; i++) {
      var m = map[i];
      UI.setNum(m.el, m.v);
      var d = delta[m.k];
      if (d) {
        m.host.classList.remove('bump');
        void m.host.offsetWidth;
        m.host.classList.add('bump');
        UI.fly(m.host, U.sign(d), d > 0 ? '#9df0c0' : '#ff9a9a');
      }
    }
    // 稀有资源（只能远征带回，不参与回合产出）
    var rm = [
      { el: EL.rTi, host: EL.rRT, k: 'ti' },
      { el: EL.rHe, host: EL.rRH, k: 'he' },
      { el: EL.rIce, host: EL.rRI, k: 'ice' }
    ];
    for (var j = 0; j < rm.length; j++) {
      UI.setNum(rm[j].el, (s.rare && s.rare[rm[j].k]) || 0);
      var dr = delta[rm[j].k];
      if (dr) {
        rm[j].host.classList.remove('bump');
        void rm[j].host.offsetWidth;
        rm[j].host.classList.add('bump');
        UI.fly(rm[j].host, U.sign(dr), dr > 0 ? '#9df0c0' : '#ff9a9a');
      }
    }
  };

  // ------------------------------------------------------------
  // 任务条
  // ------------------------------------------------------------
  UI.renderTaskbar = function (s) {
    var cur = null;
    for (var i = 0; i < SV.MISSIONS.length; i++) {
      if (s.done.indexOf(SV.MISSIONS[i].id) < 0) { cur = SV.MISSIONS[i]; break; }
    }
    if (!cur) {
      EL.taskbar.className = 'taskbar done';
      EL.taskTxt.innerHTML = '<b>全部目标已达成</b><span class="tb-p">星海已无远方可去，继续经营你的星域吧</span>';
      return;
    }
    var done = cur.check(s);
    EL.taskbar.className = 'taskbar' + (done ? ' done' : '');
    EL.taskTxt.innerHTML = '<b>' + cur.name + '</b> · ' + cur.desc +
      '<span class="tb-p">' + (done ? '已达成 — 前往「档案」领取奖励' : '奖励：' + cur.rewardTxt) + '</span>';
  };

  // ------------------------------------------------------------
  // 基地面板
  // ------------------------------------------------------------
  UI.renderBase = function (s) {
    var pl = SV.planetById(s.base);
    EL.baseCap.textContent = pl.name + ' · ' + (pl.canBase ? '表面基地' : '临时营地');

    // 人力
    var max = H.popMax(s);
    var p = H.curBase(s).pop;
    var total = H.popTotal(s); // 汇总必须走 JOBS 遍历，写死三个岗位会漏掉农业岗
    EL.popHint.textContent = '在岗 ' + total + ' / ' + max + ' 人';

    EL.alloc.innerHTML = '';
    for (var i = 0; i < SV.JOBS.length; i++) {
      var job = SV.JOBS[i];
      var cap = H.jobCap(s, job.key);
      var n = p[job.key];
      var off = cap === 0;
      var row = doc.createElement('div');
      row.className = 'a ' + job.key + (off ? ' off' : '');
      row.innerHTML =
        '<div class="lbl">' + job.label + '<i>' + (off ? '未解锁' : job.hint) + '</i></div>' +
        '<div class="bar" data-job="' + job.key + '"><div class="fill"></div></div>' +
        '<div class="n num">' + n + '</div>';
      var bar = row.querySelector('.bar');
      var fill = bar.querySelector('.fill');
      fill.style.width = (off ? 0 : U.clamp(n / Math.max(1, cap), 0, 1) * 100) + '%';
      // 岗位位刻度
      if (cap > 1) {
        for (var t = 1; t < cap; t++) {
          var tick = doc.createElement('div');
          tick.style.cssText = 'position:absolute;left:' + (t / cap * 100) + '%;top:0;bottom:0;width:1px;background:rgba(0,0,0,.35)';
          bar.appendChild(tick);
        }
      }
      if (!off) bindDrag(bar, job.key, cap, max);
      EL.alloc.appendChild(row);
    }

    var pr = H.produce(s);
    var need = H.foodNeed(s);
    var net = H.foodNet(s);
    EL.produceTxt.textContent = U.fmt(pr.metal) + ' 金属 · ' + U.fmt(pr.research) + ' 科研 · ' + U.fmt(pr.fuel) + ' 燃料';

    // 口粮收支条：养不起人时提前红色预警，不用等推进回合才发现
    if (EL.foodBar) {
      var short = net < 0;
      EL.foodBar.className = 'food-bar' + (short ? ' short' : '');
      EL.foodBar.innerHTML =
        '<span class="fb-l">口粮收支</span>' +
        '<span class="fb-v">' + U.sign(net) + '<i>／回合</i></span>' +
        '<span class="fb-d">产出 ' + U.fmt(pr.food) + ' · 在岗 ' + H.popTotal(s) + ' 人吃掉 ' + U.fmt(need) + '</span>' +
        (short ? '<span class="fb-w">收成不够，推进回合会全基地减产 — 调人去农业岗或建水培舱</span>' : '');
    }

    // 建筑（造价随同类型已建数量递增）
    EL.builds.innerHTML = '';
    for (var b = 0; b < SV.BUILDINGS.length; b++) {
      (function (bd) {
        var cnt = H.curBase(s).built[bd.id] || 0;
        var cost = SV.buildCost(s, bd);
        var locked = !!bd.tech && !H.hasTech(s, bd.tech);
        var can = !locked && s.res.metal >= cost;
        var d = doc.createElement('div'); d.className = 'build-item';
        d.innerHTML =
          '<div class="bi-l"><div class="bi-n">' + bd.name + '<em>×' + cnt + '</em></div>' +
          '<div class="bi-d">' + bd.desc + (cnt > 0 ? '<i class="bi-x">下一座 ×' + SV.BUILD_STEP.toFixed(2) + ' 造价</i>' : '') + '</div></div>';
        var btn = doc.createElement('button');
        btn.className = 'btn sm ' + (can ? 'gold' : 'ghost');
        btn.textContent = locked ? '需「' + SV.techName(bd.tech) + '」' : cost + ' 金属';
        btn.disabled = !can;
        btn.addEventListener('click', function () { SV.game.build(bd.id); });
        d.appendChild(btn);
        EL.builds.appendChild(d);
      })(SV.BUILDINGS[b]);
    }
  };

  function bindDrag(bar, job, cap, max) {
    var dragging = false, pid = -1;
    function set(e) {
      var s = SV.store.state;
      var r = bar.getBoundingClientRect();
      var f = U.clamp((e.clientX - r.left) / r.width, 0, 1);
      var lim = Math.min(cap, H.popMax(s));
      var n = Math.round(f * lim);
      if (n === H.curBase(s).pop[job]) return;
      H.setJob(s, job, n);
      SV.sfx.tick();
      SV.game.refresh();
    }
    bar.addEventListener('pointerdown', function (e) {
      dragging = true; pid = e.pointerId; set(e);
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    });
    bar.addEventListener('pointermove', function (e) { if (dragging && e.pointerId === pid) set(e); });
    function up() { dragging = false; }
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  }

  // ------------------------------------------------------------
  // 设计面板
  // ------------------------------------------------------------
  UI.renderDesign = function (s) {
    var d = s.design;
    var c = SV.calcDesign(d, s);
    var cap = c.cap;
    EL.capHint.textContent = '挂载 ' + d.tanks.length + '/' + cap.t + ' 罐 · ' +
      d.engines.length + '/' + cap.e + ' 引擎 · ' + (d.boosters ? d.boosters.length : 0) + '/' + (cap.b || 0) + ' 助推 · ' + (d.payloads ? d.payloads.length : 0) + '/' + cap.p + ' 载荷';

    EL.slots.innerHTML = '';
    var defs = [
      { key: 'pod', label: '舱体', tip: '决定挂载位、护盾与燃料容量' },
      { key: 'tank', label: '燃料罐', tip: '可叠加 ' + cap.t + ' 个 · 舱体上燃料 ' + (c.fuelCap || '—') },
      { key: 'engine', label: '引擎', tip: '可并联 ' + cap.e + ' 台 · 推力越大越费油' },
      { key: 'booster', label: '助推器', tip: '侧挂固体助推 · 可挂 ' + (cap.b || 0) + ' 个，大推力但拉低燃效' },
      { key: 'payload', label: '载荷', tip: '互斥 · 可装 ' + cap.p + ' 件，每件都算死重' }
    ];
    for (var i = 0; i < defs.length; i++) {
      EL.slots.appendChild(buildSlot(s, d, defs[i], cap));
    }

    // 参数（航程与飞行消耗同一套模型，所以这里显示的就是真实可飞距离）
    var minTwr = SV.minTwrFor(SV.planetById(s.base).haz);
    var cells = [
      ['总质量', U.fmt(c.mass) + ' t', ''],
      ['推力', U.fmt(c.thrust), ''],
      ['推重比', c.twr.toFixed(2), c.twr >= 1.2 ? 'ok' : 'bad'],
      ['平均燃效', '×' + c.avgEff.toFixed(2), c.avgEff >= 1 ? 'ok' : ''],
      ['燃料', U.fmt(c.fuel) + ' / ' + (c.fuelCap || '—'), c.fuel > c.fuelCap ? 'bad' : ''],
      ['航程', U.fmt(c.range), c.range > 0 ? 'ok' : 'bad'],
      ['护盾', c.shield + ' 层', c.shield > 0 ? 'ok' : ''],
      ['造价', U.fmt(c.cost) + ' 金属', s.res.metal >= c.cost ? '' : 'bad']
    ];
    EL.calc.innerHTML = '';
    for (var k = 0; k < cells.length; k++) {
      var cc = doc.createElement('div');
      cc.className = 'c ' + cells[k][2];
      cc.innerHTML = '<div class="l">' + cells[k][0] + '</div><div class="v num">' + cells[k][1] + '</div>';
      EL.calc.appendChild(cc);
    }

    // 已装备载荷的作用说明（没装备则不显示）
    var plOn = d.payloads || [];
    if (plOn.length) {
      var plRow = doc.createElement('div');
      plRow.className = 'c payload-sum';
      plRow.innerHTML = '<div class="l">载荷效果</div><div class="v">' +
        plOn.map(function (id) { var P = SV.PARTS[id]; return P.name + '：' + P.desc; }).join('<br>') + '</div>';
      EL.calc.appendChild(plRow);
    }

    var boost = [];
    if (H.hasTech(s, 't11')) boost.push('超导航程 +25%');
    if (H.hasTech(s, 't12')) boost.push('离子推力 +18%');
    if (c.overload > 0) boost.push('过载 ×' + c.overload + '：护盾 −' + c.overload +
      '、航程 −' + Math.round((1 - Math.pow(1 - SV.OVERLOAD_FLOW, c.overload)) * 100) + '%');
    var boostTxt = boost.length ? '<i class="v-boost">' + boost.join(' · ') + '</i>' : '';
    if (c.canFly) {
      EL.verdict.className = 'verdict v-ok';
      EL.verdictTxt.innerHTML = '可以起飞 · 起飞耗 ' + U.fmt(c.takeoff) +
        ' 燃料，加满可飞航程 ' + U.fmt(c.range) +
        '（本星线最低推重比 ' + minTwr.toFixed(1) + '）' + boostTxt;
    } else {
      EL.verdict.className = 'verdict v-bad';
      EL.verdictTxt.innerHTML = c.problems.join('；');
    }

    // 已保存
    renderSavedInto(EL.savedList, s, true);
  };

  function buildSlot(s, d, def, cap) {
    var wrap = doc.createElement('div');
    wrap.className = 'slot';
    var ps = d.payloads || [];
    var cur = def.key === 'pod' ? d.pod : null;
    var curName = '未装备';
    if (def.key === 'pod') curName = SV.PARTS[d.pod].name;
    else if (def.key === 'payload') curName = ps.length ? ps.map(function (p) { return SV.PARTS[p].name; }).join(' + ') : '未装备';
    else if (def.key === 'tank') curName = d.tanks.length ? d.tanks.map(function (t) { return SV.PARTS[t].name.replace('燃料罐', ''); }).join('+') + '罐' : '未装备';
    else if (def.key === 'engine') curName = d.engines.length ? d.engines.map(function (t) { return SV.PARTS[t].name.replace('推力引擎', ''); }).join('+') + '引擎' : '未装备';
    else if (def.key === 'booster') curName = (d.boosters && d.boosters.length) ? d.boosters.map(function (t) { return SV.PARTS[t].name.replace('助推器', ''); }).join('+') + '助推' : '未装备';

    var head = doc.createElement('div');
    head.className = 'sl-head';
    head.innerHTML = '<div class="sl-t">' + def.label + '<i>' + def.tip + '</i></div>' +
      '<div class="sl-p' + (cur || (def.key === 'tank' && d.tanks.length) || (def.key === 'engine' && d.engines.length) || (def.key === 'booster' && d.boosters && d.boosters.length) || (def.key === 'payload' && ps.length) ? '' : ' empty') + '">' + curName + '</div>';
    wrap.appendChild(head);

    var pick = doc.createElement('div');
    pick.className = 'pick' + (def.key === 'payload' ? ' multi' : '');
    // 载荷按固定顺序展示，保证互斥选择时位置稳定
    var ids = def.key === 'payload' ? SV.PAYLOADS.slice() : SV.partsOf(def.key);
    for (var j = 0; j < ids.length; j++) {
      (function (pid) {
        var P = SV.PARTS[pid];
        var locked = !H.hasTech(s, P.tech);
        var opt = doc.createElement('div');
        opt.className = 'opt' + (locked ? ' lock' : '');
        var on = false;
        if (def.key === 'pod') on = d.pod === pid;
        else if (def.key === 'payload') on = ps.indexOf(pid) >= 0;
        else if (def.key === 'tank') on = d.tanks.indexOf(pid) >= 0;
        else if (def.key === 'engine') on = d.engines.indexOf(pid) >= 0;
        else if (def.key === 'booster') on = (d.boosters || []).indexOf(pid) >= 0;
        if (on) opt.className += ' on';
        // 载荷显示质量，因为「占一个载荷位 + 多少吨」才是真正的取舍
        opt.innerHTML = P.name + '<em class="opt-m">' + P.mass + 't</em>' + (locked ? '<span class="lk">🔒</span>' : '');
        opt.addEventListener('click', function () {
          if (locked) { SV.sfx.deny(); UI.toast('尚未解锁', '需在科技树中解锁「' + SV.techName(P.tech) + '」', 'info'); return; }
          SV.game.togglePart(def.key, pid);
        });
        pick.appendChild(opt);
      })(ids[j]);
    }
    if (def.key === 'tank' && d.tanks.length) pick.appendChild(clearBtn('清空', function () { SV.game.togglePart('tank', null); }));
    if (def.key === 'engine' && d.engines.length) pick.appendChild(clearBtn('清空', function () { SV.game.togglePart('engine', null); }));
    if (def.key === 'booster' && d.boosters && d.boosters.length) pick.appendChild(clearBtn('清空', function () { SV.game.togglePart('booster', null); }));
    wrap.appendChild(pick);
    return wrap;
  }
  function clearBtn(txt, fn) {
    var b = doc.createElement('div');
    b.className = 'opt on'; b.textContent = txt;
    b.addEventListener('click', fn);
    return b;
  }

  function renderSavedInto(host, s, withDel) {
    host.innerHTML = '';
    if (!s.saved.length) {
      host.innerHTML = '<div class="empty-tip">还没有保存的设计<br>装一架能飞的火箭，点下方「保存设计」</div>';
      return;
    }
    for (var i = 0; i < s.saved.length; i++) {
      (function (idx) {
        var sv = s.saved[idx];
        var c = SV.calcDesign(sv, s);
        var d = doc.createElement('div');
        d.className = 'saved-item' + (s.launchDesign === idx ? ' on' : '');
        d.innerHTML = '<div class="si-l"><div class="si-n">' + sv.name + '</div>' +
          '<div class="si-d">推重比 ' + c.twr.toFixed(1) + ' · 航程 ' + U.fmt(c.range) + ' · 燃料 ' + U.fmt(c.fuel) + ' · 护盾 ' + c.shield + '</div></div>';
        if (withDel) {
          var del = doc.createElement('button');
          del.className = 'btn sm ghost'; del.textContent = '删';
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            SV.game.deleteDesign(idx);
          });
          d.appendChild(del);
        }
        d.addEventListener('click', function () { SV.game.pickDesign(idx); });
        host.appendChild(d);
      })(i);
    }
  }

  // ------------------------------------------------------------
  // 发射面板
  // ------------------------------------------------------------
  UI.renderLaunch = function (s) {
    EL.fuelHint.textContent = '基地燃料 ' + U.fmt(s.res.fuel);
    renderSavedInto(EL.launchPick, s, false);

    EL.targetList.innerHTML = '';
    var from = SV.planetById(s.base);
    for (var i = 0; i < SV.PLANETS.length; i++) {
      (function (pl) {
        if (pl.id === s.base) return;
        var unlocked = H.planetUnlocked(s, pl);
        var hasBase = !!s.bases[pl.id];
        var d = doc.createElement('div');
        d.className = 't' + (s.launchTarget === pl.id ? ' on' : '') + (unlocked ? '' : ' lock');
        var ti = doc.createElement('div');
        if (pl.kind === 'belt') {
          // 碎块带：散布的碎石，不是一颗球
          ti.className = 'ti belt';
          ti.style.background =
            'radial-gradient(circle at 27% 60%, #8b7b5d 0 13%, transparent 13.5%),' +
            'radial-gradient(circle at 57% 28%, #b3a386 0 10.5%, transparent 11%),' +
            'radial-gradient(circle at 74% 65%, #6d6150 0 8.5%, transparent 9%),' +
            'radial-gradient(circle at 41% 36%, #7f7360 0 5.5%, transparent 6%),' +
            'radial-gradient(circle at 85% 43%, #9a8c6f 0 4.5%, transparent 5%),' +
            'radial-gradient(circle at 17% 33%, #5d5344 0 4%, transparent 4.5%),' +
            'radial-gradient(circle at 63% 82%, #7a6f5a 0 3.5%, transparent 4%),' +
            'linear-gradient(155deg, rgba(96,86,66,.34), rgba(14,13,11,.62))';
        } else {
          ti.className = 'ti';
          ti.style.background = 'radial-gradient(circle at 34% 28%, ' + V.lighten(pl.color, 0.32) + ', ' + pl.color + ' 62%, ' + pl.dark + ')';
        }
        var tt = doc.createElement('div');
        tt.className = 'tt';
        var haz = '';
        for (var q = 0; q < 3; q++) haz += '<i class="' + (q < pl.haz ? 'on' : '') + '"></i>';
        var gap = Math.abs(pl.dist - from.dist);
        var why = '';
        if (!unlocked) {
          why = '需「' + SV.techName(pl.tech) + '」' + (pl.needBase && !s.bases[pl.needBase] ? ' + 木卫基地' : '');
        }
        var rv = '';
        if (pl.rare) {
          var first = s.arrived.indexOf(pl.id) < 0;
          rv = UI.rareChip(pl.rare.id, '+' + (first ? pl.rare.first : pl.rare.per));
        }
        tt.innerHTML = '<div class="tn">' + pl.name + (hasBase ? '<span class="tag">已建基地</span>' : '') + '</div>' +
          '<div class="td">航段 ' + gap + ' · ' + pl.yield + ' <span class="haz">' + haz + '</span>' + (why ? ' · ' + why : '') + '</div>' +
          (rv ? '<div class="td-rare">' + rv + (s.arrived.indexOf(pl.id) < 0 ? '<i>首次勘探</i>' : '<i>例行采样</i>') + '</div>' : '');
        d.appendChild(ti); d.appendChild(tt);
        if (unlocked) d.addEventListener('click', function () { SV.game.pickTarget(pl.id); });
        else d.addEventListener('click', function () { SV.sfx.deny(); UI.toast('航线未开通', why, 'info'); });
        EL.targetList.appendChild(d);
      })(SV.PLANETS[i]);
    }

    // 简报
    var sv = s.saved[s.launchDesign];
    var pl2 = s.launchTarget ? SV.planetById(s.launchTarget) : null;
    if (sv && pl2) {
      var c = SV.calcDesign(sv, s);
      var gap = Math.abs(pl2.dist - from.dist);
      var rows = [
        ['目标', pl2.name, ''],
        ['航段距离', String(gap), c.range >= gap ? 'ok' : 'bad'],
        ['火箭航程', U.fmt(c.range), c.range >= gap ? 'ok' : 'bad'],
        ['装填燃料', U.fmt(c.fuel) + ' / 库存 ' + U.fmt(s.res.fuel), s.res.fuel >= c.fuel ? 'ok' : 'bad'],
        ['推重比', c.twr.toFixed(2), c.twr >= 1.2 ? 'ok' : 'bad'],
        ['预计飞行', Math.round(12 + gap * 0.085) + ' 秒', '']
      ];
      EL.brief.innerHTML = '';
      for (var k = 0; k < rows.length; k++) {
        var r = doc.createElement('div');
        r.className = 'br';
        r.innerHTML = '<span class="k">' + rows[k][0] + '</span><span class="v ' + rows[k][2] + '">' + rows[k][1] + '</span>';
        EL.brief.appendChild(r);
      }
      EL.briefSec.style.display = '';
    } else {
      EL.briefSec.style.display = 'none';
    }

    // 发射按钮状态可见（保持可点，点击后给出具体原因）
    var btn = $('btnLaunch');
    if (btn) {
      var ready = !!(sv && pl2);
      btn.style.opacity = ready ? '1' : '0.55';
      btn.textContent = ready ? ('点火发射 · 前往 ' + pl2.name) : '点火发射';
    }
  };

  // ------------------------------------------------------------
  // 档案面板
  // ------------------------------------------------------------
  UI.renderLog = function (s) {
    // 任务
    var doneN = 0;
    EL.questList.innerHTML = '';
    for (var i = 0; i < SV.MISSIONS.length; i++) {
      (function (m, idx) {
        var isDone = s.done.indexOf(m.id) >= 0;
        var ready = m.check(s) && !isDone;
        var isCur = !isDone && (ready || idx === firstUndoneIdx(s));
        if (isDone) doneN++;
        var d = doc.createElement('div');
        d.className = 'quest-item ' + (isDone ? 'done' : (isCur ? 'cur' : ''));
        d.innerHTML = '<div class="qi-d"></div><div class="qi-b">' +
          '<div class="qi-t">' + m.name + '</div>' +
          '<div class="qi-d2">' + m.desc + '</div>' +
          '<div class="qi-r">' + (isDone ? '已完成 · ' + m.rewardTxt : (ready ? '可领取 · ' + m.rewardTxt : '奖励 ' + m.rewardTxt)) + '</div></div>';
        if (ready) d.addEventListener('click', function () { SV.game.claimMission(m.id); });
        EL.questList.appendChild(d);
      })(SV.MISSIONS[i], i);
    }
    EL.questHint.textContent = doneN + ' / ' + SV.MISSIONS.length + ' 完成';
    EL.tabBadge.style.display = hasClaimable(s) ? '' : 'none';

    // 成就
    EL.achGrid.innerHTML = '';
    var got = 0;
    for (var a = 0; a < SV.ACH.length; a++) {
      var ac = SV.ACH[a];
      var on = s.ach.indexOf(ac.id) >= 0;
      if (on) got++;
      var d2 = doc.createElement('div');
      d2.className = 'ach' + (on ? ' got' : '');
      d2.innerHTML = '<div class="ai">' + ac.ic + '</div><div class="an">' + (on ? ac.name : '???') + '</div>';
      EL.achGrid.appendChild(d2);
    }
    EL.achHint.textContent = got + ' / ' + SV.ACH.length;

    // 基地
    EL.baseList.innerHTML = '';
    var keys = U.keys(s.bases);
    for (let b = 0; b < keys.length; b++) {
      var pl = SV.planetById(keys[b]);
      var bb = s.bases[keys[b]];
      var n = (bb.built.mine || 0) + (bb.built.lab || 0) + (bb.built.refinery || 0) + (bb.built.hab || 0);
      var popSum = 0;
      for (var pj = 0; pj < SV.JOBS.length; pj++) popSum += (bb.pop[SV.JOBS[pj].key] || 0);
      var cur = keys[b] === s.base;
      var d3 = doc.createElement('div');
      d3.className = 'saved-item' + (cur ? ' on' : '');
      d3.innerHTML = '<div class="si-l"><div class="si-n">' + pl.name + '基地' + (cur ? ' <span class="si-cur">当前</span>' : '') + '</div>' +
        '<div class="si-d">' + pl.yield + ' · ' + n + ' 座设施 · 人口 ' + popSum + '</div></div>';
      if (!cur) {
        var btn = doc.createElement('button');
        btn.className = 'btn sm pri'; btn.textContent = '前往';
        btn.addEventListener('click', function () { SV.game.switchBase(keys[b]); });
        d3.appendChild(btn);
      }
      EL.baseList.appendChild(d3);
    }

    // 日志
    EL.logList.innerHTML = '';
    if (!s.log.length) EL.logList.innerHTML = '<div class="empty-tip">航行日志还是空的</div>';
    for (var L = s.log.length - 1; L >= 0 && L >= s.log.length - 45; L--) {
      var lg = s.log[L];
      var d4 = doc.createElement('div');
      d4.className = 'log ' + (lg.k || '');
      d4.innerHTML = '<div class="lt">T' + lg.t + '</div><div class="lx">' + lg.x + '</div>';
      EL.logList.appendChild(d4);
    }
  };
  function firstUndoneIdx(s) {
    for (var i = 0; i < SV.MISSIONS.length; i++) if (s.done.indexOf(SV.MISSIONS[i].id) < 0) return i;
    return 0;
  }
  function hasClaimable(s) {
    for (var i = 0; i < SV.MISSIONS.length; i++) {
      var m = SV.MISSIONS[i];
      if (s.done.indexOf(m.id) < 0 && m.check(s)) return true;
    }
    return false;
  }
  UI.hasClaimable = hasClaimable;

  // ------------------------------------------------------------
  // 科技地图
  // ------------------------------------------------------------
  UI.openTech = function (s) {
    // 层数由科技表的最大 lv 推导，不要在加节点时忘记同步这个常量
    var levels = 0;
    for (var ti = 0; ti < SV.TECH.length; ti++) levels = Math.max(levels, SV.TECH[ti].lv + 1);
    var nodeH = 46, rowH = 76;
    var html = '<h2>科技树</h2><div class="sub">科研点 + 稀有资源 · 稀有资源只能成功飞抵对应星球带回，基地里产不出</div>' +
      '<div class="techmap" id="techmap"><canvas id="techCanvas"></canvas></div>' +
      '<div class="tech-info" id="techInfo">—</div>' +
      '<div class="modal-actions"><button class="btn ghost" id="techClose">关闭</button></div>';
    EL.sheet.innerHTML = html;
    EL.modal.classList.add('on');

    var map = $('techmap');
    var W = map.clientWidth || 360;
    map.style.height = (levels * rowH) + 'px';
    var cv = $('techCanvas'), cx = cv.getContext('2d');
    V.fit(cv, cx);
    var size = V.fit(cv, cx);
    W = size.w;

    // 层内节点
    var byLv = [];
    for (var i = 0; i < levels; i++) byLv.push([]);
    for (var t = 0; t < SV.TECH.length; t++) byLv[SV.TECH[t].lv].push(SV.TECH[t]);

    var pos = {};
    var nodes = [];
    for (var lv = 0; lv < levels; lv++) {
      var arr = byLv[lv];
      for (var k = 0; k < arr.length; k++) {
        var nw = 84;
        var left = arr.length === 1 ? (W - nw) / 2 : (k + 0.5) / arr.length * (W - nw - 8) + 4;
        var top = lv * rowH + 8;
        pos[arr[k].id] = { x: left, y: top, w: nw, h: nodeH };
        nodes.push({ t: arr[k], p: pos[arr[k].id] });
      }
    }

    // 连线
    cx.clearRect(0, 0, size.w, size.h);
    for (var q = 0; q < SV.TECH.length; q++) {
      var tc = SV.TECH[q];
      for (var dp = 0; dp < tc.deps.length; dp++) {
        var a = pos[tc.deps[dp]], b = pos[tc.id];
        if (!a || !b) continue;
        var lit = H.hasTech(s, tc.deps[dp]);
        var lit2 = H.hasTech(s, tc.id);
        cx.strokeStyle = lit2 ? 'rgba(110,224,160,.55)' : (lit ? 'rgba(127,208,255,.42)' : 'rgba(150,180,255,.13)');
        cx.lineWidth = lit2 ? 2 : 1.4;
        cx.beginPath();
        cx.moveTo(a.x + a.w / 2, a.y + a.h);
        cx.bezierCurveTo(a.x + a.w / 2, a.y + a.h + 16, b.x + b.w / 2, b.y - 16, b.x + b.w / 2, b.y);
        cx.stroke();
      }
    }

    // 节点
    var info = $('techInfo');

    // 节点上的稀有资源小标
    function nodeRare(t) {
      var rl = H.techRare(s, t);
      if (!rl.length) return '';
      var done = H.hasTech(s, t.id);
      return '<div class="tnr">' + rl.map(function (x) {
        var r = SV.rareById(x.id);
        return '<span class="rn ' + r.css + (x.lack && !done ? ' lack' : '') + '"><i></i>' +
          (done ? x.need : (x.have + '/' + x.need)) + '</span>';
      }).join('') + '</div>';
    }
    // 信息面板上的稀有资源明细
    function infoRare(t) {
      var rl = H.techRare(s, t);
      if (!rl.length) return '';
      return '<div class="ti-rare">' + rl.map(function (x) {
        var r = SV.rareById(x.id);
        return '<span class="rchip ' + r.css + (x.lack ? ' lack' : '') + '"><i></i>' +
          r.name + ' ' + x.have + '/' + x.need + '</span>' +
          (x.lack ? '<i class="ti-from">产自 ' + r.from + '</i>' : '');
      }).join('') + '</div>';
    }

    function showInfo(t) {
      var done = H.hasTech(s, t.id);
      var depsOk = H.techDepsOk(s, t);
      var lack = H.techLack(s, t);
      var afford = s.res.research >= t.cost;
      var st = done ? '<span style="color:var(--green)">已掌握</span>'
        : (!depsOk ? '<span style="color:var(--dim)">前置未满足：' + t.deps.map(SV.techName).join('、') + '</span>'
          : (!afford ? '<span style="color:var(--warm)">科研不足，还差 ' + U.fmt(t.cost - s.res.research) + '</span>'
            : (lack.length ? '<span style="color:var(--warm)">稀有资源不足：' + H.techLackText(s, t) + '</span>'
              : '<span style="color:var(--cyan)">可解锁</span>')));
      info.innerHTML = '<b>' + t.name + '</b> · ' + t.cost + ' 科研 · ' + st +
        infoRare(t) + '<br>' + t.desc;
    }
    for (var m2 = 0; m2 < nodes.length; m2++) {
      (function (nd) {
        var t = nd.t, p = nd.p;
        var done = H.hasTech(s, t.id);
        var depsOk = H.techDepsOk(s, t);
        var lack = H.techLack(s, t);
        var ready = H.techReady(s, t);
        var cls = done ? 'done' : (!depsOk ? 'lock' : (ready ? 'avail' : 'avail short'));
        var el = doc.createElement('div');
        el.className = 'tnode ' + cls;
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.width = p.w + 'px'; el.style.minHeight = p.h + 'px';
        el.innerHTML = '<div class="tnn">' + t.name + '</div><div class="tnc">' + (done ? '✓ 已掌握' : t.cost + ' 科研') + '</div>' + nodeRare(t);
        el.addEventListener('click', function () {
          if (done) { showInfo(t); return; }
          if (!depsOk) { showInfo(t); UI.toast('前置未满足', '需先解锁「' + t.deps.map(SV.techName).join('、') + '」', 'info'); return; }
          if (s.res.research < t.cost) { showInfo(t); UI.toast('科研不足', '还差 ' + U.fmt(t.cost - s.res.research) + ' 点', 'info'); return; }
          if (lack.length) {
            showInfo(t);
            var from = lack.map(function (l) { return SV.rareById(l.id).name + ' → ' + SV.rareById(l.id).from; }).join('；');
            UI.toast('稀有资源不足', H.techLackText(s, t) + '。基地里产不出这些原料，只有成功飞抵后带回：' + from, 'bad');
            return;
          }
          SV.game.unlockTech(t.id);
        });
        map.appendChild(el);
      })(nodes[m2]);
    }
    showInfo(nextTech(s) || SV.TECH[0]);
    $('techClose').addEventListener('click', SV.ui.closeModal);
  };
  function nextTech(s) {
    var i, t;
    // 优先推荐「现在就能点」的节点，其次才是只差资源/科研的
    for (i = 0; i < SV.TECH.length; i++) {
      t = SV.TECH[i];
      if (H.techReady(s, t)) return t;
    }
    for (i = 0; i < SV.TECH.length; i++) {
      t = SV.TECH[i];
      if (H.hasTech(s, t.id)) continue;
      if (H.techDepsOk(s, t)) return t;
    }
    return null;
  }

  UI.openBaseSwitch = function (s) {
    var keys = U.keys(s.bases);
    var html = '<h2>切换主基地</h2><div class="sub">产出与建造都作用于当前主基地 · 点选目标即刻切换</div><div class="bs-grid">';
    for (var i = 0; i < keys.length; i++) {
      var pl = SV.planetById(keys[i]);
      var cur = keys[i] === s.base;
      html += '<div class="bs-card' + (cur ? ' cur' : '') + '" data-k="' + keys[i] + '">' +
        '<div class="bs-ic">' + (cur ? '✓' : '⌂') + '</div>' +
        '<div class="bs-info"><div class="bs-n">' + pl.name + '基地</div><div class="bs-d">' + pl.yield + '</div></div>' +
        '<div class="bs-tag">' + (cur ? '当前' : '前往') + '</div>' +
        '</div>';
    }
    html += '</div><div class="modal-actions"><button class="btn ghost" id="bsClose">关闭</button></div>';
    EL.sheet.innerHTML = html;
    EL.modal.classList.add('on');
    var ns = EL.sheet.querySelectorAll('.bs-card');
    for (var n = 0; n < ns.length; n++) {
      (function (node) {
        if (node.classList.contains('cur')) return;
        node.addEventListener('click', function () {
          SV.game.switchBase(node.getAttribute('data-k'));
          UI.closeModal();
        });
      })(ns[n]);
    }
    $('bsClose').addEventListener('click', UI.closeModal);
  };

  UI.openHelp = function () {
    EL.sheet.innerHTML =
      '<h2>玩法说明</h2><div class="sub">三段循环：经营 → 设计 → 飞行</div>' +
      '<div class="tech-info" style="min-height:0">' +
      '<b>1 · 基地</b><br>把人分配到采矿 / 科研 / 精炼 / 农业四岗。岗位位由设施数量决定，人口上限由居住舱决定。推进一回合即按当前配置产出资源，并可能触发随机事件。<br><br>' +
      '<b>2 · 设计</b><br>舱体决定挂载位（燃料罐 / 引擎 / 载荷）、护盾与<b>燃料容量上限</b>：基础舱 1/1/1 容量 45，加强舱 2/2/2 容量 170，重型舱 3/3/3 容量 400。<br>' +
      '<b>引擎</b>是推力与燃效的取舍：小引擎最省油（×1.25）但推力小，大引擎推力 165 却只有 ×0.78 燃效且造价高。多引擎并联时按平均燃效算，所以「两台大 + 一台中」往往比三台大引擎飞得更远。<br>' +
      '<b>载荷</b>互斥，每种最多装一件，每件都算死重：科学仪（航程 +15%、采晶体）、货舱（带回稀有资源 +50%）、钻探器（无基地星球金属 ×2）、装甲板（护盾 +1，但 5 吨）、导航阵列（航程 +30%）、取样臂（首访奖励 ×1.5）。<br>' +
      '推重比有<b>下限也有上限</b>：低于 1.2 起不来；高于舱体承受值则<b>过载</b>，扣护盾并损失航程。此外每条航线按危险度有<b>最低推重比要求</b>（危险度 1/2/3 分别要 1.2 / 2.1 / 3.0）——省油的小引擎推不动重装去外太阳系。<br><br>' +
      '<b>3 · 飞行</b><br>左右拖动控制火箭。途中要躲开小行星与碎片带，避开紫色引力井的横向拉扯；穿过青色加速环能提速并回一点燃料；金色燃料囊补充燃料；装有科学仪时可拾取数据晶体换科研点。护盾能硬抗撞击，耗尽即失败。<br><br>' +
      '<b>4 · 稀有资源</b><br>' +
      SV.RARE.map(function (r) {
        return '<span class="rchip ' + r.css + '"><i></i>' + r.name + '</span> ' + r.desc + '<i class="ti-from">产自 ' + r.from + '</i>';
      }).join('<br>') +
      '<br>基地里挖不出稀有资源，只能<b>成功飞抵</b>对应星球后带回——首次勘探给得多，之后每次例行采样给固定量，失败则颗粒无收。中后期的科技节点都要吃这些原料，所以「蹲在地球刷基地」是推不动科技树的。<br><br>' +
      '<b>5 · 口粮</b><br>每回合按<b>在岗人数</b>扣口粮，收成由农业岗与水培舱提供。库存加收成不够吃，当回合金属 / 科研 / 燃料产出全部减半（口粮产出不减，所以不会一路饿到崩盘）。<br>' +
      '各星球的口粮适宜度差很多：地球 ×1、木卫二与土卫六 ×1.2、火星 ×0.8、月球与金星 ×0.5、水星 ×0.4、冥王星 ×0.3。<br>' +
      '<b>木星、土星、天王星、海王星没有地表</b>，基地是悬在云顶的浮空站——科研与燃料极高，但口粮只有 ×0.3 上下，几乎全靠运补给。<b>同一个农民在水星只能养活地球上一半的人</b>，主基地往前线搬之前，先算算那地方养不养得起。<br><br>' +
      '<b>关于存档</b><br>进度自动保存在本机浏览器中。清空浏览器数据会丢失进度。</div>' +
      '<div class="modal-actions"><button class="btn pri" id="helpClose">明白了</button></div>';
    EL.modal.classList.add('on');
    $('helpClose').addEventListener('click', UI.closeModal);
  };

  // ------------------------------------------------------------
  // 弹窗 / toast / 引导
  // ------------------------------------------------------------
  UI.closeModal = function () { EL.modal.classList.remove('on'); };
  EL.modal.addEventListener('click', function (e) { if (e.target === EL.modal) UI.closeModal(); });

  var toastTimer = null, toastCb = null;
  UI.toast = function (title, desc, kind, cb) {
    EL.toastT.textContent = title;
    EL.toastD.innerHTML = desc || '';
    EL.toast.className = 'toast on ' + (kind || 'info');
    toastCb = cb || null;
    EL.toastBtn.textContent = cb ? '继续' : '知道了';
    if (toastTimer) global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { EL.toast.classList.remove('on'); }, cb ? 8000 : 3200);
  };
  EL.toastBtn.addEventListener('click', function () {
    EL.toast.classList.remove('on');
    if (toastTimer) global.clearTimeout(toastTimer);
    var cb = toastCb; toastCb = null;
    if (cb) global.setTimeout(cb, 180);
  });

  var coachTimer = null;
  UI.coach = function (title, desc, ms) {
    EL.coachT.textContent = title;
    EL.coachD.textContent = desc;
    EL.coach.classList.add('on');
    if (coachTimer) global.clearTimeout(coachTimer);
    coachTimer = global.setTimeout(function () { EL.coach.classList.remove('on'); }, ms || 5200);
  };
  UI.hideCoach = function () { EL.coach.classList.remove('on'); };
  EL.coachX.addEventListener('click', UI.hideCoach);

  // ------------------------------------------------------------
  // tab
  // ------------------------------------------------------------
  UI.switchTab = function (name) {
    var panels = { base: 'panelBase', design: 'panelDesign', launch: 'panelLaunch', log: 'panelLog' };
    for (var k in panels) {
      var el = $(panels[k]);
      if (el) el.classList.toggle('on', k === name);
    }
    var tabs = doc.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === name);
    }
    var stage = doc.querySelector('.stage');
    if (stage) stage.scrollTop = 0;
    SV.game.curTab = name;
    SV.game.refresh();
  };

})(window);
