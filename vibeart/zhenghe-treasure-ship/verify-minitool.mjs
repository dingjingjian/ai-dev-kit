#!/usr/bin/env node
/**
 * 逐条对照 minitool-zip-builder v1.6.0 规范校验产物目录。
 *
 * 用法：node verify-minitool.mjs dist
 *
 * 覆盖 zip-artifact-spec.md 的自检清单 + performance-budget.md 的体积门禁。
 * 这是「静态核对」，不做语义运行，故不能替代真机实测。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] || 'dist';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.isAbsolute(TARGET) ? TARGET : path.join(ROOT, TARGET);

const results = [];
const pass = (id, msg) => results.push({ ok: true, id, msg });
const fail = (id, msg) => results.push({ ok: false, id, msg });

if (!fs.existsSync(DIR)) {
  console.error('目录不存在：' + DIR);
  process.exit(2);
}
if (!fs.statSync(DIR).isDirectory()) {
  console.error('请传入解压后的目录（而非 zip 本身）以完成内容级校验：' + DIR);
  process.exit(2);
}

/** 递归列出所有文件（相对路径，posix 分隔） */
function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(abs, rel, out);
    else out.push({ rel, abs, ext: path.extname(e.name).toLowerCase(), size: fs.statSync(abs).size });
  }
  return out;
}
const files = walk(DIR, '', []);

// ── §1 包结构 ─────────────────────────────────────────────
const entry = files.find((f) => f.rel === 'index.html');
entry ? pass('S1', 'index.html 位于产物根目录') : fail('S1', 'index.html 不在产物根目录（不可改名、不可放入子目录）');

// 禁止项
const BANNED_DIR = /(^|\/)(node_modules|\.git)(\/|$)/;
const BANNED_FILE = /(\.map$|(^|\/)\.DS_Store$|vite\.config\.|webpack\.config\.|rollup\.config\.)/;
const banned = files.filter((f) => BANNED_DIR.test(f.rel) || BANNED_FILE.test(f.rel));
banned.length === 0
  ? pass('S2', '无 node_modules / .git / *.map / 构建配置等开发垃圾')
  : fail('S2', '存在禁止文件：' + banned.map((f) => f.rel).join(', '));

// 仅允许类型
const ALLOW = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json']);
const badExt = files.filter((f) => !ALLOW.has(f.ext));
badExt.length === 0
  ? pass('S3', '全部文件类型在允许清单内')
  : fail('S3', '存在不允许的类型：' + badExt.map((f) => f.rel).join(', '));

// 有且只有一个 index.html
const htmls = files.filter((f) => f.ext === '.html');
htmls.length === 1
  ? pass('S4', '有且只有一个 .html 入口（单页）')
  : fail('S4', 'html 文件数为 ' + htmls.length + '：' + htmls.map((f) => f.rel).join(', '));

// ── §4 引用规则（扫源码）─────────────────────────────────
const textFiles = files.filter((f) => ['.html', '.css', '.js', '.json'].includes(f.ext));
let absolutePath = [];
let externalRef = [];
let inlineScript = [];
let inlineEvent = [];
let jsUri = [];
let evalUse = [];
let moduleType = [];
let esmSyntax = [];
let baseTag = [];
let iframeTag = [];
let cspMeta = [];
let bannedApi = [];

// 被禁 / 需检测的端能力（device-capabilities.md 扫描清单）
const BANNED_API = [
  ['fetch(', '网络请求 fetch'],
  ['XMLHttpRequest', '网络请求 XMLHttpRequest'],
  ['navigator.geolocation', '定位'],
  ['navigator.clipboard', '剪贴板'],
  ['localStorage', 'Web Storage（容器内不可用或受限）'],
  ['sessionStorage', 'Web Storage（容器内不可用或受限）'],
  ['new Worker', 'Web Worker'],
  ['RTCPeerConnection', 'WebRTC'],
  ['DeviceOrientationEvent', '传感器'],
  ['DeviceMotionEvent', '传感器'],
  ['WebAssembly', 'WebAssembly'],
  ['indexedDB', 'IndexedDB'],
];

for (const f of textFiles) {
  const src = fs.readFileSync(f.abs, 'utf8');
  const isHtml = f.ext === '.html';
  const isJs = f.ext === '.js';

  // 绝对路径引用 / 外部域名
  const refs = src.match(/(?:src|href)\s*=\s*["']([^"']+)["']/g) || [];
  for (const r of refs) {
    const v = (r.match(/["']([^"']+)["']/) || [])[1] || '';
    if (/^(https?:)?\/\//.test(v)) externalRef.push(f.rel + ' → ' + v);
    else if (v.startsWith('/')) absolutePath.push(f.rel + ' → ' + v);
  }
  // CSS url()
  const urls = src.match(/url\(\s*["']?([^"')]+)["']?\s*\)/g) || [];
  for (const u of urls) {
    const v = (u.match(/url\(\s*["']?([^"')]+)["']?\s*\)/) || [])[1] || '';
    if (/^(https?:)?\/\//.test(v)) externalRef.push(f.rel + ' → url(' + v + ')');
    else if (v.startsWith('/')) absolutePath.push(f.rel + ' → url(' + v + ')');
  }

  if (isHtml) {
    // 内联 <script>（无 src 的 script 标签）
    const scripts = src.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
    for (const s of scripts) {
      if (!/\bsrc\s*=/i.test(s)) inlineScript.push(f.rel);
      if (/type\s*=\s*["']module["']/i.test(s)) moduleType.push(f.rel);
    }
    if (/\son[a-z]+\s*=\s*["']/i.test(src)) inlineEvent.push(f.rel);
    if (/javascript:/i.test(src)) jsUri.push(f.rel);
    if (/<base\b/i.test(src)) baseTag.push(f.rel);
    if (/<(iframe|object|embed)\b/i.test(src)) iframeTag.push(f.rel);
    if (/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(src)) cspMeta.push(f.rel);
    if (!/viewport-fit=cover/.test(src)) fail('S13', 'viewport 缺少 viewport-fit=cover');
  }

  if (isJs || isHtml) {
    if (/\beval\s*\(/.test(src)) evalUse.push(f.rel);
    if (/new\s+Function\s*\(/.test(src)) evalUse.push(f.rel);
  }
  if (isJs) {
    if (/^\s*(import|export)\s/m.test(src)) esmSyntax.push(f.rel);
  }

  for (const [needle, label] of BANNED_API) {
    if (src.indexOf(needle) !== -1) bannedApi.push(f.rel + ' → ' + label);
  }
}

const report = (arr, id, okMsg, failMsg) =>
  arr.length === 0 ? pass(id, okMsg) : fail(id, failMsg + '：' + [...new Set(arr)].join(', '));

report(absolutePath, 'S5', '全部资源为相对路径', '存在绝对路径引用');
report(externalRef, 'S6', '无任何外部域名引用（已全打包）', '存在外部资源引用');
report(inlineScript, 'S7', '无内联 <script>（脚本已外置）', '存在内联 <script>');
report(inlineEvent, 'S8', '无 onclick 等行内事件', '存在行内事件属性');
report(jsUri, 'S9', '无 javascript: URI', '存在 javascript: URI');
report(evalUse, 'S10', '无 eval / new Function', '存在 eval / new Function');
report(moduleType, 'S11', '无 type="module"（经典脚本）', '存在 type="module"');
report(esmSyntax, 'S12', 'JS 内无 import / export', '存在 ESM 语法');
report(baseTag, 'S14', '无 <base href>', '存在 <base href>');
report(iframeTag, 'S15', '无 iframe / object / embed', '存在 iframe / object / embed');
report(cspMeta, 'S16', '无自建 CSP meta', '存在自建 CSP meta');

// Base64 体积门禁（§3 单个 Base64 ≤ 1 MiB，>100 KiB 提示）
let bigB64 = [];
let warnB64 = [];
for (const f of textFiles) {
  const src = fs.readFileSync(f.abs, 'utf8');
  const m = src.match(/[A-Za-z0-9+/=]{2000,}/g) || [];
  for (const s of m) {
    const bytes = Math.floor(s.length * 3 / 4);
    if (bytes > 1024 * 1024) bigB64.push(f.rel + '(' + (bytes / 1024 / 1024).toFixed(2) + ' MiB)');
    else if (bytes > 100 * 1024) warnB64.push(f.rel + '(' + (bytes / 1024).toFixed(0) + ' KiB)');
  }
}
bigB64.length === 0
  ? pass('B1', '无超过 1 MiB 的内联 Base64')
  : fail('B1', '存在超限内联 Base64（须改为独立包内文件）：' + bigB64.join(', '));
if (warnB64.length) results.push({ ok: true, warn: true, id: 'B2', msg: '内联 Base64 超过 100 KiB，建议改独立文件：' + [...new Set(warnB64)].join(', ') });
else pass('B2', '内联 Base64 均在 100 KiB 以内');

// ── §1 体积门禁 ──────────────────────────────────────────
const total = files.reduce((a, f) => a + f.size, 0);
const MB = 1024 * 1024;
total <= 2 * MB ? pass('V1', '产物总体积 ' + (total / MB).toFixed(2) + ' MiB（≤ 建议值 2 MiB）')
  : total <= 10 * MB ? results.push({ ok: true, warn: true, id: 'V1', msg: '产物总体积 ' + (total / MB).toFixed(2) + ' MiB（超建议 2 MiB，未超上限 10 MiB）' })
    : fail('V1', '产物总体积 ' + (total / MB).toFixed(2) + ' MiB，超过 10 MiB 上限');

const bigText = files.filter((f) => ['.html', '.css', '.js', '.json'].includes(f.ext) && f.size > 2 * MB);
bigText.length === 0
  ? pass('V2', '单个文本文件均未超 2 MiB')
  : results.push({ ok: true, warn: true, id: 'V2', msg: '文本文件超 2 MiB：' + bigText.map((f) => f.rel).join(', ') });

const textTotal = files.filter((f) => ['.html', '.css', '.js', '.json'].includes(f.ext)).reduce((a, f) => a + f.size, 0);
textTotal <= 5 * MB
  ? pass('V3', '文本文件合计 ' + (textTotal / 1024).toFixed(0) + ' KiB（≤ 5 MiB）')
  : results.push({ ok: true, warn: true, id: 'V3', msg: '文本文件合计 ' + (textTotal / MB).toFixed(2) + ' MiB，超 5 MiB' });

// ── JS 兼容基线（Chrome 61 / ES2017）─────────────────────
const ES2018 = [
  [/\?\?/, '空值合并 ?? （ES2020）'],
  [/\?\./, '可选链 ?. （ES2020）'],
  [/\bBigInt\b/, 'BigInt（ES2020）'],
  [/\bglobalThis\b/, 'globalThis（ES2020）'],
  [/\.replaceAll\s*\(/, 'String.replaceAll（ES2021）'],
  [/\.at\s*\(\s*-/, 'Array.at 负索引（ES2022）'],
  [/Object\.fromEntries/, 'Object.fromEntries（ES2019）'],
  [/\.flatMap\s*\(/, 'Array.flatMap（ES2019）'],
  [/\.flat\s*\(/, 'Array.flat（ES2019）'],
];
let modernJs = [];
for (const f of textFiles.filter((x) => x.ext === '.js')) {
  const src = fs.readFileSync(f.abs, 'utf8');
  for (const [re, label] of ES2018) if (re.test(src)) modernJs.push(f.rel + ' → ' + label);
}
modernJs.length === 0
  ? pass('J1', '未检出超出 ES2017（Chrome 61 基线）的语法')
  : fail('J1', '检出超出 ES2017 的语法，需转译：' + [...new Set(modernJs)].join(', '));

// ── 输出 ─────────────────────────────────────────────────
console.log('\n产物目录：' + DIR + '\n');
let nOk = 0, nFail = 0, nWarn = 0;
for (const r of results) {
  const tag = !r.ok ? 'FAIL' : r.warn ? 'WARN' : ' OK ';
  console.log('  [' + tag + '] ' + r.id + '  ' + r.msg);
  if (!r.ok) nFail++; else if (r.warn) nWarn++; else nOk++;
}
console.log('\n共 ' + results.length + ' 项：' + nOk + ' 通过 / ' + nWarn + ' 警告 / ' + nFail + ' 失败');
if (nFail) {
  console.log('\n未通过规范校验。注意：通过本脚本仅表示「静态合规」，不代表真机性能已实测。');
  process.exit(1);
}
console.log('\n静态合规校验通过。注意：性能未实测，需真机确认帧率与降级路径。');
