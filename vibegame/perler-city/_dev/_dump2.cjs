const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname + '/..'; const PORT = 8734; const URL = `http://127.0.0.1:${PORT}/index.html`;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.statusCode = 404; res.end(); return; } res.end(d); });
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const grid = Array(36).fill(null);
  ['house','house','cafe','windmill','watertower','recycling','park','market'].forEach((b,i)=>grid[i]=b);
  const built = ['house','house','cafe','windmill','watertower','recycling','park','market'];
  const save = { grid, coins: 1200, mastered: Object.fromEntries(built.map(b=>[b,true])), pop: 14, popPeak: 14, backlog: 0, built: 8, last: Date.now() };
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(`localStorage.setItem('pcity_v2', ${JSON.stringify(JSON.stringify(save))});`);
  await page.goto(URL); await page.waitForTimeout(800);
  await page.click('#btnUtil'); await page.waitForTimeout(600);
  const rects = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.udm').forEach((row, i) => {
      const bar = row.querySelector('.bar'), fill = bar.querySelector('.fill');
      const rb = bar.getBoundingClientRect(), rf = fill.getBoundingClientRect();
      out.push({ i, label: row.querySelector('.tagt')?.textContent,
        bar: { x: rb.x, y: rb.y, w: rb.width, h: rb.height },
        fill: { x: rf.x, y: rf.y, w: rf.width, h: rf.height } });
    });
    // 也 dump 市政 mbar 对比
    document.querySelectorAll('.ures').forEach((row, i) => {
      const bar = row.querySelector('.mbar'), fill = bar.querySelector('span');
      if (!bar) return;
      const rb = bar.getBoundingClientRect(), rf = fill.getBoundingClientRect();
      out.push({ i: 'res'+i, label: row.querySelector('.ures-n')?.textContent,
        bar: { x: rb.x, y: rb.y, w: rb.width, h: rb.height },
        fill: { x: rf.x, y: rf.y, w: rf.width, h: rf.height } });
    });
    return out;
  });
  console.log(JSON.stringify(rects, null, 2));
  await page.screenshot({ path: path.join(__dirname, 'shots', 'util-demand2.png') });
  await ctx.close(); await browser.close(); server.close();
})();
