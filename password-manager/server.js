// ============================================================
// Web 服务器入口 - 复用共享路由
// 用于 npm run web(纯浏览器访问模式)
// ============================================================

const path = require('path');
const { createApp } = require('./routes');

const { app } = createApp();
const PORT = 3000;

function tryListen(port) {
  const s = app.listen(port, () => {
    console.log(`密码管理器已启动: http://localhost:${port}`);
    console.log(`数据文件: ${path.join(__dirname, 'data.enc')}`);
    const fs = require('fs');
    fs.writeFileSync(path.join(__dirname, '.port'), String(port), 'utf8');
  });
  s.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 3010) {
      console.log(`端口 ${port} 已被占用,尝试端口 ${port + 1}...`);
      tryListen(port + 1);
    } else {
      console.error(`启动失败: ${err.message}`);
      process.exit(1);
    }
  });
}

tryListen(PORT);
