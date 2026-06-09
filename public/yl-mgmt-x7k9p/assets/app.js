const API_BASE = '/api';
let currentUser = null;
let products = [];
let admins = [];

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function getFullUrl(path) {
  if (!path || path === '/') return window.location.origin + '/';
  return `${window.location.origin}${path}`;
}

function getProductPreviewPath() {
  if (currentUser?.isSuper && currentUser?.username?.toLowerCase() === 'admin') {
    return getFullUrl('/');
  }
  return getFullUrl(`/${currentUser.username}/`);
}

function showPage(page) {
  document.getElementById('login-page').classList.toggle('hidden', page !== 'login');
  document.getElementById('dashboard').classList.toggle('hidden', page !== 'dashboard');
}

function renderDashboard() {
  document.getElementById('user-badge').textContent = currentUser.username;
  const adminUrl = currentUser.adminUrl || '/';
  document.getElementById('user-url').textContent = getFullUrl(adminUrl);
  document.getElementById('user-url').href = getFullUrl(adminUrl);

  const superBadge = document.getElementById('super-badge');
  const adminsTab = document.getElementById('tab-admins');
  if (currentUser.isSuper) {
    superBadge.classList.remove('hidden');
    adminsTab.classList.remove('hidden');
  } else {
    superBadge.classList.add('hidden');
    adminsTab.classList.add('hidden');
  }
}

async function loadProducts() {
  products = await api('products');
  renderProducts();
}

function renderProducts() {
  const container = document.getElementById('product-list');
  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无产品，点击下方按钮新增</p>
      </div>`;
    return;
  }

  container.innerHTML = products.map(p => `
    <div class="product-item" data-name="${p.name}">
      <div class="product-info">
        <h3>${p.name}</h3>
        <div class="product-url">
          <a href="${getFullUrl(p.url)}" target="_blank">${getFullUrl(p.url)}</a>
        </div>
        <div class="stats-row">
          <div class="stat today clickable" onclick="showTodayLogs('${p.name}')" title="点击查看今日下载详情">
            <div class="stat-value">${p.stats.today}</div>
            <div class="stat-label">今日下载 ›</div>
          </div>
          <div class="stat yesterday">
            <div class="stat-value">${p.stats.yesterday}</div>
            <div class="stat-label">昨日下载</div>
          </div>
          <div class="stat total">
            <div class="stat-value">${p.stats.total}</div>
            <div class="stat-label">历史总计</div>
          </div>
        </div>
      </div>
      <div class="product-actions">
        <button class="btn btn-ghost btn-sm" onclick="editProduct('${p.name}')">编辑</button>
        <button class="btn btn-ghost btn-sm" onclick="renameProduct('${p.name}')">重命名</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.name}')">删除</button>
      </div>
    </div>
  `).join('');
}

async function loadAdmins() {
  if (!currentUser.isSuper) return;
  admins = await api('admins');
  renderAdmins();
}

function renderAdmins() {
  const container = document.getElementById('admin-list');
  container.innerHTML = admins.map(a => `
    <div class="admin-item">
      <div>
        <strong>${a.username}</strong>
        ${a.isSuper ? '<span class="badge super" style="margin-left:8px">超级管理员</span>' : ''}
        <div class="url">${getFullUrl(a.url)}</div>
      </div>
      ${!a.isSuper ? `<button class="btn btn-danger btn-sm" onclick="deleteAdmin('${a.username}')">删除</button>` : ''}
    </div>
  `).join('');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  try {
    const data = await api('login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    currentUser = data;
    showPage('dashboard');
    renderDashboard();
    await loadProducts();
    if (data.isSuper) await loadAdmins();
    toast('登录成功');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function handleLogout() {
  try {
    await api('logout', { method: 'POST' });
  } catch (_) {}
  setToken(null);
  currentUser = null;
  showPage('login');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.remove('hidden');
  if (tab === 'admins') loadAdmins();
  if (tab === 'products') loadProducts();
}

function showModal(title, html, onConfirm) {
  const overlay = document.getElementById('modal-overlay');
  overlay.querySelector('.modal').classList.remove('wide');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  overlay.classList.remove('hidden');

  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

  newConfirm.addEventListener('click', async () => {
    try {
      await onConfirm();
      hideModal();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  cancelBtn.onclick = hideModal;
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showViewModal(title, html) {
  const overlay = document.getElementById('modal-overlay');
  const modal = overlay.querySelector('.modal');
  modal.classList.add('wide');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  overlay.classList.remove('hidden');

  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  confirmBtn.classList.add('hidden');
  cancelBtn.textContent = '关闭';
  cancelBtn.onclick = () => {
    confirmBtn.classList.remove('hidden');
    cancelBtn.textContent = '取消';
    modal.classList.remove('wide');
    hideModal();
  };
}

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function showTodayLogs(productName) {
  try {
    const data = await api(`download-logs?product=${encodeURIComponent(productName)}`);
    const logsHtml = data.logs.length ? `
      <div class="log-table-wrap">
        <table class="log-table">
          <thead>
            <tr><th>时间</th><th>来路</th><th>IP</th><th>地区</th></tr>
          </thead>
          <tbody>
            ${data.logs.map(log => `
              <tr>
                <td class="nowrap">${formatTime(log.time)}</td>
                <td class="referrer-cell" title="${escapeHtml(log.referrer)}">${escapeHtml(log.referrer)}</td>
                <td>${escapeHtml(log.ip)}</td>
                <td>${escapeHtml(log.location)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state"><p>今日暂无下载记录</p></div>';

    const refHtml = data.referrerStats.length ? `
      <div class="summary-block">
        <h3>来路统计</h3>
        <div class="summary-list">
          ${data.referrerStats.map(r => `
            <div class="summary-item">
              <span class="summary-label" title="${escapeHtml(r.referrer)}">${escapeHtml(r.referrer)}</span>
              <span class="summary-count">${r.count} 次</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    const regionHtml = data.regionStats.length ? `
      <div class="summary-block">
        <h3>地区统计</h3>
        <div class="summary-list">
          ${data.regionStats.map(r => `
            <div class="summary-item region-item">
              <div>
                <span class="summary-label">${escapeHtml(r.location)}</span>
                <div class="ip-list">${r.ips.map(i => `<span class="ip-tag">${escapeHtml(i.ip)} ×${i.count}</span>`).join('')}</div>
              </div>
              <span class="summary-count">${r.count} 次</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    showViewModal(`${productName} - 今日下载详情 (${data.total})`, `
      <div class="detail-tabs">
        <button class="detail-tab active" onclick="switchDetailTab(this, 'detail')">访问明细</button>
        <button class="detail-tab" onclick="switchDetailTab(this, 'referrer')">来路统计</button>
        <button class="detail-tab" onclick="switchDetailTab(this, 'region')">地区统计</button>
      </div>
      <div id="detail-panel-detail" class="detail-panel">${logsHtml}</div>
      <div id="detail-panel-referrer" class="detail-panel hidden">${refHtml || '<div class="empty-state"><p>暂无来路数据</p></div>'}</div>
      <div id="detail-panel-region" class="detail-panel hidden">${regionHtml || '<div class="empty-state"><p>暂无地区数据</p></div>'}</div>
    `);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function switchDetailTab(btn, tab) {
  btn.parentElement.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.detail-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`detail-panel-${tab}`).classList.remove('hidden');
}

function addProduct() {
  showModal('新增产品', `
    <div class="form-group">
      <label>产品名称（仅字母）</label>
      <input id="new-product-name" placeholder="例如 kuailian" pattern="[a-zA-Z]+">
      <div class="hint">将生成 ${getProductPreviewPath()}<span id="preview-name">产品名</span>.txt</div>
    </div>
    <div class="form-group">
      <label>文件内容</label>
      <textarea id="new-product-content" placeholder="输入下载文件内容..."></textarea>
    </div>
  `, async () => {
    const name = document.getElementById('new-product-name').value.trim();
    const content = document.getElementById('new-product-content').value;
    if (!name) throw new Error('请输入产品名称');
    await api('products', { method: 'POST', body: JSON.stringify({ name, content }) });
    await loadProducts();
    toast('产品已创建');
  });

  setTimeout(() => {
    const input = document.getElementById('new-product-name');
    const preview = document.getElementById('preview-name');
    input.addEventListener('input', () => { preview.textContent = input.value || '产品名'; });
  }, 0);
}

function editProduct(name) {
  const product = products.find(p => p.name === name);
  showModal(`编辑 - ${name}`, `
    <div class="form-group">
      <label>文件内容</label>
      <textarea id="edit-content">${product.content || ''}</textarea>
    </div>
    <div class="hint">下载链接: ${getFullUrl(product.url)}</div>
  `, async () => {
    const content = document.getElementById('edit-content').value;
    await api('products', { method: 'PUT', body: JSON.stringify({ oldName: name, content }) });
    await loadProducts();
    toast('已保存');
  });
}

function renameProduct(name) {
  showModal(`重命名 - ${name}`, `
    <div class="form-group">
      <label>新名称（仅字母）</label>
      <input id="rename-new" placeholder="新产品名称" value="${name}">
    </div>
  `, async () => {
    const newName = document.getElementById('rename-new').value.trim();
    if (!newName) throw new Error('请输入新名称');
    await api('products', { method: 'PUT', body: JSON.stringify({ oldName: name, newName }) });
    await loadProducts();
    toast('已重命名');
  });
}

async function deleteProduct(name) {
  if (!confirm(`确定删除产品 "${name}" 吗？`)) return;
  try {
    await api(`products?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    await loadProducts();
    toast('已删除');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function addAdmin() {
  showModal('新增管理员', `
    <div class="form-group">
      <label>管理员名称（仅字母）</label>
      <input id="new-admin-name" placeholder="例如 zh">
      <div class="hint">将创建目录 ${getFullUrl('/')}<span id="admin-preview">名称</span>/</div>
    </div>
    <div class="form-group">
      <label>登录密码</label>
      <input id="new-admin-pass" type="password" placeholder="设置密码">
    </div>
  `, async () => {
    const username = document.getElementById('new-admin-name').value.trim();
    const password = document.getElementById('new-admin-pass').value;
    if (!username || !password) throw new Error('请填写完整信息');
    await api('admins', { method: 'POST', body: JSON.stringify({ username, password }) });
    await loadAdmins();
    toast(`管理员 ${username} 已创建`);
  });

  setTimeout(() => {
    const input = document.getElementById('new-admin-name');
    const preview = document.getElementById('admin-preview');
    input.addEventListener('input', () => { preview.textContent = input.value || '名称'; });
  }, 0);
}

async function deleteAdmin(username) {
  if (!confirm(`确定删除管理员 "${username}" 及其所有产品吗？`)) return;
  try {
    await api(`admins?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
    await loadAdmins();
    toast('已删除');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function changePassword() {
  showModal('修改密码', `
    <div class="form-group">
      <label>原密码</label>
      <input id="old-pass" type="password">
    </div>
    <div class="form-group">
      <label>新密码</label>
      <input id="new-pass" type="password">
    </div>
  `, async () => {
    const oldPassword = document.getElementById('old-pass').value;
    const newPassword = document.getElementById('new-pass').value;
    await api('change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
    toast('密码已修改');
  });
}

async function init() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('add-product-btn').addEventListener('click', addProduct);
  document.getElementById('add-admin-btn').addEventListener('click', addAdmin);
  document.getElementById('change-pass-btn').addEventListener('click', changePassword);
  document.getElementById('refresh-btn').addEventListener('click', loadProducts);

  const token = getToken();
  if (token) {
    try {
      currentUser = await api('me');
      showPage('dashboard');
      renderDashboard();
      await loadProducts();
      if (currentUser.isSuper) await loadAdmins();
    } catch (_) {
      setToken(null);
      showPage('login');
    }
  } else {
    showPage('login');
  }
}

document.addEventListener('DOMContentLoaded', init);
