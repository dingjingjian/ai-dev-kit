// 打包：小红书「小工具」静态 zip 包。
// 规格见 .skill/references/zip-artifact-spec.md
//   - index.html 必须在 zip 根目录，脚本外置在 src/
//   - 经典脚本：无 type="module" / import / export
//   - 不联网：无 http(s):// 外链，无 fetch / WebSocket 等
//   - 禁用能力：geolocation / clipboard / Worker / eval / window.open / prompt ...
//   - 体积：硬上限 10 MB，建议 2 MB 以内
//
// 用法：node tools/build-zip.js
const fs = require('fs');
const path = require('path');
const { ZipArchive } = require(require('os').homedir() + '/.workbuddy/binaries/node/workspace/node_modules/archiver');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'dist', 'solar-voyager.zip');

const HARD_LIMIT = 10 * 1024 * 1024;   // 规格硬上限
const SOFT_LIMIT = 2 * 1024 * 1024;    // 规格建议值

const errs = [];
const warns = [];
const fail = m => errs.push(m);
const warn = m => warns.push(m);

// ---------------------------------------------------------------- 工具

// 去掉行注释 / 块注释（跟踪字符串状态，避免把字符串里的 // 当注释）
function stripComments(src) {
  let out = '', i = 0, state = 'code';
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { state = c === '"' ? 'dq' : c === "'" ? 'sq' : 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; } else out += (c === '\r' ? c : ' ');
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' ');
      i++; continue;
    }
    if (c === '\\') { out += c + (d || ''); i += 2; continue; }  // 字符串转义
    if ((state === 'dq' && c === '"') || (state === 'sq' && c === "'") || (state === 'tpl' && c === '`')) state = 'code';
    out += c; i++;
  }
  return { code: out, balanced: state === 'code' };
}

// 在源码中查找，返回 [{line, text}]
function findLines(src, re) {
  const out = [], lines = src.split(/\r?\n/);
  lines.forEach((t, i) => { if (re.test(t)) out.push({ line: i + 1, text: t.trim().slice(0, 120) }); });
  return out;
}

// ---------------------------------------------------------------- 收集文件

const htmlPath = path.join(root, 'index.html');
if (!fs.existsSync(htmlPath)) { console.error('缺少 index.html'); process.exit(1); }
const html = fs.readFileSync(htmlPath, 'utf8');
const srcDir = path.join(root, 'src');
const jsNames = fs.readdirSync(srcDir).filter(f => /\.js$/.test(f)).sort();

// ---------------------------------------------------------------- 包结构

if (!/^\s*<!DOCTYPE html>/i.test(html)) fail('index.html 缺少 <!DOCTYPE html>');

// zip 内禁止出现的垃圾
const junk = fs.readdirSync(srcDir).filter(f => !/\.js$/.test(f));
if (junk.length) fail('src/ 含非 .js 文件：' + junk.join(', '));

// ---------------------------------------------------------------- index.html

// 头部三件套
if (!/<html[^>]+lang=["']zh-CN["']/i.test(html)) fail('index.html 缺少 lang="zh-CN"');
if (!/<meta[^>]+charset=["']?utf-8/i.test(html)) fail('index.html 缺少 charset=UTF-8');

const vp = (html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i) || [''])[0];
for (const need of ['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover']) {
  if (!vp.toLowerCase().includes(need)) fail(`index.html viewport 缺少 ${need}`);
}

// CSP：脚本必须外置
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail('index.html 含内联 <script>（CSP 禁止 unsafe-inline）');
const inlineEv = findLines(html, /\son[a-z]+\s*=/i);
if (inlineEv.length) fail(`index.html 含行内事件处理器（第 ${inlineEv.map(x => x.line).join(', ')} 行）`);
if (/javascript:/i.test(html)) fail('index.html 含 javascript: URI');

// 经典脚本
if (/<script[^>]+type=["']module["']/i.test(html)) fail('index.html 含 type="module"（离线 zip 下 module 解析不可靠）');

// 结构性禁止项
if (/<base\b[^>]*href/i.test(html)) fail('index.html 含 <base href>（会破坏真机路径）');
if (/<iframe\b/i.test(html)) fail('index.html 含 <iframe>（规格禁止）');
if (/<object\b/i.test(html)) fail('index.html 含 <object>（规格禁止）');
if (/<meta[^>]+Content-Security-Policy/i.test(html)) fail('index.html 自建了 CSP meta（安全策略由容器统一管理）');

// 外链：先摘掉 xmlns 命名空间声明，它们不是资源加载
const htmlForUrl = html.replace(/xmlns(?::[a-z0-9]+)?\s*=\s*["'][^"']*["']/gi, '');
const htmlExt = findLines(htmlForUrl, /(?:src|href)\s*=\s*["'](?:https?:)?\/\/|["']https?:\/\//i);
if (htmlExt.length) fail(`index.html 含外部资源引用（第 ${htmlExt.map(x => x.line).join(', ')} 行）`);

// ---------------------------------------------------------------- 脚本引用一致性

const refs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1].replace(/^\.\//, ''));
if (!refs.length) fail('index.html 没有引入任何脚本');
for (const r of refs) {
  if (r.startsWith('/')) fail(`脚本引用用了绝对路径：${r}（须用 ./ 相对路径）`);
  if (!fs.existsSync(path.join(root, r))) fail(`脚本引用指向不存在的文件：${r}`);
}
for (const f of jsNames) {
  if (!refs.includes('src/' + f)) warn(`src/${f} 未被 index.html 引用，不会打进包`);
}

// ---------------------------------------------------------------- JS 内容

const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch（不联网）'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest（不联网）'],
  [/\bWebSocket\b/, 'WebSocket（不联网）'],
  [/\bEventSource\b/, 'EventSource（不联网）'],
  [/\bnavigator\s*\.\s*sendBeacon/, 'navigator.sendBeacon（不联网）'],
  [/\bnavigator\s*\.\s*geolocation/, 'navigator.geolocation（禁用）'],
  [/\bnavigator\s*\.\s*clipboard/, 'navigator.clipboard（禁用）'],
  [/\bnew\s+Worker\b/, 'new Worker（禁用）'],
  [/\bimportScripts\b/, 'importScripts（Worker 相关，禁用）'],
  [/\bnavigator\s*\.\s*serviceWorker\b/, 'serviceWorker（禁用）'],
  [/\bRTCPeerConnection\b|\bgetUserMedia\b|\bnavigator\s*\.\s*mediaDevices/, 'WebRTC / 媒体采集（禁用）'],
  [/\beval\s*\(/, 'eval（CSP 禁止）'],
  [/\bnew\s+Function\b/, 'new Function（CSP 禁止）'],
  [/\bwindow\s*\.\s*open\b/, 'window.open（禁用）'],
  [/(^|[^.\w])prompt\s*\(/, 'prompt（禁用，alert / confirm 可用）'],
  [/\brequire\s*\(|\bmodule\s*\.\s*exports\b|\bprocess\s*\.\s*env/, 'Node 专用 API（浏览器会报错）'],
];

for (const f of jsNames) {
  const raw = fs.readFileSync(path.join(srcDir, f), 'utf8');

  // 语法：编译不执行，纯语法校验
  try { new Function(raw); }
  catch (e) { fail(`src/${f} 语法错误：${e.message}`); }

  const { code, balanced } = stripComments(raw);
  if (!balanced) warn(`src/${f} 注释剥离可能不完整，禁用 API 扫描结果仅供参考`);

  for (const [re, label] of FORBIDDEN) {
    const hit = findLines(code, re);
    if (hit.length) fail(`src/${f} 使用了 ${label}（第 ${hit.map(x => x.line).join(', ')} 行）`);
  }

  // 经典脚本：不能有 import / export 语句
  const mod = findLines(code, /^\s*(import|export)\s/);
  if (mod.length) fail(`src/${f} 含 import/export 语句（第 ${mod.map(x => x.line).join(', ')} 行，须为经典脚本）`);

  // 顶层 await（离线加载下不可靠）
  const awa = findLines(code, /^\s*await\s/);
  if (awa.length) warn(`src/${f} 含可能的顶层 await（第 ${awa.map(x => x.line).join(', ')} 行）`);

  // 外链
  const ext = findLines(code.replace(/xmlns(?::[a-z0-9]+)?\s*=\s*["'][^"']*["']/gi, ''), /["'`]https?:\/\//i);
  if (ext.length) fail(`src/${f} 含外部 URL（第 ${ext.map(x => x.line).join(', ')} 行）`);
}

// ---------------------------------------------------------------- 报告

console.log('打包前自检（.skill/references/zip-artifact-spec.md §6）\n');
if (errs.length) {
  console.log('不合规：');
  errs.forEach(e => console.log('  ✗ ' + e));
  console.log('');
  console.error(`共 ${errs.length} 项不合规，已中止打包`);
  process.exit(1);
}
console.log('  ok  index.html 在 zip 根目录');
console.log('  ok  DOCTYPE / lang=zh-CN / charset / viewport 齐全');
console.log('  ok  脚本全部外置，无内联 script / 行内事件 / javascript: URI');
console.log('  ok  经典脚本：无 type="module"、无 import / export');
console.log('  ok  无 <base href> / <iframe> / <object> / 自建 CSP');
console.log('  ok  无外部资源引用（全包内相对路径）');
console.log(`  ok  禁用能力零残留（${FORBIDDEN.length} 项扫描）`);
console.log(`  ok  ${jsNames.length} 个脚本语法与引用一致：${jsNames.join(', ')}`);
warns.forEach(w => console.log('  !   ' + w));
console.log('');

// ---------------------------------------------------------------- 打包

fs.mkdirSync(path.dirname(outFile), { recursive: true });
const out = fs.createWriteStream(outFile);
const a = new ZipArchive({ zlib: { level: 9 } });
out.on('close', () => {
  const sz = fs.statSync(outFile).size;
  console.log(`dist/solar-voyager.zip  ${(sz / 1024).toFixed(1)} KB  (${(sz / HARD_LIMIT * 100).toFixed(1)}% of 10MB 上限)`);
  if (sz > HARD_LIMIT) {
    console.error('超过小红书小工具 10 MB 硬上限！');
    process.exit(1);
  }
  if (sz > SOFT_LIMIT) console.log('  !   超过 2 MB 建议值，加载体验会受影响');
  console.log('\n包内容：');
  console.log('  index.html');
  jsNames.forEach(f => console.log('  src/' + f));
});
a.on('error', e => { console.error(e); process.exit(1); });
a.pipe(out);
a.file(htmlPath, { name: 'index.html' });
jsNames.forEach(f => a.file(path.join(srcDir, f), { name: 'src/' + f }));
a.finalize();
