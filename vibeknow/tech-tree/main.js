/* 人类科技树 · 渲染（经典脚本，ES2017 基线，无模块 / 无内联事件 / 无 eval）
 *
 * 数据全部来自 data.js（ERAS / TECHS / IMG_STYLE / ICONS），本文件不含任何条目内容。
 *
 * 三个视图（hash 路由）：
 *   #/tree       科技树：按时代分层的节点网格 + SVG 前置连线（仿文明系列科技树）
 *   #/list       图鉴：按时代分组的卡片列表（配图位在这里）
 *   #/t/<id>     详情：介绍 / 关键参数 / 前置与后续（可点跳转）/ 亮点 / AI 配图提示词
 *
 * 连线的两条规则：
 *   1) 同代或相邻时代的前置 = 实线，从源节点底部弯入目标节点顶部；
 *   2) 跨多个时代的前置 = 虚线（更浅），表示「更早时代的渊源」，选中时才会亮起。
 * 时代是左侧一根窄立柱（罗马数字 + 名称 + 年代，随滚动吸顶），不横占节点区，
 * 曲线在时代之间的空档里横铺、全程可见，只在节点卡片背后穿过。
 */
(function(){
"use strict";

/* ============================ 基础索引 ============================ */

var IMG_DIR = "./assets/img/";
/* 图片后缀回退链：图 agent 产出 webp / jpg / png 都能被认出来，不必改代码。 */
var EXTS = ["webp", "jpg", "jpeg", "png"];
var GAP_COL = 30;   /* 与 index.html 里 .era-grid 的横向 grid-gap 保持一致 */
var COLS_MIN = 520; /* 视口宽于该值时节点网格由 2 列变 3 列（与 CSS 断点一致） */

var eraIndex = {}, techById = {};
for (var i = 0; i < ERAS.length; i++) { eraIndex[ERAS[i].key] = i; }
for (var j = 0; j < TECHS.length; j++) { techById[TECHS[j].id] = TECHS[j]; }

var childrenOf = {};
for (var k = 0; k < TECHS.length; k++) { childrenOf[TECHS[k].id] = []; }
for (var m = 0; m < TECHS.length; m++) {
  var t0 = TECHS[m];
  for (var n = 0; n < t0.roots.length; n++) {
    if (childrenOf[t0.roots[n]]) { childrenOf[t0.roots[n]].push(t0.id); }
  }
}

function eraOf(key){ return ERAS[eraIndex[key]] || ERAS[0]; }
function eraNo(key){ return eraIndex[key] + 1; }
/* 时代序号用罗马数字：立柱上一个大大的 Ⅵ，比「第 6 时代」更像编年史的章号 */
var ROMAN = ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ","Ⅷ","Ⅸ","Ⅹ","Ⅺ","Ⅻ"];
function eraNum(key){
  var n = eraIndex[key];
  return (n != null && ROMAN[n]) ? ROMAN[n] : String(eraNo(key));
}
function techsOfEra(key){
  var out = [];
  for (var i = 0; i < TECHS.length; i++) { if (TECHS[i].era === key) { out.push(TECHS[i]); } }
  return out;
}
/* 时代内的排列顺序（算法见 orderEra）缓存在这里，渲染与连线都用它 */
var eraOrder = null;
var nodeEls = {};

function escapeHtml(str){
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cols(){
  return window.innerWidth >= COLS_MIN ? 3 : 2;
}
/* 第 idx 个节点在网格中的横坐标中心（解析值，用于同代排序；绘制时改用实测 DOM 位置） */
function colCenter(idx, contentW){
  var c = cols();
  var colW = (contentW - GAP_COL * (c - 1)) / c;
  return (idx % c) * (colW + GAP_COL) + colW / 2;
}

/* ============================ 时代内排序 ============================ */
/* 目标：让「前置」尽量落在「后续」的左上方，连线就少交叉。
   步骤：① 同代内先按数据顺序做一次拓扑修正（前置在前）；
        ② 再用前置的横坐标均值（重心）重排；
        ③ 重排后再做一次拓扑修正，保证同代前置仍在前。 */
function topoFix(list){
  var pos = {}, order = list.slice();
  for (var i = 0; i < order.length; i++) { pos[order[i].id] = i; }
  for (var pass = 0; pass < order.length; pass++) {
    var moved = false;
    for (var a = 0; a < order.length; a++) {
      var roots = order[a].roots;
      for (var b = 0; b < roots.length; b++) {
        var r = roots[b];
        if (pos[r] == null) { continue; }              /* 只处理同代前置 */
        if (pos[r] > pos[order[a].id]) {               /* 前置被排到了后面 → 把本条移过去 */
          var item = order.splice(a, 1)[0];
          var target = pos[r] + 1;
          order.splice(target, 0, item);
          for (var q = 0; q < order.length; q++) { pos[order[q].id] = q; }
          moved = true;
          a = -1;
          break;
        }
      }
      if (a < 0) { break; }
    }
    if (!moved) { break; }
  }
  return order;
}

function computeEraOrder(contentW){
  var xOf = {};                       /* 条目的解析横坐标（按时代顺序逐个确定） */
  var out = {};
  for (var e = 0; e < ERAS.length; e++) {
    var key = ERAS[e].key;
    var list = topoFix(techsOfEra(key));
    var provisional = {};
    for (var i = 0; i < list.length; i++) { provisional[list[i].id] = colCenter(i, contentW); }

    var scored = [];
    for (var s = 0; s < list.length; s++) {
      var t = list[s], xs = [];
      for (var r = 0; r < t.roots.length; r++) {
        var rid = t.roots[r];
        if (xOf[rid] != null) { xs.push(xOf[rid]); }
        else if (provisional[rid] != null) { xs.push(provisional[rid]); }
      }
      var bary = 0;
      for (var p = 0; p < xs.length; p++) { bary += xs[p]; }
      bary = xs.length ? bary / xs.length : colCenter(s, contentW);
      scored.push({t: t, bary: bary, rank: s});
    }
    scored.sort(function(A, B){ return (A.bary - B.bary) || (A.rank - B.rank); });
    var ordered = [];
    for (var q = 0; q < scored.length; q++) { ordered.push(scored[q].t); }
    ordered = topoFix(ordered);

    out[key] = ordered;
    for (var z = 0; z < ordered.length; z++) { xOf[ordered[z].id] = colCenter(z, contentW); }
  }
  return out;
}

/* ============================ 关系查询 ============================ */

function chain(startId, map){
  var seen = {}, stack = [startId], out = [];
  seen[startId] = true;
  while (stack.length) {
    var id = stack.pop();
    var next = map[id] || [];
    for (var i = 0; i < next.length; i++) {
      if (!seen[next[i]]) { seen[next[i]] = true; out.push(next[i]); stack.push(next[i]); }
    }
  }
  return out;
}
function parentsChain(id){                          /* 全部祖先（含间接） */
  var seen = {}, stack = [id], out = [];
  seen[id] = true;
  while (stack.length) {
    var cur = stack.pop();
    var roots = (techById[cur] || {roots: []}).roots;
    for (var i = 0; i < roots.length; i++) {
      if (!seen[roots[i]]) { seen[roots[i]] = true; out.push(roots[i]); stack.push(roots[i]); }
    }
  }
  return out;
}
function childrenChain(id){ return chain(id, childrenOf); }

/* ============================ 图片 ============================ */

var io = null;
try {
  if (typeof window.IntersectionObserver === "function") {
    io = new window.IntersectionObserver(function(entries, obs){
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { loadImg(entries[i].target); obs.unobserve(entries[i].target); }
      }
    }, {rootMargin: "320px 0px"});
  }
} catch(err){ io = null; }

function loadImg(img){
  if (img.getAttribute("src")) { return; }
  var base = img.getAttribute("data-base") || "";
  var n = parseInt(img.getAttribute("data-try") || "0", 10) || 0;
  img.src = base + "." + EXTS[n];
}

function bindImgs(scope){
  var imgs = scope.querySelectorAll("img.shot-img");
  for (var i = 0; i < imgs.length; i++) {
    (function(img){
      img.addEventListener("error", function(){
        var base = img.getAttribute("data-base") || "";
        var n = (parseInt(img.getAttribute("data-try") || "0", 10) || 0) + 1;
        if (n < EXTS.length) {
          img.setAttribute("data-try", String(n));
          img.src = base + "." + EXTS[n];
        } else {
          img.style.display = "none";
        }
      });
      if (io) { io.observe(img); } else { loadImg(img); }
    })(imgs[i]);
  }
}

/* 图片框：占位块永远在 DOM 里，实图加载成功后盖在上面。
   图片缺失 / 后缀不符时依次退回 EXTS 的下一个后缀，全部失败则隐藏 img，露出占位块。 */
function shotHtml(base, title, label, cls, iconKey, eraText){
  var chip = eraText ? '<span class="shot-era">' + escapeHtml(eraText) + '</span>' : '';
  return '<div class="shot ' + cls + '">' +
      '<div class="shot-ph">' +
        (label ? '<span class="bd">' + escapeHtml(label) + '</span>' : '') +
        '<span class="ic">' + (ICONS[iconKey] || ICONS.gear) + '</span>' +
        '<span class="nm">' + escapeHtml(title) + '</span>' +
      '</div>' +
      '<img class="shot-img" alt="" data-base="' + escapeHtml(IMG_DIR + base) + '" data-try="0">' +
      chip +
    '</div>';
}

/* ============================ DOM 句柄 ============================ */

var app = document.getElementById("app");
var segEl = document.getElementById("seg");
var subtitleEl = document.getElementById("subtitle");
var titleEl = document.getElementById("title");
var toastEl = document.getElementById("toast");
var fabTop = document.getElementById("fabTop");
var fabBack = document.getElementById("fabBack");
var topwrap = document.getElementById("topwrap");
var selbar = document.getElementById("selbar");
var selName = document.getElementById("selName");
var selMeta = document.getElementById("selMeta");
var selGo = document.getElementById("selGo");

var ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.6" cy="10.6" r="6.4"/><path d="M15.4 15.4 20.5 20.5"/></svg>';

var VIEW_KEY = "tt:view";
var viewMode = "tree";
var prevView = "tree";     /* 从详情返回时回到哪个视图 */
var selectedId = null;      /* 科技树里被选中的节点 */
var treeScrollY = 0;
var listScrollY = 0;
var query = "";

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(function(){ toastEl.classList.remove("show"); }, 2000);
}
/* 底部操作条与两个悬浮按钮共享底部区域：出现时把操作条高度写进 --selbar-h，
   让悬浮按钮上移，否则「回到顶部」会盖住操作条上的「查看详情」点不到。 */
function showSelbar(){
  selbar.classList.add("show");
  document.documentElement.classList.add("has-selbar");
  try { document.documentElement.style.setProperty("--selbar-h", selbar.offsetHeight + "px"); }
  catch(err){ /* 取不到就沿用 CSS 里的兜底值 */ }
}
function hideSelbar(){
  selbar.classList.remove("show");
  document.documentElement.classList.remove("has-selbar");
}
function setAccent(era){
  document.documentElement.style.setProperty("--accent", era.accent);
  document.documentElement.style.setProperty("--accent-soft", era.soft);
}
function clearAccent(){
  document.documentElement.style.removeProperty("--accent");
  document.documentElement.style.removeProperty("--accent-soft");
}
function syncNavH(){
  try { document.documentElement.style.setProperty("--nav-h", topwrap.offsetHeight + "px"); }
  catch(err){ /* 取不到就沿用 CSS 里的兜底值 */ }
}

/* ============================ 顶栏视图切换 ============================ */

function renderSeg(){
  segEl.innerHTML = "";
  var items = [["tree", "科技树"], ["list", "图鉴"]];
  for (var i = 0; i < items.length; i++) {
    (function(key, label){
      var b = document.createElement("button");
      b.className = viewMode === key ? "active" : "";
      b.textContent = label;
      b.addEventListener("click", function(){
        if (viewMode === key) { return; }
        selectedId = null;
        location.hash = key === "tree" ? "#/tree" : "#/list";
      });
      segEl.appendChild(b);
    })(items[i][0], items[i][1]);
  }
}

/* ============================ 科技树视图 ============================ */

function buildTree(){
  subtitleEl.textContent = TECHS.length + " 项 · " + ERAS.length + " 个时代";
  syncNavH();

  var wrap = document.createElement("div");
  wrap.className = "view";

  /* 首页导语：一段史诗式题引 + 一行统计，到此为止。
     题引之后不再补「这棵树怎么看」的说明段（啰嗦；节点上的年代 / 起点标签、图例与
     底部操作条已经把这套规则讲清楚了）。数字仍全部取自真源，改数据不会说谎。
     卡片标题也不叫「人类科技树」——顶栏那条预留带已经常驻这个名字，重复像两行同名。 */
  var intro = document.createElement("div");
  intro.className = "tree-intro";
  intro.innerHTML =
    '<h2>从第一个生命，到浩瀚星宇</h2>' +
    '<p class="lead">「从水下第一个生命的萌芽开始……到石器时代的巨型野兽……再到人类第一次直立行走，' +
    '你已经历许多。现在，开启你最伟大的探索吧：从早期文明的摇篮到浩瀚星宇。」</p>' +
    '<div class="tree-stats"><b>' + ERAS.length + '</b> 个时代　·　<b>' + TECHS.length +
    '</b> 项科技　·　<b>' + edgeCount() + '</b> 条前置关系　·　从石器到通用人工智能</div>';
  wrap.appendChild(intro);

  var tools = document.createElement("div");
  tools.className = "tools";
  tools.innerHTML =
    '<label class="search">' + ICON_SEARCH +
    '<input id="q" type="search" placeholder="搜索科技名 / 英文 / 年代" value="' +
    escapeHtml(query) + '"></label>' +
    '<button class="clear' + (query ? "" : " hide") + '" id="qClear">清除</button>';
  wrap.appendChild(tools);

  var legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML =
    '<i><b></b>同代 / 相邻时代的前置</i>' +
    '<i class="dash"><b></b>更早时代的渊源</i>' +
    '<i class="sel"><b></b>选中后高亮的脉络</i>';
  wrap.appendChild(legend);

  var board = document.createElement("div");
  board.className = "board";
  board.id = "board";

  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "edges");
  svg.setAttribute("id", "edges");
  board.appendChild(svg);

  for (var e = 0; e < ERAS.length; e++) {
    var era = ERAS[e];
    var list = eraOrder[era.key] || [];
    var sec = document.createElement("section");
    sec.className = "era";
    sec.setAttribute("data-era", era.key);
    sec.style.setProperty("--era-accent", era.accent);

    var rail = document.createElement("div");
    rail.className = "era-rail";
    rail.innerHTML =
      '<div class="era-rom">' + eraNum(era.key) + '</div>' +
      '<div class="era-zh">' + escapeHtml(era.zh) + '</div>' +
      '<div class="era-span">' + escapeHtml(era.span) + '</div>' +
      '<div class="era-cnt">' + list.length + ' 项</div>';
    sec.appendChild(rail);

    var grid = document.createElement("div");
    grid.className = "era-grid";
    for (var i = 0; i < list.length; i++) {
      grid.appendChild(buildNode(list[i]));
    }
    sec.appendChild(grid);
    board.appendChild(sec);
  }

  wrap.appendChild(board);
  app.innerHTML = "";
  app.appendChild(wrap);
  bindImgs(wrap);

  var q = document.getElementById("q");
  q.addEventListener("input", function(){ applyQuery(this.value); });
  document.getElementById("qClear").addEventListener("click", function(){
    var box = document.getElementById("q");
    box.value = "";
    applyQuery("");
  });

  requestAnimationFrame(function(){
    drawEdges();
    applyQuery(query, true);
    if (selectedId) { applySelection(selectedId, true); }
    window.scrollTo(0, treeScrollY);
  });
}

function buildNode(t){
  var era = eraOf(t.era);
  var el = document.createElement("div");
  el.className = "node" + (t.era === "future" ? " future" : "");
  el.setAttribute("data-id", t.id);
  el.setAttribute("data-name", t.name + " " + t.en + " " + t.year);
  var rootTag = t.roots.length === 0
    ? '<span class="n-tag root">起点</span>'
    : (t.era === "future" ? '<span class="n-tag future">前瞻</span>' : '');
  el.innerHTML =
    '<div class="n-row"><span class="n-year">' + escapeHtml(t.year) + '</span>' + rootTag + '</div>' +
    '<div class="n-name">' + escapeHtml(t.name) + '</div>' +
    '<div class="n-en">' + escapeHtml(t.en) + '</div>';
  el.addEventListener("click", function(){ applySelection(t.id); });
  nodeEls[t.id] = el;
  return el;
}

function edgeCount(){
  var c = 0;
  for (var i = 0; i < TECHS.length; i++) { c += TECHS[i].roots.length; }
  return c;
}

/* ---------- 连线 ---------- */

var NS = "http://www.w3.org/2000/svg";

function rectIn(el, boardRect){
  var r = el.getBoundingClientRect();
  return {
    x: r.left - boardRect.left,
    y: r.top - boardRect.top,
    w: r.width,
    h: r.height,
    cx: r.left - boardRect.left + r.width / 2,
    cy: r.top - boardRect.top + r.height / 2
  };
}

/* 目标时代色：连线用「下游」时代的颜色，一眼看出这条线在往哪个时代汇流 */
function edgeColor(target){
  return eraOf(target.era).accent;
}

/* ---------- 走线方式 ----------
   曲线（三次贝塞尔）：每条线先算成 4 个折点 [起点, 控制点1, 控制点2, 终点]，
   取中间两点作贝塞尔控制点 —— 控制点落在时代之间的空档（或列间的中点）上，
   于是线条「先横铺再垂下」，柔和发散，是这本图鉴的定版走线。 */

function fmt1(n){ return Math.round(n * 10) / 10; }

/* 箭头：用 <polygon> 画三角形（<marker> 的 context-stroke 在 Chrome 61 上不可用），
   方向由最后一段折线决定 —— 向下 / 向上 / 向右 / 向左。 */
function arrowPoints(a, b){
  var dx = b[0] - a[0], dy = b[1] - a[1];
  var x = fmt1(b[0]), y = fmt1(b[1]), s = 7, w = 3.6;
  if (Math.abs(dy) >= Math.abs(dx)) {
    var base = dy < 0 ? (b[1] + s) : (b[1] - s);      /* 向上到达则三角底边在下方 */
    return x + "," + y + " " + fmt1(b[0] - w) + "," + fmt1(base) + " " + fmt1(b[0] + w) + "," + fmt1(base);
  }
  var back = dx < 0 ? (b[0] + s) : (b[0] - s);
  return x + "," + y + " " + fmt1(back) + "," + fmt1(b[1] - w) + " " + fmt1(back) + "," + fmt1(b[1] + w);
}

function drawEdges(hotEdges){
  var board = document.getElementById("board");
  var svg = document.getElementById("edges");
  if (!board || !svg) { return; }
  while (svg.firstChild) { svg.removeChild(svg.firstChild); }
  svg.setAttribute("width", board.offsetWidth);
  svg.setAttribute("height", board.offsetHeight);

  var boardRect = board.getBoundingClientRect();
  var rects = {}, eraBox = {};
  for (var e = 0; e < ERAS.length; e++) {
    var sec = board.querySelector('.era[data-era="' + ERAS[e].key + '"]');
    if (sec) { eraBox[ERAS[e].key] = {top: sec.offsetTop, h: sec.offsetHeight}; }
  }
  for (var id in nodeEls) {
    if (nodeEls.hasOwnProperty(id)) { rects[id] = rectIn(nodeEls[id], boardRect); }
  }

  for (var i = 0; i < TECHS.length; i++) {
    var dst = TECHS[i];
    var d = rects[dst.id];
    if (!d) { continue; }
    for (var r = 0; r < dst.roots.length; r++) {
      var src = techById[dst.roots[r]];
      var s = src ? rects[src.id] : null;
      if (!s) { continue; }
      var span = eraIndex[dst.era] - eraIndex[src.era];
      var color = edgeColor(dst);
      var key = src.id + ">" + dst.id;
      var hot = hotEdges && hotEdges[key];

      var path = document.createElementNS(NS, "path");
      var arrow = document.createElementNS(NS, "polygon");
      var dPath;

      /* 路由：一律算成 4 个折点 [起点, 控制点1, 控制点2, 终点]，
         中间两点交给三次贝塞尔当控制点 —— 线条先横铺再垂下，柔和发散。
         同代同行（左右两列）：从源侧缘横连到目标侧缘，控制点落在列间中点。
         其余（同列上下 / 同代跨行 / 跨时代）：从源底部竖连到目标顶部，
         控制点落在两者之间（跨时代时落在两个时代之间的空档里）。 */
      var pts;
      var sameRow = Math.abs(s.cy - d.cy) < Math.max(s.h, d.h) * 0.6;
      if (span <= 0 && sameRow && Math.abs(s.cx - d.cx) >= 2) {
        var toRight = d.cx > s.cx;
        var x1 = toRight ? s.x + s.w : s.x;
        var x2 = toRight ? d.x : d.x + d.w;
        var mx = (x1 + x2) / 2;
        pts = [[x1, s.cy], [mx, s.cy], [mx, d.cy], [x2, d.cy]];
      } else if (span <= 0) {
        var my = (s.y + s.h + d.y) / 2;
        pts = [[s.cx, s.y + s.h], [s.cx, my], [d.cx, my], [d.cx, d.y]];
      } else {
        /* 跨时代：控制点落在「源时代下方那一段空档」的中线上，
           曲线先横铺再垂下，全程只在节点卡片背后穿过。
           长距离（跨多个时代）时控制点仍留在源时代下方，长段因此是贴列间空档的竖走，
           而不是斜扫过中间几个时代 —— 与页面上定版的观感一致。 */
        var box = eraBox[src.era];
        var nextEra = ERAS[eraIndex[src.era] + 1];
        var gapBottom = box ? (box.top + box.h) : (s.y + s.h);
        var gapNextTop = (nextEra && eraBox[nextEra.key]) ? eraBox[nextEra.key].top
                                                          : (gapBottom + 44);
        var channel = gapBottom + Math.max(10, (gapNextTop - gapBottom) / 2);
        pts = [[s.cx, s.y + s.h], [s.cx, channel], [d.cx, channel], [d.cx, d.y]];
      }

      var p0 = pts[0], c1 = pts[1], c2 = pts[2], p3 = pts[3];
      dPath = "M " + fmt1(p0[0]) + " " + fmt1(p0[1]) +
              " C " + fmt1(c1[0]) + " " + fmt1(c1[1]) + " " +
              fmt1(c2[0]) + " " + fmt1(c2[1]) + " " + fmt1(p3[0]) + " " + fmt1(p3[1]);
      arrow.setAttribute("points", arrowPoints(c2, p3));

      path.setAttribute("d", dPath);
      path.setAttribute("stroke", color);
      if (hot) {
        path.setAttribute("stroke-width", "2.2");
        path.setAttribute("opacity", "0.95");
        path.setAttribute("class", "hot");
        arrow.setAttribute("fill", color);
        arrow.setAttribute("opacity", "0.95");
      } else {
        path.setAttribute("stroke-width", span >= 2 ? "1" : "1.3");
        path.setAttribute("opacity", span >= 2 ? "0.22" : "0.42");
        if (span >= 2) { path.setAttribute("stroke-dasharray", "5 5"); }
        arrow.setAttribute("fill", color);
        arrow.setAttribute("opacity", span >= 2 ? "0.3" : "0.5");
      }
      svg.appendChild(path);
      svg.appendChild(arrow);
    }
  }
}

/* ---------- 选中与高亮 ---------- */

function applySelection(id, silent){
  var t = techById[id];
  if (!t) { return; }
  var changed = selectedId !== id;
  selectedId = id;

  var lines = chainInvolved(id);
  /* 直接前置 / 直接后续单独标一层，和「整条脉络」区分开：
     脉络上的节点保持常态，直接相邻的描边加重，其余淡出。 */
  var direct = {};
  for (var r = 0; r < t.roots.length; r++) { direct[t.roots[r]] = true; }
  var kids = childrenOf[id] || [];
  for (var c = 0; c < kids.length; c++) { direct[kids[c]] = true; }

  for (var key in nodeEls) {
    if (!nodeEls.hasOwnProperty(key)) { continue; }
    var el = nodeEls[key];
    el.classList.remove("sel", "dim", "direct");
    if (key === id) { el.classList.add("sel"); }
    else if (direct[key]) { el.classList.add("direct"); }
    else if (lines[key]) { /* 脉络上的节点保持原样 */ }
    else { el.classList.add("dim"); }
  }
  drawEdges(chainEdges(id));

  var up = parentsChain(id).length, down = childrenChain(id).length;
  selName.textContent = t.name;
  selMeta.textContent = eraOf(t.era).zh + " · " + t.year + " · 前置 " + up + " 项 · 后续 " + down + " 项";
  showSelbar();

  if (changed && !silent) { /* 选中不跳转，避免误触进详情 */ }
}

function chainInvolved(id){
  var set = {};
  set[id] = true;
  var u = parentsChain(id), d = childrenChain(id);
  for (var i = 0; i < u.length; i++) { set[u[i]] = true; }
  for (var j = 0; j < d.length; j++) { set[d[j]] = true; }
  return set;
}
/* 两端都在脉络上的连线才点亮 */
function chainEdges(id){
  var set = chainInvolved(id), hot = {};
  for (var i = 0; i < TECHS.length; i++) {
    var t = TECHS[i];
    for (var r = 0; r < t.roots.length; r++) {
      if (set[t.id] && set[t.roots[r]]) { hot[t.roots[r] + ">" + t.id] = true; }
    }
  }
  return hot;
}
function clearSelection(){
  selectedId = null;
  hideSelbar();
  for (var key in nodeEls) {
    if (nodeEls.hasOwnProperty(key)) { nodeEls[key].classList.remove("sel", "dim", "direct"); }
  }
  drawEdges();
}

/* ---------- 搜索 ---------- */

function applyQuery(value, silent){
  query = String(value || "");
  var box = document.getElementById("q");
  if (box && box.value !== query) { box.value = query; }
  var clearBtn = document.getElementById("qClear");
  if (clearBtn) { clearBtn.className = "clear" + (query ? "" : " hide"); }

  var q = query.replace(/^\s+|\s+$/g, "").toLowerCase();
  var hits = 0;
  for (var id in nodeEls) {
    if (!nodeEls.hasOwnProperty(id)) { continue; }
    var el = nodeEls[id];
    el.classList.remove("hit", "dim");
    if (!q) { continue; }
    var hay = (el.getAttribute("data-name") || "").toLowerCase();
    if (hay.indexOf(q) >= 0) { el.classList.add("hit"); hits++; }
    else { el.classList.add("dim"); }
  }
  var board = document.getElementById("board");
  if (board) {
    var secs = board.querySelectorAll(".era");
    for (var i = 0; i < secs.length; i++) {
      var eraHits = secs[i].querySelectorAll(".node.hit").length;
      if (q && !eraHits) { secs[i].classList.add("dim"); } else { secs[i].classList.remove("dim"); }
    }
  }
  if (q && !silent) { showToast(hits ? "匹配 " + hits + " 项" : "没有匹配的条目"); }
}

/* ============================ 图鉴视图 ============================ */

function buildList(){
  subtitleEl.textContent = TECHS.length + " 项 · 按时代分组";
  syncNavH();
  hideSelbar();

  var wrap = document.createElement("div");
  wrap.className = "view list";

  for (var e = 0; e < ERAS.length; e++) {
    var era = ERAS[e];
    var items = eraOrder ? (eraOrder[era.key] || []) : techsOfEra(era.key);

    var sec = document.createElement("section");
    sec.className = "section";
    sec.style.setProperty("--era-accent", era.accent);

    var cover = document.createElement("div");
    cover.className = "cat-cover";
    cover.innerHTML = shotHtml("cover-" + era.key, era.zh + " · 时代封面", "时代封面", "sm", era.icon, era.span);
    sec.appendChild(cover);

    var head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>' + escapeHtml(era.zh) + '</h2><span class="en">' + escapeHtml(era.en) + '</span>' +
                     '<span class="cnt">' + items.length + ' 项</span>';
    sec.appendChild(head);

    var note = document.createElement("div");
    note.className = "cat-note";
    note.textContent = era.span + "　|　" + era.note;
    sec.appendChild(note);

    var grid = document.createElement("div");
    grid.className = "grid";
    for (var i = 0; i < items.length; i++) {
      grid.appendChild(buildCard(items[i], era));
    }
    sec.appendChild(grid);
    wrap.appendChild(sec);
  }

  app.innerHTML = "";
  app.appendChild(wrap);
  bindImgs(wrap);
  window.scrollTo(0, listScrollY);
}

function buildCard(t, era){
  var card = document.createElement("div");
  card.className = "card";
  card.innerHTML =
    shotHtml(t.id, t.name, null, "", era.icon, t.year) +
    '<div class="card-info">' +
      '<div class="card-head"><span class="name">' + escapeHtml(t.name) + '</span>' + ICON_CHEV + '</div>' +
      '<div class="en">' + escapeHtml(t.en) + '</div>' +
      '<div class="desc">' + escapeHtml(t.tag) + '</div>' +
    '</div>';
  card.addEventListener("click", function(){ location.hash = "#/t/" + t.id; });
  return card;
}

/* ============================ 详情 ============================ */

function relChips(ids, emptyText){
  if (!ids.length) { return '<span class="rel none">' + emptyText + '</span>'; }
  var html = "";
  for (var i = 0; i < ids.length; i++) {
    var t = techById[ids[i]];
    if (!t) { continue; }
    var era = eraOf(t.era);
    html += '<button class="rel" data-goto="' + escapeHtml(t.id) + '">' +
              '<span class="dot" style="background:' + era.accent + '"></span>' +
              escapeHtml(t.name) + '<span class="yr">' + escapeHtml(t.year) + '</span>' +
            '</button>';
  }
  return html;
}

function renderDetail(id){
  var t = techById[id];
  if (!t) { location.hash = "#/" + prevView; return; }
  var era = eraOf(t.era);
  /* 第二行那格标当前条目名（不是干巴巴的「详情」）：它在整个详情页里一直吸顶可见，
     滑到简介 / 参数 / 提示词哪一段都还知道自己在看哪一条技术。 */
  subtitleEl.textContent = t.name;
  setAccent(era);
  hideSelbar();
  syncNavH();

  var d = document.createElement("div");
  d.className = "detail";

  var hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = shotHtml(t.id, t.name, null, "lg", era.icon);
  d.appendChild(hero);

  var badgeRow = document.createElement("div");
  badgeRow.className = "badge-row";
  badgeRow.innerHTML = '<span class="cat-badge">' + eraNum(t.era) + ' · ' + escapeHtml(era.zh) + '</span>' +
                       '<span class="era-pill">' + escapeHtml(t.year) + '</span>';
  d.appendChild(badgeRow);

  var h2 = document.createElement("h2");
  h2.textContent = t.name;
  d.appendChild(h2);

  var en = document.createElement("div");
  en.className = "en-name";
  en.textContent = t.en;
  d.appendChild(en);

  var tagline = document.createElement("p");
  tagline.className = "tagline";
  tagline.textContent = t.tag;
  d.appendChild(tagline);

  /* 分享条：只在容器里（拿得到 postNote）才建出来 */
  detailId = id;
  shareBtn = null; shareImg = null;
  if (CAN_SHARE) { d.appendChild(buildShareBar()); }

  var introBlock = document.createElement("div");
  introBlock.className = "block";
  introBlock.innerHTML = '<h3 class="h3-a">介绍</h3><p>' + escapeHtml(t.intro) + '</p>';
  d.appendChild(introBlock);

  var specBlock = document.createElement("div");
  specBlock.className = "block";
  var specHtml = '<h3 class="h3-b">关键参数</h3><div class="specs">';
  for (var i = 0; i < t.specs.length; i++) {
    specHtml += '<div class="spec"><span class="k">' + escapeHtml(t.specs[i][0]) + '</span>' +
                '<span class="v">' + escapeHtml(t.specs[i][1]) + '</span></div>';
  }
  specHtml += '</div>';
  specBlock.innerHTML = specHtml;
  d.appendChild(specBlock);

  var up = t.roots.slice(0);
  var down = childrenOf[t.id] ? childrenOf[t.id].slice(0) : [];
  var relBlock = document.createElement("div");
  relBlock.className = "block";
  relBlock.innerHTML =
    '<h3 class="h3-e">前置科技</h3>' +
    '<p class="hint">先掌握这些，才谈得上出现「' + escapeHtml(t.name) + '」。点按可直接跳转。</p>' +
    '<div class="rel-list" style="margin-top:10px">' + relChips(up, "它是这个时代的起点，没有更早的前置") + '</div>' +
    '<h3 class="h3-d" style="margin-top:16px">后续科技</h3>' +
    '<p class="hint">从它出发，又长出了这些技术。</p>' +
    '<div class="rel-list" style="margin-top:10px">' + relChips(down, "这条分支目前走到这里，后面还空着") + '</div>';
  d.appendChild(relBlock);

  var featBlock = document.createElement("div");
  featBlock.className = "block";
  var featHtml = '<h3 class="h3-c">亮点</h3><ul class="feats">';
  for (var f = 0; f < t.feats.length; f++) { featHtml += '<li>' + escapeHtml(t.feats[f]) + '</li>'; }
  featHtml += '</ul>';
  featBlock.innerHTML = featHtml;
  d.appendChild(featBlock);

  var prompt = IMG_STYLE + " " + t.subject;
  var promptBlock = document.createElement("div");
  promptBlock.className = "block";
  promptBlock.innerHTML =
    '<h3 class="h3-d">AI 配图提示词</h3>' +
    '<p class="hint">点按下方文字可全选，长按即可手动复制，交给图像生成工具即可产出与本册风格一致的配图</p>' +
    '<div class="prompt-box"><pre>' + escapeHtml(prompt) + '</pre></div>' +
    '<button class="copy-btn" id="copyBtn">' + ICON_COPY + '复制提示词</button>';
  d.appendChild(promptBlock);

  app.innerHTML = "";
  app.appendChild(d);
  bindImgs(d);
  if (CAN_SHARE) { wireShare(d); }      /* 原图到货后才允许分享 */

  var chips = d.querySelectorAll(".rel[data-goto]");
  for (var c = 0; c < chips.length; c++) {
    (function(btn){
      btn.addEventListener("click", function(){ location.hash = "#/t/" + btn.getAttribute("data-goto"); });
    })(chips[c]);
  }
  document.getElementById("copyBtn").addEventListener("click", function(){ copyPrompt(this); });
  window.scrollTo(0, 0);
}

/* 容器已禁用剪贴板类 API，改为选中提示词文本，引导用户长按手动复制。 */
function copyPrompt(btn){
  var box = btn && btn.closest ? btn.closest(".block") : null;
  var pre = box ? box.querySelector(".prompt-box pre") : null;
  if (pre) {
    try {
      var range = document.createRange();
      range.selectNodeContents(pre);
      var sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    } catch(err){ /* 选中失败不影响后续提示 */ }
  }
  btn.classList.add("done");
  var self = btn;
  setTimeout(function(){ self.classList.remove("done"); }, 1600);
  showToast("已选中提示词，请长按文字手动复制");
}

/* ============================ 背景音乐 ============================
 * 音频以 base64 字符串藏在 assets/audio/bgm.js（window.TT_BGM）里，由
 * _dev/audio/make-bgm.mjs 生成 —— 容器上传白名单不收任何音频扩展名，且 CSP 明确
 * 禁 data:/blob: 媒体源，所以「包内音频文件 + <audio src>」这条路在容器里不存在。
 * 运行路径：atob → ArrayBuffer → AudioContext.decodeAudioData() → Web Audio 播放，
 * 全程不产生任何 URL，因此不触碰 CSP 的资源加载规则。换曲目见 docs/背景音乐需求.md。
 *
 * 播放策略（与 vibeknow/jurassic-park-3d 同一套）：
 *   ① 首次用户手势之后才出声（容器 autoplay 策略），之后循环；
 *   ② 循环靠「上一遍的尾巴与下一遍的开头交叠淡化」（bgmLoopTick），接缝落在乐句首尾；
 *   ③ 音量走 GainNode 包络，不用 setInterval 去调 volume；
 *   ④ 偏好存 localStorage（键 tt.bgm），读写失败静默降级；没存过＝偏好开启，
 *      但按钮显示的是「此刻有没有在响」，与偏好分开；
 *   ⑤ 切后台（visibilitychange）停声并挂起音频上下文，回前台续上；
 *   ⑥ 解码成功才给 <html> 挂 has-bgm 把开关显出来；没有数据 / 解码失败＝开关隐藏、其余照常。
 */
var BGM_KEY = "tt.bgm", BGM_VOL = 0.34, BGM_XFADE = 4, BGM_TICK_MS = 500;
var AC = window.AudioContext || window.webkitAudioContext;
var bgmBtn = document.getElementById("bgmBtn");
var bgmCtx = null, bgmBuf = null, bgmMaster = null;
var bgmPasses = [], bgmNextAt = 0, bgmLoopT = null, bgmStopT = null, bgmFirstPass = true;
var bgmReady = false, bgmWant = true, bgmUnlocked = false, bgmPlaying = false, bgmHidePaused = false;
try { if (window.localStorage.getItem(BGM_KEY) === "0") { bgmWant = false; } } catch(err){ /* 存不了就按默认开启 */ }

/* 按钮画的是「此刻有没有在出声」，不是「用户想不想听」：autoplay 策略决定首屏必然还没声音，
   这时若显示成已开启就是在骗人。bgmWant 只负责记住偏好、并决定首次手势后要不要起播。 */
function bgmPaint(){
  if (!bgmBtn) { return; }
  bgmBtn.className = "bgm" + (bgmPlaying ? " on" : "");
  bgmBtn.setAttribute("aria-pressed", bgmPlaying ? "true" : "false");
}
/* 一遍接一遍地排「带交叠的循环」：每遍长 D 秒，上一遍在最后 X 秒线性淡出，
   同时下一遍从 0 秒线性淡入 —— 两者在 [D-X, D] 完全重叠、增益和恒为 1，接缝听不出来。
   于是每遍推进步长 L = D - X，下一遍晚 L 秒开始。第一遍不走这条淡入（那是给接缝用的），
   改成 1.2s 起势，免得刚点开音乐要等 4 秒才到正常音量。 */
function bgmLoopTick(){
  if (!bgmPlaying || !bgmCtx || !bgmBuf || !bgmMaster) { return; }
  var D = bgmBuf.duration;
  var X = Math.min(BGM_XFADE, D * 0.15);
  var L = D - X;
  var now = bgmCtx.currentTime;
  if (bgmNextAt < now + 0.05) { bgmNextAt = now + 0.08; }
  while (bgmNextAt < now + 1.2) {
    var at = bgmNextAt;
    var src = bgmCtx.createBufferSource();
    var g = bgmCtx.createGain();
    src.buffer = bgmBuf;
    src.connect(g); g.connect(bgmMaster);
    var fin = bgmFirstPass ? Math.min(X, 1.2) : X;
    bgmFirstPass = false;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, at + fin);
    g.gain.setValueAtTime(1, at + L);
    g.gain.linearRampToValueAtTime(0, at + D);
    src.start(at);
    src.stop(at + D + 0.05);
    bgmPasses.push({src: src, endsAt: at + D});
    bgmNextAt = at + L;
  }
  for (var i = bgmPasses.length - 1; i >= 0; i--) {
    if (bgmPasses[i].endsAt < now - 0.5) {
      try { bgmPasses[i].src.disconnect(); } catch(err){ /* 已断开 */ }
      bgmPasses.splice(i, 1);
    }
  }
}
function bgmStopPasses(){
  if (bgmStopT) { clearTimeout(bgmStopT); bgmStopT = null; }
  if (bgmLoopT) { clearInterval(bgmLoopT); bgmLoopT = null; }
  for (var i = 0; i < bgmPasses.length; i++) {
    try { bgmPasses[i].src.stop(); } catch(err){ /* 未启动/已停止 */ }
    try { bgmPasses[i].src.disconnect(); } catch(err){ /* 已断开 */ }
  }
  bgmPasses = [];
}
function bgmPlay(){
  if (!bgmReady || !bgmCtx || !bgmMaster) { return; }
  bgmPlaying = true;
  bgmFirstPass = true;
  if (bgmStopT) { clearTimeout(bgmStopT); bgmStopT = null; }
  try { if (bgmCtx.state === "suspended" && bgmCtx.resume) { bgmCtx.resume(); } } catch(err){ /* 忽略 */ }
  var t = bgmCtx.currentTime;
  try {
    bgmMaster.gain.cancelScheduledValues(t);
    bgmMaster.gain.setValueAtTime(0, t);
    bgmMaster.gain.linearRampToValueAtTime(BGM_VOL, t + 0.9);
  } catch(err){ bgmMaster.gain.value = BGM_VOL; }
  bgmNextAt = t + 0.08;
  bgmLoopTick();
  if (bgmLoopT) { clearInterval(bgmLoopT); }
  bgmLoopT = setInterval(bgmLoopTick, BGM_TICK_MS);
  bgmPaint();
}
function bgmPause(ms){
  if (!bgmPlaying || !bgmCtx || !bgmMaster) { return; }
  bgmPlaying = false;
  var t = bgmCtx.currentTime, to = (ms == null ? 600 : ms) / 1000;
  try {
    bgmMaster.gain.cancelScheduledValues(t);
    bgmMaster.gain.setValueAtTime(bgmMaster.gain.value, t);
    bgmMaster.gain.linearRampToValueAtTime(0, t + to);
  } catch(err){ /* 忽略 */ }
  if (bgmLoopT) { clearInterval(bgmLoopT); bgmLoopT = null; }
  if (bgmStopT) { clearTimeout(bgmStopT); }
  bgmStopT = setTimeout(bgmStopPasses, to * 1000 + 80);
  bgmPaint();
}
/* 记的是「用户想不想要」，不只是「此刻响不响」：关掉＝写进存档，下次进来仍是静音 */
function bgmSet(want){
  bgmWant = !!want;
  try { window.localStorage.setItem(BGM_KEY, bgmWant ? "1" : "0"); } catch(err){ /* 存不了就只活在本次会话 */ }
  if (bgmWant && bgmUnlocked) { bgmPlay(); } else { bgmPause(); }
  bgmPaint();
}
/* 首次用户手势之前不许出声：听最外层捕获阶段的 pointerdown / click / keydown。
   开关自己那一下不算解锁手势 —— 统一交给开关的 handler 处理，否则捕获阶段先把音乐
   打开、紧接着开关又按「正在响」把它关掉，自相矛盾。 */
function bgmUnlock(e){
  if (bgmBtn && e && e.target && (e.target === bgmBtn || bgmBtn.contains(e.target))) { return; }
  bgmUnlocked = true;
  if (bgmWant) { bgmPlay(); }
  document.removeEventListener("pointerdown", bgmUnlock, true);
  document.removeEventListener("click", bgmUnlock, true);
  document.removeEventListener("keydown", bgmUnlock, true);
}
/* base64 → ArrayBuffer（1MB 量级，安排在首屏之后做，不挤首屏） */
function bgmBytes(){
  var s = window.TT_BGM || "";
  if (!s) { return null; }
  try {
    var bin = window.atob(s), n = bin.length, ab = new ArrayBuffer(n), u = new Uint8Array(ab);
    for (var i = 0; i < n; i++) { u[i] = bin.charCodeAt(i); }
    return ab;
  } catch(err){ return null; }
}
function bgmDecode(){
  if (bgmReady || !AC) { return; }
  var ab = bgmBytes();
  if (!ab) { return; }
  if (!bgmCtx) { try { bgmCtx = new AC(); } catch(err){ bgmCtx = null; } }
  if (!bgmCtx) { return; }
  var settled = false;
  function ok(buf){
    if (settled) { return; }
    settled = true;
    bgmBuf = buf;
    bgmMaster = bgmCtx.createGain();
    bgmMaster.gain.value = 0;
    bgmMaster.connect(bgmCtx.destination);
    bgmReady = true;
    document.documentElement.classList.add("has-bgm");
    if (bgmUnlocked && bgmWant) { bgmPlay(); }
  }
  function bad(){ if (settled) { return; } settled = true; bgmBuf = null; }
  try {
    var pr = bgmCtx.decodeAudioData(ab, ok, bad);   /* 回调与 Promise 两套都兜，settled 防重复 */
    if (pr && pr.then) { pr.then(ok, bad); }
  } catch(err){ bad(); }
}
if (bgmBtn) {
  bgmBtn.addEventListener("click", function(){
    bgmUnlocked = true;              /* 点开关本身就是用户手势，必定算解锁 */
    bgmSet(!bgmPlaying);             /* 没在响 → 开；正在响 → 关（与按钮显示的状态一致） */
  });
}
document.addEventListener("pointerdown", bgmUnlock, true);
document.addEventListener("click", bgmUnlock, true);
document.addEventListener("keydown", bgmUnlock, true);
document.addEventListener("visibilitychange", function(){
  if (document.hidden) {
    if (bgmPlaying) {
      bgmHidePaused = true;
      bgmPause(0);
      if (bgmCtx && bgmCtx.suspend) {
        setTimeout(function(){ try { bgmCtx.suspend(); } catch(err){ /* 忽略 */ } }, 150);
      }
    }
  } else if (bgmHidePaused) {
    bgmHidePaused = false;
    if (bgmWant && bgmUnlocked) { bgmPlay(); }
  }
});
bgmPaint();
setTimeout(bgmDecode, 900);          /* 首屏之后才解码；解出来才把开关显出来 */

/* ============================ 分享到小红书 ============================
 * 容器里网页不能直接发笔记，只能**唤起 App 的笔记发布页**并带上内容与媒体：
 *   window.xhs.miniTool.postNote({ title, content, pageType, mediaInfo })
 * 其中 mediaInfo 必填、且图片 / 视频 / 实况至少传一种（见 .skill/minitool-zip-builder/
 * references/jsbridge-api.md）；本页只发图文。
 *
 * 与 jurassic-park-3d 的一处**故意不同**：那边用 XHR 取原图字节再走 FileReader，
 * 而本仓 skill 的 device-capabilities.md §4/§7 把 XHR 这类网络请求 API 列为不可用行为、
 * 进了扫描清单（连标识符都不许出现在源码里，打包守卫会 grep），所以这里改走 Canvas：从页面上已经加载好的
 * 那张原图画一次拿 data:uri（容器里页面与图同源，画布不会被污染；桌面 file:// 下会被
 * 污染而抛错，此时按失败提示，不硬撑）。代价是重编码一次，换来的是一行被禁 API 都不用。
 *
 * 交付约定：
 *   ① 图文就是原图（不合成卡片）；
 *   ② 正文就是该条科技的介绍 + 时代 / 年份 + 前置与后续；
 *   ③ 能力检测而非 UA 判断：拿不到 postNote 就整块隐藏（桌面直接开 index.html 不出现）；
 *   ④ 标题 ≤ 20、正文 ≤ 1000（API 文档给出的上限，这里主动裁剪）；
 *   ⑤ postNote 成功只代表发布页被唤起、用户点了发布，**不代表过审** —— 所以只当
 *      「已唤起」提示，不据此做任何强一致的状态变更。
 */
var XHS = (window.xhs && window.xhs.miniTool) || null;
var CAN_SHARE = !!(XHS && typeof XHS.postNote === "function");
if (CAN_SHARE) { document.documentElement.classList.add("has-share"); }

var detailId = null, shareBtn = null, shareImg = null, shareBusy = false;

/* 正文：介绍 + 时代 · 年份 + 前置 / 后续溯源 */
function shareNote(t){
  var era = eraOf(t.era), ups = [], downs = [], i;
  for (i = 0; i < t.roots.length; i++) {
    if (techById[t.roots[i]]) { ups.push(techById[t.roots[i]].name); }
  }
  for (i = 0; i < childrenOf[t.id].length; i++) {
    downs.push(techById[childrenOf[t.id][i]].name);
  }
  return t.intro + "\n\n" +
    eraNum(t.era) + " · " + era.zh + " · " + t.year +
    "\n前置：" + (ups.length ? ups.join("、") : "无（这个时代的起点）") +
    "\n后续：" + (downs.length ? downs.join("、") : "暂无（这条分支目前走到这里）") +
    "\n\n—— 人类科技树（小红书小工具）";
}
function sharePaint(ok){
  if (!shareBtn) { return; }
  shareBtn.className = "share" + (ok ? "" : " off");
  shareBtn.disabled = !ok;
}
/* 原图 → data:uri：从页面上已加载的那张原图经 Canvas 取，不经过网络
   （XHR / fetch 都在禁用清单里）。先试 WebP，编码不被支持再退 JPEG。 */
function imgDataURI(img){
  return new Promise(function(resolve, reject){
    try {
      var cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      cv.getContext("2d").drawImage(img, 0, 0);
      var url = cv.toDataURL("image/webp", 0.92);
      if (url.indexOf("data:image/webp") !== 0) { url = cv.toDataURL("image/jpeg", 0.92); }
      resolve(url);
    } catch(err){ reject({stage: "img"}); }
  });
}
function shareTech(){
  if (!CAN_SHARE || shareBusy) { return; }
  var t = techById[detailId];
  if (!t) { return; }
  if (!shareImg || !shareImg.naturalWidth) { showToast("配图还没出，稍后再试"); return; }
  shareBusy = true;
  if (shareBtn) { shareBtn.disabled = true; }
  imgDataURI(shareImg).then(function(dataURL){
    var payload = {
      title: ("人类科技树 · " + t.name).slice(0, 20),      /* API 上限 20 */
      content: shareNote(t).slice(0, 1000),                /* API 上限 1000 */
      pageType: "photo_publish"
    };
    var step = (XHS.writeTempFile && typeof XHS.writeTempFile === "function")
      ? XHS.writeTempFile({data: dataURL})                 /* data 必须是完整 data:uri */
      : null;
    return Promise.resolve(step).then(function(res){
      payload.mediaInfo = {image_resources: [{url: (res && res.filePath) || dataURL}]};
      return XHS.postNote(payload);
    });
  }).then(function(){
    showToast("已唤起发布页 · 在那边补完正文就能发");
  }).catch(function(err){
    showToast(err && err.stage === "img"
      ? "读取配图失败，稍后再试"
      : "唤起发布页失败：" + ((err && err.errMsg) || "未知原因"));
  }).then(function(){
    shareBusy = false;
    if (shareBtn) { shareBtn.disabled = false; sharePaint(shareImg && shareImg.naturalWidth > 0); }
  });
}
/* 详情页顶部的分享条：只在拿得到 postNote 时建出来 */
function buildShareBar(){
  var bar = document.createElement("div");
  bar.className = "actions";
  var btn = document.createElement("button");
  btn.className = "share off";
  btn.id = "shareBtn";
  btn.type = "button";
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3.6v10.8"/><path d="M8.1 7.5 12 3.6l3.9 3.9"/>' +
    '<path d="M5.6 12.4v6.4a1.6 1.6 0 0 0 1.6 1.6h9.6a1.6 1.6 0 0 0 1.6-1.6v-6.4"/></svg>' +
    '<span>分享到小红书</span>';
  btn.addEventListener("click", shareTech);
  bar.appendChild(btn);
  shareBtn = btn;
  return bar;
}
/* 原图到货 / 失败都要刷新分享按钮的可用态（lazy 加载，可能晚于渲染） */
function wireShare(scope){
  shareImg = scope.querySelector(".hero .shot-img");
  if (!shareImg) { sharePaint(false); return; }
  if (shareImg.complete && shareImg.naturalWidth > 0) { sharePaint(true); return; }
  sharePaint(false);
  shareImg.addEventListener("load", function(){ sharePaint(shareImg.naturalWidth > 0); });
  shareImg.addEventListener("error", function(){
    /* 后缀回退链还在试下一个后缀，晚一点再判，免得误判成失败 */
    setTimeout(function(){ sharePaint(!!(shareImg && shareImg.naturalWidth > 0)); }, 400);
  });
}

/* ============================ 路由 ============================ */

function route(){
  var h = location.hash || "#/tree";
  var m = h.match(/^#\/t\/([a-z0-9-]+)$/i);
  hideSelbar();

  if (m) {
    cancelRerender();
    if (viewMode === "tree") { treeScrollY = window.pageYOffset || document.documentElement.scrollTop || 0; }
    if (viewMode === "list") { listScrollY = window.pageYOffset || document.documentElement.scrollTop || 0; }
    viewMode = "detail";
    fabBack.classList.add("show");
    renderSeg();
    renderDetail(m[1]);
    return;
  }

  clearAccent();
  fabBack.classList.remove("show");
  nodeEls = {};
  var wantList = (h === "#/list");
  viewMode = wantList ? "list" : "tree";
  prevView = viewMode;
  renderSeg();

  try { eraOrder = computeEraOrder(app.clientWidth || 360); }
  catch(err){
    eraOrder = {};
    for (var e = 0; e < ERAS.length; e++) { eraOrder[ERAS[e].key] = techsOfEra(ERAS[e].key); }
  }

  if (wantList) { buildList(); }
  else { buildTree(); }
}

/* ============================ 交互 ============================ */

/* ---------- 宿主 in-app 检测 ----------
   容器内嵌时把顶部预留带从 50px 加到 70px（宿主那行「返回 / 分享 / 更多」按钮
   整条压在带子里，50px 几乎被占满）。
   判定依据只认容器注入的桥对象与显式 query，**不做 UA / 机型判断**。 */
function detectInApp(){
  var inApp = false;
  try {
    if (window.xhs && window.xhs.miniTool) { inApp = true; }
    if (location.search.indexOf("inapp=1") >= 0) { inApp = true; }
  } catch(err){ /* 取不到就按纯浏览器处理 */ }
  if (inApp) { document.body.classList.add("in-app"); }
}
fabBack.addEventListener("click", function(){ location.hash = "#/" + prevView; });

fabTop.addEventListener("click", function(){
  try { window.scrollTo({top: 0, behavior: "smooth"}); }
  catch(e){ window.scrollTo(0, 0); }
});

selGo.addEventListener("click", function(){
  if (selectedId) { location.hash = "#/t/" + selectedId; }
});
/* 点空白处取消选中 */
app.addEventListener("click", function(ev){
  var el = ev.target;
  while (el && el !== app) {
    if (el.className && String(el.className).indexOf("node") >= 0) { return; }
    el = el.parentNode;
  }
  if (selectedId) { clearSelection(); }
});

var ticking = false;
window.addEventListener("scroll", function(){
  if (ticking) { return; }
  ticking = true;
  window.requestAnimationFrame(function(){
    ticking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (y > 400) { fabTop.classList.add("show"); } else { fabTop.classList.remove("show"); }
  });
}, {passive: true});

/* 视口变化要重算网格列数与连线，但必须防抖 —— 而且回调里要再确认一次
   仍然停在科技树视图：否则「视口变了 -> 220ms 后重画」这段时间里用户点进了详情页，
   重画就会把详情页内容覆盖成科技树（路由 hash 却还停在详情上）。 */
var resizeTimer = null;
function cancelRerender(){
  if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
}
window.addEventListener("resize", function(){
  if (viewMode !== "tree") { syncNavH(); return; }
  cancelRerender();
  resizeTimer = setTimeout(function(){
    resizeTimer = null;
    if (viewMode !== "tree" || !document.getElementById("board")) { return; }
    treeScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var keep = selectedId;
    nodeEls = {};
    eraOrder = computeEraOrder(app.clientWidth || 360);
    buildTree();
    if (keep) { applySelection(keep, true); }
  }, 220);
});

detectInApp();      /* 先定下顶部预留带（无宿主 50px / 容器内 70px），再量 --nav-h */
window.addEventListener("hashchange", route);
route();

})();
