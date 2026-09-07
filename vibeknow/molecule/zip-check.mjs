// 独立 ZIP 解析器：完全按规范从 EOCD → 中央目录 → 本地头 → 解压 → CRC 校验，
// 并与 dist/ 原文件逐字节比对。与 pack.mjs 的写入路径互不复用，用于交叉验证。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const zipPath = path.join(root, 'molecule-minitool.zip');
const dist = path.join(root, 'dist');

const pass = [], fail = [];
const ok = (m) => pass.push(m);
const bad = (m) => fail.push(m);

const buf = fs.readFileSync(zipPath);

// ---- 1. 定位 EOCD ----
let eocd = -1;
for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) { console.log('  [X]   未找到 EOCD，文件不是合法 zip'); process.exit(1); }
ok(`EOCD 定位成功 @${eocd}`);

const totalEntries = buf.readUInt16LE(eocd + 10);
const cdSize = buf.readUInt32LE(eocd + 12);
const cdOffset = buf.readUInt32LE(eocd + 16);
const commentLen = buf.readUInt16LE(eocd + 20);

eocd + 22 + commentLen === buf.length
  ? ok('EOCD 位于文件末尾，无多余尾随字节')
  : bad(`EOCD 后有 ${buf.length - eocd - 22 - commentLen} 字节残留`);
cdOffset + cdSize === eocd
  ? ok(`中央目录范围自洽（offset ${cdOffset} + size ${cdSize} = EOCD ${eocd}）`)
  : bad(`中央目录范围不自洽: ${cdOffset}+${cdSize} != ${eocd}`);

// ---- 2. 遍历中央目录 ----
const found = [];
let p = cdOffset;
for (let i = 0; i < totalEntries; i++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) { bad(`第 ${i} 条中央目录签名错误 @${p}`); break; }
  const flags = buf.readUInt16LE(p + 8);
  const method = buf.readUInt16LE(p + 10);
  const crc = buf.readUInt32LE(p + 16);
  const compSize = buf.readUInt32LE(p + 20);
  const rawSize = buf.readUInt32LE(p + 24);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const cmtLen = buf.readUInt16LE(p + 32);
  const lhOffset = buf.readUInt32LE(p + 42);
  const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
  found.push({ name, flags, method, crc, compSize, rawSize, lhOffset });
  p += 46 + nameLen + extraLen + cmtLen;
}
found.length === totalEntries
  ? ok(`中央目录完整解析出 ${totalEntries} 条记录`)
  : bad(`中央目录条目数不符: 声明 ${totalEntries}，实得 ${found.length}`);

// ---- 3. 逐条校验本地头 + 解压 + CRC + 与源文件比对 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

for (const e of found) {
  const o = e.lhOffset;
  if (buf.readUInt32LE(o) !== 0x04034b50) { bad(`${e.name}: 本地头签名错误`); continue; }
  const lMethod = buf.readUInt16LE(o + 8);
  const lCrc = buf.readUInt32LE(o + 14);
  const lComp = buf.readUInt32LE(o + 18);
  const lRaw = buf.readUInt32LE(o + 22);
  const lNameLen = buf.readUInt16LE(o + 26);
  const lExtraLen = buf.readUInt16LE(o + 28);
  const lName = buf.slice(o + 30, o + 30 + lNameLen).toString('utf8');

  if (lName !== e.name) { bad(`${e.name}: 本地头文件名不一致 (${lName})`); continue; }
  if (lMethod !== e.method || lCrc !== e.crc || lComp !== e.compSize || lRaw !== e.rawSize) {
    bad(`${e.name}: 本地头与中央目录字段不一致 method=${lMethod}/${e.method} crc=${lCrc}/${e.crc} comp=${lComp}/${e.compSize} raw=${lRaw}/${e.rawSize}`);
    continue;
  }

  const start = o + 30 + lNameLen + lExtraLen;
  const payload = buf.slice(start, start + lComp);
  let data;
  try {
    data = lMethod === 8 ? zlib.inflateRawSync(payload) : payload;
  } catch (err) { bad(`${e.name}: 解压失败 ${err.message}`); continue; }

  if (data.length !== lRaw) { bad(`${e.name}: 解压后大小不符 ${data.length} != ${lRaw}`); continue; }
  if (crc32(data) !== lCrc) { bad(`${e.name}: CRC32 校验失败`); continue; }

  const srcPath = path.join(dist, e.name);
  if (!fs.existsSync(srcPath)) { bad(`${e.name}: dist 中不存在对应源文件`); continue; }
  if (!fs.readFileSync(srcPath).equals(data)) { bad(`${e.name}: 解压内容与源文件不一致`); continue; }

  ok(`${e.name} — 头部自洽 / 解压成功 / CRC 通过 / 内容与源文件逐字节一致 (${lRaw} → ${lComp} B)`);
}

// ---- 4. 结构约束 ----
const names = found.map((e) => e.name);
names.includes('index.html') ? ok('index.html 位于 zip 根目录') : bad('index.html 不在 zip 根目录');
!names.some((n) => n.includes('\\')) ? ok('路径分隔符全部为正斜杠（跨平台安全）') : bad('存在反斜杠路径分隔符');
!names.some((n) => n.startsWith('/') || n.includes('..')) ? ok('无绝对路径 / 目录穿越条目') : bad('存在不安全路径');
!names.some((n) => n.startsWith('__MACOSX') || n.endsWith('.DS_Store')) ? ok('无 macOS 元数据垃圾') : bad('含 __MACOSX/.DS_Store');
const distCount = (function c(d) { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? c(path.join(d, e.name)) : 1; return n; })(dist);
names.length === distCount ? ok(`条目数与 dist 文件数一致（${distCount} 个）`) : bad(`条目数 ${names.length} != dist 文件数 ${distCount}`);

console.log('\nZIP 完整性校验（独立解析器）\n' + '-'.repeat(58));
pass.forEach((m) => console.log('  [OK]  ' + m));
fail.forEach((m) => console.log('  [X]   ' + m));
console.log(`\n合计: ${pass.length} 通过 / ${fail.length} 失败`);
process.exit(fail.length ? 1 : 0);
