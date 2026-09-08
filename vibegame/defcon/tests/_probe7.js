'use strict';
// 对比不同 GPU 后端下 VALIDATE_STATUS 是否出现 —— 判定是代码 bug 还是测试环境伪影。
var pw = require('C:/Users/ASUS/.workbuddy/binaries/node/workspace/node_modules/playwright');
var EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
var FILE = 'file:///C:/Users/ASUS/Documents/git/ai-dev-kit/vibegame/defcon/index.html';

var CONFIGS = [
  { name: 'A 默认（无 GL 强制）', args: [] },
  { name: 'B swiftshader（CI 常用）', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
  { name: 'C angle/d3d11', args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] }
];

(async function () {
  for (var i = 0; i < CONFIGS.length; i++) {
    var cfg = CONFIGS[i];
    var b, out;
    try {
      b = await pw.chromium.launch({ executablePath: EDGE, args: cfg.args });
      var pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
      var errs = [];
      pg.on('console', function (m) {
        if (m.type() === 'error') errs.push(m.text().slice(0, 120).replace(/\n/g, ' '));
      });
      pg.on('pageerror', function (e) { errs.push('PAGEERROR: ' + e.message.slice(0, 120)); });
      await pg.goto(FILE, { waitUntil: 'load' });
      await pg.waitForTimeout(4000);
      var st = await pg.evaluate(function () {
        return {
          renderOk: !!(window.DC && window.DC.render && window.DC.render.ok),
          texOk: !!(window.DC && window.DC.render && window.DC.render.texOk),
          renderer: (function () {
            var gl = document.getElementById('stage').getContext('webgl2') ||
                     document.getElementById('stage').getContext('webgl');
            if (!gl) return 'none';
            var d = gl.getExtension('WEBGL_debug_renderer_info');
            return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          })()
        };
      });
      out = { cfg: cfg.name, errs: errs, st: st };
    } catch (e) {
      out = { cfg: cfg.name, launchFail: String(e.message).slice(0, 160) };
    }
    if (b) await b.close();

    console.log('=== ' + out.cfg + ' ===');
    if (out.launchFail) { console.log('  启动失败: ' + out.launchFail); continue; }
    console.log('  WebGL 设备   : ' + out.st.renderer);
    console.log('  renderOk     : ' + out.st.renderOk);
    console.log('  texOk(贴图)  : ' + out.st.texOk);
    console.log('  错误数       : ' + out.errs.length);
    out.errs.forEach(function (e) { console.log('    - ' + e); });
    console.log('');
  }
})();
