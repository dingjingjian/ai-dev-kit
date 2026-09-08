// 参数扫描：在同一套自动玩家上对比不同数值组合，用于定量选参而不是拍脑袋调。
// 用法：node tests/balance-sweep.js
//
// 扫描维度（在 src/data.js 源码上做字符串替换，不改动磁盘文件）：
//   POP_BASE   无居住舱时的人口上限（原 4）
//   HAB_POP    每座居住舱的人口上限加成（原 2）
//   BUILD_STEP 同类设施造价递增（原 1.55）
//   RESEARCH   科研岗单人产出系数（原 1.5）
//   TECH_LATE  t13/t14 科研成本
//
// 关注指标：
//   通关        主线跑完所需回合
//   最长空转    连续「没有任何可做的事、只能点下一回合」的回合数 —— 越低越好
//   空转占比    空转回合 / 总回合 —— 这是节奏健康度的核心指标
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'src/data.js'), 'utf8');
const PLAYER = require('./lib/player');

function loadWith(patches) {
  let src = SRC;
  for (const [from, to] of patches) {
    if (src.indexOf(from) < 0) throw new Error('补丁未命中：' + from);
    src = src.split(from).join(to);
  }
  const sb = { console: { log: () => {} }, performance: { now: () => 0 } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'data.js' });
  return sb.SV;
}

const P = {
  popBase: 'SV.POP_BASE = 4;',
  habPop: 'SV.HAB_POP = 2;',
  step: 'SV.BUILD_STEP = 1.55;',
  research: "research: p.research * SV.helpers.jobCap(s, 'research') * 1.5 * m.research,",
  t13: "name: '外行星引航', cost: 245,",
  t14: "name: '柯伊伯跃迁', cost: 300,"
};

const grid = [];
for (const popBase of [4, 6]) {
  for (const hab of [2, 3]) {
    for (const step of [1.55, 1.42, 1.34]) {
      for (const res of [1.5, 1.8]) {
        grid.push({ popBase, hab, step, res, late: [245, 300] });
      }
    }
  }
}

const rows = [];
for (const g of grid) {
  const patches = [];
  if (g.popBase !== 4) patches.push([P.popBase, 'SV.POP_BASE = ' + g.popBase + ';']);
  if (g.hab !== 2) patches.push([P.habPop, 'SV.HAB_POP = ' + g.hab + ';']);
  if (g.step !== 1.55) patches.push([P.step, 'SV.BUILD_STEP = ' + g.step + ';']);
  if (g.res !== 1.5) patches.push([P.research, P.research.replace('* 1.5 *', '* ' + g.res + ' *')]);

  const SV = loadWith(patches);
  const p = PLAYER(SV);
  let idleTurns = 0;
  const r = p.run(false, true, { onIdle: () => { idleTurns++; } });
  const lz = p.run(false, false);
  rows.push({
    初始人口: g.popBase, 居住舱: '+' + g.hab, 递增: g.step.toFixed(2), 科研系数: g.res.toFixed(1),
    通关: r.win ? r.turns : '未通关',
    发射: r.launches,
    科技: r.s.tech.length + '/' + SV.TECH.length,
    最长空转: r.maxIdle,
    空转占比: Math.round(idleTurns / r.turns * 100) + '%',
    饥荒: r.famine,
    对照组: lz.turns
  });
}

rows.sort((a, b) => (a.通关 === '未通关' ? 999 : a.通关) - (b.通关 === '未通关' ? 999 : b.通关));

console.log('\n=== 数值参数扫描（自动玩家 · 精细经营，按通关回合升序）===\n');
const cols = ['初始人口', '居住舱', '递增', '科研系数', '通关', '发射', '科技', '最长空转', '空转占比', '饥荒', '对照组'];
const w = {};
for (const c of cols) w[c] = Math.max(c.length * 2, ...rows.map(r => String(r[c]).length));
console.log('  ' + cols.map(c => String(c).padEnd(w[c])).join('  '));
console.log('  ' + '-'.repeat(cols.reduce((a, c) => a + w[c] + 2, 0)));
for (const r of rows) {
  console.log('  ' + cols.map(c => String(r[c]).padEnd(w[c])).join('  '));
}
console.log('\n  目标：通关 ≤110 回合 · 最长空转 ≤12 · 空转占比 ≤35% · 科技 15/15 · 饥荒 0。\n');
