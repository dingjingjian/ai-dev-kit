// 小工具 zip 构建脚本：把 molecule.html 拆分为符合容器 CSP 的离线包
// 用法: node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(root, 'molecule.html'), 'utf8');
const lines = src.split(/\r?\n/);

const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });

// ---- 1. 提取 CSS（<style> ... </style>）----
const styleStart = lines.findIndex(l => l.trim() === '<style>');
const styleEnd = lines.findIndex(l => l.trim() === '</style>');
if (styleStart < 0 || styleEnd < 0) throw new Error('未找到 <style> 块');
const css = lines.slice(styleStart + 1, styleEnd).join('\n');

// ---- 2. 提取三个 <script> 块 ----
const scriptRanges = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('<script>')) {
    let end = i;
    while (end < lines.length && !lines[end].includes('</script>')) end++;
    scriptRanges.push([i, end]);
  }
}
if (scriptRanges.length !== 3) throw new Error(`期望 3 个内联 script，实际 ${scriptRanges.length}`);

function extract([s, e]) {
  if (s === e) {
    // 单行 script
    return lines[s].replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
  }
  const first = lines[s].replace(/^<script>/, '');
  const last = lines[e].replace(/<\/script>\s*$/, '');
  return [first, ...lines.slice(s + 1, e), last].join('\n');
}

let three = extract(scriptRanges[0]);
const app = extract(scriptRanges[1]);
const headerSync = extract(scriptRanges[2]);

// ---- 3. 修补 three.js：清除容器禁用能力残留 ----
const patches = [
  {
    name: 'FileLoader XMLHttpRequest -> 抛错桩',
    from: 'o=new XMLHttpRequest,o.open("GET",t,!0)',
    to: 'o=new __MINITOOL_NO_NETWORK__("FileLoader"),o.open("GET",t,!0)',
  },
  {
    name: 'ImageBitmapLoader fetch() -> rejected Promise',
    from: 'fetch(t,a).then((function(t){return t.blob()}))',
    to: 'Promise.reject(new Error("THREE.ImageBitmapLoader disabled: mini-tool container has no network")).then((function(t){return t.blob()}))',
  },
  {
    name: 'ImageBitmapLoader fetch 特性探测警告 -> 移除',
    from: ',"undefined"==typeof fetch&&console.warn("THREE.ImageBitmapLoader: fetch() not supported.")',
    to: '',
  },
];
for (const p of patches) {
  const n = three.split(p.from).length - 1;
  if (n !== 1) throw new Error(`补丁「${p.name}」命中 ${n} 次，期望 1 次`);
  three = three.replace(p.from, p.to);
}

// createElementNS(XHTML ns) -> createElement，去掉 http:// 外链形态的误报
const nsFrom = 'document.createElementNS("http://www.w3.org/1999/xhtml",';
const nsCount = three.split(nsFrom).length - 1;
if (nsCount !== 4) throw new Error(`createElementNS 命中 ${nsCount} 次，期望 4 次`);
three = three.split(nsFrom).join('document.createElement(');

const prelude =
  '/* mini-tool 容器补丁：容器不联网，FileLoader 的 XHR 通道以抛错桩替代 */\n' +
  'function __MINITOOL_NO_NETWORK__(who){throw new Error("THREE."+who+" disabled: mini-tool container has no network");}\n';
three = prelude + three;

// ---- 4. 落盘 ----
fs.writeFileSync(path.join(assets, 'style.css'), css + '\n');
fs.writeFileSync(path.join(assets, 'three.min.js'), three + '\n');
fs.writeFileSync(path.join(assets, 'app.js'), app.replace(/^\n/, '') + '\n');
fs.writeFileSync(path.join(assets, 'header-sync.js'), headerSync + '\n');

console.log('提取完成：');
for (const f of ['style.css', 'three.min.js', 'app.js', 'header-sync.js']) {
  console.log(`  assets/${f}  ${fs.statSync(path.join(assets, f)).size} bytes`);
}
