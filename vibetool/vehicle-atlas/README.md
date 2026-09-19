# 全球交通工具图鉴 · Vehicle Atlas

> **分类**：`#vibetool` 实用工具　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

移动端优先的全球交通史速查图鉴：收录 **49 种交通工具「类型」**，按 **地面 / 水面 / 天空 / 太空** 四类分组，每个分类内按出现时间从早到晚排列，串成一部从公元前 3000 年到今天的简明交通工具史。每种给出中英文名、时间跨度、一句话特点、介绍、关键参数、亮点与 AI 配图提示词。纯前端零依赖、离线可用，已适配小红书小工具容器。

**收录口径**：只讲类型，不写具体型号与品牌（如写「集装箱船」而不是某一艘船、写「高速列车」而不是某一型车）。这样每个条目描述的是**一类事物的共性**，配图也只画类型的典型样貌，不会出现「图与型号对不上」的问题。

参考：[`vibetool/uiux-style-gallery`](../uiux-style-gallery/)（设计风格图鉴）与 [`vibetool/echarts-gallery`](../echarts-gallery/)（图表图鉴），沿用同一套「列表 + 分类 tab + hash 路由详情页」框架，把纯 CSS demo 换成真实交通工具的配图。

## 打开方式

双击 `index.html`，或打包后上传小红书小工具。

## 功能

- **列表页**：四类分组，每组顶部为分类封面图，下面为该类的条目卡片（配图 + 时代徽标 + 中文名 + 英文名 + 一句话特点）。
- **分类筛选**：顶栏 tab 用 2 字短名（全部 / 地面 / 水面 / 天空 / 太空），360px 屏下单行放下，不做横向滚动。
- **时代线索**：卡片图片左上角只标**起始时间**（如「公元前 3000 年」「1959 年」），详情页给完整跨度（如「1804 年 — 20 世纪中」），一眼看出这条类型在历史中的位置。
- **详情页**：配图大图、分类与时代徽标、介绍、关键参数（2 列）、亮点清单、AI 配图提示词（点按可全选、长按手动复制）与配图文件路径。
- **配图占位**：图片未就位时显示虚线占位块（分类图标 + 条目名），补图不需要改一行代码。
- **路由**：hash 路由（`#/` 列表、`#/v/<id>` 详情），适配容器无跳转限制。
- **返回原位**：从详情返回列表时回到离开时的滚动位置与分类，不用从头再翻。
- **移动端优先**：竖屏单列（窄屏以上两列）、大字号、安全区适配、触摸友好。

## 收录的 49 种类型

| 分类 | 数量 | 条目（按出现时间排列） |
|------|------|------|
| 地面交通 | 14 | 畜力车、自行车、摩托车、家用汽车、公共汽车、卡车、拖拉机、蒸汽机车、电力机车、内燃机车、高速列车、城市轨道交通、缆索铁路与索道、雪地摩托 |
| 水面交通 | 13 | 独木舟与皮划艇、桨帆船、帆船、蒸汽轮船、渡轮、邮轮、集装箱船、散货船、油轮、渔船、破冰船、潜艇、气垫船 |
| 天空交通 | 12 | 热气球、飞艇、滑翔机、螺旋桨飞机、直升机、喷气式客机、水上飞机、通用航空飞机、超音速飞机、无人机、倾转旋翼机、电动垂直起降飞行器 |
| 太空交通 | 10 | 运载火箭、人造卫星、空间探测器、载人飞船、登月着陆器、空间站、货运飞船、航天飞机、行星漫游车、可重复使用运载器 |

> 参数与时间取自公开资料并做了取整与概括（如「约 60–120 km/h」「20 世纪初」），用于速查与科普；类型级别的数据本身跨度很大，条目内一律用区间或定性描述，正式发布前建议逐条复核一遍。

## 配图协议（图片由图像生成 agent 接手）

1. **规格**：条目图 `assets/img/<条目 id>.webp` 640×360；分类封面 `assets/img/cover-<分类 key>.webp` 960×540。尺寸、体积、构图与禁用项的细则统一写在 [`_dev/image-spec.md`](_dev/image-spec.md)（唯一真源，生成时自动嵌入施工图）：页面按 `object-fit: cover` 裁切，条目图进卡片约 2.39:1、封面约 3.44:1。
2. **提示词施工图**：逐张提示词见 [`_dev/IMAGE_PROMPTS.md`](_dev/IMAGE_PROMPTS.md)（另有机器可读的 [`_dev/image-prompts.json`](_dev/image-prompts.json)）。该清单由 `python _dev/gen_image_prompts.py` **从 `main.js` 自动派生**，数据只维护一遍，不会出现「页面一套、清单又一套」。
3. **拼接口径**：完整提示词 = `main.js` 里的 `IMG_STYLE`（统一风格串）+ 空格 + 条目的 `subject`（主体描述）。详情页展示的也正是这条拼好的提示词。
4. **型号只用于生图**：`subject` 会写**具体型号**（中国有代表型号的优先用中国原型）以提高造型准确度，但这些型号**不进入页面**、也**不得出现在画面里**；`IMG_STYLE` 统一要求 `no visible branding, badges, model names, lettering, logos or watermarks`，画面内不得出现品牌名、文字、字母、logo、水印与人物。
5. **投入即生效**：图片按名放入 `assets/img/` 即可，页面无任何改动；后缀回退链为 `webp → jpg → jpeg → png`，全部找不到才显示占位块。
6. **体积**：条目图 ≤45 KB、封面 ≤90 KB、全部配图合计 ≤1.8 MB（zip 建议 ≤2 MB）。`build_zip.py` 会在打包时统计并提示。

## 工程约定

| 项 | 说明 |
|----|------|
| 源码 | `index.html`（内联 CSS）+ `main.js`（数据 + 渲染逻辑，经典脚本） |
| 数据真源 | `main.js` 的 `CATS`（分类）、`VEHICLES`（条目）、`IMG_STYLE`（配图风格串）；配图交付要求见 `_dev/image-spec.md`；提示词清单由脚本派生 |
| 条目字段 | `id / cat / name / en / era / tag / intro / specs[[k,v]] / feats[] / subject`；图片路径由 `id` 与 `cat` 推出，不额外存路径 |
| `era` 字段 | 时间跨度，形如 `"1804 年 — 20 世纪中"`。卡片取「—」前的起始段，详情页显示全文 |
| 分类 tab | 短名 2 字（`CATS[].tabZh`）+ `flex-wrap` 换行，**禁止**在吸顶栏里做横向滚动容器（低端 Android 上吸顶栏会渲染残缺，且右侧 tab 点不到）；`tabKey` 相同的分类共用一个 tab（当前四类各占一个，合并逻辑为将来细分预留） |
| 排序约定 | 同一 `cat` 内条目**必须按出现时间从早到晚**排列，这是「全球交通史」这条主线的呈现方式 |
| 图片框 | 固定高度（卡片 150 / 封面 104 / hero 210）而非 `aspect-ratio`（Chrome 61 不支持）；实图 `object-fit:cover` 盖在占位块上；时代徽标 `.shot-era` 的 `z-index` 高于实图层 |
| 间距基线 | Chrome <84 无 flex gap（基线 Chrome 61），横向间距一律用子项 `margin`（见 `index.html` 的「Flex 间距基线」块） |
| 懒加载 | `IntersectionObserver`（Chrome 51+）就近加载图片，无该 API 时降级为立即加载；顶栏毛玻璃用 `@supports` 作增强层，基线为不透明底 |
| 主题色 | 进入详情页时按分类把 `--accent / --accent-soft` 写到根元素，返回列表时移除 |
| 自检 | `_dev/shot_check.py`：16 项渲染断言（分组与每类条目数 / tab 单行 / 占位块文案 / 图片框高度 / 时代徽标 / 详情区块 / 提示词拼接 / 返回原位 / 分类筛选 / 无 JS 报错） |
| 打包 | `_dev/build_zip.py`，18 项前置校验 + **只收录被 `main.js` 引用的配图**（历史遗留图不进包）+ 打包 zip（产物 `vehicle-atlas.zip`） |
| 体积 | 源码 zip 约 25 KB（仅 `index.html` + `main.js`），配图就位后随图片增长，仍远低于 2 MB 建议值 |
| 改动顺序 | 一律直接改根目录 `index.html` / `main.js`，重跑 `gen_image_prompts.py` 与 `build_zip.py` 刷新清单 / `dist/` / zip，不要手改 `dist/` |
| 历史素材 | 改版前的「具体型号版」配图归档在 `_dev/_legacy_img/`（含 `raw/` 原始 PNG），不参与打包，确认无用后可整目录删除 |

## 构建命令

```bash
python _dev/gen_image_prompts.py   # 从 main.js 派生 _dev/IMAGE_PROMPTS.md + image-prompts.json
python _dev/shot_check.py          # 渲染自检（16 项）+ 截图到 _dev/_shots/
python _dev/process_images.py      # 把 _dev/raw_img/*.png 批量转成 assets/img/*.webp（尺寸 / 体积达标）
python _dev/build_zip.py           # 前置校验 + 配图盘点 + 打包 zip
python _dev/make_icon.py           # 生成 icon.png（2048×2048）

# 规范审计（skill 自带脚本，任选其一，本仓库两者均可用）
node ../../.skill/minitool-zip-builder/scripts/audit_artifact.mjs ./dist
python ../../.skill/minitool-zip-builder/scripts/audit_artifact.py ./vehicle-atlas.zip
```

## 应用上架信息

| 项 | 内容 |
|----|------|
| 应用名称 | 全球交通工具图鉴（8 字，≤14） |
| 应用介绍 | 49 种交通工具速查（9 字，≤14） |
| 应用图标 | `icon.png`（1:1，2048×2048） |

## 小红书小工具适配

- 脚本外置 `main.js`，无内联 `<script>`、无内联事件、无 `eval` / `new Function`，为经典脚本（无 `type="module"` / `import` / `export`）。
- 无任何 http(s) 外部资源引用，全部配图打包在内，离线可用。
- 安全区用 `var(--safe-area-inset-*, env(...))` 组合适配刘海屏；`viewport-fit=cover`。
- 不使用 UA 判定宿主，不使用 WebSocket / Worker / geolocation / 剪贴板等被禁能力。
- 复制 AI 提示词：容器已禁用剪贴板类 API，改为点按后选中提示词文本，引导用户长按手动复制。
- JS 以 ES2017 为基线（Chrome 61），未使用可选链、对象展开、`replaceAll`、`Array.at` 等更新语法；`IntersectionObserver` 等非基础 API 均做能力检测与降级。
- CSS 以 Chrome 61 为基线，未使用 `aspect-ratio`、`clamp()`、逻辑属性、`:has()`、Container Queries、现代颜色函数；`backdrop-filter` 仅作 `@supports` 增强层。

> 兼容性状态：已在 Chromium（桌面内核）390×844 视口完成渲染自检；**Chrome 61 / Android 8.1 真机兼容性未实测**，交付前须按 `.skill/minitool-zip-builder/references/` 的 JS / CSS 自检清单在目标内核复核。
>
> 配图状态：53 张已就位（4 张分类封面 + 49 张条目图），合计约 0.55 MB，打包 zip 约 592 KB。页面无占位块残留；主体过高的竖高条目（热气球 / 运载火箭 / 可重复使用运载器等）与 4 张封面在卡片裁切下仍需按 `_dev/image-spec.md` 逐张复核构图。
