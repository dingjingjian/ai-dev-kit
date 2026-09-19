# 全球交通工具图鉴 · Vehicle Atlas

> **分类**：`#vibetool` 实用工具　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

移动端优先的全球交通工具速查图鉴：收录 48 台**现役**、有特点的交通工具，按汽车 / 卡车、火车、飞机、轮船 · 客运、轮船 · 货运、其他六类分组。每台给出中英文名、一句话特点、介绍、关键参数、亮点与 AI 配图提示词。纯前端零依赖、离线可用，已适配小红书小工具容器。

参考：[`vibetool/uiux-style-gallery`](../uiux-style-gallery/)（设计风格图鉴）与 [`vibetool/echarts-gallery`](../echarts-gallery/)（图表图鉴），沿用同一套「列表 + 分类 tab + hash 路由详情页」框架，把纯 CSS demo 换成真实交通工具的配图。

## 打开方式

双击 `index.html`，或打包后上传小红书小工具。

## 功能

- **列表页**：六类分组，每组顶部为分类封面图，下面为该类的条目卡片（配图 + 中文名 + 英文名 + 一句话特点）。
- **分类筛选**：顶栏 tab 用 2 字短名（全部 / 汽车 / 火车 / 飞机 / 轮船 / 其他）+ 自动换行，360px 屏下单行放下 6 个，不做横向滚动；「轮船」一个 tab 合并客运与货运两个分组。
- **详情页**：配图大图、分类徽标、介绍、关键参数（2 列）、亮点清单、AI 配图提示词（点按可全选、长按手动复制）与配图文件路径。
- **配图占位**：图片未就位时显示虚线占位块，块内直接写明**期望的文件名**，补图不需要改一行代码。
- **路由**：hash 路由（`#/` 列表、`#/v/<id>` 详情），适配容器无跳转限制。
- **返回原位**：从详情返回列表时回到离开时的滚动位置与分类，不用从头再翻。
- **移动端优先**：竖屏单列（窄屏以上两列）、大字号、安全区适配、触摸友好。

## 收录的 48 台

| 类别 | 数量 | 条目 |
|------|------|------|
| 汽车 / 卡车 | 8 | 丰田卡罗拉、大众高尔夫、福特 F-150、特斯拉 Model 3、丰田海拉克斯、奔驰乌尼莫克、斯堪尼亚 S 系列、沃尔沃 FH16 |
| 火车 | 8 | 新干线 N700S、复兴号 CR400AF/BF、TGV Duplex、ICE 4、欧洲之星 e320、SBB Re 460、印度 Vande Bharat、迪拜地铁 7000 系 |
| 飞机 | 8 | 空客 A380、波音 747-8、空客 A350-1000、波音 787-9、中国商飞 C919、空客 A320neo、波音 777-300ER、安托诺夫 An-124 |
| 轮船 · 客运 | 8 | 海洋标志号、海洋交响号、玛丽皇后二号、爱达·魔都号、迪士尼愿望号、MSC 欧罗巴号、全球号、塔林客 Megastar |
| 轮船 · 货运 | 8 | MSC Irina、长荣 Ever Ace、HMM Algeciras、CMA CGM Jacques Saadé、中远海运宇宙号、Prelude FLNG、Höegh Aurora、Christophe de Margerie |
| 其他 | 8 | 上海磁浮列车、重庆单轨 2 号线、空客 H145、齐柏林 NT 飞艇、Ski-Doo 雪地摩托、香港山顶缆车、22220 型核动力破冰船、SpaceX 载人龙飞船 |

> 参数取自公开资料并做了取整（如「约 190 km/h」），用于速查与科普；标注口径变化（如停产后仍现役运营、试运行与商业运营）已在条目内说明。正式发布前建议逐条复核一遍。

## 配图协议（图片由图像生成 agent 接手）

1. **规格**：条目图 `assets/img/<条目 id>.webp` 640×360；分类封面 `assets/img/cover-<分类 key>.webp` 960×540。均为 16:9 横构图，主体水平 + 垂直居中、上下留 ≥20% 余量（卡片按约 2.2:1 裁切）。
2. **提示词施工图**：逐张提示词见 [`_dev/IMAGE_PROMPTS.md`](_dev/IMAGE_PROMPTS.md)（另有机器可读的 [`_dev/image-prompts.json`](_dev/image-prompts.json)）。该清单由 `python _dev/gen_image_prompts.py` **从 `main.js` 自动派生**，数据只维护一遍，不会出现「页面一套、清单又一套」。
3. **拼接口径**：完整提示词 = `main.js` 里的 `IMG_STYLE`（统一风格串）+ 空格 + 条目的 `subject`（主体描述）。详情页展示的也正是这条拼好的提示词。
4. **投入即生效**：图片按名放入 `assets/img/` 即可，页面无任何改动；后缀回退链为 `webp → jpg → jpeg → png`，全部找不到才显示占位块。
5. **体积**：条目图 ≤45 KB、封面 ≤90 KB、全部配图合计 ≤1.8 MB（zip 建议 ≤2 MB）。`build_zip.py` 会在打包时统计并提示。

## 工程约定

| 项 | 说明 |
|----|------|
| 源码 | `index.html`（内联 CSS）+ `main.js`（数据 + 渲染逻辑，经典脚本） |
| 数据真源 | `main.js` 的 `CATS`（分类）、`VEHICLES`（条目）、`IMG_STYLE`（配图风格串）；提示词清单由脚本派生 |
| 条目字段 | `id / cat / name / en / tag / intro / specs[[k,v]] / feats[] / subject`；图片路径由 `id` 与 `cat` 推出，不额外存路径 |
| 分类 tab | 短名 2 字（`CATS[].tabZh`）+ `flex-wrap` 换行，**禁止**在吸顶栏里做横向滚动容器（低端 Android 上吸顶栏会渲染残缺，且右侧 tab 点不到）；`tabKey` 相同的分类共用一个 tab |
| 图片框 | 固定高度（卡片 150 / 封面 104 / hero 210）而非 `aspect-ratio`（Chrome 61 不支持）；实图 `object-fit:cover` 盖在占位块上 |
| 间距基线 | Chrome <84 无 flex gap（基线 Chrome 61），横向间距一律用子项 `margin`（见 `index.html` 的「Flex 间距基线」块） |
| 懒加载 | `IntersectionObserver`（Chrome 51+）就近加载图片，无该 API 时降级为立即加载；顶栏毛玻璃用 `@supports` 作增强层，基线为不透明底 |
| 主题色 | 进入详情页时按分类把 `--accent / --accent-soft` 写到根元素，返回列表时移除 |
| 自检 | `_dev/shot_check.py`：13 项渲染断言（分组 / tab 单行 / 占位块文案 / 图片框高度 / 详情区块 / 返回原位 / 分类合并 / 无 JS 报错） |
| 打包 | `_dev/build_zip.py`，18 项前置校验 + 打包 zip（产物 `vehicle-atlas.zip`） |
| 体积 | zip 约 24 KB（仅 `index.html` + `main.js`），配图就位后随图片增长，仍远低于 2 MB 建议值 |
| 改动顺序 | 一律直接改根目录 `index.html` / `main.js`，重跑 `gen_image_prompts.py` 与 `build_zip.py` 刷新清单 / `dist/` / zip，不要手改 `dist/` |

## 构建命令

```bash
python _dev/gen_image_prompts.py   # 从 main.js 派生 _dev/IMAGE_PROMPTS.md + image-prompts.json
python _dev/shot_check.py          # 渲染自检（13 项）+ 截图到 _dev/_shots/
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
| 应用介绍 | 48种交通工具速查（10 字，≤14） |
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
