'use strict';
// 分组试验：分别用「THREE 原生对象」复现各材质，看 VALIDATE_STATUS 来自谁。
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

srv.listen(8739, async function () {
  var b = await pw.chromium.launch({ executablePath: EDGE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  var pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await pg.goto('http://127.0.0.1:8739/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(3500);

  // 用一个全新的 renderer + 干净 scene，逐项重建
  var out = await pg.evaluate(function () {
    var VS = [
      'attribute float aSize;', 'attribute float aAlpha;', 'attribute vec3 aColor;',
      'varying vec3 vColor;', 'varying float vAlpha;', 'uniform float uScale;',
      'void main(){',
      '  vColor = aColor; vAlpha = aAlpha;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_PointSize = aSize * uScale / max(0.001, -mv.z);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n');
    var FS = [
      'uniform sampler2D uTex;', 'varying vec3 vColor;', 'varying float vAlpha;',
      'void main(){',
      '  vec4 t = texture2D(uTex, gl_PointCoord);',
      '  gl_FragColor = vec4(vColor, 1.0) * t * vAlpha;',
      '  if (gl_FragColor.a < 0.01) discard;',
      '}'
    ].join('\n');

    var cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    document.body.appendChild(cv);
    var rnd = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
    var results = [];

    function trial(name, build) {
      var sc = new THREE.Scene();
      var cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      cam.position.z = 3;
      sc.add(new THREE.AmbientLight(0xffffff, 1));
      var before = console.error;
      var caught = [];
      console.error = function () { caught.push(Array.prototype.join.call(arguments, ' ')); };
      try {
        build(sc);
        rnd.render(sc, cam);
      } catch (e) {
        caught.push('THROW: ' + e.message);
      }
      console.error = before;
      results.push({ name: name, errs: caught.length, first: caught[0] ? caught[0].slice(0, 200) : '' });
    }

    function radialTex() {
      var c = document.createElement('canvas'); c.width = c.height = 32;
      var x = c.getContext('2d');
      var g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 32, 32);
      var t = new THREE.CanvasTexture(c);
      return t;
    }

    // 1) 纯 Points + 城市着色器
    trial('1 Points+城市着色器(CanvasTexture)', function (sc) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([0.4]), 1));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array([1]), 1));
      var m = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: radialTex() }, uScale: { value: 32 } },
        vertexShader: VS, fragmentShader: FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      sc.add(new THREE.Points(g, m));
    });

    // 2) 球体 + 内联 dataURI 贴图 + MeshStandardMaterial（复刻 buildGlobe）
    trial('2 Sphere+内联dataURI+MeshStandardMaterial', function (sc) {
      var img = new Image();
      img.src = window.DC_EARTH_TEX;
      var tex = new THREE.Texture(img); tex.needsUpdate = true; tex.anisotropy = 4;
      var m = new THREE.MeshStandardMaterial({ color: 0xa8bccb, map: tex, roughness: 0.95, metalness: 0.02 });
      sc.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), m));
    });

    // 3) 同上但用 TextureLoader 从 dataURI 载（更贴近真实写法）
    trial('3 Sphere+TextureLoader(dataURI)', function (sc) {
      var tex = new THREE.TextureLoader().load(window.DC_EARTH_TEX);
      tex.anisotropy = 4;
      var m = new THREE.MeshStandardMaterial({ color: 0xa8bccb, map: tex, roughness: 0.95, metalness: 0.02 });
      sc.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), m));
      rnd.render(sc, cam = sc.children[1]); // 触发一次
    });

    // 4) 纯 Sprite（ philosphy：看看 sprite 是否独立报错）
    trial('4 Sprite', function (sc) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xffffff }));
      sc.add(sp);
    });

    // 5) InstancedMesh
    trial('5 InstancedMesh', function (sc) {
      var im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0x7fd4e8 }), 10);
      sc.add(im);
    });

    rnd.dispose();
    cv.remove();
    return results;
  });

  console.log('=== 分组试验结果 ===');
  out.forEach(function (r) {
    console.log((r.errs ? '✗ ' : '✓ ') + r.name + '  错误数=' + r.errs);
    if (r.first) console.log('     ' + r.first.replace(/\n/g, ' | '));
  });

  await b.close();
  srv.close();
});
