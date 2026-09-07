#!/usr/bin/env node
/**
 * 网站截图批量采集工具
 *
 * 功能：
 *   - 批量捕获多个网站的整页截图
 *   - 自动处理滚动懒加载内容
 *   - 支持 headed/headless 模式切换（绕过 Cloudflare 等反爬）
 *   - 按分类目录组织输出
 *
 * 用法：
 *   node capture.js [--config sites.json] [--headed] [--headless]
 *
 * 配置：
 *   通过 sites.json 定义网站列表，或通过环境变量 SCREENSHOT_CONFIG 指定配置文件路径
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// ============================================================
// 默认配置
// ============================================================
const DEFAULT_CONFIG = {
  // 输出根目录
  outputDir: path.resolve(__dirname, 'output'),
  // 浏览器模式：'headed' | 'headless' | 'auto'
  // auto: 优先 headed，不支持时降级
  mode: 'auto',
  // 视口尺寸
  viewport: { width: 1440, height: 900 },
  // 页面加载超时（毫秒）
  navigationTimeout: 90000,
  // 页面加载策略：'networkidle0' | 'networkidle2' | 'domcontentloaded'
  waitUntil: 'networkidle0',
  // 初始等待时间（毫秒）
  initialWait: 3000,
  // 是否启用滚动懒加载触发
  scrollToLoad: true,
  // 每次滚动后等待时间（毫秒）
  scrollWait: 800,
  // Cloudflare 挑战等待超时（毫秒），0 表示不等待
  cloudflareTimeout: 30000,
  // 浏览器可执行文件路径（null 表示自动检测）
  executablePath: null,
  // 是否隐藏 webdriver 属性
  hideWebdriver: true,
  // 截图类型：'png' | 'jpeg'
  screenshotType: 'png',
  // JPEG 质量（仅对 jpeg 有效）
  jpegQuality: 90,
  // 是否全页截图
  fullPage: true,
};

// 已知的浏览器路径
const KNOWN_BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

// ============================================================
// 工具函数
// ============================================================

/**
 * 自动检测可用的浏览器路径
 */
function detectBrowser() {
  for (const p of KNOWN_BROWSERS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    config: null,
    headed: null,  // null = use config default
    outputDir: null,
    folder: null,  // output subfolder for positional URLs
    urls: [],      // positional URL arguments
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--config':
        opts.config = args[++i];
        break;
      case '--headed':
        opts.headed = true;
        break;
      case '--headless':
        opts.headed = false;
        break;
      case '--output':
      case '-o':
        opts.outputDir = args[++i];
        break;
      case '--folder':
      case '-f':
        opts.folder = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
网站截图批量采集工具 — Website Screenshot Capture

用法:
  node capture.js [选项] [URL...]
  node capture.js --config <file> [选项]

选项:
  --config <path>   指定站点配置文件（默认: sites.json）
  --headed          强制使用有头浏览器模式
  --headless        强制使用无头浏览器模式
  --output, -o      指定输出根目录
  --folder, -f      指定输出子目录（用于命令行直传 URL 时）
  --help, -h        显示帮助信息

示例:
  node capture.js https://example.com https://google.com
  node capture.js https://example.com --folder my-shots --headed
  node capture.js --config my-sites.json --headed
  node capture.js --output ./my-screenshots
`);
        process.exit(0);
    }
  }

  // 收集剩余的 positional 参数中看起来像 URL 的
  // (process.argv 已经处理完 flags，但 args 数组还可能有未消费的参数)
  // 重新遍历一次，收集未被 switch 消费的非 flag 参数
  const consumed = new Set();
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') || args[i].startsWith('-')) {
      consumed.add(i);
      // 如果这个 flag 有参数值，也标记为已消费
      const flag = args[i];
      if (['--config', '--output', '-o', '--folder', '-f'].includes(flag)) {
        consumed.add(i + 1);
      }
    }
  }
  for (let i = 0; i < args.length; i++) {
    if (!consumed.has(i)) {
      const arg = args[i];
      if (arg.startsWith('http://') || arg.startsWith('https://')) {
        opts.urls.push(arg);
      }
    }
  }

  return opts;
}

/**
 * 加载站点配置
 */
function loadConfig(configPath) {
  const filePath = configPath || path.resolve(__dirname, 'sites.json');
  if (!fs.existsSync(filePath)) {
    console.error(`配置文件不存在: ${filePath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // 合并默认配置
  return {
    ...DEFAULT_CONFIG,
    ...raw.settings,
    sites: raw.sites || [],
  };
}

// ============================================================
// 核心截图逻辑
// ============================================================

/**
 * 滚动页面以触发懒加载内容
 */
async function scrollToTriggerLazyLoad(page, wait = 800) {
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  console.log(`  页面高度: ${pageHeight}px, 视口: ${viewportHeight}px`);

  // 逐步向下滚动
  const steps = Math.ceil(pageHeight / viewportHeight) + 2;
  for (let i = 1; i <= steps; i++) {
    const scrollY = Math.min(i * viewportHeight * 0.75, pageHeight);
    await page.evaluate((y) => {
      window.scrollTo({ top: y, behavior: 'instant' });
    }, scrollY);
    await page.evaluate((t) => new Promise(r => setTimeout(r, t)), wait);
  }

  // 滚回顶部
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));

  const newHeight = await page.evaluate(() => document.body.scrollHeight);
  if (newHeight > pageHeight) {
    console.log(`  懒加载触发后高度: ${pageHeight}px → ${newHeight}px`);

    // 如果有新内容加载，再滚动一次
    const moreSteps = Math.ceil((newHeight - pageHeight) / viewportHeight) + 1;
    for (let i = 1; i <= moreSteps; i++) {
      const scrollY = Math.min(pageHeight + i * viewportHeight * 0.75, newHeight);
      await page.evaluate((y) => {
        window.scrollTo({ top: y, behavior: 'instant' });
      }, scrollY);
      await page.evaluate((t) => new Promise(r => setTimeout(r, t)), wait);
    }

    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  }
}

/**
 * 等待 Cloudflare 等反爬挑战自动通过
 */
async function waitForCloudflare(page, timeout = 30000) {
  if (timeout <= 0) return false;

  const title = await page.title();
  if (!title.includes('Just a moment') && !title.includes('请稍候')) {
    return false; // 没有 Cloudflare 挑战
  }

  console.log('  检测到 Cloudflare 挑战，等待自动通过...');
  const start = Date.now();

  try {
    await page.waitForFunction(
      () => !document.title.includes('Just a moment') && !document.title.includes('请稍候'),
      { timeout, polling: 1000 }
    );
    console.log(`  挑战已通过 (耗时 ${((Date.now() - start) / 1000).toFixed(0)}s)`);
    return true;
  } catch {
    console.log(`  挑战未在 ${timeout / 1000}s 内通过`);
    return false;
  }
}

/**
 * 尝试关闭 Cookie 同意弹窗
 */
async function dismissCookieBanners(page) {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase().trim();
      if (['accept all', 'accept all cookies', 'accept', 'allow', 'ok',
           'agree', 'continue', 'close', 'got it', '同意', '确认', '我知道了'].includes(text)) {
        try { btn.click(); } catch (e) { /* ignore */ }
        break;
      }
    }
  });
}

/**
 * 截取单个网站
 */
async function captureSite(browser, site, config, index, total) {
  const page = await browser.newPage();
  const label = site.name || new URL(site.url).hostname;
  const folder = site.folder || 'default';

  try {
    console.log(`\n[${index + 1}/${total}] ${label}`);
    console.log(`  URL: ${site.url}`);

    // 设置视口
    const viewport = site.viewport || config.viewport;
    await page.setViewport(viewport);

    // 隐藏自动化标识
    if (config.hideWebdriver || site.hideWebdriver) {
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
      });
    }

    // 设置自定义 User-Agent（如果指定）
    if (site.userAgent) {
      await page.setUserAgent(site.userAgent);
    }

    // 设置额外的 HTTP 头
    if (site.extraHeaders) {
      await page.setExtraHTTPHeaders(site.extraHeaders);
    }

    // 导航到页面
    const waitUntil = site.waitUntil || config.waitUntil;
    const timeout = site.timeout || config.navigationTimeout;

    console.log('  加载中...');
    await page.goto(site.url, { waitUntil, timeout });

    // 等待 Cloudflare 挑战
    const cfTimeout = site.cloudflareTimeout ?? config.cloudflareTimeout;
    await waitForCloudflare(page, cfTimeout);

    // 等待字体加载
    await page.evaluate(() => document.fonts.ready);
    console.log('  字体就绪');

    // 初始等待
    const wait = site.initialWait ?? config.initialWait;
    await page.evaluate((t) => new Promise(r => setTimeout(r, t)), wait);

    // 关闭 Cookie 弹窗
    await dismissCookieBanners(page);
    await page.evaluate((t) => new Promise(r => setTimeout(r, t)), 500);

    // 滚动触发懒加载
    if ((site.scrollToLoad ?? config.scrollToLoad) !== false) {
      console.log('  滚动触发懒加载...');
      await scrollToTriggerLazyLoad(page, site.scrollWait || config.scrollWait);
    }

    // 最终等待
    await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));

    // 确保字体再次就绪
    await page.evaluate(() => document.fonts.ready);

    // 截图
    const outputDir = config.outputDir;
    const categoryDir = path.join(outputDir, folder);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    const safeName = label.replace(/[<>:"/\\|?*]/g, '-');
    const ext = config.screenshotType === 'jpeg' ? 'jpg' : 'png';
    const filename = `${safeName}.${ext}`;
    const filepath = path.join(categoryDir, filename);

    console.log('  正在截图...');
    const screenshotOpts = {
      path: filepath,
      fullPage: site.fullPage ?? config.fullPage,
      type: config.screenshotType,
    };
    if (config.screenshotType === 'jpeg') {
      screenshotOpts.quality = config.jpegQuality;
    }

    await page.screenshot(screenshotOpts);

    const stat = fs.statSync(filepath);
    const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ 已保存: ${folder}/${filename} (${sizeMB} MB)`);

    return { success: true, name: label, folder, filepath, size: stat.size };

  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);
    return { success: false, name: label, folder, error: err.message };
  } finally {
    await page.close();
  }
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  const opts = parseArgs();
  const config = loadConfig(opts.config);

  // 如果命令行传了 URL，直接用它们构建 site 列表
  if (opts.urls.length > 0) {
    const defaultFolder = opts.folder || 'screenshots';
    config.sites = opts.urls.map(url => {
      let hostname;
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = url;
      }
      return {
        name: hostname,
        url: url,
        folder: defaultFolder,
      };
    });
    console.log(`从命令行接收 ${opts.urls.length} 个 URL，输出目录: ${defaultFolder}/`);
  }

  // 如果还是没有 site，报错
  if (!config.sites || config.sites.length === 0) {
    console.error('没有可截图的网站。请通过以下方式提供网站：');
    console.error('  node capture.js https://example.com https://google.com');
    console.error('  node capture.js --config sites.json');
    process.exit(1);
  }

  // 确定输出目录
  if (opts.outputDir) {
    config.outputDir = path.resolve(opts.outputDir);
  }
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  // 确定浏览器模式
  let headless;
  if (opts.headed === true) {
    headless = false;
    config.mode = 'headed';
  } else if (opts.headed === false) {
    headless = true;
    config.mode = 'headless';
  } else if (config.mode === 'headed') {
    headless = false;
  } else if (config.mode === 'headless') {
    headless = true;
  } else {
    // auto: 优先 headed（可绕过 Cloudflare），但仅在有桌面环境时使用
    headless = false; // Windows 桌面环境始终用 headed
  }

  // 确定浏览器路径
  const execPath = config.executablePath || detectBrowser();
  if (!execPath) {
    console.error('未找到可用的浏览器。请设置 executablePath 配置项。');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════╗');
  console.log('║    🌐 网站截图批量采集工具 v1.0    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n浏览器: ${execPath}`);
  console.log(`模式: ${headless ? 'headless' : 'headed (有头)'}`);
  console.log(`输出: ${config.outputDir}`);
  console.log(`站点数: ${config.sites.length}`);
  console.log('');

  // 启动浏览器
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    executablePath: execPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      `--window-size=${config.viewport.width},${config.viewport.height}`,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const results = [];

  try {
    for (let i = 0; i < config.sites.length; i++) {
      const result = await captureSite(browser, config.sites[i], config, i, config.sites.length);
      results.push(result);
    }
  } finally {
    await browser.close();
  }

  // 汇总报告
  const success = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n═══════════════════════════════════════');
  console.log('            截图任务完成');
  console.log('═══════════════════════════════════════');
  console.log(`  成功: ${success.length} 个`);
  console.log(`  失败: ${failed.length} 个`);

  if (failed.length > 0) {
    console.log('\n  失败列表:');
    for (const f of failed) {
      console.log(`    - ${f.name}: ${f.error}`);
    }
  }

  if (success.length > 0) {
    console.log('\n  输出文件:');
    const categories = {};
    for (const s of success) {
      if (!categories[s.folder]) categories[s.folder] = [];
      categories[s.folder].push(s);
    }
    for (const [cat, items] of Object.entries(categories)) {
      console.log(`    📁 ${cat}/`);
      for (const item of items) {
        const sizeMB = (item.size / 1024 / 1024).toFixed(1);
        console.log(`      📄 ${path.basename(item.filepath)} (${sizeMB} MB)`);
      }
    }
  }

  console.log(`\n输出目录: ${config.outputDir}`);
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(err => {
    console.error('未处理的错误:', err);
    process.exit(1);
  });
}

// 导出以供其他模块使用
module.exports = {
  captureSite,
  scrollToTriggerLazyLoad,
  waitForCloudflare,
  dismissCookieBanners,
  detectBrowser,
  loadConfig,
  DEFAULT_CONFIG,
};
