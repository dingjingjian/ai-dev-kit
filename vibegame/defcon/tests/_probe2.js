'use strict';
// 一次性诊断：抓取完整的着色器编译错误日志。
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

srv.listen(8737, async function () {
  var b = await pw.chromium.launch({ executablePath: EDGE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  var pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  var errs = [];
  pg.on('console', function (m) { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', function (e) { errs.push('PAGEERROR: ' + e.message); });

  await pg.goto('http://127.0.0.1:8737/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(4000);

  console.log('=== 控制台错误全文 ===');
  errs.forEach(function (e, i) {
    console.log('--- [' + i + '] ---');
    console.log(e.slice(0, 2500));
  });

  // 逐个 ShaderMaterial 检查编译状态
  var mats = await pg.evaluate(function () {
    var out = [];
    window.DC.render.scene.traverse(function (o) {
      if (!o.material) return;
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(function (m) {
        if (m.type !== 'ShaderMaterial' && m.type !== 'RawShaderMaterial') return;
        var prog = m.program;
        out.push({
          owner: o.type, name: o.name || '', visible: o.visible,
          hasProgram: !!prog,
          diagnostics: prog && prog.diagnostics ? {
            runnable: prog.diagnostics.runnable,
            programLog: String(prog.diagnostics.programLog || '').slice(0, 600),
            vsLog: prog.diagnostics.vertexShader ? String(prog.diagnostics.vertexShader.log || '').slice(0, 600) : '',
            fsLog: prog.diagnostics.fragmentShader ? String(prog.diagnostics.fragmentShader.log || '').slice(0, 600) : ''
          } : null
        });
      });
    });
    return out;
  });
  console.log('');
  console.log('=== ShaderMaterial 状态 ===');
  console.log(JSON.stringify(mats, null, 1));

  // 直接手工编译一遍我的城市着色器，拿到 driver 原始 log
  var raw = await pg.evaluate(function () {
    var cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    var gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (!gl) return { err: 'no gl' };
    var VS = [
      'attribute float aSize;',
      'attribute float aAlpha;',
      'attribute vec3 aColor;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'uniform float uScale;',
      'void main(){',
      '  vColor=aColor; vAlpha=aAlpha;',
      '  vec4 mv=modelViewMatrix*vec4(position,1.0);',
      '  gl_PointSize=aSize*uScale/max(0.001,-mv.z);',
      '  gl_Position=projectionMatrix*mv;',
      '}'
    ].join('\n');
    var FS = [
      'uniform sampler2D uTex;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'void main(){',
      '  vec4 t=texture2D(uTex, gl_PointCoord);',
      '  gl_FragColor=vec4(vColor,1.0)*t*vAlpha;',
      '  if(gl_FragColor.a<0.01) discard;',
      '}'
    ].join('\n');
    function comp(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return { ok: gl.getShaderParameter(s, gl.COMPILE_STATUS), log: gl.getShaderInfoLog(s), sh: s };
    }
    var v = comp(gl.VERTEX_SHADER, VS);
    var f = comp(gl.FRAGMENT_SHADER, FS);
    var r = { vs: { ok: v.ok, log: v.log }, fs: { ok: f.ok, log: f.log } };
    if (v.ok && f.ok) {
      var p = gl.createProgram();
      gl.attachShader(p, v.sh); gl.attachShader(p, f.sh);
      gl.linkProgram(p);
      var linked = gl.getProgramParameter(p, gl.LINK_STATUS);
      if (linked) {
        gl.validateProgram(p);
        r.validate = gl.getProgramParameter(p, gl.VALIDATE_STATUS);
      }
      r.link = linked;
      r.linkLog = gl.getProgramInfoLog(p);
    }
    return r;
  });
  console.log('');
  console.log('=== 手工编译城市着色器 ===');
  console.log(JSON.stringify(raw, null, 1));

  await b.close();
  srv.close();
});
