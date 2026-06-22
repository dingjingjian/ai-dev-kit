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

// 打开备份模态框
async function openBackupModal() {
  document.getElementById('backupModal').classList.add('active');
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
  const selectEl = document.getElementById('backupFileSelect');
  
  if (backups.length === 0) {
    listEl.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无备份</p>';
    selectEl.innerHTML = '<option value="">无可用备份</option>';
    return;
  }
  
  listEl.innerHTML = backups.map(b => `
    <div style="padding: 10px; border: 1px solid #e1e5eb; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
      <span>📅 ${b.displayDate.replace(/-/g, '/')}</span>
      <button class="btn btn-sm btn-icon" onclick="selectBackup('${b.path}')">选择</button>
    </div>
  `).join('');
  
  selectEl.innerHTML = '<option value="">选择备份...</option>' + 
    backups.map(b => `<option value="${b.path}">${b.displayDate.replace(/-/g, '/')}</option>`).join('');
}

// 选择备份文件
function selectBackup(path) {
  document.getElementById('backupFileSelect').value = path;
}

// 恢复备份
async function restoreBackup() {
  const backupFile = document.getElementById('backupFileSelect').value;
  const password = document.getElementById('restorePassword').value;
  
  if (!backupFile) {
    alert('请选择备份文件');
    return;
  }
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
    body: JSON.stringify({ backupFile, password })
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
