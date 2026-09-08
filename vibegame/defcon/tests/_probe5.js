'use strict';
// 抓 VALIDATE_STATUS 错误的调用栈。
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

srv.listen(8740, async function () {
  var b = await pw.chromium.launch({ executablePath: EDGE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  var pg = await b.newPage({ viewport: { width: 1280, height: 800 } });

  await pg.addInitScript(function () {
    window.__ceErrs = [];
    var orig = console.error;
    console.error = function () {
      window.__ceErrs.push({
        text: Array.prototype.join.call(arguments, ' '),
        stack: (new Error()).stack
      });
      return orig.apply(console, arguments);
    };
  });

  await pg.goto('http://127.0.0.1:8740/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(4000);

  var errs = await pg.evaluate(function () { return window.__ceErrs; });
  console.log('=== 首屏期间 console.error（带栈） ===');
  errs.forEach(function (e, i) {
    console.log('--- [' + i + '] ' + e.text.slice(0, 180).replace(/\n/g, ' | '));
    console.log((e.stack || '').split('\n').slice(1, 9).join('\n'));
  });

  // 进入核战阶段，看是否更多错误
  await pg.evaluate(function () {
    window.DC.game.state.crisis = 95;
  });
  await pg.waitForTimeout(20000);
  var errs2 = await pg.evaluate(function () { return window.__ceErrs; });
  console.log('');
  console.log('=== 核战阶段后新增 (' + (errs2.length - errs.length) + ' 条) ===');
  errs2.slice(errs.length).forEach(function (e, i) {
    console.log('--- [' + i + '] ' + e.text.slice(0, 180).replace(/\n/g, ' | '));
    console.log((e.stack || '').split('\n').slice(1, 9).join('\n'));
  });

  await b.close();
  srv.close();
});
