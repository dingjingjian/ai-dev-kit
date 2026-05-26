#!/usr/bin/env bash
# 日报生成脚本 — 从 Git 提交生成飞书多维表格记录
# 用法: bash daily-report.sh [git项目路径]
# 配置项从环境变量读取: DAILY_REPORT_BASE_TOKEN, DAILY_REPORT_TABLE_ID, DAILY_REPORT_RECORDER, DAILY_REPORT_PROJECT

set -euo pipefail

DEFAULT_PROJECT="${DAILY_REPORT_PROJECT:-C:/claude}"
PROJECT="${1:-$DEFAULT_PROJECT}"
TODAY=$(date +%Y-%m-%d)
NOW=$(date "+%Y-%m-%d %H:%M:%S")
RECORDER="${DAILY_REPORT_RECORDER:-$(git config user.name 2>/dev/null || echo "未知")}"

# 检查必填配置
if [ -z "${DAILY_REPORT_BASE_TOKEN:-}" ]; then
  echo "错误: 未设置 DAILY_REPORT_BASE_TOKEN 环境变量"
  echo "请在 ~/.claude/settings.json 的 env 中添加该配置"
  exit 1
fi

if [ -z "${DAILY_REPORT_TABLE_ID:-}" ]; then
  echo "错误: 未设置 DAILY_REPORT_TABLE_ID 环境变量"
  echo "请在 ~/.claude/settings.json 的 env 中添加该配置"
  exit 1
fi

echo "=== 工作日报生成器 ==="
echo "日期: $TODAY"
echo "项目: $PROJECT"
echo "记录人: $RECORDER"
echo "目标表格: $DAILY_REPORT_TABLE_ID"
echo ""

# 1. 获取今日 Git 提交
echo "--- 今日 Git 提交记录 ---"
COMMITS=$(git -C "$PROJECT" log \
  --since="$TODAY 00:00:00" \
  --until="$TODAY 23:59:59" \
  --pretty=format:"%H||%s||%an||%ai" \
  --all 2>/dev/null || true)

if [ -z "$COMMITS" ]; then
  echo "⚠ 今天无 Git 提交记录"
  echo "请通过 Claude Code 的 /daily-report 命令手动输入工作内容"
  exit 0
fi

echo "$COMMITS" | while IFS='||' read -r hash msg author date; do
  echo "  [$date] $author: $msg"
done

echo ""
echo "共 $(echo "$COMMITS" | wc -l) 条提交记录"
echo ""

# 2. 推断字段并生成 JSON
echo "--- 生成多维表格记录 ---"

build_json() {
  local fields='["优先级","类别","工作内容","说明","记录时间","记录人","预计完成时间"]'
  local rows="["
  local first=true

  echo "$COMMITS" | while IFS='||' read -r hash msg author date; do
    # 推断类别
    local category="开发"
    if echo "$msg" | grep -qiE 'fix|bug|修复|hotfix'; then
      category="维护"
    elif echo "$msg" | grep -qiE '沟通|会议|meeting|minutes|纪要'; then
      category="沟通"
    elif echo "$msg" | grep -qiE '研发|research|调研|POC|prototype'; then
      category="研发"
    elif echo "$msg" | grep -qiE 'docs|doc\b|文档|软著'; then
      category="软著"
    fi

    # 推断优先级
    local priority="中"
    if echo "$msg" | grep -qiE '紧急|hotfix|critical'; then
      priority="高"
    elif echo "$msg" | grep -qiE 'chore|cleanup|^docs'; then
      priority="低"
    fi

    # 提取工作内容（第一行/短摘要）和说明
    local content=$(echo "$msg" | head -1 | sed 's/"/\\"/g')
    local note="null"
    local second_line=$(echo "$msg" | tail -n +2 | head -1)
    if [ -n "$second_line" ]; then
      note="\"$(echo "$second_line" | sed 's/"/\\"/g')\""
    fi

    # 格式化日期
    local formatted_date=$(echo "$date" | sed 's/ / /' | cut -d' ' -f1-2)

    local row="[\"$priority\",\"$category\",\"$content\",$note,\"$formatted_date\",\"$author\",null]"
    rows="${rows}${row},"
  done

  rows="${rows%,}]"
  echo "{\"fields\":$fields,\"rows\":$rows}"
}

JSON_FILE=$(mktemp)
build_json > "$JSON_FILE"

echo "JSON 数据已生成: $JSON_FILE"
cat "$JSON_FILE" | head -c 500
echo ""
echo "..."

# 3. 写入飞书多维表格
echo ""
echo "--- 写入飞书多维表格 ---"
npx @larksuite/cli@latest base +record-batch-create \
  --base-token "$DAILY_REPORT_BASE_TOKEN" \
  --table-id "$DAILY_REPORT_TABLE_ID" \
  --json @"$JSON_FILE"

rm -f "$JSON_FILE"
echo ""
echo "=== 完成 ==="
