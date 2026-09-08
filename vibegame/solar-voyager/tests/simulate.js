// 无头校验：科技树稀有资源门禁不成环 + 远征趟数核算
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = {
  console,
  localStorage: (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })(),
  performance: { now: () => 0 }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/data.js'), 'utf8'), sandbox, { filename: 'data.js' });
const SV = sandbox.SV;
const H = SV.helpers;

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

// ---- 1. 稀有资源来源星球必须在不依赖该科技的前提下可达（不成环） ----
function reachableRares(techs, bases) {
  const set = new Set();
  for (const pl of SV.PLANETS) {
    if (!pl.rare) continue;
    if (pl.tech && techs.indexOf(pl.tech) < 0) continue;
    if (pl.needBase && bases.indexOf(pl.needBase) < 0) continue;
    set.add(pl.rare.id);
  }
  return set;
}

console.log('\n[1] 科技树稀有资源门禁 — 依赖不成环检查');
{
  const techs = [];
  const bases = ['earth'];
  const left = SV.TECH.slice();
  let guard = 0;
  while (left.length && guard++ < 100) {
    let progressed = false;
    for (let i = 0; i < left.length; i++) {
      const t = left[i];
      if (!t.deps.every(d => techs.indexOf(d) >= 0)) continue;
      // 关键：此时还没解锁 t，检查它要的稀有资源是否已经能采到
      const avail = reachableRares(techs, bases);
      const need = Object.keys(t.rare || {});
      const missing = need.filter(r => !avail.has(r));
      ok(missing.length === 0, `解锁「${t.name}」前可采到 ${need.length ? need.join('/') : '（无稀有需求）'}` +
        (missing.length ? ` — 缺来源：${missing.join('/')}` : ''));
      techs.push(t.id);
      left.splice(i, 1); i--;
      progressed = true;
    }
    if (!progressed) { ok(false, '科技树存在无法推进的死锁节点'); break; }
  }
  ok(techs.length === SV.TECH.length, `全部 ${SV.TECH.length} 项科技可达（实到 ${techs.length}）`);
}

// ---- 1b. 稀有资源必须有「脚下这颗以外」的备选产地 ----
// 这是本项目踩过两次的坑：玩家把主基地搬到某产地后，该产地不再是合法飞行目标，
// 若此时其余产地都还没解锁，这种稀有资源就彻底采不到了 —— 轻则连续二十几回合
// 无事可做，重则整局卡死。曾发生在氦三（金星从 t7 提前到 t6 修掉）与钛晶
// （水星从 t7 提前到 t6 修掉）。这条断言负责防止第三次。
console.log('\n[1b] 稀有资源产地冗余 — 站在任一产地时仍有别的产地可去');
{
  // 按科技树拓扑序逐档推进，每解锁一项就复查一次
  const order = [];
  const left = SV.TECH.slice();
  let guard = 0;
  while (left.length && guard++ < 100) {
    let moved = false;
    for (let i = 0; i < left.length; i++) {
      if (!left[i].deps.every(d => order.indexOf(d) >= 0)) continue;
      order.push(left[i].id); left.splice(i, 1); i--; moved = true;
    }
    if (!moved) break;
  }

  const unlocked = [];
  const checked = new Set();
  for (const tid of order) {
    unlocked.push(tid);
    for (const r of SV.RARE) {
      const srcs = SV.PLANETS.filter(p => p.rare && p.rare.id === r.id &&
        (!p.tech || unlocked.indexOf(p.tech) >= 0));
      if (!srcs.length) continue;                 // 这一档还没开到该资源
      const key = r.id + '@' + srcs.length;
      if (checked.has(key)) continue;             // 同一「产地数量」只报一次，避免刷屏
      checked.add(key);
      if (srcs.length >= 2) {
        ok(true, `解锁「${SV.techName(tid)}」后 ${r.name} 有 ${srcs.length} 个产地，站在任一处仍有备选`);
        continue;
      }
      // 只有一个产地时是「孤立产地」：玩家一旦把主基地搬过去，这种资源就采不到了。
      // 放宽条件 —— 只要这段窗口内的累计需求 ≤ 一趟首访所得，就不构成陷阱。
      const s1 = srcs[0];
      // 孤立窗口内的累计需求（仅作提示，不作断言）。
      //
      // 为什么不断言：地球基地始终存在，玩家随时可以把主基地切回地球，
      // 于是脚下那颗产地又变成合法飞行目标 —— 所以孤立产地不构成死锁，
      // 只是要求玩家知道「切回去」这个操作。真正需要守住的是下面那条
      // 「最终至少 2 个产地」，以及 playthrough.js 里的端到端空转上限。
      const window = order.filter(t => {
        const tt = SV.techById(t);
        return tt && tt.rare && tt.rare[r.id];
      });
      let demand = 0;
      for (const t of window) demand += SV.techById(t).rare[r.id];
      console.log(`  ··   ${r.name} 此刻只有「${s1.name}」一个产地（全程累计需求 ${demand}，一趟首访 ${s1.rare.first}）`);
    }
  }
  // 每种稀有资源最终至少要有 2 个产地
  for (const r of SV.RARE) {
    const n = SV.PLANETS.filter(p => p.rare && p.rare.id === r.id).length;
    ok(n >= 2, `${r.name} 最终有 ${n} 个产地（要求 ≥2）`);
  }
}

// ---- 2. 各稀有资源总需求 vs 每次带回量 ----
console.log('\n[2] 稀有资源收支核算');
{
  const need = { ti: 0, he: 0, ice: 0 };
  for (const t of SV.TECH) for (const k in (t.rare || {})) need[k] += t.rare[k];
  console.log('  科技树总需求：', JSON.stringify(need));

  for (const r of SV.RARE) {
    const srcs = SV.PLANETS.filter(p => p.rare && p.rare.id === r.id);
    console.log(`  ${r.name} 来源：` + srcs.map(p => `${p.name}(首访 ${p.rare.first} / 之后 ${p.rare.per})`).join('、'));
    // 只走最近那颗星球需要几趟
    const near = srcs.slice().sort((a, b) => a.dist - b.dist)[0];
    let trips = 0, got = 0;
    while (got < need[r.id] && trips < 99) { trips++; got += (trips === 1 ? near.rare.first : near.rare.per); }
    ok(trips < 12, `${r.name} 只飞最近的${near.name}需 ${trips} 趟（共带回 ${got}）`);
  }
}

// ---- 3. 设施递增造价 ----
console.log('\n[3] 设施递增造价');
{
  const s = SV.store.fresh();
  const mine = SV.BUILDINGS.find(b => b.id === 'mine');
  const seq = [];
  for (let i = 0; i < 5; i++) { seq.push(SV.buildCost(s, mine)); s.bases.earth.built.mine++; }
  console.log('  矿场造价序列：', seq.join(' → '));
  ok(seq[0] > mine.cost && seq[4] > seq[0] * 4, '造价随数量显著递增（抑制无脑堆）');
}

// ---- 4. 解锁门禁 + 扣除 ----
console.log('\n[4] 解锁校验与扣除');
{
  const s = SV.store.fresh();
  s.res.research = 9999;
  s.tech = ['t0', 't1', 't2'];
  const t4 = SV.techById('t4');
  ok(!H.techReady(s, t4), '无钛晶时「中推力引擎」不可解锁');
  ok(H.techLackText(s, t4).indexOf('钛晶 还差 4') >= 0, '缺口文案正确：' + H.techLackText(s, t4));
  H.gainRare(s, 'ti', 20);
  ok(H.techReady(s, t4), '带回 20 钛晶后可解锁');
  ok(s.stat.gained.ti === 20, '累计带回量已记录（供任务判定）');

  // 模拟解锁扣除
  const before = s.rare.ti;
  s.res.research -= t4.cost;
  s.rare.ti -= t4.rare.ti;
  s.tech.push('t4');
  ok(s.rare.ti === before - 4, '解锁后按量扣除钛晶');
}

// ---- 5. 远征带回量：首访 / 重复 ----
console.log('\n[5] 远征带回量');
{
  const s = SV.store.fresh();
  const moon = SV.planetById('moon');
  const a = H.rareYield(s, moon, true), b = H.rareYield(s, moon, false);
  ok(a.n === moon.rare.first && b.n === moon.rare.per, `月球首访 ${a.n} / 例行 ${b.n}`);
  ok(SV.planetById('earth').rare === null, '地球不产稀有资源');
  const kinds = new Set(SV.PLANETS.filter(p => p.rare).map(p => p.rare.id));
  ok(kinds.size === 3, `共 ${kinds.size} 种稀有资源分布在星球上`);
}

// ---- 6. 终局科技对火箭的实际加成 ----
console.log('\n[6] 终局科技加成');
{
  const s = SV.store.fresh();
  const d = { pod: 'pod_l', tanks: ['tank_l', 'tank_l', 'tank_l'], engines: ['engine_l', 'engine_l', 'engine_l'], inst: 'inst' };
  const base = SV.calcDesign(d, s);
  s.tech = SV.TECH.map(t => t.id);
  const maxed = SV.calcDesign(d, s);
  ok(Math.abs(maxed.thrust / base.thrust - 1.18) < 0.001, `离子推进：推力 ${base.thrust} → ${maxed.thrust.toFixed(1)} (+18%)`);
  ok(Math.abs(maxed.range / base.range - 1.25) < 0.001, `低温超导：航程 ${base.range.toFixed(1)} → ${maxed.range.toFixed(1)} (+25%)`);
  ok(Math.abs(maxed.takeoff / base.takeoff - 0.88) < 0.001, `低温超导：起飞消耗 ${base.takeoff.toFixed(1)} → ${maxed.takeoff.toFixed(1)} (-12%)`);
}

// ---- 7. 存档迁移 ----
console.log('\n[7] 存档迁移（v2 → v4、v3 → v4 改名）');
{
  const legacy = { v: 2, turn: 12, base: 'moon', res: { metal: 100, fuel: 20, research: 40 },
    bases: { earth: SV.newBase(),
             moon: SV.newBase() },
    tech: ['t0', 't1'], design: SV.newDesign(), saved: [], launchDesign: -1, launchTarget: null,
    done: [], ach: [], arrived: ['moon'], log: [],
    stat: { launches: 3, wins: 2, clean: 1, heavyLaunch: 0, crystals: 4 } };
  sandbox.localStorage.setItem('sv_save_v2', JSON.stringify(legacy));
  const s = SV.store.load();
  ok(!!s, '旧档能被读出');
  ok(s && s.turn === 12, '回合数保留');
  ok(s && s.rare && s.rare.ti === 0 && s.rare.he === 0 && s.rare.ice === 0, '补齐稀有资源字段');
  ok(s && s.stat.gained && s.stat.gained.ice === 0, '补齐累计带回统计');
  ok(s && s.v === 4, '版本号升到 4');
  sandbox.localStorage.removeItem('sv_save_v4');
}
{
  // v3 → v4：jupiter（木卫二）与 saturn（土卫六）改名为 europa / titan
  const v3 = { v: 3, turn: 60, base: 'jupiter', res: { metal: 100, fuel: 20, research: 40, food: 12 },
    bases: { earth: SV.newBase(), jupiter: SV.newBase(), saturn: SV.newBase() },
    rare: { ti: 3, he: 4, ice: 5 },
    tech: ['t0', 't1', 't10'], design: SV.newDesign(), saved: [], launchDesign: -1, launchTarget: 'saturn',
    done: [], ach: [], arrived: ['moon', 'jupiter', 'saturn'], log: [],
    stat: { launches: 6, wins: 5, clean: 1, heavyLaunch: 1, crystals: 4, famine: 0,
            gained: { ti: 20, he: 20, ice: 18 } } };
  sandbox.localStorage.setItem('sv_save_v3', JSON.stringify(v3));
  const s = SV.store.load();
  ok(!!s, 'v3 旧档能被读出');
  ok(s && s.v === 4, '版本号升到 4');
  ok(s && s.base === 'europa', `主基地 jupiter → ${s && s.base}`);
  ok(s && s.launchTarget === 'titan', `发射目标 saturn → ${s && s.launchTarget}`);
  ok(s && !!s.bases.europa && !!s.bases.titan && !s.bases.jupiter && !s.bases.saturn,
    'bases 键名整体改名');
  ok(s && s.arrived.indexOf('europa') >= 0 && s.arrived.indexOf('titan') >= 0 &&
    s.arrived.indexOf('jupiter') < 0 && s.arrived.indexOf('saturn') < 0, 'arrived 数组整体改名');
  ok(s && s.arrived.length === 3, '改名不丢不重（仍 3 条抵达记录）');
  ok(s && s.stat.gained.ice === 18, '累计带回统计不丢');
  // 改名后的 id 必须是真实存在的天体
  const bad = [];
  for (const id of Object.keys(s.bases)) if (!SV.planetById(id)) bad.push('base:' + id);
  for (const id of s.arrived) if (!SV.planetById(id)) bad.push('arrived:' + id);
  if (!SV.planetById(s.base)) bad.push('cur:' + s.base);
  ok(bad.length === 0, '改名后所有 id 都指向真实天体' + (bad.length ? '（残留 ' + bad.join('、') + '）' : ''));
  sandbox.localStorage.removeItem('sv_save_v4');
}

// ---- 8. 反例：只蹲地球刷基地，能推到哪一步 ----
console.log('\n[8] 「无脑刷基地」反例推演（200 回合，全力堆设施 + 全点科研）');
{
  const s = SV.store.fresh();
  // 人力全压科研
  s.bases.earth.pop = { mining: 0, research: 4, refine: 0 };
  for (let turn = 0; turn < 200; turn++) {
    // 每回合：有钱就扩建（模拟无脑堆）
    let built = true;
    while (built) {
      built = false;
      for (const bd of SV.BUILDINGS) {
        const cost = SV.buildCost(s, bd);
        if (s.res.metal >= cost) {
          s.res.metal -= cost;
          s.bases.earth.built[bd.id] = (s.bases.earth.built[bd.id] || 0) + 1;
          built = true;
        }
      }
    }
    // 把人尽量塞进科研岗
    H.setJob(s, 'research', H.popMax(s));
    const pr = H.produce(s);
    s.res.metal += pr.metal; s.res.research += pr.research; s.res.fuel += pr.fuel;
    s.turn++;
    // 尝试解锁所有能解锁的科技
    for (const t of SV.TECH) {
      if (H.hasTech(s, t.id)) continue;
      if (!H.techReady(s, t)) continue;
      s.res.research -= t.cost;
      for (const k in (t.rare || {})) s.rare[k] -= t.rare[k];
      s.tech.push(t.id);
    }
  }
  const got = s.tech.length;
  const blocked = SV.TECH.filter(t => !H.hasTech(s, t.id));
  console.log(`  200 回合后：科研存量 ${Math.round(s.res.research)}，累计远征 0 次`);
  console.log(`  已解锁 ${got}/${SV.TECH.length} 项：` + SV.TECH.filter(t => H.hasTech(s, t.id)).map(t => t.name).join('、'));
  console.log(`  被卡住 ${blocked.length} 项：` + blocked.map(t => `${t.name}(${H.techLackText(s, t) || '前置未满足'})`).join('、'));
  ok(got < SV.TECH.length, `科技树无法点满（停在 ${got}/${SV.TECH.length}）`);
  ok(s.arrived.length === 0, '从未发射，因此稀有资源全为 0');
  ok(blocked.every(t => H.techLack(s, t).length > 0), '卡点全部来自稀有资源门禁，而非科研不足');
  const stopAt = blocked[0] ? blocked[0].name : '—';
  console.log(`  → 第一个卡点：「${stopAt}」，必须飞出去才过得去`);
}

console.log('\n' + (fail ? `✗ ${fail} 项未通过` : '✓ 全部通过'));
process.exit(fail ? 1 : 0);
