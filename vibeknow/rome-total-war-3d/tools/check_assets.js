/* 素材核对：图片与音频是否落位、尺寸对不对、体积有没有超预算。
 * 用法：node tools/check_assets.js
 *
 * 与 check_data.js 的分工：那个查「代码三方契约」（数据/CSS/JS 对不对得上），
 * 这个查「素材本身」（图在不在、够不够方、多大、总量超没超）。
 * 两者都过，才算素材齐了。
 *
 * 预算来源：docs/兵种图片素材需求.md §五、docs/场景配图需求.md §九（含 ⑨ 过渡画面）、
 * docs/背景音乐需求.md §一。
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
  /* 旧的「通用凯旋门」③⑤⑥（横版 / 竖版 / 最后兜底）已于 2026-09-22 整组退役并删除：
     画面里画进了现代相机，而且 ⑨ 过渡画面九张落位后这一页每阵营都有专属画面，
     通用那张只会在 contain 留出的信箱边里露出来（正是「上下露出原来大门」的 bug）。
     过渡页现在的画面链是 ⑨ gate-<key> → 该阵营横幅 ⑧，见下方两个分组。 */
  { f: 'marble.webp', max: 60 * KB, square: true, ratio: '1:1 可平铺', must: false },
].concat(FACTIONS.map(f => ({ f: 'faction-' + f.key + '.webp', max: 120 * KB, square: false, ratio: '8:3', must: true })))
  .concat([{ f: 'faction-custom.webp', max: 120 * KB, square: false, ratio: '8:3', must: false }]);

/* ---------- 1. 兵种图（只有一套：写实） ----------
 * 写实 = units.js 的 img 字段。兵牌那套（assets/units/card/）2026-09-22 整组退役：
 * 画风不合要求、效果也不行，罗马也不再特殊 —— 页面只请求这一套，缺图退色卡。 */
const SETS = [
  { key: 'real', name: '写实 ', dir: 'assets/units', nameOf: (u) => u.img, maxEach: 70 * KB, maxAll: 2.6 * MB, must: true },
];
console.log('— 兵种图 —');
SETS.forEach((S) => {
  let have = 0, total = 0, missingCnt = 0, missingList = [], over = 0, notSquare = 0, small = 0;
  UNITS.forEach((u) => {
    const src = S.nameOf(u);
    const file = src ? path.join(ROOT, S.dir, path.basename(src)) : '';
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
    const tag = S.must ? '会回退色卡，页面照常跑' : '不用（这套已退役）';
    note(S.name + '缺 ' + missingCnt + ' 张（' + tag + '）' + (missingCnt <= 12 ? '：' + missingList.join(', ') : ''));
  } else ok(S.name + '48 张齐备');
  if (total > S.maxAll) bad(S.name + '合计 ' + (total / MB).toFixed(2) + 'MB 超过全套上限 ' + (S.maxAll / MB).toFixed(2) + 'MB');
  else ok(S.name + '合计 ' + (total / MB).toFixed(2) + 'MB / 上限 ' + (S.maxAll / MB).toFixed(2) + 'MB（' + have + '/' + UNITS.length + ' 张）'
    + (over || notSquare || small ? ' · 超重 ' + over + ' / 非方 ' + notSquare + ' / 偏小 ' + small : ''));
});

/* 兵牌那套已退役：目录里若又冒出图，只提示（页面不会加载它们） */
const cardDir = path.join(ROOT, 'assets/units/card');
if (fs.existsSync(cardDir)) {
  const left = fs.readdirSync(cardDir).filter(f => /\.webp$/i.test(f));
  if (left.length) note('assets/units/card/ 里还有 ' + left.length + ' 张兵牌图，但页面已不再请求它们（兵牌 2026-09-22 退役）');
}

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

/* ---------- 2.2 装备图集（assets/gear/<id>.webp，128×128 透明底）
 * 名单是 assets/gear.js 的 GEAR；缺哪张那件装备就退成槽位名文字，不计失败。 */
console.log('\n— 装备图集 —');
const GEAR = new Function(fs.readFileSync(path.join(ROOT, 'assets/gear.js'), 'utf8') + ';return GEAR;')();
const gearIds = Object.keys(GEAR);
const GEAR_MAX = 8 * KB;
let gHave = 0, gTotal = 0, gOver = 0, gNotSquare = 0;
const gMissing = [];
gearIds.forEach((id) => {
  const p = path.join(ROOT, 'assets/gear', id + '.webp');
  if (!fs.existsSync(p)) { gMissing.push(id); return; }
  gHave++;
  const st = fs.statSync(p);
  gTotal += st.size;
  if (st.size > GEAR_MAX) { bad('gear/' + id + '.webp ' + (st.size / KB).toFixed(0) + 'KB 超过单图上限 ' + (GEAR_MAX / KB) + 'KB'); gOver++; }
  const d = webpSize(fs.readFileSync(p));
  if (!d) note('gear/' + id + '.webp 读不出尺寸（不是标准 WebP？）');
  else if (d.w !== d.h) { bad('gear/' + id + '.webp 不是方图：' + d.w + '×' + d.h); gNotSquare++; }
  else if (d.w < 128) note('gear/' + id + '.webp 只有 ' + d.w + 'px，建议 128');
});
if (gMissing.length) note('装备图缺 ' + gMissing.length + ' 张（缺图退成槽位名文字，页面照常跑）' + (gMissing.length <= 10 ? '：' + gMissing.join(', ') : ''));
else ok('装备图 ' + gearIds.length + ' 张齐备');
if (gTotal > 0.6 * MB) bad('装备图合计 ' + (gTotal / MB).toFixed(2) + 'MB 超过预算 0.60MB');
else ok('装备图合计 ' + (gTotal / MB).toFixed(2) + 'MB / 上限 0.60MB（' + gHave + '/' + gearIds.length + ' 张）'
  + (gOver || gNotSquare ? ' · 超重 ' + gOver + ' / 非方 ' + gNotSquare : ''));

/* ---------- 2.5 过渡画面（「即将检阅」页；每阵营一张，缺则退该阵营横幅 ⑧） ---------- */
console.log('\n— 过渡画面 —');
const GATE_EACH = 110 * KB, GATE_ALL = 0.9 * MB;
const gateSlots = FACTIONS.map(f => 'gate-' + f.key + '.webp').concat(['gate-custom.webp']);
let gsHave = 0, gsTotal = 0, gsNotWide = 0;
const gsMissing = [];
gateSlots.forEach(f => {
  const p = path.join(ROOT, 'assets/tex', f);
  if (!fs.existsSync(p)) { gsMissing.push(f); return; }
  gsHave++;
  const st = fs.statSync(p);
  gsTotal += st.size;
  if (st.size > GATE_EACH) bad('tex/' + f + ' ' + (st.size / KB).toFixed(0) + 'KB 超过单图上限 ' + (GATE_EACH / KB) + 'KB');
  const d = webpSize(fs.readFileSync(p));
  if (!d) note('tex/' + f + ' 读不出尺寸（不是标准 WebP？）');
  else if (d.w < 1280) { note('tex/' + f + ' 只有 ' + d.w + '×' + d.h + '，建议 1600×900'); gsNotWide++; }
  else if (Math.abs(d.w / d.h - 16 / 9) > 0.02) { note('tex/' + f + ' 比例 ' + d.w + '×' + d.h + '（建议 16:9）'); gsNotWide++; }
});
if (gsMissing.length) {
  note('⑨ 过渡画面缺 ' + gsMissing.length + '/9 张（每阵营一张）：' + gsMissing.join(', ')
    + ' → 该阵营已退到自己的横幅 faction-<key>.webp；页面照常跑。'
    + '规格见 docs/场景配图需求.md 六、');
} else ok('⑨ 过渡画面 9 张齐备（每阵营一张）');
if (gsTotal > GATE_ALL) bad('过渡画面合计 ' + (gsTotal / MB).toFixed(2) + 'MB 超过上限 0.90MB');
else ok('过渡画面合计 ' + (gsTotal / MB).toFixed(2) + 'MB / 上限 0.90MB（' + gsHave + '/9 张）'
  + (gsNotWide ? ' · 比例/尺寸偏离 ' + gsNotWide : ''));

/* ---------- 3. 目录里有没有多余的文件 ---------- */
const expectU = new Set(UNITS.map(u => u.id + '.webp'));
const expectT = new Set(TEX_SLOTS.map(s => s.f).concat(gateSlots));
/* assets/units/card/ 是兵牌那套的位置（已退役）—— 上面已单独看过一遍，这里不重复点名 */
['units', 'tex'].forEach(dir => {
  const p = path.join(ROOT, 'assets', dir);
  if (!fs.existsSync(p)) return;
  const extra = fs.readdirSync(p).filter(f => /\.(webp|jpg|png)$/i.test(f) && !(dir === 'units' ? expectU : expectT).has(f));
  if (extra.length) note('assets/' + dir + '/ 里有 ' + extra.length + ' 个图位表之外的文件（不会加载）：' + extra.slice(0, 8).join(', '));
});
/* 装备图集目录：文件必须都对得上 GEAR 的 id */
const gearDir = path.join(ROOT, 'assets/gear');
if (fs.existsSync(gearDir)) {
  const expectG = new Set(gearIds.map((id) => id + '.webp'));
  const extraG = fs.readdirSync(gearDir).filter(f => /\.(webp|jpg|png)$/i.test(f) && !expectG.has(f));
  if (extraG.length) note('assets/gear/ 里有 ' + extraG.length + ' 个词表之外的文件（不会加载）：' + extraG.slice(0, 8).join(', '));
}

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
console.log('（3D 地球已加回：three.min.js 约 0.58 MB + earth.jpg 约 0.49 MB 进包；云层与星空已不复用）');
console.log('（过渡页已取消视频：⑨ 过渡画面 ×9 全出也只占 ≤0.90 MB，比原视频预算 1.20 MB 更省）');
if (raw > 8 * MB) note('原始合计偏大，zip 体积会接近容器上传上限，注意核对');

console.log(fail ? '\n❌ ' + fail + ' 项未通过（另有 ' + warn + ' 条提示）' : '\n✅ 全部通过' + (warn ? '（' + warn + ' 条提示）' : ''));
process.exit(fail ? 1 : 0);
