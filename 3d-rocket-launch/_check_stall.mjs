// 临时验证：新增益 f(d)=d+S·d/(C+d)（导数恒≥1，无平台期）
// 检查：显示高度单调且无停滞段；转弯可见(α=5°)时已离塔足够高；入轨仍闭合
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ctx0 = { window: {}, console, Math };
ctx0.globalThis = ctx0;
vm.createContext(ctx0);
for (const f of ['assets/math.js', 'assets/engine.js', 'assets/rocket.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx0, { filename: f });
}
const M3D = ctx0.window.M3D;
const KM = M3D.EARTH.kmPerUnit, TS = M3D.EARTH.timeScale;

function stubRenderer() {
  return {
    createMesh() { return { modelMatrix: new Float32Array(16), alpha: 1, visible: true, glow: 0 }; },
    particles: { spawn() {}, spawnSmoke() {}, reset() {}, update() {} }
  };
}

function run(S, C) {
  let src = fs.readFileSync(path.join(dir, 'assets/launch.js'), 'utf8');
  src = src.replace(
    'var gain = 1 + GAIN_A / Math.pow(1 + d / GAIN_TAU, 2);',
    'var gain = 1 + GAIN_A / (GAIN_TAU + d);'
  ).replace('var GAIN_A = 20, GAIN_TAU = 3;', 'var GAIN_A = ' + S + ', GAIN_TAU = ' + C + ';');
  vm.runInContext(src, ctx0, { filename: 'launch.js' });
  const L = M3D.createLaunchSystem(stubRenderer(), M3D.buildCZ2F(stubRenderer()), M3D.buildPad(stubRenderer()), {});
  const st = L.state;
  L.ignite();
  const samples = [];
  let prevVis = -1, minRate = 1e9, onsetVis = -1, lastT = 0, lastVis = 0, tIns = -1;
  for (let i = 0; i < 60 * 120; i++) {
    L.update(1 / 60, { distance: 20, fitDist: 5200 });
    L.updateDetachedParts(1 / 60);
    if (onsetVis < 0 && st.alpha > 5 * Math.PI / 180) onsetVis = st.altVis;
    if (st.altVis < prevVis - 1e-9) console.log('  !! 显示高度倒退 t=' + st.t.toFixed(2));
    // 爬速（显示单位/任务秒），每秒结算一次
    if (st.t - lastT >= 1) {
      const rate = (st.altVis - lastVis) / ((st.t - lastT) * TS);
      if (rate < minRate && st.t > 2 && !st.inserted) minRate = rate;
      lastT = st.t; lastVis = st.altVis;
    }
    prevVis = st.altVis;
    const met = Math.round(st.met);
    if (met % 30 === 0 && met / 30 <= 12 && samples.length < met / 30 + 1 && samples[samples.length - 1]?.met !== met) {
      samples.push({ met, vis: st.altVis, phys: st.alt * KM, a: st.alpha * 180 / Math.PI });
    }
    if (st.inserted) { tIns = st.t; break; }
  }
  return { samples, minRate, onsetVis, tIns, peak: st.alt * KM };
}

console.log('S=35 C=2.5（饱和加注式）:');
const r = run(35, 2.5);
console.log('MET | 显示高度(单位) | 真实高度(km) | 倾角');
for (const s of r.samples) {
  console.log(String(s.met).padStart(4) + ' | ' + s.vis.toFixed(1).padStart(8) + ' | ' + s.phys.toFixed(0).padStart(6) + ' | ' + s.a.toFixed(1) + '°');
}
console.log('最小显示爬速(单位/任务秒) = ' + r.minRate.toFixed(3) + '（>0 即无停滞）');
console.log('转弯可见时显示高度 = ' + r.onsetVis.toFixed(1) + ' 单位（塔高 9.6）');
console.log('入轨 t=' + r.tIns.toFixed(1) + 's（MET ' + (r.tIns * TS / 60).toFixed(2) + ' min），入轨高度 ' + r.peak.toFixed(0) + ' km');
