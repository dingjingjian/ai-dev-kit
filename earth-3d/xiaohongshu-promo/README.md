# 口袋地球 · 小红书参赛素材归档

本目录收录「口袋地球」（earth-3d）参加小红书 vibecoding 大赛的全部宣传素材。

## 目录结构

```
xiaohongshu-promo/
├── README.md                          ← 本文件
├── xiaohongshu-note.md                ← 小红书笔记文案（标题/正文/话题/配图建议）
├── screenshots/                        ← 项目真实运行截图（原始素材）
│   ├── 01-overview.png                ← 蓝色星球模式
│   ├── 02-seasons.png                 ← 四季成因模式
│   ├── 03-layers.png                  ← 地球内部模式
│   └── 04-grid.png                    ← 经纬网格模式
├── promo-v1-ai-generated/             ← 第一版：AI 纯生成宣传图（5 张，3:4）
│   ├── 01-cover.png
│   ├── 02-blue-planet.png
│   ├── 03-seasons.png
│   ├── 04-earth-layers.png
│   └── 05-summary.png
└── promo-v2-real-screenshots/         ← 第二版：基于真实截图的宣传图（5 张，3:4）
    ├── 01-cover.png
    ├── 02-blue-planet.png
    ├── 03-seasons.png
    ├── 04-earth-layers.png
    └── 05-grid.png
```

## 两个版本的区别

| 版本 | 特点 | 适用场景 |
|------|------|----------|
| v1 AI 纯生成 | 画面更精美、地球渲染更艺术化，但非项目实际界面 | 追求视觉冲击力的封面 |
| v2 真实截图 | 保留项目真实 UI 界面和交互元素，叠加杂志排版 | 展示产品真实面貌，可信度高 |

推荐使用 **v2 真实截图版** 作为主参赛配图，文案见 `xiaohongshu-note.md`。

## 项目信息

- 项目名称：口袋地球
- 项目目录：`earth-3d/`
- 技术栈：纯前端 HTML + Three.js（WebGL），零依赖单文件
- 核心功能：蓝色星球 / 四季成因 / 地球内部 / 经纬网格 四大科普模式
- 参赛赛道：#vibeknow 人文知识赛道
