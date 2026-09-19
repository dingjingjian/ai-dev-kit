# 人工智能 OS - AI OS

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

一个移动端「人工智能操作系统」桌面模拟：打开即是手机主屏——居中状态栏、壁纸、应用图标、Dock、底部三大金刚键（返回 / 主页 / 多任务），点开即可体验一套以 AI 为核心操作系统界面。套着「操作系统」外壳，内核为互动玩法（用户点开的第一动机是「玩」），故归 `#vibegame`。主屏第 7 格另有**「应用商店」**：店里卖的不是本机应用，而是**整个 ai-dev-kit 仓库已经开发出来的全部小工具**（见 DESIGN.md §4.12）。

**设计规范与设定唯一真源见 [`DESIGN.md`](DESIGN.md)**：容器顶部留白与左右净空、底部金刚键导航、真机视觉语言、Chrome 61 / ES2017 兼容基线、分期计划都以它为准。

## 打开方式

双击 `index.html` 即可打开；本地静态服务器（如 `python -m http.server`）下移动端体验最佳。无外部 CDN 依赖、无运行时构建。

> **打开方式对「月球天气」有影响**：该应用的月面贴图走 WebGL 上传，而浏览器会把 `file://` 下的本地图片判为跨源、拒绝上传 —— 双击直开时月亮会退化成素色球（读数一切照常）。要用本地服务器或小红书容器（同源）打开才能看到原版月面。无头自检里用 `--allow-file-access-from-files` 启动 Chromium 让两条路一致。

## 技术构成

- **单源工程**：`_dev/build.py` 为唯一真源，产出根目录 `index.html`（内联 CSS）与 `main.js`；改 UI 只改 `build.py` 后重跑。
- **逻辑**：vanilla JS，直接按 ES2017 / Chrome 61 基线书写（无 `?.` / `??` / object spread 等超基线语法）。
- **样式**：Chrome 61 基线层 + `@supports` 增强层（毛玻璃等），不维护两套样式表；Flex 间距用 margin、Grid 间距用 `grid-gap`。
- **容器适配**：`--top-gap` 显式顶部留白 + `var(--safe-area-inset-*, env(...))` 组合，纵向让开宿主顶部导航行——无宿主 50px、**in-app 加大到 70px**（宿主顶栏就压在这条带里）；高度一律"普通值在前、变量在后"兜底，防链式 calc 失效导致预留带塌陷。左右净空 `--safe-l/--safe-r` **恒为 0**（宿主按钮只在顶部一行，内容区/Dock/页脚不内缩）。in-app 与纯浏览器直开的布局逐项一致，唯一差异是 **in-app 隐藏自绘状态栏**（`visibility:hidden`）；导航全部收到底部三大金刚键。
- **月球天气**（点主屏天气小组件进入，DESIGN.md §4.9）：由 `vibeknow/moon-3d` 整合而来，**整页只有天气**（无分段切换/滑块/设置/科普块）。渲染**直接采用 moon-3d 的 Three.js 场景**：本地 `./assets/three.min.js`（与 `vibeknow/earth-3d` 同款引入方式，零 CDN）+ WebGL/sRGB/ACES、星空天球、双层辉光、原版月面贴图 `./assets/moon.jpg`；**月相按当前时间推算**（平均朔望月 + 基准新月，0° 新月 / 180° 满月）驱动太阳方位角，**不自转**，只保留拖动旋转与滚轮/双指缩放；无 WebGL / 上下文丢失时观测台降级提示、读数照常。
- **相机取景借材**：取景框不再是「随机渐变 + 圆/★/♥」，而是轮播**美食素材图**——由 `_dev/make_cam_photos.py` 从 `vibeknow/world-food-3d` 的美食图**只读派生**成 `./assets/cam/food-*.webp`（36 张 / 512×512 / q80，约 0.95 MB，入库并随 zip 分发）；每 3s 随机换一张且不与上一张重复，`object-fit:cover` 铺满取景框，新图解码完再换 `src`（不闪白），解码引用只留最近 12 张。清单由 `_dev/build.py` 扫描 `./assets/cam/` 注入，不手抄文件名。素材渲染走 `<img>`（同源本地图，`file://` 直开也能显示；与月球天气的 WebGL 贴图不同，不受跨源限制）。
- **相机拍完即换 + 镜头温控**：**无预览页、无「重拍 / 保存」**，按快门只是闪光 150ms → 立刻换下一张 → 重置 3s 自动换景计时。温度是**拍照频率的函数**：基准 36.0℃、每次快门 +1.5℃（上限 +10℃）、静置 0.5℃/s 回落（按真实时间差结算，离页也降温）；≥43.5℃ HUD 转红显示「镜头过热」，≥45℃ **封锁快门**（转灰 + 徽标提示「太烫了，凉一下再拍」），凉回线下即恢复，封锁只挡拍摄不停轮播。
- **存储**（对照小红书容器能力清单 §2.4 / §3.6 / §3.7）：**容器 Storage JS API 优先**（客户端 ≥ 9.46.0，`setStorage` / `getStorage` / `getStorageInfo`），`localStorage`（前缀 `aios_`）为低版本镜像/降级通道；启动时把 `aios_*` **并发**水合进内存缓存（每个 key 各自 800ms 超时，与 1.8s 开机动画并行），业务读写仍是同步的。写入**双通道落盘**（镜像同步先行、容器异步跟上，任一成功即算成功）、读时以容器值为准，两侧缺哪边补哪边且不删除任何一份，客户端升降级都不丢数据；版本判断忽略 `buildVersion` 末 3 位、逐级判空 + `getLaunchOptions` 异步兜底，容器异常时最多等一个超时周期即退回镜像通道，不阻塞启动。设置「关于本机」显示当前缓存通道与用量（容器写入失败时如实标注已回落 `localStorage`）。本层与 `vibetool/offwork-heatmap`、`vibetool/mood-diary` **同构**（统一存储契约），三处改动请同步。
- **系统音效**（DESIGN.md §4.11）：全系统统一音效层 —— **Web Audio 实时合成 25 个系统语义音效，零音频文件**（不占包体、不引外部资源）；命名即语义（`tap` / `open` / `ok` / `wrong` / `shot` / `alarm` …），同一语义在任何应用里听起来一致；触发走文档级 `click` 委托 + `data-sfx` 标注（判定 / 快门 / 挂断等由动作发声，不叠通用点击音，同音效 30ms 去重）；**首个手势前不建 AudioContext**（躲开自动播放策略与告警），无 Web Audio 时整层静音降级、交互照常；设置「声音与触感 → 系统音效」可整体静音（`aios_sound` 持久化）。
- **应用商店**（DESIGN.md §4.12）：主屏第 7 格的应用，介绍**整个 ai-dev-kit 仓库已开发的小工具**（不是本机已装的 9 个应用），按 `TRACKS.md` 的四分类分组、可分类筛选，**纯展示不跳转**（容器内无法打开别的项目）。清单**构建期由仓库根 `TRACKS.md` 派生**：`_dev/build.py` 的 `store_apps()` 解析分类表后注入 `main.js` 的 `__STORE_DATA__`（中文不转义、跳过 `.skill/`），与小工具包体无关、运行时零外部读取 —— 与相机取景清单同属「构建期派生、不手抄」（手抄必然与上游分叉）。**每项在构建期折成商店口径**：副标题由定位折（`store_tagline()` 砍掉技术括注与上游路径，如 ai-os 那条的 `vibeknow/moon-3d`）、上架标签由物料状态折（`store_state()` → 已上架 / 开发中 / 内部自用）；**目录路径与物料状态原文不上屏**（那是仓库索引的字段，不是商店的文案），卡片一行一卡不展开。数据文本一律 `esc()` 转义后进 `innerHTML`。
- **自检**：`_dev/smoke_test.py`（playwright 无头）断言导航栈 / 安全区 / 顶部净空 / 计算器固定页（内容区不可滚动、判定阶段页脚不跳动、小屏键盘贴底）/ **月球天气（小组件入口、单画布 WebGL、贴图 data-tex=ok、本地 three.min.js、仅天气、月相读数与测试独立复算对拍、静置 900ms 画面字节不变即不自转、拖动改 theta、滚轮改 radius、固定时钟验满月与蛾眉月两种相位画面不同）** / **相机（取景图为包内 `./assets/cam/food-*.webp`、已解码上屏、铺满取景框、3s 换图且不与上一张重复、无预览/重拍/保存控件、拍完即换下一张、连拍升温、过热转红与封锁快门、封禁时按不动、静置散热后恢复）** / **存储通道（容器 Storage、版本门槛、降级兜底、迁移一致性）** / **系统音效（词表齐备、首个手势前不建上下文、点击·判定·快门发声计数、静音后计数不涨且跨会话保持、无 Web Audio 时降级不报错）** / **应用商店（与测试自带的独立 `TRACKS.md` 解析及两套折算规则复算三方对拍：分类名与顺序、逐项 分类+名称+目录+定位+状态全量续存、副标题与上架标签折算一致、卡片数=项目数、`.skill/` 零命中、**目录路径与状态原文零上屏**、招牌图标相邻不同色、本机标「已安装」、分类筛选只剩该分类且计数正确、切回全部恢复）**，并扫描 JS/CSS 超基线语法；回归截图输出到 `_dev/_shots/`（临时，不入库）。整套耗时约 2–4 分钟：闹钟用例要等响铃窗口对齐到 `:00`/`:30`，窗口恰好已过期时会多等一个刻度周期。

```bash
# 构建（单源 → index.html + main.js；相机取景清单扫描 assets/cam/，
# 应用商店清单解析仓库根 TRACKS.md，两者都在此步注入）
python _dev/build.py
# 相机取景素材派生（只读 vibeknow 三个项目；产物已入库，仅在换来源/换规格时重跑）
python _dev/make_cam_photos.py
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
| `assets/three.min.js` / `assets/moon.jpg` | 月球天气的运行时资源（本地 Three.js + 月面贴图，随 zip 分发） |
| `assets/cam/food-*.webp` | 相机取景素材（36 张美食图，借自 `vibeknow/world-food-3d`，由 `_dev/make_cam_photos.py` 派生，随 zip 分发） |
| `_dev/make_cam_photos.py` | 相机取景素材派生脚本（唯一入口，产物入库） |
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
| 系统音效 | 已（Web Audio 合成 25 个系统语义音效，零音频文件；全系统可整体静音，见 DESIGN.md §4.11） |
| 应用商店 | 已（主屏第 7 格；介绍 ai-dev-kit 全部小工具，清单构建期由仓库根 `TRACKS.md` 派生、四分类分组、可筛选；副标题与上架标签也在构建期折出，目录与状态原文不上屏，见 DESIGN.md §4.12） |
| 小工具 zip 打包 | 已（`_dev/build_zip.py` → `ai-os.zip`，~1.5 MB（含本地 Three.js + 月面贴图 + 36 张美食素材，共 41 文件）；`audit_artifact.py` PASS 0 warning） |
| 上架图标 | 未（需补 512×512 PNG，不随 zip 打包） |
| 笔记 / 文案 | 未 |
| 游戏玩法 | 已（计算器/闹钟/日历/助手/日程/统计/电话/短信/相机；机制与恶搞文案按 v1 逆向还原，见 DESIGN.md §4.7–4.8） |
| 月球天气 | 已（主屏天气小组件点入；只留天气：Canvas 2D 球面月球 + 12 格读数，月相按当前时间推算、不自转，DESIGN.md §4.9；源自 `vibeknow/moon-3d` 的整合） |
| 相机取景素材 | 已（美食 36 张 / 512×512 / q80，约 0.95 MB 入库；借自 `vibeknow/world-food-3d`，由 `_dev/make_cam_photos.py` 只读派生；拍完即换下一张 + 镜头温控（连拍过热封锁快门），见 DESIGN.md §4.8） |

## 备注

- v1 为 React 构建产物归档，无源码；已整体移入 `archive/v1/` 只读保留，v2 在其旁重建。
- **构建依赖仓库根 `TRACKS.md`**（应用商店的数据真源，只读解析、不写回）：把 ai-os 目录单独拷出去构建会因缺该文件而**拒绝构建** —— 这是刻意的，避免手抄清单与上游分叉；改了 `TRACKS.md` 的新项目 / 定位 / 物料状态要**重跑 `_dev/build.py`**，否则 `_dev/build_zip.py` 的门禁会把 zip 拦下。
- 相机素材是本仓库内**跨项目借用**：目前只从 `vibeknow/world-food-3d` 的美食图读原图（早先借过的猫咪 / 恐龙图已按用户口径删除），产物落 `assets/cam/`，**不改动也不删除上游项目文件**；重生成只跑 `_dev/make_cam_photos.py`（不要在 `assets/cam/` 里手工增删改名，否则与 `build.py` 扫描出的清单口径打架）。体积按小工具门禁（10 MiB 上限 / 2 MiB 建议）控制，**加来源前先算账**。
- 容器与兼容细则引用仓库内 Skill：`.skill/minitool-zip-builder/`（SKILL.md 及 references）。
- 打包产物（`dist/`、`ai-os.zip`）默认被根 `.gitignore` 的 `dist/` 与 `*.zip` 忽略，**不入库**；若要随仓库分发，需 `git add -f`，由用户决定。
- 上架图标（512×512 PNG）与小红书笔记文案仍待补；图标不随 zip 打包，在上传页单独提供。
- 交付为静态结论：真机（iOS / Android WebView 61 基线机）**未实测**，容器端 Storage 的真实读写与用量以真机日志为准。
