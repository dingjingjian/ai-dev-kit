/*!
 * safe-area.js —— 安全区适配模块
 *
 * 背景：app.css 的 .safe-area-top / .safe-area-bottom 读取的是
 *       --flash-app-safe-area-inset-* 这组变量，而 app.css 自身在 :root
 *       里把它们写死成 0px。要让容器安全区真正生效，必须以更高优先级
 *       覆盖 —— 即写成 <html> 的内联样式（原产物也是这么做的）。
 *
 * 取值策略（cross-platform-h5.md §3）：
 *   var(--safe-area-inset-*, env(safe-area-inset-*, 0px))
 *   - PC 模拟器：容器注入 --safe-area-inset-* 变量，命中第一段
 *   - 真机 WebView：无该变量，回退到 env() 真实值
 *   - 两者都没有：回退 0px，与改造前表现完全一致
 *
 * 注：变量值里的 var()/env() 是惰性求值的 token 流，
 *     setProperty 写入后由浏览器在使用处再做替换，故两端都能生效。
 */
(function (global) {
  'use strict';

  var EDGES = ['top', 'right', 'bottom', 'left'];

  function expr(edge) {
    return 'var(--safe-area-inset-' + edge + ', env(safe-area-inset-' + edge + ', 0px))';
  }

  function init() {
    var rootStyle = document.documentElement.style;

    EDGES.forEach(function (edge) {
      rootStyle.setProperty('--flash-app-safe-area-inset-' + edge, expr(edge));
    });

    // 应用内另有一个 --flash-app-safe-top 语义变量，保持与顶部安全区同步
    rootStyle.setProperty('--flash-app-safe-top', expr('top'));
  }

  global.AIOS = global.AIOS || {};
  global.AIOS.safeArea = { init: init };
})(window);
