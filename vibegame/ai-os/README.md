# 人工智能 OS - AI OS

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

一个移动端「人工智能操作系统」桌面模拟。打开即是手机主屏：应用图标、Dock、AI 助手入口一应俱全，点开即可体验一套以 AI 为核心的操作系统界面。技术上是 React 构建的纯前端应用，面向小红书小工具分发。

## 打开方式

双击 `index.html` 即可打开；组件以相对路径加载，本地静态服务器（如 `python -m http.server`）下移动端体验最佳。无构建步骤、无外部 CDN 依赖。

## 技术构成

- **渲染**：React（`assets/js/app.runtime.js` 为构建产物，通过 `createRoot` 挂载到 `#root`）
- **样式**：四级样式表，加载顺序有意区分
  - `base.css` —— 容器适配层，仅声明应用样式未覆盖的属性
  - `icons.css` —— 本地化的 Material Icons 字体
  - `app.css` —— 应用主题与布局（构建产物）
  - `compat.css` —— 安卓 9（Chrome 69）兼容性补丁，最后覆盖降级
- **适配模块**（`assets/js/modules/`，在运行时之前按序初始化）
  - `platform-shim.js` —— `window.lingguang` 平台垫片
  - `safe-area.js` —— 安全区变量，首屏绘制前写入避免抖动
  - `viewport.js` —— 视口适配
  - `flex-gap-polyfill.js` —— `flex-gap` 垫片，并借 `MutationObserver` 适配 React 动态渲染
  - `bootstrap.js` —— 启动引导，按顺序初始化上述模块，单模块失败不阻断整体启动

## 物料状态

| 项 | 状态 |
|----|------|
| 源码 / 构建脚本 | 未随仓库（当前为构建产物） |
| 小工具 zip 打包 | 未（可走 `vibetool/minitool-zip-builder` 打小红书规范包） |
| 上架图标 | 未（需补 512×512 PNG） |
| 笔记 / 文案 | 未 |

## 备注

- 当前目录为**构建产物归档**，不含原始源码与打包脚本；如需二次开发，应先补齐源码与构建链路。
- 套着「操作系统」外壳，内核为互动玩法（用户点开的第一动机是「玩」），故归 `#vibegame` 而非 `#vibetool`。
