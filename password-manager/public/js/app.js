// ============================================================
// 应用入口 - 初始化所有模块
// 从 index.html 内联脚本抽出,符合 CSP script-src 'self' 规范
// ============================================================

// 全局状态
const API_BASE = '/api';
let currentCategory = 'all';
let editingPasswordId = null;

// 初始化所有模块
setupAuthForm();
setupPasswordForm();
setupCategoryForm();
setupSearch();
setupHeaderButtons();
setupModalClose();
setupPasswordListDelegation();
setupCategoryListDelegation();
setupBackupListDelegation();
setupImportModal();
setupGlobalShortcuts();
initAuth();
