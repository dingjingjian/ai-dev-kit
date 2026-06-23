// ============================================================
// 认证模块 - 桌面端优化版
// ============================================================

// ---------- 初始化认证页面 ----------
async function initAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/status`);
    const data = await res.json();

    if (!data.isSet) {
      document.getElementById('authSubtitle').textContent = '首次使用,请设置主密码';
      document.getElementById('authBtn').textContent = '设置主密码';
      document.getElementById('confirmPasswordGroup').classList.remove('hidden');
      document.getElementById('hintGroup').classList.remove('hidden');
    } else {
      // 已设置过密码,显示提示(如果有)
      const hintRes = await fetch(`${API_BASE}/auth/hint`);
      const hintData = await hintRes.json();
      if (hintData.hint) {
        const hintEl = document.getElementById('loginHint');
        hintEl.textContent = `💡 提示:${hintData.hint}`;
        hintEl.style.display = 'block';
      }
    }
    setTimeout(() => document.getElementById('masterPassword').focus(), 50);
  } catch (err) {
    showToast('初始化失败', 'error');
  }
}

// ---------- 认证表单提交 ----------
function setupAuthForm() {
  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('masterPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;
    const errorEl = document.getElementById('authError');

    const isSetup = !document.getElementById('confirmPasswordGroup').classList.contains('hidden');

    if (isSetup) {
      if (password !== confirmPwd) {
        errorEl.textContent = '两次输入的密码不一致';
        errorEl.style.display = 'block';
        return;
      }
      const hint = document.getElementById('masterHint').value;
      try {
        const res = await fetch(`${API_BASE}/auth/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, hint })
        });
        const data = await res.json();
        if (data.error) {
          errorEl.textContent = data.error;
          errorEl.style.display = 'block';
          return;
        }
      } catch (err) {
        errorEl.textContent = '网络错误';
        errorEl.style.display = 'block';
        return;
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.error) {
          errorEl.textContent = data.error;
          errorEl.style.display = 'block';
          return;
        }
      } catch (err) {
        errorEl.textContent = '网络错误';
        errorEl.style.display = 'block';
        return;
      }
    }
    errorEl.style.display = 'none';
    showMainApp();
  });
}

// ---------- 显示主应用 ----------
async function showMainApp() {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('mainApp').classList.add('active');
  await loadCategories();
  await loadPasswords();
}

// ---------- 退出登录 ----------
async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch (err) {}
  location.reload();
}

// ---------- 绑定顶部工具栏按钮 ----------
function setupHeaderButtons() {
  document.getElementById('btnAdd').addEventListener('click', openAddModal);
  document.getElementById('btnExport').addEventListener('click', exportPasswords);
  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importPasswords);
  document.getElementById('btnBackup').addEventListener('click', openBackupModal);
  document.getElementById('btnHint').addEventListener('click', openHintModal);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnNewCategory').addEventListener('click', openCategoryModal);
  document.getElementById('btnSaveHint').addEventListener('click', saveHint);
  document.getElementById('btnRestore').addEventListener('click', restoreBackup);
}
