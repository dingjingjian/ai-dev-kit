/* ============================================================================
 * make-bgm.mjs —— 把原始曲目做成可进小工具 zip 的 assets/audio/bgm.js
 *
 * 为什么必须走 base64 藏进 .js（与 vibeknow/jurassic-park-3d 同一结论）：
 *   ① 容器上传白名单只有 jpg / css / gif / svg / png / js / jpeg / json / html /
 *      woff2 / webp / woff —— **不含任何音频扩展名**（mp3 会被上传页直接打回）；
 *   ② 容器 CSP 又明确「<audio> / <video> 只允许包内媒体文件，禁 data:/blob: 媒体源」。
 *   两条叠加 ＝「包内音频文件 + <audio src>」这条路在容器里根本不存在。
 *   所以音频只能以 base64 字符串藏在 .js（白名单类型）里，运行时由 main.js
 *   atob → ArrayBuffer → WebAudio.decodeAudioData() 播放，全程不产生任何 URL。
 *
 * 为什么是 64kbps 单声道 22.05kHz：
 *   性能门禁（.skill/minitool-zip-builder/references/performance-budget.md §1）
 *   要求单条 Base64 解码后 ≤ 1 MiB；而 ① 决定了「超过 1 MiB 就改成包内独立文件」
 *   这条退路不存在，只能把音频本身压进门禁以内。
 *
 * 依赖（仅本工具需要，运行时代码零依赖）：
 *   cd _dev/audio && npm i mpg123-decoder @breezystack/lamejs
 * 用法：
 *   node _dev/audio/make-bgm.mjs "原始文件.mp3"                 # 自动选段（--auto）
 *   node _dev/audio/make-bgm.mjs "原始文件.mp3" --a 0 --b 128    # 手动指定取段
 *   node _dev/audio/make-bgm.mjs "原始文件.mp3" --probe          # 只看源文件参数，不产出
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const argVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const SRC = argv.find((a) => !a.startsWith('--') && /\.(mp3|m4a|aac|wav)$/i.test(a));
const PROBE = argv.includes('--probe');
const KBPS = Number(argVal('--kbps') || 64);
const OUT_MP3 = path.join(root, 'assets/audio/bgm.mp3');
const OUT_JS = path.join(root, 'assets/audio/bgm.js');
const BUDGET = 1048576;          /* 单条 base64 解码后 ≤ 1 MiB */
const TARGET_SR = 22050;

let MPEGDecoder, Mp3Encoder;
try {
  ({ MPEGDecoder } = await import('mpg123-decoder'));
  /* lamejs 的 CJS 入口是 IIFE 包，require 出来是空对象；要用 ESM 入口（具名导出 Mp3Encoder） */
  const lame = await import('@breezystack/lamejs');
  Mp3Encoder = lame.Mp3Encoder || (lame.default && lame.default.Mp3Encoder);
  if (typeof Mp3Encoder !== 'function') throw new Error('lamejs 未导出 Mp3Encoder');
} catch (e) {
  console.error('缺少依赖。请先执行：\n  cd _dev/audio && npm i mpg123-decoder @breezystack/lamejs\n');
  console.error(String(e && e.message));
  process.exit(1);
}
if (!SRC) {
  console.error('用法：node _dev/audio/make-bgm.mjs "原始文件.mp3" [--a 0] [--b 128] [--kbps 64] [--probe]');
  process.exit(1);
}

/* ---------- 1. 解码 ---------- */
const dec = new MPEGDecoder();
await dec.ready;
const res = dec.decode(new Uint8Array(fs.readFileSync(SRC)));
const sr = res.sampleRate, n = res.samplesDecoded;
const L = res.channelData[0], R = res.channelData[1] || res.channelData[0];
const totalSec = n / sr;
console.log('源文件  : ' + path.basename(SRC));
console.log('  ' + totalSec.toFixed(1) + 's · ' + sr + 'Hz · ' + res.channelData.length + 'ch · ' +
            (fs.statSync(SRC).size / 1048576).toFixed(2) + ' MB');
if (PROBE) {
  /* 按码率反推：这段时长在目标码率下会不会超门禁 */
  console.log('  ' + KBPS + 'kbps 单声道下约 ' + (totalSec * KBPS * 1000 / 8 / 1048576).toFixed(2) +
              ' MiB（门禁 1 MiB）→ 单遍最长约 ' +
              (BUDGET * 8 / (KBPS * 1000)).toFixed(0) + 's');
  process.exit(0);
}

const A0 = Number(argVal('--a'));
const B0 = Number(argVal('--b'));
const MAX_SEC = BUDGET * 8 / (KBPS * 1000);       /* 门禁允许的单遍最长秒数 */

/* ---------- 1.5 自动选段（默认）----------
   判据与 jurassic-park-3d 的 analyze-bgm.mjs 同一思路，但只取两个可量化的维度：
     ① 整段平均能量（BGM 要「有东西在响」，不能挑一段太安静的）；
     ② 接缝处安静程度（首尾各 0.6s 的最大电平越低，交叠淡化时越听不出断点）。
   score = 平均能量 − 2.0 × 接缝电平，滑窗 1s 取最高。 */
function envelope(step) {
  const out = [];
  for (let i = 0; i + step <= n; i += step) {
    let acc = 0;
    for (let k = 0; k < step; k++) { const v = (L[i + k] + R[i + k]) * 0.5; acc += v * v; }
    out.push(Math.sqrt(acc / step));
  }
  return out;
}
function autoPick() {
  const STEP = Math.round(sr * 0.05);             /* 50ms 一帧 */
  const env = envelope(STEP), fps = sr / STEP;
  const TMAX = Math.min(Math.floor(MAX_SEC - 6), Math.floor(totalSec - 4));   /* 留 6s 门禁余量 */
  const M = Math.round(0.6 * fps);
  const cands = [];
  /* 长度在 105s → 门禁上限之间试几档：把接缝权重给足，宁可短一点也要落在安静处 */
  for (let T = TMAX; T >= 105; T -= 5) {
    const W = Math.round(T * fps);
    for (let s = 0; s + W <= env.length; s += Math.round(fps)) {
      let e = 0;
      for (let i = s; i < s + W; i++) e += env[i];
      e /= W;
      let seam = 0;
      for (let i = s; i < s + M; i++) seam = Math.max(seam, env[i]);
      for (let i = s + W - M; i < s + W; i++) seam = Math.max(seam, env[i]);
      cands.push({ s: s, W: W, t: T, e: e, seam: seam, score: e - 3.0 * seam });
    }
  }
  cands.sort((x, y) => y.score - x.score);
  console.log('自动选段: 长度 ' + TMAX + 's（门禁单遍上限 ' + MAX_SEC.toFixed(0) + 's）内逐档试 · 候选 ' + cands.length + ' 个');
  for (let i = 0; i < Math.min(3, cands.length); i++) {
    const c = cands[i];
    console.log('  #' + (i + 1) + '  ' + (c.s / fps).toFixed(0) + 's → ' +
                ((c.s + c.W) / fps).toFixed(0) + 's（' + c.t + 's）· 平均能量 ' + c.e.toFixed(4) +
                ' · 接缝电平 ' + c.seam.toFixed(4) + ' · 得分 ' + c.score.toFixed(4));
  }
  const best = cands[0];
  return { a: +(best.s / fps).toFixed(1), b: +((best.s + best.W) / fps).toFixed(1) };
}

let A, B;
if (A0 || B0) {
  A = A0 || 0;
  B = B0 || totalSec;
} else {
  const pick = autoPick();
  A = pick.a; B = pick.b;
  console.log('选定    : ' + A + 's → ' + B + 's（' + (B - A).toFixed(1) + 's）');
}

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
  '/* 由 _dev/audio/make-bgm.mjs 生成，请勿手改。\n' +
  ' * 源：' + path.basename(SRC) + '\n' +
  ' * 本文件：' + path.basename(SRC) + ' 的 ' + A + 's→' + B + 's 这一段（' +
  (seg.length / sr).toFixed(1) + 's）· ' + KBPS + 'kbps 单声道 22.05kHz · ' +
  (mp3.length / 1024).toFixed(0) + ' KB\n' +
  ' * 为什么要 base64：容器上传白名单不收音频扩展名，且 CSP 禁 data:/blob: 媒体源，\n' +
  ' * 音频只能以字符串形式藏在 .js 里，运行时由 main.js 解成 ArrayBuffer 交给 Web Audio 播放。\n' +
  ' * 换曲目：换原始 mp3 后重跑 node _dev/audio/make-bgm.mjs "原始文件.mp3"\n' +
  ' * ⚠️ 版权：见 docs/背景音乐需求.md §6 —— 上线前必须换曲或取得授权。 */\n';
fs.writeFileSync(OUT_JS, header + 'window.TT_BGM="' + b64 + '";\n');

/* ---------- 6. 核对 ---------- */
const js = fs.statSync(OUT_JS).size;
console.log('');
console.log('输出    : assets/audio/bgm.mp3 · ' + (mp3.length / 1024).toFixed(0) + ' KB（构建输入，不进 zip）');
console.log('          assets/audio/bgm.js  · ' + (js / 1048576).toFixed(2) + ' MB（base64 字符串）');
console.log('');
console.log('门禁核对（performance-budget.md §1）');
console.log('  单条 Base64 解码后 ≤ 1 MiB : ' + (mp3.length <= BUDGET
  ? '✅ ' + (mp3.length / 1048576).toFixed(3) + ' MiB（余量 ' + ((BUDGET - mp3.length) / 1024).toFixed(0) + ' KB）'
  : '❌ ' + (mp3.length / 1048576).toFixed(3) + ' MiB —— 超出，请降 --kbps 或缩短 --a/--b'));
console.log('  单个 .js ≤ 2 MiB           : ' + (js <= 2097152 ? '✅' : '❌'));
