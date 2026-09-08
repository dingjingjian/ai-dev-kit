// BGM 合成逻辑校验
// smoke-dom.js 只能验证「没有 AudioContext 时不报错」，跑不到真正的合成路径。
// 这里给一个 AudioContext 桩，手动驱动调度器把每个场景都真跑一遍，
// 抓那些只在真实出声时才暴露的问题：exponentialRamp 目标为 0、NaN 频率、
// 超出听域的音高、写了却永远没被触发的音色层、定时器泄漏。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = 'C:/Users/dingj/.workbuddy/binaries/node/workspace/node_modules';
const { JSDOM } = require(path.join(nm, 'jsdom'));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

// ------------------------------------------------------------
// AudioContext 桩：所有参数读写都做合法性检查
// ------------------------------------------------------------
function makeAC(log) {
  const bad = [];

  function Param(name, v) {
    const chk = (x, t) => {
      if (typeof x !== 'number' || !isFinite(x)) bad.push(`${name} 值非法：${x}`);
      if (typeof t !== 'number' || !isFinite(t)) bad.push(`${name} 时间非法：${t}`);
    };
    return {
      value: v,
      setValueAtTime(x, t) { chk(x, t); this.value = x; return this; },
      linearRampToValueAtTime(x, t) { chk(x, t); this.value = x; return this; },
      exponentialRampToValueAtTime(x, t) {
        // 真实 Web Audio 里目标值为 0 会直接抛 RangeError
        if (x === 0) bad.push(`${name} exponentialRamp 目标为 0`);
        chk(x, t); this.value = x; return this;
      },
      cancelScheduledValues() { return this; }
    };
  }

  const node = (extra) => Object.assign({ connect() { return this; }, disconnect() { return this; } }, extra);

  function AC() {
    const self = this;
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = node({});
    this.resume = () => { self.state = 'running'; return Promise.resolve(); };
    this.createGain = () => node({ gain: Param('gain', 1) });
    this.createOscillator = () => {
      const o = node({
        type: 'sine',
        frequency: Param('osc.frequency', 440),
        detune: Param('osc.detune', 0),
        start(t) {
          if (!isFinite(t)) bad.push('osc.start 时间非法');
          log.started.push({ f: o.frequency.value, type: o.type });
        },
        stop(t) { if (!isFinite(t)) bad.push('osc.stop 时间非法'); }
      });
      return o;
    };
    this.createBiquadFilter = () => node({
      type: 'lowpass',
      frequency: Param('filter.frequency', 350),
      Q: Param('filter.Q', 1),
      gain: Param('filter.gain', 0)
    });
    this.createBufferSource = () => node({
      buffer: null,
      start(t) {
        if (!isFinite(t)) bad.push('src.start 时间非法');
        log.started.push({ f: 0, type: 'noise' });
      },
      stop(t) { if (!isFinite(t)) bad.push('src.stop 时间非法'); }
    });
    this.createBuffer = (ch, len, rate) => {
      if (!(len > 0)) bad.push(`createBuffer 长度非法：${len}`);
      const data = [];
      for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: rate, getChannelData: (i) => data[i] };
    };
    this.createConvolver = () => node({ buffer: null, normalize: true });
    // 只实现真实存在的工厂方法。名字写错（比如 createCompressor）会直接
    // TypeError → build() 抛错 → BGM 永久静默，正是本次要防的事故
    this.createDynamicsCompressor = () => node({
      threshold: Param('comp.threshold', -24), knee: Param('comp.knee', 30),
      ratio: Param('comp.ratio', 12), attack: Param('comp.attack', 0.003),
      release: Param('comp.release', 0.25)
    });
  }

  return { AC, bad };
}

// ------------------------------------------------------------
// 环境
// ------------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/'
});
const win = dom.window;

const log = { started: [] };
const { AC, bad } = makeAC(log);
let inst = null;

// 构造时抓住实例，方便后面手动推进 currentTime
win.AudioContext = function () { const a = new AC(); inst = a; return a; };

// 拦截调度器心跳，改由测试手动驱动
let tick = null, timers = 0;
win.setInterval = (fn) => { tick = fn; return ++timers; };
win.clearInterval = () => { tick = null; };

const errors = [];
win.addEventListener('error', e => errors.push('window.error: ' + e.message));

// 带上 sfx.js：真实运行时 BGM 是借 SV.sfx._ac() 的上下文，测试也得走这条路径
['src/data.js', 'src/sfx.js', 'src/bgm.js'].forEach(f => {
  try { win.eval(fs.readFileSync(path.join(root, f), 'utf8')); }
  catch (e) { errors.push(`执行 ${f} 抛错：${e.message}`); }
});

const B = win.SV.bgm;
// 手动推进虚拟时间并驱动调度器
function run(seconds) {
  const n = Math.round(seconds / 0.026);
  for (let i = 0; i < n; i++) { inst.currentTime += 0.026; if (tick) tick(); }
}

console.log('\n[0] 只用真实存在的 Web Audio 工厂方法');
{
  // 桩是按想象写的，桩里多写一个不存在的名字，或源码里拼错一个名字，
  // 两边会一起错成「全绿」。所以再静态扫一遍源码，以规范为准。
  const REAL = [
    'createBuffer', 'createBufferSource', 'createConstantSource', 'createConvolver',
    'createDelay', 'createDynamicsCompressor', 'createGain', 'createIIRFilter',
    'createBiquadFilter', 'createOscillator', 'createPanner', 'createPeriodicWave',
    'createStereoPanner', 'createChannelSplitter', 'createChannelMerger',
    'createAnalyser', 'createScriptProcessor', 'createWaveShaper',
    'createMediaElementSource', 'createMediaStreamSource', 'createMediaStreamDestination'
  ];
  const src = fs.readFileSync(path.join(root, 'src/bgm.js'), 'utf8');
  const used = [...new Set([...src.matchAll(/\bA\s*\.\s*create([A-Za-z]+)\s*\(/g)].map(m => 'create' + m[1]))];
  const mkd = [...new Set([...src.matchAll(/\bmk\(\s*'([A-Za-z]+)'/g)].map(m => m[1]))];
  ok(used.length > 0, `源码用到 ${used.length} 个工厂方法：${used.join(', ')}`);
  const bad1 = used.filter(n => REAL.indexOf(n) < 0);
  ok(bad1.length === 0, '没有拼错的工厂方法名' + (bad1.length ? '：' + bad1.join(', ') : ''));
  const bad2 = mkd.filter(n => REAL.indexOf(n) < 0);
  ok(bad2.length === 0, `可选节点（mk）同样用真名：${mkd.join(', ')}` + (bad2.length ? '，拼错：' + bad2.join(', ') : ''));
}

console.log('\n[1] 载入与起播');
ok(errors.length === 0, '脚本载入无报错' + (errors.length ? '：' + errors.join('；') : ''));
ok(!!B, 'SV.bgm 已挂载');
ok(B.unlock() === true, '有 AudioContext 时 unlock 成功');
ok(!!inst, '建立了 AudioContext');
B.play('base');
ok(!!tick, '起播后注册了调度器');
ok(B.isPlaying() === true, 'isPlaying 为真');

console.log('\n[2] 每个场景各跑 16 秒虚拟时间');
{
  const scenes = ['menu', 'base', 'design', 'launch', 'flight', 'log', 'win'];
  const tally = {};
  for (const name of scenes) {
    const before = log.started.length;
    const badBefore = bad.length;
    B.setScene(name);
    run(16);                       // 四小节一轮，16 秒足够跑两轮以上
    const n = log.started.length - before;
    tally[name] = n;
    const nb = bad.slice(badBefore);
    ok(n > 0 && nb.length === 0,
      `${name.padEnd(6)} → ${String(n).padStart(4)} 个发声体` +
      (nb.length ? '，非法参数：' + nb.slice(0, 3).join('；') : ''));
  }
  // 飞行该比基地密：速度感靠音符密度堆出来
  ok(tally.flight > tally.base, `飞行(${tally.flight}) 比基地(${tally.base}) 更密`);
  ok(tally.menu > 0, `标题页(${tally.menu}) 有氛围音`);
}

console.log('\n[3] 音高必须落在听域内');
{
  const pitched = log.started.filter(s => s.type !== 'noise' && s.f > 0);
  const nan = log.started.filter(s => !isFinite(s.f));
  const out = pitched.filter(s => s.f < 20 || s.f > 20000);
  ok(nan.length === 0, `无 NaN / Infinity 频率（异常 ${nan.length} 个）`);
  ok(out.length === 0,
    `全部 ${pitched.length} 个音高都在 20Hz–20kHz 内` +
    (out.length ? '，越界：' + out.slice(0, 5).map(s => s.f.toFixed(1)).join(', ') : ''));
  const lo = Math.min(...pitched.map(s => s.f));
  const hi = Math.max(...pitched.map(s => s.f));
  ok(lo < 120, `最低音 ${lo.toFixed(1)}Hz 覆盖到低音区`);
  ok(hi > 800, `最高音 ${hi.toFixed(1)}Hz 覆盖到旋律区`);

  // 调性统一：和弦表写错的话这里会跑调，而前面的断言全都抓不到
  const toMidi = f => Math.round(69 + 12 * Math.log2(f / 440));
  const pcs = {};
  pitched.forEach(s => { const pc = ((toMidi(s.f) % 12) + 12) % 12; pcs[pc] = (pcs[pc] || 0) + 1; });
  // A 小调音级，外加 G#（E 大三和弦的导音，用来制造解决回 Am 的张力，属有意使用）
  const inKey = [9, 11, 0, 2, 4, 5, 7, 8];
  const nIn = inKey.reduce((a, pc) => a + (pcs[pc] || 0), 0);
  const ratio = nIn / pitched.length;
  ok(ratio > 0.9, `${(ratio * 100).toFixed(1)}% 的音落在调内（${nIn}/${pitched.length}）` +
    (ratio > 0.9 ? '' : '，跑调音级：' + Object.keys(pcs).filter(pc => inKey.indexOf(+pc) < 0).join(',')));
  ok((pcs[9] || 0) > 0, `主音 A 有出现（${pcs[9] || 0} 次）`);
}

console.log('\n[4] 三类发声体都被真正用到');
{
  const t = {};
  log.started.forEach(s => { t[s.type] = (t[s.type] || 0) + 1; });
  ok((t.triangle || 0) > 0, `triangle（和声垫 / 低音 / 琶音）${t.triangle || 0} 次`);
  ok((t.sine || 0) > 0, `sine（铃 / 底鼓 / 泛音）${t.sine || 0} 次`);
  ok((t.noise || 0) > 0, `噪声（镲 / 军鼓）${t.noise || 0} 次`);
}

console.log('\n[5] 场景切换不重置时钟、不中断');
{
  const t0 = inst.currentTime;
  B.setScene('flight'); run(1);
  B.setScene('base');
  const before = log.started.length;
  run(1);
  ok(log.started.length > before, '切场景后仍在发声（没有停表）');
  ok(inst.currentTime > t0, '时钟持续前进');
  ok(B.isPlaying() === true, '切换过程中不中断');
  B.setScene('不存在的场景');
  ok(B.isPlaying() === true, '未知场景名不影响播放');
  run(1);
  ok(true, '未知场景名后继续播放未抛错');
}

console.log('\n[6] duck / 后台暂停 / 恢复');
{
  const badBefore = bad.length;
  B.duck(0.8, 600);
  ok(bad.length === badBefore, 'duck 参数合法');

  B.suspend();
  ok(B.isPlaying() === false, 'suspend 后停止排程');
  const before = log.started.length;
  run(1);
  ok(log.started.length === before, '后台期间不再产生声音');

  B.resume();
  ok(B.isPlaying() === true, 'resume 后恢复排程');
  const after = log.started.length;
  run(2);
  ok(log.started.length > after, '恢复后重新发声');
}

console.log('\n[7] 关闭后彻底安静，且能再打开');
{
  B.setEnabled(false);
  const before = log.started.length;
  run(3);
  ok(log.started.length === before, '关闭后不再发声');
  ok(B.isEnabled() === false, 'isEnabled 为假');

  B.setEnabled(true);
  ok(B.isEnabled() === true, '重新开启');
  const after = log.started.length;
  run(3);
  ok(log.started.length > after, '重新开启后恢复发声');
}

console.log('\n[8] 反复挂起 / 恢复不泄漏定时器');
{
  const before = timers;
  for (let i = 0; i < 10; i++) { B.suspend(); B.resume(); }
  ok(timers - before <= 10, `10 轮挂起恢复只新增 ${timers - before} 个定时器`);
  const before2 = timers;
  B.play(); B.play(); B.play();      // 重复起播不应叠加定时器
  ok(timers === before2, '重复 play 不会注册多个调度器');
}

console.log('\n[9] 全程无非法参数');
ok(bad.length === 0, `共捕获 ${log.started.length} 次发声，非法参数 ${bad.length} 条` +
  (bad.length ? '：' + bad.slice(0, 5).join('；') : ''));

console.log('\n[10] 残缺 Web Audio：缺混响 / 缺压限器时仍能出声');
{
  // WebView 的实现经常缺节点。缺了应该退成干声继续放，
  // 而不是 build() 抛错 → dead → 整局永久静音（真实事故：createCompressor 拼错即如此）
  const d2 = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/'
  });
  const w2 = d2.window;
  const log2 = { started: [] };
  const { AC: AC2, bad: bad2 } = makeAC(log2);
  let inst2 = null;
  w2.AudioContext = function () {
    const a = new AC2(); inst2 = a;
    delete a.createConvolver;              // 没有混响
    delete a.createDynamicsCompressor;     // 没有压限器
    return a;
  };
  let tick2 = null;
  w2.setInterval = (fn) => { tick2 = fn; return 1; };
  w2.clearInterval = () => { tick2 = null; };

  ['src/data.js', 'src/sfx.js', 'src/bgm.js'].forEach(f => w2.eval(fs.readFileSync(path.join(root, f), 'utf8')));
  const B2 = w2.SV.bgm;
  B2.play('base');
  const n0 = log2.started.length;
  for (let i = 0; i < 400; i++) { inst2.currentTime += 0.026; if (tick2) tick2(); }
  ok(B2.isPlaying() === true, '节点缺失时依然判定为「正在播放」，没被判死');
  ok(log2.started.length > n0, `仍然产出 ${log2.started.length - n0} 个发声体`);
  ok(bad2.length === 0, '退化路径上没有非法参数' + (bad2.length ? '：' + bad2.slice(0, 3).join('；') : ''));
}

console.log('\n' + (fail ? `✗ ${fail} 项未通过` : '✓ 全部通过'));
process.exit(fail ? 1 : 0);
