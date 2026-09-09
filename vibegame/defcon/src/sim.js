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
  var CITY_POP_CAP = 20;          // 单城规模上限（百万）—— 与 boost_pop 的上限同口径

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
      maxedBy: null,             // 危机值被拉满的原因（'MAX' 选项 / 核弹落地），供日志与终局回溯
      playerFaction: opts.playerFaction || 'ALFA',
      autoPlayer: !!opts.autoPlayer,   // 开启后玩家席位也交给 AI（用于无人值守跑完整局演示/测试）
      warEndedEarly: false,
      missileSeq: 0,
      /* 累计核爆落地数。render 每帧会 shift 清空 state.fx，UI 读不到「刚刚爆炸了」，
       * 故在逻辑层留一个单调计数器：UI 比对前后值即可触发全屏白闪与相机震动。
       * 同时它也是无头断言「核弹真的落地了」的最直接读数。 */
      impacts: 0,
      /* 首枚落地核弹的记录（终局复盘用）。
       * 「谁先动手」在核战题材里是复盘的第一问题，但 stats 只有累计伤亡，
       * 事后无法回答 —— 于是在落地那一刻把这一发单独钉下来。 */
      firstImpact: null,
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
    // 阵营特色（perk）按 DC.perkOf 调整人口：DELTA ×1.3（人口最多）、FOXTROT ×0.8（稀疏）
    DC.CITIES.forEach(function (c) {
      var mul = DC.perkOf(c.faction).popMul;
      var p = Math.max(3, Math.round(c.pop * mul));
      state.cities.push({
        id: c.id, faction: c.faction, name: c.name,
        lat: c.lat, lon: c.lon,
        pop0: p, pop: p, alive: true,
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
      // hits / lost 是**枚数**口径（killed 是人口口径，算不出命中率）：
      // 命中率 = hits / (hits + lost)，终局复盘用它回答「我的弹都去哪了」。
      state.stats[f.code] = { killed: 0, casualties: 0, launched: 0, intercepts: 0, hits: 0, lost: 0 };
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
  /* 海陆掩膜（§11.11，src/landmask.js）：布阵必须有真实的海陆概念。
   * 旧版用「离最近城市 ≥ 9°」当深海判据 —— 城市只是陆地的稀疏采样点，
   * 撒哈拉 / 澳洲内陆 / 中亚离城市都很远但分明是陆地，实测 12 艘潜艇 7 艘爬上了岸，
   * 发射井也有一批修进了海里。掩膜由 Natural Earth 110m 海岸线光栅化而来。
   * 掩膜缺失时（旧调用方未加载 landmask.js）回退到旧的最近城市判据，保证可运行。 */
  var LAND = DC.land || null;
  var SEA_MIN_DEG = 9;          // 回退判据：离最近城市 ≥ 9°（约 1000 km）
  var GOLDEN = 137.507765;      // 黄金角：同一城市的多个单位错开方位用

  function minDeg(p, list) {
    var m = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = G.angular(p, list[i]) * RAD2DEG;
      if (d < m) m = d;
    }
    return m;
  }
  function isWaterPt(p) {
    return LAND ? LAND.isWater(p.lat, p.lon)
                : minDeg(p, DC.CITIES) >= SEA_MIN_DEG;
  }
  /* 深海判据：点位本身是水，且四邻（±2°）也都是水 —— 不贴海岸线。
   * 贴岸蹲着既不符合"藏在深海里"的叙事，也会被玩家一眼看穿是布点错位。 */
  function isDeepWaterPt(p) {
    return LAND ? LAND.isDeepWater(p.lat, p.lon, 2)
                : minDeg(p, DC.CITIES) >= SEA_MIN_DEG + 2;
  }
  function isLandPt(p) {
    return LAND ? LAND.isLand(p.lat, p.lon)
                : minDeg(p, DC.CITIES) < SEA_MIN_DEG;
  }

  /* 大洋候选点（§11.10b → §11.11 重制）：潜艇要待在深海里，不是"离城市远一点"就算。
   * 用真实掩膜过 isDeepWater 筛出深海格点；全局只算一次，六方共用。
   * 范围裁到 -60°~70° 纬度：南大洋与北冰洋不适合作为巡逻海区（冰缘 / 过远）。 */
  function oceanCandidates() {
    var cands = [];
    for (var lat = -60; lat <= 70; lat += 4) {
      for (var lon = -180; lon < 180; lon += 4) {
        var p = { lat: lat, lon: lon };
        if (isDeepWaterPt(p)) cands.push({ lat: lat, lon: lon });
      }
    }
    return cands;
  }

  /* 在城市周围 spreadDeg 的环上采样 36 个方位，选评分最高的落点。
   * 这是布阵的通用选点器：发射井用它找「离敌国尽量远」的内陆纵深，
   * 防空 / 雷达用它避免贴进海里，潜艇不用它（走全大洋选点）。
   * filterFn 可选：硬性筛掉不合格落点（如落水）；筛完为空则放弃过滤兜底 ——
   * 岛城（檀香山 / 苏瓦）周边实在没有陆地时，宁可落水也不至于无点可用。
   * 采样方位含 salt 偏移，保证确定性且不同单位不重叠。 */
  function pickAround(city, spreadDeg, idx, salt, scoreFn, filterFn) {
    var base = (GOLDEN * idx + salt) % 360;
    var cands = [];
    for (var i = 0; i < 36; i++) {
      var brg = (base + i * 10) % 360;
      var p = G.destination(city, brg, spreadDeg);
      if (!filterFn || filterFn(p)) cands.push(p);
    }
    if (!cands.length) {   // 全被筛掉 → 放弃硬性条件，回退全采样（岛城场景）
      for (var j = 0; j < 36; j++) {
        cands.push(G.destination(city, (base + j * 10) % 360, spreadDeg));
      }
    }
    var best = null, bestS = -Infinity;
    for (var k = 0; k < cands.length; k++) {
      var s = scoreFn(cands[k]);
      if (s > bestS) { bestS = s; best = cands[k]; }
    }
    return best;
  }

  function deployUnits() {
    var units = [];
    var ocean = oceanCandidates();
    /* 已占用的巡逻海域（跨阵营共享）：六方都在挑「远离本土的那片深海」，
     * 不加全局排重就会出现两方潜艇蹲在同一个坐标上（实测 0 km 重合）。 */
    var usedSubs = [];

    DC.FACTIONS.forEach(function (f) {
      var perk = DC.perkOf(f.code);
      var cities = DC.CITIES_BY_FACTION[f.code].slice();
      // 确定性排序：规模降序，同规模按 id，保证同种子布阵一致
      cities.sort(function (a, b) { return (b.pop - a.pop) || (a.id < b.id ? -1 : 1); });
      var salt = f.code.charCodeAt(0) * 13 + f.code.length * 7;   // 阵营间错开起始方位
      // 敌方全部城市：发射井选点的「离敌国尽量远」评分基准
      var foes = [];
      DC.FACTIONS.forEach(function (o) {
        if (o.code !== f.code) foes = foes.concat(DC.CITIES_BY_FACTION[o.code]);
      });

      /* 就近绑定（2026-09-09）：单位落在哪，就归属离它最近的那座城 —— 连线必须就近，
       * 否则球面上会出现一条横穿大陆的长线，把两张图（单位、城市）的关系画乱。 */
      function nearestCityId(p) {
        var best = cities[0], bd = Infinity;
        cities.forEach(function (c) {
          var d = G.angular(p, c);
          if (d < bd) { bd = d; best = c; }
        });
        return best.id;
      }
      /* 均匀分摊城市：第 i 个同类单位取第 ⌊i·len/n⌋ 座城。
       * 旧版用 (i*2)%len 之类的步长取样，同类单位会挤在同一批城市上（另一批城市一个都没有），
       * 球面上看着就是"防御全堆在一角"。 */
      function cityFor(i, n) {
        return cities[Math.floor(i * cities.length / Math.max(1, n)) % cities.length];
      }
      /* 陆地优先评分：内陆纵深 2.5 分 > 沿海陆地 0.5 分 > 落水 -3 分。
       * 岛城（檀香山 / 苏瓦）周边实在没有陆地时评分全为负，取最大值即"最靠陆地的一点"。 */
      function landScore(p) {
        if (!LAND) return 0;
        if (LAND.isInland(p.lat, p.lon, 1)) return 2.5;
        return LAND.isLand(p.lat, p.lon) ? 0.5 : -3;
      }

      // SAM：守规模最高的若干城，贴城布防（数量由 perk 决定），方位挑陆地一侧
      for (var s = 0; s < perk.sam; s++) {
        var cs = cities[s % cities.length];
        var ps = pickAround(cs, 1.5, s, salt, landScore);
        units.push({
          id: f.code + '-SAM-' + s, faction: f.code, type: 'sam',
          lat: ps.lat, lon: ps.lon, cityId: nearestCityId(ps), disabled: false,
          ammo: CONFIG.samCapacity, maxAmmo: CONFIG.samCapacity, cooldown: 0
        });
      }
      // 雷达：均匀分摊到不同城市，分散覆盖（数量与半径由 perk 决定），同样偏陆地侧
      for (var r = 0; r < perk.radar; r++) {
        var cr = cityFor(r, perk.radar);
        var pr = pickAround(cr, 3, r + 10, salt, landScore);
        units.push({
          id: f.code + '-RAD-' + r, faction: f.code, type: 'radar',
          lat: pr.lat, lon: pr.lon, cityId: nearestCityId(pr), disabled: false,
          radiusDeg: perk.radarRadiusDeg, down: 0
        });
      }
      /* 发射井（§11.11 重制）：修在本土纵深处。
       * 旧版方位用黄金角随机撒，实测 ALFA 有发射井落在距敌国城市 1° 的地方（铁京旁边），
       * 还有一批掉进海里 —— 都不合"战略武器藏在本土纵深"的叙事。
       * 新逻辑：保持与绑定城市的距离不变（5–10°），在该环上采样 36 个方位，
       * 取「离敌国最近城市尽量远 + 内陆加分」最高的落点。 */
      for (var k = 0; k < perk.silos; k++) {
        var ck = cityFor(k, perk.silos);
        var spread = 5 + (k % 3) * 2.5;
        /* 半径递减重试：窄长国土（新西兰 / 日本）在 10° 半径上可能整环是海，
         * 与其把井修进海里，不如收拢到本土更近的陆地上（3.5° 是保底纵深）。 */
        var tries = [spread, Math.max(3.5, spread * 0.6), 3.5];
        var pk = null;
        for (var t = 0; t < tries.length; t++) {
          pk = pickAround(ck, tries[t], k + 20, salt, function (p) {
            return minDeg(p, foes) + landScore(p);
          }, isLandPt);   // 井必须落在陆上（岛城无陆地才回退落水）
          if (!LAND || LAND.isLand(pk.lat, pk.lon)) break;
        }
        units.push({
          id: f.code + '-SILO-' + k, faction: f.code, type: 'silo',
          lat: pk.lat, lon: pk.lon, cityId: nearestCityId(pk), disabled: false,
          missiles: perk.missilesPerSilo,
          cap: perk.missilesPerSilo + (CONFIG.siloExtraCap || 0),   // 回合补弹的上限（§11.13）
          exposed: false
        });
      }
      /* 潜艇（§11.10b / §11.11 重制）：**不绑定城市**（cityId = null）—— 它在大洋深处巡逻，
       * 画一条线连回本国城市既不符合叙事，也会在球面上拉出一条跨越半个地球的长线。
       * 选点三条原则（用户定稿口径）：
       *   ① 尽量远离本土 —— 评分主项是「离本国最近城市的距离」；
       *   ② 覆盖远离本土的目标区 —— 离敌国城市不能太远（太远就是漂在无用海域）；
       *   ③ 潜艇之间不要太近 —— 全局共享的间距约束（≥28°，约 3100 km）。
       * 三档放松间距：实在凑不齐（掩膜深海点不足）时降到 18° / 0° 兜底。 */
      (function () {
        var want = perk.subs || 0;
        var scored = ocean.map(function (p) {
          var od = minDeg(p, cities);
          var fd = minDeg(p, foes);
          /* 主项：远离本土；修正：敌城太远的海域价值低（−0.3/°），
           * 超出 22° 后额外惩罚（−0.8/°）—— 保证选出的点既能藏、也够得着对手。 */
          var sc = od - 0.3 * fd - 0.8 * Math.max(0, fd - 22);
          return { lat: p.lat, lon: p.lon, sc: sc };
        }).sort(function (a, b) {
          return (b.sc - a.sc) || (a.lat - b.lat) || (a.lon - b.lon);
        });
        var picked = [];
        [28, 18, 0].some(function (sep) {
          for (var i = 0; i < scored.length && picked.length < want; i++) {
            var p = scored[i], ok = true, j;
            for (j = 0; j < usedSubs.length; j++) {
              if (G.angular(p, usedSubs[j]) * RAD2DEG < sep) { ok = false; break; }
            }
            if (ok) for (j = 0; j < picked.length; j++) {
              if (G.angular(p, picked[j]) * RAD2DEG < sep) { ok = false; break; }
            }
            if (ok) { picked.push(p); usedSubs.push(p); }
          }
          return picked.length >= want;
        });
        picked.forEach(function (p, b) {
          units.push({
            id: f.code + '-SUB-' + b, faction: f.code, type: 'sub',
            lat: p.lat, lon: p.lon, cityId: null, disabled: false,
            missiles: perk.missilesPerSub,
            cap: perk.missilesPerSub + (CONFIG.siloExtraCap || 0),
            exposed: false
          });
        });
      })();
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
  // 某城市关联的全部设施（发射井/防空/雷达绑定到城市，城市被毁则关联设施失效）
  function unitsOfCity(state, cityId) {
    return state.units.filter(function (u) { return u.cityId === cityId; });
  }
  // 敌方存活城市（按人口降序，人口相同按 id）—— AI 与 UI 共用同一排序，保证所见即所选
  function enemyCities(state, faction) {
    return state.cities.filter(function (c) {
      return c.faction !== faction && c.alive && c.pop > 0;
    }).sort(function (a, b) { return (b.pop - a.pop) || (a.id < b.id ? -1 : 1); });
  }
  // 全部可发射单位（发射井 + 潜艇）—— 潜艇是机动发射平台，与井同权（§11.10）
  function launchersOf(state, faction) {
    return state.units.filter(function (u) {
      return u.faction === faction && (u.type === 'silo' || u.type === 'sub') && !u.disabled;
    });
  }
  function totalMissiles(state, faction) {
    return launchersOf(state, faction).reduce(function (s, u) { return s + u.missiles; }, 0);
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

      /* ── 事件奖励 effect（DESIGN §4.2 奖励驱动）──
       * 给"正面"选项挂奖励，让危机博弈不只是"加还是减"的危机值选择：
       *   add_radar / add_sam   —— 己方增建雷达/防空（和平红利、科研突破）
       *   add_missiles          —— 己方发射井补充核弹
       *   boost_pop             —— 己方城市规模回升（战后重建）
       *   intel_city            —— 获取敌方城市情报，暴露其关联设施 */
      } else if (e.type === 'add_radar') {
        var cr = citiesOf(state, f.code).filter(function (c) { return c.alive; })
          .sort(function (a, b) { return b.pop - a.pop; })[0];
        if (cr) {
          var pk = G.destination(cr, 37, 3);
          state.units.push({
            id: f.code + '-RAD-X' + state.units.length, faction: f.code, type: 'radar',
            lat: pk.lat, lon: pk.lon, cityId: cr.id, disabled: false,
            radiusDeg: DC.perkOf(f.code).radarRadiusDeg, down: 0
          });
          log(state, f.code + ' 新增 1 座雷达预警站');
        }

      } else if (e.type === 'add_sam') {
        var cs = citiesOf(state, f.code).filter(function (c) { return c.alive; })
          .sort(function (a, b) { return b.pop - a.pop; })[0];
        if (cs) {
          var ps = G.destination(cs, 71, 1.5);
          state.units.push({
            id: f.code + '-SAM-X' + state.units.length, faction: f.code, type: 'sam',
            lat: ps.lat, lon: ps.lon, cityId: cs.id, disabled: false,
            ammo: CONFIG.samCapacity, maxAmmo: CONFIG.samCapacity, cooldown: 0
          });
          log(state, f.code + ' 新增 1 处防空阵地');
        }

      } else if (e.type === 'add_missiles') {
        launchersOf(state, f.code).forEach(function (u) {
          if (u.disabled) return;
          // 与回合补弹共用同一 cap（§11.13）：井库容就那么大，超发会把弹凭空变出来
          var add = e.amount || 1;
          var real = Math.min(launcherCap(u), u.missiles + add) - u.missiles;
          if (real > 0) { u.missiles += real; n++; }
        });
        if (n) log(state, f.code + ' 为 ' + n + ' 座发射井各补充 ' + (e.amount || 1) + ' 枚核弹');

      } else if (e.type === 'boost_pop') {
        /* §11.2 扩展：mode='ratio' 时按阵营初始人口总量等比放大（巩固基本盘），
         * mode='fixed'（默认）保持原「最大城市 +N」行为。
         * ratio 模式下 amount=0.05 表示全阵营各城 pop ×1.05，与 §6.2 改为「看剩余人口计分」呼应。 */
        if (e.mode === 'ratio') {
          var r = (e.amount || 0.05);
          citiesOf(state, f.code).forEach(function (c) {
            if (!c.alive || c.pop <= 0) return;
            var np = Math.min(20, c.pop * (1 + r));
            if (np > c.pop) { c.pop = np; c.pop0 = Math.max(c.pop0, c.pop); n++; }
          });
          if (n) log(state, f.code + ' 全境规模回升 +' + (r * 100).toFixed(0) + '%（共 ' + n + ' 城）');
        } else {
          var cb = citiesOf(state, f.code).filter(function (c) { return c.alive; })
            .sort(function (a, b) { return b.pop - a.pop; })[0];
          if (cb) {
            var gain = e.amount || 1;
            cb.pop = Math.min(20, cb.pop + gain);
            cb.pop0 = Math.max(cb.pop0, cb.pop);
            log(state, f.code + ' ' + cb.name + ' 人口回升 +' + gain + 'M');
          }
        }

      } else if (e.type === 'intel_city') {
        var tgts = state.cities.filter(function (c) { return c.faction !== f.code && c.alive; })
          .sort(function (a, b) { return b.pop - a.pop; })
          .slice(0, e.amount || 1);
        tgts.forEach(function (c) {
          unitsOfCity(state, c.id).forEach(function (u) { if (!u.exposed) { u.exposed = true; n++; } });
        });
        log(state, f.code + ' 获取 ' + tgts.length + ' 座敌方城市情报，暴露 ' + n + ' 处设施');

      /* ── §11.2 新增：削弱 / 摧毁敌方设施 ──
       * 让危机博弈选项能直接削弱或摧毁敌方发射井 / 雷达 / 防空，
       * 与 §5 弹道溯源「先手暴露→被反击」形成因果闭环。
       *   degrade_facility —— 降低设施效能（不摧毁，但削弱战力）
       *     mode: 'ammo_half'（SAM 弹药减半）/ 'radius_half'（雷达半径减半）/ 'missiles_half'（井弹减半）
       *   destroy_facility —— 直接摧毁若干座敌方设施（disabled=true，不可恢复）
       * 两者都按人口最高的敌方城市优先选目标，体现「打掉对手的核心防备」。 */
      } else if (e.type === 'degrade_facility' || e.type === 'destroy_facility') {
        var fac = e.facility || 'silo';
        var amt = e.amount || 1;
        // 候选：敌方该类设施，按关联城市人口降序（打掉对手的核心防备）
        var cands = state.units.filter(function (u) {
          if (u.faction === f.code || u.disabled) return false;
          if (u.type !== fac) return false;
          return true;
        }).sort(function (a, b) {
          var ca = findCity(state, a.cityId), cb = findCity(state, b.cityId);
          return ((cb ? cb.pop : 0) - (ca ? ca.pop : 0)) || (a.id < b.id ? -1 : 1);
        });
        var hits = cands.slice(0, amt);
        if (e.type === 'destroy_facility') {
          hits.forEach(function (u) {
            u.disabled = true;
            if (u.type === 'silo') u.missiles = 0;
            if (u.type === 'sam') u.ammo = 0;
            u.exposed = true;     // 被打掉的设施自然暴露，玩家能看到战果
            n++;
          });
          if (n) log(state, f.code + ' 摧毁 ' + n + ' 处敌方 ' + fac + ' 设施');
        } else {
          var mode = e.mode || 'ammo_half';
          hits.forEach(function (u) {
            if (mode === 'ammo_half' && u.type === 'sam') {
              u.ammo = Math.floor(u.ammo / 2); n++;
            } else if (mode === 'radius_half' && u.type === 'radar') {
              u.radiusDeg = Math.max(5, (u.radiusDeg || CONFIG.radarRadiusDeg) / 2); n++;
            } else if (mode === 'missiles_half' && u.type === 'silo') {
              u.missiles = Math.floor(u.missiles / 2); n++;
            }
            u.exposed = true;
          });
          if (n) log(state, f.code + ' 削弱 ' + n + ' 处敌方 ' + fac + '（' + mode + '）');
        }
      }
    });
  }

  /* 「拉满」：把全局危机值直接推到 CONFIG.crisisMax 并立即进入热核战争（§4.4）。
   * 两个触发源 —— 任一方选中 crisis:'MAX' 的选项、或任一枚核弹落地。
   * 这是玩家手里唯一的「主动引爆」权：不想再被 8–14 回合的博弈拖着，就自己按下按钮。
   * 放在 sim 而非 ui：无头测试要能直接断言「选了 MAX 就一定开战」。 */
  function forceWar(state, reason) {
    if (state.phase === 'war' || state.phase === 'over') return false;
    state.crisis = (CONFIG.crisisMax != null) ? CONFIG.crisisMax : 100;
    state.defcon = defconOf(state.crisis);
    state.maxedBy = reason || 'unknown';
    log(state, '危机值拉满 100 —— ' + reason);
    if (state.card) applyEffects(state);
    enterPhase(state, 'war');
    return true;
  }

  /* ── 回合基础产能（§11.13）──
   * 每回合结算时六方都拿到：① 每座存活城市规模 ×(1+roundPopGrowth)（上限 CITY_POP_CAP，
   * 被抹除的城市不复活）；② +roundMissileGain 枚弹头，从回合数起轮转补进未满的发射井
   * （补到 cap 为止，潜艇不补——产能算本土工业的）。
   * 轮转起点按回合数推进，避免每回合都补同一口井。 */
  function launcherCap(u) {
    return u.cap || (CONFIG.missilesPerSilo + (CONFIG.siloExtraCap || 0));
  }
  function applyRoundGrowth(state) {
    state.factions.forEach(function (f) {
      citiesOf(state, f.code).forEach(function (c) {
        if (!c.alive || c.pop <= 0) return;
        c.pop = Math.min(CITY_POP_CAP, c.pop * (1 + (CONFIG.roundPopGrowth || 0)));
      });
      var gain = CONFIG.roundMissileGain || 0;
      if (gain <= 0) return;
      var launchers = launchersOf(state, f.code);
      if (!launchers.length) return;
      var start = (state.round || 0) % launchers.length;
      for (var i = 0; i < launchers.length && gain > 0; i++) {
        var u = launchers[(start + i) % launchers.length];
        if (u.disabled) continue;
        if (u.missiles < launcherCap(u)) { u.missiles++; gain--; }
      }
    });
  }

  /* 下一回合结算将带来的基础产能（不改状态）—— 供 UI 在统计栏常驻标记「+X/回合」。
   * 与 applyRoundGrowth 同一套口径（同一个轮转起点、同一个 cap），两边数字必须一致。 */
  function roundGrowthOf(state, code) {
    var pop = 0;
    citiesOf(state, code).forEach(function (c) {
      if (!c.alive || c.pop <= 0) return;
      pop += Math.min(CITY_POP_CAP, c.pop * (1 + (CONFIG.roundPopGrowth || 0))) - c.pop;
    });
    var launchers = launchersOf(state, code);
    var gain = CONFIG.roundMissileGain || 0, ms = 0;
    if (launchers.length) {
      var start = (state.round || 0) % launchers.length;
      for (var i = 0; i < launchers.length && gain > 0; i++) {
        var u = launchers[(start + i) % launchers.length];
        if (u.disabled) continue;
        if (u.missiles < launcherCap(u)) { ms++; gain--; }
      }
    }
    return { pop: pop, missiles: ms };
  }

  // 危机值由六方共同选择推出（DESIGN §4.1）：取六方 crisis 修正的均值 + 基础漂移。
  // 取均值而非求和，使危机值的量纲与单张卡的修正一致，漂移 +4 才有可预期的权重。
  function resolveRound(state) {
    // 拉满优先：只要有一方选了 crisis:'MAX'，本回合直接开战，不再走均值结算
    var maxedBy = null;
    state.factions.forEach(function (f) {
      if (maxedBy) return;
      var opt = state.card && state.card.options[state.choices[f.code]];
      if (opt && DC.isCrisisMax(opt)) maxedBy = f.code;
    });
    if (maxedBy) {
      var who = findFaction(state, maxedBy);
      forceWar(state, (who ? who.name : maxedBy) + ' 选择全面开战');
      return;
    }

    var sum = 0, n = 0;
    state.factions.forEach(function (f) {
      var idx = state.choices[f.code];
      var opt = state.card && state.card.options[idx];
      if (opt) { sum += DC.crisisValue(opt); n++; }
    });
    // 玩家超时未选：按最保守（crisis 最小）项计入，避免拖时间等于弃权
    if (n < state.factions.length && state.card) {
      var minC = Math.min.apply(null, state.card.options.map(DC.crisisValue));
      sum += minC * (state.factions.length - n);
      n = state.factions.length;
    }
    var avg = n ? sum / n : 0;
    // 阵营外交加成（perk: diplomacy）—— 每回合额外降温，体现外交斡旋的持续努力
    var dipSum = 0;
    state.factions.forEach(function (f) { dipSum += DC.perkOf(f.code).dipDrift; });
    state.crisis = Math.max(0, Math.min(100, state.crisis + CONFIG.crisisDrift + avg + dipSum));
    state.defcon = defconOf(state.crisis);
    log(state, '第 ' + state.round + ' 回合结算：平均 ' + avg.toFixed(1) + ' → 危机值 ' + state.crisis.toFixed(1) + '（DEFCON ' + state.defcon + '）');

    applyRoundGrowth(state);   // 基础产能先落账，再结算选项附加效果（§11.13）
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

  /* 发射：siloId 实为「发射单位 id」，发射井与潜艇共用同一条路径（§11.10）。
   * 潜艇发射同样暴露自身 —— 机动平台不是免死金牌，先手倾泻照样会被溯源。 */
  function launch(state, faction, siloId, targetCityId) {
    var silo = findUnit(state, siloId);
    if (!silo || (silo.type !== 'silo' && silo.type !== 'sub')) return null;
    if (silo.missiles <= 0 || silo.faction !== faction || silo.disabled) return null;
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
      if (u.disabled || u.ammo <= 0 || m.tried[u.id]) continue;
      if (G.angular(cur, u) * RAD2DEG > CONFIG.samRadiusDeg) continue;
      m.tried[u.id] = 1;
      // 拦截率按 SAM 所属阵营的 perk（BRAVO 防空加成）
      var prob = DC.perkOf(u.faction).samProb;
      if (state.rng() < prob) {
        u.ammo--;
        u.cooldown = CONFIG.samCooldownSec;
        /* §11.5 视觉同步：不立刻 m.alive=false，而是标记 intercepted 并开始拦截计时。
         * 立刻 pushFx('intercept') 让渲染层 spawnInterceptor 开始升空演出；
         * updateMissiles 在 interceptDelaySec 后才 m.alive=false，让核弹渐隐与拦截弹抵达同步。
         * 逻辑上「拦截已成功」—— ammo 已扣、阵地已暴露、stats 已计 —— 只是「击毁」推迟到视觉接触时。 */
        m.intercepted = true;
        m.interceptT = 0;
        m.interceptor = { lat: u.lat, lon: u.lon };
        // 我方核弹遭遇拦截 → 获取敌方防空位置（DESIGN §5 情报获取）
        u.exposed = true;
        state.stats[u.faction].intercepts++;
        state.stats[m.faction].lost++;        // 发射方视角：这一枚没打到
        log(state, u.faction + ' 防空拦截 1 枚来自 ' + m.faction + ' 的导弹，阵地暴露');
        pushFx(state, 'intercept', m);
        return true;
      }
    }
    return false;
  }

  /* 弹道溯源（DESIGN §5）：我方雷达探测到敌方核弹 → 反推发射点 → 标记估算区内的
   * 敌方发射井暴露（exposed=true），此后玩家可对其发起反击。
   * 每枚弹只溯源一次；雷达停摆或被毁（disabled）时不工作。 */
  function traceOrigin(state, m) {
    if (m.traced) return;
    if (m.faction === state.playerFaction) return;   // 只溯源敌方弹
    var cur = G.slerpLL(m.from, m.to, m.progress);
    var radars = unitsOf(state, state.playerFaction, 'radar');
    var radarDown = !!(state.radarDown[state.playerFaction] > 0);
    for (var i = 0; i < radars.length; i++) {
      var rd = radars[i];
      if (rd.disabled || radarDown) continue;
      if (G.angular(cur, rd) * RAD2DEG > rd.radiusDeg) continue;
      // 进入我方雷达覆盖 → 反推发射点并叠加误差
      var est = G.reverseTrace(m.from, m.to, m.progress);
      var sigma = G.traceSigma(CONFIG.traceSigma0, CONFIG.traceK, G.angular(rd, m.from) * RAD2DEG);
      var off = G.offsetLL(est, sigma, state.rng(), state.rng());
      m.traced = true;
      m.estFrom = off;
      // 标记估算区（2σ）内的敌方发射井/潜艇暴露
      var n = 0, radiusKm = sigma * 2 * 111;
      state.units.forEach(function (u) {
        if ((u.type !== 'silo' && u.type !== 'sub') || u.faction !== m.faction || u.exposed) return;
        if (G.distKm(u, off) < radiusKm) { u.exposed = true; n++; }
      });
      if (n) log(state, '我方雷达捕获来袭弹，溯源暴露 ' + n + ' 处 ' + m.faction + ' 发射井');
      return;
    }
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
    if (city.pop < 1) {
      city.pop = 0; city.alive = false;
      // 城市被毁 → 关联设施（发射井/防空/雷达）随之失效，不可再发射/拦截/探测
      unitsOfCity(state, city.id).forEach(function (u) { u.disabled = true; });
      log(state, city.name + ' 被抹除，关联设施全部失效');
    }
    state.stats[m.faction].killed += lost;
    state.stats[city.faction].casualties += lost;
    state.stats[m.faction].hits++;
    state.impacts++;
    if (!state.firstImpact) {
      state.firstImpact = {
        from: m.faction, to: city.faction, city: city.name,
        round: state.round, t: state.t
      };
    }
    log(state, m.faction + ' 命中 ' + city.faction + '/' + city.name + '，损失 ' + lost.toFixed(1) + 'M 规模');
    /* 核弹落地 = 没有回头路（§4.4）：只要有一枚弹真正砸到城市，全局危机值立刻拉满。
     * 在 war 阶段它在数值上只是把顶栏推到 100，但语义上必须落在结算里 ——
     * 这样「先落地的那一方」在日志与后续任何读 crisis 的逻辑里都被钉死为「已全面开战」。 */
    if (state.crisis < (CONFIG.crisisMax != null ? CONFIG.crisisMax : 100)) {
      state.crisis = CONFIG.crisisMax;
      state.defcon = defconOf(state.crisis);
      state.maxedBy = state.maxedBy || (m.faction + ' 核弹落地');
      log(state, '核弹落地 —— 危机值拉满 100');
    }
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
      cityId: m.targetCityId, t: state.t,
      sam: m.interceptor || null,         // 拦截弹起飞点（仅 intercept 类型有）
      from: { lat: m.from.lat, lon: m.from.lon },   // 落地尾痕渐隐用
      to: { lat: m.to.lat, lon: m.to.lon }
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
      // 弹道溯源：敌方弹进入我方雷达覆盖即反推发射点（不限飞行阶段）
      if (m.progress > 0.05) traceOrigin(state, m);
      // 飞过六成航程后才可能进入对方防空圈，省去大部分无谓计算
      if (m.progress > 0.6 && !m.intercepted) tryIntercept(state, m);
      /* §11.5 拦截已判定成功但视觉尚未抵达：继续推进导弹（让核弹渐隐），
       * 累加 interceptT，到 interceptDelaySec 才真正击毁。
       * pushFx('intercept') 已在 tryIntercept 里发出，此处不重复。 */
      if (m.intercepted) {
        m.interceptT = (m.interceptT || 0) + dt;
        if (m.interceptT >= (CONFIG.interceptDelaySec || 0.34)) {
          m.alive = false;
          continue;
        }
        alive.push(m);
        continue;
      }
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
   * DESIGN §6.2（§11.8 修订）：排名按**剩余存活人口**降序，同分再比己方伤亡升序。
   * 原「得分 = 敌方伤亡 − 己方伤亡」等价但不完全相同（剩余 = 初始人口 − 己方伤亡，
   * 初始人口各阵营不同），玩家直觉更关心「谁活下来的人多」。
   * score 字段保留（= killed − casualties）供审计与历史对比，排序键改为 popLeft。 */
  /* §11.8b 全球伤亡：六方己方伤亡之和（百万）。
   * 终局要把它作为最刺眼的那个数字 —— 排名称赞的是"活下来最多的那个"，
   * 而这一栏说的是"这一局一共死了多少人"，两者放在一起才是完整的反战表达。 */
  function globalCasualties(state) {
    return state.factions.reduce(function (s, f) {
      return s + ((state.stats[f.code] || {}).casualties || 0);
    }, 0);
  }

  function ranking(state) {
    return state.factions.map(function (f) {
      var s = state.stats[f.code] || { killed: 0, casualties: 0 };
      var alive = 0, popLeft = 0;
      citiesOf(state, f.code).forEach(function (c) {
        if (c.alive) alive++;
        popLeft += c.pop;
      });
      return {
        code: f.code, name: f.name, color: f.color,
        killed: s.killed, casualties: s.casualties,
        score: s.killed - s.casualties,
        popLeft: popLeft,                       // 剩余存活人口（百万）—— §11.8 主排序键
        citiesAlive: alive,
        missilesLeft: totalMissiles(state, f.code)
      };
    }).sort(function (a, b) {
      /* §11.8 主键：剩余存活人口降序（活下来的人多的排前）；
       * 次键：己方伤亡升序（同分时死得少的排前）；
       * 末键：代号字典序，保证排序稳定可复现。 */
      return (b.popLeft - a.popLeft) ||
             (a.casualties - b.casualties) ||
             (a.code < b.code ? -1 : 1);
    });
  }

  /* ───────────────────────── 9. 指令 ───────────────────────── */

  function choose(state, faction, optionIndex) {
    if (state.phase !== 'crisis' || !state.card) return false;
    if (optionIndex < 0 || optionIndex >= state.card.options.length) return false;
    state.choices[faction] = optionIndex;
    return true;
  }

  // 选出发射距离最近、且仍有弹的己方发射单位（发射井或潜艇，§11.10）。
  // 放在 sim 而非 ui/game：这是纯状态查询，无头测试要能直接断言（玩家点击发射与 AI 开火共用同一条选井规则）。
  function nearestSilo(state, faction, target) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if ((u.type !== 'silo' && u.type !== 'sub') || u.faction !== faction ||
          u.missiles <= 0 || u.disabled) continue;
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
    forceWar: forceWar,
    launch: launch,
    nearestSilo: nearestSilo,
    playerFire: playerFire,
    ranking: ranking,
    globalCasualties: globalCasualties,
    defconOf: defconOf,
    findCity: findCity,
    findUnit: findUnit,
    findFaction: findFaction,
    unitsOf: unitsOf,
    launchersOf: launchersOf,
    citiesOf: citiesOf,
    unitsOfCity: unitsOfCity,
    enemyCities: enemyCities,
    totalMissiles: totalMissiles,
    roundGrowthOf: roundGrowthOf
  };

})(typeof window !== 'undefined' ? window : globalThis);
