#!/usr/bin/env node
/**
 * 提交包结构冒烟（零依赖，无需浏览器）
 *
 * 回答一个问题：**「把 <name>.zip 解压出来，容器能不能找到入口？」**
 *
 * 流程：
 *   ① 调 `tools/build.mjs --pack` 产出确定性 zip（子进程不可用时退回读现存 zip）
 *   ② 独立解析 zip 中央目录，核对结构约束（不信任打包器的自述）
 *
 * 只验「结构」，不验「画面」——渲染正确性需人工或 Playwright（见各项目 docs/）。
 * 面向小工具容器的最小硬约束：入口在 zip 根、路径用正斜杠、无系统垃圾、体积达标。
 *
 * 运行：node tests/smoke.mjs   （工作目录须为项目根）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // tests/ 上一层 = 项目根
const BUILD = path.resolve(ROOT, '..', '..', 'tools', 'build.mjs');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.config.json'), 'utf8'));
const NAME = cfg.name || path.basename(ROOT);
const ZIP = path.join(ROOT, cfg.zip || NAME + '.zip');
const ENTRY = cfg.zipEntry
  || (cfg.zipRoot && (cfg.entry || '').startsWith(cfg.zipRoot + '/')
    ? cfg.entry.slice(cfg.zipRoot.length + 1)
    : (cfg.entry || 'index.html'));

const pass = [], fail = [], note = [];
const ok = (m) => pass.push(m);
const bad = (m) => fail.push(m);

// ---- 1. 先跑统一入口打包（拿最新产物）；子进程不可用时退回现存产物 ----
{
  const r = spawnSync(process.execPath, [BUILD, '--pack'], { cwd: ROOT, encoding: 'utf8' });
  if (r.error) {
    note.push('无法启动统一入口（' + r.error.code + '），改为核对现存产物');
  } else if (r.status === 0) {
    ok('统一入口打包成功');
  } else {
    bad('统一入口打包失败：\n' + (r.stdout || '') + (r.stderr || ''));
  }
}

if (!fs.existsSync(ZIP)) {
  bad('产物不存在：' + path.relative(ROOT, ZIP) + '（先跑 node ../../tools/build.mjs --pack）');
} else {
  ok('产物存在：' + path.basename(ZIP) + '（' + (fs.statSync(ZIP).size / 1024).toFixed(1) + ' KB）');

  // ---- 2. 独立解析中央目录（不信任打包器）----
  const buf = fs.readFileSync(ZIP);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    bad('不是合法 zip（未找到 EOCD）');
  } else {
    const total = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const names = [];
    for (let i = 0; i < total; i++) {
      const nl = buf.readUInt16LE(off + 28);
      names.push(buf.slice(off + 46, off + 46 + nl).toString('utf8'));
      off += 46 + nl + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
    }
    names.includes(ENTRY) ? ok('入口 ' + ENTRY + ' 位于 zip 根目录')
                          : bad('入口 ' + ENTRY + ' 不在 zip 根目录');
    !names.some((n) => n.includes('\\')) ? ok('路径分隔符全部为正斜杠')
                                         : bad('存在反斜杠路径分隔符');
    !names.some((n) => n.startsWith('/') || n.includes('..')) ? ok('无绝对路径 / 目录穿越条目')
                                                              : bad('存在不安全路径');
    !names.some((n) => /__MACOSX|\.DS_Store|node_modules|\.git\//.test(n)) ? ok('无系统垃圾条目')
                                                                          : bad('含系统垃圾条目');
    new Set(names).size === names.length ? ok('无重复条目') : bad('存在重复条目');
    names.length > 0 ? ok('包内共 ' + names.length + ' 个条目') : bad('空包');
    buf.length <= (cfg.maxZipBytes || 10485760)
      ? ok('体积在门禁内') : bad('体积超出 ' + (cfg.maxZipBytes || 10485760) + ' 字节');
  }
}

console.log('\n提交包结构冒烟 · ' + NAME + '\n' + '-'.repeat(58));
pass.forEach((m) => console.log('  [OK]  ' + m));
fail.forEach((m) => console.log('  [X]   ' + m));
note.forEach((m) => console.log('  [--]  ' + m));
console.log(`\n合计: ${pass.length} 通过 / ${fail.length} 失败`);
process.exit(fail.length ? 1 : 0);
