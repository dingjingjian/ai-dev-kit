// 渲染冒烟：把每个天体的每条绘制路径都跑一遍，确认不抛错。
//
// 存在理由：vfx.js 里每个天体都有独立的程序化纹理分支，靠切换 pl.id / pl.kind 分流，
// 加天体时极易漏分支或写错字段名。这类错误在无头环境里不会自己冒出来，
// 只有真机打开对应界面才炸，必须在这里挡住。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

// canvas 2d 上下文桩：任何方法都接受，渐变对象只需有 addColorStop
function makeCtx() {
  const store = { canvas: { width: 320, height: 480 } };
  return new Proxy(store, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return () => ({ width: 12 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern')
        return () => ({ addColorStop() {} });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

const sandbox = { console, performance: { now: () => 0 } };
sandbox.window = sandbox;
sandbox.document = {
  createElement: tag => (tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => makeCtx() }
    : { style: {}, appendChild() {}, addEventListener() {} })
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/data.js'), 'utf8'), sandbox, { filename: 'data.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'src/vfx.js'), 'utf8'), sandbox, { filename: 'vfx.js' });
const SV = sandbox.SV, V = sandbox.SV.vfx;

const ctx = makeCtx();
const run = (label, fn) => {
  try { fn(); ok(true, label); }
  catch (e) { ok(false, label + ' — ' + e.message); }
};

console.log('\n=== 渲染冒烟：全部天体 × 全部绘制路径 ===\n');

console.log('[1] 天体纹理与行星本体（planetTex → drawPlanet）');
for (const pl of SV.PLANETS) {
  run(`${pl.name}（${pl.kind}）纹理 + 本体`, () => {
    for (const R of [6, 14, 40, 90]) {
      V.drawPlanet(ctx, 160, 240, R, pl, 1234, { spinSpeed: 0.012 });
      V.drawPlanet(ctx, 160, 240, R, pl, 4321, { noHalo: true });
    }
  });
}

console.log('\n[2] 小行星带必须走碎块带分支，不能是星球');
{
  const belt = SV.planetById('belt');
  ok(belt.kind === 'belt', '小行星带 kind = belt');
  // 碎块带：drawPlanet 内部应转调 drawBeltField，且两者结果一致（都不画球体）
  ok(typeof V.drawBeltField === 'function', '存在独立的 drawBeltField');
  run('drawBeltField 直接调用', () => V.drawBeltField(ctx, 160, 240, 40, belt, 999, {}));
  // 球体绘制的专属步骤：drawImage（贴图滚动 = 自转）与 clip（裁成圆形轮廓）。
  // 碎块带两个都不该有 —— 有的话就说明它又被当成球画了。
  const spyOn = () => {
    const n = { clip: 0, drawImage: 0 };
    const spy = new Proxy({}, {
      get(t, p) {
        if (p === 'clip') return () => { n.clip++; };
        if (p === 'drawImage') return () => { n.drawImage++; };
        if (p === 'measureText') return () => ({ width: 12 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set() { return true; }
    });
    return { spy, n };
  };
  const a = spyOn();
  V.drawPlanet(a.spy, 160, 240, 40, belt, 999, {});
  ok(a.n.drawImage === 0, `碎块带不做贴图滚动（球面自转专用），drawImage ${a.n.drawImage} 次`);
  ok(a.n.clip === 0, `碎块带不裁剪圆形轮廓（球面专用），clip ${a.n.clip} 次`);
  // 对照：真正的星球应该两步都用上
  const b = spyOn();
  V.drawPlanet(b.spy, 160, 240, 40, SV.planetById('earth'), 999, {});
  ok(b.n.drawImage > 0 && b.n.clip > 0,
    `对照组：地球走球体分支（drawImage ${b.n.drawImage} 次 / clip ${b.n.clip} 次）`);
}

console.log('\n[3] 基地场景（含气态 / 冰巨星的浮空站云顶）');
for (const pl of SV.PLANETS) {
  if (!pl.canBase) continue;
  run(`${pl.name}基地场景${(pl.kind === 'gas' || pl.kind === 'ice') ? '（浮空站）' : ''}`, () => {
    V.drawBaseScene(ctx, 320, 480, 2000, pl,
      { mine: 2, lab: 1, refinery: 1, farm: 1, hab: 2 }, pl.dist);
  });
}

console.log('\n[4] 其他场景');
run('首屏 drawIntro', () => V.drawIntro(ctx, 320, 480, 1500));
run('太阳 drawSun', () => V.drawSun(ctx, 80, 80, 13, 1500));

console.log('\n' + (fail ? `✗ ${fail} 项未通过` : '✓ 全部通过'));
process.exit(fail ? 1 : 0);
