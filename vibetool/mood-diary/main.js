(function () {
  'use strict';

  /* ---------- 心情定义 ----------
   * 1 兴奋（橙） 2 开心（绿） 3 平静（蓝） 4 一般（黄） 5 难过（紫） 6 愤怒（红）
   * 「好心情」= 1 + 2 + 3，用于连续好心情统计。
   */
  var MOODS = [
    { id: 1, name: '兴奋', emoji: '\uD83D\uDE06' },
    { id: 2, name: '开心', emoji: '\uD83D\uDE0A' },
    { id: 3, name: '平静', emoji: '\uD83D\uDE0C' },
    { id: 4, name: '一般', emoji: '\uD83D\uDE10' },
    { id: 5, name: '难过', emoji: '\uD83D\uDE1F' },
    { id: 6, name: '愤怒', emoji: '\uD83D\uDE21' }
  ];
  function moodOf(id) {
    for (var i = 0; i < MOODS.length; i++) {
      if (MOODS[i].id === id) return MOODS[i];
    }
    return null;
  }

  /* ---------- 存储 ----------
   * { 'YYYY-MM-DD': { m: 1-5 } }
   */
  var KEY_RECORDS = 'md_records_v1';
  var KEY_THEME = 'md_theme_v1';

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
  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ---------- 记录归一化 ---------- */
  function normalizeRecords(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (var k in raw) {
      if (!raw.hasOwnProperty(k)) continue;
      var v = raw[k];
      if (!v) continue;
      if (typeof v.m === 'number' && v.m >= 1 && v.m <= 6) { out[k] = { m: v.m }; continue; }
      /* 兼容旧格式 { mood: 1-6 } */
      if (typeof v.mood === 'number' && v.mood >= 1 && v.mood <= 6) { out[k] = { m: v.mood }; continue; }
    }
    return out;
  }

  var records = loadJSON(KEY_RECORDS);
  records = records ? normalizeRecords(records) : {};

  /* ---------- 状态判定 ----------
   * 0 未记录 | 1-5 对应五种心情
   */
  function dayState(key) {
    var r = records[key];
    if (!r) return 0;
    return r.m;
  }
  function stateText(st) {
    var m = moodOf(st);
    return m ? m.name : '未记录';
  }

  function dayVerdict(key) {
    var st = dayState(key);
    if (st === 0) {
      return { html: '今天还没记心情', sub: '点一下今天的心情，只记颜色不记事', cls: '' };
    }
    var m = moodOf(st);
    return {
      html: '<span class="mood-emoji">' + m.emoji + '</span>' + m.name,
      sub: '已记下，点热力图格子可以改',
      cls: st <= 2 ? 'good' : (st >= 4 ? 'bad' : '')
    };
  }

  /* ---------- DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var elDate = $('todayDate'), elVerdict = $('todayVerdict'), elSub = $('todaySub');
  var punchRow = $('punchRow');
  var btnEditToday = $('btnEditToday');
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

  /* ---------- 主题（配色） ---------- */
  var THEMES = [
    { mode: 'auto',  name: '跟随系统', meta: '#0d1117', dots: ['#0d1117', '#161b22', '#3fb950'] },
    { mode: 'dark',  name: '深夜',     meta: '#0d1117', dots: ['#0d1117', '#161b22', '#3fb950'] },
    { mode: 'light', name: '明亮',     meta: '#f2f4f7', dots: ['#f2f4f7', '#ffffff', '#2da44e'] },
    { mode: 'sepia', name: '暖阳纸张', meta: '#f6f0e4', dots: ['#f6f0e4', '#fffaf0', '#4f8a5b'] },
    { mode: 'mint',  name: '薄荷',     meta: '#eef6f4', dots: ['#eef6f4', '#ffffff', '#2fa26b'] }
  ];
  var DEFAULT_THEME = 'auto';
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
    if (mqDark.addEventListener) mqDark.addEventListener('change', onSystemThemeChange);
    else if (mqDark.addListener) mqDark.addListener(onSystemThemeChange);
  }
  applyTheme(loadJSON(KEY_THEME) || DEFAULT_THEME);

  /* ---------- 渲染：心情按钮（今日卡片 + 弹层共用） ---------- */
  function moodButtonHTML(mood, pressed, cls) {
    return '<button type="button" class="' + cls + ' pm' + mood.id + (pressed ? ' on' : '') + '" data-mood="' + mood.id + '">' +
      '<span class="emoji">' + mood.emoji + '</span>' +
      '<span class="label">' + mood.name + '</span></button>';
  }

  /* ---------- 渲染：今日卡片 ---------- */
  function renderToday() {
    var key = todayKey();
    var now = new Date();
    elDate.textContent = key + ' · ' + WEEKDAYS[now.getDay()];
    var v = dayVerdict(key);
    elVerdict.innerHTML = v.html;
    elSub.textContent = v.sub;

    var st = dayState(key);
    var html = '';
    for (var i = 0; i < MOODS.length; i++) {
      html += moodButtonHTML(MOODS[i], st === MOODS[i].id, 'punch-btn');
    }
    punchRow.innerHTML = html;
    editToday.style.display = st === 0 ? 'none' : '';
  }

  punchRow.addEventListener('click', function (ev) {
    var btn = ev.target;
    while (btn && btn !== punchRow) {
      if (btn.getAttribute && btn.getAttribute('data-mood')) break;
      btn = btn.parentNode;
    }
    if (!btn || !btn.getAttribute || !btn.getAttribute('data-mood')) return;
    punch(Number(btn.getAttribute('data-mood')));
  });

  function punch(moodId) {
    var key = todayKey();
    if (records[key] && records[key].m === moodId) return;
    records[key] = { m: moodId };
    saveJSON(KEY_RECORDS, records);
    buzz();
    toast('记下了：今天' + stateText(moodId));
    renderAll();
  }
  btnEditToday.addEventListener('click', function () {
    var key = todayKey();
    delete records[key];
    saveJSON(KEY_RECORDS, records);
    toast('已撤销今天的记录');
    renderAll();
  });

  /* ---------- 渲染：统计 ---------- */
  function monthStats() {
    var now = new Date();
    var prefix = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-';
    var counts = [0, 0, 0, 0, 0, 0, 0];   /* 索引 1-6 对应心情 */
    var total = 0;
    for (var key in records) {
      if (!records.hasOwnProperty(key) || key.indexOf(prefix) !== 0) continue;
      total++;
      counts[records[key].m]++;
    }
    return {
      total: total,
      happy: counts[1] + counts[2] + counts[3],   /* 兴奋 + 开心 + 平静 */
      sad: counts[5] + counts[6],                  /* 难过 + 愤怒 */
      counts: counts
    };
  }

  /* 连续好心情：按「已打卡的记录」连续计算 —— 没记录的日子跳过。 */
  function goodStreak() {
    var keys = [], k;
    for (k in records) {
      if (records.hasOwnProperty(k)) keys.push(k);
    }
    keys.sort();
    var streak = 0;
    for (var i = keys.length - 1; i >= 0; i--) {
      if (records[keys[i]].m > 3) break;   /* 一般/难过/愤怒打断 */
      streak++;
    }
    return streak;
  }

  function renderStats() {
    var ms = monthStats();
    var streak = goodStreak();
    var rate = ms.total === 0
      ? '<span class="dash">—</span>'
      : Math.round(ms.happy * 100 / ms.total) + '<span class="unit">%</span>';
    var html = '';
    html += '<div class="stat good"><div class="stat-num">' + streak + '<span class="unit">天</span></div><div class="stat-label">连续好心情</div></div>';
    html += '<div class="stat good"><div class="stat-num">' + rate + '</div><div class="stat-label">本月好心情率</div></div>';
    html += '<div class="stat"><div class="stat-num">' + ms.total + '<span class="unit">天</span></div><div class="stat-label">本月记录</div></div>';
    html += '<div class="stat' + (ms.sad > 0 ? ' bad' : '') + '"><div class="stat-num">' + ms.sad + '<span class="unit">天</span></div><div class="stat-label">本月低落天</div></div>';
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
    var monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
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

    /* 图例 */
    var legend = $('hmLegend');
    var lh = '<span class="item"><i class="sw" style="background:var(--cell)"></i>未记录</span>';
    for (var mi = 0; mi < MOODS.length; mi++) {
      lh += '<span class="item"><i class="sw" style="background:var(--m' + MOODS[mi].id + ')"></i>' + MOODS[mi].name + '</span>';
    }
    legend.innerHTML = lh;
  }

  /* ---------- 热力图左右翻页 ---------- */
  var hmScroll = $('hmScroll'), hmWrap = $('hmWrap'), hmNav = $('hmNav');
  var hmPrev = $('hmPrev'), hmNext = $('hmNext');
  var WEEK_W = 14;
  var SMOOTH_SCROLL = 'scrollBehavior' in document.documentElement.style;

  function hmMax() { return hmScroll.scrollWidth - hmScroll.clientWidth; }

  function hmStep() {
    var perPage = Math.floor(hmScroll.clientWidth / WEEK_W);
    return Math.max(WEEK_W, (perPage - 1) * WEEK_W);
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
    hmNav.style.display = canPage ? '' : 'none';
    hmWrap.classList.toggle('show-left', canPage && hmScroll.scrollLeft > 2);
    hmWrap.classList.toggle('show-right', canPage && hmScroll.scrollLeft < max - 2);
    hmPrev.classList.toggle('is-off', !canPage || hmScroll.scrollLeft <= 2);
    hmNext.classList.toggle('is-off', !canPage || hmScroll.scrollLeft >= max - 2);
  }

  function scrollHeatmapRight() {
    hmScroll.scrollLeft = hmScroll.scrollWidth;
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
  var pickGrid = $('pickGrid');

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
    $('dayStatus').innerHTML = '当前心情：<b>' + (st ? stateText(st) : '未记录') + '</b>';
    var html = '';
    for (var i = 0; i < MOODS.length; i++) {
      html += moodButtonHTML(MOODS[i], st === MOODS[i].id, 'pick-btn');
    }
    pickGrid.innerHTML = html;
    $('btnDayClear').style.display = st === 0 ? 'none' : '';
    openSheet(daySheet);
  }

  pickGrid.addEventListener('click', function (ev) {
    var btn = ev.target;
    while (btn && btn !== pickGrid) {
      if (btn.getAttribute && btn.getAttribute('data-mood')) break;
      btn = btn.parentNode;
    }
    if (!btn || !btn.getAttribute || !btn.getAttribute('data-mood')) return;
    setDay(editingKey, Number(btn.getAttribute('data-mood')));
  });

  function setDay(key, moodId) {
    if (!key) return;
    records[key] = { m: moodId };
    saveJSON(KEY_RECORDS, records);
    buzz();
    closeSheets();
    toast(key === todayKey() ? '已记为' + stateText(moodId) : '已保存 ' + key);
    renderAll();
  }

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

  /* ---------- 数据管理 ---------- */
  var dataMode = null;
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
      dataHint.textContent = '将之前导出的 JSON 粘贴到下方，点「确认导入」。';
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

  /* 清空＝独立的页内确认框 */
  function countRecords() {
    var n = 0;
    for (var k in records) { if (records.hasOwnProperty(k)) n++; }
    return n;
  }
  $('btnClear').addEventListener('click', function () {
    var n = countRecords();
    if (n === 0) { toast('本机还没有心情记录'); return; }
    $('clearHint').textContent = '共 ' + n + ' 条记录会被永久删除，无法恢复。';
    setSheet.classList.remove('show');
    openSheet(clearDialog);
  });
  $('btnClearCancel').addEventListener('click', function () {
    clearDialog.classList.remove('show');
    setSheet.classList.add('show');
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
    updateHmNav();
  });
  setAppHeight();

  /* ---------- 启动 ---------- */
  function renderAll() {
    renderToday();
    renderStats();
    renderHeatmap();
    scrollHeatmapRight();
  }
  renderAll();
})();
