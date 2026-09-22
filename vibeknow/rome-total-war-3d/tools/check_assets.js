/* 素材核对：图片与音频是否落位、尺寸对不对、体积有没有超预算。
 * 用法：node tools/check_assets.js
 *
 * 与 check_data.js 的分工：那个查「代码三方契约」（数据/CSS/JS 对不对得上），
 * 这个查「素材本身」（图在不在、够不够方、多大、总量超没超）。
 * 两者都过，才算素材齐了。
 *
 * 预算来源：docs/兵种图片素材需求.md §五、docs/场景配图需求.md §八、docs/背景音乐需求.md §一。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0, warn = 0;
function ok(m) { console.log('ok   ' + m); }
function bad(m) { console.log('FAIL ' + m); fail++; }
function note(m) { console.log('note ' + m); warn++; }
const KB = 1024, MB = 1024 * 1024;

/* ---------- WebP 尺寸读取（不依赖任何库） ---------- */
function webpSize(buf) {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    /* 无损头：3 字节帧标签 + 3 字节同步码 9d 01 2a + 2 字节宽 + 2 字节高（各低 14 位） */
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    if (buf[20] !== 0x2f) return null;
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8X') {
    return { w: (buf.readUIntLE(24, 3)) + 1, h: (buf.readUIntLE(27, 3)) + 1 };
  }
  return null;
}

/* ---------- 图位规格表 ---------- */
const FACTIONS = new Function(fs.readFileSync(path.join(ROOT, 'assets/units.js'), 'utf8') + ';return FACTIONS;')();
const UNITS = new Function(fs.readFileSync(path.join(ROOT, 'assets/units.js'), 'utf8') + ';return UNITS;')();

const TEX_SLOTS = [
  { f: 'logo.webp', max: 40 * KB, square: false, ratio: '约 3:2', must: false },
  /* gate-front 仍是首页 hero 底图；gate-open 只在视频缺失时当第二帧兜底 —— 视频到位后两者都是可选 */
  { f: 'gate-front.webp', max: 180 * KB, square: false, ratio: '16:9', must: false },
  { f: 'gate-open.webp', max: 180 * KB, square: false, ratio: '16:9', must: false },
  { f: 'gate-front-portrait.webp', max: 180 * KB, square: false, ratio: '9:14', must: false },
  { f: 'gate-open-portrait.webp', max: 180 * KB, square: false, ratio: '9:14', must: false },
  { f: 'gate.webp', max: 150 * KB, square: false, ratio: '16:9', must: false },
  { f: 'marble.webp', max: 60 * KB, square: true, ratio: '1:1 可平铺', must: false },
].concat(FACTIONS.map(f => ({ f: 'faction-' + f.key + '.webp', max: 120 * KB, square: false, ratio: '8:3', must: true })))
  .concat([{ f: 'faction-custom.webp', max: 120 * KB, square: false, ratio: '8:3', must: false }]);

/* ---------- 1. 兵种图（两套：写实 real / 兵牌 card） ----------
 * 写实 = units.js 的 img 字段；兵牌 = assets/units/card/<id>.webp（由 app.js 派生）。 */
const SETS = [
  { key: 'real', name: '写实 ', dir: 'assets/units', nameOf: (u) => u.img, maxEach: 70 * KB, maxAll: 2.6 * MB, must: true },
  { key: 'card', name: '兵牌 ', dir: 'assets/units/card', nameOf: (u) => './assets/units/card/' + u.id + '.webp', maxEach: 55 * KB, maxAll: 2.0 * MB, must: false },
];
console.log('— 兵种图 —');
SETS.forEach((S) => {
  let have = 0, total = 0, missingCnt = 0, missingList = [], over = 0, notSquare = 0, small = 0;
  UNITS.forEach((u) => {
    const src = S.nameOf(u);
    const file = S.key === 'real'
      ? (src ? path.join(ROOT, S.dir, path.basename(src)) : '')
      : path.join(ROOT, S.dir, u.id + '.webp');
    if (!file || !fs.existsSync(file)) { missingCnt++; missingList.push(u.id); return; }
    have++;
    const st = fs.statSync(file);
    total += st.size;
    if (st.size > S.maxEach) { bad(S.key + '/' + u.id + '.webp ' + (st.size / KB).toFixed(0) + 'KB 超过单图上限 ' + (S.maxEach / KB) + 'KB'); over++; }
    const d = webpSize(fs.readFileSync(file));
    if (!d) note(S.key + '/' + u.id + '.webp 读不出尺寸（不是标准 WebP？）');
    else if (d.w !== d.h) { bad(S.key + '/' + u.id + '.webp 不是方图：' + d.w + '×' + d.h); notSquare++; }
    else if (d.w < 512) { note(S.key + '/' + u.id + '.webp 只有 ' + d.w + 'px，建议 512'); small++; }
  });
  if (missingCnt) {
    const tag = S.must ? '会回退色卡，页面照常跑' : '切到兵牌时回退色卡';
    note(S.name + '缺 ' + missingCnt + ' 张（' + tag + '）' + (missingCnt <= 12 ? '：' + missingList.join(', ') : ''));
  } else ok(S.name + '48 张齐备');
  if (total > S.maxAll) bad(S.name + '合计 ' + (total / MB).toFixed(2) + 'MB 超过全套上限 ' + (S.maxAll / MB).toFixed(2) + 'MB');
  else ok(S.name + '合计 ' + (total / MB).toFixed(2) + 'MB / 上限 ' + (S.maxAll / MB).toFixed(2) + 'MB（' + have + '/' + UNITS.length + ' 张）'
    + (over || notSquare || small ? ' · 超重 ' + over + ' / 非方 ' + notSquare + ' / 偏小 ' + small : ''));
});

/* ---------- 2. 场景图 ---------- */
console.log('\n— 场景图 —');
let tHave = 0, tTotal = 0;
const tMissing = [];
TEX_SLOTS.forEach(s => {
  const p = path.join(ROOT, 'assets/tex', s.f);
  if (!fs.existsSync(p)) { tMissing.push(s.f + (s.must ? '' : '（可缺）')); return; }
  tHave++;
  const st = fs.statSync(p);
  tTotal += st.size;
  if (st.size > s.max) bad(s.f + ' ' + (st.size / KB).toFixed(0) + 'KB 超过上限 ' + (s.max / KB) + 'KB');
  const d = webpSize(fs.readFileSync(p));
  if (d && s.square && d.w !== d.h) bad(s.f + ' 应为方图，实际 ' + d.w + '×' + d.h);
});
if (tMissing.length) note('缺 ' + tMissing.length + ' 个场景图位：' + tMissing.join(' · '));
else ok('场景图 ' + TEX_SLOTS.length + ' 个齐备');
if (tTotal > 1.8 * MB) bad('场景图合计 ' + (tTotal / MB).toFixed(2) + 'MB 超过上限 1.8MB');
else ok('场景图合计 ' + (tTotal / MB).toFixed(2) + 'MB / 上限 1.80MB（' + tHave + '/' + TEX_SLOTS.length + ' 个）');

/* ---------- 2.5 过渡视频（凯旋门页；缺失自动退回两帧图，不计失败） ---------- */
console.log('\n— 过渡视频 —');
const VIDEO = { f: 'gate.mp4', max: 1200 * KB };
const vp = path.join(ROOT, 'assets/video', VIDEO.f);
if (!fs.existsSync(vp)) {
  note('assets/video/gate.mp4 未生成 → 过渡页退回 gate-front/gate-open 两帧交叉淡化（页面照常跑）。规格见 docs/过渡视频需求.md');
} else {
  const vs = fs.statSync(vp);
  if (vs.size > VIDEO.max) bad('gate.mp4 ' + (vs.size / KB).toFixed(0) + 'KB 超过上限 ' + (VIDEO.max / KB) + 'KB');
  else ok('gate.mp4 ' + (vs.size / KB).toFixed(0) + 'KB / 上限 ' + (VIDEO.max / KB) + 'KB');
  /* 只看前 12 字节的 ftyp 头：不是标准 MP4 就别往包里放 —— 后缀改名骗得过人眼，骗不过浏览器 */
  const head = fs.readFileSync(vp).slice(0, 12);
  if (head.length < 12 || head.toString('ascii', 4, 8) !== 'ftyp') {
    bad('gate.mp4 不是标准 MP4（前 12 字节里没有 ftyp）—— 多半是别的文件改了后缀，请用 tools/prep_video.py 重新转码');
  } else ok('gate.mp4 容器头正常（ftyp）');
}

/* ---------- 3. 目录里有没有多余的文件 ---------- */
const expectU = new Set(UNITS.map(u => u.id + '.webp'));
const expectT = new Set(TEX_SLOTS.map(s => s.f));
/* assets/units 下多了 card/ 子目录属正常，先看里面的文件是不是都对应得上 */
const cardDir = path.join(ROOT, 'assets/units/card');
if (fs.existsSync(cardDir)) {
  const extraCard = fs.readdirSync(cardDir).filter(f => /\.(webp|jpg|png)$/i.test(f) && !expectU.has(f));
  if (extraCard.length) note('assets/units/card/ 里有 ' + extraCard.length + ' 个图位表之外的文件：' + extraCard.slice(0, 8).join(', '));
}
['units', 'tex'].forEach(dir => {
  const p = path.join(ROOT, 'assets', dir);
  if (!fs.existsSync(p)) return;
  const extra = fs.readdirSync(p).filter(f => /\.(webp|jpg|png)$/i.test(f) && !(dir === 'units' ? expectU : expectT).has(f));
  if (extra.length) note('assets/' + dir + '/ 里有 ' + extra.length + ' 个图位表之外的文件（不会加载）：' + extra.slice(0, 8).join(', '));
});

/* ---------- 4. BGM ---------- */
console.log('\n— 背景音乐 —');
const bgm = path.join(ROOT, 'assets/audio/bgm.js');
if (!fs.existsSync(bgm)) {
  note('assets/audio/bgm.js 未生成（没有 BGM，页面照常跑）。做法见 docs/背景音乐需求.md');
} else {
  const src = fs.readFileSync(bgm, 'utf8');
  const m = src.match(/window\.RTW3D_BGM\s*=\s*"([A-Za-z0-9+/=]+)"/);
  if (!m) bad('bgm.js 里找不到 window.RTW3D_BGM —— 变量名必须是 RTW3D_BGM');
  else {
    const b64 = m[1];
    const decoded = Math.floor(b64.length * 3 / 4) - (b64.slice(-2).split('=').length - 1);
    const jsSize = fs.statSync(bgm).size;
    if (decoded > 1 * MB) bad('bgm 解码后 ' + (decoded / MB).toFixed(3) + ' MiB 超过门禁 1 MiB —— 降 --kbps 或缩短乐句');
    else ok('bgm 解码后 ' + (decoded / MB).toFixed(3) + ' MiB / 门禁 1.000 MiB');
    if (jsSize > 2 * MB) bad('bgm.js ' + (jsSize / MB).toFixed(2) + ' MB 超过单个 .js 上限 2 MB');
    else ok('bgm.js ' + (jsSize / MB).toFixed(2) + ' MB / 上限 2.00 MB');
  }
}

/* ---------- 5. 总量 ---------- */
console.log('\n— 总量 —');
/* 与 tools/pack.mjs 的 excludes 保持一致：源曲目与留档说明不进包 */
const PACK_EXCLUDE = new Set(['assets/audio/bgm-src.mp3', 'assets/audio/bgm.mp3', 'assets/audio/README.md']);
const packFiles = ['index.html'];
(function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const r = rel + '/' + e.name;
    if (PACK_EXCLUDE.has(r)) continue;
    if (e.isDirectory()) walk(r); else packFiles.push(r);
  }
})('assets');
let raw = 0;
packFiles.forEach(f => { try { raw += fs.statSync(path.join(ROOT, f)).size; } catch (e) { } });
console.log('将进包 ' + packFiles.length + ' 个文件 · 原始合计 ' + (raw / MB).toFixed(2) + ' MB');
console.log('（含 three.min.js / earth.jpg / clouds.png 共约 1.34 MB 的固定开销）');
if (raw > 8 * MB) note('原始合计偏大，zip 体积会接近容器上传上限，注意核对');

console.log(fail ? '\n❌ ' + fail + ' 项未通过（另有 ' + warn + ' 条提示）' : '\n✅ 全部通过' + (warn ? '（' + warn + ' 条提示）' : ''));
process.exit(fail ? 1 : 0);
