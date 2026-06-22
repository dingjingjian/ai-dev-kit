// 工具函数

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getIconEmoji(icon) {
  const icons = {
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
  return icons[icon] || '📁';
}

// 复制到剪贴板
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert('已复制到剪贴板');
  } catch (err) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert('已复制到剪贴板');
  }
}

// 密码强度检测
function checkPasswordStrength(password) {
  const bar = document.getElementById('strengthBar');
  const text = document.getElementById('strengthText');
  
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  
  const levels = [
    { width: '0%', color: '#e1e5eb', text: '' },
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
