/**
 * 本地开发服务器（零依赖，只用 node:http）。
 *
 *   node tools/dev-server.mjs          # → http://127.0.0.1:8899/
 *   node tools/dev-server.mjs 9000     # 换端口
 *
 * 为什么需要它：这个页面的 `<script src>` 是外置的，很多浏览器（含无头浏览器）会拦
 * `file://` 下的相对加载；而 `npx serve` / `http-server` 又会往仓库里塞 node_modules。
 * 它**不参与打包**（`build.mjs` 只搬 index.html 与 assets/），纯粹是迭代时
 * 「改一下样式 → 刷新一下页面」用的，带 `no-store` 保证不缓存。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8899);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('dev server → http://127.0.0.1:' + PORT + '/');
  console.log('root: ' + ROOT);
});
