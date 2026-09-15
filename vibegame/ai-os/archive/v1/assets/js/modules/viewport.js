/*!
 * viewport.js —— 软键盘适配模块
 *
 * cross-platform-h5.md §5：PC 模拟器没有软键盘，真机软键盘会遮挡输入框。
 * 应用的「消息回复」流程含文本输入，需要处理这一差异。
 *
 * 实现刻意保守，避免改动既有布局：
 *   1. 把键盘占用高度写入 --keyboard-inset-height，供样式按需消费
 *   2. 在 <html> 上打 data-keyboard-open 标记，供样式/调试判断
 *   3. 仅当焦点确实落在输入控件上时，才把它滚动进可视区
 * 不修改 body 高度、不改 position，因此键盘未弹出时与改造前完全一致。
 */
(function (global) {
  'use strict';

  var OPEN_THRESHOLD = 120; // 高度收缩超过该值才判定为键盘弹出，避开地址栏收放等噪声
  var EDITABLE = /^(INPUT|TEXTAREA)$/;

  function isEditable(el) {
    return !!el && (EDITABLE.test(el.tagName) || el.isContentEditable === true);
  }

  function init() {
    var vv = global.visualViewport;
    if (!vv) return; // 老 WebView 无该 API，直接跳过，不影响主流程

    var root = document.documentElement;
    var wasOpen = false;

    function sync() {
      var inset = Math.max(0, global.innerHeight - vv.height - vv.offsetTop);
      var isOpen = inset > OPEN_THRESHOLD;

      root.style.setProperty('--keyboard-inset-height', inset.toFixed(0) + 'px');

      if (isOpen) {
        root.setAttribute('data-keyboard-open', '');
      } else {
        root.removeAttribute('data-keyboard-open');
      }

      // 键盘刚弹出且焦点在输入控件上时，把输入框顶到可视区中部
      if (isOpen && !wasOpen && isEditable(document.activeElement)) {
        var target = document.activeElement;
        global.setTimeout(function () {
          if (document.activeElement === target && target.scrollIntoView) {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }, 100);
      }

      wasOpen = isOpen;
    }

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();
  }

  global.AIOS = global.AIOS || {};
  global.AIOS.viewport = { init: init };
})(window);
