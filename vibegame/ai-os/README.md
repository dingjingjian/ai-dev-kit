# 人工智能 OS - AI OS

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

一个移动端「人工智能操作系统」桌面模拟：打开即是手机主屏——居中状态栏、壁纸、应用图标、Dock、底部三大金刚键（返回 / 主页 / 多任务），点开即可体验一套以 AI 为核心操作系统界面。套着「操作系统」外壳，内核为互动玩法（用户点开的第一动机是「玩」），故归 `#vibegame`。

**设计规范与设定唯一真源见 [`DESIGN.md`](DESIGN.md)**：容器顶部留白与左右净空、底部金刚键导航、真机视觉语言、Chrome 61 / ES2017 兼容基线、分期计划都以它为准。

## 打开方式

双击 `index.html` 即可打开；本地静态服务器（如 `python -m http.server`）下移动端体验最佳。无外部 CDN 依赖、无运行时构建。

## 技术构成

- **单源工程**：`_dev/build.py` 为唯一真源，产出根目录 `index.html`（内联 CSS）与 `main.js`；改 UI 只改 `build.py` 后重跑。
- **逻辑**：vanilla JS，直接按 ES2017 / Chrome 61 基线书写（无 `?.` / `??` / object spread 等超基线语法）。
- **样式**：Chrome 61 基线层 + `@supports` 增强层（毛玻璃等），不维护两套样式表；Flex 间距用 margin、Grid 间距用 `grid-gap`。
- **容器适配**：`--top-gap` 显式顶部留白 + `var(--safe-area-inset-*, env(...))` 组合；`body.in-app` 注入左右净空（`--safe-l/--safe-r`），净空内不放任何按钮；导航全部收到底部三大金刚键。
- **自检**：`_dev/smoke_test.py`（playwright 无头）断言导航栈 / 安全区 / 顶部净空，并扫描 JS/CSS 超基线语法；回归截图输出到 `_dev/_shots/`（临时，不入库）。

```bash
# 构建
python _dev/build.py
# 无头自检 + 截图回归
PYTHONUTF8=1 python _dev/smoke_test.py
```

## 目录

| 路径 | 说明 |
|------|------|
| `index.html` / `main.js` | 构建产物（入口） |
| `_dev/build.py` | 唯一真源构建脚本 |
| `_dev/smoke_test.py` | 无头自检与兼容扫描 |
| `DESIGN.md` | 设计规范 / 设定唯一真源 |
| `archive/v1/` | v1 构建产物归档（React + Tailwind，只读保留） |

## 物料状态

| 项 | 状态 |
|----|------|
| 源码 / 构建脚本 | 已（`_dev/build.py` 单源） |
| 小工具 zip 打包 | 未（走 `.skill/minitool-zip-builder` 打小红书规范包） |
| 上架图标 | 未（需补 512×512 PNG） |
| 笔记 / 文案 | 未 |
| 游戏玩法 | 已（计算器/闹钟/日历/助手/日程/统计/电话/短信/相机；机制与恶搞文案按 v1 逆向还原，见 DESIGN.md §4.7–4.8） |

## 备注

- v1 为 React 构建产物归档，无源码；已整体移入 `archive/v1/` 只读保留，v2 在其旁重建。
- 容器与兼容细则引用仓库内 Skill：`.skill/minitool-zip-builder/`（SKILL.md 及 references）。
