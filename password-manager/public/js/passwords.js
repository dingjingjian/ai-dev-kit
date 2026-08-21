// ============================================================
// 密码管理模块 - 桌面端优化版
// 安全修复:密码不再写入 HTML 属性,改用内存缓存 + 事件委托
// 性能优化:抽离渲染函数 / 搜索防抖 / 使用 search API
// ============================================================

let sortableInstance = null;
// 密码缓存:以 id 为键,避免将密码明文写入 DOM 属性
const passwordCache = new Map();
let lastRenderedPasswords = [];

// ---------- 渲染密码列表(统一函数,消除重复) ----------
function renderPasswordList(passwords) {
  lastRenderedPasswords = passwords;
  // 刷新缓存
  passwordCache.clear();
  passwords.forEach(p => passwordCache.set(p.id, p));

  const listEl = document.getElementById('passwordList');

  if (passwords.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <p>暂无密码记录</p>
        <p class="hint">点击"添加"或按 <span class="kbd">Ctrl+N</span> 开始管理您的密码</p>
      </div>
    `;
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    return;
  }

  // 安全:仅将 id 写入 data-id,密码通过缓存读取,杜绝 XSS
  listEl.innerHTML = passwords.map(pwd => `
    <div class="password-item" data-id="${pwd.id}">
      <div class="password-header">
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="password-title">${escapeHtml(pwd.title)}</span>
        ${pwd.category_name ? `<span class="password-category" style="background:${escapeAttr(pwd.category_color)}">${escapeHtml(pwd.category_name)}</span>` : ''}
      </div>
      <div class="password-details">
        ${pwd.username ? `<div class="password-field"><label>用户名</label><span>${escapeHtml(pwd.username)}</span></div>` : ''}
        <div class="password-field">
          <label>密码</label>
          <span class="pwd-value" data-id="${pwd.id}">••••••••</span>
          <button class="btn btn-sm btn-icon" data-action="toggle" data-id="${pwd.id}">显示</button>
          <button class="btn btn-sm btn-icon" data-action="copy" data-id="${pwd.id}">复制</button>
        </div>
        ${pwd.url ? `<div class="password-field"><label>网址</label><span>${escapeHtml(pwd.url)}</span></div>` : ''}
        ${pwd.notes ? `<div class="password-field"><label>备注</label><span>${escapeHtml(pwd.notes)}</span></div>` : ''}
      </div>
      <div class="password-actions">
        <button class="btn btn-sm btn-icon btn-secondary" data-action="edit" data-id="${pwd.id}">编辑</button>
        <button class="btn btn-sm btn-icon btn-danger" data-action="delete" data-id="${pwd.id}">删除</button>
      </div>
    </div>
  `).join('');

  // 初始化拖拽排序(仅非搜索态且为全部/分类视图时启用)
  if (sortableInstance) { sortableInstance.destroy(); }
  sortableInstance = Sortable.create(listEl, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: async function (evt) {
      const items = listEl.querySelectorAll('.password-item');
      const order = Array.from(items).map((el, i) => ({
        id: parseInt(el.dataset.id),
        order: i + 1
      }));
      try {
        const res = await fetch(`${API_BASE}/passwords/reorder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order })
        });
        if (!res.ok) loadPasswords();
      } catch (err) {
        loadPasswords();
      }
    }
  });
}

// ---------- 加载密码列表 ----------
async function loadPasswords() {
  try {
    let url = `${API_BASE}/passwords`;
    if (currentCategory !== 'all') {
      url = `${API_BASE}/passwords/category/${currentCategory}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('加载失败');
    const passwords = await res.json();
    renderPasswordList(passwords);
  } catch (err) {
    showToast('加载密码列表失败', 'error');
  }
}

// ---------- 切换密码显示(从缓存读取,不依赖 DOM 属性) ----------
function togglePassword(id) {
  const pwd = passwordCache.get(id);
  if (!pwd) return;
  const el = document.querySelector(`.pwd-value[data-id="${id}"]`);
  const btn = document.querySelector(`[data-action="toggle"][data-id="${id}"]`);
  if (!el || !btn) return;
  if (el.textContent === '••••••••') {
    el.textContent = pwd.password;
    btn.textContent = '隐藏';
  } else {
    el.textContent = '••••••••';
    btn.textContent = '显示';
  }
}

// ---------- 搜索(防抖 + 使用后端 search API) ----------
function setupSearch() {
  const searchBox = document.getElementById('searchBox');
  // 防抖:避免每次按键都发请求
  const debouncedSearch = debounce(async (query) => {
    if (!query) {
      loadPasswords();
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/passwords/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('搜索失败');
      const passwords = await res.json();
      renderPasswordList(passwords);
    } catch (err) {
      showToast('搜索失败', 'error');
    }
  }, 250);

  searchBox.addEventListener('input', (e) => {
    debouncedSearch(e.target.value.trim());
  });
}

// ---------- 打开添加密码模态框 ----------
async function openAddModal() {
  editingPasswordId = null;
  document.getElementById('passwordModalTitle').textContent = '添加密码';
  document.getElementById('passwordForm').reset();
  document.getElementById('passwordId').value = '';
  checkPasswordStrength('');

  try {
    const res = await fetch(`${API_BASE}/categories`);
    const categories = await res.json();
    const select = document.getElementById('pwdCategory');
    select.innerHTML = '<option value="">无分类</option>' +
      categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('passwordModal').classList.add('active');
    // 聚焦标题输入框,提升桌面端效率
    setTimeout(() => document.getElementById('pwdTitle').focus(), 50);
  } catch (err) {
    showToast('加载分类失败', 'error');
  }
}

// ---------- 编辑密码 ----------
async function editPassword(id) {
  try {
    const res = await fetch(`${API_BASE}/passwords/${id}`);
    if (!res.ok) throw new Error('加载失败');
    const pwd = await res.json();

    editingPasswordId = id;
    document.getElementById('passwordModalTitle').textContent = '编辑密码';
    document.getElementById('passwordId').value = id;
    document.getElementById('pwdTitle').value = pwd.title;
    document.getElementById('pwdUsername').value = pwd.username || '';
    document.getElementById('pwdPassword').value = pwd.password;
    document.getElementById('pwdUrl').value = pwd.url || '';
    document.getElementById('pwdNotes').value = pwd.notes || '';
    checkPasswordStrength(pwd.password);

    const catRes = await fetch(`${API_BASE}/categories`);
    const categories = await catRes.json();
    const select = document.getElementById('pwdCategory');
    select.innerHTML = '<option value="">无分类</option>' +
      categories.map(c => `<option value="${c.id}" ${c.id === pwd.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');

    document.getElementById('passwordModal').classList.add('active');
    setTimeout(() => document.getElementById('pwdTitle').focus(), 50);
  } catch (err) {
    showToast('加载密码详情失败', 'error');
  }
}

// ---------- 关闭密码模态框 ----------
function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('active');
}

// ---------- 保存密码 ----------
function setupPasswordForm() {
  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById('pwdTitle').value.trim(),
      category_id: document.getElementById('pwdCategory').value ? parseInt(document.getElementById('pwdCategory').value) : null,
      username: document.getElementById('pwdUsername').value,
      password: document.getElementById('pwdPassword').value,
      url: document.getElementById('pwdUrl').value,
      notes: document.getElementById('pwdNotes').value
    };

    const url = editingPasswordId ? `${API_BASE}/passwords/${editingPasswordId}` : `${API_BASE}/passwords`;
    const method = editingPasswordId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        closePasswordModal();
        loadPasswords();
        loadCategories();
        showToast(editingPasswordId ? '已更新' : '已添加', 'success');
      } else {
        const err = await res.json();
        showToast(err.error || '保存失败', 'error');
      }
    } catch (err) {
      showToast('网络错误', 'error');
    }
  });

  // 密码强度实时检测
  document.getElementById('pwdPassword').addEventListener('input', function () {
    checkPasswordStrength(this.value);
  });
}

// ---------- 删除密码 ----------
async function deletePassword(id) {
  if (!confirm('确定要删除这条密码记录吗?')) return;
  try {
    const res = await fetch(`${API_BASE}/passwords/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadPasswords();
      loadCategories();
      showToast('已删除', 'success');
    }
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// ---------- 导出密码(JSON,完整备份) ----------
async function exportPasswords() {
  try {
    const res = await fetch(`${API_BASE}/export`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `passwords_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出成功', 'success');
  } catch (err) {
    showToast('导出失败', 'error');
  }
}

// ---------- 导出密码(CSV,跨工具交换) ----------
// 表头使用应用字段名,可被本应用 CSV 导入自动识别,也可在 Excel/其他密码器打开
async function exportPasswordsCsv() {
  try {
    const res = await fetch(`${API_BASE}/passwords`);
    if (!res.ok) throw new Error('加载失败');
    const passwords = await res.json();
    if (passwords.length === 0) {
      showToast('没有可导出的密码记录', 'warning');
      return;
    }
    const headers = ['title', 'username', 'password', 'url', 'notes', 'category_name'];
    const lines = [headers.join(',')];
    for (const p of passwords) {
      lines.push(headers.map(h => csvEscape(p[h] || '')).join(','));
    }
    // BOM 头让 Excel 正确识别 UTF-8;CRLF 兼容 Windows
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `passwords_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${passwords.length} 条 (CSV)`, 'success');
  } catch (err) {
    showToast('导出失败', 'error');
  }
}

// CSV 字段转义:含逗号/引号/换行时用引号包围,内部引号双写
function csvEscape(field) {
  if (field == null) field = '';
  field = String(field);
  if (/[",\n\r]/.test(field)) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

// 注:导入逻辑已整合至 import.js 的导入中心(Tab: CSV 批量 / JSON)

// ---------- 事件委托(替代内联 onclick) ----------
// 统一在列表容器上监听,避免为每个按钮绑定监听器
function setupPasswordListDelegation() {
  document.getElementById('passwordList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'toggle') togglePassword(id);
    else if (action === 'copy') {
      const pwd = passwordCache.get(id);
      if (pwd) copyToClipboard(pwd.password);
    } else if (action === 'edit') editPassword(id);
    else if (action === 'delete') deletePassword(id);
  });
}
