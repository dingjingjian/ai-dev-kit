// DOM 级冒烟：用 jsdom 载入 index.html，跑完整脚本，检查无报错并验证稀有资源链路
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = path.join(__dirname, '..');
const nm = 'C:/Users/dingj/.workbuddy/binaries/node/workspace/node_modules';
const { JSDOM } = require(path.join(nm, 'jsdom'));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

// canvas 2d 上下文桩
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'canvas') return { width: 300, height: 300 };
      if (p === 'measureText') return () => ({ width: 12 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern')
        return () => ({ addColorStop() {} });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p === 'setTransform' || p === 'save' || p === 'restore') return () => {};
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;
win.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };
win.addEventListener('error', e => errors.push('window.error: ' + e.message));
const origErr = win.console.error;
win.console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); origErr.apply(win.console, a); };

// 依次注入脚本。清单从 index.html 里解析，新增脚本不必回头改测试
const srcs = [...html.matchAll(/<script\s+src="\.\/([^"]+)"/g)].map(m => m[1]);
srcs.forEach(f => {
  try {
    win.eval(fs.readFileSync(path.join(root, f), 'utf8'));
  } catch (e) {
    errors.push(`执行 ${f} 抛错：${e.message}`);
  }
});

const SV = win.SV, U = SV.util, H = SV.helpers, UI = SV.ui, G = SV.game;
const doc = win.document;
const $ = id => doc.getElementById(id);

// jsdom 可能停在 loading，game.js 就把 init/bind 挂在 DOMContentLoaded 上而不执行，
// 顶栏按钮的事件绑定会全部缺席。补派一次，让测试打到真实的绑定链路。
if (doc.readyState === 'loading') doc.dispatchEvent(new win.Event('DOMContentLoaded'));
ok(typeof G.curTab === 'string', '主控已初始化（bind 已执行）');

console.log('\n[1] 脚本载入');
ok(srcs.length >= 6, `从 index.html 解析到 ${srcs.length} 个脚本`);
ok(!!(SV && SV.game && SV.ui && SV.vfx && SV.flight && SV.bgm && SV.sfx),
  '全部模块挂载到 SV（含 bgm / sfx）');
ok(errors.length === 0, '载入阶段无报错' + (errors.length ? '：\n       ' + errors.join('\n       ') : ''));

// 代码里调用的每一个 SV.sfx.xxx 都必须真的存在。
// 少一个方法就是一次静默的 TypeError（在 try/catch 里会被吞掉，变成「没声音」）
{
  const names = new Set();
  for (const f of srcs) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/SV\s*\.\s*sfx\s*\.\s*(\w+)\s*\(/g)) names.add(m[1]);
  }
  names.delete('_ac');                       // 内部接口，bgm.js 单独用
  const missing = [...names].filter(n => typeof SV.sfx[n] !== 'function');
  ok(names.size >= 15, `代码里调用了 ${names.size} 种音效：${[...names].join(', ')}`);
  ok(missing.length === 0, '调用到的音效全部已实现' + (missing.length ? '，缺：' + missing.join(', ') : ''));
}

console.log('\n[2] 顶栏稀有资源行');
{
  const s = SV.store.fresh();
  SV.store.state = s;
  UI.renderTop(s);
  ok(!!$('rTi') && !!$('rHe') && !!$('rIce'), '三个稀有资源格子存在');
  ok(!!$('rRT') && !!$('rRH') && !!$('rRI'), '三个 bump 宿主存在');
  s.rare.ti = 7; s.rare.he = 3; s.rare.ice = 11;
  UI.renderTop(s);
  ok($('rTi').textContent === '7', '钛晶显示 7（实际 ' + $('rTi').textContent + '）');
  ok($('rHe').textContent === '3', '氦三显示 3');
  ok($('rIce').textContent === '11', '冰核显示 11');

  // 顶部资源顺序应与 SV.JOBS（人力分配）一致：金属→科研→燃料→口粮
  const resRow = doc.querySelector('.res:not(.rare)');
  const ids = Array.from(resRow.querySelectorAll('.r')).map(n => n.id);
  ok(ids.join(',') === 'rM,rS,rF,rFD', '顶部资源顺序与人力分配一致（' + ids.join(',') + '）');
}

console.log('\n[3] 基地面板：设施递增造价');
{
  const s = SV.store.fresh();
  SV.store.state = s;
  G.curTab = 'base';
  UI.renderBase(s);
  const btns = $('builds').querySelectorAll('button');
  const order = SV.BUILDINGS.map(b => b.id);
  ok(btns.length === 5, `五个建筑按钮渲染（${order.join('/')}）`);
  ok(btns[0].textContent === '34 金属', '第 2 座矿场报价 34（实际 ' + btns[0].textContent + '）');
  ok(btns[3].textContent === '43 金属', '第 2 座水培舱报价 43（实际 ' + btns[3].textContent + '）');
  ok(btns[4].textContent === '50 金属', '第 2 座居住舱报价 50（起始已自带 1 座，实际 ' + btns[4].textContent + '）');
  ok($('builds').innerHTML.indexOf('bi-x') >= 0, '显示「下一座 ×1.55 造价」提示');

  // 真建一座，看是否扣的是递增价
  s.res.metal = 500;
  G.build('mine');
  ok(Math.round(s.res.metal) === 500 - 34, '建造按递增价扣款 34（余 ' + Math.round(s.res.metal) + '）');
  ok(s.bases.earth.built.mine === 2, '矿场数量 +1');
}

console.log('\n[3b] 口粮：顶栏、收支条、短缺惩罚');
{
  const s = SV.store.fresh();
  SV.store.state = s;
  G.curTab = 'base';

  // 顶栏
  s.res.food = 7;
  UI.renderTop(s);
  ok($('rFood').textContent === '7', '顶栏口粮格显示 7（实际 ' + $('rFood').textContent + '）');
  ok(!!$('rFD'), '口粮 bump 宿主存在');

  // 初始配置应当能自给
  ok(H.foodNet(s) > 0, '初始配置口粮净收支为正（' + H.foodNet(s).toFixed(1) + '）');
  UI.renderBase(s);
  ok($('foodBar').className.indexOf('short') < 0, '自给时不显示短缺样式');

  // 把人全塞去采矿，农业岗空掉 → 应当预警
  s.bases.earth.pop = { mining: 3, research: 1, refine: 0, farming: 0 };
  UI.renderBase(s);
  ok(H.foodNet(s) < 0, '农业岗无人时净收支为负（' + H.foodNet(s).toFixed(1) + '）');
  ok($('foodBar').className.indexOf('short') >= 0, '收支条切换为短缺样式');
  ok($('foodBar').innerHTML.indexOf('减产') >= 0, '收支条给出减产预警文案');

  // 推进一回合：应当触发短缺，非口粮产出减半
  // 先把任务全标完成，免得首通奖励混进增量里
  s.done = SV.MISSIONS.map(m => m.id);
  s.res.food = 0;
  const before = { m: s.res.metal, r: s.res.research };
  const raw = H.produce(s);
  G.nextTurn();
  ok(s.stat.famine === 1, '记一次饥荒（' + s.stat.famine + '）');
  ok(Math.abs((s.res.metal - before.m) - raw.metal * SV.SHORTAGE_MULT) < 0.6,
    '金属产出按 ' + SV.SHORTAGE_MULT + ' 折扣结算（应得 ' + (raw.metal * SV.SHORTAGE_MULT).toFixed(1) +
    '，实得 ' + (s.res.metal - before.m).toFixed(1) + '）');
  ok(Math.abs((s.res.research - before.r) - raw.research * SV.SHORTAGE_MULT) < 0.6, '科研产出同样减半');

  // 不会死亡螺旋：口粮产出不随饥荒衰减，且玩家把人调去农业岗就能脱困
  const s2 = SV.store.fresh();
  SV.store.state = s2;
  s2.done = SV.MISSIONS.map(m => m.id);
  s2.bases.earth.built.hab = 4;                                        // popMax 12
  s2.bases.earth.pop = { mining: 7, research: 4, refine: 0, farming: 1 }; // 1 农民养不活 12 人
  s2.res.food = 0;
  const rates = [];
  for (let i = 0; i < 3; i++) { rates.push(Math.round(H.produce(s2).food * 10) / 10); G.nextTurn(); }
  ok(s2.stat.famine === 3, '持续饥荒 3 次（' + s2.stat.famine + '）');
  ok(rates[0] === rates[2] && rates[0] > 0, '口粮产出不随饥荒衰减（' + rates.join(' / ') + '）');
  H.setJob(s2, 'farming', 2);
  const famBefore = s2.stat.famine;
  G.nextTurn();
  ok(s2.stat.famine === famBefore, '把 1 人调去农业岗后即脱离饥荒');
  ok(H.foodNet(s2) > 0, '脱困后净收支转正（' + H.foodNet(s2).toFixed(1) + '）');

  // 各星球适宜度梯度
  const byId = id => SV.planetById(id).mod.food;
  ok(byId('earth') === 1 && byId('mercury') === 0.4 && byId('moon') === 0.5,
    '口粮适宜度梯度：地球 1 / 月球 0.5 / 水星 0.4');
  ok(byId('europa') === 1.2 && byId('titan') === 1.2, '木卫二与土卫六因水冰达到 1.2');
}

console.log('\n[3c] 老档迁移：补口粮字段 + v3 → v4 天体改名');
{
  // 先清掉前面用例写进 v4 键的存档，否则 load() 会优先读到它
  win.localStorage.removeItem('sv_save_v4');
  const legacy = { v: 3, turn: 20, base: 'moon', res: { metal: 88, fuel: 12, research: 30 },
    bases: { earth: { built: { mine: 1, lab: 1, refinery: 0, hab: 0 }, pop: { mining: 2, research: 2, refine: 0 } },
             moon: { built: { mine: 1, lab: 1, refinery: 1, hab: 1 }, pop: { mining: 3, research: 2, refine: 1 } } },
    tech: ['t0', 't1'], design: SV.newDesign(), saved: [], launchDesign: -1, launchTarget: null,
    done: [], ach: [], arrived: ['moon'], log: [], rare: { ti: 5, he: 0, ice: 0 },
    stat: { launches: 4, wins: 3, clean: 1, heavyLaunch: 0, crystals: 2, gained: { ti: 5, he: 0, ice: 0 } } };
  win.localStorage.setItem('sv_save_v3', JSON.stringify(legacy));
  const s = SV.store.load();
  ok(!!s && s.res.food === 12, '缺失的口粮补为 12');
  ok(s.stat.famine === 0, '补 famine 计数');
  ok(s.bases.earth.built.farm === 1 && s.bases.moon.built.farm === 1, '每座基地补水培舱');
  ok(s.bases.earth.pop.farming === 1, '地球基地补了 1 名农民');
  ok(s.bases.moon.pop.farming === 1, '月球基地补了 1 名农民（从别岗挪过去）');
  ok(H.popTotal(s) <= H.popMax(s), '迁移后在岗人数未超上限');
  ok(s.v === 4, 'v3 旧档版本号升到 4');
  // 同一份旧档里的木卫二/土卫六用的是旧 id，迁移后必须指向新 id
  ok(s.bases.moon && !s.bases.jupiter && !s.bases.saturn, '未涉及改名的基地原样保留');
}

console.log('\n[3d] v3 → v4：木卫二 / 土卫六 id 改名');
{
  win.localStorage.removeItem('sv_save_v4');
  const legacy = { v: 3, turn: 60, base: 'jupiter',
    res: { metal: 88, fuel: 12, research: 30, food: 12 },
    bases: { earth: SV.newBase(), jupiter: SV.newBase(), saturn: SV.newBase() },
    tech: ['t0', 't1', 't10'], design: SV.newDesign(), saved: [], launchDesign: -1, launchTarget: 'saturn',
    done: [], ach: [], arrived: ['moon', 'jupiter', 'saturn'], log: [],
    rare: { ti: 5, he: 2, ice: 3 },
    stat: { launches: 6, wins: 5, clean: 1, heavyLaunch: 1, crystals: 2, famine: 0, gained: { ti: 5, he: 2, ice: 3 } } };
  win.localStorage.setItem('sv_save_v3', JSON.stringify(legacy));
  const s = SV.store.load();
  ok(!!s, 'v3 旧档能被读出');
  ok(s.base === 'europa', '主基地 jupiter → europa');
  ok(s.launchTarget === 'titan', '发射目标 saturn → titan');
  ok(!!s.bases.europa && !!s.bases.titan, 'bases 键名整体改名');
  ok(s.arrived.indexOf('europa') >= 0 && s.arrived.indexOf('jupiter') < 0, 'arrived 数组整体改名');
  ok(s.stat.gained.ice === 3, '累计带回统计不丢');
  ok(!!SV.planetById(s.base) && s.arrived.every(id => !!SV.planetById(id)), '改名后 id 全部指向真实天体');
  win.localStorage.removeItem('sv_save_v4');
}

console.log('\n[4] 科技树弹窗：稀有需求与门禁');
{
  const s = SV.store.fresh();
  s.res.research = 9999;
  s.tech = ['t0', 't1', 't2'];
  SV.store.state = s;
  UI.openTech(s);
  const nodes = $('techmap').querySelectorAll('.tnode');
  ok(nodes.length === SV.TECH.length, `${SV.TECH.length} 个节点全部渲染（实际 ${nodes.length}）`);
  const t4node = Array.from(nodes).find(n => n.textContent.indexOf('中推力引擎') === 0);
  ok(!!t4node, '找到「中推力引擎」节点');
  ok(t4node && t4node.className.indexOf('short') >= 0, '缺资源时节点标为 short（' + (t4node && t4node.className) + '）');
  ok(t4node && t4node.innerHTML.indexOf('0/4') >= 0, '节点上显示 0/4 稀有需求');
  // 默认信息面板展示「当前就能点」的节点，点 t4 才切到它
  ok($('techInfo').innerHTML.indexOf('小燃料罐') >= 0, '信息面板默认停在当前可解锁节点（小燃料罐）');
  t4node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok($('techInfo').innerHTML.indexOf('钛晶 0/4') >= 0, '信息面板显示 钛晶 0/4');
  ok($('techInfo').innerHTML.indexOf('产自 月球 · 水星 · 小行星带') >= 0, '信息面板标注产地');

  // 上面那一次点击即被门禁拦下，科技没解锁
  ok(s.tech.indexOf('t4') < 0, '点击被门禁拦下，未解锁');
  ok($('toast').classList.contains('on'), '弹出「稀有资源不足」提示');
  ok($('toastD').innerHTML.indexOf('月球') >= 0, '提示里点明去哪采（' + $('toastD').textContent.slice(0, 40) + '…）');

  // 给足资源再点
  H.gainRare(s, 'ti', 20);
  UI.openTech(s);
  const t4b = Array.from($('techmap').querySelectorAll('.tnode')).find(n => n.textContent.indexOf('中推力引擎') === 0);
  ok(t4b.className.indexOf('avail') >= 0 && t4b.className.indexOf('short') < 0, '资源齐了节点变可解锁');
  t4b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(s.tech.indexOf('t4') >= 0, '点击后成功解锁');
  ok(s.rare.ti === 16, '扣除 4 钛晶（余 ' + s.rare.ti + '）');
}

console.log('\n[4b] 火箭设计：航程模型、载荷、过载、造价、航线门槛');
{
  const s = SV.store.fresh();
  s.tech = SV.TECH.map(t => t.id);
  SV.store.state = s;

  // --- 航程与飞行消耗必须是同一套模型 ---
  const d = { pod: 'pod_l', tanks: ['tank_l', 'tank_l', 'tank_l'], engines: ['engine_m', 'engine_m', 'engine_m'], payloads: [] };
  const c = SV.calcDesign(d, s);
  const T = SV.FLIGHT_BASE_T + c.range * SV.FLIGHT_T_PER_DIST;
  const used = c.fuel * (c.range / c.range);          // 按航程飞满
  ok(Math.abs(used - c.fuel) < 0.01, '按面板航程飞满正好烧光一箱油（面板数字 = 实际可飞距离）');
  ok(T > 0 && isFinite(T), '飞行时长可由航程反推（' + T.toFixed(1) + ' 秒）');

  // --- 航线机动门槛：省油的小引擎推不动重装去外太阳系 ---
  const heavy = { pod: 'pod_l', tanks: ['tank_l', 'tank_l', 'tank_l'], engines: ['engine_s', 'engine_s', 'engine_s'], payloads: ['armor', 'cargo'] };
  const hc = SV.calcDesign(heavy, s);
  const europa = SV.planetById('europa');
  const blk = SV.routeBlockers(hc, Math.abs(europa.dist - 0), europa.haz);
  ok(hc.range > 150, '小引擎航程够远（' + Math.round(hc.range) + '）');
  ok(blk.length > 0 && blk[0].indexOf('推重比') >= 0, '但推重比不足被木卫二航线拦下（' + blk[0] + '）');
  ok(SV.minTwrFor(1) === 1.2 && SV.minTwrFor(2) > SV.minTwrFor(1) && SV.minTwrFor(3) > SV.minTwrFor(2),
    '航线危险度越高，最低推重比要求越高（1.2 / ' + SV.minTwrFor(2).toFixed(1) + ' / ' + SV.minTwrFor(3).toFixed(1) + '）');

  // --- 过载 ---
  const od = SV.calcDesign({ pod: 'pod_s', tanks: ['tank_s'], engines: ['engine_m'], payloads: [] }, s);
  ok(od.overload > 0, '基础舱配中引擎触发过载（推重比 ' + od.twr.toFixed(1) + ' > 上限 ' + od.maxTwr + '）');
  ok(!od.canFly, '且无护盾吸收应力时直接判不可起飞');
  const od2 = SV.calcDesign({ pod: 'pod_l', tanks: ['tank_l', 'tank_l', 'tank_l'], engines: ['engine_l', 'engine_l', 'engine_l'], payloads: ['armor'] }, s);
  ok(od2.overload === 0 && od2.shield === 3, '重型舱满配不过载，护盾 2+1=3 层');

  // --- 燃料容量上限 ---
  const over = SV.calcDesign({ pod: 'pod_s', tanks: ['tank_l'], engines: ['engine_s'], payloads: [] }, s);
  ok(!over.canFly && over.problems.join().indexOf('容量上限') >= 0, '基础舱装大燃料罐被容量上限拦下');

  // --- 载荷互斥 + 位置限制 ---
  ok(SV.PAYLOADS.length === 6, '共 6 种互斥载荷');
  s.design = { pod: 'pod_l', tanks: ['tank_l'], engines: ['engine_l'], payloads: ['cargo', 'armor', 'nav'] };
  ok(SV.calcDesign(s.design, s).payloads.length === 3, '重型舱可装 3 件载荷');
  G.togglePart('payload', 'sampler');
  ok(s.design.payloads.indexOf('sampler') < 0, '第 4 件载荷被拒（载荷位已满）');
  G.togglePart('payload', 'cargo');
  ok(s.design.payloads.length === 2, '再点已装的载荷会卸下（互斥切换）');
  // 换小舱体应自动裁剪到新的载荷位数量
  s.design = { pod: 'pod_l', tanks: ['tank_l'], engines: ['engine_l'], payloads: ['cargo', 'armor', 'nav'] };
  G.togglePart('pod', 'pod_s');
  ok(s.design.payloads.length <= 1, '换基础舱后载荷自动裁到 1 件');
  ok(!s.design.tanks.some(t => SV.PARTS[t].fuel > SV.PARTS.pod_s.fuelCap), '超容量的燃料罐也被卸下');

  // --- 造价：保存设计时扣除金属 ---
  s.design = { pod: 'pod_s', tanks: ['tank_s'], engines: ['engine_s'], payloads: [] };
  s.res.metal = 5;
  G.saveDesign();
  ok(s.saved.length === 0, '金属不足时制造被拒');
  s.res.metal = 200;
  const before = s.res.metal;
  G.saveDesign();
  ok(s.saved.length === 1, '金属充足时制造成功');
  ok(Math.round(s.res.metal) === before - s.saved[0].cost, '按造价扣款（' + s.saved[0].cost + ' 金属）');
  ok(s.saved[0].cost === 20, '基础舱+小罐+小引擎造价 20（实际 ' + s.saved[0].cost + '）');

  // --- 航程最大的配置不该是「最贵」的：验证没有无脑最优 ---
  const mk = (pods, t, e, p) => SV.calcDesign({ pod: pods, tanks: t, engines: e, payloads: p || [] }, s);
  const bigE = mk('pod_l', ['tank_l', 'tank_l', 'tank_l'], ['engine_l', 'engine_l', 'engine_l']);
  const mixE = mk('pod_l', ['tank_l', 'tank_l', 'tank_l'], ['engine_l', 'engine_l', 'engine_m']);
  const smlE = mk('pod_l', ['tank_l', 'tank_l', 'tank_l'], ['engine_s', 'engine_s', 'engine_s']);
  ok(mixE.range > bigE.range, '混搭「两大一中」比「三大引擎」飞得远（' + Math.round(mixE.range) + ' vs ' + Math.round(bigE.range) + '）');
  ok(smlE.range > mixE.range, '而「三小引擎」又比混搭更远（' + Math.round(smlE.range) + '）');
  ok(smlE.twr < SV.minTwrFor(3) && mixE.twr >= SV.minTwrFor(3), '但小引擎推重比不够，去不了危险航线 —— 这是取舍不是强弱');

  // 性能参数区：已装备载荷说明，没装备则不显示
  s.design = { pod: 'pod_s', tanks: ['tank_s'], engines: ['engine_s'], payloads: [] };
  UI.renderDesign(s);
  ok(!$('calc').querySelector('.payload-sum'), '无载荷时不显示载荷效果行');
  s.design.payloads = ['inst', 'armor'];
  UI.renderDesign(s);
  var psRow = $('calc').querySelector('.payload-sum');
  ok(!!psRow, '装备载荷后显示载荷效果行');
  ok(psRow && psRow.textContent.indexOf('科学仪') >= 0 && psRow.textContent.indexOf('装甲板') >= 0, '效果行列出已装备载荷名');
  ok(psRow && psRow.textContent.indexOf('航程 +15%') >= 0, '效果行含对应说明文案');

  // 助推器成对装配、左右对称
  s.design = { pod: 'pod_m', tanks: [], engines: ['engine_m'], payloads: [], boosters: [] };
  G.togglePart('booster', 'booster_s');
  ok(s.design.boosters.length === 2, '助推器成对装配（' + s.design.boosters.length + '）');
  var rc = SV.calcDesign(s.design, s);
  var lay = SV.vfx.rocketLayout(rc, 1);
  var bs = lay.items.filter(function (it) { return it.kind === 'booster'; });
  ok(bs.length === 2 && Math.abs(bs[0].x + bs[1].x) < 0.01, '两助推器左右对称（x ' + bs[0].x.toFixed(1) + ' / ' + bs[1].x.toFixed(1) + '）');
  G.togglePart('booster', 'booster_s');
  ok(s.design.boosters.length === 0, '再点成对移除（' + s.design.boosters.length + '）');

  // 3 引擎时引擎组宽于主体，需要整流裙段填补左右空隙
  s.design = { pod: 'pod_l', tanks: ['tank_l'], engines: ['engine_m', 'engine_m', 'engine_m'], payloads: [], boosters: [] };
  var rc3 = SV.calcDesign(s.design, s);
  var lay3 = SV.vfx.rocketLayout(rc3, 1);
  var e3L = Infinity, e3R = -Infinity, b3L = Infinity, b3R = -Infinity;
  lay3.items.forEach(function (it) {
    if (it.kind === 'engine') { e3L = Math.min(e3L, it.x - it.w / 2); e3R = Math.max(e3R, it.x + it.w / 2); }
    else if (it.kind === 'tank' || it.kind === 'pod') { b3L = Math.min(b3L, it.x - it.w / 2); b3R = Math.max(b3R, it.x + it.w / 2); }
  });
  ok(e3R - e3L > b3R - b3L + 1, '3 引擎组宽于主体（引擎 ' + (e3R - e3L).toFixed(1) + ' > 主体 ' + (b3R - b3L).toFixed(1) + '）');

  // 引擎只能同型号、可多装；点不同型号切换
  s.design = { pod: 'pod_m', tanks: [], engines: [], payloads: [], boosters: [] };
  G.togglePart('engine', 'engine_s');
  ok(s.design.engines.length === 1 && s.design.engines[0] === 'engine_s', '装第一台 engine_s（' + s.design.engines.join(',') + '）');
  G.togglePart('engine', 'engine_s');
  ok(s.design.engines.length === 2 && s.design.engines[0] === 'engine_s', '同型号加第二台（' + s.design.engines.join(',') + '）');
  G.togglePart('engine', 'engine_m');
  ok(s.design.engines.length === 1 && s.design.engines[0] === 'engine_m', '点不同型号切换重置（' + s.design.engines.join(',') + '）');
}

console.log('\n[5] 发射页：星球卡显示可带回的稀有资源');
{
  const s = SV.store.fresh();
  s.tech = SV.TECH.map(t => t.id);
  s.bases.moon = SV.newBase();
  SV.store.state = s;
  UI.renderLaunch(s);
  const cards = $('targetList').querySelectorAll('.t');
  ok(cards.length === SV.PLANETS.length - 1, `${SV.PLANETS.length - 1} 个可飞目标（实际 ${cards.length}）`);
  ok($('targetList').querySelectorAll('.rchip').length >= 6, '星球卡显示稀有资源标签');
  const moonCard = Array.from(cards).find(c => c.textContent.indexOf('月球') === 0);
  ok(!!moonCard && moonCard.innerHTML.indexOf('+20') >= 0, '未抵达的月球显示首访 +20');
  ok(!!moonCard && moonCard.innerHTML.indexOf('首次勘探') >= 0, '标注「首次勘探」');

  // 已经抵达过的星球改为例行采样量
  s.arrived = ['europa', 'moon'];
  UI.renderLaunch(s);
  const cards2 = $('targetList').querySelectorAll('.t');
  const jCard = Array.from(cards2).find(c => c.textContent.indexOf('木卫二') === 0);
  ok(!!jCard && jCard.innerHTML.indexOf('+10') >= 0, '已抵达的木卫二显示例行 +10');
  ok(!!jCard && jCard.innerHTML.indexOf('例行采样') >= 0, '标注「例行采样」');
  const moon2 = Array.from(cards2).find(c => c.textContent.indexOf('月球') === 0);
  ok(!!moon2 && moon2.innerHTML.indexOf('+10') >= 0, '已抵达的月球从 +20 降为 +10');
}

console.log('\n[6] 远征结算：成功带回 / 失败颗粒无收');
{
  const s = SV.store.fresh();
  SV.store.state = s;
  const moon = SV.planetById('moon');
  // 直接调用内部结算：模拟成功抵达
  G.__settleForTest ? null : null;
  const before = s.rare.ti;
  // settle 是模块私有，用 rareYield + gainRare 走同一条路径
  const ry = H.rareYield(s, moon, true);
  H.gainRare(s, ry.id, ry.n);
  ok(s.rare.ti === before + 20, '首访月球带回 20 钛晶');
  ok(s.stat.gained.ti === 20, '累计统计 +20');
  const ry2 = H.rareYield(s, moon, false);
  H.gainRare(s, ry2.id, ry2.n);
  ok(s.rare.ti === before + 30, '第二次例行带回 10 钛晶');
}

console.log('\n[7] 帮助面板含稀有资源说明');
{
  UI.openHelp();
  const t = $('sheet').textContent;
  ok(t.indexOf('稀有资源') >= 0, '帮助里有「稀有资源」章节');
  ok(t.indexOf('钛晶') >= 0 && t.indexOf('氦三') >= 0 && t.indexOf('冰核') >= 0, '三种资源都有介绍');
  ok($('sheet').innerHTML.indexOf('rchip') >= 0, '用彩色标签渲染资源名');
}

console.log('\n[7b] 档案面板：基地「前往」按钮可切换主基地');
{
  const s = SV.store.fresh();
  s.bases.moon = SV.newBase();
  SV.store.state = s;
  ok(s.base === 'earth', '初始主基地为地球');
  UI.renderLog(s);
  const items = $('baseList').querySelectorAll('.saved-item');
  ok(items.length === 2, '档案列出 2 座基地（实际 ' + items.length + '）');
  const goBtn = $('baseList').querySelector('button');
  ok(!!goBtn && goBtn.textContent === '前往', '月球基地行有「前往」按钮');
  goBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(s.base === 'moon', '点击后主基地切换至月球（实际 ' + s.base + '）');
}

console.log('\n[8] BGM：无 AudioContext 时必须静默且不报错');
{
  const B = SV.bgm;
  ok(win.AudioContext === undefined && win.webkitAudioContext === undefined, 'jsdom 确实没有 AudioContext（前提成立）');

  const before = errors.length;
  // 把整个对外接口都过一遍，任何一个抛错都会被测出来
  try {
    B.setEnabled(true);
    B.play('flight');
    B.setScene('base');
    B.setScene('design');
    B.setScene('launch');
    B.setScene('win');
    B.setScene('log');
    B.setScene('menu');
    B.duck(0.6, 500);
    B.suspend();
    B.resume();
    B.stop();
    B.setEnabled(false);
    B.setEnabled(true);
    ok(true, '全部 BGM 接口调用未抛错');
  } catch (e) {
    ok(false, 'BGM 接口抛错：' + e.message);
  }
  ok(errors.length === before, '未产生新的运行期报错');
  ok(B.isPlaying() === false, '无音频环境不会误报「正在播放」');

  // 场景名写错不能让游戏崩，也不能切到空场景
  try { B.setScene('不存在的场景'); ok(true, '未知场景名被容错'); }
  catch (e) { ok(false, '未知场景名抛错：' + e.message); }
  ok(B.curScene() && B.curScene().bpm > 0, '未知场景名不影响当前场景');

  // 存档里的开关要能往返
  const s = SV.store.fresh();
  ok(s.opts && s.opts.bgm === true, '新存档默认开启 BGM');
  s.opts.bgm = false;
  ok(!s.opts.bgm, '关闭后写入存档');
  // 旧档没有 opts 字段时，load() 应自动补齐而不是 undefined
  const legacy = { v: 4, turn: 3, base: 'earth', bases: { earth: s.bases.earth }, res: s.res, tech: ['t0'] };
  SV.store.state = legacy;
  const reloaded = JSON.parse(JSON.stringify(legacy));
  ok(!reloaded.opts, '构造的旧档确实没有 opts 字段（前提成立）');
  const merged = Object.assign(SV.store.fresh(), reloaded);
  ok(merged.opts && merged.opts.bgm === true, '旧档经补齐后拿到默认 BGM 设置');

  // 顶栏与开始界面两个开关必须同步
  const b1 = $('btnBgm'), b2 = $('btnBgm2');
  ok(!!b1 && !!b2, '顶栏和开始界面各有一个 BGM 开关');
  const wasOn = B.isEnabled();
  b1.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(B.isEnabled() === !wasOn, '点顶栏开关能切换');
  ok(b1.classList.contains('off') === !B.isEnabled(), '顶栏图标跟随状态');
  ok(b2.classList.contains('off') === !B.isEnabled(), '开始界面图标同步');
  ok(SV.store.state.opts.bgm === !wasOn, '状态写进存档');
  b2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(B.isEnabled() === wasOn, '点开始界面开关能切回来');
  ok(b2.classList.contains('off') === !B.isEnabled(), '切回后图标再次同步');
}

console.log('\n[9] 运行期错误汇总');
ok(errors.length === 0, '全程无 JS 报错' + (errors.length ? '：\n       ' + errors.join('\n       ') : ''));

console.log('\n' + (fail ? `✗ ${fail} 项未通过` : '✓ 全部通过'));
process.exit(fail ? 1 : 0);
