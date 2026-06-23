const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { 
  isMasterPasswordSet, 
  setMasterPassword, 
  verifyMasterPassword,
  categoryOps,
  passwordOps,
  getPasswordHint,
  setPasswordHint,
  getBackupList,
  restoreFromBackup
} = require('./database');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 创建 Express 服务器
const expressApp = express();
const PORT = 3000;

expressApp.use(cors());
expressApp.use(express.json());
expressApp.use(express.static(path.join(__dirname, 'public')));

let isAuthenticated = false;

function requireAuth(req, res, next) {
  if (!isAuthenticated) {
    return res.status(401).json({ error: '未认证' });
  }
  next();
}

// 认证 API
expressApp.get('/api/auth/status', (req, res) => {
  res.json({ isSet: isMasterPasswordSet() });
});

expressApp.post('/api/auth/setup', (req, res) => {
  const { password, hint } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: '主密码至少需要4个字符' });
  }
  setMasterPassword(password, hint);
  isAuthenticated = true;
  res.json({ success: true });
});

expressApp.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (verifyMasterPassword(password)) {
    isAuthenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: '主密码错误' });
  }
});

expressApp.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!verifyMasterPassword(oldPassword)) {
    return res.status(401).json({ error: '原密码错误' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: '新密码至少需要4个字符' });
  }
  setMasterPassword(newPassword);
  res.json({ success: true });
});

expressApp.post('/api/auth/logout', (req, res) => {
  isAuthenticated = false;
  res.json({ success: true });
});

expressApp.get('/api/auth/hint', (req, res) => {
  res.json({ hint: getPasswordHint() });
});

expressApp.post('/api/auth/hint', requireAuth, (req, res) => {
  const { hint } = req.body;
  setPasswordHint(hint || '');
  res.json({ success: true });
});

// 分类 API
expressApp.get('/api/categories', requireAuth, (req, res) => {
  res.json(categoryOps.getAll());
});

expressApp.post('/api/categories', requireAuth, (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) return res.status(400).json({ error: '分类名称不能为空' });
  const result = categoryOps.create(name, icon || 'folder', color || '#4A90D9');
  res.json({ id: result.lastInsertRowid, success: true });
});

expressApp.put('/api/categories/:id', requireAuth, (req, res) => {
  const { name, icon, color } = req.body;
  const result = categoryOps.update(parseInt(req.params.id), name, icon, color);
  res.json({ success: true, changes: result.changes });
});

expressApp.delete('/api/categories/:id', requireAuth, (req, res) => {
  const result = categoryOps.delete(parseInt(req.params.id));
  res.json({ success: true, changes: result.changes });
});

// 密码 API
expressApp.get('/api/passwords', requireAuth, (req, res) => {
  res.json(passwordOps.getAll());
});

expressApp.get('/api/passwords/:id', requireAuth, (req, res) => {
  const password = passwordOps.getById(parseInt(req.params.id));
  if (!password) return res.status(404).json({ error: '记录不存在' });
  res.json(password);
});

expressApp.post('/api/passwords', requireAuth, (req, res) => {
  const { category_id, title, username, password, url, notes } = req.body;
  if (!title || !password) return res.status(400).json({ error: '标题和密码不能为空' });
  const result = passwordOps.create(category_id || null, title, username || '', password, url || '', notes || '');
  res.json({ id: result.lastInsertRowid, success: true });
});

expressApp.put('/api/passwords/:id', requireAuth, (req, res) => {
  const { category_id, title, username, password, url, notes } = req.body;
  const result = passwordOps.update(parseInt(req.params.id), category_id || null, title, username || '', password, url || '', notes || '');
  res.json({ success: true, changes: result.changes });
});

expressApp.delete('/api/passwords/:id', requireAuth, (req, res) => {
  const result = passwordOps.delete(parseInt(req.params.id));
  res.json({ success: true, changes: result.changes });
});

expressApp.put('/api/passwords/reorder', requireAuth, (req, res) => {
  const { order } = req.body;
  if (!order || !Array.isArray(order)) {
    return res.status(400).json({ error: '无效的排序数据' });
  }
  const result = passwordOps.updateOrder(order);
  res.json({ success: true, changes: result.changes });
});

expressApp.get('/api/passwords/search', requireAuth, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  res.json(passwordOps.search(`%${q}%`));
});

expressApp.get('/api/passwords/category/:categoryId', requireAuth, (req, res) => {
  res.json(passwordOps.getByCategory(parseInt(req.params.categoryId)));
});

// 导入导出 API
expressApp.get('/api/export', requireAuth, (req, res) => {
  res.json({
    version: '1.0',
    exportDate: new Date().toISOString(),
    categories: categoryOps.getAll(),
    passwords: passwordOps.getAll()
  });
});

expressApp.post('/api/import', requireAuth, (req, res) => {
  const { categories, passwords } = req.body;
  if (!passwords || !Array.isArray(passwords)) {
    return res.status(400).json({ error: '无效的导入数据' });
  }
  let imported = 0, skipped = 0;
  if (categories && Array.isArray(categories)) {
    for (const cat of categories) {
      try { categoryOps.create(cat.name, cat.icon || 'folder', cat.color || '#4A90D9'); } catch (err) {}
    }
  }
  for (const pwd of passwords) {
    try {
      passwordOps.create(pwd.category_id || null, pwd.title, pwd.username || '', pwd.password, pwd.url || '', pwd.notes || '');
      imported++;
    } catch (err) { skipped++; }
  }
  res.json({ success: true, imported, skipped });
});

// 备份 API
expressApp.get('/api/backups', requireAuth, (req, res) => {
  const backups = getBackupList();
  res.json(backups);
});

expressApp.post('/api/backups/restore', requireAuth, (req, res) => {
  const { backupFile, password } = req.body;
  if (!backupFile) {
    return res.status(400).json({ error: '请指定备份文件' });
  }
  const result = restoreFromBackup(backupFile, password);
  if (result.success) {
    res.json({ success: true, message: '恢复成功' });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// 启动 Express 服务器

function startServer() {
  return new Promise((resolve, reject) => {
    const tryListen = (port) => {
      const s = expressApp.listen(port, () => {
        console.log(`本地服务器已启动: http://localhost:${port}`);
        resolve(s);
      });
      s.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 3010) {
          console.log(`端口 ${port} 已被占用，尝试端口 ${port + 1}...`);
          tryListen(port + 1);
        } else {
          reject(err);
        }
      });
      return s;
    };
    tryListen(PORT);
  });
}

// 创建 Electron 窗口
let mainWindow;
let server;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '密码管理器',
    icon: path.join(__dirname, 'public', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 加载本地服务器
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // 创建应用菜单
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '导出密码',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.executeJavaScript('exportPasswords()');
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { role: 'resetzoom' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            mainWindow.webContents.executeJavaScript(`alert('密码管理器 v1.0\\n\\n本地安全密码管理工具\\n所有数据使用 AES 加密存储')`);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    server = await startServer();
  } catch (err) {
    console.error('端口 3000-3010 均被占用，请关闭占用端口的程序后重试');
    app.quit();
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 应用退出时关闭服务器
app.on('quit', () => {
  if (server) server.close();
});

} // end of gotTheLock
