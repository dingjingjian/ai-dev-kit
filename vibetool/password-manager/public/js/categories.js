// ============================================================
// 分类管理模块 - 桌面端优化版
// 事件委托 / 减少冗余请求
// ============================================================

// 缓存分类和密码,避免重复请求
let categoryCache = [];
let allPasswords = [];

// ---------- 加载分类列表 ----------
async function loadCategories() {
  try {
    const [catRes, pwdRes] = await Promise.all([
      fetch(`${API_BASE}/categories`),
      fetch(`${API_BASE}/passwords`)
    ]);
    const categories = await catRes.json();
    allPasswords = await pwdRes.json();
    categoryCache = categories;

    const listEl = document.getElementById('categoryList');
    let html = `
      <li class="category-item ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
        <span class="category-icon">📋</span>
        <span>全部</span>
        <span class="category-count">${allPasswords.length}</span>
      </li>
    `;
    categories.forEach(cat => {
      const count = allPasswords.filter(p => p.category_id === cat.id).length;
      html += `
        <li class="category-item ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
          <span class="category-icon">${getIconEmoji(cat.icon)}</span>
          <span class="category-name">${escapeHtml(cat.name)}</span>
          <span class="category-count">${count}</span>
          <button class="btn-delete-cat" data-id="${cat.id}" title="删除分类">×</button>
        </li>
      `;
    });
    listEl.innerHTML = html;
  } catch (err) {
    showToast('加载分类失败', 'error');
  }
}

// ---------- 按分类筛选 ----------
function filterByCategory(categoryId) {
  currentCategory = categoryId;
  loadCategories();
  loadPasswords();
}

// ---------- 分类列表事件委托 ----------
function setupCategoryListDelegation() {
  document.getElementById('categoryList').addEventListener('click', async (e) => {
    // 删除分类按钮
    const deleteBtn = e.target.closest('.btn-delete-cat');
    if (deleteBtn) {
      e.stopPropagation();
      const catId = parseInt(deleteBtn.dataset.id);
      const cat = categoryCache.find(c => c.id === catId);
      if (!cat) return;

      const count = allPasswords.filter(p => p.category_id === catId).length;
      const msg = count > 0
        ? `确定要删除分类"${cat.name}"吗？该分类下的 ${count} 条密码将变为"无分类"。`
        : `确定要删除分类"${cat.name}"吗？`;

      if (!confirm(msg)) return;

      try {
        const res = await fetch(`${API_BASE}/categories/${catId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
          showToast('分类已删除', 'success');
          if (currentCategory === catId) currentCategory = 'all';
          await loadCategories();
          loadPasswords();
        } else {
          showToast('删除失败', 'error');
        }
      } catch (err) {
        showToast('网络错误', 'error');
      }
      return;
    }

    // 点击分类项筛选
    const item = e.target.closest('[data-cat]');
    if (!item) return;
    const cat = item.dataset.cat;
    filterByCategory(cat === 'all' ? 'all' : parseInt(cat));
  });
}

// ---------- 打开分类模态框 ----------
function openCategoryModal() {
  document.getElementById('categoryForm').reset();
  document.getElementById('catColor').value = '#4A90D9';
  document.getElementById('categoryModal').classList.add('active');
  setTimeout(() => document.getElementById('catName').focus(), 50);
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
}

// ---------- 创建分类 ----------
function setupCategoryForm() {
  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('catName').value.trim(),
      icon: document.getElementById('catIcon').value,
      color: document.getElementById('catColor').value
    };
    try {
      const res = await fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        closeCategoryModal();
        loadCategories();
        showToast('分类已创建', 'success');
      } else {
        const err = await res.json();
        showToast(err.error || '创建失败', 'error');
      }
    } catch (err) {
      showToast('网络错误', 'error');
    }
  });
}
