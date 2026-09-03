const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('console', m => { if(m.text().startsWith('DBG')) console.log(m.text()); });
  await page.goto('file:///C:/Users/dingj/Documents/git/ai-dev-kit/solar-system-3d/index.html');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:/Users/dingj/Documents/git/ai-dev-kit/solar-system-3d/shot_pw.png' });
  await browser.close();
})();
