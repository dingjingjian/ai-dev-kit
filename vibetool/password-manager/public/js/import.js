// ============================================================
// 批量导入模块 - CSV 解析 + 预览 + 字段映射
// 支持 Chrome / Firefox / Bitwarden / LastPass / KeePass / 自定义
// ============================================================

// 应用可映射的目标字段
const IMPORT_FIELDS = [
  { key: 'title',         label: '标题',   required: true },
  { key: 'username',      label: '用户名', required: false },
  { key: 'password',      label: '密码',   required: true },
  { key: 'url',           label: '网址',   required: false },
  { key: 'notes',         label: '备注',   required: false },
  { key: 'category_name', label: '分类',   required: false }
];

// 预设格式:列名(小写) -> 应用字段 key
const IMPORT_PRESETS = {
  custom:     { label: '自定义',              mapping: {} },
  chrome:     { label: 'Chrome / Edge',       mapping: { name: 'title', url: 'url', username: 'username', password: 'password' } },
  firefox:    { label: 'Firefox',             mapping: { url: 'url', username: 'username', password: 'password' } },
  bitwarden:  { label: 'Bitwarden',           mapping: { folder: 'category_name', name: 'title', notes: 'notes', login_uri: 'url', login_username: 'username', login_password: 'password' } },
  lastpass:   { label: 'LastPass',            mapping: { url: 'url', username: 'username', password: 'password', extra: 'notes', name: 'title', grouping: 'category_name' } },
  keepass:    { label: 'KeePass',             mapping: { group: 'category_name', title: 'title', 'user name': 'username', password: 'password', url: 'url', notes: 'notes' } }
};

// 当前导入会话状态
let importState = {
  rows: [],        // 解析后的所有数据行(二维数组)
  headers: [],     // 表头
  mapping: {}      // csv列索引(数字) -> 应用字段 key
};

// ---------- CSV 解析(支持引号/转义/字段内换行/BOM) ----------
function parseCSV(text, delimiter) {
  // 去除 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!delimiter) delimiter = detectDelimiter(text);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // 双引号转义
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // 不在引号内
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // CRLF 或单独 CR
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (text[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // 收尾
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 过滤完全空行
  return rows.filter(r => r.some(c => c !== ''));
}

// ---------- 自动检测分隔符(逗号/分号/制表符) ----------
function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = {
    ',': (sample.match(/,/g) || []).length,
    ';': (sample.match(/;/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length
  };
  let best = ',', max = 0;
  for (const d of [',', ';', '\t']) {
    if (counts[d] > max) { max = counts[d]; best = d; }
  }
  return best;
}

// ---------- 打开批量导入模态框 ----------
function openImportModal() {
  // 重置状态
  importState = { rows: [], headers: [], mapping: {} };
  document.getElementById('importFileInput').value = '';
  document.getElementById('importJsonInput').value = '';
  document.getElementById('importPreset').value = 'auto';
  document.getElementById('importDelimiterGroup').classList.add('hidden');
  document.getElementById('importDelimiter').value = 'auto';
  document.getElementById('importPreviewWrap').classList.add('hidden');
  document.getElementById('importConfirmBtn').disabled = true;
  document.getElementById('importSummary').textContent = '';
  // 默认显示 CSV tab
  switchImportTab('csv');
  document.getElementById('importModal').classList.add('active');
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('active');
}

// ---------- Tab 切换 ----------
function switchImportTab(tabName) {
  document.querySelectorAll('.import-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.getElementById('importTabCsv').classList.toggle('active', tabName === 'csv');
  document.getElementById('importTabJson').classList.toggle('active', tabName === 'json');
}

// ---------- 处理文件选择 ----------
function handleImportFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('文件过大(>10MB),请拆分后再导入', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const delimSel = document.getElementById('importDelimiter').value;
      const delimiter = delimSel === 'auto' ? null : delimSel;
      const rows = parseCSV(text, delimiter);
      if (rows.length === 0) {
        showToast('CSV 文件为空', 'error');
        return;
      }
      // 第一行作为表头
      importState.headers = rows[0].map((h, i) => (h || '').trim() || `列${i + 1}`);
      importState.rows = rows.slice(1);
      if (importState.rows.length === 0) {
        // 可能没有表头,把第一行也当数据
        importState.rows = rows;
        importState.headers = rows[0].map((_, i) => `列${i + 1}`);
      }
      // 自动选择预设并应用映射
      autoSelectPreset();
      renderImportPreview();
    } catch (err) {
      showToast('解析 CSV 失败:' + err.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
}

// ---------- 自动选择最匹配的预设 ----------
function autoSelectPreset() {
  const headersLower = importState.headers.map(h => h.toLowerCase());
  const fieldKeys = IMPORT_FIELDS.map(f => f.key);

  // 优先:表头直接等于应用字段名(本应用导出的 CSV),直接建立映射
  const directMatches = headersLower.filter(h => fieldKeys.includes(h));
  if (directMatches.length >= 2) {
    document.getElementById('importPreset').value = 'custom';
    importState.mapping = {};
    headersLower.forEach((h, idx) => {
      if (fieldKeys.includes(h)) importState.mapping[idx] = h;
    });
    renderImportPreview();
    return;
  }

  // 否则按预设格式匹配
  let bestPreset = 'custom';
  let bestScore = 0;
  for (const [key, preset] of Object.entries(IMPORT_PRESETS)) {
    if (key === 'custom') continue;
    let score = 0;
    for (const csvName of Object.keys(preset.mapping)) {
      if (headersLower.includes(csvName)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPreset = key;
    }
  }
  document.getElementById('importPreset').value = bestPreset;
  applyImportPreset(bestPreset);
}

// ---------- 应用预设映射 ----------
function applyImportPreset(presetKey) {
  const preset = IMPORT_PRESETS[presetKey];
  importState.mapping = {};
  if (!preset || presetKey === 'custom') {
    renderImportPreview();
    return;
  }
  const headersLower = importState.headers.map(h => h.toLowerCase());
  for (const [csvName, fieldKey] of Object.entries(preset.mapping)) {
    const idx = headersLower.indexOf(csvName);
    if (idx >= 0) importState.mapping[idx] = fieldKey;
  }
  renderImportPreview();
}

// ---------- 渲染预览表格 + 字段映射 ----------
function renderImportPreview() {
  const wrap = document.getElementById('importPreviewWrap');
  if (importState.rows.length === 0) {
    wrap.classList.add('hidden');
    document.getElementById('importConfirmBtn').disabled = true;
    return;
  }
  wrap.classList.remove('hidden');

  // 字段映射下拉框
  const mapEl = document.getElementById('importFieldMapping');
  const optionList = ['<option value="">— 不导入 —</option>']
    .concat(IMPORT_FIELDS.map(f => `<option value="${f.key}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</option>`));
  mapEl.innerHTML = importState.headers.map((h, idx) => {
    const selected = importState.mapping[idx] || '';
    return `
      <div class="import-map-row">
        <span class="import-map-col" title="${escapeAttr(h)}">${escapeHtml(h)}</span>
        <span class="import-map-arrow">→</span>
        <select data-col="${idx}">${optionList.map(o =>
          o.includes(`value="${selected}"`) ? o.replace(`value="${selected}"`, `value="${selected}" selected`) : o
        ).join('')}</select>
      </div>
    `;
  }).join('');

  // 绑定映射变更
  mapEl.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.col);
      if (sel.value) importState.mapping[idx] = sel.value;
      else delete importState.mapping[idx];
      updateImportSummary();
    });
  });

  // 预览表格(前 5 行)
  const previewRows = importState.rows.slice(0, 5);
  const tableEl = document.getElementById('importPreviewTable');
  tableEl.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        ${importState.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${previewRows.map((r, i) => `
        <tr>
          <td class="import-row-no">${i + 1}</td>
          ${importState.headers.map((_, idx) => `<td>${escapeHtml(r[idx] || '')}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;

  updateImportSummary();
}

// ---------- 更新导入摘要 + 校验 ----------
function updateImportSummary() {
  const summaryEl = document.getElementById('importSummary');
  const total = importState.rows.length;
  // 校验必填字段
  const mappedKeys = Object.values(importState.mapping);
  const hasTitle = mappedKeys.includes('title');
  const hasPassword = mappedKeys.includes('password');
  const valid = hasTitle && hasPassword;

  if (!hasTitle || !hasPassword) {
    const missing = [];
    if (!hasTitle) missing.push('标题');
    if (!hasPassword) missing.push('密码');
    summaryEl.innerHTML = `<span class="import-warn">⚠ 尚未映射必填字段:${missing.join('、')}</span>`;
    document.getElementById('importConfirmBtn').disabled = true;
    return;
  }
  summaryEl.innerHTML = `<span class="import-ok">共 <b>${total}</b> 条记录待导入,字段映射已就绪</span>`;
  document.getElementById('importConfirmBtn').disabled = false;
}

// ---------- 执行导入 ----------
async function doBatchImport() {
  const mappedKeys = Object.values(importState.mapping);
  if (!mappedKeys.includes('title') || !mappedKeys.includes('password')) {
    showToast('请先映射标题和密码字段', 'warning');
    return;
  }
  // 将每行按映射转换为对象
  const items = importState.rows.map(row => {
    const obj = {};
    for (const [idx, fieldKey] of Object.entries(importState.mapping)) {
      obj[fieldKey] = row[idx] != null ? row[idx] : '';
    }
    return obj;
  });

  const btn = document.getElementById('importConfirmBtn');
  btn.disabled = true;
  btn.textContent = '导入中...';
  try {
    const res = await fetch(`${API_BASE}/import/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passwords: items })
    });
    const result = await res.json();
    if (!res.ok) {
      showToast(result.error || '导入失败', 'error');
      return;
    }
    let msg = `导入完成!成功 ${result.imported} 条`;
    if (result.skipped > 0) msg += `,跳过 ${result.skipped} 条`;
    showToast(msg, 'success');
    closeImportModal();
    loadCategories();
    loadPasswords();
  } catch (err) {
    showToast('网络错误,导入失败', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '开始导入';
  }
}

// ---------- 初始化批量导入模块 ----------
function setupImportModal() {
  // CSV tab
  document.getElementById('importFileInput').addEventListener('change', handleImportFileSelect);
  document.getElementById('importPreset').addEventListener('change', (e) => {
    applyImportPreset(e.target.value);
  });
  document.getElementById('importDelimiter').addEventListener('change', () => {
    // 切换分隔符需重新选文件
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importConfirmBtn').addEventListener('click', doBatchImport);
  document.getElementById('importDownloadTemplate').addEventListener('click', downloadCsvTemplate);

  // Tab 切换
  document.querySelectorAll('.import-tab').forEach(btn => {
    btn.addEventListener('click', () => switchImportTab(btn.dataset.tab));
  });

  // JSON tab
  document.getElementById('importJsonInput').addEventListener('change', importPasswordsFromJson);
}

// ---------- JSON 导入(从本应用导出格式迁移) ----------
async function importPasswordsFromJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      showToast('导入失败:文件不是有效的 JSON', 'error');
      event.target.value = '';
      return;
    }
    if (!data || !Array.isArray(data.passwords)) {
      showToast('导入失败:文件格式不符合要求(缺少 passwords 字段)', 'error');
      event.target.value = '';
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || '导入失败', 'error');
        return;
      }
      showToast(`导入完成!成功:${result.imported},跳过:${result.skipped}`, 'success');
      closeImportModal();
      loadPasswords();
      loadCategories();
    } catch (err) {
      showToast('网络错误,导入失败', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ---------- 下载 CSV 模板 ----------
function downloadCsvTemplate() {
  const csv = 'title,username,password,url,notes,category_name\n' +
    'GitHub,myname,mypassword,https://github.com,个人账号,工作\n' +
    'Gmail,me@gmail.com,mygmailpass,https://mail.google.com,,邮箱\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'password_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
