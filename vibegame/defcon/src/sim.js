/*
 * defcon — sim.js
 * 阶段机 / 实体状态 / 10Hz 固定步长 tick / 战斗与伤害结算
 * 依赖：data.js（CONFIG、阵营、城市）→ geo.js（大圆数学）
 * 命名空间：window.DC（经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → sim.js → ai.js → render.js → ui.js → game.js
 *
 * 设计约束：
 * - 逻辑 10 Hz 固定步长，渲染 60 fps 插值 —— 固定步长让 AI 行为与玩家操作完全确定。
 * - 所有随机走 state.rng（种子化 mulberry32），同种子同输入必然同结果，便于 tests/ 无头断言。
 * - 本文件不含任何 THREE / DOM 依赖，可在纯 Node 下跑完整局。
 * - 不做网络、不做计时器；推进完全由外部调用 tick(state, dt) 驱动。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};
  var CONFIG = DC.CONFIG || {};
  var G = DC.geo;

  var TICK = 0.1;                 // 10 Hz 固定步长（秒）
  var RAD2DEG = 180 / Math.PI;

  /* ───────────────────────── 1. 确定性随机 ─────────────────────────
   * mulberry32：32 位状态、无外部依赖、周期足够一局使用。
   * 不用 Math.random —— 否则无头测试无法复现。
   */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randRange(rng, lo, hi) { return lo + (hi - lo) * rng(); }

  /* ───────────────────────── 2. 建局 ───────────────────────── */

  function create(opts) {
    opts = opts || {};
    var seed = (opts.seed != null) ? opts.seed : 20260908;
    var state = {
      seed: seed,
      rng: makeRng(seed),
      phase: 'briefing',      // briefing → crisis → war → over
      t: 0,                   // 当前阶段已过秒数
      round: 0,
      crisis: CONFIG.initialCrisis,
      defcon: 5,
      playerFaction: opts.playerFaction || 'ALFA',
      autoPlayer: !!opts.autoPlayer,   // 开启后玩家席位也交给 AI（用于无人值守跑完整局演示/测试）
      warEndedEarly: false,
      missileSeq: 0,
      cities: [],
      units: [],
      missiles: [],
      factions: [],
      stats: {},
      fx: [],                 // 特效事件队列，render.js 消费
      deck: [],
      card: null,
      choices: {},
      nextFire: {},
      radarDown: {},         // 阵营 → 预警网失效剩余回合（事件卡 radar_down）
      log: []
    };

    // 城市：位置与人口为公开信息（DESIGN §2.2）
    DC.CITIES.forEach(function (c) {
      state.cities.push({
        id: c.id, faction: c.faction, name: c.name,
        lat: c.lat, lon: c.lon,
        pop0: c.pop, pop: c.pop, alive: true,
        defCharges: 0          // 事件卡 city_defense 挂上的防御层，抵扣命中
      });
    });

    // 阵营：含性格初值，战争期统计
    var hawks = CONFIG.aiHawkishness || {};
    DC.FACTIONS.forEach(function (f) {
      state.factions.push({
        code: f.code, name: f.name, color: f.color, region: f.region,
        hawkishness: (hawks[f.code] != null) ? hawks[f.code] : 0,
        isPlayer: f.code === state.playerFaction,
        alive: true
      });
      state.stats[f.code] = { killed: 0, casualties: 0, launched: 0, intercepts: 0 };
    });

    state.units = deployUnits();

    // 洗牌事件卡牌堆（Fisher–Yates，走种子 RNG），保证一局内不重复
    var deck = DC.EVENTS.map(function (e) { return e.id; });
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(state.rng() * (i + 1));
      var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    state.deck = deck;
    state.deckIdx = 0;

    return state;
  }

  /* ───────────────────────── 3. 开局布阵（固定，玩家不拖拽）─────────────────────────
   * 单位绑定到城市而非阵营质心：ALFA 城市呈环北极带分布，质心会落到北极点附近，
   * 布阵必须跟着城市走才能成立（D2 实测发现）。
   * 同一城市多单位时用黄金角错开方位，保证确定性且不重叠。
   */
  function deployUnits() {
    var units = [];
    var GOLDEN = 137.507765;

    DC.FACTIONS.forEach(function (f) {
      var cities = DC.CITIES_BY_FACTION[f.code].slice();
      // 确定性排序：人口降序，同人口按 id，保证同种子布阵一致
      cities.sort(function (a, b) { return (b.pop - a.pop) || (a.id < b.id ? -1 : 1); });
      var salt = f.code.charCodeAt(0) * 13 + f.code.length * 7;   // 阵营间错开起始方位

      function place(city, spreadDeg, idx) {
        var brg = (GOLDEN * idx + salt) % 360;
        return G.destination(city, brg, spreadDeg);
      }

      // SAM：守人口最高的 4 城，贴城布防
      for (var s = 0; s < CONFIG.samPerFaction; s++) {
        var ps = place(cities[s % cities.length], 1.5, s);
        units.push({
          id: f.code + '-SAM-' + s, faction: f.code, type: 'sam',
          lat: ps.lat, lon: ps.lon,
          ammo: CONFIG.samCapacity, maxAmmo: CONFIG.samCapacity, cooldown: 0
        });
      }
      // 雷达：间隔取样，分散覆盖
      for (var r = 0; r < CONFIG.radarPerFaction; r++) {
        var cr = cities[(r * 3 + 4) % cities.length];
        var pr = place(cr, 3, r + 10);
        units.push({
          id: f.code + '-RAD-' + r, faction: f.code, type: 'radar',
          lat: pr.lat, lon: pr.lon, radiusDeg: CONFIG.radarRadiusDeg,
          down: 0
        });
      }
      // 发射井：偏移更大（置于城市后方），6 座 × 3 枚
      for (var k = 0; k < CONFIG.silosPerFaction; k++) {
        var ck = cities[(k * 2) % cities.length];
        var pk = place(ck, 5 + (k % 3) * 2.5, k + 20);
        units.push({
          id: f.code + '-SILO-' + k, faction: f.code, type: 'silo',
          lat: pk.lat, lon: pk.lon,
          missiles: CONFIG.missilesPerSilo, exposed: false
        });
      }
    });
    return units;
  }

  /* ───────────────────────── 4. 查找辅助 ───────────────────────── */

  function findCity(state, id) {
    for (var i = 0; i < state.cities.length; i++) if (state.cities[i].id === id) return state.cities[i];
    return null;
  }
  function findUnit(state, id) {
    for (var i = 0; i < state.units.length; i++) if (state.units[i].id === id) return state.units[i];
    return null;
  }
  function findFaction(state, code) {
    for (var i = 0; i < state.factions.length; i++) if (state.factions[i].code === code) return state.factions[i];
    return null;
  }
  function unitsOf(state, faction, type) {
    return state.units.filter(function (u) {
      return u.faction === faction && (!type || u.type === type);
    });
  }
  function citiesOf(state, faction) {
    return state.cities.filter(function (c) { return c.faction === faction; });
  }
  // 敌方存活城市（按人口降序，人口相同按 id）—— AI 与 UI 共用同一排序，保证所见即所选
  function enemyCities(state, faction) {
    return state.cities.filter(function (c) {
      return c.faction !== faction && c.alive && c.pop > 0;
    }).sort(function (a, b) { return (b.pop - a.pop) || (a.id < b.id ? -1 : 1); });
  }
  function totalMissiles(state, faction) {
    return unitsOf(state, faction, 'silo').reduce(function (s, u) { return s + u.missiles; }, 0);
  }
  function defconOf(crisis) {
    var lv = 5;
    (CONFIG.defconLevels || []).forEach(function (d) { if (crisis >= d.min) lv = d.level; });
    return lv;
  }

  /* ───────────────────────── 5. 阶段机 ───────────────────────── */

  function log(state, text) {
    state.log.push({ t: state.t, round: state.round, phase: state.phase, text: text });
    if (state.log.length > 400) state.log.shift();
  }

  function enterPhase(state, phase) {
    state.phase = phase;
    state.t = 0;
    if (phase === 'crisis') {
      state.round = 0;
      nextRound(state);
    } else if (phase === 'war') {
      state.factions.forEach(function (f) {
        state.nextFire[f.code] = randRange(state.rng, CONFIG.aiFireMinSec, CONFIG.aiFireMaxSec);
      });
      log(state, 'DEFCON 1 —— 核弹解锁，热核战争开始');
    } else if (phase === 'over') {
      state.ranking = ranking(state);
      log(state, '终局计分');
    }
  }

  function nextRound(state) {
    if (state.deckIdx >= state.deck.length) state.deckIdx = 0;   // 牌堆用尽则重洗接续
    state.card = DC.EVENTS_BY_ID[state.deck[state.deckIdx]];
    state.deckIdx++;
    state.round++;
    state.choices = {};
    // 预警网失效按回合递减
    Object.keys(state.radarDown).forEach(function (k) {
      if (state.radarDown[k] > 0) state.radarDown[k]--;
    });
    // AI 立即决策（玩家在回合内通过 choose() 提交；超时由 tick 兜底为最保守项）
    if (DC.ai && DC.ai.chooseEvent) {
      state.factions.forEach(function (f) {
        if (f.isPlayer) return;
        state.choices[f.code] = DC.ai.chooseEvent(state, f.code);
      });
    }
  }

  /* ───────────────────────── 5b. 事件卡附加效果 ─────────────────────────
   * DESIGN §4.2 给 6 个选项挂了 effect，实现取舍如下：
   *  - reveal_radar / expose_silo：一次性永久暴露。情报泄露不会自动收回，
   *    与 render 的「只有己方或已暴露单位才可见」直接对应。
   *  - radar_down：置失效计数，每回合递减；渲染层据此隐藏雷达环。
   *    ⚠️ 完整机制收益在 D5 弹道溯源才闭环（雷达覆盖是溯源的前提），此处不新增数值设定。
   *  - pop_loss：按百万计从该阵营人口最多的城市扣减，并按 DESIGN §6.2 计入己方伤亡。
   *  - city_defense：给人口最多的若干己方城市挂防御层，抵扣一次命中（见 resolveImpact）。
   * 未做选择的阵营（玩家超时弃权）不结算 effect。
   */
  function applyEffects(state) {
    if (!state.card) return;
    state.factions.forEach(function (f) {
      var opt = state.card.options[state.choices[f.code]];
      if (!opt || !opt.effect) return;
      var e = opt.effect, n = 0;

      if (e.type === 'reveal_radar') {
        state.units.forEach(function (u) {
          if (u.type === 'radar' && u.faction !== f.code) { u.exposed = true; n++; }
        });
        log(state, f.code + ' 越境侦察得手：暴露 ' + n + ' 处敌方雷达');

      } else if (e.type === 'expose_silo') {
        state.units.forEach(function (u) {
          if (u.type === 'silo' && u.faction === f.code) { u.exposed = true; n++; }
        });
        log(state, f.code + ' 先发试探暴露了自身 ' + n + ' 处发射井');

      } else if (e.type === 'radar_down') {
        state.radarDown[f.code] = Math.max(state.radarDown[f.code] || 0, e.turns || 1);
        log(state, f.code + ' 预警网失效 ' + (e.turns || 1) + ' 回合');

      } else if (e.type === 'pop_loss') {
        var left = e.amount || 0;
        citiesOf(state, f.code)
          .filter(function (c) { return c.alive && c.pop > 0; })
          .sort(function (a, b) { return b.pop - a.pop; })
          .forEach(function (c) {
            if (left <= 0) return;
            var take = Math.min(c.pop, left);
            c.pop -= take; left -= take;
            if (c.pop <= 0.05) { c.pop = 0; c.alive = false; }
          });
        state.stats[f.code].casualties += (e.amount || 0);
        log(state, f.code + ' 行动失利，损失 ' + (e.amount || 0) + 'M 人口');

      } else if (e.type === 'city_defense') {
        citiesOf(state, f.code)
          .filter(function (c) { return c.alive; })
          .sort(function (a, b) { return b.pop - a.pop; })
          .slice(0, e.amount || 1)
          .forEach(function (c) { c.defCharges = (c.defCharges || 0) + 1; n++; });
        log(state, f.code + ' 为 ' + n + ' 座城市加装防御层');
      }
    });
  }

  // 危机值由六方共同选择推出（DESIGN §4.1）：取六方 crisis 修正的均值 + 基础漂移。
  // 取均值而非求和，使危机值的量纲与单张卡的修正一致，漂移 +4 才有可预期的权重。
  function resolveRound(state) {
    var sum = 0, n = 0;
    state.factions.forEach(function (f) {
      var idx = state.choices[f.code];
      var opt = state.card && state.card.options[idx];
      if (opt) { sum += opt.crisis; n++; }
    });
    // 玩家超时未选：按最保守（crisis 最小）项计入，避免拖时间等于弃权
    if (n < state.factions.length && state.card) {
      var minC = Math.min.apply(null, state.card.options.map(function (o) { return o.crisis; }));
      sum += minC * (state.factions.length - n);
      n = state.factions.length;
    }
    var avg = n ? sum / n : 0;
    state.crisis = Math.max(0, Math.min(100, state.crisis + CONFIG.crisisDrift + avg));
    state.defcon = defconOf(state.crisis);
    log(state, '第 ' + state.round + ' 回合结算：平均 ' + avg.toFixed(1) + ' → 危机值 ' + state.crisis.toFixed(1) + '（DEFCON ' + state.defcon + '）');

    applyEffects(state);       // 先按选择结算附加效果，再翻下一张卡
    if (state.defcon <= 1) { enterPhase(state, 'war'); return; }
    // 兜底：超过设计上限仍未开战，则强制推向战争（世界终究滑向战争）
    if (state.round >= CONFIG.maxRounds) {
      state.crisis = Math.max(state.crisis, 80);
      state.defcon = 1;
      log(state, '回合数达上限，局势失控');
      enterPhase(state, 'war'); return;
    }
    nextRound(state);
  }

  /* ───────────────────────── 6. 发射与飞行 ───────────────────────── */

  function launch(state, faction, siloId, targetCityId) {
    var silo = findUnit(state, siloId);
    if (!silo || silo.type !== 'silo' || silo.missiles <= 0 || silo.faction !== faction) return null;
    var city = findCity(state, targetCityId);
    if (!city || !city.alive || city.pop <= 0) return null;

    silo.missiles--;
    var dist = G.distKm(silo, city);
    var m = {
      id: 'M' + (state.missileSeq++),
      faction: faction,
      siloId: siloId,
      from: { lat: silo.lat, lon: silo.lon },
      to: { lat: city.lat, lon: city.lon },
      targetCityId: city.id,
      targetFaction: city.faction,
      dist: dist,
      dur: G.flightSeconds(dist),
      t: 0,
      progress: 0,
      alive: true,
      intercepted: false,
      impacted: false,
      tried: {}          // 已尝试拦截的 SAM，避免同一 SAM 对同一弹反复判定
    };
    state.missiles.push(m);
    state.stats[faction].launched++;
    return m;
  }

  // 进入敌方 SAM 覆盖角内即触发一次拦截判定；每个 SAM 对同一枚弹只判一次。
  function tryIntercept(state, m) {
    var cur = G.slerpLL(m.from, m.to, m.progress);
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.type !== 'sam' || u.faction !== m.targetFaction) continue;
      if (u.ammo <= 0 || m.tried[u.id]) continue;
      if (G.angular(cur, u) * RAD2DEG > CONFIG.samRadiusDeg) continue;
      m.tried[u.id] = 1;
      if (state.rng() < CONFIG.samInterceptProb) {
        u.ammo--;
        u.cooldown = CONFIG.samCooldownSec;
        m.alive = false;
        m.intercepted = true;
        state.stats[u.faction].intercepts++;
        log(state, u.faction + ' 防空拦截 1 枚来自 ' + m.faction + ' 的导弹');
        return true;
      }
    }
    return false;
  }

  function resolveImpact(state, m) {
    m.alive = false;
    m.impacted = true;
    var city = findCity(state, m.targetCityId);
    if (!city || !city.alive) return;
    // 防御层抵扣一次命中：消耗一层，杀伤按 cityDefenseFactor 折算
    var rate = CONFIG.killRate;
    if (city.defCharges > 0) {
      city.defCharges--;
      rate *= CONFIG.cityDefenseFactor;
      log(state, city.name + ' 防御层生效，第 ' + (city.defCharges + 1) + ' 层被击穿');
    }
    var lost = city.pop * rate;
    city.pop = Math.max(0, city.pop - lost);
    // 人口被打到不足 1 百万即视为抹除：光点熄灭，不再是可打击目标
    if (city.pop < 1) { city.pop = 0; city.alive = false; }
    state.stats[m.faction].killed += lost;
    state.stats[city.faction].casualties += lost;
    log(state, m.faction + ' 命中 ' + city.faction + '/' + city.name + '，损失 ' + lost.toFixed(1) + 'M');
  }

  // 特效事件队列：导弹结算后不再留在 missiles 里，改为把结果投递到 state.fx，
  // 由 render.js 消费（拦截闪光 / 核爆）。逻辑层因此不必为渲染保留死弹。
  function pushFx(state, type, m) {
    var at = (type === 'impact')
      ? { lat: m.to.lat, lon: m.to.lon }
      : G.slerpLL(m.from, m.to, m.progress);
    state.fx.push({
      type: type, lat: at.lat, lon: at.lon,
      faction: m.faction, targetFaction: m.targetFaction,
      cityId: m.targetCityId, t: state.t
    });
    if (state.fx.length > 200) state.fx.shift();
  }

  function updateMissiles(state, dt) {
    var alive = [];
    for (var i = 0; i < state.missiles.length; i++) {
      var m = state.missiles[i];
      if (!m.alive) continue;
      m.t += dt;
      m.progress = Math.min(1, m.t / m.dur);
      // 飞过六成航程后才可能进入对方防空圈，省去大部分无谓计算
      if (m.progress > 0.6 && !m.intercepted) tryIntercept(state, m);
      if (!m.alive) { pushFx(state, 'intercept', m); continue; }
      if (m.progress >= 1) { resolveImpact(state, m); pushFx(state, 'impact', m); continue; }
      alive.push(m);
    }
    state.missiles = alive;
  }

  // SAM 弹药按冷却逐发恢复；冷却中的 SAM 不参与拦截（ammo<=0 已在 tryIntercept 排除）
  function updateSam(state, dt) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.type !== 'sam' || u.cooldown <= 0) continue;
      u.cooldown -= dt;
      if (u.cooldown <= 0) {
        u.cooldown = 0;
        u.ammo = Math.min(u.maxAmmo, u.ammo + 1);
        if (u.ammo < u.maxAmmo) u.cooldown = CONFIG.samCooldownSec;
      }
    }
  }

  /* ───────────────────────── 7. tick ───────────────────────── */

  function tick(state, dt) {
    if (!state || state.phase === 'over') return state;
    dt = (dt == null) ? TICK : dt;

    if (state.phase === 'briefing') {
      state.t += dt;
      if (state.t >= CONFIG.briefingSeconds) enterPhase(state, 'crisis');
      return state;
    }

    if (state.phase === 'crisis') {
      state.t += dt;
      if (state.t >= CONFIG.roundSeconds) { state.t = 0; resolveRound(state); }
      return state;
    }

    if (state.phase === 'war') {
      state.t += dt;
      updateMissiles(state, dt);
      updateSam(state, dt);

      // AI 开火节奏（玩家席位交给玩家操作，除非开启 autoPlayer 托管）
      state.factions.forEach(function (f) {
        if (state.nextFire[f.code] == null) return;
        if (f.isPlayer && !state.autoPlayer) return;
        state.nextFire[f.code] -= dt;
        if (state.nextFire[f.code] > 0) return;
        if (DC.ai && DC.ai.planFire) DC.ai.planFire(state, f.code);
        state.nextFire[f.code] = randRange(state.rng, CONFIG.aiFireMinSec, CONFIG.aiFireMaxSec);
      });

      // 终局条件：计时到 / 全部弹尽 / 长时间无在飞导弹
      var anyMissile = state.missiles.some(function (m) { return m.alive; });
      var anyAmmo = state.factions.some(function (f) { return totalMissiles(state, f.code) > 0; });
      if (!anyMissile) {
        state.idleSec = (state.idleSec || 0) + dt;
        if (state.idleSec > CONFIG.warIdleEndSec) { state.warEndedEarly = true; enterPhase(state, 'over'); return state; }
      } else {
        state.idleSec = 0;
      }
      // 弹尽须同时满足「无在飞导弹」才能终局 —— 否则最后一枚弹会在空中被判负、永远落不下来
      if (state.t >= CONFIG.warSeconds || (!anyAmmo && !anyMissile)) { enterPhase(state, 'over'); }
      return state;
    }

    return state;
  }

  // 按固定步长把一段真实时间消化掉，掉帧也不会改变逻辑结果
  function advance(state, seconds) {
    var remain = seconds;
    while (remain > 1e-9 && state.phase !== 'over') {
      var step = Math.min(TICK, remain);
      tick(state, step);
      remain -= step;
    }
    return state;
  }

  /* ───────────────────────── 8. 计分 ─────────────────────────
   * DESIGN §6.2：得分 = 敌方伤亡 − 己方伤亡（百万人为单位）。赢不是灭了对手，是死得比他少。
   */
  function ranking(state) {
    return state.factions.map(function (f) {
      var s = state.stats[f.code] || { killed: 0, casualties: 0 };
      var alive = citiesOf(state, f.code).reduce(function (n, c) { return n + (c.alive ? 1 : 0); }, 0);
      return {
        code: f.code, name: f.name, color: f.color,
        killed: s.killed, casualties: s.casualties,
        score: s.killed - s.casualties,
        citiesAlive: alive,
        missilesLeft: totalMissiles(state, f.code)
      };
    }).sort(function (a, b) {
      return (b.score - a.score) || (a.casualties - b.casualties) || (a.code < b.code ? -1 : 1);
    });
  }

  /* ───────────────────────── 9. 指令 ───────────────────────── */

  function choose(state, faction, optionIndex) {
    if (state.phase !== 'crisis' || !state.card) return false;
    if (optionIndex < 0 || optionIndex >= state.card.options.length) return false;
    state.choices[faction] = optionIndex;
    return true;
  }

  // 选出发射距离最近、且仍有弹的己方发射井。
  // 放在 sim 而非 ui/game：这是纯状态查询，无头测试要能直接断言（玩家点击发射与 AI 开火共用同一条选井规则）。
  function nearestSilo(state, faction, target) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.type !== 'silo' || u.faction !== faction || u.missiles <= 0) continue;
      var d = G.distKm(u, target);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  // 玩家一键发射：给定目标城市，自动用最近的可用井打一发。
  // 返回导弹对象；无弹/无井/目标已毁/非战争阶段均返回 null（由 UI 层给出提示）。
  function playerFire(state, cityId) {
    if (state.phase !== 'war') return null;
    var city = findCity(state, cityId);
    if (!city || !city.alive || city.pop <= 0) return null;
    if (city.faction === state.playerFaction) return null;
    var silo = nearestSilo(state, state.playerFaction, city);
    if (!silo) return null;
    var m = launch(state, state.playerFaction, silo.id, cityId);
    if (m) log(state, '我方 ' + silo.id + ' 发射 → ' + city.name);
    return m;
  }

  /* ───────────────────────── 导出 ───────────────────────── */
  DC.sim = {
    TICK: TICK,
    makeRng: makeRng,
    create: create,
    tick: tick,
    advance: advance,
    choose: choose,
    launch: launch,
    nearestSilo: nearestSilo,
    playerFire: playerFire,
    ranking: ranking,
    defconOf: defconOf,
    findCity: findCity,
    findUnit: findUnit,
    findFaction: findFaction,
    unitsOf: unitsOf,
    citiesOf: citiesOf,
    enemyCities: enemyCities,
    totalMissiles: totalMissiles
  };

})(typeof window !== 'undefined' ? window : globalThis);
