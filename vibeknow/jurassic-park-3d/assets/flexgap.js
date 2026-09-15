// 行为检测：是否支持 Flexbox `gap`（语法检测不可靠，必须实测布局）。
// 命中则给 <html> 加 .supports-flex-gap，CSS 据此启用 gap 增强层并清 margin。
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
