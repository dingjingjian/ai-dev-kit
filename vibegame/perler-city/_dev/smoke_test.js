/**
 * 无头冒烟测试：手写 DOM stub 真实执行 main.js。
 *
 * 覆盖三层：
 *   A 局（全新存档）—— 启动、图纸册分组、拼豆全流程、熨烫落成
 *   B 局（预置存档）—— 电力/供水/垃圾供需、停电惩罚、RCI 需求方向
 *   C 局（预置存档）—— 商业人气、人口向岗位与容量收敛
 *
 * 用法：node _dev/smoke_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, '_dev/data/buildings.json'), 'utf8'));

let failed = 0;
function ok(cond, name, extra) {
  console.log(`  [${cond ? '✓' : '✗'}] ${name}${cond ? '' : '  ← ' + (extra === undefined ? '' : extra)}`);
  if (!cond) failed++;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// 游戏内时间只在 rAF 回调里推进，光 sleep 不涨：边睡边推帧
async function advance(env, ms, step) {
  step = step || 100;
  const n = Math.max(1, Math.round(ms / step));
  for (let i = 0; i < n; i++) { await sleep(step); env.runFrames(1); }
}
const totalOf = (b) => b.rows.reduce((t, r) => t + [...r].filter(c => c !== '.').length, 0);
const B = (id) => DATA.buildings.find(b => b.id === id);

// ---------------------------------------------------------------- 语法
try {
  new Function(js);
  ok(true, 'main.js 语法检查通过');
} catch (e) {
  ok(false, 'main.js 语法检查', e.message);
  process.exit(1);
}

// ---------------------------------------------------------------- DOM stub 工厂
const ctxStub = () => new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 8 });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; }
});
const SIZES = { cityCanvas: [360, 360], boardCanvas: [300, 300], dust: [360, 640] };
const STAGE = { clientWidth: 320, clientHeight: 320 };

// style 做成 Proxy：真浏览器的 CSSStyleDeclaration 有 setProperty / getPropertyValue，
// 普通对象会让「用自定义属性传主题色」这类写法在测试里直接崩，而真机上正常。
function makeStyle() {
  const raw = {};
  return new Proxy(raw, {
    get(t, k) {
      if (k === 'setProperty') return (p, v) => { t[p] = v; };
      if (k === 'getPropertyValue') return p => t[p] || '';
      if (k === 'removeProperty') return p => { const v = t[p]; delete t[p]; return v || ''; };
      if (k === 'cssText') return Object.keys(t).map(k2 => `${k2}:${t[k2]}`).join(';');
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
    has(t, k) { return k in t; },
    ownKeys(t) { return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, k) { return Reflect.getOwnPropertyDescriptor(t, k); }
  });
}

// innerHTML 要能从 DOM 树序列化出来。否则一旦代码改用 appendChild 建结构
// （而不是拼 innerHTML 字符串），所有基于 innerHTML 的断言都会静默拿到空串。
function serializeTree(node) {
  let out = '';
  (node.children || []).forEach(c => { out += serializeNode(c); });
  return out;
}
function serializeNode(n) {
  const tag = String(n.tagName || 'div').toLowerCase();
  const cls = n.className ? ` class="${n.className}"` : '';
  let st = '';
  try {
    const keys = Object.keys(n.style || {});
    if (keys.length) st = ` style="${keys.map(k => `${k}:${n.style[k]}`).join(';')}"`;
  } catch (e) { /* style 不可枚举时忽略 */ }
  const inner = (n.children && n.children.length)
    ? serializeTree(n)
    : (n._html || n._text || '');
  return `<${tag}${cls}${st}>${inner}</${tag}>`;
}

function makeEl(tag, id) {
  const classes = new Set();
  const el = {
    tagName: tag, id: id || '', children: [], dataset: {}, style: makeStyle(), _html: '', _text: '',
    parentNode: null, onclick: null, _h: {}, firstChild: null, lastChild: null,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, f) => { const v = f === undefined ? !classes.has(c) : !!f; v ? classes.add(c) : classes.delete(c); return v; }
    },
    appendChild(c) {
      this.children.push(c);
      this.firstChild = this.children[0];
      this.lastChild = this.children[this.children.length - 1];
      c.parentNode = this; return c;
    },
    addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth || 300, height: this.clientHeight || 300 }; },
    getContext: () => ctxStub(),
    setAttribute() {}, getAttribute() { return null; }, focus() {}, blur() {},
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() {
      // 有子节点时从 DOM 树序列化（覆盖 appendChild 建结构的场景）
      return (el.children && el.children.length) ? serializeTree(el) : el._html;
    },
    set(v) { this._html = v; if (v === '') { this.children = []; this.firstChild = null; this.lastChild = null; } }
  });
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; }, set(v) { this._text = String(v); }
  });
  if (tag === 'canvas') {
    el.width = 0; el.height = 0;
    const sz = SIZES[id] || [300, 300];
    el.clientWidth = sz[0]; el.clientHeight = sz[1];
    if (id === 'boardCanvas') el.parentNode = STAGE;
  }
  return el;
}

// reveal=true 时把 IIFE 内部状态挂到 window.__GAME 上（在 IIFE 关闭前插入赋值，
// 此时局部变量还活着），用于断言那些不直接体现在 DOM 上的不变量。
const EXPOSE = `
;window.__GAME = {
  DATA: DATA, LIST: LIST, BY_ID: BY_ID, CATS: CATS,
  get S(){ return S; },
  GRID_N: GRID_N, START_COINS: START_COINS, BASE_SUPPLY: BASE_SUPPLY,
  BASE_INCOME: BASE_INCOME, TAX_PER_HEAD: TAX_PER_HEAD,
  JOBLESS_ALLOW: JOBLESS_ALLOW, TRASH_CAP: TRASH_CAP,
  stats: stats, demands: demands, diagnose: diagnose, recommendCat: recommendCat,
  placeBuilding: placeBuilding, popTarget: popTarget, peakPop: peakPop,
  resetGame: resetGame, SAVE_KEY: SAVE_KEY,
  audUnlock: audUnlock, sfx: sfx, setSound: setSound, bgmSchedule: bgmSchedule,
  SND_KEY: SND_KEY,
  get soundOn(){ return soundOn; }, get bgmOn(){ return bgmOn; }
};
`;
// main.js 以 CRLF 结尾，正则 $ 默认不匹配 \r\n，改用 lastIndexOf 定位
function injectExpose(src) {
  const i = src.lastIndexOf('})();');
  return src.slice(0, i) + EXPOSE + src.slice(i);
}

// ---------------------------------------------------------------- 假 AudioContext
// 目的不是验证「好不好听」（听不了），而是钉死三件会在真机上静默炸掉的事：
//   1. exponentialRamp 的端点为 0 —— 浏览器直接抛异常，且只在特定分支上抛
//   2. 切后台再回来，调度器把积压的几百个音符一次性排进去
//   3. 静音后仍在建节点，白烧 CPU
// 所以这个替身对非法参数是真的 throw，不是静默吞掉。
function AudioParam(v) { this.value = v; }
function chk(v, t) {
  if (typeof v !== 'number' || !isFinite(v)) throw new Error('音频参数非法：' + v);
  if (typeof t !== 'number' || !isFinite(t) || t < 0) throw new Error('音频时间非法：' + t);
}
AudioParam.prototype.setValueAtTime = function (v, t) { chk(v, t); this.value = v; return this; };
AudioParam.prototype.linearRampToValueAtTime = function (v, t) { chk(v, t); this.value = v; return this; };
AudioParam.prototype.exponentialRampToValueAtTime = function (v, t) {
  if (v === 0) throw new Error('exponentialRampToValueAtTime 的目标值不能为 0');
  chk(v, t); this.value = v; return this;
};
AudioParam.prototype.cancelScheduledValues = function () { return this; };

function FakeCtx() {
  const self = this;
  this.sampleRate = 44100;
  this.state = 'running';
  this.destination = { connect() {} };
  this.now = 0;                                   // 测试里手动推进，不跟真实时钟走
  this.started = [];                              // 记录每次 start(t)，用来验证调度不失控
  this.n = { osc: 0, gain: 0, filter: 0, buffer: 0, src: 0 };
  Object.defineProperty(this, 'currentTime', { get() { return self.now; } });
  FakeCtx.last = this;
}
FakeCtx.prototype.createGain = function () {
  this.n.gain++;
  return { gain: new AudioParam(1), connect() {}, disconnect() {} };
};
FakeCtx.prototype.createOscillator = function () {
  const c = this; this.n.osc++;
  return { type: 'sine', frequency: new AudioParam(440), connect() {}, disconnect() {},
           start(t) { c.started.push(t); }, stop() {} };
};
FakeCtx.prototype.createBiquadFilter = function () {
  this.n.filter++;
  return { type: 'bandpass', frequency: new AudioParam(1000), Q: new AudioParam(1),
           connect() {}, disconnect() {} };
};
FakeCtx.prototype.createBuffer = function (ch, len, sr) {
  this.n.buffer++;
  const data = new Float32Array(len);
  return { length: len, getChannelData() { return data; } };
};
FakeCtx.prototype.createBufferSource = function () {
  const c = this; this.n.src++;
  return { buffer: null, connect() {}, disconnect() {},
           start(t) { c.started.push(t); }, stop() {} };
};
FakeCtx.prototype.resume = function () { this.state = 'running'; return Promise.resolve(); };
FakeCtx.prototype.suspend = function () { this.state = 'suspended'; return Promise.resolve(); };

function boot(saveObj, reveal, audio, extra) {
  const src = reveal ? injectExpose(js) : js;
  const elements = {};
  [...new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]))].forEach(i => {
    elements[i] = makeEl(['cityCanvas', 'boardCanvas', 'dust'].includes(i) ? 'canvas' : 'div', i);
  });
  const document = {
    hidden: false,
    getElementById: id => elements[id] || (elements[id] = makeEl('div', id)),
    createElement: t => makeEl(t),
    addEventListener() {}
  };
  const store = {};
  if (saveObj) store['pcity_v2'] = JSON.stringify(saveObj);
  if (extra) Object.assign(store, extra);   // 用于预置声音偏好等独立存档键
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const rafQ = [];
  const requestAnimationFrame = fn => { rafQ.push(fn); return rafQ.length; };
  const runFrames = (n) => {
    for (let i = 0; i < n; i++) rafQ.splice(0).forEach(f => f(Date.now()));
  };
  const window = { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} };
  if (audio) window.AudioContext = FakeCtx;
  // 定时器一律接管：Node 的真 setInterval 会在测试结束后把进程吊住
  const intervals = [];
  const setInterval = fn => { intervals.push(fn); return intervals.length; };
  const clearInterval = () => {};
  // 注意用 slice 而不是 splice：定时器要留在数组里，否则只能泵一次，
  // 第二次 pumpTimers 就成了空转（测试会「假通过」）
  const pumpTimers = () => intervals.slice().forEach(f => f());
  new Function('window', 'document', 'localStorage', 'requestAnimationFrame',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'navigator', src)(
    window, document, localStorage, requestAnimationFrame,
    fn => { fn(); return 0; }, () => {}, setInterval, clearInterval, { userAgent: 'node' });
  return { elements, runFrames, store, rafQ, document, intervals, pumpTimers,
           game: window.__GAME || null };
}

const CITY_CELL = Math.floor(Math.min(360 - 16, 360 - 16) / 6);
const CITY_OX = Math.round((360 - CITY_CELL * 6) / 2);
function tapPlot(E, gx, gy) {
  const x = CITY_OX + gx * CITY_CELL + CITY_CELL / 2;
  const y = CITY_OX + gy * CITY_CELL + CITY_CELL / 2;
  const c = E.cityCanvas;
  c._h.pointerdown[0]({ clientX: x, clientY: y });
  c._h.pointerup[0]({ clientX: x, clientY: y });
}
// 蓝图：tab 筛选项在 bpTabs，缩略图条在 bpStrip；每条 .bp-strip-item
// 等价于旧版的「一张卡」。底部 CTA 是 #bpDockCta。
function cardsOf(E) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (String(node.className || '').indexOf('bp-strip-item') >= 0) { out.push(node); return; }
    (node.children || []).forEach(walk);
  };
  (E.bpStrip.children || []).forEach(walk);
  return out;
}
// 旧版每张卡自带「拼一座/直接建造」按钮；新版移到 bpDockCta 上。
// actOf(card) 现在忽略 card 参数，直接返回底部 CTA，让旧断言依然能跑。
function actOf(_card) { return E.bpDockCta; }
function tabsOf(E) { return E.bpTabs.children || []; }
function tabNamed(E, text) {
  return tabsOf(E).find(t => (t.textContent || t._html || '').indexOf(text) >= 0);
}
function onTabs(E) { return tabsOf(E).filter(t => t.classList.contains('on')).map(t => t._html); }
function fillBoard(E, b) {
  const n = b.rows.length;
  const cell = Math.floor(Math.min(STAGE.clientWidth, STAGE.clientHeight) / (n + 0.9));
  const pad = Math.max(10, Math.round(cell * 0.42));
  const down = E.boardCanvas._h.pointerdown[0];
  const pick = (k) => {
    for (const el of E.palette.children) if (el.dataset.k === k) { el.onclick(); return true; }
    return false;
  };
  let placed = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const ch = b.rows[y].charAt(x);
      if (ch === '.') continue;
      pick(ch);
      down({ clientX: pad + x * cell + cell / 2, clientY: pad + y * cell + cell / 2 });
      placed++;
    }
  }
  return { placed, total: totalOf(b) };
}

// ================================================================ A 局
console.log('\n—— A 局：全新存档 ——');
const A = boot(null);
const E = A.elements;
A.runFrames(3);

ok(E.cityName.textContent === '荒地', '初始称号 = 荒地', E.cityName.textContent);
ok(E.vCoins.textContent === '240', '初始金币 = 240', E.vCoins.textContent);
ok(E.vPop.textContent === '0', '初始人口 = 0', E.vPop.textContent);
ok(E.vHappy.textContent === '50', '初始幸福 = 50', E.vHappy.textContent);
ok(E.dR.style.width === '15%', '空城住宅需求条为正引导 15%', E.dR.style.width);

tapPlot(E, 0, 0);
// 筛选条：推荐 + 全部 + 7 个类别
ok(tabsOf(E).length === DATA.cats.length + 2,
  `筛选条 ${DATA.cats.length + 2} 个标签（推荐/全部/${DATA.cats.length} 类）`, tabsOf(E).length);
ok(onTabs(E).length === 1 && onTabs(E)[0].indexOf('推荐') >= 0,
  '默认选中「推荐」标签', JSON.stringify(onTabs(E)));

// 空城：没有任何供需缺口，推荐页应指向住宅（R 需求为正）
// 新版：strip 标签写「推荐类目 · N 张」，类目色从 strip 第一项可读
const recStripLabel = (E.bpStripLabel && E.bpStripLabel.textContent) || '';
ok(recStripLabel.indexOf('推荐类目') >= 0,
  '空城推荐页 strip 标签含「推荐类目」', recStripLabel);
const recCards = cardsOf(E);
ok(recCards.length === DATA.buildings.filter(b => b.cat === 'res').length,
  '推荐页只列出住宅类图纸', recCards.length);
// 底部 dock CTA 反映当前选中图纸：未掌握时是「去拼豆台」
ok(E.bpDockCta && /去拼豆台/.test(E.bpDockCta.textContent || ''),
  '未掌握图纸底部 CTA 显示「去拼豆台」', E.bpDockCta && E.bpDockCta.textContent);

// 切到「全部」
tabNamed(E, '全部').onclick();
A.runFrames(1);
const cards = cardsOf(E);
ok(cards.length === DATA.buildings.length,
  `「全部」页共 ${DATA.buildings.length} 张图纸卡片`, cards.length);
ok(onTabs(E)[0].indexOf('全部') >= 0, '切换后「全部」高亮', JSON.stringify(onTabs(E)));

// 按类别筛选：电力类
const powerN = DATA.buildings.filter(b => b.cat === 'power').length;
tabNamed(E, '电力').onclick();
A.runFrames(1);
ok(cardsOf(E).length === powerN, `点「电力」只显示 ${powerN} 张`, cardsOf(E).length);
// strip 标签格式「电力 · 2 张」
const powerLabel = (E.bpStripLabel && E.bpStripLabel.textContent) || '';
ok(powerLabel.indexOf('电力') >= 0 && powerLabel.indexOf(powerN + ' 张') >= 0,
  '类别 strip 标签显示图纸数量', powerLabel);

// 回到推荐页拿首张卡片开始拼 —— 点击缩略图条上第一项让它被选中，
// 然后点底部 CTA 进拼豆台（CTA 会读 BP_SEL）
tabNamed(E, '推荐').onclick();
A.runFrames(1);
cardsOf(E)[0].onclick();   // 选中第一张
A.runFrames(1);
const firstAct = actOf(cardsOf(E)[0]);
firstAct.onclick({ stopPropagation() {} });
A.runFrames(1);
ok(E.bvName.textContent === B('house').name, '进入拼豆台：' + B('house').name, E.bvName.textContent);
const fill = fillBoard(E, B('house'));
ok(fill.placed === fill.total, `填入 ${fill.total} 颗豆`, fill.placed);
ok(E.bvPct.textContent === '100%', '完成度 100%', E.bvPct.textContent);

// ================================================================ B 局
(async () => {
  await sleep(1700);
  A.runFrames(2);
  ok(E.vHappy.textContent === '51', '落成小屋后幸福 = 51（水电未超限）', E.vHappy.textContent);
  ok(E.buildView.classList.contains('show') === false, '拼豆台已关闭');
  ok(/岗位 0/.test(E.citySub.textContent), '副标题显示岗位数', E.citySub.textContent);
  ok(!/人口/.test(E.citySub.textContent) && !/平静|舒心|烦躁/.test(E.citySub.textContent),
    '副标题不再重复 chip 已有的人口 / 幸福（手机上一行放得下）', E.citySub.textContent);

  await advance(A, 4000);   // 让人口按「无岗位也能住 6 人」的规则涨起来
  ok(Number(E.vPop.textContent) > 0, '无岗位时仍有基础人口迁入', E.vPop.textContent);
  ok(E.dR.className.indexOf('neg') >= 0,
    '岗位不足时住宅需求转负（缺就业）', E.dR.className + ' / ' + E.dR.style.width);

  // --------------------------------- B 局：住房住满时的需求方向（回归）
  // 踩过的坑：住房明明住得满满当当，需求条却显示红色「严重过剩」——
  // 玩家读到「过剩」会以为「住宅别建了」，结果被卡在原地涨不动，
  // 而同一时刻诊断栏还在喊「多盖点住宅」，两边自相矛盾。
  // 「过剩」只在真有空房时才成立。这里钉死两条不变量。
  console.log('\n—— B 局：住房住满时的需求方向 ——');
  // 住满（cap 4 = pop 4）+ 岗位富余（工坊 jobs 6 > pop*0.8 = 3.2）
  const Bf = boot({
    coins: 5000, grid: ['house', 'workshop'].concat(new Array(34).fill(null)),
    mastered: { house: true, workshop: true }, pop: 4, backlog: 0,
    last: Date.now(), built: 2
  }, true);
  await advance(Bf, 600);
  const stF = Bf.game.stats(), dF = Bf.game.demands(stF);
  ok(stF.popCap === 4 && stF.pop === 4 && stF.jobs === 6,
    '构造前提：住房住满且岗位富余', `pop ${stF.pop}/cap ${stF.popCap}/jobs ${stF.jobs}`);
  ok(dF.R > 0, '住房住满 + 岗位富余 → 住宅需求为正（不再是「过剩」）', 'R = ' + dF.R);
  ok(dF.R >= 60, '住房是唯一瓶颈时给到「强烈需求」档（≥60）', 'R = ' + dF.R);
  ok(Bf.elements.dR.className.indexOf('pos') >= 0,
    '首页住宅条为绿色（需求）而非红色（过剩）',
    Bf.elements.dR.className + ' / ' + Bf.elements.dR.style.width);
  ok(/多盖点住宅/.test(Bf.game.diagnose(stF, dF).t),
    '诊断与需求条同调：都指向住宅', Bf.game.diagnose(stF, dF).t);

  // 住满 + 岗位也满：人口会回落到 popTarget，这个状态只在过渡期出现，
  // 所以不推进时间，直接查纯函数。瓶颈在岗位，盖住宅是白花钱。
  const grid12 = new Array(36).fill(null);
  for (let i = 0; i < 3; i++) grid12[i] = 'house';   // cap 12 / jobs 0
  const Bs = boot({
    coins: 5000, grid: grid12, mastered: { house: true }, pop: 12, backlog: 0,
    last: Date.now(), built: 3
  }, true);
  Bs.runFrames(2);
  const stS = Bs.game.stats(), dS = Bs.game.demands(stS);
  // 判据与 demands 内部一致（room <= 0.5）：人口是浮点，跑两帧就会回落一点点，
  // 用严格 >= 会自己把自己绊倒，这里要测的是「还处在住满状态」这件事。
  ok(stS.pop >= stS.popCap - 0.5 && stS.pop >= stS.jobs + Bs.game.JOBLESS_ALLOW - 0.5,
    '构造前提：住房住满且人口已顶到岗位上限',
    `pop ${stS.pop.toFixed(2)}/cap ${stS.popCap}/jobs ${stS.jobs}`);
  ok(dS.R >= 0, '住房住满 + 岗位也满 → 住宅需求不为负（没空房就不能说过剩）',
    'R = ' + dS.R);
  ok(/岗位不够/.test(Bs.game.diagnose(stS, dS).t),
    '诊断让位给「岗位不够」（此时盖住宅人口也不会涨）', Bs.game.diagnose(stS, dS).t);

  // ---------------------------------------------------------- B 局：供需
  console.log('\n—— B 局：电力 / 供水 / 垃圾 ——');
  const grid5 = new Array(36).fill(null);
  for (let i = 0; i < 8; i++) grid5[i] = 'house';   // 用电 8 / 用水 8 / 垃圾 8
  const Bx = boot({
    coins: 5000, grid: grid5, mastered: { house: true }, pop: 0, backlog: 0,
    last: Date.now(), built: 8
  });
  const G = Bx.elements;
  Bx.runFrames(3);

  // 基础管线 电6 水6 环卫14，8 栋小屋电水双超、环卫还有余量
  ok(G.vHappy.textContent === '44', '停电 + 缺水的幸福惩罚生效（50+8−7.5−6.25）', G.vHappy.textContent);
  G.btnUtil.onclick();
  const ub = G.utilBody.innerHTML;
  // 数值行格式：「用量 / 供给　缺|余 N 单位」
  ok(/8 \/ 6\s*缺 2 度/.test(ub), '电力行报 8/6 缺 2 度', ub.match(/\d+ \/ \d+[^<]*/));
  ok(/8 \/ 6\s*缺 2 吨/.test(ub), '供水行报 8/6 缺 2 吨', ub.match(/\d+ \/ \d+[^<]*/));
  ok(/8 \/ 14\s*余 6 车/.test(ub), '环卫行报 8/14 余 6 车', ub.match(/\d+ \/ \d+[^<]*/));
  // 余缺直接写进数值行，不再用胶囊徽章 —— 徽章是「仪表盘生成器」的视觉指纹
  ok(all(G.utilBody, 'ures-v').some(p => /余 6 车/.test(p.textContent)),
    '环卫有余量时报「余 N」而不是缺口',
    all(G.utilBody, 'ures-v').map(p => p.textContent).join(' | '));

  const before = G.vHappy.textContent;
  await advance(Bx, 8000);
  ok(G.vPop.textContent === '0', '停水时人口不增长', G.vPop.textContent);

  // 垃圾要 16 栋小屋才会压过基础清运 14
  const grid6 = new Array(36).fill(null);
  for (let i = 0; i < 16; i++) grid6[i] = 'house';
  const Bx2 = boot({
    coins: 5000, grid: grid6, mastered: { house: true }, pop: 0, backlog: 0,
    last: Date.now(), built: 16
  });
  const G2 = Bx2.elements;
  Bx2.runFrames(3);
  G2.btnUtil.onclick();
  const happy0 = G2.vHappy.textContent;
  await advance(Bx2, 8000);
  G2.btnUtil.onclick();
  const backlogTxt = G2.utilBody.innerHTML.match(/(\d+) \/ 200/);
  ok(G2.utilBody.innerHTML.indexOf('垃圾积压') >= 0, '面板持续显示垃圾积压');
  ok(backlogTxt && Number(backlogTxt[1]) > 0, '垃圾随时间积压', backlogTxt && backlogTxt[1]);
  ok(Number(G2.vHappy.textContent) < Number(happy0), '垃圾积压进一步压低幸福',
    happy0 + ' -> ' + G2.vHappy.textContent);

  // ---------------------------------------------------------- C 局
  console.log('\n—— C 局：RCI 需求与人口收敛 ——');
  const grid3 = new Array(36).fill(null);
  grid3[0] = 'house'; grid3[1] = 'house';   // 容量 8
  grid3[2] = 'cafe';                        // 岗位 3，收益 18
  grid3[3] = 'windmill';                    // 发电 8
  grid3[4] = 'watertower';                  // 供水 7
  grid3[5] = 'recycling';                   // 清运 14
  const C = boot({
    coins: 3000, grid: grid3,
    mastered: { house: true, cafe: true, windmill: true, watertower: true, recycling: true },
    pop: 0, backlog: 0, last: Date.now(), built: 6
  });
  const F = C.elements;
  C.runFrames(3);

  ok(F.vHappy.textContent === '56', '供给充足时幸福 = 50+各项修正 = 56', F.vHappy.textContent);
  // 人口向 min(容量 8, 岗位 5+6) = 8 收敛
  await advance(C, 9000);
  const popNow = Number(F.vPop.textContent);
  ok(popNow >= 7, `人口收敛到住房容量 8（当前 ${popNow}）`, popNow);
  ok(F.dC.className.indexOf('pos') >= 0, `人口 ${popNow} 时商业需求为正`, F.dC.style.width);

  F.btnUtil.onclick();
  ok(/现有人口/.test(F.utilBody.innerHTML), '市政面板 KPI 区块正常');
  ok(/电力/.test(F.utilBody.innerHTML) && /供水/.test(F.utilBody.innerHTML), '市政面板含三类供需');

  F.btnData.onclick();
  ok(F.dataView.classList.contains('show'), '数据浮层已展开');
  // 收入堆叠条 + 资源行 + 类别构成 都在
  ok(F.dpIncStack.children.length === 3, '数据页收入三分（保底/税/产业）', F.dpIncStack.children.length);
  ok(F.dpUtils.children.length === 4, '数据页市政负荷 4 行（电/水/环卫/积压）', F.dpUtils.children.length);
  // 顶栏 HUD 的 R/C/I 需求条就是数据页里要找的「需求压力」指针
  ok(F.dR && F.dC && F.dI, 'R/C/I 需求条持续在 HUD 顶部可见');
  F.dataClose.onclick();
  ok(!F.dataView.classList.contains('show'), '数据浮层可关闭');

  F.btnHelp.onclick();
  ok(F.helpView.classList.contains('show'), '玩法浮层已展开');
  ok(F.helpBody.children.length >= 6, '玩法页含 6 大段', F.helpBody.children.length);
  F.helpClose.onclick();
  ok(!F.helpView.classList.contains('show'), '玩法浮层可关闭');

  // ---------------------------------------------------------- D 局
  console.log('\n—— D 局：市政面板结构与诊断 ——');
  function all(node, cls, out) {
    out = out || [];
    if (!node) return out;
    if (String(node.className || '').split(/\s+/).indexOf(cls) >= 0) out.push(node);
    (node.children || []).forEach(c => all(c, cls, out));
    return out;
  }
  const txt = arr => arr.map(n => n.textContent).join(' | ');

  // 市政四行：行式排版，不是卡片复制 —— 此处同时钉住「无徽章、无网格」
  const uRows = all(G.utilBody, 'ures');
  ok(uRows.length === 4, '市政供需共 4 行（电/水/环卫/积压）', uRows.length);
  ok(all(G.utilBody, 'ures-v').some(p => /缺 \d+ 度/.test(p.textContent)),
    '缺电时数值行直接报「缺 N 度」', txt(all(G.utilBody, 'ures-v')));
  ok(all(G.utilBody, 'pin').length === 0, '面板不再使用胶囊徽章 pin');

  // 数据四行：键值行列表，不是 2×2 卡片网格
  const uStats = all(F.utilBody, 'ustats')[0];
  ok(uStats && uStats.children.length === 4, '数据区为 4 行键值',
    uStats && uStats.children.length);
  ok(all(F.utilBody, 'ukpis').length === 0, '面板不再使用 2×2 卡片网格 ukpis');
  ok(all(F.utilBody, 'ures-v').some(p => /余 \d+/.test(p.textContent)),
    '供给充足时数值行直接报「余 N」', txt(all(F.utilBody, 'ures-v')));

  const diagB = all(G.utilBody, 'udiag')[0];
  const diagC = all(F.utilBody, 'udiag')[0];
  ok(diagB && /电力缺口/.test(diagB.textContent), '缺电时诊断指向电力', diagB && diagB.textContent);
  ok(diagB && diagB.className.indexOf('bad') >= 0, '缺电诊断走告警色', diagB && diagB.className);
  ok(diagC && !/缺口/.test(diagC.textContent), '供给充足时诊断不含缺口告警',
    diagC && diagC.textContent);

  ok(all(F.utilBody, 'udm').length === 3, '发展需求三条（住宅/商业/工业）',
    all(F.utilBody, 'udm').length);
  ok(all(F.utilBody, 'tagt').length === 3 && all(F.utilBody, 'tagc').length === 0,
    '需求用类别色文字而非色块徽章', all(F.utilBody, 'tagt').length);

  // 结构只建一次：再开一次不应重建 DOM，否则 CSS 过渡每帧被重置
  const headRef = F.utilBody.children[0];
  F.btnUtil.onclick();
  ok(F.utilBody.children[0] === headRef, '再次打开面板不重建 DOM（结构缓存生效）');

  // ---------------------------------------------------------- E 局：反死锁不变量
  // 这一组断言把「长时间推演挖出来的五个死锁」钉死。任何一个被改回去都会红：
  //   1. 住宅不产钱 → 建完第一栋就再也攒不出第二栋
  //   2. 解锁看当前人口 → 缺水掉人口 → 水塔解锁不了 → 永远缺水
  //   3. 缺电冻结人口 → 电厂解锁不了 → 永远缺电
  //   4. 垃圾清运解锁太晚 → 积压无解
  //   5. 推荐算法让 RCI 压过供需缺口 → 玩家被牵着一直盖房直到爆管
  console.log('\n—— E 局：反死锁不变量 ——');
  const Gx = boot({
    coins: 240, grid: new Array(36).fill(null), mastered: {}, pop: 0, backlog: 0,
    last: Date.now(), built: 0
  }, true);
  const GAME = Gx.game;
  ok(!!GAME, '内部状态已暴露');

  // (1) 空城也要有进账，一栋楼也要有进账 —— 否则「攒钱」这条路根本不存在
  ok(GAME.stats().rate > 0, '空城也有保底进账（不会 0 收入死锁）', GAME.stats().rate.toFixed(2));
  GAME.S.grid[0] = 'house';
  GAME.S.pop = 4;
  const st1 = GAME.stats();
  ok(st1.rate > GAME.BASE_INCOME, '住宅带来人口税，第一栋就能自我造血',
    st1.rate.toFixed(2) + ' > ' + GAME.BASE_INCOME);
  ok(Math.abs(st1.taxIncome - 4 * GAME.TAX_PER_HEAD) < 0.01,
    '人口税 = 实际人口 × 单价', st1.taxIncome);

  // (2) 解锁看历史峰值：人口掉回去，已解锁的图纸不能重新上锁
  const tower = GAME.DATA.buildings.find(b => b.id === 'tower');
  GAME.S.pop = tower.unlockPop;
  GAME.peakPop();
  const peak = GAME.S.popPeak;
  GAME.S.pop = 1;
  ok(GAME.peakPop() === peak, '人口回落后峰值仍保留', GAME.peakPop() + ' vs ' + peak);
  ok(GAME.peakPop() >= tower.unlockPop, '峰值达标后云端大厦保持解锁');

  // (3) 缺电不能冻结人口，否则「缺电 → 人口停滞 → 电厂解锁不了 → 永远缺电」
  for (let i = 0; i < 12; i++) GAME.S.grid[i] = 'house';       // 用电 12 > 基础 6
  GAME.S.grid[12] = 'watertower'; GAME.S.grid[13] = 'waterworks';  // 水补齐
  GAME.S.grid[14] = 'recycling';                                   // 清运补齐
  GAME.S.pop = 2; GAME.S.backlog = 0;
  const stP = GAME.stats();
  ok(stP.useP > stP.supP, '场景确实缺电', stP.useP + '/' + stP.supP);
  ok(stP.watRatio >= 1 && stP.useT <= stP.supT, '但不缺水、不缺清运',
    '水 ' + stP.useW + '/' + stP.supW + ' 垃圾 ' + stP.useT + '/' + stP.supT);
  await advance(Gx, 4000);
  ok(GAME.S.pop > 2.5, '缺电时人口仍能增长（不会被冻住）', GAME.S.pop.toFixed(2));

  // (4) 供水/清运的解锁门槛必须落在人口曲线的可达区间内
  const waterGate = GAME.DATA.buildings.filter(b => b.cat === 'water')
    .map(b => b.unlockPop).sort((a, b) => a - b)[0];
  const trashGate = GAME.DATA.buildings.filter(b => b.cat === 'trash')
    .map(b => b.unlockPop).sort((a, b) => a - b)[0];
  ok(waterGate <= GAME.JOBLESS_ALLOW, '首个供水设施在无岗位时就能解锁',
    '水塔 pop ' + waterGate + ' ≤ 无岗位人口上限 ' + GAME.JOBLESS_ALLOW);
  ok(trashGate <= 12 + GAME.JOBLESS_ALLOW, '清运设施在人口 20 前解锁（积压可解）',
    '回收站 pop ' + trashGate);

  // (5) 供需缺口必须压过 RCI：住宅/工业需求都为正时，只要缺水就该推荐水。
  //     场景：8 小屋 + 3 咖啡 + 1 风车 → 电和清运刚好够，水差 5
  for (let i = 0; i < 36; i++) GAME.S.grid[i] = null;
  for (let i = 0; i < 8; i++) GAME.S.grid[i] = 'house';
  for (let i = 8; i < 11; i++) GAME.S.grid[i] = 'cafe';
  GAME.S.grid[11] = 'windmill';
  GAME.S.pop = 10; GAME.S.backlog = 0;
  const stW = GAME.stats();
  ok(stW.useW > stW.supW, '场景确实缺水', stW.useW + '/' + stW.supW);
  ok(stW.powRatio >= 1 && stW.useT <= stW.supT, '但电和清运都够',
    '电 ' + stW.useP + '/' + stW.supP + ' 垃圾 ' + stW.useT + '/' + stW.supT);
  const dW = GAME.demands(stW);
  ok(dW.R > 0 && dW.I > 0, '同时住宅、工业需求都为正（权重本会压过缺口）',
    'R ' + dW.R + ' / I ' + dW.I);
  ok(GAME.recommendCat(stW, dW) === 'water',
    '缺水时推荐供水而不是住宅/工业', GAME.recommendCat(stW, dW));

  // ---------------------------------------------------------- F 局：重置城市
  // 存档是强制的、单槽的，如果没有重开入口，玩家一进死局就只能手动清浏览器数据。
  // 这一组把「重置」钉死：状态要清干净，且清档后不能又被旧档写回来。
  console.log('\n—— F 局：重置城市 ——');
  const Rx = boot({
    coins: 9999,
    grid: (() => { const g = new Array(36).fill(null);
      for (let i = 0; i < 8; i++) g[i] = 'house';
      g[8] = 'cafe'; g[9] = 'windmill'; return g; })(),
    mastered: { house: true, cafe: true }, pop: 30, popPeak: 30,
    backlog: 120, last: Date.now(), built: 10
  }, true);
  const R = Rx.game;
  ok(!!R, '内部状态已暴露');
  ok(R.S.coins === 9999 && R.S.pop === 30 && R.S.backlog === 120,
    '重置前确实是一局有进度的存档');
  ok(Object.keys(R.S.mastered).length === 2, '重置前已有 2 张图纸免拼');

  // 走真实入口：点数据页的「重置城市」→ 弹确认框 → 点「确认重置」
  Rx.elements.btnReset.onclick();
  ok(Rx.elements.modal.classList.contains('show'), '点重置先弹确认框（不会误触）');
  ok(Rx.elements.mdBtns.children.length === 2, '确认框两个按钮',
    Rx.elements.mdBtns.children.length + ' 个');
  ok(Rx.elements.mdBtns.children[1].textContent === '取消',
    '右侧最后一个是「取消」，与「拆除 / 关闭」的既有约定一致',
    Rx.elements.mdBtns.children[1].textContent);

  Rx.elements.mdBtns.children[0].onclick();

  ok(R.S.coins === R.START_COINS, '金币回到开局值', R.S.coins + ' → ' + R.START_COINS);
  ok(R.S.grid.every(c => c === null), '地块全部清空',
    R.S.grid.filter(Boolean).length + ' 栋残留');
  ok(Object.keys(R.S.mastered).length === 0, '已掌握图纸清空（重开要重新拼）');
  ok(R.S.pop === 0 && R.S.popPeak === 0, '人口与历史峰值归零',
    'pop ' + R.S.pop + ' / peak ' + R.S.popPeak);
  ok(R.S.backlog === 0 && R.S.built === 0, '垃圾积压与已建计数归零');

  // 关键回归点：removeItem 之后若被挂起的防抖 save 覆盖，这里会读到旧档
  const saved = JSON.parse(Rx.store[R.SAVE_KEY] || 'null');
  ok(!!saved, '重置后立刻落了一份新档（localStorage 不是空的）');
  ok(saved && saved.coins === R.START_COINS, '落盘的是初始档而不是旧档',
    saved ? 'coins ' + saved.coins : 'null');
  ok(saved && saved.grid.every(c => c === null), '落盘的存档地块为空',
    saved ? saved.grid.filter(Boolean).length + ' 栋' : 'null');

  // 重开后不能躺在新手引导的对面：空城也必须有进账
  ok(R.stats().rate > 0, '重置后仍有保底进账（不会开局即死锁）',
    R.stats().rate.toFixed(2));

  // ---------------------------------------------------------- G 局：音效与 BGM
  // 音频是 Web Audio 实时合成的，没有文件可比对，所以这一局断言的是「不会炸」：
  // 包络端点合法、调度不失控、静音后真的停止建节点、偏好不被重置连带清掉。
  console.log('\n—— G 局：音效与 BGM ——');
  const audioEnv = boot({
    coins: 240, grid: new Array(36).fill(null), mastered: {}, pop: 0, backlog: 0,
    last: Date.now(), built: 0
  }, true, true);
  const audioGame = audioEnv.game;
  ok(!!audioGame, '内部状态已暴露（含音频）');
  ok(audioGame.soundOn === true, '默认开启声音', audioGame.soundOn);

  // 浏览器要求音频必须由用户手势启动 —— 手势之前连 AudioContext 都不该建
  audioGame.sfx('build'); audioGame.sfx('bead', 30); audioGame.sfx('iron');
  ok(!FakeCtx.last, '未解锁前不创建 AudioContext（否则真机会被浏览器拦下并告警）');

  audioGame.audUnlock();
  const audioCtx = FakeCtx.last;
  ok(!!audioCtx, '首次手势后创建 AudioContext');
  ok(audioGame.bgmOn === true, '解锁即起 BGM');
  ok(audioCtx.n.gain >= 3, '音频图已建（master / sfx / bgm 三条支路）', audioCtx.n.gain + ' 个增益');

  const o0 = audioCtx.n.osc;
  audioGame.sfx('build');
  ok(audioCtx.n.osc > o0, '落成音效产生振荡器', o0 + ' → ' + audioCtx.n.osc);

  // BGM 调度：推进 4 秒应排出一小节多的音符
  const s0 = audioCtx.started.length;
  audioCtx.now = 4;
  audioEnv.pumpTimers();
  ok(audioCtx.started.length > s0, 'BGM 调度器排出音符', audioCtx.started.length - s0 + ' 个');

  // 关键回归点：切后台 5 分钟再回来，不能把积压的几百个音符一次性排进去
  const s1 = audioCtx.started.length;
  audioCtx.now = 304;
  audioEnv.pumpTimers();
  const burst = audioCtx.started.length - s1;
  ok(burst < 12, '切后台 5 分钟后不补播积压音符（否则是一声巨响）', burst + ' 个');

  // 拖动连点限流：一次拖动里连发 20 次放豆，不该响 20 声
  const o1 = audioCtx.n.osc;
  for (let i = 0; i < 20; i++) audioGame.sfx('bead', 10);
  const fired = audioCtx.n.osc - o1;
  ok(fired <= 2, '拖动连点时放豆音被限流（不会糊成噪音）', fired + ' / 20');

  // 静音
  audioGame.setSound(false);
  ok(audioGame.soundOn === false, 'setSound(false) 关闭声音');
  ok(audioEnv.store[audioGame.SND_KEY] === '0', '静音偏好写入独立存档键', audioEnv.store[audioGame.SND_KEY]);
  ok(audioEnv.elements.btnSound.classList.contains('muted'), 'HUD 按钮切到静音态');
  ok(audioGame.bgmOn === false, '静音同时停掉 BGM');
  const o2 = audioCtx.n.osc;
  audioGame.sfx('build'); audioGame.sfx('coin'); audioGame.sfx('done');
  ok(audioCtx.n.osc === o2, '静音后不再建任何振荡器（不白烧 CPU）', audioCtx.n.osc - o2);

  audioGame.setSound(true);
  ok(audioGame.bgmOn === true, '取消静音后 BGM 重新起');
  ok(audioCtx.n.osc > o2, '取消静音后音效恢复');
  ok(!audioEnv.elements.btnSound.classList.contains('muted'), 'HUD 按钮回到有声态');

  // 偏好持久化：带上次的 '0' 重开，应继续保持静音
  const Px = boot(null, true, false, { pcity_snd: '0' });
  ok(Px.game.soundOn === false, '静音偏好跨会话保留', Px.game.soundOn);

  // 宿主不支持音频时整条链路静默降级，不该抛异常
  try {
    Px.game.sfx('build'); Px.game.sfx('iron'); Px.game.sfx('demolish');
    ok(true, '宿主不支持音频时音效静默降级，不报错');
  } catch (e) {
    ok(false, '宿主不支持音频时音效静默降级，不报错', e.message);
  }

  // 重置城市不该连声音偏好一起清掉 —— 独立存档键的意义就在这里
  const Zx = boot({
    coins: 500, grid: new Array(36).fill(null), mastered: {}, pop: 0, backlog: 0,
    last: Date.now(), built: 0
  }, true, false);
  Zx.game.setSound(false);
  ok(Zx.store['pcity_snd'] === '0', '静音已写入独立键', Zx.store['pcity_snd']);
  Zx.game.resetGame();
  ok(Zx.store['pcity_snd'] === '0', '重置城市后声音偏好仍在（不被连带清掉）',
    Zx.store['pcity_snd']);
  ok(Zx.store['pcity_v2'] !== undefined, '重置后城市存档照常重写');

  console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项未通过 ❌`);
  process.exit(failed === 0 ? 0 : 1);
})();
