# AI Dev Kit

AI 开发工具集合，包含多个实用脚本和工具。

## 项目列表

| 项目 | 目录 | 说明 |
|------|------|------|
| AI Gateway | `ai_gateway/` | 本地 AI 网关，统一管理 LLM API 配置，智能体只需配置一次 |
| 工作日报 | `daily-report/` | 从 Git 提交生成日报并写入飞书多维表格 |
| AI 新闻日报 | `ai-news/` | AI 领域新闻采集、整理、飞书写入与 HTML 日报生成 |
| 网站截图 | `screenshot/` | 多网站批量截图采集，自动处理懒加载/Cloudflare/字体，分类输出 |
| Word 转 Markdown | `word-to-md/` | Word 文档转 Markdown 格式工具 |
| 密码管理器 | `password-manager/` | 本地密码管理器，AES 加密存储，自动备份，支持 Web 和 Electron 双模式 |
| 像素画编辑器 | `pixel-art-editor/` | 浏览器端像素画绘制工具，支持多种画笔、图层、撤销重做、导出 PNG |

## 快速开始

进入对应子项目目录，查看各自的 `CLAUDE.md` 或 `SKILL.md` 了解详细使用方法。

## 环境要求

- Node.js（部分项目依赖）
- 飞书 API 配置（飞书集成相关项目）

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。你可以自由地使用、修改和分发代码，无需任何限制。
