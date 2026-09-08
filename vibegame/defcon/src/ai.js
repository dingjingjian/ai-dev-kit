/*
 * defcon — ai.js
 * 五个 AI 共用一个决策函数，靠性格系数区分（DESIGN §4.3）
 * 依赖：data.js → geo.js → sim.js（本文件在 sim 之后加载，运行时才被调用）
 * 命名空间：window.DC（经典脚本，无 import/export/type=module）
 *
 * 决策公式（§4.3）：
 *   得分 = 危机值修正 × hawkishness + 副作用权重 + 随机扰动
 * hawkishness ∈ [-1,1]：鹰派偏好激化、鸽派偏好缓和。
 * 一行系数让五个 AI 各有脾气 —— 玩家会慢慢摸清「北方是火药桶，东亚在踩刹车」。
 *
 * 确定性：随机扰动一律走 state.rng（种子化），同种子同输入必然同结果，便于 tests/ 无头断言。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};
  var CONFIG = DC.CONFIG || {};
  var G = DC.geo;

  var CRISIS_NORM = 30;        // crisis 归一化基准（§4.2：极端选项可达 ±30）

  /* 副作用对「承受方」的价值：正为有利、负为不利。
   * 作用对象为敌方（target:'enemy'）时符号取反，换算成对己方的价值。
   */
  var EFFECT_VALUE = {
    expose_silo:  -0.30,       // 暴露发射井 —— 在 §5 溯源机制下是实打实的代价
    reveal_radar: -0.20,       // 雷达位置被揭示
    city_defense:  0.25,       // 城市防空 +1 级
    pop_loss:     -0.40,       // 直接人口损失
    radar_down:   -0.15,       // 雷达停摆
    // 事件奖励 effect（§4.2 奖励驱动）—— 对己方有利，AI 会倾向选带奖励的选项
    add_radar:     0.30,       // 增建雷达
    add_sam:       0.30,       // 增建防空
    add_missiles:  0.35,       // 补充核弹
    boost_pop:     0.20,       // 人口回升
    intel_city:   -0.35        // 获取敌方城市情报（target:'enemy' 取反后为正收益）
  };

  function effectAmount(eff) {
    if (eff.type === 'pop_loss') return eff.amount || 1;
    if (eff.type === 'city_defense') return eff.amount || 1;
    if (eff.type === 'radar_down') return eff.turns || 1;
    return 1;
  }

  function effectWeight(eff) {
    if (!eff) return 0;
    var base = (EFFECT_VALUE[eff.type] || 0) * effectAmount(eff);
    return (eff.target === 'enemy') ? -base : base;
  }

  /* ───────────────────────── 1. 事件卡决策 ─────────────────────────
   * 返回选中选项的下标。纯打分 + 取最大，无分支策略，便于断言性格确实起作用。
   */
  function scoreOption(state, option, hawkishness) {
    /* crisis:'MAX' 对 AI 不是无条件可选：只有危机值已经烧过 CONFIG.aiMaxMinCrisis（默认 70）
     * 时才按 crisisMaxAiScore 参与打分，否则判为 -Infinity 直接排除。
     * 没有这道闸门，六个 AI 里只要有一个鹰派（ALFA 0.9），第一回合就会把世界点了，
     * 危机博弈阶段的存在意义归零。玩家不受此限 —— 主动引爆是玩家的特权。 */
    if (DC.isCrisisMax(option)) {
      var gate = (CONFIG.aiMaxMinCrisis != null) ? CONFIG.aiMaxMinCrisis : 70;
      if (state.crisis < gate) return -Infinity;
    }
    var s = (DC.crisisValue(option) / CRISIS_NORM) * hawkishness;
    if (option.effect) s += effectWeight(option.effect);
    var noise = (CONFIG.aiNoise != null) ? CONFIG.aiNoise : 0.2;
    s += (state.rng() - 0.5) * 2 * noise;
    return s;
  }

  function chooseEvent(state, faction) {
    var card = state.card;
    if (!card || !card.options || !card.options.length) return 0;
    var f = DC.sim.findFaction(state, faction);
    var hawk = f ? f.hawkishness : 0;
    var best = -1, bestScore = -Infinity;
    for (var i = 0; i < card.options.length; i++) {
      var s = scoreOption(state, card.options[i], hawk);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    // 理论上不会发生（至多排除 'MAX'，普通选项总有有限分），留兜底避免返回 -1
    return best < 0 ? 0 : best;
  }

  /* ───────────────────────── 2. 战争期开火决策 ───────────────────────── */

  /* 目标选择：按「单位时间收益」排序 —— 人口越高、飞行越短越优先。
   *
   * ⚠ 这里有一个必须绕开的陷阱（D2 实测发现）：
   *   若死盯得分最高的那一个目标，六方火力会同时砸向地理上最居中的阵营。
   *   实测 ECHO（赤道带，横跨全球，被接近度 2500 km）被集火到伤亡 58.5M、胜率 0；
   *   而 FOXTROT（南洋偏远，被接近度 6072 km）零伤亡、胜率 83%。地缘直接决定胜负，决策失去意义。
   *
   * 两道修正：
   *  1. 飞行时间以 aiDistWeight 为指数进入分母 —— 压低距离权重，避免远阵营彻底无人问津；
   *  2. 在得分最高的前 aiTargetTopK 个目标里按权重随机 —— 火力分散，也更像真实战略决策。
   */
  function pickTarget(state, faction, used) {
    var cands = DC.sim.enemyCities(state, faction).filter(function (c) { return !used[c.id]; });
    if (!cands.length) return null;
    var silos = DC.sim.unitsOf(state, faction, 'silo').filter(function (u) { return u.missiles > 0; });
    if (!silos.length) return null;

    var w = (CONFIG.aiDistWeight != null) ? CONFIG.aiDistWeight : 0.5;
    var scored = cands.map(function (c) {
      var minDur = Infinity;
      silos.forEach(function (s) {
        var dur = G.flightSeconds(G.distKm(s, c));
        if (dur < minDur) minDur = dur;
      });
      return { c: c, sc: c.pop / Math.pow(minDur + 8, w) };
    });
    scored.sort(function (a, b) { return b.sc - a.sc; });

    var K = Math.min(CONFIG.aiTargetTopK || 5, scored.length);
    var top = scored.slice(0, K);
    var totalW = 0;
    top.forEach(function (x) { totalW += x.sc; });
    if (!(totalW > 0)) return top[0].c;

    var r = state.rng() * totalW, acc = 0;
    for (var i = 0; i < top.length; i++) {
      acc += top[i].sc;
      if (r <= acc) return top[i].c;
    }
    return top[top.length - 1].c;
  }

  // 井选择：取离目标最近且有弹的井（飞行快、更早命中）
  function pickSilo(state, faction, target) {
    var silos = DC.sim.unitsOf(state, faction, 'silo').filter(function (u) { return u.missiles > 0 && !u.disabled; });
    var best = null, bestD = Infinity;
    silos.forEach(function (s) {
      var d = G.distKm(s, target);
      if (d < bestD) { bestD = d; best = s; }
    });
    return best;
  }

  /* 每批开火：单批发射量由鹰派系数决定（鸽派 1 枚、鹰派最多 aiSalvoMax 枚）。
   * 保留反击弹：战争前 60% 时长内不动用最后 aiReserveRatio 的部分 —— 这是 §6.2
   * 伤亡差计分逼出的行为，也是「留几枚反击」内核在 AI 侧的落地。
   */
  function planFire(state, faction) {
    var silos = DC.sim.unitsOf(state, faction, 'silo').filter(function (u) { return u.missiles > 0 && !u.disabled; });
    if (!silos.length) return [];
    if (!DC.sim.enemyCities(state, faction).length) return [];

    var f = DC.sim.findFaction(state, faction);
    var hawk = f ? f.hawkishness : 0;
    var total = DC.sim.totalMissiles(state, faction);
    var reserve = Math.round(CONFIG.silosPerFaction * CONFIG.missilesPerSilo * (CONFIG.aiReserveRatio || 0));
    var early = (state.t / CONFIG.warSeconds) < 0.6;
    var usable = early ? Math.max(0, total - reserve) : total;
    if (usable <= 0) return [];

    var salvoMax = Math.max(1, Math.round(1 + (hawk + 1) / 2 * (CONFIG.aiSalvoMax - 1)));
    var salvo = Math.min(usable, 1 + Math.floor(state.rng() * salvoMax));

    var fired = [], used = {};
    for (var i = 0; i < salvo; i++) {
      var target = pickTarget(state, faction, used);
      if (!target) break;
      used[target.id] = 1;
      var silo = pickSilo(state, faction, target);
      if (!silo) break;
      var m = DC.sim.launch(state, faction, silo.id, target.id);
      if (m) fired.push(m);
    }
    return fired;
  }

  /* ───────────────────────── 导出 ───────────────────────── */
  DC.ai = {
    CRISIS_NORM: CRISIS_NORM,
    EFFECT_VALUE: EFFECT_VALUE,
    effectWeight: effectWeight,
    scoreOption: scoreOption,
    chooseEvent: chooseEvent,
    pickTarget: pickTarget,
    pickSilo: pickSilo,
    planFire: planFire
  };

})(typeof window !== 'undefined' ? window : globalThis);
