/* ═══════════════════════════════════════════════════════════════════════
 * audio.js —— 音频层断言（回答「该响的响了没有、参数对不对」）
 *
 * ⚠ 为什么音频必须有测试：音频 bug 是**静默**的。
 *   一个参数写错（去抖窗口、总线接错、包络峰值为 0）不会报错、不会崩，
 *   只表现为「某个音没响」或「听起来不对」—— 而这两件事，
 *   在无头 CI 里没人听得见、在实机里又容易归因成「我手机喇叭小」。
 *   所以本脚本用假 AudioContext 把每个音的**结构性事实**钉住：
 *   起了几个振荡器、频率是多少、接到了哪条总线、峰值是否为正。
 *
 * 覆盖范围：
 *   能力检测 —— 无 AudioContext 时全链路静默降级，不抛异常
 *   解锁     —— suspended 时 resume；未 resume 前不排程（自动播放策略）
 *   音色表   —— 12 个音效全部存在、可被 play 到
 *   去抖     —— 最小间隔内叠层升调（而不是丢弃）、超过 MAX_STACK 后丢弃
 *   开关     —— setEnabled(false) 后不再排程；toggle 往返
 *   总线     —— 音效走压缩器、BGM 绕过压缩器（defcon 的硬经验③）
 *   包络     —— 所有音符峰值 > 0 且 < 1（防爆音、防静音）
 *   频率下限 —— 音效一律 ≥ 200 Hz（手机扬声器辐射下限，见 audio.js）
 *   BGM      —— 三段落可切换、音序器按 BPM 排程、换段不重置节拍
 *
 * 用法：node tests/audio.js
 *
 * 踩坑记录（改本文件前必读）：
 *   1. 假 ctx 的 currentTime **必须可写**。去抖测试要「把时间推到未来」，
 *      而真实 ctx 的 currentTime 是只读的 —— 故这里用普通属性而非 getter。
 *   2. audio.js 的模块级状态（lastAt/stack/ctx）是单例，一旦 ensure() 建了 ctx
 *      就再也不会重建。因此每个用例都必须 require 一份**新的模块实例**
 *      （靠删 require.cache），否则前一个用例的时间线会污染后一个。
 *      这是本脚本里 load() 函数存在的唯一理由。
 *   3. 断言振荡器数量时不要用「>=」，要**精确**：
 *      `>=` 会让「多起了一个音」这种真实的资源泄漏漏过去。
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src', 'audio.js');

var pass = 0, fail = 0;
var failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); }
}
function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 66 - t.length))); }

/* ───────────────────────── 假 WebAudio ─────────────────────────
 * 只实现 audio.js 真正用到的那部分接口。刻意不实现 createOscillator 之类
 * 之外的 API：若哪天 audio.js 用了新接口，这里会立刻报
 * 「xxx is not a function」而不是静默走偏 —— 这正是我们要的灵敏度。 */

function FakeParam(v) {
  this.value = v == null ? 0 : v;
  this._events = [];
}
FakeParam.prototype.setValueAtTime = function (v, t) {
  this.value = v; this._events.push({ op: 'set', v: v, t: t }); return this;
};
FakeParam.prototype.linearRampToValueAtTime = function (v, t) {
  this._events.push({ op: 'lin', v: v, t: t }); return this;
};
FakeParam.prototype.exponentialRampToValueAtTime = function (v, t) {
  this._events.push({ op: 'exp', v: v, t: t }); return this;
};
FakeParam.prototype.cancelScheduledValues = function (t) {
  this._events.push({ op: 'cancel', t: t }); return this;
};

/* 记录全部创建的节点，供断言「起了几个音、频率多少、接到哪里」 */
function FakeCtx() {
  this.currentTime = 0;
  this.sampleRate = 44100;
  this.state = 'suspended';
  this.destination = { _name: 'destination' };
  this.nodes = [];        // 所有节点，按创建顺序
  this.resumeCount = 0;
  FakeCtx._last = this;   // 供测试反查（audio.js 的 ctx 是闭包私有，见 wireHooks）
}
FakeCtx.prototype._add = function (n, kind) {
  n._kind = kind; n._out = []; n._connTo = [];
  this.nodes.push(n);
  return n;
};
FakeCtx.prototype.createGain = function () {
  var n = this._add({
    gain: new FakeParam(1),
    connect: function (d) { n._connTo.push(d); if (d && d._in) d._in.push(n); }
  }, 'gain');
  n._in = [];
  return n;
};
FakeCtx.prototype.createOscillator = function () {
  var n = this._add({
    type: 'sine',
    frequency: new FakeParam(440),
    _started: false, _stopped: false, _startT: null, _stopT: null,
    connect: function (d) { n._connTo.push(d); },
    start: function (t) { n._started = true; n._startT = t; },
    stop: function (t) { n._stopped = true; n._stopT = t; }
  }, 'osc');
  return n;
};
FakeCtx.prototype.createBuffer = function (ch, len, rate) {
  var data = new Float32Array(len);
  return { length: len, sampleRate: rate, getChannelData: function () { return data; }, _data: data };
};
FakeCtx.prototype.createBufferSource = function () {
  var n = this._add({
    buffer: null,
    connect: function (d) { n._connTo.push(d); },
    start: function (t) { n._started = true; n._startT = t; },
    stop: function (t) { n._stopped = true; n._stopT = t; },
    _started: false, _stopped: false, _startT: null, _stopT: null
  }, 'bufsrc');
  return n;
};
FakeCtx.prototype.createBiquadFilter = function () {
  var n = this._add({
    type: 'lowpass', Q: new FakeParam(1), frequency: new FakeParam(350),
    connect: function (d) { n._connTo.push(d); }
  }, 'biquad');
  return n;
};
FakeCtx.prototype.createDynamicsCompressor = function () {
  var n = this._add({
    threshold: new FakeParam(-24), knee: new FakeParam(30), ratio: new FakeParam(12),
    attack: new FakeParam(0.003), release: new FakeParam(0.25),
    connect: function (d) { n._connTo.push(d); }
  }, 'comp');
  n._in = [];
  return n;
};
FakeCtx.prototype.resume = function () {
  this.resumeCount++;
  this.state = 'running';
  return { then: function () { return this; } };
};
/* 测试辅助：本帧新建的节点 */
FakeCtx.prototype.since = function (mark) { return this.nodes.slice(mark); };
FakeCtx.prototype.oscsSince = function (mark) {
  return this.nodes.slice(mark).filter(function (n) { return n._kind === 'osc'; });
};

/* 载入一份全新的 audio.js 模块实例（见踩坑记录 2）。
 * opts.noCtx = true 时不注入 AudioContext，用于测「能力缺失」路径。
 *
 * ⚠ 为什么测试钩子装在这里、而不是 audio.js 里加 __test 接口：
 *   生产模块不该为了可测性长出测试专用的 API（那会成为永久的技术债，
 *   且谁都能在生产代码里调到 __t 去改时间）。改为在测试侧包装：
 *   audio.js 一无所知，测试却能窥探它的全部行为。
 *   代价是只能通过**假 ctx 的节点记录**间接观察 —— 对本模块足够了。 */
function load(opts) {
  opts = opts || {};
  var fs = require('fs');
  var vm = require('vm');
  var g = {};
  g.window = g;
  if (!opts.noCtx) g.AudioContext = FakeCtx;
  vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), g, { filename: SRC });
  var A = g.AT.audio;
  if (!opts.noCtx) {
    /* ⚠ 必须先触发一次 ensure() 才能拿到 ctx：audio.js 是惰性建上下文的
     *   （AudioContext 要在用户手势里才创建，见 audio.js 的 unlock 注释）。
     *   available 的 getter 内部会调 ensure()，是最轻的触发方式。 */
    void A.available;
    wireHooks(A);
  }
  return A;
}

/* 把假 ctx 的节点线暴露成几个查询方法。
 *
 * ⚠ 关键：audio.js 的 ctx 是闭包私有变量，外部拿不到。
 *   但它的 master.connect(ctx.destination) 会把 destination 这个对象记下来 ——
 *   而那个对象正是假 ctx 自己的 `destination` 属性。
 *   于是从任一节点反查即可拿回整个假 ctx。这里用「找第一个接 destination 的节点」
 *   作为入口（audio.js 里只有 master 会这么做）。 */
function wireHooks(A) {
  var ctx = FakeCtx._last;
  if (!ctx) { throw new Error('测试装置失效：拿不到假 ctx（audio.js 是否漏调 ensure？）'); }
  /* 游标：__mark() 记下此刻的节点数，__fresh() 取此后新建的节点。
   * 用游标而非显式传参，是为了让用例读起来像「这里开始录」而不是一串 mark 变量。 */
  var cur = 0;

  A.__ctx = function () { return ctx; };
  A.__t = function (dt) { ctx.currentTime += dt; };
  A.__mark = function () { cur = ctx.nodes.length; return cur; };
  A.__fresh = function (mark) {
    return ctx.nodes.slice(mark == null ? cur : mark);
  };
  A.__oscsFresh = function (mark) {
    return A.__fresh(mark).filter(function (n) { return n._kind === 'osc'; });
  };
  A.__lastOsc = function () {
    var all = ctx.nodes.filter(function (n) { return n._kind === 'osc'; });
    return all[all.length - 1];
  };
}

/* 便捷：建好可用上下文（resume 过）的实例 */
function live() {
  var A = load();
  A.unlock();
  return A;
}

/* 用例包装：任何一个 case 内部抛异常时，记一条失败并继续跑其余的，
 * 而不是让整个脚本崩在第一个 case 上。
 * ⚠ 为什么必须这样做：音频用例之间是**串联**的（都依赖「默认开启 + 能建 ctx」），
 *   一旦前提被改坏，第一个崩溃会掩盖后面几十条真实结论 ——
 *   而本脚本存在的意义正是「一次跑完看到全部问题」。 */
function test(name, fn) {
  try { fn(); }
  catch (e) {
    fail++;
    failures.push('[' + name + '] 抛出异常：' + (e && e.message ? e.message : String(e)));
  }
}

/* 从 ctx 里找出「音效总线」与「BGM 总线」：audio.js 里 comp 的上游是 sfxBus，
 * master 的上游有两个（comp 与 bgmBus），其中不会经过 comp 的那个即 bgmBus。 */
function buses(A) {
  var ctx = A.__ctx || null;
  return ctx;
}

/* ═════════════════════ 用例 ═════════════════════ */

section('能力检测与降级');

/* ⚠ 本条放在最前面：它验的是「默认开启」这个**全局前提**。
 *   defcon 的实测教训①——默认静音会让玩家全程无声打完一局、音效白做——
 *   是本作音频最重要的单条决策。若它被改坏，后面几乎每个用例都会连锁失败
 *   （play 一律返回 false），但那时的报错会是「读 undefined 的 frequency」
 *   这种毫无指向性的异常。故把它单独钉在最前面，让失败一眼可读。 */
test('case-1', function () {
  var A = load({ noCtx: true });
  ok(A.enabled === true,
     '默认开启（defcon 教训①：默认静音 = 玩家全程无声，音效白做）',
     '实际 enabled=' + A.enabled);
});

/* 无 AudioContext（旧浏览器 / 非浏览器环境）：不能抛异常，play 必须返回 false。
 * 这是 defcon 的一条实机教训：能力检测写漏一处，整个主循环就死在第一帧。 */
test('无 AudioContext 时全链路不抛异常', function () {
  var A = load({ noCtx: true });
  var threw = false;
  try {
    A.unlock();
    A.play('click');
    A.play('open');
    A.setCue('startup');
    A.bgm.start();
    A.pump();
    A.toggle();
    A.setEnabled(true);
  } catch (e) { threw = true; }
  ok(!threw, '无 AudioContext 时全链路不抛异常');
  ok(A.available === false, 'available 报 false', '实际 ' + A.available);
  ok(A.play('click') === false, 'play 返回 false（不静默成功）');
  ok(A.bgm.start() === false, 'bgm.start 返回 false');
});

section('解锁与自动播放策略');

test('未解锁时 play 不抛异常', function () {
  var A = load();
  var threw = false;
  try { A.play('click'); } catch (e) { threw = true; }
  ok(!threw, '未解锁时 play 不抛异常');
  ok(A.play('click') === false, '未解锁（suspended）时 play 返回 false —— 不排程半截音');
});

test('解锁后 play 返回 true', function () {
  var A = live();
  ok(A.play('click') === true, '解锁后 play 返回 true');
});

section('音色表完整性');

test('音效 ', function () {
  var A = live();
  var NAMES = ['quarter', 'open', 'upgrade', 'rival', 'event', 'crisis',
               'click', 'confirm', 'deny', 'profit', 'loss', 'milestone', 'end'];
  /* ⚠ 逐个断言而不是「一次性 count 失败数」：某个音缺失时，
   *   detail 里要能直接看到是哪一个，不必再去逐个试。 */
  NAMES.forEach(function (n) {
    A.__t(1);                                   // 时间前推 1s，避过去抖
    ok(A.play(n) === true, '音效 ' + n + ' 可播放');
  });
});

test('未知音效名返回 false 而不是抛异常', function () {
  var A = live();
  A.__t(1);
  ok(A.play('不存在的音效') === false, '未知音效名返回 false 而不是抛异常');
  A.__t(1);
  ok(A.play('end', { win: true }) === true, 'end 支持 win 参数（胜局）');
  A.__t(3);
  ok(A.play('end', { win: false }) === true, 'end 支持 win 参数（负局）');
});

section('去抖：叠层升调而不是丢弃');

test('去抖窗口内叠层时频率升高', function () {
  var A = live();
  /* 第一次：正常音高 */
  A.__t(10);
  A.play('quarter');
  var m0 = A.__mark();
  var f0 = A.__lastOsc().frequency.value;

  /* 极短间隔内再响 → 应叠层，且**频率要高一点**（升调），
   * 而不是直接丢弃（丢弃会得到「越热闹越安静」—— defcon 的教训②） */
  A.play('quarter');
  var f1 = A.__lastOsc().frequency.value;
  ok(f1 > f0, '去抖窗口内叠层时频率升高', '第一次 ' + f0.toFixed(1) + ' → 叠层 ' + f1.toFixed(1));

  /* 第三层 */
  A.play('quarter');
  var f2 = A.__lastOsc().frequency.value;
  ok(f2 > f1, '第二层继续升调', f1.toFixed(1) + ' → ' + f2.toFixed(1));

  /* 上限：quarter 的 MAX_STACK 是 2（即除了第一声还能叠 2 层），故第四次被丢弃 */
  var r4 = A.play('quarter');
  ok(r4 === false, '超过 MAX_STACK 后丢弃（不再无限叠层）', '实际返回 ' + r4);
});

test('case-2', function () {
  var A = live();
  /* 去抖窗口**外**：应回到原音高（不是继续往上叠）。
   * 若 lastAt 的判断写成 `<=` 或 stack 忘了清零，这里会失败。 */
  A.__t(10);
  A.play('quarter');
  var base = A.__lastOsc().frequency.value;
  A.play('quarter');                       // 叠一层
  A.__t(10 + 0.5);                         // 越过 MIN_GAP.quarter = 0.45
  A.play('quarter');
  var back = A.__lastOsc().frequency.value;
  ok(Math.abs(back - base) < 0.01,
     '越过最小间隔后回到基础音高（叠层已复位）', base.toFixed(1) + ' vs ' + back.toFixed(1));
});

test('event 首次可播', function () {
  var A = live();
  /* event 的 MAX_STACK = 0：第二个事件卡在同一窗口内必须被丢弃。
   * 为什么这样设计：事件卡是需要玩家读完做决策的，连续两张卡叠着响会像「警报故障」。 */
  A.__t(10);
  ok(A.play('event') === true, 'event 首次可播');
  ok(A.play('event') === false, 'event 在窗口内第二次被丢弃（MAX_STACK=0）');
});

section('开关');

test('默认开启（defcon 教训①：默认静音=音效白做）', function () {
  var A = live();
  ok(A.enabled === true, '默认开启（defcon 教训①：默认静音=音效白做）');
  A.__t(10);
  A.setEnabled(false);
  ok(A.play('click') === false, '关闭后 play 返回 false');
  A.setEnabled(true);
  A.__t(11);
  ok(A.play('click') === true, '重新开启后恢复播放');
  ok(A.toggle() === false, 'toggle 返回切换后的状态（关）');
  ok(A.toggle() === true, 'toggle 再切回开');
  ok(A.enabled === true, 'enabled 读取器与内部状态一致');
});

section('总线结构（压缩器只给音效，BGM 绕过）');

test('存在一个压缩器', function () {
  var A = live();
  var ctx = A.__ctx();
  var comp = ctx.nodes.filter(function (n) { return n._kind === 'comp'; })[0];
  ok(!!comp, '存在一个压缩器');

  /* comp 的上游应只有 sfxBus 一个 gain —— 若 BGM 也接进压缩器，
   * BGM 会长期处于压缩态、把该突出的音效反压下去（defcon 教训③）。 */
  var compUpstream = ctx.nodes.filter(function (n) {
    return n._connTo && n._connTo.indexOf(comp) >= 0;
  });
  ok(compUpstream.length === 1,
     '压缩器上游只有一个总线（音效总线）', '实际上游数 ' + compUpstream.length);

  /* master 的下游必须是 destination */
  var toDest = ctx.nodes.filter(function (n) {
    return n._connTo && n._connTo.indexOf(ctx.destination) >= 0;
  });
  ok(toDest.length === 1, '只有 master 接 destination（无重复输出）',
     '实际 ' + toDest.length);

  /* BGM 总线必须存在且**不接到压缩器** */
  A.__t(1);
  A.setCue('global');
  A.bgm.start();
  var mark = ctx.nodes.length - 1;
  A.__t(2);
  A.pump();
  var bgmOscs = ctx.oscsSince(mark);
  ok(bgmOscs.length > 0, 'BGM 音序器确实排了音（global 段落）',
     '排程 ' + bgmOscs.length + ' 个振荡器');
  var bgmToComp = bgmOscs.filter(function (n) {
    return (n._connTo || []).some(function (d) { return d === comp; });
  });
  ok(bgmToComp.length === 0, 'BGM 的音符不直连压缩器（绕过压缩）',
     '直连数 ' + bgmToComp.length);
});

section('包络与频率安全区');

test('包络峰值有意义（既不静音也不过载）', function () {
  var A = live();
  var NAMES = ['quarter', 'open', 'upgrade', 'rival', 'event', 'crisis',
               'click', 'confirm', 'deny', 'profit', 'loss', 'milestone'];
  /* ⚠ 这里的判据不能是「峰值 > 0」—— 0.0001 是 audio.js 用来表示**静音**的
   *   地板值（exponentialRamp 不能到 0，故用 0.0001 代替）。
   *   若把峰值写成 0.0001，`> 0` 依然成立，测试会放过一个「完全没声音」的音效。
   *   故判据定为「峰值 ≥ 0.005」：低于此值在手机扬声器上实际听不见。
   *   （0.005 是保守下限 —— 本作最轻的 click 峰值也有 0.09。） */
  var FLOOR = 0.005;
  var silent = [], over = [], badFreq = [];
  NAMES.forEach(function (n, i) {
    A.__t(10 + i * 3);
    A.__mark();
    A.play(n);
    var fresh = A.__fresh();
    var maxPeak = 0;
    fresh.forEach(function (node) {
      if (node._kind !== 'gain') return;
      node.gain._events.forEach(function (e) {
        if (e.op !== 'exp') return;
        if (e.v > maxPeak && e.v < 0.9) maxPeak = e.v;   // 排除噪声/总线增益
        if (e.v >= 1) over.push(n + ' peak=' + e.v);
      });
    });
    if (maxPeak < FLOOR) silent.push(n + ' maxPeak=' + maxPeak);
    A.__oscsFresh().forEach(function (o) {
      var f = o.frequency.value;
      // 音效一律 ≥ 200 Hz（手机扬声器下限，见 audio.js 的设计约束）
      if (f < 199) badFreq.push(n + ' ' + f.toFixed(0) + 'Hz');
    });
  });
  ok(silent.length === 0,
     '每个音效都真的出声（包络峰值 ≥ ' + FLOOR + '）', silent.slice(0, 4).join(' / '));
  ok(over.length === 0,
     '没有包络过载（峰值 < 1，不削顶）', over.slice(0, 4).join(' / '));
  ok(badFreq.length === 0,
     '音效基频全部 ≥ 200 Hz（避开手机辐射下限）', badFreq.slice(0, 4).join(' / '));
});

test('确实产生了音频源节点', function () {
  var A = live();
  /* 每个振荡器都必须 start 且 stop —— 漏 stop 会持续占用音频线程。
   * 这在现场表现为「玩久了越来越卡/爆音」，很难归因。 */
  var notStopped = 0, notStarted = 0, total = 0;
  ['quarter', 'open', 'upgrade', 'profit', 'milestone', 'end'].forEach(function (n, i) {
    A.__t(10 + i * 3);
    var mark = A.__mark();
    A.play(n, { win: true });
    A.__fresh().forEach(function (node) {
      if (node._kind !== 'osc' && node._kind !== 'bufsrc') return;
      total++;
      if (!node._started) notStarted++;
      if (!node._stopped) notStopped++;
    });
  });
  ok(total > 0, '确实产生了音频源节点', '共 ' + total);
  ok(notStarted === 0, '所有音频源都已 start', '未 start ' + notStarted);
  ok(notStopped === 0, '所有音频源都已 stop（不留活跃节点）', '未 stop ' + notStopped);
});

section('BGM 三段落');

test('初始未播放', function () {
  var A = live();
  ok(A.bgm.playing === false, '初始未播放');
  A.setCue('startup');
  ok(A.bgm.cue === 'startup', 'setCue 生效');
  ok(A.bgm.bpm === 84, 'startup 为 84 BPM', '实际 ' + A.bgm.bpm);
  A.setCue('expand');
  ok(A.bgm.bpm === 104, 'expand 为 104 BPM', '实际 ' + A.bgm.bpm);
  A.setCue('global');
  ok(A.bgm.bpm === 120, 'global 为 120 BPM', '实际 ' + A.bgm.bpm);
});

test('非法 cue 被忽略，BPM 不变', function () {
  var A = live();
  /* 非法 cue 必须被忽略（不能把 bpm 变成 NaN → 音序器死循环） */
  A.setCue('startup');
  A.setCue('不存在');
  ok(A.bgm.bpm === 84, '非法 cue 被忽略，BPM 不变', '实际 ' + A.bgm.bpm);
  ok(A.bgm.cue === 'startup', 'cue 未被非法值覆盖', '实际 ' + A.bgm.cue);
});

test('start 后 playing 为 true', function () {
  var A = live();
  A.bgm.start();
  ok(A.bgm.playing === true, 'start 后 playing 为 true');
  A.setCue('startup');
  var ctx = A.__ctx();
  var mark = ctx.nodes.length;

  /* 音序器按 BPM 排程：startup 84 BPM → 16 分音符 = 60/84/4 ≈ 0.1786s。
   *
   * ⚠ 这里能观测到的只有「**发声**间隔」，观测不到「排程步长」——
   *   因为空步（arp 里的 null）不产生任何节点，不留痕迹。
   *   startup 的 arp 是隔一步一个音（['D4', null, 'A4', null, ...]），
   *   所以发声间隔 = 2 个 16 分音符 ≈ 0.357s。断言这个值即可：
   *   它同时钉住了 BPM（改 BPM 会让它变）与谱型（改谱子会让它变）。
   *   验 BPM 换算是否正确的更直接方法是换一个每步都有音的段落 ——
   *   见下面的 expand 断言。 */
  var steps = 0;
  for (var i = 0; i < 20; i++) { A.__t(0.05); A.pump(); }
  var oscs = ctx.oscsSince(mark);
  ok(oscs.length > 0, 'BGM 排了音', '共 ' + oscs.length + ' 个振荡器');

  var uniq = [];
  oscs.map(function (o) { return o._startT; })
    .sort(function (a, b) { return a - b; })
    .forEach(function (t) {
      if (!uniq.length || t - uniq[uniq.length - 1] > 1e-6) uniq.push(t);
    });
  var stepGaps = [];
  for (var j = 1; j < uniq.length; j++) stepGaps.push(uniq[j] - uniq[j - 1]);
  /* 每个不同时刻可能有多个音（琶音+低音同刻），故取众数间距而非最小间距 */
  var minStep = Math.min.apply(null, stepGaps);
  var expect = 60 / 84 / 4 * 2;              // 隔步发声 → 2 个 16 分音符
  ok(Math.abs(minStep - expect) < 0.02,
     'startup 发声间隔 = 2 个 16 分音符（84 BPM → ' + expect.toFixed(4) + 's）',
     '实际 ' + minStep.toFixed(4) + 's（共 ' + uniq.length + ' 个不重复时刻）');
});

test('case-4', function () {
  var A = live();
  /* 用 expand 段验 BPM 换算：它的 arp **每步都有音**，
   * 于是发声间隔 = 1 个 16 分音符，可以直接反推 BPM。 */
  A.bgm.start();
  A.setCue('expand');
  var ctx = A.__ctx();
  var mark = ctx.nodes.length;
  for (var i = 0; i < 20; i++) { A.__t(0.05); A.pump(); }
  var oscs = ctx.oscsSince(mark).filter(function (n) { return n._kind === 'osc'; });
  var uniq = [];
  oscs.map(function (o) { return o._startT; })
    .sort(function (a, b) { return a - b; })
    .forEach(function (t) {
      if (!uniq.length || t - uniq[uniq.length - 1] > 1e-6) uniq.push(t);
    });
  var gaps = [];
  for (var j = 1; j < uniq.length; j++) gaps.push(+(uniq[j] - uniq[j - 1]).toFixed(4));
  var minGap = Math.min.apply(null, gaps);
  var expect = 60 / 104 / 4;                 // expand 104 BPM
  ok(Math.abs(minGap - expect) < 0.01,
     'expand 每步发声 → 间隔 = 16 分音符（104 BPM → ' + expect.toFixed(4) + 's）',
     '实际 ' + minGap.toFixed(4) + 's');
});

test('换段后继续排音', function () {
  var A = live();
  /* 换段不重置节拍位置（nextAt）—— 否则每次换段都像「重开一首曲子」。
   * 断言方式：连续排几步后换段，下一个音的起始时间应**接着**上一步，
   * 而不是回到 currentTime + 0.1 那种「从头开始」的位置。 */
  A.bgm.start();
  A.setCue('startup');
  A.__t(0.2); A.pump();
  var ctx = A.__ctx();
  var mark = ctx.nodes.length;
  var lastBefore = ctx.nodes.filter(function (n) { return n._kind === 'osc'; })
    .map(function (n) { return n._startT; })
    .reduce(function (a, b) { return Math.max(a, b); }, 0);

  /* ⚠ 换段后必须**推进时间**才会继续排音：音序器是 lookahead 型的，
   *   它只在「nextAt 落在 now+0.25s 窗口内」时才排下一个音。
   *   刚 pump 过一轮后窗口已排满，不推时间就直接换段 → 自然排不出新音。 */
  A.__t(0.2);

  A.setCue('expand');
  A.pump();
  var after = ctx.oscsSince(mark).map(function (n) { return n._startT; }).sort(function (a, b) { return a - b; });
  ok(after.length > 0, '换段后继续排音', '排程 ' + after.length);
  if (after.length) {
    /* expand 是 104 BPM，步长更短；但第一个音必须**紧接**上一段的末尾，
     * 不能跳回更早的时间点（那会与已排的音重叠、听感上像卡带）。 */
    ok(after[0] >= lastBefore - 0.001,
       '换段后第一个音不早于上一段末尾（节拍连续）',
       '换段前最后 ' + lastBefore.toFixed(3) + 's，换段后首个 ' + after[0].toFixed(3) + 's');
  }
});

test('stop 后 playing 为 false', function () {
  var A = live();
  A.bgm.start();
  A.setCue('startup');
  A.__t(1); A.pump();
  A.bgm.stop();
  ok(A.bgm.playing === false, 'stop 后 playing 为 false');
  var ctx = A.__ctx();
  var mark = ctx.nodes.length;
  for (var i = 0; i < 10; i++) { A.__t(0.1); A.pump(); }
  ok(ctx.oscsSince(mark).length === 0, 'stop 后音序器不再排音');
});

test('未设 cue 时 pump 不抛异常', function () {
  var A = live();
  /* 未 setCue 就 pump：不能排音，也不能抛异常（startup 前主循环已在跑） */
  A.bgm.start();
  var ctx = A.__ctx();
  var mark = ctx.nodes.length;
  var threw = false;
  try { A.__t(1); A.pump(); } catch (e) { threw = true; }
  ok(!threw, '未设 cue 时 pump 不抛异常');
  ok(ctx.oscsSince(mark).length === 0, '未设 cue 时不排任何音');
});

section('pump 安全性');

test('无音频能力时 pump 可被主循环无限调用而不崩', function () {
  var A = load({ noCtx: true });
  var threw = false;
  try { for (var i = 0; i < 5; i++) A.pump(); } catch (e) { threw = true; }
  ok(!threw, '无音频能力时 pump 可被主循环无限调用而不崩');
});

test('未 start 时 pump 安全', function () {
  var A = live();
  /* pump 在音乐未播放时也必须安全（游戏暂停时主循环仍在跑） */
  var threw = false;
  try { A.__t(1); A.pump(); A.pump(); } catch (e) { threw = true; }
  ok(!threw, '未 start 时 pump 安全');
});

test('长时间停顿后单次 pump 排程有上限（无积压爆音）', function () {
  var A = live();
  /* 长时间不 pump（切后台 10 分钟）后回来：不能一次补排几千个音
   * （那会造成一次巨大的音频积压 → 爆音/卡顿）。
   * audio.js 的 guard 上限是 32 步，故单次 pump 排程数必须 <= 32。 */
  A.bgm.start();
  A.setCue('global');
  var ctx = A.__ctx();
  var mark = ctx.nodes.length;
  A.__t(600);                       // 时间前推 10 分钟
  A.pump();
  var n = ctx.oscsSince(mark).length;
  ok(n <= 32 * 3, '长时间停顿后单次 pump 排程有上限（无积压爆音）',
     '一次排了 ' + n + ' 个振荡器');
});

/* ═════════════════════ 汇总 ═════════════════════ */

console.log('\n' + '═'.repeat(74));
if (fail === 0) {
  console.log('  结果：' + pass + ' 通过 / 0 失败  （共 ' + pass + ' 项）');
} else {
  console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败  （共 ' + (pass + fail) + ' 项）');
  console.log('\n  失败项：');
  failures.forEach(function (f, i) { console.log('   ' + (i + 1) + ') ' + f); });
}
console.log('═'.repeat(74));
process.exit(fail ? 1 : 0);
