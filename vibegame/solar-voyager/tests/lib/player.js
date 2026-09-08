// 自动玩家：模拟一个「正常玩」的玩家跑完整条主线。
// 飞行小游戏按「成功抵达」计 —— 只评估策略层节奏，不评估操作难度。
//
// 抽成独立模块的原因：数值调参需要在同一套 AI 上对比不同参数组合，
// 见 tests/balance-sweep.js。改 AI 行为时只动这里，两处调用同步生效。
module.exports = function makePlayer(SV, opts) {
  opts = opts || {};
  const H = SV.helpers;
  const U_keys = o => Object.keys(o).filter(k => Object.prototype.hasOwnProperty.call(o, k));
  const GOAL = opts.GOAL || 'pluto';
  const curDist = s => SV.planetById(s.base).dist;

  // 枚举挂载组合（可重复，长度 0..maxN）
  function combos(arr, maxN) {
    const out = [[]];
    if (maxN <= 0) return out;
    let cur = [[]];
    for (let n = 1; n <= maxN; n++) {
      const next = [];
      for (const c of cur) for (const a of arr) next.push(c.concat([a]));
      out.push(...next);
      cur = next;
    }
    return out;
  }

  // 在已解锁零件里找一架：航程够 gap、加得起油，且尽量省油
  function bestDesign(s, gap, fuelStock) {
    const pods = SV.partsOf('pod').filter(p => H.hasTech(s, SV.PARTS[p].tech));
    const tanks = SV.partsOf('tank').filter(p => H.hasTech(s, SV.PARTS[p].tech));
    const engines = SV.partsOf('engine').filter(p => H.hasTech(s, SV.PARTS[p].tech));
    let best = null;
    for (const pod of pods) {
      const cap = SV.PARTS[pod].cap;
      for (const tC of combos(tanks, cap.t)) {
        for (const eC of combos(engines, cap.e)) {
          if (!eC.length || !tC.length) continue;
          for (const inst of [null, 'inst']) {
            const d = { pod, tanks: tC, engines: eC, inst };
            const c = SV.calcDesign(d, s);
            if (!c.canFly || c.range < gap || c.fuel > fuelStock) continue;
            if (!best || c.fuel < best.c.fuel) best = { d, c };
          }
        }
      }
    }
    return best;
  }

  const MAIN = opts.MAIN || ['moon', 'mars', 'europa', 'titan', 'neptune', 'pluto'];
  // 可选支线：只给全局加成、不开新航线的科技。冲刺结局时可以整条跳过，
  // 于是同一套 AI 能测出两个指标 —— 「主线节奏」与「全科技」。
  let skipOptional = opts.skipOptional || [];

  // 空转诊断：nextGoal 返回 null 时，说清到底卡在哪
  // 稀有资源缺口与科研缺口会同时报 —— 只报前者会掩盖真正的等待原因。
  function whyIdle(s) {
    const parts = [];
    for (const t of SV.TECH) {
      if (H.hasTech(s, t.id) || !H.techDepsOk(s, t)) continue;
      if (skipOptional.indexOf(t.id) >= 0) continue;
      const lack = H.techLack(s, t);
      if (!lack.length) continue;
      for (const l of lack) {
        const srcs = SV.PLANETS.filter(p => p.rare && p.rare.id === l.id);
        const avail = srcs.filter(p => H.planetUnlocked(s, p) && p.id !== s.base);
        if (!avail.length) {
          parts.push(`缺 ${SV.rareById(l.id).name} ${l.lack} 且脚下是 ${SV.planetById(s.base).name}，` +
            `其余产地均未解锁（${srcs.map(p => p.name + (H.planetUnlocked(s, p) ? '' : '[未解锁]')).join('、')}）`);
        } else {
          parts.push(`缺 ${SV.rareById(l.id).name} ${l.lack}（${SV.techById(t.id).name}）`);
        }
      }
    }
    const pend = SV.TECH.filter(t => !H.hasTech(s, t.id) && H.techDepsOk(s, t) && skipOptional.indexOf(t.id) < 0);
    if (pend.length) {
      parts.push('等科研：' + pend.map(t => `${t.name}(差${Math.max(0, Math.round(t.cost - s.res.research))})`).join('、'));
    }
    if (!parts.length) return '主线目标全部解锁且已抵达';
    return parts.join('；');
  }

  function nextGoal(s) {
    // 1) 被稀有资源卡住 → 去最近的产地采样
    for (const t of SV.TECH) {
      if (H.hasTech(s, t.id) || !H.techDepsOk(s, t)) continue;
      if (skipOptional.indexOf(t.id) >= 0) continue;
      const lack = H.techLack(s, t);
      if (!lack.length) continue;
      const rid = lack[0].id;
      const d0 = curDist(s);
      const cands = SV.PLANETS
        .filter(p => p.rare && p.rare.id === rid && H.planetUnlocked(s, p) && p.id !== s.base)
        .sort((a, b) => Math.abs(a.dist - d0) - Math.abs(b.dist - d0));
      if (cands.length) return { pl: cands[0], why: `采 ${SV.rareById(rid).name} → ${t.name}` };
    }
    // 2) 主线推进
    for (const id of MAIN) {
      const pl = SV.planetById(id);
      if (s.arrived.indexOf(id) < 0 && H.planetUnlocked(s, pl)) {
        return { pl, why: '主线：首次抵达' + pl.name };
      }
    }
    // 3) 缺某种稀有资源，但唯一产地就是脚下这颗 —— 把主基地切回别处，
    //    脚下那颗就又变成合法目标了。地球基地永远在，所以这一步总能做到。
    //    真实玩家会这么做；AI 不做就会卡出十几回合的假空转。
    for (const t of SV.TECH) {
      if (H.hasTech(s, t.id) || !H.techDepsOk(s, t)) continue;
      if (skipOptional.indexOf(t.id) >= 0) continue;
      const lack = H.techLack(s, t);
      if (!lack.length) continue;
      const rid = lack[0].id;
      const flyable = SV.PLANETS.filter(p => p.rare && p.rare.id === rid &&
        H.planetUnlocked(s, p) && p.id !== s.base);
      if (flyable.length) continue;
      const onlyHere = SV.PLANETS.filter(p => p.rare && p.rare.id === rid && H.planetUnlocked(s, p));
      if (!onlyHere.length) continue;
      const alt = U_keys(s.bases).filter(id => id !== s.base);
      if (alt.length && onlyHere[0].id === s.base) {
        s.base = alt[0];
        H.fixPop(s);
        return { pl: onlyHere[0], why: `切回${SV.planetById(alt[0]).name}再采 ${SV.rareById(rid).name}` };
      }
    }
    // 4) 谁都没卡住，但还在等科研 → 去没去过的地方换「首次勘探」科研
    if (SV.firstVisitResearch) {
      const d0 = curDist(s);
      const fresh = SV.PLANETS
        .filter(p => H.planetUnlocked(s, p) && p.id !== s.base && s.arrived.indexOf(p.id) < 0)
        .sort((a, b) => Math.abs(a.dist - d0) - Math.abs(b.dist - d0));
      if (fresh.length) {
        return { pl: fresh[0], why: '首次勘探换科研 +' + SV.firstVisitResearch(fresh[0]) };
      }
    }
    return null;
  }

  function run(verbose, careFood, runOpts) {
    const o = Object.assign({}, opts, runOpts || {});
    skipOptional = o.skipOptional || [];   // 逐次推演可切换，nextGoal / whyIdle 共用
    const s = SV.store.fresh();
    const log = [];
    let guard = 0;
    let idle = 0, maxIdle = 0;      // 连续「无目标」回合数（空转检测）
    // careFood=false：完全不管口粮，把人全塞进生产岗 —— 退化玩法对照组
    if (careFood === undefined) careFood = true;

    while (s.arrived.indexOf(GOAL) < 0 && guard++ < 600) {
      // --- 人力：先喂饱人，再按「缺什么补什么」分配 ---
      H.fixPop(s);
      const maxPop = H.popMax(s);
      const caps = {};
      for (const j of SV.JOBS) caps[j.key] = H.jobCap(s, j.key);

      // 给定农业人数 f，其余按优先序塞满
      const planWith = f => {
        const a = { mining: 0, research: 0, refine: 0, farming: f };
        let left = maxPop - f;
        const refWant = s.res.fuel < 500 ? Math.ceil(maxPop * 0.45) : 1;
        // 优先序：精炼（保发射）→ 科研（推科技）→ 采矿（余量）
        for (const k of ['refine', 'research', 'mining']) {
          const want = k === 'refine' ? Math.min(refWant, left) : left;
          const n = Math.max(0, Math.min(caps[k], want, left));
          a[k] = n; left -= n;
        }
        return a;
      };
      // 从 0 个农民往上试，取第一个能自给的；都养不起就取农民最多的那个
      let alloc = null;
      for (let f = 0; f <= Math.min(caps.farming, maxPop); f++) {
        alloc = planWith(f);
        s.bases[s.base].pop = alloc;
        if (!careFood || H.foodNet(s) >= 0) break;
      }
      if (!careFood) { alloc.farming = 0; alloc.research += 1; }  // 对照组：不派农民
      s.bases[s.base].pop = alloc;

      // --- 建造：养不起人先补水培舱，燃料吃紧补精炼，否则堆科研 ---
      let order;
      if (H.foodNet(s) < 0) order = ['farm', 'lab', 'hab', 'refinery', 'mine'];
      else if (s.res.fuel < 300) order = ['refinery', 'lab', 'hab', 'farm', 'mine'];
      else order = ['lab', 'hab', 'farm', 'refinery', 'mine'];
      for (const id of order) {
        const bd = SV.BUILDINGS.find(b => b.id === id);
        const cost = SV.buildCost(s, bd);
        if (s.res.metal >= cost && cost <= 140) {
          s.res.metal -= cost;
          s.bases[s.base].built[id] = (s.bases[s.base].built[id] || 0) + 1;
          H.fixPop(s);
          break;
        }
      }

      // --- 结算产出（含口粮：先喂饱人，不够则非口粮产出减半）---
      const pr = H.produce(s);
      const need = H.foodNeed(s);
      const famine = (s.res.food + pr.food) < need;
      const mult = famine ? SV.SHORTAGE_MULT : 1;
      s.res.metal += pr.metal * mult;
      s.res.research += pr.research * mult;
      s.res.fuel += pr.fuel * mult;
      s.res.food = Math.max(0, s.res.food + pr.food - need);
      s.turn++;
      if (famine) {
        s.stat.famine = (s.stat.famine || 0) + 1;
        log.push(`T${s.turn}  口粮不足（在岗 ${H.popTotal(s)} 人需 ${need.toFixed(1)}）— 产出减半`);
      }

      // --- 解锁一切能解锁的科技 ---
      for (const t of SV.TECH) {
        if (H.hasTech(s, t.id) || !H.techReady(s, t)) continue;
        if (skipOptional.indexOf(t.id) >= 0) continue;
        s.res.research -= t.cost;
        for (const k in (t.rare || {})) s.rare[k] -= t.rare[k];
        s.tech.push(t.id);
        log.push(`T${s.turn}  解锁科技「${t.name}」`);
      }

      // --- 发射 ---
      const goal = nextGoal(s);
      if (!goal) {
        idle++; maxIdle = Math.max(maxIdle, idle);
        if (o.onIdle) o.onIdle(s, idle, whyIdle(s));
      } else idle = 0;
      if (goal) {
        const gap = Math.abs(goal.pl.dist - curDist(s));
        const pick = bestDesign(s, gap, s.res.fuel);
        if (pick) {
          s.res.fuel -= pick.c.fuel;
          s.stat.launches++; s.stat.wins++;
          const first = s.arrived.indexOf(goal.pl.id) < 0;
          if (first) s.arrived.push(goal.pl.id);
          if (goal.pl.canBase && !s.bases[goal.pl.id]) {
            s.bases[goal.pl.id] = SV.newBase();
          }
          let tag = '';
          if (goal.pl.rare) {
            const ry = H.rareYield(s, goal.pl, first);
            H.gainRare(s, ry.id, ry.n);
            tag = `带回 ${SV.rareById(ry.id).name} ×${ry.n}`;
          }
          if (first && SV.firstVisitResearch) {
            const r = SV.firstVisitResearch(goal.pl);
            s.res.research += r;
            tag += (tag ? ' · ' : '') + `科研 +${r}`;
          }
          log.push(`T${s.turn}  发射 → ${goal.pl.name}（${goal.why}）${tag}${first ? ' [首次勘探]' : ''}`);
          // 落地即把主基地前移，缩短下一段航程
          if (goal.pl.canBase && goal.pl.dist > curDist(s)) {
            s.base = goal.pl.id;
            H.fixPop(s);
            log.push(`T${s.turn}  主基地前移至 ${goal.pl.name}`);
          }
        }
      }
    }

    const win = s.arrived.indexOf(GOAL) >= 0;
    if (verbose) log.forEach(l => console.log('  ' + l));
    return { win, turns: s.turn, s, launches: s.stat.launches, famine: s.stat.famine || 0, maxIdle };
  }

  return { run, nextGoal, bestDesign, curDist, MAIN };
};
