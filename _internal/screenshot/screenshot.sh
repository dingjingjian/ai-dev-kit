#!/usr/bin/env bash
# 网站截图批量采集 — Shell 封装
# 用法:
#   bash screenshot.sh                        # 使用默认 sites.json
#   bash screenshot.sh --config custom.json   # 使用自定义配置
#   bash screenshot.sh --headed               # 强制有头模式
#   bash screenshot.sh --output ./myshots     # 自定义输出目录
#
# 全局命令: /screenshot (通过 Claude Code Skill)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "错误: 未找到 Node.js，请先安装"
  exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
  echo "首次运行，正在安装依赖..."
  npm install puppeteer --save 2>&1 | tail -5
fi

# 运行
node capture.js "$@"
