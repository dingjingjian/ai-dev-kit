// AI Gateway - Frontend Logic

const API = '/api';
let providers = [];
let activeProviderId = null;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
});

async function loadAll() {
  await Promise.all([loadProviders(), loadConfig(), loadLogs()]);
  updateStatusBadge();
}

// --- Status ---
function updateStatusBadge() {
  const badge = document.getElementById('statusBadge');
  if (activeProviderId) {
    badge.textContent = '运行中';
    badge.classList.add('online');
  } else {
    badge.textContent = '未配置';
    badge.classList.remove('online');
  }
}

// --- Providers ---
async function loadProviders() {
  try {
    const res = await fetch(`${API}/providers`);
    const data = await res.json();
    providers = data.providers || [];
    activeProviderId = data.activeProviderId;
    renderProviders();
    renderGatewayInfo();
  } catch (err) {
    document.getElementById('providerList').innerHTML =
      `<div class="empty-state">加载失败: ${err.message}</div>`;
  }
}

function renderProviders() {
  const list = document.getElementById('providerList');
  if (providers.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        还没有模型配置，点击右上角"添加配置"开始
      </div>`;
    return;
  }

  list.innerHTML = providers.map((p) => {
    const isActive = p.id === activeProviderId;
    const maskedKey = p.apiKey
      ? p.apiKey.slice(0, 6) + '••••••' + p.apiKey.slice(-4)
      : '未设置';
    return `
      <div class="provider-card ${isActive ? 'active' : ''}">
        <div class="provider-icon">
          ${p.name.charAt(0).toUpperCase()}
        </div>
        <div class="provider-info">
          <div class="provider-name">
            ${escapeHtml(p.name)}
            ${isActive ? '<span class="active-tag">活跃</span>' : ''}
          </div>
          <div class="provider-meta">
            <span>🔗 ${escapeHtml(p.baseUrl)}</span>
            <span>🤖 ${escapeHtml(p.modelId)}</span>
            <span>🔑 ${maskedKey}</span>
          </div>
        </div>
        <div class="provider-actions">
          <button class="btn btn-ghost btn-sm" onclick="testProvider('${p.id}')" title="测试连接">
            测试
          </button>
          <button class="btn btn-ghost btn-sm" onclick="editProvider('${p.id}')" title="编辑">
            编辑
          </button>
          ${isActive
            ? ''
            : `<button class="btn btn-ghost btn-sm" onclick="activateProvider('${p.id}')" title="设为活跃">启用</button>`
          }
          <button class="btn btn-ghost btn-sm danger" onclick="removeProvider('${p.id}')" title="删除">
            删除
          </button>
        </div>
      </div>`;
  }).join('');
}

function renderGatewayInfo() {
  const endpoint = `${window.location.origin}/v1`;
  document.getElementById('gatewayEndpoint').textContent = endpoint;
  document.querySelector('.info-item .copyable[data-copy=""]')?.setAttribute('data-copy', endpoint);

  const keyEl = document.getElementById('gatewayKey');
  if (window._gatewayKey) {
    keyEl.textContent = window._gatewayKey.slice(0, 12) + '••••';
  }

  const active = providers.find((p) => p.id === activeProviderId);
  if (active) {
    document.getElementById('activeModel').textContent = active.modelId;
    document.getElementById('activeProviderName').textContent = active.name;
  } else {
    document.getElementById('activeModel').textContent = '未配置';
    document.getElementById('activeProviderName').textContent = '无活跃 Provider';
  }

  // Set copy data attributes
  const copyables = document.querySelectorAll('.copyable');
  if (copyables[0]) copyables[0].setAttribute('data-copy', endpoint);
  if (copyables[1] && window._gatewayKey) copyables[1].setAttribute('data-copy', window._gatewayKey);
}

// --- Config ---
async function loadConfig() {
  try {
    const res = await fetch(`${API}/config`);
    const config = await res.json();
    window._gatewayKey = config.apiKey;
    document.getElementById('gatewayKey').textContent = config.apiKey.slice(0, 12) + '••••';
    renderGatewayInfo();
  } catch (err) {
    console.error('Config load failed:', err);
  }
}

// --- Provider Modal ---
function openProviderModal(provider = null) {
  const modal = document.getElementById('providerModal');
  const title = document.getElementById('modalTitle');

  if (provider) {
    title.textContent = '编辑模型配置';
    document.getElementById('providerId').value = provider.id;
    document.getElementById('providerName').value = provider.name;
    document.getElementById('providerBaseUrl').value = provider.baseUrl;
    document.getElementById('providerApiKey').value = provider.apiKey;
    document.getElementById('providerModelId').value = provider.modelId;
  } else {
    title.textContent = '添加模型配置';
    document.getElementById('providerForm').reset();
    document.getElementById('providerId').value = '';
  }

  modal.style.display = 'flex';
}

function closeProviderModal() {
  document.getElementById('providerModal').style.display = 'none';
}

function editProvider(id) {
  const provider = providers.find((p) => p.id === id);
  if (provider) openProviderModal(provider);
}

async function saveProvider(event) {
  event.preventDefault();
  const id = document.getElementById('providerId').value;
  const data = {
    name: document.getElementById('providerName').value,
    baseUrl: document.getElementById('providerBaseUrl').value,
    apiKey: document.getElementById('providerApiKey').value,
    modelId: document.getElementById('providerModelId').value,
  };

  try {
    if (id) {
      await fetch(`${API}/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      showToast('配置已更新');
    } else {
      await fetch(`${API}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      showToast('配置已添加');
    }
    closeProviderModal();
    await loadProviders();
    updateStatusBadge();
  } catch (err) {
    showToast('保存失败: ' + err.message, true);
  }
}

async function removeProvider(id) {
  const provider = providers.find((p) => p.id === id);
  if (!confirm(`确定删除「${provider.name}」吗？`)) return;

  try {
    await fetch(`${API}/providers/${id}`, { method: 'DELETE' });
    showToast('已删除');
    await loadProviders();
    updateStatusBadge();
  } catch (err) {
    showToast('删除失败: ' + err.message, true);
  }
}

async function activateProvider(id) {
  try {
    await fetch(`${API}/providers/${id}/activate`, { method: 'PUT' });
    showToast('已切换活跃模型');
    await loadProviders();
  } catch (err) {
    showToast('切换失败: ' + err.message, true);
  }
}

async function testProvider(id) {
  const provider = providers.find((p) => p.id === id);
  if (!provider) return;

  // Find the test button and show loading
  const cards = document.querySelectorAll('.provider-card');
  const card = Array.from(cards).find((c) =>
    c.querySelector('.provider-name')?.textContent.includes(provider.name)
  );
  const btn = card?.querySelector('button[onclick*="testProvider"]');
  const originalText = btn?.textContent;
  if (btn) {
    btn.textContent = '测试中...';
    btn.disabled = true;
  }

  try {
    const res = await fetch(`${API}/providers/${id}/test`, { method: 'POST' });
    const result = await res.json();

    if (result.success) {
      showToast(`✓ 连接成功 (${result.latency}ms)`);
    } else {
      const errMsg = result.error?.slice(0, 100) || `HTTP ${result.status}`;
      showToast(`✗ 连接失败: ${errMsg}`, true);
    }
  } catch (err) {
    showToast('测试失败: ' + err.message, true);
  } finally {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

// --- Settings ---
function openSettings() {
  document.getElementById('settingsPort').value = window.location.port || 5174;
  document.getElementById('settingsApiKey').value = window._gatewayKey || '';
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

async function saveSettings(event) {
  event.preventDefault();
  const port = parseInt(document.getElementById('settingsPort').value);
  const apiKey = document.getElementById('settingsApiKey').value;

  try {
    await fetch(`${API}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, apiKey }),
    });
    showToast('设置已保存（端口变更需重启服务）');
    closeSettings();
    await loadConfig();
  } catch (err) {
    showToast('保存失败: ' + err.message, true);
  }
}

async function regenerateKey() {
  if (!confirm('确定重新生成网关密钥？所有已配置的智能体需要更新密钥。')) return;
  const newKey = 'gw-' + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  document.getElementById('settingsApiKey').value = newKey;
  showToast('新密钥已生成，点击保存生效');
}

// --- Logs ---
async function loadLogs() {
  try {
    const res = await fetch(`${API}/logs?limit=50`);
    const logs = await res.json();
    renderLogs(logs);
  } catch {
    document.getElementById('logList').innerHTML =
      '<div class="empty-state">日志加载失败</div>';
  }
}

function renderLogs(logs) {
  const list = document.getElementById('logList');
  if (!logs || logs.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无日志</div>';
    return;
  }

  list.innerHTML = logs.map((log) => {
    const time = new Date(log.time).toLocaleString('zh-CN', { hour12: false });
    const statusClass = log.status >= 200 && log.status < 300 ? 'ok' : 'err';
    return `
      <div class="log-item">
        <span class="log-time">${time}</span>
        <span class="log-provider">${escapeHtml(log.provider || '-')}</span>
        <span class="log-model">${escapeHtml(log.model || '-')} ${log.stream ? '·stream' : ''}</span>
        <span class="log-status ${statusClass}">${log.status}</span>
        <span class="log-duration">${log.duration}ms</span>
      </div>`;
  }).join('');
}

async function refreshLogs() {
  await loadLogs();
  showToast('日志已刷新');
}

async function clearLogs() {
  if (!confirm('确定清空所有日志？')) return;
  await fetch(`${API}/logs`, { method: 'DELETE' });
  await loadLogs();
  showToast('日志已清空');
}

// --- Utils ---
function copyText(el) {
  const text = el.getAttribute('data-copy') || el.querySelector('code')?.textContent || '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板');
  });
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.background = isError ? '#dc2626' : '#1a1a2e';
  toast.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
  }
});
