#!/usr/bin/env node
/**
 * 把 assets/ship-params.js（唯一真源）导出为 blender/out/params.json。
 *
 * 为什么要这一步：v1 让 Blender 用正则去猜 JS 源码，结果
 * 「对象属性 draft: 1.52」「变量声明 var LENGTH = 60」
 * 「计算式 beam = LENGTH / ratio」三种形态各踩一次坑。
 * 现在由 Node 序列化，Blender 只读 JSON —— 单一真源、零猜测。
 *
 * 用法：node blender/export_params.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'ship-params.js');
const OUTDIR = path.join(ROOT, 'blender', 'out');
const OUT = path.join(OUTDIR, 'params.json');

if (!fs.existsSync(SRC)) {
  console.error('未找到 ' + SRC);
  process.exit(1);
}

const ZH = require(SRC);

// 只导出 Blender 侧需要的量；函数（interp / selfCheck 等）不导出——
// 采样表 TABLES 已经把它们的结果固化成数值了。
const payload = {
  _source: 'assets/ship-params.js',
  _note: '本文件由 node blender/export_params.js 生成，请勿手改',
  record: ZH.RECORD,
  ship: ZH.SHIP,
  rig: ZH.RIG,
  masts: ZH.MASTS,
  castles: ZH.CASTLES,
  gear: ZH.GEAR,
  explodeGroups: ZH.EXPLODE_GROUPS,
  curve: ZH.CURVE,
  tables: ZH.TABLES,
  derived: {
    halfBeam: ZH.SHIP.beam / 2,
    waterlineZ: ZH.SHIP.draft,
    mastHeightPerDepth: ZH.RIG.mastHeightPerDepth,
    sailSpansForMast: ZH.MASTS.map((m) => ZH.sailSpans(m.sail))
  },
  check: ZH.selfCheck()
};

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 1), 'utf8');

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('已导出 ' + path.relative(ROOT, OUT) + '（' + kb + ' KB）');
console.log('桅 ' + payload.check.mastCount + ' / 帆 ' + payload.check.sailCount +
            '　长宽比 ' + payload.check.ratio.toFixed(4) +
            '　自检 ' + (payload.check.ok ? 'PASS' : 'FAIL'));
if (!payload.check.ok) process.exit(1);
