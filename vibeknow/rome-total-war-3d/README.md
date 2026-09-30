# 罗马军团图鉴

> **分类**：`#vibeknow` 人文知识　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

一个古罗马时代的阵营与兵种图鉴。**选择阵营 → 凯旋门开启 → 逐队检阅 → 军团志**，
视觉与叙事参照《Rome II: Total War》的单位卡风格。
8 个阵营 × 6 个兵种 = 48 支队伍；检阅每个兵种时，右列按槽位拆出它的**装备**（头部 / 甲胄 / 盾 / 主武器 / 远程 / 坐骑）。
另有「自选军团」：从 48 支队伍里自由挑、自己排检阅顺序。

> 本项目参照 [`jurassic-park-3d`](../jurassic-park-3d/) 的技术框架构建，
> 底层逻辑从「园区游览 app」改为「军团检阅 app」。

## 打开方式

双击 `index.html`。资源在 `assets/`，需与 `index.html` 保持同级目录。

> 全部素材都是普通图片与 CSS 背景，**双击（file://）直接打开即可**，没有跨源限制。


## 素材

所有图片与 BGM 都是外部素材，缺哪样都不会白屏（一律回退）。规格文档：

| 文档 | 内容 |
|------|------|
| [`docs/兵种图片素材需求.md`](docs/兵种图片素材需求.md) | 48 张兵种图（写实）：构图模板、逐条主体描述、风格前缀、阵营色调、**位置统一条款**（兵牌那套规格 §3.5–3.8 留档） |
| [`docs/装备图集需求.md`](docs/装备图集需求.md) | 52 件装备小图（128×128 透明底）：逐件主体描述、统一风格、透明底与体积预算 |
| [`docs/场景配图需求.md`](docs/场景配图需求.md) | logo、大理石、阵营横幅 ×9、**过渡画面 ×9**（共 20 个图位；横幅兼首页 hero 轮播，过渡画面即「即将检阅」页那张）；末尾附**通用凯旋门退役说明** |
| [`docs/背景音乐需求.md`](docs/背景音乐需求.md) | 选曲要求、循环点怎么找、`make-bgm.mjs` 用法 |
| [`docs/素材生成说明.md`](docs/素材生成说明.md) | 生成顺序、后处理、落位、版权留档、踩坑清单 |
| [`docs/提示词包.md`](docs/提示词包.md) | 168 条可直接复制的提示词（**由 `tools/gen_prompts.py` 生成，不要手改**） |
| [`docs/素材质量整改.md`](docs/素材质量整改.md) | 已落位素材的核查结论与整改清单（透明底 / 兵牌画风），开头是整改回执 |


## 目录结构

```
index.html              页面骨架 + 全套内联 CSS（五页 + 8 套阵营主题）
assets/
├── app.js              交互逻辑（状态机 / 装备拆解 / 雷达图 / BGM / 过渡页取图）
├── units.js            兵种数据真源（48 兵种 + 8 阵营 + 自选）
├── gear.js             装备数据真源（52 件词表 + 48 兵种的槽位引用表）
├── three.min.js        three.js（地球组件用；可缺席——拿不到就降级，其余四页照常）
├── earth.jpg           地球贴图（file:// 下会被判跨源，自动退程序化经纬网贴图）
├── units/              兵种图 ×48（外部素材，写实，48 支全用它）
├── gear/               装备图 ×52（外部素材，128×128 透明底）
├── tex/                场景图 ×20（外部素材；阵营横幅兼首页 hero 轮播，gate-<key> 是过渡画面）
├── audio/bgm.js        base64 音频（由 tools/make-bgm.mjs 生成）
└── flexgap.js          flex gap 能力检测（兼容基线用）
tools/
├── gen_prompts.py      出图前：从三份规格文档拼出 168 条提示词 → docs/提示词包.md
├── prep_units.py       出图后：裁方 → 缩尺寸 → 转 sRGB → 压 WebP → 落位到正确文件名
├── check_data.js       代码契约自检
├── check_assets.js     素材自检（在不在 / 够不够方 / 体积超没超）
├── smoke_test.py       无头冒烟（Playwright + msedge）
├── extract-audio.py    从视频抽音轨 → mp3
├── make-bgm.mjs        BGM 截段 + 重编码
├── analyze-bgm.mjs     循环点分析

└── serve.mjs           本地预览服务器（node tools/serve.mjs → http://localhost:8123）
docs/ xiaohongshu/
```


## 自检

```bash
python tools/gen_prompts.py                          # 出图前：生成提示词包（写实 / 兵牌两套）
python tools/prep_units.py --src <原图目录> --dry    # 出图后：写实，先看匹配，再真跑落位
python tools/prep_units.py --kind gear --src <装备目录>   # 出图后：装备图 128×128 透明底
python tools/prep_units.py --kind card --src <兵牌目录>   # 出图后：兵牌 → assets/units/card/
python tools/prep_units.py --kind tex --src <过渡画面目录>  # 出图后：⑨ 过渡画面 → assets/tex/gate-<key>.webp
node tools/check_data.js      # 代码契约（含 hero 轮播 / 过渡画面按阵营取图契约）
node tools/check_assets.js    # 素材本身（含 ⑨ 过渡画面 9 张的在位与体积）
python tools/smoke_test.py    # 无头冒烟（含 hero 轮播 / 过渡画面取图与预热 / 装备拆解 / 过渡页阵营标题 / 雷达图随阵营换色 / 分享两处入口）
node ../../tools/build.mjs --pack    # 打 zip（产物 rome-total-war-3d.zip，index.html 在 zip 根）
# 按小红书小工具规范审计（.skill/minitool-zip-builder）：
node ../../.skill/minitool-zip-builder/scripts/audit_artifact.mjs .
node ../../.skill/minitool-zip-builder/scripts/audit_artifact.mjs ./rome-total-war-3d.zip
```

打包前另有一份规范静态扫描要点（已按 `.skill/minitool-zip-builder/references/zip-artifact-spec.md` 逐条核对并通过）：
脚本全部外置、无内联 `<script>` / 行内事件 / `eval`、无 `type="module"`、无外部 `http(s)` 引用、
无 `<base>` / `<iframe>` / 自建 CSP、资源全为相对路径且都在包内。

> ⚠️ **当前 zip 4.70 MiB**：未超 10 MiB 上传上限，但超出规范"建议 ≤2 MiB"。
> 大头是兵种图 1.77MB + 场景图 1.28MB + BGM 1.19MB + 地球（three.min.js 0.58MB + earth.jpg 0.49MB）。
> 要压到 2MB 只能砍 BGM 或砍 3D 地球，二者都要先确认取舍。

冒烟用 Playwright 驱动 msedge（`--use-angle=swiftshader`），视口 420×860，
覆盖五页全流程、兵种图定档（48 支一律写实，判据是**实际发出的请求**）、
已退役图位不再被请求、自选军团分支、雷达图与 BGM 链路，以及**分享的两条路**：
桌面（容器没注入端能力）两处入口必须都隐藏；再开一页注入 `window.xhs.miniTool` 桩，
走通「检阅页分享兵种原图 → 军团志分享卡片」的 `writeTempFile → postNote` 全链路。

> 本机（Windows）PATH 里的 `python` 是坏的 uv shim（会报 `No Python at ...`），别用它。
> 可用解释器：`C:\Users\dingj\.workbuddy\binaries\python\versions\3.14.3\python.exe`，
> 已装 **pillow**（`prep_units.py`）与 **playwright**（`smoke_test.py`，走系统 msedge 通道，
> 不需要下载浏览器）。调用示例：
>
> ```powershell
> & "C:\Users\dingj\.workbuddy\binaries\python\versions\3.14.3\python.exe" tools/gen_prompts.py
> ```
>
> 2026-09-23 已用这条路径跑通 `smoke_test.py`（86 项全过，含分享链路）。


## 兼容性

- 兼容基线 **Android 8.1 出场 Chrome / WebView 61（ES2017）**：
  JS 全部 ES5 写法（`var`、无箭头函数），CSS 走「基线层 + `@supports` 增强层」，
  flex gap 由 `flexgap.js` 能力检测后加 `.supports-flex-gap`。
- 装备图缺哪张，那一格就退成槽位名文字（头部 / 盾 / 主武器…），绝不留空框，流程照常。
- 首页 hero 轮播是**纯 CSS `@keyframes`**（Chrome 61 原生可用，无 JS 定时器）；
  `prefers-reduced-motion:reduce` 下停在第一张。
- 图片 / BGM 缺失一律回退，页面照常可用。
- 笔记分享走**能力检测**（拿不到 `window.xhs.miniTool.postNote` 即整块隐藏），
  分享卡片**只用 Canvas 图元与文字**绘制、不绘制任何位图；守则与实测口径见 §笔记分享。


## 物料状态

**代码完成 · BGM 已就位 · 素材齐备（剩两项待整改）。** 图位与提示词已备齐，见 `docs/` 七份文档
（`提示词包.md` 是 120 条可直接复制的成品提示词 —— 写实 ×48、装备 ×52、场景 ×20，
[`素材生成说明.md`](docs/素材生成说明.md) 给出图-落位流程）。

- **已落位**：兵种图 ×48（写实）、装备 ×52、场景图 ×20（含 ⑨ 过渡画面 ×9）、BGM。
- **已退役**（2026-09-22）：兵牌那套（`assets/units/card/`，Rome II 式半身像）——画风不合要求、
  效果也不行，罗马也不再特殊，48 支一律走写实；整组图已删除，规格留档在
  [`docs/兵种图片素材需求.md`](docs/兵种图片素材需求.md) §3.5–3.8。
- **待整改**（见 [`素材质量整改.md`](docs/素材质量整改.md)）：装备图 ×52 不是真透明底（文件里没有
  alpha 通道）；logo 要按新的**军牌式**规格重出（现版是纯白底、无描边）。
  （logo 与写实战象 ×3 + `numidian-cav` 已于 2026-09-22 重出落位，见 `assets/units` 与 `assets/tex`。）
- **发布阻塞项**：当前 BGM 是 SEGA / CA 商业原声，没有商用授权。

过渡页**已取消「穿门视频」**（2026-09-22）：包体吃不消——1.2 MB 才够一段 7 秒的 720p 片子；
改成**每个阵营一张过渡画面**，页面仍是「一帧 + 7.1 秒缓推」，但换阵营时画面真的会变。
首页 hero 是八大军团横幅轮播（8s 一格），阵营横幅一图两用。

过渡页的**「通用凯旋门」兜底 ③④⑤⑥ 已整组退役**（2026-09-22）：③⑤ 的图里画进了一台现代相机，
而它们排在画面链末层，只会在 `contain` 留出的上下信箱边里露出来——「上下空白处露出原来大门」
就是这么来的。⑨ 九张落位后它们已无位置，**整组图已从仓库删除**，画面链固定为
`⑨ gate-<key> → ⑧ faction-<key>`，信箱边由**同一张图的模糊铺底**填满。
设计变更的来龙去脉见 [`docs/场景配图需求.md`](docs/场景配图需求.md) 八、。

**3D 地球 2026-09-22 移除、2026-09-23 加回**：移除的原因是 `three.min.js` + `earth.jpg` +
`clouds.png` 占 1.34 MiB（当时整包的一半），那一格换成了**装备拆解**。加回时两者不再互斥——
地球占检阅页**顶部条带**（`--globem`，218px），装备拆解在**兵种图右列**，内容区整体**底部对齐**。
同时按新口径瘦身：**没有星空球、没有星星点云、没有云层**，画布是透明底（`alpha:true`），
背景由槽自己的暗青铜渐变提供，只留一个地球 + 征召地金点 + 底部一行「兵种名 / 经纬度」。
代价是 `three.min.js` 0.58MB + `earth.jpg` 0.49MB（可打包原始体积 4.55MB → 5.64MB）。

> ⚠️ **file:// 下用不上真实贴图**：双击打开时浏览器把同目录的 `earth.jpg` 判成跨源，
> 贴图会被「污染探测」拦下、自动退到程序化的**经纬网贴图**（不会白球，也不会崩）。
> 要看真实贴图走 http：`node tools/serve.mjs` → `http://localhost:8123`。

BGM 用的是《Total War: Rome II — Main Menu》的 8.50–125.53s 乐句（117s，
波形互相关 1.000，接缝基本听不出），64kbps 单声道 22.05kHz，解码后 0.893 MiB。

> ⚠️ **发布阻塞项**：这是 SEGA / Creative Assembly 的商业原声，**未取得商用授权**，
> 目前只能本地自测。公开发布前换曲即可，代码不用改——
> 重跑 `tools/extract-audio.py` → `analyze-bgm.mjs` → `make-bgm.mjs` 三条命令。
> 留档见 `assets/audio/README.md`。


## 许可证

[MIT](../../LICENSE)

## 设计细节

玩法、数值、素材与界面等实现细节见 [`DESIGN.md`](DESIGN.md)。
