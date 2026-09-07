---
name: screenshot
description: 通用网站截图工具 — 输入 URL 即可截图，自动处理懒加载/Cloudflare/字体
metadata:
  skill-type: user
---

# 通用网站截图工具

## 触发方式

- `/screenshot` — 交互式询问要截图的网站
- `/screenshot <URL> [URL...]` — 直接指定一个或多个网站
- `/screenshot --headed` — 强制有头模式
- `/screenshot --config sites.json` — 使用预设站点列表批量截图

## 项目位置

```
C:/Users/ASUS/Documents/git/claude/screenshot/
├── capture.js    ← 核心截图脚本
├── sites.json    ← 站点配置文件（可选预设）
├── screenshot.sh ← Shell 封装
├── CLAUDE.md     ← 项目文档
└── output/       ← 截图输出目录
```

## 执行流程

### 1. 收集目标网站

**如果用户在命令中已提供 URL**（如 `/screenshot https://example.com https://google.com`），直接使用。

**否则，必须询问用户**：

> 请问您需要截取哪些网站的图片？请提供网站 URL（可以一次提供多个）。
>
> 可选：您也可以指定以下偏好（不指定则使用默认值）：
> - 输出子目录名称（默认 `screenshots`）
> - 视口尺寸（默认 1440×900）
> - 是否需要全页截图（默认是）
> - 浏览器模式（默认有头，可绕过 Cloudflare）

根据用户回复提取：URL 列表、输出目录偏好、视口尺寸等。

### 2. 安装依赖（首次）

检查 `screenshot/node_modules/` 是否存在，如果不存在：

```bash
cd C:/Users/ASUS/Documents/git/claude/screenshot
npm init -y
set PUPPETEER_SKIP_DOWNLOAD=true
npm install puppeteer
```

使用 Edge 浏览器（`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`），无需安装 Chromium。

### 3. 执行截图

根据用户输入构造命令：

```bash
# 直接传 URL（自动推导文件名）
node C:/Users/ASUS/Documents/git/claude/screenshot/capture.js https://example.com https://google.com

# 指定输出子目录和有头模式
node C:/Users/ASUS/Documents/git/claude/screenshot/capture.js https://example.com --folder "我的截图" --headed

# 使用预设站点列表
node C:/Users/ASUS/Documents/git/claude/screenshot/capture.js --config sites.json --headed
```

脚本自动执行以下步骤：
1. 启动浏览器（默认 headed）
2. 逐站加载页面，等待 `networkidle0`
3. 等待 `document.fonts.ready`（Web 字体就绪）
4. 自动关闭 Cookie 同意弹窗
5. 逐步滚动页面触发懒加载内容
6. 回到顶部，整页截图
7. 按分类目录保存

### 4. 展示结果

截图完成后，向用户展示：
- 成功/失败统计
- 每个分类下的文件及大小
- 输出目录路径

## 使用预设站点列表（可选）

如果用户说「用默认站点列表」「用 sites.json」「批量截图预设网站」，使用预配置文件：

```bash
node C:/Users/ASUS/Documents/git/claude/screenshot/capture.js --config C:/Users/ASUS/Documents/git/claude/screenshot/sites.json --headed
```

预设站点列表可通过编辑 `sites.json` 的 `sites` 数组来增删改。

## 关键参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `URL...` | 直接在命令行传入一个或多个网址 | — |
| `--config` | 站点配置文件路径 | `sites.json` |
| `--headed` | 强制有头浏览器 | auto（自动 headed） |
| `--headless` | 强制无头浏览器 | — |
| `--output` / `-o` | 输出根目录 | `output/` |
| `--folder` / `-f` | 输出子目录（直传 URL 时） | `screenshots` |

## 配置修改（按需）

如果用户描述中包含以下意图：

| 用户说 | 操作 |
|--------|------|
| "加上/添加 xxx 网站" | 如果是预设模式，在 sites.json 的 sites 数组中追加新条目 |
| "去掉/删除 xxx" | 从 sites 数组中移除对应条目 |
| "换个输出目录" | 修改 settings.outputDir 或用 `--output` |
| "用 1920x1080" | 修改 settings.viewport |
| "只要截图某几个" | 临时注释掉或移除不需要的条目再执行 |

## 输出结构

```
output/
├── screenshots/
│   ├── example.com.png
│   └── google.com.png
├── 我的截图/
│   └── some-site.com.png
└── 1-蓝色科技/        （预设站点列表模式）
    ├── 哈尔滨工程大学信息化处.png
    └── ...
```

## 故障处理

| 问题 | 解决方案 |
|------|----------|
| 样式错位 | 强制 headed 模式: `--headed` |
| 懒加载内容缺失 | 确认 `scrollToLoad: true`，增大 `scrollWait` |
| Cloudflare 拦截 | headed 模式 + `cloudflareTimeout: 60000` |
| 字体显示异常 | 检查 `initialWait` ≥ 3000 |
| 浏览器未找到 | 安装 Edge 或设置 `executablePath` |
| Node.js 依赖缺失 | `cd screenshot && npm install puppeteer` |
