# 今天我准时下班了吗？

> 分类：`#vibetool` 实用工具　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

上下班打卡小应用：一键记录每日上下班时间，用 GitHub 代码提交热力图的方式回看每一天——绿色是准时，红得越深加班越久。已适配小红书小工具容器，可打包成 zip 上传。

## 功能

- **一键打卡**：上班 / 下班各一下，重复点击可更新为当前时间；支持补记、修改任意历史日期（点热力图格子）。
- **GitHub 式热力图**：近 26 周逐日格子，颜色即状态——
  - 灰：未打卡；蓝：只打了上班卡（缺下班卡）
  - 深绿：提前 ≥15 分钟走；亮绿：准时下班
  - 黄 → 橙 → 红 → 深红：加班 <30 分钟 / <1 小时 / <2 小时 / 2 小时以上
- **统计面板**：连续准时天数、本月准时率、本月平均下班时间、本月累计加班时长。
- **判定口径可配**：标准上下班时间 + 宽限分钟数（默认 09:00 / 18:00 / 0 分钟）。
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
| 体积 | 9.3 KB，远小于 2MB 建议值 |
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
- **安全区**：顶栏吸顶并补 `safe-area-inset-top`，底部弹层 / Toast 补 `safe-area-inset-bottom`，左右补 `safe-area-inset-left/right`，配合 `viewport-fit=cover`；PC 模拟器注入变量与真机 `env()` 组合生效。
- **导出 / 导入**：容器禁止 `a[download]` 下载与剪贴板 API，`<input type=file>` 在容器内只能选图片/视频。故导出改为在页内弹层用 textarea 展示 JSON 文本（长按全选复制），导入改为粘贴 JSON 文本后确认。
- **不可用能力已移除**：无网络请求、无 Worker、无 eval、无 iframe、无外链资源。

## 技术说明

- 零依赖、零构建、离线可用。
- 兼容性基线 Chrome 61 / ES2017：JS 仅用 `var` / `function` 等 ES5 风格语法；CSS 毛玻璃等仅作 `@supports` 增强层，Flex 间距用 margin 基线，安全区用 `var(--safe-area-inset-*, env(...))` 组合并保留静态兜底，视口高度经 JS 维护 `--app-height` 并保留 `100vh` 兜底。Chrome 61 实机兼容性未实测。
- 存储 key：`owt_records_v1` / `owt_settings_v1`。
- 「准时」判定：下班时间 ≤ 标准下班 + 宽限；「连续准时」仅按工作日（周一至周五）累计，当天未打下班卡不会断连。
