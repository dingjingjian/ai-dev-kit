// ============================================================
// Electron 主进程 - 桌面端优化版
// 复用共享路由 / 窗口状态持久化 / 原生菜单 / 单实例锁
// ============================================================

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { createApp } = require('./routes');

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

  // ---------- 启动本地 Express 服务器 ----------
  const { app: expressApp } = createApp();
  const PORT = 3456;
  let server = null;

  function startServer() {
    return new Promise((resolve, reject) => {
      const tryListen = (port) => {
        const s = expressApp.listen(port, () => {
          console.log(`本地服务器已启动: http://localhost:${port}`);
          resolve(s);
        });
        s.on('error', (err) => {
          if (err.code === 'EADDRINUSE' && port < 3010) {
            console.log(`端口 ${port} 已被占用,尝试端口 ${port + 1}...`);
            tryListen(port + 1);
          } else {
            reject(err);
          }
        });
      };
      tryListen(PORT);
    });
  }

  // ---------- 窗口状态持久化 ----------
  // 记忆窗口大小与位置,下次启动恢复
  const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
  function loadWindowState() {
    try {
      const fs = require('fs');
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (err) {
      return null;
    }
  }
  function saveWindowState(win) {
    try {
      const fs = require('fs');
      const state = {
        ...win.getBounds(),
        isMaximized: win.isMaximized()
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
    } catch (err) {}
  }

  let mainWindow;

  function createWindow() {
    const savedState = loadWindowState();
    const opts = {
      width: savedState?.width || 1200,
      height: savedState?.height || 800,
      x: savedState?.x,
      y: savedState?.y,
      minWidth: 800,
      minHeight: 600,
      title: '密码管理器',
      icon: path.join(__dirname, 'public', 'icon.png'),
      autoHideMenuBar: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        spellcheck: false
      }
    };
    // 无保存位置时居中
    if (!savedState) opts.center = true;

    mainWindow = new BrowserWindow(opts);

    if (savedState?.isMaximized) {
      mainWindow.maximize();
    }

    mainWindow.loadURL(`http://localhost:${PORT}`);

    // 窗口状态保存(防抖,避免频繁写盘)
    let saveTimer = null;
    const debouncedSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveWindowState(mainWindow), 300);
    };
    mainWindow.on('resize', debouncedSave);
    mainWindow.on('move', debouncedSave);
    mainWindow.on('close', () => saveWindowState(mainWindow));

    // 外部链接在系统浏览器打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    buildMenu();
    mainWindow.on('closed', () => { mainWindow = null; });
  }

  // ---------- 原生菜单 ----------
  function buildMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
      ...(isMac ? [{
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }] : []),
      {
        label: '文件',
        submenu: [
          {
            label: '添加密码',
            accelerator: 'CmdOrCtrl+N',
            click: () => mainWindow?.webContents.executeJavaScript('openAddModal()')
          },
          {
            label: '导出密码',
            accelerator: 'CmdOrCtrl+E',
            click: () => mainWindow?.webContents.executeJavaScript('exportPasswords()')
          },
          {
            label: '导入密码',
            click: () => mainWindow?.webContents.executeJavaScript('document.getElementById("importFile").click()')
          },
          { type: 'separator' },
          {
            label: '备份与恢复',
            click: () => mainWindow?.webContents.executeJavaScript('openBackupModal()')
          },
          { type: 'separator' },
          isMac ? { role: 'close' } : { role: 'quit' }
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
          { role: 'selectAll' }
        ]
      },
      {
        label: '视图',
        submenu: [
          {
            label: '搜索',
            accelerator: 'CmdOrCtrl+F',
            click: () => mainWindow?.webContents.executeJavaScript('document.getElementById("searchBox").focus()')
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggledevtools' },
          { type: 'separator' },
          { role: 'resetzoom' },
          { role: 'zoomin' },
          { role: 'zoomout' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于',
            click: () => {
              mainWindow?.webContents.executeJavaScript(
                `showToast('密码管理器 v1.0 - 本地安全密码管理工具','info')`
              );
            }
          }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  // ---------- 应用生命周期 ----------
  app.whenReady().then(async () => {
    try {
      server = await startServer();
    } catch (err) {
      console.error('端口 3456-3466 均被占用,请关闭占用端口的程序后重试');
      app.quit();
      return;
    }
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', () => {
    if (server) server.close();
  });

} // end of gotTheLock
