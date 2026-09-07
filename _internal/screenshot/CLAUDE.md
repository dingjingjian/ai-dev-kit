# Website Screenshot Capture Project

## 通用网站截图工具

### 快捷命令

输入 `/screenshot` 启动交互式截图流程——会先询问你要截什么网站（Skill 文件: `~/.claude/skills/screenshot/SKILL.md`）。
也可以 `/screenshot <URL>` 直接指定网址。

### 工作流程

1. **收集目标网站** — 询问用户要截图的 URL（或在命令中直接提供）
2. **启动浏览器** — 默认 headed 模式（可绕过 Cloudflare），支持 headless 降级
3. **逐站截图** — 加载页面 → 等待字体 → 关闭 Cookie 弹窗 → 滚动触发懒加载 → 全页截图
4. **分类保存** — 按 folder 分组存入对应子目录
5. **汇总报告** — 展示成功/失败统计，列出所有输出文件

### 核心特性

| 特性 | 说明 |
|------|------|
| **懒加载处理** | 自动逐步滚动页面，触发 Intersection Observer / scroll 事件加载内容 |
| **Cloudflare 绕过** | headed 模式 + 隐藏 webdriver 属性 + 等待 JS 挑战自动通过 |
| **字体等待** | `document.fonts.ready` 确保 Web 字体加载完成再截图 |
| **Cookie 弹窗** | 自动识别并点击"接受"/"同意"按钮 |
| **分类输出** | 按 site.folder 分组，自动创建子目录 |

### 文件说明

| 文件 | 说明 |
|------|------|
| `capture.js` | 核心截图脚本（Node.js） |
| `sites.json` | 站点配置文件（网站列表 + 全局设置） |
| `screenshot.sh` | Shell 封装脚本 |
| `CLAUDE.md` | 本文档 |

### 配置项 (sites.json)

#### 全局设置 (settings)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `mode` | string | `"auto"` | 浏览器模式: `"headed"` / `"headless"` / `"auto"` |
| `viewport` | object | `{width:1440,height:900}` | 视口尺寸 |
| `navigationTimeout` | number | `90000` | 页面加载超时（ms） |
| `waitUntil` | string | `"networkidle0"` | 加载策略: `networkidle0` / `networkidle2` / `domcontentloaded` |
| `initialWait` | number | `3000` | 页面加载后初始等待（ms） |
| `scrollToLoad` | boolean | `true` | 是否启用滚动懒加载触发 |
| `scrollWait` | number | `800` | 每次滚动后等待（ms） |
| `cloudflareTimeout` | number | `30000` | Cloudflare 挑战等待超时（ms），0 = 不等待 |
| `hideWebdriver` | boolean | `true` | 是否隐藏 webdriver 自动化标识 |
| `screenshotType` | string | `"png"` | 截图格式: `"png"` / `"jpeg"` |
| `fullPage` | boolean | `true` | 是否全页截图 |

#### 站点配置 (sites[].)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 站点名称（用作文件名） |
| `url` | string | ✓ | 目标 URL |
| `folder` | string | ✓ | 输出子目录 |
| `viewport` | object | ✗ | 覆盖全局视口设置 |
| `userAgent` | string | ✗ | 自定义 User-Agent |
| `cloudflareTimeout` | number | ✗ | 覆盖全局 Cloudflare 等待时间 |
| `scrollToLoad` | boolean | ✗ | 覆盖全局滚动加载设置 |

### 命令行用法

```bash
# 直接传 URL（最常用）
node capture.js https://example.com https://google.com

# 指定输出子目录
node capture.js https://example.com --folder my-shots

# 使用预设站点配置文件
node capture.js --config sites.json

# 强制有头模式（绕过 Cloudflare）
node capture.js https://example.com --headed

# 强制无头模式（CI/服务器环境）
node capture.js https://example.com --headless

# 自定义输出目录
node capture.js https://example.com --output ./my-screenshots
```

### 站点配置示例

```json
{
  "settings": {
    "mode": "auto",
    "viewport": { "width": 1920, "height": 1080 }
  },
  "sites": [
    {
      "name": "示例网站",
      "url": "https://example.com",
      "folder": "1-分类名称"
    },
    {
      "name": "Cloudflare 保护站点",
      "url": "https://protected.example.com",
      "folder": "2-另一分类",
      "cloudflareTimeout": 60000
    }
  ]
}
```

### 常见问题与处理策略

| 问题 | 现象 | 解决方案 |
|------|------|----------|
| **样式错位** | CSS 布局混乱 | 1) 确保 headed 模式 2) 增大 initialWait 3) 使用 networkidle0 |
| **懒加载未触发** | 截图中部/下部空白 | 启用 scrollToLoad（默认），增大 scrollWait |
| **Cloudflare 403** | 仅显示 "Just a moment..." | 1) 使用 headed 模式 2) 设置 cloudflareTimeout 3) 启用 hideWebdriver |
| **字体未加载** | 文字显示为默认字体 | 已内置 `document.fonts.ready` 等待 |
| **Cookie 弹窗遮挡** | 弹窗盖住内容 | 已内置自动关闭逻辑 |
| **页面加载超时** | navigation timeout | 增大 navigationTimeout，或改用 domcontentloaded |
| **动态内容缺失** | JS 渲染内容为空白 | 增大 initialWait，确保 waitUntil=networkidle0 |

### 依赖

- **Node.js** ≥ 18
- **puppeteer** (npm 包)
- **浏览器**: Microsoft Edge 或 Google Chrome
- **操作系统**: Windows 10+ / macOS / Linux（headed 模式需要桌面环境）

### 如何调整

- **添加/修改网站**: 编辑 `sites.json` 的 `sites` 数组
- **修改截图参数**: 编辑 `sites.json` 的 `settings`
- **修改截图逻辑**: 编辑 `capture.js` 的核心函数
- **修改全局命令行为**: 编辑 `~/.claude/skills/screenshot/SKILL.md`
- **停用全局命令**: 删除 `~/.claude/skills/screenshot/SKILL.md`
