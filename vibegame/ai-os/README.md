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
- **存储**（对照小红书容器能力清单 §2.4 / §3.6 / §3.7）：**容器 Storage JS API 优先**（客户端 ≥ 9.46.0，`setStorage` / `getStorage` / `getStorageInfo`），`localStorage`（前缀 `aios_`）为低版本降级通道；启动时把 `aios_*` 全量水合进内存缓存（与 1.8s 开机动画并行），业务读写仍是同步的。写入**双通道落盘**、读时以容器值为准，两侧缺哪边补哪边，客户端升降级都不丢数据；版本判断忽略 `buildVersion` 末 3 位、逐级判空 + `getLaunchOptions` 异步兜底，容器异常时最多等一个超时周期即退回降级通道，不阻塞启动。设置「关于本机」显示当前缓存通道与用量。
- **自检**：`_dev/smoke_test.py`（playwright 无头）断言导航栈 / 安全区 / 顶部净空 / 计算器固定页（内容区不可滚动、判定阶段页脚不跳动、小屏键盘贴底）/ **存储通道（容器 Storage、版本门槛、降级兜底、迁移一致性）**，并扫描 JS/CSS 超基线语法；回归截图输出到 `_dev/_shots/`（临时，不入库）。整套耗时约 2–4 分钟：闹钟用例要等响铃窗口对齐到 `:00`/`:30`，窗口恰好已过期时会多等一个刻度周期。

```bash
# 构建（单源 → index.html + main.js）
python _dev/build.py
# 无头自检 + 截图回归
PYTHONUTF8=1 python _dev/smoke_test.py
# 前置门禁 + 打包小工具 zip（产物 dist/ 与 ai-os.zip，均不入库）
python _dev/build_zip.py
# 官方体积/结构审计（.skill/minitool-zip-builder）
python .skill/minitool-zip-builder/scripts/audit_artifact.py vibegame/ai-os/ai-os.zip
```

## 目录

| 路径 | 说明 |
|------|------|
| `index.html` / `main.js` | 构建产物（入口） |
| `_dev/build.py` | 唯一真源构建脚本 |
| `_dev/build_zip.py` | 前置门禁 + 打包小红书规范 zip |
| `_dev/smoke_test.py` | 无头自检与兼容扫描 |
| `DESIGN.md` | 设计规范 / 设定唯一真源 |
| `dist/` / `ai-os.zip` | 打包产物（`.gitignore` 忽略，不入库） |
| `archive/v1/` | v1 构建产物归档（React + Tailwind，只读保留） |

## 物料状态

| 项 | 状态 |
|----|------|
| 源码 / 构建脚本 | 已（`_dev/build.py` 单源） |
| 存储合规 | 已（容器 Storage JS API 优先 + `localStorage` 降级，见 DESIGN.md §5） |
| 小工具 zip 打包 | 已（`_dev/build_zip.py` → `ai-os.zip`，48 KB；`audit_artifact.py` PASS 0 warning） |
| 上架图标 | 未（需补 512×512 PNG，不随 zip 打包） |
| 笔记 / 文案 | 未 |
| 游戏玩法 | 已（计算器/闹钟/日历/助手/日程/统计/电话/短信/相机；机制与恶搞文案按 v1 逆向还原，见 DESIGN.md §4.7–4.8） |

## 备注

- v1 为 React 构建产物归档，无源码；已整体移入 `archive/v1/` 只读保留，v2 在其旁重建。
- 容器与兼容细则引用仓库内 Skill：`.skill/minitool-zip-builder/`（SKILL.md 及 references）。
- 打包产物（`dist/`、`ai-os.zip`）默认被根 `.gitignore` 的 `dist/` 与 `*.zip` 忽略，**不入库**；若要随仓库分发，需 `git add -f`，由用户决定。
- 上架图标（512×512 PNG）与小红书笔记文案仍待补；图标不随 zip 打包，在上传页单独提供。
- 交付为静态结论：真机（iOS / Android WebView 61 基线机）**未实测**，容器端 Storage 的真实读写与用量以真机日志为准。
