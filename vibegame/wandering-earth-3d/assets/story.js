/**
 * 剧情导演：刹车时代序章 + 逃逸时代的叛乱与氦闪。
 *
 * 这里是**叙事的唯一真源**：幕次、年份、文案、以及每一幕要对场景下达的指令。
 * 本模块只产出"当前该是什么样"（scene）与"当前该显示什么字"（view），
 * 不直接碰 DOM、不碰渲染器 —— 具体的表现由 app.js 读 scene 去执行。
 *
 * 两段剧情：
 *   prologue  —— 刹车时代（约 42 年），纯过场，不可操作，可点击推进 / 跳过；
 *   rebellion —— 逃逸时代第 10 圈触发：叛乱 → 处决 → 太阳氦闪爆发。
 *               前两幕冻结时间，氦闪幕解冻（太阳开始膨胀，玩家要靠推力自救）。
 */
(function (global) {
  'use strict';
  var M3D = global.M3D || (global.M3D = {});

  // ============================================================
  //  幕表
  // ============================================================
  // scene 字段（均为 0..1 的目标值，由本模块平滑逼近）：
  //   spin    地球自转速率（1 = 正常自转，0 = 停转）
  //   engines 行星发动机光柱亮度
  //   city    地表城市灯光（迁入地下城后熄灭）
  //   flood   海啸 / 云层翻涌强度
  //   storm   超级风暴强度
  //   sunAnom 太阳异常增亮
  //   sunMul  太阳体积倍率（1 = 正常；氦闪时膨胀到 9.5，足以吞没水星与金星）
  //   cam     相机档位：'near' 看地球 / 'far' 看整条轨道
  //   moon    月球状态：'orbit' 绕地 / 'leave' 推离 / 'gone' 消失

  var PROLOGUE = [
    {
      year: [0, 3], dur: 6.0,
      title: '刹车时代 · 氦闪预警',
      text: '天文学家发现太阳的氢聚变正在失控。四百年内，氦闪将吞没整个内太阳系。',
      scene: { spin: 1, engines: 0, city: 1, flood: 0, storm: 0, sunAnom: 0.2, sunMul: 1, cam: 'near', moon: 'orbit' }
    },
    {
      year: [3, 11], dur: 6.0,
      title: '飞船派 · 地球派',
      text: '造飞船带走少数人，还是带着整个家园流浪？联合政府选择了后者——流浪地球计划。',
      scene: { spin: 1, engines: 0, city: 1, flood: 0, storm: 0, sunAnom: 0.25, sunMul: 1, cam: 'near', moon: 'orbit' }
    },
    {
      year: [11, 24], dur: 7.0, sound: 'ignite',
      title: '一万二千台行星发动机',
      text: '亚欧与美洲大陆竖起上万座发动机。蓝色等离子光柱刺破长夜，地球开始改变姿态。',
      scene: { spin: 0.6, engines: 1, city: 1, flood: 0, storm: 0, sunAnom: 0.3, sunMul: 1, cam: 'near', moon: 'orbit' }
    },
    {
      year: [24, 33], dur: 7.5, sound: 'chime',
      title: '月球 · 被推离的旧伴侣',
      text: '为避免地月引力干扰变轨，月球装上发动机，被完整推出地球轨道。潮汐失控，超级海啸席卷全球海岸。',
      scene: { spin: 0.4, engines: 1, city: 0.75, flood: 1, storm: 0.3, sunAnom: 0.35, sunMul: 1, cam: 'near', moon: 'leave' }
    },
    {
      year: [33, 40], dur: 7.5,
      title: '刹车 · 地球停止自转',
      text: '发动机全功率反向喷射。四十六亿年的自转就此停下，永昼与永夜降临，超级风暴横扫地表。',
      scene: { spin: 0, engines: 1, city: 0.45, flood: 0.35, storm: 1, sunAnom: 0.4, sunMul: 1, cam: 'near', moon: 'gone' }
    },
    {
      year: [40, 42], dur: 6.5,
      title: '地下城',
      text: '三十五亿人迁入地下城。地表只剩发动机的光。刹车时代结束，历时四十二年。',
      scene: { spin: 0, engines: 1, city: 0.12, flood: 0.1, storm: 0.6, sunAnom: 0.45, sunMul: 1, cam: 'far', moon: 'gone' }
    },
    {
      year: [42, 42], dur: 5.0,
      title: '逃逸时代',
      text: '发动机转向。地球将绕日十五圈，一圈圈加速，直到挣脱太阳的引力。操控权已交还。',
      scene: { spin: 0, engines: 1, city: 0.1, flood: 0, storm: 0.2, sunAnom: 0.3, sunMul: 1, cam: 'far', moon: 'gone' },
      handoff: true          // 本幕结束后交还操控
    }
  ];

  var REBELLION = [
    {
      dur: 5.5, freeze: true,
      title: '叛乱 · 太阳不会氦闪',
      text: '四百年过去了，太阳依旧。人们说联合政府在欺骗我们。叛乱席卷全球。',
      scene: { sunAnom: 0.5 }
    },
    {
      dur: 5.5, freeze: true,
      title: '处决',
      text: '联合政府投降。五千余名官员被押上冰面，脱下防护服，冻成冰雕。',
      scene: { sunAnom: 0.7 }
    },
    {
      dur: 6.5, freeze: false, sound: 'boom',
      title: '太阳氦闪',
      text: '就在那一刻，太阳爆发了。水星与金星被烈焰吞没。太阳没有说谎。',
      scene: { sunAnom: 1, sunMul: 9.5 }
    }
  ];

  // ============================================================
  //  导演
  // ============================================================
  var NUM_FIELDS = ['spin', 'engines', 'city', 'flood', 'storm', 'sunAnom', 'sunMul'];

  function createStory(hooks) {
    hooks = hooks || {};
    var api = {};
    var beats = PROLOGUE, phaseName = 'prologue';
    var idx = -1, timer = 0, playing = false, done = false;

    // 当前生效的场景值（平滑逼近 beat.scene 的目标）
    var cur = { spin: 1, engines: 0, city: 1, flood: 0, storm: 0, sunAnom: 0, sunMul: 1, cam: 'near', moon: 'orbit' };
    var tgt = null;
    var view = { title: '', text: '', hint: '', year: 0, progress: 0, visible: false };

    function emit(name, a, b) { if (typeof hooks[name] === 'function') hooks[name](a, b); }

    function applyBeat(b) {
      tgt = b.scene || {};
      view.title = b.title || '';
      view.text = b.text || '';
      view.visible = true;
      if (b.sound) emit('onSound', b.sound);
      if (b.scene && b.scene.moon !== undefined) cur.moon = b.scene.moon;   // 离散状态立即切换
      if (b.scene && b.scene.cam !== undefined) cur.cam = b.scene.cam;
      emit('onBeat', phaseName, idx, b);
    }

    function next() {
      idx++;
      if (idx >= beats.length) { finish(); return; }
      timer = 0;
      applyBeat(beats[idx]);
    }

    function finish() {
      playing = false; done = true;
      view.visible = false;
      // 序章结束后停在"逃逸时代"的常态：发动机全开、地表只有发动机光
      if (phaseName === 'prologue') {
        tgt = { spin: 0, engines: 1, city: 0.1, flood: 0, storm: 0.2, sunAnom: 0.3, sunMul: 1, cam: 'far', moon: 'gone' };
        cur.moon = 'gone'; cur.cam = 'far';
      }
      emit('onEnd', phaseName);
    }

    api.play = function (phase) {
      phaseName = phase || 'prologue';
      beats = phaseName === 'rebellion' ? REBELLION : PROLOGUE;
      idx = -1; timer = 0; done = false; playing = true;
      next();
      return api;
    };

    api.update = function (dt) {
      var k = Math.min(1, dt * 2.2);           // 场景数值逼近系数
      if (tgt) {
        for (var i = 0; i < NUM_FIELDS.length; i++) {
          var f = NUM_FIELDS[i];
          if (tgt[f] === undefined) continue;
          cur[f] += (tgt[f] - cur[f]) * k;
        }
      }
      if (!playing) return;
      var b = beats[idx];
      if (!b) return;
      timer += dt;
      if (b.year) {
        var t0 = Math.min(1, timer / b.dur);
        view.year = b.year[0] + (b.year[1] - b.year[0]) * t0;
      }
      view.progress = (idx + Math.min(1, timer / b.dur)) / beats.length;
      if (timer >= b.dur) next();
    };

    api.tap = function () {
      if (!playing) return;
      if (idx >= beats.length - 1) { finish(); return; }
      next();
    };

    api.skip = function () { if (playing) finish(); };

    Object.defineProperty(api, 'active', { get: function () { return playing; } });
    Object.defineProperty(api, 'done', { get: function () { return done; } });
    Object.defineProperty(api, 'phase', { get: function () { return phaseName; } });
    Object.defineProperty(api, 'index', { get: function () { return idx; } });
    Object.defineProperty(api, 'count', { get: function () { return beats.length; } });
    Object.defineProperty(api, 'beat', { get: function () { return beats[idx] || null; } });
    Object.defineProperty(api, 'freeze', { get: function () { return playing && !!(beats[idx] && beats[idx].freeze); } });
    Object.defineProperty(api, 'scene', { get: function () { return cur; } });
    Object.defineProperty(api, 'view', { get: function () { return view; } });

    return api;
  }

  M3D.createStory = createStory;
  M3D.STORY_DATA = { PROLOGUE: PROLOGUE, REBELLION: REBELLION };
})(typeof window !== 'undefined' ? window : this);
