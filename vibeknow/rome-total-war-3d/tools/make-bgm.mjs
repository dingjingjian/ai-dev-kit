/* ============================================================================
 * make-bgm.mjs —— 把原始曲目做成可进小工具 zip 的 assets/audio/bgm.js
 *
 * 为什么必须重编码（而不是像 age-of-sail-3d 那样只做 MPEG 帧级裁剪）：
 *   ① 容器上传白名单不含任何音频扩展名（jpg/css/gif/svg/png/js/jpeg/json/html/woff2/webp/woff），
 *      音频只能以 base64 字符串藏进 .js；而容器 CSP 又禁 data:/blob: 媒体源，
 *      所以「包内音频文件 + <audio src>」这条路在容器里不存在，必须走 Web Audio 解码。
 *   ② 性能门禁：单条 Base64 解码后 ≤ 1 MiB（.skill/minitool-zip-builder/references/
 *      performance-budget.md §1）。而「超过 1 MiB 必须改成独立包内文件」在这里做不到（见 ①），
 *      所以只能把音频本身压到 1 MiB 以内。
 *   ③ 源文件是 320kbps CBR / 206.3s / 7.87MB —— 帧级裁剪只能留 26.2s，对一首慢速主题曲太短。
 *      重编码到 64kbps 单声道 22.05kHz 可以留 126s，于是有了这个工具。
 *
 * 循环点怎么定的（tools/analyze 过程见 README §背景音乐）：
 *   这首曲子**没有真正的重复段**（波形互相关最高只有 0.23），所以不是「找重复段」，
 *   而是「找织体最像、且接缝处相对安静的整段」：
 *     68s → 194s（126s）：8 频带包络相似度 0.951、接缝电平 0.069（低于全曲中位数 0.075）、
 *     波形互相关 0.165（全曲最高档）。对照：曲头对曲尾只有 0.394。
 *   重编码后 buffer 就是这一段（0 → 126s），app 侧只需在首尾之间做交叠淡化。
 *
 * 依赖（仅本工具需要，运行时代码零依赖）：
 *   cd tools && npm i mpg123-decoder @breezystack/lamejs
 * 用法：
 *   node tools/make-bgm.mjs "原始文件.mp3"
 *   node tools/make-bgm.mjs "原始文件.mp3" --a 68 --b 194 --kbps 64
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const SRC = argv.find((a) => !a.startsWith('--') && /\.(mp3|m4a|aac|wav)$/i.test(a));
const A = Number(argVal('--a') || 68);
const B = Number(argVal('--b') || 194);
const KBPS = Number(argVal('--kbps') || 64);
const OUT_MP3 = path.join(root, 'assets/audio/bgm.mp3');
const OUT_JS = path.join(root, 'assets/audio/bgm.js');
const BUDGET = 1048576;          // 单条 base64 解码后 ≤ 1 MiB
const TARGET_SR = 22050;

let MPEGDecoder, Mp3Encoder;
try {
  ({ MPEGDecoder } = await import('mpg123-decoder'));
  /* lamejs 的 CJS 入口是 IIFE 包，require 出来是空对象；要用 ESM 入口（具名导出 Mp3Encoder） */
  const lame = await import('@breezystack/lamejs');
  Mp3Encoder = lame.Mp3Encoder || (lame.default && lame.default.Mp3Encoder);
  if (typeof Mp3Encoder !== 'function') throw new Error('lamejs 未导出 Mp3Encoder');
} catch (e) {
  console.error('缺少依赖。请先执行：\n  cd tools && npm i mpg123-decoder @breezystack/lamejs\n');
  console.error(String(e && e.message));
  process.exit(1);
}
if (!SRC) {
  console.error('用法：node tools/make-bgm.mjs "原始文件.mp3" [--a 68] [--b 194] [--kbps 64]');
  process.exit(1);
}

/* ---------- 1. 解码 ---------- */
const dec = new MPEGDecoder();
await dec.ready;
const res = dec.decode(new Uint8Array(fs.readFileSync(SRC)));
const sr = res.sampleRate, n = res.samplesDecoded;
const L = res.channelData[0], R = res.channelData[1] || res.channelData[0];
console.log('源文件  : ' + SRC);
console.log('  ' + (n / sr).toFixed(1) + 's · ' + sr + 'Hz · ' + res.channelData.length + 'ch · ' + (fs.statSync(SRC).size / 1048576).toFixed(2) + ' MB');

/* ---------- 2. 取乐句 + 降为单声道 ---------- */
const i0 = Math.round(A * sr), i1 = Math.min(n, Math.round(B * sr));
const seg = new Float32Array(i1 - i0);
for (let i = 0; i < seg.length; i++) seg[i] = (L[i0 + i] + R[i0 + i]) * 0.5;
console.log('取乐句  : ' + A + 's → ' + B + 's（' + (seg.length / sr).toFixed(1) + 's）· 单声道');

/* ---------- 3. 降采样到 22.05kHz（31 抽头 Hamming 窗 sinc 低通 + 2 倍抽取）---------- */
function decimate2(x) {
  const taps = 31, fc = 0.25;              /* 相对原采样率的归一化截止：0.25 → 11.025kHz */
  const h = new Float64Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const m = i - (taps - 1) / 2;
    const s = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1));
    h[i] = s * w; sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  const outLen = Math.floor((x.length - taps) / 2), out = new Float32Array(outLen);
  for (let k = 0; k < outLen; k++) {
    let acc = 0; const base = k * 2;
    for (let i = 0; i < taps; i++) acc += x[base + i] * h[i];
    out[k] = acc;
  }
  return out;
}
const mono = decimate2(seg);
console.log('重采样  : ' + sr + 'Hz → ' + TARGET_SR + 'Hz（低通 11kHz 后 2 倍抽取）');

/* ---------- 4. 编码 ---------- */
const enc = new Mp3Encoder(1, TARGET_SR, KBPS);
const CH = 1152 * 8, chunks = [], ib = new Int16Array(CH);
for (let i = 0; i < mono.length; i += CH) {
  const c = Math.min(CH, mono.length - i), v = ib.subarray(0, c);
  for (let k = 0; k < c; k++) {
    let s = mono[i + k];
    s = s < -1 ? -1 : s > 1 ? 1 : s;
    v[k] = s < 0 ? s * 32768 : s * 32767;
  }
  const d = enc.encodeBuffer(v);
  if (d.length) chunks.push(Buffer.from(d.buffer, d.byteOffset, d.length));
}
const tail = enc.flush();
if (tail.length) chunks.push(Buffer.from(tail.buffer, tail.byteOffset, tail.length));
const mp3 = Buffer.concat(chunks);
fs.mkdirSync(path.dirname(OUT_MP3), { recursive: true });
fs.writeFileSync(OUT_MP3, mp3);

/* ---------- 5. 输出 base64 ---------- */
const b64 = mp3.toString('base64');
const header =
  '/* 由 tools/make-bgm.mjs 生成，请勿手改。\n' +
  ' * 源：' + path.basename(SRC) + '\n' +
  ' * 本文件：截取 ' + A + 's→' + B + 's 这一段（' + (mp3.length ? (seg.length / sr).toFixed(1) : 0) + 's）· ' +
  '64kbps 单声道 22.05kHz · ' + (mp3.length / 1024).toFixed(0) + ' KB\n' +
  ' * 为什么要 base64：容器上传白名单不收音频扩展名，且 CSP 禁 data:/blob: 媒体源，\n' +
  ' * 音频只能以字符串形式藏在 .js 里，运行时由 app.js 解成 ArrayBuffer 交给 Web Audio 播放。\n' +
  ' * 换曲目：换原始 mp3 后重跑 node tools/make-bgm.mjs "原始文件.mp3" */\n';
fs.writeFileSync(OUT_JS, header + 'window.RTW3D_BGM="' + b64 + '";\n');

/* ---------- 6. 核对 ---------- */
const js = fs.statSync(OUT_JS).size;
console.log('');
console.log('输出    : assets/audio/bgm.mp3 · ' + (mp3.length / 1024).toFixed(0) + ' KB');
console.log('          assets/audio/bgm.js  · ' + (js / 1048576).toFixed(2) + ' MB（base64 字符串）');
console.log('');
console.log('门禁核对（performance-budget.md §1）');
console.log('  单条 Base64 解码后 ≤ 1 MiB : ' + (mp3.length <= BUDGET
  ? '✅ ' + (mp3.length / 1048576).toFixed(3) + ' MiB（余量 ' + ((BUDGET - mp3.length) / 1024).toFixed(0) + ' KB）'
  : '❌ ' + (mp3.length / 1048576).toFixed(3) + ' MiB —— 超出，请降 --kbps 或缩短 --a/--b'));
console.log('  单个 .js ≤ 2 MiB           : ' + (js <= 2097152 ? '✅' : '❌'));
