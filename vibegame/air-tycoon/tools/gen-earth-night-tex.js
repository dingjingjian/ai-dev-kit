/*
 * air-tycoon — tools/gen-earth-night-tex.js
 * 把 assets/earth-night.jpg（夜面城市灯光贴图）转成内联 data URI，
 * 产出 assets/earth-night-tex.js（不进提交包的构建脚本）。
 *
 * 与 gen-earth-tex.js 的关系：
 *   同一个原因（file:// 下 Chrome 把本地图片的 origin 视为 null，作为 WebGL 纹理会被
 *   CORS 拒绝，而「打 zip 双击 index.html」正是本工具的主战场），但**不需要浏览器**：
 *   地球贴图要降采样（4096→1536）才够小，夜景贴图出厂就是 2048×1024 / 40KB，
 *   再降采样只会把单像素的城市灯点抹掉（灯光只占全图 1.5% 的像素）。
 *   故这里直接读字节转 base64，无 Playwright 依赖、确定性也更好。
 *
 * 产物：assets/earth-night-tex.js → window.AT_EARTH_NIGHT_TEX = "data:image/jpeg;base64,..."
 *
 * 运行：node tools/gen-earth-night-tex.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SRC = 'assets/earth-night.jpg';
var OUT = 'assets/earth-night-tex.js';

var srcPath = path.join(ROOT, SRC);
if (!fs.existsSync(srcPath)) {
  console.error('找不到源图 ' + SRC + '（可由 tools/make_night_texture.py 生成）');
  process.exit(1);
}

var buf = fs.readFileSync(srcPath);
var b64 = buf.toString('base64');

var js = '/*\n' +
  ' * air-tycoon — assets/earth-night-tex.js\n' +
  ' * 【自动生成，勿手改】由 tools/gen-earth-night-tex.js 从 assets/earth-night.jpg 转出。\n' +
  ' *\n' +
  ' * 夜面城市灯光贴图的内联 data URI 版本。原因同 earth-tex.js：file:// 协议下 Chrome\n' +
  ' * 以 CORS 拒绝本地 jpg 作 WebGL 纹理，而本工具的核心场景是「打 zip 后双击 index.html」。\n' +
  ' * data URI 不受 CORS 约束，且走 <script src> 而非 fetch，不违反小工具红线。\n' +
  ' *\n' +
  ' * 贴图内容：黑底 + 暖金色城市灯光（由 tools/make_night_texture.py 从 NASA 黑大理石\n' +
  ' * 夜景图提取），与 assets/earth.jpg 同一等距圆柱投影，UV 因此逐像素对齐。\n' +
  ' * render.js 的加载顺序：内联 data URI → assets/earth-night.jpg → 关掉夜景层。\n' +
  ' */\n' +
  '(function (global) {\n' +
  '  global.AT_EARTH_NIGHT_TEX = "data:image/jpeg;base64,' + b64 + '";\n' +
  '})(typeof window !== \'undefined\' ? window : globalThis);\n';

fs.writeFileSync(path.join(ROOT, OUT), js, 'utf8');
console.log('已生成 ' + OUT);
console.log('  源图 ' + Math.round(buf.length / 1024) + ' KB → 内联 ' +
  Math.round(fs.statSync(path.join(ROOT, OUT)).size / 1024) + ' KB');
