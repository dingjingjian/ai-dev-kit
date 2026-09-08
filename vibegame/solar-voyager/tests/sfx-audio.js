// 音效合成校验
// sfx 之前连在 flight.js 里，没有专门的测试：只能靠「跑起来没报错」兜底。
// 这里给 AudioContext 打桩，逐个音效真跑一遍，抓那些只在出声时才暴露的问题：
// 空音效（写了却发不出声）、exponentialRamp 目标为 0、NaN 频率、越出听域、
// 绕过总线直连 destination、噪声 buffer 每次重算。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = 'C:/Users/dingj/.workbuddy/binaries/node/workspace/node_modules';
const { JSDOM } = require(path.join(nm, 'jsdom'));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

// ------------------------------------------------------------
// AudioContext 桩
// ------------------------------------------------------------
function makeAC(log) {
  function Param(name, v) {
    const chk = (x, t) => {
      if (typeof x !== 'number' || !isFinite(x)) log.bad.push(`${name} 值非法：${x}`);
      if (typeof t !== 'number' || !isFinite(t)) log.bad.push(`${name} 时间非法：${t}`);
      if (name === 'gain') { log.gains.push(x); if (x > log.peak) log.peak = x; }
      if (name === 'osc.frequency' && x > 0) log.freqs.push(x);
    };
    return {
      value: v,
      setValueAtTime(x, t) { chk(x, t); this.value = x; return this; },
      linearRampToValueAtTime(x, t) { chk(x, t); this.value = x; return this; },
      exponentialRampToValueAtTime(x, t) {
        // 真实 Web Audio 里目标值为 0 会直接抛 RangeError
        if (x === 0) log.bad.push(`${name} exponentialRamp 目标为 0`);
        chk(x, t); this.value = x; return this;
      },
      cancelScheduledValues() { return this; }
    };
  }

  const node = (extra) => Object.assign({
    connect(d) { if (d === this.__ctx.destination) log.toDest++; return this; },
    disconnect() { return this; }
  }, extra);

  function AC() {
    const self = this;
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = node({ __isDest: true });
    this.destination.__ctx = this;
    this.resume = () => Promise.resolve();
    const bind = (n) => { n.__ctx = self; return n; };
    this.createGain = () => bind(node({ gain: Param('gain', 1) }));
    this.createOscillator = () => bind(node({
      type: 'sine',
      frequency: Param('osc.frequency', 440),
      detune: Param('osc.detune', 0),
      start(t) {
        if (!isFinite(t)) log.bad.push('osc.start 时间非法');
        log.started.push({ f: this.frequency.value, type: this.type });
      },
      stop(t) { if (!isFinite(t)) log.bad.push('osc.stop 时间非法'); }
    }));
    this.createBiquadFilter = () => bind(node({
      type: 'lowpass',
      frequency: Param('filter.frequency', 350),
      Q: Param('filter.Q', 1),
      gain: Param('filter.gain', 0)
    }));
    this.createBufferSource = () => bind(node({
      buffer: null, loop: false,
      start(t) {
        if (!isFinite(t)) log.bad.push('src.start 时间非法');
        log.started.push({ f: 0, type: 'noise' });
      },
      stop(t) { if (!isFinite(t)) log.bad.push('src.stop 时间非法'); }
    }));
    this.createBuffer = (ch, len, rate) => {
      if (!(len > 0)) log.bad.push(`createBuffer 长度非法：${len}`);
      log.buffers++;
      const data = [];
      for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: rate, getChannelData: (i) => data[i] };
    };
  }
  return { AC };
}

function newLog() { return { started: [], bad: [], gains: [], freqs: [], buffers: 0, toDest: 0, peak: 0 }; }

// 起一个干净的 window，注入 data.js + sfx.js
function boot(withAudio) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/'
  });
  const win = dom.window;
  const log = newLog();
  if (withAudio) {
    const { AC } = makeAC(log);
    let inst = null;
    win.AudioContext = function () { const a = new AC(); inst = a; return a; };
    win.__inst = () => inst;
  }
  const errors = [];
  win.addEventListener('error', e => errors.push('window.error: ' + e.message));
  ['src/data.js', 'src/sfx.js'].forEach(f => {
    try { win.eval(fs.readFileSync(path.join(root, f), 'utf8')); }
    catch (e) { errors.push(`执行 ${f} 抛错：${e.message}`); }
  });
  return { win, log, errors, S: win.SV.sfx };
}

console.log('\n[1] 无 AudioContext 时必须静默且不报错');
{
  const { S, errors } = boot(false);
  const cues = Object.keys(S).filter(k => k !== '_ac' && k !== 'unlockAll');
  const before = errors.length;
  try {
    cues.forEach(k => S[k]());
    S.unlockAll();
    ok(true, `${cues.length} 个音效 + unlockAll 全部调用未抛错`);
  } catch (e) {
    ok(false, '无音频环境下音效抛错：' + e.message);
  }
  ok(errors.length === before, '未产生新的运行期报错');
  ok(S._ac() === null, '环境不支持时 _ac() 返回 null');
}

console.log('\n[2] 每个音效都要真的发出声音');
const { win, log, S } = boot(true);
{
  const cues = Object.keys(S).filter(k => k !== '_ac' && k !== 'unlockAll');
  const silent = [];
  const loud = [];
  for (const k of cues) {
    const n0 = log.started.length;
    log.peak = 0;
    S[k]();
    const made = log.started.length - n0;
    if (made === 0) silent.push(k);
    if (log.peak > 0.3) loud.push(`${k}(${log.peak})`);
  }
  ok(cues.length >= 18, `共 ${cues.length} 个音效：${cues.join(', ')}`);
  ok(silent.length === 0, '没有空音效' + (silent.length ? '：' + silent.join(', ') : ''));
  ok(loud.length === 0, '单个音效的峰值都不超过 0.3' + (loud.length ? '：' + loud.join(', ') : ''));
}

console.log('\n[3] 全部走总线，不直连 destination');
{
  // BGM 也挂在这条 context 上，音效绕过总线就没法整体调音量，也没法和 BGM 做平衡
  ok(log.toDest === 1, `只有 1 处连到 destination（总线自己），实际 ${log.toDest} 处`);
  ok(log.started.length > 20, `总线建立后共发出 ${log.started.length} 个发声体`);
}

console.log('\n[4] 噪声 buffer 复用，不每次重算');
{
  // 之前每次播噪声都现算几万个采样，发射那种长音效能听出卡顿
  const before = log.buffers;
  for (let i = 0; i < 30; i++) { S.launch(); S.boom(); S.hit(); }
  ok(log.buffers === before, `30 轮大音效只用了 ${log.buffers - before} 个新 buffer（应为 0）`);
  ok(log.buffers <= 1, `全程只创建了 ${log.buffers} 个 buffer`);
}

console.log('\n[5] 音高落在听域内，且没有 NaN');
{
  const pitched = log.freqs.filter(f => f > 0);
  const nan = log.freqs.filter(f => !isFinite(f));
  const out = pitched.filter(f => f < 20 || f > 20000);
  ok(nan.length === 0, `无 NaN / Infinity 频率（异常 ${nan.length} 个）`);
  ok(out.length === 0, `全部 ${pitched.length} 个音高都在 20Hz–20kHz 内` +
    (out.length ? '，越界：' + out.slice(0, 5).map(f => f.toFixed(1)).join(', ') : ''));
  ok(Math.min(...pitched) < 120, `最低音 ${Math.min(...pitched).toFixed(0)}Hz 覆盖到低音区`);
  ok(Math.max(...pitched) > 900, `最高音 ${Math.max(...pitched).toFixed(0)}Hz 覆盖到提示音区`);
}

console.log('\n[6] 三类发声体都被用到，且音效比 UI 音厚重');
{
  const t = {};
  log.started.forEach(s => { t[s.type] = (t[s.type] || 0) + 1; });
  ok((t.sine || 0) > 0, `sine（旋律 / 低鸣）${t.sine || 0} 次`);
  ok((t.triangle || 0) > 0, `triangle（点击 / 和弦）${t.triangle || 0} 次`);
  ok((t.square || 0) > 0, `square（警报 / 冲击）${t.square || 0} 次`);
  ok((t.sawtooth || 0) > 0, `sawtooth（拒绝 / 点火 / 爆炸）${t.sawtooth || 0} 次`);
  ok((t.noise || 0) > 0, `噪声（撞击 / 爆炸 / 点火）${t.noise || 0} 次`);
}

console.log('\n[7] 与 BGM 共用同一个 AudioContext');
{
  // bgm.js 通过 SV.sfx._ac() 复用上下文；拿不到就自己建一个，两边都不能哑
  const a = S._ac();
  ok(!!a, '_ac() 返回了 AudioContext');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/'
  });
  const w2 = dom.window;
  const log2 = newLog();
  const { AC } = makeAC(log2);
  w2.AudioContext = function () { return new AC(); };
  ['src/data.js', 'src/sfx.js', 'src/bgm.js'].forEach(f =>
    w2.eval(fs.readFileSync(path.join(root, f), 'utf8')));
  ok(w2.SV.bgm.unlock() === true, 'BGM 能借到音效的 AudioContext');
  w2.SV.bgm.play('base');
  ok(w2.SV.bgm.isPlaying() === true, 'BGM 起播成功（说明两个模块共用同一条上下文）');
}

console.log('\n[8] 全程无非法参数');
ok(log.bad.length === 0, `共捕获 ${log.started.length} 次发声，非法参数 ${log.bad.length} 条` +
  (log.bad.length ? '：' + log.bad.slice(0, 5).join('；') : ''));

console.log('\n' + (fail ? `✗ ${fail} 项未通过` : '✓ 全部通过'));
process.exit(fail ? 1 : 0);
