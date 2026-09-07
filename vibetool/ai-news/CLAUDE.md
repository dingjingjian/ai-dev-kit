# AI News Daily Report Project

## AI 新闻日报 — 采集、整理与飞书多维表格发布

### 快捷命令

输入 `/ai-news` 自动执行完整流程（Skill 文件: `~/.claude/skills/ai-news/SKILL.md`）。

### 工作流程

1. **采集新闻** — 通过 WebSearch 搜索当日 AI 领域热点新闻（可配置关键词和来源）
2. **整理摘要** — 将新闻按类别分组，提取标题、摘要、来源链接
3. **写入多维表格** — 通过飞书 CLI 批量写入记录
4. **生成 HTML 日报** — 生成独立 HTML 页面，含总体概括和分类详情
5. **展示结果** — 输出日报摘要，告知 HTML 文件路径

### 输出文件

| 文件 | 路径 | 说明 |
|------|------|------|
| HTML 日报 | `output/ai-news-YYYY-MM-DD.html` | 单文件可离线查看的日报页面 |
| HTML 模板 | `template.html` | 页面风格参考模板 |

### 飞书 CLI

- 工具: `npx @larksuite/cli@latest`
- 当前应用: `cli_aa9966ffbcb9dbb3` (feishu)
- Base 写入需用户身份（`--as user`）

### 配置项

| 配置项 | 说明 | 设置位置 |
|--------|------|----------|
| `AI_NEWS_BASE_TOKEN` | 目标多维表格 Token | `~/.claude/settings.json` → `env` |
| `AI_NEWS_TABLE_ID` | 目标表 ID 或表名 | `~/.claude/settings.json` → `env` |
| `AI_NEWS_KEYWORDS` | 搜索关键词（逗号分隔） | `~/.claude/settings.json` → `env` |
| `AI_NEWS_LANGUAGE` | 新闻语言偏好（zh/en/both） | `~/.claude/settings.json` → `env` |

### 目标多维表格字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 标题 | 文本 | 新闻标题 |
| 摘要 | 文本 | 新闻内容摘要 |
| 类别 | 单选（大模型/开源/产品/政策/研究/其他） | 新闻分类 |
| 来源 | 文本 | 新闻来源名称 |
| 链接 | 链接 | 原文 URL |
| 热度 | 单选（高/中/低） | 根据报道数量判断 |
| 记录时间 | 日期时间 | 采集时间 |

### 新闻类别

| 类别 | 说明 |
|------|------|
| 大模型 | LLM/多模态模型发布、更新、评测 |
| 开源 | 开源模型、工具、框架动态 |
| 产品 | AI 产品发布、更新、商业化 |
| 政策 | AI 监管、法规、政策动态 |
| 研究 | 学术论文、技术突破 |
| 其他 | 不在以上分类的 AI 相关新闻 |

### 搜索关键词（默认）

```
AI 大模型 发布, OpenAI, Claude, Gemini, 开源模型,
人工智能 政策 法规, AI 产品 融资, 深度学习 研究 突破
```

### 如何调整

- **修改配置项**: 编辑 `~/.claude/settings.json` 的 `env` 字段
- **修改搜索关键词**: 编辑 `AI_NEWS_KEYWORDS` 配置
- **修改字段映射/分类规则**: 编辑 `~/.claude/skills/ai-news/SKILL.md`
- **修改脚本逻辑**: 编辑 `ai-news.sh`
- **更换多维表格**: 修改 `AI_NEWS_BASE_TOKEN` 和 `AI_NEWS_TABLE_ID`
