// 临时截图脚本：headless Edge + SwiftShader 渲染真实 3D 场景为 1:1 图标。跑完即删
const { chromium } = require('C:/Users/dingj/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 2 });
  const msgs = [];
  page.on('console', m => msgs.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => msgs.push('[pageerror] ' + e.message));

  const url = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load' });

  // 隐藏顶栏/底栏，只留画布
  await page.addStyleTag({ content: `
    .topbar { display: none !important; }
    .bottombar { display: none !important; }
    #app { height: 100vh; width: 100vw; }
  `});
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(1800);

  const dir = path.join(__dirname, '_tmp_shots');
  fs.mkdirSync(dir, { recursive: true });

  async function shot(name) {
    await page.screenshot({ path: path.join(dir, name + '.png') });
  }
  const click = (id) => page.evaluate((x) => document.getElementById(x).click(), id);

  // 1) 默认展示视角（火箭+发射台+勤务塔+地球）
  await shot('icon-01-default');

  // 2) 拆解爆炸视角
  await click('btn-explode');
  await page.waitForTimeout(2600);
  await shot('icon-02-explode');

  // 回到展示模式
  await click('btn-show');
  await page.waitForTimeout(1800);

  // 3) 发射模式点火瞬间（倒计时结束刚点火，尾焰最亮）
  await click('btn-launch');
  await page.waitForTimeout(400);
  await click('btn-ignite');
  await page.waitForTimeout(3300);
  await shot('icon-03-ignite');

  // 4) 升空过程
  await page.waitForTimeout(5000);
  await shot('icon-04-ascent');

  console.log('--- console ---');
  console.log(msgs.slice(0, 20).join('\n') || '(无)');
  await browser.close();
})();
