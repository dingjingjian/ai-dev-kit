/**
 * 把 BGM（mp3）内联为可直接 <script src> 加载的 `assets/bgm-data.js`。
 *
 * 为什么不直接放 .mp3 文件、也不用 <audio src>：
 *   1. 小工具容器上传白名单不收音频扩展名；
 *   2. `file://` 直接打开时 fetch/XHR 会被跨域拦，<audio> 的 data:/blob: 也可能被 CSP 挡。
 * 所以整首歌 base64 藏在 .js 里，运行时由 app.js 解回 Uint8Array 交给
 * `AudioContext.decodeAudioData`，全程不产生任何 URL。
 * 同款做法见 vibegame/perler-bead-game/bgm.js。
 *
 * 用法（在项目根目录执行）：
 *   node tools/make-bgm-data.mjs <源 mp3 路径>
 *   node tools/make-bgm-data.mjs            # 用下方 DEFAULT_SRC
 *
 * 约定：全局变量名固定为 `window.WE_BGM_B64`，与 app.js 的 loadBgm 对应。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 源文件不在仓库内（桌面交付物），故记录来源以便追溯；换曲时重新指定路径即可。
const DEFAULT_SRC = 'C:/Users/dingj/Desktop/d8badba2214c66d62989f41c4000a402(1).mp3';
const OUT = 'assets/bgm-data.js';
const VAR = 'WE_BGM_B64';

const src = process.argv[2] || DEFAULT_SRC;
if (!fs.existsSync(src)) throw new Error(`源音频不存在：${src}`);

const buf = fs.readFileSync(src);
// 极简校验：MPEG 音频帧同步字（ID3v2 之前也可能存在，这里检查前若干 KB 内出现同步字）
let sync = -1;
for (let i = 0; i < Math.min(buf.length - 4, 64 * 1024); i++) {
  if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0 && (buf[i + 1] & 0x18) !== 0x08 && (buf[i + 1] & 0x06) !== 0) { sync = i; break; }
}
if (sync < 0) throw new Error('未找到 MPEG 帧同步字，可能不是 mp3：' + src);

const b64 = buf.toString('base64');
const header =
  '/* 背景音乐（整曲 base64）。\n' +
  '   源：' + path.basename(src) + '（' + (buf.length / 1024).toFixed(0) + ' KB）\n' +
  '   本文件：' + (b64.length / 1024).toFixed(0) + ' KB base64，运行时 atob → decodeAudioData → Web Audio 循环播放。\n' +
  '   为何 base64：小工具容器上传白名单不收音频扩展名，且 file:// 下 <audio>/fetch 会被跨域拦。\n' +
  '   本文件由 tools/make-bgm-data.mjs 生成，请勿手工编辑；换曲后重新运行该脚本。 */\n';
fs.writeFileSync(path.resolve(ROOT, OUT), `${header}window.${VAR} = "${b64}";\n`, 'utf8');
console.log(`  [ok] ${OUT}  ${(b64.length / 1024).toFixed(0)} KB base64（源 ${(buf.length / 1024).toFixed(0)} KB）`);
