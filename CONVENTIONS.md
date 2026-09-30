# 工程约定（唯一真源）

本文件是 ai-dev-kit 各子项目**工程方法的唯一真源**，与 [`TRACKS.md`](TRACKS.md) 分工明确：

| 文件 | 管什么 | 不管什么 |
|------|--------|----------|
| [`TRACKS.md`](TRACKS.md) | 作品**属于哪个分类**、一句话定位、物料状态、发布标签 | 目录怎么摆、脚本怎么写 |
| 本文件 | 项目**怎么建、怎么验、什么能入库** | 作品好不好玩、归哪个分类 |

二者同属仓库级约定，任何冲突以本文（工程）与 `TRACKS.md`（分类）各自领域为准。新增或改造项目前先读本文；本文未覆盖的，先补本文再动手，不要就地发明第二套做法。

> 本文由 2026-09-30 全仓结构普查（43 个自研项目）导出。普查发现的六类结构分裂——构建脚本 36 份独立实现、脚本落位三分裂（`_dev/` / `tools/` / 项目根）、12 个 zip 与 4 份 `.skill` 副本被 git 跟踪、480+ 过程痕迹入库——即本文要消除的对象。

## 一、分类与目录

顶层四个分类目录（`vibetool/` / `vibegame/` / `vibeart/` / `vibeknow/`）与 `reference/`、`vibecoding-gallery/` 两个非分类目录的定义见 [`TRACKS.md`](TRACKS.md)，本文不重复。

`<分类>/<项目名>/` 为项目根。项目名用小写连字符（`perler-city`），历史遗留的下划线（`ai_gateway`）不强制改名，但新项目一律连字符。

## 二、标准项目骨架

```text
<分类>/<项目名>/
├── README.md              # 必需。首行分类行 + 一句话定位 + 打开方式
├── index.html             # 必需。小工具入口（容器只认这个文件名）
├── main.js / assets/      # 源码。单文件项目可全部内联进 index.html
├── DESIGN.md              # 可选。玩法 / 数值 / 设计真源（重策略类项目建议有）
├── tools/                 # 工具目录，见第三节
├── tests/                 # 验证目录，见第三节
├── xiaohongshu/           # 小红书素材（命名见《小红书文案归档规范.md》）
├── dist/                  # 构建产物（不入库，见第五节）
└── <项目名>.zip           # 提交包（不入库，见第五节）
```

**README.md 首行分类行**是硬性约定，格式固定：

```markdown
# 项目中文名 · Project Name

> **分类**：`#vibeknow` 人文知识　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)
```

分类行让读者在项目内就能知道它属于哪个分类，不必回仓库根查表。

## 三、脚本落位：`tools/` 与 `tests/` 二分

**所有脚本归 `tools/` 或 `tests/` 两处，不再使用项目根或 `_dev/`。** 这是本次统一的核心动作。

| 目录 | 放什么 | 判据 |
|------|--------|------|
| `tools/` | 构建、打包、数据处理、素材加工、探针、诊断脚本 | 「为了**造出**产物」 |
| `tests/` | 冒烟、契约、回归、数值推演、兼容性检查 | 「为了**证明**产物对」 |
| `xiaohongshu/` | 笔记文案与发布素材 | 见《小红书文案归档规范.md》 |

一个脚本属于哪边，问一句：删掉它，产物还是同一个吗？是 → `tests/`；不是 → `tools/`。

### 历史遗留 `_dev/` 的处置

普查前仓库里有 15 个项目使用 `_dev/`，另有 9 个用 `tools/`、6 个把脚本放在项目根。三者现在**统一收敛到 `tools/` + `tests/`**：

- `_dev/build.py`、`_dev/build_zip.py`、`_dev/make_*.py`、`_dev/*_check.py`（生成/校验产物）→ `tools/`
- `_dev/smoke_test.js`、`_dev/check.py`、`_dev/shot_check.py`、`_dev/verify_*.py` → `tests/`
- `_dev/*.json` 规格/清单（`patterns.json`、`works_raw.json`）→ `tools/`（它们是构建输入）
- 项目根的 `build.mjs` / `pack.mjs` / `verify-minitool.mjs` / `build-zip.js` / `build.js` / `build_dist.py` → `tools/`
- 项目根的 `runtime-test.py` / `smoke.js` → `tests/`

`_dev/` 目录**不再保留**。若某项目的 `_dev/` 里混着未归类的中间产物，中间产物直接丢弃（可由脚本重建），只迁移脚本本身。

唯一例外：`_dev/xiaohongshu/`（构建期生成的小红书海报等内部素材，见 `AGENTS.md`）位置本就正确，原地保留。

### 工作输入与中间产物：`.work/` 与 `dist/`

脚本引用的路径按用途分两类落位，不再散落在 `_dev/`：

| 用途 | 目录 | 说明 | 入库 |
|------|------|------|------|
| **外部工作输入** | `.work/` | 人工放入的原始图（`raw_img/`）、参考照片（`ref/`）、旧版图（`xhs_prev/`）等脚本消费的原料 | ❌（`**/.work/` 已忽略） |
| **中间产物输出** | `dist/` | 探针截图、冒烟日志、预览图等脚本产出的临时结果 | ❌（`dist/` 已忽略） |
| **构建输入（并入 tools/）** | `tools/` | 规格与清单（`image-spec.md`、`image-prompts.json`、`IMAGE_PROMPTS.md`、`patterns.json`、`ref-index.md`） | ✅ |

脚本内引用时，项目根一律用 `Path(__file__).resolve().parent.parent`（脚本在 `tools/` / `tests/` 下均为一层）解析，再拼 `.work`、`dist` 或 `tools`。

## 四、构建与打包：统一入口

**不再逐项目手写打包脚本。** 仓库提供统一入口，位于**仓库根** `tools/build.mjs`。
在**项目根**执行（各项目在 `<分类>/<项目>/`，故回仓库根是 `../../`）：

```bash
node ../../tools/build.mjs --check     # 前置校验（不写盘）
node ../../tools/build.mjs --plan      # 打印将要产出的文件清单与体积（不写盘）
node ../../tools/build.mjs --zip       # 只打包
node ../../tools/build.mjs --pack      # 构建 dist + 打包（默认）
node ../../tools/build.mjs --smoke     # 无头冒烟
node ../../tools/build.mjs --audit     # 产物合规审计
```

> 仓库根一层的项目（`vibecoding-gallery/`）用 `../tools/build.mjs`。
> 位于 `docs/`、`assets/`、`tools/`、`tests/` 等子目录的文档引用命令时，
> 须标注「（在项目根）执行」，因为入口按 cwd 向上找 `build.config.json`。

参数由**项目根** `build.config.json` 声明：

```json
{
  "name": "earth-3d",
  "include": ["index.html", "assets"],
  "entry": "index.html",
  "allowedExt": [".html", ".css", ".js", ".json", ".png", ".jpg", ".svg", ".woff2"],
  "maxZipBytes": 10485760,
  "smoke": "tests/smoke.mjs",
  "guards": ["no-inline-script", "no-external-url", "no-forbidden-api", "safe-area"]
}
```

要点：

- 统一入口输出**确定性 zip**（条目按路径排序，时间戳归零），同样的源产出逐字节相同的包。
- 体积门禁、允许扩展名、前置校验项全部由配置声明，脚本不再各自硬编码。
- 项目若确需特殊处理（如 air-tycoon 要剔除 `assets/earth.jpg`、index.html 要去掉 `data-page-node-id`），用配置里的 `exclude` / `transform` 字段声明，而不是另写一个脚本。
- 冒烟脚本放 `tests/`，由配置的 `smoke` 字段指向；语言不限（`.mjs` / `.js` / `.py` 均可）。

**单文件源码的构建（`prebuild` + `zipRoot`）**：源只是一份单文件 HTML（如 `molecule.html`、`rocket-launch.html`），须先拆成 `dist/` 再打包时，用这两个字段配合：

```json
{
  "name": "molecule",
  "prebuild": "tools/build.mjs",
  "include": ["dist"],
  "entry": "dist/index.html",
  "zipRoot": "dist",
  "zip": "molecule.zip"
}
```

- `prebuild`：打包前先执行的构建脚本（按扩展名选 `python` / `node`，工作目录为项目根），负责把单文件拆成 `dist/index.html` + `dist/assets/*`。此时 `dist/` 就是源，统一入口**不会**再重写它。
- `zipRoot`：条目名按项目相对路径收集，`include:["dist"]` 会带上 `dist/` 前缀；而小工具容器要求 `index.html` 位于 **zip 根目录**。`zipRoot: "dist"` 负责剥离该前缀，使包内结构为 `index.html` + `assets/*`。
- **判据**：`node ../../tools/build.mjs --plan` 打印的清单里，入口必须是 `index.html`（不带 `dist/`）。若看到 `dist/index.html` 即为 `zipRoot` 漏配。

> 平台规范（容器能力、JS/CSS 兼容基线、体积预算）以 [`.skill/minitool-zip-builder/`](.skill/minitool-zip-builder/SKILL.md) 为准，本文件不重复，只规定「入口怎么调、配置怎么写」。

## 五、什么能入库：产物与痕迹

原则一句话：**入库的是「源」与「方法」，出库的是「产物」与「过程」。**

| 类别 | 入库 | 说明 |
|------|------|------|
| 源码（`index.html` / `main.js` / `assets/`） | ✅ | 项目本体 |
| 脚本（`tools/` `tests/`） | ✅ | 方法，必须可复现 |
| 规格与数据（`*.json` 清单、`DESIGN.md`、`设定文档.md`） | ✅ | 构建输入与设计真源 |
| 小红书素材（`xiaohongshu/`） | ✅ | 发布物料 |
| 参考图（用于生图的原始素材，如 `tools/ref-index.md`） | ✅ | 构建输入 |
| `.work/`（人工放入的原始输入：原图 / 参考照 / 旧版图） | ❌ | 外部工作目录，不入库（见下） |
| `dist/` | ❌ | 构建中间产物，`*.gitignore` 已忽略 |
| `.zip` 提交包 | ❌ | 二次产物，与源码必然分叉；需要时重跑 `--pack` |
| 截图 / 预览图 / 探针输出（`_shots/` `.shots/` `*_preview_*.png`） | ❌ | 可由脚本重建，属过程痕迹 |
| 日志（`*.log`、`_*.txt`） | ❌ | 过程痕迹 |
| 录屏工程目录（`xhs-video/clips/` `_frames_*/` `_probe/`） | ❌ | 已由根 `.gitignore` 覆盖 |
| `.skill/`（项目内副本） | ❌ | 技能真源只在仓库级 `.skill/`，见第六节 |
| `node_modules/` `__pycache__/` | ❌ | 依赖与缓存 |

### 为什么 zip 不入库

`TRACKS.md` 维护约定第 5 条已经就 `.skill/` 的 zip 副本踩过这个坑：「一旦入库就会与目录分叉——`minitool-zip-builder.zip` 就落到了『zip 内 SKILL.md 3116B vs 磁盘 4638B』并夹带 macOS `__MACOSX/` 垃圾」。同一个道理适用于所有 `.zip`：**它是源码的函数，不是源码的同伴。** 入库的 zip 会随时间自动变成谎话，且没有任何机制会提醒你它已经过期。

提交时按需生成，生成命令写进 README 即可。

## 六、技能（Skill）与文档

- **仓库级技能真源在 `.skill/<name>/`**，以目录形式入库。项目内**不得**再放 `.skill/` 副本。要让技能被工具发现，用 `.skill/<name>/sync_check.py --install-user` 装到 `~/.workbuddy/skills/`，不要靠复制目录或 zip。
- 仓库级文档放 `docs/`；项目级文档放项目根的 `README.md` / `DESIGN.md` / `设定文档.md`。
- **禁止硬编码绝对路径**（`TRACKS.md` 维护约定第 4 条）。脚本一律基于 `__file__` 推导：

```python
ROOT = Path(__file__).resolve().parent.parent  # tools/ 或 tests/ 的上一级
```

```javascript
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
```

## 七、命名一致性

| 对象 | 约定 | 校验 |
|------|------|------|
| 项目目录 | 小写连字符 | `audit_structure.py` R1 |
| 小工具入口 | 恒为 `index.html` | R2 |
| 提交包 | `<项目名>.zip` | R3 |
| 小红书文案 | `小红书文案.md`（多版本 `小红书文案-<后缀>.md`） | `scripts/check_xiaohongshu_naming.py` |
| 小红书配图 | `NN-用途.扩展名`（两位序号 + 短横线） | 同上 |
| 构建配置 | `build.config.json` | R2 |
| 中间目录 | 下划线前缀（`_frames_v6/` `_probe/`），且必须被忽略 | R6 |

## 八、兼容性基线

任何在浏览器内核中运行的产出，最低兼容基线为 **Android 8.1 出场 Chrome / WebView 61（ES2017）**。新 Web API 做能力检测而非 UA 判断；CSS 采用「基线层 + 能力检测增强层」。权威细则见 [`.skill/minitool-zip-builder/references/`](.skill/minitool-zip-builder/references/)（`js-compatibility.md` / `css-compatibility.md` / `cross-platform-h5.md` / `device-capabilities.md`），交付前逐条核对其末尾自检清单，未实测须标注「兼容性未实测」。

## 九、校验与门禁

改完结构跑一次全仓审计：

```bash
python tools/audit_structure.py          # 列出全部不合规项
python tools/audit_structure.py --plan   # 输出建议的改造清单
```

审计规则（R1–R12）：

| 规则 | 检查 |
|------|------|
| R1 | 项目目录在四分类或两个非分类目录下，命名为小写连字符 |
| R2 | 有 `README.md` 且首行含分类行；有 `index.html`；有 `build.config.json` |
| R3 | 无项目内 `.skill/` 副本；无入库 `.zip` |
| R4 | 无 `_dev/`；无项目根散落构建脚本 |
| R5 | 无被跟踪的**过程痕迹**截图目录（`_shots/` `.shots/` `.playwright-cli/` `docs/shots/`）。**交付物料**放行：`reference/*/screenshots/`、`xiaohongshu/screenshots/`、项目根 `screenshots/`（README 引用的成品图） |
| R6 | 无被跟踪的过程痕迹文件（`_preview_*.png`、`*_shot*.png`、`shot-<数字>*.png`、`*.log`、`_*.txt`） |
| R7 | `build.config.json` 的 `entry` 与 `include` 指向真实存在的路径 |
| R8 | 有 `tests/` 目录，或 README 里显式声明「无自动验证」及原因 |
| R9 | 未跟踪的 `dist/` 与 `*.zip` 确实被 `.gitignore` 覆盖 |
| R10 | README 未超长（不超过 200 行；超出应拆分到 `DESIGN.md`） |
| R11 | 文档里 `` `tools/xxx` `` / `` `tests/xxx` `` 引用的脚本在项目内真实存在 |
| R12 | 统一入口的调用路径与项目到仓库根的层数匹配：`<分类>/<项目>/`（2 层）须写 `node ../../tools/build.mjs`；仓库根一层项目（`vibecoding-gallery/`）写 `node ../tools/build.mjs`。位于 `docs/`、`assets/`、`tools/` `tests/` 等子目录的文档还须标注「（在项目根）执行」 |

## 十、维护约定

1. **新项目落地即按本文件建骨架**，不要先长成别的样子再回头迁。
2. **改结构要同步改本文**。本文是唯一真源，README / AGENTS.md 只做索引不做重复定义。
3. **破坏性操作前先备份，分批执行**。仓库的历史教训：`git rm <file>` 会连坐删除同目录下未跟踪的新文件（Git for Windows 实测事故）。执行前先 `git status --short` 看清 `??`，未提交的新文件先 `git add` 兜底；批量操作每批不超过 45 个文件。
4. **不要主动 `git commit` / `push`**，改动完成后汇总说明，由维护者决定提交。
