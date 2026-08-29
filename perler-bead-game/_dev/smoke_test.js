/**
 * 小工具包运行时冒烟测试（jsdom）
 * 目的：验证脚本外置后 index.html + main.js 能真正跑起来，
 *      并模拟容器 CSP（禁止内联脚本）来确认页面未依赖内联执行。
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist', 'index.html');
const errors = [];
const logs = [];

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  // jsdom 自身未实现的 API 单独归类，不算业务错误
  errors.push({ kind: e.message.includes('Not implemented') ? 'notimpl' : 'error', msg: e.message, stack: e.stack });
});
vc.on('error', (m) => errors.push({ kind: 'error', msg: String(m) }));

// —— 沙箱补丁：jsdom 不具备的浏览器能力 ——
const patches = `
  // Canvas 2D：返回万能 Proxy，任何方法调用都不报错
  const ctxProxy = new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return document.createElement('canvas');
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop(){} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === 'string' && /^(fillStyle|strokeStyle|font|lineWidth|globalAlpha|lineCap|lineJoin|textAlign|textBaseline|shadowBlur|shadowColor|globalCompositeOperation|filter|imageSmoothingEnabled)$/.test(k))
        return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  HTMLCanvasElement.prototype.getContext = function(){ return ctxProxy; };
  HTMLCanvasElement.prototype.toDataURL = function(){ return 'data:image/png;base64,AA=='; };

  // WebAudio
  const AudioNodeStub = () => new Proxy(function(){}, {
    get(t,k){ if(k==='gain'||k==='frequency'||k==='Q'||k==='detune'||k==='playbackRate')
                 return { value:1, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} };
               if(k==='buffer') return null; return ()=>{}; },
    set(){ return true; }, apply(){ return new Proxy({}, { get:()=>()=>{} }); }
  });
  class FakeAudioContext {
    constructor(){ this.currentTime = 0; this.sampleRate = 44100;
      this.state = 'running'; this.destination = AudioNodeStub(); }
    createGain(){ return AudioNodeStub(); }
    createOscillator(){ return AudioNodeStub(); }
    createBiquadFilter(){ return AudioNodeStub(); }
    createBufferSource(){ return AudioNodeStub(); }
    createBuffer(){ return { getChannelData: () => new Float32Array(1024), length:1024, duration:1 }; }
    decodeAudioData(){ return Promise.resolve({}); }
    resume(){ return Promise.resolve(); }
    close(){ return Promise.resolve(); }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;

  // 布局：jsdom 无排版引擎，给元素一个可用的尺寸
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth',  { get(){ return 360; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get(){ return 640; } });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth',  { get(){ return 360; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get(){ return 640; } });
  Element.prototype.getBoundingClientRect = function(){
    return { x:0, y:0, top:0, left:0, right:360, bottom:640, width:360, height:640 };
  };
  window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
`;

(async () => {
  const dom = await JSDOM.fromFile(DIST, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.eval(patches);
    },
  });

  await new Promise((r) => setTimeout(r, 1200)); // 等外部脚本加载 + init 执行

  const { window } = dom;
  const doc = window.document;

  // —— 断言 1：脚本确实执行了（外置 JS 生效） ——
  const scriptRan = window.__pbgProbe === undefined
    ? null : window.__pbgProbe;
  const hasCanvas = !!doc.getElementById('bgCanvas');
  const board = doc.getElementById('board') || doc.querySelector('.board');
  const toolBtns = doc.querySelectorAll('.tool').length;
  const swatches = doc.querySelectorAll('.swab').length;
  const patName = (doc.getElementById('patName') || {}).textContent || '';

  // 通过 DOM 被 JS 填充来判断脚本执行
  const filled = doc.body.innerHTML.length;
  const modalShown = /show/.test((doc.getElementById('homeSheet') || doc.getElementById('sheetGallery') || { className: '' }).className || '');

  console.log('—— 运行时冒烟结果 ——');
  console.log('外部脚本已加载执行 :', typeof window.__pbgInitDone === 'boolean' ? window.__pbgInitDone : '(探针未埋点，改用 DOM 判据)');
  console.log('body 内容字节      :', filled);
  console.log('#bgCanvas 存在     :', hasCanvas);
  console.log('.tool 按钮数量     :', toolBtns);
  console.log('.swab 色珠数量     :', swatches);
  console.log('棋盘元素           :', board ? board.tagName + '#' + board.id : '未找到');
  console.log('当前图案名         :', (patName || '(无)').trim());

  // —— 交互闭环测试：选色 → 选工具 → 在棋盘上落豆 ——
  const fire = (el, type, extra = {}) => {
    const Ev = type.startsWith('pointer') ? window.PointerEvent || window.MouseEvent : window.MouseEvent;
    const e = new Ev(type, Object.assign({ bubbles: true, cancelable: true, clientX: 180, clientY: 320 }, extra));
    if (e.pointerId === undefined) Object.defineProperty(e, 'pointerId', { value: 1 });
    el.dispatchEvent(e);
  };
  const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  // 完整复算 computeLayout()：stage 可用区 -> cell / pad / boardPx
  const ring = doc.getElementById('pctRing');
  const N = 13;
  const b = doc.getElementById('board');
  const stage = doc.querySelector('.stage');
  const cs = window.getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) || 0, padY = parseFloat(cs.paddingTop) || 0;
  const availW = stage.clientWidth - padX * 2, availH = stage.clientHeight - padY * 2;
  const avail = Math.max(N * 4, Math.floor(Math.min(availW, availH)));
  let cell = Math.max(4, Math.floor(avail / (N + 1.1)));
  let pad = Math.max(12, Math.round(cell * 0.42));
  let boardPx = cell * N + pad * 2;
  if (boardPx > avail) {
    cell = Math.max(4, cell - 1);
    pad = Math.max(12, Math.round(cell * 0.42));
    boardPx = cell * N + pad * 2;
  }
  const geoOk = b.style.width === boardPx + 'px';   // 用真实写入值校验复算是否一致
  const at = (i, j) => ({ clientX: pad + i * cell + cell / 2, clientY: pad + j * cell + cell / 2 });
  const pct = () => 106.8 - parseFloat((ring && ring.style.strokeDashoffset) || '106.8');

  // 从 main.js 解析「太极」目标图案，按正确颜色逐格落豆（避免用四舍五入的进度当判据）
  const jsSrc = require('fs').readFileSync(path.resolve(__dirname, '..', 'main.js'), 'utf8');
  const blk = jsSrc.match(/"id":\s*"taiji"[\s\S]*?"grid":\s*\[([\s\S]*?)\]/);
  const grid = [...blk[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const swabByCode = {};
  [...doc.querySelectorAll('.swab')].forEach((s) => { swabByCode[s.dataset.code] = s; });

  let placed = 0, targetCount = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const ch = grid[j][i];
      if (!ch || ch === '.') continue;
      targetCount++;
      click(doc.querySelector('[data-tool=pen]'));
      click(swabByCode[ch]);
      if (swabByCode[ch]) {
        fire(b, 'pointerdown', at(i, j)); fire(b, 'pointerup', at(i, j));
        placed++;
      }
    }
  }
  await new Promise((r) => setTimeout(r, 800));

  const pctVal = Math.round((pct() / 106.8) * 100);
  const winShown = /show/.test((doc.getElementById('winModal') || { className: '' }).className || '');
  const winStars = (doc.getElementById('winStars') || {}).textContent || '';
  const winTime = (doc.getElementById('winTime') || {}).textContent || '';
  console.log('\n—— 交互闭环（拼完整幅图）——');
  console.log('棋盘 cell/pad/boardPx:', cell, '/', pad, '/', boardPx, geoOk ? '✅ 与实际一致' : '⚠ 复算不一致');
  console.log('目标豆数 / 已落豆   :', targetCount, '/', placed);
  console.log('完成度             :', pctVal + '%', pctVal === 100 ? '✅' : '⚠');
  console.log('胜利弹窗已弹出     :', winShown, winShown ? `(星级 ${winStars}，用时 ${winTime})` : '');

  click(doc.getElementById('winReplay'));                        // 重玩
  await new Promise((r) => setTimeout(r, 300));
  console.log('重玩后完成度归零   :', Math.round(pct()) + '%', Math.round(pct()) === 0 ? '✅' : '⚠');
  click(doc.querySelector('[data-tool=more]'));                  // 打开更多菜单
  await new Promise((r) => setTimeout(r, 200));
  console.log('更多菜单已展开     :', /show/.test((doc.getElementById('moreMenu') || { className: '' }).className || ''));

  const real2 = errors.filter((e) => e.kind === 'error');
  console.log('\n业务级运行时错误   :', real2.length);
  real2.slice(0, 8).forEach((e) => console.log('   ✗', e.msg.split('\n')[0]));
  const notimpl2 = errors.filter((e) => e.kind === 'notimpl');
  console.log('jsdom 未实现 API   :', notimpl2.length, '(非业务错误)');
  notimpl2.slice(0, 5).forEach((e) => console.log('   ·', e.msg.split('\n')[0]));

  // —— 断言 2：CSP 静态复核（容器禁止内联脚本）——
  const html = require('fs').readFileSync(DIST, 'utf8');
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>/i.test(html);
  const inlineEvent = /\son[a-z]+\s*=\s*["']/i.test(html);
  console.log('\n—— CSP 静态复核 ——');
  console.log('无内联 <script>    :', !inlineScript);
  console.log('无行内事件 on*=    :', !inlineEvent);

  const ok = real2.length === 0 && !inlineScript && !inlineEvent && filled > 5000 && toolBtns > 0 && swatches > 0;
  console.log('\n结论:', ok ? '✅ 冒烟通过' : '❌ 存在问题');
  dom.window.close();
  process.exit(ok ? 0 : 1);
})();
