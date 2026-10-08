/*
 * air-tycoon — save.js
 * 自动存档：序列化/复原整局 state，持久化到小工具本地缓存。
 * 依赖：data.js → geo.js → landmask.js → sim.js（复原时用 AT.sim.makeRng 续随机流）
 * 命名空间：window.AT（经典脚本，无 import/export/type=module）
 *
 * ── 存储方案（对照小红书小工具规范 §2.4 / §3.6 / §3.7 / §3.8）──
 *   ① 客户端 ≥ 9.46（buildVersion ≥ 9460）→ 用端能力 Storage JS API
 *      （window.xhs.miniTool.setStorage / getStorage / removeStorage）。
 *      这是规范**推荐**的持久化方案。
 *   ② 客户端 < 9.46（或未注入端能力，例如普通浏览器预览）→ 降级 localStorage。
 *      规范明确：浏览器自带存储**不保证可用/持久**，故所有读写一律 try/catch，
 *      失败只返回 false / null，**绝不抛出**，调用方必须容忍「读不到、写不成」。
 *   ③ 端能力整体缺失（window.xhs 为 undefined）时同样走 ②，不做任何假设。
 *
 * ⚠ 为什么把 localStorage 圈在本文件里：本作其余源码刻意不碰浏览器存储
 *   （check-chrome61.py 对此有硬性扫描）。规范 §2.4 只把 localStorage 当作
 *   **低版本兼容降级**，故本仓库把它收敛到唯一一个文件、且每处都在 try/catch 内，
 *   扫描脚本据此放行（见 tests/check-chrome61.py 的存储项）。
 *
 * ── 存什么、不存什么 ──
 *   state 里唯一不能 JSON 化的是 rng（闭包函数）与 fx（每帧消费的瞬时特效队列）。
 *   rng 的真值另存为 rngState（见 sim.makeRng 的 getState/setState），
 *   复原时把随机流**接着往下跑**而不是从种子重放 —— 否则读档后的事件序列会与
 *   一直玩下去的世界线分叉，破坏「同种子同结果」的确定性契约。
 *
 * ⚠ 读档时 paused 一律复位为 false：存档可能是在面板打开（暂停计时）那一刻写下的，
 *   若原样恢复，tick 会永远提前返回，游戏卡死。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};

  var KEY = 'air-tycoon.save';
  var VERSION = 1;
  var STORAGE_MIN_CLIENT_VERSION = 9460;   // 客户端 9.46.0；与其后三位编译序号无关

  /* 存档快照里**不**保留的键（rng 单独走 rngState；fx 是瞬时队列，存之无益）。 */
  var DROP = { rng: 1, fx: 1 };

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }

  /* ───────────────────────── 客户端版本判断（规范 §3.6）───────────────────────── */

  function readBuildVersion(launchOptions) {
    var env = launchOptions && launchOptions.miniToolEnv;
    return Number(env && env.buildVersion) || 0;
  }
  function syncBuildVersion() {
    var xhs = global.xhs;
    return readBuildVersion(xhs && xhs.launchOptions);
  }
  function getClientVersion(buildVersion) { return Math.floor((Number(buildVersion) || 0) / 1000); }
  function isClientVersionAtLeast(buildVersion, minimumClientVersion) {
    return getClientVersion(buildVersion) >= minimumClientVersion;
  }

  /* 版本号缓存：同步值拿不到时异步取一次并记住（getLaunchOptions 是异步端能力，
   * 不能每 5 秒的自动存档都去问一遍）。取不到按 0 处理 = 不支持 Storage。 */
  var versionPromise = null;
  function getBuildVersion() {
    var sync = syncBuildVersion();
    if (sync) return Promise.resolve(sync);
    if (versionPromise) return versionPromise;
    var xhs = global.xhs;
    var mt = xhs && xhs.miniTool;
    if (!mt || typeof mt.getLaunchOptions !== 'function') {
      versionPromise = Promise.resolve(0);
      return versionPromise;
    }
    try {
      versionPromise = Promise.resolve(mt.getLaunchOptions()).then(
        function (opt) { return readBuildVersion(opt); },
        function () { return 0; }
      );
    } catch (e) {
      versionPromise = Promise.resolve(0);
    }
    return versionPromise;
  }

  function miniTool() {
    var xhs = global.xhs;
    return (xhs && xhs.miniTool) || null;
  }
  function storageUsable(buildVersion) {
    var mt = miniTool();
    return isClientVersionAtLeast(buildVersion, STORAGE_MIN_CLIENT_VERSION) && mt;
  }

  /* ───────────────────────── 底层读写（恒不抛出）───────────────────────── */

  /* 写入。返回 Promise<boolean>：true = 已写入；false = 没写成，调用方不得当成已保存。 */
  function writeRaw(text) {
    return getBuildVersion().then(function (bv) {
      var mt = miniTool();
      if (storageUsable(bv) && typeof mt.setStorage === 'function') {
        try {
          return Promise.resolve(mt.setStorage({ key: KEY, data: text })).then(
            function () { return true; },
            function () { return false; }
          );
        } catch (e) { return false; }
      }
      // 低版本降级：容器不保证 localStorage 可用/持久，失败即放弃
      try {
        if (!global.localStorage) return false;
        global.localStorage.setItem(KEY, text);
        return true;
      } catch (e) { return false; }
    });
  }

  /* 读取。返回 Promise<string|null>：null = 无存档 / 读失败 / 无可用存储。 */
  function readRaw() {
    return getBuildVersion().then(function (bv) {
      var mt = miniTool();
      if (storageUsable(bv) && typeof mt.getStorage === 'function') {
        try {
          return Promise.resolve(mt.getStorage({ key: KEY })).then(
            function (res) {
              return (res && typeof res.data === 'string') ? res.data : null;
            },
            function () { return null; }
          );
        } catch (e) { return null; }
      }
      try {
        if (!global.localStorage) return null;
        return global.localStorage.getItem(KEY);
      } catch (e) { return null; }
    });
  }

  /* 删除。返回 Promise<boolean>（仅表示「尝试过」，失败无副作用）。 */
  function removeRaw() {
    return getBuildVersion().then(function (bv) {
      var mt = miniTool();
      if (storageUsable(bv) && typeof mt.removeStorage === 'function') {
        try {
          return Promise.resolve(mt.removeStorage({ key: KEY })).then(
            function () { return true; },
            function () { return false; }
          );
        } catch (e) { return false; }
      }
      try {
        if (!global.localStorage) return false;
        global.localStorage.removeItem(KEY);
        return true;
      } catch (e) { return false; }
    });
  }

  /* ───────────────────────── 序列化 / 复原 ─────────────────────────
   * 两个纯函数（不碰存储），便于无头测试直接跑往返一致性。 */

  /* state → JSON 字符串；任何异常（如循环引用）都返回 null。 */
  function serialize(state) {
    if (!state) return null;
    var plain = {};
    for (var k in state) {
      if (!hasOwn(state, k) || DROP[k]) continue;
      plain[k] = state[k];
    }
    var rngState = null;
    if (state.rng && typeof state.rng.getState === 'function') {
      try { rngState = state.rng.getState(); } catch (e) { rngState = null; }
    }
    try {
      return JSON.stringify({
        v: VERSION,
        savedAt: Date.now(),
        rngState: rngState,
        s: plain
      });
    } catch (e) { return null; }
  }

  /* JSON 字符串 → state；版本不符 / 结构残缺 / 解析失败一律 null（当作无存档）。 */
  function deserialize(text) {
    if (!text || typeof text !== 'string') return null;
    var snap;
    try { snap = JSON.parse(text); } catch (e) { return null; }
    if (!snap || snap.v !== VERSION || !snap.s || typeof snap.s !== 'object') return null;

    var state = snap.s;
    /* 结构自检：这几个数组是 sim 后续每一步都要访问的，缺了必然崩 —— 宁可当无存档。 */
    if (!state.phase || !isArr(state.cities) || !isArr(state.planes) ||
        !isArr(state.routes) || !isArr(state.rivals)) return null;

    if (!isArr(state.fx)) state.fx = [];
    if (!isArr(state.history)) state.history = [];
    if (!isArr(state.log)) state.log = [];
    /* mods / priceWars 同样被 sim 每季遍历（settleRoute 的 modEffects / routeAtWar），
     * 旧档若缺这两个数组会**反序列化「成功」**却在首次结算时抛
     * 「Cannot read properties of undefined」—— 静默半坏档比直接判坏更难查。
     * 缺省语义安全（无生效修正 / 无价格战），故补 []，不判为无存档。 */
    if (!isArr(state.mods)) state.mods = [];
    if (!isArr(state.priceWars)) state.priceWars = [];
    if (!state.stats || typeof state.stats !== 'object') {
      state.stats = { paxTotal: 0, cashEarned: 0, cashSpent: 0, routesOpened: 0,
        routesClosed: 0, planesBought: 0, devPushed: 0, citiesUpgraded: 0 };
    }
    // 面板打开时写的档：paused 原样恢复会让 tick 永远早退，必须复位
    state.paused = false;

    /* 复原确定性随机流：先按种子建 rng，再覆盖闭包内的推进位（见文件头）。 */
    if (AT.sim && typeof AT.sim.makeRng === 'function') {
      state.rng = AT.sim.makeRng(state.seed != null ? state.seed : 1);
      if (snap.rngState != null && typeof state.rng.setState === 'function') {
        state.rng.setState(snap.rngState);
      }
    }
    return state;
  }

  /* ───────────────────────── 对外接口 ───────────────────────── */

  function save(state) {
    var text = serialize(state);
    if (!text) return Promise.resolve(false);
    return writeRaw(text);
  }
  function load() {
    return readRaw().then(function (text) { return deserialize(text); });
  }
  function clear() { return removeRaw(); }

  AT.save = {
    KEY: KEY,
    VERSION: VERSION,
    STORAGE_MIN_CLIENT_VERSION: STORAGE_MIN_CLIENT_VERSION,
    getBuildVersion: getBuildVersion,
    getClientVersion: getClientVersion,
    isClientVersionAtLeast: isClientVersionAtLeast,
    serialize: serialize,
    deserialize: deserialize,
    save: save,
    load: load,
    clear: clear
  };

})(typeof window !== 'undefined' ? window : globalThis);
