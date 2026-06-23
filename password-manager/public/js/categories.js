// ============================================================
// 分类管理模块 - 桌面端优化版
// 事件委托 / 减少冗余请求
// ============================================================

// 缓存分类,避免重复请求
let categoryCache = [];

// ---------- 加载分类列表 ----------
async function loadCategories() {
  try {
    const [catRes, pwdRes] = await Promise.all([
      fetch(`${API_BASE}/categories`),
      fetch(`${API_BASE}/passwords`)
    ]);
    const categories = await catRes.json();
    const passwords = await pwdRes.json();
    categoryCache = categories;

    const listEl = document.getElementById('categoryList');
    let html = `
      <li class="category-item ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
        <span class="category-icon">📋</span>
        <span>全部</span>
        <span class="category-count">${passwords.length}</span>
      </li>
    `;
    categories.forEach(cat => {
      const count = passwords.filter(p => p.category_id === cat.id).length;
      html += `
        <li class="category-item ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
          <span class="category-icon">${getIconEmoji(cat.icon)}</span>
          <span>${escapeHtml(cat.name)}</span>
          <span class="category-count">${count}</span>
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
  document.getElementById('categoryList').addEventListener('click', (e) => {
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
