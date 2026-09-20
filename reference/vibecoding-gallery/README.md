# vibecoding-gallery · vibecoding 优秀作品展

> 分类：**非参赛作品**。它是浏览 [`reference/`](../README.md) 归档的**展示 / 浏览工具**，本身并不投放到小红书 vibecoding 大赛，
> 因此不占 `vibetool/`、`vibegame/`、`vibeart/`、`vibeknow/` 四个赛道目录，也不计入 TRACKS.md 的赛道清单。
>
> 位置：`reference/vibecoding-gallery/`——与它要展示的归档数据放在一起，便于截图更新后直接重跑构建。

把 [`reference/`](../README.md) 归档的 17 件小红书 vibecoding 大赛优秀作品，做成**复刻小红书信息流形态**的展示小工具：双列瀑布流 + 笔记详情页 + 扭蛋机「随机邂逅」彩蛋。用小红书自己的产品形态逛小红书上的 vibecoding 作品，形式与内容同构。

## 功能

- **品牌头部**：渐变 logo + 渐变标题，作品/创作者计数
- **双列瀑布流**：小红书式卡片（封面比例盒 + 底部渐变遮罩、毛玻璃赛道角标、描边头像、两行标题截断），按累计高度分列，卡片入场 stagger 动效 + 按压缩放反馈
- **精细化菜单**：全部 / 游戏 / 工具 / 国风 / 已赞 五个 SVG 图标胶囊（渐变激活态 + 计数徽章），与搜索行一起玻璃吸顶
- **搜索**：按作品名 / 博主 / 简介即时过滤，聚焦态高亮
- **双击点赞**：复刻小红书双击大爱心动画，点赞状态存 `localStorage`，「已赞」筛选实时联动
- **笔记详情页**：右滑入，封面大图 + 作者信息卡 + 引言块 + 渐变编号亮点列表 + 原笔记完整链接（含 `xsec_token`），点「复制链接」按钮全选链接后长按手动复制
- **去原笔记看看**：容器内调 `window.xhs.miniTool.openRedPage({ type: 'note', params: { note_id } })`，容器不存在或失败时回退 toast 提示复制链接
- **随机邂逅彩蛋**：CSS 扭蛋机，摇动 → 出球 → 弹出随机作品迷你卡，Fisher-Yates 洗牌队列保证一轮不重复
- **图片加载**：每次渲染后直接加载「视口内 + 预载带（上下 420px）」的封面，滚动 / 缩放时节流补查——**不依赖 `IntersectionObserver`**（容器 webview 里搜索重建 DOM 后 IO 可能不再回调，导致图片一直空白），缩放淡入过渡保留

## 目录结构

```
reference/vibecoding-gallery/
├── index.html            # 入口 + 全部样式（内联 <style>）
├── main.js               # 数据（17 件作品 + 完整链接）+ 全部逻辑
├── covers-data.js        # 封面尺寸表（由 _dev/make_covers.py 生成）
├── covers/               # 17 张压缩封面（540px 宽 JPEG）
├── icon.png              # 上传图标（不进 zip）
├── vibecoding-gallery.zip # 打包产物（约 800KB）
├── dist/                 # zip 源（index.html + main.js + covers-data.js + covers/）
└── _dev/
    ├── works_raw.json    # 17 份归档 README 的原始提取数据
    ├── make_covers.py    # 从 reference/ 压缩生成 covers/ + covers-data.js
    ├── make_icon.py      # 生成 icon.png
    └── build_zip.py      # 前置校验（16 项）→ 构建 dist → 打包
```

## 构建与打包

```bash
python _dev/make_covers.py   # reference 截图变化后重跑：自动取各目录最新图片（jpg/png/webp），同步生成尺寸表
python _dev/make_icon.py
python _dev/build_zip.py     # 校验 + 打包 vibecoding-gallery.zip
```

- **截图更新流程**：直接替换 `reference/<dir>/screenshots/` 里的图（文件名不限，脚本取最新一张），重跑 `make_covers.py` 即可——封面与瀑布流比例自动更新，无需改 `main.js`。
- **新增作品**：在 `reference/` 按规范归档后，`make_covers.py` 的 `ORDER` 追加目录名，重跑生成封面，再在 `main.js` 的 `WORKS` 追加一条（`cover` / `noteId` / `link` 从脚本输出与归档 README 取）。
- **链接（不得动参数）**：`WORKS[].link` 必须用归档 README 里的**完整原文链接**（含 `xsec_token` 等全部查询参数），去掉参数站外打不开。`build_zip.py` 会把 17 条链接与归档原始数据 `_dev/works_raw.json` **逐字比对**，任何截断 / 改动都会直接拒绝打包；页面展示与复制也都原样输出，不做裁剪。
- **分享令牌（xsec_token）**：17 条里 `xianhua-moon-letter` **仍未取到** `xsec_token`（站外打不开），链接原样保留、详情页标注「未取到分享令牌」，拿到分享链接后同步补进该作品 README、`works_raw.json`、`main.js`；其余 16 条已带完整参数。`build_zip.py` 每次打包都会点名提醒缺令牌的条目。

## 兼容性与约束

- 按 `.skill/minitool-zip-builder` 规范构建：经典外置脚本、ES2017、Chrome 61 CSS 基线（比例盒代替 `aspect-ratio`、margin 代替 flex `gap`、`backdrop-filter` / 渐变文字 / `:focus-within` 仅作 `@supports` 或向前兼容增强）、`var(--safe-area-inset-*, env(...))` 安全区组合、`viewport-fit=cover`
- 安全区统一收在 `:root` 的 `--safe-top` / `--safe-bottom`（与 `vehicle-atlas` / `echarts-gallery` 同款 token 写法）：顶部安全距离由**吸顶容器自己承担**（滑到顶时搜索行不会被状态栏 / 宿主按钮压住），详情页返回键同步避让，底栏高度按「60px + 手势条」计算
- 复制链接与 `vehicle-atlas` 的提示词复制同款：容器禁用剪贴板 API，故只做「点按全选文本 + 提示长按手动复制」，不调用任何剪贴板接口
- 已跑 `audit_artifact.py`（dist 与 zip 均 PASS 0 警告）；zip 约 800KB（上限 10MB、建议 ≤2MB）
- **Chrome 61 / Android 8.1 真机兼容性未实测**；`openRedPage` 的 `note_id` 参数名以容器规则表为准，无法本地验证，已做失败回退
- 作品截图与简介版权归原博主所有，本工具仅作学习归档展示

## 数据来源

全部 17 件作品的博主、链接、简介、亮点提炼自 [`reference/`](../../reference/README.md) 各子目录 `README.md`；赛道归属：官方话题标签优先，无标签的按内容归类（烟花秀→工具、科目二→游戏）。
