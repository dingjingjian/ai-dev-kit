// 分类管理模块

// 加载分类列表
async function loadCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  const categories = await res.json();
  
  // 获取所有密码来计算分类数量
  const pwdRes = await fetch(`${API_BASE}/passwords`);
  const passwords = await pwdRes.json();
  
  const listEl = document.getElementById('categoryList');
  listEl.innerHTML = `
    <li class="category-item ${currentCategory === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">
      <span class="category-icon">📋</span>
      <span>全部</span>
      <span class="category-count">${passwords.length}</span>
    </li>
  `;
  
  categories.forEach(cat => {
    const count = passwords.filter(p => p.category_id === cat.id).length;
    listEl.innerHTML += `
      <li class="category-item ${currentCategory === cat.id ? 'active' : ''}" onclick="filterByCategory(${cat.id})">
        <span class="category-icon">${getIconEmoji(cat.icon)}</span>
        <span>${cat.name}</span>
        <span class="category-count">${count}</span>
      </li>
    `;
  });
}

// 按分类筛选
function filterByCategory(categoryId) {
  currentCategory = categoryId;
  loadCategories();
  loadPasswords();
}

// 打开分类模态框
function openCategoryModal() {
  document.getElementById('categoryForm').reset();
  document.getElementById('categoryModal').classList.add('active');
}

// 关闭分类模态框
function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
}

// 创建分类
function setupCategoryForm() {
  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
      name: document.getElementById('catName').value,
      icon: document.getElementById('catIcon').value,
      color: document.getElementById('catColor').value
    };
    
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      closeCategoryModal();
      loadCategories();
    } else {
      const err = await res.json();
      alert(err.error);
    }
  });
}
