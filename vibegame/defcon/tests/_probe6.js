'use strict';
// 逐个强制材质重编译，定位哪个 program 触发 VALIDATE_STATUS。
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

srv.listen(8741, async function () {
  var b = await pw.chromium.launch({ executablePath: EDGE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  var pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await pg.addInitScript(function () {
    window.__n = 0;
    var orig = console.error;
    console.error = function () {
      if (String(arguments[0]).indexOf('VALIDATE_STATUS') >= 0) window.__n++;
      return orig.apply(console, arguments);
    };
  });
  await pg.goto('http://127.0.0.1:8741/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(3500);

  var out = await pg.evaluate(function () {
    var R = window.DC.render;
    var st = window.DC.game.state;
    var res = [];
    var seen = [];

    function mark(mat) {
      // three 内部用 __webglInit 判断是否需要 initMaterial；直接 needsUpdate 最稳
      mat.needsUpdate = true;
    }

    R.scene.traverse(function (o) {
      if (!o.material) return;
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(function (m) {
        if (seen.indexOf(m) >= 0) return;
        seen.push(m);
        var before = window.__n;
        mark(m);
        try { R.frame(st, 0); } catch (e) { }
        res.push({
          type: o.type, mat: m.type, name: o.name || '',
          hasMap: !!(m.map), isPoints: o.type === 'Points',
          newErrs: window.__n - before
        });
      });
    });
    return res;
  });

  console.log('=== 强制重编译后新增的错误数 ===');
  out.forEach(function (r) {
    console.log((r.newErrs ? '✗ ' : '✓ ') + r.type + ' / ' + r.mat +
      (r.hasMap ? ' [map]' : '') + (r.isPoints ? ' [Points]' : '') + '  +' + r.newErrs);
  });

  await b.close();
  srv.close();
});
