# reference/ — 他人优秀小工具归档

收集梳理其他博主发布的优秀小工具，作为后期生成图文笔记的素材库。本目录为**参考资料**性质，与工作区四个自研顶层目录（`vibetool/`、`vibegame/`、`vibeart/`、`vibeknow/`）性质不同，不参与自研产出，仅作学习借鉴与素材留存。

## 目录结构

```
reference/
├── README.md                           # 本文件：总索引与规范说明
└── <博主名-工具名>/                    # 单个工具归档目录（扁平一级）
    ├── README.md                       # 元信息：博主、原文链接、简介、亮点、技术栈
    └── screenshots/                   # 截图目录
        ├── cover.png                  # 封面图（必填，总索引与笔记封面取用）
        └── *.png                      # 关键交互截图（按需多张）
```

## 命名规范

- 一级子目录命名格式：`<博主名-工具名>/`，博主名与工具名之间用单个连字符 `-`。
- 优先用**英文短名或拼音**作目录名，避免中文目录在 shell/git 中编码问题；博主中文原名在子目录 `README.md` 里记录原貌。
- 全小写，单词间用连字符，不用下划线或空格。
- 示例：`ding-offwork-heatmap/`、`laoma-password-manager/`、`aigc-emoji-mixer/`。

## 单工具 README 模板

每个 `<博主名-工具名>/README.md` 按以下结构填写：

```markdown
# <工具名>

- 博主：<博主中文原名 / 账号名>
- 原文链接：<小红书笔记 / GitHub / 博文 URL>
- 归档日期：YYYY-MM-DD
- 工具类型：<h5 / minitool / webapp / browser-extension / ...>
- 技术栈：<HTML+JS / React / Three.js / ...>

## 简介

<一句话说明工具做什么>

## 亮点

- <亮点 1>
- <亮点 2>
- <亮点 3>

## 截图

| 文件 | 说明 |
| --- | --- |
| screenshots/cover.png | 封面图 |
| screenshots/01-main.png | 主界面 |
| screenshots/02-interaction.png | 关键交互 |

## 备注

<可选：可借鉴点、待拆解问题、笔记选题方向等>
```

## 总索引

| 博主 | 工具名 | 类型 | 原文链接 | 亮点 | 归档日期 | 目录 |
| --- | --- | --- | --- | --- | --- | --- |
| 哲学咖啡师 | 我的户外烟花秀 | h5 | https://www.xiaohongshu.com/discovery/item/6aaeafa10000000028035c68 | 换城市/照片背景+手绘轮廓抠图+开关式烟花触发 | 2026-09-20 | zhexue-kafeishi-fireworks/ |
| 哲学咖啡师 | 掌上博物馆 | h5 | https://www.xiaohongshu.com/discovery/item/6aa680510000000027017115 | 3D 展品 360°旋转/缩放+编号部件导览+系列化连载（#vibetool 参赛） | 2026-09-20 | zhexue-kafeishi-pocket-museum/ |
| 猫哥 | 丝丝入扣（苏绣小工具） | h5 | https://www.xiaohongshu.com/discovery/item/6a8823880000000035026757 | 照片转苏绣针迹+飞针动画+针法密度参数化（GLM 5.3 生成） | 2026-09-20 | maoge-suxiu/ |
| 词元AI编程 | 极速漂移 SPEED DRIFT | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6a9e4a79000000001001cfbb | 移动端 3D 漂移赛车+拖转/双指缩放入场动线+单点手感定位（#vibegame 参赛） | 2026-09-20 | ciyuan-ai-speed-drift/ |
| CarryTzz | 哆啦A梦的家·串门探险记 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aa27919000000000b001536 | 3D 探索寻宝+能力解锁+道具解谜链+双层收集结构（#vibecoding大赛 参赛） | 2026-09-20 | carrytzz-doraemon-house/ |
| 倪的AI笔记 | 中国人能飞 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6a8ec88d0000000028004e1d | 像素风自动飞升攀高+单手双区操控+高度三件套HUD（#vibegame 参赛） | 2026-09-20 | nide-ai-fly/ |
| Way的AI创造社 | 跳吧小球 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aa56fe8000000002502e51a | 星标货币皮肤商店+成就系统+版本更新召回运营，玩家破38万（#vibegame 参赛） | 2026-09-20 | way-ai-jump-ball/ |
| 哈哈要去哪里 | 迷你飞行 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aabb29e000000002a004eaf | Q版 3D 模拟飞行+多机型阵容+海报级宣传图（#vibegame 参赛） | 2026-09-20 | haha-mini-flight/ |
| 左手 | 科目二挑战赛 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6a964de100000000270080fe | 关卡制停车解谜+用时/擦撞/挪车三维结算+星级+科目二题材共鸣（#vibecoding 参赛） | 2026-09-20 | zuoshou-keer-parking/ |
| 星空下的人 | 挖掘机抓猪 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aad360500000000270160bf | 热梗题材+玩家反馈驱动改默认视角+听劝式迭代叙事+评论投票（#vibegame 参赛） | 2026-09-20 | xingkong-excavator-pig/ |
| 豆米AI | 下一个蓝点 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aaa7aa30000000026031dba | 三手势六阶段玩法+米到百万光年尺度尺HUD+真实系外行星结局+100KB零图片零音频（#vibegame 参赛） | 2026-09-20 | doumi-next-blue-dot/ |

> 新增工具时在此表追加一行；目录列指向本目录下的子目录路径。

## 使用流程

1. 发现优秀工具 → 在 `reference/` 下新建 `<博主名-工具名>/` 目录。
2. 保存截图到 `screenshots/`，至少一张 `cover.png`。
3. 复制上方「单工具 README 模板」填写 `README.md`。
4. 回到本文件「总索引」表格追加一行。
5. 积累到一定数量后，从本索引中选品，基于截图与亮点撰写图文笔记（笔记产物放对应自研项目的 `xiaohongshu/` 目录，不放本目录）。

## 约定

- 本目录**只归档他人作品**，不放自研产出。
- **不存放源代码**：仅留截图与元信息，避免版权与仓库体积问题。如需拆解源码，另行 clone 到本地工作目录之外。
- 截图优先保留**原图分辨率**，便于后期笔记裁切。
- 涉及商用/付费工具，在 `README.md` 里标注授权情况，截图仅作学习引用。
