/**
 * 按 minitool-zip-builder 规范准备 dist/ 目录。
 *
 * rocket-launch-3d 的 index.html 已使用外置脚本（经典 <script src>，无 module）、
 * 相对路径引用、合规 viewport，且业务 CSS 已含安全区/触摸适配，故本步骤只做「搬运」：
 * 把 index.html 与 assets/ 平铺进 dist/，不改变任何业务逻辑。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');
const SRC_HTML = path.join(ROOT, 'index.html');
const SRC_ASSETS = path.join(ROOT, 'assets');

if (!fs.existsSync(SRC_HTML)) throw new Error('未找到 index.html');
if (!fs.existsSync(SRC_ASSETS)) throw new Error('未找到 assets/');

const log = [];
const fix = (m) => { log.push(m); console.log('  [ok] ' + m); };

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

// 入口
fs.copyFileSync(SRC_HTML, path.join(DIST, 'index.html'));
fix('index.html 置于 dist/ 根目录');

// 资源：仅复制允许类型，跳过开发垃圾
const ALLOW = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json']);
let n = 0;
for (const e of fs.readdirSync(SRC_ASSETS)) {
  const ext = path.extname(e).toLowerCase();
  if (!ALLOW.has(ext)) { console.log('  [skip] ' + e + ' (类型不允许)'); continue; }
  fs.copyFileSync(path.join(SRC_ASSETS, e), path.join(DIST, 'assets', e));
  n++;
}
fix('复制 ' + n + ' 个资源到 dist/assets/（仅允许类型）');

console.log('\n构建完成，共 ' + log.length + ' 项。');
