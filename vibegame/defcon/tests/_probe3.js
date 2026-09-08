'use strict';
// 判定性诊断：城市光点到底画没画出来；顺带揪出 404 资源。
var http = require('http'), fs = require('fs'), path = require('path');
var pw = require('C:/Users/ASUS/.workbuddy/binaries/node/workspace/node_modules/playwright');
var EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
var ROOT = process.cwd();
var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.jpg': 'image/jpeg' };

var requested = [];
var srv = http.createServer(function (q, r) {
  var p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  var f = path.join(ROOT, p);
  if (!fs.existsSync(f)) {
    requested.push('404 :: ' + p);
    r.writeHead(404); r.end(); return;
  }
  requested.push('200 :: ' + p);
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});

srv.listen(8738, async function () {
  var b = await pw.chromium.launch({ executablePath: EDGE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  var pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await pg.goto('http://127.0.0.1:8738/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(3500);

  console.log('=== 资源请求 ===');
  requested.forEach(function (r) { console.log('  ' + r); });

  var res = await pg.evaluate(function () {
    var R = window.DC.render;
    var cv = document.getElementById('stage');
    var gl = cv.getContext('webgl2') || cv.getContext('webgl');
    var st = window.DC.game.state;

    function stat() {
      var w = cv.width, h = cv.height, buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      // 以「比背景底色亮出 20」为有效光点计数，避开 scene.background 的统计偏差
      var mean = 0, bright = 0, sum = 0;
      for (var i = 0; i < w * h; i++) {
        var v = (buf[i * 4] + buf[i * 4 + 1] + buf[i * 4 + 2]) / 3;
        sum += v;
        if (v > 40) bright++;
      }
      mean = sum / (w * h);
      return { mean: +mean.toFixed(2), bright: bright, total: w * h };
    }

    var out = { bg: String(R.scene.background && R.scene.background.getHexString ?
      R.scene.background.getHexString() : R.scene.background) };

    var cp = null;
    R.scene.children.forEach(function (o) { if (o.type === 'Points') cp = o; });

    // A：全部隐藏 → 纯背景
    R.scene.children.forEach(function (o) { o.visible = false; });
    R.scene.background = new THREE.Color(0x05080d);
    R.frame(st, 0);
    out.A_pureBg = stat();

    // B：只留城市光点
    R.scene.children.forEach(function (o) { o.visible = (o === cp); });
    R.frame(st, 0);
    out.B_onlyCities = stat();

    // C：只留地球（球体+壳+网格）
    R.scene.children.forEach(function (o) { o.visible = (o.type === 'Mesh'); });
    R.frame(st, 0);
    out.C_onlyGlobe = stat();

    // D：全部显示
    R.scene.children.forEach(function (o) { o.visible = true; });
    R.frame(st, 0);
    out.D_all = stat();

    return out;
  });

  console.log('');
  console.log('=== 分层渲染统计 ===');
  console.log(JSON.stringify(res, null, 1));

  await b.close();
  srv.close();
});
