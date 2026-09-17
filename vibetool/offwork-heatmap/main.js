(function () {
  'use strict';

  /* ---------- 存储 ---------- */
  var KEY_RECORDS = 'owt_records_v1';
  var KEY_SETTINGS = 'owt_settings_v1';

  var DEFAULT_SETTINGS = { start: '09:00', end: '18:00', grace: 0 };

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var settings = loadJSON(KEY_SETTINGS, null) || DEFAULT_SETTINGS;
  if (typeof settings.start !== 'string') settings.start = DEFAULT_SETTINGS.start;
  if (typeof settings.end !== 'string') settings.end = DEFAULT_SETTINGS.end;
  if (typeof settings.grace !== 'number') settings.grace = DEFAULT_SETTINGS.grace;
  var records = loadJSON(KEY_RECORDS, {}) || {};

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
    if (!hhmm) return null;
    var p = hhmm.split(':');
    var h = Number(p[0]), m = Number(p[1]);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  function nowHHMM() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function fmtDur(min) {
    if (min < 60) return min + ' 分钟';
    var h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? h + ' 小时' : h + ' 小时 ' + m + ' 分';
  }

  /* ---------- 状态判定 ----------
   * 0 未打卡 | 1 仅上班卡 | 2 提前(≥15m) | 3 准时
   * 4 加班<30m | 5 <1h | 6 <2h | 7 ≥2h
   */
  function dayLevel(key) {
    var r = records[key];
    if (!r || (!r.in && !r.out)) return 0;
    var outMin = toMin(r.out);
    if (outMin === null) return 1;
    var limit = toMin(settings.end) + (settings.grace || 0);
    var diff = outMin - limit;
    if (diff <= -15) return 2;
    if (diff <= 0) return 3;
    if (diff <= 30) return 4;
    if (diff <= 60) return 5;
    if (diff <= 120) return 6;
    return 7;
  }

  function dayVerdict(key) {
    var r = records[key];
    if (!r || (!r.in && !r.out)) {
      return { html: '还没有打卡', sub: '点击下方按钮，记录今天吧', cls: '' };
    }
    var outMin = toMin(r.out);
    if (outMin === null) {
      var inMin = toMin(r.in);
      return {
        html: '上班卡已打 <span class="accent">' + r.in + '</span>',
        sub: '下班时记得回来打卡' + (inMin !== null && inMin > toMin(settings.start) + (settings.grace || 0) ? ' · 今早迟到了 ' + fmtDur(inMin - toMin(settings.start)) : ''),
        cls: ''
      };
    }
    var limit = toMin(settings.end) + (settings.grace || 0);
    var diff = outMin - limit;
    if (diff <= -15) {
      return { html: '<span class="accent">提前 ' + fmtDur(-diff) + ' 溜了</span>', sub: '下班 ' + r.out + ' · 标准 ' + settings.end, cls: 'good' };
    }
    if (diff <= 0) {
      return { html: '<span class="accent">今天准时下班！</span>', sub: '下班 ' + r.out + ' · 标准 ' + settings.end + (settings.grace ? '(宽限' + settings.grace + '分)' : ''), cls: 'good' };
    }
    return { html: '<span class="warn">加班 ' + fmtDur(diff) + '</span>', sub: '下班 ' + r.out + ' · 标准 ' + settings.end + (settings.grace ? '(宽限' + settings.grace + '分)' : ''), cls: 'bad' };
  }

  /* ---------- DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var elDate = $('todayDate'), elVerdict = $('todayVerdict'), elSub = $('todaySub');
  var btnIn = $('btnIn'), btnOut = $('btnOut');
  var overlay = $('overlay');
  var daySheet = $('daySheet'), setSheet = $('setSheet'), dataSheet = $('dataSheet');
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

  /* ---------- 渲染：今日卡片 ---------- */
  function renderToday() {
    var key = todayKey();
    var now = new Date();
    elDate.textContent = key + ' · ' + WEEKDAYS[now.getDay()];
    var v = dayVerdict(key);
    elVerdict.innerHTML = v.html;
    elSub.textContent = v.sub;

    var r = records[key] || {};
    if (r.in) {
      btnIn.className = 'punch-btn punch-in done';
      btnIn.innerHTML = '上班 ' + r.in + '<small>点击更新为当前时间</small>';
    } else {
      btnIn.className = 'punch-btn punch-in';
      btnIn.textContent = '上班打卡';
    }
    if (r.out) {
      btnOut.className = 'punch-btn punch-out done';
      btnOut.innerHTML = '下班 ' + r.out + '<small>点击更新为当前时间</small>';
    } else {
      btnOut.className = 'punch-btn punch-out';
      btnOut.textContent = '下班打卡';
    }
  }

  function punch(field) {
    var key = todayKey();
    var t = nowHHMM();
    var r = records[key] || {};
    if (r[field] && !window.confirm('已记录为 ' + r[field] + '，要更新为 ' + t + ' 吗？')) return;
    r[field] = t;
    records[key] = r;
    saveJSON(KEY_RECORDS, records);
    buzz();
    toast(field === 'in' ? '上班打卡 ' + t : '下班打卡 ' + t);
    renderAll();
  }
  btnIn.addEventListener('click', function () { punch('in'); });
  btnOut.addEventListener('click', function () { punch('out'); });
  $('btnEditToday').addEventListener('click', function () { openDaySheet(todayKey()); });

  /* ---------- 渲染：统计 ---------- */
  function isWorkday(d) { var w = d.getDay(); return w >= 1 && w <= 5; }

  function monthStats() {
    var now = new Date();
    var prefix = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-';
    var ontime = 0, total = 0, outSum = 0, otMin = 0;
    for (var key in records) {
      if (!records.hasOwnProperty(key) || key.indexOf(prefix) !== 0) continue;
      var outMin = toMin(records[key].out);
      if (outMin === null) continue;
      total++;
      outSum += outMin;
      var diff = outMin - (toMin(settings.end) + (settings.grace || 0));
      if (diff <= 0) ontime++; else otMin += diff;
    }
    return {
      rate: total ? Math.round(ontime * 100 / total) : null,
      avg: total ? Math.round(outSum / total) : null,
      otMin: otMin
    };
  }

  function ontimeStreak() {
    var streak = 0;
    var d = new Date();
    for (var i = 0; i < 400; i++) {
      if (!isWorkday(d)) { d.setDate(d.getDate() - 1); continue; }
      var key = dateKey(d);
      var r = records[key];
      var outMin = r ? toMin(r.out) : null;
      if (outMin === null) {
        if (i === 0) { d.setDate(d.getDate() - 1); continue; } /* 今天还没打下班卡，不断连 */
        break;
      }
      if (outMin <= toMin(settings.end) + (settings.grace || 0)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function renderStats() {
    var ms = monthStats();
    var streak = ontimeStreak();
    var avgStr = ms.avg === null ? '—' : pad2(Math.floor(ms.avg / 60)) + ':' + pad2(ms.avg % 60);
    var html = '';
    html += '<div class="stat good"><div class="stat-num">' + streak + '<span class="unit">天</span></div><div class="stat-label">连续准时下班</div></div>';
    html += '<div class="stat' + (ms.rate !== null && ms.rate < 50 ? ' bad' : ' good') + '"><div class="stat-num">' + (ms.rate === null ? '—' : ms.rate + '<span class="unit">%</span>') + '</div><div class="stat-label">本月准时率</div></div>';
    html += '<div class="stat"><div class="stat-num">' + avgStr + '</div><div class="stat-label">本月平均下班</div></div>';
    html += '<div class="stat' + (ms.otMin > 0 ? ' bad' : '') + '"><div class="stat-num">' + (ms.otMin ? fmtDur(ms.otMin) : '0') + '</div><div class="stat-label">本月累计加班</div></div>';
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
        cell.className = 'hm-cell lv' + dayLevel(key) + (key === tKey ? ' today' : '') + (future ? ' future' : '');
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

  function scrollHeatmapRight() {
    var sc = $('hmScroll');
    sc.scrollLeft = sc.scrollWidth;
  }

  /* ---------- 弹层：日期编辑 ---------- */
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
  }

  function openDaySheet(key) {
    editingKey = key;
    var d = parseKey(key);
    $('dayTitle').textContent = key + ' · ' + WEEKDAYS[d.getDay()];
    var r = records[key] || {};
    $('inpIn').value = r.in || '';
    $('inpOut').value = r.out || '';
    var v = dayVerdict(key);
    var tmp = document.createElement('div');
    tmp.innerHTML = v.html;
    $('dayStatus').innerHTML = '状态：<b>' + tmp.textContent + '</b>' + (v.sub ? ' · ' + v.sub : '');
    openSheet(daySheet);
  }

  $('btnDaySave').addEventListener('click', function () {
    var inVal = $('inpIn').value, outVal = $('inpOut').value;
    if (inVal && outVal && toMin(outVal) <= toMin(inVal)) {
      toast('下班时间需要晚于上班时间');
      return;
    }
    if (!inVal && !outVal) {
      delete records[editingKey];
    } else {
      records[editingKey] = {};
      if (inVal) records[editingKey].in = inVal;
      if (outVal) records[editingKey].out = outVal;
    }
    saveJSON(KEY_RECORDS, records);
    buzz();
    closeSheets();
    toast('已保存 ' + editingKey);
    renderAll();
  });
  $('btnDayDelete').addEventListener('click', function () {
    if (!records[editingKey]) { closeSheets(); return; }
    if (!window.confirm('删除 ' + editingKey + ' 的打卡记录？')) return;
    delete records[editingKey];
    saveJSON(KEY_RECORDS, records);
    closeSheets();
    toast('已删除');
    renderAll();
  });
  $('btnDayCancel').addEventListener('click', closeSheets);

  /* ---------- 弹层：设置 ---------- */
  $('btnSettings').addEventListener('click', function () {
    $('setStart').value = settings.start;
    $('setEnd').value = settings.end;
    $('setGrace').value = settings.grace;
    openSheet(setSheet);
  });
  $('btnSetSave').addEventListener('click', function () {
    var s = $('setStart').value, e = $('setEnd').value;
    var g = parseInt($('setGrace').value, 10);
    if (!s || !e) { toast('请填写标准上下班时间'); return; }
    if (toMin(e) <= toMin(s)) { toast('下班时间需要晚于上班时间'); return; }
    settings.start = s;
    settings.end = e;
    settings.grace = isNaN(g) || g < 0 ? 0 : Math.min(g, 720);
    saveJSON(KEY_SETTINGS, settings);
    closeSheets();
    toast('设置已保存');
    renderAll();
  });
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
      var payload = { settings: settings, records: records, exportedAt: new Date().toISOString() };
      $('dataTitle').textContent = '导出备份';
      dataHint.textContent = '长按下方文本全选，再复制保存到备忘录 / 笔记本。';
      dataTextarea.value = JSON.stringify(payload, null, 2);
      dataTextarea.readOnly = true;
      $('btnDataConfirm').textContent = '全选';
      $('btnDataConfirm').className = 'btn btn-ghost';
      $('btnDataConfirm').style.display = '';
    } else {
      $('dataTitle').textContent = '导入备份';
      dataHint.textContent = '将之前导出的 JSON 粘贴到下方，点「确认导入」。';
      dataTextarea.value = '';
      dataTextarea.readOnly = false;
      $('btnDataConfirm').textContent = '确认导入';
      $('btnDataConfirm').className = 'btn btn-primary';
      $('btnDataConfirm').style.display = '';
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
    if (!raw.trim()) { toast('请先粘贴 JSON'); return; }
    try {
      var data = JSON.parse(raw);
      if (!data || typeof data.records !== 'object') throw new Error('bad');
      records = data.records || {};
      if (data.settings) {
        settings.start = data.settings.start || settings.start;
        settings.end = data.settings.end || settings.end;
        settings.grace = typeof data.settings.grace === 'number' ? data.settings.grace : settings.grace;
        saveJSON(KEY_SETTINGS, settings);
      }
      saveJSON(KEY_RECORDS, records);
      closeSheets();
      toast('导入成功');
      renderAll();
    } catch (e) {
      toast('JSON 格式不正确');
    }
  });
  $('btnDataCancel').addEventListener('click', closeSheets);

  $('btnClear').addEventListener('click', function () {
    if (!window.confirm('确定清空全部打卡记录？此操作不可恢复。')) return;
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
  window.addEventListener('resize', setAppHeight);
  setAppHeight();

  /* ---------- 启动 ---------- */
  function renderAll() {
    renderToday();
    renderStats();
    renderHeatmap();
  }
  renderAll();
  scrollHeatmapRight();
})();
