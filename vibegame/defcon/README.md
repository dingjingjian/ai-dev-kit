# 核战危机 DEFCON（defcon）

> **分类**：`#vibegame` 互动游戏　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)
> 小红书 VibeCoding 大赛参赛作品 · 完整设定见 [`DESIGN.md`](DESIGN.md)

一款 3D 球面核战策略游戏。六个虚构阵营在一颗星球上互相威慑，你通过一次次危机抉择把世界推向——或拉离——核战争边缘。核弹有限、死得少的才算赢。

## 项目信息

- 中文名：核战危机 DEFCON
- 仓库名：`defcon`
- 主赛道：`#vibegame`（互动游戏）
- 灵感来源：Introversion《DEFCON》(2006)
- 复用来源：`vibeknow/earth-3d` 的 three.js 运行时与地球贴图

## 玩法

一局约 6–8 分钟，两段循环：

**危机博弈** —— 每回合 20 秒弹出一张国际事件卡，六方同时选择。每个选项推高或压低全局危机值，危机值决定 DEFCON 等级，跌到 DEFCON 1 即解锁核弹。世界每回合自动滑向战争一点，你只能拖慢，不能阻止。

**热核战争** —— 从发射井向敌方城市发射 ICBM，导弹沿大圆弹道飞行 15–40 秒。途中可能被敌方防空拦截，命中即抹掉城市。敌方发射的导弹一旦进入你的雷达覆盖，你可以靠弹道反推找到它的发射井——但你自己开火时，也一样会暴露。

终局按「敌方伤亡 − 己方伤亡」计分。赢不是灭了对手，是死得比他少。

## 三条设计主线

1. **DEFCON 等级由博弈驱动，不由倒计时驱动** —— 何时开战是六方共同选择的结果
2. **核弹有限且不可逆** —— 打一枚少一枚，先手倾泻会暴露发射井，第二轮就没得打了
3. **伤亡差计分** —— 相互确保毁灭的数学化，逼出二次核反击的考量

## 技术路线

- `index.html` + `src/` 下 7 个外置经典脚本，**无构建步骤**，作为小红书「小工具」上传挂载
- 渲染：three.js r149（本地，无 CDN）+ 一张 2048×1024 等距圆柱地球贴图
- 逻辑 10 Hz 固定步长 + 渲染 60 fps 插值，确定性便于无头测试
- 红线：离线运行不联网、无 `fetch` / `Worker` / `eval`、脚本全外置、无外部资源

## 目录约定

```
index.html          # 入口（内联样式 + HUD 骨架，脚本外置）
assets/
  three.min.js      # r149，608 KB
  earth.jpg         # 2048×1024，512 KB
src/
  data.js           # 阵营、城市、事件卡、配置（纯 JS，不 fetch）
  geo.js            # 经纬度数学、大圆航线、弹道、溯源
  sim.js            # 阶段机、实体状态、tick、伤害结算
  ai.js             # AI 决策
  render.js         # three.js 渲染
  ui.js             # HUD、事件卡、城市列表
  game.js           # 主循环、事件绑定
tests/              # 无头校验脚本，不进提交包
dist/               # 提交用的 zip 包
docs/               # 素材与截图
DESIGN.md           # 设计文档
# 小工具打包规范见工作区根 .skill/minitool-zip-builder/（本目录不内嵌副本）
```

脚本加载顺序即依赖顺序：`data → geo → sim → ai → render → ui → game`，靠 `window.DC` 命名空间协作。

## 打包

产物须符合工作区根 `.skill/minitool-zip-builder/` 的小工具打包规范。核心要求：

- `index.html` 在 zip 根目录 —— 压缩 `dist/` 的**内容**而非目录本身
- 脚本全外置、经典脚本、无 `import` / `export`、无 `type="module"`
- 全部相对路径，无外部引用
- zip 不超过 10 MiB（建议 2 MiB 内）；当前预估约 700 KB

打包前按 `.skill/minitool-zip-builder/references/zip-artifact-spec.md` §6 与 `performance-budget.md` §6 逐项自检。

## 分类判定

有分数、有输赢、有六方对抗与终局排名，用户点开是为了「赢一局」 → `#vibegame`。
冷战题材与核战反思是包装，主价值是策略对抗的爽感，故不归 `#vibeknow`；玩法驱动而非观看体验，故不归 `#vibeart`。
