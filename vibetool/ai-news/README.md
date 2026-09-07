# AI 新闻日报 - AI News

> **赛道**：`#vibetool` 实用工具　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

AI 领域新闻的采集、整理与发布：搜索当日热点 → 分类摘要 → 写入飞书多维表格 → 生成单文件 HTML 日报。

## 运行方式

- 快捷命令：在支持的 AI 编程工具中输入 `/ai-news`
- 或直接执行 `ai-news.sh`

流程细节见 [`CLAUDE.md`](CLAUDE.md)。

## 输出

| 文件 | 说明 |
|------|------|
| `output/ai-news-YYYY-MM-DD.html` | 单文件、可离线查看的日报页面 |
| 飞书多维表格 | 按标题/摘要/类别/来源/链接/热度/记录时间写入 |

## 前置配置

飞书 CLI（`npx @larksuite/cli@latest`），并在 `~/.claude/settings.json` 的 `env` 中配置：

| 配置项 | 说明 |
|--------|------|
| `AI_NEWS_BASE_TOKEN` | 目标多维表格 Token |
| `AI_NEWS_TABLE_ID` | 目标表 ID 或表名 |
| `AI_NEWS_KEYWORDS` | 搜索关键词（逗号分隔） |
| `AI_NEWS_LANGUAGE` | 语言偏好（zh/en/both） |

> 凭据只走环境变量或本地配置，禁止写进代码或提交到仓库。

## 物料状态

自用工具，不投稿。

## 赛道判定

主价值是"把新闻整理这件办完"，使用者是自己或团队 → 按"服务端与脚本类也归 `#vibetool`"的约定归入本赛道。
