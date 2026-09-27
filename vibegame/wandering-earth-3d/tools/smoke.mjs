#!/usr/bin/env node
/**
 * 浏览器冒烟（可选）：起一个 Chromium 打开 index.html，按时间轴采样启动页 → 简报 → 局内。
 *
 * 用法：node tools/smoke.mjs            截图落到系统临时目录
 *       node tools/check.mjs --smoke   串在校验链最后一步
 *
 * 有 playwright 才跑；没装就打印跳过并正常退出（不阻塞校验链，也不参与打包）。
 * 冒烟只验「时序与状态」，不替代人工看画面 —— 截图路径会打在最后一行。
 */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const file = 'file:///' + path.join(process.cwd(), 'index.html').replace(/\\/g, '/');
const shots = path.join(os.tmpdir(), 'we3d-smoke');
const sleeps = (ms) => new Promise((r) => setTimeout(r, ms));

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('跳过：本机未装 playwright（npx playwright --version 可确认）'); process.exit(0); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

const snap = () => page.evaluate(() => ({
  loader: document.getElementById('loader').className,
  fill: document.getElementById('ld-fill').style.width,
  done: document.querySelectorAll('.ld-line.done').length,
  status: document.getElementById('ld-status').textContent,
  brief: document.getElementById('brief').className,
  fallback: document.getElementById('fallback').className,
  dash: document.getElementById('dash').className
}));

let bad = 0;
const expect = (cond, name, note) => {
  console.log((cond ? '✅ ' : '❌ ') + name + (note ? ' — ' + note : ''));
  if (!cond) bad++;
};

await page.goto(file);
await page.waitForTimeout(1200);
const a = await snap();
console.log('t≈1.2s', JSON.stringify(a));
expect(a.loader === '' && a.fallback === '', '启动页仍在（自检进行中，未走 fallback）', a.status);
expect(a.done >= 1 && parseFloat(a.fill) > 0, '自检清单与进度条在推进', a.done + ' 项 / ' + a.fill);
await page.screenshot({ path: path.join(shots, 'boot.png') });

// 地球极性：用「标记球」在浏览器里跑一遍同一套变换（红=北半球 / 蓝=南半球），
// 断言**镜头正对的是北极**（= 南极洲朝行进方向）。口径见 app.js EARTH_POLE_SIGN 的注释。
const appSrc = fs.readFileSync(path.join(process.cwd(), 'assets', 'app.js'), 'utf8');
const poleSign = Number((appSrc.match(/var EARTH_POLE_SIGN = (-?1)/) || [, '0'])[1]);
await page.evaluate((s) => { window.__POLE_SIGN__ = s; }, poleSign);
const pole = await page.evaluate(() => {
  const sign = window.__POLE_SIGN__;
  const THREE = window.THREE;
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#ff0000'; x.fillRect(0, 0, 64, 16);      // 等距圆柱贴图上半 = 北半球
  x.fillStyle = '#0000ff'; x.fillRect(0, 16, 64, 16);
  const tex = new THREE.CanvasTexture(c);
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(64, 64);
  const scene = new THREE.Scene();
  const group = new THREE.Group(); group.rotation.x = sign * Math.PI / 2;
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ map: tex })));
  scene.add(group);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  cam.position.set(0, 0, -4); cam.lookAt(0, 0, 0);        // 跟拍机位：在 -Z（航向是 +Z）
  renderer.render(scene, cam);
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  renderer.dispose();
  return px[0] > 128 && px[2] < 128 ? 'north' : (px[2] > 128 && px[0] < 128 ? 'south' : 'edge');
});
console.log('地球极性 镜头正对 ' + pole + '（EARTH_POLE_SIGN=' + poleSign + '）');
expect(poleSign !== 0, 'app.js 里能读到 EARTH_POLE_SIGN');
expect(pole === 'north', '南极洲朝行进方向（镜头正对的是北极，不是南极）',
  poleSign > 0 ? '符号 +1 会把南极送到镜头侧' : '符号 -1 正确');

await page.waitForTimeout(3000);
const b = await snap();
console.log('t≈4.2s', JSON.stringify(b));
expect(b.loader === 'hide', '自检走满后启动页撤屏', b.status);

await page.waitForTimeout(3000);
const c = await snap();
console.log('t≈7.2s', JSON.stringify(c));
expect(c.brief === 'show', '过场结束后简报弹出');
await page.screenshot({ path: path.join(shots, 'brief.png') });

await page.click('#bf-btn');
await page.waitForTimeout(300);
await page.mouse.move(195, 400);
await page.mouse.down();
await page.waitForTimeout(600);
await page.mouse.up();
await page.waitForTimeout(300);
const d = await snap();
console.log('局内', JSON.stringify(d));
expect(d.dash === '' && errs.length === 0, '点火后 HUD 在，且控制台零报错',
  errs.length ? errs.slice(0, 3).join(' | ') : 'no errors');
await page.screenshot({ path: path.join(shots, 'play.png') });

await browser.close();
console.log('\n截图：' + shots);
console.log(bad ? '冒烟失败 ' + bad + ' 项' : '冒烟通过');
process.exit(bad ? 1 : 0);
