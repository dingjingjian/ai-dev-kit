// 临时验证拆解模式的独立展示空间，跑完即删
const { chromium } = require('C:/Users/dingj/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
  const msgs = [];
  page.on('console', m => { if (m.type() === 'error') msgs.push(m.text()); });
  page.on('pageerror', e => msgs.push('[pageerror] ' + e.message));
  const dir = path.join(__dirname, '_tmp_explode');
  fs.mkdirSync(dir, { recursive: true });
  await page.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, '0-show.png') });
  await page.click('#btn-explode');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(dir, '1-explode.png') });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(dir, '2-explode-settled.png') });
  // 点一个标签看说明
  const tags = await page.$$('#labels .ptag');
  if (tags.length) { await tags[0].click(); await page.waitForTimeout(600); }
  await page.screenshot({ path: path.join(dir, '3-label.png') });
  // 返回展示模式
  await page.click('#btn-show');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, '4-back-to-show.png') });
  console.log('标签数:', tags.length, ' 阶段:', await page.evaluate(() => document.getElementById('phase-text').textContent));
  console.log('控制台错误:', msgs.slice(0, 8).join(' || ') || '(无)');
  await browser.close();
})();
