/*
 * air-tycoon — ui.js
 * 竖屏 HUD 与全部经营面板：线路、机队、事件卡、季报、终局
 * 依赖：data.js → geo.js → landmask.js → sim.js → render.js
 * 命名空间：window.AT（经典脚本，无 import/export/type=module）
 *
 * ── 架构：HUD + 抽屉 + 模态层（三层，各有明确职责）──
 *   HUD    —— 常驻读数（资金/净资产/排名/回合/计时）。每帧刷新，只改 textContent。
 *   抽屉   —— 左下按钮打开的面板：航线列表、机队、开新线。**打开时暂停回合计时**
 *             （见 syncClockPause；2026-09-27 起，此前是不阻塞）。
 *   模态   —— 事件卡、季报、终局。**都冻结回合计时**：事件卡由 sim 的 state.card 冻结；
 *             季报由 syncClockPause 冻结（2026-10-09 修：此前季报在屏时计时照走，
 *             玩家读完一屏季报，下一季已经自己跑掉了）；终局 phase='over' 时 tick 早退。
 *
 * ── 为什么事件卡必须阻塞 ──
 *   sim 的 tick 里有 `if (state.card) return state`，事件卡未决策时不推进回合。
 *   若 UI 不把这件事表现出来，玩家会看到「倒计时卡住不动」而不知道要做什么。
 *   故事件卡一出现就盖模态层，并给出明确的操作提示。
 *
 * ── 与 sim 的契约 ──
 *   UI **只调 sim 的导出接口**，绝不自己重算利润/运力/槽位 ——
 *   一旦 UI 里抄一份公式，迟早与 sim 漂移，玩家看到两个不一样的数字。
 *   所有金额、客座率、槽位读数一律来自 S.settleRoute / S.forecast / S.routeSlots。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};
  var S = AT.sim;
  var R = AT.render;
  var C = AT.CONFIG || {};

  var ui = {
    inited: false, game: null, state: null,
    panel: null,              // 'routes' | 'fleet' | 'newroute' | 'rivals' | null
    acquireId: null,          // 对手榜：当前展开「确认并购」的对手 id（null=未展开）
    selCity: null,            // 选中城市 id
    selRoute: null,           // 选中航线 key
    lastQuarter: 0,           // 用于检测回合变化 → 弹季报
    reports: [],              // 待看季报队列
    modal: null,              // 'event' | 'report' | 'over' | 'invest' | null
    scrollType: false,        // 新航线：下一次重绘后把③机型区滚进视野（一次性）
    scrollOpen: false,        // 新航线：选完机型后把「开通」按钮滚进视野（一次性）
    toastT: 0
  };
  var el = {};
  var dirty = { hud: true, panel: true, modal: true };

  function $(id) { return document.getElementById(id); }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  }); }

  /* ───────────────────────── 数值格式化 ───────────────────────── */

  function money(v) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v), sign = v < 0 ? '-' : '';
    a = Math.abs(a);
    if (a >= 10000) return sign + (a / 10000).toFixed(2) + '亿';
    return sign + Math.round(a) + '万';
  }
  function moneyFull(v) {
    if (v == null || !isFinite(v)) return '—';
    var s = (v > 0 ? '+' : '') + Math.round(v);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 万';
  }
  function pct(v, d) {
    if (v == null || !isFinite(v)) return '—';
    return (v * 100).toFixed(d == null ? 1 : d) + '%';
  }
  function num(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toString(); }

  var LV_NAME = ['', '小镇', '城市', '大城', '枢纽', '全球枢纽'];

  /* ───────────────────────── 初始化 ───────────────────────── */

  function init(state, game) {
    ui.state = state;
    ui.game = game;
    cacheEls();
    bindEvents();
    buildStaticShell();
    ui.inited = true;
    ui.lastQuarter = state.quarter;
    // 音频默认开启（见 audio.js 文件头①），故静音键初始为「亮」
    syncMute(!AT.audio || AT.audio.enabled !== false);
    markAll();
  }

  function cacheEls() {
    /* 别名表：UI 内部的键名 → 页面里真实的 id。
     * 只有不一致的才需要写在这里，其余默认同名。
     * ⚠ uStage 取的是 #stage（画布），uLoader/uFallback 取的是 game.js 启动脚本
     *   已在用的 #loader / #fallback —— 不为了 UI 好看去改启动脚本的 id。 */
    var ALIAS = { uStage: 'stage', uLoader: 'loader', uFallback: 'fallback' };
    ['uCompany', 'uQuarter', 'uSpeed', 'uMute', 'uCash', 'uNet', 'uRank', 'uRoutes', 'uPlanes',
     'uDev', 'uTimer', 'uTimerBar', 'uCityCard', 'uHint', 'uToast', 'uLoader',
     'uMine', 'uPanel', 'uPanelBody', 'uPanelTitle', 'uPanelSub', 'uPanelClose',
     'uModal', 'uModalBody', 'uTabRoutes', 'uTabFleet', 'uTrade',
     'uFallback', 'uStage', 'uBtnRoutes', 'uBtnFleet', 'uBtnNew', 'uBtnRivals'
    ].forEach(function (k) { el[k] = $(ALIAS[k] || k); });
  }

  function markAll() { dirty.hud = dirty.panel = dirty.modal = true; }

  /* 音效的唯一入口。为什么不直接写 AT.audio.play(...)：
   *   ① audio.js 与 ui.js 是两个可选模块，任一缺失时游戏仍须能跑
   *      （本作有「渲染挂了也能经营」的降级路径，音频同理）；
   *   ② 集中一处便于测试打桩（测试里替换 ui._sfx 就能断言「该响的响了」）。 */
  function sfx(name, opts) {
    if (ui._sfx) return ui._sfx(name, opts);
    var A = AT.audio;
    if (A && A.play) { try { return A.play(name, opts); } catch (e) {} }
    return false;
  }

  function bindEvents() {
    var cv = $('stage');
    if (cv) bindCanvas(cv);
    if (el.uSpeed) el.uSpeed.addEventListener('click', cycleSpeed, false);
    if (el.uMute) el.uMute.addEventListener('click', onMuteClick, false);
    if (el.uPanelClose) el.uPanelClose.addEventListener('click', function () { closePanel(); }, false);
    if (el.uBtnRoutes) el.uBtnRoutes.addEventListener('click', function () { togglePanel('routes'); }, false);
    if (el.uBtnFleet) el.uBtnFleet.addEventListener('click', function () { togglePanel('fleet'); }, false);
    if (el.uBtnNew) el.uBtnNew.addEventListener('click', function () { togglePanel('newroute'); }, false);
    if (el.uBtnRivals) el.uBtnRivals.addEventListener('click', function () { togglePanel('rivals'); }, false);
    if (el.uPanelBody) el.uPanelBody.addEventListener('click', onPanelClick, false);
    if (el.uModalBody) el.uModalBody.addEventListener('click', onModalClick, false);
    if (el.uCityCard) el.uCityCard.addEventListener('click', onCityCardClick, false);
    // Esc 关闭面板（桌面端调试方便）
    global.addEventListener('keydown', function (e) {
      if (e.keyCode === 27) {
        if (ui.panel) closePanel();
        else if (el.uCityCard) el.uCityCard.classList.remove('show');
      }
    }, false);
  }

  /* 静音键。为什么不做持久化（localStorage）：
   *   本作的音频**默认开启**是刻意选择（defcon 的教训，见 audio.js 文件头①）——
   *   持久化会让「上次关过」的玩家永远听不到，而那次关闭可能只是当时不方便。
   *   每局重置为开启，是「宁可多响一次」的取舍。 */
  function onMuteClick() {
    var A = AT.audio;
    if (!A) return;
    // 按下去这一声先放出来，再关 —— 否则「关」的瞬间没有任何听觉反馈
    sfx('click');
    var on = A.toggle();
    syncMute(on);
    toast(on ? '声音已开启' : '声音已关闭', on ? 'ok' : 'warn');
  }

  function syncMute(on) {
    if (!el.uMute) return;
    el.uMute.className = on ? '' : 'off';
    el.uMute.textContent = on ? '♪' : '♪̸';
  }

  function buildStaticShell() {
    // 底部 Tab 栏与面板容器由 HTML 提供；这里只确保类名初始态正确
    if (el.uPanel) el.uPanel.classList.remove('show');
    if (el.uModal) el.uModal.classList.remove('show');
    syncTabs();
  }

  /* ───────────────────────── 选航司页「基地地球」（2026-10-08 加）─────────────────────────
   *
   * 与 render.js 的主地球**完全独立**：主渲染器是游戏画布（#stage）的单例，建局时才起、
   * 且带城市/航线/客机/bloom 全链路；本层在 boot 之前运行，生命周期只到「确认开航」。
   * 故这里另搭一个最小 three.js 场景：贴图球 + 三盏灯 + 基地标记。
   * 依赖 index.html 顶部随包加载的 three.min.js 与 assets/earth-tex.js（内联 data URI，
   * file:// 下外链 jpg 会被 CORS 拒绝）。
   *
   * ⚠ 任一环不可用（无 THREE / 无 WebGL / 创建失败）→ 返回 null，调用方给 #uSelPreview
   *   挂 .noglobe，露出 CSS 静态兜底（见 index.html）—— 绝不抛错、绝不挡住选航司。
   * ⚠ 镜头缓动到基地、基地标记与城市标签左右都跟着走；基地转到球背面时淡出（见 loop 里的 vis）。
   * ⚠ dispose 必须调用：选完航司这一层就该把 WebGL 上下文还给浏览器（Chrome 有上下文数量上限）。 */

  /* 基地标记贴图：外圈细环 + 中心柔光 + 实心核（与局内城市标记同一语言）。
   * 纯白绘制，颜色交给 SpriteMaterial.color 染色（六家航司各一色，复用同一张贴图）。 */
  function previewMarkTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    x.translate(64, 64);
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 3;
    x.beginPath(); x.arc(0, 0, 40, 0, Math.PI * 2); x.stroke();
    var g = x.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(0, 0, 8, 0, Math.PI * 2); x.fill();
    return new THREE.CanvasTexture(c);
  }

  /* 建一个基地地球预览。canvas = 舞台里的常驻画布；labelEl = 基地城市标签（每帧投影定位）。
   * 返回 { setBase(lat,lon,color), dispose() }；不可用时返回 null。 */
  function createPreviewGlobe(canvas, labelEl) {
    if (typeof THREE === 'undefined' || !canvas || !THREE.WebGLRenderer) return null;
    var gl = null;
    try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) {}
    if (!gl) return null;

    var R = 1;
    var renderer, scene, camera, globe, marker, markerMat, markTex;
    var baseDir = new THREE.Vector3(0, 1, 0);   // 基地方向（球心 → 基地）
    var camDir = new THREE.Vector3(0, 0, 1);
    var tmp = new THREE.Vector3();
    /* 球坐标（与 render.js 的 applyCam 同一套约定）：
     * pos = d·(sinφ·sinθ, cosφ, sinφ·cosθ) —— θ=atan2(x,z)、φ=acos(y) 时朝向基地。 */
    var cur = { theta: 0.6, phi: 1.2, dist: 3.2, tTheta: 0.6, tPhi: 1.2 };
    var raf = 0, disposed = false, sizerW = 0, sizerH = 0, elapsed = 0;

    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { return null; }
    if (!renderer || !renderer.getContext) return null;

    renderer.setClearAlpha(0);                 // 透明底：露出 .gp-stage 的星域渐变
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.04 });
    globe = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), mat);
    scene.add(globe);

    scene.add(new THREE.AmbientLight(0x2b3f58, 3.4));
    var key = new THREE.DirectionalLight(0xfff2d0, 2.6);
    key.position.set(2.4, 2.0, 3.6);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x4aa8d6, 1.2);
    rim.position.set(-3.2, -1.2, -2.4);
    scene.add(rim);

    /* 贴图：内联 data URI；缺失或加载失败一律回落纯色球（不白屏、不抛错）。 */
    var texSrc = (typeof global.AT_EARTH_TEX === 'string' && global.AT_EARTH_TEX) || null;
    if (texSrc) {
      try {
        new THREE.TextureLoader().load(texSrc, function (tx) {
          if (THREE.sRGBEncoding !== undefined) tx.encoding = THREE.sRGBEncoding;
          tx.anisotropy = 4;
          mat.map = tx; mat.needsUpdate = true;
        }, undefined, function () { mat.color.setHex(0x7fa8c4); mat.needsUpdate = true; });
      } catch (e) { mat.color.setHex(0x7fa8c4); mat.needsUpdate = true; }
    } else {
      mat.color.setHex(0x7fa8c4);
    }

    markTex = previewMarkTex();
    markerMat = new THREE.SpriteMaterial({
      map: markTex, color: 0xffffff, transparent: true,
      depthTest: false, depthWrite: false, opacity: 1   // depthTest 关掉：靠 vis 控制显隐，避免贴到球面边缘被裁
    });
    marker = new THREE.Sprite(markerMat);
    marker.scale.set(0.18, 0.18, 1);
    scene.add(marker);

    function applySize(w, hh) {
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setSize(w, hh, false);
      camera.aspect = w / hh;
      /* 距离：让直径 2R 的球恰好塞进视口（竖/横两向取更紧的那个）+ 6% 余量 */
      var vF = camera.fov * Math.PI / 180;
      var hF = 2 * Math.atan(Math.tan(vF / 2) * camera.aspect);
      cur.dist = Math.max(1 / Math.sin(vF / 2), 1 / Math.sin(hF / 2)) * 1.06;
      camera.updateProjectionMatrix();
    }

    function loop() {
      if (disposed) return;
      raf = global.requestAnimationFrame(loop);
      var w = canvas.clientWidth, hh = canvas.clientHeight;
      if (!w || !hh) return;                       // 覆盖层还没 display（.show 未加）→ 等下一帧
      if (w !== sizerW || hh !== sizerH) { sizerW = w; sizerH = hh; applySize(w, hh); }

      elapsed += 1 / 60;
      var t = elapsed;
      cur.theta += (cur.tTheta - cur.theta) * 0.13;
      cur.phi += (cur.tPhi - cur.phi) * 0.13;
      /* 极轻微摆动：让静止的球不至于死板，同时基地始终停在视野中心附近（±2.3°）。 */
      var th = cur.theta + Math.sin(t * 0.4) * 0.04;
      var ph = cur.phi, d = cur.dist;
      camera.position.set(d * Math.sin(ph) * Math.sin(th), d * Math.cos(ph), d * Math.sin(ph) * Math.cos(th));
      camera.lookAt(0, 0, 0);

      marker.position.set(baseDir.x * R * 1.012, baseDir.y * R * 1.012, baseDir.z * R * 1.012);
      var pulse = 1 + Math.sin(t * 2.1) * 0.1;
      marker.scale.set(0.18 * pulse, 0.18 * pulse, 1);

      /* 可见性：基地是否朝向相机（转到球背面时把标记与标签一起淡出）。 */
      camDir.copy(camera.position).normalize();
      var vis = baseDir.dot(camDir);
      var op = Math.max(0, Math.min(1, (vis - 0.05) / 0.2));
      markerMat.opacity = op;

      renderer.render(scene, camera);

      if (labelEl) {
        tmp.copy(baseDir).multiplyScalar(R * 1.02).project(camera);
        labelEl.style.left = ((tmp.x * 0.5 + 0.5) * w) + 'px';
        labelEl.style.top = ((-tmp.y * 0.5 + 0.5) * hh) + 'px';
        labelEl.style.opacity = op > 0.5 ? '1' : '0';
      }
    }

    function setBase(lat, lon, color) {
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      var v = AT.geo.ll2v(lat, lon, 1);
      baseDir.set(v.x, v.y, v.z).normalize();
      var phi = Math.acos(Math.max(-1, Math.min(1, baseDir.y)));
      var theta = Math.atan2(baseDir.x, baseDir.z);
      /* 沿最短弧转向新基地（θ 跨 ±π 时直接赋值会绕远路）。 */
      var dd = theta - cur.tTheta;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      cur.tTheta += dd;
      cur.tPhi = Math.max(0.16, Math.min(Math.PI - 0.16, phi));   // 留出极点余量，避免 lookAt 与 up 退化
      if (color) { try { markerMat.color.set(color); } catch (e) {} }
    }

    function dispose() {
      disposed = true;
      if (raf) { try { global.cancelAnimationFrame(raf); } catch (e) {} raf = 0; }
      try { if (markTex) markTex.dispose(); } catch (e) {}
      try { markerMat.dispose(); } catch (e) {}
      try { globe.geometry.dispose(); globe.material.dispose(); } catch (e) {}
      try { renderer.dispose(); } catch (e) {}
      try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
    }

    raf = global.requestAnimationFrame(loop);
    return { setBase: setBase, dispose: dispose };
  }

  /* ───────────────────────── 开局选航司（用户 2026-09-29 拍板；2026-10-08 六改）─────────
   *
   * ⚠ 它必须在 **boot 之前** 运行 —— 此时 ui.state 还是 null、init 也还没跑，
   *   所以这个函数**只读 data.js 的 AT.AIRLINES**，绝不碰 ui.state / el 缓存
   *   （el 由 init→cacheEls 填充，这里用 $() 直接查）。
   *
   * 交互（2026-09-30 三改确立两步式 inspect→commit；2026-10-08 六改换上基地地球，
   *      七改删掉地球下方的信息带卡片 —— 行内信息已够，卡片属重复陈列）：
   *   下方列表点行 → 上方地球转到该航司基地并标记打点 →
   *   底部「确认开航」才是真正提交。
   *   理由：「本局不可更换航司」是不可逆选择，两步给玩家一次反悔的机会；
   *   默认选中第一家 —— 预览区不空场，不关心的玩家一击也能直达。
   * 返回 true 表示选择界面已呈现；返回 false 时调用方应退回默认开局
   * （#uSelect 缺失 / 没有航司数据 —— 不能让玩家卡在白屏上）。 */
  function showAirlineSelect(onPick) {
    var wrap = $('uSelect'), pv = $('uSelPreview'), grid = $('uSelectList'), go = $('uSelGo');
    var list = (AT.AIRLINES || []);
    if (!wrap || !pv || !grid || !go || !list.length) return false;

    /* 地球的静态子节点（由 index.html 提供）。缺任一 → 对应内容跳过，不报错。 */
    var gCanvas = $('uSelGlobe'), gLabel = pv.querySelector('.gp-base');

    /* 默认选中第一家 */
    var cur = list[0].id;

    function byId(id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return list[0];
    }

    /* hex → rgba()：识别色的低透明度底（行选中底色用）。
     * Chrome 61 没有 color-mix()，只能由 JS 算好注入 CSS 变量。 */
    function tint(hex, a) {
      var m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return 'rgba(99,210,255,' + a + ')';
      var n = parseInt(m[1], 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    /* 基地地球：建在**常驻画布**上。为什么不随点选重建 innerHTML ——
     * 重建会连带新建一个 WebGLRenderer（每次点选都多占一个 WebGL 上下文）。
     * 点选只做两件事：改基地标签文字、把镜头缓动到新基地。 */
    var globe = gCanvas ? createPreviewGlobe(gCanvas, gLabel) : null;
    if (!globe) pv.className += ' noglobe';         // three.js / WebGL 不可用 → CSS 静态兜底

    /* 更新顶部预览（地球转向 + 打点换色）。识别色只出现在地球标记
     * （含 .noglobe 兜底小点）；技能名 / IATA 徽标等详情都在列表行内。 */
    function renderPreview(a) {
      var base = AT.CITIES_BY_ID[a.baseCityId] || {};
      var color = a.color || '#63d2ff';
      pv.style.setProperty('--ac', color);
      if (gLabel) gLabel.textContent = (base.name || '') + (a.baseCode ? ' · ' + a.baseCode : '');
      if (globe) globe.setBase(base.lat, base.lon, color);
    }

    /* 航司列表行（迷你卡 → 数据行）：实色 IATA 码块 + 名称/技能 +
     * 基地行（mono 弱化）+ 选中圆标。左对齐数据行，不是营销卡；点选只换地球不提交。 */
    function tileHtml(a, i) {
      var base = AT.CITIES_BY_ID[a.baseCityId] || {};
      var reg = AT.REGIONS_BY_CODE[a.region] || {};
      var tr = AT.normalizeTrait(a.trait);
      return '<button class="al-card' + (a.id === cur ? ' on' : '') + '" type="button"' +
        ' data-act="pick-airline" data-val="' + h(a.id) + '" style="--ac:' + h(a.color || '#63d2ff') + ';' +
        '--ac-soft:' + tint(a.color, 0.12) + ';animation-delay:' + (i * 45) + 'ms">' +
        '<span class="al-code">' + h(a.iata || '') + '</span>' +
        '<span class="al-main"><span class="al-l1"><span class="al-name">' + h(a.name) + '</span>' +
        '<span class="al-trait">' + h(tr.name) + '</span></span>' +
        '<span class="al-l2">' + h(base.name || '') + ' ' + h(a.baseCode || '') +
        ' · ' + h(reg.name || '') + '</span></span>' +
        '<span class="al-mark" aria-hidden="true"></span>' +
        '</button>';
    }

    var html = '';
    list.forEach(function (a, i) { html += tileHtml(a, i); });
    grid.innerHTML = html;

    /* 同步选中态与确认按钮文案（只在 .on 类与文本上做增量更新，
     * 不重建航司列表 —— 重建会重播入场动画，每次点选都闪一遍）。
     * 同时把「当前选中航司色」写到页面级 --sel-ac：节标签竖标随点选换色，
     * 让整个屏幕对「当前是谁」有一处轻量回应。 */
    function syncSel() {
      var tiles = grid.querySelectorAll('[data-act="pick-airline"]');
      for (var i = 0; i < tiles.length; i++) {
        tiles[i].classList.toggle('on', tiles[i].getAttribute('data-val') === cur);
      }
      go.textContent = '确认开航 · ' + byId(cur).name;
      wrap.style.setProperty('--sel-ac', byId(cur).color || '#63d2ff');
    }

    renderPreview(byId(cur));
    syncSel();
    wrap.classList.add('show');

    grid.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act="pick-airline"]') : null;
      if (!t) return;
      var id = t.getAttribute('data-val');
      if (id === cur) return;
      cur = id;
      renderPreview(byId(id));
      syncSel();
      sfx('click');
    }, false);

    go.addEventListener('click', function () {
      sfx('confirm');
      if (globe) { globe.dispose(); globe = null; }   // 交还 WebGL 上下文，停掉这一层的 rAF
      wrap.classList.remove('show');
      if (onPick) onPick(cur);
    }, false);
    return true;
  }

  /* ───────────────────────── 启动续玩（自动存档）─────────────────────────
   * 与 showAirlineSelect 同一约束：**在 boot 之前**运行（ui.state 仍为 null），
   * 故只读传进来的 state 与 data.js 的 AT.CONFIG，不碰 el 缓存。
   *
   * 交互：有可读存档时先显示本层，给两条路 ——「继续经营」（接着这局跑）与
   * 「开启新的一局」（清档 → 回到选航司）。返回 true 表示已呈现；返回 false
   * 时调用方应直接进入选航司（不让玩家卡死）。
   *
   * 内容：一张**经营报表**（.rs），不是一张登机牌 —— 续玩前玩家要判断的是
   * 「这局还值不值得接着打」，所以给存活状态快照（现金/净资产/排名/规模/全球化）、
   * 最近一季度逐项账目（取自 history 快照的真实结算值）、以及累计战绩。
   * 样式复用值机屏（.sel / .sel-go / .sel-alt）与季报的账本语言（.md-kv / .md-total）。 */
  function showResume(state, onResume, onNew) {
    var wrap = $('uResume');
    if (!wrap || !state) return false;
    var total = C.totalQuarters || 60;
    var q = Math.min(state.quarter || 0, total);
    var name = state.companyName || '未命名航空';
    var routes = state.routes || [];
    var planes = state.planes || [];
    var stats = state.stats || {};
    var history = state.history || [];
    var last = history.length ? history[history.length - 1] : null;
    var prev = history.length > 1 ? history[history.length - 2] : null;
    var debt = state.debt || 0;

    /* 读档时 ui.state 还没建（本层跑在 boot 之前），故只拿传进来的 state 直接问 sim 的
     * 纯查询接口 —— 它们都只读 state，不依赖全局单例，与 HUD 的算法同源，数字不会漂。 */
    var rk = S.ranking(state);
    var my = 0;
    for (var i = 0; i < rk.length; i++) if (rk[i].isPlayer) { my = i + 1; break; }
    var nw = S.netWorth(state);
    var idle = S.idlePlanes(state).length;
    var g = S.globalization(state);
    /* 净资产环比：只在有两期快照时给，别拿「上季 vs 开局」冒充环比 */
    var nwDelta = (last && prev) ? (last.netWorth - prev.netWorth) : null;

    var html =
      '<div class="sel-hd">' +
        '<div class="sel-brand"><b>AIR TYCOON</b><span>航空大亨 · 续飞</span></div>' +
        '<span class="sel-title">继续上一次经营？</span>' +
        '<span class="sel-sub">进度已自动保存。以下是存档时的经营报表 —— 接着执掌，或开启全新一局。</span>' +
      '</div>' +
      '<div class="sel-main">' +
        '<div class="rs">' +
          '<div class="rs-hd"><span class="rs-co">' + h(name) + '</span>' +
            '<span class="rs-q">Q' + q + ' / ' + total + '</span></div>' +
          /* ① 经营快照：存活状态的六个面 —— 现金/净资产/排名/负债/规模/全球化 */
          '<div class="md-kv">' +
            '<div><span>现金</span><b' + (state.cash < 0 ? ' class="c-bad"' : '') + '>' +
              money(state.cash) + '</b></div>' +
            '<div><span>净资产</span><b>' + money(nw) + (nwDelta != null ?
              ' <i class="' + (nwDelta >= 0 ? 'c-good' : 'c-bad') + '">(' +
              (nwDelta >= 0 ? '+' : '') + money(nwDelta) + ' 环比)</i>' : '') + '</b></div>' +
            '<div><span>全球排名</span><b>第 ' + (my || '—') + ' / ' + (rk.length || '—') + ' 名</b></div>' +
            (debt > 0 ? '<div><span>负债</span><b class="c-bad">' + money(debt) + '</b></div>' : '') +
            '<div><span>航线 / 机队</span><b>' + routes.length + ' 条 / ' + planes.length + ' 架' +
              (idle ? '<i class="c-warn">· ' + idle + ' 架闲置</i>' : '') + '</b></div>' +
            '<div><span>全球化</span><b>' + g.pct + '%（' + g.cities + '/' + g.totalCities +
              ' 城 · ' + g.regions + '/' + g.totalRegions + ' 地区）</b></div>' +
          '</div>' +
          /* ② 上一季度账目：逐项列出「收入 − 各项支出 = 净利」，全部取自 history 快照的
           *    真实结算值（不是 forecast 的预测值），保证这页数字自洽、能对上账。
           *    开局首季结算前没有快照，此时只留一句说明，不编造数字。 */
          (last ?
            '<div class="rs-sec">最近一季度结算<u>Q' + last.quarter + '</u></div>' +
            '<div class="md-kv">' +
              '<div><span>营业收入</span><b>' + money(last.revenue) + '</b></div>' +
              '<div><span>运营成本</span><b class="c-bad">−' + money(last.cost) + '</b></div>' +
              (last.groundCost ? '<div><span>地面与起降</span><b class="c-bad">−' +
                money(last.groundCost) + '</b></div>' : '') +
              (last.baseMaint ? '<div><span>基地维护</span><b class="c-bad">−' +
                money(last.baseMaint) + '</b></div>' : '') +
              '<div><span>管理支出</span><b class="c-bad">−' + money(last.overhead) + '</b></div>' +
              (last.interest > 0 ? '<div><span>债务利息</span><b class="c-bad">−' +
                money(last.interest) + '</b></div>' : '') +
              '<div class="md-total"><span>净利润</span><b class="' +
                (last.net >= 0 ? 'c-good' : 'c-bad') + '">' + moneyFull(last.net) + '</b></div>' +
              '<div><span>季度客运量</span><b>' + (last.pax || 0).toFixed(2) + ' 百万客</b></div>' +
            '</div>'
            :
            '<div class="rs-sec">账目<u>尚无季度结算记录</u></div>') +
          /* ③ 累计指标：整局的宏观战绩，一行讲完 */
          '<div class="md-notes">累计客运 ' + (stats.paxTotal || 0).toFixed(1) + ' 百万客 · 开线 ' +
            (stats.routesOpened || 0) + ' 条 · 购机 ' + (stats.planesBought || 0) + ' 架 · 关线 ' +
            (stats.routesClosed || 0) + ' 条</div>' +
        '</div>' +
      '</div>' +
      '<div class="sel-cta">' +
        '<button class="sel-go" data-act="resume-continue" type="button">继续经营</button>' +
        '<button class="sel-alt" data-act="resume-new" type="button">开启新的一局</button>' +
        '<div class="sel-ft">自动存档 · 每 5 秒与切到后台时各保存一次</div>' +
      '</div>';
    /* ⚠ 必须把报表写进覆盖层再显示：漏掉这行时 #uResume 只有 .show、内部为空，
     *   而启动流程此刻已把 loader 隐藏 → 表现为**纯黑屏且不报错**（无任何异常，
     *   只是什么都没画）。这是「静默失效」最典型的一种：有输出、没抛错。 */
    wrap.innerHTML = html;
    wrap.classList.add('show');

    wrap.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      wrap.classList.remove('show');
      if (act === 'resume-continue') { sfx('confirm'); if (onResume) onResume(); }
      else if (act === 'resume-new') { sfx('click'); if (onNew) onNew(); }
    }, false);
    return true;
  }

  /* ───────────────────────── 画布交互 ───────────────────────── */

  /* 点城市 → 飞过去 + 弹卡片；长按/拖动已由 render 处理，这里只区分「点」与「拖」。
   * ⚠ 位移阈值 8px：手指在触屏上按下时几乎必然有几像素抖动，
   *   若不设阈值，每次拖动结束都会误触发一次城市选择。 */
  function bindCanvas(cv) {
    var downX = 0, downY = 0, downT = 0, moved = false;
    cv.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY; downT = Date.now(); moved = false;
    }, false);
    cv.addEventListener('pointermove', function (e) {
      if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) moved = true;
    }, false);
    cv.addEventListener('pointerup', function (e) {
      if (moved) return;
      if (Date.now() - downT > 500) return;
      if (ui.modal) return;                       // 模态层打开时不响应地图
      if (!R || !R.ok) return;
      var rect = cv.getBoundingClientRect();
      var c = R.pickCity(ui.state, e.clientX - rect.left, e.clientY - rect.top,
                         rect.width, rect.height);
      if (c) {
        ui.selCity = c.id;
        R.flyToCity(ui.state, c.id);
        /* 卡片互斥的另一半：面板开着时点城市 → 收面板，只留城市卡片。
         * 两张卡叠在一起（底部面板 + 左下城市卡）会互相遮挡。 */
        if (ui.panel) closePanel();
        renderCityCard(c);
        dirty.hud = true;
      } else if (el.uCityCard) {
        el.uCityCard.classList.remove('show');    // 点空地 → 收起卡片
      }
    }, false);
  }

  function onCityCardClick(e) {
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    var act = a.getAttribute('data-act');
    if (act === 'build-base') {
      var c0 = AT.CITIES_BY_ID[ui.selCity];
      if (!c0) return;
      var res = S.buildBase(ui.state, c0.id);
      if (res.ok) {
        toast('已在 ' + c0.name + ' 建立基地');
        renderCityCard(S.findCity(ui.state, c0.id) || c0);
        dirty.hud = true;
      } else {
        toast(res.reason || '建立基地失败');
      }
    } else if (act === 'open-here') {
      var c = AT.CITIES_BY_ID[ui.selCity];
      if (!c) return;
      closePanel();
      openPanel('newroute');
      ui.newFrom = c.id;
      toast('从 ' + c.name + ' 出发，选择一个目的地');
    }
  }

  function renderCityCard(c) {
    if (!el.uCityCard) return;
    var st = ui.state;
    var mine = st.routes.filter(function (r) { return r.a === c.id || r.b === c.id; });
    var pax = c.paxLast ? c.paxLast.toFixed(2) + ' 百万客/季' : '—';
    var cap = S.cityRouteCap(st, c.id);
    var full = mine.length >= cap;
    var maxTierName = c.level >= 5 ? '旗舰巨无霸（A380 级）'
      : c.level >= 4 ? '远程宽体'
      : c.level >= 3 ? '宽体'
      : '支线 / 窄体';
    var html = '<div class="cc-name">' + h(c.name) +
      (c.isHome ? '<span class="cc-home">基地</span>' : '') + '</div>' +
      '<div class="cc-row"><span>发展度</span><b>' + Math.round(c.dev) + ' / 100</b></div>' +
      '<div class="cc-row"><span>等级</span><b>Lv' + c.level + ' · ' + LV_NAME[Math.max(1, Math.min(5, c.level))] + '</b></div>' +
      '<div class="cc-row"><span>人口</span><b>' + c.pop.toFixed(1) + ' 百万</b></div>' +
      '<div class="cc-row"><span>本季客流</span><b>' + pax + '</b></div>' +
      '<div class="cc-row"><span>我的航线</span><b' + (full ? ' class="c-warn"' : '') + '>' +
        mine.length + ' / ' + cap + ' 条' + (full ? ' · 已满' : '') + '</b></div>' +
      '<div class="cc-row"><span>可停机型</span><b>≤ ' + maxTierName + '</b></div>';
    if (mine.length) {
      html += '<div class="cc-lines">';
      mine.forEach(function (r) {
        var other = r.a === c.id ? r.b : r.a;
        var on = AT.CITIES_BY_ID[other];
        html += '<span class="cc-tag">' + h(on ? on.name : other) + '</span>';
      });
      html += '</div>';
    }
    /* 基地城市可直接扩展航线；非基地城市须先建立基地
     * （只有基地城市才能作为新航线的扩展起点，见 sim.openRoute）。
     * 建基地费用按城市等级差异化（AT.buildBaseCostOf），高等级枢纽更贵。 */
    var isBase = !!c.isHome;
    var baseCost = AT.buildBaseCostOf(c.level || 1);
    if (isBase) {
      html += '<div class="cc-actions"><button class="btn" data-act="open-here" type="button">从这里开新航线</button></div>';
    } else {
      html += '<div class="cc-actions"><button class="btn" data-act="build-base" type="button">建立基地（¥' + baseCost + '）</button></div>';
    }
    el.uCityCard.innerHTML = html;
    el.uCityCard.classList.add('show');
  }

  /* ───────────────────────── 速度 ───────────────────────── */

  function cycleSpeed() {
    var opts = C.speedOptions || [1, 2, 4];
    var cur = ui.state.speed || 1;
    var i = opts.indexOf(cur);
    ui.state.speed = opts[(i + 1) % opts.length];
    if (el.uSpeed) el.uSpeed.textContent = ui.state.speed + '×';
  }

  /* ───────────────────────── toast ───────────────────────── */

  function toast(msg, kind) {
    if (!el.uToast) return;
    el.uToast.textContent = msg;
    el.uToast.className = 'show' + (kind ? ' ' + kind : '');
    global.clearTimeout(toast._t);
    toast._t = global.setTimeout(function () { el.uToast.className = ''; }, 2400);
  }

  /* ───────────────────────── 面板 ───────────────────────── */

  function togglePanel(name) {
    if (ui.panel === name) closePanel();
    else openPanel(name);
  }

  /* 回合计时暂停的唯一入口（2026-09-27 加「面板」；2026-10-09 扩到「季报」）。
   *
   * 判据 = 抽屉面板打开 ∨ 阻塞型模态（季报）在屏上：
   *   · 事件卡不在这里管 —— sim 的 state.card 已冻结计时（见 sim.tick）；
   *   · 终局（phase='over'）tick 本就早退，也不必管。
   *
   * ⚠ 做成「每次现算」而不是各处 setPaused(true/false)：面板与季报是两条独立开关，
   *   各写各的话，后关的那个会把另一个的暂停一起解掉。syncClockPause() 只回答
   *   「此刻该不该暂停」，任何一处开关变化都收敛到同一个答案。
   * 走 sim 的 setPaused 而不是直接写 state.paused —— 维持「UI 只调 sim 接口」的约定，
   * 也让这条链路能被无头测试断言（tests/headless.js 的暂停层）。 */
  function syncClockPause() {
    if (S && S.setPaused) S.setPaused(ui.state, !!(ui.panel || ui.modal === 'report'));
  }

  function openPanel(name) {
    ui.panel = name;
    /* 卡片互斥（2026-10-08 用户要求）：同屏只留一张卡 —— 面板升起时收掉城市卡片，
     * 否则它会压在面板上方挡视线。城市卡片自己的「从这里开新航线」分支
     * （onCityCardClick）不必再单独收卡，这里统一兜底。 */
    if (el.uCityCard) el.uCityCard.classList.remove('show');
    /* 每次打开都回到顶部：上次可能停在列表中部，重新进来应从第一屏开始看 ——
     * 带着旧滚动位置开新决策，读起来像「面板坏了」。 */
    if (el.uPanelBody) el.uPanelBody.scrollTop = 0;
    /* 展开/选中态同样每次打开都初始化（2026-10-08 用户要求）：
     * 航线行的展开详情（selRoute）、对手榜的「确认并购」展开（acquireId），
     * 关面板 ≠ 取消选中 —— 不清的话重开面板后旧行还是摊开的（「展开永远是展开的」）。 */
    ui.selRoute = null;
    ui.acquireId = null;
    /* 「新航线」是一张决策表单，**每次打开都初始化**（2026-10-08 用户要求）：
     * 出发地/目的地/机型全部清空 —— 关面板不等于做决定，「上次看到一半」的
     * 选中项不该在重开后冒充已选（目的地/机型的高亮、开通按钮的可用态都会骗人）。
     * 清掉的 newFrom 由 renderNewRoute 重新落回基地默认（见 1421 行附近）；
     * 城市卡片「从这里开新航线」的出发地意图在 openPanel 之后再种入（onCityCardClick）。
     * 滚动意图标记一并清掉：它是「这次点击」的一次性量，不该跨次生效。 */
    if (name === 'newroute') {
      ui.newFrom = null;
      ui.newTo = null;
      ui.newType = null;
      ui.scrollType = false;
      ui.scrollOpen = false;
    }
    if (el.uPanel) el.uPanel.classList.add('show');
    syncTabs();
    syncClockPause();
    dirty.panel = true;
    dirty.hud = true;
  }

  function closePanel() {
    ui.panel = null;
    ui.acquireId = null;      // 关面板即收起「确认并购」的展开态，下次进来从头看
    ui.selRoute = null;       // 航线行展开态同理（openPanel 打开时也会再兜一次）
    if (el.uPanel) el.uPanel.classList.remove('show');
    syncTabs();
    syncClockPause();
    dirty.hud = true;
  }

  /* 底部 Tab 栏的激活态：用 class 而不是 :target/属性选择器 ——
     面板由 ui.js 的状态驱动（`ui.panel`），class 是它与 DOM 之间最短的桥。
     ⚠ className 是拼的而不是 classList：本文件通篇用 className（Chrome 61 也支持
       classList，但保持一处风格，避免两条路径产生不一致）。 */
  function syncTabs() {
    tabOn(el.uBtnRoutes, ui.panel === 'routes');
    tabOn(el.uBtnFleet, ui.panel === 'fleet');
    tabOn(el.uBtnNew, ui.panel === 'newroute');
    tabOn(el.uBtnRivals, ui.panel === 'rivals');
  }
  function tabOn(btn, on) {
    if (!btn) return;
    var base = ' ' + btn.className.replace(/[\s]+/g, ' ') + ' ';
    base = base.replace(' tab-on ', ' ').replace(/^\s+|\s+$/g, '');
    btn.className = on ? (base + ' tab-on') : base;
  }

  function onPanelClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    var key = t.getAttribute('data-key') || '';
    var val = t.getAttribute('data-val') || '';
    var st = ui.state;
    var res;

    switch (act) {
      /* ── 开新航线 ── */
      /* 三个选择器只响 click：它们随时可改主意（未确认），
       * 若响 confirm 会让「只是看看目的地」也变得像做出了决定。 */
      case 'pick-from':
        sfx('click');
        ui.newFrom = t.getAttribute('data-city');
        dirty.panel = true;
        break;
      case 'pick-to':
        sfx('click');
        ui.newTo = t.getAttribute('data-city');
        /* 选完目的地要立刻看到③机型区 —— 面板只留了一条滚动条后列表变长，
         * 由 syncPanel 在重绘后滚到位（见那边的 scrollType 处理）。 */
        ui.scrollType = true;
        dirty.panel = true;
        break;
      case 'pick-type':
        sfx('click');
        ui.newType = t.getAttribute('data-type');
        /* 选完机型要立刻看到「开通」按钮（2026-10-08 用户反馈：机型区下面
         * 还有潜在需求说明 + 按钮，小屏上落在折线以下，玩家不知道要下翻）。
         * 由 syncPanel 在重绘后滚到位（见那边的 scrollOpen 处理）。 */
        ui.scrollOpen = true;
        dirty.panel = true;
        break;
      case 'do-open':
        res = doOpenRoute();
        if (res.ok) { sfx('open'); toast('已开通航线', 'ok'); }
        else { sfx('deny'); toast(res.reason, 'bad'); }
        break;

      /* ── 航线操作 ── */
      case 'sel-route':
        sfx('click');
        ui.selRoute = key;
        dirty.panel = true;
        break;
      case 'add-plane': {
        /* ⚠ 先预检架数上限，再买机（2026-09-27 加）。
         * 本分支把「买机 + 派机」合成一步，若先买后派，超限时玩家会
         * **白花购机款还多出一架闲置机** —— 钱被吃掉、飞机闲着，是最难受的失败形态。
         * 所以上限必须在掏钱之前校验（sim 的 assignPlane 也会拒，但那时钱已经花了）。 */
        var rr = S.findRouteByKey(st, key);
        if (!rr) { sfx('deny'); toast('航线不存在', 'bad'); break; }
        var capA = S.maxPlanesForRoute(st, rr);
        if (S.planesOnRoute(st, key).length >= capA) {
          sfx('deny');
          toast('该线时刻已饱和：最多 ' + capA + ' 架。想增运力请换更大机型或调低频次档位', 'bad');
          break;
        }
        /* 机型等级门槛（2026-10-09）：两端城市等级不足时 sim.assignPlane 会拒，
         * 故必须在买机之前先校验，否则会白花购机款。 */
        var tgA = S.planeLevelGate(st, rr.a, rr.b, val.trim());
        if (!tgA.ok) { sfx('deny'); toast(tgA.reason, 'bad'); break; }
        var o = S.buyPlane(st, val.trim(), 1);
        if (!o.ok) { sfx('deny'); toast(o.reason, 'bad'); break; }
        var np = st.planes[st.planes.length - 1];
        var a2 = S.assignPlane(st, np.id, key);
        if (!a2.ok) { sfx('deny'); toast(a2.reason, 'bad'); }
        else { sfx('confirm'); toast('已增派 1 架', 'ok'); }
        dirty.panel = true; dirty.hud = true;
        break;
      }
      case 'drop-plane': {
        var pr = S.findRouteByKey(st, key);
        if (!pr) break;
        var onl = S.planesOnRoute(st, key);
        if (onl.length <= 1) { sfx('deny'); toast('每航线至少保留 1 架，可改为减班或关线', 'bad'); break; }
        S.assignPlane(st, onl[onl.length - 1].id, null);
        sfx('confirm');
        toast('已撤回 1 架到机队', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }
      case 'freq':
        res = S.setFrequency(st, key, +val);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        /* 档位被夹取时响 deny 而不是 confirm：玩家点的是 6 班、系统只给了 1 班
         * （宽体洲际线单架物理上限就是 1~2），
         * 这是「你的指令没能完全执行」，用「被拒」的音色比「成功」更诚实 ——
         * 否则玩家会以为自己真的拿到了 6 班。 */
        if (res.clamped) { sfx('deny'); toast(res.reason || '档位已按上限调整', 'warn'); }
        else { sfx('click'); toast('班次已调整为每架每日 ' + res.perDay + ' 班', 'ok'); }
        dirty.panel = true;
        break;
      case 'fare':
        res = S.setFare(st, key, +val);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('click');
        toast('票价倍率 ' + res.fareMul.toFixed(2) + '×', 'ok');
        dirty.panel = true;
        break;
      case 'upgrade':
        /* 换机型要补差价、是重资产决策 → 响 confirm 而不是 click */
        res = S.upgradeRouteType(st, key, val.trim());
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('confirm');
        toast('已置换为 ' + res.to + '（' + res.count + ' 架，补差 ' + money(res.net) + '）', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      /* 整队换新（A1）：把该线老机整体换成同型号新机，维护费随之回落 */
      case 'renew': {
        res = S.renewRouteFleet(st, key);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('confirm');
        toast('机队已换新：' + res.count + ' 架（补差 ' + money(res.net) + '）', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }
      case 'close-route': {
        res = S.closeRoute(st, key);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        ui.selRoute = null;
        sfx('confirm');
        toast('航线已关闭，飞机已回到机队', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }

      /* ── 机队 ── */
      case 'buy-plane': {
        res = S.buyPlane(st, val.trim(), 1);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('confirm');
        toast('已购入 ' + AT.planeOf(val.trim()).name, 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }
      case 'sell-plane': {
        res = S.sellPlane(st, key);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        sfx('confirm');
        toast('已售出，回收 ' + money(res.value), 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
      }

      /* ── 对手榜：并购 ──
       * 二次确认在面板内完成（先 acquire 展开、再 acquire-confirm 执行）。
       * 为什么不用模态：模态层由 syncModal 按阶段驱动，季报/事件卡会抢占；
       * 面板内展开确认与既有 sel-route 详情同构，且开面板本就暂停计时。 */
      case 'acquire':
        sfx('click');
        ui.acquireId = key;
        dirty.panel = true;
        break;
      case 'acquire-cancel':
        sfx('click');
        ui.acquireId = null;
        dirty.panel = true;
        break;
      case 'acquire-confirm':
        res = S.acquireRival(st, key);
        if (!res.ok) { sfx('deny'); toast(res.reason, 'bad'); break; }
        ui.acquireId = null;
        sfx('confirm');
        toast('已完成对「' + res.name + '」的并购：接收 ' + res.routes + ' 条航线、' +
              res.planes + ' 架飞机', 'ok');
        dirty.panel = true; dirty.hud = true;
        break;
    }
  }

  /* 开航线：把三处选择（出发地/目的地/机型）合成一次调用。
   * 校验一律交给 sim（它才是唯一真源），UI 只负责把 reason 展示出来。
   *
   * ⚠ 组合动作：若所选机型在机队里没有闲置的，则**先买一架再开线**。
   *   为什么不让玩家自己去机队面板买两次：openRoute 要求「先有闲置飞机」，
   *   若 UI 只做单步调用，玩家选中最合适的机型后必然撞到
   *   「没有足够的闲置 XX」——而玩家刚刚明明看到这架飞机的价格就在选项里，
   *   这个反馈会被读成 bug 而不是规则。故这里把两件事合成一个动作，
   *   并在按钮上明确写出「购机 1 架并开通（¥XXX万）」，让玩家点之前就知道要花钱。
   *   资金不足时 sim 的 buyPlane 会给出 reason，直接透传即可。 */
  function doOpenRoute() {
    var st = ui.state;
    if (!ui.newTo) return { ok: false, reason: '请选择目的地' };
    if (!ui.newType) return { ok: false, reason: '请选择机型' };
    /* 出发地：跟随面板选择 —— 可以是未入网城市（目的地连回网络即可），
     * UI 不再擅自回落基地；「两端至少一端在网络」由 sim.openRoute 最终校验。 */
    var from = (ui.newFrom && AT.CITIES_BY_ID[ui.newFrom]) ? ui.newFrom : st.homeCityId;

    /* ⚠ 前置校验（2026-10-09）：本函数会「先买机、再开线」，若开线注定被拒
     *   （城市航线已满 / 机型等级不足），必须先拦住，否则会白买一架飞机。
     *   口径与 sim.openRoute 完全一致。 */
    var fromC0 = AT.CITIES_BY_ID[from];
    if (fromC0 && (fromC0.routes || 0) >= S.cityRouteCap(st, from)) {
      return { ok: false, reason: fromC0.name + ' 航线已达上限 ' + S.cityRouteCap(st, from) + ' 条' };
    }
    var toC0 = AT.CITIES_BY_ID[ui.newTo];
    if (toC0 && (toC0.routes || 0) >= S.cityRouteCap(st, ui.newTo)) {
      return { ok: false, reason: toC0.name + ' 航线已达上限 ' + S.cityRouteCap(st, ui.newTo) + ' 条' };
    }
    var pgate = S.planeLevelGate(st, from, ui.newTo, ui.newType);
    if (!pgate.ok) return { ok: false, reason: pgate.reason };

    var idle = S.idlePlanes(st).filter(function (p) { return p.type === ui.newType; }).length;
    if (!idle) {
      var T = AT.planeOf(ui.newType);
      var b = S.buyPlane(st, ui.newType, 1);
      if (!b.ok) return { ok: false, reason: b.reason || ('购置 ' + T.name + ' 失败') };
    }
    var res = S.openRoute(st, from, ui.newTo, ui.newType, 1);
    if (res.ok) {
      ui.newTo = null;
      ui.newType = null;
      /* 开线成功后面板回到顶部：表单已重置（目的地/机型清空），顶部是
       * ① 出发地区 —— 下一条线的决策从这里重新开始，而不是停在刚开完的③机型区。 */
      if (el.uPanelBody) el.uPanelBody.scrollTop = 0;
      dirty.panel = true; dirty.hud = true;
    }
    return res;
  }

  /* ───────────────────────── 模态层 ───────────────────────── */

  function onModalClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    var val = t.getAttribute('data-val');

    if (act === 'event-choice') {
      var okc = S.chooseEvent(ui.state, +val);
      if (!okc) { sfx('deny'); toast('选项无效', 'bad'); return; }
      sfx('confirm');
      closeModal();
      dirty.hud = true;
      toast('决策已生效', 'ok');
    } else if (act === 'close-report') {
      sfx('click');
      ui.reports.shift();
      if (ui.reports.length) showReport(ui.reports[0]);
      else closeModal();
    } else if (act === 'restart') {
      sfx('click');
      global.location.reload();
    }
  }

  function openModal(kind, html) {
    ui.modal = kind;
    if (el.uModalBody) el.uModalBody.innerHTML = html;
    if (el.uModal) el.uModal.classList.add('show');
    syncClockPause();      // 季报在屏 = 冻结回合计时（事件卡另有 sim 的 state.card 兜底）
  }

  /* 关模态：摘 ui.modal、收掉遮罩，并重算一次计时暂停。
   * 三处关模态（事件选项 / 季报读完 / 队列清空的兜底）以前各写一遍这三个动作；
   * 漏掉 syncClockPause 会留下「关掉季报后计时还冻着」这类静默 bug，故收敛到这一处。 */
  function closeModal() {
    ui.modal = null;
    if (el.uModal) el.uModal.classList.remove('show');
    syncClockPause();
  }

  /* 事件卡：sim 把当前卡挂在 state.card 上（直接是事件对象本身）。
   * ⚠ 不要读 state.card.event —— 那是旧版写法，sim 里是 state.card = ev。 */
  function showEvent(ev) {
    var html = '<div class="md-kind">突发事件</div>' +
      '<div class="md-title">' + h(ev.title) + '</div>' +
      '<div class="md-desc">' + h(ev.desc) + '</div>' +
      '<div class="md-opts">';
    ev.options.forEach(function (o, i) {
      var tag = '';
      var fx = o.effect || {};
      if (fx.type === 'cash') tag = moneyFull(fx.amount);
      else if (fx.type === 'demand_all' || fx.type === 'demand_region') tag = '需求 ' + (fx.mult > 0 ? '+' : '') + Math.round(fx.mult * 100) + '% · ' + fx.turns + '季';
      else if (fx.type === 'cost_all') tag = '成本 ' + (fx.mult > 0 ? '+' : '') + Math.round(fx.mult * 100) + '% · ' + fx.turns + '季';
      else if (fx.type === 'reputation') tag = '声誉 ' + (fx.amount > 0 ? '+' : '') + fx.amount;
      else if (fx.type === 'fleet_ground') tag = fx.count + ' 架停场 ' + fx.turns + ' 季';
      else if (fx.type === 'dev_push') tag = '城市开发度 +' + fx.amount;
      else if (fx.note) tag = fx.note;
      html += '<button class="mopt" data-act="event-choice" data-val="' + i + '" type="button">' +
        '<span class="mo-label">' + h(o.label) + '</span>' +
        (tag ? '<span class="mo-tag">' + h(tag) + '</span>' : '') +
        (fx.note && tag !== fx.note ? '<span class="mo-note">' + h(fx.note) + '</span>' : '') +
        '</button>';
    });
    html += '</div><div class="md-foot">处理完才能继续下一季度</div>';
    openModal('event', html);
  }

  /* 季报：对比上季净资产，列出收入/成本/净利与航线数变化。
   * 所有数字都来自 sim 写在 history 快照里的真实结算值，
   * 保证「收入 − 各项支出 = 净利润」在面板上能对上账。 */
  function showReport(rep) {
    var html = '<div class="md-kind">第 ' + rep.quarter + ' 季度结算</div>' +
      '<div class="md-title">' + (rep.net >= 0 ? '本季度盈利' : '本季度亏损') + '</div>' +
      '<div class="md-kv">' +
      '<div><span>营业收入</span><b>' + money(rep.revenue) + '</b></div>' +
      '<div><span>运营成本</span><b class="c-bad">−' + money(rep.cost) + '</b></div>' +
      (rep.groundCost ? '<div><span>地面与起降</span><b class="c-bad">−' + money(rep.groundCost) + '</b></div>' : '') +
      (rep.baseMaint ? '<div><span>基地维护</span><b class="c-bad">−' + money(rep.baseMaint) + '</b></div>' : '') +
      '<div><span>管理支出</span><b class="c-bad">−' + money(rep.overhead) + '</b></div>' +
      (rep.interest > 0 ? '<div><span>债务利息</span><b class="c-bad">−' + money(rep.interest) + '</b></div>' : '') +
      '<div class="md-total"><span>净利润</span><b class="' + (rep.net >= 0 ? 'c-good' : 'c-bad') + '">' +
        moneyFull(rep.net) + '</b></div>' +
      '<div><span>现金</span><b>' + money(rep.cash) + '</b></div>' +
      '<div><span>净资产</span><b>' + money(rep.netWorth) + (rep.nwDelta != null ?
        ' <i class="' + (rep.nwDelta >= 0 ? 'c-good' : 'c-bad') + '">(' +
        (rep.nwDelta >= 0 ? '+' : '') + money(rep.nwDelta) + ')</i>' : '') + '</b></div>' +
      '<div><span>客运量</span><b>' + (rep.pax || 0).toFixed(2) + ' 百万客</b></div>' +
      '<div><span>航线 / 机队</span><b>' + rep.routes + ' 条 / ' + rep.planes + ' 架</b></div>' +
      '</div>';
    if (rep.notes && rep.notes.length) {
      html += '<div class="md-notes">' + rep.notes.map(function (n) {
        return '<div>· ' + h(n) + '</div>';
      }).join('') + '</div>';
    }
    html += '<div class="md-actions"><button class="btn btn-pri" data-act="close-report" type="button">继续经营</button></div>';
    openModal('report', html);
  }

  /* 终局：评价 + 成长曲线数字 + 关键统计 */
  function showOver(st) {
    var v = S.verdict(st);
    var g = S.globalization(st);
    var rk = S.ranking(st);
    var my = 0;
    for (var i = 0; i < rk.length; i++) if (rk[i].isPlayer) { my = i + 1; break; }
    var first = st.history[0], last = st.history[st.history.length - 1];
    var html = '<div class="md-kind">经营期结束</div>' +
      '<div class="md-title">' + h(v.label) + '</div>' +
      '<div class="md-desc">' + h(v.desc) + '</div>' +
      '<div class="md-kv">' +
      '<div><span>最终排名</span><b>第 ' + my + ' / ' + rk.length + ' 名</b></div>' +
      '<div><span>净资产</span><b>' + money(st.history.length ? last.netWorth : 0) + '</b></div>' +
      '<div><span>全球化</span><b>' + g.pct + '%（' + g.cities + '/' + g.totalCities + ' 城 · ' +
        g.regions + '/' + g.totalRegions + ' 地区）</b></div>' +
      '<div><span>累计客运</span><b>' + (st.stats.paxTotal || 0).toFixed(1) + ' 百万客</b></div>' +
      '<div><span>机队规模</span><b>' + st.planes.length + ' 架</b></div>' +
      '<div><span>运营航线</span><b>' + st.routes.length + ' 条</b></div>' +
      '<div><span>城市开发贡献</span><b>' + Math.round(st.stats.devPushed) + ' 点 · ' +
        st.stats.citiesUpgraded + ' 次升级</b></div>' +
      (first ? '<div><span>开局净资产</span><b>' + money(first.netWorth) + '</b></div>' : '') +
      '</div>';

    /* ── 终局评分三维（D2，2026-10-09）──
     * 旧的终局只给一个标签，「大而低效」与「精耕细作」拿同一个评价。
     * 现在把规模 / 效率 / 覆盖三个分项与门槛摆出来，让玩家看懂差在哪 ——
     * 这一条与「后期无脑堆线」是同一个问题的两端：没有目标，就没有取舍。 */
    if (v.dims) {
      var dm = v.dims;
      var need = (C.verdictGiantScore == null ? 0.68 : C.verdictGiantScore);
      html += '<div class="md-notes"><div>· 终局综合分 <b>' + dm.score.toFixed(2) +
        '</b>（巨企门槛 ' + need.toFixed(2) + '：排名前 ' + (C.winRank || 3) +
        ' 且综合分达标才算巨企，堆规模但效率低不再自动算巨企）</div>' +
        '<div>· 效率按最近四季平均净利率 ' + (dm.margin * 100).toFixed(1) +
        '% 折算（' + ((C.verdictEffFloor == null ? 0.08 : C.verdictEffFloor) * 100).toFixed(0) +
        '% 以下记 0 分，' + ((C.verdictEffFull == null ? 0.20 : C.verdictEffFull) * 100).toFixed(0) +
        '% 及以上记满分）</div></div>' +
        '<div class="rc-bars">' +
        bar('规模', dm.scale, 1, dm.scale.toFixed(2)) +
        bar('效率', dm.eff, 1, dm.eff.toFixed(2)) +
        bar('覆盖', dm.cover, 1, dm.cover.toFixed(2)) +
        '</div>';
    }
    html += '<div class="md-actions"><button class="btn btn-pri" data-act="restart" type="button">再来一局</button></div>';
    openModal('over', html);
  }

  /* ───────────────────────── 渲染：HUD ───────────────────────── */

  function syncHud() {
    var st = ui.state;
    if (!st) return;
    if (el.uCompany) el.uCompany.textContent = st.companyName || '—';
    if (el.uQuarter) el.uQuarter.textContent = 'Q' + Math.min(st.quarter, C.totalQuarters || 60) +
      ' / ' + (C.totalQuarters || 60);
    if (el.uSpeed) el.uSpeed.textContent = (st.speed || 1) + '×';
    if (el.uCash) {
      el.uCash.textContent = money(st.cash);
      el.uCash.className = 'v' + (st.cash < 0 ? ' c-bad' : '');
    }
    if (el.uNet) el.uNet.textContent = money(S.netWorth(st));
    if (el.uRank) {
      var rk = S.ranking(st);
      var my = 0;
      for (var i = 0; i < rk.length; i++) if (rk[i].isPlayer) { my = i + 1; break; }
      el.uRank.textContent = rk.length ? (my + ' / ' + rk.length) : '—';
      el.uRank.className = 'v' + (my === 1 ? ' c-good' : '');
    }
    if (el.uRoutes) el.uRoutes.textContent = st.routes.length;
    if (el.uPlanes) {
      var idle = S.idlePlanes(st).length;
      el.uPlanes.textContent = st.planes.length + (idle ? ' (' + idle + ' 闲置)' : '');
      el.uPlanes.className = 'v' + (idle ? ' c-warn' : '');
    }
    if (el.uDev) {
      var g = S.globalization(st);
      el.uDev.textContent = g.pct + '%';
    }
    // 回合计时条
    var rem = S.quarterRemain(st);
    if (el.uTimerBar) {
      var total = C.quarterSeconds || 22;
      var w = rem == null ? 100 : Math.max(0, Math.min(100, (1 - rem / total) * 100));
      el.uTimerBar.style.width = w + '%';
    }
    if (el.uTimer) {
      el.uTimer.textContent = st.paused
        ? '已暂停'
        : (rem == null
            ? (st.card ? '待决策' : (st.phase === 'over' ? '已结束' : '—'))
            : Math.ceil(rem) + 's');
    }
  }

  /* ───────────────────────── 渲染：面板 ───────────────────────── */

  /* 面板体渲染的签名缓存：内容没变就不碰 DOM。
   *
   * ⚠ 这不是「省一点性能」的优化，是修一个真实的手感 bug：
   *   `innerHTML = html` 会**整树替换**子节点。若这次替换恰好落在一次点击的
   *   mousedown 与 mouseup 之间，Chrome 会认为「按下的节点已被移除」而**根本不派发
   *   click** —— 玩家的感受就是「点了航线卡片没反应」，且重试一次往往就好了。
   *   面板本来就有 1Hz 定时重刷（见 frame），而它绝大多数时候渲染出的是同一份 HTML，
   *   于是每秒都在制造一次这样的空窗。低帧率机型上窗口更大（实测冒烟：12fps 连中两次）。
   *   内容真变了才重建，等于把这个窗口从「每秒一次」压到「只在季结算等真变化时」。 */
  var panelSig = null;
  function syncPanel() {
    if (!ui.panel || !el.uPanelBody) return;
    var st = ui.state;
    var html, title, sub;

    /* 副标题：面板头部标题下的一行「上下文读数」。
     * 为什么值得占一行：抽屉里三个面板的可操作内容都依赖当前处境
     * （总利润 / 闲置机 / 出发地），把这些写进头部，玩家不必先滑一遍列表。 */
    if (ui.panel === 'routes') {
      title = '我的航线';
      html = renderRoutes(st);
      if (!st.routes.length) { sub = '暂无航线'; }
      else {
        var sum = 0;
        st.routes.forEach(function (r) { var d = S.settleRoute(st, r); if (d) sum += d.profit; });
        sub = st.routes.length + ' 条 · 本季合计 ' + moneyFull(sum);
      }
    } else if (ui.panel === 'fleet') {
      title = '机队管理';
      html = renderFleet(st);
      var idleN = S.idlePlanes(st).length;
      sub = st.planes.length + ' 架 · ' + (idleN ? idleN + ' 架闲置' : '全部在飞');
    } else if (ui.panel === 'rivals') {
      title = '竞争对手';
      html = renderRivals(st);
      var myR = 0, rk = S.ranking(st);
      for (var ri = 0; ri < rk.length; ri++) if (rk[ri].isPlayer) { myR = ri + 1; break; }
      sub = st.rivals.length + ' 家在营 · 你排第 ' + myR + ' / ' + rk.length;
    } else {
      title = '开通新航线';
      html = renderNewRoute(st);
      var fromC = AT.CITIES_BY_ID[ui.newFrom || st.homeCityId];
      var toC = ui.newTo ? AT.CITIES_BY_ID[ui.newTo] : null;
      sub = '从 ' + (fromC ? fromC.name : '—') + ' 出发' + (toC ? ' → ' + toC.name : '');
    }
    /* 签名带上面板名与副标题：避免「换面板却撞上相同 HTML」时误跳过
     * （如空航线 vs 空机队），也保证副标题变化能被刷出来。 */
    var sig = ui.panel + '\u0000' + sub + '\u0000' + html;
    /* 内容没变就不重建 DOM（见上）。这种情况滚动标记也没有意义，一并清掉：
     * 否则它会留到下一次无关的重绘里才生效（例如 1Hz 的季度刷新），变成「莫名跳一下」。 */
    if (sig === panelSig) { ui.scrollType = false; ui.scrollOpen = false; return; }
    panelSig = sig;
    if (el.uPanelTitle) el.uPanelTitle.textContent = title;
    if (el.uPanelSub) el.uPanelSub.textContent = sub;
    el.uPanelBody.innerHTML = html;

    /* 选完目的地后把③机型区滚进视野。
     * 为什么需要：面板只留了一条滚动条（不再给列表限高内部滚动），② 一长，
     * ③ 就落在折线以下 —— 玩家点了目的地却看不到机型与开通按钮，
     * 会以为「点了没反应」（这正是当初引入嵌套滚动条要解决的问题）。
     * 用 rect 差值算位移，不依赖 offsetParent 是谁（offsetTop 在这里不可靠）。 */
    if (ui.scrollType) {
      ui.scrollType = false;
      var tsec = el.uPanelBody.querySelector('.nw-type');
      if (tsec) {
        var br = el.uPanelBody.getBoundingClientRect();
        var sr = tsec.getBoundingClientRect();
        el.uPanelBody.scrollTop += (sr.top - br.top) - 6;
      }
    }
    /* 选完机型后把「开通」按钮带进视野。只在按钮落在折线以下时滚
     * （sr.bottom > br.bottom），已可见就不动 —— 避免明明看得见还跳一下。
     * 用 bottom 对 bottom 的差值：按钮露出即可，机型区仍留在按钮上方可对照。 */
    if (ui.scrollOpen) {
      ui.scrollOpen = false;
      var goBtn = el.uPanelBody.querySelector('.nw-actions');
      if (goBtn) {
        var abr = el.uPanelBody.getBoundingClientRect();
        var asr = goBtn.getBoundingClientRect();
        if (asr.bottom > abr.bottom) el.uPanelBody.scrollTop += asr.bottom - abr.bottom;
      }
    }
  }

  function renderRoutes(st) {
    if (!st.routes.length) {
      return '<div class="empty">还没有航线。<br>点底部「新航线」开通第一条 —— ' +
        '飞机不飞就不赚钱，但也会亏持有成本。</div>';
    }
    var out = '<div class="rlist">';
    st.routes.forEach(function (r) {
      var ca = AT.CITIES_BY_ID[r.a], cb = AT.CITIES_BY_ID[r.b];
      // ⚠ 利润/客座率一律取自 sim，不在 UI 重算
      var d = S.settleRoute(st, r);
      var n = S.planesOnRoute(st, r.key).length;
      var T = AT.planeOf(r.type);
      var dist = S.routeDistance(st, r.a, r.b);
      var slot = S.routeSlots(st, r.a, r.b);
      var sel = ui.selRoute === r.key;
      var cls = 'rcard' + (sel ? ' sel' : '') + (d && d.profit < 0 ? ' loss' : '');
      var lg = S.planeLevelGate(st, r.a, r.b, r.type);
      out += '<div class="' + cls + '" data-act="sel-route" data-key="' + h(r.key) + '">' +
        '<div class="rc-top"><span class="rc-name">' + h(ca ? ca.name : r.a) + ' — ' +
          h(cb ? cb.name : r.b) + '</span>' +
          '<span class="rc-profit ' + (d && d.profit >= 0 ? 'c-good' : 'c-bad') + '">' +
          (d ? moneyFull(d.profit) : '—') + '</span></div>' +
        '<div class="rc-sub">' + h(T.name) + ' ×' + n + ' 架 · 每架每日 ' + (r.perDay || 3) + ' 班 · ' +
          num(dist) + ' km</div>' +
        '<div class="rc-bars">' +
          bar('客座率', d ? d.realLf : 0, 1, d ? pct(d.realLf, 0) : '—') +
          bar('槽位', d ? Math.min(1, (d.perDay * n) / Math.max(1, slot)) : 0, 1,
              d ? Math.round(d.perDay * n) + '/' + Math.round(slot) + ' 班' : '—') +
        '</div>' +
        (d && d.slotTight ? '<div class="rc-hint warn">时刻已饱和 —— 加机不再增班，考虑换更大机型</div>' : '') +
        (d && d.demandThin ? '<div class="rc-hint">需求偏薄 —— 客座率偏低，可减班或换小机型</div>' : '') +
        (d && d.capacityTight ? '<div class="rc-hint warn">运力吃紧 —— 需求撑满航班，可加机</div>' : '') +
        (lg && !lg.ok ? '<div class="rc-hint warn">城市等级不足 —— ' + h(T.name) +
          ' 需两端 ≥' + lg.need + ' 级（现最低 ' + lg.minLv + ' 级）。该线仍在运营，' +
          '但不能再在此追加同型飞机</div>' : '') +
        '</div>';

      if (sel) out += renderRouteDetail(st, r, d, n, T, dist, slot);
    });
    out += '</div>';
    return out;
  }

  function bar(label, v, max, txt) {
    var w = max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
    return '<div class="brow"><span class="bl">' + h(label) + '</span>' +
      '<span class="bt"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
      '<span class="bv">' + h(txt) + '</span></div>';
  }

  /* 航线详情：频次档位 / 票价 / 加机 / 换机型 / 关线
   * 这是本作操作密度最高的面板，所有按钮都直接映射 sim 的指令接口。 */
  function renderRouteDetail(st, r, d, n, T, dist, slot) {
    var out = '<div class="rdetail">';

    /* 频次档位：档位含义是「每架每日班次」，故列表里要标出换算后的航线总班次 */
    out += '<div class="rd-sec"><div class="rd-h">频次档位（每架每日）</div><div class="rd-btns">';
    var typeCap = S.maxPerDayFor(r.type, dist);
    (C.freqTiers || []).forEach(function (ft) {
      var total = ft.perDay * n;
      var over = ft.perDay > typeCap || total > Math.min(C.routeMaxPerDay || 20, slot);
      var cur = (r.perDay || 3) === ft.perDay;
      out += '<button class="chip' + (cur ? ' on' : '') + (over ? ' over' : '') +
        '" data-act="freq" data-key="' + h(r.key) + '" data-val="' + ft.perDay + '" type="button">' +
        ft.perDay + ' 班' + (cur ? '' : '<i>总' + total + '</i>') + '</button>';
    });
    out += '</div><div class="rd-note">本机单架上限 ' + typeCap + ' 班/日 · 该线时刻上限 ' +
      Math.round(slot) + ' 班/日（合计）</div></div>';

    /* 票价：0.70 ~ 1.40 五档。sim 会夹取，这里按夹取后的值标 on。 */
    out += '<div class="rd-sec"><div class="rd-h">票价策略</div><div class="rd-btns">';
    [['低价', 0.78], ['偏低', 0.90], ['标准', 1.0], ['偏高', 1.12], ['高价', 1.28]].forEach(function (f) {
      var cur = Math.abs((r.fareMul || 1) - f[1]) < 0.02;
      out += '<button class="chip' + (cur ? ' on' : '') + '" data-act="fare" data-key="' + h(r.key) +
        '" data-val="' + f[1] + '" type="button">' + f[0] + '<i>' + f[1].toFixed(2) + '×</i></button>';
    });
    out += '</div></div>';

    /* 运力：架数到顶时把「加 1 架」置灰并说明原因 —— 再买也只是闲置，
     * 不如在按下去之前就告诉玩家「出路是换机型」。上限口径来自 sim，
     * UI 不自己算（见 S.maxPlanesForRoute）。 */
    var planeCap = S.maxPlanesForRoute(st, r);
    var capFull = n >= planeCap;
    /* 机型等级门槛（2026-10-09）：该线现有若已越级（城市降级导致），
     * 加派同型会被 sim 拒绝 —— 置灰并说明（已开通的线仍可继续运营）。 */
    var typeGate = S.planeLevelGate(st, r.a, r.b, r.type);
    var addBlock = capFull || !typeGate.ok;
    out += '<div class="rd-sec"><div class="rd-h">运力（' + n + ' / ' + planeCap + ' 架）</div><div class="rd-btns">' +
      '<button class="btn' + (addBlock ? ' dis' : '') + '"' + (addBlock ? ' disabled' : '') +
      ' data-act="add-plane" data-key="' + h(r.key) +
      '" data-val="' + h(r.type) + '" type="button">' +
      (capFull ? '时刻已满 · ' + planeCap + ' 架'
               : (!typeGate.ok ? '城市等级不足 · 不能加派'
                               : '加 1 架 ' + h(T.name) + '（' + money(T.price) + '）')) + '</button>' +
      '<button class="btn" data-act="drop-plane" data-key="' + h(r.key) + '" type="button">撤回 1 架</button>' +
      '</div>' +
      (capFull ? '<div class="rd-note">该线时刻已用满：再加机不会增班，只会白付持有成本 —— 请换更大机型</div>' : '') +
      (!typeGate.ok ? '<div class="rd-note c-warn">该线两端城市等级已低于 ' + h(T.name) +
        ' 所需（≥ Lv' + typeGate.need + '）：现有飞机照常运营，但不能再加派同型</div>' : '') +
      '</div>';

    /* 换机型：槽位满后唯一出路，故只在机型可升级时给按钮。
     * 置换本质是「退役 + 新购」，同样受购机资格约束（商飞专供国航）。 */
    var cands = AT.PLANES.filter(function (p) {
      return p.range >= dist && p.id !== r.type && p.price > T.price &&
             AT.canBuyPlane(p, st.airlineId);
    });
    if (cands.length) {
      /* 机型等级门槛（2026-10-09 重定）：换装到「两端城市等级不够」的机型
       * 现在会被 sim 直接拒绝（硬禁），故按钮置灰并说明所需等级。 */
      var upLv = S.routeGateLevel(st, r.a, r.b);
      out += '<div class="rd-sec"><div class="rd-h">置换机型（补差价，' + n + ' 架一起换 · 该线两端最低等级 Lv' +
        upLv + '）</div><div class="rd-btns">';
      cands.forEach(function (p) {
        var req = AT.planeLevelMin(p);
        var overGate = req > upLv;
        out += '<button class="btn' + (overGate ? ' dis' : '') + '"' + (overGate ? ' disabled' : '') +
          ' data-act="upgrade" data-key="' + h(r.key) +
          '" data-val="' + p.id + '" type="button">换 ' + h(p.name) +
          '<i>' + p.seats + ' 座</i>' +
          (overGate ? '<i class="c-warn">需两端 ≥ Lv' + req + '</i>' : '') + '</button>';
      });
      out += '</div><div class="rd-note">旧机按机龄折价回收（约 92% 残值）' +
        ' · 大型客机需航线两端城市等级达标（Lv3 起用宽体、Lv4 远程、Lv5 巨无霸）</div></div>';
    }

    /* 成本明细：把 settleRoute 的分解原样列出，让玩家看得见钱花在哪 */
    if (d) {
      out += '<div class="rd-sec"><div class="rd-h">本季成本构成</div><div class="rd-cost">' +
        costRow('航油', d.fuel) + costRow('起降地服', d.landing) + costRow('机组', d.crew) +
        costRow('维护', d.maint) + costRow('飞机持有', d.ownership) +
        '<div class="cc-total"><span>合计支出</span><b>−' + money(d.cost) + '</b></div>' +
        '<div class="cc-total"><span>收入</span><b class="c-good">' + money(d.revenue) + '</b></div>' +
        '</div></div>';
    }

    /* ── 机队老化与整队换新（A1，2026-10-09）──
     * 机龄会抬高维护费（sim 的 maintAgeF）。这里把「平均机龄 → 维护上浮比例」
     * 与「整队换新的补差价 / 回本期」摆在同一处 —— 换不换由玩家按回本期判断，
     * 而不是给一个隐含的自动兜底。 */
    var rn = S.renewInfo(st, r.key);
    if (d && d.avgPlaneAge >= 6 && rn.ok) {
      var affordRn = st.cash >= rn.net;
      out += '<div class="rd-sec"><div class="rd-h">机队老化</div><div class="rd-note">' +
        '该线平均机龄 <b>' + Math.round(d.avgPlaneAge) + ' 季</b>，维护费已上浮 ' +
        Math.round((d.maintAgeF - 1) * 100) + '%' +
        (isFinite(rn.payback)
          ? '；整队换新 ' + rn.count + ' 架需补差 ' + money(rn.net) + '，每季省维护 ' +
            money(Math.round(rn.savedPerQuarter)) + '，回本约 ' + rn.payback.toFixed(1) + ' 季'
          : '；整队换新当前不划算（节省不足以回本）') +
        '</div>' +
        '<button class="btn' + (affordRn ? '' : ' dis') + '"' + (affordRn ? '' : ' disabled') +
        ' data-act="renew" data-key="' + h(r.key) + '" type="button">整队换新 · ' +
        rn.count + ' 架（补差 ' + money(rn.net) + '）</button></div>';
    }

    out += '<div class="rd-sec"><button class="btn btn-danger" data-act="close-route" data-key="' +
      h(r.key) + '" type="button">关闭这条航线</button></div>';
    out += '</div>';
    return out;
  }

  function costRow(k, v) {
    return '<div class="cc-row"><span>' + h(k) + '</span><b>−' + money(v) + '</b></div>';
  }

  function renderFleet(st) {
    var idle = S.idlePlanes(st);
    /* 顶部：公司信息 + 特色技能。玩家的航司身份与技能常驻可见 ——
     * 技能是被动生效的，若不显式展示，玩家感觉不到它存在（静默失效的另一种形态）。 */
    var home = AT.CITIES_BY_ID[st.homeCityId] || {};
    var tr = S.traitOf(st);
    var out = '<div class="fsec"><div class="rd-h">航空公司</div>' +
      '<div class="frow"><span>' + h(st.companyName || '—') + '</span>' +
      '<span class="fstate">基地 · ' + h(home.name || '—') + '</span></div>' +
      '<div class="rd-note">特色技能「' + h(tr.name) + '」：' + h(tr.desc) + '</div></div>';
    if (idle.length) {
      out += '<div class="fsec warn-sec"><div class="rd-h">闲置飞机 ' + idle.length + ' 架 —— 不飞也在亏持有成本</div>' +
        '<div class="flist">';
      idle.forEach(function (p) {
        out += '<div class="frow"><span>' + h(AT.planeOf(p.type).name) + ' · ' + h(p.reg) +
          ' · 机龄 ' + p.ageQ + ' 季</span>' +
          '<span class="fbtns"><button class="btn btn-sm" data-act="sell-plane" data-key="' +
          h(p.id) + '" type="button">出售</button></span></div>';
      });
      out += '</div><div class="rd-note">在航线详情里「加 1 架」会自动派机；也可先买机再派</div></div>';
    }

    out += '<div class="fsec"><div class="rd-h">购买新机</div><div class="plist">';
    AT.PLANES.forEach(function (p) {
      var afford = st.cash >= p.price;
      /* 商飞专供国航（见 data.js canBuyPlane）：置灰并说明原因，不静默隐藏 ——
       * 让玩家知道「有这架飞机、但它不属于我」，而不是以为机型列表做漏了。 */
      var buyable = AT.canBuyPlane(p, st.airlineId);
      out += '<div class="prow' + (afford && buyable ? '' : ' no') + '">' +
        '<div class="pinfo"><b>' + h(p.name) + '</b>' +
        '<span>' + p.seats + ' 座 · 航程 ' + p.range + ' km · ' + p.speed + ' km/h · 每季维护 ' + p.upkeep + ' 万</span>' +
        (buyable ? '' : '<i class="c-warn">中国商飞专供 · 仅中国国际航空可采购</i>') + '</div>' +
        '<div class="pact"><span class="price">' + money(p.price) + '</span>' +
        '<button class="btn btn-sm' + (afford && buyable ? '' : ' dis') + '" data-act="buy-plane" data-val="' + p.id +
        '" type="button">' + (buyable ? (afford ? '购买' : '资金不足') : '专供国航') + '</button></div></div>';
    });
    out += '</div></div>';

    var all = st.planes.slice().sort(function (a, b) { return b.ageQ - a.ageQ; });
    if (all.length) {
      out += '<div class="fsec"><div class="rd-h">全部飞机 ' + all.length + ' 架</div><div class="flist">';
      all.forEach(function (p) {
        var rk = p.routeKey ? S.findRouteByKey(st, p.routeKey) : null;
        var dest = rk ? ((AT.CITIES_BY_ID[rk.a] || {}).name + '—' + (AT.CITIES_BY_ID[rk.b] || {}).name) : null;
        out += '<div class="frow"><span>' + h(AT.planeOf(p.type).name) + ' · ' + h(p.reg) + '</span>' +
          '<span class="fstate">' + (p.onGround > 0 ? '<i class="c-bad">停场 ' + p.onGround + ' 季</i>' :
            (dest ? h(dest) : '<i class="c-warn">闲置</i>')) + '</span></div>';
      });
      out += '</div></div>';
    }
    return out;
  }

  /* 对手榜 + 并购入口。所有数值来自 S.ranking（已按净资产排序）与
   * S.acquireInfo（资格与报价的唯一真源）—— UI 不重算任何经济量。
   * 收购走面板内二次确认（ui.acquireId），不弹模态：见 onPanelClick 的说明。 */
  function renderRivals(st) {
    var rk = S.ranking(st);
    var out = '<div class="fsec"><div class="rd-h">全球排名（按净资产）</div><div class="flist">';
    rk.forEach(function (row, i) {
      var dot = '<i style="display:inline-block;width:8px;height:8px;border-radius:50%;' +
        'background:' + h(row.color) + ';margin-right:6px"></i>';
      if (row.isPlayer) {
        out += '<div class="frow"><span>' + dot + (i + 1) + '. ' + h(row.name) +
          ' <b class="c-good">（你）</b></span>' +
          '<span class="fstate">净资产 ' + money(row.netWorth) + '</span></div>';
        return;
      }
      var rv = null;
      st.rivals.forEach(function (x) { if (x.id === row.id) rv = x; });
      if (!rv) return;
      var info = S.acquireInfo(st, row.id);
      var home = AT.CITIES_BY_ID[rv.homeCityId] || {};
      var expanded = ui.acquireId === row.id;
      out += '<div class="frow"><span>' + dot + (i + 1) + '. ' + h(row.name) + '</span>' +
        '<span class="pact">' +
        (info.ok
          ? '<span class="price">' + money(info.price) + '</span>' +
            '<button class="btn btn-sm" data-act="acquire" data-key="' + h(row.id) +
            '" type="button">收购</button>'
          : '<button class="btn btn-sm dis" type="button">不可收购</button>') +
        '</span></div>' +
        '<div class="rd-note">' + h(home.name || '—') + ' · 机队 ' + row.fleet + ' 架 · 航线 ' +
        row.routes + ' 条 · 净资产 ' + money(row.netWorth) +
        (info.crisis ? ' · <i class="c-warn">现金告急（折价）</i>' : '') +
        (info.ok ? '' : ' · <i class="c-warn">' + h(info.reason) + '</i>') + '</div>';

      if (expanded && info.ok) {
        out += '<div class="fsec" style="margin:8px 0">' +
          '<div class="rd-note">确认并购「' + h(row.name) + '」：接收 ' + info.gainRoutes +
          ' 条航线、' + info.gainPlanes + ' 架飞机，对手退出市场。报价 ' + money(info.price) +
          '（对手净资产 ' + money(info.base) + ' × ' + info.mult.toFixed(2) + '）</div>' +
          '<div class="pact" style="margin-top:8px">' +
          '<button class="btn btn-sm btn-danger" data-act="acquire-confirm" data-key="' + h(row.id) +
          '" type="button">确认收购</button>' +
          '<button class="btn btn-sm" data-act="acquire-cancel" type="button" ' +
          'style="margin-left:8px">取消</button></div></div>';
      }
    });
    out += '</div></div>';
    return out;
  }

  function renderNewRoute(st) {
    /* 出发城市：允许**未入网**城市（2026-10-01 用户反馈：未入网的城市也应该能连回
     * 自己的网络 —— sim.openRoute 本就只要求「两端至少一端在网络」，UI 不该更严）。
     * 这里只自愈空值/无效 id（城市不会被删除，不需要回落基地）。
     * 真正的连通性规则仍在 sim.openRoute（唯一真源）。 */
    var net = S.networkCityIds(st);
    var bases = S.baseCitySet(st);
    /* 出发地必须是基地城市（只有基地才能扩展航线，见 sim.openRoute）。
     * 若当前选择不是基地（从旧存档或 Tab 栏直接进入），回落主基地。 */
    if (!ui.newFrom || !AT.CITIES_BY_ID[ui.newFrom] || !bases[ui.newFrom]) ui.newFrom = st.homeCityId;
    var fromId = ui.newFrom;
    var from = AT.CITIES_BY_ID[fromId];
    var out = '<div class="nw-sec"><div class="rd-h">① 出发城市（基地）</div><div class="chips">';
    // 出发地：只列基地城市（只有基地才能扩展航线）
    var fromList = [];
    (st.bases || [st.homeCityId]).forEach(function (cid) {
      if (fromList.indexOf(cid) < 0) fromList.push(cid);
    });
    fromList.slice(0, 12).forEach(function (cid) {
      var c = AT.CITIES_BY_ID[cid];
      if (!c) return;
      out += '<button class="chip' + (cid === fromId ? ' on' : '') + '" data-act="pick-from" data-city="' +
        cid + '" type="button">' + h(c.name) + '</button>';
    });
    out += '</div></div>';

    /* 目的地：列出**所有**未开通的城市，并标注距离与可行性。
     *
     * ⚠ 排序策略（2026-09-14 实机修正）：**先按「当下能不能马上飞」分档，档内再按需求降序**。
     *
     * 旧版纯按需求降序，后果实测如下（开局 800 万、只有支线机）：
     *   列表前几位全是纽约(11859km) / 洛杉矶 / 芝加哥 这类洲际线 —— 需求指数最高，
     *   但现有机型一架都飞不到，且需要的宽体机 3900 万**买不起**。
     *   玩家照着排在第一位的「最赚的线」点进去，看到的是一列「航程不足」，
     *   而唯一可点的机型写着「资金不足」。界面没错，但它把玩家领进了死胡同。
     *
     * 分档规则（两档，语义清楚、不引入新参数）：
     *   ① 现在就能飞：机队里有闲置机，且航程够     → 排最前，tag 不显示
     *   ② 能飞但要买机：航程够，但机队没有、且买得起 → 次之
     *   ③ 航程够但买不起 / 航程不够               → 沉到最后（仍可见，作为长期目标）
     * 档内一律按潜在需求降序 —— 保留「哪条线最赚钱」这个玩家直觉。
     *
     * ⚠ 潜在需求取自 S.routePotential（sim 的真源），不在 UI 重算。 */
    var idleTypes = {};
    S.idlePlanes(st).forEach(function (p) { idleTypes[p.type] = 1; });
    /* 全机队的机型集合（不只闲置）：商飞专供判定要放行「旧存档里已持有的
     * 商飞机」—— 只挡新购不追溯，手里的机仍能用来开新线。 */
    var ownedTypes = {};
    st.planes.forEach(function (p) { ownedTypes[p.type] = 1; });
    var cands = [];
    st.cities.forEach(function (c) {
      if (c.id === fromId) return;
      if (S.findRoute(st, fromId, c.id)) return;
      var dist = S.routeDistance(st, fromId, c.id);
      /* 机型等级门槛（2026-10-09 重定）：两端城市等级决定可用机型上限
       * （Lv3 起可用宽体、Lv4 远程、Lv5 巨无霸），取两端较小者。 */
      var gateLv = Math.min(from.level || 1, c.level || 1);
      /* reachAll：够得到 + 有购机资格/已持有的全部机型（用于航程/等级两种「不可达」文案的区分）。
       * reach：再按两端等级过滤 —— 越级机型现在会被 sim 硬拒，不进入可达集合。 */
      var reachAll = AT.PLANES.filter(function (p) {
        return p.range >= dist && (AT.canBuyPlane(p, st.airlineId) || ownedTypes[p.id]);
      });
      var reach = reachAll.filter(function (p) { return AT.planeLevelMin(p) <= gateLv; });
      var canFlyNow = reach.some(function (p) { return idleTypes[p.id]; });
      var canBuy = reach.some(function (p) { return st.cash >= p.price; });
      /* 基地扩展约束：出发地已是基地（见上方），sim.openRoute 的「至少一端是基地」
       * 自动满足，目的地无网络连通性限制。 */
      var badNet = false;
      /* 城市航线上限（2026-10-09 加，与 sim.openRoute 同口径）：两端任一已满则不可开 */
      var capFull = (from.routes || 0) >= S.cityRouteCap(st, fromId) ||
        (c.routes || 0) >= S.cityRouteCap(st, c.id);
      cands.push({
        c: c, dist: dist, pot: S.routePotential(st, fromId, c.id),
        reach: reach, reachAll: reachAll, gateLv: gateLv,
        canFlyNow: canFlyNow, canBuy: canBuy, badNet: badNet, capFull: capFull,
        tier: (badNet || capFull) ? 2 : (canFlyNow ? 0 : (reach.length && canBuy ? 1 : 2)),
        stocked: canFlyNow
      });
    });
    cands.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;   // 先按可行性分档
      return b.pot - a.pot;                            // 档内按需求降序
    });

    out += '<div class="nw-sec"><div class="rd-h">② 目的地（先列现在就能飞的，再按需求排序）' +
      '</div><div class="chips">';
    cands.forEach(function (x) {
      var ok = x.reach.length > 0;
      var tag = '';
      if (x.badNet) {
        tag = '<i class="c-bad">未与你的网络连通 · 不能凭空开线</i>';
      } else if (x.capFull) {
        /* 两端任一城市航线上限已满（cap = 等级，基地 +2）：不可再新开 */
        var fullCity = (from.routes || 0) >= S.cityRouteCap(st, fromId) ? from : x.c;
        tag = '<i class="c-bad">' + h(fullCity.name) + ' 航线已达上限 ' +
          S.cityRouteCap(st, fullCity.id) + ' 条 · 不能再开</i>';
      } else if (!ok) {
        tag = x.reachAll.length
          ? '<i class="c-bad">两端城市等级不足（最低 Lv' + x.gateLv + '）· 无合适机型</i>'
          : '<i class="c-bad">超出现有机型航程</i>';
      } else if (!x.canFlyNow) {
        var cheapest = null;
        x.reach.forEach(function (p) {
          if (cheapest === null || p.price < cheapest.price) cheapest = p;
        });
        /* 文案取短（2026-09-29 面板瘦身）：每个 chip 原来 3 行、其中「机队没有」与
         * 机型细节在③区还会逐型再说一遍，这里只留「要买哪架、多少钱」——
         * 12 行 × 省下的一行 ≈ 190px，面板短一截。 */
        tag = x.canBuy
          ? '<i class="c-warn">需现购 ' + h(cheapest.name) + ' ' + money(cheapest.price) + '</i>'
          : '<i class="c-bad">' + h(cheapest.name) + ' ' + money(cheapest.price) + ' · 买不起</i>';
      }
      out += '<button class="chip chip-wide' + (ui.newTo === x.c.id ? ' on' : '') +
        (x.tier < 2 ? '' : ' over') +
        '"' + (x.tier < 2 ? ' data-act="pick-to" data-city="' + x.c.id + '"' : ' disabled') +
        ' type="button">' +
        '<span class="ci-name">' + h(x.c.name) + ' <em class="ci-lv">Lv' + (x.c.level || 1) + '</em></span>' +
        '<span class="ci-meta">' + num(x.dist) + 'km · 需求 ' + x.pot.toFixed(1) + ' · 航线 ' +
        (x.c.routes || 0) + '/' + S.cityRouteCap(st, x.c.id) + '</span>' +
        (tag || '') + '</button>';
    });
    out += '</div></div>';

    /* 机型：只列飞得到的，并按「总价」排序。
     * 用 S.idealSeatsFor 给出建议座位量，帮玩家判断该买哪一档。
     *
     * ⚠ 必须标明「机队里有没有这架」：
     *   openRoute **不会自动购机** —— 它要求有闲置飞机（sim 的语义是
     *   「先买机、再开线」）。若面板只列出可飞机型而不区分库存，
     *   玩家会挑一架看起来最合适的（往往是最贵的宽体），点开通才被告知
     *   「没有足够的闲置 XX」—— 白白浪费一次操作。
     *   故：有库存的显示「可派 N 架」，没库存的显示「需现购」并让按钮
     *   走「先买机再开线」的组合动作（见 doOpenRoute）。 */
    var selDist = ui.newTo ? S.routeDistance(st, fromId, ui.newTo) : null;
    if (ui.newTo) {
      /* ⚠ idealSeatsFor 返回的是**整条线需要的总座位量**（需求 ÷ 总班次 ÷ 客座率），
       *   不是「单机该买多少座」—— 上海—纽约会算出 2000+ 座，那是多架累加的结果。
       *   直接写成「建议约 N 座」会被读成单机指标（实机确认过这个歧义），
       *   故标注清楚「全线合计」，并额外用 bestNeededType 给出「最省的能飞机型」，
       *   两者一起才够玩家做决策。 */
      var ideal = S.idealSeatsFor(st, fromId, ui.newTo);
      var needType = S.bestNeededType(st, selDist);
      /* 机型等级门槛（2026-10-09 重定）：该线两端城市的**最低等级**。大型客机
       * 需两端达标（Lv3 宽体 / Lv4 远程 / Lv5 巨无霸），不达标在 sim 被硬拒。 */
      var nwGateLv = S.routeGateLevel(st, fromId, ui.newTo);
      out += '<div class="nw-sec nw-type"><div class="rd-h">③ 机型（全线需约 ' + Math.round(ideal) +
        ' 座 · 最省能飞 ' + h(AT.planeOf(needType).name) +
        ' · 该线两端最低等级 Lv' + nwGateLv + '）</div><div class="chips">';
      /* 先算出「推荐机型」：在可飞机型里，选单机座位数最接近 `需要座位/3` 的一款。
       * 为什么是 /3：一条线要填满槽位大约需要 3 架（与 sim 的 idealSeatsFor
       * 内部同款假设一致），故单架理想座位 ≈ 总需求 / 3。
       * 这是给玩家的**提示**而非硬约束 —— 真正取舍仍由玩家按价格、
       * 库存、以及后续换机型余地自己决定。 */
      var perPlaneNeed = ideal / 3;
      /* 推荐机型只从「飞得到 + 有购机资格（或已持有）+ 等级达标」里挑 ——
       * 推荐一枚点不了的机型比不推荐更糟。 */
      var recPool = AT.PLANES.filter(function (p) {
        return p.range >= selDist && (AT.canBuyPlane(p, st.airlineId) || ownedTypes[p.id]) &&
          AT.planeLevelMin(p) <= nwGateLv;
      });
      var recId = null, recGap = Infinity;
      recPool.forEach(function (p) {
        var gap = Math.abs(p.seats - perPlaneNeed);
        if (gap < recGap) { recGap = gap; recId = p.id; }
      });

      AT.PLANES.forEach(function (p) {
        var idleOf = S.idlePlanes(st).filter(function (x) { return x.type === p.id; }).length;
        if (p.range < selDist) {
          out += '<button class="chip chip-wide over" type="button" disabled>' + h(p.name) +
            '<i>航程不足（需 ' + num(selDist) + 'km）</i></button>';
          return;
        }
        /* 商飞专供且机队里没有（旧存档持有的除外）：置灰说明原因，不静默隐藏 */
        if (!AT.canBuyPlane(p, st.airlineId) && !ownedTypes[p.id]) {
          out += '<button class="chip chip-wide over" type="button" disabled>' + h(p.name) +
            '<i>中国商飞专供 · 仅中国国际航空可采购</i></button>';
          return;
        }
        var afford = st.cash >= p.price;
        var stock = idleOf ? '<i class="c-good">机队有 ' + idleOf + ' 架可派</i>'
                           : '<i class="c-warn">机队没有 · 需现购 ' + money(p.price) + '</i>';
        var rec = (p.id === recId) ? '<b class="rec-tag">推荐</b>' : '';
        /* 越级机型（等级门槛高于该线两端最低等级）：sim 会直接拒绝，故置灰。 */
        var pReq = AT.planeLevelMin(p);
        var overGate = pReq > nwGateLv;
        out += '<button class="chip chip-wide' + (ui.newType === p.id ? ' on' : '') +
          (overGate || !(afford || idleOf) ? ' over' : '') + '"' +
          (overGate || !(afford || idleOf) ? ' disabled'
            : ' data-act="pick-type" data-type="' + p.id + '"') + ' type="button">' +
          h(p.name) + rec + '<em>' + p.seats + ' 座 · ' + money(p.price) + (afford ? '' : ' · 资金不足') + '</em>' +
          stock + (overGate ? '<i class="c-warn">需两端 ≥ Lv' + pReq + '</i>' : '') + '</button>';
      });
      out += '</div>';
      var pot = S.routePotential(st, fromId, ui.newTo);
      var slot = Math.round(S.routeSlots(st, fromId, ui.newTo));
      out += '<div class="rd-note">该线潜在需求 ' + pot.toFixed(2) + ' 百万客/季 · 时刻上限 ' + slot +
        ' 班/日（竞对已占位会减少）</div>';
      /* 城市航线上限提示（与 sim.openRoute 同口径）：任一端已满则给出明确原因 */
      var fromFull = (from.routes || 0) >= S.cityRouteCap(st, fromId);
      var toC = AT.CITIES_BY_ID[ui.newTo];
      var toFull = toC && (toC.routes || 0) >= S.cityRouteCap(st, ui.newTo);
      if (fromFull || toFull) {
        var fc = fromFull ? from : toC;
        out += '<div class="rd-note c-bad">' + h(fc.name) + ' 航线已达上限 ' +
          S.cityRouteCap(st, fc.id) + ' 条（' + (fc.level || 1) + ' 级城市' +
          (fc.isHome ? '，基地 +' + (C.homeRouteBonus || 0) : '') + '）· 请先关线或发展该城市</div>';
      }
      /* 开通按钮：文案随所选机型是否有库存而变，让玩家点之前就知道会发生什么 */
      var selPlane = ui.newType ? AT.planeOf(ui.newType) : null;
      var selIdle = selPlane ? S.idlePlanes(st).filter(function (x) { return x.type === ui.newType; }).length : 0;
      var willBuy = selPlane && !selIdle;
      /* 城市容量已满 → 开通按钮置灰（与 sim.openRoute 同口径，点之前就说清楚） */
      var openBlocked = fromFull || toFull;
      out += '<div class="nw-actions"><button class="btn btn-pri' +
        ((selPlane && !willBuy && selIdle < 1) || openBlocked ? ' dis' : '') + '"' +
        (openBlocked ? ' disabled' : ' data-act="do-open"') + ' type="button">' +
        (openBlocked ? '城市航线已满 · 无法开通' :
          (selPlane
            ? (willBuy ? '购机 1 架并开通（' + money(selPlane.price) + '）' : '开通航线')
            : '开通航线')) +
        '（' + h((AT.CITIES_BY_ID[fromId] || {}).name) + ' → ' +
        h((AT.CITIES_BY_ID[ui.newTo] || {}).name) + '）</button></div>';
    } else {
      /* 未选目的地 → 原本这里什么都不渲染，玩家会以为面板坏了（实机反馈：
       *   「点了新航线，下面一片空白」）。给一句明确的下一步指引。 */
      out += '<div class="nw-sec"><div class="rd-note">' +
        '请在 ② 中选一个目的地 —— 选完会显示机型与开通按钮。' +
        '若目的地写着「机队没有，需现购」，说明你手上没有能飞这条线的飞机，' +
        '开通时会自动为你买 1 架（需资金充足）。</div></div>';
    }
    out += '</div>';
    return out;
  }

  /* ───────────────────────── 渲染：模态 ───────────────────────── */

  var lastNetWorth = null;
  /* 上一帧的城市等级总和 —— 用于识别「有城市升级了」这个**世界事件**。
   * 为什么不订阅 sim 的回调：sim 是不认识 DOM/音频的纯逻辑层（它要能在 Node 里
   * 跑完一整局），给它加回调会把它和表现层耦上。改为 UI 对比前后状态，
   * 纯读、无侵入，且**无头测试里天然不触发**（没有 UI 就没有音效）。 */
  var lastDevSum = 0, lastCash = null;

  function syncModal(st) {
    // 终局优先
    if (st.phase === 'over') {
      if (ui.modal !== 'over') {
        // 胜负用不同音色（defcon 的定音长音思路）
        sfx('end', { win: !!playerWon(st) });
        sfx('milestone');
        showOver(st);
      }
      return;
    }
    // 事件卡（sim 已把计时暂停）
    if (st.card) {
      if (ui.modal !== 'event') { sfx('event'); showEvent(st.card); }
      return;
    }
    // 回合变化 → 生成季报
    if (st.quarter !== ui.lastQuarter) {
      ui.lastQuarter = st.quarter;
      var hh = st.history[st.history.length - 1];
      if (hh) {
        var nwDelta = lastNetWorth == null ? null : hh.netWorth - lastNetWorth;
        /* ⚠ 所有数字一律取自历史快照（sim 在结算那一刻写入的真实值）。
         *   曾犯过的错：用 S.forecast(st) 拼收入 —— 那是**下一季的预测**，
         *   于是季报里「收入 − 成本」对不上「净利」，差了近一倍（实机截图确认）。
         *   快照现已带 revenue/cost/overhead/interest/groundCost，直接用即可。
         *   旧存档可能没有这些字段 → 用 net 反推兜底，保证不出现 NaN。 */
        var hasBreak = (hh.revenue != null);
        ui.reports.push({
          quarter: hh.quarter,
          revenue: hasBreak ? hh.revenue : (hh.net + hh.cost + hh.overhead + hh.interest),
          cost: hasBreak ? hh.cost : 0,
          overhead: hasBreak ? hh.overhead : 0,
          interest: hasBreak ? hh.interest : 0,
          groundCost: hasBreak ? (hh.groundCost || 0) : 0,
          baseMaint: hasBreak ? (hh.baseMaint || 0) : 0,
          net: hh.net, cash: hh.cash, netWorth: hh.netWorth, nwDelta: nwDelta,
          pax: hh.pax, routes: hh.routes, planes: hh.planes
        });
        lastNetWorth = hh.netWorth;
        /* 季度钟 + 盈亏音一起响：钟是「时间推进了」，
         * 盈亏音是「这一季的结果」—— 两者语义不同，都要给。 */
        sfx('quarter');
        sfx(hh.net >= 0 ? 'profit' : 'loss');
      }
    }

    /* ── 世界事件：逐帧对比前后状态，识别「发生过什么」 ──
     * 顺序很重要：先响最紧急的（资金告急），再响正反馈（城市升级）。
     * 理由：两者同帧发生时，玩家更需要立刻知道钱不够了。 */
    watchWorld(st);

    // 有待看季报且没有事件卡 → 弹出（事件卡优先级更高，避免打断决策）
    if (ui.reports.length && ui.modal !== 'report') {
      showReport(ui.reports[0]);
    } else if (!ui.reports.length && ui.modal === 'report') {
      closeModal();
    }
  }

  function playerWon(st) {
    var rk = S.ranking(st);
    return !!(rk.length && rk[0] && rk[0].isPlayer) || S.verdict(st).tier === 'giant';
  }

  /* 世界事件观察器：资金告急 / 城市升级 / 竞对抢线。
   *
   * ⚠ 首次调用只做基线，不响 —— 否则开局第一帧就会因为
   *   「lastCash 是 null」或「城市等级和从 0 跳到 N」而误报一次警报。
   *   这个 bug 在声音上很显眼（一进游戏就听见资金告急）。 */
  function watchWorld(st) {
    var devSum = 0;
    st.cities.forEach(function (c) { devSum += (c.level || 0); });
    if (lastCash == null) {           // 首帧：只建立基线
      lastCash = st.cash;
      lastDevSum = devSum;
      return;
    }

    /* 资金告急：跌到 0 以下（负债）才响，且要 crosses 才响一次 ——
     * 若只在「< 0」时响，负债持续十个季度就会一直响（1.2s 间隔也受不了）。 */
    if (st.cash < 0 && lastCash >= 0) sfx('crisis');
    lastCash = st.cash;

    /* 城市升级 → 本作核心正反馈（飞轮转起来了）。
     * 用「等级总和增加」而非「哪些城市升了」：前者一个数就够，
     * 后者要在 sim 之外再维护一份城市等级快照，得不偿失。 */
    if (devSum > lastDevSum) sfx('upgrade');
    lastDevSum = devSum;
  }

  /* ───────────────────────── 帧驱动 ───────────────────────── */

  var ACC = 0;
  function frame(state, dt) {
    if (!ui.inited) return;
    ui.state = state;
    /* HUD 每 100ms 刷一次即可 —— 读数不会更快地变化，而 innerHTML/文本写入
     * 在移动端是真实的成本（每帧刷 10 个节点 ≈ 每秒 600 次 DOM 写）。
     * 面板与模态则「标记脏才重建」，因为它们含 innerHTML（贵得多）。 */
    ACC += dt;
    if (ACC >= 0.1) { ACC = 0; dirty.hud = true; }

    if (dirty.hud) { syncHud(); dirty.hud = false; }
    // 面板里的利润随季推进变化，故低频重刷（1Hz）
    if (ui.panel) {
      panelT += dt;
      if (panelT >= 1) { panelT = 0; dirty.panel = true; }
    }
    if (dirty.panel) { syncPanel(); dirty.panel = false; }
    dirty.modal = true;
    if (dirty.modal) { syncModal(state); dirty.modal = false; }

    // 计时条需要连续变化，单独每帧刷
    var rem = S.quarterRemain(state);
    if (el.uTimerBar) {
      var total = C.quarterSeconds || 22;
      var w = rem == null ? 100 : Math.max(0, Math.min(100, (1 - rem / total) * 100));
      el.uTimerBar.style.width = w + '%';
    }
    if (el.uTimer) {
      el.uTimer.textContent = state.paused
        ? '已暂停'
        : (rem == null
            ? (state.card ? '待决策' : (state.phase === 'over' ? '已结束' : '—'))
            : Math.ceil(rem) + 's');
    }
  }
  var panelT = 0;

  function onResize() { /* 布局交给 CSS */ }

  AT.ui = {
    init: init,
    frame: frame,
    onResize: onResize,
    toast: toast,
    money: money,
    /* 开局选航司：**必须在 init/boot 之前**调用（此时 ui.state 仍为 null），
     * 故它只读 data.js，不碰 ui.state。启动脚本见 index.html 末尾。 */
    showAirlineSelect: showAirlineSelect,
    /* 启动续玩覆盖层：同样在 boot 之前调用（读存档 state，不碰 ui.state）。 */
    showResume: showResume,
    openPanel: openPanel,
    closePanel: closePanel,
    /* 音效入口暴露给测试打桩：测试里替换 ui._sfx = fn 即可断言
     * 「开线响了 open、被拒响了 deny」而不必真的建 AudioContext。 */
    sfx: sfx,
    get panel() { return ui.panel; },
    get modal() { return ui.modal; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
