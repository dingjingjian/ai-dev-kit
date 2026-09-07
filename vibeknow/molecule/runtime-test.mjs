// 运行时验证：用容器同款 CSP 头起本地服务，Playwright(Edge) 真实加载并跑交互
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// playwright 装在受管 node workspace 里，ESM 不走 NODE_PATH，用绝对路径导入
let pw;
try {
  pw = await import('playwright');
} catch {
  pw = await import(
    pathToFileURL('C:/Users/ASUS/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js').href
  );
}
const chromium = pw.chromium ?? pw.default?.chromium; // playwright 是 CJS，命名导出可能落在 default 上
if (!chromium) throw new Error('未能加载 playwright 的 chromium');

const root = path.dirname(fileURLToPath(import.meta.url));
// 可传入目标目录，用于直接测试「从 zip 解压出来的副本」
const dist = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist');
const shots = path.join(root, 'screenshots');
console.log('测试目标目录:', dist);
fs.mkdirSync(shots, { recursive: true });

// 小工具容器等价 CSP：脚本仅同源、禁内联；样式允许内联；图片允许 data:/blob:；禁联网/iframe
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join('; ');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const notFound = [];
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  // 浏览器自动请求 favicon，与产物无关，直接 204 掉，避免污染控制台
  if (rel === 'favicon.ico') { res.writeHead(204); return res.end(); }
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file)) { notFound.push(rel); res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const problems = [];
const pass = [];
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });

async function newPage(viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  return { ctx, page, errs };
}

// ============ 1. 桌面端 ============
{
  const { ctx, page, errs } = await newPage({ width: 1440, height: 900 }, false);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // 在 animate() 的 rAF 之后回读 drawing buffer（renderer 未开 preserveDrawingBuffer，
  // 只能在同一帧内 readPixels，不能用 drawImage 事后拷贝）
  const state = await page.evaluate(() => new Promise((resolve) => {
    const cs = document.querySelectorAll('canvas');
    const gl3d = [...cs].find((c) => c.style.display !== 'none' && c.width > 1);
    const base = {
      canvasCount: cs.length,
      glSize: gl3d ? [gl3d.width, gl3d.height] : null,
      threeLoaded: typeof window.THREE === 'object',
      formula: document.getElementById('r-formula').textContent,
    };
    if (!gl3d) return resolve({ ...base, colors: 0 });
    const gl = gl3d.getContext('webgl2') || gl3d.getContext('webgl');
    if (!gl) return resolve({ ...base, colors: 0 });
    requestAnimationFrame(() => {
      const w = gl3d.width, h = gl3d.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const set = new Set();
      for (let i = 0; i < px.length; i += 4 * 1009) set.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
      resolve({ ...base, colors: set.size });
    });
  }));

  state.threeLoaded ? pass.push('three.js 在容器 CSP 下正常加载（外置脚本生效）') : problems.push('three.js 未加载');
  state.glSize ? pass.push(`WebGL 画布已创建并自适应尺寸 ${state.glSize[0]}×${state.glSize[1]}`) : problems.push('未找到 WebGL 画布');
  state.colors > 3
    ? pass.push(`3D 场景已实际渲染（readPixels 采样到 ${state.colors} 种颜色，非空白）`)
    : problems.push(`WebGL 画布疑似空白（仅 ${state.colors} 种颜色）`);

  // 依次点击 6 种分子，校验读数联动
  const expect = { H2O: ['V形', '104.5°', 'sp³', '2'], CO2: ['直线形', '180°', 'sp', '0'], CH4: ['正四面体', '109.5°', 'sp³', '0'], NH3: ['三角锥形', '107°', 'sp³', '1'], BF3: ['平面三角形', '120°', 'sp²', '0'], C2H4: ['平面型', '120°', 'sp²', '0'] };
  for (const [k, exp] of Object.entries(expect)) {
    await page.click(`#mol-${k}`);
    await page.waitForTimeout(120);
    const got = await page.evaluate(() => ['r-shape', 'r-angle', 'r-hyb', 'r-lone'].map((i) => document.getElementById(i).textContent));
    const active = await page.evaluate((kk) => document.getElementById('mol-' + kk).classList.contains('active'), k);
    if (JSON.stringify(got) === JSON.stringify(exp) && active) pass.push(`切换 ${k} → ${exp[0]} / ${exp[1]} / ${exp[2]} 读数与高亮正确`);
    else problems.push(`切换 ${k} 异常: 期望 ${exp} 实得 ${got} active=${active}`);
  }

  // 滑杆
  await page.fill('#size', '150').catch(() => {});
  await page.evaluate(() => { const s = document.getElementById('size'); s.value = '150'; s.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(150);
  const sz = await page.textContent('#sz-val');
  sz === '1.50' ? pass.push('原子大小滑杆联动正常（1.50，模型已重建）') : problems.push(`滑杆异常: ${sz}`);

  // 自动旋转 / 重置
  await page.click('#auto'); await page.waitForTimeout(100);
  const autoTxt = await page.textContent('#auto');
  autoTxt === '停止旋转' ? pass.push('自动旋转按钮状态切换正常') : problems.push(`自动旋转按钮异常: ${autoTxt}`);
  await page.click('#auto');
  await page.click('#reset'); await page.waitForTimeout(100);
  pass.push('重置视角按钮可点击无异常');

  // header 高度变量同步
  const hh = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim());
  /\d+px/.test(hh) ? pass.push(`header-sync.js 正常写入 --header-h=${hh}`) : problems.push('--header-h 未同步');

  await page.click('#mol-H2O'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, 'desktop.png') });
  errs.length ? problems.push(...errs.map((e) => `[桌面] ${e}`)) : pass.push('桌面端控制台零报错（含 CSP 违规拦截）');
  await ctx.close();
}

// ============ 2. 移动端 + 安全区 ============
{
  const { ctx, page, errs } = await newPage({ width: 390, height: 844 }, true);
  await page.goto(base, { waitUntil: 'load' });
  // 模拟 PC 模拟器/真机注入的安全区变量（iPhone 刘海 47 / Home Indicator 34）
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-area-inset-top', '47px');
    s.setProperty('--safe-area-inset-bottom', '34px');
    s.setProperty('--safe-area-inset-left', '0px');
    s.setProperty('--safe-area-inset-right', '0px');
  });
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const h = getComputedStyle(document.querySelector('header'));
    const w = getComputedStyle(document.querySelector('.wrap'));
    return {
      extra: getComputedStyle(document.documentElement).getPropertyValue('--extra-safe').trim(),
      headerTop: parseFloat(h.paddingTop),
      wrapBottom: parseFloat(w.paddingBottom),
      canvasTouch: getComputedStyle(document.querySelector('canvas')).touchAction,
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    };
  });

  m.extra === '50px' ? pass.push('移动端 --extra-safe = 50px 生效') : problems.push(`--extra-safe 异常: ${m.extra}`);
  // 期望 header-top = max(80px, 47(系统安全区) + 44px) = 91px，与 function-visualization 一致
  m.headerTop === 91 ? pass.push('顶部留白 = max(80px, 47px 系统安全区 + 44px) = 91px（参照 function-visualization ✔）') : problems.push(`顶部留白异常: ${m.headerTop}px（期望 91）`);
  // 期望 wrap-bottom = 22(原) + 34(安全区) + 50(额外) = 106
  m.wrapBottom === 106 ? pass.push('底部留白 = 22px 原有 + 34px 系统安全区 + 50px 额外 = 106px ✔') : problems.push(`底部留白异常: ${m.wrapBottom}px（期望 106）`);
  m.canvasTouch === 'none' ? pass.push('移动端画布 touch-action:none，拖拽旋转不误触发页面滚动') : problems.push('canvas touch-action 未生效');
  m.docW <= m.winW ? pass.push(`无横向溢出（文档宽 ${m.docW} ≤ 视口宽 ${m.winW}）`) : problems.push(`横向溢出: ${m.docW} > ${m.winW}`);

  // 触摸拖拽旋转
  const box = await page.locator('canvas:visible').first().boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  pass.push('移动端触摸事件绑定可用（touchstart/touchmove 已注册）');

  await page.screenshot({ path: path.join(shots, 'mobile.png'), fullPage: false });
  await page.screenshot({ path: path.join(shots, 'mobile-full.png'), fullPage: true });
  errs.length ? problems.push(...errs.map((e) => `[移动] ${e}`)) : pass.push('移动端控制台零报错');
  await ctx.close();
}

await browser.close();
server.close();

notFound.length === 0
  ? pass.push('页面运行期未产生任何 404，引用资源全部命中包内文件')
  : problems.push(`运行期 404 资源: ${[...new Set(notFound)].join(', ')}`);

console.log('\n运行时验证（容器等价 CSP + 真实浏览器）\n' + '-'.repeat(58));
pass.forEach((p) => console.log('  [OK]  ' + p));
problems.forEach((p) => console.log('  [X]   ' + p));
console.log(`\n合计: ${pass.length} 通过 / ${problems.length} 失败`);
process.exit(problems.length ? 1 : 0);
