/**
 * 把 assets/titanic-params.js（唯一真源）导出为 blender/out/params.json。
 *
 * 用 `vm` 执行而不是正则解析数值：v1 的郑和宝船项目用正则抠数字，
 * 在数组换行、指数写法、注释里带数字时连挂三次，故这里改为直接求值。
 *
 * 用法（项目根目录）：node blender/export_params.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const SRC = join(ROOT, 'assets', 'titanic-params.js');
const OUTDIR = join(HERE, 'out');
const OUT = join(OUTDIR, 'params.json');

const KEYS = [
  'SHIP', 'CURVES', 'HOUSE', 'WINDOWS', 'PORTHOLES', 'SHELL_DOORS',
  'PLATING',
  'FUNNELS', 'FUNNEL', 'MASTS', 'MAST', 'RIGGING', 'LIFTS',
  'BOW', 'STERN', 'STAND', 'COLORS',
];

const src = readFileSync(SRC, 'utf8');

// 去掉 ESM 的 `export ` 前缀后整体求值，不碰任何数值字面量。
// 注意：`const` 是脚本作用域的词法绑定，不会挂到 context 上，
// 所以末行再补一个对象字面量把全部导出项取出来（runInContext 返回末表达式）。
const ctx = vm.createContext({});
const expr = '({' + KEYS.map((k) => `${k}: ${k}`).join(', ') + '})';
const data = vm.runInContext(
  src.replace(/^\s*export\s+/gm, '') + '\n' + expr, ctx, { filename: SRC });

for (const k of KEYS) {
  if (data[k] === undefined) throw new Error(`参数表缺少导出项：${k}`);
}

mkdirSync(OUTDIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');

console.log(`PARAMS_OK ${OUT}`);
console.log(`  loa=${data.SHIP.loa} beam=${data.SHIP.beam} ` +
  `funnels=${data.FUNNELS.length} masts=${data.MASTS.length} ` +
  `house=${data.HOUSE.length} windowRows=${data.WINDOWS.length}`);
