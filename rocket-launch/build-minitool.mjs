/**
 * 按 minitool-zip-builder 规范，将单文件 rocket-launch.html
 * 改造为符合小工具容器约束的 dist/ 目录。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const SRC = path.join(ROOT, 'rocket-launch.html');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');

const log = [];
const fix = (m) => { log.push(m); console.log('  [fix] ' + m); };

let html = fs.readFileSync(SRC, 'utf8');

// ---------- 1. 提取内联脚本（兼容 2 段 / 3 段） ----------
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
const scripts = [...html.matchAll(re)].map((m) => m[2]);
if (scripts.length < 1) throw new Error('未找到任何 <script> 块');

// 约定：第 1 段为 three.js 库，最后一段为业务主逻辑，中间段为 layout 等辅助脚本。
// 兼容「3 段（含 layout.js）」与「2 段（three + main）」两种源文件结构。
const scriptNames = scripts.map((_, i) => {
  if (i === 0) return 'three.min.js';
  if (i === scripts.length - 1) return 'main.js';
  return scripts.length === 3 ? 'layout.js' : `layout${i}.js`;
});
let [threeJs, mainJs] = [scripts[0], scripts[scripts.length - 1]];

// ---------- 2. main.js: on* 属性赋值 → addEventListener ----------
const evtMap = { onclick: 'click', oninput: 'input', onchange: 'change' };
let evtCount = 0;
mainJs = mainJs
  .split('\n')
  .map((line) => {
    // 形如: X.onclick=reset;
    let m = line.match(/^(\s*)(.+?)\.(on[a-z]+)=([A-Za-z_$][\w$]*);\s*$/);
    if (m && evtMap[m[3]]) {
      evtCount++;
      return `${m[1]}${m[2]}.addEventListener('${evtMap[m[3]]}',${m[4]});`;
    }
    // 形如: X.onclick=function(){...};
    m = line.match(/^(\s*)(.+?)\.(on[a-z]+)=(function\s*\([^)]*\)\s*\{[\s\S]*\});\s*$/);
    if (m && evtMap[m[3]]) {
      evtCount++;
      return `${m[1]}${m[2]}.addEventListener('${evtMap[m[3]]}',${m[4]});`;
    }
    return line;
  })
  .join('\n');
fix(`main.js：${evtCount} 处 on* 属性赋值改为 addEventListener`);

// 兜底校验：确保没有残留
const leftover = mainJs.match(/\.\s*on(click|input|change)\s*=/g);
if (leftover) throw new Error('仍有 on* 赋值残留: ' + leftover.join(','));

// ---------- 3. 写出 assets ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(ASSETS, { recursive: true });
scripts.forEach((s, i) => fs.writeFileSync(path.join(ASSETS, scriptNames[i]), s.trim() + '\n', 'utf8'));
fix('脚本全部外置：' + scriptNames.map((n) => 'assets/' + n).join(' + '));

// ---------- 4. HTML: 移除内联脚本，替换为外链 ----------
const parts = html.split(re);
// split 带捕获组会保留 attrs/body，重建更稳妥：按位置切
let out = html;
const blocks = [...html.matchAll(re)].map((m) => ({ full: m[0], idx: m.index }));
// 从后往前替换，避免索引偏移
const replacements = scriptNames.map((n) => `<script src="./assets/${n}"></script>`);
for (let i = blocks.length - 1; i >= 0; i--) {
  out = out.slice(0, blocks[i].idx) + replacements[i] + out.slice(blocks[i].idx + blocks[i].full.length);
}
html = out;

// ---------- 5. viewport 补全 ----------
const VP = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />';
html = html.replace(/<meta name="viewport"[^>]*>/, VP);
fix('viewport 补全 maximum-scale / user-scalable=no / viewport-fit=cover');

// 显式声明空 favicon，避免 headless 浏览器自动请求 favicon.ico 产生 404
html = html.replace('</title>', '</title>\n<link rel="icon" href="data:," />');
fix('显式声明空 favicon（data: URI），抑制自动 favicon 404');

// ---------- 6. 跨端适配 CSS 注入 ----------
const PATCH = `
/* --- 小工具容器适配（minitool-zip-builder 规范） --- */
html{touch-action:manipulation;}
body{
  -webkit-touch-callout:none;
  -webkit-tap-highlight-color:transparent;
  -webkit-user-select:none;
  user-select:none;
}
/* 教学文本保持可选中，便于阅读 */
.narr,.explain,.kp,.formula,.hint-box,.sub,.read{
  -webkit-user-select:text;
  user-select:text;
}
/* 安全区（PC 模拟器注入变量 / 真机 env()）；顶部额外 +20px 避让系统操作按钮 */
header{padding-top:calc(44px + var(--safe-area-inset-top, env(safe-area-inset-top,0px)));}
.wrap{padding-bottom:calc(30px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom,0px)));}
/* 滚动容器 */
.side{-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;}
`;
html = html.replace('</style>', PATCH + '</style>');
fix('注入触摸适配（touch-callout / tap-highlight / user-select）');
fix('注入安全区适配 var(--safe-area-inset-*, env(...))');
fix('注入滚动容器 -webkit-overflow-scrolling / overscroll-behavior-y');

// ---------- 7. 写出 index.html ----------
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');
fix('入口重命名为 index.html 并置于包根目录');

console.log('\n改造完成，共 ' + log.length + ' 项。');
