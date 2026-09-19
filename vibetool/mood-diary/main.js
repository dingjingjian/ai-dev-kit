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

  /* ---------- 存储层（小红书容器 §2.4 数据存储 / §3.6 版本判断 / §3.7 Storage） ----------
   * { 'YYYY-MM-DD': { m: 1-6 } }
   *
   * 统一存储契约（与 offwork-heatmap / ai-os 同构，三处改动请同步）：
   *   1) 双通道：容器 Storage（客户端 ≥ 9.46.0 且已注入 setStorage / getStorage）+ localStorage 镜像；
   *   2) 写：镜像通道同步先行、容器异步跟上，任一成功即算成功，两条都失败才回报失败（§3.7 要求）；
   *   3) 读：容器优先，缺失 / 失败退回镜像；容器有而镜像没有则回填，两侧互为兜底；
   *   4) 启动：判定容器通道后后台对齐两侧（缺哪边补哪边），不阻塞首屏；
   *   5) 端能力一律 success / fail 回调 + 800ms 超时兜底（旧容器上 Promise 版不可靠，也不能挂住调用方）；
   *   6) 版本号：buildVersion 抹掉末 3 位，同步取值 → 异步兜底，取不到按「不支持」处理，取值过程绝不抛错；
   *   7) 通道可见：设置面板里显示当前数据通道，真机可自查。
   * 参考：https://miniapp-sandbox.xiaohongshu.com/minitool/doc#s2-4
   */
  var KEY_RECORDS = 'md_records_v1';
  var KEY_THEME = 'md_theme_v1';
  var STORAGE_MIN_CLIENT_VERSION = 9460; /* 客户端 9.46.0 */
  var XHS_CALL_TIMEOUT = 800;            /* 端能力超时即当失败，退回镜像通道 */
  var containerUsable = false;           /* 启动时判定：容器 Storage 通道是否可用 */
  var storageUsage = null;               /* { currentSize, limitSize }，单位 KB（仅容器通道提供） */

  /* §3.6 客户端版本判断：buildVersion 末 3 位是编译序号，须忽略 */
  function readBuildVersion(launchOptions) {
    var miniToolEnv = launchOptions && launchOptions.miniToolEnv;
    return Number(miniToolEnv && miniToolEnv.buildVersion) || 0;
  }
  function getClientVersion(buildVersion) { return Math.floor(buildVersion / 1000); }
  /* 版本号：先同步逐级判空，取不到再异步兜底；两条路都失败按「不支持容器 Storage」处理。
   * 老 SDK 可能不支持 Promise（不传回调时返回 undefined），故非 Promise 返回值也照收，
   * 并且整段 try/catch —— 取版本号这一步绝不能把后面的启动链带崩。 */
  function getBuildVersion() {
    var xhs = window.xhs;
    var syncBV = 0;
    try { syncBV = readBuildVersion(xhs && xhs.launchOptions); } catch (e) { syncBV = 0; }
    if (syncBV) return Promise.resolve(syncBV);
    var miniTool = xhs && xhs.miniTool;
    if (!miniTool || typeof miniTool.getLaunchOptions !== 'function') return Promise.resolve(0);
    try {
      var ret = miniTool.getLaunchOptions();
      if (ret && typeof ret.then === 'function') {
        return ret.then(readBuildVersion, function () { return 0; });
      }
      return Promise.resolve(readBuildVersion(ret));
    } catch (e) { return Promise.resolve(0); }
  }
  /* 已注入的端能力（setStorage / getStorage 都在才认）；取值本身也吞异常 */
  function miniToolApi() {
    var miniTool = null;
    try { miniTool = window.xhs && window.xhs.miniTool; } catch (e) { return null; }
    if (!miniTool) return null;
    if (typeof miniTool.setStorage !== 'function' || typeof miniTool.getStorage !== 'function') return null;
    return miniTool;
  }
  /* 端能力调用：Promise<{ ok, res }>。传 success / fail 回调（不传回调的 Promise
   * 用法在旧容器上不可靠），再叠一层超时兜底，保证任何情况下只 resolve 一次。 */
  function xhsCall(apiName, payload) {
    return new Promise(function (resolve) {
      var api = miniToolApi();
      if (!api || typeof api[apiName] !== 'function') { resolve({ ok: false, res: null }); return; }
      var done = false;
      var timer = setTimeout(function () { finish(false, null); }, XHS_CALL_TIMEOUT);
      function finish(ok, res) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok: ok, res: res || null });
      }
      payload.success = function (res) { finish(res !== false, res); };
      payload.fail = function () { finish(false, null); };
      try { api[apiName](payload); } catch (e) { finish(false, null); }
    });
  }

  /* 镜像通道（localStorage）读写：一律吞异常（§2.4 不保证可用 / 持续有效） */
  function lsGet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  /* 读：容器优先，缺失 / 失败退回镜像；容器有而本地没有时顺手回填镜像。
   * 返回 Promise<data|null>。 */
  function storageGet(key) {
    if (!containerUsable) return Promise.resolve(lsGet(key));
    return xhsCall('getStorage', { key: key }).then(function (r) {
      var nativeVal = (r.ok && r.res && typeof r.res.data !== 'undefined') ? r.res.data : null;
      if (nativeVal === null || nativeVal === undefined) return lsGet(key);
      if (lsGet(key) === null) lsSet(key, nativeVal);
      return nativeVal;
    });
  }
  /* 写：镜像通道同步先行 + 容器异步跟上，任一成功即返回 true。
   * 只有两条通道都失败才返回 false，调用方据此提示（§3.7 要求）。 */
  function storageSet(key, data) {
    var localOk = lsSet(key, data);
    if (!containerUsable) return Promise.resolve(localOk);
    return xhsCall('setStorage', { key: key, data: data }).then(function (r) {
      return localOk || r.ok;
    });
  }

  /* 初始化：判定容器通道（版本 + 注入）→ 后台对齐两侧，并探测容器用量。
   * 对齐与用量都放后台跑、不阻塞首屏：读数据本身已带镜像兜底。 */
  function storageInit() {
    return getBuildVersion().then(function (buildVersion) {
      containerUsable = !!miniToolApi() && getClientVersion(buildVersion) >= STORAGE_MIN_CLIENT_VERSION;
      if (!containerUsable) return null;
      syncChannels();
      return probeUsage();
    });
  }
  /* 容器与镜像互相对齐：容器有本地没有 → 补本地；本地有容器没有 → 迁进容器；
   * 都有以容器为准（升级到端能力后容器才是真源）。不删除任何一份——两侧互为兜底。 */
  function syncChannels() {
    var keys = [KEY_RECORDS, KEY_THEME];
    var tasks = [];
    for (var i = 0; i < keys.length; i++) {
      (function (key) {
        var localVal = lsGet(key);
        tasks.push(xhsCall('getStorage', { key: key }).then(function (r) {
          var nativeVal = (r.ok && r.res && typeof r.res.data !== 'undefined') ? r.res.data : null;
          if (nativeVal === null || nativeVal === undefined) {
            if (localVal === null) return null;                        /* 两边都没有：无需对齐 */
            return xhsCall('setStorage', { key: key, data: localVal }).then(function () {});
          }
          if (localVal === null || JSON.stringify(localVal) !== JSON.stringify(nativeVal)) {
            lsSet(key, nativeVal);                                     /* 容器为准，镜像跟上 */
          }
          return null;
        }));
      })(keys[i]);
    }
    return Promise.all(tasks);
  }
  /* 容器用量（仅容器通道提供，单位 KB），用于设置面板展示 */
  function probeUsage() {
    return xhsCall('getStorageInfo', {}).then(function (r) {
      if (r.ok && r.res && typeof r.res.currentSize !== 'undefined') {
        storageUsage = { currentSize: r.res.currentSize, limitSize: r.res.limitSize };
      }
    });
  }
  /* 设置面板里的数据通道说明（真机自查用） */
  function storageSummary() {
    if (!containerUsable) return '数据通道：localStorage（降级）';
    if (storageUsage && typeof storageUsage.currentSize !== 'undefined') {
      return '数据通道：容器 Storage · ' + storageUsage.currentSize + ' / ' + (storageUsage.limitSize || 10240) + ' KB';
    }
    return '数据通道：容器 Storage';
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

  var records = {}; /* 启动时由 boot() 异步加载后填充 */

  /* ---------- 状态判定 ----------
   * 0 未记录 | 1-6 对应六种心情
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
      return { text: '还没记录', sub: '点下面的圆点，只记颜色不记事' };
    }
    return { text: moodOf(st).name, sub: '已记下 · 点日历上的圆点可以改' };
  }

  /* ---------- DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var elDate = $('todayDate'), elVerdict = $('todayVerdict'), elSub = $('todaySub');
  var elHeroSub = $('heroSub'), elFace = $('todayFace');
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
    { mode: 'auto',  name: '跟随系统', meta: '#0d1117', dots: ['#0d1117', '#33204a', '#bc8cff'] },
    { mode: 'dark',  name: '深夜',     meta: '#0d1117', dots: ['#0d1117', '#33204a', '#bc8cff'] },
    { mode: 'light', name: '明亮',     meta: '#f2f4f7', dots: ['#f2f4f7', '#f0e4fc', '#8250df'] },
    { mode: 'sepia', name: '暖阳纸张', meta: '#f6f0e4', dots: ['#f6f0e4', '#f2e3cd', '#8b6bb1'] },
    { mode: 'mint',  name: '薄荷',     meta: '#eef6f4', dots: ['#eef6f4', '#e0eaf7', '#3b8db8'] },
    { mode: 'sakura', name: '樱粉',    meta: '#fdf3f5', dots: ['#fdf3f5', '#fbe0e8', '#c65f89'] }
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
    storageSet(KEY_THEME, mode).then(function (ok) {
      if (!ok) toast('主题保存失败，下次打开不会沿用');
    });
    applyTheme(mode);
    buzz();
  });
  if (mqDark) {
    var onSystemThemeChange = function () { if (themeMode === 'auto') applyTheme('auto'); };
    if (mqDark.addEventListener) mqDark.addEventListener('change', onSystemThemeChange);
    else if (mqDark.addListener) mqDark.addListener(onSystemThemeChange);
  }

  /* ---------- 渲染：心情按钮（今日卡片 + 弹层共用） ---------- */
  function moodButtonHTML(mood, pressed, cls) {
    return '<button type="button" class="' + cls + ' pm' + mood.id + (pressed ? ' on' : '') + '" data-mood="' + mood.id + '">' +
      '<span class="emoji">' + mood.emoji + '</span>' +
      '<span class="label">' + mood.name + '</span></button>';
  }

  /* ---------- 渲染：今日情绪（大圆面 + 圆点轮盘） ---------- */
  function renderToday() {
    var key = todayKey();
    var now = new Date();
    elDate.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + WEEKDAYS[now.getDay()];
    var st = dayState(key);
    var v = dayVerdict(key);
    elVerdict.textContent = v.text;
    elVerdict.className = 'today-verdict' + (st ? ' vm' + st : '');
    elSub.textContent = v.sub;

    /* 圆面与页头小字是后加的节点：版本错配时缺失也只是少显示这两处，
     * 不能在 renderAll 途中抛异常、把后面的日历一起带没。 */
    if (elFace) {
      if (st) {
        elFace.className = 'today-face fm' + st;
        elFace.innerHTML = '<span class="face-emoji">' + moodOf(st).emoji + '</span>';
      } else {
        elFace.className = 'today-face is-empty';
        elFace.innerHTML = '<span class="face-q">?</span>';
      }
    }

    var days = countRecords();
    if (elHeroSub) {
      elHeroSub.textContent = days
        ? '已经记录 ' + days + ' 天 · 连续好心情 ' + goodStreak() + ' 天'
        : '每天一个颜色，不用写字，半年后回看会很有意思';
    }

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
    persistRecords();
    buzz();
    toast('记下了：今天' + stateText(moodId));
    renderAll();
  }
  btnEditToday.addEventListener('click', function () {
    var key = todayKey();
    delete records[key];
    persistRecords();
    toast('已撤销今天的记录');
    renderAll();
  });

  /* ---------- 统计 ---------- */
  function monthPrefix(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-'; }

  /* 某个月（按 'YYYY-MM-' 前缀）六种心情各多少天，索引 1-6 对应心情 */
  function monthCounts(prefix) {
    var counts = [0, 0, 0, 0, 0, 0, 0];
    for (var key in records) {
      if (!records.hasOwnProperty(key) || key.indexOf(prefix) !== 0) continue;
      counts[records[key].m]++;
    }
    return counts;
  }
  function sumCounts(counts) {
    var n = 0;
    for (var i = 1; i < counts.length; i++) n += counts[i];
    return n;
  }
  function monthStats() {
    var counts = monthCounts(monthPrefix(new Date()));
    return {
      total: sumCounts(counts),
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

  /* 四项数字横排（仪表行）：标签短于一格宽，不换行 */
  function renderStats() {
    var ms = monthStats();
    var streak = goodStreak();
    var rate = ms.total === 0
      ? '<span class="dash">—</span>'
      : Math.round(ms.happy * 100 / ms.total) + '<span class="unit">%</span>';
    var html = '';
    html += '<div class="stat good"><div class="stat-num">' + streak + '<span class="unit">天</span></div><div class="stat-label">连续好心情</div></div>';
    html += '<div class="stat good"><div class="stat-num">' + rate + '</div><div class="stat-label">好心情率</div></div>';
    html += '<div class="stat"><div class="stat-num">' + ms.total + '<span class="unit">天</span></div><div class="stat-label">本月记录</div></div>';
    html += '<div class="stat' + (ms.sad > 0 ? ' bad' : '') + '"><div class="stat-num">' + ms.sad + '<span class="unit">天</span></div><div class="stat-label">本月低落</div></div>';
    $('statsRow').innerHTML = html;
  }

  /* ---------- 渲染：横向堆积图（本月心情构成） ----------
   * 一段一色，宽度按天数分配：CSS 里 flex-basis 为 0，这里只改写 flex-grow，
   * 于是「天数的比例」直接变成「宽度比例」，段间固定 4px 间隔露出卡片底色。 */
  function stackHTML(counts) {
    var html = '';
    for (var i = 0; i < MOODS.length; i++) {
      var c = counts[MOODS[i].id];
      if (!c) continue;
      html += '<span class="stack-seg s' + MOODS[i].id + '" style="flex-grow:' + c + '"></span>';
    }
    return html;
  }

  function renderMix() {
    var bar = $('mixBar'), legend = $('mixLegend'), note = $('mixTotal');
    /* 结构缺失（页面与脚本版本错配，例如浏览器还缓存着旧 main.js）时
     * 只跳过本卡，不能让异常打断 renderAll 里后面的日历渲染。 */
    if (!bar || !legend || !note) return;

    var counts = monthCounts(monthPrefix(new Date()));
    var total = sumCounts(counts);
    note.textContent = total ? '本月 ' + total + ' 天' : '本月暂无记录';

    if (total === 0) {
      bar.className = 'stack is-empty';
      bar.innerHTML = '<span class="stack-empty">本月还没有记录</span>';
      legend.innerHTML = '';
      return;
    }

    bar.className = 'stack';
    bar.innerHTML = stackHTML(counts);
    var lh = '';
    for (var i = 0; i < MOODS.length; i++) {
      var c = counts[MOODS[i].id];
      lh += '<span class="lg' + (c ? '' : ' is-off') + '">' +
        '<i style="background:var(--m' + MOODS[i].id + ')"></i>' + MOODS[i].name +
        '<b>' + c + '天 · ' + Math.round(c * 100 / total) + '%</b></span>';
    }
    legend.innerHTML = lh;
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
        cell.className = 'hm-cell lv' + dayState(key) + (key === tKey ? ' is-today' : '') + (future ? ' future' : '');
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
    persistRecords();
    buzz();
    closeSheets();
    toast(key === todayKey() ? '已记为' + stateText(moodId) : '已保存 ' + key);
    renderAll();
  }

  $('btnDayClear').addEventListener('click', function () {
    if (!editingKey) { closeSheets(); return; }
    delete records[editingKey];
    persistRecords();
    closeSheets();
    toast('已清除 ' + editingKey);
    renderAll();
  });
  $('btnDayCancel').addEventListener('click', closeSheets);

  /* ---------- 弹层：设置 ---------- */
  $('btnSettings').addEventListener('click', function () { renderStorageNote(); openSheet(setSheet); });
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
      persistRecords();
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
    persistRecords();
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
    renderMix();
    renderHeatmap();
    scrollHeatmapRight();
  }

  /* 写 records：两条通道都写，只有都失败才提示（§3.7 要求调用方处理 false） */
  function persistRecords() {
    return storageSet(KEY_RECORDS, records).then(function (ok) {
      if (!ok) toast('保存失败，下次打开可能丢失');
    });
  }
  /* 设置面板里的数据通道说明：打开设置时刷新一次，能看到真机实际走的通道 */
  function renderStorageNote() {
    var el = $('storageNote');
    if (el) el.textContent = storageSummary();
  }

  /* ---------- 启动：异步加载存储后渲染 ----------
   * 容器通道为异步，启动流程：判定通道 + 后台对齐 → 读 records → 读 theme → renderAll。
   * 加载期间 records 为空、主题为默认；容器通道不可用时全程走 localStorage 镜像。 */
  function boot() {
    storageInit().then(function () {
      return storageGet(KEY_RECORDS);
    }).then(function (recData) {
      records = recData ? normalizeRecords(recData) : {};
      return storageGet(KEY_THEME);
    }).then(function (themeLoaded) {
      applyTheme(themeLoaded || DEFAULT_THEME);
      renderAll();
      renderStorageNote();
    });
  }
  boot();
})();
