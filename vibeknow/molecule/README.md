# 分子空间构型 - Molecule

> **分类**：`#vibeknow` 人文知识　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

分子结构的 3D 可视化，把平面的化学式变成立体能转的球棍模型。

## 打开方式

双击 `molecule.html`（注意入口不是 `index.html`）。

## 工程约定

| 脚本 | 用途 |
|------|------|
| `build.mjs` | 构建 |
| `pack.mjs` | 打包为小红书小工具 zip |
| `verify.mjs` / `runtime-test.mjs` | 校验与运行期测试 |
| `zip-check.mjs` | zip 结构检查 |

产物在 `dist/`，截图在 `screenshots/`。脚本一律使用相对路径，禁止硬编码绝对路径。

## 物料状态

| 项 | 状态 |
|----|------|
| zip | `molecule-minitool.zip` |
| 小红书笔记 | 未写 |

## 分类判定

不产出任何可交付物，用户点开是为了理解分子长什么样 → 认知增量是主价值 → `#vibeknow`（副标签 `#vibetool`）。
