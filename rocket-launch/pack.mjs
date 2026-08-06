// ZIP 打包：压缩 dist/ 的“内容”（index.html 位于 zip 根），输出 molecule-minitool.zip
// 严格按 APPNOTE.TXT 6.3.x 布局写头部，路径统一使用正斜杠。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const out = path.join(root, 'rocket-launch.zip');

function collect(dir) {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...collect(p));
    else files.push({ abs: p, rel: path.relative(dist, p).split(path.sep).join('/') });
  }
  return files;
}

// DOS 时间戳：低 16 位 = 时间(秒/2)，高 16 位 = 日期
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

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

const entries = collect(dist);
if (!entries.some((e) => e.rel === 'index.html')) throw new Error('dist 根目录缺少 index.html');

const localParts = [];
const centralParts = [];
let offset = 0;
let rawTotal = 0;

for (const { abs, rel } of entries) {
  const data = fs.readFileSync(abs);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  // 若压缩反而变大，退化为 store(0)
  const useStore = deflated.length >= data.length;
  const payload = useStore ? data : deflated;
  const method = useStore ? 0 : 8;

  const crc = crc32(data);
  const nameBuf = Buffer.from(rel, 'utf8');
  const { time, date } = dosDateTime(fs.statSync(abs).mtime);
  // bit 11 = 文件名/注释为 UTF-8
  const flags = 0x0800;

  // ---- local file header (30 + nameLen) ----
  const lh = Buffer.alloc(30 + nameBuf.length);
  lh.writeUInt32LE(0x04034b50, 0);      // signature
  lh.writeUInt16LE(20, 4);              // version needed to extract (2.0)
  lh.writeUInt16LE(flags, 6);           // general purpose bit flag
  lh.writeUInt16LE(method, 8);          // compression method
  lh.writeUInt16LE(time, 10);           // last mod file time
  lh.writeUInt16LE(date, 12);           // last mod file date
  lh.writeUInt32LE(crc, 14);            // crc-32
  lh.writeUInt32LE(payload.length, 18); // compressed size
  lh.writeUInt32LE(data.length, 22);    // uncompressed size
  lh.writeUInt16LE(nameBuf.length, 26); // file name length
  lh.writeUInt16LE(0, 28);              // extra field length
  nameBuf.copy(lh, 30);

  localParts.push(lh, payload);

  // ---- central directory header (46 + nameLen) ----
  const ch = Buffer.alloc(46 + nameBuf.length);
  ch.writeUInt32LE(0x02014b50, 0);      // signature
  ch.writeUInt16LE(0x031e, 4);          // version made by (UNIX, 3.0)
  ch.writeUInt16LE(20, 6);              // version needed
  ch.writeUInt16LE(flags, 8);           // flags
  ch.writeUInt16LE(method, 10);         // method
  ch.writeUInt16LE(time, 12);           // mod time
  ch.writeUInt16LE(date, 14);           // mod date
  ch.writeUInt32LE(crc, 16);            // crc-32
  ch.writeUInt32LE(payload.length, 20); // compressed size
  ch.writeUInt32LE(data.length, 24);    // uncompressed size
  ch.writeUInt16LE(nameBuf.length, 28); // name length
  ch.writeUInt16LE(0, 30);              // extra length
  ch.writeUInt16LE(0, 32);              // comment length
  ch.writeUInt16LE(0, 34);              // disk number start
  ch.writeUInt16LE(0, 36);              // internal attributes
  ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes: 普通文件 0644（无符号）
  ch.writeUInt32LE(offset, 42);         // relative offset of local header
  nameBuf.copy(ch, 46);
  centralParts.push(ch);

  offset += lh.length + payload.length;
  rawTotal += data.length;
}

const cdOffset = offset;
const cdSize = centralParts.reduce((s, b) => s + b.length, 0);

// ---- end of central directory (22) ----
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);                 // this disk number
eocd.writeUInt16LE(0, 6);                 // disk with central directory
eocd.writeUInt16LE(entries.length, 8);    // entries on this disk
eocd.writeUInt16LE(entries.length, 10);   // total entries
eocd.writeUInt32LE(cdSize, 12);
eocd.writeUInt32LE(cdOffset, 16);
eocd.writeUInt16LE(0, 20);                // comment length

fs.writeFileSync(out, Buffer.concat([...localParts, ...centralParts, eocd]));

const size = fs.statSync(out).size;
console.log(`打包完成: ${out}`);
for (const e of entries) console.log(`  + ${e.rel}`);
console.log(`  文件数 ${entries.length} | 原始 ${(rawTotal / 1024).toFixed(0)} KB | zip ${(size / 1024 / 1024).toFixed(2)} MB`);
