/*!
 * flex-gap-polyfill.js —— flex 容器 gap 兼容垫片
 *
 * 背景
 *   安卓9 WebView(≈ Chrome 69) 不支持 flex 容器的 gap 属性
 *   (flex5 gap 需 Chrome 84+；grid gap 在 Chrome 66+ 已支持)。
 *   Tailwind 的 .gap-* 类不区分 flex/grid 上下文，在 flex 容器中
 *   间距会完全失效，子项挤在一起。
 *
 * 策略
 *   运行时检测是否支持 flex gap。不支持时注入纯 CSS 规则：
 *   .flex.gap-N:not(.flex-col) > * + * { margin-left: val }
 *   .flex-col.gap-N > * + *             { margin-top:  val }
 *   纯 CSS 方案不依赖 MutationObserver / 标记类，无时序窗口，
 *   React 重渲染不会覆盖规则，间距始终稳定生效。
 */
(function () {
  "use strict";

  /* Tailwind gap 类 → CSS 值（与 app.css 中 .gap-* 定义一致） */
  var GAPS = [
    ["1", "0.25rem"],
    ["1\\.5", "0.375rem"],
    ["2", "0.5rem"],
    ["3", "0.75rem"],
    ["4", "1rem"],
    ["8", "2rem"],
    ["10", "2.5rem"],
  ];

  /* 检测当前环境是否支持 flex gap */
  function supportsFlexGap() {
    var c = document.createElement("div");
    c.style.cssText =
      "display:flex;gap:10px;position:absolute;visibility:hidden";
    var a = document.createElement("div");
    var b = document.createElement("div");
    a.style.cssText = "width:0;height:0";
    b.style.cssText = "width:0;height:0";
    c.appendChild(a);
    c.appendChild(b);
    document.body.appendChild(c);
    var ok = b.offsetLeft >= 10;
    document.body.removeChild(c);
    return ok;
  }

  function init() {
    if (supportsFlexGap()) return;

    var rules = [];
    for (var i = 0; i < GAPS.length; i++) {
      var cls = GAPS[i][0];
      var val = GAPS[i][1];
      /* flex row（排除 flex-col / flex-col-reverse） */
      rules.push(
        ".flex.gap-" + cls + ":not(.flex-col):not(.flex-col-reverse) > * + * { margin-left: " + val + "; }",
        ".inline-flex.gap-" + cls + ":not(.flex-col):not(.flex-col-reverse) > * + * { margin-left: " + val + "; }"
      );
      /* flex col */
      rules.push(
        ".flex-col.gap-" + cls + " > * + * { margin-top: " + val + "; }",
        ".flex-col-reverse.gap-" + cls + " > * + * { margin-bottom: " + val + "; }"
      );
    }

    var style = document.createElement("style");
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
