/*
 * defcon — src/audio.js
 * 程序化音效：4 个音全部用 WebAudio 现场合成，不引入任何音频文件。
 *
 * 为什么不用 mp3/wav：
 *   1) 小工具红线禁止外部资源，音频文件要随包走；
 *   2) 本作只需要 5 个一秒以内的短音，采样文件换来的是几百 KB 包体与一次额外解码；
 *   3) 合成音可以按参数变化（DEFCON 越低音越急），这是采样文件做不到的。
 *
 * 为什么默认开启（2026-09-09 改）：
 *   早期默认静音是怕手机外放惊吓，但实测发现玩家根本注意不到顶栏那个小喇叭，
 *   绝大多数人全程无声地打完一局 —— 合成音效是本作演出的一半，等于白做。
 *   现改为默认开启：峰值早已压低（最响的核爆也只到 0.42），惊吓风险可控；
 *   且 AudioContext 必须等用户手势才能出声（自动播放策略），本作的第一声
 *   天然在「选定阵营」的那次点击之后 —— 不存在网页一打开就轰炸外放的情况。
 *   底部指令条的开关仍然一指可达，想静音随时可以关。
 *
 * 自动播放策略：AudioContext 在用户手势之外创建时会停在 suspended，
 * 因此 unlock() 必须从真实点击事件里调用（音效开关按钮 / 开局的阵营选择）。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};

  var ctx = null, master = null, failed = false;
  var enabled = true;   // 默认开启；真正出声仍要等首次手势 unlock()（见文件头自动播放策略）
  // 同一音的最小间隔：战争期一秒内可能有十几次拦截，不去抖就是一片噪音
  var MIN_GAP = { defcon: 0.30, launch: 0.10, intercept: 0.14, nuke: 0.35, deny: 0.20 };
  var lastAt = {};

  function ensure() {
    if (ctx || failed) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { failed = true; ctx = null; }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) {} }
  }

  // 指数衰减包络：attack 段避免爆音，decay 段让它自然收尾
  function envelope(t0, attack, decay, peak) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  }

  function tone(t0, freq, dur, peak, type, freqTo) {
    var o = ctx.createOscillator();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
    var g = envelope(t0, 0.008, dur, peak);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  function noiseSrc(dur) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = ctx.createBufferSource();
    s.buffer = buf;
    return s;
  }

  function filteredNoise(t0, dur, peak, filterType, f0, f1, q) {
    var s = noiseSrc(dur);
    var f = ctx.createBiquadFilter();
    f.type = filterType; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    var g = envelope(t0, 0.01, dur, peak);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur);
  }

  var VOICES = {
    /* DEFCON 跃迁：两声短促告警，等级越低音越高越急 —— 用同一段代码靠参数表达紧张度，
     * 这是采样文件做不到的地方。 */
    defcon: function (t, level) {
      var lv = Math.max(1, Math.min(5, level || 5));
      var base = 380 + (5 - lv) * 95;
      tone(t, base, 0.11, 0.22, 'triangle');
      tone(t + 0.15, base * 1.5, 0.13, 0.20, 'triangle');
    },
    /* 发射：低频推力 + 上扫的气流噪声，模拟导弹离井的那一下 */
    launch: function (t) {
      tone(t, 140, 0.42, 0.20, 'sawtooth', 62);
      filteredNoise(t, 0.45, 0.13, 'bandpass', 320, 1900, 1.2);
    },
    /* 拦截：两声金属质感的高频 ping，与发射的暖低频形成听觉上的区分 */
    intercept: function (t) {
      tone(t, 1450, 0.09, 0.13, 'sine');
      tone(t + 0.05, 2150, 0.08, 0.09, 'sine');
    },
    /* 核爆：55Hz 下潜到 28Hz 的低频轰鸣 + 长尾噪声，是全曲最响的一个音，
     * 峰值刻意压到 0.42 —— 它总是紧跟着一次白闪，听觉上不该抢过视觉。 */
    nuke: function (t) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(58, t);
      o.frequency.exponentialRampToValueAtTime(26, t + 0.9);
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, t);
      lp.frequency.exponentialRampToValueAtTime(70, t + 0.9);
      var g = envelope(t, 0.012, 0.95, 0.42);
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(t); o.stop(t + 1.0);
      filteredNoise(t, 1.1, 0.16, 'lowpass', 900, 120, 0.7);
    },
    // 指令被拒：短促低闷的一声，配合发射条的红色抖动
    deny: function (t) {
      tone(t, 190, 0.13, 0.16, 'square', 120);
    }
  };

  function play(name, arg) {
    if (!enabled) return false;
    var fn = VOICES[name];
    if (!fn) return false;
    var c = ensure();
    if (!c || c.state !== 'running') return false;
    var now = c.currentTime;
    var gap = MIN_GAP[name] || 0;
    if (lastAt[name] != null && now - lastAt[name] < gap) return false;
    lastAt[name] = now;
    try { fn(now + 0.01, arg); } catch (e) { return false; }
    return true;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) unlock();
    return enabled;
  }

  DC.audio = {
    play: play,
    unlock: unlock,
    setEnabled: setEnabled,
    toggle: function () { return setEnabled(!enabled); },
    get enabled() { return enabled; },
    get available() { return !!ensure(); }
  };

})(typeof window !== 'undefined' ? window : globalThis);
