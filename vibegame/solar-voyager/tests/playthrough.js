// 全流程推演：模拟一个「正常玩」的玩家，检查主线节奏仍成立
// 飞行小游戏按「成功抵达」计（只评估策略层节奏，不评估操作难度）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console, performance: { now: () => 0 } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/data.js'), 'utf8'), sandbox, { filename: 'data.js' });
const SV = sandbox.SV;

// 可选支线 = 只给全局加成、不开新航线的科技。冲刺结局时可以整条跳过。
const OPTIONAL = ['t12'];
const player = require('./lib/player')(SV);
const full = require('./lib/player')(SV, { skipOptional: [] });

console.log('\n=== 全流程推演（飞行小游戏按成功计）===');
// 主线：跳过可选支线，冲结局 —— 衡量节奏
const r = player.run(true, true, { skipOptional: OPTIONAL });
// 对照组：完全不管口粮，把人全塞进生产岗
const lazy = player.run(false, false, { skipOptional: OPTIONAL });
// 全科技：不跳过任何节点 —— 衡量完整体验
const all = full.run(false);

const line = (tag, x) => console.log(
  `  ${tag.padEnd(12)} ${x.win ? '通关' : '未通关'}  ${String(x.turns).padStart(4)} 回合 · ` +
  `发射 ${x.launches} 次 · 科技 ${x.s.tech.length}/${SV.TECH.length} · 饥荒 ${x.famine} 回合 · 最长空转 ${x.maxIdle} 回合`);

console.log('\n  策略              结果      其它');
console.log('  ' + '-'.repeat(84));
line('主线（快）', r);
line('全科技', all);
line('不管口粮', lazy);

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
console.log('');
ok(r.win, '游戏仍然可通关');
// 与「0 次发射只能停在 4/15 项科技」形成对照，说明探索确实成了主线
ok(r.launches >= 8, `通关需要实质性的远征次数（${r.launches} 次）`);
ok(r.turns >= 55 && r.turns <= 100, `通关回合数在合理区间（${r.turns} 回合）`);
// 空转 = 连续「没有任何可做的事，只能点下一回合等科研」的回合。
// 扩表后实测出现过 28 回合的空转，必须守住上限。
ok(r.maxIdle <= 16, `最长空转不超过 16 回合（实际 ${r.maxIdle} 回合）`);
ok(r.turns / r.launches <= 8, `发射间隔够密（平均 ${(r.turns / r.launches).toFixed(1)} 回合一次）`);
// 终局科技（t11 低温超导之后）必须真的被用到，不能是死路
ok(r.s.tech.indexOf('t11') >= 0 && r.s.tech.indexOf('t13') >= 0 && r.s.tech.indexOf('t14') >= 0,
  `终局科技真的被用到（${r.s.tech.filter(t => ['t11', 't12', 't13', 't14'].indexOf(t) >= 0).join('、') || '无'}）`);
ok(all.s.tech.length === SV.TECH.length, `全科技路线能点满（${all.s.tech.length}/${SV.TECH.length}）`);
ok(all.turns > r.turns, `全科技比主线更慢（${all.turns} vs ${r.turns} 回合）—— 支线确实有代价`);
ok(r.s.stat.gained.ti > 0 && r.s.stat.gained.he > 0 && r.s.stat.gained.ice > 0, '三种稀有资源都被真正用到');
// 口粮机制的核心：惩罚不管不顾的玩家，而不是精细操作的玩家
ok(r.famine === 0, '精细经营可以全程零饥荒');
ok(lazy.famine > lazy.turns * 0.8,
  `不管口粮几乎全程减产（饥荒 ${lazy.famine}/${lazy.turns} 回合）`);
ok(lazy.turns > r.turns * 1.15,
  `不管口粮明显更慢（${lazy.turns} vs ${r.turns} 回合，+${Math.round((lazy.turns / r.turns - 1) * 100)}%）`);

console.log('\n' + (fail ? `✗ ${fail} 项未通过` : '✓ 全部通过'));
process.exit(fail ? 1 : 0);
