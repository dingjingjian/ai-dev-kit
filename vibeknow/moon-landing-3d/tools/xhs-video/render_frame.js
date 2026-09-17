/* render_frame.js —— 逐帧渲染函数 renderFrame(t)
 *
 * 硬约束：**纯函数** —— 无 Math.random、无 Date。一切派生量都从 t 推出，
 * 于是中途断了能续渲、抽检能单渲任意一帧。
 *
 * 依赖（全部由 timeline.js 定义，本文件不重复声明，避免覆盖）：
 *   CLIPS / XFADE / FADE_IN / FADE_OUT / BASE_ZOOM
 *   RISE / DROP / SEG_SPREAD / SEG_FADE / TEXT_IN / TEXT_OUT
 *   BIG_TITLE / BIG_SUB / BIG_END / BRAND
 * 依赖（由合成脚本在启动后注入）：
 *   window.FRAME_COUNT = { "01-show": 90, ... }
 */

var FPS = 30;
/* 素材由「冻结 rAF + 合成时钟单步驱动」产出，步长恒为 1/30 s，
   不存在 screencast 那种采集帧率漂移，故无需按片段实测帧率校正。 */
var SRCFPS = 30;

var SHOT_SPANS = (function () {
  var out = [], acc = 0;
  for (var i = 0; i < CLIPS.length; i++) {
    var s = CLIPS[i];
    out.push({ i: i, s: s, t0: acc, t1: acc + s.dur });
    acc += s.dur;
  }
  return out;
})();
var DURATION = SHOT_SPANS[SHOT_SPANS.length - 1].t1;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
function pad5(n) { var s = String(n); while (s.length < 5) s = '0' + s; return s; }

function shotAt(t) {
  for (var i = 0; i < SHOT_SPANS.length; i++) {
    if (t < SHOT_SPANS[i].t1) return SHOT_SPANS[i];
  }
  return SHOT_SPANS[SHOT_SPANS.length - 1];
}

/* 分段逐句显现：把文案按 <br> 拆成先后几屏，前段保留、不做替换。
   目的是降低单屏信息密度、引导阅读顺序 —— 它不改变总字/秒。 */
function segHtml(node, src, local, start, span, wrapFn) {
  if (node.__src !== src) {
    node.__src = src;
    node.__segs = String(src).split(/<br\s*\/?>/i);
    node.__lens = node.__segs.map(function (x) {
      return x.replace(/<[^>]*>/g, '').replace(/\s/g, '').length || 1;
    });
    node.__tot = node.__lens.reduce(function (a, b) { return a + b; }, 0);
  }
  var cum = 0, h = '';
  for (var k = 0; k < node.__segs.length; k++) {
    var at = start + (cum / node.__tot) * span * SEG_SPREAD;
    var o = clamp(smooth((local - at) / SEG_FADE), 0, 1);
    if (k > 0) h += '<br>';
    h += wrapFn(node.__segs[k], o.toFixed(3));
    cum += node.__lens[k];
  }
  return h;
}

/* 只在内容真变化时写 DOM：淡入期逐帧在变，稳定后不再触碰，
   免得白白打断文字排版重排。 */
function putHtml(node, h) {
  if (node.__html !== h) { node.innerHTML = h; node.__html = h; }
}

function setText(id, html) {
  var n = document.getElementById(id);
  if (n) putHtml(n, html);
}

function wrapSeg(seg, opacity) {
  return '<span class="sg" style="opacity:' + opacity + '">' + seg + '</span>';
}
function wrapTsl(seg, opacity) {
  return '<span class="tsl" style="opacity:' + opacity + '">' + seg + '</span>';
}

window.renderFrame = function (t) {
  var sp = shotAt(t);
  var s = sp.s;
  var u = clamp((t - sp.t0) / s.dur, 0, 1);

  /* ---------- 素材层：按「播放」顺序取帧，不是定格 ---------- */
  var n = (window.FRAME_COUNT && window.FRAME_COUNT[s.clip]) || 1;
  var idx = Math.round((s.srcFrom + (t - sp.t0)) * SRCFPS);
  if (idx < 0) idx = 0;
  if (idx > n - 1) idx = n - 1;
  var img = document.getElementById('shot');
  var want = 'clips/' + s.clip + '/f' + pad5(idx) + '.jpg';
  if (img.getAttribute('src') !== want) img.setAttribute('src', want);

  /* ---------- Ken Burns：推近 + 平移（方向恒为推近，否则会露底色） ---------- */
  var scale = BASE_ZOOM * (1 + s.kb * u);
  var tx = (s.pan ? s.pan[0] : 0) * u;
  var ty = (s.pan ? s.pan[1] : 0) * u;
  img.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) +
                        'px) scale(' + scale.toFixed(5) + ')';

  /* ---------- 转场：以切点为中心的双边淡出 ----------
     只做淡入不做淡出，切点是一次一帧之内的亮度硬跳变；
     画面彼此相似的连续镜头会被读成「同一画面在闪」。 */
  var half = XFADE / 2, dark = 0;
  for (var i = 0; i < SHOT_SPANS.length; i++) {
    var p = SHOT_SPANS[i];
    if (i > 0) {
      var din = t - p.t0;
      if (din >= 0 && din < half) dark = Math.max(dark, 1 - smooth(din / half));
    }
    if (i < SHOT_SPANS.length - 1) {
      var dout = p.t1 - t;
      if (dout >= 0 && dout < half) dark = Math.max(dark, 1 - smooth(dout / half));
    }
  }
  dark = Math.max(dark, 1 - smooth(t / FADE_IN));
  dark = Math.max(dark, smooth((t - (DURATION - FADE_OUT)) / FADE_OUT));
  document.getElementById('fade').style.opacity = clamp(dark, 0, 1).toFixed(3);

  /* ---------- 文字：分层淡入淡出 ----------
     容器 opacity 管整块进出，内联 opacity 管段级显现，两者互不覆盖。 */
  var tin = sp.t0 + TEXT_IN;
  var tout = sp.t1 - TEXT_OUT;
  var local = t - tin;
  var span = Math.max(tout - tin, 0.001);
  var oIn = smooth((t - tin) / RISE);
  var oOut = 1 - smooth((t - (tout - DROP)) / DROP);
  var op = clamp(Math.min(oIn, oOut), 0, 1);

  var label = document.getElementById('label');
  if (label) {
    label.textContent = s.label || '';
    label.style.opacity = op.toFixed(3);
  }

  var sub = document.getElementById('sub');
  if (sub) {
    sub.style.opacity = op.toFixed(3);
    if (s.sub) {
      putHtml(sub, segHtml(sub, s.sub, local, 0, span, wrapSeg));
    } else {
      putHtml(sub, '');
    }
  }

  /* ---------- 片头 / 片尾大字 ---------- */
  var big = document.getElementById('big');
  var scrim = document.getElementById('bigScrim');
  if (big) {
    var btxt = '', bop = 0;
    if (s.big && s.bigWin) {
      var bIn = sp.t0 + s.bigWin[0], bOut = sp.t0 + s.bigWin[1];
      bop = clamp(Math.min(smooth((t - bIn) / 0.45),
                           1 - smooth((t - (bOut - 0.5)) / 0.5)), 0, 1);
      btxt = s.big;
    }
    big.style.opacity = bop.toFixed(3);
    if (scrim) scrim.style.opacity = (bop * 0.86).toFixed(3);  // 衬底随文字淡入
    if (btxt) putHtml(big, segHtml(big, btxt, local, 0, span * 0.5, wrapTsl));
    else putHtml(big, '');
  }

  /* ---------- 进度线 ---------- */
  var bar = document.getElementById('barFill');
  if (bar) bar.style.width = (clamp(t / DURATION, 0, 1) * 100).toFixed(3) + '%';
};
