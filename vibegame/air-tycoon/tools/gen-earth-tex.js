/*
 * air-tycoon — tools/gen-earth-tex.js
 * 把 assets/earth.jpg 转成内联 data URI，产出 assets/earth-tex.js（不进提交包的构建脚本）。
 *
 * 为什么需要它：
 *   file:// 协议下 Chrome 把本地图片的 origin 视为 null，会以 CORS 拒绝它作为 WebGL 纹理
 *   （net::ERR_FAILED）。本工具的核心场景是「打 zip 双击 index.html」，file:// 是主战场而非边缘场景，
 *   所以贴图必须内联 —— data URI 走 <script src>，既绕开 CORS 又不碰 fetch 红线。
 *
 * 产物：assets/earth-tex.js → window.AT_EARTH_TEX = "data:image/jpeg;base64,..."
 *
 * 运行：node tools/gen-earth-tex.js [宽度] [质量]
 *   例：node tools/gen-earth-tex.js 1536 0.85   （默认）
 * 依赖：Playwright + Edge（用浏览器做降采样与 JPEG 编码，避免引入 sharp/jimp 等新依赖）
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var PORT = 8734;
/* ⚠ 默认 2048 / q0.90（2026-10-09 由 1536 / q0.85 上调）。
 *   旧默认是「体积换质量」的取舍，但实测**分辨率才是主项**：同一 q0.85 下
 *   1536→2048 把 PSNR（升回原尺寸对照原图）从 30.67 抬到 37.08 dB（+6.4），
 *   而在 1536 上把 q 从 0.85 提到 0.92 只 +0.7 dB。当前 air-tycoon.zip 才 507 KB、
 *   build.config 的 maxZipBytes 是 10 MB，一次 +400 KB 完全付得起。
 *   2048 已是源图原生分辨率（再大没有信息量），q0.90 下 earth-tex.js ≈ 510 KB。 */
var W = parseInt(process.argv[2], 10) || 2048;      // 等距圆柱贴图宽度，高恒为其一半
var Q = parseFloat(process.argv[3]) || 0.90;        // JPEG 编码质量
var SRC = 'assets/earth.jpg';
var OUT = 'assets/earth-tex.js';

var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.jpg': 'image/jpeg' };

function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rep) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      var f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end(); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.listen(PORT, function () { res(srv); });
  });
}

/* Playwright 的解析顺序（2026-10-09 由写死一条绝对路径改成多候选）：
 *   ① 环境变量 AT_PLAYWRIGHT —— 本机把 playwright-core 装在临时目录时用
 *      （`npm i --prefix <dir> playwright-core` + `NODE_PATH=<dir>/node_modules`），
 *      不必往这个「零依赖」仓库里塞 node_modules；
 *   ② 常规模块名（NODE_PATH / 本地 node_modules 命中）；
 *   ③ 历史写死路径，保留以免老机器上的既有用法失效。
 * ⚠ 浏览器用 Edge（executablePath），所以只需要 playwright(-core) 这个 JS 包，
 *   不需要它自带下载 Chromium。 */
function loadPlaywright() {
  var cands = [
    process.env.AT_PLAYWRIGHT,
    'playwright-core',
    'playwright',
    'C:/Users/ASUS/.workbuddy/binaries/node/workspace/node_modules/playwright'
  ];
  for (var i = 0; i < cands.length; i++) {
    if (!cands[i]) continue;
    try { return require(cands[i]); } catch (e) { /* 试下一个 */ }
  }
  return null;
}
var EDGE = process.env.AT_EDGE ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async function () {
  if (!fs.existsSync(path.join(ROOT, SRC))) {
    console.error('找不到源图 ' + SRC); process.exit(1);
  }
  var pw = loadPlaywright();
  if (!pw) {
    console.error('缺少 Playwright —— 装一个即可：npm i --prefix <dir> playwright-core，'
      + ' 再 NODE_PATH=<dir>/node_modules node tools/gen-earth-tex.js');
    process.exit(1);
  }

  var srv = await serve();
  var browser = await pw.chromium.launch({
    executablePath: fs.existsSync(EDGE) ? EDGE : undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  var page = await browser.newPage();
  // 必须经 http 打开：画布一旦被 file:// 的图片污染，toDataURL 会直接抛 SecurityError
  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });

  var dataUrl = await page.evaluate(function (arg) {
    return new Promise(function (done, fail) {
      var i = new Image();
      i.onload = function () {
        var h = Math.round(i.height * arg.w / i.width);
        var c = document.createElement('canvas');
        c.width = arg.w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(i, 0, 0, c.width, c.height);
        done({
          url: c.toDataURL('image/jpeg', arg.q),
          w: c.width, h: c.height, ow: i.width, oh: i.height
        });
      };
      i.onerror = function () { fail(new Error('图片加载失败')); };
      i.src = arg.src;
    });
  }, { src: SRC, w: W, q: Q });

  await browser.close();
  srv.close();

  var js = '/*\n' +
    ' * air-tycoon — assets/earth-tex.js\n' +
    ' * 【自动生成，勿手改】由 tools/gen-earth-tex.js 从 assets/earth.jpg 转出。\n' +
    ' *\n' +
    ' * 地球贴图的内联 data URI 版本。原因：file:// 协议下 Chrome 以 CORS 拒绝本地 jpg 作 WebGL 纹理，\n' +
    ' * 而本工具的核心场景是「打 zip 后双击 index.html」，必须能在 file:// 下正常显示。\n' +
    ' * data URI 不受 CORS 约束，且走 <script src> 而非 fetch，不违反小工具红线。\n' +
    ' *\n' +
    ' * 源图 ' + dataUrl.ow + '×' + dataUrl.oh + ' → 内联 ' + dataUrl.w + '×' + dataUrl.h +
    (dataUrl.w < dataUrl.ow
      ? '（球在屏幕上直径约 500–700px，此分辨率足够）'
      : '（已是源图原生分辨率，再大没有信息量）') + '。\n' +
    ' * render.js 的加载顺序：内联 data URI → assets/earth.jpg → 纯色球体。\n' +
    ' */\n' +
    '(function (global) {\n' +
    '  global.AT_EARTH_TEX = "' + dataUrl.url + '";\n' +
    '})(typeof window !== \'undefined\' ? window : globalThis);\n';

  fs.writeFileSync(path.join(ROOT, OUT), js, 'utf8');
  console.log('已生成 ' + OUT);
  console.log('  源图 ' + dataUrl.ow + '×' + dataUrl.oh + ' → ' + dataUrl.w + '×' + dataUrl.h);
  console.log('  体积 ' + Math.round(fs.statSync(path.join(ROOT, OUT)).size / 1024) + ' KB');
})();
