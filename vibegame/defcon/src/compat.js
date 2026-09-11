/*
 * defcon — compat.js
 * 容器兼容层：只做能力检测，不猜 UA、不按机型或系统版本分支
 * （见工作区根 .skill/minitool-zip-builder/references/js-compatibility.md、css-compatibility.md）。
 *
 * 最低兼容基线是 Android 8.1 出场的 Chrome / WebView 61。检测结果写到 <html> 的 class 上，
 * 由 index.html 里的 `html:not(<class>)` 规则挂降级样式；能力具备时不改任何表现。
 *
 * 加载顺序：本文件最先（在任何渲染逻辑之前，见 index.html 的 <script> 顺序）。
 * 依赖：无。命名空间：window.DC.compat。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};
  var html = document.documentElement;

  /* Flexbox gap（gap / row-gap / column-gap）到 Chrome 84 才支持，WebView 61 会整条忽略。
   *
   * 为什么不能只用 CSS.supports('gap','1px') / @supports (gap:1px)：
   * 语法检测只能证明内核「认识」这个属性，证明不了 gap 在 Flex 布局里真的生效 ——
   * 支持 Grid gap 却不支持 Flex gap 的内核同样能通过语法检测。
   * 所以这里实际建一个 Flex 容器量一次布局：两个空 div，有 1px 行间距时 scrollHeight === 1。
   * 检测只做一次，不放进 resize / 渲染循环。 */
  function supportsFlexGap() {
    var flex = document.createElement('div');
    flex.style.position = 'absolute';
    flex.style.visibility = 'hidden';
    flex.style.display = 'flex';
    flex.style.flexDirection = 'column';
    flex.style.rowGap = '1px';
    flex.appendChild(document.createElement('div'));
    flex.appendChild(document.createElement('div'));
    document.body.appendChild(flex);
    var supported = flex.scrollHeight === 1;
    flex.parentNode.removeChild(flex);
    return supported;
  }

  var flexGap = false;
  try { flexGap = supportsFlexGap(); } catch (e) { flexGap = false; }
  // 用 className 拼接而不是 classList，避免在极端旧内核上再引入一层不确定
  if (flexGap && html.className.indexOf('supports-flex-gap') < 0) {
    html.className += (html.className ? ' ' : '') + 'supports-flex-gap';
  }

  DC.compat = {
    flexGap: flexGap,
    supportsFlexGap: supportsFlexGap
  };
})(typeof window !== 'undefined' ? window : globalThis);
