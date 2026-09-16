/**
 * 把 dist/ 的「内容」压缩为 zhenghe-treasure-ship.zip。
 * index.html 位于 zip 根，无多余层级。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'zhenghe-treasure-ship.zip');

if (!fs.existsSync(DIST)) throw new Error('未找到 dist/，请先运行 node build.mjs');

// 用 Compress-Archive 打 zip；-Path dist/* 保证内容位于 zip 根
const ps = [
  "$ErrorActionPreference='Stop'",
  "if (Test-Path '" + OUT.replace(/'/g, "''") + "') { Remove-Item -Force '" + OUT.replace(/'/g, "''") + "' }",
  "Compress-Archive -Path '" + path.join(DIST, '*').replace(/'/g, "''") + "' -DestinationPath '" + OUT.replace(/'/g, "''") + "' -CompressionLevel Optimal",
].join('; ');

execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('打包完成：' + path.basename(OUT) + '（' + kb + ' KB）');
