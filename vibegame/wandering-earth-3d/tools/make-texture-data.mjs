/**
 * 把源贴图（jpg/png）内联为可直接 <script src> 加载的 `*-data.js`。
 *
 * 背景：`file://` 直接打开页面时，<img> 加载本地图片会污染画布，导致 texImage2D 被拒；
 * 内联 data URI 无跨域问题，可稳定加载，因此所有贴图都以 data URI 形式随包分发。
 *
 * 用法（在项目根目录执行）：
 *   node tools/make-texture-data.mjs            # 按下方 TARGETS 全量重建
 *   node tools/make-texture-data.mjs jupiter    # 只重建指定项
 *
 * 约定：全局变量名固定为 `window.<NAME>_TEXTURE_URI`，与 engine.js 的 createTexture 对应。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 每项：源文件（相对项目根） / 输出文件 / 全局变量名 / 说明
// 行星贴图统一取自 vibeknow/solar-system-3d/assets/（NASA 影像），
// 2026-09-27 起**掠过五站 + 场上三颗全部用真实影像**（此前天王星 / 海王星 / 冥王星 /
// 水星 / 金星 / 火星是程序化色块）。`procPlanetTex` 仍在，只作贴图缺失时的兜底。
// 地球贴图 earth-data.js 另由历史版本保留（体积大、重复生成成本高，未纳入本表）。
const SRC = '../../vibeknow/solar-system-3d/assets';
const TARGETS = [
  { key: 'jupiter', src: `${SRC}/jupiter.jpg`, out: 'assets/jupiter-data.js', name: 'JUPITER', note: '木星贴图（自带大红斑与大气条纹）' },
  { key: 'saturn', src: `${SRC}/saturn.jpg`, out: 'assets/saturn-data.js', name: 'SATURN', note: '土星贴图' },
  { key: 'uranus', src: `${SRC}/uranus.jpg`, out: 'assets/uranus-data.js', name: 'URANUS', note: '天王星贴图（青蓝冰巨星）' },
  { key: 'neptune', src: `${SRC}/neptune.jpg`, out: 'assets/neptune-data.js', name: 'NEPTUNE', note: '海王星贴图（深蓝冰巨星）' },
  { key: 'pluto', src: `${SRC}/pluto.jpg`, out: 'assets/pluto-data.js', name: 'PLUTO', note: '冥王星贴图（心形冰原）' },
  { key: 'mercury', src: `${SRC}/mercury.jpg`, out: 'assets/mercury-data.js', name: 'MERCURY', note: '水星贴图（陨石坑地貌）' },
  { key: 'venus', src: `${SRC}/venus.jpg`, out: 'assets/venus-data.js', name: 'VENUS', note: '金星贴图（硫酸云层）' },
  { key: 'mars', src: `${SRC}/mars.jpg`, out: 'assets/mars-data.js', name: 'MARS', note: '火星贴图（铁锈色地表 + 极冠）' }
];

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function build(target) {
  const srcAbs = path.resolve(ROOT, target.src);
  if (!fs.existsSync(srcAbs)) throw new Error(`源贴图不存在：${target.src}`);
  const ext = path.extname(srcAbs).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`不支持的贴图类型：${ext}`);

  const b64 = fs.readFileSync(srcAbs).toString('base64');
  const outAbs = path.resolve(ROOT, target.out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  const header =
    `/* ${target.note}。\n` +
    '   内联 data URI：file:// 直接打开时 <img> 加载本地图片会污染画布导致 texImage2D 被拒。\n' +
    '   本文件由 tools/make-texture-data.mjs 生成，请勿手工编辑；改贴图后重新运行该脚本。 */\n';
  fs.writeFileSync(outAbs, `${header}window.${target.name}_TEXTURE_URI = "data:${mime};base64,${b64}";\n`, 'utf8');
  console.log(`  [ok] ${target.out}  ${(b64.length / 1024).toFixed(0)} KB`);
}

const only = process.argv[2];
const list = only ? TARGETS.filter((t) => t.key === only) : TARGETS;
if (!list.length) throw new Error(`未知目标：${only}（可选：${TARGETS.map((t) => t.key).join(', ')}）`);
console.log(`内联贴图（${list.length} 项）：`);
list.forEach(build);
console.log('完成。');
