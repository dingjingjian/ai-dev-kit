'use strict';
// 一次性诊断脚本：单独渲染城市光点，判定它到底有没有画出来。
var http = require('http'), fs = require('fs'), path = require('path');
var pw = require('C:/Users/ASUS/.workbuddy/binaries/node/workspace/node_modules/playwright');
var EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
var ROOT = process.cwd();
var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.jpg': 'image/jpeg' };

var srv = http.createServer(function (q, r) {
  var p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  var f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});

srv.listen(8736, async function () {
  var b = await pw.chromium.launch({ executablePath: EDGE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  var pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await pg.goto('http://127.0.0.1:8736/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(3500);

  var res = await pg.evaluate(function () {
    var R = window.DC.render;
    var cv = document.getElementById('stage');
    var gl = cv.getContext('webgl2') || cv.getContext('webgl');
    var st = window.DC.game.state;

    var list = [];
    R.scene.children.forEach(function (o) { list.push(o.type + (o.visible ? '' : '(hidden)')); });

    var cp = null;
    R.scene.children.forEach(function (o) { if (o.type === 'Points') cp = o; });

    var info = { children: list, hasPoints: !!cp };
    if (cp) {
      info.ptCount = cp.geometry.attributes.position.count;
      info.uScale = cp.material.uniforms.uScale.value;
      info.frustumCulled = cp.frustumCulled;
      info.matType = cp.material.type;
      var sz = cp.geometry.attributes.aSize;
      info.aSizeRange = [Math.min.apply(null, Array.from(sz.array)), Math.max.apply(null, Array.from(sz.array))];
    }

    function countLit() {
      var w = cv.width, h = cv.height, buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      var lit = 0, maxv = 0, sum = 0;
      for (var i = 0; i < w * h; i++) {
        var v = Math.max(buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]);
        if (v > 12) lit++;
        if (v > maxv) maxv = v;
        sum += v;
      }
      return { lit: lit, max: maxv, mean: (sum / (w * h)).toFixed(1), w: w, h: h };
    }

    // 只留城市光点
    R.scene.children.forEach(function (o) { o.visible = (o === cp); });
    R.frame(st, 0);
    info.onlyCities = countLit();

    // 恢复全部
    R.scene.children.forEach(function (o) { o.visible = true; });
    R.frame(st, 0);
    info.allObjects = countLit();

    return info;
  });

  console.log(JSON.stringify(res, null, 1));
  await b.close();
  srv.close();
});
