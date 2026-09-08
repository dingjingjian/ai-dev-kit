// 量化「人口还能不能无限堆」：口粮系统上线前后的对比
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console, performance: { now: () => 0 } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/data.js'), 'utf8'), sandbox, { filename: 'data.js' });
const SV = sandbox.SV, H = SV.helpers;

// 自给条件：f × (1+farm) × COEFF × mod ≥ P × EAT
// 农民占比 = f/P ≥ EAT / ((1+farm) × COEFF × mod)
function farmingShare(farmCount, mod) {
  return SV.EAT_PER_POP / ((1 + farmCount) * SV.FOOD_COEFF * mod);
}

// 把主基地堆到 P 人，最少要几座水培舱、几个农民、多少金属。
// 关键约束：农民数不能超过农业岗位位（1 + 水培舱数），
// 所以人口涨到一定规模就必然要新建水培舱 —— 这才是口粮真正卡人口的地方。
function costFor(pop, mod) {
  const s = SV.store.fresh();
  s.bases.earth.built = { mine: 1, lab: 1, refinery: 0, farm: 1, hab: 0 };
  let spent = 0;
  // 先堆居住舱到人口达标
  while (H.popMax(s) < pop) {
    const bd = SV.BUILDINGS.find(b => b.id === 'hab');
    spent += SV.buildCost(s, bd);
    s.bases.earth.built.hab++;
  }
  const habSpent = spent;

  // 求最小水培舱数：使「所需农民数 ≤ 农业岗位位」
  let farm = 1, farmers = 0;
  for (;;) {
    const cap = 1 + farm;
    farmers = Math.ceil(pop * SV.EAT_PER_POP / (cap * SV.FOOD_COEFF * mod));
    if (farmers <= cap || farm > 15) break;
    farm++;
  }
  // 补建水培舱（起始已有 1 座）
  for (let k = 1; k < farm; k++) {
    spent += SV.buildCost(s, SV.BUILDINGS.find(b => b.id === 'farm'));
    s.bases.earth.built.farm = k + 1;
  }
  return {
    pop, farm, farmers,
    share: farmers / pop,
    habSpent: Math.round(habSpent),
    farmSpent: Math.round(spent - habSpent),
    total: Math.round(spent)
  };
}

console.log('\n[1] 农民占比下限（自给所需的最低农业人力比例）');
console.log('    水培舱座数 → 农业岗位位；占比越低说明那个地方越养得起人\n');
{
  const pl = ['earth', 'moon', 'mars', 'venus', 'mercury', 'europa'];
  const head = '  水培舱 | 岗位位 | ' + pl.map(p => SV.planetById(p).name.padStart(6)).join(' |');
  console.log(head);
  console.log('  ' + '-'.repeat(head.length));
  for (const fc of [1, 2, 3, 5]) {
    const row = pl.map(p => (farmingShare(fc, SV.planetById(p).mod.food) * 100).toFixed(1).padStart(5) + '%');
    console.log(`    ${fc}    |   ${String(1 + fc).padStart(3)}   | ` + row.join(' | '));
  }
}

console.log('\n[2] 堆到 N 人的代价（含口粮系统）');
{
  console.log('\n  目标人口 | 居住舱金属 | 水培舱 | 农民 | 农民占比 | 金属合计');
  console.log('  ---------+-----------+-------+------+---------+--------');
  for (const p of [8, 12, 16, 20, 28]) {
    const r = costFor(p, 1);
    console.log(`    ${String(r.pop).padStart(4)}   |   ${String(r.habSpent).padStart(6)}   |  ${String(r.farm).padStart(4)}  | ${String(r.farmers).padStart(4)}  |  ${(r.share * 100).toFixed(1).padStart(5)}%  | ${String(r.total).padStart(6)}`);
  }
}

console.log('\n[3] 同样堆到 20 人，各星球的额外代价（外星球养人更贵）');
{
  console.log('\n  星球     | 口粮系数 | 需水培舱 | 农民 | 农民占比 | 金属合计 | 相对地球');
  console.log('  ---------+---------+---------+------+---------+---------+--------');
  const base = costFor(20, 1).total;
  for (const id of ['earth', 'europa', 'mars', 'moon', 'venus', 'mercury']) {
    const pl = SV.planetById(id);
    const r = costFor(20, pl.mod.food);
    console.log(`  ${pl.name.padEnd(7)} |   ×${String(pl.mod.food).padEnd(4)} |   ${String(r.farm).padStart(4)}   | ${String(r.farmers).padStart(4)}  |  ${(r.share * 100).toFixed(1).padStart(5)}%  | ${String(r.total).padStart(6)}  |  ${r.total === base ? '基准' : '+' + Math.round((r.total / base - 1) * 100) + '%'}`);
  }
}

console.log('\n[4] 结论对照');
{
  // 没有口粮时，堆人口只要金属买居住舱
  const s = SV.store.fresh();
  s.bases.earth.built = { mine: 1, lab: 1, refinery: 0, farm: 1, hab: 0 };
  let habOnly = 0;
  while (H.popMax(s) < 20) { habOnly += SV.buildCost(s, SV.BUILDINGS.find(b => b.id === 'hab')); s.bases.earth.built.hab++; }
  const now = costFor(20, 1).total;
  console.log(`  堆到 20 人（地球）：`);
  console.log(`    无口粮系统：只需居住舱，${Math.round(habOnly)} 金属，0 人力占用`);
  console.log(`    有口粮系统：居住舱 + 水培舱，${now} 金属，另需 ${costFor(20, 1).farmers} 人常驻农业岗`);
  console.log(`    金属成本 +${Math.round((now / habOnly - 1) * 100)}%，且持续占用 ${(costFor(20, 1).share * 100).toFixed(0)}% 的人力`);

  const m = costFor(20, SV.planetById('mercury').mod.food);
  console.log(`\n  若把基地搬到水星，同样 20 人：`);
  console.log(`    水培舱需 ${m.farm} 座、农民 ${m.farmers} 人（占 ${(m.share * 100).toFixed(0)}%），金属 ${m.total}（比地球 +${Math.round((m.total / now - 1) * 100)}%）`);
  console.log(`    → 人口不再是可以无脑堆的数字：搬去前线要先算那地方养不养得起。`);
}
