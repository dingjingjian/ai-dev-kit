// 星航者 · 主控：状态推进 / 场景绘制 / 绑定 / 主循环
(function (global) {
  'use strict';

  var SV = global.SV, U = SV.util, V = SV.vfx, H = SV.helpers, UI = SV.ui;
  var doc = global.document;
  var $ = function (id) { return doc.getElementById(id); };

  var G = SV.game = { curTab: 'base' };
  var started = false, pendingDelta = null;
  var coachSeen = {};
  var rareCoachPending = false;

  function S() { return SV.store.state; }
  function save() { SV.store.save(); }

  // BGM 属于可选增强：即使 bgm.js 没加载，游戏也照常跑
  function bgm(key) { if (SV.bgm) SV.bgm.setScene(key); }
  // 顶栏和开始界面各有一个开关，两处状态始终同步
  function syncBgmBtn() {
    if (!SV.bgm) return;
    var e = SV.bgm.isEnabled();
    var ids = ['btnBgm', 'btnBgm2'];
    for (var i = 0; i < ids.length; i++) {
      var bb = $(ids[i]);
      if (!bb) continue;
      bb.classList.toggle('off', !e);
      bb.setAttribute('aria-label', e ? '关闭背景音乐' : '开启背景音乐');
      bb.title = e ? '背景音乐：开' : '背景音乐：关';
    }
  }
  function toggleBgm() {
    if (!SV.bgm) return;
    var s = S();
    if (!s.opts) s.opts = { bgm: true };
    s.opts.bgm = !SV.bgm.isEnabled();
    save();
    SV.bgm.setEnabled(s.opts.bgm);
    SV.sfx.click();
    // 不弹 toast：开关状态由按钮自己表达（电平条跳动 / 静止变灰），
    // 为一个可逆的小操作糊一层居中的重弹窗，代价远大于收益
    syncBgmBtn();
  }
  function bgmOn() {
    var o = S() && S().opts;
    return !o || o.bgm !== false;
  }

  // ------------------------------------------------------------
  // 刷新
  // ------------------------------------------------------------
  G.refresh = function (delta) {
    var s = S();
    if (!s) return;
    UI.renderTop(s, delta || pendingDelta);
    pendingDelta = null;
    UI.renderTaskbar(s);
    if (G.curTab === 'base') UI.renderBase(s);
    else if (G.curTab === 'design') UI.renderDesign(s);
    else if (G.curTab === 'launch') UI.renderLaunch(s);
    else UI.renderLog(s);
  };

  function refreshAll() {
    var s = S();
    UI.renderTop(s);
    UI.renderTaskbar(s);
    UI.renderBase(s); UI.renderDesign(s); UI.renderLaunch(s); UI.renderLog(s);
  }

  // ------------------------------------------------------------
  // 回合
  // ------------------------------------------------------------
  G.nextTurn = function () {
    var s = S();
    var pr = H.produce(s);

    // 口粮：先喂饱人，再算产出。库存 + 本回合收成不够吃即判定短缺。
    // 口粮产出本身不打折 —— 否则减产会让下回合更没饭吃，直接死亡螺旋。
    var need = H.foodNeed(s);
    var supply = (s.res.food || 0) + pr.food;
    var famine = supply < need;
    var mult = famine ? SV.SHORTAGE_MULT : 1;

    var d = {
      metal: Math.round(pr.metal * mult),
      research: Math.round(pr.research * mult),
      fuel: Math.round(pr.fuel * mult),
      food: Math.round(pr.food - need)
    };
    s.res.metal += pr.metal * mult;
    s.res.research += pr.research * mult;
    s.res.fuel += pr.fuel * mult;
    s.res.food = Math.max(0, supply - need);
    s.res.metal = Math.round(s.res.metal * 10) / 10;
    s.res.research = Math.round(s.res.research * 10) / 10;
    s.res.fuel = Math.round(s.res.fuel * 10) / 10;
    s.res.food = Math.round(s.res.food * 10) / 10;
    s.turn++;
    SV.sfx.turn();

    if (famine) {
      s.stat.famine = (s.stat.famine || 0) + 1;
      var popN = H.popTotal(s), needN = U.fmt(need);
      pushLog('口粮不足：在岗 ' + popN + ' 人需 ' + needN + '，当回合产出减半', 'bad');
      global.setTimeout(function () {
        UI.toast('口粮不足', '在岗 ' + popN + ' 人这回合要吃掉 ' + needN +
          ' 口粮，库存加收成不够，产出减半。把人调去农业岗，或在当前基地建水培舱。', 'bad');
        SV.sfx.alarm();
      }, 380);
      coach('food');
    }

    // 随机事件
    if (s.turn >= 3 && Math.random() < 0.32) {
      var ev = SV.rollEvent();
      var txt = ev.run(s);
      if (txt) {
        pushLog(ev.name + '：' + txt, ev.kind === 'good' ? 'good' : (ev.kind === 'bad' ? 'bad' : ''));
        global.setTimeout(function () {
          UI.toast(ev.name, txt, ev.kind === 'good' ? 'ok' : (ev.kind === 'bad' ? 'bad' : 'info'));
          // 事件有好 / 坏 / 中性三种，听感上要能先于文字分辨好坏
          if (ev.kind === 'bad') SV.sfx.bad();
          else if (ev.kind === 'good') SV.sfx.good();
          else SV.sfx.click();
        }, 380);
      }
    }
    checkMissions();
    checkAch();
    save();
    G.refresh(d);
    coach('base_after');
  };

  G.build = function (id) {
    var s = S();
    var bd = null;
    for (var i = 0; i < SV.BUILDINGS.length; i++) if (SV.BUILDINGS[i].id === id) bd = SV.BUILDINGS[i];
    if (!bd) return;
    var cost = SV.buildCost(s, bd);
    var cnt = H.curBase(s).built[bd.id] || 0;
    if (bd.tech && !H.hasTech(s, bd.tech)) { SV.sfx.deny(); UI.toast('科技未解锁', '需先在科技树解锁「' + SV.techName(bd.tech) + '」', 'info'); return; }
    if (s.res.metal < cost) { SV.sfx.deny(); UI.toast('金属不足', '还差 ' + U.fmt(cost - s.res.metal) + ' 金属', 'bad'); return; }
    s.res.metal -= cost;
    var b = H.curBase(s).built;
    b[id] = (b[id] || 0) + 1;
    H.fixPop(s);
    SV.sfx.build();
    pushLog('建成 ' + bd.name + '（第 ' + (cnt + 1) + ' 座 · ' + SV.planetById(s.base).name + '基地）', 'good');
    checkMissions(); checkAch(); save();
    G.refresh({ metal: -cost });
    // 第一次盖居住舱时讲口粮，比等玩家饿肚子再讲要早
    if (id === 'hab') coach('food');
    else coach('built');
  };

  G.unlockTech = function (id) {
    var s = S();
    var t = SV.techById(id);
    if (!t || H.hasTech(s, id)) return;
    if (!H.techDepsOk(s, t)) { SV.sfx.deny(); return; }
    if (s.res.research < t.cost) { SV.sfx.deny(); return; }
    // 稀有资源门禁：只能靠远征对应星球带回，蹲基地刷不出来
    var lack = H.techLack(s, t);
    if (lack.length) {
      SV.sfx.deny();
      UI.toast('稀有资源不足', H.techLackText(s, t) + '。这些原料基地里产不出，只有成功飞抵 ' +
        lack.map(function (l) { return SV.rareById(l.id).from; }).join(' / ') + ' 才能带回。', 'bad');
      return;
    }
    s.res.research -= t.cost;
    for (var k in t.rare) s.rare[k] -= t.rare[k];
    s.tech.push(id);
    SV.sfx.tech();
    pushLog('解锁科技「' + t.name + '」', 'big');
    checkMissions(); checkAch(); save();
    UI.toast('科技解锁', t.name, 'ok');
    G.refresh({ research: -t.cost });
    UI.openTech(S());
    coach('tech');
  };

  // ------------------------------------------------------------
  // 火箭装配
  // ------------------------------------------------------------
  // 换舱体后按新舱体的挂载位与燃料容量裁剪设计
  function trimDesign(s) {
    var d = s.design;
    if (!d.payloads) d.payloads = [];
    if (!d.boosters) d.boosters = [];
    var pod = SV.PARTS[d.pod] || SV.PARTS.pod_s;
    var cap = pod.cap, fuelCap = pod.fuelCap || Infinity;
    while (d.tanks.length > cap.t) d.tanks.pop();
    while (d.engines.length > cap.e) d.engines.pop();
    while (d.payloads.length > cap.p) d.payloads.pop();
    while (d.boosters.length > (cap.b || 0)) d.boosters.pop();
    // 单个就超容量的罐直接卸掉，再从后往前卸到总量达标
    var keep = [];
    for (var i = 0; i < d.tanks.length; i++) if (SV.PARTS[d.tanks[i]].fuel <= fuelCap) keep.push(d.tanks[i]);
    d.tanks = keep;
    while (d.tanks.length && SV.calcDesign(d, s).fuel > fuelCap) d.tanks.pop();
  }

  G.togglePart = function (slot, pid) {
    var s = S(), d = s.design;
    if (!d.payloads) d.payloads = [];
    if (!d.boosters) d.boosters = [];
    if (slot === 'pod') {
      if (d.pod === pid) return;
      d.pod = pid;
      trimDesign(s);
    } else if (slot === 'tank') {
      if (pid === null) { d.tanks.length = 0; }
      else {
        var i = d.tanks.indexOf(pid);
        if (i >= 0) d.tanks.splice(i, 1);
        else if (d.tanks.length >= SV.PARTS[d.pod].cap.t) { SV.sfx.deny(); UI.toast('挂载位已满', '当前舱体只能挂 ' + SV.PARTS[d.pod].cap.t + ' 个燃料罐，换更大的舱体可增加', 'info'); return; }
        else if (SV.PARTS[pid].fuel > (SV.PARTS[d.pod].fuelCap || Infinity)) {
          SV.sfx.deny();
          UI.toast('燃料容量不足', SV.PARTS[pid].name + '（' + SV.PARTS[pid].fuel + '）超出' + SV.PARTS[d.pod].name + '的容量上限 ' + SV.PARTS[d.pod].fuelCap, 'info');
          return;
        } else d.tanks.push(pid);
      }
    } else if (slot === 'engine') {
      if (pid === null) { d.engines.length = 0; }
      else {
        var capE = SV.PARTS[d.pod].cap.e;
        if (d.engines.length && d.engines[0] !== pid) {
          d.engines = [pid];
        } else if (d.engines.length >= capE) {
          d.engines = [];
        } else {
          d.engines.push(pid);
        }
      }
    } else if (slot === 'payload') {
      var k = d.payloads.indexOf(pid);
      if (k >= 0) d.payloads.splice(k, 1);
      else if (d.payloads.length >= SV.PARTS[d.pod].cap.p) {
        SV.sfx.deny();
        UI.toast('载荷位已满', '当前舱体只能装 ' + SV.PARTS[d.pod].cap.p + ' 件载荷，换更大的舱体可增加', 'info');
        return;
      } else d.payloads.push(pid);
    } else if (slot === 'booster') {
      if (pid === null) { d.boosters.length = 0; }
      else {
        var capB = SV.PARTS[d.pod].cap.b || 0;
        if (d.boosters.indexOf(pid) >= 0) {
          d.boosters = d.boosters.filter(function (b) { return b !== pid; });
        } else if (d.boosters.length + 2 > capB) {
          SV.sfx.deny();
          UI.toast('助推位不足', '助推器成对装配，需 2 个位（剩余 ' + (capB - d.boosters.length) + '）', 'info'); return;
        } else { d.boosters.push(pid); d.boosters.push(pid); }
      }
    }
    SV.sfx.click();
    save();
    G.refresh();
  };

  var NAME_POOL = ['近地者', '拓荒者', '远行者', '深空号'];
  G.saveDesign = function () {
    var s = S();
    var c = SV.calcDesign(s.design, s);
    if (!c.canFly) {
      SV.sfx.deny();
      UI.toast('设计无法起飞', c.problems.join('；'), 'bad');
      return;
    }
    if (s.res.metal < c.cost) {
      SV.sfx.deny();
      UI.toast('金属不足', '制造这架火箭要 ' + c.cost + ' 金属，还差 ' + U.fmt(c.cost - s.res.metal), 'bad');
      return;
    }
    s.res.metal -= c.cost;
    var pool = c.range < 40 ? NAME_POOL[0] : (c.range < 90 ? NAME_POOL[1] : (c.range < 180 ? NAME_POOL[2] : NAME_POOL[3]));
    var sv = {
      name: pool + ' ' + ('0' + (s.saved.length + 1)).slice(-2),
      pod: s.design.pod, tanks: s.design.tanks.slice(), engines: s.design.engines.slice(),
      boosters: (s.design.boosters || []).slice(), payloads: (s.design.payloads || []).slice(), cost: c.cost
    };
    s.saved.push(sv);
    s.launchDesign = s.saved.length - 1;
    SV.sfx.build();
    pushLog('制造 ' + sv.name + '（造价 ' + c.cost + ' 金属 · 推重比 ' + c.twr.toFixed(2) +
      ' · 航程 ' + U.fmt(c.range) + ' · 护盾 ' + c.shield + '）', 'good');
    checkMissions(); checkAch(); save();
    G.refresh({ metal: -c.cost });
    UI.toast('已保存', sv.name + ' 已存入机库', 'ok');
    coach('saved');
  };
  G.deleteDesign = function (idx) {
    var s = S();
    s.saved.splice(idx, 1);
    if (s.launchDesign === idx) s.launchDesign = -1;
    else if (s.launchDesign > idx) s.launchDesign--;
    SV.sfx.click(); save(); G.refresh();
  };
  G.pickDesign = function (idx) {
    var s = S();
    s.launchDesign = (s.launchDesign === idx) ? -1 : idx;
    SV.sfx.click(); save(); G.refresh();
  };
  G.pickTarget = function (id) {
    var s = S();
    s.launchTarget = (s.launchTarget === id) ? null : id;
    SV.sfx.click(); save(); G.refresh();
  };
  G.clearDesign = function () {
    S().design = SV.newDesign();
    SV.sfx.click(); save(); G.refresh();
  };

  // ------------------------------------------------------------
  // 发射
  // ------------------------------------------------------------
  G.launch = function () {
    var s = S();
    var sv = s.saved[s.launchDesign];
    if (!sv) { SV.sfx.deny(); UI.toast('未选火箭', '先在上方选择一架已保存的火箭', 'bad'); return; }
    if (!s.launchTarget) { SV.sfx.deny(); UI.toast('未选目标', '请选择目标星球', 'bad'); return; }
    var c = SV.calcDesign(sv, s);
    var pl = SV.planetById(s.launchTarget);
    var from = SV.planetById(s.base);
    if (!c.canFly) { SV.sfx.deny(); UI.toast('火箭无法起飞', c.problems.join('；'), 'bad'); return; }
    if (s.res.fuel < c.fuel) {
      SV.sfx.deny();
      UI.toast('燃料不足', '装满这架火箭需要 ' + U.fmt(c.fuel) + ' 燃料，基地只有 ' + U.fmt(s.res.fuel), 'bad');
      return;
    }
    var gap = Math.abs(pl.dist - from.dist);
    // 航程 + 该危险等级要求的机动性，两道都得过
    var blockers = SV.routeBlockers(c, gap, pl.haz);
    if (blockers.length) {
      SV.sfx.deny();
      UI.toast('飞不了 ' + pl.name, blockers.join('；') + '。' +
        (c.twr < SV.minTwrFor(pl.haz) ? '换推力更大的引擎，或者减轻载荷。' : '加燃料罐或带导航阵列。'), 'bad');
      return;
    }
    s.res.fuel -= c.fuel;
    s.stat.launches++;
    if (SV.PARTS[sv.pod].mass >= 9) s.stat.heavyLaunch++;
    pushLog('自「' + from.name + '」发射 ' + sv.name + '，目标 ' + pl.name, 'big');
    save();
    G.refresh({ fuel: -c.fuel });
    SV.flight.start({
      sv: sv, calc: c, planet: pl, from: from,
      onEnd: function (res) { settle(res, sv, c, pl, from); }
    });
  };

  function newBase() { return SV.newBase(); }

  // 载荷效果：货舱 / 钻探器 / 取样臂在结算时生效
  function payloadMult(sv) {
    var ps = (sv && sv.payloads) || [];
    return {
      rare: ps.indexOf('cargo') >= 0 ? 1.5 : 1,
      metal: ps.indexOf('drill') >= 0 ? 2 : 1,
      first: ps.indexOf('sampler') >= 0 ? 1.5 : 1
    };
  }

  function settle(res, sv, c, pl, from) {
    var s = S();
    bgm(res.won ? 'win' : 'base');   // 抵达了往上扬，摔了就沉回基地的循环
    var gains = [];
    var firstVisit = s.arrived.indexOf(pl.id) < 0;
    var pm = payloadMult(sv);
    if (firstVisit) s.arrived.push(pl.id);

    if (res.won) {
      s.stat.wins++;
      if (res.hits === 0) s.stat.clean++;
      if (pl.canBase) {
        var isNew = !s.bases[pl.id];
        if (isNew) {
          s.bases[pl.id] = newBase();
          SV.sfx.arrive();     // 抵达的琶音之后再来一记「安顿下来」的和弦
        }
        gains.push(['g-g', isNew ? '建立新基地' : '补给送达', isNew ? pl.name + '基地' : '已有基地，物资入库']);
      } else {
        var m = Math.round((70 + pl.haz * 25) * pm.metal);
        s.res.metal += m;
        gains.push(['g-m', '采集金属' + (pm.metal > 1 ? '（钻探器 ×2）' : ''), '+' + m]);
      }
      // 首次勘探的一次性科研奖励：给「出去飞」一条换科研的路，
      // 免得科技门控期间连续十几回合无事可做（详见 DESIGN「空转」一节）。
      if (firstVisit && SV.firstVisitResearch) {
        var fvr = SV.firstVisitResearch(pl);
        s.res.research += fvr;
        gains.push(['g-s', '首次勘探 · ' + pl.name, '+' + fvr + ' 科研']);
      }
      if (res.crystals > 0) {
        var rp = res.crystals * 8;
        s.res.research += rp;
        s.stat.crystals += res.crystals;
        gains.push(['g-s', '数据晶体 ×' + res.crystals, '+' + rp + ' 科研']);
      }
      var back = Math.round(res.fuelLeft * 0.5);
      if (back > 0) { s.res.fuel += back; gains.push(['g-f', '剩余燃料回收', '+' + back]); }
      if (res.hits === 0) gains.push(['g-g', '零损伤抵达', '完美飞行']);
      // 稀有资源：只有成功抵达才能带回，基地里产不出
      var ry = H.rareYield(s, pl, firstVisit);
      if (ry) {
        var hadBefore = s.stat.gained[ry.id] || 0;
        var amt = Math.round(ry.n * pm.rare * (ry.first ? pm.first : 1));
        H.gainRare(s, ry.id, amt);
        var rd = SV.rareById(ry.id);
        var tag = ry.first ? '首次勘探' : '例行采样';
        if (pm.rare > 1) tag += ' · 货舱 ×1.5';
        if (ry.first && pm.first > 1) tag += ' · 取样臂 ×1.5';
        gains.push(['g-r', rd.name + ' ×' + amt, tag]);
        pushLog('自 ' + pl.name + ' 带回 ' + rd.name + ' ×' + amt, 'good');
        if (hadBefore === 0) rareCoachPending = true;
      }
      pushLog('成功抵达 ' + pl.name + '（撞击 ' + res.hits + ' 次）', 'good');
    } else {
      var rec = Math.round(c.mass * 0.5);
      s.res.metal += rec;
      gains.push(['g-m', '残骸回收', '+' + rec + ' 金属']);
      pushLog('飞行失败：' + (res.deadReason === 'fuel' ? '燃料耗尽' : '撞击解体') + '，损失 ' + sv.name, 'bad');
    }

    checkMissions(); checkAch(); save();
    refreshAll();
    showResult(res, sv, c, pl, from, gains, firstVisit);
  }

  function showResult(res, sv, c, pl, from, gains, firstVisit) {
    var s = S();
    var segGap = Math.abs(pl.dist - from.dist);
    var html = '<div class="result-hero">' +
      '<div class="rh-ic">' + (res.won ? '✦' : '✕') + '</div>' +
      '<div class="rh-t">' + (res.won ? '抵达 ' + pl.name : (res.deadReason === 'fuel' ? '燃料耗尽' : '火箭解体')) + '</div>' +
      '<div class="rh-s">' + (res.won
        ? '航段 ' + segGap + ' · 撞击 ' + res.hits + ' 次 · 剩余燃料 ' + U.fmt(res.fuelLeft)
        : (res.deadReason === 'fuel'
          ? '推进剂烧尽，火箭失去动力。下次换更大的燃料罐，或沿途多拾取燃料囊。'
          : '撞击过于严重。换装带护盾的加强舱，能硬抗一次碰撞。')) + '</div></div>';

    html += '<div class="gain-list">';
    for (var i = 0; i < gains.length; i++) {
      html += '<div class="gain ' + gains[i][0] + '"><span>' + gains[i][1] + '</span><span class="gv">' + gains[i][2] + '</span></div>';
    }
    html += '</div>';

    if (res.won && firstVisit) {
      html += '<div class="unlock-card"><div class="uc-t">星 球 档 案</div>' +
        '<div class="uc-n">' + pl.name + '</div>' +
        '<div class="uc-d">' + pl.desc + '</div></div>';
    }

    var acts = '';
    if (res.won && pl.canBase && s.bases[pl.id] && s.base !== pl.id) {
      acts = '<button class="btn ghost" id="rsStay">留在' + from.name + '</button>' +
        '<button class="btn pri" id="rsGo">前往' + pl.name + '基地</button>';
    } else {
      acts = '<button class="btn pri" id="rsOk">继续</button>';
    }
    html += '<div class="modal-actions">' + acts + '</div>';

    UI.el.sheet.innerHTML = html;
    UI.el.modal.classList.add('on');
    var stay = $('rsStay'), go = $('rsGo'), ok = $('rsOk');
    if (stay) stay.addEventListener('click', function () { SV.sfx.click(); UI.closeModal(); afterResult(); });
    if (go) go.addEventListener('click', function () {
      G.switchBase(pl.id);            // 内部自带 click 音
      UI.closeModal(); afterResult();
    });
    if (ok) ok.addEventListener('click', function () { SV.sfx.click(); UI.closeModal(); afterResult(); });

    // 结局
    if (res.won && pl.id === 'pluto') {
      global.setTimeout(function () {
        bgm('win');
        UI.el.sheet.innerHTML =
          '<div class="result-hero"><div class="rh-ic">◈</div>' +
          '<div class="rh-t">星 海 尽 头</div>' +
          '<div class="rh-s">你站在冥王星的氮霜原上回望，太阳只是一颗特别亮的星。<br>人类能抵达的地方，从此多出了 ' +
          U.keys(s.bases).length + ' 个坐标。</div></div>' +
          '<div class="unlock-card"><div class="uc-t">远 征 结 算</div>' +
          '<div class="uc-d">用时 ' + s.turn + ' 回合 · 发射 ' + s.stat.launches + ' 次 · 成功 ' + s.stat.wins +
          ' 次 · 建立 ' + U.keys(s.bases).length + ' 座基地 · 解锁科技 ' + s.tech.length + '/' + SV.TECH.length +
          ' · 成就 ' + s.ach.length + '/' + SV.ACH.length + '<br>' +
          '钛晶 ' + (s.stat.gained.ti || 0) + ' · 氦三 ' + (s.stat.gained.he || 0) + ' · 冰核 ' + (s.stat.gained.ice || 0) +
          '（累计带回）</div></div>' +
          '<div class="modal-actions"><button class="btn pri" id="endOk">继续经营</button></div>';
        UI.el.modal.classList.add('on');
        var eo = $('endOk');
        if (eo) eo.addEventListener('click', function () { SV.sfx.click(); UI.closeModal(); bgm('base'); });
      }, 2600);
    }
  }
  function afterResult() {
    UI.switchTab('base');
    bgm('base');
    if (rareCoachPending) {
      rareCoachPending = false;
      coach('rare');
      return;
    }
    coach('after_flight');
  }

  // ------------------------------------------------------------
  // 基地切换 / 任务 / 成就 / 重置
  // ------------------------------------------------------------
  G.switchBase = function (id) {
    var s = S();
    if (!s.bases[id] || s.base === id) return;
    s.base = id;
    H.fixPop(s);
    s.launchTarget = null;
    SV.sfx.click();
    pushLog('主基地切换至 ' + SV.planetById(id).name, '');
    save(); refreshAll();
    UI.toast('已切换', '当前经营：' + SV.planetById(id).name + '基地', 'ok');
  };

  G.claimMission = function (id) {
    var s = S();
    var m = null;
    for (var i = 0; i < SV.MISSIONS.length; i++) if (SV.MISSIONS[i].id === id) m = SV.MISSIONS[i];
    if (!m || s.done.indexOf(id) >= 0 || !m.check(s)) return;
    giveReward(m.reward);
    s.done.push(id);
    SV.sfx.tech();
    pushLog('完成目标「' + m.name + '」', 'big');
    save(); G.refresh();
  };

  function giveReward(rw) {
    var s = S();
    if (rw.metal) s.res.metal += rw.metal;
    if (rw.research) s.res.research += rw.research;
    if (rw.fuel) s.res.fuel += rw.fuel;
  }

  function checkMissions() {
    var s = S();
    for (var i = 0; i < SV.MISSIONS.length; i++) {
      var m = SV.MISSIONS[i];
      if (s.done.indexOf(m.id) >= 0) continue;
      if (m.check(s)) {
        giveReward(m.reward);
        s.done.push(m.id);
        (function (mm) {
          global.setTimeout(function () {
            UI.toast('目标达成', mm.name + ' · ' + mm.rewardTxt, 'ok');
            SV.sfx.tech();
          }, 260);
        })(m);
        pushLog('完成目标「' + m.name + '」', 'big');
      }
    }
  }

  function checkAch() {
    var s = S();
    for (var i = 0; i < SV.ACH.length; i++) {
      var a = SV.ACH[i];
      if (s.ach.indexOf(a.id) >= 0) continue;
      if (a.check(s)) {
        s.ach.push(a.id);
        (function (aa) {
          global.setTimeout(function () { UI.toast('成就解锁', aa.ic + ' ' + aa.name, 'ok'); SV.sfx.ach(); }, 520);
        })(a);
        pushLog('成就解锁：' + a.name, 'big');
      }
    }
  }

  function pushLog(txt, kind) {
    var s = S();
    s.log.push({ t: s.turn, x: txt, k: kind || '' });
    if (s.log.length > 120) s.log.shift();
  }

  G.reset = function () {
    UI.el.sheet.innerHTML =
      '<h2>重新开始？</h2><div class="sub">当前进度会被清空，且无法恢复。</div>' +
      '<div class="modal-actions"><button class="btn ghost" id="rsCancel">取消</button>' +
      '<button class="btn pri" id="rsConfirm">确认重来</button></div>';
    UI.el.modal.classList.add('on');
    $('rsCancel').addEventListener('click', UI.closeModal);
    $('rsConfirm').addEventListener('click', function () {
      SV.store.clear();
      SV.store.state = SV.store.fresh();
      SV.vfx.clearPlanetCache();
      SV.sfx.click();
      UI.closeModal();
      save(); refreshAll(); UI.switchTab('base');
      UI.toast('新的远征', '从第 1 回合开始', 'ok');
    });
  };

  // ------------------------------------------------------------
  // 引导
  // ------------------------------------------------------------
  var COACH = {
    first: ['先把人手分出去', '拖动三条分配条，把人放到采矿/科研/精炼岗，然后点「推进一回合」。'],
    base_after: ['产出到手了', '金属用来建设施，科研点在「科技树」里解锁新技术。'],
    built: ['设施已建成', '每座设施会为对应岗位+1 个岗位位，记得把人补上去。'],
    tech: ['科技解锁', '新零件已经在装配车间可用，去「设计」里试装一架火箭。'],
    design: ['装配一架火箭', '舱体决定挂载位与护盾，燃料罐可叠加，引擎可并联。推重比需 ≥1.2。'],
    saved: ['火箭已入库', '去「发射」页选择它和目标星球，就能点火了。'],
    launch: ['点火前检查', '确认基地燃料够装满火箭、航程覆盖目标距离。'],
    after_flight: ['回到基地', '新基地会带来资源加成，别忘在「档案」里切换主基地。'],
    rare: ['稀有资源到手', '钛晶 / 氦三 / 冰核只产在特定星球上，基地里挖不出来。想继续攀科技树，就得一次次飞过去把它们带回来。'],
    food: ['口粮是人口的账单', '每回合按在岗人数扣口粮，收成不够就全基地减产。养人最便宜的是地球，月球只有一半、水星只有四成——把主基地搬去前线，先算算那地方养不养得起这么多人。']
  };
  function coach(key) {
    if (coachSeen[key]) return;
    var s = S();
    if (key === 'first' && s.turn > 1) return;
    if (key === 'base_after' && s.turn !== 2) return;
    if (key === 'design' && s.saved.length > 0) return;
    if (key === 'launch' && s.stat.launches > 0) return;
    var c = COACH[key];
    if (!c) return;
    coachSeen[key] = 1;
    UI.coach(c[0], c[1], 5600);
  }

  // ------------------------------------------------------------
  // 场景绘制
  // ------------------------------------------------------------
  var designSig = '', designAnim = 0, lastFrame = 0;

  function drawBase(now) {
    var cv = $('baseCanvas'), x = cv.getContext('2d');
    var sz = V.fit(cv, x);
    var s = S();
    var pl = SV.planetById(s.base);
    V.drawBaseScene(x, sz.w, sz.h, now, pl, H.curBase(s).built, pl.dist);
  }

  function drawDesign(now, dt) {
    var cv = $('designCanvas'), x = cv.getContext('2d');
    var sz = V.fit(cv, x);
    var s = S(), d = s.design;
    var c = SV.calcDesign(d, S());

    V.drawHangar(x, sz.w, sz.h, now);

    var sig = d.pod + '|' + d.tanks.join(',') + '|' + d.engines.join(',') + '|' + (d.payloads || []).join(',') + '|' + (d.boosters || []).join(',');
    if (sig !== designSig) { designSig = sig; designAnim = 0; }
    designAnim += dt;

    // 装配对象（含 podId）
    var rc = { pod: c.pod, podId: d.pod, tanks: d.tanks, engines: d.engines, boosters: d.boosters || [], payloads: c.payloads };
    var lay = V.rocketLayout(rc, 1);
    var cx = sz.w / 2;
    var baseY = sz.h * 0.80 + Math.sin(now * 0.0016) * 4;

    // 装配动画：零件按「引擎→燃料罐→舱体→仪器」顺序从上方滑入
    V.drawRocket(x, cx, baseY, 1, rc, now, c.canFly ? 1 : 0.32, { t: designAnim });

    // 装配辅助线
    x.strokeStyle = 'rgba(127,208,255,0.13)'; x.lineWidth = 1;
    x.setLineDash([3, 5]);
    x.beginPath();
    x.moveTo(cx - lay.width / 2 - 26, baseY + lay.bottom + 8);
    x.lineTo(cx + lay.width / 2 + 26, baseY + lay.bottom + 8);
    x.moveTo(cx, baseY + lay.top - 30); x.lineTo(cx, baseY + 8);
    x.stroke(); x.setLineDash([]);

    // 尺寸标注
    x.fillStyle = 'rgba(150,180,255,0.4)';
    x.font = '9px -apple-system, sans-serif';
    x.textAlign = 'center';
    x.fillText('MASS ' + U.fmt(c.mass) + 't', cx, baseY + lay.bottom + 20);

    // 状态灯
    var okCol = c.canFly ? '#6ee0a0' : '#ff7a7a';
    x.fillStyle = okCol;
    x.shadowColor = okCol; x.shadowBlur = 8;
    x.beginPath(); x.arc(sz.w - 22, 20, 4, 0, 6.2832); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(234,242,255,0.7)';
    x.font = '10px -apple-system, sans-serif'; x.textAlign = 'right';
    x.fillText(c.canFly ? 'READY' : 'NOT READY', sz.w - 32, 24);

    // 标题
    x.textAlign = 'left';
    x.fillStyle = 'rgba(234,242,255,0.85)';
    x.font = '600 12px -apple-system, sans-serif';
    x.fillText(SV.PARTS[d.pod].name + (d.tanks.length ? ' + ' + d.tanks.length + '罐' : '') +
      (d.engines.length ? ' + ' + d.engines.length + '引擎' : '') +
      ((d.boosters && d.boosters.length) ? ' + ' + d.boosters.length + '助推' : '') +
      ((d.payloads && d.payloads.length) ? ' + ' + d.payloads.length + '载荷' : ''), 12, 22);
    x.fillStyle = 'rgba(139,152,198,0.85)';
    x.font = '10px -apple-system, sans-serif';
    x.fillText('推重比 ' + c.twr.toFixed(2) + ' · 航程 ' + U.fmt(c.range) + ' · 护盾 ' + c.shield +
      ' · 燃效 ×' + c.avgEff.toFixed(2) + ' · 造价 ' + c.cost, 12, 37);
    if (c.overload > 0) {
      x.fillStyle = '#ff9a9a';
      x.fillText('过载 ×' + c.overload + '：结构吃掉 ' + c.overload + ' 层护盾，航程 −' +
        Math.round((1 - Math.pow(1 - SV.OVERLOAD_FLOW, c.overload)) * 100) + '%', 12, 50);
    }
  }

  function drawIntro(now) {
    var cv = $('startCanvas'), x = cv.getContext('2d');
    var W = global.innerWidth, H = global.innerHeight;
    if (cv.width !== Math.round(W * V.dpr)) { cv.width = Math.round(W * V.dpr); cv.height = Math.round(H * V.dpr); }
    x.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    V.drawIntro(x, W, H, now);
  }

  // ------------------------------------------------------------
  // 主循环
  // ------------------------------------------------------------
  function loop(now) {
    if (!started) { drawIntro(now); global.requestAnimationFrame(loop); return; }
    if (!SV.flight.active()) {
      var dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
      lastFrame = now;
      if (G.curTab === 'base') drawBase(now);
      else if (G.curTab === 'design') drawDesign(now, dt);
    }
    global.requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------
  // 启动
  // ------------------------------------------------------------
  function begin(useSave) {
    if (started) return;
    started = true;
    if (useSave) {
      var s = SV.store.load();
      SV.store.state = s || SV.store.fresh();
    } else {
      SV.store.state = SV.store.fresh();
      save();
    }
    SV.sfx.unlockAll();
    SV.sfx.click();
    // 进游戏这一下是用户手势，可以在这里真正起播
    bgm('base');
    if (SV.bgm) { SV.bgm.setEnabled(bgmOn()); syncBgmBtn(); }
    $('screenStart').classList.add('gone');
    global.setTimeout(function () { $('screenStart').style.display = 'none'; }, 600);
    refreshAll();
    UI.switchTab('base');
    global.setTimeout(function () { coach('first'); }, 900);
  }

  function bind() {
    var tabs = doc.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (t) {
        t.addEventListener('click', function () {
          var n = t.getAttribute('data-tab');
          SV.sfx.click();
          UI.switchTab(n);
          bgm(n);                       // tab 名与 BGM 场景名一一对应
          if (n === 'design') coach('design');
          if (n === 'launch') coach('launch');
        });
      })(tabs[i]);
    }
    $('btnNextTurn').addEventListener('click', G.nextTurn);
    $('btnTech').addEventListener('click', function () { SV.sfx.click(); UI.openTech(S()); });
    $('btnSaveDesign').addEventListener('click', G.saveDesign);
    $('btnClearDesign').addEventListener('click', G.clearDesign);
    $('btnLaunch').addEventListener('click', G.launch);
    $('btnReset').addEventListener('click', G.reset);
    $('btnHelp').addEventListener('click', function () { SV.sfx.click(); UI.openHelp(); });
    $('baseName').addEventListener('click', function () {
      SV.sfx.click();
      if (U.keys(S().bases).length > 1) UI.openBaseSwitch(S());
      else UI.toast('只有一座基地', '成功抵达其他星球后可以在此切换主基地', 'info');
    });

    $('btnBegin').addEventListener('click', function () { begin(true); });

    // 浏览器要求先有用户手势才出声。第一次碰屏幕就把标题页的氛围乐接上，
    // 不用等到点了「开始远征」才有声音。
    var kick = function (ev) {
      // 点的是音乐开关本身 → 交给按钮的 click，别在这里先把声音放出来
      var t = ev && ev.target;
      if (t && t.closest && t.closest('.bgm-btn')) return;
      global.removeEventListener('pointerdown', kick);
      global.removeEventListener('touchstart', kick);
      global.removeEventListener('keydown', kick);
      if (started || !SV.bgm) return;         // 已经进游戏了，交给 begin()
      SV.bgm.setEnabled(bgmOn());
      if (SV.bgm.isEnabled()) SV.bgm.play('menu');
      syncBgmBtn();
    };
    global.addEventListener('pointerdown', kick);
    global.addEventListener('touchstart', kick);
    global.addEventListener('keydown', kick);

    if ($('btnBgm')) $('btnBgm').addEventListener('click', toggleBgm);
    if ($('btnBgm2')) $('btnBgm2').addEventListener('click', toggleBgm);

    SV.flight.bind();
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { save(); if (SV.bgm) SV.bgm.suspend(); }
      else if (SV.bgm) SV.bgm.resume();
    });
    global.addEventListener('beforeunload', save);
  }

  function init() {
    var has = SV.store.has();
    var saved = has ? SV.store.load() : null;
    SV.store.state = saved || SV.store.fresh();

    if (saved) {
      $('btnBegin').textContent = '继续远征';
      $('startHint').innerHTML = '检测到存档 · 第 ' + saved.turn + ' 回合 · ' +
        U.keys(saved.bases).length + ' 座基地 · ' + saved.tech.length + '/' + SV.TECH.length + ' 项科技';
    } else {
      $('btnBegin').textContent = '开始远征';
    }
    if (SV.bgm && !bgmOn()) SV.bgm.setEnabled(false);   // 上次关过就别自作主张放
    syncBgmBtn();
    bind();
    global.requestAnimationFrame(loop);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

})(window);
