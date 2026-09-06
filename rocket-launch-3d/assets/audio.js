/**
 * 程序化音效系统（Web Audio API，零音频资源文件）。
 *
 * 所有声音均由振荡器与噪声实时合成，不增加任何资源文件与网络请求：
 *   · 发动机隆隆声：布朗噪声 → 低通 + ~34 Hz 次声正弦 + 高空气流嘶声，
 *     增益/滤波随推力与高度实时调制（入真空后自然衰减）；
 *   · 倒计时哔声 / 点火低鸣：短包络正弦/方波；
 *   · 分离闷响：非谐频三角波簇 + 高通噪声脆响 + 低频反冲；
 *   · 入轨提示音：三音上行轻和弦。
 *
 * 浏览器自动播放策略：AudioContext 在首次用户手势时 unlock() 后才出声，
 * 在此之前所有接口静默安全（不会提前创建上下文）。
 */
(function (global) {
  'use strict';
  var M3D = global.M3D || (global.M3D = {});

  function createAudio() {
    var ctx = null, master = null;
    var muted = false, everUnlocked = false;
    // 常驻隆隆声节点（ensure() 时构建一次）
    var rLow = null, rRoar = null, rSub = null, rHiss = null, rLp = null, rBp = null;
    var VOL = 0.9;

    function ensure() {
      if (ctx) return true;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC(); } catch (e) { return false; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(ctx.destination);
      buildRumble();
      return true;
    }

    function noiseBuffer(seconds, brown) {
      var n = Math.floor(ctx.sampleRate * seconds);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = buf.getChannelData(0);
      var last = 0;
      for (var i = 0; i < n; i++) {
        var w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
        else d[i] = w;
      }
      return buf;
    }

    function buildRumble() {
      // 低频隆隆：布朗噪声 → 低通（频率随 brightness 抬升模拟气流变“亮”）
      rLp = ctx.createBiquadFilter();
      rLp.type = 'lowpass'; rLp.frequency.value = 90; rLp.Q.value = 0.4;
      rLow = ctx.createGain(); rLow.gain.value = 0;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2.4, true); src.loop = true;
      src.connect(rLp); rLp.connect(rLow); rLow.connect(master); src.start();
      // 次声体感：~34 Hz 正弦，贴喷口的压迫感
      rSub = ctx.createGain(); rSub.gain.value = 0;
      var sub = ctx.createOscillator();
      sub.type = 'sine'; sub.frequency.value = 34;
      sub.connect(rSub); rSub.connect(master); sub.start();
      // 炽热气流嘶声：白噪声 → 带通，只在高空 brightness 抬升时渗入
      rBp = ctx.createBiquadFilter();
      rBp.type = 'bandpass'; rBp.frequency.value = 750; rBp.Q.value = 0.6;
      rHiss = ctx.createGain(); rHiss.gain.value = 0;
      var hsrc = ctx.createBufferSource();
      hsrc.buffer = noiseBuffer(1.7, false); hsrc.loop = true;
      hsrc.connect(rBp); rBp.connect(rHiss); rHiss.connect(master); hsrc.start();
      // 中频咆哮：布朗噪声 → 带通 ~240 Hz——笔记本/手机扬声器放不出 34~90 Hz
      // 的次声与低频，这一层承载主能量，保证小设备上也能听清发动机声
      rRoar = ctx.createGain(); rRoar.gain.value = 0;
      var roBp = ctx.createBiquadFilter();
      roBp.type = 'bandpass'; roBp.frequency.value = 240; roBp.Q.value = 0.45;
      var rosrc = ctx.createBufferSource();
      rosrc.buffer = noiseBuffer(2.1, true); rosrc.loop = true;
      rosrc.connect(roBp); roBp.connect(rRoar); rRoar.connect(master); rosrc.start();
    }

    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }

    function tone(f, t, a, peak, d, type) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(master);
      env(g, t, a, peak, d);
      o.start(t); o.stop(t + a + d + 0.05);
    }

    function burst(t, dur, freq, peak) {
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(dur + 0.05, false);
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
      var g = ctx.createGain();
      src.connect(f); f.connect(g); g.connect(master);
      env(g, t, 0.004, peak, dur);
      src.start(t); src.stop(t + dur + 0.1);
    }

    return {
      // 首次用户手势时调用：创建/恢复 AudioContext
      unlock: function () {
        if (!ensure()) return;
        everUnlocked = true;
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      },
      suspend: function () { if (ctx && ctx.suspend) ctx.suspend(); },
      resume: function () { if (everUnlocked && ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume(); },
      setMuted: function (m) {
        muted = !!m;
        if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, 0.03);
      },
      isMuted: function () { return muted; },

      // 常驻隆隆声：level 0~1（推力×大气×距离），bright 0~1（高空变“亮”）
      setRumble: function (level, bright) {
        if (!ctx) return;
        var t = ctx.currentTime;
        var lv = Math.max(0, Math.min(1, level));
        var br = Math.max(0, Math.min(1, bright || 0));
        rLow.gain.setTargetAtTime(lv * 1.05, t, 0.09);
        rRoar.gain.setTargetAtTime(lv * 0.62, t, 0.09);
        rSub.gain.setTargetAtTime(lv * 0.7, t, 0.09);
        rHiss.gain.setTargetAtTime(lv * 0.18 * br, t, 0.09);
        rLp.frequency.setTargetAtTime(80 + 260 * br, t, 0.12);
        rBp.frequency.setTargetAtTime(550 + 900 * br, t, 0.12);
      },
      // 立即压低隆隆声（模式切换 / 复位）
      silence: function () {
        if (!ctx) return;
        var t = ctx.currentTime;
        rLow.gain.setTargetAtTime(0, t, 0.05);
        rRoar.gain.setTargetAtTime(0, t, 0.05);
        rSub.gain.setTargetAtTime(0, t, 0.05);
        rHiss.gain.setTargetAtTime(0, t, 0.05);
      },

      // 倒计时哔声 / 点火低鸣
      beep: function (kind) {
        if (!ensure()) return;
        var t = ctx.currentTime;
        if (kind === 'go') {
          tone(520, t, 0.02, 0.26, 0.14, 'square');
          tone(390, t + 0.13, 0.02, 0.26, 0.28, 'square');
        } else {
          tone(980, t, 0.008, 0.2, 0.09, 'sine');
        }
      },
      // 分离闷响：金属部件脱离的反冲（size 0.5~1.2 控制力度）
      clank: function (size) {
        if (!ensure()) return;
        var t = ctx.currentTime, s = size || 1;
        var partials = [620, 950, 1420, 2100];
        for (var i = 0; i < partials.length; i++) {
          var f = partials[i] * (0.92 + Math.random() * 0.16);
          tone(f, t + i * 0.008, 0.004, 0.10 * s * (1 - i * 0.18), 0.16 + Math.random() * 0.1, 'triangle');
        }
        burst(t, 0.10, 1400, 0.20 * s);
        tone(88, t, 0.01, 0.26 * s, 0.20, 'sine');
      },
      // 入轨提示：三音上行轻和弦
      chime: function () {
        if (!ensure()) return;
        var t = ctx.currentTime;
        tone(660, t, 0.02, 0.13, 0.5, 'sine');
        tone(880, t + 0.18, 0.02, 0.11, 0.6, 'sine');
        tone(1320, t + 0.36, 0.02, 0.07, 0.8, 'sine');
      },
      // UI 点击：短促轻快的双击_tick_
      click: function () {
        if (!ensure()) return;
        var t = ctx.currentTime;
        tone(1500, t, 0.003, 0.11, 0.04, 'sine');
        tone(760, t + 0.012, 0.003, 0.06, 0.045, 'sine');
      },
      // 点火按钮按下：两声上行“预备”音
      arm: function () {
        if (!ensure()) return;
        var t = ctx.currentTime;
        tone(560, t, 0.01, 0.17, 0.09, 'square');
        tone(840, t + 0.09, 0.01, 0.17, 0.13, 'square');
      }
    };
  }

  M3D.createAudio = createAudio;
})(typeof window !== 'undefined' ? window : this);
