#!/usr/bin/env bash
# AI 新闻日报脚本 — 占位脚本，实际采集由 Claude Code Skill 驱动
# 用法: bash ai-news.sh [日期]
# 配置项从环境变量读取: AI_NEWS_BASE_TOKEN, AI_NEWS_TABLE_ID, AI_NEWS_KEYWORDS

set -euo pipefail

TODAY="${1:-$(date +%Y-%m-%d)}"
NOW=$(date "+%Y-%m-%d %H:%M:%S")

echo "=== AI 新闻日报 ==="
echo "日期: $TODAY"
echo ""

# 检查配置
if [ -z "${AI_NEWS_KEYWORDS:-}" ]; then
  AI_NEWS_KEYWORDS="AI 大模型, OpenAI, Claude, Gemini, 开源模型, 人工智能政策, AI产品融资"
fi

echo "搜索关键词: $AI_NEWS_KEYWORDS"
echo ""

# 提示：实际新闻采集由 Claude Code 通过 WebSearch 完成
echo "--- 新闻采集 ---"
echo "请通过 Claude Code 的 /ai-news 命令执行完整的新闻采集和写入流程。"
echo "本脚本用于辅助批量写入多维表格等操作。"

# 如果有配置多维表格，可以进行记录写入
if [ -n "${AI_NEWS_BASE_TOKEN:-}" ] && [ -n "${AI_NEWS_TABLE_ID:-}" ]; then
  echo ""
  echo "目标表格: $AI_NEWS_TABLE_ID"
  echo "Base Token: $AI_NEWS_BASE_TOKEN"
  echo "可通过 npx @larksuite/cli@latest base +record-batch-create 写入记录"
else
  echo ""
  echo "提示: 设置 AI_NEWS_BASE_TOKEN 和 AI_NEWS_TABLE_ID 环境变量以启用飞书多维表格写入。"
fi

echo ""
echo "=== 完成 ==="
