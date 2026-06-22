// 认证模块

// 初始化认证页面
async function initAuth() {
  const res = await fetch(`${API_BASE}/auth/status`);
  const data = await res.json();
  
  if (!data.isSet) {
    document.getElementById('authSubtitle').textContent = '首次使用，请设置主密码';
    document.getElementById('authBtn').textContent = '设置主密码';
    document.getElementById('confirmPasswordGroup').style.display = 'block';
    document.getElementById('hintGroup').style.display = 'block';
  } else {
    // 已设置过密码，显示提示（如果有）
    const hintRes = await fetch(`${API_BASE}/auth/hint`);
    const hintData = await hintRes.json();
    if (hintData.hint) {
      document.getElementById('loginHint').textContent = `💡 提示：${hintData.hint}`;
      document.getElementById('loginHint').style.display = 'block';
    }
  }
}

// 认证表单提交
function setupAuthForm() {
  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('masterPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    const errorEl = document.getElementById('authError');
    
    if (document.getElementById('confirmPasswordGroup').style.display !== 'none') {
      if (password !== confirm) {
        errorEl.textContent = '两次输入的密码不一致';
        errorEl.style.display = 'block';
        return;
      }
      const hint = document.getElementById('masterHint').value;
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
    } else {
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
    }
    
    showMainApp();
  });
}

// 显示主应用
async function showMainApp() {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  await loadCategories();
  await loadPasswords();
}

// 退出登录
async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  location.reload();
}
