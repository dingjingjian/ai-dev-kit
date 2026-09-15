/* Chrome 61 兼容：Flex gap 的**行为**检测（样式表里的 .supports-flex-gap 靠它打开）。
   必须真建一个 flex 容器量尺寸，不能问 CSS.supports('gap') —— 那个只证明浏览器
   认识 gap 这个属性名，证明不了它在 Flexbox 里生效（只支持 Grid gap 的旧内核
   一样会返回 true，于是间距全丢）。检测只做一次，且必须在页面渲染前跑完。 */
(function () {
  try {
    var t = document.createElement('div');
    t.style.position = 'absolute';
    t.style.visibility = 'hidden';
    t.style.display = 'flex';
    t.style.flexDirection = 'column';
    t.style.rowGap = '1px';
    t.appendChild(document.createElement('div'));
    t.appendChild(document.createElement('div'));
    document.documentElement.appendChild(t);
    if (t.scrollHeight === 1) document.documentElement.className += ' supports-flex-gap';
    document.documentElement.removeChild(t);
  } catch (e) {}
})();
