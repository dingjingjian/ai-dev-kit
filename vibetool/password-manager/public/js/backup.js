// ============================================================
// 备份与密码提示模块 - 桌面端优化版
// 事件委托 / 路径安全处理(不再注入 onclick)
// ============================================================

let selectedBackupPath = null;

// ---------- 密码提示 ----------
async function openHintModal() {
  document.getElementById('hintModal').classList.add('active');
  try {
    const res = await fetch(`${API_BASE}/auth/hint`);
    const data = await res.json();
    document.getElementById('hintInput').value = data.hint || '';
  } catch (err) {
    showToast('加载提示失败', 'error');
  }
}

function closeHintModal() {
  document.getElementById('hintModal').classList.remove('active');
}

async function saveHint() {
  const hint = document.getElementById('hintInput').value;
  try {
    const res = await fetch(`${API_BASE}/auth/hint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hint })
    });
    const data = await res.json();
    if (data.success) {
      showToast('提示已保存', 'success');
      closeHintModal();
    }
  } catch (err) {
    showToast('保存失败', 'error');
  }
}

// ---------- 备份恢复 ----------
async function openBackupModal() {
  document.getElementById('backupModal').classList.add('active');
  selectedBackupPath = null;
  await loadBackupList();
}

function closeBackupModal() {
  document.getElementById('backupModal').classList.remove('active');
}

// ---------- 加载备份列表 ----------
async function loadBackupList() {
  try {
    const res = await fetch(`${API_BASE}/backups`);
    const backups = await res.json();
    const listEl = document.getElementById('backupList');

    if (backups.length === 0) {
      listEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无备份</p>';
      return;
    }

    // 安全:路径仅存入 data-path 属性(经 escapeAttr 转义),不写入 onclick
    listEl.innerHTML = backups.map(b => `
      <div class="backup-item" data-path="${escapeAttr(b.path)}">
        <span>📅 ${escapeHtml(b.displayDate.replace(/-/g, '/'))}</span>
        <span class="select-hint">点击选择</span>
      </div>
    `).join('');
  } catch (err) {
    showToast('加载备份列表失败', 'error');
  }
}

// ---------- 备份列表事件委托 ----------
function setupBackupListDelegation() {
  document.getElementById('backupList').addEventListener('click', (e) => {
    const item = e.target.closest('.backup-item');
    if (!item) return;
    document.querySelectorAll('.backup-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');
    selectedBackupPath = item.dataset.path;
  });
}

// ---------- 恢复备份 ----------
async function restoreBackup() {
  if (!selectedBackupPath) {
    showToast('请先点击选择一个备份', 'warning');
    return;
  }
  const password = document.getElementById('restorePassword').value;
  if (!password) {
    showToast('请输入主密码', 'warning');
    return;
  }
  if (!confirm('确定要从备份恢复吗?当前数据将被覆盖。')) return;

  try {
    const res = await fetch(`${API_BASE}/backups/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupFile: selectedBackupPath, password })
    });
    const result = await res.json();
    if (result.success) {
      showToast('恢复成功,页面将刷新', 'success');
      setTimeout(() => location.reload(), 800);
    } else {
      showToast(result.error || '恢复失败', 'error');
    }
  } catch (err) {
    showToast('恢复失败', 'error');
  }
}
