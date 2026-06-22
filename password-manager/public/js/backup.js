// 备份与密码提示模块

// 打开密码提示模态框
async function openHintModal() {
  document.getElementById('hintModal').classList.add('active');
  const res = await fetch('/api/auth/hint');
  const data = await res.json();
  document.getElementById('hintInput').value = data.hint || '';
}

// 关闭密码提示模态框
function closeHintModal() {
  document.getElementById('hintModal').classList.remove('active');
}

// 保存密码提示
async function saveHint() {
  const hint = document.getElementById('hintInput').value;
  const res = await fetch('/api/auth/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hint })
  });
  const data = await res.json();
  if (data.success) {
    alert('提示已保存');
    closeHintModal();
  }
}

let selectedBackupPath = null;

// 打开备份模态框
async function openBackupModal() {
  document.getElementById('backupModal').classList.add('active');
  selectedBackupPath = null;
  await loadBackupList();
}

// 关闭备份模态框
function closeBackupModal() {
  document.getElementById('backupModal').classList.remove('active');
}

// 加载备份列表
async function loadBackupList() {
  const res = await fetch('/api/backups');
  const backups = await res.json();
  
  const listEl = document.getElementById('backupList');
  
  if (backups.length === 0) {
    listEl.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无备份</p>';
    return;
  }
  
  listEl.innerHTML = backups.map(b => {
    const escapedPath = b.path.replace(/\\/g, '\\\\');
    return `
    <div class="backup-item" data-path="${escapedPath}" style="padding: 10px; border: 1px solid #e1e5eb; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="selectBackup(this, '${escapedPath}')">
      <span>📅 ${b.displayDate.replace(/-/g, '/')}</span>
      <span class="backup-select-hint" style="font-size: 12px; color: #999;">点击选择</span>
    </div>
  `}).join('');
}

// 选择备份文件
function selectBackup(el, path) {
  document.querySelectorAll('.backup-item').forEach(item => {
    item.style.borderColor = '#e1e5eb';
    item.style.background = '';
  });
  el.style.borderColor = '#667eea';
  el.style.background = '#f0f3ff';
  selectedBackupPath = path;
}

// 恢复备份
async function restoreBackup() {
  if (!selectedBackupPath) {
    alert('请先点击选择一个备份');
    return;
  }
  const password = document.getElementById('restorePassword').value;
  if (!password) {
    alert('请输入主密码');
    return;
  }
  if (!confirm('确定要从备份恢复吗？当前数据将被覆盖。')) {
    return;
  }
  
  const res = await fetch('/api/backups/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backupFile: selectedBackupPath, password })
  });
  
  const result = await res.json();
  if (result.success) {
    alert('恢复成功！页面将刷新。');
    closeBackupModal();
    location.reload();
  } else {
    alert(result.error);
  }
}
