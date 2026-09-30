#!/usr/bin/env node
/**
 * 统一构建入口（ai-dev-kit）
 *
 * 用法（在**项目根**目录执行）：
 *   node ../../tools/build.mjs --check    前置校验，不写盘
 *   node ../../tools/build.mjs --plan     打印产出清单与体积，不写盘
 *   node ../../tools/build.mjs --zip      只打包
 *   node ../../tools/build.mjs --pack     构建 dist + 打包（默认）
 *   node ../../tools/build.mjs --smoke    跑 tests/ 下的冒烟脚本
 *   node ../../tools/build.mjs --audit    产物合规审计
 *
 * 本入口位于**仓库根** `tools/build.mjs`；各项目在 `<分类>/<项目>/`（如
 * `vibegame/defcon/`），故相对路径是 `../../tools/`。位于仓库根一层的
 * 项目（`vibecoding-gallery/`）用 `../tools/`。
 * 参数来自**项目根**的 build.config.json，见仓库根 CONVENTIONS.md 第四节。
 * 零依赖，仅用 node 内置模块；输出确定性 zip（条目排序 + 时间戳归零）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 定位项目根：从 cwd 向上找 build.config.json
// ---------------------------------------------------------------------------
function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'build.config.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes('--' + f);
const flagVal = (f, dflt = null) => {
  const i = argv.indexOf('--' + f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};

const cwd = process.cwd();
const ROOT = findProjectRoot(cwd);
if (!ROOT) {
  console.error('[build] 未找到 build.config.json（从 ' + cwd + ' 向上查找）。');
  console.error('[build] 请先按 CONVENTIONS.md 第四节为本项目补一份构建配置。');
  process.exit(2);
}

const CFG_PATH = path.join(ROOT, 'build.config.json');
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
} catch (e) {
  console.error('[build] build.config.json 解析失败：' + e.message);
  process.exit(2);
}

const NAME = cfg.name || path.basename(ROOT);
const ENTRY = cfg.entry || 'index.html';
const INCLUDE = Array.isArray(cfg.include) ? cfg.include : [ENTRY, 'assets'];
const EXCLUDE = new Set(cfg.exclude || []);
const ALLOWED_EXT = new Set(
  cfg.allowedExt || ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2']
);
const MAX_ZIP = cfg.maxZipBytes || 10 * 1024 * 1024;
const DIST = path.join(ROOT, cfg.dist || 'dist');
const ZIP = path.join(ROOT, cfg.zip || NAME + '.zip');
const SMOKE = cfg.smoke ? path.join(ROOT, cfg.smoke) : null;
const GUARDS = cfg.guards || [];
// 前置构建：单文件源码（如 molecule.html）需先由项目脚本拆分为 dist/ 再校验与打包
const PREBUILD = cfg.prebuild ? path.join(ROOT, cfg.prebuild) : null;
const PREBUILD_ARGS = Array.isArray(cfg.prebuildArgs) ? cfg.prebuildArgs : [];
// zip 根前缀剥离：include 指向 dist/ 时，条目名会带 "dist/" 前缀，
// 而小工具容器要求入口位于 zip 根目录 —— 用 zipRoot 把该前缀去掉。
const ZIP_ROOT = cfg.zipRoot != null ? cfg.zipRoot.replace(/\/+$/, '') : null;
// 包内入口名（zip 相对路径）。默认与磁盘入口同名；配了 zipRoot 时自动剥离前缀。
const ZIP_ENTRY = cfg.zipEntry
  || (ZIP_ROOT && ENTRY.startsWith(ZIP_ROOT + '/') ? ENTRY.slice(ZIP_ROOT.length + 1) : ENTRY);

const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m' };
const head = (t) => console.log('\n' + C.d + '── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length)) + C.x);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';

// ---------------------------------------------------------------------------
// 收集待打包文件
// ---------------------------------------------------------------------------
function collectFrom(baseRel) {
  const abs = path.join(ROOT, baseRel);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (!st.isDirectory()) {
    return [{ abs, rel: baseRel.split(path.sep).join('/') }];
  }
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (EXCLUDE.has(rel)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push({ abs: p, rel });
    }
  };
  walk(abs);
  return out;
}

function plan() {
  let entries = [];
  for (const inc of INCLUDE) entries.push(...collectFrom(inc));
  // 剥离 zipRoot 前缀：dist/index.html -> index.html（条目落到包根）
  if (ZIP_ROOT) {
    const pre = ZIP_ROOT + '/';
    entries = entries.map((e) => ({
      abs: e.abs,
      rel: e.rel.startsWith(pre) ? e.rel.slice(pre.length) : e.rel,
    }));
  }
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  const skipped = entries.filter((e) => !ALLOWED_EXT.has(path.extname(e.rel).toLowerCase()));
  entries = entries.filter((e) => ALLOWED_EXT.has(path.extname(e.rel).toLowerCase()));
  return { entries, skipped };
}

// ---------------------------------------------------------------------------
// 前置校验（--check）
// ---------------------------------------------------------------------------
/** 判断 needle 是否落在行注释 / 块注释里（避免把「出处标注」误判成外链） */
function isInComment(txt, needle) {
  const at = txt.indexOf(needle);
  if (at < 0) return false;
  // 找 needle 所在行，看它前面有没有注释起手符
  const lineStart = txt.lastIndexOf('\n', at) + 1;
  const before = txt.slice(lineStart, at);
  if (/\/\/|\/\*|\*|<!--|#/.test(before.trimStart().slice(0, 2))) return true;
  if (before.includes('//') || before.includes('<!--')) return true;
  // 块注释内：往前找最近的 /* 与 */，若 /* 更近则在注释里
  const open = txt.lastIndexOf('/*', at);
  const close = txt.lastIndexOf('*/', at);
  if (open > close) return true;
  return false;
}

const GUARD_IMPLS = {
  'entry-exists': () => ({
    name: '入口 ' + ENTRY + ' 存在',
    ok: fs.existsSync(path.join(ROOT, ENTRY)),
  }),
  'entry-at-root': () => {
    const p = plan();
    return { name: '入口位于包根目录（无多余层级）', ok: p.entries.some((e) => e.rel === ZIP_ENTRY) };
  },
  'no-inline-script': () => {
    const f = path.join(ROOT, ENTRY);
    if (!fs.existsSync(f)) return { name: '无内联 <script>', ok: false };
    const html = fs.readFileSync(f, 'utf8');
    const inline = /<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i.test(html);
    return { name: '无内联 <script>（脚本须外置）', ok: !inline };
  },
  'no-external-url': () => {
    const p = plan();
    const bad = [];
    for (const e of p.entries) {
      if (!/\.(html|css|js)$/i.test(e.rel)) continue;
      const txt = fs.readFileSync(e.abs, 'utf8');
      for (const u of txt.match(/https?:\/\/[^\s"')]+/g) || []) {
        if (u.includes('www.w3.org')) continue;          // SVG/xmlns 命名空间不算外链
        if (u.includes('miniapp-sandbox.xiaohongshu.com')) continue; // 容器文档链接（注释里的出处标注）
        if (isInComment(txt, u)) continue;               // 注释里的出处 URL 不构成实际外链
        bad.push(e.rel + ' → ' + u);
      }
    }
    return { name: '无 http(s) 外部资源引用', ok: bad.length === 0, detail: bad.slice(0, 5) };
  },
  'no-forbidden-api': () => {
    const p = plan();
    const RE = /WebSocket|new\s+Worker|geolocation|getUserMedia|window\.open|navigator\.clipboard|execCommand|createObjectURL|\beval\s*\(|new\s+Function\b/;
    const bad = [];
    for (const e of p.entries) {
      if (!/\.(html|js)$/i.test(e.rel)) continue;
      const txt = fs.readFileSync(e.abs, 'utf8');
      const m = txt.match(RE);
      if (m) bad.push(e.rel + ' → ' + m[0]);
    }
    return { name: '无禁用能力（WebSocket/Worker/clipboard/eval 等）', ok: bad.length === 0, detail: bad.slice(0, 5) };
  },
  'safe-area': () => {
    const f = path.join(ROOT, ENTRY);
    if (!fs.existsSync(f)) return { name: '安全区适配', ok: false };
    const html = fs.readFileSync(f, 'utf8');
    const ok = html.includes('safe-area-inset') || html.includes('viewport-fit=cover');
    return { name: '含安全区适配（safe-area-inset / viewport-fit）', ok };
  },
  'size-budget': () => {
    const p = plan();
    const raw = p.entries.reduce((s, e) => s + fs.statSync(e.abs).size, 0);
    return {
      name: '原始体积在门禁内（' + mb(MAX_ZIP) + '）',
      ok: raw <= MAX_ZIP,
      detail: ['原始 ' + mb(raw)],
    };
  },
};

function check() {
  head('前置校验 · ' + NAME);
  if (!GUARDS.length) {
    console.log(C.y + '  build.config.json 未声明 guards，仅做基础校验。' + C.x);
  }
  const wanted = GUARDS.length ? GUARDS : ['entry-exists', 'entry-at-root', 'size-budget'];
  let failed = 0;
  for (const g of wanted) {
    const impl = GUARD_IMPLS[g];
    if (!impl) {
      console.log('  ' + C.y + '?' + C.x + ' 未知 guard: ' + g);
      failed++;
      continue;
    }
    const r = impl();
    console.log('  [' + (r.ok ? C.g + '✓' + C.x : C.r + '✗' + C.x) + '] ' + r.name);
    if (!r.ok) {
      failed++;
      for (const d of r.detail || []) console.log('        ' + C.d + d + C.x);
    }
  }
  const p = plan();
  if (p.skipped.length) {
    console.log('  ' + C.d + '跳过 ' + p.skipped.length + ' 个类型不允许的文件：' +
      p.skipped.slice(0, 6).map((e) => e.rel).join(', ') + C.x);
  }
  console.log(failed ? '\n' + C.r + '前置校验未通过，拒绝打包。' + C.x : '\n' + C.g + '前置校验通过。' + C.x);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 产出清单（--plan）
// ---------------------------------------------------------------------------
function showPlan() {
  head('产出清单 · ' + NAME);
  const { entries, skipped } = plan();
  if (!entries.length) {
    console.log(C.r + '  没有可打包的文件，请检查 include 配置。' + C.x);
    return 1;
  }
  let total = 0;
  for (const e of entries) {
    const sz = fs.statSync(e.abs).size;
    total += sz;
    console.log('  + ' + e.rel.padEnd(44) + kb(sz).padStart(10));
  }
  console.log('  ' + C.d + '-'.repeat(56) + C.x);
  console.log('  文件数 ' + entries.length + ' | 原始合计 ' + kb(total));
  if (skipped.length) console.log(C.y + '  跳过 ' + skipped.length + ' 个（类型不允许）' + C.x);
  if (total > MAX_ZIP) {
    console.log(C.r + '  ✗ 已超门禁 ' + mb(MAX_ZIP) + C.x);
    return 1;
  }
  console.log(C.g + '  ✓ 在门禁 ' + mb(MAX_ZIP) + ' 之内' + C.x);
  return 0;
}

// ---------------------------------------------------------------------------
// 构建 dist
// ---------------------------------------------------------------------------
function buildDist() {
  // prebuild 项目：dist/ 本身就是 prebuild 的产物（源即目标），跳过重写，避免自毁
  if (PREBUILD) return -1;
  const { entries } = plan();
  fs.rmSync(DIST, { recursive: true, force: true });
  let n = 0;
  for (const e of entries) {
    const target = path.join(DIST, e.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(e.abs, target);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 打包（确定性 zip）
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 时间戳归零 → 同样的源产出逐字节相同的 zip */
const DOS_ZERO = { time: 0, date: (1 << 5) | 1 }; // 1980-01-01 00:00:00

function packZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let rawTotal = 0;

  for (const { abs, rel } of entries) {
    const data = fs.readFileSync(abs);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useStore = deflated.length >= data.length;
    const payload = useStore ? data : deflated;
    const method = useStore ? 0 : 8;

    const crc = crc32(data);
    const nameBuf = Buffer.from(rel, 'utf8');
    const { time, date } = DOS_ZERO;
    const flags = 0x0800; // UTF-8 文件名

    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    nameBuf.copy(lh, 30);
    localParts.push(lh, payload);

    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x031e, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    nameBuf.copy(ch, 46);
    centralParts.push(ch);

    offset += lh.length + payload.length;
    rawTotal += data.length;
  }

  const cdOffset = offset;
  const cdSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(ZIP), { recursive: true });
  fs.writeFileSync(ZIP, Buffer.concat([...localParts, ...centralParts, eocd]));
  return { size: fs.statSync(ZIP).size, rawTotal, count: entries.length };
}

function doZip() {
  const { entries } = plan();
  if (!entries.length) {
    console.log(C.r + '没有可打包的文件。' + C.x);
    return 1;
  }
  if (!entries.some((e) => e.rel === ZIP_ENTRY)) {
    console.log(C.r + '入口 ' + ZIP_ENTRY + ' 不在打包内容中。' + C.x);
    return 1;
  }
  const r = packZip(entries);
  head('打包 · ' + NAME);
  console.log('  产物 ' + path.relative(cwd, ZIP));
  console.log('  文件数 ' + r.count + ' | 原始 ' + kb(r.rawTotal) + ' | zip ' + kb(r.size));
  if (r.size > MAX_ZIP) {
    console.log(C.r + '  ✗ 超出门禁 ' + mb(MAX_ZIP) + C.x);
    return 1;
  }
  console.log(C.g + '  ✓ 在门禁 ' + mb(MAX_ZIP) + ' 之内' + C.x);
  return 0;
}

// ---------------------------------------------------------------------------
// 前置构建（prebuild）：单文件源码先拆分为 dist/，再做校验与打包
// ---------------------------------------------------------------------------
function runPrebuild() {
  if (!PREBUILD) return 0;
  if (!fs.existsSync(PREBUILD)) {
    console.log(C.r + 'prebuild 脚本不存在：' + path.relative(ROOT, PREBUILD) + C.x);
    return 1;
  }
  head('前置构建 · ' + path.relative(ROOT, PREBUILD));
  const ext = path.extname(PREBUILD).toLowerCase();
  const runner = ext === '.py' ? 'python' : process.execPath;
  const r = spawnSync(runner, [PREBUILD, ...PREBUILD_ARGS], { cwd: ROOT, stdio: 'inherit' });
  if (r.error) {
    console.log(C.r + '启动失败：' + r.error.message + C.x);
    return 1;
  }
  return r.status === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 冒烟（--smoke）
// ---------------------------------------------------------------------------
function doSmoke() {
  if (!SMOKE || !fs.existsSync(SMOKE)) {
    console.log(C.y + '未配置冒烟脚本（build.config.json 的 smoke 字段）。' + C.x);
    return 0;
  }
  head('冒烟 · ' + path.relative(ROOT, SMOKE));
  const ext = path.extname(SMOKE).toLowerCase();
  const runner = ext === '.py' ? 'python' : process.execPath;
  const r = spawnSync(runner, [SMOKE], { cwd: ROOT, stdio: 'inherit' });
  if (r.error) {
    console.log(C.r + '启动失败：' + r.error.message + C.x);
    return 1;
  }
  return r.status === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 产物审计（--audit）
// ---------------------------------------------------------------------------
function doAudit() {
  head('产物审计 · ' + NAME);
  if (!fs.existsSync(ZIP)) {
    console.log(C.r + '  未找到产物 ' + path.relative(ROOT, ZIP) + '，请先 --pack。' + C.x);
    return 1;
  }
  const buf = fs.readFileSync(ZIP);
  // 解析中央目录，拿到真实条目名
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p--;
  if (p < 0) {
    console.log(C.r + '  ✗ 不是合法 zip（未找到 EOCD）' + C.x);
    return 1;
  }
  const total = buf.readUInt16LE(p + 10);
  let off = buf.readUInt32LE(p + 16);
  const names = [];
  for (let i = 0; i < total; i++) {
    const nl = buf.readUInt16LE(off + 28);
    names.push(buf.slice(off + 46, off + 46 + nl).toString('utf8'));
    off += 46 + nl + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
  }
  let bad = 0;
  const report = (ok, msg) => {
    console.log('  [' + (ok ? C.g + '✓' + C.x : C.r + '✗' + C.x) + '] ' + msg);
    if (!ok) bad++;
  };
  report(names.includes(ZIP_ENTRY), '入口 ' + ZIP_ENTRY + ' 位于 zip 根目录');
  report(total === names.length && total > 0, '中央目录条目数 ' + total + ' 与包内一致');
  report(new Set(names).size === names.length, '无重复条目');
  const big = names.filter((n) => /\.(mp4|mov|psd)$/i.test(n));
  report(big.length === 0, '无体积异常的媒体文件' + (big.length ? '（' + big.join(', ') + '）' : ''));
  const junk = names.filter((n) => /__MACOSX|\.DS_Store|\.git\/|node_modules/.test(n));
  report(junk.length === 0, '无系统垃圾条目' + (junk.length ? '（' + junk.slice(0, 3).join(', ') + '）' : ''));
  const disallowed = names.filter((n) => !ALLOWED_EXT.has(path.extname(n).toLowerCase()));
  report(disallowed.length === 0, '全部条目类型在白名单内' + (disallowed.length ? '（' + disallowed.slice(0, 3).join(', ') + '）' : ''));
  report(buf.length <= MAX_ZIP, '体积 ' + kb(buf.length) + ' 在门禁 ' + mb(MAX_ZIP) + ' 内');
  console.log(bad ? '\n' + C.r + bad + ' 项未通过。' + C.x : '\n' + C.g + '审计通过。' + C.x);
  return bad === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
let code = 0;
if (hasFlag('check')) {
  code = runPrebuild();
  if (code === 0) code = check();
} else if (hasFlag('plan')) {
  code = runPrebuild();
  if (code === 0) code = showPlan();
} else if (hasFlag('zip')) {
  code = runPrebuild();
  if (code === 0) code = doZip();
} else if (hasFlag('smoke')) code = doSmoke();
else if (hasFlag('audit')) code = doAudit();
else {
  code = runPrebuild();
  if (code !== 0) process.exit(code);
  const c = check();
  if (c !== 0) process.exit(c);
  const n = buildDist();
  head('构建 dist');
  console.log(n < 0
    ? C.d + '  前置构建已产出 ' + path.relative(ROOT, DIST) + '/，跳过重复构建' + C.x
    : '  已写入 ' + n + ' 个文件到 ' + path.relative(ROOT, DIST) + '/');
  code = doZip();
}
process.exit(code);
