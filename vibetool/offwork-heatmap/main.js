(function () {
  'use strict';

  /* ---------- 存储层（小红书容器 §2.4 数据存储 / §3.6 版本判断 / §3.7 Storage） ----------
   * v2：只记准不准时 —— { 'YYYY-MM-DD': { ok: true|false } }
   * v1（历史）：{ 'YYYY-MM-DD': { in: 'HH:MM', out: 'HH:MM' } }，首次打开时迁移。
   *
   * 统一存储契约（与 mood-diary / ai-os 同构，三处改动请同步）：
   *   1) 双通道：容器 Storage（客户端 ≥ 9.46.0 且已注入 setStorage / getStorage）+ localStorage 镜像；
   *   2) 写：镜像通道同步先行、容器异步跟上，任一成功即算成功，两条都失败才回报失败（§3.7 要求）；
   *   3) 读：容器优先，缺失 / 失败退回镜像；容器有而镜像没有则回填，两侧互为兜底；
   *   4) 启动：判定容器通道后后台对齐两侧（缺哪边补哪边），不阻塞首屏；SDK 注入晚于首屏
   *      脚本时按 INJECT_WAIT 轮询等待，等到即切换通道，不靠重开小工具；
   *   5) 端能力一律 success / fail 回调 + 800ms 超时兜底（旧容器上 Promise 版不可靠，也不能挂住调用方）；
   *   6) 版本号：buildVersion 抹掉末 3 位，同步取值 → 异步兜底，取不到按「不支持」处理，取值过程绝不抛错；
   *   7) 通道可见：设置面板里只写当前走的通道（用户不需要知道判定细节）；为什么走这条通道、
   *      真机 buildVersion、端能力缺什么，留在 console，URL 带 ?debug 时才一并上屏。
   */
  var KEY_RECORDS = 'owt_records_v2';
  var KEY_RECORDS_V1 = 'owt_records_v1';
  var KEY_SETTINGS_V1 = 'owt_settings_v1';
  var KEY_THEME = 'owt_theme_v1';
  var STORAGE_MIN_CLIENT_VERSION = 9460; /* 客户端 9.46.0 */
  var XHS_CALL_TIMEOUT = 800;            /* 端能力超时即当失败，退回镜像通道 */
  var INJECT_WAIT = 1500;                /* 等 SDK 注入的上限，官方未承诺注入时机 */
  var INJECT_POLL = 100;                 /* 等注入时的轮询间隔 */
  var containerUsable = false;           /* 判定结果：容器 Storage 通道是否可用 */
  var containerReason = 'probing';       /* 未启用容器通道的原因码，真机自查用 */
  var containerBuildVersion = 0;         /* 真机上取到的原始 buildVersion，排查版本门槛用 */
  var containerApiMissing = '';          /* 端能力里缺哪些接口（setStorage / getStorage），排查用 */
  var containerApiList = '';             /* 端能力里实际有哪些函数，排查 bridge 类型用 */
  var recordsDirty = false;              /* 启动后用户是否已写过数据（写过的内存是最新的，不许容器回灌） */
  var detecting = null;                  /* 判定进行中，避免并发重复判定 / 对齐 */
  var storageUsage = null;               /* { currentSize, limitSize }，单位 KB（仅容器通道提供） */

  /* §3.6 客户端版本判断：buildVersion 末 3 位是编译序号，须忽略 */
  function readBuildVersion(launchOptions) {
    var env = launchOptions && launchOptions.miniToolEnv;
    return Number(env && env.buildVersion) || 0;
  }
  function getClientVersion(buildVersion) { return Math.floor(buildVersion / 1000); }

  /* 端能力注入状态：api 为「setStorage / getStorage 都在」的对象（读写都要用，缺一不可），
   * miniTool 是原样拿到的端能力对象（不为 null 就说明 bridge 在，只是接口不全），
   * reason 记缺失在哪一环 —— 只显示「localStorage 降级」根本分不清是版本不够、SDK 没注入，
   * 还是注入了但没这批接口。 */
  function sdkState() {
    var xhs = null;
    try { xhs = window.xhs; } catch (e) { return { api: null, miniTool: null, reason: 'no-bridge' }; }
    if (!xhs) return { api: null, miniTool: null, reason: 'no-bridge' };
    var api = null;
    try { api = xhs.miniTool; } catch (e) { api = null; }
    if (!api) return { api: null, miniTool: null, reason: 'no-api' };
    if (typeof api.setStorage !== 'function' || typeof api.getStorage !== 'function') {
      return { api: null, miniTool: api, reason: 'no-storage-api' };
    }
    return { api: api, miniTool: api, reason: '' };
  }
  /* 已注入的端能力（setStorage / getStorage 都在才认）；取值本身也吞异常 */
  function miniToolApi() { return sdkState().api; }
  /* 缺哪些接口（真机自查用）：setStorage / getStorage / 两者都缺 */
  function missingApiText(miniTool) {
    if (!miniTool) return '';
    var miss = [];
    if (typeof miniTool.setStorage !== 'function') miss.push('setStorage');
    if (typeof miniTool.getStorage !== 'function') miss.push('getStorage');
    return miss.join('、');
  }
  /* 端能力对象上都有哪些函数（最多列 6 个）：用来判断 bridge 到底是不是小工具容器那套。
   * 只提供非 storage 能力（如 postNote / saveImageToPhotosAlbum）时，基本可断定是
   * 客户端版本没到 9.46.0，容器没把 Storage 这批注入进来。 */
  function apiNameText(miniTool) {
    if (!miniTool) return '';
    var skip = { success: 1, fail: 1, complete: 1 };
    var names = [];
    try {
      for (var k in miniTool) {
        if (skip[k]) continue;
        if (typeof miniTool[k] === 'function' && names.length < 6) names.push(k);
      }
    } catch (e) { return ''; }
    return names.length ? names.join('、') + (names.length >= 6 ? '…' : '') : '';
  }

  /* getLaunchOptions：取启动参数里的 buildVersion。文档说 Promise 与 success / fail 回调
   * 都支持，但真机上只认回调的实现确实存在（storage 那套就是因此一律走回调），故两种都给：
   * 传了回调还返回 Promise 也能接住。再叠 800ms 超时，保证只 resolve 一次、绝不挂住启动链。 */
  function fetchLaunchOptions(api) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { finish(null); }, XHS_CALL_TIMEOUT);
      function finish(launchOptions) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(launchOptions || null);
      }
      try {
        var ret = api.getLaunchOptions({
          success: function (launchOptions) { finish(launchOptions); },
          fail: function () { finish(null); }
        });
        if (ret && typeof ret.then === 'function') {
          ret.then(function (launchOptions) { finish(launchOptions); }, function () { finish(null); });
        } else if (ret) {
          finish(ret);                                     /* 老 SDK 也可能直接同步返回 */
        }
      } catch (e) { finish(null); }
    });
  }
  /* 版本号：先同步逐级判空，取不到再异步兜底；两条路都失败按「不支持容器 Storage」处理。
   * 整段 try/catch —— 取版本号这一步绝不能把后面的启动链带崩。 */
  function getBuildVersion(api) {
    var sync = 0;
    try { sync = readBuildVersion(window.xhs && window.xhs.launchOptions); } catch (e) { sync = 0; }
    if (sync) return Promise.resolve(sync);
    if (!api || typeof api.getLaunchOptions !== 'function') return Promise.resolve(0);
    return fetchLaunchOptions(api).then(readBuildVersion);
  }
  /* 等端能力注入：官方没承诺 window.xhs 的注入时机（§3.6 明确「都可能缺失」），
   * 首屏脚本跑得比注入早是正常的，所以「现在没看到」不等于「不支持」——按 100ms 轮询等到
   * INJECT_WAIT 为止；waitMs 为 0 时只看当前状态，不引入任何等待。 */
  function waitForInjection(waitMs) {
    return new Promise(function (resolve) {
      var st = sdkState();
      if (st.api || !waitMs) { resolve(st); return; }
      var waited = 0;
      var timer = setInterval(function () {
        var cur = sdkState();
        waited += INJECT_POLL;
        if (cur.api || waited >= waitMs) { clearInterval(timer); resolve(cur); }
      }, INJECT_POLL);
    });
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

  /* 镜像通道（localStorage）读写：一律吞异常（§2.4 不保证可用 / 持续有效），
   * 同时承担 v1 旧 key（只在 localStorage）的直读。 */
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
  function storageSet(key, val) {
    var localOk = lsSet(key, val);
    if (!containerUsable) return Promise.resolve(localOk);
    return xhsCall('setStorage', { key: key, data: val }).then(function (r) {
      return localOk || r.ok;
    });
  }

  /* 初始化：判定容器通道（版本 + 注入）→ 后台对齐两侧 + 探测容器用量。
   * 分两条路，区别只在「SDK 现在在不在」：
   *   快路径（已注入）：立即判定，行为与不引入等待时完全一致，不给首屏加延迟；
   *   慢路径（还没注入）：先用镜像通道起步（读数据本就有镜像兜底），后台等它最多 INJECT_WAIT，
   *                       等到就把通道切过去并补做对齐 —— SDK 迟到也能自愈，不必重开小工具。 */
  function storageInit() {
    var st = sdkState();
    if (!st.api) {
      containerReason = st.reason;
      lateDetect();
      return Promise.resolve(false);
    }
    return getBuildVersion(st.api).then(function (buildVersion) {
      containerBuildVersion = buildVersion;
      if (getClientVersion(buildVersion) < STORAGE_MIN_CLIENT_VERSION) {
        containerUsable = false;
        containerReason = buildVersion ? 'old-client' : 'no-version';
        return false;
      }
      containerUsable = true;
      containerReason = '';
      syncChannels();
      return probeUsage();
    });
  }
  /* SDK 迟到：等到注入 → 判定 → 对齐两侧 → 刷新设置面板里的通道说明。 */
  function lateDetect() {
    detectContainer(INJECT_WAIT).then(function (usable) {
      if (usable) alignChannels();
      renderStorageNote();
    }, function () { renderStorageNote(); });
  }
  /* 重新判定容器通道（可反复调用：SDK 迟到、打开设置时按需重探）。
   * 只有真判定成功才做两侧对齐与用量探测，返回 Promise<boolean>。 */
  function detectContainer(waitMs) {
    if (detecting) return detecting;
    detecting = waitForInjection(waitMs).then(function (st) {
      if (!st.api) {
        containerUsable = false;
        containerReason = st.reason;
        /* bridge 在、只是接口不齐时，仍试着把版本号读出来：能读到 9.46.0 以上就是
         * 「注入了但这批接口没给」，读不到或版本偏低则多半是客户端根本没到版本门槛。
         * 注意此处用的是 st.miniTool（不要求含 storage），getLaunchOptions 通常先于 storage 就位。 */
        containerApiMissing = missingApiText(st.miniTool);
        containerApiList = apiNameText(st.miniTool);
        return getBuildVersion(st.miniTool).then(function (buildVersion) {
          containerBuildVersion = buildVersion;
          return false;
        });
      }
      return getBuildVersion(st.api).then(function (buildVersion) {
        containerBuildVersion = buildVersion;
        if (getClientVersion(buildVersion) < STORAGE_MIN_CLIENT_VERSION) {
          containerUsable = false;
          containerReason = buildVersion ? 'old-client' : 'no-version';
          return false;
        }
        containerUsable = true;
        containerReason = '';
        return alignChannels().then(function () { return true; });
      });
    });
    detecting.then(function () { detecting = null; }, function () {
      containerUsable = false;
      containerReason = 'error';
      detecting = null;
    });
    return detecting;
  }
  /* 容器通道就绪后的收尾：探测用量 + 两侧对齐。
   * 启动后用户已经写过数据（recordsDirty）就不能再做「容器优先」的对齐——此刻内存才是最新的，
   * 让容器回灌会把刚打的卡冲掉；改为一律把内存 / 镜像的最新值上推给容器。
   * 没写过才走常规对齐（容器为准），并回读一次容器真源补上首屏可能缺失的数据。 */
  function alignChannels() {
    var tasks = [probeUsage()];
    if (recordsDirty) {
      tasks.push(pushChannels());
    } else {
      tasks.push(syncChannels().then(function () {
        return Promise.all([reloadRecords(), loadThemeAsync()]);
      }));
    }
    return Promise.all(tasks);
  }
  /* 把本地最新值上推给容器（不回读、不回灌）：用户已经写过数据时用 */
  function pushChannels() {
    var tasks = [xhsCall('setStorage', { key: KEY_RECORDS, data: records })];
    var theme = lsGet(KEY_THEME);
    if (theme !== null) tasks.push(xhsCall('setStorage', { key: KEY_THEME, data: theme }));
    return Promise.all(tasks);
  }
  /* 容器与镜像互相对齐：容器有本地没有 → 补本地；本地有容器没有 → 迁进容器；
   * 两边都有则以容器为准（升级到端能力后容器才是真源）。
   * v1 旧 key 不参与——v1→v2 迁移在启动逻辑里做，搬过去反而乱。 */
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
  /* 未启用容器通道的原因码 → 人话。只给开发看：默认不上屏，URL 带 ?debug 或看 console。
   * 缺 Storage 接口时补上「缺哪个 + 已经注入了哪些」：这批接口随客户端 9.46.0 才注入，
   * 若端能力里有 postNote 之类的别的接口、偏偏没有 setStorage，基本就是客户端版本没到。 */
  var REASON_TEXT = {
    probing: '正在检测端能力',
    'no-bridge': '未注入端能力 SDK（window.xhs 不存在）',
    'no-api': '端能力对象缺失（window.xhs.miniTool 不存在）',
    'no-storage-api': '端能力里没有 Storage 这批接口（随客户端 9.46.0 注入）',
    'no-version': '未取到客户端版本号（buildVersion 缺失）',
    'old-client': '客户端版本低于 9.46.0',
    error: '端能力调用异常'
  };
  function reasonText() {
    if (containerReason !== 'no-storage-api') return REASON_TEXT[containerReason] || REASON_TEXT.probing;
    return '端能力里没有 ' + (containerApiMissing || 'setStorage') + '（随客户端 9.46.0 注入）';
  }
  /* 设置面板里的数据通道说明：只说当前走哪条通道，不解释原因（用户不需要知道这些）。
   * 原因、真机 buildVersion、已注入的端能力清单都归到下面的调试信息里。 */
  function storageSummary() {
    if (!containerUsable) return '数据通道：localStorage（降级）';
    if (storageUsage && typeof storageUsage.currentSize !== 'undefined') {
      return '数据通道：容器 Storage · ' + storageUsage.currentSize + ' / ' + (storageUsage.limitSize || 10240) + ' KB';
    }
    return '数据通道：容器 Storage';
  }
  /* 排查开关：URL 带 ?debug（或 #debug）时把判定细节也上屏；默认只打 console，
   * 用户侧永远只看到「走的哪条通道」这一行。 */
  var DEBUG = false;
  try {
    DEBUG = /[?&#]debug\b/.test(String(window.location.search || '') + String(window.location.hash || ''));
  } catch (e) { DEBUG = false; }
  /* 判定细节（开发自查用）：为什么走这条通道、真机版本号、端能力里缺什么 / 有什么 */
  function storageDebugDetail() {
    var parts = [containerUsable ? '判定：容器通道可用' : '判定：未启用容器通道 · ' + reasonText()];
    if (containerBuildVersion) parts.push('buildVersion ' + containerBuildVersion);
    if (containerApiMissing) parts.push('缺接口 ' + containerApiMissing);
    if (containerApiList) parts.push('已注入端能力 ' + containerApiList);
    if (storageUsage) parts.push('用量 ' + storageUsage.currentSize + '/' + (storageUsage.limitSize || 10240) + ' KB');
    return '| ' + parts.join('；');
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
    var old = lsGet(KEY_RECORDS_V1);
    if (!old) return null;
    var s = lsGet(KEY_SETTINGS_V1);
    var limit = toMin(LEGACY_END);
    if (s && typeof s.end === 'string') {
      var m = toMin(s.end);
      if (m !== null) limit = m + (typeof s.grace === 'number' ? s.grace : 0);
    }
    return normalizeRecords(old, limit);
  }

  var records = {}; /* 启动时由 initRecords() 异步填充 */

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
  var THEMES = [
    { mode: 'auto',  name: '跟随系统', meta: '#0d1117', dots: ['#0d1117', '#161b22', '#3fd05c'] },
    { mode: 'dark',  name: '深夜',     meta: '#0d1117', dots: ['#0d1117', '#161b22', '#3fd05c'] },
    { mode: 'light', name: '明亮',     meta: '#f2f4f7', dots: ['#f2f4f7', '#ffffff', '#2da44e'] },
    { mode: 'sepia', name: '暖阳纸张', meta: '#f6f0e4', dots: ['#f6f0e4', '#fffaf0', '#4f8a5b'] },
    { mode: 'mint',  name: '薄荷',     meta: '#eef6f4', dots: ['#eef6f4', '#ffffff', '#2fa26b'] },
    { mode: 'sunset', name: '落日',    meta: '#2a1d14', dots: ['#2a1d14', '#3d2d22', '#e89530'] }
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
    /* Chrome 61 只有 addListener；新内核用 addEventListener */
    if (mqDark.addEventListener) mqDark.addEventListener('change', onSystemThemeChange);
    else if (mqDark.addListener) mqDark.addListener(onSystemThemeChange);
  }
  applyTheme(DEFAULT_THEME); /* 异步加载见文件末尾 loadThemeAsync */

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
    persistRecords();
    buzz();
    toast(ok ? '记下了：今天准时下班' : '记下了：今天加班');
    renderAll();
  }
  btnOntime.addEventListener('click', function () { punch(true); });
  btnOvertime.addEventListener('click', function () { punch(false); });
  btnEditToday.addEventListener('click', function () {
    var key = todayKey();
    delete records[key];
    persistRecords();
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
    persistRecords();
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
    persistRecords();
    closeSheets();
    toast('已清除 ' + editingKey);
    renderAll();
  });
  $('btnDayCancel').addEventListener('click', closeSheets);

  /* ---------- 弹层：设置 ---------- */
  $('btnSettings').addEventListener('click', function () {
    renderStorageNote();
    openSheet(setSheet);
    if (!containerUsable) probeOnDemand();      /* 未启用时重探一次：SDK 迟到也能显示成容器通道 */
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
      persistRecords();
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
    updateHmNav();                                           /* 屏宽变了，一屏周数也变了 */
  });
  setAppHeight();

  /* ---------- 持久化 + 异步启动 ----------
   * persistRecords：写 records 到两条通道，两条都失败才 toast（§3.7 要求调用方处理 false）。
   * initRecords：启动时异步读 records，无则尝试 v1 迁移并写入。
   * loadThemeAsync：启动时异步读主题并应用。
   * 启动顺序：storageInit（判定容器通道 + 后台对齐两条通道）→ initRecords → renderAll → loadThemeAsync。
   */
  function persistRecords() {
    recordsDirty = true;                       /* 用户写过：内存即最新，容器通道迟到就绪时不许回灌 */
    return storageSet(KEY_RECORDS, records).then(function (ok) {
      if (!ok) toast('保存失败，下次打开可能丢失');
    });
  }
  /* 数据通道说明：用户侧只写「走的哪条通道」；判定细节任何情况下都留在 console（开发自查），
   * 只有 URL 带 ?debug 时才一并上屏。 */
  function renderStorageNote() {
    var base = storageSummary();
    var detail = storageDebugDetail();
    try { console.log('[storage] ' + base + detail); } catch (e) {}
    var el = $('storageNote');
    if (el) el.textContent = DEBUG ? base + ' ' + detail : base;
  }
  /* 打开设置时补一次判定（最多等注入 300ms）：别让「降级」只是首屏那一瞬间的结论 */
  function probeOnDemand() {
    detectContainer(300).then(renderStorageNote, renderStorageNote);
  }
  /* 容器通道迟到就绪后回读一次：容器才是真源（浏览器自带存储不保证持续有效，镜像可能被清过）。
   * 只在用户还没写过数据时被 alignChannels 调用。 */
  function reloadRecords() {
    return storageGet(KEY_RECORDS).then(function (saved) {
      if (!saved) return null;
      var next = normalizeRecords(saved);
      if (JSON.stringify(next) === JSON.stringify(records)) return null;
      records = next;
      renderAll();
      renderStorageNote();
      return null;
    });
  }
  function initRecords() {
    return storageGet(KEY_RECORDS).then(function (saved) {
      if (saved) {
        records = normalizeRecords(saved);
        return null;
      }
      /* v1 迁移：v1 数据只在 localStorage（旧版本写的），端能力不会有 v1 */
      var migrated = migrateV1();
      if (migrated) {
        records = migrated;
        return storageSet(KEY_RECORDS, records).then(function (ok) {
          if (!ok) toast('存储写入失败，本次迁移结果不会保留');
        });
      }
      records = {};
      return null;
    });
  }
  function loadThemeAsync() {
    return storageGet(KEY_THEME).then(function (savedTheme) {
      if (savedTheme) applyTheme(savedTheme);
    });
  }

  /* ---------- 启动 ---------- */
  function renderAll() {
    renderToday();
    renderStats();
    renderHeatmap();
    scrollHeatmapRight();                                    /* 每次重绘都停在最新一周 */
  }
  storageInit().then(initRecords).then(function () {
    renderAll();
    loadThemeAsync();
    renderStorageNote();
  });
})();
