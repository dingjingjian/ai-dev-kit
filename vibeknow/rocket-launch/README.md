# 火箭发射 - Rocket Launch (2D)

> **分类**：`#vibeknow` 人文知识　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

2D 火箭发射演示：从倒计时点火到入轨，配实时遥测数据。

## 打开方式

双击 `rocket-launch.html`（注意入口不是 `index.html`）。

## 内容

- 点火倒计时
- 发射过程动画
- 实时遥测数据面板

## 工程约定

| 脚本 | 用途 |
|------|------|
| `build-minitool.mjs` | 构建小工具版本 |
| `pack.mjs` | 打包为 zip |
| `verify-minitool.mjs` / `zip-check.mjs` | 产物与 zip 校验 |
| `runtime-test.py` | 运行期冒烟测试 |

产物在 `dist/`。脚本一律使用相对路径，禁止硬编码绝对路径（参考根目录 `TRACKS.md` 维护约定）。

## 物料状态

| 项 | 状态 |
|----|------|
| zip | `rocket-launch.zip` |
| 运行检查 | `runtime-check.png` |
| 小红书笔记 | 未写 |

## 分类判定

没有分数、没有关卡也没有输赢；用户是来看火箭怎么发射的，不是来办事的。演示与科普属性 → `#vibeknow`，不归 `#vibetool`。
