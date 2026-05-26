# Daily Report Project

## 日报自动生成与飞书多维表格写入

### 快捷命令

输入 `/daily-report` 自动执行完整流程（Skill 文件: `~/.claude/skills/daily-report/SKILL.md`）。

### 工作流程

1. **确认输入来源** — Git 提交记录 或 自然语言描述
2. **获取数据** — 读取 Git log 或接受用户输入，解析为工作项列表
3. **字段映射与推断** — 按规则填充优先级、类别、工作内容、说明、记录时间、记录人、预计完成时间
4. **写入多维表格** — 通过 `lark-cli base +record-batch-create` 批量新增记录
5. **展示结果** — 告知用户本次写入的记录摘要

### 飞书 CLI

- 工具: `npx @larksuite/cli@latest`
- 已安装 Skills（`~/.claude/skills/lark-*`）
- 当前应用: `cli_aa9966ffbcb9dbb3` (feishu)
- Base 写入需用户身份（`--as user`）

### 配置项

| 配置项 | 说明 | 设置位置 |
|--------|------|----------|
| `DAILY_REPORT_BASE_TOKEN` | 目标多维表格 Token | `~/.claude/settings.json` → `env` |
| `DAILY_REPORT_TABLE_ID` | 目标表 ID 或表名 | `~/.claude/settings.json` → `env` |
| `DAILY_REPORT_RECORDER` | 记录人默认值（选填） | `~/.claude/settings.json` → `env` |
| `DAILY_REPORT_PROJECT` | 默认 Git 项目路径（选填） | `~/.claude/settings.json` → `env` |

### 目标多维表格字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 优先级 | 单选（高/中/低） | 默认"中" |
| 类别 | 单选（开发/沟通/研发/维护/软著/其他） | 智能推断，默认"开发" |
| 工作内容 | 文本 | 工作简述 |
| 说明 | 文本 | 补充说明，可留空 |
| 记录时间 | 日期时间 | Git 模式取 commit 时间，否则取当前时间 |
| 记录人 | 文本 | commit author 或配置值 |
| 预计完成时间 | 日期时间 | 可留空 |

### 类别智能推断规则

| 匹配条件 | → 类别 |
|----------|--------|
| 提交信息含 fix/bug/修复/hotfix | 维护 |
| 变更文件含 doc/docs/*.md/软著 | 软著 |
| 提交信息含 沟通/会议/meeting/minutes | 沟通 |
| 提交信息含 研发/research/调研/POC | 研发 |
| 以上均不匹配 | 开发 |

### 如何调整日报功能

- **修改配置项**: 编辑 `~/.claude/settings.json` 的 `env` 字段
- **修改字段映射/推断规则**: 编辑 `~/.claude/skills/daily-report/SKILL.md`
- **修改脚本逻辑**: 编辑 `daily-report.sh`
- **更换多维表格**: 修改 `DAILY_REPORT_BASE_TOKEN` 和 `DAILY_REPORT_TABLE_ID`
- **更换飞书应用**: 执行 `npx @larksuite/cli config init` 重新授权
- **停用快捷命令**: 删除 `~/.claude/skills/daily-report/SKILL.md`
