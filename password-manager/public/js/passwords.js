// 密码管理模块

let sortableInstance = null;

// 加载密码列表
async function loadPasswords() {
  let url = `${API_BASE}/passwords`;
  if (currentCategory !== 'all') {
    url = `${API_BASE}/passwords/category/${currentCategory}`;
  }
  
  const res = await fetch(url);
  const passwords = await res.json();
  
  const listEl = document.getElementById('passwordList');
  
  if (passwords.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <p>暂无密码记录</p>
        <p style="font-size: 14px; margin-top: 10px;">点击"添加密码"开始管理您的密码</p>
      </div>
    `;
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    return;
  }
  
  listEl.innerHTML = passwords.map(pwd => `
    <div class="password-item" data-id="${pwd.id}">
      <div class="password-header">
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="password-title">${escapeHtml(pwd.title)}</span>
        ${pwd.category_name ? `<span class="password-category" style="background: ${pwd.category_color}">${pwd.category_name}</span>` : ''}
      </div>
      <div class="password-details">
        ${pwd.username ? `<div class="password-field"><label>用户名:</label><span>${escapeHtml(pwd.username)}</span></div>` : ''}
        <div class="password-field"><label>密码:</label><span id="pwd-${pwd.id}">••••••••</span><button class="btn btn-sm btn-icon" onclick="togglePassword(${pwd.id}, '${escapeHtml(pwd.password)}')">显示</button><button class="btn btn-sm btn-icon" onclick="copyToClipboard('${escapeHtml(pwd.password)}')">复制</button></div>
        ${pwd.url ? `<div class="password-field"><label>网址:</label><span>${escapeHtml(pwd.url)}</span></div>` : ''}
        ${pwd.notes ? `<div class="password-field"><label>备注:</label><span>${escapeHtml(pwd.notes)}</span></div>` : ''}
      </div>
      <div class="password-actions">
        <button class="btn btn-sm btn-icon btn-secondary" onclick="editPassword(${pwd.id})">编辑</button>
        <button class="btn btn-sm btn-icon btn-danger" onclick="deletePassword(${pwd.id})">删除</button>
      </div>
    </div>
  `).join('');

  // 初始化拖拽排序
  if (sortableInstance) { sortableInstance.destroy(); }
  sortableInstance = Sortable.create(listEl, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: async function(evt) {
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
        if (!res.ok) {
          loadPasswords();
        }
      } catch (err) {
        loadPasswords();
      }
    }
  });
}

// 切换密码显示
function togglePassword(id, password) {
  const el = document.getElementById(`pwd-${id}`);
  if (el.textContent === '••••••••') {
    el.textContent = password;
  } else {
    el.textContent = '••••••••';
  }
}

// 搜索密码
function setupSearch() {
  document.getElementById('searchBox').addEventListener('input', async (e) => {
    const query = e.target.value.toLowerCase();
    if (!query) {
      loadPasswords();
      return;
    }
    
    const res = await fetch(`${API_BASE}/passwords`);
    const passwords = await res.json();
    const filtered = passwords.filter(p =>
      p.title.toLowerCase().includes(query) ||
      (p.username && p.username.toLowerCase().includes(query)) ||
      (p.url && p.url.toLowerCase().includes(query)) ||
      (p.notes && p.notes.toLowerCase().includes(query))
    );
    
    const listEl = document.getElementById('passwordList');
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>未找到匹配的密码记录</p></div>';
      return;
    }
    
    listEl.innerHTML = filtered.map(pwd => `
      <div class="password-item" data-id="${pwd.id}">
        <div class="password-header">
          <span class="drag-handle" title="拖动排序">⠿</span>
          <span class="password-title">${escapeHtml(pwd.title)}</span>
          ${pwd.category_name ? `<span class="password-category" style="background: ${pwd.category_color}">${pwd.category_name}</span>` : ''}
        </div>
        <div class="password-details">
          ${pwd.username ? `<div class="password-field"><label>用户名:</label><span>${escapeHtml(pwd.username)}</span></div>` : ''}
          <div class="password-field"><label>密码:</label><span id="pwd-${pwd.id}">••••••••</span><button class="btn btn-sm btn-icon" onclick="togglePassword(${pwd.id}, '${escapeHtml(pwd.password)}')">显示</button><button class="btn btn-sm btn-icon" onclick="copyToClipboard('${escapeHtml(pwd.password)}')">复制</button></div>
          ${pwd.url ? `<div class="password-field"><label>网址:</label><span>${escapeHtml(pwd.url)}</span></div>` : ''}
          ${pwd.notes ? `<div class="password-field"><label>备注:</label><span>${escapeHtml(pwd.notes)}</span></div>` : ''}
        </div>
        <div class="password-actions">
          <button class="btn btn-sm btn-icon btn-secondary" onclick="editPassword(${pwd.id})">编辑</button>
          <button class="btn btn-sm btn-icon btn-danger" onclick="deletePassword(${pwd.id})">删除</button>
        </div>
      </div>
    `).join('');
  });
}

// 打开添加密码模态框
async function openAddModal() {
  editingPasswordId = null;
  document.getElementById('passwordModalTitle').textContent = '添加密码';
  document.getElementById('passwordForm').reset();
  document.getElementById('passwordId').value = '';
  
  const res = await fetch(`${API_BASE}/categories`);
  const categories = await res.json();
  const select = document.getElementById('pwdCategory');
  select.innerHTML = '<option value="">无分类</option>' + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  
  document.getElementById('passwordModal').classList.add('active');
}

// 编辑密码
async function editPassword(id) {
  const res = await fetch(`${API_BASE}/passwords/${id}`);
  const pwd = await res.json();
  
  editingPasswordId = id;
  document.getElementById('passwordModalTitle').textContent = '编辑密码';
  document.getElementById('passwordId').value = id;
  document.getElementById('pwdTitle').value = pwd.title;
  document.getElementById('pwdUsername').value = pwd.username || '';
  document.getElementById('pwdPassword').value = pwd.password;
  document.getElementById('pwdUrl').value = pwd.url || '';
  document.getElementById('pwdNotes').value = pwd.notes || '';
  
  const catRes = await fetch(`${API_BASE}/categories`);
  const categories = await catRes.json();
  const select = document.getElementById('pwdCategory');
  select.innerHTML = '<option value="">无分类</option>' + categories.map(c => `<option value="${c.id}" ${c.id === pwd.category_id ? 'selected' : ''}>${c.name}</option>`).join('');
  
  document.getElementById('passwordModal').classList.add('active');
}

// 关闭密码模态框
function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('active');
}

// 保存密码
function setupPasswordForm() {
  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
      title: document.getElementById('pwdTitle').value,
      category_id: document.getElementById('pwdCategory').value ? parseInt(document.getElementById('pwdCategory').value) : null,
      username: document.getElementById('pwdUsername').value,
      password: document.getElementById('pwdPassword').value,
      url: document.getElementById('pwdUrl').value,
      notes: document.getElementById('pwdNotes').value
    };
    
    const url = editingPasswordId ? `${API_BASE}/passwords/${editingPasswordId}` : `${API_BASE}/passwords`;
    const method = editingPasswordId ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      closePasswordModal();
      loadPasswords();
      loadCategories();
    } else {
      const err = await res.json();
      alert(err.error);
    }
  });
}

// 删除密码
async function deletePassword(id) {
  if (!confirm('确定要删除这条密码记录吗？')) return;
  
  const res = await fetch(`${API_BASE}/passwords/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadPasswords();
    loadCategories();
  }
}

// 导出密码
async function exportPasswords() {
  const res = await fetch(`${API_BASE}/export`);
  const data = await res.json();
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `passwords_export_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 导入密码
async function importPasswords(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const res = await fetch(`${API_BASE}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      alert(`导入完成！成功: ${result.imported}, 跳过: ${result.skipped}`);
      loadPasswords();
      loadCategories();
    } catch (err) {
      alert('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
}
