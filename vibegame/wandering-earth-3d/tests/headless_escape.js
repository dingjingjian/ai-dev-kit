#!/usr/bin/env node
/**
 * 无头自检：在 Node 沙箱加载 app.js 跑「固定航线 + 时机弹弓」核心。
 *
 * 断言组：工程导出 / DOM·样式静态契约 / ES5 兼容 / 航线几何 /
 *         常量互锁 / 时机窗口（纯函数）/ 速度与阻力 / 弹弓（过早·最佳·过晚）/
 *         过热 / 行星判定（通过·被捕获·撞毁）/ 氦闪壳 / 相机 /
 *         行星发动机 / 胜负。
 *
 * 用法：node tests/headless_escape.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

let pass = 0, fail = 0;
function ok(item, note) { console.log('  [PASS] ' + item + (note ? ' — ' + note : '')); pass++; }
function bad(item, note) { console.log('  [FAIL] ' + item + (note ? ' — ' + note : '')); fail++; }
function check(cond, item, note) { cond ? ok(item, note) : bad(item, note); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
function len3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

// ---------- 沙箱 ----------
const sandbox = { console, Math, Date, JSON, Array, Object, String, Number, parseFloat, parseInt, isNaN, Float64Array };
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

try { vm.runInContext(fs.readFileSync(path.join(ASSETS, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' }); }
catch (e) { console.error('加载 app.js 失败:', e.message); process.exit(1); }

const M3D = sandbox.M3D || {};
const W = M3D.WORLD || {};
const C = M3D.CONST || {};
const route = M3D.buildRoute();
const fbs = M3D.buildFlybys(route);
const N_F = fbs.length;

console.log('\n=== 工程 ===');
check(typeof M3D.createGame === 'function', 'app.js 导出 createGame');
check(typeof M3D.buildRoute === 'function' && typeof M3D.routeSample === 'function', '导出 buildRoute / routeSample');
check(typeof M3D.flybyPhase === 'function' && typeof M3D.phaseZone === 'function' && typeof M3D.zoneEff === 'function',
  '导出时机窗口纯函数（flybyPhase / phaseZone / zoneEff）');
check(typeof M3D.shellRadius === 'function', '导出 shellRadius');
check(typeof M3D.engineLayout === 'function', '导出 engineLayout');
check(typeof W.AU === 'number' && W.AU === 100, 'WORLD.AU = 100');
check(typeof C.KMS_PER_UNIT === 'number', 'CONST.KMS_PER_UNIT 导出');

console.log('\n=== 工程（DOM / 样式静态契约）===');
// 无头自检只跑物理核心（沙箱里没有 document/THREE，渲染层整段跳过），
// 渲染层的改名漏改不会被运行期发现，这里用静态契约把它兜住。
(function () {
  const appSrc = fs.readFileSync(path.join(ASSETS, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ASSETS, 'style.css'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const wanted = [...new Set([...appSrc.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]))];
  const missing = wanted.filter((w) => !htmlIds.has(w));
  check(wanted.length > 0 && missing.length === 0, 'app.js 引用的每个 DOM id 都在 index.html 里',
    missing.length ? '缺失: ' + missing.join(',') : wanted.length + ' 个 id 全部命中');

  // 被 JS 操作的关键样式状态必须有对应 CSS 规则，否则切了类名却没有任何视觉变化
  const need = ['#clock-num', '#clock-ms', '#mirror-frame',
    '#cockpit', '#cockpit-msg', '#dash', '#dash-side',
    '#dg-heat', '#dg-speed', '#dg-pw', '.dg-track', '.dg-arc', '.dg-needle', '.dg-tick', '.dg-ref', '.dg-v',
    '.lamp', '#lamps', '#dash-read', '.dr-v',
    '#flyby', '#fb-needle', '#fb-track', '.fb-early', '.fb-sweet', '.fb-late'];
  const noRule = need.filter((sel) => css.indexOf(sel) < 0);
  check(noRule.length === 0, '加速时机条 / 汽车式仪表盘等新 HUD 的样式规则齐全',
    noRule.length ? '缺规则: ' + noRule.join(',') : need.length + ' 条选择器全部命中');
  // 2026-09-27：数值 / 单位必须相对**表盘面**定位（旧版相对整格 —— 含标题行 ——
  // 于是数字悬在盘中间、与弧之间空出一大段，且标题改字号它就跟著漂）。
  check(html.indexOf('class="dg-face"') > 0 && /\.dg-face\{[^}]*position:relative/.test(css)
    && /\.dg-v\{[^}]*top:64%/.test(css) && /\.dg-u\{[^}]*top:89%/.test(css),
    '表盘的数值 / 单位相对 .dg-face 定位（恒在弧的缺口里，不随标题行漂移）');
  const stateCls = ['hot', 'locked', 'hide', 'show', 'sweet', 'late', 'risk', 'good', 'bad', 'off',
    'ready', 'active', 'perfect', 'fail', 'early', 'none', 'pulse', 'on', 'warn',
    'idle', 'weak', 'boost'];
  const missCls = stateCls.filter((c) => css.indexOf('.' + c) < 0);
  check(missCls.length === 0, 'HUD 状态类在 CSS 中有定义', missCls.length ? '缺: ' + missCls.join(',') : stateCls.join(' '));

  // ---- 仪表盘契约（汽车驾驶舱式）：**温度柱 + 速度/功率两个指针盘** + 门槛/额定刻度 + 警报灯 ----
  // 旧版是一整块文字遥测（速度 / 距日 / 距壳 + 一条温度条）。现在按「要不要跟刻度比对」分工：
  // 温度 = 柱（单调余量，填充高度即答案）、速度 = 盘（跟门槛刻度比）、功率 = 盘（跟额定线比）。
  const dashRule = (css.match(/#dash\{[^}]*\}/) || [''])[0];
  // ---- 顶栏（2026-09-26 收成一条 flex）：左 尾向观测窗 │ 中 计时 │ 右 小地图 + 声音键 ----
  // 三块原本各自 `position:fixed`；现在只由 `#topbar` 定位 —— 于是 `--top-gap` 只叠在这一条上，
  // 左右两块共用 `--top-sq` 这个边长（方形、对称），中间的计时吃满余下宽度自然居中。
  const topbarRule = (css.match(/#topbar\{[^}]*\}/) || [''])[0];
  const topRightRule = (css.match(/#top-right\{[^}]*\}/) || [''])[0];
  const muteRule = (css.match(/#mute\{[^}]*\}/) || [''])[0];
  check(topbarRule.indexOf('position:fixed') > 0 && topbarRule.indexOf('left:') > 0
    && topbarRule.indexOf('right:') > 0 && topbarRule.indexOf('display:flex') > 0
    && topbarRule.indexOf('var(--top-gap)') > 0,
    '顶栏是一条两侧对齐的 flex 条，并且只叠一次 --top-gap（三块不再各自 fixed）',
    topbarRule.replace(/\s+/g, ' ').slice(0, 88));
  check(/--top-sq:\s*\d+px/.test(css)
    && /#mirror-frame\{[^}]*width:var\(--top-sq\)/.test(css)
    && /#mirror-frame\{[^}]*height:var\(--top-sq\)/.test(css)
    && /#radar\{[^}]*width:var\(--top-sq\)/.test(css)
    && /#mute\{[^}]*width:var\(--top-sq\)/.test(css),
    '左右两块是**同尺寸方形窗**（尾向观测 / 小地图共用 --top-sq 边长），声音键与之同宽');
  check(html.indexOf('id="topbar"') < html.indexOf('id="mirror-frame"')
    && html.indexOf('id="mirror-frame"') < html.indexOf('id="clock"')
    && html.indexOf('id="clock"') < html.indexOf('id="top-right"')
    && html.indexOf('id="radar"') < html.indexOf('id="mute"'),
    '顶栏 DOM 次序 = 尾向观测窗 → 计时 → 小地图 + 声音键（一左一右对称、计时夹在中间）');
  check(/#clock\{[^}]*flex:1 1 auto/.test(css) && /#clock\{[^}]*align-items:center/.test(css)
    && /#clock\{[^}]*justify-content:center/.test(css),
    '计时占中间那一格（flex:1）并在格内居中显示');
  // 2026-09-27：计时字号再加大一档（23 → 29 → **36px**，毫秒 15 → 18px）。
  // 上限仍由 320px 窄屏反推：中间那格 136px，「0:05.423」在 36/18px 下实测约 119px。
  check(/#clock-num\{font-size:36px/.test(css) && /#clock-ms\{font-size:18px/.test(css),
    '顶部计时器字号加大（36px / 毫秒 18px），仍留在 320px 的中间格里');
  check(html.indexOf('后视镜') < 0 && html.indexOf('尾向观测') > 0,
    '「后视镜」已按世界观改名为「尾向观测」（index.html 里不再出现旧名）', '尾向观测');
  // 2026-09-27：两块显示窗一起**去卡片化** —— 窗自己不带描边/投影/背板，
  // 标识文字**嵌在画面左上角**（不带任何底板），旧版「窗下面一条独立面板条」已删。
  // ⓘ 同日二次调整：标识上移到**顶部**（与导航图严格同一位置），并去掉第二行「氦闪壳」。
  check(/#mirror-label\{[^}]*position:absolute/.test(css)
    && /#mirror-label\{[^}]*left:2px;top:2px/.test(css)
    && !/#mirror-label\{[^}]*background/.test(css)
    && /<span id="mirror-label">尾向观测<\/span>/.test(html) && !/#mirror-label i\{/.test(css),
    '观测窗标识嵌在画面顶部（左上角浮字，不带底板；单行「尾向观测」，氦闪壳那行已删）');
  check(htmlIds.has('radar-wrap') && htmlIds.has('radar-label')
    && /#radar-label\{[^}]*position:absolute/.test(css)
    && /#radar-label\{[^}]*left:2px;top:2px/.test(css),
    '导航图与观测窗同一套做法：标识文字也在画面左上角（两块同高同位置）');
  // ⓘ 2026-09-27 反馈「导航图的显示隐藏和尾向观测行为不一致」：退场类必须挂在**整块**
  // `#radar-wrap` 上（canvas + 标识一起进出一致），旧写法只把 canvas 透明掉、字留在屏幕上。
  check(/#radar-wrap\.hide\{opacity:0\}/.test(css) && !/#radar\.hide\{/.test(css)
    && /elRadarWrap\.classList\.add\('hide'\)/.test(appSrc)
    && /elRadarWrap\.classList\.remove\('hide'\)/.test(appSrc)
    && /elMirrorFrame\.classList\.add\('hide'\)/.test(appSrc),
    '两块显示窗的显示/隐藏行为一致：退场类加在整块组件上（画布与标识同进同出）');
  check(!/#mirror-frame\{[^}]*border:/.test(css) && !/#radar\{[^}]*box-shadow/.test(css)
    && appSrc.indexOf("strokeRect(1, 1, rw - 2, rw - 2)") < 0,
    '两块显示窗都去掉了卡片外框（CSS 描边 / 投影 + canvas 自己那圈框一并撤掉）');
  check(muteRule.indexOf('position:fixed') < 0 && muteRule.indexOf('margin-top') > 0
    && topRightRule.indexOf('flex-direction:column') > 0,
    '声音开关竖排在右上列、跟在小地图下面（不再自己 fixed 定位）');
  // 顶部预留：小红书容器自带一排顶部按钮，整条顶栏必须再叠一条 --top-gap。
  check(/--top-gap:\s*50px/.test(css), '顶部预留常量 --top-gap 已定义（对齐 moon-myths 安全区写法）');
  const topGapUsers = ['#topbar{'];
  const noGap = topGapUsers.filter((sel) => {
    const r = (css.match(new RegExp(sel.replace('{', '\\{[^}]*\\}'))) || [''])[0];
    return r.indexOf('var(--top-gap)') < 0;
  });
  check(noGap.length === 0, '顶部各元素都叠了 --top-gap（元素不会钻进宿主顶栏）',
    noGap.length ? '未叠: ' + noGap.join(' ') : topGapUsers.join(' '));
  // ⓘ 2026-09-27 反馈「顶部记录和用时记录还是保留两位」：计时精度统一成 **两位小数**（0.01 s），
  // 与结算 / 分享 / 最快记录同一个口径（先做过一版三位毫秒，按反馈收回两位）。
  check(/id="clock-ms"/.test(html) && /id="clock-ms">\.00</.test(html) && /elClockMs/.test(appSrc)
    && /var mm = Math\.floor\(sec \/ 60\), ss = Math\.floor\(sec % 60\), cs = Math\.floor\(sec \* 100\) % 100;/.test(appSrc)
    && /elClockMs\.textContent = '\.' \+ \(cs < 10 \? '0' : ''\) \+ cs;/.test(appSrc),
    '计时带两位小数（#clock-ms 单独一段，由 JS 逐帧写 m:ss 之外的 2 位）');
  // 指针用 SVG 的 rotate 属性变换，不是 CSS transform（后者在 Chrome 61 的 SVG 上要 transform-box 才转对）
  check(/setAttribute\('transform',\s*'rotate\('/.test(appSrc) && !/transform-origin/.test(css),
    '表盘指针用 SVG rotate 属性驱动（Chrome 61 的 SVG 不支持 CSS transform-origin）');
  check(/GAUGE_VMAX/.test(appSrc) && /ARC_LEN/.test(appSrc) && /PWR_VMAX/.test(appSrc),
    '速度表 / 功率表各有明确满量程与弧长常量（满弹弓峰值 67.1 km/s 不得顶到上限）');
  check(htmlIds.has('lamp-hot') && htmlIds.has('lamp-sling') && htmlIds.has('lamp-flare') && htmlIds.has('lamp-shell'),
    '四盏警报灯齐全（过热 / 弹弓 / 耀斑 / 氦闪）');

  // ---- 驾驶舱布局契约：操作区（仪表行 / 时机条 / 消息槽）全部贴在屏幕底部 ----
  // 一次点火窗口只有 2.5–2.8 s，而「判定针踩在哪一段 / 还剩多少温度 / 速度够不够门槛 /
  // 发动机这一刻出了多大力」必须读完才能决定按不按 —— 上下来回看就是失误。
  // 所以这些一律进 `#cockpit`；顶部只留与驾驶无关、想起来才抬头看一眼的东西：
  // 用时 / 逃逸进度 / 小地图 / 后视镜 / 声音开关。
  const cockRule = (css.match(/#cockpit\{[^}]*\}/) || [''])[0];
  check(/position:fixed/.test(cockRule) && /bottom:/.test(cockRule) && /var\(--sab\)/.test(cockRule),
    '驾驶舱 #cockpit 固定挂在屏幕底部、并叠了底部安全区（手势条不会压住它）',
    cockRule.replace(/\s+/g, ' ').slice(0, 88));
  check(cockRule.indexOf('top:') < 0 && cockRule.indexOf('var(--top-gap)') < 0,
    '驾驶舱不再挂顶部（旧版仪表盘占的就是 --top-gap 那条线）');
  check(dashRule.indexOf('position:fixed') < 0 && dashRule.indexOf('top:') < 0
    && dashRule.indexOf('var(--top-gap)') < 0,
    '仪表行改成驾驶舱内的平铺一行（不再是右上那块浮动的竖排面板）',
    dashRule.replace(/\s+/g, ' ').slice(0, 88));
  check(htmlIds.has('dg-pw') && htmlIds.has('dg-pw-arc') && htmlIds.has('dg-pw-needle')
    && htmlIds.has('dg-pw-ref') && htmlIds.has('tm-pw'),
    '第三个表盘 = 发动机输出功率（功率表 DOM：盘 + 值弧 + 指针 + 额定刻度 + 读数）');
  check(/PWR_VMAX\s*=\s*160/.test(appSrc) && /elPwGauge\.classList\.toggle\('boost'/.test(appSrc)
    && /elPwArc/.test(appSrc) && /elPwVal/.test(appSrc),
    '功率表满量程 160%（额定 100% + 脉冲乘波 160%）且真的接进了 updateHUD');
  // 功率读数 = **发动机输出功率** = 油门 × 乘波 —— **与区间无关**。
  // ⓘ 2026-09-27 反馈「过晚阶段功率表不该掉到 20%，应该还是 100%」：旧读数乘了 zoneEff，
  // 把「推力残效」画成了「发动机出了多少力」。现在残效只留给推力与温升（st.thrustEff）。
  const pwSafe = M3D.zoneEff('early') === 1 && M3D.zoneEff('sweet') === 1
    && Math.abs(M3D.zoneEff('late') - 0.2) < 1e-9
    && Math.abs(1 * C.PULSE_THRUST_BOOST - 1.6) < 1e-9;
  check(pwSafe, '区间效率表不变（过早 / 绿色 1、过晚残效 0.2、乘波 1.6）—— 它只管推力与温升',
    'late ' + M3D.zoneEff('late') + ' × 乘波 ' + C.PULSE_THRUST_BOOST);
  check(/var power = st\.pwrOut;/.test(appSrc) && !/st\.pwr \/ PWR_MAX\) \* zoneEff/.test(appSrc),
    '功率表读 st.pwrOut（输出功率 = 油门 × 乘波）：过晚区间照样满表，不再掉到 20%');
  check(/st\.pwrOut = st\.overheated \? 0 : out;/.test(appSrc)
    && /st\.thrustEff = \(st\.burning && !st\.overheated\) \? st\.pwrOut \* zoneEff\(st\.zone\) : 0;/.test(appSrc)
    && /var out = \(st\.pwr \/ PWR_MAX\) \* \(pulseActive\(tNow\) \? PULSE_THRUST_BOOST : 1\);/.test(appSrc),
    '核心把「输出功率」与「有效推力档位」拆成两个量：前者上表盘 / 火焰，后者进推力与温升');
  // 2026-09-27 反馈「功率不可能一松手就直接归零」：读数跟着油门，松手后跟着那条 0.5 s 的
  // 熄火斜坡一起下坡（PWR_DOWN），而不是被 st.burning 一闸到底；过热锁定时核心把 pwrOut 归零。
  check(/st\.overheated = true; st\.thrustEff = 0; st\.pwrOut = 0;/.test(appSrc),
    '过热锁定时输出功率立即归零（熄火完成，不是斜坡）');
  // 行为侧：松手 0.25 s 后输出功率应落在半途（0.5 s 斜坡），而**推力当场就没了**
  const gR = M3D.createGame(route), sR = gR.state;
  gR.debugSet(route.len - 100, 150);
  sR.pwr = C.PWR_MAX; sR.heat = 0;
  gR.setBurning(true);
  gR.step(1 / 200);
  const outFull = sR.pwrOut;
  gR.setBurning(false);
  gR.step(0.25);
  check(near(outFull, 1, 0.03) && sR.pwrOut > 0.35 && sR.pwrOut < 0.7 && sR.thrustEff === 0,
    '读数跟着油门：松手走 0.5 s 熄火斜坡（推力当场归零，不拖泥带水）',
    'pwrOut ' + outFull.toFixed(2) + ' → ' + sR.pwrOut.toFixed(2) + '（thrustEff ' + sR.thrustEff + '）');
  // 2026-09-26 重构：功率是**起转斜坡**（按住 0.5 s 到满额），红态只给「过晚残效」——
  // 若按「功率 < 50%」判，每次按住的起转前 0.25 s 都会闪一次红，那是正常起转不是白烧。
  check(/PWR_UP\s*=\s*200/.test(appSrc) && /PWR_DOWN\s*=\s*200/.test(appSrc)
    && /elPwGauge\.classList\.toggle\('weak', st\.zone === 'late'/.test(appSrc),
    '功率是起转斜坡（PWR_UP = 200/s）；过晚区间用红态标「这功率没兑成推力」，不降读数');
  check(/TEMP_RATE\s*=\s*75/.test(appSrc)
    && /st\.heat = Math\.min\(TEMP_MAX, st\.heat \+ TEMP_RATE \* st\.thrustEff/.test(appSrc),
    '温度 = ∫ 有效推力档位（= 输出功率 × 区间效率，不是恒定速率、也不看表盘读数）');
  // ---- 仪表行顺序：功率 → 温度 → 速度 ----
  // 顺序 = 驾驶时的手上顺序：先看**功率**（这一下按出去多大力）、再看**温度**（离满箱还有多远）、
  // 最后看**速度**（够不够门槛刻度）。改顺序只动 DOM，JS 全按 id 取，所以这里用 DOM 次序锁死。
  const rowHtml = (html.match(/<div id="dash-row">[\s\S]*?<div id="dash-side">/) || [''])[0];
  const idxOrder = ['id="dg-pw"', 'id="dg-heat"', 'id="dg-speed"'].map((s) => rowHtml.indexOf(s));
  check(idxOrder.every((v) => v >= 0) && idxOrder[0] < idxOrder[1] && idxOrder[1] < idxOrder[2],
    '仪表行顺序 = 功率 → 温度 → 速度', rowHtml.replace(/\s+/g, ' ').slice(0, 64) + '…');
  // ---- 三格都是指针表盘（温度一度试过柱状图，已回退，不留残留）----
  check(htmlIds.has('dg-heat') && htmlIds.has('dg-heat-needle') && htmlIds.has('dg-heat-arc') && htmlIds.has('tm-heat'),
    '温度用指针表盘（盘 + 值弧 + 指针 + 读数）');
  check(/gaugeSet\(elHeatNeedle, elHeatArc, heatPct\)/.test(appSrc)
    && html.indexOf('tb-heat-fill') < 0 && appSrc.indexOf('elHeatBar') < 0 && css.indexOf('.tb-fill') < 0,
    '温度由 gaugeSet 驱动；柱状图那套（tb-box / tb-fill / elHeatBar）已彻底移除');
  // ---- 两个历史 bug 的回归契约（2026-09-26 实测踩到）----
  // ① 功率指针刻度：st.thrustEff 是**小数**（1.0 = 额定），要 ×100 折成百分数再除满量程 160%。
  //    直接除满量程的话 1/160 = 0.006 → 指针全程只转 1°，看着像「不动的指针」。
  check(/power \* 100 \/ PWR_VMAX/.test(appSrc) && !/gaugeSet\(elPwNeedle, elPwArc, power \/ PWR_VMAX\)/.test(appSrc),
    '功率指针刻度：小数 → 百分数 → 满量程（100% 落在额定线 62.5% 弧位、乘波 160% 顶满 +135°）');
  // ② 值弧进度必须写 **inline style**：`.dg-arc{stroke-dashoffset:179.1}` 是 CSS 声明，
  //    而 CSS 声明永远压过同名的 SVG 表现属性 —— 写成属性那三条值弧一辈子停在 179.1（全空），
  //    表盘上就只剩指针在动（实测 computed 恒为 179.1px，属性却在变）。
  check(/arcEl\.style\.strokeDashoffset/.test(appSrc) && !/arcEl\.setAttribute/.test(appSrc)
    && /\.dg-arc\{[^}]*stroke-dashoffset:179\.1/.test(css),
    '值弧进度走 inline style（CSS 里那条 179.1 只是首帧基线，压不掉 JS 写的进度）');
  check(!/position:fixed/.test(dashRule) && /display:flex/.test(dashRule)
    && /align-items:center/.test(dashRule),
    '仪表行是横向平铺（温度柱 + 两张表盘并排 + 右端灯组 / 读数），不是竖着堆');
  // 旧的一维温度条（#heat-wrap / #heat-fill / #heat-track）整体退场且**不复用旧 id**：
  // 现在的温度柱是仪表行里与两张表盘同格的一根柱（.tb / .tb-fill），不是那块横条。
  check(css.indexOf('#heat-wrap') < 0 && css.indexOf('#heat-fill') < 0 && css.indexOf('#heat-track') < 0
    && html.indexOf('id="heat-fill"') < 0 && appSrc.indexOf('elHeatFill') < 0,
    '旧的横条温度条已彻底移除（温度改为仪表行里的柱状图，旧 id 不复用）');
  check(css.indexOf('#telemetry') < 0 && appSrc.indexOf('elTelemetry') < 0,
    '旧的文字遥测面板 #telemetry 已移除（改为 #dash 仪表盘）');

  // 底部提示已改挂到右侧点火按钮上：底部那条 #hint 必须彻底消失（含样式残留）
  check(html.indexOf('id="hint"') < 0 && css.indexOf('#hint') < 0 && appSrc.indexOf('elHint') < 0,
    '旧的底部常驻提示 #hint 已移除（改为一次性 #tip）');
  // 点火操作：整块屏幕就是按钮（右侧那颗圆形按钮已移除）
  check(!htmlIds.has('thrust') && html.indexOf('id="thrust"') < 0,
    '右下角点火按钮已移除（改为按住屏幕任意位置点火）');
  check(htmlIds.has('tip'), '保留一次性点火提示（「怎么点火」只交代一次）');

  // ---- HUD 布局契约：消息槽 / 时机条 / 仪表行三层同属驾驶舱，自上而下排开、互不贴边 ----
  // 旧版 #warn 先是 top:208 悬浮画面中间（读起来像一条没主的浮标），后来改成写死
  // bottom:180px 去和时机条对齐 —— 时机条一换行（窄屏 tag 变长）就会叠字。
  // 现在两条提示都塞进 `#cockpit-msg` 这个**零高度**槽位；2026-09-27 起它排在时机条**之后**
  // （= 显示在时机条下面、紧贴底部状态框），有提示时才撑开高度把时机条顶上去 ——
  // 位置由排版算，不写死像素，长文案既不压下面的状态框、也不浮在画面里压氦闪壳。
  const warnRule = (css.match(/#warn\{[^}]*\}/) || [''])[0];
  const toastRule = (css.match(/#fb-toast\{[^}]*\}/) || [''])[0];
  const barRule = (css.match(/#flyby\{[^}]*\}/) || [''])[0];
  const msgRule = (css.match(/#cockpit-msg\{[^}]*\}/) || [''])[0];
  check(!!warnRule && warnRule.indexOf('position:fixed') < 0 && warnRule.indexOf('top:') < 0,
    '#warn 不再写死位置（旧版 top:208 悬浮画面中间 / 后靠 bottom:180px 硬对时机条）',
    warnRule.replace(/\s+/g, ' ').slice(0, 88));
  check(!!warnRule && warnRule.indexOf('nowrap') < 0,
    '#warn 允许换行（旧版 white-space:nowrap 会把长文案两头裁掉）');
  check(/position:relative/.test(msgRule) && /height:0/.test(msgRule),
    '消息槽 #cockpit-msg 是零高度槽位（提示向上生长，不推走下面的时机条与仪表行）');
  check(html.indexOf('id="cockpit-msg"') < html.indexOf('id="warn"')
    && html.indexOf('id="cockpit-msg"') < html.indexOf('id="fb-toast"')
    && html.indexOf('id="warn"') < html.indexOf('id="flyby"')
    && html.indexOf('id="fb-toast"') < html.indexOf('id="flyby"'),
    '#warn 与评级条同槽：都在 #cockpit-msg 里、且排在时机条之前（= 浮动在它上方）');
  check(!!toastRule && toastRule.indexOf('position:fixed') < 0 && /transform:translateY/.test(toastRule),
    '评级条与 #warn 一样交给槽位定位，入场只靠 translateY（不再各自写死 bottom）');
  check(/position:relative/.test(barRule) && /margin-bottom/.test(barRule),
    '时机条是驾驶舱里的普通一行：与仪表行之间靠 margin 留缝（不写死像素）');
  // ---- 时机条外框（2026-09-27 改版）：无描边、无折角的暗玻璃板 ----
  // 旧版是「1px 绿描边 + 上下两个折角（四条绿短线）」，玩家要求删掉这些绿色装饰线。
  // 现在面板只靠一块更深的底浮在画面上，三态（命中 / 过早 / 过晚）改用**整块外发光**表达。
  check(!/#flyby\{[^}]*border:/.test(css) && /#flyby\{[^}]*border-radius:8px/.test(css)
    && /#flyby\.sweet\{box-shadow/.test(css) && /#flyby\.risk\{box-shadow/.test(css)
    && /#flyby\.late\{box-shadow/.test(css),
    '时机条外框 = 无描边无折角的暗玻璃板，三态改用外发光（不再换描边色）');
  // HUD 面板上的绿色折角（每块四条短线）与全部模拟扫描横条一起撤掉
  check(!/#clock::before/.test(css) && !/#dash::before/.test(css)
    && !/#progress::before/.test(css) && !/#mirror-frame::before/.test(css)
    && !/#flyby::before/.test(css),
    'HUD 面板的绿色折角装饰全部撤掉（计时 / 进度 / 仪表行 / 观测窗 / 时机条一块不留）');
  // 点火提示搬进开场简报：局内底部不再有常驻横条（否则和时机条、仪表行挤成三条满宽）
  const tipRule = (css.match(/#tip\{[^}]*\}/) || [''])[0];
  check(!!tipRule && tipRule.indexOf('position:fixed') < 0 &&
    html.indexOf('id="tip"') > html.indexOf('id="brief"'),
    '点火提示在开场简报内（局内底部只剩消息槽 / 时机条 / 仪表行）');
  // ---- 逃逸进度 / 小地图：2026-09-26 从左上列**下沉到底部信息栏**，同一天小地图又搬回**右上角** ----
  // 进度：`#dash-foot` 里的 flex 子项 —— 不该 fixed、也不该叠 --top-gap。
  // 小地图：现在挂在右上列 `#top-right`（`position:fixed` 的容器）里 —— 它自己**仍然不该**
  // fixed（父级已经定位），--top-gap 由容器统一叠，所以它自己那条也不带。
  const progRule = (css.match(/#progress\{[^}]*\}/) || [''])[0];
  const radarRule2 = (css.match(/#radar\{[^}]*\}/) || [''])[0];
  check(!!progRule && progRule.indexOf('position:fixed') < 0 && progRule.indexOf('var(--top-gap)') < 0,
    '逃逸进度挂在底部信息栏最下沿（不再占左上列）',
    progRule.replace(/\s+/g, ' ').slice(0, 88));
  check(!!radarRule2 && radarRule2.indexOf('position:fixed') < 0
    && radarRule2.indexOf('var(--top-gap)') < 0
    && html.indexOf('id="radar"') < html.indexOf('id="cockpit"')
    && html.indexOf('id="radar"') < html.indexOf('id="dash"'),
    '小地图搬出底部信息栏、进顶栏右列（自己不带 --top-gap，由 #topbar 统一叠）',
    radarRule2.replace(/\s+/g, ' ').slice(0, 88));
  // ---- 控制台**两列**（同日最终版）：仪表盘 │ 参数（雷达搬去右上角后只剩这两列）----
  const dashSideRule = (css.match(/#dash-side\{[^}]*\}/) || [''])[0];
  const dashLineRule = (css.match(/#dash-line\{[^}]*\}/) || [''])[0];
  check(html.indexOf('id="dash-row"') < html.indexOf('id="dash-side"')
    && html.indexOf('id="lamps"') > html.indexOf('id="dash-side"'),
    '控制台两列 = 仪表盘 → 参数（灯组 / 读数都在参数列里，雷达不再占列）');
  check(/#dash-row\{[^}]*flex:1 1 auto/.test(css) && /#dash-side\{[^}]*flex:1 1 \d+px/.test(css)
    && /border-left/.test(dashSideRule) && /display:flex/.test(dashLineRule),
    '两列的宽度分工：仪表盘吃满剩余 / 参数列有确定的基准宽度（灯是 50% 两列），列间竖线分隔');
  // 2026-09-27：三张表盘在列内**居中**（旧版吃满 64px 上限后余量全堆在右边，看着是「贴左一坨」）
  check(/#dash-row\{[^}]*justify-content:center/.test(css) && /\.dg\{[^}]*max-width:70px/.test(css),
    '三张表盘在仪表列里居中（左右余量对半分），单格上限 70px');
  check(html.indexOf('id="progress"') > html.indexOf('id="dash-side"')
    && html.indexOf('id="progress"') < html.indexOf('id="danger"')
    && /#progress\{[^}]*width:100%/.test(css),
    '逃逸进度单独一行（信息栏最下沿、通宽，不再与小地图同排）');
  // ---- 时机条**固定**贴在仪表盘之上；提示框统一成一张卡、浮动在时机条上方 ----
  // 2026-09-27 反馈「点火提示框应固定在仪表盘上面；弹弓结果与 toast 统一样式、在它上面浮动」：
  // 消息槽回到时机条**之前**（= 显示在它上方），保持 height:0 浮动 ——
  // 不再撑开高度，所以时机条的位置**恒定**，不会因来一条提示而上下跳。
  check(htmlIds.has('cockpit-stage') && html.indexOf('id="cockpit-stage"') < html.indexOf('id="cockpit-msg"')
    && html.indexOf('id="cockpit-msg"') < html.indexOf('id="flyby"')
    && /#cockpit-stage\{[^}]*flex-direction:column\}/.test(css)
    && /#cockpit-msg\{[^}]*z-index/.test(css)
    && /#cockpit-msg\{[^}]*height:0/.test(css)
    && /#cockpit-msg > \*\{[^}]*bottom:0[^}]*margin:0 auto \d+px/.test(css),
    '消息槽在时机条**之前**（column + bottom:0 向上浮动 6px），时机条位置恒定不跳');
  check(appSrc.indexOf('elMsg') < 0 && appSrc.indexOf('MSG_GAP') < 0,
    '不再用 JS 撑高消息槽（提示改为浮动，不推走时机条）');
  // ---- 两块提示**同一张卡**：共用底 + 共用提示符位，只有提示符字形与评级色不同 ----
  // ⓘ 2026-09-27：1px 细边与顶缘 2px 语义色细线**都撤了** —— 消息卡现在是一条线都没有的
  // 暗玻璃板，玩家反馈的「弹弓提示框外框改掉、绿色装饰线删掉」指的就是它。
  const shareRule = (css.match(/#warn,#fb-toast\{[^}]*\}/) || [''])[0];
  check(/min-width:236px/.test(shareRule) && /border-radius:8px/.test(shareRule)
    && shareRule.indexOf('border:') < 0 && shareRule.indexOf('border-top') < 0
    && /padding:9px 13px 9px 26px/.test(shareRule) && /translateY\(8px\)/.test(shareRule),
    '#warn 与 #fb-toast 共用同一张**无框**暗玻璃卡（同底 / 同内边距 / 同入场动画，一条装饰线都不留）',
    shareRule.replace(/\s+/g, ' ').slice(0, 96));
  check(/#warn::before,#fb-toast::before\{/.test(css) && /#fb-toast::before\{content:'▍'\}/.test(css)
    && /#warn\.pulse::before\{content:'!'/.test(css) && /#warn\.hot::before\{content:'×'/.test(css),
    '两块提示共用提示符位，语义由字形 + 提示符颜色 + 底板色调区分（> / ! / × · ▍）');
  // 评级四档也各有一条**提示符着色 + 淡色调底**（取代原来那条顶缘细线）
  check(/#fb-toast\.perfect::before,#fb-toast\.perfect #ft-grade\{color:var\(--gold\)\}/.test(css)
    && /#fb-toast\.good\{background:/.test(css) && /#fb-toast\.late,#fb-toast\.none,#fb-toast\.fail\{background:/.test(css),
    '评级色改由提示符 ▍ + 等级文字 + 淡色调底承担（三处都不带线）');
  check(css.indexOf('#fb-toast::before{') > css.indexOf('#flyby::before{')
    && !/#clock::before,#progress::before,#mirror-frame::before,#dash::before,#flyby::before,\s*\n#fb-toast::before/.test(css),
    '评级条已退出折角组（::before 让给提示符，两套规则不再互相污染）');
  // ---- 巡航段：同一条带换成「下一站进度条」（玩家反馈：点火前不知道离下一站还有多远）----
  check(htmlIds.has('fb-next') && htmlIds.has('fb-next-fill') && htmlIds.has('fb-next-pct')
    && html.indexOf('id="fb-next"') > html.indexOf('id="fb-track"'),
    '巡航段有独立的「下一站进度条」DOM（与窗口内那条三段带同一个盒子）');
  check(/showNext[\s\S]{0,120}st\.target < 0 \|\| st\.phase < 0/.test(appSrc)
    && /elFbTrack\.style\.display = 'none'; elFbNext\.style\.display = ''/.test(appSrc)
    && /elFbNextFill\.style\.width/.test(appSrc)
    && /nf\.s - st\.v \* \(nf\.def\.winTime/.test(appSrc)
    && /nGoal = Math\.max/.test(appSrc),
    '窗口外（phase<0）才切到下一站进度条；终点是**窗口开启那一刻**（扣掉 v × winTime 的提前量），不报秒数');
  // 2026-09-27：五站过完（st.target < 0）不再把这条带整条隐掉 —— 距离引导改指**比邻星**
  check(/elFbName\.textContent = '比邻星'/.test(appSrc) && /nGoal = route\.len/.test(appSrc)
    && /nFrom = flybys\[flybys\.length - 1\]\.s/.test(appSrc),
    '五站过完后距离引导改指「比邻星」（条按 冥王星 → 航线末端 的弧长继续填）');
  check(/elFbFoot\.classList\.add\('hide'\)/.test(appSrc)
    && /elFbFoot\.classList\.remove\('hide'\)/.test(appSrc)
    && /\.fb-foot\.hide\{display:none\}/.test(css),
    '没有判定点时收掉那截「门槛」读数（不挂一条假的 门槛 0.0），切回窗口时再还回来');
  // 点火引导只报窗口信息：标签就是「引力窗口」，后面那截「· 全功率推进」（功率信息）已删。
  // ⚠ 耀斑脉冲提示里的「全功率推进」是**另一条车道**（消息槽的动作指令），必须留着。
  check(/elFbTag\.textContent = '引力窗口'/.test(appSrc)
    && appSrc.indexOf('引力窗口 · 全功率推进') < 0,
    '点火引导只提示窗口信息（标签 =「引力窗口」，后面的功率信息已删）');
  // ⓘ 2026-09-27 反馈「窗口外还是有『增益作废』的提示，删除；小屏幕显示不全」：
  // tag 只报**窗口状态**（三态各 ≤5 字）—— 旧文案「窗口外点火 · 增益作废」在 320px 窄屏上
  // 会被省略号吃掉半截（实测要 95px，那一行只留得下 ~55px）。
  check(/elFbTag\.textContent = '窗口外点火'/.test(appSrc)
    && appSrc.indexOf('· 增益作废') < 0 && /elFbTag\.textContent = '窗口关闭'/.test(appSrc),
    '窗口外那一档只报「窗口外点火」（「· 增益作废」已删）：三态 tag 都是短词，窄屏不截断');
  // ---- 全站不留模拟扫描横条（2026-09-27）----
  // 操作界面那层全屏扫描线 2026-09-26 就撤了（它压在 3D 之下、HUD 之上，半透明仪表盘
  // 会把条纹透出来）；2026-09-27 玩家又要求「所有界面的模拟扫描横条都删掉」——
  // 于是简报 / 结算 / 加载三块整屏自带的 1px 横线也一并删了。
  // （`repeating-linear-gradient(90deg …)` 那两处是**刻度轨道与点线引导**，不是扫描线，保留。）
  check(!/body::before\{/.test(css) && !/#brief::before,#result::before\{/.test(css)
    && !/#loader::before\{/.test(css) && css.indexOf('repeating-linear-gradient(180deg') < 0,
    '全站不剩任何模拟扫描横条（简报 / 结算 / 加载的整屏扫描线也已删）');
  // 速度读数只有一套单位：时机条 foot 与表盘都是 km/s（旧版 foot 是内部单位 98 / 156）
  check(/门槛[\s\S]{0,60}km\/s/.test(html) && /KMS_PER_UNIT\)\.toFixed\(1\)/.test(appSrc),
    '时机条 foot 的速度 / 门槛用 km/s（与表盘同一套单位）');
  check(/canvas\.addEventListener\('pointerdown',\s*function[\s\S]{0,220}game\.setBurning\(true\)/.test(appSrc) &&
    /window\.addEventListener\('pointerup', endPointer\)/.test(appSrc) &&
    /window\.addEventListener\('pointercancel', endPointer\)/.test(appSrc),
    '输入 = 画布 pointerdown + window pointerup/cancel（整屏可点；手指滑出画面也不会一直烧着）');
  check(/#danger\.ready/.test(css) && /#danger\.active/.test(css),
    '全屏边缘光有「红色危险」与「绿色该按了」两态（按钮没了，只能靠整屏喊）');

  // 「最佳加速时机」整段用绿色（节奏游戏惯例：绿 = 命中区），与「红色危险」构成红绿灯对照。
  // 金色随即退到「评价 / 荣誉」轴：完美弹弓、结算用时、新纪录 —— 不再与「该按了」争用同一个颜色。
  const sweetRule = (css.match(/\.fb-sweet\{[^}]*\}/) || [''])[0];
  check(/rgba\(127,208,168/.test(sweetRule) && sweetRule.indexOf('255,210,74') < 0,
    '「最佳加速时机」区间整段是绿色（不再是 绿→金 渐变）', sweetRule.slice(0, 92));
  check(/@keyframes dangerReady\{[\s\S]*?rgba\(127,208,168/.test(css),
    '全屏「该按了」呼吸光与区间同色（绿）');
  check(/setHex\(0x7fd0a8\)/.test(appSrc) && appSrc.indexOf('setHex(0xffd24a)') < 0,
    '3D 判定环在最佳区间时也是绿色（世界内与 HUD 用同一套颜色）');
  check(html.indexOf('绿色区间') >= 0 && html.indexOf('金色区间') < 0,
    '点火提示文案已改说「绿色区间」（不留旧色名）');
  // 旧主色是青蓝 5cc8ff（2026-09-26 整体退场）——战绩卡里那行文字一度漏改，这里锁住三处
  check(appSrc.indexOf('5cc8ff') < 0 && css.indexOf('5cc8ff') < 0 && html.indexOf('5cc8ff') < 0,
    '旧青蓝（5cc8ff）已从 app.js / style.css / index.html 里整体退场（含战绩卡）');
  const goldUsers = (css.match(/[^{}\n]*\{[^}]*var\(--gold\)[^}]*\}/g) || []).map((r) => r.split('{')[0].trim());
  check(goldUsers.length > 0 && goldUsers.every((sel) => /fb-toast|rst-|rs-hint/.test(sel)),
    '金色只剩「评价 / 结算」轴在用（时机轴 #flyby / .fb-sweet 已无金色）', goldUsers.join(' · '));

  // 掠过评级：HUD 必须能把「刚才点得怎么样」讲清楚
  check(htmlIds.has('fb-toast') && htmlIds.has('ft-name') && htmlIds.has('ft-grade') && htmlIds.has('ft-detail'),
    '掠过评级提示 DOM 齐全');
  check(/showFlybyToast/.test(appSrc) && /pollJudged/.test(appSrc),
    '掠过评级由「已出结果数量」轮询触发（失败那次 target 不再前进，也必须能弹出）');
  check(/sweet \+= SUBSTEP_TIME/.test(appSrc) && /early \+= SUBSTEP_TIME/.test(appSrc) && /late \+= SUBSTEP_TIME/.test(appSrc),
    '物理核心分区累计点火时长（过早/最佳/过晚）供评级使用');

  // 结算：用时是主角，并且要有分享
  check(htmlIds.has('rs-time-box') && htmlIds.has('rs-time-value') && htmlIds.has('rs-best'),
    '结算页有独立的「用时 / 最快纪录」区块');
  check(/localStorage\.setItem\('we3d_best'/.test(appSrc) && /localStorage\.getItem\('we3d_best'/.test(appSrc),
    '最快记录持久化（只有成功逃出才记账）');
  // ⓘ 2026-09-27 反馈「统计结果也要显示毫秒级别，本站最快改为最快记录」→ 当天又反馈
  // 「顶部记录和用时记录还是保留两位」：**全站用时统一两位小数**（`t2()` 是唯一取整口径：
  // 显示 / 最快记录的比较与落盘都用它，避免「显示同一个数却弹新纪录」）。
  // 记录标签统一叫「最快记录」（旧名「本站最快」全文不得再出现）。
  check(/function t2\(v\) \{ return Math\.round\(v \* 100\) \/ 100; \}/.test(appSrc)
    && /elRsTime\.innerHTML = t2\(st\.t\)\.toFixed\(2\)/.test(appSrc)
    && /\(isNew \? '★ 新纪录 ' : '最快记录 '\) \+ bestTime\.toFixed\(2\)/.test(appSrc)
    && /var isNew = win && \(bestTime === null \|\| t2\(st\.t\) < bestTime\)/.test(appSrc)
    && /bestTime = t2\(st\.t\);/.test(appSrc)
    // ⓘ 2026-09-27 反馈「逃逸用时居中显示」：数字 +「秒」按 measureText 实测宽度整体居中
    //   （旧版写死 CW/2 - 60 的偏移，位数一变就看着偏左）
    && /var tStr = t2\(st\.t\)\.toFixed\(2\), wT, wU, gapT, xT;/.test(appSrc)
    && /wT = g\.measureText\(tStr\)\.width/.test(appSrc)
    && /xT = \(CW - \(wT \+ gapT \+ wU\)\) \/ 2;/.test(appSrc)
    && /g\.fillText\(tStr, xT, 452\)/.test(appSrc)
    && /g\.fillText\('秒', xT \+ wT \+ gapT, 452\)/.test(appSrc)
    && /'最快记录 ' \+ bestTime\.toFixed\(2\) \+ ' 秒 · 完美弹弓 '/.test(appSrc)
    && (appSrc.match(/toFixed\(3\)/g) || []).length === 1   // 全站只剩 runKey 那条缓存键
    && /function runKey\(\) \{ return st\.status \+ '\|' \+ st\.t\.toFixed\(3\); \}/.test(appSrc)
    && /t: t2\(st\.t\),/.test(appSrc) && /best: bestTime === null \? null : bestTime/.test(appSrc)
    && appSrc.indexOf('本站最快') < 0 && appSrc.indexOf('最快纪录') < 0,
    '结算 / 分享的用时统一两位小数（t2 + toFixed(2)），记录标签 =「最快记录」');
  check(html.indexOf('0.00<i>s</i>') > 0 && html.indexOf('最快记录 0.00 s') > 0,
    'index.html 的结算占位符也按两位小数（0.00 s）+「最快记录」写法');
  // 分享首选 §3.9 interactionOpenApi（文档里唯一标注「分享」的能力）：图文评论草稿 + 同步存相册
  check(/interactionOpenApi/.test(appSrc) && /action: 'post_comment'/.test(appSrc) && /media_bean/.test(appSrc)
    && /media_type: 'image'/.test(appSrc) && /cover_image_url/.test(appSrc) && /saveToAlbum: true/.test(appSrc),
    '分享首选 §3.9 interactionOpenApi（post_comment + media_bean + saveToAlbum）');
  // §3.9 的媒体**只收本地文件句柄**（data: URI / 网络地址明确不可用）→ 只能喂 writeTempFile 的 filePath
  check(/cover_image_url: filePath/.test(appSrc) && !/cover_image_url: (cardData|dataURL)/.test(appSrc),
    '评论区媒体只喂本地句柄（data: URI 绝不进 media_bean）');
  // 评论区能力客户端 9.49+：按 §3.6 从 buildVersion 取版本（末三位是编译序号，先取整），同步值缺失才异步取
  check(/COMMENT_MIN_CLIENT = 9490/.test(appSrc) && /miniToolEnv/.test(appSrc) && /buildVersion/.test(appSrc)
    && /getLaunchOptions/.test(appSrc) && /Math\.floor\(raw \/ 1000\)/.test(appSrc),
    '评论区能力按 §3.6 判客户端版本（9.49 = 9490），同步取不到才异步 getLaunchOptions');
  // §3.9 要求「用户点击等主动操作触发」→ 卡片与临时文件在结算页就备好，点击时直接带着句柄发起
  check(/function prepareShareCard\(\)/.test(appSrc) && /prepareShareCard\(\);\s*\n\s*if \(win\) sfxWin/.test(appSrc)
    && /hasApi\(b, 'writeTempFile'\)/.test(appSrc),
    '战绩卡与本地句柄在结算页备好（点击手势栈里不再夹异步步骤）');
  // 低版本 / 落盘失败回退 §3.3 postNote（唤起笔记发布页）
  check(/postNote/.test(appSrc) && /image_resources/.test(appSrc) && /pageType: 'photo_publish'/.test(appSrc)
    && /noteOptions/.test(appSrc),
    '拿不到评论区能力时回退 §3.3 postNote（image_resources + photo_publish）');
  // 能力检测在调用时做（§3.1：调用前用 window.xhs && window.xhs.miniTool 判空），不缓存加载那一刻的 window
  check(appSrc.indexOf('CAN_SHARE') < 0 && /function shareBridge\(\)/.test(appSrc)
    && /typeof b\[name\] === 'function'/.test(appSrc) && /function shareMode\(\)/.test(appSrc)
    && /分享到评论区/.test(appSrc),
    '能力检测在调用时做（每次点击重查 window.xhs.miniTool），按钮文案随可用能力定');
  check(/writeTempFile/.test(appSrc) && /toDataURL\('image\/webp'/.test(appSrc) && /createRange/.test(appSrc),
    '配图用 Canvas 现画（不碰被禁的网络请求 API），拿不到端能力时退化为「选中文案 + 引导长按复制」');
  // 2026-09-27 修：战绩卡上那五颗评级色标必须带上**该行星**的 ratingSweet —— 漏传时
  // r.sweet >= undefined 恒假，「绿色区间吃满」会被降级成「弹弓增益未满」→ 该金色的点画成琥珀。
  check(/gradeFlyby\(r, ok, flybys\[i\]\.def\.ratingSweet\)/.test(appSrc)
    && appSrc.indexOf('gradeFlyby(r, ok)') < 0,
    '战绩卡评级带上该行星的 ratingSweet（完美弹弓才会画成金色，不被降级成琥珀）');
  // 2026-09-27 修：① 五个点的标签原来取行星名**末字**（slice(-1)）→ 全印成同一个「星」，
  //               现按反馈画**全名**（木星 / 土星 / 天王星 / 海王星 / 冥王星，3 字 ≈ 66px < 点间距 132px）；
  //              ② 失败状态原来一律写「被氦闪前壳吞没」，被行星捕获 / 坠入大气层时是错的。
  check(/g\.fillText\(flybys\[i\]\.def\.name, x0 \+ i \* gap, 786\)/.test(appSrc)
    && appSrc.indexOf('def.name.slice(-1)') < 0 && appSrc.indexOf('def.name.charAt(0)') < 0
    && /g\.fillText\(win \? '逃逸成功' : \(st\.reason \|\| '被氦闪前壳吞没'\), CW \/ 2, 540\)/.test(appSrc),
    '战绩卡：五颗行星标签写**全名**（不再是五个「星」，也不用单字缩写）、失败写核心给出的真实死因');
  // 2026-09-27：点结算页任意处就重开 = 想点分享却按到正文 → 整页重开、战绩与分享一起被跳过
  check(appSrc.indexOf("elResult.addEventListener('click'") < 0
    && appSrc.indexOf('resultShownAt') < 0
    && /elRsBtn\.addEventListener\('click', restart\)/.test(appSrc)
    && /elRsShare\.addEventListener\('click', doShare\)/.test(appSrc),
    '结算页只有屏底两个按钮有动作（不再点哪都能重开，避免错过分享）');
  // 容器把剪贴板类 API 列进禁用能力扫描清单：写了 verify-minitool.mjs 会直接判不合规
  check(!/execCommand/.test(appSrc) && !/clipboard\.writeText/.test(appSrc),
    '不出现容器禁用能力（execCommand / clipboard.writeText）');
  check(/slice\(0, 20\)/.test(appSrc) && /slice\(0, 1000\)/.test(appSrc),
    '分享标题 ≤20 字、正文 ≤1000 字（postNote 的 API 上限）');
  // ⓘ 2026-09-27 三次改写分享文案：标题按战绩分级（五连满分 / 压线逃生 / 栽进大气 / 止步行星 / 氦闪追上），
  //   正文加 MOSS 评定 + 死局自嘲，挑战语统一「换你」；仍然只讲成绩、不带教程 / 标签。
  check(/function shareTitle\(\)/.test(appSrc) && /function shareEnding\(\)/.test(appSrc)
    && /'五连完美弹弓 · ' \+ T/.test(appSrc) && /地球活着冲出太阳系/.test(appSrc)
    && /'栽进' \+ \(st\.culprit \|\| '行星'\) \+ '大气层 · 第'/.test(appSrc)
    && /'止步' \+ \(st\.culprit \|\| '行星'\) \+ ' · 第'/.test(appSrc)
    && /氦闪还是追上了地球/.test(appSrc)
    && /一头栽进了' \+ who \+ '的大气层'/.test(appSrc),
    '分享标题按战绩分级（五连满分 / 压线逃生 / 栽进大气 / 止步<行星> / 氦闪追上），压在 20 字内');
  // ⓘ 2026-09-27 三次改写：分享文案**只讲成绩** —— 介绍 / 教程 / 去哪找一律不出现；
  //   取「shareEnding … shareComment」整段（到 drawShareCard 为止）做白名单 + 黑名单双查。
  const shareCopy = appSrc.slice(appSrc.indexOf('function shareEnding'), appSrc.indexOf('function drawShareCard'));
  check(shareCopy.length > 0
    && shareCopy.indexOf('MOSS 评定：') > 0
    && /'★ 新纪录 ' : '我的最快记录 '/.test(shareCopy)
    && shareCopy.indexOf('换你') > 0
    && shareCopy.indexOf('一路只有五颗行星') < 0
    && shareCopy.indexOf('目标只有一个') < 0
    && shareCopy.indexOf('小红书小工具') < 0
    && shareCopy.indexOf('绿色区间') < 0
    && shareCopy.indexOf('操作') < 0,
    '分享文案只讲成绩：成绩 + MOSS 评定 + 纪录 +「换你」挑战；介绍 / 教程 / 去哪找都不出现');
  // ⓘ 2026-09-27 反馈「删除 # 话题」：分享文案（正文 / 评论草稿）与战绩卡**都不再带标签**
  check(appSrc.indexOf('#小红书vibecoding大赛') < 0 && appSrc.indexOf('#vibegame') < 0
    && appSrc.indexOf('#小红书小工具') < 0 && appSrc.indexOf('#流浪地球') < 0,
    '分享弹窗的文案与战绩卡都不带 # 话题标签（旧版那行标签已删）');
  // ⓘ 2026-09-27 反馈「手机端长按变成了选中文字，无法正常加速」：整页禁止选中 + 禁 iOS 长按菜单，
  //   但结算页那段「要让人长按复制」的战绩文案 `.rs-hint` 必须单独把 user-select 开回来。
  check(/-webkit-user-select:none/.test(css) && /user-select:none/.test(css)
    && /-webkit-touch-callout:none/.test(css)
    && /\.rs-hint\{[^}]*-webkit-user-select:text/.test(css),
    '整页禁止选中（长按 = 按住点火，不会被当成选字 / 弹长按菜单）；只给结算页的分享文案 .rs-hint 开回可选中');

  // ---- 启动页（MOSS 自检）契约：内联资源加载只要一两百毫秒，不做最短停留就会一闪而过 ----
  check(htmlIds.has('loader') && htmlIds.has('ld-log') && htmlIds.has('ld-fill') && htmlIds.has('ld-status'),
    '启动页 DOM 齐全（#loader / #ld-log / #ld-fill / #ld-status）');
  const ldLines = (html.match(/<div class="ld-line">[\s\S]*?<\/div>/g) || []);
  const ldNames = ldLines.map((s) => ((s.match(/<em>([^<]+)<\/em>/) || ['', ''])[1]));
  check(Array.isArray(C.BOOT_STEPS) && C.BOOT_STEPS.length === ldNames.length
    && C.BOOT_STEPS.every((s, i) => s.k === ldNames[i]),
    '自检清单逐项与 BOOT_STEPS 一一对应（HTML 与代码不会各写一套）', ldNames.join(' → '));
  check(C.BOOT_STEPS.every((s, i) => i === 0 || s.t > C.BOOT_STEPS[i - 1].t)
    && C.BOOT_STEPS[C.BOOT_STEPS.length - 1].t <= 1,
    '自检项的打勾时刻严格递增且都在停留时长内（清单按顺序一条条亮）');
  check(typeof C.BOOT_MIN_MS === 'number' && C.BOOT_MIN_MS >= 1500 && C.BOOT_MIN_MS <= 5000,
    '启动页有最短停留时长（BOOT_MIN_MS ≥1.5 s 且 ≤5 s，不再一闪而过也不拖沓）', C.BOOT_MIN_MS + ' ms');
  check(/function updateBoot\(now\)/.test(appSrc) && /elLdFill\.style\.width/.test(appSrc)
    && /classList\.add\('done'\)/.test(appSrc),
    '自检条按已停留时长写宽度、清单逐项打勾（是真实进度，不是无限扫动的假动画）');
  // 收尾那句话必须真的看得见：100% 与撤屏若在同一帧发生，等于最后一句没写
  check(typeof C.BOOT_DONE_MSG === 'string' && C.BOOT_DONE_MSG.length > 0
    && /BOOT_TAIL_MS/.test(appSrc) && /BOOT_DONE_MSG/.test(appSrc)
    && /BOOT_MIN_MS \+ BOOT_TAIL_MS/.test(appSrc),
    '走满后再多留一拍（BOOT_TAIL_MS），让「自检完成」这句真的被看到', C.BOOT_DONE_MSG);
  check(appSrc.indexOf('@keyframes ldScan') < 0 && !/@keyframes ldScan/.test(css),
    '旧的无限扫描动画（ldScan）已随假进度一起移除');
  // 撤屏必须发生在自检走满之后（旧版是「渲染出第一帧就 hide」→ 一闪而过）
  check(appSrc.indexOf('loaderHidden') < 0 && /bootDone = true;[\s\S]{0,80}elLoader\.classList\.add\('hide'\)/.test(appSrc),
    '启动页由 bootDone 门控撤屏（不再是第一帧就 hide 的一闪而过）');
  check(/if \(!bootDone\)[\s\S]{0,120}updateBoot\(now\)/.test(appSrc)
    && /\} else if \(introT < INTRO_TIME\)/.test(appSrc),
    '自检没走完就不推进开场过场（2.6 s 的过场镜头不会在启动页背后放完）');

  // 背景音乐：真正的 mp3 字节藏在 assets/bgm-data.js 里（不是 .mp3 文件、不是 <audio src>），
  // 页面必须在 app.js 之前加载它，app.js 必须走 decodeAudioData 并带一个静音开关。
  const bgmPath = path.join(ASSETS, 'bgm-data.js');
  check(fs.existsSync(bgmPath), 'assets/bgm-data.js 存在（BGM 以 base64 内联）');
  if (fs.existsSync(bgmPath)) {
    const bgmSrc = fs.readFileSync(bgmPath, 'utf8');
    const m = bgmSrc.match(/window\.WE_BGM_B64\s*=\s*"([^"]+)"/);
    check(!!m, 'bgm-data.js 导出 window.WE_BGM_B64');
    if (m) {
      const b64 = m[1];
      check(b64.length > 100 * 1024 && b64.length % 4 === 0, 'base64 长度合法且体量像一整首歌',
        (b64.length / 1024).toFixed(0) + ' KB');
      const buf = Buffer.from(b64, 'base64');
      check(buf.toString('latin1').indexOf('ID3') === 0 || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0),
        '解出来确实是 MPEG 音频（首字节是 ID3 或帧同步字）', '0x' + buf[0].toString(16) + buf[1].toString(16));
      // 估时长：CBR 时 时长 = 字节数 × 8 / 码率（码率/采样率取自第一个帧头）。
      // MPEG2 / MPEG2.5 的表与 MPEG1 不同，不能只认 MPEG1 —— 只看 MPEG1 会误判到后面某个碰巧
      // 长得像同步字的字节上，把 122 s 的曲子算成 31 s。
      const HT1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
      const HT2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
      const SR1 = [44100, 48000, 32000], SR2 = [22050, 24000, 16000], SR25 = [11025, 12000, 8000];
      let off = 0, br = 0, sr = 0, verName = '';
      if (buf.toString('latin1', 0, 3) === 'ID3') {
        off = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
      }
      for (let i = off; i < Math.min(buf.length - 4, off + 65536); i++) {
        if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
        const ver = (buf[i + 1] >> 3) & 3, lay = (buf[i + 1] >> 1) & 3;
        const bi = (buf[i + 2] >> 4) & 15, si = (buf[i + 2] >> 2) & 3;
        if (ver === 1 || lay !== 1 || bi === 0 || bi === 15 || si === 3) continue;
        const t = ver === 3 ? HT1 : HT2, srt = ver === 3 ? SR1 : (ver === 2 ? SR2 : SR25);
        br = t[bi]; sr = srt[si];
        verName = ver === 3 ? 'MPEG1' : (ver === 2 ? 'MPEG2' : 'MPEG2.5');
        off = i; break;
      }
      const dur = br ? (buf.length - off) * 8 / (br * 1000) : 0;
      check(br > 0 && dur > 20 && dur < 400, '码率/时长合理（可循环播放的整曲）',
        verName + ' Layer III · ' + br + ' kbps · ' + sr + ' Hz · 约 ' + dur.toFixed(0) + ' s');
    }
    check(html.indexOf('bgm-data.js') > 0 && html.indexOf('bgm-data.js') < html.indexOf('app.js'),
      'index.html 在 app.js 之前加载 bgm-data.js');
    check(/decodeAudioData/.test(appSrc) && /WE_BGM_B64/.test(appSrc),
      'app.js 走 atob → decodeAudioData 播放（不产生 URL，避开 file:// 跨域）');
    check(/getElementById\('mute'\)/.test(appSrc),
      'app.js 绑定了静音开关（BGM 必须能关掉）');
    check(/localStorage/.test(appSrc) && /visibilitychange/.test(appSrc),
      '静音状态持久化 + 切后台挂起音频上下文');
  }

  // 已删除的旧元素/旧机制不应再被引用（自由飞行版遗留）
  // ⓘ 2026-09-27：水星 / 金星 / 火星的贴图**回来了**（改成真实影像），
  //   故把 mercury-data / venus-data / mars-data 与 *_TEXTURE_URI 从「死亡名单」里撤掉。
  const dead = ['compass', 'cmp-svg', 'cmp-label', 'aim-name', 'aim-dist', 'aim-tag', 'screenDragToWorld',
    'bf-rule', 'bf-line', 'bf-dot', 'elThrust', '#thrust', 'th-flame', 'refreshThrust',
    'pulseWarn', 'pulseWarnLevel'];   // 旧的二值脉冲预警（已换 pulseHot / pulseIn / pulseTip）
  const residue = dead.filter((d) => appSrc.indexOf(d) >= 0 || html.indexOf(d) >= 0);
  check(residue.length === 0, '已删除的旧元素/旧机制无残留引用', residue.length ? '残留: ' + residue.join(',') : '干净');

  // ---- 行星贴图：掠过五站 + 场上三颗**全部真实影像**（2026-09-27；地球另有 earth-data.js）----
  // 仍以「内联 base64 的 *-data.js」分发（file:// 下 <img> 会污染画布 → texImage2D 被拒），
  // 所以每颗都要同时满足：① index.html 引了数据文件 ② app.js 里挂了 *_TEXTURE_URI。
  const planetTexKeys = ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'MERCURY', 'VENUS', 'MARS'];
  const missTex = planetTexKeys.filter((n) => html.indexOf(n.toLowerCase() + '-data.js') < 0
    || appSrc.indexOf(n + '_TEXTURE_URI') < 0);
  check(missTex.length === 0, '八颗行星全部用真实影像贴图（地球除外：仍用 earth-data.js）',
    missTex.length ? '缺: ' + missTex.join(',') : planetTexKeys.length + ' 颗全部命中');
  check(appSrc.indexOf('procPlanetTex') > 0 && /\|\| procPlanetTex/.test(appSrc),
    'procPlanetTex 保留为兜底（内联数据缺失时退回程序化色块，不会开天窗）');

  // 简报：三条 MOSS 口吻的输出（情报 / 处境 / 目标）+ 一句「谁做决定」的对照，
  // 规则与操作交给局内 HUD 教（2026-09-27 改文案：轨道解算 / 氦闪冲击波 / 目标脱离太阳系）
  check(/MOSS：轨道解算完毕，5 次点火窗口可用/.test(html) && /MOSS：氦闪冲击波尾随逼近/.test(html)
    && /MOSS：目标：最短时间脱离太阳系/.test(html) && /你：选定点火时刻/.test(html),
    '简报 = 三条 MOSS 输出（情报 / 处境 / 目标）对一条「你：选定点火时刻」');
  // 引导拆成编号操作卡：一条长句拆成「动作 → 时机 → 代价」三张卡，两秒扫完
  const stepCards = html.match(/class="bf-step(?: bad)?"/g) || [];
  check(stepCards.length === 3 && /class="bf-step bad"/.test(html),
    '开场引导是三步操作卡（第三条为代价，单独标红）', stepCards.length + ' 张卡');
  check(/绿色区间/.test(html) && /本次弹弓作废/.test(html) && /class="bf-moss bf-goal"/.test(html),
    '操作卡把「绿色区间」「弹弓作废」与唯一目标都写清楚了（目标行已是 MOSS 第二条输出）');
  check(html.indexOf('地球沿固定航线自动前进') < 0 && html.indexOf('烧满会过热锁定') < 0,
    '旧的路线描述与操作说明已从简报删除');

  /* ---- 简报篇幅契约：面板必须一屏放下，「点火启航」不许靠滚动才能看见 ----
     320×568 的可排高度只有 498px。曾经踩过的坑：三条指令各带一行灰色「为什么」→
     三张两行卡片把面板顶到 620px，再配一张 210×130 的示意图，「点火启航」直接被推出屏幕。
     篇幅是唯一真源，所以这里逐条锁住「让它变长的三个动作」：加说明行、加高示意图、加字数。 */
  const briefBlock = html.slice(html.indexOf('<div id="brief">'), html.indexOf('<div id="result">'));
  check(briefBlock.length > 0 && !/<div class="bf-step[\s\S]{0,200}?<i>/.test(briefBlock),
    '三条指令各占一行（不再给每条挂一行灰色「为什么」——那是 620px 那版的元凶）');
  const svgBox = briefBlock.match(/class="bf-svg" viewBox="0 0 (\d+) (\d+)"/);
  check(!!svgBox && Number(svgBox[2]) <= 90,
    '航线示意图是扁版（viewBox 高 ≤ 90，高度不能再长回去）', svgBox ? svgBox[1] + '×' + svgBox[2] : '未找到');
  // 可见正文（去标签、去注释、去 svg 与空白）字数上限 —— 115 是当前实测值，留 10 字余量
  const briefText = briefBlock
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '');
  check(briefText.length <= 125, '简报正文字数 ≤ 125（加一段话就会顶出屏幕）', briefText.length + ' 字');

  // 星空回归契约：天球一旦回到「贴图」实现，相机在球内只会截取 ~60° 视场，
  // 每纹素被放大数倍，底色渐变与银河雾的 8bit 量化台阶会被放大成「白色方格子」。
  check(appSrc.indexOf('starfieldTex') < 0 && appSrc.indexOf('SphereGeometry') >= 0,
    '天球用顶点色而非贴图（贴图在球内被放大 → 白色方格子）');

  // 兼容性基线（AGENTS.md）：Android 8.1 出场 Chrome / WebView 61 = ES2017，业务 JS 必须 ES5
  const es6 = [
    [/=>/, '箭头函数'], [/(^|[^\w.$])const\s/, 'const'], [/(^|[^\w.$])let\s/, 'let'],
    [/`/, '模板串'], [/\.\.\./, '展开/剩余'], [/\.includes\(/, 'Array/String.includes'],
    [/Object\.assign/, 'Object.assign'], [/\.find\(/, 'Array.find'], [/class\s+\w/, 'class']
  ].filter(([r]) => r.test(appSrc)).map(([, n]) => n);
  check(es6.length === 0, 'app.js 全文 ES5（兼容 WebView 61）', es6.length ? '命中: ' + es6.join(',') : '零命中');
})();

console.log('\n=== 常量互锁 ===');
(function () {
  // 速度显示锚点：巡航速（KMS_REF_SPEED 单位/秒）= 1 AU 处的太阳逃逸速度 42.1 km/s
  const vEsc = C.KMS_PER_UNIT * 100;
  check(near(vEsc, C.SUN_ESCAPE_KMS_1AU, 0.05), '速度换算：100 单位/秒 = ' + C.SUN_ESCAPE_KMS_1AU + ' km/s（1 AU 太阳逃逸速度）',
    vEsc.toFixed(2) + ' km/s');
  check(C.STAR_SIZE >= 8 && C.STAR_SIZE <= 16,
    '星点尺寸 ≥8px（点精灵把整张贴图铺到 N 像素上，N 太小时像素中心只能采到贴图中心那点纯白 → 实心白方块）', C.STAR_SIZE + ' px');
  // 最佳区间与窗口**逐行星**（由质量派生）→ 温升互锁必须逐颗验，不能只看一组全局值。
  // 2026-09-26 重构后温度不再按恒定速率涨，而是**按当前功率档位**涨（温度 = ∫ 功率）：
  // 冷机按住时功率要先爬 0.5 s 到满额（起转三角），所以烧穿时刻比旧版晚一点点。
  const T_SPOOL = C.PWR_MAX / C.PWR_UP;                        // 起转时长（0 → 满功率）
  const T_FULL_COLD = T_SPOOL / 2 + C.TEMP_MAX / C.TEMP_RATE;   // 冷机按住 → 烧穿
  const T_FULL_HOT = C.TEMP_MAX / C.TEMP_RATE;                  // 已在满功率 → 烧穿
  const heatAt = (sec) => {
    const ramp = Math.min(sec, T_SPOOL);
    let h = C.TEMP_RATE * ramp * ramp / (2 * T_SPOOL);          // 起转段：功率线性爬升
    if (sec > T_SPOOL) h += C.TEMP_RATE * (sec - T_SPOOL);
    return h;
  };
  const badRange = W.flybys.filter((f) => !(f.sweet0 > 0 && f.sweet0 < f.sweet1 && f.sweet1 <= 1));
  check(badRange.length === 0, '每颗行星的最佳区间比例都合法（0 < sweet0 < sweet1 ≤ 1）',
    W.flybys.map((f) => f.name + ' ' + f.sweet0.toFixed(2) + '→' + f.sweet1.toFixed(2)).join(' · '));
  check(W.flybys.every((f) => T_FULL_COLD < f.winTime),
    '冷机在窗口起点一路按住 → 必然在该行星窗口内烧穿（功率要从 0 起转，比旧版慢 0.15 s）',
    T_FULL_COLD.toFixed(2) + 's < ' + Math.min(...W.flybys.map((f) => f.winTime)).toFixed(2) + 's（最短窗口）');
  check(W.flybys.every((f) => T_FULL_HOT < f.winTime),
    '满功率恒温烧穿 < 每颗窗口时长（功率表顶到额定线时更烫）',
    T_FULL_HOT.toFixed(2) + 's < ' + Math.min(...W.flybys.map((f) => f.winTime)).toFixed(2) + 's（最短窗口）');
  check(W.flybys.every((f) => heatAt(f.sweetTime) < C.TEMP_MAX),
    '冷机起只按住绿色区间（最长的区间）→ 温度不到满箱（规规矩矩按绿色区间不会过热）',
    heatAt(Math.max(...W.flybys.map((f) => f.sweetTime))).toFixed(1) + ' < ' + C.TEMP_MAX);
  check(heatAt(C.PULSE_DUR) * C.PULSE_THRUST_BOOST < C.TEMP_MAX,
    '冷机起按满整段脉冲（1 s，乘波 ×1.6）不会烧穿 → 提示里的「全功率推进」是安全的',
    (heatAt(C.PULSE_DUR) * C.PULSE_THRUST_BOOST).toFixed(1) + ' < ' + C.TEMP_MAX);
  check(C.TEMP_MAX / (C.TEMP_RATE * C.PULSE_THRUST_BOOST) < C.PULSE_DUR,
    '已在满功率时进入脉冲（预警期就按住）→ 脉冲没结束就烧穿（所以预警只说倒计时、绝不说「按住」）',
    (C.TEMP_MAX / (C.TEMP_RATE * C.PULSE_THRUST_BOOST)).toFixed(2) + 's < ' + C.PULSE_DUR + 's');
  check(C.TEMP_MAX / C.COOL_RATE > 3 && C.PWR_MAX / C.PWR_DOWN < 1,
    '熄火比散热快得多（功率 0.5 s 归零、温度要 3.85 s 归零 → 过热才是真代价）',
    '功率 ' + (C.PWR_MAX / C.PWR_DOWN).toFixed(2) + 's vs 温度 ' + (C.TEMP_MAX / C.COOL_RATE).toFixed(2) + 's');
  check(C.CRASH_RATIO > 0 && C.CRASH_RATIO < 1, '撞毁阈值比例合法', String(C.CRASH_RATIO));
  check(W.flybys.length === 5, '航线掠过 5 颗行星（木星→土星→天王星→海王星→冥王星）', W.flybys.map((f) => f.name).join('→'));
  // 火星（1.52 AU）距起点只有 52 单位：窗口还没亮就已经到判定点，只能从名单里去掉
  check(!W.flybys.some((f) => f.key === 'mars'), '火星不在掠过名单（离起点太近，窗口来不及亮）');
  check(W.flybys[0].orbitR >= 5 * W.AU, '首颗行星在 5 AU 之外（起手有足够长的加速段）',
    (W.flybys[0].orbitR / W.AU).toFixed(2) + ' AU');
  for (const f of W.flybys) {
    if (!(f.vSling > f.vNeed)) { check(false, f.name + ' 弹弓速度 > 判定门槛'); }
  }
  check(W.flybys.every((f) => f.vSling > f.vNeed), '每颗行星的弹弓速度都高于判定门槛（弹弓是通关必需）',
    W.flybys.map((f) => f.vNeed + '<' + f.vSling).join(' '));
})();

console.log('\n=== 质量 → 时机窗口（每颗行星不同）===');
(function () {
  const f = W.flybys;
  // 引力强度 v_esc = √(2GM/R)：由真实质量 mEarth 与真实半径 rKm 推出（不是另一套手写数据）
  const massOrder = [...f].sort((a, b) => b.mEarth - a.mEarth).map((x) => x.key).join('>');
  const vescOrder = [...f].sort((a, b) => b.vEsc - a.vEsc).map((x) => x.key).join('>');
  check(massOrder === vescOrder, '质量序 = 逃逸速度序（v_esc 由 mEarth + rKm 推导，两套数据互锁）',
    vescOrder);
  check(near(f[0].vEsc, 60.2, 2) && near(f[4].vEsc, 1.21, 0.4),
    'v_esc 与真实值同量级（木星 59.5 / 冥王星 1.27 km/s）',
    f.map((x) => x.name + ' ' + x.vEsc.toFixed(2)).join(' / '));

  // 引力越强 → 窗口越长、绿色区间越宽（按 vEsc 由弱到强检查单调）
  const byV = [...f].sort((a, b) => a.vEsc - b.vEsc);
  let okWin = true, okSweet = true;
  for (let i = 1; i < byV.length; i++) {
    if (!(byV[i].winTime > byV[i - 1].winTime)) okWin = false;
    if (!(byV[i].sweet0 < byV[i - 1].sweet0)) okSweet = false;   // sweet0 越小 = 起点越早 = 区间越宽
  }
  check(okWin, '引力越强 → 加速窗口越长（窗口时长逐行星）',
    byV.map((x) => x.name + ' ' + x.winTime.toFixed(2) + 's').join(' · '));
  check(okSweet, '引力越强 → 绿色区间越宽（最佳区间占比逐行星）',
    byV.map((x) => x.name + ' ' + ((x.sweet1 - x.sweet0) * 100).toFixed(1) + '%').join(' · '));
  check(near(f[0].sweet0, C.SWEET_LO_WIDE, 1e-9) && near(f[4].sweet0, C.SWEET_LO_NARROW, 1e-9),
    '两端锚定：木星最宽（' + C.SWEET_LO_WIDE + '，1 − e^−' + C.SLING_SWEET_PRODUCT + ' 收益）· 冥王星最窄（' + C.SWEET_LO_NARROW + '）',
    '区间时长 ' + f.map((x) => x.sweetTime.toFixed(2) + 's').join(' / '));

  // 关键：吃满绿色区间的**收益**与区间宽窄无关（只影响「手要按多准」）
  const gains = f.map((x) => 1 - Math.exp(-x.slingK * x.sweetTime));
  check(gains.every((g) => Math.abs(g - gains[0]) < 1e-9),
    '吃满绿色区间的弹弓逼近量逐行星完全一致（窄区间只是更难按准，不会让吃满的人变慢 → 通关时间/壳曲线不用重标）',
    (gains[0] * 100).toFixed(1) + '%');
  check(f.every((x) => x.ratingSweet > 0 && x.ratingSweet < x.sweetTime),
    '「完美弹弓」阈值落在各自区间之内（按该行星区间宽度折算）',
    f.map((x) => x.name + ' ' + x.ratingSweet.toFixed(2) + 's').join(' / '));

  // 真实质量序的细节：海王星质量 > 天王星 → 它的窗口与区间都不小于天王星
  check(f[3].winTime >= f[2].winTime && f[3].sweet0 <= f[2].sweet0,
    '海王星（17.15 地球质量 > 天王星 14.54）的窗口与区间都不小于天王星（按质量而非按轨道顺序）',
    '海 ' + f[3].winTime.toFixed(2) + 's/' + ((f[3].sweet1 - f[3].sweet0) * 100).toFixed(1) + '% vs ' +
    '天 ' + f[2].winTime.toFixed(2) + 's/' + ((f[2].sweet1 - f[2].sweet0) * 100).toFixed(1) + '%');
})();

console.log('\n=== 航线几何 ===');
(function () {
  check(route.len > 4000, '航线总弧长 > 4000 单位', route.len.toFixed(0));
  check(route.cum[route.n] === route.len && route.cum[0] === 0, '弧长表首尾正确');
  let mono = true;
  for (let i = 1; i <= route.n; i++) if (!(route.cum[i] > route.cum[i - 1])) mono = false;
  check(mono, '弧长表严格递增（routeSample 的二分查找前提）');

  // s 是弧长参数：在采样点上必须精确命中，且相邻采样步长基本均匀
  const a = [0, 0, 0], b = [0, 0, 0];
  let exactErr = 0;
  for (let k = 0; k <= 60; k++) {
    const i = Math.round(route.n * k / 60);
    M3D.routeSample(route, route.cum[i], a, null);
    exactErr = Math.max(exactErr,
      Math.abs(a[0] - route.pts[i * 3]) + Math.abs(a[1] - route.pts[i * 3 + 1]) + Math.abs(a[2] - route.pts[i * 3 + 2]));
  }
  check(exactErr < 1e-9, 'routeSample(弧长表) 精确命中采样点（弧长参数正确）', '最大偏差 ' + exactErr.toExponential(1));
  let maxErr = 0;
  const step = route.len / 40;
  for (let k = 1; k <= 40; k++) {
    const s0 = step * (k - 1), s1 = step * k;
    M3D.routeSample(route, s0, a, null);
    M3D.routeSample(route, s1, b, null);
    const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    maxErr = Math.max(maxErr, Math.abs(d - step));
  }
  check(maxErr / step < 0.08, '相邻取样点的空间距离 ≈ 弧长差（折线即航线本体）',
    '最大偏差 ' + (maxErr / step * 100).toFixed(1) + '%');

  // 航线必须是 3D 的（垂直起伏），否则退化成平面圆环
  let yMin = Infinity, yMax = -Infinity;
  const p = [0, 0, 0];
  for (let k = 0; k <= 200; k++) { M3D.routeSample(route, route.len * k / 200, p, null); yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]); }
  check(yMax - yMin > 40, '航线有垂直起伏（3D 曲线，不是平面圆环）', 'Δy = ' + (yMax - yMin).toFixed(0));

  // 行星：够大、按航线顺序、掠过距离 = 半径 + 净空、不穿模
  let sAsc = true, clearOk = true, hit = [];
  for (let i = 0; i < N_F; i++) {
    if (i > 0 && !(fbs[i].s > fbs[i - 1].s)) sAsc = false;
    const d = fbs[i].def;
    if (!(fbs[i].passDist > d.rad + W.EARTH_R)) hit.push(d.name);
    if (!near(fbs[i].passDist, d.rad + d.clear, 0.5)) clearOk = false;
  }
  check(sAsc, '五颗行星沿航线依次排列（弧长递增）', fbs.map((f) => f.def.name + '@' + f.s.toFixed(0)).join(' '));
  check(clearOk, '掠过距离 = 行星半径 + 设计净空（构造保证，不靠调参巧合）',
    fbs.map((f) => f.def.name + ' ' + f.passDist.toFixed(1)).join(' / '));
  check(hit.length === 0, '掠过点行星表面不会与地球相撞（最近距离 > 半径+地球半径）',
    hit.length ? '危险: ' + hit.join(',') : fbs.map((f) => f.def.name + ' ' + (f.passDist - f.def.rad).toFixed(1)).join(' / '));

  // 行星离太阳的距离应贴近真实轨道半径（贴图/命名的可信度）
  let worst = 0;
  for (let i = 0; i < N_F; i++) {
    const r = len3(fbs[i].pos);
    worst = Math.max(worst, Math.abs(r - fbs[i].def.orbitR) / fbs[i].def.orbitR);
  }
  check(worst < 0.02, '行星距日半径 ≈ 真实轨道半径（偏差 < 2%）', '最大偏差 ' + (worst * 100).toFixed(2) + '%');

  // 行星必须挂在航线掠过点的**局部正上方**：偏移向量垂直于航线切向、长度 = rad + clear
  const q = [0, 0, 0], tg = [0, 0, 0];
  let worstTan = 0, worstLen = 0;
  for (let i = 0; i < N_F; i++) {
    M3D.routeSample(route, fbs[i].s, q, tg);
    const dx = fbs[i].pos[0] - q[0], dy = fbs[i].pos[1] - q[1], dz = fbs[i].pos[2] - q[2];
    worstTan = Math.max(worstTan, Math.abs(dx * tg[0] + dy * tg[1] + dz * tg[2]));
    worstLen = Math.max(worstLen, Math.abs(len3([dx, dy, dz]) - fbs[i].h));
  }
  check(worstTan < 1e-9, '行星挂在航线掠过点的正上方（偏移 ⊥ 切向 → 掠过时行星在屏幕上方正中）',
    '最大切向偏移 ' + worstTan.toExponential(1));
  check(worstLen < 1e-9, '偏移长度 = 行星半径 + 设计净空', '最大偏差 ' + worstLen.toExponential(1));
})();

console.log('\n=== 天体尺度（真实比例）===');
(function () {
  // 半径的**唯一真源**是真实半径 rKm：rad 必须正好 = rKm / KM_PER_UNIT × BODY_SCALE。
  // 这条断言是「比例正确」的回归锁：谁再手调单颗行星的尺寸都会被它拦下。
  const K = W.KM_PER_UNIT, S = W.BODY_SCALE;
  const toUnits = (km) => km / K * S;
  let worst = 0, worstName = '地球';
  for (const f of W.flybys) {
    const e = Math.abs(f.rad - toUnits(f.rKm)) / toUnits(f.rKm);
    if (e > worst) { worst = e; worstName = f.name; }
  }
  const eEarth = Math.abs(W.EARTH_R - toUnits(6371)) / toUnits(6371);
  if (eEarth > worst) { worst = eEarth; worstName = '地球'; }
  check(worst < 1e-12, '行星与地球的半径 = 真实半径 × 同一倍率（比例与真实一致）',
    '最大偏差 ' + worst.toExponential(1) + '（' + worstName + '，倍率 ' + S + '×）');
  check(near(W.EARTH_R, 3.4, 0.05), '地球半径 = 3.41 单位 ≈ 手调时代的 3.4（统一倍率是拿地球的观感做锚点定的）',
    '倍率 ' + S + '× → 地球 ' + W.EARTH_R.toFixed(3) + ' 单位');
  // 净空随半径等比放大 → 「掠过距离 : 半径」的相对关系与放大前完全一致（掠过分镜不变）。
  // 改倍率（300→800）前实测：25.0/14.02 = 1.78、21.7/11.68 = 1.86、14.1/5.09 = 2.77、13.4/4.94 = 2.73
  // 穿环问题改由「环面朝向」解决后，土星也回到等比；只剩冥王星因相机抬升例外
  const shape = [1.78, 1.86, 2.77, 2.73];
  const keep = [fbs[0], fbs[1], fbs[2], fbs[3]];
  check(keep.every((f, i) => near(f.passDist / f.def.rad, shape[i], 0.03)),
    '木星 / 土星 / 天王星 / 海王星的「掠过距离 : 半径」与放大前一致（1.78 / 1.86 / 2.77 / 2.73）',
    keep.map((f) => f.def.name + ' ' + (f.passDist / f.def.rad).toFixed(2)).join(' / '));
  // 土星光环：**环面朝向**才是「地球不穿环」的关键（环带内最小垂距必须 > 地球半径）。
  // RingGeometry 默认法线 +Z，不旋转时航线正好在环带内穿过环面（实测 0.15 单位 << 3.41）。
  const sap = fbs[1], n = C.RING_NORMAL, ringIn = sap.def.rad * C.RING_IN, ringOut = sap.def.rad * C.RING_OUT;
  const rp = [0, 0, 0];
  let ringClear = Infinity, ringRho = 0;
  for (let s = 0; s <= route.len; s += 1) {
    M3D.routeSample(route, s, rp, null);
    const vx = rp[0] - sap.pos[0], vy = rp[1] - sap.pos[1], vz = rp[2] - sap.pos[2];
    const d = vx * n[0] + vy * n[1] + vz * n[2];
    const ax = vx - d * n[0], ay = vy - d * n[1], az = vz - d * n[2];
    const rho = Math.sqrt(ax * ax + ay * ay + az * az);
    if (rho > ringIn && rho < ringOut && Math.abs(d) < ringClear) { ringClear = Math.abs(d); ringRho = rho; }
  }
  check(ringClear > W.EARTH_R,
    '土星：航线穿过环带时的最小垂距 > 地球半径（环面朝向 = 赤道面 + 26.73° 轴倾 → 地球不穿环）',
    '最小垂距 ' + ringClear.toFixed(2) + ' 单位（rho=' + ringRho.toFixed(1) + '）· 地球半径 ' + W.EARTH_R.toFixed(2) +
    ' · 法线 (' + n.map((x) => x.toFixed(3)).join(',') + ')');
  check(near(C.SAT_TILT, 26.73 * Math.PI / 180, 1e-6) && C.RING_IN >= 1 && C.RING_OUT <= 2.3,
    '光环用真实比例与真实轴倾角（环带 ' + C.RING_IN + '~' + C.RING_OUT + ' R，轴倾 26.73°）');
  check(Math.abs(fbs[4].passDist - C.CAM_UP) > 5 * fbs[4].def.rad,
    '冥王星是唯一例外：等比后掠距 19.3 ≈ 相机抬升 20（相机会贴它中心过）→ 压到 15.0，从它上方 5.0 单位掠过',
    '|掠距 − 抬升| = ' + Math.abs(fbs[4].passDist - C.CAM_UP).toFixed(1) + ' 单位 = ' +
    (Math.abs(fbs[4].passDist - C.CAM_UP) / fbs[4].def.rad).toFixed(1) + ' 倍半径');

  // 抽 4 组真实比例：木:土 1.20、天:海 1.03、木:冥 58.8、木:地 10.97
  const pairs = [
    ['木星/土星', 0, 1, 69911 / 58232],
    ['天王星/海王星', 2, 3, 25362 / 24622],
    ['木星/冥王星', 0, 4, 69911 / 1188],
    ['木星/地球', 0, -1, 69911 / 6371]
  ];
  const radOf = (i) => (i === -1 ? W.EARTH_R : W.flybys[i].rad);
  const badPair = pairs.filter(([, a, b, want]) => !near(radOf(a) / radOf(b), want, want * 1e-9));
  check(badPair.length === 0,
    '实测半径比 = 真实半径比（' + pairs.map((p) => p[0] + ' ' + p[3].toFixed(2)).join(' · ') + '）',
    badPair.length ? '偏差: ' + badPair.map((p) => p[0]).join(',') + '（' + W.flybys.map((f) => f.rad.toFixed(2)).join('/') + '）' : '');

  // 太阳必须显式例外：同倍率下它是 0.4655 单位 × 300 = 139.7 单位，
  // 而航线起点只有 95 单位、氦闪壳从 30 单位起 —— 地球会被装进太阳里。
  const sunTrue = 696340 / W.AU_KM * W.AU, sunIfSame = sunTrue * S;
  check(sunIfSame > 95 && W.SUN_R < sunIfSame,
    '太阳不参与统一倍率（同比会是 ' + sunIfSame.toFixed(1) + ' 单位 > 航线起点 95 单位 → 地球生在太阳内部）',
    '太阳实际 ' + W.SUN_R + ' 单位 ≈ ' + (W.SUN_R / sunTrue).toFixed(0) + '×（真值 ' + sunTrue.toFixed(3) + ' 单位）');

  // 屏幕上的大小次序必须与真实一致
  let mono = true;
  for (let i = 1; i < W.flybys.length; i++) if (!(W.flybys[i].rad < W.flybys[i - 1].rad)) mono = false;
  check(mono, '星球大小次序 = 真实次序（木 > 土 > 天 > 海 > 冥）',
    W.flybys.map((f) => f.name + ' ' + (f.rad * 2).toFixed(1)).join(' / '));
  check(W.flybys[4].rad < W.EARTH_R && W.EARTH_R < W.flybys[3].rad,
    '冥王星 < 地球 < 海王星（真实 1188 < 6371 < 24622 km）',
    '冥 ' + W.flybys[4].rad.toFixed(2) + ' / 地 ' + W.EARTH_R.toFixed(2) + ' / 海 ' + W.flybys[3].rad.toFixed(2));

  // 观感核对：判定点处行星的角直径占屏高（真实比例的直接后果，是代价不是 bug）
  const cam = { s: 0, v: 150, pos: [0, 0, 0], tan: [0, 0, 0], rSun: 0, shellR: 0, zoom: 1 };
  const CP = [0, 0, 0], CL = [0, 0, 0], pct = [];
  for (const f of fbs) {
    M3D.routeSample(route, f.s, cam.pos, cam.tan);
    cam.s = f.s; cam.rSun = len3(cam.pos); cam.shellR = 0;
    M3D.chasePose(route, fbs, cam, CP, CL);
    const d = len3([CP[0] - f.pos[0], CP[1] - f.pos[1], CP[2] - f.pos[2]]);
    pct.push(2 * Math.atan(f.def.rad / d) * 180 / Math.PI / C.CAM_FOV * 100);
  }
  check(pct[0] > 40, '木星在判定点仍能压满小半个屏幕（真实比例下木星尺寸几乎不变）',
    '木星 ' + pct[0].toFixed(0) + '% / 土星 ' + pct[1].toFixed(0) + '%');
  check(pct[4] < 5, '冥王星在判定点只是一颗石子（靠判定环与时机条定位，不靠球体）',
    W.flybys.map((f, i) => f.name + ' ' + pct[i].toFixed(1) + '%').join(' / '));
})();

console.log('\n=== 场上的其他行星（水星 / 金星 / 火星）===');
(function () {
  const list = M3D.buildScenery(route);
  check(typeof M3D.buildScenery === 'function' && list.length === 3, '水星 / 金星 / 火星都摆进场景（不再「直接看不到」）',
    list.map((s) => s.def.name).join(' / '));
  check(W.scenery.every((d) => !W.flybys.some((f) => f.key === d.key)),
    '它们不在掠过名单里（没有判定点、没有加速窗口、不参与判定）');
  const K = W.KM_PER_UNIT, S = W.BODY_SCALE;
  check(W.scenery.every((d) => near(d.rad, d.rKm / K * S, 1e-12)),
    '半径 = 真实半径 × 同一倍率（与掠过行星同一条换算，不搞第二套）',
    W.scenery.map((d) => d.name + ' ' + d.rad.toFixed(2) + ' 单位').join(' / '));
  let worst = 0;
  for (const s of list) worst = Math.max(worst, Math.abs(len3(s.pos) - s.def.orbitR) / s.def.orbitR);
  check(worst < 0.02, '距日 = 真实轨道半径（水星 0.387 / 金星 0.723 / 火星 1.524 AU）',
    '最大偏差 ' + (worst * 100).toFixed(2) + '% · ' +
    list.map((s) => s.def.name + ' ' + (len3(s.pos) / W.AU).toFixed(3) + ' AU').join(' '));
  check(list.every((s) => s.passDist > s.def.rad + W.EARTH_R), '航线到它们表面的最近距离 > 地球半径（不会穿模）',
    list.map((s) => s.def.name + ' ' + s.passDist.toFixed(1)).join(' / '));
  const inner = list.filter((s) => s.def.place === 'behind');
  const mars = list.filter((s) => s.def.place === 'route')[0];
  check(inner.length === 2 && inner.every((s) => len3(s.pos) < W.AU * 0.95),
    '水星 / 金星在地球起点**内侧**（正前方看不到是物理正确的，它们在后视镜与小地图上）',
    inner.map((s) => s.def.name + ' ' + (len3(s.pos) / W.AU).toFixed(2) + ' AU').join(' · '));
  check(mars && mars.s > 0 && mars.s < fbs[0].s,
    '火星在航线上有对应站台（起手正前方就能看见它，但没有窗口 → 吃不到弹弓）',
    '火星 s=' + (mars ? mars.s.toFixed(0) : '-') + ' vs 木星 ' + fbs[0].s.toFixed(0));
})();

console.log('\n=== 时机窗口（纯函数，参数逐行星）===');
(function () {
  const J = W.flybys[0], P = W.flybys[4];      // 木星（最强引力）/ 冥王星（最弱）
  check(M3D.flybyPhase(J.winTime * 2, J.winTime) === -1, '距判定点还很远 → 相位 -1（尚未进入窗口）',
    String(M3D.flybyPhase(J.winTime * 2, J.winTime)));
  check(M3D.flybyPhase(J.winTime, J.winTime) === 0, '刚进窗口 → 相位 0', String(M3D.flybyPhase(J.winTime, J.winTime)));
  check(near(M3D.flybyPhase(0, J.winTime), 1, 1e-9), '到达判定点 → 相位 1', M3D.flybyPhase(0, J.winTime).toFixed(3));
  check(M3D.flybyPhase(-1, J.winTime) === 2, '已过判定点 → 相位 2', String(M3D.flybyPhase(-1, J.winTime)));
  // 窗口时长真的是逐行星的：同样「距判定点 2.65 s」，木星已亮灯、冥王星还没进窗口
  const T = 2.65;
  check(M3D.flybyPhase(T, J.winTime) >= 0 && M3D.flybyPhase(T, P.winTime) === -1,
    '同一剩余时间下窗口逐行星（2.65 s：木星已进窗、冥王星未进窗）',
    '木星 ' + M3D.flybyPhase(T, J.winTime).toFixed(3) + ' / 冥王星 ' + M3D.flybyPhase(T, P.winTime));
  // 相位 → 区间：由「剩余时间」反推，区间的两个端点也逐行星
  const zoneAtPhase = (ph, d) => M3D.phaseZone(M3D.flybyPhase((1 - ph) * d.winTime, d.winTime), d.sweet0, d.sweet1);
  let zoneBad = [];
  for (const d of [J, P]) {
    if (zoneAtPhase((d.sweet0 + d.sweet1) / 2, d) !== 'sweet') zoneBad.push(d.name + '·sweet');
    if (zoneAtPhase(d.sweet0 / 2, d) !== 'early') zoneBad.push(d.name + '·early');
    if (zoneAtPhase((d.sweet1 + 1) / 2, d) !== 'late') zoneBad.push(d.name + '·late');
  }
  check(zoneBad.length === 0, '四段区间映射正确（过早 / 最佳 / 过晚，逐行星端点）',
    zoneBad.length ? '错: ' + zoneBad.join(',') : '木星 ' + J.sweet0 + '→' + J.sweet1 + ' · 冥王星 ' + P.sweet0 + '→' + P.sweet1);
  check(M3D.phaseZone(-1, J.sweet0, J.sweet1) === 'appr' && M3D.phaseZone(2, J.sweet0, J.sweet1) === 'done',
    '窗口前后 → appr / done');
  check(M3D.zoneEff('early') === 1 && M3D.zoneEff('appr') === 1,
    '过早区点火效率仍为 1（惩罚是「吃不到弹弓放大」，不是把推力调低）',
    'early=' + M3D.zoneEff('early'));
  check(M3D.zoneEff('late') < 0.5, '过晚区点火残效很低（已经来不及）', 'late=' + M3D.zoneEff('late'));
})();

console.log('\n=== 掠过评级（过完之后必须说清「刚才点得怎么样」）===');
(function () {
  check(typeof M3D.gradeFlyby === 'function', 'app.js 导出 gradeFlyby');
  const R = W.flybys[0].ratingSweet;       // 该行星的「吃满」阈值（逐行星）
  const cases = [
    [{ sweet: R * 2, early: 0, late: 0 }, true, 'perfect', '最佳区间吃满 → 完美弹弓'],
    [{ sweet: R * 0.6, early: 0.4, late: 0 }, true, 'good', '最佳区间吃到一半 → 弹弓增益未满'],
    [{ sweet: R * 0.2, early: 1.2, late: 0 }, true, 'early', '过早区烧得多、最佳区没跟上 → 提前点火'],
    [{ sweet: 0, early: 0, late: 0.9 }, true, 'late', '只在过晚区点火 → 点火延迟'],
    [{ sweet: 0, early: 1.5, late: 0 }, true, 'early', '全程过早区白烧 → 无效点火'],
    [{ sweet: 0, early: 0, late: 0 }, true, 'none', '一次没按 → 发动机未点火'],
    [{ sweet: R * 2, early: 0, late: 0 }, false, 'fail', '判定点速度不够 → 引力捕获'],
    // 推过了但没过门槛（弹弓作废或前面欠账）不算判死：label 要说明「还活着，只是慢了」
    [{ sweet: R * 0.6, early: 0.4, late: 0, result: 'slow', lostSling: true }, true, 'early', '弹弓作废、速度没到门槛 → 轨道速度不足（不判死）']
  ];
  let bad = 0, noTip = 0;
  for (const [r, ok, want, note] of cases) {
    const g = M3D.gradeFlyby(r, ok, R);
    if (!g || g.key !== want || !g.label || !g.tip) { bad++; console.log('      ✗ ' + note + ' → ' + (g && g.key)); }
    if (!g || !g.tip || g.tip.length < 8) noTip++;
  }
  check(bad === 0, cases.length + ' 种情形的评级判定都正确', cases.map((c) => c[2]).join(' / '));
  check(noTip === 0, '每种评级都带一句可执行的提示（不是只给个分数）');
  // 同样的绿色区间点火时长，在不同行星上评级不同 —— 阈值跟着区间宽度走
  const same = { sweet: 0.45, early: 0, late: 0 };
  check(M3D.gradeFlyby(same, true, W.flybys[4].ratingSweet).key === 'perfect' &&
    M3D.gradeFlyby(same, true, W.flybys[0].ratingSweet).key === 'good',
    '同样 0.45 s 绿色区间点火：冥王星算吃满、木星只算「弹弓增益未满」（阈值 ' +
    W.flybys[4].ratingSweet.toFixed(2) + 's vs ' + W.flybys[0].ratingSweet.toFixed(2) + 's）');
})();

(function () {
  // 过早即作废弹弓（2026-09-25 新增规则）：一旦在「过早」区间点过火，
  // 本次掠过失去弹弓机会，之后续进绿色区间也只给普通推力，评级最高「弹弓增益损失」。
  const R = W.flybys[0].ratingSweet;
  check(M3D.gradeFlyby({ sweet: R * 2, early: 0.5, late: 0, lostSling: true }, true, R).key === 'good',
    '过早点过火（lostSling）：绿色区间吃满也封顶「弹弓增益损失」、绝不完美弹弓');
  check(M3D.gradeFlyby({ sweet: R * 2, early: 0, late: 0, lostSling: false }, true, R).key === 'perfect',
    '未作废（lostSling=false）：绿色区间吃满仍是完美弹弓');
  const e2s = play((g, st) => g.setBurning(st.zone === 'early' || st.zone === 'sweet'), 1 / 60);
  const rJ = e2s.st.results[0];
  check(rJ.lostSling === true, '过早区间点过火 → 本次掠过 lostSling 置真（即便续按进绿色区间）',
    'lostSling=' + rJ.lostSling);
  check(rJ.result !== 'perfect', '过早作废后第一颗行星绝不评「完美弹弓」', 'result=' + rJ.result);
})();

(function () {
  // 分区累计：理想打法只该在 sweet 上累积；只在过早区按则 sweet 必须≈0。
  // 允许一个子步（5 ms）的边界抖动：按键每帧才读一次，区间切换可能落在帧内的某一子步里。
  const TOL = 0.05;
  const ideal = play((g, st) => g.setBurning(st.zone === 'sweet'), 1 / 60);
  const allSweet = ideal.st.results.every((r) => r.sweet > 0.3);
  const noLate = ideal.st.results.every((r) => r.late < TOL);
  check(allSweet && noLate, '理想打法：五次都在最佳区间留下时长，过晚区间 ≈ 0',
    ideal.st.results.map((r) => r.sweet.toFixed(2) + '/' + r.late.toFixed(2)).join(' '));
  const earlyOnly = play((g, st) => g.setBurning(st.zone === 'early'), 1 / 60);
  const r0 = earlyOnly.st.results[0];
  check(r0.early > 0.2 && r0.sweet < TOL, '只在过早区按：early 有值、sweet ≈ 0（评级才能分辨「过早」与「过晚」）',
    'early=' + r0.early.toFixed(2) + ' sweet=' + r0.sweet.toFixed(2));
})();

// ---------- 参考打法：只在最佳区间点火 ----------
function play(policy, dt, maxT) {
  const g = M3D.createGame(route), st = g.state;
  const marks = [];
  let last = st.target;
  while (st.status === 'flying' && st.t < (maxT || 400)) {
    policy(g, st);
    g.step(dt || 1 / 60);
    if (st.target !== last) { if (last >= 0) marks.push({ i: last, t: st.t, v: st.v }); last = st.target; }
  }
  return { st, marks };
}
const SWEET = (g, st) => g.setBurning(st.zone === 'sweet');

console.log('\n=== 速度 / 阻力 ===');
(function () {
  const g = M3D.createGame(route), st = g.state;
  const v0 = st.v;
  for (let i = 0; i < 100; i++) g.step(0.05);       // 5 秒不点火
  check(st.v < v0, '不点火时速度被阻力持续吃掉', v0 + ' → ' + st.v.toFixed(1));
  const g2 = M3D.createGame(route), st2 = g2.state;
  const g3 = M3D.createGame(route), st3 = g3.state;
  for (let i = 0; i < 20; i++) { g2.setBurning(false); g2.step(0.05); g3.setBurning(true); g3.step(0.05); }
  check(st3.v > st2.v, '同样 1 秒：点火比不点火快', '点火 ' + st3.v.toFixed(1) + ' vs 滑行 ' + st2.v.toFixed(1));
})();

console.log('\n=== 弹弓（过早 / 最佳 / 过晚）===');
(function () {
  // 同一初态：只改「在哪一段点火」，比较判定点速度
  function runSegment(zoneName) {
    const g = M3D.createGame(route), st = g.state;
    while (st.status === 'flying' && st.target === 0) {
      g.setBurning(st.zone === zoneName);
      g.step(1 / 120);
    }
    return { v: st.v, status: st.status };
  }
  const sweetRun = runSegment('sweet');
  const earlyRun = runSegment('early');
  const lateRun = runSegment('late');
  const noneRun = (function () { const g = M3D.createGame(route), st = g.state; while (st.status === 'flying' && st.target === 0) { g.setBurning(false); g.step(1 / 120); } return { v: st.v, status: st.status }; })();

  check(sweetRun.status === 'flying', '满弹弓能顺利掠过第一颗行星（木星，不被捕获）', 'status=' + sweetRun.status);
  check(sweetRun.v > earlyRun.v * 1.15,
    '最佳区间点火显著快于过早区间（过早吃不到弹弓放大）',
    '最佳 ' + sweetRun.v.toFixed(0) + ' vs 过早 ' + earlyRun.v.toFixed(0));
  check(lateRun.v < noneRun.v * 1.2,
    '过晚区间点火几乎没有收益（已来不及）',
    '过晚 ' + lateRun.v.toFixed(0) + ' vs 完全不点火 ' + noneRun.v.toFixed(0));
  check(earlyRun.v < sweetRun.v, '过早点火不如最佳时机（错过加速 = 速度更低）');

  // 「过早」与「过晚」的失败模式**必须分开**（设计意图，不是同一件事的两个名字）：
  //   · 过早把弹弓烧作废 → 地球照常掠过（记为 slow），速度欠账交给身后的氦闪壳追讨（延迟失败）
  //   · 过晚 / 没按（这一关的窗口根本没碰） → 当场被行星捕获（即时失败）
  // 旧版一律当场捕获：两种原因同一个死法，而且第一颗行星就是终点 —— 代价过高。
  // 逐颗行星验：该颗只在自己的过早区间点 1 帧（1/120 s），其余行星按理想打法。
  const earlyOnce = [];
  for (let K = 0; K < N_F; K++) {
    const g = M3D.createGame(route), st = g.state;
    while (st.status === 'flying' && st.t < 400) {
      const r = st.target >= 0 ? st.results[st.target] : null;
      if (st.target === K && r && st.zone === 'early' && r.early < 1 / 120) g.setBurning(true);
      else g.setBurning(st.zone === 'sweet');
      g.step(1 / 120);
    }
    earlyOnce.push({ name: W.flybys[K].name, res: st.results[K].result, lost: st.results[K].lostSling, status: st.status, t: st.t });
  }
  check(earlyOnce.every((x) => x.res === 'slow' && x.lost),
    '过早区点火（哪怕 1/120 s）→ 该次掠过记为「轨道速度不足」，不再当场被行星捕获',
    earlyOnce.map((x) => x.name + ' ' + x.res).join(' · '));
  // 过早的代价 = 被壳追上（前 3 颗行星上过早，整局都会拖到 30 s 之后才被追平，而不是 5.6 s 处当场终结）
  const delayed = earlyOnce.slice(0, 3).every((x) => x.status === 'burned' && x.t > 30);
  check(delayed, '过早的代价是「被氦闪壳追上」而不是「被行星抓住」：结局延后到 30 s 之后（旧版 5.6 s）',
    earlyOnce.slice(0, 3).map((x) => x.status + '@' + x.t.toFixed(1) + 's').join(' · '));
  // 对照组：窗口根本没碰（不点火 / 只在过晚区间点）→ 仍然当场被捕获
  const noFire = play((g, st) => g.setBurning(false), 1 / 60);
  const lateOnly = play((g, st) => g.setBurning(st.zone === 'late'), 1 / 60);
  check(noFire.st.results[0].result === 'caught' && noFire.st.status === 'caught',
    '完全不点火 → 当场被第一颗行星捕获（即时失败）', noFire.st.status + '@' + noFire.st.t.toFixed(1) + 's');
  check(lateOnly.st.results[0].result === 'caught',
    '只在过晚区间点火 → 当场被捕获（「过晚才会被捕捉」）', lateOnly.st.status + '@' + lateOnly.st.t.toFixed(1) + 's');
})();

console.log('\n=== 功率 → 温度 → 过热锁定 ===');
(function () {
  const g = M3D.createGame(route), st = g.state;
  check(st.pwr === 0 && st.heat === 0 && st.overheated === false,
    '开局功率 0、温度 0、未锁定', 'pwr=' + st.pwr + ' heat=' + st.heat);

  // 功率是一条**起转斜坡**（旧版是区间派生的瞬时跳变 0/20/100/160%）
  g.setBurning(true);
  g.step(0.25);                                     // 注意 g.step 的 dt 上限是 0.25 s，要分次走
  check(near(st.pwr, C.PWR_MAX / 2, 3), '按住 0.25 s → 功率约半（起转中）', 'pwr=' + st.pwr.toFixed(1));
  const pMid = st.thrustEff;
  g.step(0.25); g.step(0.25);
  check(st.pwr === C.PWR_MAX, '按住 0.5 s 后功率到满额（PWR_MAX / PWR_UP）', 'pwr=' + st.pwr.toFixed(1));
  check(pMid < st.thrustEff, '推力随功率一起长（巡航段区间效率 1）',
    pMid.toFixed(2) + ' → ' + st.thrustEff.toFixed(2));

  // 冷机持续点火 → 烧穿时刻 = 起转三角 + 满功率段（不再是旧的 TEMP_MAX / TEMP_RATE）
  const g2 = M3D.createGame(route), st2 = g2.state;
  g2.setBurning(true);
  for (let i = 0; i < 4000 && !st2.overheated; i++) g2.step(0.02);
  const theory = C.PWR_MAX / C.PWR_UP / 2 + C.TEMP_MAX / C.TEMP_RATE;
  check(st2.overheated === true, '持续点火会烧到过热锁定', 't=' + st2.t.toFixed(2) + 's');
  check(Math.abs(st2.t - theory) < 0.1, '烧穿耗时 = 起转三角 + 满功率段（温度 = ∫ 功率）',
    '实测 ' + st2.t.toFixed(2) + 's / 理论 ' + theory.toFixed(2) + 's');
  check(st2.thrustEff === 0, '锁定期间推力效率为 0（按着也推不动）', 'eff=' + st2.thrustEff);

  // ★ 强制降温（2026-09-26 改设定）：手指一直按着不松，温度照样按 COOL_RATE 降 ——
  //   点击既不会提高功率 / 速度，也不会打断降温进度。旧规则是「按着不降温，必须松手」。
  const h0 = st2.heat, step0 = st2.t;
  g2.step(0.25); g2.step(0.25);                      // 两次走满 0.5 s（dt 上限 0.25 s）；burning 一直是 true
  const cooled = h0 - st2.heat, elapsed = st2.t - step0;
  check(cooled > 1e-9, '降温是强制的：锁定期间一直按着，温度照样降',
    h0.toFixed(1) + ' → ' + st2.heat.toFixed(1));
  check(Math.abs(cooled / elapsed - C.COOL_RATE) < 0.6, '降温速率与按不按无关（= COOL_RATE）',
    (cooled / elapsed).toFixed(1) + ' /s vs ' + C.COOL_RATE);
  check(st2.pwr <= 1e-9 && st2.thrustEff === 0, '降温阶段点击不会提高功率与速度（功率仍 0、推力仍 0）',
    'pwr=' + st2.pwr.toFixed(1) + ' eff=' + st2.thrustEff.toFixed(2));

  // 降温要 ~3.85 s，但地球会在那之前先飞到木星判定点结束本局、或被氦闪壳追上 ——
  // 把地球挪到航线中段再摁到低速原地冷却（debugSet 不动温度），
  // 否则测到的是「被判负」而不是「解锁」。
  g2.debugSet(route.len * 0.55, 40);
  let preUnlockOk = true, monotonic = true, lastLockedHeat = null, guard = 0;
  while (st2.overheated && guard < 4000) {
    const hPrev = st2.heat;
    g2.step(0.02); guard++;
    if (st2.overheated) {
      lastLockedHeat = st2.heat;
      if (st2.pwr > 1e-9 || st2.thrustEff !== 0) preUnlockOk = false;
      if (st2.heat > hPrev + 1e-9) monotonic = false;
    }
  }
  check(st2.status === 'flying' && st2.overheated === false,
    '强制降温走完即解锁（本局仍在进行）', 'status=' + st2.status);
  check(monotonic && lastLockedHeat !== null && lastLockedHeat < 0.2,
    '降温单调、且只在温度归零那一刻解锁（不会中途解锁）',
    '解锁前最后一帧 heat=' + (lastLockedHeat === null ? '-' : lastLockedHeat.toFixed(3)));
  check(preUnlockOk, '整个降温阶段点击都不提高功率与速度（功率与推力全程 0）');
  // 解锁那一刻手指还在屏幕上 → 立刻重新起转，不必「松手再按」
  const pAfter = st2.pwr;
  g2.step(0.1);
  check(st2.pwr > pAfter && st2.thrustEff > 0, '解锁后手指还在屏幕上 → 立即重新起转（不必松手再按）',
    'pwr=' + st2.pwr.toFixed(1) + ' eff=' + st2.thrustEff.toFixed(2));
  g2.step(0.25); g2.step(0.25);
  check(st2.pwr === C.PWR_MAX && near(st2.thrustEff, M3D.zoneEff(st2.zone), 1e-9),
    '起转回满额后推力效率随区间恢复',
    'pwr=' + st2.pwr.toFixed(0) + ' eff=' + st2.thrustEff.toFixed(2) + ' zone=' + st2.zone);
})();

console.log('\n=== 温度由功率决定（本次重构的耦合点）===');
(function () {
  // 温度 = ∫ 功率：同一区间、同一时刻，温升速率必须与功率档位成正比。
  // 测法：把功率直接摆到某个值，只走**一个子步**（5 ms）—— 期间功率只涨 1，可忽略。
  const H = 1 / 200;
  const endS = route.len - 100;              // 航线末段：已无目标行星（区间效率 1）
  function heatRate(s, pwr, t) {
    const g = M3D.createGame(route), st = g.state;
    g.debugSet(s, 150);
    st.pwr = pwr; st.heat = 0;
    if (t !== undefined) st.t = t;
    g.setBurning(true);
    g.step(H);
    return st;
  }
  const r100 = heatRate(endS, 100).heat / H;
  check(near(r100, C.TEMP_RATE, C.TEMP_RATE * 0.03),
    '满功率 → 温升速率 = TEMP_RATE', r100.toFixed(1) + ' /s');
  const r50 = heatRate(endS, 50).heat / H;
  check(near(r50, C.TEMP_RATE / 2, C.TEMP_RATE * 0.03),
    '功率 50% → 温升减半（温度 = ∫ 功率，不是恒定速率）', r50.toFixed(1) + ' /s');
  const r20 = heatRate(endS, 20).heat / H;
  check(near(r20, C.TEMP_RATE * 0.2, C.TEMP_RATE * 0.03),
    '功率 20% → 温升只有 1/5', r20.toFixed(1) + ' /s');

  // 区间效率也进这条链：过晚残效 20% 连温度都只涨 1/5，过早区则照样满速烧（那才是「白烧」）
  const fd = fbs[0];
  const late = heatRate(fd.s - 20, 100), early = heatRate(fd.s - 270, 100), sweet = heatRate(fd.s - 150, 100);
  check(late.zone === 'late' && near(late.heat / H, C.TEMP_RATE * C.LATE_EFF, C.TEMP_RATE * 0.02),
    '过晚区间：推力残效 20% → 温升也只有 20%（旧版在过晚区照样按满速烧温度）',
    (late.heat / H).toFixed(1) + ' /s（zone=' + late.zone + '）');
  // 2026-09-27 反馈「过晚阶段功率表不该掉到 20%，应该还是 100%」：
  // 残效是**推力**的折扣，不是发动机出了多少力 —— 输出功率照样满额（表盘与火焰读它）。
  check(late.zone === 'late' && near(late.pwrOut, 1, 0.02) && near(late.thrustEff, C.LATE_EFF, 0.01),
    '过晚区间：功率表照样满表 100%（残效 0.2 只作用于推力与温升）',
    'pwrOut=' + late.pwrOut.toFixed(2) + ' thrustEff=' + late.thrustEff.toFixed(2));
  check(early.zone === 'early' && near(early.heat / H, C.TEMP_RATE, C.TEMP_RATE * 0.03),
    '过早区间：推力与温升都是满额（真·白烧 —— 弹弓会在那里作废）',
    (early.heat / H).toFixed(1) + ' /s（zone=' + early.zone + '）');
  check(sweet.zone === 'sweet' && sweet.slinging === true,
    '绿色区间：弹弓比例项接管推力（功率档位只决定温升）',
    'zone=' + sweet.zone + ' slinging=' + sweet.slinging);

  // 脉冲乘波 ×1.6：推力与温升一起涨（功率表推过额定线 → 过热风险也一起过线）
  const hot = heatRate(endS, 100);
  const pulse = heatRate(endS, 100, C.PULSE_TIMES[1] + 0.1);
  check(pulse.pulseHot && near(pulse.heat / H, C.TEMP_RATE * C.PULSE_THRUST_BOOST, C.TEMP_RATE * 0.05),
    '脉冲乘波：推力 ×1.6 的同时温升也 ×1.6',
    (pulse.heat / H).toFixed(1) + ' /s vs 额定 ' + (hot.heat / H).toFixed(1) + ' /s');
})();

console.log('\n=== 提示文案（消息槽）===');
(function () {
  const appSrc = fs.readFileSync(path.join(ASSETS, 'app.js'), 'utf8');
  // 「速度还差多少」是误报：过早区间里速度必然低于门槛（弹弓还没开始拉），那是正常状态。
  check(appSrc.indexOf('速度还差') < 0,
    '不再提示「速度还差多少」（过早区间速度必然低于门槛，属误报）');
  // 巡航段的「X s 后窗口亮起」倒计时已删除：不把窗口提前送到嘴边，
  // 张力交给「行星越长越大 + 时机条滑入 + 绿色边缘光 + 进绿色区间的音效」交代。
  check(appSrc.indexOf('后窗口亮起') < 0,
    '不再提示「X s 后窗口亮起」（巡航段不给窗口预告）');

  // 巡航期：消息槽保持空
  const g = M3D.createGame(route), st = g.state;
  g.setBurning(false);
  g.step(1 / 60);
  check(st.warn === '' && st.warnKind === '',
    '巡航期消息槽保持空（没有倒计时、也没有速度缺口误报）', 'warn=[' + st.warn + ']');
  check(st.overheatLeft === 0 && st.warn.indexOf('过热') < 0, '未过热时不显示解锁倒计时', st.warn);

  // 过热：解锁倒计时 + 「来不及解锁」的判据是**绿色区间开始**，不是窗口开启
  function overheatedAt(s, v) {
    const gg = M3D.createGame(route), ss = gg.state;
    gg.debugSet(s, v); gg.setBurning(false); gg.step(1 / 60);
    ss.heat = C.TEMP_MAX; ss.overheated = true; gg.step(1 / 60);
    const d = fbs[ss.target].def;
    return { st: ss, toSweet: ss.tToGo - (1 - d.sweet0) * d.winTime };
  }
  // 木星→土星腿只有 3.65 s，比「归零解锁 3.85 s」还短 → 一旦在木星过热，土星注定报废
  const afterJupiter = overheatedAt(fbs[0].s + 20, 130);
  check(afterJupiter.st.overheatLeft > 0
    && Math.abs(afterJupiter.st.overheatLeft - afterJupiter.st.heat / C.COOL_RATE) < 1e-9,
    '过热时给出「归零解锁还差几秒」= 热量 / 冷却率', afterJupiter.st.overheatLeft.toFixed(2) + ' s');
  check(afterJupiter.st.overheatLeft > afterJupiter.toSweet && /无法解锁/.test(afterJupiter.st.warn),
    '冷却赶不上绿色区间 → 明说「本站窗口前无法解锁」',
    '距绿色区间 ' + afterJupiter.toSweet.toFixed(2) + ' s < 解锁 ' + afterJupiter.st.overheatLeft.toFixed(2) + ' s');
  // 天王星→海王星腿 7.6 s > 解锁 3.85 s → 只报倒计时
  const afterUranus = overheatedAt(fbs[2].s + 20, 160);
  check(afterUranus.st.overheatLeft < afterUranus.toSweet && /强制冷却 [0-9.]+ s$/.test(afterUranus.st.warn),
    '冷却赶得上时报「强制冷却 X s」（点也白点，所以文案直说冷却被强制）',
    '距绿色区间 ' + afterUranus.toSweet.toFixed(2) + ' s > 解锁 ' + afterUranus.st.overheatLeft.toFixed(2) + ' s');

  // 全流程逐帧核对：窗口内不再刷提示、过晚文案正确、巡航段一条都不报（旧版在这里数「还有几秒亮窗口」）
  const g2 = M3D.createGame(route), st2 = g2.state;
  let inWindow = 0, lateOk = 0, lateBad = 0, cruiseBad = 0, pulseFrames = 0;
  while (st2.status === 'flying' && st2.t < 400) {
    g2.setBurning(st2.zone === 'sweet');
    g2.step(1 / 60);
    if (st2.overheated) continue;
    if (st2.warnKind === 'pulse') { pulseFrames++; continue; }
    if (st2.zone === 'early' || st2.zone === 'sweet') { if (st2.warn) inWindow++; }
    else if (st2.zone === 'late') { if (st2.warn === '窗口关闭 · 已错过') lateOk++; else lateBad++; }
    else if (st2.warn) cruiseBad++;        // appr / done（巡航段）不该有任何提示
  }
  check(inWindow === 0, '窗口内（过早/最佳）不再刷任何提示（时机条与边缘光已负责）', inWindow + ' 帧有提示');
  check(lateBad === 0 && lateOk > 0, '过晚区间提示「窗口关闭 · 已错过」', lateOk + ' 帧 / 异常 ' + lateBad);
  check(cruiseBad === 0, '巡航段消息槽保持空', cruiseBad + ' 帧有提示');
  check(pulseFrames > 0, '耀斑脉冲提示仍在（预警 / 生效两条都走这条路）', pulseFrames + ' 帧');

  // 全部掠过之后没有下一个窗口，消息槽同样保持空
  const g3 = M3D.createGame(route), st3 = g3.state;
  g3.debugSet(route.len - 100, 150); g3.step(1 / 60);
  check(st3.target < 0 && st3.warn === '', '越过冥王星后消息槽保持空',
    'target=' + st3.target + ' warn=[' + st3.warn + ']');
})();

console.log('\n=== 耀斑脉冲（两次 + 预警 / 提示）===');
(function () {
  check(C.PULSE_TIMES.length === 2, '脉冲改为两次', C.PULSE_TIMES.join(' / ') + ' s');
  check(C.PULSE_WARN >= 1.5, '预警提前量够看到并决定（旧值 0.5 s 只够眨一下眼）', C.PULSE_WARN + ' s');
  // 单局最长实测 38.5 s（绿色吃 75% 压线逃出）→ 原来的第 3 次 @40 s 永远走不到
  check(C.PULSE_TIMES.every((t) => t + C.PULSE_DUR <= 38.5),
    '每次脉冲都落在单局时长内（被删掉的第 3 次 @40 s 走不到）',
    C.PULSE_TIMES.map((t) => t + '~' + (t + C.PULSE_DUR)).join(' / ') + ' s ≤ 38.5 s');
  check(M3D.pulseIn(0) === C.PULSE_TIMES[0] && near(M3D.pulseIn(11.25), 0.75, 1e-9),
    'pulseIn(t) = 距下一次脉冲开始的秒数',
    'pulseIn(0)=' + M3D.pulseIn(0) + ' · pulseIn(11.25)=' + M3D.pulseIn(11.25));
  check(M3D.pulseIn(C.PULSE_TIMES[1] + C.PULSE_DUR) === Infinity, '最后一次脉冲之后 pulseIn = Infinity');

  // 提示必须按区间分叉：过早区按下去会作废弹弓（lostSling），
  // 这时还挂一条「×1.6」等于把玩家钓去毁掉整次掠过 —— 那是提示在害人。
  const hotT = C.PULSE_TIMES[0] + 0.2;
  check(M3D.pulseActive(hotT) && /全功率推进/.test(M3D.pulseTip(hotT, 'appr')),
    '脉冲生效 + 巡航区 → 「全功率推进」（这里按住是白拿 ×1.6）', M3D.pulseTip(hotT, 'appr'));
  check(/窗口外禁止点火/.test(M3D.pulseTip(hotT, 'early')),
    '脉冲生效 + 过早区 → 警告「窗口外禁止点火」', M3D.pulseTip(hotT, 'early'));
  check(M3D.pulseTip(hotT, 'sweet') === '' && M3D.pulseTip(hotT, 'late') === '',
    '脉冲生效 + 绿色/过晚 → 不抢屏（弹弓接管 / 已来不及）');
  const warnT = C.PULSE_TIMES[1] - C.PULSE_WARN + 0.01;
  check(/后 · 推力 ×/.test(M3D.pulseTip(warnT, 'appr')), '预警期报倒计时 + 增益', M3D.pulseTip(warnT, 'appr'));
  check(!/按住/.test(M3D.pulseTip(warnT, 'appr')),
    '预警期不说「按住」（预警 2 s + 生效 1 s 连续按会烧穿 → 实测天王星被捕获）',
    M3D.pulseTip(warnT, 'appr'));
  check(['early', 'sweet', 'late'].every((z) => M3D.pulseTip(warnT, z) === ''),
    '预警期不抢窗口的屏幕（过早/最佳/过晚一律不刷；「过早别按」在生效期还会再出现）',
    ['early', 'sweet', 'late'].map((z) => z + '=[' + M3D.pulseTip(warnT, z) + ']').join(' '));

  // 全流程：两次脉冲都在单局内触发；提示只在安全区给「按住」
  const g = M3D.createGame(route), st = g.state;
  const fired = [];
  let hotFrames = 0, warnFrames = 0, badKind = 0, unsafe = 0;
  while (st.status === 'flying' && st.t < 400) {
    g.setBurning(st.zone === 'sweet');
    const t0 = st.t;
    g.step(1 / 60);
    for (const pt of C.PULSE_TIMES) if (t0 < pt && st.t >= pt) fired.push(pt);
    if (st.pulseHot) {
      hotFrames++;
      if (st.warnKind !== 'pulse' && !st.overheated) badKind++;
      if (/全功率推进/.test(st.warn) && st.zone !== 'appr' && st.zone !== 'done') unsafe++;
    } else if (st.pulseIn > 0 && st.pulseIn <= C.PULSE_WARN) warnFrames++;
  }
  check(fired.length === 2 && fired[0] === C.PULSE_TIMES[0] && fired[1] === C.PULSE_TIMES[1],
    '满弹弓一局内两次脉冲都触发', 't=' + fired.join(' / ') + ' s');
  check(Math.abs(hotFrames - 2 * C.PULSE_DUR * 60) <= 2 && warnFrames > 0,
    '生效期 1 s 逐帧成立，且预警确实在巡航期出现过',
    '预警 ' + warnFrames + ' 帧 · 生效 ' + hotFrames + ' 帧');
  check(badKind === 0 && unsafe === 0,
    '脉冲提示都走 warnKind=pulse，且「全功率推进」只在安全区出现', '异常 ' + badKind + ' / ' + unsafe);
})();

console.log('\n=== 行星判定 ===');
(function () {
  // 用 debugSet 摆到判定点前一点点，给出三档速度
  const f = fbs[1]; // 木星
  function attempt(v) {
    const g = M3D.createGame(route), st = g.state;
    g.debugSet(f.s - 6, v);
    for (let i = 0; i < 200 && st.status === 'flying'; i++) { g.setBurning(false); g.step(0.005); }
    return st;
  }
  const safe = attempt(f.def.vNeed * 1.2);
  const caught = attempt((f.def.vNeed + f.def.vNeed * C.CRASH_RATIO) / 2);
  const crashed = attempt(f.def.vNeed * C.CRASH_RATIO * 0.8);
  check(safe.status === 'flying' && safe.target > 1, '速度高于门槛 → 安全掠过', 'v=' + safe.v.toFixed(0) + ' 门槛=' + f.def.vNeed);
  check(caught.status === 'caught' && caught.culprit === f.def.name,
    '速度介于门槛与撞毁线之间 → 被' + f.def.name + '引力捕获', 'status=' + caught.status + '·' + caught.culprit);
  check(crashed.status === 'crashed' && crashed.culprit === f.def.name,
    '速度远低于门槛 → 被拽入' + f.def.name + '大气层', 'status=' + crashed.status + '·' + crashed.culprit);
})();

console.log('\n=== 氦闪膨胀壳 ===');
(function () {
  check(M3D.shellRadius(0) === C.SHELL_START, 't=0 时壳半径 = SHELL_START（起手就已在身后）', M3D.shellRadius(0) + '');
  let growing = true, accel = true;
  for (let t = 0; t < 60; t += 0.5) {
    if (!(M3D.shellRadius(t + 0.5) > M3D.shellRadius(t))) growing = false;
    const r1 = M3D.shellRadius(t + 0.5) - M3D.shellRadius(t);
    const r2 = M3D.shellRadius(t + 1.0) - M3D.shellRadius(t + 0.5);
    if (!(r2 > r1)) accel = false;
  }
  check(growing, '壳半径单调膨胀');
  check(accel, '壳膨胀速度持续加快（线性 + 二次，越追越猛）');
  // 壳的解析式与游戏内 st.shellR 一致（壳不再逐帧积分）
  const g = M3D.createGame(route), st = g.state;
  for (let i = 0; i < 200; i++) g.step(0.05);
  check(near(st.shellR, M3D.shellRadius(st.t), 1e-6), '游戏内壳半径 = shellRadius(t)（解析式，帧率无关）',
    st.shellR.toFixed(3) + ' vs ' + M3D.shellRadius(st.t).toFixed(3));

  // 把地球摆到壳内 → 判吞没。需要同时满足「在壳内」且「在撞日半径外」，故扫出可用的航线落点。
  // 注意时间上限：不点火的话地球会在 ~5.3 s 飞到木星判定点被判负，之后就再也 step 不动了
  //（`g.step` 在非 flying 时直接返回，`st.t` 不再前进 —— 写成 while (st2.t < 8) 会死循环）。
  const g2 = M3D.createGame(route), st2 = g2.state;
  while (st2.t < 2 && st2.status === 'flying') g2.step(0.05);
  check(st2.status === 'flying', '前置：2 s 时本局仍在进行', 'status=' + st2.status);
  const shell = st2.shellR;
  const probe = [0, 0, 0];
  let landS = -1;
  for (let s = 1; s < route.len; s += 2) {
    M3D.routeSample(route, s, probe, null);
    const r = len3(probe);
    if (r > W.SUN_R + W.EARTH_R + 5 && r < shell - 5) { landS = s; break; }
  }
  check(landS > 0, '前置：存在既在壳内、又在撞日半径外的航线落点', 's=' + landS + ' · 当时壳半径 ' + shell.toFixed(0));
  g2.debugSet(landS, 20);
  check(st2.rSun < st2.shellR, '前置：摆位落点在壳半径之内', 'rSun=' + st2.rSun.toFixed(0) + ' < shellR=' + st2.shellR.toFixed(0));
  g2.step(0.05);
  check(st2.status === 'burned', '进入壳内即判氦闪吞没', 'status=' + st2.status + '·' + st2.reason);
})();

console.log('\n=== 相机 ===');
(function () {
  check(typeof M3D.followDist === 'function', 'app.js 导出 followDist');
  const base = C.CAM_BACK, up = C.CAM_UP, panicMax = C.CAM_PANIC_MAX;
  check(near(M3D.followDist(100, 10), base, 1e-9), '开局跟拍距离 = 基础值', M3D.followDist(100, 10).toFixed(1));
  check(near(M3D.followDist(4300, 2500), M3D.followDist(4300, 10), 1e-9),
    '跟拍距离不随壳半径无界增长（历史 bug：地球被推成一个小点）',
    'shellR 10→2500 均为 ' + M3D.followDist(4300, 10).toFixed(1));
  check(near(M3D.followDist(220, 150), base, 1e-9), '壳间隙 70（> ' + C.CAM_GAP_EASE + '）不拉远', M3D.followDist(220, 150).toFixed(1));
  check(near(M3D.followDist(200, 200), base * panicMax, 1e-9), '壳贴脸（间隙 0）拉远到上限 ' + panicMax + '×', M3D.followDist(200, 200).toFixed(1));
  let overSun = 0;
  const samples = [[100, 10], [400, 200], [1200, 900], [4300, 2500], [200, 200]];
  for (const [r, s] of samples) if (M3D.followDist(r, s) > Math.max(18, r - W.SUN_R)) overSun++;
  check(overSun === 0, '跟拍距离不越过太阳表面', samples.length + ' 个采样点全部满足');
  // 地球占屏高 = 角直径 / 垂直视场角
  // ⚠ 真实比例（半径全部 = 真实半径 × BODY_SCALE）后，地球半径从手调的 3.4 单位
  // 掉到 1.28 单位 —— 它本来就只有木星的 1/11。于是这条会红：12.9% → 4.9%（壳贴脸时 3.3%）。
  // 这是「比例正确」的直接代价，不是 bug。要让这条重新变绿只有两条路：
  //   · 把 CAM_BACK 从 46 拉近到 ~28（地球回到 5.1%，代价是行星同比放大 ~1.5×，木星会占 ~85% 屏高）；
  //   · 或承认地球在真实比例下就是颗小球，把阈值降到实测值并写清理由。
  let minPct = Infinity;
  for (const [r, s] of samples) {
    const d = Math.hypot(M3D.followDist(r, s), up);
    minPct = Math.min(minPct, (2 * Math.atan(W.EARTH_R / d) * 180 / Math.PI) / C.CAM_FOV * 100);
  }
  check(minPct >= 5, '全程地球占屏高 ≥ 5%（不缩成小点）', '最小 ' + minPct.toFixed(1) + '%');
  check(C.CAM_PAN_MAX > 0 && C.CAM_PAN_MAX < 1, '掠过行星时注视方向偏向行星（0 < CAM_PAN_MAX < 1，地球与行星同框）',
    String(C.CAM_PAN_MAX));

  // ---- 注视偏移：必须是单侧窗口 ----
  // 历史 bug：用 |s_i − s| 的对称窗口，判定点之后好几秒视线还被拴在身后的行星上，
  // 随后又被拉回航线 —— 观感就是「刚穿过行星，镜头猛地一沉」。
  const aim = [0, 0];
  const f0 = fbs[0], only0 = [f0];          // 只看这一颗，避免被下一颗的「接近段」干扰读数
  const at = (s) => { M3D.panAim(only0, s, 150, aim); return aim.slice(); };
  const fwd = (s) => { M3D.panAim(fbs, s, 150, aim); return aim.slice(); };
  const lastS = fbs[fbs.length - 1].s;
  check(at(f0.s).length === 2 && at(f0.s)[1] > at(f0.s - 300)[1], '掠过点附近的偏移权重最大',
    '掠过点 ' + at(f0.s)[1].toFixed(3) + ' vs 提前 2 s ' + at(f0.s - 300)[1].toFixed(3));
  check(at(f0.s + 40)[1] < at(f0.s)[1] * 0.5, '判定点后 0.27 s 偏移已衰减过半（hold 很短）',
    at(f0.s + 40)[1].toFixed(3));
  check(at(f0.s + 100)[1] === 0, '掠过 0.67 s 后偏移完全归零（视线必须回到航线）',
    at(f0.s + 100)[1].toFixed(3));
  check(at(f0.s - 300)[1] > 0 && at(f0.s - 300)[1] < C.CAM_PAN_MAX,
    '接近段（提前 2 s）已有部分偏移，行星提前进画面', at(f0.s - 300)[1].toFixed(3));
  check(fwd(lastS + 1e6)[1] === 0 && fwd(lastS + 1e6)[0] === -1, '全部掠过之后不再偏移',
    'w=' + fwd(lastS + 1e6)[1].toFixed(3));

  // ---- 跟拍姿态：注视方向必须始终朝前、距离恒定、不翻折 ----
  const cam = { s: 0, v: 150, pos: [0, 0, 0], tan: [0, 0, 1], rSun: 0, shellR: 0, zoom: 1 };
  const P = [0, 0, 0], L = [0, 0, 0], P2 = [0, 0, 0], L2 = [0, 0, 0];
  let worstFwd = 1, worstPanDist = 0, worstDrift = 0, worstLook = Infinity, bestLook = 0;
  let worstTilt = 0, worstEarthOff = 0, worstPlanetEdge = 0, edgeName = '';
  const aimAt = [0, 0];
  let prevDir = null;
  for (let s = 0; s <= route.len; s += 4) {
    M3D.routeSample(route, s, cam.pos, cam.tan);
    cam.s = s; cam.rSun = len3(cam.pos); cam.shellR = M3D.shellRadius(0);
    M3D.chasePose(route, fbs, cam, P, L);
    M3D.chasePose(route, [], cam, P2, L2);          // 同一位置、去掉所有行星偏移
    const dx = L[0] - P[0], dy = L[1] - P[1], dz = L[2] - P[2];
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ux = dx / dl, uy = dy / dl, uz = dz / dl;
    // 视线相对「航线前方」的夹角：必须始终指向前方，绝不能跑到侧面/背后
    worstFwd = Math.min(worstFwd, ux * cam.tan[0] + uy * cam.tan[1] + uz * cam.tan[2]);
    // 关键回归：偏不偏行星，注视距离必须一模一样。
    // 旧实现把注视「点」插值到行星位置，行星落到相机后方时注视点会跑掉 → 距离剧烈变化 → 镜头翻折。
    worstPanDist = Math.max(worstPanDist,
      Math.abs(Math.hypot(L[0] - P[0], L[1] - P[1], L[2] - P[2]) - Math.hypot(L2[0] - P2[0], L2[1] - P2[1], L2[2] - P2[2])));
    worstLook = Math.min(worstLook, dl); bestLook = Math.max(bestLook, dl);
    // 注视方向的逐样本角变化（每 4 单位 ≈ 0.027 s）—— 限制镜头的甩动速率
    if (prevDir) {
      const d = Math.min(1, Math.max(-1, ux * prevDir[0] + uy * prevDir[1] + uz * prevDir[2]));
      worstDrift = Math.max(worstDrift, Math.acos(d) * 180 / Math.PI);
    }
    // 抬升上限：注视方向被行星拉走的夹角（相对「去掉全部行星偏移」的基准方向）
    const bl = Math.hypot(L2[0] - P2[0], L2[1] - P2[1], L2[2] - P2[2]) || 1;
    worstTilt = Math.max(worstTilt, Math.acos(Math.min(1, Math.max(-1,
      ux * (L2[0] - P2[0]) / bl + uy * (L2[1] - P2[1]) / bl + uz * (L2[2] - P2[2]) / bl))) * 180 / Math.PI);
    // 地球是否还在画面里：注视方向 vs「相机 → 地球」
    const el = Math.hypot(cam.pos[0] - P[0], cam.pos[1] - P[1], cam.pos[2] - P[2]) || 1;
    worstEarthOff = Math.max(worstEarthOff, Math.acos(Math.min(1, Math.max(-1,
      ux * (cam.pos[0] - P[0]) / el + uy * (cam.pos[1] - P[1]) / el + uz * (cam.pos[2] - P[2]) / el))) * 180 / Math.PI);
    // 接近段：行星的近缘（中心角减去它的角半径）必须探进画面
    M3D.panAim(fbs, s, cam.v, aimAt);
    const pf = aimAt[0] >= 0 ? fbs[aimAt[0]] : null;
    if (pf && aimAt[1] > 0.02 && pf.s > s) {
      const pdx = pf.pos[0] - P[0], pdy = pf.pos[1] - P[1], pdz = pf.pos[2] - P[2];
      const pdl = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz) || 1;
      const edge = Math.acos(Math.min(1, Math.max(-1, ux * pdx / pdl + uy * pdy / pdl + uz * pdz / pdl))) * 180 / Math.PI
        - Math.atan(pf.def.rad / pdl) * 180 / Math.PI;
      if (edge > worstPlanetEdge) { worstPlanetEdge = edge; edgeName = pf.def.name; }
    }
    prevDir = [ux, uy, uz];
  }
  check(worstFwd > 0.8, '注视方向全程朝前（与航线前方夹角 < 37°，不会翻折到身后）',
    '最小 cos = ' + worstFwd.toFixed(3) + '（约 ' + (Math.acos(worstFwd) * 180 / Math.PI).toFixed(0) + '°）');
  check(worstPanDist < 1e-9, '注视距离不因行星偏移而改变（方向空间插值；点空间插值会随行星位置剧烈变化）',
    '最大偏差 ' + worstPanDist.toExponential(1));
  check(bestLook > 20 && worstLook > 0.7 * bestLook, '注视距离全程稳定（含航线终点外的外推段）',
    bestLook.toFixed(1) + ' → ' + worstLook.toFixed(1));
  check(worstDrift < 6, '注视方向无突变（每 0.027 s 转角 < 6°）',
    '最大 ' + worstDrift.toFixed(2) + '°/样本');

  // ---- 构图不变式：掠过时「地球在下半、行星在上半」，两者都在画面里 ----
  // 半径等比放大后行星挂在航线几十单位之上，全额偏移会把视线抬高几十度、把地球顶出画面
  // （实测 42° > 30° 半视场）→ 现在由 CAM_PAN_TILT_MAX 夹住。
  const HALF_FOV = C.CAM_FOV / 2;
  check(worstEarthOff < HALF_FOV - 4, '掠过偏移再大，地球也留在画面内（离画面中心 < 半视场 − 4°）',
    '最大 ' + worstEarthOff.toFixed(1) + '° · 垂直半视场 ' + HALF_FOV + '°');
  check(worstTilt <= C.CAM_PAN_TILT_MAX + 1e-6, '注视方向被行星拉走的夹角 ≤ CAM_PAN_TILT_MAX（抬升上限生效）',
    '最大 ' + worstTilt.toFixed(2) + '° · 上限 ' + C.CAM_PAN_TILT_MAX + '°');
  check(worstPlanetEdge < HALF_FOV, '接近段行星的近缘一定探进画面（离画面中心 < 半视场）',
    '最大 ' + worstPlanetEdge.toFixed(1) + '°（' + edgeName + '）');
})();

console.log('\n=== 地球模型（行星发动机）===');
(function () {
  const slots = M3D.engineLayout();
  const shell = W.EARTH_R * C.ENGINE_SHELL;
  let back = 0, radiusOk = 0, aligned = 0, sx = 0, sy = 0, sz = 0;
  for (const s of slots) {
    const p = s.pos, d = s.dir;
    if (p[2] < 0) back++;
    if (near(len3(p), shell, 1e-6)) radiusOk++;
    if (near(d[0] * C.ENGINE_AXIS[0] + d[1] * C.ENGINE_AXIS[1] + d[2] * C.ENGINE_AXIS[2], 1, 1e-9)) aligned++;
    sx += d[0]; sy += d[1]; sz += d[2];
  }
  check(slots.length === C.ENGINE_COUNT, '发动机数量 = ENGINE_COUNT', slots.length + ' 台');
  // 渲染层（朝向 / 等离子柱）在沙箱里跑不到（没有 THREE），只能按源码静态断言
  const appSrc = fs.readFileSync(path.join(ASSETS, 'app.js'), 'utf8');
  // 2026-09-27：**南极洲朝前**。球体那一组绕 X 转 -90° → 南极（-Y）落到 +Z（= 航向），
  // 于是画面里一直是南极洲领着地球飞、发动机在北半球那一侧朝后喷。
  // 极性由 `EARTH_POLE_SIGN` 一个符号控制（实机观察定正负，翻这一行即可换向）
  check(/earthBody = new THREE\.Group\(\)/.test(appSrc)
    && /var EARTH_POLE_SIGN = -1/.test(appSrc)
    && /earthBody\.rotation\.x = EARTH_POLE_SIGN \* Math\.PI \/ 2/.test(appSrc)
    && /earthBody\.add\(new THREE\.Mesh\(new THREE\.SphereGeometry\(EARTH_R/.test(appSrc),
    '南极洲朝前：EARTH_POLE_SIGN = -1（绕 X 转 -90°：南极 → 航向 +Z，北极朝镜头）');
  // 每台发动机自带一道等离子柱（旧版只有中间那一束，远看像「地球后面挂了根棒」）
  check(/var plumeGeo/.test(appSrc) && /plumes\.push\(plume\)/.test(appSrc)
    && /pl\.scale\.set\(rw, k, rw\)/.test(appSrc)
    && /pl\.position\.z = pl\.userData\.z0 - PLUME_LEN \* k \/ 2/.test(appSrc),
    '每台发动机自带等离子柱：长度随推力伸缩 + 高频抖动（另有一点径向呼吸），底座锚在发动机上');
  // 2026-09-27 优化尾焰：柱体吃一张「喷口白热 → 尾端散尽」的渐变（A 1→0、RGB 白→蓝），
  // 加色混合下才是**等离子**而不是一块半透明实心锥；总尾焰另叠两枚大而淡的球后光晕。
  // ⓘ 焰柱改成「细尖朝后」之后，它与主焰的亮端都在 uv.y=0（锥底那头）→ **一张纹理够两处用**
  // （旧版主焰与焰柱朝向相反，才需要正、翻两张）。
  check(/function makePlumeTex\(\)/.test(appSrc) && /var plumeTex = makePlumeTex\(\);/.test(appSrc)
    && /x\.createLinearGradient\(0, h, 0, 0\)/.test(appSrc)
    && /map: plumeTex, transparent: true, opacity: \.3/.test(appSrc)     // 主焰
    && /map: plumeTex, transparent: true, opacity: \.55/.test(appSrc)    // 等离子柱
    && /map: plumeTex, transparent: true, opacity: \.34/.test(appSrc)    // 白热内芯
    && appSrc.indexOf('plumeTexRev') < 0,
    '尾焰渐变纹理（喷口白热 → 尾端散尽）一张给主焰/内芯/等离子柱三处（亮端统一在 uv.y=0）');
  check(/exhaustHaloMat = new THREE\.SpriteMaterial/.test(appSrc)
    && /exhaustHaloMat\.opacity = lit \? 0\.055 \+ 0\.11 \* Math\.min\(1, st\.pwrOut\) : 0\.012/.test(appSrc)
    && /\[EARTH_R \* 3\.2, EARTH_R \* 2\.2\], \[EARTH_R \* 5\.2, EARTH_R \* 4\.2\]/.test(appSrc)
    && /hs\.position\.set\(0, 0, cfg\[hi\]\[1\]\)/.test(appSrc),
    '总尾焰光晕：两枚球后（局部 +Z）加色 sprite（被地球挡掉中间、只溢出球缘一圈），亮度随输出功率');
  // 口面光点按离轴距离分档：外圈满尺寸连成边缘亮环，正对镜头的那几台缩小（否则叠成一坨白光）
  check(/var glowR = ENGINE_GLOW_R \* \(0\.62 \+ 0\.38 \* radFrac\)/.test(appSrc)
    && /eg\.scale\.set\(glowR, glowR, 1\)/.test(appSrc),
    '口面光点尺寸随离轴距离分档（外圈满尺寸、中心那几台收小）');
  // 2026-09-27 还原原著 / 按参考图：**蓝白等离子**（外焰冷蓝 + 白热内芯），
  // 每台口面再嵌一枚加色光点 —— 48 枚沿环排开就是参考图里地球边缘那圈亮环。
  // 注意火是**世界里的东西**，不是界面配色：界面那支绿（信息 / 判定）因此更干净。
  // 颜色必须是**线性空间的深蓝**：输出走 sRGBEncoding + ACES，浅蓝会被提亮成灰青，
  // 48 层加色一叠就糊成白（实测采样最亮处 RGB≈215,250,255）。R 压到接近 0 才留得住蓝。
  // ⓘ 2026-09-27 优化尾焰：主焰从 0.40R/1.9R **缩到 0.22R/1.1R**（内芯 0.17R/1.2R → 0.10R/0.8R）——
  // 它在球后极点、正对镜头，给大时会在**地球正面正中糊出一团白光**（实测把冰面糊掉）；
  // 环式阵列下真正好看的是边缘那圈焰柱，主焰只留一枚中心亮芯。
  check(/EXHAUST_OUT = 0x0d47ff/.test(appSrc) && /EXHAUST_CORE = 0xcfe6ff/.test(appSrc)
    && /NOZZLE_COLOR = 0x1b3138/.test(appSrc)
    && /var thrustFlame = new THREE\.Mesh\(new THREE\.ConeGeometry\(EARTH_R \* 0\.22/.test(appSrc)
    && /var thrustCore = new THREE\.Mesh\(new THREE\.ConeGeometry\(EARTH_R \* 0\.10/.test(appSrc),
    '主焰 = 外焰（冷蓝）+ 白热内芯两层（尺寸已收小到「中心亮芯」级别），喷口本体是深色');
  // ⓘ 2026-09-27 玩家反馈「尾焰尾部改为细线条，不要是个球」：焰柱改成**锥底接喷口、细尖朝后**
  // （与喷口本体同一个 engineQuat）。旧版把锥尖摆在喷口 → 宽端正好甩在尾端，而 48 台全都朝镜头
  // 这一侧，宽端等于正对镜头 → 每道焰柱都收成一个圆盘（「一地球的球」）。
  // ⓘ 2026-09-27 光环视觉优化：一块**纯色圆环**（0xd4c89c / opacity .55，内缘外缘两条硬边）
  // → 按真实环结构画的**径向色带纹理**：D / C / B 环 + 卡西尼缝 + A 环 + 恩克缝，
  // 段间线性插值 + 确定性细环纹噪声，内缘 / 外缘 alpha 收到 0（渐隐而不是硬切）。
  check(/function satRingTex\(\)/.test(appSrc) && /var ringTex = satRingTex\(\);/.test(appSrc)
    && /\[1\.955, 0\.09, 118, 108, 92\]/.test(appSrc)      // 卡西尼缝（几乎透明）
    && /\[2\.212, 0\.09, 118, 108, 92\]/.test(appSrc)      // 恩克缝
    && /t\.wrapS = t\.wrapT = THREE\.ClampToEdgeWrapping/.test(appSrc)
    && /t\.anisotropy = renderer\.capabilities\.getMaxAnisotropy\(\)/.test(appSrc),
    '光环纹理按真实环结构画径向色带（含卡西尼缝 / 恩克缝），夹边 + 各向异性过滤拉满');
  // UV 重映射：RingGeometry 默认 UV 是**平面投影**，而这条纹理只有一维（u = 内缘→外缘）
  check(/var rpos = rgeo\.attributes\.position, ruv = rgeo\.attributes\.uv;/.test(appSrc)
    && /ruv\.setXY\(ri, \(rr - RING_IN\) \/ \(RING_OUT - RING_IN\), 0\.5\)/.test(appSrc)
    && /map: ringTex, side: THREE\.DoubleSide, transparent: true, opacity: \.92/.test(appSrc)
    && /pg\.ring\.material\.opacity = 0\.72 \+ 0\.20 \* fade/.test(appSrc),
    '光环 UV 重映射成「归一化半径」并挂上纹理（材质透明度只做贴近收放）');
  check(/plume\.quaternion\.copy\(engineQuat\)/.test(appSrc)
    && appSrc.indexOf('plumeQuat') < 0
    && /var plumeGeo = new THREE\.ConeGeometry\(EARTH_R \* 0\.06, PLUME_LEN, 9\)/.test(appSrc),
    '等离子柱：锥底接喷口、细尖朝后（尾部是细线，不是圆盘），长细比 ~16:1');
  check(/engineGlowMat = new THREE\.SpriteMaterial/.test(appSrc)
    && /new THREE\.Sprite\(engineGlowMat\)/.test(appSrc)
    && /engineGlowMat\.opacity = lit \? 0\.55 : 0\.28/.test(appSrc),
    '每台口面一枚光点（共用 sprite 材质）：怠速一圈暗烬、点火一圈亮环');
  // 火焰与功率表读**同一个量** st.pwrOut（发动机输出功率）：表盘指到哪、火焰就烧到哪。
  // 两条反馈都落在这里 —— ① 弹弓不得放大外观；② 过晚区间照旧满功率白烧（不是 20%）。
  const flameBlock = (appSrc.match(/var lit = st\.pwrOut > 0\.001;[\s\S]*?thrustCore\.scale\.set\(1, fk, 1\);/) || [''])[0];
  check(flameBlock.length > 120 && flameBlock.indexOf('slinging') < 0
    && /thrustFlame\.scale\.set\(1, fk, 1\);/.test(flameBlock)
    && /var pk = 0\.45 \+ Math\.min\(1\.3, st\.pwrOut\) \* 0\.75;/.test(flameBlock)
    && /var fk = 0\.7 \+ Math\.min\(1, st\.pwrOut \/ 8\) \* 1\.6;/.test(flameBlock),
    '弹弓不放大发动机外观，且火焰只读 st.pwrOut（过晚区间照样满焰 = 白烧）',
    '火焰块 ' + flameBlock.length + ' 字符');
  // 2026-09-27：**改环式阵列**（还原原著 / 按参考图）。旧版黄金角螺旋均匀撒点 ——
  // 均匀是均匀，但读不出「阵列」，远看是一团乱刺。现在 = 中心 1 台 + 4 圈同心环。
  const ringCount = C.ENGINE_RING_COUNT || [];
  const ringPolar = C.ENGINE_RING_POLAR || [];
  const ringSum = ringCount.reduce((a, b) => a + b, 0);
  check(ringCount.length === ringPolar.length && ringCount.length === 5
    && ringSum === C.ENGINE_COUNT && ringCount[0] === 1,
    '发动机是环式阵列：中心 1 台 + 4 圈（' + ringCount.join(' / ') + ' = ' + ringSum + '）');
  // 最外那一圈必须贴着地平边缘：从跟拍镜头（地球正后方）看，sin(极角) ≈ 1 才是「那圈亮环」
  const outerPolar = ringPolar[ringPolar.length - 1] * Math.PI / 180;
  check(Math.sin(outerPolar) > 0.95 && Math.cos(outerPolar) > 0,
    '最外一圈贴地平边缘（sin 极角 = ' + Math.sin(outerPolar).toFixed(3) + ' > 0.95）且仍在 -Z 半球');
  // 外两圈必须占多数：参考图里那圈亮环靠的就是它们（盘心只留 6 台，干净）
  check(ringCount[3] + ringCount[4] >= C.ENGINE_COUNT * 0.6,
    '外两圈占多数（' + (ringCount[3] + ringCount[4]) + '/' + C.ENGINE_COUNT + '）：边缘那圈亮环才立得住');
  // 环内相邻两台不能挤在一起（焰柱最粗处半径 0.075 R，同圈间距要明显大于它）
  let minGap = Infinity;
  for (const r of [1, 2, 3, 4]) {
    const n = ringCount[r], th = ringPolar[r] * Math.PI / 180;
    minGap = Math.min(minGap, 2 * Math.PI * Math.sin(th) / n);
  }
  const minGapU = minGap * W.EARTH_R;
  const plumeR = W.EARTH_R * 0.06;    // 焰柱最粗处半径（2026-09-27 尾焰收细：0.075 → 0.085 → 0.06）
  check(minGapU > plumeR * 4, '同圈相邻发动机的间距明显大于焰柱最粗处（不糊成一片）',
    '最小圈距 ' + minGapU.toFixed(2) + ' 单位（焰柱半径 ' + plumeR.toFixed(2) + '）');
  check(back === slots.length, '全部装在 -Z 半球（地球背面，正对跟拍镜头）', back + '/' + slots.length);
  check(radiusOk === slots.length, '安装半径统一 = EARTH_R × ENGINE_SHELL',
    shell.toFixed(2) + '（大气 ' + (W.EARTH_R * 1.06).toFixed(2) + '，在地表外）');
  // 关键回归：朝向必须一律平行朝后。历史 bug 是取球面法线朝外 → 赤道附近与 -Z 夹角达 87°，净推力只剩 0.53
  check(aligned === slots.length, '喷流一律平行朝后（不随球面法线发散）', aligned + '/' + slots.length + ' 台与 -Z 夹角 0°');
  const net = Math.sqrt(sx * sx + sy * sy + sz * sz) / slots.length;
  check(near(net, 1, 1e-9), '净推力方向完全同向（无互相抵消）', '合成 ' + net.toFixed(3) + '（修复前 0.525）');
})();

console.log('\n=== 胜负与可达性 ===');
let T_IDEAL = 0;
(function () {
  const { st, marks } = play(SWEET, 1 / 60);
  T_IDEAL = st.t;
  check(st.status === 'escaped', '满弹弓可逃出太阳系', 'status=' + st.status + ' t=' + st.t.toFixed(1) + 's');
  check(marks.length === N_F, '掠过名单上的行星全部通过', marks.length + '/' + N_F);
  check(st.score.perfect === N_F, '满弹弓下每次都评为「完美弹弓」', st.score.perfect + '/' + N_F);
  let minMargin = Infinity;
  for (const m of marks) minMargin = Math.min(minMargin, m.v - fbs[m.i].def.vNeed);
  check(minMargin > 0, '每次判定都留有速度余量', '最小余量 ' + minMargin.toFixed(0));
})();

(function () {
  // 「只吃到绿色区间的 x%」：区间端点逐行星，所以必须从当前行星的 def 取
  const sweetFrac = (frac) => (g, st) => {
    const d = st.target >= 0 ? W.flybys[st.target] : null;
    g.setBurning(st.zone === 'sweet' && !!d && st.phase < d.sweet0 + (d.sweet1 - d.sweet0) * frac);
  };
  // 只烧最佳区间的前 3/4：手感更松但也能逃出（只是更慢）
  const { st } = play(sweetFrac(0.75), 1 / 60);
  check(st.status === 'escaped', '「不完美但抓得住时机」也能逃出（不是一次失误就崩盘）',
    'status=' + st.status + ' t=' + st.t.toFixed(1) + 's');
  check(st.t > T_IDEAL, '但明显更慢（速度经济有正反馈）', st.t.toFixed(1) + 's vs 满弹弓 ' + T_IDEAL.toFixed(1) + 's');

  const w = play(sweetFrac(0.35), 1 / 60);
  check(w.st.status !== 'escaped', '只擦到一点最佳区间 → 逃不出（技术门槛真实存在）',
    'status=' + w.st.status + ' t=' + w.st.t.toFixed(1) + 's');
})();

(function () {
  const never = play((g, st) => g.setBurning(false), 1 / 60);
  check(never.st.status !== 'escaped', '完全不点火逃不出', 'status=' + never.st.status + ' t=' + never.st.t.toFixed(1) + 's');
  let alwaysOver = false;
  const always = play((g, st) => { g.setBurning(true); if (st.overheated) alwaysOver = true; }, 1 / 60);
  check(always.st.status !== 'escaped' && alwaysOver,
    '一直按着逃不出（1.58 s 烧满 → 强制停机 3.85 s，整个木星窗口都在冷却，点击也推不动）',
    'status=' + always.st.status + ' t=' + always.st.t.toFixed(1) + 's');
  const mash = play((g, st) => g.setBurning(st.phase >= 0 && st.phase <= 1), 1 / 60);
  check(mash.st.status !== 'escaped',
    '窗口内全程死按也逃不出（过早区先把弹弓烧废，温度又按功率烧穿 → 最佳区间反而吃不满）',
    'status=' + mash.st.status + ' t=' + mash.st.t.toFixed(1) + 's');
})();

(function () {
  // 帧率无关：固定点火策略（恒点火），同样的总时长必须得到同样的状态
  function fixedRun(dt, frames) {
    const g = M3D.createGame(route), st = g.state;
    let last = st.target;
    while (st.status === 'flying' && st.t < 20) { g.setBurning(true); g.step(dt); if (st.target !== last) last = st.target; }
    return st;
  }
  const a = fixedRun(0.1), b = fixedRun(1 / 60);
  check(near(a.t, b.t, 1e-9) && near(a.s, b.s, 1e-6) && near(a.v, b.v, 1e-6),
    '固定子步积分与帧率无关（10fps 与 60fps 状态完全一致）',
    't ' + a.t.toFixed(3) + '/' + b.t.toFixed(3) + '  s ' + a.s.toFixed(3) + '/' + b.s.toFixed(3));
})();

(function () {
  const { st } = play(SWEET, 1 / 60);
  check(st.t < 120, '满弹弓通关时间在 2 分钟内（单局时长合理）', st.t.toFixed(1) + 's');
  check(st.status !== 'timeout' && C.ROUND_TIME === undefined, '不存在「时间耗尽」失败（唯一死线是氦闪壳与行星判定）');
})();

console.log('\n=== 汇总 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail + ' / 共 ' + (pass + fail));
process.exit(fail > 0 ? 1 : 0);
