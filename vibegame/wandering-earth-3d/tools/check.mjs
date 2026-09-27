#!/usr/bin/env node
/**
 * 一键校验：无头自检 → 构建 dist → 合规校验（可再挂 Playwright 冒烟）。
 *
 * 用法：node tools/check.mjs            跑自检 + 构建 + 合规
 *       node tools/check.mjs --smoke    再多跑一次浏览器冒烟（需本机有 playwright）
 *
 * 为什么有它：改一处要连着敲三条命令（tests / build / verify），
 * 迭代期容易漏跑、也容易把时间花在往返上。串起来之后「改 N 处 → 一条命令」。
 * 不参与打包（build.mjs 只拷贝白名单文件，tools/ 不在其中）。
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const smoke = process.argv.indexOf('--smoke') >= 0;

const steps = [
  ['无头自检', 'tests/headless_escape.js', []],
  ['构建 dist', 'build.mjs', []],
  ['合规校验', 'verify-minitool.mjs', ['dist']]
];
if (smoke) steps.push(['浏览器冒烟', 'tools/smoke.mjs', []]);

let failed = 0;
for (const [name, file, args] of steps) {
  console.log('\n──── ' + name + ' ────');
  const r = spawnSync(process.execPath, [path.join(root, file), ...args], {
    cwd: root, stdio: 'inherit'
  });
  if (r.status !== 0) { failed++; console.log('✗ ' + name + ' 失败（退出码 ' + r.status + '）'); break; }
}
console.log('\n=== ' + (failed ? '有步骤失败' : '全部通过') + ' ===');
process.exit(failed ? 1 : 0);
