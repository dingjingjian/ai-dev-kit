/*
 * air-tycoon — src/audio.js
 * 程序化音频：12 个音效 + 三段落 BGM，全部用 WebAudio 现场合成，不引入任何音频文件。
 *
 * 为什么不用 mp3/wav（沿用 defcon 的结论，理由对本作同样成立）：
 *   1) 小工具红线禁止外部资源，音频文件要随包走；
 *   2) 本作只需要十来个一秒以内的短音，采样文件换来的是几百 KB 包体与一次额外解码；
 *   3) 合成音可以按参数变化（客座率越高越明亮、机队越大越厚），采样文件做不到。
 *
 * ── 与 defcon 的关键差异：本作没有「核爆」这类极端低频音 ──────────────
 * defcon 是战争题材，它的音频难题集中在「26~58 Hz 的轰鸣在手机 500~800 Hz 的
 * 频响下限上根本放不出来」，为此折腾了九改（见 defcon/src/audio.js 的完整记录）。
 * air-tycoon 的语义基底是**经营**而非毁灭 —— 最「重」的音是「开辟一条洲际线」
 * 与「季度结算盈利」，它们的能量天然落在 200 Hz 以上，不需要那套低频补偿机制。
 * 因此本作**刻意不移植** octaveFill / nukeBus / duckBgm 这三样：
 *   · 没有哪个音需要「沉到远处」，搬过来只是徒增复杂度；
 *   · BGM 让路（duck）是为核爆那一秒准备的，本作没有等价时刻。
 * 需要低频素材时再引入，且需按 defcon 的五改教训判断「补偿手法要匹配素材类型」。
 *
 * ── 沿用 defcon 的三条硬经验（它们与题材无关）───────────────────────
 *   ① **默认开启**。defcon 实测「默认静音 → 玩家全程无声打完一局，音效白做」。
 *      出声仍受自动播放策略约束：AudioContext 必须在用户手势里 resume()，
 *      本作的第一声天然在「开始经营」那次点击之后。
 *   ② **去抖要叠加而非丢弃**。密集触发时 return false 会得到「越热闹越安静」；
 *      正确做法是升调叠层（最多 MAX_STACK 层）。本作「季度结算」在 4 倍速下
 *      每几秒一次，若直接丢弃会显得节奏断裂。
 *   ③ **压缩器只给音效总线，BGM 单独走一条**。BGM 走压缩器会让它长期处在压缩态，
 *      把该突出的音效反压下去。
 *
 * ── 音效清单（按触发源分三档，与 defcon 同一套分类法）─────────────
 *
 * 【世界事件档】任何一方触发都会响 —— 玩家从声音就知道「世界发生了什么」：
 *   quarter   季度推进        一声沉稳的钟（每个回合都响，所以做得最短最轻）
 *   open      航线开通        上行三音 + 弦乐扫（「网络又长了一条」的仪式感）
 *   upgrade   城市等级提升    明亮的五度上行（**本作核心正反馈** —— 飞轮转起来了）
 *   rival     竞对抢线        低沉的双音下行（被侵入的不适，但不刺耳）
 *   event     事件卡弹出      提示型三连音（中性，好坏由卡片内容决定）
 *   crisis    资金告急        下行的警示音（现金跌破安全线，需立刻反应）
 *
 * 【玩家指令档】只在玩家自己操作时响 —— 让「我做了这件事」有手感：
 *   click     通用点击        35ms 轻响（一局要按几十次，稍厚就成噪音）
 *   confirm   不可逆确认      略重的双击感（开线 / 关线 / 卖机）
 *   deny      指令被拒        短促的双音下坠（资金不足、槽位满）
 *
 * 【结算档】回合结束的仪式感，需要与上面都拉开音色：
 *   profit    结算盈利        温暖的大三和弦上行
 *   loss      结算亏损        柔和的小三度下行（不惩罚，只提醒）
 *   milestone 里程碑          长音 + 泛音（市值/城市数突破阈值）
 *   end      终局              胜负两版（沿用 defcon 的定音长音思路）
 *
 * ── BGM 三段落（按公司规模换段，不是按时间）─────────────────────────
 *   startup   支线起家（< 8 条线）  稀疏、克制，节奏 84 BPM
 *   然后 expand    网络扩张（8~20 条）  加入持续低音与更密的琶音，104 BPM
 *   global    全球巨企（> 20 条，或进入全球前二）  开阔的和弦铺底，120 BPM
 * 为什么按规模换段：本作的成长是**连续量**（航线数、城市等级），
 * 用「规模」当切换判据，音乐推进天然与玩家的成就感同步 —— 这比「按季度」更贴合。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};

  var ctx = null, master = null, comp = null, sfxBus = null, bgmBus = null, failed = false;
  var enabled = true;   // 默认开启，见文件头 ①

  /* 同一音的最小间隔：4 倍速下季度结算可能每几秒一次，不去抖会糊成一片 */
  var MIN_GAP = {
    quarter: 0.45, open: 0.25, upgrade: 0.35, rival: 0.40, event: 0.50, crisis: 1.20,
    click: 0.05, confirm: 0.15, deny: 0.20,
    profit: 0.60, loss: 0.60, milestone: 1.50, end: 2.00
  };
  /* 最小间隔内允许叠加几层（0 = 只响第一声）。终局只响一次，不该叠；
   * 季度钟可以叠成一小串，让快进时有「连打」的推进感。 */
  var MAX_STACK = {
    quarter: 2, open: 2, upgrade: 2, rival: 1, event: 0, crisis: 0,
    click: 1, confirm: 1, deny: 1,
    profit: 1, loss: 1, milestone: 0, end: 0
  };
  var lastAt = {}, stack = {};

  function ensure() {
    if (ctx || failed) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    try {
      ctx = new AC();
      /* 总线：sfxBus → comp → master → destination
       * BGM 单独走 bgmBus → master，**绕过压缩器**（见文件头 ③）。 */
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;    // dB：只削叠加时的尖峰，单音基本不过阈
      comp.knee.value = 10;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;

      master = ctx.createGain();
      master.gain.value = 0.75;

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(comp);
      comp.connect(master);

      bgmBus = ctx.createGain();
      bgmBus.gain.value = 0;         // 由 bgmStart 淡入
      bgmBus.connect(master);

      master.connect(ctx.destination);
    } catch (e) { failed = true; ctx = null; }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) {} }
  }

  /* 指数衰减包络：attack 段避免爆音，decay 段让它自然收尾 */
  function envelope(t0, attack, decay, peak) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  }

  function tone(t0, freq, dur, peak, type, freqTo, bus) {
    var o = ctx.createOscillator();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
    var g = envelope(t0, 0.008, dur, peak);
    o.connect(g); g.connect(bus || sfxBus);
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

  function filteredNoise(t0, dur, peak, filterType, f0, f1, q, bus) {
    var s = noiseSrc(dur);
    var f = ctx.createBiquadFilter();
    f.type = filterType; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    var g = envelope(t0, 0.01, dur, peak);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t0); s.stop(t0 + dur);
  }

  // 叠加层的音高/音量系数
  function M(o) { return (o && o.mul) || 1; }
  function G(o) { return (o && o.gain) || 1; }

  /* ───────────────────────── 音效音色定义 ─────────────────────────
   * 每个音色签名 (o, now)，o = { mul（叠层升调系数）, gain（叠层音量系数） }。
   *
   * 一条贯穿全部音效的设计约束：**只使用 200 Hz 以上的基频**。
   * 手机扬声器低截止在 500~800 Hz，200 Hz 以下基本辐射不出来 ——
   * defcon 为了把 24~196 Hz 的音救回来才做了八度补偿层，本作直接从选音上避开，
   * 不需要那套机制（这也是本作音频能比 defcon 短很多的原因）。 */

  /* 音名 → 频率（A4 = 440）。本作的音效都建立在一组固定音高上，
   * 让「开线 / 升级 / 盈利」听起来像同一个调性里的句子，而不是一堆随机音效。
   * 含低八度音名（D3 等）—— **仅用于 BGM 的低音声部**，音效一律 ≥ 200 Hz（见上）。 */
  var NOTE = {
    D3: 146.83, E3: 164.81, G3: 196.00, A3: 220.00,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98
  };
  /* 升半音用的系数（用来构造调外音，如 F#4 / A#4）——不逐个写频率，
   * 避免和上面的表两处维护。 */
  var SHARP = 1.059463;

  var VOICES = {

    /* 季度推进 —— 一声沉稳的钟。每个回合都响，所以最短最轻（0.22s）。
     * 用 D4 + A4 的纯五度（无三度）→ 中性调性，既不乐观也不悲观，
     * 因为这一声之后可能是盈利也可能是亏损。 */
    quarter: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.D4 * m, 0.22, 0.20 * g, 'sine');
      tone(t0 + 0.005, NOTE.A4 * m, 0.18, 0.11 * g, 'sine');
      // 极短的低通噪声当「按键」的实体感，避免纯正弦显得单薄
      filteredNoise(t0, 0.05, 0.05 * g, 'bandpass', 1800 * m, 900 * m, 1.2);
    },

    /* 航线开通 —— 上行三音 + 弦乐扫。
     * D4→F#4→A4 是大三和弦的分解。（D 大调） */
    open: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.D4 * m, 0.14, 0.16 * g, 'sine');
      tone(t0 + 0.07, NOTE.F4 * SHARP * m, 0.14, 0.16 * g, 'sine');   // F#4
      tone(t0 + 0.14, NOTE.A4 * m, 0.30, 0.18 * g, 'sine');
      // 「弦乐扫」：带通噪声从 800 → 2600 Hz，模拟弓弦起振
      filteredNoise(t0 + 0.10, 0.26, 0.055 * g, 'bandpass', 800 * m, 2600 * m, 2.4);
    },

    /* 城市等级提升 —— 本作核心正反馈（飞轮转起来了）。
     * 明亮的五度上行 A4→E5，加一个高八度泛音让它明显比别的音效「亮」。 */
    upgrade: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.A4 * m, 0.18, 0.17 * g, 'triangle');
      tone(t0 + 0.09, NOTE.E5 * m, 0.34, 0.19 * g, 'triangle');
      tone(t0 + 0.09, NOTE.E6 * m, 0.30, 0.055 * g, 'sine');          // 泛音 → 明亮
      filteredNoise(t0 + 0.06, 0.20, 0.04 * g, 'highpass', 3000 * m, 3000 * m, 1);
    },

    /* 竞对抢线 —— 低沉的双音下行 F4→C4→（不落到更低，避免手机放不出）。
     * 用 minor 感但不刺耳：玩家需要知道「被侵入」，但不该觉得被惩罚。 */
    rival: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.F4 * m, 0.20, 0.15 * g, 'sawtooth');
      tone(t0 + 0.11, NOTE.C4 * m, 0.32, 0.14 * g, 'sawtooth');
      // 并一条低通滤波噪声垫底，给两个锯齿音加一点「质感」，
      // 避免纯锯齿在中高频显得刺耳（经营游戏不该让人紧张到烦躁）。
      filteredNoise(t0, 0.16, 0.035 * g, 'lowpass', 700 * m, 500 * m, 0.8);
    },

    /* 事件卡弹出 —— 提示型三连音，中性。
     * 好坏由卡片内容决定，所以音色本身不做倾向（用纯五度而非大小三度）。 */
    event: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.G4 * m, 0.12, 0.15 * g, 'triangle');
      tone(t0 + 0.09, NOTE.D5 * m, 0.12, 0.15 * g, 'triangle');
      tone(t0 + 0.18, NOTE.G5 * m, 0.26, 0.14 * g, 'triangle');
    },

    /* 资金告急 —— 下行的警示音（现金跌破安全线）。
     * 是本作唯一带「紧张感」的音：用 B4→A#4 的小二度摩擦 + 略快的重复。 */
    crisis: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.B4 * m, 0.16, 0.19 * g, 'square');
      tone(t0 + 0.05, NOTE.A4 * 1.059 * m, 0.22, 0.15 * g, 'square');  // A#4 ≈ A4×1.059
      tone(t0 + 0.26, NOTE.B4 * m, 0.14, 0.16 * g, 'square');
      tone(t0 + 0.31, NOTE.A4 * 1.059 * m, 0.30, 0.13 * g, 'square');
      // 方波的高次谐波很扎耳，压一条中频噪声把它「裹」起来；
      // 这是本作唯一带紧张感的音，但也不能真的吓到玩家。
      filteredNoise(t0, 0.10, 0.03 * g, 'bandpass', 1200 * m, 800 * m, 1.5);
    },

    /* 通用点击 —— 35ms 极轻。一局要按几十次，稍厚就成噪音（defcon 同款结论）。 */
    click: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.C6 * m, 0.035, 0.09 * g, 'sine');
      filteredNoise(t0, 0.02, 0.025 * g, 'highpass', 4000 * m, 4000 * m, 1);
    },

    /* 不可逆确认 —— 略重的双击感（开线 / 关线 / 卖机）。 */
    confirm: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.E5 * m, 0.06, 0.16 * g, 'triangle');
      tone(t0 + 0.04, NOTE.A5 * m, 0.14, 0.17 * g, 'triangle');
    },

    /* 指令被拒 —— 短促的双音下坠（资金不足、槽位满）。 */
    deny: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.A4 * m, 0.07, 0.17 * g, 'triangle', NOTE.E4 * m);
      tone(t0 + 0.02, NOTE.E4 * m, 0.16, 0.14 * g, 'sine', NOTE.C4 * m);
      filteredNoise(t0, 0.06, 0.03 * g, 'bandpass', 600 * m, 400 * m, 1.2);
    },

    /* 结算盈利 —— 温暖的大三和弦上行 F4→A4→C5→F5（F 大调）。 */
    profit: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.F4 * m, 0.16, 0.14 * g, 'sine');
      tone(t0 + 0.08, NOTE.A4 * m, 0.16, 0.14 * g, 'sine');
      tone(t0 + 0.16, NOTE.C5 * m, 0.34, 0.15 * g, 'sine');
      tone(t0 + 0.16, NOTE.F5 * m, 0.36, 0.09 * g, 'sine');
      // 与 open 同族的「弦乐扫」，但从低往高扫 —— 一个季度结束时「翻页」的手感
      filteredNoise(t0, 0.30, 0.04 * g, 'bandpass', 900 * m, 2200 * m, 2.0);
    },

    /* 结算亏损 —— 柔和的下行 D5→B4（**大六度下行**，不是小三度）。
     * 刻意做得比 profit 更轻更短：亏损在经营里是常态，不该每次都被「敲打」。
     * 为什么用大六度：它属于协和音程，听感是「叹息」而不是「责备」——
     * 小三度会带出明确的哀伤色彩，对每季都可能发生的经营性亏损来说过重了。 */
    loss: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.D5 * m, 0.18, 0.12 * g, 'sine');
      tone(t0 + 0.10, NOTE.B4 * m, 0.34, 0.13 * g, 'sine');
    },

    /* 里程碑 —— 长音 + 泛音（市值/城市数突破阈值）。 */
    milestone: function (o) {
      var t0 = ctx.currentTime, m = M(o), g = G(o);
      tone(t0, NOTE.C5 * m, 0.55, 0.16 * g, 'sine');
      tone(t0 + 0.02, NOTE.G5 * m, 0.52, 0.13 * g, 'sine');
      tone(t0 + 0.04, NOTE.C6 * m, 0.50, 0.085 * g, 'sine');
      // 缓慢的带通扫 → 产生「盖子被打开」的开阔感
      filteredNoise(t0, 0.45, 0.05 * g, 'bandpass', 1200 * m, 3400 * m, 1.8);
    },

    /* 终局 —— 胜负两版（沿用 defcon 的定音长音思路）。
     * 胜：大三和弦持续 + 上行泛音；负：纯五度下行收束，不悲鸣。 */
    end: function (o, win) {
      var t0 = ctx.currentTime, g = G(o);
      if (win) {
        tone(t0, NOTE.C5, 1.10, 0.20 * g, 'sine');
        tone(t0 + 0.02, NOTE.E5, 1.05, 0.16 * g, 'sine');
        tone(t0 + 0.04, NOTE.G5, 1.00, 0.13 * g, 'sine');
        tone(t0 + 0.42, NOTE.C6, 0.75, 0.10 * g, 'sine');
      } else {
        // 负局：A4→E4→C4 缓慢下行收束，音量更轻，不做悲鸣
        tone(t0, NOTE.A4, 0.55, 0.16 * g, 'sine');
        tone(t0 + 0.30, NOTE.E4, 0.70, 0.14 * g, 'sine');
        tone(t0 + 0.62, NOTE.C4, 1.10, 0.12 * g, 'sine');
      }
    }
  };

  /* 播放入口。name 见 VOICES；opts.win 只对 end 生效。 */
  function play(name, opts) {
    var v = VOICES[name];
    if (!v || !enabled) return false;
    var c = ensure();
    if (!c || c.state !== 'running') return false;

    var now = c.currentTime;
    var gap = MIN_GAP[name] || 0;
    var win = !!(opts && opts.win);
    if (lastAt[name] != null && now - lastAt[name] < gap) {
      // 最小间隔内：叠层（升调 + 略降音量），而不是丢弃 —— 见文件头 ②
      var maxStack = MAX_STACK[name] || 0;
      var used = stack[name] || 0;
      if (used >= maxStack) return false;
      stack[name] = used + 1;
      var mul = Math.pow(1.035, used + 1);     // 每叠一层升约 3.5%（略小于半音）
      v({ mul: mul, gain: 1 - 0.18 * (used + 1) }, win);
    } else {
      stack[name] = 0;
      v({ mul: 1, gain: 1 }, win);
    }
    lastAt[name] = now;
    return true;
  }

  /* ═══════════════════════ BGM（三段落） ═══════════════════════
   * 为什么本作 BGM 比 defcon 简单得多：
   *   defcon 要在「危机升级」这个连续量上做张力，所以有 BPM 随 DEFCON 加快、
   *   调性随危机下沉等机制。本作的情绪是**稳步向上**（从 1 架小飞机到全球巨企），
   *   所以三个段落是同一个调性（D 大调）上的**逐层加法**：
   *     startup 只有稀疏的琶音；expand 加入持续低音与更密琶音；global 加入和弦铺底。
   *   层面叠加而不是换曲，听感上就是「同一支曲子越走越开阔」——
   *   与「公司越来越大」这件事同构。
   *
   * 实现：不用 setInterval 排程（后台会被节流），而是从 rAF 里调 bgmPump()，
   *   每次用 currentTime 判断「下一个音该不该排」——音序器 lookahead 的简化版。
   *   lookahead 取 0.25s：足够跨过一帧的抖动，又不会在切换段落时积压太多音符。
   */
  var bgm = {
    playing: false, cue: null, step: 0, nextAt: 0, bpm: 84
  };
  var LOOKAHEAD = 0.25;

  /* 三段落定义。每个段落 = 一个 16 步的循环，用音名数组描述。
   * null = 该步不发音。
   * D 大调：D E F# G A B C#。这里用到的都是调内音。 */
  var CUES = {
    /* 支线起家：稀疏、克制。只有琶音，每两拍一个音。 */
    startup: {
      bpm: 84,
      arp: ['D4', null, 'A4', null, 'F4', null, 'A4', null,
            'D4', null, 'A4', null, 'G4', null, 'E4', null],
      bass: [null, null, null, null, null, null, null, null,
             null, null, null, null, null, null, null, null],
      pad: false
    },
    /* 网络扩张：加持续低音 + 更密琶音。 */
    expand: {
      bpm: 104,
      arp: ['D4', 'A4', 'D5', 'A4', 'F4', 'A4', 'D5', 'F5',
            'D4', 'A4', 'D5', 'A4', 'G4', 'B4', 'D5', 'G5'],
      bass: ['D3', null, null, null, 'G3', null, null, null,
             'D3', null, null, null, 'A3', null, null, null],
      pad: false
    },
    /* 全球巨企：开阔的和弦铺底。 */
    global: {
      bpm: 120,
      arp: ['D5', 'F5', 'A5', 'D6', 'A4', 'D5', 'F5', 'A5',
            'G4', 'B4', 'D5', 'G5', 'A4', 'C5', 'E5', 'A5'],
      bass: ['D3', null, null, null, 'G3', null, null, null,
             'D3', null, null, null, 'A3', null, null, null],
      pad: true
    }
  };

  function bgmStart() {
    var c = ensure();
    if (!c) return false;
    bgm.playing = true;
    bgm.step = 0;
    bgm.nextAt = c.currentTime + 0.1;
    try {
      bgmBus.gain.cancelScheduledValues(c.currentTime);
      bgmBus.gain.setValueAtTime(Math.max(0.0001, bgmBus.gain.value), c.currentTime);
      bgmBus.gain.linearRampToValueAtTime(0.16, c.currentTime + 1.6);   // 缓入 1.6s
    } catch (e) {}
    return true;
  }

  function bgmStop() {
    var c = ctx;
    bgm.playing = false;
    if (!c || !bgmBus) return;
    try {
      bgmBus.gain.cancelScheduledValues(c.currentTime);
      bgmBus.gain.setValueAtTime(Math.max(0.0001, bgmBus.gain.value), c.currentTime);
      bgmBus.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.5);
    } catch (e) {}
  }

  /* 换段：外部按公司规模决定该用哪个 cue。
   * 已在播同一段时不打断（否则每帧调用会不断重置音序）。 */
  function bgmSetCue(cue) {
    if (!CUES[cue] || bgm.cue === cue) return;
    bgm.cue = cue;
    bgm.bpm = CUES[cue].bpm;
    // 换段时把步进对齐到 0，但**不重置 nextAt** —— 保留当前节奏位置，
    // 让换段听起来像「同一支曲子变了配器」而不是「重开一首」。
  }

  /* 音序器：由 game.js 的 rAF 每帧调用。
   * 注意 lastAt 只用于音效去抖，BGM 不参与 —— BGM 自身有 step 节拍。 */
  function bgmPump() {
    if (!bgm.playing || !bgm.cue) return;
    var c = ctx;
    if (!c || c.state !== 'running') return;
    var cue = CUES[bgm.cue];
    var stepDur = 60 / cue.bpm / 4;          // 16 分音符时长
    var now = c.currentTime;
    var guard = 0;
    while (bgm.nextAt < now + LOOKAHEAD && guard++ < 32) {
      var i = bgm.step % 16;
      var t = bgm.nextAt;
      var n = cue.arp[i];
      if (n && NOTE[n]) {
        // 琶音：三角波，短促。音量随段落递增（global 最饱满）
        tone(t, NOTE[n], stepDur * 1.6, bgm.cue === 'global' ? 0.055 : 0.045, 'triangle', null, bgmBus);
      }
      var b = cue.bass[i];
      if (b && NOTE[b]) {
        tone(t, NOTE[b], stepDur * 3.4, 0.05, 'sine', null, bgmBus);
      }
      if (cue.pad && i === 0) {
        // 和弦铺底：D4 + A4 的纯五度，持续 4 拍
        tone(t, NOTE.D4, stepDur * 15, 0.028, 'sine', null, bgmBus);
        tone(t, NOTE.A4, stepDur * 15, 0.022, 'sine', null, bgmBus);
      }
      bgm.nextAt += stepDur;
      bgm.step++;
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) { unlock(); }
    else if (ctx && bgmBus) {
      try {
        bgmBus.gain.cancelScheduledValues(ctx.currentTime);
        bgmBus.gain.setValueAtTime(0.0001, ctx.currentTime);
      } catch (e) {}
    }
    return enabled;
  }

  AT.audio = {
    play: play,
    unlock: unlock,
    setEnabled: setEnabled,
    toggle: function () { return setEnabled(!enabled); },
    pump: bgmPump,               // 主循环每帧调用（音序器）
    setCue: bgmSetCue,           // 按公司规模换段
    get enabled() { return enabled; },
    get available() { return !!ensure(); },
    bgm: {
      start: bgmStart, stop: bgmStop,
      get playing() { return bgm.playing; },
      get cue() { return bgm.cue; },
      get bpm() { return bgm.bpm; }
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
