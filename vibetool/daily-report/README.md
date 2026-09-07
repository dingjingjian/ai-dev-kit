# 工作日报 - Daily Report

> **分类**：`#vibetool` 实用工具　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

从 Git 提交记录（或自然语言描述）自动生成工作日报，并写入飞书多维表格。

## 运行方式

- 快捷命令：在支持的 AI 编程工具中输入 `/daily-report`
- 或直接执行 `daily-report.sh`

流程细节见 [`CLAUDE.md`](CLAUDE.md)。

## 工作流程

1. 确认输入来源：Git 提交记录 或 自然语言描述
2. 解析为工作项列表
3. 字段映射：优先级、类别、工作内容、说明、记录时间、记录人、预计完成时间
4. 通过 `lark-cli base +record-batch-create` 批量写入
5. 回显本次写入摘要

类别按提交信息智能推断（fix/bug → 维护，docs/软著 → 软著，会议 → 沟通，调研 → 研发，其余 → 开发）。

## 前置配置

在 `~/.claude/settings.json` 的 `env` 中配置：

| 配置项 | 说明 |
|--------|------|
| `DAILY_REPORT_BASE_TOKEN` | 目标多维表格 Token |
| `DAILY_REPORT_TABLE_ID` | 目标表 ID 或表名 |
| `DAILY_REPORT_RECORDER` | 记录人默认值（选填） |
| `DAILY_REPORT_PROJECT` | 默认 Git 项目路径（选填） |

> 凭据只走环境变量或本地配置，禁止写进代码或提交到仓库。

## 物料状态

自用工具，不投稿。

## 分类判定

主价值是"把写日报这件事办完" → 按"服务端与脚本类也归 `#vibetool`"的约定归入本分类。
