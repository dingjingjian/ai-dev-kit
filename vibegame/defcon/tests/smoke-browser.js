/*
 * defcon — tests/smoke-browser.js
 * 浏览器冒烟：用 Playwright 起真实 Chromium/Edge 打开 index.html，
 * 校验控制台报错、WebGL 启动、HUD 填充，并真实点击一次「事件卡选项」与一次「敌方城市发射」。
 * 不进提交包。
 *
 * ⚠ 必须同时跑 http:// 与 file:// 两个通道：
 *   本工具的真实使用场景是「打 zip 后双击 index.html」，即 file:// 协议。
 *   而 file:// 下 Chrome 把本地图片的 origin 视为 null，会以 CORS 拒绝它作为 WebGL 纹理
 *   —— 早期版本只跑 http，贴图问题因此完全漏检，交付出去是个没有地球的灰蓝素球。
 *   教训：冒烟环境必须复刻真实打开方式，否则测试只证明了「在它的环境里能跑」。
 *
 * 运行：node tests/smoke-browser.js
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var PORT = 8731;

var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' };

function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rep) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      var f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nope'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.listen(PORT, function () { res(srv); });
  });
}

// playwright 不装在工程里，而是在托管的 node workspace —— 绝对路径随机器变化，
// 写死等于换台电脑就跑不了。用环境变量覆盖，未设时回落到默认安装位置。
var PLAYWRIGHT = process.env.DC_PLAYWRIGHT ||
  'C:/Users/dingj/.workbuddy/binaries/node/workspace/node_modules/playwright';
var EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

/* 画面体检（可编程，不靠肉眼看图）：手动渲染一帧后立刻 readPixels，
 * 统计近白像素占比与平均亮度。城市光点尺寸写错时会把整屏染白，这个指标会直接炸。
 * 注意：必须在同一个 JS 任务里「渲染 → 读像素」，否则缓冲区已被交换清空。 */
function sampleShot(page) {
  return page.evaluate(function () {
    var cv = document.getElementById('stage');
    var gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (!gl) return { err: 'no gl', whiteFrac: 1, meanLum: 999 };
    window.DC.render.frame(window.DC.game.state, 0);
    var w = cv.width, h = cv.height;
    var buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    var white = 0, sum = 0, n = w * h;
    for (var i = 0; i < n; i++) {
      var r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2];
      if (r > 240 && g > 240 && b > 240) white++;
      sum += (r * 0.299 + g * 0.587 + b * 0.114);
    }
    return { w: w, h: h, whiteFrac: white / n, meanLum: sum / n };
  });
}

async function runCase(browser, opt) {
  // 竖屏移动端视口：本作重构后就是竖屏游戏，冒烟必须复刻真实画面比例，
  // 否则竖屏特有问题（横向溢出、抽屉遮挡、镜头取景）全部漏检。
  var page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  var errors = [], reqFails = [];
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', function (e) { errors.push('PAGEERROR: ' + e.message); });
  page.on('requestfailed', function (r) { reqFails.push(r.url().split('/').pop()); });

  await page.goto(opt.url, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  /* 开局必须先选阵营：没选之前不会 create state、也不会 init 渲染，
   * 后面所有探测项（phase / 阵营行 / 城市行 / WebGL）读到的全是空值。 */
  var setupProbe = await page.evaluate(function () {
    var s = document.getElementById('setup');
    return {
      setupShown: !!s && s.classList.contains('show'),
      pickCount: document.getElementById('pickList').children.length,
      gameNull: !window.DC || !window.DC.game
    };
  });
  await page.click('#pickList .pick:nth-child(1)');
  await page.waitForTimeout(1500);

  var probe = await page.evaluate(function () {
    var g = function (id) { return document.getElementById(id); };
    return {
      hasDC: typeof window.DC === 'object',
      renderOk: !!(window.DC && window.DC.render && window.DC.render.ok),
      texOk: !!(window.DC && window.DC.render && window.DC.render.texOk),
      autoPlay: window.DC && window.DC.game ? window.DC.game.autoPlay : null,
      inlineTex: typeof window.DC_EARTH_TEX === 'string' && window.DC_EARTH_TEX.length > 1000,
      phase: window.DC && window.DC.game ? window.DC.game.state.phase : null,
      gpu: (function () {
        var cv = document.getElementById('stage');
        var gl = cv && (cv.getContext('webgl2') || cv.getContext('webgl'));
        if (!gl) return 'none';
        var d = gl.getExtension('WEBGL_debug_renderer_info');
        return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      })(),
      factionRows: g('fList') ? g('fList').children.length : 0,
      cityRows: g('cList') ? g('cList').children.length : 0,
      cityTotal: window.DC ? window.DC.CITIES.length : 0,
      legendRows: document.querySelectorAll('#legend .lrow').length,
      maxBtn: !!g('cMax'),
      bloomOk: !!(window.DC && window.DC.render && window.DC.render.bloomOk),
      /* 量横向溢出时要先把抽屉摘掉：它靠 transform:translateX(100%) 停在屏幕外，
       * 会按自身宽度（84% 视口）撑大 #app 的 scrollWidth。而 #app 本身 overflow:hidden，
       * 用户既看不到也滚不动 —— 把抽屉算进来只会得到一个恒为 328px 的假警报。
       * 真正要防的是常驻 HUD（顶栏 / 底栏 / 事件卡）把布局撑破。 */
      overflowX: (function () {
        var a = g('app'), d = g('drawer');
        var prev = d ? d.style.display : '';
        if (d) d.style.display = 'none';
        var v = a.scrollWidth - a.clientWidth;
        if (d) d.style.display = prev;
        return v;
      })(),
      fallbackShown: g('fallback') ? g('fallback').classList.contains('show') : false
    };
  });
  var shot1 = await sampleShot(page);
  await page.screenshot({ path: path.join(ROOT, 'docs', opt.shotA) });

  /* 危机博弈：把 briefing 计时压到临界，让主循环自然翻到 crisis 发出事件卡，
   * 然后真实点第 2 个选项（索引 1）。 */
  await page.evaluate(function () {
    window.DC.game.state.t = window.DC.CONFIG.briefingSeconds - 0.3;
  });
  await page.waitForTimeout(1200);
  var cardProbe = await page.evaluate(function () {
    var g = function (id) { return document.getElementById(id); };
    var st = window.DC.game.state;
    return {
      phase: st.phase,
      cardShown: g('card').classList.contains('show'),
      optCount: g('cOpts').children.length,
      warbarShown: g('warbar').classList.contains('show')
    };
  });
  await page.click('#cOpts .opt:nth-child(2)');
  var pickProbe = await page.evaluate(function () {
    var st = window.DC.game.state;
    var sel = document.querySelectorAll('#cOpts .opt.sel');
    return {
      choice: st.choices[st.playerFaction],
      selCount: sel.length,
      selIndex: sel.length ? parseInt(sel[0].getAttribute('data-opt'), 10) : -1
    };
  });

  /* 热核战争：推过危机阈值，进 war 后点敌方城市发射。 */
  await page.evaluate(function () {
    var st = window.DC.game.state;
    st.phase = 'crisis'; st.crisis = 95;
    st.t = window.DC.CONFIG.roundSeconds - 0.3;
  });
  await page.waitForTimeout(1500);
  var warPre = await page.evaluate(function () {
    var st = window.DC.game.state;
    return {
      phase: st.phase,
      ammo: window.DC.sim.totalMissiles(st, st.playerFaction),
      // 核弹梯度（§11.1）后各阵营弹头数不同，写死 18 只会对 ALFA 之外的阵营误报
      ammoFull: window.DC.factionMissiles(st.playerFaction),
      launched: st.stats[st.playerFaction].launched,
      warbarShown: document.getElementById('warbar').classList.contains('show'),
      cardShown: document.getElementById('card').classList.contains('show')
    };
  });
  /* 两段式发射：第一下只是选中目标（不发射、抽屉自动收起、发射键解锁），
   * 第二下按「发 射」才真的出弹 —— 核弹不可逆，冒烟必须把这两段分别断掉。 */
  await page.click('#drawerBtn');
  await page.waitForTimeout(350);
  var drawerOpen = await page.evaluate(function () {
    return document.getElementById('drawer').classList.contains('open');
  });
  await page.click('#cList .crow.tgt');
  await page.waitForTimeout(600);
  var selProbe = await page.evaluate(function () {
    var st = window.DC.game.state;
    return {
      pending: window.DC.ui.getPending(),
      launched: st.stats[st.playerFaction].launched,
      drawerOpen: document.getElementById('drawer').classList.contains('open'),
      fireDisabled: document.getElementById('fireBtn').disabled
    };
  });
  await page.click('#fireBtn');
  await page.waitForTimeout(600);
  var warPost = await page.evaluate(function () {
    var st = window.DC.game.state;
    return {
      launched: st.stats[st.playerFaction].launched,
      ammo: window.DC.sim.totalMissiles(st, st.playerFaction)
    };
  });

  await page.waitForTimeout(22000);        // 让导弹飞完、特效跑一轮
  var war = await page.evaluate(function () {
    var st = window.DC.game.state;
    var launched = 0, intercepts = 0;
    Object.keys(st.stats).forEach(function (k) {
      launched += st.stats[k].launched;
      intercepts += st.stats[k].intercepts;
    });
    return { phase: st.phase, launched: launched, intercepts: intercepts };
  });
  var shot2 = await sampleShot(page);
  await page.screenshot({ path: path.join(ROOT, 'docs', opt.shotB) });
  await page.close();

  // 已知无害噪声：逐条写明理由，且仍会打印出来，绝不静默吞掉。
  var ALLOWED = [
    { re: /earth\.jpg/i, why: '内联贴图已是首选外链 earth.jpg 仅作兜底，加载失败属预期' },
    { re: /VALIDATE_STATUS false/i, why: 'SwiftShader 软渲染伪影，真实 GPU 下不出现' },
    { re: /favicon\.ico/i, why: '浏览器自动请求，已用 data:, 内联图标抑制' }
  ];
  var allowedHits = [], real = [];
  errors.forEach(function (e) {
    var hit = ALLOWED.filter(function (a) { return a.re.test(e); })[0];
    if (hit) allowedHits.push(e.slice(0, 90) + '  ← ' + hit.why);
    else real.push(e);
  });
  return {
    opt: opt, setupProbe: setupProbe, probe: probe, shot1: shot1, cardProbe: cardProbe, pickProbe: pickProbe,
    warPre: warPre, drawerOpen: drawerOpen, selProbe: selProbe, warPost: warPost, war: war, shot2: shot2,
    errors: real, knownNoise: allowedHits,
    reqFails: reqFails.filter(function (u) { return !/earth\.jpg|favicon/i.test(u); })
  };
}

function verdict(r) {
  var p = r.probe, c = r.cardProbe, k = r.pickProbe, w = r.warPre, s2 = r.selProbe, q = r.warPost,
      s = r.setupProbe, bad = [];
  if (!s.setupShown) bad.push('开局未弹出阵营选择');
  if (s.pickCount !== 6) bad.push('阵营按钮数 ' + s.pickCount);
  if (!s.gameNull) bad.push('选阵营前就已建局');
  if (!p.hasDC) bad.push('window.DC 缺失');
  if (!p.renderOk) bad.push('WebGL 未启动');
  if (!p.bloomOk) bad.push('bloom 后处理未启用');
  if (p.overflowX > 0) bad.push('竖屏横向溢出 ' + p.overflowX + 'px');
  if (!p.texOk) bad.push('地球贴图未加载（走了纯色兜底）');
  if (!p.inlineTex) bad.push('内联贴图 DC_EARTH_TEX 未注入');
  if (p.autoPlay !== false) bad.push('玩家席位被 AI 托管');
  if (p.fallbackShown) bad.push('兜底界面误触发');
  if (p.factionRows !== 6) bad.push('阵营行数 ' + p.factionRows);
  if (p.cityRows !== p.cityTotal) bad.push('城市行数 ' + p.cityRows + '（数据层 ' + p.cityTotal + '）');
  if (p.legendRows !== 4) bad.push('图例行数 ' + p.legendRows);
  if (!p.maxBtn) bad.push('缺少常驻拉满按钮');
  if (c.phase !== 'crisis' || !c.cardShown) bad.push('事件卡未显示');
  if (c.optCount < 2 || c.optCount > 3) bad.push('选项数 ' + c.optCount);
  if (k.choice !== 1 || k.selCount !== 1 || k.selIndex !== 1) bad.push('选项点击未生效');
  /* 弹头数不再与满编做硬等：危机博弈期的补弹卡（add_missiles）会改变开战时的存量，
   * 同一份代码两次跑出 24 / 32 都合法 —— 硬等满编等于把随机事件卡当成缺陷。
   * 这里只断真正要保的语义：进了 war，且手里有弹可打。 */
  if (w.phase !== 'war' || w.ammo <= 0) bad.push('未进入 war 或无弹可打（' + w.ammo + '）');
  if (!w.warbarShown || w.cardShown) bad.push('战争条/卡片互斥失败');
  if (!r.drawerOpen) bad.push('抽屉打不开');
  if (!s2.pending) bad.push('点城市行未选中目标');
  if (s2.launched !== w.launched) bad.push('选目标阶段误发射');
  if (s2.drawerOpen) bad.push('选完目标抽屉未收起（会盖住发射条）');
  if (s2.fireDisabled) bad.push('选中目标后发射键仍禁用');
  if (q.launched !== w.launched + 1) bad.push('确认发射未生效');
  if (q.ammo !== w.ammo - 1) bad.push('弹头未扣减');
  if (r.shot1.whiteFrac > 0.08 || r.shot1.meanLum > 120) bad.push('首屏画面过曝');
  if (r.shot2.whiteFrac > 0.08 || r.shot2.meanLum > 160) bad.push('核战画面过曝');
  if (r.errors.length) bad.push('控制台错误 ' + r.errors.length + ' 条');
  if (r.reqFails.length) bad.push('资源加载失败 ' + r.reqFails.join(','));
  return bad;
}

(async function () {
  var srv = await serve();
  var pw;
  try { pw = require(PLAYWRIGHT); }
  catch (e) { console.log('未找到 playwright，跳过浏览器冒烟'); srv.close(); process.exit(0); }

  // 默认走真实 GPU。SwiftShader（软件渲染）仅作为 CI 兜底，需显式设 DC_SMOKE_SWIFTSHADER=1。
  // 原因：SwiftShader 在创建首个 program 时会误报
  //   THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false（Program Info Log 为空）
  // 而真实 GPU（ANGLE D3D11）下同一份代码零报错——逐个材质强制 needsUpdate 重编译也全部干净，
  // 说明它是软渲染驱动的伪影，不是本项目代码缺陷。用真 GPU 跑才能反映用户实际看到的画面。
  var useSwift = !!process.env.DC_SMOKE_SWIFTSHADER;
  var browser = await pw.chromium.launch({
    executablePath: fs.existsSync(EDGE) ? EDGE : undefined,
    args: useSwift ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] : []
  });

  var cases = [
    {
      label: 'http:// 本地服务', url: 'http://127.0.0.1:' + PORT + '/index.html',
      shotA: 'screenshot-d3.png', shotB: 'screenshot-war.png'
    },
    {
      label: 'file:// 双击打开（真实交付场景）',
      url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'),
      shotA: 'screenshot-file-d3.png', shotB: 'screenshot-file-war.png'
    }
  ];

  var results = [];
  for (var i = 0; i < cases.length; i++) results.push(await runCase(browser, cases[i]));
  await browser.close();
  srv.close();

  console.log('\n==== DEFCON 浏览器冒烟（D3 渲染 + D4 交互）====');
  var allBad = [];
  results.forEach(function (r) {
    var p = r.probe, c = r.cardProbe, k = r.pickProbe, w = r.warPre, q = r.warPost;
    var bad = verdict(r);
    console.log('\n── ' + r.opt.label + ' ──');
    console.log('  开局阵营选择          : ' + (r.setupProbe.setupShown ? '✓' : '✗') +
      ' / 阵营按钮 ' + r.setupProbe.pickCount + ' / 选前未建局 ' + (r.setupProbe.gameNull ? '✓' : '✗'));
    console.log('  GPU 后端              : ' + p.gpu);
    console.log('  WebGL / 兜底界面      : ' + (p.renderOk ? '✓' : '✗') + ' / ' + (p.fallbackShown ? '✗ 误触发' : '✓'));
    console.log('  地球贴图已加载        : ' + (p.texOk ? '✓' : '✗ 走了纯色兜底'));
    console.log('  内联贴图已注入        : ' + (p.inlineTex ? '✓' : '✗'));
    console.log('  玩家席位未被托管      : ' + (p.autoPlay === false ? '✓' : '✗'));
    console.log('  阵营/城市/图例行数     : ' + p.factionRows + ' / ' + p.cityRows + ' / ' + p.legendRows +
      '   拉满按钮 ' + (p.maxBtn ? '✓' : '✗'));
    console.log('  首屏 近白/亮度        : ' + (r.shot1.whiteFrac * 100).toFixed(2) + '% / ' + r.shot1.meanLum.toFixed(1));
    console.log('  事件卡 选项数/点击后  : ' + c.optCount + ' / choice=' + k.choice + ' sel=' + k.selCount);
    console.log('  war 弹头 / 点击发射   : ' + w.ammo + ' / ' + w.launched + '→' + q.launched + '（余 ' + q.ammo + '）');
    console.log('  全场发射 / 拦截       : ' + r.war.launched + ' / ' + r.war.intercepts);
    console.log('  战争画面 近白/亮度    : ' + (r.shot2.whiteFrac * 100).toFixed(2) + '% / ' + r.shot2.meanLum.toFixed(1));
    console.log('  控制台错误 / 资源失败 : ' + (r.errors.length ? '✗ ' + r.errors.length : '✓') + ' / ' +
                (r.reqFails.length ? '✗ ' + r.reqFails.join(',') : '✓'));
    r.errors.slice(0, 6).forEach(function (e) { console.log('      · ' + e.slice(0, 200)); });
    if (r.knownNoise.length) {
      console.log('  已知无害噪声 ' + r.knownNoise.length + ' 条（已豁免）:');
      r.knownNoise.slice(0, 6).forEach(function (e) { console.log('      · ' + e); });
    }
    if (bad.length) {
      console.log('  ✗ 未通过：' + bad.join('；'));
      allBad.push(r.opt.label + ' → ' + bad.join('；'));
    } else {
      console.log('  ✓ 通过');
    }
  });

  console.log('\n截图：docs/screenshot-d3.png · screenshot-war.png（http）');
  console.log('      docs/screenshot-file-d3.png · screenshot-file-war.png（file）');
  if (allBad.length) {
    console.log('\n结论：冒烟未通过。\n  ' + allBad.join('\n  '));
    process.exit(1);
  }
  console.log('\n结论：两条通道全部通过（file:// 下地球贴图正常，与 http 一致）。');
})();
