const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

let userDataPath;
try {
  const { app } = require('electron');
  userDataPath = app.getPath('userData');
} catch {
  userDataPath = __dirname;
}

const dataPath = path.join(userDataPath, 'data.enc');
const hintPath = path.join(userDataPath, 'hint.txt');
const backupDir = path.join(userDataPath, 'backups');
let masterKey = null;

// 确保备份目录存在
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 创建备份
function createBackup(data) {
  try {
    const date = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const time = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
    const backupFile = path.join(backupDir, `backup_${date}_${time}.enc`);
    const encrypted = encrypt(data, masterKey);
    fs.writeFileSync(backupFile, encrypted, 'utf8');
    
    // 只保留最近7天的备份
    cleanOldBackups(7);
    return true;
  } catch (err) {
    console.error('备份失败:', err);
    return false;
  }
}

// 清理旧备份
function cleanOldBackups(days) {
  try {
    const files = fs.readdirSync(backupDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    files.forEach(file => {
      if (file.startsWith('backup_') && file.endsWith('.enc')) {
        const dateStr = file.replace('backup_', '').replace('.enc', '').split('_')[0];
        const fileDate = new Date(dateStr.replace(/-/g, '/'));
        if (fileDate < cutoffDate) {
          fs.unlinkSync(path.join(backupDir, file));
        }
      }
    });
  } catch (err) {
    console.error('清理备份失败:', err);
  }
}

// 获取备份列表
function getBackupList() {
  try {
    const files = fs.readdirSync(backupDir);
    return files
      .filter(f => f.startsWith('backup_') && f.endsWith('.enc'))
      .sort()
      .reverse()
      .map(f => {
        const dateStr = f.replace('backup_', '').replace('.enc', '');
        const [date, time] = dateStr.split('_');
        // 将 UTC 时间转换为本地时间显示
        // time 格式: "08-31-20-250Z" -> "08:31:20.250"
        const parts = time.replace('Z', '').split('-');
        const utcTime = `${parts[0]}:${parts[1]}:${parts[2]}.${parts[3]}`;
        const localDate = new Date(`${date}T${utcTime}Z`);
        const displayDate = localDate.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        return {
          filename: f,
          date: dateStr,
          displayDate,
          path: path.join(backupDir, f)
        };
      });
  } catch (err) {
    return [];
  }
}

// 从备份恢复
function restoreFromBackup(backupFile, password) {
  try {
    const encrypted = fs.readFileSync(backupFile, 'utf8');
    const data = decrypt(encrypted, password);
    if (data) {
      // 保存到主数据文件
      fs.writeFileSync(dataPath, encrypted, 'utf8');
      return { success: true, data };
    }
    return { success: false, error: '密码错误或备份文件损坏' };
  } catch (err) {
    return { success: false, error: '恢复失败: ' + err.message };
  }
}

// 默认分类
const defaultCategories = [
  { id: 1, name: '网站', icon: 'globe', color: '#4A90D9' },
  { id: 2, name: '应用', icon: 'app', color: '#50C878' },
  { id: 3, name: '邮箱', icon: 'mail', color: '#FF6B6B' },
  { id: 4, name: '金融', icon: 'credit-card', color: '#FFD93D' },
  { id: 5, name: '社交', icon: 'users', color: '#6C5CE7' },
  { id: 6, name: '工作', icon: 'briefcase', color: '#95A5A6' },
  { id: 7, name: '其他', icon: 'ellipsis', color: '#34495E' }
];

// 默认数据结构
const defaultData = {
  categories: defaultCategories,
  passwords: [],
  nextCategoryId: 8,
  nextPasswordId: 1
};

// 加密数据
function encrypt(data, key) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
}

// 解密数据
function decrypt(encrypted, key) {
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch (err) {
    return null;
  }
}

// 检查是否已设置主密码
function isMasterPasswordSet() {
  return fs.existsSync(dataPath);
}

// 设置密码提示
function setPasswordHint(hint) {
  fs.writeFileSync(hintPath, hint, 'utf8');
  return true;
}

// 获取密码提示
function getPasswordHint() {
  if (fs.existsSync(hintPath)) {
    return fs.readFileSync(hintPath, 'utf8');
  }
  return '';
}

// 设置主密码并初始化数据
function setMasterPassword(password, hint) {
  masterKey = password;
  const encrypted = encrypt(defaultData, masterKey);
  fs.writeFileSync(dataPath, encrypted, 'utf8');
  if (hint) {
    setPasswordHint(hint);
  }
  return true;
}

// 验证主密码并加载数据
function verifyMasterPassword(password) {
  if (!fs.existsSync(dataPath)) return false;
  
  const encrypted = fs.readFileSync(dataPath, 'utf8');
  const data = decrypt(encrypted, password);
  
  if (data) {
    masterKey = password;
    return true;
  }
  return false;
}

// 读取数据
function readData() {
  if (!masterKey) return null;
  const encrypted = fs.readFileSync(dataPath, 'utf8');
  return decrypt(encrypted, masterKey);
}

// 保存数据
function saveData(data) {
  if (!masterKey) return false;
  const encrypted = encrypt(data, masterKey);
  fs.writeFileSync(dataPath, encrypted, 'utf8');
  // 自动创建备份
  createBackup(data);
  return true;
}

// 分类操作
const categoryOps = {
  getAll() {
    const data = readData();
    return data ? data.categories : [];
  },
  
  getById(id) {
    const data = readData();
    return data.categories.find(c => c.id === id);
  },

  findByName(name) {
    const data = readData();
    return data.categories.find(c => c.name === name);
  },

  create(name, icon, color) {
    const data = readData();
    const newId = data.nextCategoryId++;
    data.categories.push({ id: newId, name, icon, color });
    saveData(data);
    return { lastInsertRowid: newId };
  },
  
  update(id, name, icon, color) {
    const data = readData();
    const cat = data.categories.find(c => c.id === id);
    if (cat) {
      cat.name = name;
      cat.icon = icon;
      cat.color = color;
      saveData(data);
      return { changes: 1 };
    }
    return { changes: 0 };
  },
  
  delete(id) {
    const data = readData();
    const before = data.categories.length;
    data.categories = data.categories.filter(c => c.id !== id);
    data.passwords.forEach(p => {
      if (p.category_id === id) p.category_id = null;
    });
    saveData(data);
    return { changes: before - data.categories.length };
  }
};

// 密码操作
const passwordOps = {
  getAll() {
    const data = readData();
    const categories = data.categories;
    return data.passwords.map(p => ({
      ...p,
      category_name: categories.find(c => c.id === p.category_id)?.name || null,
      category_color: categories.find(c => c.id === p.category_id)?.color || null
    })).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  },
  
  getById(id) {
    const data = readData();
    const p = data.passwords.find(pw => pw.id === id);
    if (!p) return null;
    const categories = data.categories;
    return {
      ...p,
      category_name: categories.find(c => c.id === p.category_id)?.name || null,
      category_color: categories.find(c => c.id === p.category_id)?.color || null
    };
  },
  
  create(category_id, title, username, password, url, notes) {
    const data = readData();
    const newId = data.nextPasswordId++;
    const now = new Date().toISOString();
    const maxSortOrder = data.passwords.reduce((max, p) => Math.max(max, p.sort_order ?? 0), 0);
    data.passwords.push({
      id: newId,
      category_id,
      title,
      username,
      password,
      url,
      notes,
      sort_order: maxSortOrder + 1,
      created_at: now,
      updated_at: now
    });
    saveData(data);
    return { lastInsertRowid: newId };
  },
  
  update(id, category_id, title, username, password, url, notes) {
    const data = readData();
    const p = data.passwords.find(pw => pw.id === id);
    if (p) {
      p.category_id = category_id;
      p.title = title;
      p.username = username;
      p.password = password;
      p.url = url;
      p.notes = notes;
      p.updated_at = new Date().toISOString();
      saveData(data);
      return { changes: 1 };
    }
    return { changes: 0 };
  },
  
  delete(id) {
    const data = readData();
    const before = data.passwords.length;
    data.passwords = data.passwords.filter(p => p.id !== id);
    // 重新排序
    data.passwords.forEach((p, i) => { p.sort_order = i + 1; });
    saveData(data);
    return { changes: before - data.passwords.length };
  },
  
  updateOrder(idOrderMap) {
    const data = readData();
    idOrderMap.forEach(({ id, order }) => {
      const p = data.passwords.find(pw => pw.id === id);
      if (p) p.sort_order = order;
    });
    saveData(data);
    return { changes: idOrderMap.length };
  },
  
  search(pattern) {
    const data = readData();
    const categories = data.categories;
    const search = pattern.replace(/%/g, '').toLowerCase();
    return data.passwords
      .filter(p => 
        p.title.toLowerCase().includes(search) ||
        (p.username && p.username.toLowerCase().includes(search)) ||
        (p.url && p.url.toLowerCase().includes(search)) ||
        (p.notes && p.notes.toLowerCase().includes(search))
      )
      .map(p => ({
        ...p,
        category_name: categories.find(c => c.id === p.category_id)?.name || null,
        category_color: categories.find(c => c.id === p.category_id)?.color || null
      }))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  },
  
  getByCategory(categoryId) {
    const data = readData();
    const categories = data.categories;
    return data.passwords
      .filter(p => p.category_id === categoryId)
      .map(p => ({
        ...p,
        category_name: categories.find(c => c.id === p.category_id)?.name || null,
        category_color: categories.find(c => c.id === p.category_id)?.color || null
      }))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  },

  // 批量创建密码(一次性保存,避免每条都写文件+备份)
  // items: [{ title, username, password, url, notes, category_name }]
  bulkCreate(items) {
    const data = readData();
    let imported = 0, skipped = 0;
    const errors = [];
    const now = new Date().toISOString();
    let baseSortOrder = data.passwords.reduce((max, p) => Math.max(max, p.sort_order ?? 0), 0);

    items.forEach((item, idx) => {
      const rowNo = idx + 1;
      const title = (item.title || '').toString().trim();
      const password = item.password == null ? '' : String(item.password);
      if (!title || !password) {
        skipped++;
        errors.push({ row: rowNo, reason: '标题或密码为空' });
        return;
      }
      // 按 category_name 自动查找/创建分类
      let categoryId = null;
      const categoryName = (item.category_name || '').toString().trim();
      if (categoryName) {
        let cat = data.categories.find(c => c.name === categoryName);
        if (!cat) {
          const newId = data.nextCategoryId++;
          cat = { id: newId, name: categoryName, icon: 'folder', color: '#4A90D9' };
          data.categories.push(cat);
        }
        categoryId = cat.id;
      }
      const newId = data.nextPasswordId++;
      baseSortOrder++;
      data.passwords.push({
        id: newId,
        category_id: categoryId,
        title,
        username: (item.username || '').toString(),
        password,
        url: (item.url || '').toString(),
        notes: (item.notes || '').toString(),
        sort_order: baseSortOrder,
        created_at: now,
        updated_at: now
      });
      imported++;
    });

    saveData(data);
    return { imported, skipped, errors };
  }
};

module.exports = {
  isMasterPasswordSet,
  setMasterPassword,
  verifyMasterPassword,
  categoryOps,
  passwordOps,
  getBackupList,
  restoreFromBackup,
  getPasswordHint,
  setPasswordHint
};
