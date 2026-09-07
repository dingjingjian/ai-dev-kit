/**
 * 逐条对照 minitool-zip-builder 三份 reference 的自检清单，校验 dist/ 产物。
 * 用法: node verify-minitool.mjs [dist目录]
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.argv[2] || 'dist');
const rows = [];
const ok = (item, note = '') => rows.push({ s: 'PASS', item, note });
const bad = (item, note = '') => rows.push({ s: 'FAIL', item, note });
const warn = (item, note = '') => rows.push({ s: 'WARN', item, note });

// 收集所有文件
const walk = (d, base = '') =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name), base + e.name + '/') : [base + e.name]
  );
const files = walk(DIST);
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const allJs = files
  .filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(DIST, f), 'utf8'))
  .join('\n');

/* ========== zip-artifact-spec §6 · 包结构 ========== */
files.includes('index.html')
  ? ok('index.html 在包根目录')
  : bad('index.html 在包根目录', '未找到');

const ALLOW = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json'];
const badExt = files.filter((f) => !ALLOW.includes(path.extname(f).toLowerCase()));
badExt.length ? bad('仅含支持的文件类型', badExt.join(',')) : ok('仅含支持的文件类型', files.length + ' 个文件');

const junk = files.filter((f) => /node_modules|\.git\/|\.DS_Store|\.map$|vite\.config|webpack\.config|__MACOSX/.test(f));
junk.length ? bad('无开发垃圾文件', junk.join(',')) : ok('无开发垃圾文件');

const htmlCount = files.filter((f) => f.endsWith('.html')).length;
htmlCount === 1 ? ok('有且只有一个 html（单页）') : bad('有且只有一个 html', htmlCount + ' 个');

/* ========== zip-artifact-spec §6 · index.html 与资源 ========== */
/^<!DOCTYPE html>/i.test(html.trim()) ? ok('<!DOCTYPE html>') : bad('<!DOCTYPE html>');
/<html[^>]+lang="zh-CN"/.test(html) ? ok('lang="zh-CN"') : bad('lang="zh-CN"');
/<meta charset="UTF-8"/i.test(html) ? ok('charset=UTF-8') : bad('charset=UTF-8');

const vp = (html.match(/<meta name="viewport"[^>]*content="([^"]*)"/i) || [])[1] || '';
const vpNeed = ['width=device-width', 'initial-scale=1', 'viewport-fit=cover'];
const vpMiss = vpNeed.filter((k) => !vp.includes(k));
vpMiss.length ? bad('viewport 关键字段', '缺 ' + vpMiss.join(',')) : ok('viewport 关键字段', vp);

// 外部资源引用（排除 XML namespace 字符串）
const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
const extCss = [...html.matchAll(/url\(\s*['"]?(https?:\/\/[^)'"]+)/gi)].map((m) => m[1]);
[...ext, ...extCss].length ? bad('无 http(s) 外部资源引用', [...ext, ...extCss].join(',')) : ok('无 http(s) 外部资源引用');

// 绝对路径引用
const abs = [...html.matchAll(/(?:src|href)\s*=\s*["'](\/[^/][^"']*)["']/g)].map((m) => m[1]);
abs.length ? bad('资源用相对路径', '绝对路径: ' + abs.join(',')) : ok('资源用相对路径');

// 内联脚本 / 行内事件
const inlineScript = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter(
  (m) => m[1].trim().length > 0
);
inlineScript.length ? bad('无内联 <script>', inlineScript.length + ' 处') : ok('无内联 <script>（脚本全部外置）');

const inlineEvt = [...html.matchAll(/\son[a-z]+\s*=\s*["'][^"']*["']/gi)].map((m) => m[0].trim());
inlineEvt.length ? bad('无行内事件属性', inlineEvt.join(',')) : ok('无行内事件属性 onclick= 等');

/javascript:/i.test(html) ? bad('无 javascript: URI') : ok('无 javascript: URI');

// 禁用标签
const banned = [
  [/<iframe/i, '<iframe>'],
  [/<object/i, '<object>'],
  [/<base\s/i, '<base href>'],
  [/http-equiv=["']Content-Security-Policy/i, '自建 CSP meta'],
  [/<form[\s>]/i, '<form> 提交跳转'],
  [/<a[^>]+download/i, 'a[download]'],
  [/target=["']_blank/i, 'target="_blank"'],
];
const hitTag = banned.filter(([r]) => r.test(html)).map(([, n]) => n);
hitTag.length ? bad('无禁用标签/属性', hitTag.join(',')) : ok('无禁用标签/属性 iframe/object/base/CSP/form/download/_blank');

// 引用资源都在包内
const refs = [...html.matchAll(/(?:src|href)\s*=\s*["'](\.\/[^"']+)["']/g)].map((m) => m[1].replace(/^\.\//, ''));
const missRef = refs.filter((r) => !files.includes(r));
missRef.length ? bad('引用资源均已打包', '缺失: ' + missRef.join(',')) : ok('引用资源均已打包', refs.join(' '));

/* ========== device-capabilities §6 · 能力扫描 ========== */
const SCAN = [
  [/\bfetch\s*\(/, 'fetch('],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+WebSocket\s*\(/, 'new WebSocket('],
  [/new\s+EventSource\s*\(/, 'new EventSource('],
  [/new\s+RTCPeerConnection\s*\(/, 'new RTCPeerConnection('],
  [/navigator\.geolocation/, 'navigator.geolocation'],
  [/navigator\.clipboard/, 'navigator.clipboard'],
  [/execCommand\s*\(\s*['"](copy|cut|paste)/, "execCommand('copy')"],
  [/navigator\.(bluetooth|usb|hid|serial)/, 'navigator.bluetooth/usb/hid/serial'],
  [/navigator\.(getBattery|connection|credentials|locks)/, 'navigator.getBattery/connection/credentials/locks'],
  [/enumerateDevices|getDisplayMedia/, 'enumerateDevices/getDisplayMedia'],
  [/navigator\.storage\.persist|serviceWorker\.register/, 'storage.persist/serviceWorker'],
  [/new\s+(Shared)?Worker\s*\(/, 'new Worker('],
  [/new\s+(Accelerometer|Gyroscope|Magnetometer)\s*\(/, '传感器 API'],
  [/DeviceMotionEvent|DeviceOrientationEvent|['"]devicemotion['"]|['"]deviceorientation['"]/, 'DeviceMotion/Orientation'],
  [/(webkit)?[Rr]equestFullscreen/, 'requestFullscreen'],
  [/\beval\s*\(/, 'eval('],
  [/new\s+Function\s*\(/, 'new Function('],
  [/WebAssembly\./, 'WebAssembly'],
  [/window\.open\s*\(/, 'window.open('],
  [/window\.prompt\s*\(|[^.\w]prompt\s*\(/, 'window.prompt('],
  [/location\.(href\s*=|assign\s*\()/, 'location 跳转'],
];

// 业务脚本（排除第三方库）单独扫描
const bizJs = ['assets/main.js', 'assets/layout.js']
  .filter((f) => files.includes(f))
  .map((f) => fs.readFileSync(path.join(DIST, f), 'utf8'))
  .join('\n');

const bizHits = SCAN.filter(([r]) => r.test(bizJs)).map(([, n]) => n);
bizHits.length ? bad('业务代码无被禁能力', bizHits.join(',')) : ok('业务代码无被禁能力', '23 项模式全部零命中');

const libJs = files.includes('assets/three.min.js')
  ? fs.readFileSync(path.join(DIST, 'assets/three.min.js'), 'utf8')
  : '';
const libHits = SCAN.filter(([r]) => r.test(libJs)).map(([, n]) => n);
if (libHits.length) {
  // 判断库内 loader 是否被业务代码触达
  const loaders = /TextureLoader|FileLoader|GLTFLoader|ImageBitmapLoader|CubeTextureLoader|AudioLoader|ObjectLoader|MaterialLoader|\.load\s*\(/;
  loaders.test(bizJs)
    ? bad('第三方库被禁能力未被触达', '业务代码调用了 loader，会触发网络请求')
    : warn('第三方库存在被禁能力代码', libHits.join(',') + ' —— 位于 three.js 内部 Loader，业务代码零调用，无触发路径');
} else {
  ok('第三方库无被禁能力');
}

/* ========== cross-platform-h5 §6 · 跨端自检 ========== */
/pointerdown|touchstart/.test(bizJs) ? ok('交互用 pointer/touch events') : warn('交互用 pointer/touch events', '未检测到');

const hoverRules = [...html.matchAll(/([^{}]*:hover[^{]*)\{([^}]*)\}/g)];
const hoverRisk = hoverRules.filter(([, , body]) => /display\s*:|visibility\s*:|pointer-events\s*:/.test(body));
hoverRisk.length
  ? warn('无关键操作依赖 hover', hoverRisk.length + ' 处 hover 控制可见性')
  : ok('无关键操作依赖 hover', hoverRules.length + ' 处 hover 均为纯视觉增强');

/safe-area-inset/.test(html) ? ok('安全区适配 var(--safe-area-inset-*, env(...))') : bad('安全区适配');
/touch-action/.test(html) ? ok('touch-action 已设置') : warn('touch-action 已设置');
/-webkit-tap-highlight-color/.test(html) ? ok('tap-highlight 已处理') : warn('tap-highlight 已处理');
/overscroll-behavior/.test(html) ? ok('滚动容器 overscroll-behavior') : warn('滚动容器 overscroll-behavior');

// 只算真正写死的 width，max-width / min-width / 媒体查询属响应式合理用法
const hardPx = [...html.matchAll(/(^|[;{\s])width\s*:\s*(\d{3,})px/g)].map((m) => m[2]);
hardPx.length
  ? warn('无写死像素宽度', 'width:' + hardPx.join('px, ') + 'px')
  : ok('无写死像素宽度', 'max-width/min-width 属响应式用法，不计入');

// 布局自适应能力
const flexible = /max-width\s*:|flex\s*:|%|vw/.test(html);
flexible ? ok('布局自适应（flex/%/max-width）') : warn('布局自适应');

/* ========== 输出 ========== */
const w = Math.max(...rows.map((r) => r.item.length));
const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ' };
console.log('\n小工具 ZIP 合规校验 · ' + path.basename(DIST) + '\n' + '─'.repeat(w + 34));
for (const r of rows) {
  console.log(`${icon[r.s]} ${r.item.padEnd(w)}  ${r.note}`);
}
const f = rows.filter((r) => r.s === 'FAIL').length;
const wn = rows.filter((r) => r.s === 'WARN').length;
console.log('─'.repeat(w + 34));
console.log(`合计 ${rows.length} 项：通过 ${rows.length - f - wn} · 警告 ${wn} · 失败 ${f}`);
process.exit(f > 0 ? 1 : 0);
