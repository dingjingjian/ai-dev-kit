/* 数据自检：校验 units.js / index.html / app.js 三方契约是否对得上。
 * 用法：node tools/check_data.js
 * 判据（任一条不过即退出码 1）：
 *   1. 兵种 48 个、id 唯一、阵营 8 个、每阵营 6 个兵种且 id 都能解析到
 *   2. stats 长度 6 且各维 0-5 整数；kind/tier 取值都在 app.js 的白名单里
 *   3. 经纬度在有效区间内；men 为正整数
 *   4. index.html 里引用的图位路径与数据里的 img 前缀一致
 *   5. app.js 的 STATS_DIMS / KIND_LABEL / TIER_LABEL 覆盖数据里出现的全部取值
 *   6. assets/gear.js 的装备表与槽位引用：48 兵种都有表、id 双向可解析、slot 一致、没有白写的装备
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
const slots = ['logo.webp', 'marble.webp'];
slots.forEach(s => { if (!html.includes(s)) bad('index.html 缺图位：' + s); });
FACTIONS.forEach(f => {
  if (!html.includes('faction-' + f.key + '.webp')) bad('index.html 缺阵营横幅图位：faction-' + f.key + '.webp');
});
if (!html.includes('faction-custom.webp')) bad('index.html 缺自选军团横幅图位');
ok('index.html 图位齐全（logo / 大理石 / 阵营横幅 ×9）');

/* 3a. 退役图位防回归：旧的「通用凯旋门」（③ 横版 / ⑤ 竖版 / ⑥ 最后兜底）画面里
   画进了一台现代相机，⑨ 九张落位后整组退役、文件已删。它们排在画面链末层，
   只会在 contain 留出的信箱边里露出来 —— 正是「上下空白处露出原来大门」那个 bug 的来源。 */
const RETIRED = ['gate-front.webp', 'gate-front-portrait.webp', 'tex/gate.webp'];
const retiredHit = RETIRED.filter(t => html.includes(t) || app.includes(t));
retiredHit.forEach(t => bad('通用凯旋门已退役，但页面/脚本里仍引用：' + t));
if (!retiredHit.length) ok('通用凯旋门 ③⑤⑥ 已整组退役（index.html 与 app.js 都不再引用）');

/* 3a. 首页 hero：8 个预设阵营各一层横幅轮播（自选军团不参与），纯 CSS 交叉淡化 */
const shotN = (html.match(/class="park-shot"/g) || []).length;
if (shotN !== FACTIONS.length) bad('首页 hero 轮播层应为 ' + FACTIONS.length + ' 层，实际 ' + shotN);
else ok('首页 hero 轮播 ' + shotN + ' 层（8 个预设阵营横幅）');
if (!html.includes('@keyframes heroCycle')) bad('index.html 缺 heroCycle 轮播关键帧');
if (!html.includes('@keyframes shotPush')) bad('index.html 缺 shotPush 单帧缓推关键帧');

/* 3b. 过渡页画面：整段只有**一帧**（不再是两帧交叉淡化，也没有视频层） */
const gateShotN = (html.match(/class="gate-shot"/g) || []).length;
const gateBgN = (html.match(/class="gate-bg"/g) || []).length;
if (gateShotN !== 1) bad('过渡页主画面应为单帧，实际 ' + gateShotN + ' 个 .gate-shot');
if (gateBgN !== 1) bad('过渡页模糊铺底应为单层，实际 ' + gateBgN + ' 个 .gate-bg');
if (gateShotN === 1 && gateBgN === 1) ok('过渡页画面为单帧 + 单层模糊铺底（铺底吃同一张图，不引入第二张）');

/* 3c. 过渡画面契约：⑨ 按阵营取图 + 两层画面链 + 视频设定确已下线。
   ⑨ 是可选素材（缺了退该阵营横幅 ⑧，再缺退页面底色），所以这里只查"写了就得写对"，不查文件在不在。 */
const GATE_ART = "'./assets/tex/gate-'+key+'.webp'";
const GATE_ART_FB = "'./assets/tex/faction-'+key+'.webp'";
if (!app.includes(GATE_ART)) bad('app.js 缺 ⑨ 过渡画面路径（应为 ' + GATE_ART + '）');
if (!app.includes(GATE_ART_FB)) bad('app.js 缺 ⑨ 的第一层兜底（该阵营横幅 faction-<key>.webp）');
if (!app.includes("--gate-art")) bad('app.js 未把过渡画面写进 CSS 变量 --gate-art');
if (!html.includes('--gate-art')) bad('index.html 的 .gate-stage 缺自定义属性 --gate-art');
if (!/--gate-art:none/.test(html)) bad('index.html 的 --gate-art 默认值应为 none（JS 没跑起来时退页面底色）');
const VIDEO_TRACES = ['gate.mp4', 'gateVideo', 'gate-video', 'setGateVideoMode', 'tryGateVideo'];
VIDEO_TRACES.forEach((t) => {
  if (html.includes(t)) bad('视频设定应已下线，但 index.html 里仍有：' + t);
  if (app.includes(t)) bad('视频设定应已下线，但 app.js 里仍有：' + t);
});
if (!app.includes('enterReview')) bad('app.js 缺 enterReview（过渡结束后的落点）');
ok('过渡画面契约：⑨ 按阵营取图 + 横幅兜底 + 视频设定已下线');

/* 3e. 兵种图契约（2026-09-22 定稿）：**只有一套写实**，48 支一律走 units.js 的 img 字段。
   兵牌那套（assets/units/card/）与「写实 / 兵牌」开关都已整组退役 —— 画风不合要求、
   效果也不行，罗马也不再特殊。防回归：页面与脚本里都不许再出现兵牌取图与那套开关。 */
if (!app.includes('IMG_OK')) bad('app.js 缺 IMG_OK（兵种图三态缓存）');
if (!app.includes('u.img')) bad('app.js 未使用 units.js 的 img 字段取图');
const RETIRED_UI = ['tourStyle', 'ts-btn', 'data-style', '素材未生成', 'img-missing'];
RETIRED_UI.forEach((t) => {
  if (html.includes(t)) bad('兵牌/切换已退役，但 index.html 里仍有：' + t);
  if (app.includes(t)) bad('兵牌/切换已退役，但 app.js 里仍有：' + t);
});
/* 只认「代码里真的去取兵牌图」的写法（带 ./ 的路径），注释里提到退役不算违规 */
const RETIRED_SET = ['cardImgOf', 'styleFor', 'otherStyle', './assets/units/card'];
RETIRED_SET.forEach((t) => {
  if (app.includes(t)) bad('兵牌已退役，但 app.js 里仍在取兵牌图：' + t);
});
ok('兵种图只有写实一套（罗马也一样），兵牌与切换开关已整组退役');

/* 3d. 装备拆解契约：assets/gear.js（词表 + 槽位引用）与 units.js / index.html 对得上。
   判据：① 每个兵种都有 KIT；② KIT 的键是 units.js 里的 id；③ 值是 GEAR 里的 id；
        ④ slot 与 GEAR 声明一致；⑤ 页面有装它、脚本有引它；⑥ 没有白写的装备。 */
const gearSrc = fs.readFileSync(path.join(ROOT, 'assets/gear.js'), 'utf8');
const GEAR = new Function(gearSrc + ';return GEAR;')();
const KIT = new Function(gearSrc + ';return KIT;')();
const GEAR_SLOTS = new Function(gearSrc + ';return GEAR_SLOTS;')();
const slotKeys = GEAR_SLOTS.map(s => s[0]);
if (!html.includes('id="gearCol"')) bad('index.html 缺装备拆解容器 #gearCol');
if (!html.includes('assets/gear.js')) bad('index.html 未引入 assets/gear.js');
if (!app.includes('gearCol')) bad('app.js 未接管 #gearCol');
UNITS.forEach(u => {
  if (!KIT[u.id]) { bad('兵种缺装备表：' + u.id); return; }
  Object.keys(KIT[u.id]).forEach(s => {
    if (!slotKeys.includes(s)) bad(u.id + ' 用了槽位表之外的键：' + s);
  });
  slotKeys.forEach(s => {
    const g = KIT[u.id][s];
    if (!g) return;
    if (!GEAR[g]) bad(u.id + ' 引用了 GEAR 里没有的装备：' + g);
    else if (GEAR[g].slot !== s) bad(u.id + ' 的「' + s + '」槽放了 ' + g + '（它属于 ' + GEAR[g].slot + '）');
  });
});
const kitIDs = Object.keys(KIT);
kitIDs.forEach(id => { if (id2i[id] == null) bad('KIT 里有 units.js 不存在的兵种：' + id); });
const used = {};
Object.keys(KIT).forEach(id => Object.keys(KIT[id]).forEach(s => { if (KIT[id][s]) used[KIT[id][s]] = (used[KIT[id][s]] || 0) + 1; }));
Object.keys(GEAR).forEach(g => { if (!used[g]) bad('装备从未被任何兵种引用（白写）：' + g); });
const kitN = Object.keys(GEAR).length;
const fillN = Object.keys(used).reduce((s, g) => s + used[g], 0);
ok('装备表 ' + kitN + ' 件 · 覆盖 ' + fillN + ' 个槽位 · 48 兵种全部有装备表');
/* 场景图位总数：logo + 大理石 2 + 阵营横幅 9 + 过渡画面 9（⑨ 与 ⑧ 的 key 同源）
   —— 旧的「通用凯旋门」③⑤⑥ 若干张已整组退役（见 3a） */
const SCENE_SLOTS = slots.length + 9 + 9;

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
