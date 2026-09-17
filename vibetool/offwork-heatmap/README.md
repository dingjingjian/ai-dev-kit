# 今天我准时下班了吗？

> 分类：`#vibetool` 实用工具　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

下班打卡小应用：下班时点一下「准时下班」或「加班了」，用 GitHub 代码提交热力图的方式回看每一天——绿色是准时，红色是加班。不记具体时间，只关心准不准时。已适配小红书小工具容器，可打包成 zip 上传。

## 功能

- **一键打卡**：下班时点「准时下班」或「加班了」即可，点另一个＝改判，重复点同一按钮不会再清除记录；点错了用今日卡片下方的「撤销今天的打卡」。
- **GitHub 式热力图**：近 26 周逐日格子，颜色即状态——灰＝未打卡，绿＝准时下班，红＝加班。
- **左右翻页**：一屏放不下 26 周时，标题右侧出现 ‹ › 翻页按钮，一次翻一屏（留一列作上下文），到两端自动置灰；滚动条隐藏、两侧渐隐提示还有内容，星期标签固定在左侧不随翻页滑动；屏够宽放得下时按钮自动隐藏。
- **统计面板**：连续准时下班天数、本月准时率、本月打卡天数、本月加班天数（2×2 四格）。
- **改历史**：点热力图任意格子，选「准时下班 / 加班了 / 清除记录」。
- **不记具体时间**：没有时间输入，也不需要设置标准上下班时间——只回答一个问题：今天准不准时。
- **不分工作日 / 休息日**：不维护节假日表，任何一天打卡都算数——调休补班、周末加班天然正确，放长假不打卡也不影响统计。
- **多套主题**：设置里可在「跟随系统 / 深夜 / 明亮 / 暖阳纸张 / 薄荷」间切换，「跟随系统」会随手机的深色 / 浅色模式自动变；选择只存本机，下次打开自动沿用。
- **数据自管**：全部存于本机 `localStorage`，支持导出 / 导入 JSON 备份、一键清空。

## 使用

- **浏览器**：直接打开 `index.html` 即可（手机端优先，桌面端居中 480px 竖屏）。
- **小红书小工具**：运行 `_dev/build_zip.py` 打包成 `offwork-heatmap.zip`（`index.html` 在 zip 根目录）后上传。

## 文件结构

```
offwork-heatmap/
├── index.html              # 页面结构 + 样式（脚本外置以满足容器 CSP）
├── main.js                 # 全部交互逻辑（经典脚本，ES2017）
├── icon.png                # 应用图标 2048×2048（_dev/make_icon.py 生成）
├── offwork-heatmap.zip     # 打包产物（_dev/build_zip.py 生成）
├── _dev/
│   ├── build_zip.py        # 前置校验 + 打包 zip
│   └── make_icon.py        # 生成应用图标
├── xiaohongshu/            # 小红书参赛素材
│   └── 小红书笔记文案.md
└── README.md
```

## 工程约定

| 项 | 说明 |
|----|------|
| 源码 | `index.html`（内联 CSS）+ `main.js`（交互逻辑，经典脚本） |
| 打包 | `_dev/build_zip.py`，前置校验（11 项合规检查）+ 打包 zip（产物 `offwork-heatmap.zip`） |
| 图标 | `_dev/make_icon.py` 生成 `icon.png`（2048×2048，需 Pillow） |
| 体积 | 13.9 KB，远小于 2MB 建议值 |
| 改动顺序 | 一律直接改根目录 `index.html` / `main.js`，重跑 `build_zip.py` 刷新 `dist/` 与 zip，不要手改 `dist/` |
| Python 环境 | 用仓库 `xhs-venv` 虚拟环境（含 Pillow）：`C:/Users/ASUS/xhs-venv/Scripts/python.exe` |

## 构建命令

```bash
python _dev/make_icon.py    # 生成 / 刷新应用图标（需 Pillow）
python _dev/build_zip.py    # 前置校验 + 打包 zip
```

## 应用上架信息

| 项 | 内容 |
|----|------|
| 应用名称 | 准时下班热力图（6 字，≤14） |
| 应用介绍 | 上下班打卡热力图（8 字，≤14） |
| 应用图标 | `icon.png`（1:1，2048×2048） |

## 小工具容器适配

- **脚本外置**：容器 CSP 禁止内联 `<script>`，JS 全部在 `main.js` 内用 `<script src>` 引入，事件用 `addEventListener` 绑定。
- **顶部留白**：小红书容器里 `env(safe-area-inset-top)` 恒为 0，顶栏会直接顶在屏幕最上沿、被宿主自带按钮压住，故在安全区之上再叠加一条显式常量 `--top-gap: 50px`（与 `perler-city` / `ai-os` 同款机制，无条件保留，不做环境检测）；底部弹层 / Toast 补 `safe-area-inset-bottom`，左右补 `safe-area-inset-left/right`，配合 `viewport-fit=cover`，PC 模拟器注入变量与真机 `env()` 组合生效。
- **导出 / 导入**：容器禁止 `a[download]` 下载与剪贴板 API，`<input type=file>` 在容器内只能选图片/视频。故导出改为在页内弹层用 textarea 展示 JSON 文本（长按全选复制），导入改为粘贴 JSON 文本后确认。
- **不用原生对话框**：容器 iframe 未开 `allow-modals` 时 `confirm()` 不弹窗、静默返回 false，表现就是「点了没反应」；「清空数据」改为独立的页内确认框（写明将删除多少条，取消则退回设置面板），不用「再点一次」那种轻确认。
- **不可用能力已移除**：无网络请求、无 Worker、无 eval、无 iframe、无外链资源。

## 技术说明

- 零依赖、零构建、离线可用。
- 兼容性基线 Chrome 61 / ES2017：JS 仅用 `var` / `function` 等 ES5 风格语法；CSS 毛玻璃等仅作 `@supports` 增强层，Flex 间距用 margin 基线，安全区用 `var(--safe-area-inset-*, env(...))` 组合并保留静态兜底，视口高度经 JS 维护 `--app-height` 并保留 `100vh` 兜底。Chrome 61 实机兼容性未实测。
- 存储 key：`owt_records_v2`，形如 `{ 'YYYY-MM-DD': { ok: true|false } }`（`ok` 即「今天准时下班」）。
- 主题：配色全部走 CSS 变量（`:root` 为默认「深夜」，其余主题在 `html[data-theme="..."]` 里整组覆盖，样式规则不写死颜色）；`main.js` 把当前模式存 `owt_theme_v1`（`auto|dark|light|sepia|mint`，缺省 `dark`）并写到 `<html data-theme>`，同时同步 `<meta name="theme-color">`。`auto` 用 `prefers-color-scheme` 解析成 `dark`/`light`，老内核两个媒体查询都不匹配时退回「深夜」。
- 旧数据自动迁移：首次打开若只有 v1（`owt_records_v1`，记上下班时间），按 v1 里存的标准下班 + 宽限折算成「准时 / 加班」写入 v2（v1 无设置时以 18:00 判定），只打了上班卡的日期不迁移。旧版导出的备份 JSON 也可直接导入。
- 不区分工作日 / 休息日：代码里没有节假日表，任何一天打卡都一视同仁。「连续准时」按打卡记录往前连续计算（遇到「加班」记录即中断），没打卡的日子自动跳过 —— 放假不打断，调休上班、周末加班也不会算错。
