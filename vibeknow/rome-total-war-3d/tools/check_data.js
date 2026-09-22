/* 数据自检：校验 units.js / index.html / app.js 三方契约是否对得上。
 * 用法：node tools/check_data.js
 * 判据（任一条不过即退出码 1）：
 *   1. 兵种 48 个、id 唯一、阵营 8 个、每阵营 6 个兵种且 id 都能解析到
 *   2. stats 长度 6 且各维 0-5 整数；kind/tier 取值都在 app.js 的白名单里
 *   3. 经纬度在有效区间内；men 为正整数
 *   4. index.html 里引用的图位路径与数据里的 img 前缀一致
 *   5. app.js 的 STATS_DIMS / KIND_LABEL / TIER_LABEL 覆盖数据里出现的全部取值
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const src = fs.readFileSync(path.join(ROOT, 'assets/units.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

const sandbox = {};
new Function('window', src)({ });
// 直接 eval 出两个全局
const UNITS = new Function(src + ';return UNITS;')();
const FACTIONS = new Function(src + ';return FACTIONS;')();

let fail = 0;
function bad(msg){ console.log('FAIL ' + msg); fail++; }
function ok(msg){ console.log('ok   ' + msg); }

/* 1. 规模与 id */
if (UNITS.length !== 48) bad('兵种数应为 48，实际 ' + UNITS.length); else ok('兵种 48 个');
const seen = new Set();
UNITS.forEach(u => { if (seen.has(u.id)) bad('id 重复：' + u.id); seen.add(u.id); });
if (FACTIONS.length !== 8) bad('阵营数应为 8，实际 ' + FACTIONS.length); else ok('阵营 8 个');
const id2i = {}; UNITS.forEach((u, i) => id2i[u.id] = i);
FACTIONS.forEach(f => {
  if (!Array.isArray(f.units)) { bad('阵营 ' + f.key + ' 缺 units'); return; }
  if (f.units.length !== 6) bad('阵营 ' + f.key + ' 兵种数应为 6，实际 ' + f.units.length);
  f.units.forEach(id => { if (id2i[id] == null) bad('阵营 ' + f.key + ' 引用了不存在的兵种 id：' + id); });
});
ok('每阵营 6 个兵种且 id 全部可解析');

/* 2. 字段取值 */
const appKinds = (app.match(/var KIND_LABEL=\{([^}]*)\}/) || [, ''])[1]
  .split(',').map(s => s.split(':')[0].trim()).filter(Boolean);
const appTiers = (app.match(/var TIER_LABEL=\{([^}]*)\}/) || [, ''])[1]
  .split(',').map(s => s.split(':')[0].trim()).filter(Boolean);
const appDims = ((app.match(/var STATS_DIMS=\[([^\]]*)\]/) || [, ''])[1])
  .split(',').map(s => s.replace(/['"]/g, '').trim()).filter(Boolean);
if (appDims.length !== 6) bad('STATS_DIMS 应为 6 维'); else ok('STATS_DIMS 六维：' + appDims.join('/'));

UNITS.forEach(u => {
  if (!appKinds.includes(u.kind)) bad(u.id + ' 的 kind 不在 KIND_LABEL：' + u.kind);
  if (!appTiers.includes(u.tier)) bad(u.id + ' 的 tier 不在 TIER_LABEL：' + u.tier);
  if (!Array.isArray(u.stats) || u.stats.length !== 6) bad(u.id + ' 的 stats 不是 6 维');
  else u.stats.forEach(v => { if (!(Number.isInteger(v) && v >= 0 && v <= 5)) bad(u.id + ' stats 越界：' + v); });
  if (!(Number.isInteger(u.men) && u.men > 0)) bad(u.id + ' 的 men 非法：' + u.men);
  if (!(u.lat >= -90 && u.lat <= 90 && u.lon >= -180 && u.lon <= 180)) bad(u.id + ' 经纬度越界');
  if (!u.img || !u.img.startsWith('./assets/units/')) bad(u.id + ' 的 img 路径不在 assets/units/');
  if (!Array.isArray(u.traits) || u.traits.length !== 3) bad(u.id + ' traits 应为 3 条');
  if (!Array.isArray(u.tags) || !u.tags.length) bad(u.id + ' 缺 tags');
  if (!u.intro || u.intro.length < 40) bad(u.id + ' 的 intro 过短');
});
ok('字段取值全部在白名单内');

/* 3. 图位与 index.html 契约 */
const imgPrefix = './assets/units/';
if (!html.includes(imgPrefix.replace('./assets/units/', 'assets/units/'))) bad('index.html 未标注 assets/units/ 图位');
const slots = ['logo.webp', 'gate-front.webp', 'gate-open.webp', 'gate.webp',
               'gate-front-portrait.webp', 'gate-open-portrait.webp', 'marble.webp'];
slots.forEach(s => { if (!html.includes(s)) bad('index.html 缺图位：' + s); });
FACTIONS.forEach(f => {
  if (!html.includes('faction-' + f.key + '.webp')) bad('index.html 缺阵营横幅图位：faction-' + f.key + '.webp');
});
if (!html.includes('faction-custom.webp')) bad('index.html 缺自选军团横幅图位');
ok('index.html 图位齐全（logo / 凯旋门横竖各两帧 + 兜底 / 大理石 / 阵营横幅 ×9）');

/* 3b. 过渡视频契约：页面元素、JS 里的路径、唯一文件名三者要对得上。
   视频是可选素材（缺了退两帧图），所以这里只查"写了就得写对"，不查文件在不在。 */
const VIDEO_SRC = './assets/video/gate.mp4';
if (!html.includes('id="gateVideo"')) bad('index.html 缺过渡视频元素 #gateVideo');
if (!app.includes(VIDEO_SRC)) bad('app.js 里的过渡视频路径应为 ' + VIDEO_SRC);
if (app.indexOf(VIDEO_SRC) !== app.lastIndexOf(VIDEO_SRC)) bad('app.js 里过渡视频路径写了多处，应只有一处常量');
if (!app.includes('enterReview')) bad('app.js 缺 enterReview（过渡结束后的落点）');
ok('过渡视频契约：#gateVideo 元素 + 唯一路径常量 + 结束落点');
const SCENE_SLOTS = slots.length + 9;

/* 4. 阵营 key 与 CSS 主题一一对应 */
FACTIONS.forEach(f => {
  if (!html.includes('body[data-faction="' + f.key + '"]')) bad('index.html 缺阵营主题：' + f.key);
});
if (!html.includes('body[data-faction="custom"]')) bad('index.html 缺自选军团主题');
ok('8 套阵营主题 + 自选主题齐备');

/* 5. 覆盖度 */
const kindsUsed = new Set(UNITS.map(u => u.kind));
const order = (app.match(/var KIND_ORDER=\[([^\]]*)\]/) || [, ''])[1]
  .split(',').map(s => s.replace(/['"]/g, '').trim()).filter(Boolean);
kindsUsed.forEach(k => { if (!order.includes(k)) bad('KIND_ORDER 漏了：' + k); });
ok('兵种类型分组覆盖全部 kind');

/* 6. 统计摘要 */
const byKind = {}; UNITS.forEach(u => byKind[u.kind] = (byKind[u.kind] || 0) + 1);
console.log('\n— 摘要 —');
console.log('兵种类型分布：' + order.map(k => (app.match(new RegExp("'" + k + "':'([^']*)'")) || [, k])[1] + ' ' + (byKind[k] || 0)).join(' · '));
console.log('等级分布：' + appTiers.map(t => t + ' ' + UNITS.filter(u => u.tier === t).length).join(' · '));
const facCount = {}; UNITS.forEach(u => facCount[u.faction] = (facCount[u.faction] || 0) + 1);
console.log('阵营兵种数：' + FACTIONS.map(f => f.name + ' ' + facCount[f.key]).join(' · '));
console.log('图位总数：兵种图 ' + UNITS.length + ' + 场景图 ' + SCENE_SLOTS + ' = ' + (UNITS.length + SCENE_SLOTS));

console.log(fail ? '\n❌ ' + fail + ' 项未通过' : '\n✅ 全部通过');
process.exit(fail ? 1 : 0);
