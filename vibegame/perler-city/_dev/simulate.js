/**
 * 长时间游玩推演：用零依赖的 DOM stub 真实执行 main.js，驱动一个「自动玩家」
 * 跑满 60 分钟游戏时间，回答几个产品问题：
 *   1. 36 格多久填满？中途会不会卡死（干等）？
 *   2. 开局前 5 分钟节奏如何（小红书小工具的留存窗口就在这）？
 *   3. 终局收入/人口/幸福停在什么水平，金币会不会溢出？
 *
 * 三组玩家画像：
 *   A 「拼豆大师」：所有图纸已掌握，纯经营决策
 *   B 「首次拼豆」：每张图纸要先拼一遍才解锁（按 45 秒/张折算成等待帧）
 *   C 「佛系挂机」：只按市政面板的推荐位补建筑，不主动铺满
 *
 * 用法：node _dev/simulate.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, '_dev/data/buildings.json'), 'utf8'));

// ---------------- DOM stub（与 smoke_test 同步：setProperty / lastChild / 反映 DOM 树的 innerHTML）
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
  } catch (e) {}
  const inner = (n.children && n.children.length) ? serializeTree(n) : (n._html || n._text || '');
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
    addEventListener() {}, removeEventListener() {}, getBoundingClientRect() {
      return { left: 0, top: 0, width: this.clientWidth || 300, height: this.clientHeight || 300 };
    },
    getContext: () => new Proxy({}, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'canvas') return { width: 300, height: 300 };
        if (p === 'measureText') return () => ({ width: 12 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient')
          return () => ({ addColorStop() {} });
        return () => {};
      },
      set(t, p, v) { t[p] = v; return true; }
    }),
    setAttribute() {}, getAttribute() { return null; }, focus() {}, blur() {},
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return (el.children && el.children.length) ? serializeTree(el) : el._html; },
    set(v) { this._html = v; if (v === '') { this.children = []; this.firstChild = null; this.lastChild = null; } }
  });
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; }, set(v) { this._text = String(v); }
  });
  if (tag === 'canvas') {
    el.width = 0; el.height = 0;
    el.clientWidth = 300; el.clientHeight = 300;
  }
  return el;
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const elements = {};
[...html.matchAll(/id="([^"]+)"/g)].forEach(m => {
  elements[m[1]] = makeEl(/^canvas/.test(m[1]) ? 'canvas' : 'div', m[1]);
});
elements.canvas = elements.cityCanvas;
elements.cityCanvas.parentNode = { clientWidth: 360, clientHeight: 360 };
elements.boardCanvas.parentNode = { clientWidth: 320, clientHeight: 320 };

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const rafQ = [];
// 劫持 Date.now()：node 同步跑 3.6 万帧时真实时间几乎不动，而 loop() 靠 Date.now()
// 算 dt。注入虚拟时间，每帧前进 100ms（10 帧 = 1 游戏秒）。
let virtualTime = Date.now();
Date.now = () => virtualTime;
const requestAnimationFrame = fn => { rafQ.push(fn); return rafQ.length; };
const runFrames = (n) => {
  for (let i = 0; i < n; i++) {
    virtualTime += 100;
    rafQ.splice(0).forEach(f => f(virtualTime));
  }
};

const document = {
  documentElement: {}, body: {},
  addEventListener() {}, removeEventListener() {},
  getElementById: id => elements[id] || null,
  createElement: tag => makeEl(tag, '')
};
const window = { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} };

// main.js 是 IIFE，内部变量外面拿不到。在 IIFE 关闭前插一句赋值，把需要的
// 内部状态挂到 window 上（此时局部变量还活着）。
const expose = `
;window.__GAME = {
  DATA: DATA, LIST: LIST, BY_ID: BY_ID, CATS: CATS,
  get S(){ return S; },
  GRID_N: GRID_N, START_COINS: START_COINS, BASE_SUPPLY: BASE_SUPPLY,
  BASE_INCOME: BASE_INCOME, TAX_PER_HEAD: TAX_PER_HEAD,
  COM_SUPPORT_HEAD: COM_SUPPORT_HEAD, JOBLESS_ALLOW: JOBLESS_ALLOW,
  TRASH_CAP: TRASH_CAP, OFFLINE_CAP: OFFLINE_CAP, SAVE_KEY: SAVE_KEY,
  stats: stats, demands: demands, recommendCat: recommendCat,
  placeBuilding: placeBuilding, popTarget: popTarget, peakPop: peakPop,
  titleOf: titleOf, moodOf: moodOf, fmt: fmt
};
`;
// 文件以 CRLF 结尾，正则 $ 默认不匹配 \r\n，改用 lastIndexOf 定位
const idx = js.lastIndexOf('})();');
const wrapped = js.slice(0, idx) + expose + js.slice(idx);
new Function('window', 'document', 'localStorage', 'requestAnimationFrame',
  'setTimeout', 'clearTimeout', 'navigator', wrapped)(
  window, document, localStorage, requestAnimationFrame,
  fn => { fn(); return 0; }, () => {}, { userAgent: 'node' });

const EX = window.__GAME;
const CELLS = EX.GRID_N * EX.GRID_N;

// ---------------- 工具
const gen = (b, k) => (b.gen && b.gen[k]) || 0;
const use = (b, k) => (b.use && b.use[k]) || 0;
const sec = f => Math.round(f / 10);      // 10 帧 = 1 秒
const mmss = f => {
  const s = Math.round(f / 10);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

// ---------------- 玩家策略
// 优先级：补缺口（电/水/垃圾）→ 跟 RCI 推荐 → 补住宅拉人口。
// 买不起就存钱等，不降级买便宜货 —— 这样测出来的等待时间才是真实体感。
function makeStrategy(profile) {
  const state = { learned: 0, beadId: null, beadStart: 0 };
  const BEAD_FRAMES = profile === 'A' ? 0 : 900;   // 新手拼一张 11×11 约 90 秒
  return {
    state,
    act(frame) {
      const st = EX.stats();
      const d = EX.demands(st);
      if (st.count >= CELLS) return 'full';

      // 解锁看历史峰值人口（与游戏内 UI 口径一致）
      const unlocked = () => EX.DATA.buildings.filter(b => EX.peakPop() >= b.unlockPop);
      const priciest = (a, b) => b.cost - a.cost;   // 买得起的最好的
      const cheapest = (a, b) => a.cost - b.cost;

      // 三段式决策，模拟真人的关键习惯：认准了要建什么就攒钱，不因为手痒
      // 顺手盖一栋便宜的 —— 「降级消费」正是把城市拖进债务螺旋的原因。
      //   ok     → 买得起，就建
      //   saving → 解锁了但买不起，攒钱等，这一轮不建别的
      //   locked → 还没解锁，放弃这条路，换下一个目标
      const want = (pred) => {
        const un = unlocked().filter(pred);
        if (!un.length) return { kind: 'locked' };
        un.sort(cheapest);
        if (un[0].cost > EX.S.coins) return { kind: 'saving', b: un[0] };
        un.sort(priciest);
        return { kind: 'ok', b: un[0] };
      };

      // 逐个尝试而不是 else-if：缺电的电厂还没解锁时，仍然要去看缺不缺水。
      // 用 else-if 会在这里把缺水一路漏掉，城市就在不知不觉中渴死了。
      const plans = [
        () => st.useP > st.supP ? want(b => gen(b, 'power') > 0) : null,
        () => st.useW > st.supW ? want(b => gen(b, 'water') > 0) : null,
        () => (st.useT > st.supT || EX.S.backlog > 30) ? want(b => gen(b, 'trash') > 0) : null,
        () => { const c = EX.recommendCat(st, d); return c ? want(b => b.cat === c) : null; },
        () => want(b => (st.popCap > st.jobs + EX.JOBLESS_ALLOW) ? b.jobs > 0 : b.popCap > 0)
      ];
      let r = null;
      for (const p of plans) {
        const t = p();
        if (t) { r = t; if (r.kind !== 'locked') break; }
      }
      if (!r) r = { kind: 'locked' };

      if (r.kind === 'saving') return 'saving:' + r.b.id + '(' + r.b.cost + ')';
      if (r.kind === 'locked') return 'locked@pop' + EX.peakPop().toFixed(0);
      const target = r.b;

      // 没掌握的图纸要先拼一遍。拼豆是真实的时间成本（11×11 的图约 90 秒），
      // 这段时间内城市照常运转，但玩家干不了别的。
      if (!EX.S.mastered[target.id]) {
        if (state.beadId !== target.id) {
          state.beadId = target.id; state.beadStart = frame;
          return 'beading:' + target.id;
        }
        if (frame - state.beadStart < BEAD_FRAMES) return 'beading:' + target.id;
        EX.S.mastered[target.id] = true;
        state.learned++;
        state.beadId = null;
      }
      EX.placeBuilding(target, true);
      return 'built:' + target.id;
    }
  };
}

// ---------------- 推演
function simulate({ label, profile, frames }) {
  EX.S.grid = new Array(CELLS).fill(null);
  EX.S.coins = EX.START_COINS;
  EX.S.mastered = profile === 'A'
    ? Object.fromEntries(EX.DATA.buildings.map(b => [b.id, true])) : {};
  EX.S.pop = 0; EX.S.popPeak = 0; EX.S.backlog = 0; EX.S.built = 0; EX.S.last = Date.now();

  const s = makeStrategy(profile);
  const marks = {};              // 建第 N 栋的时刻
  const log = [];
  const snaps = [];
  let dryRun = 0, maxDry = 0, lastAct = -1;
  let fullSnap = null;   // 填满那一刻的快照：用来量「填满之后还剩多少游戏」

  for (let i = 0; i <= frames; i++) {
    runFrames(1);
    if (i - lastAct < 5) continue;   // 每 0.5 秒决策一次
    lastAct = i;
    const r = s.act(i);
    if (log.length === 0 || log[log.length - 1].r !== r) log.push({ f: i, r });
    if (r.startsWith('built:')) {
      const n = EX.stats().count;
      if (!marks[n]) marks[n] = i;
      dryRun = 0;
      // 填满之后金币没了出口，这段时间的结余就是「纯溢出」——数值越大
      // 说明终局越缺一个金币消耗口（升级 / 重拼 / 装饰）。
      if (n >= CELLS && !fullSnap) fullSnap = snap(i, 'full');
    } else if (r !== 'full' && !r.startsWith('beading:') && !r.startsWith('learned:')) {
      dryRun += 5;
      maxDry = Math.max(maxDry, dryRun);
    }
    if (i % 3000 === 0) snaps.push(snap(i));   // 每 5 分钟一张快照
  }
  snaps.push(snap(frames, 'end'));
  return { label, profile, marks, log, snaps, learned: s.state.learned, maxDry,
    peak: EX.peakPop(), fullSnap: fullSnap };
}

function snap(frame, tag) {
  const st = EX.stats();
  const d = EX.demands(st);
  return {
    frame, tag: tag || mmss(frame),
    pop: Math.floor(st.pop), cap: st.popCap, jobs: st.jobs,
    coins: Math.round(EX.S.coins), n: st.count, happy: st.happy,
    rate: +st.rate.toFixed(1),
    tax: +st.taxIncome.toFixed(1), biz: +(st.bizIncome + st.comIncome).toFixed(1),
    pw: st.useP + '/' + st.supP, wt: st.useW + '/' + st.supW,
    tr: st.useT + '/' + st.supT, backlog: +EX.S.backlog.toFixed(0),
    R: d.R, C: d.C, I: d.I
  };
}

// ---------------- 报告
function table(rows, head) {
  const cols = head.map(h => h[0]);
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
  const line = (a) => a.map((v, i) => String(v).padEnd(w[i])).join('  ');
  return [line(cols), w.map(x => '-'.repeat(x)).join('  '), ...rows.map(line)].join('\n');
}

console.log('=== 拼豆城市 · 长时间游玩推演 ===');
console.log('网格 ' + EX.GRID_N + '×' + EX.GRID_N + ' = ' + CELLS + ' 格，开局 ' + EX.START_COINS +
  ' 金币，每帧 100ms，跑满 60 分钟游戏时间');
console.log('收入模型：市政保底 ' + EX.BASE_INCOME + ' + 人口税 ' + EX.TAX_PER_HEAD +
  ' /人 + 产业收益（商业再 ×人气，' + EX.COM_SUPPORT_HEAD + ' 人/铺满收益）\n');

const FRAMES = 36000;
const runs = [
  simulate({ label: 'A 拼豆大师', profile: 'A', frames: FRAMES }),
  simulate({ label: 'B 首次拼豆', profile: 'B', frames: FRAMES })
];

for (const r of runs) {
  console.log('--- ' + r.label + ' ---');
  console.log(table(r.snaps.map(s => [
    s.tag, s.pop + '/' + s.cap, s.jobs, s.coins, s.n, s.happy,
    s.rate, s.tax, s.biz, s.pw, s.wt, s.tr, s.backlog, s.R + '/' + s.C + '/' + s.I
  ]), [
    ['时间', '人口/容量', '岗位', '金币', '栋数', '幸福', '进账/分', '人口税', '产业',
     '电', '水', '环卫', '积压', 'R/C/I']
  ]));
  const m = r.marks;
  const pace = [1, 2, 3, 5, 8, 12, 18, 24, 30, 36]
    .filter(n => m[n] !== undefined)
    .map(n => n + '栋@' + mmss(m[n]));
  console.log('  建城节奏：' + (pace.length ? pace.join('  ') : '一栋都没建成'));
  console.log('  最长干等：' + sec(r.maxDry) + ' 秒' +
    (r.profile === 'B' ? '　新拼图纸：' + r.learned + ' 张' : '') +
    '　历史峰值人口：' + r.peak.toFixed(1));
  console.log('  全程动作：' + r.log.map(x => mmss(x.f) + ' ' + x.r).join(' → '));
  console.log('');
}

// ---------------- 关键结论
console.log('=== 关键结论 ===');
for (const r of runs) {
  const m = r.marks;
  const last = r.snaps[r.snaps.length - 1];
  const t = n => m[n] !== undefined ? mmss(m[n]) : '未完成';
  console.log(r.label + '：');
  console.log('  · 第 1 栋 ' + t(1) + '　第 5 栋 ' + t(5) + '　第 12 栋 ' + t(12) + '　填满 ' + t(CELLS));
  console.log('  · 60 分钟终局：' + last.n + ' 栋 / 人口 ' + last.pop + '/' + last.cap +
    ' / 进账 ' + last.rate + ' 每分 / 幸福 ' + last.happy + ' / 结余 ' + last.coins + ' 金币');
  if (r.fullSnap) {
    const f = r.fullSnap;
    const idleMin = ((last.frame - f.frame) / 600).toFixed(1);
    const overflow = last.coins - f.coins;
    console.log('  · 填满时刻 ' + mmss(f.frame) + '：结余 ' + f.coins + ' 金币 / 进账 ' +
      f.rate + ' 每分 —— 此后 ' + idleMin + ' 分钟无事可做，白攒 ' + overflow +
      ' 金币（≈' + Math.round(overflow / 600) + ' 栋云端大厦，最贵的图纸才 600）');
  } else {
    console.log('  · 60 分钟内未填满');
  }
}

// 反死锁检查：任何时刻收入都必须 > 0，否则会退化成「永远攒不到钱」
console.log('\n=== 反死锁自检 ===');
let worst = Infinity, worstAt = '';
for (const r of runs) {
  for (const s of r.snaps) {
    if (s.rate < worst) { worst = s.rate; worstAt = r.label + ' @' + s.tag; }
  }
}
console.log('  全程最低进账：' + worst + ' /分（' + worstAt + '）—— 必须 > 0，否则存在死局');
console.log('  开局第一栋单独存在时的进账：', (() => {
  EX.S.grid = new Array(CELLS).fill(null);
  EX.S.mastered = { house: true };
  EX.S.grid[0] = 'house';
  EX.S.coins = EX.START_COINS - 60;
  EX.S.pop = 4; EX.S.backlog = 0;
  const st = EX.stats();
  return st.rate.toFixed(1) + ' /分（保底 ' + st.baseIncome + ' + 人口税 ' +
    st.taxIncome.toFixed(1) + ' + 产业 ' + (st.bizIncome + st.comIncome).toFixed(1) + '）';
})());
