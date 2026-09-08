// 星航者 · 程序化 BGM
// 与音效同一条路线：Web Audio 实时合成，不加载任何音频文件。
// 结构：一个持续运行的音乐时钟（BPM + 和弦步进）驱动五条可独立调音量的层
// （pad / bass / arp / bell / perc），场景切换只改各层音量与和声，不重启时钟，
// 因此基地 → 设计 → 飞行之间的过渡是交叉淡变，不会咔哒一下切断。
(function (global) {
  'use strict';

  var SV = global.SV;

  var dead = false;      // 环境不支持 Web Audio → 永久静默，不打扰玩法
  var on = true;         // 用户开关（存进存档）
  var visible = true;
  var A = null;          // AudioContext，与音效共用同一个（见 SV.sfx._ac）

  var master = null, duckG = null, comp = null, bus = null, conv = null, convG = null;
  var L = null;          // 各层输出 gain
  var nb = null;         // 复用的白噪声 buffer

  var timer = null, running = false, stopping = false, resumeAt = 0, fails = 0;
  var step = -1, nextT = 0, chordI = -1;
  var want = null, cur = null, pending = null;

  var TICK = 26;         // 调度器心跳（ms）
  var LOOK = 0.16;       // 提前调度窗口（s）
  var VOL = 0.42;        // BGM 总线音量（音效该盖得住它）

  // ------------------------------------------------------------
  // 音乐素材
  // ------------------------------------------------------------
  var LAYERS = ['pad', 'bass', 'arp', 'bell', 'perc'];
  // 各层送进混响的量：垫子和铃给得多，鼓组几乎不送，免得糊掉
  var SENDV = { pad: 0.55, bass: 0.06, arp: 0.26, bell: 0.8, perc: 0.09 };

  var IV = {
    min: [0, 3, 7], maj: [0, 4, 7],
    min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    sus2: [0, 2, 7], sus4: [0, 5, 7],
    min9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
    add9: [0, 4, 7, 14]
  };
  var SCALE = [0, 2, 3, 5, 7, 8, 10];       // A 自然小调
  function ch(r, t) { return { r: r, t: t }; }

  // 根音统一取 A（midi 57）。r 是相对 A 的半音偏移，方便直接看出色彩：
  // 0=A  -2=G  -4=F  -5=E  3=C  5=D  10=G(上八度下方)
  var SCENES = {
    // 标题页：极慢、极宽，只有垫子和偶尔一颗铃
    menu: {
      bpm: 66, root: 57,
      prog: [ch(-4, 'maj7'), ch(0, 'min9'), ch(3, 'sus2'), ch(-2, 'maj7')],
      mix: { pad: 0.30, bass: 0.09, arp: 0.025, bell: 0.11, perc: 0 },
      arp: 8, bellP: 0.55
    },
    // 基地运营：温暖的循环，别抢注意力——玩家在读数字
    base: {
      bpm: 74, root: 57,
      prog: [ch(0, 'min7'), ch(3, 'maj7'), ch(-4, 'maj7'), ch(5, 'min7')],
      mix: { pad: 0.26, bass: 0.15, arp: 0.05, bell: 0.10, perc: 0.05 },
      arp: 8, bellP: 0.5,
      perc: { kick: 'x.......x.......', hat: '....o.......o...' }
    },
    // 装配车间：八分音符琶音 + 细碎的镲，像在手上有活干
    design: {
      bpm: 82, root: 57,
      prog: [ch(0, 'min7'), ch(10, 'sus4'), ch(-4, 'maj7'), ch(5, 'min7')],
      mix: { pad: 0.20, bass: 0.18, arp: 0.12, bell: 0.05, perc: 0.10 },
      arp: 4, arpSeq: [0, 1, 2, 1, 3, 2], bellP: 0.3,
      perc: { kick: 'x.....x.........', hat: '..o...o...o...o.' }
    },
    // 发射前：下行进行 + 心跳鼓，一路往下压
    launch: {
      bpm: 88, root: 57,
      prog: [ch(0, 'min'), ch(-2, 'maj'), ch(-4, 'maj'), ch(-5, 'maj')],
      mix: { pad: 0.24, bass: 0.24, arp: 0.07, bell: 0, perc: 0.14 },
      arp: 4, arpSeq: [0, 0, 1, 2],
      perc: { kick: 'x...x...x..xx...', hat: 'o.o.o.o.o.o.o.o.' }
    },
    // 飞行关卡：四踩底鼓 + 八分琶音，速度感靠密度而不是乱加速
    flight: {
      bpm: 106, root: 57,
      prog: [ch(0, 'min7'), ch(-4, 'maj'), ch(3, 'maj'), ch(10, 'maj')],
      mix: { pad: 0.16, bass: 0.26, arp: 0.15, bell: 0.03, perc: 0.20 },
      arp: 2, arpSeq: [0, 1, 2, 4, 3, 2, 1, 2], bellP: 0.22,
      perc: {
        kick: 'x...x...x...x...',
        hat: '..o...o...o...o.',
        snare: '....x.......x...'
      }
    },
    // 档案 / 日志页：安静一点，让人读得进去
    log: {
      bpm: 70, root: 57,
      prog: [ch(-4, 'maj7'), ch(0, 'min7'), ch(5, 'min7'), ch(3, 'sus2')],
      mix: { pad: 0.26, bass: 0.11, arp: 0.04, bell: 0.09, perc: 0 },
      arp: 8, bellP: 0.45
    },
    // 抵达 / 结局：转大调色彩，往上走
    win: {
      bpm: 78, root: 57,
      prog: [ch(3, 'maj7'), ch(5, 'min7'), ch(-4, 'maj7'), ch(0, 'min9')],
      mix: { pad: 0.30, bass: 0.13, arp: 0.11, bell: 0.17, perc: 0.06 },
      arp: 4, arpSeq: [0, 1, 2, 3], bellP: 0.7,
      perc: { kick: 'x.......x.......', hat: '....o.......o...' }
    }
  };

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ------------------------------------------------------------
  // 音色
  // ------------------------------------------------------------
  // 和声垫：每个音两个失谐振荡器 + 上八度正弦提亮，慢起慢落
  function pad(notes, t, dur) {
    var f = A.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(620, t);
    f.frequency.linearRampToValueAtTime(1450, t + dur * 0.55);
    f.frequency.linearRampToValueAtTime(700, t + dur);

    var g = A.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.15, t + Math.min(1.4, dur * 0.4));
    g.gain.linearRampToValueAtTime(0.10, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
    f.connect(g); g.connect(L.pad);

    var stop = t + dur + 1.0;
    for (var i = 0; i < notes.length; i++) {
      var fr = mtof(notes[i]);
      var o1 = A.createOscillator(); o1.type = 'triangle';
      o1.frequency.value = fr; o1.detune.value = -7;
      var o2 = A.createOscillator(); o2.type = 'sine';
      o2.frequency.value = fr * 2; o2.detune.value = 6;
      var g2 = A.createGain(); g2.gain.value = 0.28;
      o1.connect(f); o2.connect(g2); g2.connect(f);
      o1.start(t); o2.start(t);
      o1.stop(stop); o2.stop(stop);
    }
  }

  function bass(m, t, dur) {
    var o = A.createOscillator(); o.type = 'triangle';
    o.frequency.value = mtof(m);
    var o2 = A.createOscillator(); o2.type = 'sine';
    o2.frequency.value = mtof(m + 12);
    var g2 = A.createGain(); g2.gain.value = 0.22;

    var f = A.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.9;

    var g = A.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(L.bass);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function arp(m, t) {
    var o = A.createOscillator(); o.type = 'triangle';
    o.frequency.value = mtof(m);
    var f = A.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2600;
    var g = A.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(f); f.connect(g); g.connect(L.arp);
    o.start(t); o.stop(t + 0.3);
  }

  // 铃：基频 + 两个泛音，长尾，重混响
  function bell(m, t) {
    var parts = [[1, 0.5], [2.01, 0.2], [3.02, 0.085]];
    for (var i = 0; i < parts.length; i++) {
      var o = A.createOscillator(); o.type = 'sine';
      o.frequency.value = mtof(m) * parts[i][0];
      var g = A.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(parts[i][1], t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5 + i * 0.35);
      o.connect(g); g.connect(L.bell);
      o.start(t); o.stop(t + 1.9 + i * 0.35);
    }
  }

  function kick(t, v) {
    var o = A.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(148, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    var g = A.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(L.perc);
    o.start(t); o.stop(t + 0.34);
  }

  function hat(t, v) {
    var s = A.createBufferSource(); s.buffer = nb;
    var f = A.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7200;
    var g = A.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    s.connect(f); f.connect(g); g.connect(L.perc);
    s.start(t); s.stop(t + 0.09);
  }

  function snare(t, v) {
    var s = A.createBufferSource(); s.buffer = nb;
    var f = A.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    var g = A.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(f); f.connect(g); g.connect(L.perc);
    s.start(t); s.stop(t + 0.22);

    var o = A.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    var og = A.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(v * 0.45, t + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og); og.connect(L.perc);
    o.start(t); o.stop(t + 0.15);
  }

  // ------------------------------------------------------------
  // 音频图
  // ------------------------------------------------------------
  function mkNoise() {
    var len = Math.floor(A.sampleRate * 0.4);
    var b = A.createBuffer(1, len, A.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // 程序化混响冲激响应：噪声 × 衰减包络，再过一道简易低通，
  // 免得高频尾巴刺耳——太空场景要的是"远"，不是"亮"。
  function mkIR(sec, decay) {
    var len = Math.floor(A.sampleRate * sec);
    var b = A.createBuffer(2, len, A.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), prev = 0;
      for (var i = 0; i < len; i++) {
        var v = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        prev = prev * 0.62 + v * 0.38;
        d[i] = prev;
      }
    }
    return b;
  }

  // 建一个可选节点：WebView 的 Web Audio 实现经常是残缺的（缺混响 / 缺压限器），
  // 缺哪个就把哪个退成直通，绝不能因为一个可选节点把整条 BGM 判死。
  function mk(kind, setup) {
    try {
      var f = A[kind];
      if (typeof f !== 'function') return null;
      var n = f.call(A);
      if (!n) return null;
      if (setup) setup(n);
      return n;
    } catch (e) { return null; }
  }

  function build() {
    master = A.createGain(); master.gain.value = 0.0001;
    // 注意：标准 API 是 createDynamicsCompressor，没有 createCompressor 这个名字。
    // 写错会得到 undefined，随后整条 BGM 永久静默——踩过一次。
    comp = mk('createDynamicsCompressor', function (c) {
      c.threshold.value = -16; c.knee.value = 22; c.ratio.value = 3.2;
      c.attack.value = 0.006; c.release.value = 0.25;
    });
    if (!comp) { comp = A.createGain(); comp.gain.value = 1; }   // 退化：不压限，靠 VOL 留余量
    duckG = A.createGain(); duckG.gain.value = 1;
    bus = A.createGain(); bus.gain.value = 1;
    conv = mk('createConvolver', function (c) { c.buffer = mkIR(2.6, 2.4); });
    convG = A.createGain(); convG.gain.value = 0.9;

    bus.connect(duckG);
    if (conv) { conv.connect(convG); convG.connect(duckG); }
    duckG.connect(comp); comp.connect(master);
    master.connect(A.destination);

    L = {};
    for (var i = 0; i < LAYERS.length; i++) {
      var n = LAYERS[i];
      var g = A.createGain();
      g.gain.value = 0.0001;                 // 音量全部由场景 mix 推上来
      g.connect(bus);
      if (conv) {                            // 没有混响就别建 send，免得白造节点
        var s = A.createGain();
        s.gain.value = SENDV[n];
        g.connect(s); s.connect(conv);
      }
      L[n] = g;
    }
    nb = mkNoise();
  }

  // ------------------------------------------------------------
  // 调度
  // ------------------------------------------------------------
  function stepDur() { return 60 / (cur ? cur.bpm : 80) / 4; }

  function applyMix(sc, fade) {
    var t = A.currentTime, f = fade || 0.75;
    for (var i = 0; i < LAYERS.length; i++) {
      var n = LAYERS[i], g = L[n].gain;
      var v = Math.max(0.0001, sc.mix[n] || 0);
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      if (f <= 0) g.setValueAtTime(v, t);
      else g.linearRampToValueAtTime(v, t + f);
    }
  }

  function applyPending() {
    cur = pending; pending = null;
    // 归到小节头：下一拍就是新和弦的第一拍，切场景不用等完一整小节
    step = -1; chordI = -1;
    applyMix(cur, 0.75);
  }

  function schedule(s, t) {
    var sc = cur; if (!sc) return;
    var b = s % 16;
    var sd = stepDur();
    var barLen = sd * 16;
    var c, iv, notes, i;

    if (b === 0) {
      chordI = (chordI + 1) % sc.prog.length;
      c = sc.prog[chordI];
      iv = IV[c.t] || IV.min;
      notes = [];
      for (i = 0; i < iv.length; i++) notes.push(sc.root + c.r + iv[i]);
      pad(notes, t, barLen);
      bass(sc.root + c.r - 24, t, barLen * 0.46);

      if (sc.bellP && Math.random() < sc.bellP) {
        var deg = SCALE[(Math.random() * SCALE.length) | 0];
        var up = Math.random() < 0.28 ? 12 : 0;
        bell(sc.root + 12 + deg + up, t + sd * (2 + ((Math.random() * 10) | 0)));
      }
    }

    // 第 3 拍补一记低音，让循环有走动感
    if (b === 8) {
      c = sc.prog[chordI];
      bass(sc.root + c.r - 24 + (Math.random() < 0.35 ? 7 : 0), t, barLen * 0.4);
    }

    if (sc.arp && b % sc.arp === 0) {
      var seq = sc.arpSeq || [0, 1, 2, 3];
      c = sc.prog[chordI];
      iv = IV[c.t] || IV.min;
      var idx = seq[((s / sc.arp) | 0) % seq.length];
      var n = sc.root + 12 + c.r +
        iv[idx % iv.length] + Math.floor(idx / iv.length) * 12;
      arp(n, t);
    }

    if (sc.perc) {
      var p = sc.perc, k;
      if (p.kick) { k = p.kick.charAt(b); if (k === 'x') kick(t, 0.62); else if (k === 'o') kick(t, 0.34); }
      if (p.hat) { k = p.hat.charAt(b); if (k === 'x') hat(t, 0.16); else if (k === 'o') hat(t, 0.09); }
      if (p.snare) { k = p.snare.charAt(b); if (k === 'x') snare(t, 0.3); else if (k === 'o') snare(t, 0.18); }
    }
  }

  function tick() {
    // stopping：正在淡出，已排下的音符让它自然收尾，但不再排新的
    if (dead || !A || !running || stopping) return;
    try {
      if (A.state !== 'running') {
        // 上下文被浏览器挂起（自动播放策略 / 后台）时时钟不前进，别空转。
        // 但也不能就此放弃：每 0.8s 重试一次 resume，等用户下一次交互放行后能自己接上。
        var ms = global.Date.now();
        if (ms - resumeAt > 800) {
          resumeAt = ms;
          try { var p = A.resume(); if (p && p.catch) p.catch(function () {}); } catch (e2) {}
        }
        return;
      }
      var t = A.currentTime;
      if (nextT < t) nextT = t + 0.03;     // 从后台切回来时重新对齐
      var guard = 0;
      while (nextT < t + LOOK && guard++ < 48) {
        if (pending) applyPending();
        step++;
        schedule(step, nextT);
        nextT += stepDur();
      }
    } catch (e) { /* 排程异常不该影响游戏 */ }
  }

  function startTimer() {
    if (timer) return;
    running = true;
    nextT = A.currentTime + 0.08;
    step = -1; chordI = -1;
    timer = global.setInterval(tick, TICK);
  }

  function stopTimer() {
    running = false; stopping = false;
    if (timer) { global.clearInterval(timer); timer = null; }
  }

  // ------------------------------------------------------------
  // 对外
  // ------------------------------------------------------------
  var B = {};

  B.setScene = function (key) {
    var sc = SCENES[key] || SCENES.base;
    if (sc === want) return;
    want = sc;
    if (running) pending = sc;   // 正在播 → 下一拍在小节头交叉淡入
    else cur = sc;               // 没在播 → 记下来，起播时直接用
  };
  B.curScene = function () { return want; };

  // 必须在用户手势里调用：建立（或复用）AudioContext
  B.unlock = function () {
    if (dead) return false;
    if (!A) {
      try { A = (SV.sfx && SV.sfx._ac) ? SV.sfx._ac() : null; } catch (e) { A = null; }
      if (!A) {
        try {
          var C = global.AudioContext || global.webkitAudioContext;
          if (!C) { dead = true; return false; }
          A = new C();
        } catch (e2) { dead = true; A = null; return false; }
      }
      try { build(); } catch (e3) {
        // 建图失败可能是环境一时的状态，清掉上下文让下一次手势重来；
        // 连续三次都不成才判定为「这环境放不了」，避免每次点击都重建一遍。
        A = null;
        if (++fails >= 3) dead = true;
        return false;
      }
      fails = 0;
    }
    try { if (A.state === 'suspended') A.resume(); } catch (e4) {}
    return true;
  };

  B.play = function (key) {
    if (key) B.setScene(key);
    if (!on || dead || !visible) return;
    if (!B.unlock()) return;
    if (running && !stopping) return;
    try {
      var fading = running;            // 淡出途中被重新打开 → 直接接回去，不重启时钟
      stopping = false;
      cur = want || SCENES.base;
      applyMix(cur, 0);
      master.gain.cancelScheduledValues(A.currentTime);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), A.currentTime);
      master.gain.linearRampToValueAtTime(VOL, A.currentTime + (fading ? 0.4 : 1.4));
      if (!running) startTimer();
    } catch (e) {}
  };

  B.stop = function () {
    if (!A || dead) return;
    stopping = true;
    try {
      var t = A.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    } catch (e) {}
    global.setTimeout(function () { if (!on || stopping) stopTimer(); }, 560);
  };

  B.setEnabled = function (v) {
    on = !!v;
    if (on) B.play(); else B.stop();
  };
  B.isEnabled = function () { return on; };
  B.isPlaying = function () { return running && !stopping; };

  // 大音效（发射 / 爆炸 / 结算）时把 BGM 压下去，让音效透出来
  B.duck = function (amt, ms) {
    if (!A || dead || !running || !on) return;
    try {
      var t = A.currentTime, d = (ms || 500) / 1000;
      var g = duckG.gain;
      var low = Math.max(0.06, 1 - (amt == null ? 0.6 : amt));
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(low, t + 0.05);
      g.linearRampToValueAtTime(1, t + d);
    } catch (e) {}
  };

  // 切到后台：浏览器会节流定时器，与其让排程错乱不如停掉
  B.suspend = function () {
    visible = false;
    if (!A || dead || !running) return;
    try {
      master.gain.cancelScheduledValues(A.currentTime);
      master.gain.setValueAtTime(master.gain.value, A.currentTime);
      master.gain.linearRampToValueAtTime(0.0001, A.currentTime + 0.2);
    } catch (e) {}
    var tk = timer; timer = null; running = false;
    if (tk) global.clearInterval(tk);
  };

  B.resume = function () {
    visible = true;
    if (!on || dead || !A || running) return;
    stopping = false;
    try {
      if (A.state === 'suspended') A.resume();
      cur = want || cur;
      applyMix(cur, 0);
      master.gain.cancelScheduledValues(A.currentTime);
      master.gain.setValueAtTime(0.0001, A.currentTime);
      master.gain.linearRampToValueAtTime(VOL, A.currentTime + 0.6);
      startTimer();
    } catch (e) {}
  };

  want = SCENES.menu;
  cur = SCENES.menu;

  SV.bgm = B;
})(window);
