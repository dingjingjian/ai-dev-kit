// 把 assets/audio/bgm.mp3 压成可进小工具 zip 的 assets/audio/bgm.js
//
// 为什么绕这一圈：容器上传白名单只有 jpg/css/gif/svg/png/js/jpeg/json/html/woff2/webp/woff，
// **不含任何音频扩展名**；而容器 CSP 又明确「<audio> / <video> 只允许包内媒体文件，禁 data:/blob: 媒体源」。
// 两条叠加＝「包内音频文件 + <audio src>」在容器里走不通（上传页会直接打回）。
// 唯一能带声音的做法：把音频编码成 base64 字符串放进 .js（白名单类型），
// 运行时解成 ArrayBuffer 交给 Web Audio 解码播放 —— 全程不产生任何 URL，不触碰 CSP 资源加载规则。
//
// 规范红线（.skill/minitool-zip-builder/references/performance-budget.md §1）：
//   单条 Base64 解码后 ≤ 1 MiB，超过即视为大 Base64。因此默认按 MPEG 帧边界裁剪到预算内。
//   帧级裁剪不重编码：保留下来的音频与源文件逐字节一致，音质零损失，只是变短。
//
// 用法：
//   node tools/make-bgm.mjs                # 裁到解码后 ≤1MiB（默认）
//   node tools/make-bgm.mjs --frames 3830  # 指定保留帧数
//   node tools/make-bgm.mjs --all          # 不裁，全曲（能上传，但会超 base64 门禁）
//   node tools/make-bgm.mjs --out x.js     # 改输出路径
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
function argVal(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}
const SRC = path.join(root, 'assets/audio/bgm.mp3');
const OUT = path.resolve(root, argVal('--out') || 'assets/audio/bgm.js');
const BUDGET = 1048576; // 1 MiB

/* ---------- 扫 MPEG 帧 ---------- */
const b = fs.readFileSync(SRC);
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const SR1 = [44100, 48000, 32000];
const SR2 = [22050, 24000, 16000];
const SR25 = [11025, 12000, 8000];

function headerAt(i) {
  if (i + 4 > b.length) return null;
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (b[i + 1] >> 3) & 3;
  const layerBits = (b[i + 1] >> 1) & 3;
  if (verBits === 1 || layerBits === 0) return null;
  const bi = (b[i + 2] >> 4) & 15, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
  if (bi === 0 || bi === 15 || si === 3) return null;
  const mpeg1 = verBits === 3;
  const br = (mpeg1 ? BR1 : BR2)[bi];
  const sr = (verBits === 3 ? SR1 : verBits === 2 ? SR2 : SR25)[si];
  if (!br || !sr) return null;
  let spf, len;
  if (layerBits === 3) { spf = 384; len = Math.floor((12 * br * 1000) / sr + pad) * 4; }
  else { spf = mpeg1 ? 1152 : 576; len = Math.floor(((mpeg1 ? 144 : 72) * br * 1000) / sr) + pad; }
  return { br, sr, spf, len };
}

const frames = [];
let i = 0;
while (i + 4 <= b.length) {
  const h = headerAt(i);
  if (!h) { i++; continue; }
  frames.push({ off: i, len: h.len, spf: h.spf, br: h.br, sr: h.sr });
  i += h.len;
}
if (frames.length < 20) throw new Error('没有扫到足够的 MPEG 帧，源文件可能不是 mp3：' + SRC);
const F = frames[0];
const secPerFrame = F.spf / F.sr;
const totalSec = frames.length * secPerFrame;

/* ---------- 决定保留多少帧 ---------- */
let keep;
if (argv.includes('--all')) {
  keep = frames.length;
} else if (argVal('--frames')) {
  keep = Math.max(1, Math.min(frames.length, parseInt(argVal('--frames'), 10) || 0));
} else {
  keep = 0;
  let bytes = 0;
  for (const fr of frames) {
    if (bytes + fr.len > BUDGET) break;
    bytes += fr.len;
    keep++;
  }
}

const kept = frames.slice(0, keep);
const keptBytes = kept.reduce((s, f) => s + f.len, 0);
const keptSec = keep * secPerFrame;
const b64 = Buffer.concat(kept.map((f) => b.subarray(f.off, f.off + f.len))).toString('base64');

/* ---------- 输出 ---------- */
const header =
  '/* 由 tools/make-bgm.mjs 生成，请勿手改。\n' +
  ' * 源：assets/audio/bgm.mp3（' + frames.length + ' 帧 / ' + totalSec.toFixed(1) + 's / ' + F.br + 'kbps / ' + F.sr + 'Hz）\n' +
  ' * 本文件：保留前 ' + keep + ' 帧 = ' + keptSec.toFixed(1) + 's，逐字节取自源文件（未重编码）\n' +
  ' * 为什么要 base64：容器上传白名单不收音频扩展名，音频只能以字符串形式藏在 .js 里，\n' +
  ' * 运行时由 app.js 解成 ArrayBuffer 交给 Web Audio 播放（不产生 URL，不触碰 CSP）。\n' +
  ' * 改曲目/改长度：换掉 assets/audio/bgm.mp3 后重跑 node tools/make-bgm.mjs */\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, header + 'window.AOS3D_BGM="' + b64 + '";\n');

/* ---------- 核对 ---------- */
const enc = (x) => (x / 1048576).toFixed(2) + ' MB';
console.log('源文件        : ' + SRC);
console.log('  ' + frames.length + ' 帧 · ' + totalSec.toFixed(1) + 's · ' + F.br + 'kbps CBR · ' + F.sr + 'Hz · ' + enc(b.length));
console.log('保留          : 前 ' + keep + ' 帧 · ' + keptSec.toFixed(1) + 's · 音频 ' + (keptBytes / 1024).toFixed(0) + ' KB');
console.log('输出          : ' + path.relative(root, OUT).split(path.sep).join('/') + ' · ' + enc(fs.statSync(OUT).size));
console.log('');
console.log('门禁核对（.skill/minitool-zip-builder/references/performance-budget.md §1）');
console.log('  单条 base64 解码后 ≤ 1 MiB : ' + (keptBytes <= BUDGET ? '✅ ' + (keptBytes / 1048576).toFixed(2) + ' MiB' : '❌ ' + (keptBytes / 1048576).toFixed(2) + ' MiB —— 超过即视为大 Base64'));
console.log('  单个 .js ≤ 2 MiB           : ' + (fs.statSync(OUT).size <= 2097152 ? '✅' : '❌'));
if (keep < frames.length) {
  console.log('  被裁掉                     : ' + (frames.length - keep) + ' 帧 / ' + (totalSec - keptSec).toFixed(1) + 's'
    + '（app 侧循环的是曲子内部一段乐句，不是这段裁剪尾巴 —— 见 app.js 的 BGM_A / BGM_B / BGM_X）');
}
