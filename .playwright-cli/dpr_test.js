async page => {
  await page.mouse.move(640, 400);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(640 - i * 30, 400 - i * 8); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(600);
  // 用 raycaster 验证：把鼠标指向标签中心，看能否拾取到对应天体
  const r = await page.evaluate(() => {
    const t = document.getElementById('tagSun').getBoundingClientRect();
    return JSON.stringify({ tagSunCenter: [Math.round(t.x + t.width / 2), Math.round(t.y + t.height / 2)] });
  });
  console.log('AFTER_ROTATE: ' + r);
  await page.screenshot({ path: 'shot4.png' });
}
