# 月球科普 · 3D

> **分类**：`#vibeknow` 人文知识　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

3D 月球科普展示工具。参照 `solar-system-3d` 的单文件方案，聚焦月球本身的科学知识与交互展示。

## 功能

- **3D 月球交互**：高细节月球，拖拽旋转、滚轮/捏合缩放，点击月球切换科普卡片
- **月相变化演示**：通过调节太阳光照方向模拟月相循环（新月→上弦→满月→下弦→新月），可手动拖动滑块或自动播放
- **月球科普卡片**：直径、距地、公转、自转、潮汐锁定、起源假说、对地球的影响等结构化知识

## 技术栈

- Three.js（本地 `assets/three.min.js`，零网络依赖）
- 单文件 HTML + 外置 JS，开箱即用，无需构建
- 程序化星空天球贴图，复用 `solar-system-3d` 的月球纹理 `moon.jpg`

## 用法

直接用浏览器打开 `index.html` 即可。推荐最新版 Chrome / Edge / Firefox / Safari（需 WebGL 支持）。

## 目录结构

```
mid-autumn-moon-3d/
├── index.html          # 主页面（含全部样式与 UI 结构）
├── README.md
├── icon.png
└── assets/
    ├── app.js          # 3D 场景、月相、交互
    ├── moon.jpg        # 月球表面纹理
    └── three.min.js    # Three.js 渲染库
```

## 交互说明

- 拖动：旋转视角
- 滚轮 / 双指捏合：缩放
- 点击月球：切换科普卡片
- 底部 dock：月球 / 月相 / 科普
- 右上齿轮：显示设置（自转、星空、辉光、速度、视角）

## 许可

MIT License
