/*
 * defcon — src/audio.js
 * 程序化音频：8 个音效，全部用 WebAudio 现场合成，不引入任何音频文件。
 *
 * 为什么不用 mp3/wav：
 *   1) 小工具红线禁止外部资源，音频文件要随包走；
 *   2) 本作只需要十来个一秒以内的短音，采样文件换来的是几百 KB 包体与一次额外解码；
 *   3) 合成音可以按参数变化（DEFCON 越低音越急），这是采样文件做不到的。
 *
 * 为什么默认开启（2026-09-09 改）：
 *   早期默认静音是怕手机外放惊吓，但实测发现玩家根本注意不到顶栏那个小喇叭，
 *   绝大多数人全程无声地打完一局 —— 合成音效是本作演出的一半，等于白做。
 *   现改为默认开启；且 AudioContext 必须等用户手势才能出声（自动播放策略），本作的第一声
 *   天然在「选定阵营」的那次点击之后 —— 不存在网页一打开就轰炸外放的情况。
 *   底部指令条的开关仍然一指可达，想静音随时可以关。
 *
 * 自动播放策略：AudioContext 在用户手势之外创建时会停在 suspended，
 * 因此 unlock() 必须从真实点击事件里调用（音效开关按钮 / 开局的阵营选择）。
 *
 * ── 2026-09-10 响度重做 ────────────────────────────────────────────────
 * 旧版实测「偏弱」，三个原因叠加，只调音量治不好：
 *
 *   (1) 电平保守 —— 各音峰值 0.09~0.42 再乘 master 0.5，实际出声只有 0.065~0.21，
 *       比常规游戏音效（0.5~0.8）低约 12~14 dB。现改为 master 0.8 + 峰值上调。
 *
 *   (2) 频谱错位 —— 核爆（nuke）原本的能量全压在 26~58 Hz，而手机扬声器的频响下限
 *       普遍在 500~800 Hz，这个频段物理上就放不出来：音量开到最大只会破音，不会更震撼。
 *       补一层中低频噪声体能解决，但补过头会毁音色（见 nuke 注释里的二改记录）：
 *       第一版补到 2600 Hz 又加了高频瞬态，实测把核爆做成了鞭炮，已回退。
 *       正确做法是补 200~800 Hz 这一段，亮度一律不加。
 *
 *   (3) 去抖吞音 —— 旧版在最小间隔内直接 return false 丢弃。战争期一秒内十几次拦截，
 *       绝大部分被丢掉，结果是「越热闹越安静」。现改为叠加升调：密集触发时不再丢弃，
 *       而是升高音高、略降音量，最多叠 MAX_STACK 层 —— 越密越急，符合直觉。
 *
 * 另加总线压缩器（DynamicsCompressor）：齐射落地时四五个音同时响，
 * 没有压缩器就只能靠压低单音避免削波（这正是旧版保守的根因），
 * 有了压缩器才敢把单音峰值提上来。
 *
 * 不做 BGM / 持续底噪（2026-09-10 试过一版「DEFCON 联动 drone」后移除）：
 *   程序化合成做不出编曲层次，无旋律的 drone 虽然在技术上成立，但实测下来
 *   它挤占的是音效的听觉空间，而本作的紧张感已经由 DEFCON 跃迁告警与核爆承担。
 *   氛围表达一律用离散音效，不用持续声。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};

  var ctx = null, master = null, comp = null, sfxBus = null, failed = false;
  var enabled = true;   // 默认开启；真正出声仍要等首次手势 unlock()（见文件头自动播放策略）

  // 同一音的最小间隔：战争期一秒内可能有十几次拦截，不去抖就是一片噪音
  var MIN_GAP = {
    defcon: 0.30, launch: 0.10, intercept: 0.12, nuke: 0.35, deny: 0.20,
    select: 0.07, cityLost: 0.45, end: 2.00, tap: 0.05, pick: 0.08
  };
  // 最小间隔内允许叠加几层（0 = 只响第一声）。终局音不叠，拦截可以叠成一小串上行 ping。
  var MAX_STACK = {
    defcon: 1, launch: 2, intercept: 3, nuke: 2, deny: 1,
    select: 2, cityLost: 1, end: 0, tap: 1, pick: 1
  };
  var lastAt = {}, stack = {};

  function ensure() {
    if (ctx || failed) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    try {
      ctx = new AC();
      /* 总线：sfxBus → comp → master → destination */
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;    // dB：只削齐射叠加时的尖峰，单音基本不过阈
      comp.knee.value = 10;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;

      master = ctx.createGain();
      master.gain.value = 0.8;

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;

      sfxBus.connect(comp);
      comp.connect(master);
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
    o.connect(g); g.connect(sfxBus);
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
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    var g = envelope(t0, 0.01, dur, peak);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t0); s.stop(t0 + dur);
  }

  // 叠加层的音高/音量系数
  function M(o) { return (o && o.mul) || 1; }
  function G(o) { return (o && o.gain) || 1; }

  var VOICES = {
    /* DEFCON 跃迁：两声短促告警，等级越低音越高越急 —— 用同一段代码靠参数表达紧张度，
     * 这是采样文件做不到的地方。 */
    defcon: function (t, level, o) {
      var lv = Math.max(1, Math.min(5, level || 5));
      var base = (380 + (5 - lv) * 95) * M(o);
      tone(t, base, 0.11, 0.50 * G(o), 'triangle');
      tone(t + 0.15, base * 1.5, 0.13, 0.44 * G(o), 'triangle');
    },
    /* 发射：点火爆燃 + 上升的推力轰鸣 + 离场尾音。
     * 旧版是「锯齿波 140→62 Hz 下滑」，实测像放屁 —— 三个毛病叠在一起：
     *   ① 下滑音高 = 泄气，推力该是「起来」；
     *   ② 锯齿波在 60~140 Hz 的密集谐波正好落在人耳判定「噪声/屁声」的频段；
     *   ③ 火箭是宽带噪声，不该用乐音当主体。
     * 改法：音高改上升（62→150），锯齿换正弦，主体交给噪声。 */
    launch: function (t, _a, o) {
      var g = G(o), m = M(o);
      // A 点火：短促的爆燃，给出「起点」这一下
      filteredNoise(t, 0.09, 0.32 * g, 'highpass', 1100, 1100, 0.8);
      // B 推力主体：带通由低扫高 = 加速离场。宽带噪声而不是乐音
      filteredNoise(t, 0.60, 0.42 * g, 'bandpass', 260 * m, 1250 * m, 0.8);
      // C 低频托底：正弦上升，给重量但不带毛刺。压得比 B 低，让噪声主导而不是乐音主导
      tone(t, 62 * m, 0.40, 0.28 * g, 'sine', 150 * m);
      // D 离场尾音：0.3 s 后逐渐远去，低通收窄
      filteredNoise(t + 0.30, 0.50, 0.20 * g, 'lowpass', 900, 220, 0.7);
    },
    /* 拦截：两声金属质感的高频 ping，与发射的暖低频形成听觉上的区分 */
    intercept: function (t, _a, o) {
      tone(t, 1450 * M(o), 0.09, 0.30 * G(o), 'sine');
      tone(t + 0.05, 2150 * M(o), 0.08, 0.22 * G(o), 'sine');
    },

    /* 核爆：三层叠加，是全曲最响的一个音。
     *   A 低频核心 60→24 Hz —— 占七成能量，听感上的「轰」来自这一层，旧版的好也在这里；
     *   B 冲击体 1400→200 Hz —— 只补手机喇叭放不出的那截中低段；
     *   C 滚动长尾 1.7 s —— 核爆的余波，比旧版更长更沉。
     *
     * 2026-09-10 二改：上一版为了照顾手机喇叭，把 B 抬到 2600→320 Hz 又加了 90 ms
     * 高频爆裂瞬态 —— 亮度是够了，但核爆变成了鞭炮，「远处深沉的滚动轰鸣」被高频切碎。
     * 教训：补中频可以，补成「亮度」就毁了音色。这一版把 B 压回 200~1400 Hz、
     * 去掉高频瞬态，让 A 重新主导。手机端靠 B 的 200~800 Hz 段承接，不用高频。 */
    nuke: function (t, _a, o) {
      var g = G(o), m = M(o);
      // A 低频核心：保留旧版的深沉下潜，只抬电平、延长一点衰减
      var o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(60 * m, t);
      o1.frequency.exponentialRampToValueAtTime(24 * m, t + 1.05);
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.exponentialRampToValueAtTime(58, t + 1.05);
      var g1 = envelope(t, 0.014, 1.15, 0.86 * g);
      o1.connect(lp); lp.connect(g1); g1.connect(sfxBus);
      o1.start(t); o1.stop(t + 1.25);
      // B 冲击体：频带压在中低段（200~1400），不做亮度。手机端靠这一层的 200~800 段承接
      filteredNoise(t, 0.5, 0.30 * g, 'lowpass', 1400, 200, 0.7);
      // C 滚动长尾
      filteredNoise(t + 0.10, 1.7, 0.30 * g, 'lowpass', 700, 90, 0.7);
    },

    // 指令被拒：短促低闷的一声，配合发射条的红色抖动
    deny: function (t, _a, o) {
      tone(t, 190 * M(o), 0.13, 0.38 * G(o), 'square', 120 * M(o));
    },

    /* 通用界面点击：抽屉开合、倍速/齐射切换、城市列表跳转等一切「按下了」的确认。
     * 刻意做得极轻极短（35 ms、峰值 0.16）—— 它一局里会被按几十次，
     * 任何一点厚度都会在第十次之后变成噪音。中频木质感，不与任何事件音撞色。 */
    tap: function (t, _a, o) {
      tone(t, 640 * M(o), 0.035, 0.16 * G(o), 'sine', 480 * M(o));
      filteredNoise(t, 0.03, 0.10 * G(o), 'bandpass', 2400, 1200, 1.5);
    },

    /* 决策确认：事件卡选项、阵营选择。比 tap 有分量（两声上行、峰值 0.26），
     * 但比 select 更暖更低 —— select 是「锁定目标」的雷达 ping，pick 是「我决定了」。
     * 三种确认音分在三档音高上，闭着眼也分得出是点了什么。 */
    pick: function (t, _a, o) {
      tone(t, 720 * M(o), 0.05, 0.26 * G(o), 'triangle');
      tone(t + 0.055, 1080 * M(o), 0.09, 0.22 * G(o), 'triangle');
    },

    /* 选中目标：雷达锁定的一声短促上行 ping。
     * 两段式发射的第一段此前是完全无声的 —— 点下去没有任何听觉确认，
     * 在手机上很容易以为没点上而反复戳。 */
    select: function (t, _a, o) {
      tone(t, 1180 * M(o), 0.045, 0.30 * G(o), 'sine');
      tone(t + 0.045, 1760 * M(o), 0.06, 0.24 * G(o), 'sine');
    },

    /* 己方城市被毁：与 nuke 同时响，但走中频的双声下行警报 ——
     * nuke 是「某处爆炸了」（通用、低频、钝），cityLost 是「死的是我的城」（私人、中频、尖）。
     * 只对自己的城市响：每颗核弹都叠一遍只会糊成一团，稀有才有意义。 */
    cityLost: function (t, _a, o) {
      tone(t, 520 * M(o), 0.20, 0.34 * G(o), 'square', 390 * M(o));
      tone(t + 0.22, 390 * M(o), 0.26, 0.30 * G(o), 'square', 260 * M(o));
      filteredNoise(t, 0.50, 0.28 * G(o), 'lowpass', 1400, 260, 0.8);
    },

    /* 终局：一局里唯一一次长音。此前终局是完全静默的 —— 排名面板弹出来时一点声音都没有，
     * 情绪在最该落地的那一秒断掉了。夺冠用 G3 大三度，其余用 D3 小调色彩更暗。 */
    end: function (t, rank) {
      var win = (rank === 1);
      var f = win ? 196.0 : 146.8;
      tone(t, f, 1.6, 0.34, 'triangle');
      tone(t, f * 1.5, 1.5, 0.20, 'sine');
      tone(t + 0.35, win ? f * 2 : f * 1.2, 1.2, 0.16, 'triangle');
      filteredNoise(t, 1.8, 0.14, 'lowpass', 700, 120, 0.6);
    }
  };

  function play(name, arg) {
    if (!enabled) return false;
    var fn = VOICES[name];
    if (!fn) return false;
    var c = ensure();
    if (!c) return false;
    if (c.state === 'closed') return false;
    /* suspended 时不再直接放弃：开局「选定阵营」是整局第一次用户手势，
     * AudioContext 可能还停在 suspended（resume 是异步的，等它 resolve 就错过了这一声）。
     * suspended 下 currentTime 冻结，此刻排进去的音会在 resume 后照常播出，所以照排不误。 */
    if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    var now = c.currentTime;
    var gap = MIN_GAP[name] || 0;
    var maxSt = (MAX_STACK[name] != null) ? MAX_STACK[name] : 1;
    var st = 0, opt = { mul: 1, gain: 1 };

    if (lastAt[name] != null && now - lastAt[name] < gap) {
      /* 密集触发：不再丢弃，改为升高音高 + 略降音量（越密越急）。
       * 超过该音的叠加上限才真的放弃 —— 否则齐射会糊成噪音墙。 */
      st = (stack[name] || 0) + 1;
      if (st > maxSt) return false;
      stack[name] = st;
      opt.mul = Math.pow(2, st * 2 / 12);      // 每层 +2 个半音
      opt.gain = Math.pow(0.78, st);
    } else {
      stack[name] = 0;
      lastAt[name] = now;
    }

    try { fn(now + 0.01, arg, opt); } catch (e) { return false; }
    return true;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) { unlock(); }
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
