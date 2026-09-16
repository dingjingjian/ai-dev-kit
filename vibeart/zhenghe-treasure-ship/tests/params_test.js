#!/usr/bin/env node
/**
 * 参数层自检：验 assets/ship-params.js 的内部自洽与记载一致性。
 * 零依赖，直接 require（该文件同时兼容 CommonJS 与浏览器全局）。
 *
 * 用法：node tests/params_test.js
 */
const path = require('path');
const ZH = require(path.join(__dirname, '..', 'assets', 'ship-params.js'));

let nPass = 0, nFail = 0;
const fails = [];

function ok(cond, label) {
  if (cond) { nPass++; console.log('  [ OK ] ' + label); }
  else { nFail++; fails.push(label); console.log('  [FAIL] ' + label); }
}

console.log('\n一、桅帆计数（须与史料一致）');
const c = ZH.selfCheck();
ok(ZH.MASTS.length === ZH.RECORD.mastCount, '桅数 = ' + ZH.RECORD.mastCount + '（实际 ' + ZH.MASTS.length + '）');
const sailSum = ZH.MASTS.reduce((a, m) => a + m.sail, 0);
ok(sailSum === ZH.RECORD.sailCount, '帆数 = ' + ZH.RECORD.sailCount + '（实际 ' + sailSum + '）');
ok(c.ok, 'selfCheck() 通过');

console.log('\n二、记载值口径');
ok(Math.abs(ZH.RECORD.lengthZhang - 44.4) < 1e-9, '长四十四丈四尺 = 44.4 丈');
ok(Math.abs(ZH.RECORD.beamZhang - 18) < 1e-9, '阔十八丈 = 18 丈');
const ratio = ZH.RECORD.lengthZhang / ZH.RECORD.beamZhang;
ok(Math.abs(ratio - 2.4666667) < 1e-6, '长宽比 = ' + ratio.toFixed(4) + '（44.4 / 18）');

console.log('\n三、建模基准与记载比例一致');
const shipRatio = ZH.SHIP.length / ZH.SHIP.beam;
ok(Math.abs(shipRatio - ratio) < 1e-6,
   '模型长宽比 ' + shipRatio.toFixed(4) + ' = 记载长宽比 ' + ratio.toFixed(4));
ok(ZH.SHIP.hullDepth > ZH.SHIP.draft, '型深 > 吃水（干舷为正）');

console.log('\n四、桅位沿船长单调递增');
let mono = true;
for (let i = 1; i < ZH.MASTS.length; i++) {
  if (ZH.MASTS[i].t <= ZH.MASTS[i - 1].t) { mono = false; fails.push('桅位 t 未递增：' + ZH.MASTS[i].key); }
}
ok(mono, 'MASTS 的 t 从尾到首严格递增');
ok(ZH.MASTS[0].t > 0 && ZH.MASTS[ZH.MASTS.length - 1].t < 1, '全部桅位落在 (0, 1) 开区间内');

console.log('\n五、桅高单峰且峰值偏首');
const maxH = Math.max.apply(null, ZH.MASTS.map((m) => m.h));
const peaks = ZH.MASTS.filter((m) => m.h === maxH);
ok(peaks.length === 1, '最高桅唯一（' + peaks.map((m) => m.key).join(',') + '，h = ' + maxH + '）');
if (peaks.length === 1) {
  // 照参考图，最高桅落在首侧约 1/3 处
  ok(peaks[0].t >= 0.55 && peaks[0].t <= 0.72,
     '最高桅应落在 t∈[0.55,0.72]（实际 ' + peaks[0].t + '）');
}
const fore = ZH.MASTS.filter((m) => m.t > 0.5).sort((a, b) => a.t - b.t);
const aft = ZH.MASTS.filter((m) => m.t < 0.5).sort((a, b) => b.t - a.t);
ok(fore.every((m, i) => i === 0 || fore[i - 1].h > m.h), '前桅群桅高向首递减');
ok(aft.every((m, i) => i === 0 || aft[i - 1].h > m.h), '后桅群桅高向尾递减');

console.log('\n六、帆形须高窄（参考图特征）');
ok(ZH.RIG.sailAspect < 0.8,
   '帆宽/帆高 = ' + ZH.RIG.sailAspect + ' 应 < 0.8（越小越窄，v1 接近方形）');
ok(ZH.RIG.sailCamber > 0, '帆应有兜风弧度（sailCamber = ' + ZH.RIG.sailCamber + '）');

console.log('\n七、拆解分组覆盖');
const grouped = [];
ZH.EXPLODE_GROUPS.forEach((g) => g.parts.forEach((p) => grouped.push(p)));
ok(ZH.EXPLODE_GROUPS.length > 0, '拆解分组非空（' + ZH.EXPLODE_GROUPS.length + ' 组）');
const orders = ZH.EXPLODE_GROUPS.map((g) => g.order);
ok(orders.every((v, i) => i === 0 || orders[i - 1] < v), '分组 order 严格递增');
ok(grouped.indexOf('Mast') !== -1 && grouped.indexOf('Sail') !== -1, '分组含 Mast 与 Sail');
ok(grouped.indexOf('Bulkhead') !== -1, '分组含 Bulkhead（水密隔舱）');
ok(grouped.indexOf('Rudder') !== -1, '分组含 Rudder（大舵）');

console.log('\n八、隔舱数不低于实物推定下限');
ok(ZH.SHIP.bulkheadCount >= ZH.RECORD.bulkheadCountMin,
   '隔舱 ' + ZH.SHIP.bulkheadCount + ' ≥ 实物推定下限 ' + ZH.RECORD.bulkheadCountMin);

console.log('\n九、形制比例（照参考图）');
ok(ZH.SHIP.hullDepth > ZH.SHIP.draft, '型深 > 吃水（干舷为正）');
ok(ZH.SHIP.hullDepth / ZH.SHIP.length >= 0.09,
   '型深/总长 = ' + (ZH.SHIP.hullDepth / ZH.SHIP.length).toFixed(4) + ' 应 ≥ 0.09（v1 为 0.047）');
ok(Math.abs(ZH.SHIP.draft + ZH.SHIP.freeboard - ZH.SHIP.hullDepth) < 1e-9,
   '吃水 + 干舷 = 型深（双色分界自洽）');

console.log('\n共 ' + (nPass + nFail) + ' 项：' + nPass + ' 通过 / ' + nFail + ' 失败');
if (nFail) {
  console.log('\n失败项：\n  - ' + fails.join('\n  - '));
  process.exit(1);
}
console.log('参数层自检通过。');
