/* ═══════════════════════════════════════════════════════════════════════
 * ui-contract.js —— UI ↔ HTML/CSS 契约校验（纯静态，不开浏览器）
 *
 * 这个脚本回答的问题是：**「ui.js 要的东西，index.html 都给全了吗？」**
 *
 * 为什么需要它：
 *   ui.js 用 getElementById 取 29 个节点、用 innerHTML 拼 60+ 个 CSS 类名。
 *   任何一处名字打错，症状都不是报错，而是**静默失效**——
 *   面板永远打不开、按钮点了没反应、卡片样式丢光。
 *   这类问题在浏览器里要逐个人肉试按钮才能发现，而在这里 1 秒就能查完。
 *
 * 检查四件事：
 *   ① ui.js 里 cacheEls 名单中的每个 id，index.html 必须有对应节点
 *     （允许 ALIAS 别名映射，如 uStage→stage）
 *   ② ui.js 里出现的每个 class="xxx" 字面量，index.html 的 <style> 里
 *      必须有 .xxx 规则；只出现在 HTML 结构里的类名同样要查
 *   ③ index.html 里 ui.js 会去绑事件的节点（bindEvents 用到的），必须存在
 *   ④ 禁用语法体检：ui.js 里不得再出现未声明的裸赋值（用 'use strict'
 *      下模拟执行来抓 —— 这里退化为对已知历史 bug 的模式扫描）
 *
 * 用法：node tests/ui-contract.js
 * 退出码非 0 表示契约破裂，可直接接进 CI。
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var uiSrcRaw = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');
var htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ⚠ 注释剥离：ui.js 的注释里大量出现 `$('xxx')`、`class="..."`、`S.xxx` 等
 *   示例写法（本意是给读者看的），若不去掉，校验器会把它们当成真实代码，
 *   于是报出「HTML 缺 #event」「AT 缺 render」这类**纯噪声**失败项。
 *   故：所有静态扫描一律跑在 stripComments() 之后的源码上。
 *   只处理 /* *\/ 与 // —— 本项目不用模板字符串，正则字面量里也没有 `//`，
 *   所以这个朴素剥离是安全的（不用写完整的 JS 词法分析）。 */
function stripComments(src) {
  var out = '', i = 0, n = src.length;
  var inStr = null;
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += (d || ''); i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '"' || c === "'") { inStr = c; out += c; i++; continue; }
    if (c === '/' && d === '*') {
      var end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      out += ' ';
      continue;
    }
    if (c === '/' && d === '/') {
      var nl = src.indexOf('\n', i);
      i = nl < 0 ? n : nl;
      continue;
    }
    out += c; i++;
  }
  return out;
}
var uiSrc = stripComments(uiSrcRaw);

var pass = 0, fail = 0;
var failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); }
}
function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 64 - t.length))); }

/* ── 1. 抽取 ui.js 的 cacheEls 名单 + ALIAS 别名表 ── */
section('① DOM 节点契约');

var aliasBlock = uiSrc.match(/var ALIAS\s*=\s*\{([\s\S]*?)\};/);
var ALIAS = {};
if (aliasBlock) {
  aliasBlock[1].replace(/(\w+)\s*:\s*'([^']+)'/g, function (_, k, v) { ALIAS[k] = v; return _; });
} else {
  // 兼容旧写法：k === 'uStage' ? 'stage' : k
  var oldMap = uiSrc.match(/k === '(\w+)' \? '(\w+)' : k/);
  if (oldMap) ALIAS[oldMap[1]] = oldMap[2];
}

/* ⚠ 抽取起点很关键：文件里更早的位置还有别的数组字面量
 *   （如 ui 对象的 `modal: 'event' | 'report' | null` 备注写法），
 *   若从第一个 `[` 开始懒惰匹配，会把它们一起抓进来（实测多出 9 个假 id，
 *   其中 `'-'` 会导致「HTML 缺 #-」这种荒谬失败）。
 *   故锚定在 cacheEls 函数体内的数组 —— 它一定紧跟在 ALIAS 定义之后。 */
var cacheBlock = uiSrc.match(/\n\s*var ALIAS[\s\S]*?\}\s*;\s*\[([\s\S]*?)\]\.forEach\(function \(k\) \{ el\[k\]/);
if (!cacheBlock) {
  // 兼容无 ALIAS 的旧写法：取最后一个「元素全是 'uXxx' 形态」的数组
  var all = uiSrc.match(/\[([\s\S]*?)\]\.forEach\(function \(k\) \{ el\[k\]/);
  if (all && /'u[A-Z]/.test(all[1])) cacheBlock = all;
}
ok(!!cacheBlock, 'cacheEls 的 id 名单可被解析');
var ids = [];
if (cacheBlock) {
  cacheBlock[1].replace(/'([\w-]+)'/g, function (_, k) { ids.push(k); return _; });
}
ok(ids.length >= 25, 'cacheEls 解析出 ≥25 个 id', '实际 ' + ids.length);
ok(ids.every(function (i) { return /^u[A-Z]/.test(i); }),
   '名单元素全部是 uXxx 形态（防止抓进无关数组）',
   '异常项：' + ids.filter(function (i) { return !/^u[A-Z]/.test(i); }).join(', '));

/* 检查每个 id（经别名转换后）都存在于 index.html */
ids.forEach(function (k) {
  var real = ALIAS[k] || k;
  var re = new RegExp('id="' + real + '"');
  ok(re.test(htmlSrc), 'HTML 提供 #' + real + (real !== k ? '（' + k + ' 别名）' : ''));
});

/* ── 2. bindEvents 里用到的节点（有些不经 cacheEls，是直接 $('xxx')）──
 * ⚠ 只认 `$('...')` 且实参是**单个字符串字面量**的调用。
 *   形如 $('stage') 这类可由别名表覆盖的，也一并纳入（重复检查无害）。 */
section('② 事件绑定节点');

var directIds = [];
uiSrc.replace(/\$\(\s*'([\w-]+)'\s*\)/g, function (_, id) { if (directIds.indexOf(id) < 0) directIds.push(id); return _; });
ok(directIds.length > 0, '解析出直接查询的 id', directIds.join(', '));
directIds.forEach(function (id) {
  ok(new RegExp('id="' + id + '"').test(htmlSrc), 'HTML 提供直接查询的 #' + id);
});

/* ── 3. CSS 类名契约 ──
 * 抽类名的唯一可靠来源是**完整字面量**：ui.js 里所有 class 都是
 *   'class="a b c"' 或 'class="a' + (cond ? ' b' : '') + '"'
 * 两种形态。故只接受「引号内、由空格分隔、每个片段都是合法类名」的整串，
 * 并额外把条件三元里的 ' b' 片段也算上（它们本身就是合法类名）。
 * 任何含变量拼接的串一律跳过 —— 那是运行期才知道的内容，静态查不出来，
 * 强行查只会把 `cls`/`fromId` 这种变量名误报成类名。 */
section('③ CSS 类名契约');

var styleBlock = htmlSrc.match(/<style>([\s\S]*?)<\/style>/);
ok(!!styleBlock, 'index.html 含 <style> 块');
var css = styleBlock ? styleBlock[1] : '';

var classes = {};
var FILLER = { on: 1, over: 1, show: 1, sel: 1, loss: 1, hide: 1, no: 1, dis: 1, warn: 1,
  ok: 1, bad: 1, pri: 1, sm: 1, danger: 1, wide: 1, total: 1, note: 1, sec: 1,
  'rec-tag': 1, 'c-good': 1, 'c-bad': 1, 'c-warn': 1 };
function addClasses(s, strict) {
  if (s.indexOf('+') >= 0) return;                 // 含拼接 → 不是静态类名串
  var parts = s.split(/\s+/).filter(Boolean);
  if (!parts.length) return;
  var allLegal = parts.every(function (c) { return /^[a-zA-Z][\w-]*$/.test(c); });
  if (!allLegal) return;
  parts.forEach(function (c) { classes[c] = (classes[c] || 0) + 1; });
}

/* 完整字面量：'class="a b c"' */
uiSrc.replace(/class="([^"+]*?)"/g, function (_, v) { addClasses(v, true); return _; });
/* 条件片段：' b' / ' c-good' 这类出现在三元与追加里的短串，
 * 只接受 FILLER 白名单（既覆盖状态类，又不会把正文误当类名） */
uiSrc.replace(/([?:]|\+)\s*'\s+([\w-]+)\s*'/g, function (_, _pre, c) {
  if (FILLER[c]) classes[c] = (classes[c] || 0) + 1;
  return _;
});
uiSrc.replace(/\+\s*'([\w-]+)'\s*(?=[+,]|\s*\+)/g, function (_, c) {
  if (FILLER[c]) classes[c] = (classes[c] || 0) + 1;
  return _;
});

var classList = Object.keys(classes).sort();
console.log('  ui.js 里出现的类名 ' + classList.length + ' 个：' + classList.join(' '));

var missingCss = [];
classList.forEach(function (c) {
  var re = new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])');
  if (!re.test(css)) missingCss.push(c);
});
ok(missingCss.length === 0, '所有类名都有对应 CSS 规则',
   missingCss.length ? '缺样式：' + missingCss.join(', ') : '');

/* 反向：HTML 结构里写死的 class（如 hud/panel）也应在 CSS 里有规则 */
section('④ HTML 结构类名');

var htmlClasses = {};
var bodyOnly = htmlSrc.replace(/<style>[\s\S]*?<\/style>/, '');
bodyOnly.replace(/class="([^"]*)"/g, function (_, v) {
  v.split(/\s+/).forEach(function (c) { if (c.trim()) htmlClasses[c.trim()] = 1; });
  return _;
});
var htmlMissing = Object.keys(htmlClasses).filter(function (c) {
  return !new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '(?![\\w-])').test(css);
});
ok(htmlMissing.length === 0, 'HTML 里的类名都有对应 CSS 规则',
   htmlMissing.length ? '缺样式：' + htmlMissing.join(', ') : '');

/* ── 5. 历史 bug 回归：未声明裸赋值 ──
 * ui.js 曾在 pointerup 里写 `visible = c.id;`（未声明），严格模式下抛错。
 *
 * ⚠ 朴素正则扫描在「源码里塞满 HTML 字符串」的文件上噪声极大：
 *   `'class="' + cls + '"'` 会被读成 `cls = `、`title = `……
 *   故这里改为**只在语句边界处**找裸赋值：
 *     行首（可含缩进）后紧跟 `ident =`，且该行不以 var/let/const/return 开头，
 *     且 `=` 右侧不是字符串拼接的一部分（即 `=` 后面不是 `'`）。
 *   这能精确命中 `visible = c.id;` 这类真实 bug，同时放过一切 HTML 拼接。
 */
section('⑤ 未声明变量扫描（回归）');

var DECLARED = {};
/* ⚠ 必须支持一条语句里声明多个名字，且**每个名字都可能带初始化式**：
 *   `var lastDevSum = 0, lastCash = null;`
 *   旧写法 `([^;=\n]+)` 把 `=` 也排除在捕获之外，于是只拿到 `lastDevSum `，
 *   后面的 `lastCash` 从未被登记 —— 一旦别处出现裸赋值 `lastCash = x`，
 *   就会误报（实测踩到）。正确做法是先取整条声明语句（到 `;` 或换行），
 *   再按逗号切分、逐个取等号左侧的名字。 */
uiSrc.replace(/\b(?:var|let|const)\s+([^;\n]+)/g, function (_, decls) {
  /* ⚠ 不能直接按逗号切：初始化式里可能有逗号（`var a = fn(1, 2), b = 3`）。
   *   本项目的声明式都简单，但为了不埋雷，这里按**括号深度**切分。 */
  var parts = [], buf = '', depth = 0;
  for (var i = 0; i < decls.length; i++) {
    var ch = decls[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; }
    else buf += ch;
  }
  parts.push(buf);
  parts.forEach(function (piece) {
    var nm = piece.split('=')[0].trim();
    if (/^[\w$]+$/.test(nm)) DECLARED[nm] = 1;
  });
  return _;
});
uiSrc.replace(/function\s+([\w$]+)/g, function (_, v) { DECLARED[v] = 1; return _; });
uiSrc.replace(/function\s*[\w$]*\s*\(([^)]*)\)/g, function (_, params) {
  params.split(',').forEach(function (p) {
    p = p.trim();
    if (/^[\w$]+$/.test(p)) DECLARED[p] = 1;
  });
  return _;
});
uiSrc.replace(/catch\s*\(\s*([\w$]+)/g, function (_, v) { DECLARED[v] = 1; return _; });
/* for (var i = 0 ...) 已在 var 收集里；for (i = 0 ...) 这种无 var 的也要认，
 * 否则会被误判。故扫一遍 for 头部。 */
uiSrc.replace(/for\s*\(\s*([\w$]+)\s*=/g, function (_, v) { DECLARED[v] = 1; return _; });

var undeclared = {};
uiSrc.split('\n').forEach(function (line) {
  // 行首可含缩进，紧跟 ident =，后续不是 =（排除 ==）
  var m = line.match(/^\s*([a-zA-Z_$][\w$]*)\s*=(?!=)/);
  if (!m) return;
  var name = m[1];
  var rest = line.slice(line.indexOf('=', m.index)).replace(/^\s*=\s*/, '');
  // 右侧以引号开头 → 是字符串拼接（`xxx = '...' + ...`）？不对，
  // 那种情况 ident 本身就是合法变量名，右侧是字符串——真正的差别在于
  // 该行是否处于字符串字面量内部。前一步 stripComments 没处理字符串内部，
  // 所以这里加一道保险：若行首 ident 之后紧跟的等号右侧是引号或标识符拼接，
  // 且该 ident 出现在一个 HTML 字符串行里（含 <> 或 </），跳过。
  if (/[<>]|<\/|\/>/.test(line)) return;
  if (DECLARED[name]) return;
  if (/^(?:ui|el|dirty|state|st|game|S|R|C|AT|global|window|document)\s*=/.test(line)) return;
  undeclared[name] = (undeclared[name] || 0) + 1;
});
var undNames = Object.keys(undeclared);
ok(undNames.length === 0, '无未声明变量的裸赋值',
   undNames.length ? '可疑：' + undNames.map(function (n) { return n + ' ×' + undeclared[n]; }).join(', ') : '');

/* ── 6. sim 导出契约：ui.js 调用的每个 S.xxx 必须存在 ── */
section('⑥ sim 导出契约');

global.window = global;
['data', 'geo', 'landmask', 'sim'].forEach(function (f) {
  require(path.join(ROOT, 'src', f + '.js'));
});
var S = global.AT.sim;

var called = {};
uiSrc.replace(/\bS\.([\w$]+)/g, function (_, v) { called[v] = 1; return _; });
var calledList = Object.keys(called).sort();
console.log('  ui.js 调用 sim 接口 ' + calledList.length + ' 个');
var missingApi = calledList.filter(function (k) { return typeof S[k] !== 'function' && typeof S[k] === 'undefined'; });
ok(missingApi.length === 0, 'sim 提供 ui.js 调用的全部接口',
   missingApi.length ? '缺失：' + missingApi.join(', ') : '');

/* ui.js 用到的 AT.* 顶层成员。
 * ⚠ 只加载到 sim 层，所以 audio / render / ui / game 这几个「后续脚本挂上去的」
 *   命名空间一定不存在 —— 它们不是契约问题（ui.js 顶部就写明了依赖顺序），
 *   故列入豁免。真正要查的是数据层的 CITIES_BY_ID / PLANES / planeOf 等。
 *
 * ⚠ 但豁免不等于不管：这些模块**必须真的作为 <script> 挂在页面上**，
 *   否则 ui.js 里的 AT.render.frame() 会在运行时静默变成 no-op。
 *   故下面单列一条断言，核对每个豁免名都在 index.html 里有对应脚本。 */
var RUNTIME_NS = { render: 1, ui: 1, game: 1, sim: 1, audio: 1 };
var atUsed = {};
uiSrc.replace(/\bAT\.([\w$]+)/g, function (_, v) { atUsed[v] = 1; return _; });
var atMissing = Object.keys(atUsed).filter(function (k) {
  if (RUNTIME_NS[k]) return false;
  return global.AT[k] === undefined;
});
ok(atMissing.length === 0, 'AT 命名空间提供 ui.js 引用的全部数据层成员',
   atMissing.length ? '缺失：' + atMissing.join(', ') : '');

/* 豁免名单里的运行时模块，必须都能在 index.html 里找到对应脚本 ——
 * 这是「ui.js 调 AT.audio.play 但页面忘了加载 audio.js」这类
 * 静默失效的唯一防线。（htmlSrc 已在上文读过。） */
var notWired = Object.keys(RUNTIME_NS).filter(function (ns) {
  if (ns === 'sim') return false;      // sim 不通过 AT.xxx 直接调（走 S 别名）
  if (!atUsed[ns]) return false;        // ui.js 没用到就不必强求存在
  return htmlSrc.indexOf('src/' + ns + '.js') < 0;
});
ok(notWired.length === 0,
   'ui.js 引用的运行时模块都在 index.html 里挂了脚本',
   notWired.length ? '未挂载：' + notWired.join(', ') : '');

/* ── 汇总 ── */
console.log('\n' + '═'.repeat(68));
console.log('通过 ' + pass + ' / ' + (pass + fail));
if (fail) {
  console.log('\n失败项：');
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
}
console.log('═'.repeat(68));
process.exit(fail ? 1 : 0);
