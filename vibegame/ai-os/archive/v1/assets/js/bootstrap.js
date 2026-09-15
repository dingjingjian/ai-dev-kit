/*!
 * bootstrap.js —— 启动引导
 *
 * 在应用运行时（app.runtime.js）之前，按依赖顺序初始化各适配模块。
 *
 * 加载时序说明：
 *   本文件与各 modules/*.js 都是 <head> 中的普通脚本，按书写顺序同步执行；
 *   app.runtime.js 位于 </body> 前，因此必定晚于本文件运行。
 *   这保证了运行时首次读取 window.lingguang 与安全区变量时，两者均已就绪。
 */
(function (global) {
  'use strict';

  // 顺序有意义：平台垫片必须先于运行时可用；安全区要在首屏绘制前写入，避免抖动
  var SEQUENCE = ['platformShim', 'safeArea', 'viewport'];

  function boot() {
    var registry = global.AIOS || {};

    SEQUENCE.forEach(function (name) {
      var mod = registry[name];
      if (!mod || typeof mod.init !== 'function') {
        console.warn('[ai-os] 缺少适配模块：' + name);
        return;
      }
      try {
        mod.init();
      } catch (err) {
        // 单个适配模块失败不应阻断应用启动
        console.error('[ai-os] 模块初始化失败：' + name, err);
      }
    });
  }

  global.AIOS = global.AIOS || {};
  global.AIOS.boot = boot;

  boot();
})(window);
