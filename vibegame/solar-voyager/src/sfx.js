// 星航者 · 合成音效
// 与 BGM 同一条红线：Web Audio 实时合成，不加载任何音频文件。
//
// 三条设计约束决定了这里的写法：
//  1. 一局要点几百次，所以 UI 音必须极短、极干，任何一点余韵都会攒成噪音；
//  2. 音效是「一瞬间的物理事件」，不是旋律 —— 只有成就 / 抵达这类一次性大事才给琶音；
//  3. 全部走一条总线，整体音量一处可调，且与环境不支持 Web Audio 时一样安静降级。
(function (global) {
  'use strict';

  var SV = global.SV;

  var AC = null, muted = false, bus = null, nb = null;

  // BGM 总线峰值实测约 0.13，音效要能在它上面透出来，又不能盖过语音/提示
  var VOL = 1.5;

  function ac() {
    if (muted) return null;
    try {
      if (!AC) {
        var C = global.AudioContext || global.webkitAudioContext;
        if (!C) { muted = true; return null; }
        AC = new C();
        bus = AC.createGain();
        bus.gain.value = VOL;
        bus.connect(AC.destination);
      }
      if (AC.state === 'suspended') {
        var p = AC.resume();
        if (p && p.catch) p.catch(function () {});   // 自动播放策略没放行，静默失败即可
      }
      return AC;
    } catch (e) { muted = true; return null; }
  }

  // ------------------------------------------------------------
  // 合成原语
  // ------------------------------------------------------------
  // 白噪声只生成一次循环使用。之前每次播噪声都现算几万个采样，
  // 发射那种近 1 秒的音效在低端机上能听出卡顿。
  function noiseBuf(a) {
    if (nb && nb.sampleRate === a.sampleRate) return nb;
    var len = Math.floor(a.sampleRate * 1.2);
    nb = a.createBuffer(1, len, a.sampleRate);
    var d = nb.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return nb;
  }

  // 单个乐音：起音 → 指数衰减，可选滑音 / 滤波 / 失谐副振荡器。
  // opt: { type, vol, atk, dur, to, cutoff, filter, q, detune, delay, hold }
  function tone(freq, dur, opt) {
    var a = ac(); if (!a) return;
    opt = opt || {};
    try {
      var t = a.currentTime + (opt.delay || 0);
      var v = Math.max(0.0002, opt.vol == null ? 0.06 : opt.vol);
      var atk = Math.min(opt.atk == null ? 0.005 : opt.atk, dur * 0.5);
      dur = Math.max(dur || 0.1, atk + 0.03);

      var g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + atk);
      if (opt.hold) g.gain.setValueAtTime(v, t + atk + opt.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      var tail = g;
      if (opt.cutoff) {
        var f = a.createBiquadFilter();
        f.type = opt.filter || 'lowpass';
        f.frequency.value = opt.cutoff;
        if (opt.q != null) f.Q.value = opt.q;
        g.connect(f); tail = f;
      }
      tail.connect(bus);

      // 失谐副振荡器用来把单薄的「嘟」撑成有厚度的音色
      var n = opt.detune ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var o = a.createOscillator();
        o.type = opt.type || 'sine';
        o.frequency.setValueAtTime(Math.max(20, freq), t);
        if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + dur);
        if (i) o.detune.value = opt.detune;
        o.connect(g);
        o.start(t); o.stop(t + dur + 0.03);
      }
    } catch (e) {}
  }

  // 噪声音：撞击、爆炸、金属摩擦、点火的轰鸣都靠它。
  // opt: { vol, atk, dur, filter, cutoff, to, q, delay }
  function hiss(dur, opt) {
    var a = ac(); if (!a) return;
    opt = opt || {};
    try {
      var t = a.currentTime + (opt.delay || 0);
      var v = Math.max(0.0002, opt.vol == null ? 0.12 : opt.vol);
      var atk = Math.min(opt.atk == null ? 0.004 : opt.atk, dur * 0.6);

      var src = a.createBufferSource();
      src.buffer = noiseBuf(a);
      src.loop = true;                                   // 循环噪声，靠包络裁出长度

      var f = a.createBiquadFilter();
      f.type = opt.filter || 'lowpass';
      f.frequency.setValueAtTime(opt.cutoff || 900, t);
      if (opt.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, opt.to), t + dur);
      if (opt.q != null) f.Q.value = opt.q;

      var g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(f); f.connect(g); g.connect(bus);
      src.start(t); src.stop(t + dur + 0.03);
    } catch (e) {}
  }

  // 一串音：给科技 / 成就 / 抵达这类「旋律型」提示。
  // 用 AudioContext 时钟排程而不是 setTimeout —— 切场景时不会有残音漏到下一屏。
  function seq(notes, o) {
    o = o || {};
    var step = o.step || 0.1, dur = o.dur || 0.24, d0 = o.delay || 0;
    for (var i = 0; i < notes.length; i++) {
      tone(notes[i], dur, {
        type: o.type, vol: o.vol, atk: o.atk, to: o.to,
        cutoff: o.cutoff, filter: o.filter, detune: o.detune,
        delay: d0 + i * step
      });
    }
  }

  // 大音效时把 BGM 压下去，不然爆炸声全被音乐糊住
  function duck(amt, ms) { if (SV.bgm) SV.bgm.duck(amt, ms); }

  // ------------------------------------------------------------
  // 音效表
  // ------------------------------------------------------------
  SV.sfx = {
    _ac: ac,                       // 供 BGM 复用同一个 AudioContext
    unlockAll: function () { ac(); },

    // —— 界面 ——
    // 通用点击：木质的「嗒」，瞬态靠一小段高通噪声，尾巴靠下滑的三角波
    click: function () {
      tone(660, 0.055, { type: 'triangle', vol: 0.055, to: 430, atk: 0.002 });
      hiss(0.028, { vol: 0.05, filter: 'highpass', cutoff: 2600 });
    },
    // 拖动分配条时每一格的反馈，比 click 更轻。
    // 时长不能再压：26ms 的实测电平只有设计值的 1/6，小喇叭上基本听不见，
    // 45ms 是既能保持「咔」的干脆、又不会在连拖时糊成一片的下限
    tick: function () {
      tone(1250, 0.045, { type: 'square', vol: 0.03, to: 900, atk: 0.002 });
    },
    // 操作被拒：下行小二度，锯齿波带一点脏
    deny: function () {
      tone(210, 0.17, { type: 'sawtooth', vol: 0.06, to: 130, cutoff: 800 });
      tone(150, 0.13, { type: 'square', vol: 0.028, to: 105, delay: 0.03 });
    },

    // —— 经营 ——
    // 推进一回合：上行两音 + 一小段翻页的噪声
    turn: function () {
      seq([392, 523], { type: 'sine', vol: 0.055, dur: 0.14, step: 0.075 });
      hiss(0.09, { vol: 0.05, cutoff: 2600, to: 800 });
    },
    // 建成设施 / 造火箭：一记闷响 + 金属摩擦 + 一声确认
    build: function () {
      tone(150, 0.26, { type: 'triangle', vol: 0.09, to: 95 });
      hiss(0.22, { vol: 0.09, cutoff: 1800, to: 500 });
      tone(523, 0.18, { type: 'sine', vol: 0.04, delay: 0.1 });
    },
    // 解锁科技：上行三音
    tech: function () {
      duck(0.3, 600);
      seq([523, 784, 1046], { type: 'sine', vol: 0.06, dur: 0.22, step: 0.085 });
    },
    // 成就解锁：比科技更亮更长，末尾一层高频「闪光」
    ach: function () {
      duck(0.34, 900);
      seq([659, 880, 1319, 1760], { type: 'triangle', vol: 0.05, dur: 0.28, step: 0.075 });
      hiss(0.35, { vol: 0.03, filter: 'highpass', cutoff: 5200, delay: 0.05 });
    },
    // 建立新基地：温暖的大三和弦，比成就收敛，是「安顿下来」而不是「赢了」
    arrive: function () {
      duck(0.34, 900);
      seq([392, 523, 659], { type: 'triangle', vol: 0.048, dur: 0.5, step: 0.11, detune: 6 });
      tone(196, 0.7, { type: 'sine', vol: 0.042, atk: 0.02 });
    },
    // 随机事件 / 结算的正负反馈
    good: function () {
      seq([523, 784], { type: 'sine', vol: 0.055, dur: 0.2, step: 0.08 });
    },
    bad: function () {
      seq([330, 247], { type: 'triangle', vol: 0.055, dur: 0.26, step: 0.09 });
    },
    // 告急：饥荒、燃料见底。两声方波，不悦耳是故意的
    alarm: function () {
      tone(880, 0.09, { type: 'square', vol: 0.05, cutoff: 2200 });
      tone(880, 0.09, { type: 'square', vol: 0.05, cutoff: 2200, delay: 0.16 });
    },

    // —— 飞行 ——
    // 点火：低频轰鸣渐强 + 上推的锯齿
    launch: function () {
      duck(0.78, 1100);
      hiss(1.0, { vol: 0.18, atk: 0.06, cutoff: 300, to: 1400 });
      tone(60, 0.9, { type: 'sawtooth', vol: 0.08, to: 150, atk: 0.05, cutoff: 700 });
    },
    // 加速环：上行扫频。拾取类音效不能太满，一趟能碰上十几次
    boost: function () {
      tone(380, 0.26, { type: 'triangle', vol: 0.055, to: 1250, atk: 0.006 });
      hiss(0.2, { vol: 0.032, filter: 'highpass', cutoff: 1800 });
    },
    // 燃料囊：清脆两音
    pick: function () {
      seq([784, 1175], { type: 'sine', vol: 0.06, dur: 0.11, step: 0.055 });
    },
    // 数据晶体：比燃料更高更「叮」，两种拾取要能盲听分辨
    crystal: function () {
      seq([1319, 1976], { type: 'sine', vol: 0.05, dur: 0.2, step: 0.06 });
      tone(2637, 0.42, { type: 'sine', vol: 0.022, atk: 0.003, delay: 0.06 });
    },
    // 撞击但还有护盾：闷响 + 低频冲击
    hit: function () {
      duck(0.42, 400);
      hiss(0.32, { vol: 0.16, cutoff: 900, to: 300 });
      tone(140, 0.3, { type: 'square', vol: 0.08, to: 70, cutoff: 600 });
    },
    // 护盾耗尽：金属被撕开的高频，和 hit 明确区分开。
    // 音量要夹在 hit 与 boom 之间 —— 护盾归零比一次撞击严重，但还没解体
    shield: function () {
      duck(0.5, 700);
      hiss(0.4, { vol: 0.07, filter: 'highpass', cutoff: 3000, to: 900 });
      tone(520, 0.36, { type: 'triangle', vol: 0.05, to: 180 });
    },
    // 解体：全场最响的一声
    boom: function () {
      duck(0.72, 900);
      hiss(0.85, { vol: 0.28, cutoff: 900, to: 180 });
      tone(90, 0.6, { type: 'sawtooth', vol: 0.12, to: 38, cutoff: 500 });
    },
    // 抵达
    win: function () {
      duck(0.45, 1100);
      seq([523, 659, 784, 1047], { type: 'sine', vol: 0.06, dur: 0.3, step: 0.105 });
    },
    // 失败
    fail: function () {
      duck(0.45, 1100);
      seq([420, 340, 262, 196], { type: 'triangle', vol: 0.06, dur: 0.34, step: 0.13 });
    },
    // 引力井把火箭横向拽走：下行低鸣，提示「有东西在拉你」。
    // 调用方必须自己做冷却 —— 这个力是每帧都生效的
    well: function () {
      tone(260, 0.5, { type: 'sine', vol: 0.05, to: 90, cutoff: 600 });
    }
  };
})(window);
