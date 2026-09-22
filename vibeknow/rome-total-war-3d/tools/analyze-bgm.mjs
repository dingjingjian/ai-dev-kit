/* ============================================================================
 * analyze-bgm.mjs —— 从一首曲子里找出「适合做循环的乐句」
 *
 * 本文件在 age-of-sail-3d / jurassic-park-3d / rome-total-war-3d 三个项目的 tools/ 下
 * 各存一份、内容一致（每个项目都要独立可打包，所以工具随包各带一份；改一处请同步其余）。
 *
 * 为什么需要它：BGM 是一段音频反复循环，若直接 loop 整段，接缝上叠的是
 * 「曲尾」和「曲头」——两段不相干的音乐，重拍互相撞，听起来就是一个突兀的强拍。
 * 正确做法是循环曲子内部**一段完整乐句**。这个工具就负责把它找出来。
 *
 * 判据（按重要性）：
 *   ① 织体相似  8 频带对数能量包络在 2.5s 窗上的相关系数（越高＝两端越像同一段音乐）
 *   ② 接缝安静  接缝两侧 3s 的 RMS（越轻越好：轻奏处交叠最不容易被听出来）
 *   ③ 长度      越长越耐听，但要塞进「单条 base64 解码后 ≤ 1 MiB」的门禁
 *   ④ 整小节    节拍可靠时，两端都落在小节线上（重拍对齐，比织体相似更有效）
 *   ⑤ 波形相关  3s 窗、±120ms 时移的归一化互相关：若曲子真有重复段，这里会很高（>0.5）
 *
 * 用法：
 *   cd <项目> && npm --prefix tools i mpg123-decoder      # 只需一次
 *   node tools/analyze-bgm.mjs "原始音频.mp3"
 *   node tools/analyze-bgm.mjs "原始音频.mp3" --min 40 --max 130 --top 16
 *   node tools/analyze-bgm.mjs "原始音频.mp3" --data-end 101.15   # 音频只打前 101.15s 进包
 *   node tools/analyze-bgm.mjs "原始音频.mp3" --json > loop.json
 *
 * 注意：分析对象是**原始曲目**，不是 assets/audio/bgm.mp3（那可能已经是截过的产物）。
 * 若音频会被帧级裁剪（`make-bgm.mjs --frames/--kbps` 只带一部分进包），用 `--data-end`
 * 告诉工具"实际能播到哪"——否则会推荐一段根本播不到的乐句。
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const argVal = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const SRC = argv.find((a) => !a.startsWith('--') && /\.(mp3|m4a|aac|wav|ogg)$/i.test(a));
const MIN_LEN = Number(argVal('--min', 30));
const MAX_LEN = Number(argVal('--max', 140));
const TOPN = Number(argVal('--top', 12));
const STEP = Number(argVal('--step', 0.5));
const METER = argVal('--meter', 'auto');          /* auto | 4 | 3 */
const DATA_END_ARG = Number(argVal('--data-end', 0));   /* 实际进包能播到哪（0＝整段） */
const AS_JSON = has('--json');
const BUDGET = 1048576;                            /* 单条 base64 解码后 ≤ 1 MiB */
const STD_KBPS = [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 192, 224, 256, 320];

if (!SRC) {
  console.error('用法：node tools/analyze-bgm.mjs "原始音频.mp3" [--min 30] [--max 140] [--top 12] [--meter auto] [--json]');
  process.exit(1);
}

let MPEGDecoder;
try {
  ({ MPEGDecoder } = await import('mpg123-decoder'));
} catch (e) {
  console.error('缺少依赖。请先执行：\n  npm --prefix tools i mpg123-decoder\n');
  console.error(String(e && e.message));
  process.exit(1);
}

/* ---------- 解码 ---------- */
const dec = new MPEGDecoder();
await dec.ready;
const res = dec.decode(new Uint8Array(fs.readFileSync(SRC)));
const sr = res.sampleRate, n = res.samplesDecoded, dur = n / sr;
const L = res.channelData[0], R = res.channelData[1] || res.channelData[0];
const mono = new Float32Array(n);
for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) * 0.5;

/* ---------- 8 频带对数能量包络（FFT 1024 / 跳 512）---------- */
const N = 1024, HOP = 512, FD = HOP / sr;
function fft(re, im) {
  const nn = re.length;
  let i, j, k, m, mmax;
  for (i = 1, j = 0; i < nn; i++) {
    for (k = nn >> 1; (j ^= k) < k; k >>= 1);
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (m = 2; m <= nn; m <<= 1) {
    mmax = m >> 1;
    const th = (-2 * Math.PI) / m, wr = Math.cos(th), wi = Math.sin(th);
    for (i = 0; i < nn; i += m) {
      let cr = 1, ci = 0;
      for (j = 0; j < mmax; j++) {
        const p = i + j, q2 = p + mmax;
        const tr = cr * re[q2] - ci * im[q2], ti = cr * im[q2] + ci * re[q2];
        re[q2] = re[p] - tr; im[q2] = im[p] - ti; re[p] += tr; im[p] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const EDGES = [0, 120, 250, 500, 1000, 2000, 4000, 7000, 11000];
const bins = EDGES.map((f) => Math.max(1, Math.min(N >> 1, Math.round((f * N) / sr))));
const FR = Math.floor((n - N) / HOP) + 1;
const E = new Float32Array(FR * 8);
const re = new Float32Array(N), im = new Float32Array(N);
for (let t = 0; t < FR; t++) {
  const off = t * HOP;
  for (let i = 0; i < N; i++) {
    re[i] = mono[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    im[i] = 0;
  }
  fft(re, im);
  for (let b = 0; b < 8; b++) {
    let acc = 0;
    for (let i = bins[b]; i < bins[b + 1]; i++) acc += re[i] * re[i] + im[i] * im[i];
    E[t * 8 + b] = Math.log(1e-9 + acc);
  }
}

/* ---------- 起音包络 → 拍长 / 相位 / 置信度 ---------- */
const on = new Float32Array(FR);
for (let t = 1; t < FR; t++) {
  let s = 0;
  for (let b = 0; b < 8; b++) { const d = E[t * 8 + b] - E[(t - 1) * 8 + b]; if (d > 0) s += d; }
  on[t] = s;
}
const SMW = Math.max(1, Math.round(0.35 / FD));
const sm = new Float32Array(FR);
let acc = 0;
for (let t = 0; t < FR; t++) { acc += on[t]; if (t >= SMW) acc -= on[t - SMW]; sm[t] = acc / SMW; }
const od = new Float32Array(FR);
for (let t = 0; t < FR; t++) od[t] = Math.max(0, on[t] - sm[t]);

const lagMin = Math.max(2, Math.round(0.30 / FD)), lagMax = Math.round(1.60 / FD);
const acf = new Float32Array(lagMax + 2);
function acfAt(lag) { let s = 0, c = 0; for (let t = lag; t < FR; t++) { s += od[t] * od[t - lag]; c++; } return c ? s / c : 0; }
let acfSum = 0, acfCnt = 0;
for (let l = lagMin; l <= lagMax; l++) { acf[l] = acfAt(l); acfSum += acf[l]; acfCnt++; }
const acfMean = acfSum / acfCnt;
function comb(lag) { let s = 0; for (let k = 1; k <= 6; k++) { const l = Math.round(lag * k); if (l <= lagMax) s += acf[l] / k; } return s; }
let bestLag = lagMin, bestComb = -1;
for (let l = lagMin + 1; l < lagMax; l++) {
  if (acf[l] > acf[l - 1] && acf[l] >= acf[l + 1]) { const c = comb(l); if (c > bestComb) { bestComb = c; bestLag = l; } }
}
const P = bestLag * FD;                       /* 拍长（秒） */
const CONF = acfMean > 1e-12 ? acf[bestLag] / acfMean : 0;
const tempoOK = CONF >= 1.3;
let phase = 0;
{
  const bf = P / FD;
  let bv = -1;
  for (let k = 0; k < 64; k++) {
    const st = k * (bf / 64);
    let s = 0;
    for (let t = st; t < FR; t += bf) { const i = Math.round(t); s += od[i] + 0.5 * od[Math.max(0, i - 1)] + 0.5 * od[Math.min(FR - 1, i + 1)]; }
    if (s > bv) { bv = s; phase = st * FD; }
  }
}

/* ---------- 短窗包络相似度 / 电平 / 波形互相关 ---------- */
const WF = Math.max(4, Math.round(2.5 / FD));
function envSim(tA, tB) {
  const iA = Math.round(tA / FD), iB = Math.round(tB / FD);
  if (iB + WF >= FR || iA < 0) return -1;
  let s = 0, c = 0;
  for (let k = 0; k < WF; k++) {
    const a = iA + k, b = iB + k;
    let ma = 0, mb = 0, da = 0, db = 0, dot = 0;
    for (let d = 0; d < 8; d++) { ma += E[a * 8 + d]; mb += E[b * 8 + d]; }
    ma /= 8; mb /= 8;
    for (let d = 0; d < 8; d++) { const x = E[a * 8 + d] - ma, y = E[b * 8 + d] - mb; da += x * x; db += y * y; dot += x * y; }
    if (da > 1e-6 && db > 1e-6) { s += dot / Math.sqrt(da * db); c++; }
  }
  return c ? s / c : -1;
}
function rmsAt(t, win) {
  const i0 = Math.max(0, Math.min(n - 1, Math.round(t * sr))), i1 = Math.min(n, i0 + Math.round(win * sr));
  let s = 0, c = 0;
  for (let i = i0; i < i1; i++) { s += mono[i] * mono[i]; c++; }
  return c ? Math.sqrt(s / c) : 0;
}
/* 波形互相关：降采样到 ~7kHz 再算（±100ms 时移搜索），判"是否为真正的同一段" */
const K = Math.max(1, Math.round(sr / 8000));
const DS = sr / K, dn = Math.floor(n / K);
const dm = new Float32Array(dn);
for (let i = 0; i < dn; i++) { let s = 0; for (let k = 0; k < K; k++) s += mono[i * K + k]; dm[i] = s / K; }
function pcmCorr(tA, tB, winSec, lagMs) {
  const W = Math.round(winSec * DS), iA = Math.round(tA * DS), iB = Math.round(tB * DS), maxLag = Math.round((lagMs / 1000) * DS);
  let best = -2, bl = 0;
  for (let lag = -maxLag; lag <= maxLag; lag += 4) {
    const jB = iB + lag;
    if (iA + W >= dn || jB < 0 || jB + W >= dn) continue;
    let ma = 0, mb = 0, da = 0, db = 0, dot = 0;
    for (let i = 0; i < W; i++) { ma += dm[iA + i]; mb += dm[jB + i]; }
    ma /= W; mb /= W;
    for (let i = 0; i < W; i++) { const x = dm[iA + i] - ma, y = dm[jB + i] - mb; da += x * x; db += y * y; dot += x * y; }
    const r = da > 1e-9 && db > 1e-9 ? dot / Math.sqrt(da * db) : -2;
    if (r > best) { best = r; bl = lag / DS; }
  }
  return { r: best, lag: bl };
}
/* 全曲电平分位，用来定义"接缝安静" */
const levels = [];
for (let t = 0; t < dur; t += 1) levels.push(rmsAt(t, 1));
levels.sort((a, b) => a - b);
const quant = (p) => levels[Math.min(levels.length - 1, Math.floor(levels.length * p))];
const QUIET_REF = Math.max(1e-6, quant(0.45));

/* ---------- 候选枚举 ---------- */
const barLen = tempoOK ? P * (METER === '3' ? 3 : 4) : 0;
const grid = tempoOK ? barLen : STEP;
const gridStart = tempoOK ? phase : 0;
const DATA_END = DATA_END_ARG > 0 ? Math.min(DATA_END_ARG, dur) : dur;
/* 候选长度：节拍可靠时**按整小节数**取（这样两端都落在小节线上，重拍自然对齐）；
   不可靠时按固定步长取，不假装有网格 */
const lens = [];
if (tempoOK) {
  for (let nb = Math.ceil(MIN_LEN / barLen); nb <= Math.floor(MAX_LEN / barLen); nb++) lens.push({ len: nb * barLen, nb });
} else {
  for (let len = MIN_LEN; len <= MAX_LEN; len += grid) lens.push({ len, nb: 0 });
}
const cands = [];
for (let tA = gridStart; tA + MIN_LEN < DATA_END - 0.5; tA += grid) {
  for (const L2 of lens) {
    const tB = tA + L2.len;
    if (tB + 2.5 > DATA_END) break;
    const es = envSim(tA, tB);
    if (es < 0.85) continue;
    const seam = Math.max(rmsAt(tA, 3), rmsAt(tB - 3, 3));
    const quiet = 1 - Math.min(1, seam / QUIET_REF);
    const nb = L2.nb;
    const barBonus = tempoOK ? (nb % 8 === 0 ? 0.05 : nb % 4 === 0 ? 0.03 : 0.01) : 0;
    cands.push({
      tA, tB, len: L2.len, env: es, seam, quiet, bars: nb, barBonus,
      score: es * 0.5 + quiet * 0.35 + Math.min(1, L2.len / 110) * 0.15 + barBonus,
    });
  }
}
cands.sort((a, b) => b.score - a.score);
/* 精算前 N 个候选的波形互相关 */
const REFINE = 160;
for (const c of cands.slice(0, REFINE)) {
  const p = pcmCorr(c.tA, c.tB, 3, 100);
  c.r = p.r; c.lag = p.lag;
}
/* 综合排序：公布的判据优先，波形相关只在"真的是重复段"时作为加分。
   注意：**不要**在这里给全部候选补算 pcmCorr —— 那是 O(候选数 × 窗 × 时移)，
   一首 4 分钟的曲子能跑到十几分钟（实测 4m09s 仍未结束）。
   精算只做前 REFINE 个（见上），其余候选 r 为 null，按 0 处理即可：
   cands 已按 score 排好序，没进前 REFINE 的候选本来就轮不到被推荐。 */
for (const c of cands) {
  c.total = c.score + (c.r != null && c.r > 0.5 ? 0.15 : 0);
}
cands.sort((a, b) => b.total - a.total);

/* 对照：曲头接曲尾（现状 loop 整段的接缝） */
const baseR = envSim(0, DATA_END - 5.1);
const basePcm = pcmCorr(0, DATA_END - 3.5, 3, 100);

/* ---------- 报告 ---------- */
const best = cands[0];
const xfade = tempoOK ? barLen : 4;
/* 相位对齐：波形互相关的最佳时移说明"这一段在 t+lag 处才和开头同相"。
   交叠时两遍是**同时**播的，若内容相差几十毫秒就会出现梳状感 / 怪厚薄，
   所以按最佳时移把乐句末端挪一下（代价是末端偏离小节线 <100ms，听不出来）。
   只在相关性够高时才做 —— 否则那个 lag 只是噪声里的峰值。 */
const alignShift = (best && best.lag != null && Math.abs(best.lag) >= 0.015 && best.r >= 0.35) ? best.lag : 0;
const recB = best ? Math.min(DATA_END - 0.1, best.tB + alignShift) : 0;
function kbpsFor(len) {
  const raw = (BUDGET * 8) / len / 1000;
  let pick = STD_KBPS[0];
  for (const k of STD_KBPS) if (k <= raw) pick = k;
  return { raw, pick };
}

if (AS_JSON) {
  console.log(JSON.stringify({
    file: SRC, duration: dur, sampleRate: sr, channels: res.channelData.length,
    tempo: { beat: P, bpm: 60 / P, confidence: CONF, reliable: tempoOK, phase, barLen: barLen || null },
    baseline: { loopWholeTrackEnvSim: baseR, loopWholeTrackPcmR: basePcm.r },
    recommend: best ? { a: best.tA, b: best.tB, bAligned: recB, alignShift, len: best.len, xfade, bars: best.bars, envSim: best.env, pcmR: best.r, seamLevel: best.seam } : null,
    candidates: cands.slice(0, TOPN),
  }, null, 1));
  process.exit(0);
}

const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
console.log('文件    : ' + path.basename(SRC));
console.log('解码    : ' + dur.toFixed(2) + 's · ' + sr + 'Hz · ' + res.channelData.length + 'ch · ' + (fs.statSync(SRC).size / 1048576).toFixed(2) + ' MB'
  + (DATA_END < dur ? '（实际进包只到 ' + DATA_END.toFixed(2) + 's，按 --data-end 限制）' : ''));
console.log('节拍    : 拍长 ' + f(P, 4) + 's（' + f(60 / P, 1) + ' BPM）· 相位 ' + f(phase, 3) + 's · 置信度 ' + f(CONF, 2)
  + (tempoOK ? ' → ✅ 按 ' + (METER === '3' ? '3' : '4') + '/4 小节网格枚举（小节 ' + f(barLen, 3) + 's）'
             : ' → ⚠️ 节拍不可靠（管弦乐连奏常见），改按 ' + STEP + 's 自由网格枚举'));
console.log('电平参考: 45% 分位 ' + f(QUIET_REF, 4) + '（接缝电平低于它就算"安静"）');
console.log('');
console.log('候选（前 ' + Math.min(TOPN, cands.length) + ' / 共 ' + cands.length + '）：');
console.log('     A(s)      B(s)     长(s)  小节   织体   接缝电平  安静  波形r   时移ms  综合');
for (const c of cands.slice(0, TOPN)) {
  console.log('  ' + f(c.tA).padStart(8) + '  ' + f(c.tB).padStart(8) + '  ' + f(c.len, 1).padStart(6)
    + '  ' + (c.bars || '-').toString().padStart(4) + '  ' + f(c.env, 3) + '  ' + f(c.seam, 4).padStart(8)
    + '  ' + f(c.quiet, 2) + '  ' + (c.r > -2 ? f(c.r, 3) : '  -').padStart(6)
    + '  ' + (c.lag == null ? '-' : f(c.lag * 1000, 0)).padStart(6) + '  ' + f(c.total, 3));
}
console.log('');
console.log('对照：把**整段**首尾相接（现状）—— 织体相似 ' + f(baseR, 3) + ' · 波形 r ' + f(basePcm.r, 3)
  + '（r 高＝曲子真有重复段；很低＝任何接缝都是两段不同音乐交叠，只能挑冲突最小的）');

if (!best) {
  console.log('\n没找到满足条件的候选：把 --min 调小或 --max 调大再试。');
  process.exit(0);
}

const k = kbpsFor(recB - best.tA);
console.log('');
console.log('=== 推荐 ===');
console.log('乐句 ' + f(best.tA) + 's → ' + f(recB) + 's（' + f(recB - best.tA, 1) + 's'
  + (best.bars ? ' · ' + best.bars + ' 小节' : '') + '）· 交叠 ' + f(xfade, 3) + 's'
  + (tempoOK ? '（整 1 小节）' : '（节拍不可靠，取 4s）'));
if (alignShift) {
  console.log('相位对齐: 末端从 ' + f(best.tB) + 's 挪到 ' + f(recB) + 's（波形互相关最佳时移 '
    + f(alignShift * 1000, 0) + 'ms）—— 交叠时两遍内容同相，避免梳状感 / 忽厚忽薄；代价是末端偏离小节线 '
    + f(Math.abs(alignShift) * 1000, 0) + 'ms（听不出来）');
}
console.log('');
console.log('① 音频数据是整段、要在 app 里选乐句（如 age-of-sail-3d 的做法）：');
console.log('     app.js:  var BGM_A=' + f(best.tA) + ',BGM_B=' + f(recB) + ',BGM_X=' + f(xfade, 3) + ';');
console.log('');
console.log('② 用 make-bgm 截段、buffer 就是乐句（jurassic-park-3d / rome-total-war-3d 的做法）：');
console.log('     node tools/make-bgm.mjs "' + path.basename(SRC) + '" --a ' + f(best.tA) + ' --b ' + f(recB) + ' --kbps ' + k.pick);
console.log('     app.js:  var BGM_XFADE=' + f(xfade, 1) + ';   /* 交叠秒数 */');
console.log('');
console.log('门禁参考：这段 ' + f(recB - best.tA, 1) + 's 要 ≤ 1 MiB，码率上限 ' + f(k.raw, 1) + 'kbps → 建议取 ' + k.pick + 'kbps'
  + '（约 ' + f((k.pick * 1000 * (recB - best.tA)) / 8 / 1048576, 3) + ' MiB）');
if (best.r > 0.5) console.log('✅ 波形相关 ' + f(best.r, 3) + ' > 0.5：这两处是**真正的同一段音乐**，接缝几乎听不出来。');
else console.log('ℹ️ 波形相关只有 ' + f(best.r, 3) + '：曲子没有真正的重复段，接缝是两段不同音乐的交叠 —— 务必戴耳机试听一遍。');
