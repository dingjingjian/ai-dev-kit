const express = require('express');
const cors = require('cors');
const path = require('path');
const { 
  isMasterPasswordSet, 
  setMasterPassword, 
  verifyMasterPassword,
  categoryOps,
  passwordOps,
  getBackupList,
  restoreFromBackup,
  getPasswordHint,
  setPasswordHint
} = require('./database');

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 会话管理
let isAuthenticated = false;

// 认证中间件
function requireAuth(req, res, next) {
  if (!isAuthenticated) {
    return res.status(401).json({ error: '未认证' });
  }
  next();
}

// ===== 认证相关 API =====

app.get('/api/auth/status', (req, res) => {
  res.json({ isSet: isMasterPasswordSet() });
});

app.post('/api/auth/setup', (req, res) => {
  const { password, hint } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: '主密码至少需要4个字符' });
  }
  setMasterPassword(password, hint);
  isAuthenticated = true;
  res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (verifyMasterPassword(password)) {
    isAuthenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: '主密码错误' });
  }
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
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

app.post('/api/auth/logout', (req, res) => {
  isAuthenticated = false;
  res.json({ success: true });
});

// 获取密码提示（无需认证）
app.get('/api/auth/hint', (req, res) => {
  res.json({ hint: getPasswordHint() });
});

// 设置密码提示（需认证）
app.post('/api/auth/hint', requireAuth, (req, res) => {
  const { hint } = req.body;
  setPasswordHint(hint || '');
  res.json({ success: true });
});

// ===== 分类相关 API =====

app.get('/api/categories', requireAuth, (req, res) => {
  const categories = categoryOps.getAll();
  res.json(categories);
});

app.post('/api/categories', requireAuth, (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) {
    return res.status(400).json({ error: '分类名称不能为空' });
  }
  const result = categoryOps.create(name, icon || 'folder', color || '#4A90D9');
  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const { name, icon, color } = req.body;
  const result = categoryOps.update(parseInt(req.params.id), name, icon, color);
  res.json({ success: true, changes: result.changes });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const result = categoryOps.delete(parseInt(req.params.id));
  res.json({ success: true, changes: result.changes });
});

// ===== 密码记录相关 API =====

app.get('/api/passwords', requireAuth, (req, res) => {
  const passwords = passwordOps.getAll();
  res.json(passwords);
});

app.get('/api/passwords/:id', requireAuth, (req, res) => {
  const password = passwordOps.getById(parseInt(req.params.id));
  if (!password) {
    return res.status(404).json({ error: '记录不存在' });
  }
  res.json(password);
});

app.post('/api/passwords', requireAuth, (req, res) => {
  const { category_id, title, username, password, url, notes } = req.body;
  if (!title || !password) {
    return res.status(400).json({ error: '标题和密码不能为空' });
  }
  const result = passwordOps.create(category_id || null, title, username || '', password, url || '', notes || '');
  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/passwords/:id', requireAuth, (req, res) => {
  const { category_id, title, username, password, url, notes } = req.body;
  const result = passwordOps.update(
    parseInt(req.params.id), category_id || null, title, username || '', password, url || '', notes || ''
  );
  res.json({ success: true, changes: result.changes });
});

app.delete('/api/passwords/:id', requireAuth, (req, res) => {
  const result = passwordOps.delete(parseInt(req.params.id));
  res.json({ success: true, changes: result.changes });
});

app.get('/api/passwords/search', requireAuth, (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json([]);
  }
  const passwords = passwordOps.search(`%${q}%`);
  res.json(passwords);
});

app.get('/api/passwords/category/:categoryId', requireAuth, (req, res) => {
  const passwords = passwordOps.getByCategory(parseInt(req.params.categoryId));
  res.json(passwords);
});

// ===== 导入导出 API =====

app.get('/api/export', requireAuth, (req, res) => {
  const passwords = passwordOps.getAll();
  const categories = categoryOps.getAll();
  res.json({
    version: '1.0',
    exportDate: new Date().toISOString(),
    categories,
    passwords
  });
});

app.post('/api/import', requireAuth, (req, res) => {
  const { categories, passwords } = req.body;
  
  if (!passwords || !Array.isArray(passwords)) {
    return res.status(400).json({ error: '无效的导入数据' });
  }

  let imported = 0;
  let skipped = 0;

  if (categories && Array.isArray(categories)) {
    for (const cat of categories) {
      try {
        categoryOps.create(cat.name, cat.icon || 'folder', cat.color || '#4A90D9');
      } catch (err) {
        // 分类已存在，跳过
      }
    }
  }

  for (const pwd of passwords) {
    try {
      passwordOps.create(
        pwd.category_id || null,
        pwd.title,
        pwd.username || '',
        pwd.password,
        pwd.url || '',
        pwd.notes || ''
      );
      imported++;
    } catch (err) {
      skipped++;
    }
  }

  res.json({ success: true, imported, skipped });
});

// ===== 备份恢复 API =====

// 获取备份列表
app.get('/api/backups', requireAuth, (req, res) => {
  const backups = getBackupList();
  res.json(backups);
});

// 从备份恢复
app.post('/api/backups/restore', requireAuth, (req, res) => {
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

app.listen(PORT, () => {
  console.log(`密码管理器已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${path.join(__dirname, 'data.enc')}`);
});
