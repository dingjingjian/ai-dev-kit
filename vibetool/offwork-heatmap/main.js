(function () {
  'use strict';

  /* ---------- 存储 ----------
   * v2：只记准不准时 —— { 'YYYY-MM-DD': { ok: true|false } }
   * v1（历史）：{ 'YYYY-MM-DD': { in: 'HH:MM', out: 'HH:MM' } }，首次打开时迁移。
   */
  var KEY_RECORDS = 'owt_records_v2';
  var KEY_RECORDS_V1 = 'owt_records_v1';
  var KEY_SETTINGS_V1 = 'owt_settings_v1';

  function loadJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---------- 日期工具 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseKey(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function todayKey() { return dateKey(new Date()); }
  function toMin(hhmm) {
    if (typeof hhmm !== 'string') return null;
    var p = hhmm.split(':');
    var h = Number(p[0]), m = Number(p[1]);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ---------- 记录归一化 ----------
   * 兼容三种来源：v2 结构、v1 结构（记时间）、旧版导出的备份 JSON。
   * v1 没有「准不准时」的显式标记，只能按标准下班时间（默认 18:00）折算。
   */
  var LEGACY_END = '18:00';

  function normalizeRecords(raw, limit) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    if (typeof limit !== 'number') limit = toMin(LEGACY_END);
    for (var k in raw) {
      if (!raw.hasOwnProperty(k)) continue;
      var v = raw[k];
      if (!v) continue;
      if (typeof v.ok === 'boolean') { out[k] = { ok: v.ok }; continue; }
      var outMin = toMin(v.out);          /* v1 结构 */
      if (outMin === null) continue;      /* 旧版只打了上班卡 → 不算完成，不迁移 */
      out[k] = { ok: outMin <= limit };
    }
    return out;
  }

  function migrateV1() {
    var old = loadJSON(KEY_RECORDS_V1);
    if (!old) return null;
    var s = loadJSON(KEY_SETTINGS_V1);
    var limit = toMin(LEGACY_END);
    if (s && typeof s.end === 'string') {
      var m = toMin(s.end);
      if (m !== null) limit = m + (typeof s.grace === 'number' ? s.grace : 0);
    }
    return normalizeRecords(old, limit);
  }

  var records = loadJSON(KEY_RECORDS);
  if (records) {
    records = normalizeRecords(records);
  } else {
    var migrated = migrateV1();
    if (migrated) {
      records = migrated;
      saveJSON(KEY_RECORDS, records);
    } else {
      records = {};
    }
  }

  /* ---------- 状态判定 ----------
   * 0 未打卡 | 1 准时下班 | 2 加班
   */
  function dayState(key) {
    var r = records[key];
    if (!r) return 0;
    return r.ok ? 1 : 2;
  }
  function stateText(st) {
    if (st === 1) return '准时下班';
    if (st === 2) return '加班';
    return '未打卡';
  }

  function dayVerdict(key) {
    var st = dayState(key);
    if (st === 0) {
      return { html: '今天还没打卡', sub: '下班时点一下，只记准不准时', cls: '' };
    }
    if (st === 1) {
      return { html: '<span class="accent">今天准时下班！</span>', sub: '已记下，点热力图格子可以改', cls: 'good' };
    }
    return { html: '<span class="warn">今天加班了</span>', sub: '辛苦了，明天争取准时走', cls: 'bad' };
  }

  /* ---------- DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var elDate = $('todayDate'), elVerdict = $('todayVerdict'), elSub = $('todaySub');
  var btnOntime = $('btnOntime'), btnOvertime = $('btnOvertime'), btnEditToday = $('btnEditToday');
  var editToday = $('editToday');
  var overlay = $('overlay');
  var daySheet = $('daySheet'), setSheet = $('setSheet'), dataSheet = $('dataSheet');
  var clearDialog = $('clearDialog');
  var toastEl = $('toast');
  var toastTimer = null;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }
  function buzz() {
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  }

  /* ---------- 主题（配色） ----------
   * 主题模式存 localStorage（owt_theme_v1），解析后的实际配色写到
   * <html data-theme>（dark / light / sepia / mint），CSS 只认 data-theme；
   * data-theme-mode 保留原始选择（含 auto），供设置面板高亮用。
   * 老内核不认 prefers-color-scheme：两个媒体查询都不匹配时退回默认「深夜」。
   */
  var KEY_THEME = 'owt_theme_v1';
  var THEMES = [
    { mode: 'auto',  name: '跟随系统', meta: '#0d1117', dots: ['#0d1117', '#161b22', '#3fd05c'] },
    { mode: 'dark',  name: '深夜',     meta: '#0d1117', dots: ['#0d1117', '#161b22', '#3fd05c'] },
    { mode: 'light', name: '明亮',     meta: '#f2f4f7', dots: ['#f2f4f7', '#ffffff', '#2da44e'] },
    { mode: 'sepia', name: '暖阳纸张', meta: '#f6f0e4', dots: ['#f6f0e4', '#fffaf0', '#4f8a5b'] },
    { mode: 'mint',  name: '薄荷',     meta: '#eef6f4', dots: ['#eef6f4', '#ffffff', '#2fa26b'] }
  ];
  var DEFAULT_THEME = 'dark';
  var themeMode = DEFAULT_THEME;
  var mqDark = null, mqLight = null;
  try {
    if (window.matchMedia) {
      mqDark = window.matchMedia('(prefers-color-scheme: dark)');
      mqLight = window.matchMedia('(prefers-color-scheme: light)');
    }
  } catch (e) { mqDark = null; mqLight = null; }

  function themeMeta(mode) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].mode === mode) return THEMES[i];
    }
    return THEMES[1];
  }
  function systemTheme() {
    if (mqDark && mqDark.matches) return 'dark';
    if (mqLight && mqLight.matches) return 'light';
    return DEFAULT_THEME;
  }
  function applyTheme(mode) {
    if (typeof mode !== 'string' || themeMeta(mode).mode !== mode) mode = DEFAULT_THEME;
    themeMode = mode;
    var resolved = mode === 'auto' ? systemTheme() : mode;
    var root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-mode', mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeMeta(resolved).meta);
    renderThemePicker();
  }
  function renderThemePicker() {
    var grid = $('themeGrid');
    if (!grid) return;
    var html = '';
    for (var i = 0; i < THEMES.length; i++) {
      var t = THEMES[i];
      var on = t.mode === themeMode;
      html += '<button type="button" class="theme-chip' + (on ? ' on' : '') + '" data-mode="' + t.mode +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="theme-dots"><i style="background:' + t.dots[0] + '"></i>' +
        '<i style="background:' + t.dots[1] + '"></i>' +
        '<i style="background:' + t.dots[2] + '"></i></span>' +
        '<span class="theme-name">' + t.name + '</span>' +
        '<span class="theme-tick">&#10003;</span></button>';
    }
    grid.innerHTML = html;
  }
  function themeChipOf(node) {
    while (node && node !== document) {
      if (node.className && String(node.className).indexOf('theme-chip') >= 0) return node;
      node = node.parentNode;
    }
    return null;
  }
  $('themeGrid').addEventListener('click', function (ev) {
    var chip = themeChipOf(ev.target);
    if (!chip) return;
    var mode = chip.getAttribute('data-mode');
    if (mode === themeMode) return;
    saveJSON(KEY_THEME, mode);
    applyTheme(mode);
    buzz();
  });
  if (mqDark) {
    var onSystemThemeChange = function () { if (themeMode === 'auto') applyTheme('auto'); };
    /* Chrome 61 只有 addListener；新内核用 addEventListener */
    if (mqDark.addEventListener) mqDark.addEventListener('change', onSystemThemeChange);
    else if (mqDark.addListener) mqDark.addListener(onSystemThemeChange);
  }
  applyTheme(loadJSON(KEY_THEME) || DEFAULT_THEME);

  /* ---------- 渲染：今日卡片 ---------- */
  function renderToday() {
    var key = todayKey();
    var now = new Date();
    elDate.textContent = key + ' · ' + WEEKDAYS[now.getDay()];
    var v = dayVerdict(key);
    elVerdict.innerHTML = v.html;
    elSub.textContent = v.sub;

    var st = dayState(key);
    /* 再点一次同状态＝取消，点另一个＝改判 */
    btnOntime.className = 'punch-btn punch-ok' + (st === 1 ? ' on' : '');
    btnOvertime.className = 'punch-btn punch-ot' + (st === 2 ? ' on' : '');
    editToday.style.display = st === 0 ? 'none' : '';    /* 没打卡就整行收起，不留半截空隙 */
  }

  function punch(ok) {
    var key = todayKey();
    if (records[key] && records[key].ok === ok) return;   /* 已是该状态，重复点不写库、不清数据 */
    records[key] = { ok: ok };
    saveJSON(KEY_RECORDS, records);
    buzz();
    toast(ok ? '记下了：今天准时下班' : '记下了：今天加班');
    renderAll();
  }
  btnOntime.addEventListener('click', function () { punch(true); });
  btnOvertime.addEventListener('click', function () { punch(false); });
  btnEditToday.addEventListener('click', function () {
    var key = todayKey();
    delete records[key];
    saveJSON(KEY_RECORDS, records);
    toast('已撤销今天的打卡');
    renderAll();
  });

  /* ---------- 渲染：统计 ---------- */
  function monthStats() {
    var now = new Date();
    var prefix = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-';
    var ontime = 0, total = 0;
    for (var key in records) {
      if (!records.hasOwnProperty(key) || key.indexOf(prefix) !== 0) continue;
      total++;
      if (records[key].ok) ontime++;
    }
    return {
      rate: total ? Math.round(ontime * 100 / total) : null,
      ontime: ontime,
      overtime: total - ontime
    };
  }

  /* 连续准时：按「已打卡的记录」连续计算 —— 不区分工作日 / 休息日。
   * 没打卡的日子直接跳过，于是放假不打断，调休上班、周末加班都自然计入。 */
  function ontimeStreak() {
    var keys = [], k;
    for (k in records) {
      if (records.hasOwnProperty(k)) keys.push(k);
    }
    keys.sort();                                   /* 'YYYY-MM-DD' 字典序即日期序 */
    var streak = 0;
    for (var i = keys.length - 1; i >= 0; i--) {
      if (!records[keys[i]].ok) break;
      streak++;
    }
    return streak;
  }

  function renderStats() {
    var ms = monthStats();
    var streak = ontimeStreak();
    var rate = ms.rate === null
      ? '<span class="dash">—</span>'
      : ms.rate + '<span class="unit">%</span>';
    var html = '';
    html += '<div class="stat good"><div class="stat-num">' + streak + '<span class="unit">天</span></div><div class="stat-label">连续准时下班</div></div>';
    html += '<div class="stat' + (ms.rate !== null && ms.rate < 50 ? ' bad' : ' good') + '"><div class="stat-num">' + rate + '</div><div class="stat-label">本月准时率</div></div>';
    html += '<div class="stat"><div class="stat-num">' + (ms.ontime + ms.overtime) + '<span class="unit">天</span></div><div class="stat-label">本月打卡</div></div>';
    html += '<div class="stat' + (ms.overtime > 0 ? ' bad' : '') + '"><div class="stat-num">' + ms.overtime + '<span class="unit">天</span></div><div class="stat-label">本月加班</div></div>';
    $('statsRow').innerHTML = html;
  }

  /* ---------- 渲染：热力图 ---------- */
  var WEEKS = 26;
  function renderHeatmap() {
    var monthsEl = $('hmMonths'), daysEl = $('hmDays'), weeksEl = $('hmWeeks');
    monthsEl.innerHTML = '';
    daysEl.innerHTML = '';
    weeksEl.innerHTML = '';

    var dayLabels = ['一', '', '三', '', '五', '', '日'];
    for (var i = 0; i < 7; i++) {
      var dl = document.createElement('div');
      dl.className = 'hm-day';
      dl.textContent = dayLabels[i];
      daysEl.appendChild(dl);
    }

    var today = new Date();
    var tKey = todayKey();
    /* 本周一 */
    var monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    /* 起点：WEEKS-1 周前的周一 */
    var start = new Date(monday);
    start.setDate(monday.getDate() - (WEEKS - 1) * 7);

    var prevMonth = -1;
    for (var w = 0; w < WEEKS; w++) {
      var colStart = new Date(start);
      colStart.setDate(start.getDate() + w * 7);

      var mLab = document.createElement('div');
      mLab.className = 'hm-month';
      if (colStart.getMonth() !== prevMonth) {
        mLab.textContent = (colStart.getMonth() + 1) + '月';
        prevMonth = colStart.getMonth();
      }
      monthsEl.appendChild(mLab);

      var col = document.createElement('div');
      col.className = 'hm-week';
      for (var d = 0; d < 7; d++) {
        var date = new Date(colStart);
        date.setDate(colStart.getDate() + d);
        var key = dateKey(date);
        var cell = document.createElement('div');
        var future = date.getTime() > today.getTime();
        cell.className = 'hm-cell lv' + dayState(key) + (key === tKey ? ' today' : '') + (future ? ' future' : '');
        cell.setAttribute('data-key', key);
        if (!future) {
          (function (k) {
            cell.addEventListener('click', function () { openDaySheet(k); });
          })(key);
        }
        col.appendChild(cell);
      }
      weeksEl.appendChild(col);
    }
  }

  /* ---------- 热力图左右翻页 ----------
   * 26 周在窄屏放不下（360px 屏溢出 ~84px），故给滚动区配一对翻页按钮：
   * 一次翻一屏（留一列作上下文），两端置灰，两侧渐隐提示还有内容。
   */
  var hmScroll = $('hmScroll'), hmWrap = $('hmWrap'), hmNav = $('hmNav');
  var hmPrev = $('hmPrev'), hmNext = $('hmNext');
  var WEEK_W = 14;                                          /* 一列宽：格子 12 + 间距 2 */
  var SMOOTH_SCROLL = 'scrollBehavior' in document.documentElement.style;

  function hmMax() { return hmScroll.scrollWidth - hmScroll.clientWidth; }

  function hmStep() {
    var perPage = Math.floor(hmScroll.clientWidth / WEEK_W); /* 一屏放得下几周 */
    return Math.max(WEEK_W, (perPage - 1) * WEEK_W);         /* 少翻一列，留点上下文 */
  }

  function hmScrollTo(left) {
    var max = hmMax();
    if (left < 0) left = 0;
    if (left > max) left = max;
    if (SMOOTH_SCROLL) {
      hmScroll.scrollTo({ left: left, behavior: 'smooth' });
    } else {
      hmScroll.scrollLeft = left;
    }
  }

  function updateHmNav() {
    var max = hmMax();
    var canPage = max > 2;
    hmNav.style.display = canPage ? '' : 'none';             /* 放得下就不显示翻页按钮 */
    hmWrap.classList.toggle('show-left', canPage && hmScroll.scrollLeft > 2);
    hmWrap.classList.toggle('show-right', canPage && hmScroll.scrollLeft < max - 2);
    hmPrev.classList.toggle('is-off', !canPage || hmScroll.scrollLeft <= 2);
    hmNext.classList.toggle('is-off', !canPage || hmScroll.scrollLeft >= max - 2);
  }

  function scrollHeatmapRight() {
    hmScroll.scrollLeft = hmScroll.scrollWidth;              /* 默认停在最新的一周 */
    updateHmNav();
  }

  hmPrev.addEventListener('click', function () { hmScrollTo(hmScroll.scrollLeft - hmStep()); });
  hmNext.addEventListener('click', function () { hmScrollTo(hmScroll.scrollLeft + hmStep()); });

  var hmNavTick = false;
  hmScroll.addEventListener('scroll', function () {
    if (hmNavTick) return;
    hmNavTick = true;
    window.requestAnimationFrame(function () { hmNavTick = false; updateHmNav(); });
  }, { passive: true });

  /* ---------- 弹层：某天的状态 ---------- */
  var editingKey = null;

  function openSheet(sheet) {
    overlay.classList.add('show');
    sheet.classList.add('show');
  }
  function closeSheets() {
    overlay.classList.remove('show');
    daySheet.classList.remove('show');
    setSheet.classList.remove('show');
    dataSheet.classList.remove('show');
    clearDialog.classList.remove('show');
  }

  function openDaySheet(key) {
    editingKey = key;
    var d = parseKey(key);
    $('dayTitle').textContent = key + ' · ' + WEEKDAYS[d.getDay()];
    var st = dayState(key);
    $('dayStatus').innerHTML = '当前状态：<b>' + stateText(st) + '</b>';
    $('btnPickOk').className = 'pick-btn pick-ok' + (st === 1 ? ' on' : '');
    $('btnPickOt').className = 'pick-btn pick-ot' + (st === 2 ? ' on' : '');
    $('btnDayClear').style.display = st === 0 ? 'none' : '';
    openSheet(daySheet);
  }

  function setDay(key, st) {
    if (!key) return;
    records[key] = { ok: st === 1 };
    saveJSON(KEY_RECORDS, records);
    buzz();
    closeSheets();
    toast(key === todayKey() ? '已记为' + stateText(st) : '已保存 ' + key);
    renderAll();
  }

  $('btnPickOk').addEventListener('click', function () { setDay(editingKey, 1); });
  $('btnPickOt').addEventListener('click', function () { setDay(editingKey, 2); });
  $('btnDayClear').addEventListener('click', function () {
    if (!editingKey) { closeSheets(); return; }
    delete records[editingKey];
    saveJSON(KEY_RECORDS, records);
    closeSheets();
    toast('已清除 ' + editingKey);
    renderAll();
  });
  $('btnDayCancel').addEventListener('click', closeSheets);

  /* ---------- 弹层：设置 ---------- */
  $('btnSettings').addEventListener('click', function () { openSheet(setSheet); });
  $('btnSetCancel').addEventListener('click', closeSheets);
  overlay.addEventListener('click', closeSheets);

  /* ---------- 数据管理（导出 / 导入改为页内文本，适配小工具容器） ----------
   * 容器禁止 a[download] / blob 下载与 clipboard API；
   * <input type=file> 在容器内只能选图片/视频，无法选 JSON。
   * 改为在页内弹层用 textarea 展示（导出）或粘贴（导入）JSON 文本，
   * 引导用户长按选中复制 / 粘贴。
   */
  var dataMode = null; /* 'export' | 'import' */
  var dataTextarea = $('dataText');
  var dataHint = $('dataHint');

  function openDataSheet(mode) {
    dataMode = mode;
    if (mode === 'export') {
      var payload = { records: records, exportedAt: new Date().toISOString() };
      $('dataTitle').textContent = '导出备份';
      dataHint.textContent = '长按下方文本全选，再复制保存到备忘录 / 笔记本。';
      dataTextarea.value = JSON.stringify(payload, null, 2);
      dataTextarea.readOnly = true;
      $('btnDataConfirm').textContent = '全选';
      $('btnDataConfirm').className = 'btn btn-ghost';
    } else {
      $('dataTitle').textContent = '导入备份';
      dataHint.textContent = '将之前导出的 JSON 粘贴到下方，点「确认导入」。旧版（记时间）的备份也能导入。';
      dataTextarea.value = '';
      dataTextarea.readOnly = false;
      $('btnDataConfirm').textContent = '确认导入';
      $('btnDataConfirm').className = 'btn btn-primary';
    }
    openSheet(dataSheet);
    setTimeout(function () { dataTextarea.focus(); }, 260);
  }

  $('btnExport').addEventListener('click', function () { openDataSheet('export'); });
  $('btnImport').addEventListener('click', function () { openDataSheet('import'); });

  $('btnDataConfirm').addEventListener('click', function () {
    if (dataMode === 'export') {
      try {
        dataTextarea.focus();
        dataTextarea.select();
        toast('已全选，长按复制');
      } catch (e) {
        toast('请长按文本手动选中');
      }
      return;
    }
    /* import */
    var raw = dataTextarea.value;
    if (!raw.replace(/\s/g, '')) { toast('请先粘贴 JSON'); return; }
    try {
      var data = JSON.parse(raw);
      if (!data || typeof data.records !== 'object') throw new Error('bad');
      records = normalizeRecords(data.records);
      saveJSON(KEY_RECORDS, records);
      closeSheets();
      toast('导入成功');
      renderAll();
    } catch (e) {
      toast('JSON 格式不正确');
    }
  });
  $('btnDataCancel').addEventListener('click', closeSheets);

  /* 清空＝独立的页内确认框。
   * 不用 window.confirm：容器 iframe 未开 allow-modals 时它不弹窗、静默返回 false，
   * 表现为「点了没反应」。也不用「再点一次」那种轻确认——两次点击之间没有阻断，
   * 误触连点就删光了，且不可恢复。 */
  function countRecords() {
    var n = 0;
    for (var k in records) { if (records.hasOwnProperty(k)) n++; }
    return n;
  }
  $('btnClear').addEventListener('click', function () {
    var n = countRecords();
    if (n === 0) { toast('本机还没有打卡记录'); return; }
    $('clearHint').textContent = '共 ' + n + ' 条记录会被永久删除，无法恢复。';
    setSheet.classList.remove('show');     /* 收起设置面板，只留确认框 */
    openSheet(clearDialog);
  });
  $('btnClearCancel').addEventListener('click', function () {
    clearDialog.classList.remove('show');
    setSheet.classList.add('show');        /* 取消＝退回设置面板 */
  });
  $('btnClearConfirm').addEventListener('click', function () {
    records = {};
    saveJSON(KEY_RECORDS, records);
    closeSheets();
    toast('已清空');
    renderAll();
  });

  /* ---------- 视口高度兜底 ---------- */
  function setAppHeight() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  }
  window.addEventListener('resize', function () {
    setAppHeight();
    updateHmNav();                                           /* 屏宽变了，一屏周数也变了 */
  });
  setAppHeight();

  /* ---------- 启动 ---------- */
  function renderAll() {
    renderToday();
    renderStats();
    renderHeatmap();
    scrollHeatmapRight();                                    /* 每次重绘都停在最新一周 */
  }
  renderAll();
})();
