const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname + '/..';
const PORT = 8733;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const GRID_N = 6;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.statusCode = 404; res.end(); return; }
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const grid = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null];
  const built = ['house','house','cafe','windmill','watertower','recycling','park','market'];
  built.forEach((b,i) => grid[i] = b);
  const save = { grid, coins: 1200, mastered: Object.fromEntries(built.map(b=>[b,true])), pop: 14, popPeak: 14, backlog: 0, built: built.length, last: Date.now() };

  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(`localStorage.setItem('pcity_v2', ${JSON.stringify(JSON.stringify(save))});`);
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.click('#btnUtil');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, 'shots', 'util-demand.png') });

  const data = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.udm').forEach((row, i) => {
      const bar = row.querySelector('.bar');
      const fill = bar.querySelector('.fill');
      const rb = bar.getBoundingClientRect();
      const rf = fill.getBoundingClientRect();
      const cs = getComputedStyle(bar);
      const fs = getComputedStyle(fill);
      out.push({
        i, label: row.querySelector('.tagt')?.textContent,
        bar_h: rb.height, bar_w: rb.width,
        fill_h: rf.height, fill_w: rf.width, fill_top_offset: rf.top - rb.top,
        bar_boxSizing: cs.boxSizing, bar_border: cs.borderTopWidth+'/'+cs.borderBottomWidth,
        bar_height_css: cs.height, bar_padding: cs.paddingTop+'/'+cs.paddingBottom,
        fill_height_css: fs.height, fill_pos: fs.position, fill_top_css: fs.top
      });
    });
    return out;
  });
  console.log(JSON.stringify(data, null, 2));
  await ctx.close();
  await browser.close();
  server.close();
})();
