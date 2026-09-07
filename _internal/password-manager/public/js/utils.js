// ============================================================
// 工具函数 - 桌面端优化版
// 含:防抖 / 安全转义 / Toast / 剪贴板复制 / 全局快捷键 / 模态框管理
// ============================================================

// ---------- 防抖 ----------
function debounce(fn, delay = 250) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ---------- HTML 转义(用于文本节点) ----------
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- 属性值转义(用于 data-* 等属性上下文) ----------
function escapeAttr(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

// ---------- 图标映射 ----------
const ICON_EMOJI = {
  'folder': '📁',
  'globe': '🌐',
  'app': '📱',
  'mail': '📧',
  'credit-card': '💳',
  'users': '👥',
  'briefcase': '💼',
  'game': '🎮',
  'shopping': '🛒',
  'ellipsis': '•••'
};
function getIconEmoji(icon) {
  return ICON_EMOJI[icon] || '📁';
}

// ---------- Toast 通知(替代 alert,桌面端体验更佳) ----------
let toastTimer = null;
function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = [
      'position:fixed', 'top:20px', 'left:50%', 'transform:translateX(-50%)',
      'padding:10px 20px', 'border-radius:6px', 'color:#fff', 'font-size:13px',
      'z-index:3000', 'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      'transition:opacity 0.2s', 'pointer-events:none'
    ].join(';');
    document.body.appendChild(toast);
  }
  const colors = { info: '#4a6cf7', success: '#27ae60', error: '#e74c3c', warning: '#e67e22' };
  toast.style.background = colors[type] || colors.info;
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// ---------- 剪贴板复制 ----------
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const input = document.createElement('input');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(input);
  }
  showToast('已复制', 'success');
}

// ---------- 密码强度检测 ----------
function checkPasswordStrength(password) {
  const bar = document.getElementById('strengthBar');
  const text = document.getElementById('strengthText');
  if (!bar || !text) return;

  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

  const levels = [
    { width: '0%', color: 'var(--border)', text: '' },
    { width: '20%', color: '#e74c3c', text: '非常弱' },
    { width: '40%', color: '#e67e22', text: '弱' },
    { width: '60%', color: '#f1c40f', text: '中等' },
    { width: '80%', color: '#27ae60', text: '强' },
    { width: '100%', color: '#2ecc71', text: '非常强' }
  ];
  const level = levels[strength];
  bar.style.width = level.width;
  bar.style.background = level.color;
  text.textContent = level.text;
  text.style.color = level.color;
}

// ---------- 统一模态框关闭绑定 ----------
// 通过 data-close 属性自动绑定,无需每个模态框写 onclick
function setupModalClose() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      document.getElementById(id).classList.remove('active');
    });
  });
  // 点击遮罩关闭
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });
  // ESC 关闭最上层模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal.active');
      if (openModals.length > 0) {
        openModals[openModals.length - 1].classList.remove('active');
      }
    }
  });
}

// ---------- 全局键盘快捷键 ----------
function setupGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    // 模态框打开时或输入框聚焦时,仅处理 ESC(已在 setupModalClose 处理)
    const tag = (e.target.tagName || '').toLowerCase();
    const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';
    const hasOpenModal = document.querySelector('.modal.active');

    // Ctrl+F 搜索
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      const box = document.getElementById('searchBox');
      if (box && document.getElementById('mainApp').classList.contains('active')) {
        box.focus();
        box.select();
      }
      return;
    }
    // Ctrl+N 新增密码
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      if (!inInput && !hasOpenModal && document.getElementById('mainApp').classList.contains('active')) {
        e.preventDefault();
        if (typeof openAddModal === 'function') openAddModal();
      }
      return;
    }
    // Ctrl+E 导出
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      if (!inInput && !hasOpenModal && document.getElementById('mainApp').classList.contains('active')) {
        e.preventDefault();
        if (typeof exportPasswords === 'function') exportPasswords();
      }
      return;
    }
  });
}
