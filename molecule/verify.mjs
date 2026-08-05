// 打包前自检：结构、CSP、端能力、资源引用、体积
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const results = [];
const ok = (m) => results.push(['PASS', m]);
const bad = (m) => results.push(['FAIL', m]);

// ---------- A. 与原文件的 body 一致性 ----------
const orig = fs.readFileSync(path.join(root, 'molecule.html'), 'utf8');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const grab = (s) => {
  const a = s.indexOf('<body>') + 6;
  const b = s.indexOf('<script');
  return s.slice(a, b).replace(/\r\n/g, '\n').trim(); // 归一化换行，只比对内容
};
grab(orig) === grab(html)
  ? ok('body DOM 结构与原文件逐字一致（未改动业务 UI）')
  : bad('body DOM 结构与原文件不一致');

// ---------- B. 包结构 ----------
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : files.push(path.relative(dist, p).replace(/\\/g, '/'));
  }
})(dist);

files.includes('index.html') ? ok('index.html 位于包根目录') : bad('index.html 不在根目录');

const allowExt = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json'];
const badExt = files.filter((f) => !allowExt.includes(path.extname(f).toLowerCase()));
badExt.length === 0 ? ok(`仅含允许的文件类型（共 ${files.length} 个文件）`) : bad(`存在不允许的文件类型: ${badExt}`);

const junk = files.filter((f) => /node_modules|\.git\/|\.DS_Store|\.map$|vite\.config|webpack\.config/.test(f));
junk.length === 0 ? ok('无开发垃圾文件（node_modules / *.map / 构建配置）') : bad(`存在垃圾文件: ${junk}`);

const htmlCount = files.filter((f) => f.endsWith('.html')).length;
htmlCount === 1 ? ok('单页应用：有且仅有一个 index.html') : bad(`存在 ${htmlCount} 个 html 文件`);

// ---------- C. index.html 头部规范 ----------
/^<!DOCTYPE html>/i.test(html) ? ok('<!DOCTYPE html> 声明正确') : bad('缺少 <!DOCTYPE html>');
/<html lang="zh-CN">/.test(html) ? ok('lang="zh-CN"') : bad('缺少 lang="zh-CN"');
/<meta charset="UTF-8"/i.test(html) ? ok('charset=UTF-8') : bad('缺少 charset=UTF-8');
const vp = html.match(/<meta name="viewport" content="([^"]+)"/);
const vpc = vp ? vp[1] : '';
['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover'].every((k) => vpc.includes(k))
  ? ok(`viewport 完整：${vpc}`)
  : bad(`viewport 不合规：${vpc}`);
!/<base\s/i.test(html) ? ok('无 <base href>') : bad('存在 <base href>');
!/<iframe|<object/i.test(html) ? ok('无 <iframe> / <object>') : bad('存在 iframe/object');
!/http-equiv=["']Content-Security-Policy/i.test(html) ? ok('未自建 CSP <meta>') : bad('存在自建 CSP meta');
!/<form[\s>]/i.test(html) ? ok('无 <form> 提交跳转') : bad('存在 <form>');

// ---------- D. CSP：脚本必须外置 ----------
const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html);
!inlineScript ? ok('无内联 <script>，脚本全部外置') : bad('存在内联 <script>');
const inlineEvent = html.match(/\son[a-z]+\s*=\s*["']/gi);
!inlineEvent ? ok('无 onXxx= 行内事件') : bad(`存在行内事件: ${inlineEvent}`);
!/javascript:/i.test(html) ? ok('无 javascript: URI') : bad('存在 javascript: URI');

// ---------- E. 资源引用：相对路径 + 已打包 ----------
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const absRefs = refs.filter((r) => /^https?:\/\//.test(r) || r.startsWith('/'));
absRefs.length === 0 ? ok(`所有资源为相对路径（${refs.length} 处引用）`) : bad(`存在绝对/外链引用: ${absRefs}`);
const missing = refs.filter((r) => !fs.existsSync(path.join(dist, r.replace(/^\.\//, ''))));
missing.length === 0 ? ok('引用的资源全部存在于包内') : bad(`引用资源缺失: ${missing}`);

// ---------- F. 端能力扫描（全包） ----------
const banned = [
  [/\bfetch\s*\(/, 'fetch('], [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+WebSocket\s*\(/, 'WebSocket'], [/new\s+EventSource\s*\(/, 'EventSource'],
  [/new\s+RTCPeerConnection\s*\(/, 'RTCPeerConnection'],
  [/navigator\.geolocation/, 'geolocation'], [/navigator\.clipboard/, 'clipboard'],
  [/execCommand\s*\(/, 'execCommand'], [/navigator\.(bluetooth|usb|hid|serial)/, 'hardware'],
  [/navigator\.(getBattery|connection|credentials|locks)/, 'device-info/credentials'],
  [/enumerateDevices|getDisplayMedia/, 'enumerateDevices/getDisplayMedia'],
  [/storage\.persist|serviceWorker/, 'persist/serviceWorker'],
  [/new\s+(Shared)?Worker\s*\(/, 'Worker'],
  [/new\s+(Accelerometer|Gyroscope|Magnetometer)\s*\(/, 'sensors'],
  [/DeviceMotionEvent|DeviceOrientationEvent|devicemotion|deviceorientation/, 'motion/orientation'],
  [/requestFullscreen/, 'requestFullscreen'],
  [/\beval\s*\(/, 'eval('], [/new\s+Function\s*\(/, 'new Function('],
  [/WebAssembly\./, 'WebAssembly'],
  [/window\.open\s*\(|window\.prompt\s*\(/, 'window.open/prompt'],
  [/location\.(href\s*=|assign\s*\()/, 'location 跳转'],
  [/target="_blank"/, 'target=_blank'], [/\sdownload[=\s>]/, 'a[download]'],
  [/https?:\/\//, '外部 URL'],
];
const scanFiles = files.filter((f) => /\.(html|js|css|json)$/.test(f));
const hits = [];
for (const f of scanFiles) {
  const txt = fs.readFileSync(path.join(dist, f), 'utf8');
  for (const [re, name] of banned) {
    const m = txt.match(new RegExp(re.source, 'g'));
    if (m) hits.push(`${f}: ${name} ×${m.length}`);
  }
}
hits.length === 0
  ? ok(`端能力扫描清单全部通过（扫描 ${scanFiles.length} 个文本文件，0 命中）`)
  : bad(`命中被禁能力:\n      ${hits.join('\n      ')}`);

// ---------- G. 跨端适配 ----------
const css = fs.readFileSync(path.join(dist, 'assets/style.css'), 'utf8');
/var\(--safe-area-inset-top,\s*env\(safe-area-inset-top/.test(css)
  ? ok('安全区用 var(--safe-area-inset-*, env(...)) 组合写法，PC 模拟器 / 真机双端生效')
  : bad('安全区写法不合规');
/--extra-safe:\s*50px/.test(css)
  ? ok('移动端在系统安全区之外额外预留 50px（--extra-safe，上下各一份）')
  : bad('未找到移动端 50px 额外安全高度');
/touch-action:\s*none/.test(css) ? ok('canvas 设置 touch-action:none，拖拽旋转不与页面滚动冲突') : bad('canvas 缺少 touch-action');
/-webkit-touch-callout:\s*none/.test(css) ? ok('已禁用系统长按菜单（-webkit-touch-callout）') : bad('缺少 -webkit-touch-callout');
// 只判定裸 width:NNNpx（max-width / min-width 属于响应式约束，不算写死）
const hardW = css.match(/(?<![a-z-])width:\s*\d{3,}px/g);
!hardW ? ok('布局自适应：无写死的页面级像素宽度（max-/min-width 为响应式约束）') : bad(`存在写死宽度: ${hardW}`);

// ---------- H. 体积 ----------
const total = files.reduce((s, f) => s + fs.statSync(path.join(dist, f)).size, 0);
const zipPath = path.join(root, 'molecule-minitool.zip');
const zipSize = fs.existsSync(zipPath) ? fs.statSync(zipPath).size : null;
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
if (zipSize !== null) {
  zipSize <= 10 * 1024 * 1024 ? ok(`zip 体积 ${mb(zipSize)}，未超 10MB 上限（解压后 ${mb(total)}）`) : bad(`zip 超出 10MB: ${mb(zipSize)}`);
  if (zipSize > 2 * 1024 * 1024) results.push(['WARN', `zip ${mb(zipSize)} 超过 2MB 建议值`]);
} else {
  results.push(['WARN', `尚未打包，解压后总体积 ${mb(total)}`]);
}

// ---------- 输出 ----------
const w = { PASS: 0, FAIL: 0, WARN: 0 };
for (const [s, m] of results) {
  w[s]++;
  console.log(`${s === 'PASS' ? '  [OK]  ' : s === 'FAIL' ? '  [X]   ' : '  [!]   '}${m}`);
}
console.log(`\n合计: ${w.PASS} 通过 / ${w.FAIL} 失败 / ${w.WARN} 提醒`);
process.exit(w.FAIL ? 1 : 0);
