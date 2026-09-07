# 网站截图 - Screenshot

> **分类**：`#vibetool` 实用工具　·　分类索引见根目录 [`TRACKS.md`](../../TRACKS.md)

输入 URL 即可截图，自动处理懒加载、Cloudflare 拦截与 Web 字体，按分类输出。

## 运行方式

```bash
# 直接传 URL
node capture.js https://example.com https://google.com

# 指定输出子目录 + 有头模式
node capture.js https://example.com --folder "我的截图" --headed

# 使用预设站点列表
node capture.js --config sites.json --headed
```

也支持快捷命令 `/screenshot <URL>`，见 [`SKILL.md`](SKILL.md)。

## 关键参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `URL...` | 一个或多个网址 | — |
| `--config` | 站点配置文件 | `sites.json` |
| `--headed` / `--headless` | 浏览器模式 | 自动有头 |
| `--output` / `-o` | 输出根目录 | `output/` |
| `--folder` / `-f` | 输出子目录 | `screenshots` |

## 执行细节

启动浏览器 → 等待 `networkidle0` 与 `document.fonts.ready` → 关闭 Cookie 弹窗 → 滚动触发懒加载 → 回到顶部整页截图 → 按分类保存。

使用系统 Edge（无需下载 Chromium）。首次运行若缺依赖：`npm install puppeteer`（已设 `PUPPETEER_SKIP_DOWNLOAD=true`）。

## 已知问题

`SKILL.md` 中仍残留迁移前的硬编码路径 `C:/Users/ASUS/Documents/git/claude/screenshot/`。项目已迁至 `vibetool/screenshot/`，执行时应以本目录为基准使用相对路径——仓库约定禁止硬编码绝对路径。

## 物料状态

自用工具，不投稿。

## 分类判定

"把一批网站的图截下来"是明确任务 → `#vibetool`。
