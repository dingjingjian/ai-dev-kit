// ZIP 打包：压缩 index.html + assets/ 为 earth-3d.zip（zip 根即为 index.html）
// 严格按 APPNOTE.TXT 6.3.x 布局写头部，路径统一使用正斜杠。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'earth-3d.zip');

// 需要纳入打包的项（相对 root）
const includes = ['index.html', 'assets'];

function collect(baseRel) {
  const abs = path.join(root, baseRel);
  const out2 = [];
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      out2.push(...collect(path.join(baseRel, e.name).split(path.sep).join('/')));
    }
  } else {
    out2.push({ abs, rel: baseRel });
  }
  return out2;
}

let entries = [];
for (const inc of includes) entries.push(...collect(inc));
entries.sort((a, b) => a.rel.localeCompare(b.rel));
if (!entries.some((e) => e.rel === 'index.html')) throw new Error('缺少 index.html');

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
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

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
  const { time, date } = dosDateTime(fs.statSync(abs).mtime);
  const flags = 0x0800;

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

fs.writeFileSync(out, Buffer.concat([...localParts, ...centralParts, eocd]));

const size = fs.statSync(out).size;
console.log(`打包完成: ${out}`);
for (const e of entries) console.log(`  + ${e.rel}`);
console.log(`  文件数 ${entries.length} | 原始 ${(rawTotal / 1024).toFixed(0)} KB | zip ${(size / 1024 / 1024).toFixed(2)} MB`);
