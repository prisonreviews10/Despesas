// ============ STATE ============
let currentUser = null;
let token = null;
let categories = [];
let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();
let currentFilter = 'all';
let currentPage = 'dashboard';

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ============ INIT ============
(function init() {
  token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token || !userStr) {
    window.location.href = '/';
    return;
  }

  currentUser = JSON.parse(userStr);
  setupUI();
  loadCategories().then(() => loadDashboard());
})();

function setupUI() {
  const avatar = document.getElementById('userAvatar');
  avatar.style.background = `linear-gradient(135deg, ${currentUser.avatar_color}, ${currentUser.avatar_color}dd)`;
  avatar.textContent = currentUser.username[0];
  document.getElementById('userName').textContent = currentUser.username;
  updateMonthLabel();
}

// ============ API ============
async function api(endpoint, options = {}) {
  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
  return data;
}

// ============ NAVIGATION ============
function navigateTo(page) {
  currentPage = page;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const pageEl = document.getElementById(`page-${page}`);
  pageEl.classList.remove('hidden');

  // Re-trigger animation
  pageEl.style.animation = 'none';
  pageEl.offsetHeight; // reflow
  pageEl.style.animation = '';

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');

  if (page === 'dashboard') loadDashboard();
  else if (page === 'transactions') loadTransactions();
  else if (page === 'fixed') loadFixedExpenses();
  else if (page === 'logs') loadLogs();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

// ============ MONTH NAVIGATION ============
function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  updateMonthLabel();

  if (currentPage === 'dashboard') loadDashboard();
  else if (currentPage === 'transactions') loadTransactions();
}

function updateMonthLabel() {
  const label = `${MONTHS_PT[currentMonth - 1]} ${currentYear}`;
  document.getElementById('monthLabel').textContent = label;
  document.querySelectorAll('.month-label-sync').forEach(el => el.textContent = label);
}

// ============ ANIMATED COUNTER ============
function animateValue(element, target) {
  const duration = 600;
  const start = performance.now();
  const startVal = parseFloat(element.dataset.currentValue) || 0;

  element.dataset.currentValue = target;

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (target - startVal) * eased;
    element.textContent = formatCurrency(current);
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ============ CATEGORIES ============
async function loadCategories() {
  try {
    categories = await api('/categories');
  } catch (err) {
    showToast('Erro ao carregar categorias', 'error');
  }
}

function populateCategorySelect(selectId, type) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Selecionar categoria...</option>';
  categories
    .filter(c => c.type === type)
    .forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      select.appendChild(opt);
    });
}

// ============ DASHBOARD ============
async function loadDashboard() {
  try {
    const [summary, transactions] = await Promise.all([
      api(`/summary?month=${currentMonth}&year=${currentYear}`),
      api(`/transactions?month=${currentMonth}&year=${currentYear}`)
    ]);

    // Animated stat cards
    animateValue(document.getElementById('totalIncome'), summary.totals.income);
    animateValue(document.getElementById('totalExpenses'), summary.totals.expenses);
    animateValue(document.getElementById('totalBalance'), summary.totals.income - summary.totals.expenses);
    animateValue(document.getElementById('totalFixed'), summary.fixedExpensesTotal);

    renderUsersComparison(summary.perUser);
    renderCategoryBreakdown(summary.byCategory, summary.totals.expenses);
    renderTransactionList('recentTransactions', transactions.slice(0, 6));

  } catch (err) {
    showToast('Erro ao carregar dashboard', 'error');
  }
}

function renderUsersComparison(perUser) {
  const container = document.getElementById('usersComparison');
  const users = [
    { name: 'Ivan', color: '#6C63FF', gradient: 'linear-gradient(135deg, #6C63FF, #5A52E0)' },
    { name: 'Becky', color: '#FF6B9D', gradient: 'linear-gradient(135deg, #FF6B9D, #E84393)' }
  ];

  container.innerHTML = users.map(u => {
    const userData = perUser.filter(p => p.username === u.name);
    const income = userData.find(d => d.type === 'income')?.total || 0;
    const expenses = userData.find(d => d.type === 'expense')?.total || 0;
    const balance = income - expenses;

    return `
      <div class="user-card">
        <div class="avatar" style="background:${u.gradient}">${u.name[0]}</div>
        <div class="name">${u.name}</div>
        <div class="user-stat">
          <span class="label">Rendimentos</span>
          <span class="value income">${formatCurrency(income)}</span>
        </div>
        <div class="user-stat">
          <span class="label">Despesas</span>
          <span class="value expense">${formatCurrency(expenses)}</span>
        </div>
        <div class="user-stat">
          <span class="label">Saldo</span>
          <span class="value" style="color:${balance >= 0 ? 'var(--success)' : 'var(--danger)'}">
            ${formatCurrency(balance)}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function renderCategoryBreakdown(byCategory, totalExpenses) {
  const container = document.getElementById('categoryBreakdown');
  const expenses = byCategory.filter(c => c.type === 'expense');

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📊</div>
        <p>Sem despesas registadas este mes</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `<ul class="category-list">${expenses.map(cat => {
    const pct = totalExpenses > 0 ? (cat.total / totalExpenses * 100) : 0;
    return `
      <li class="category-item">
        <div class="category-icon" style="background:${cat.color}18">${cat.icon}</div>
        <div class="category-info">
          <div class="name">${cat.name}</div>
          <div class="category-bar">
            <div class="fill" style="width:${pct}%;background:${cat.color}"></div>
          </div>
        </div>
        <div class="category-amount">${formatCurrency(cat.total)}</div>
        <div class="category-pct">${pct.toFixed(0)}%</div>
      </li>
    `;
  }).join('')}</ul>`;

  // Animate bars in
  setTimeout(() => {
    container.querySelectorAll('.fill').forEach(bar => {
      const width = bar.style.width;
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { bar.style.width = width; });
      });
    });
  }, 50);
}

// ============ TRANSACTIONS ============
async function loadTransactions() {
  try {
    let url = `/transactions?month=${currentMonth}&year=${currentYear}`;
    if (currentFilter !== 'all') url += `&type=${currentFilter}`;
    const transactions = await api(url);
    renderTransactionList('allTransactions', transactions);
  } catch (err) {
    showToast('Erro ao carregar transacoes', 'error');
  }
}

function filterTransactions(filter) {
  currentFilter = filter;
  document.querySelectorAll('#transactionTabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  loadTransactions();
}

function renderTransactionList(containerId, transactions) {
  const container = document.getElementById(containerId);

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">💸</div>
        <p>Nenhuma transacao encontrada</p>
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map((t, i) => `
    <li class="transaction-item" style="animation: pageIn 0.3s ease-out ${i * 0.04}s both">
      <div class="transaction-icon" style="background:${t.category_color}18">
        ${t.category_icon}
      </div>
      <div class="transaction-details">
        <div class="title">
          ${t.description || t.category_name}
          <span class="user-badge" style="background:${t.avatar_color}">${t.username}</span>
        </div>
        <div class="meta">
          <span>${t.category_name}</span>
          <span>·</span>
          <span>${formatDate(t.date)}</span>
        </div>
      </div>
      <div class="transaction-amount ${t.type}">
        ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
      </div>
      <div class="transaction-actions">
        <button class="btn-icon" onclick="editTransaction(${t.id})" title="Editar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon delete" onclick="deleteTransaction(${t.id})" title="Apagar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </li>
  `).join('');
}

// ============ TRANSACTION MODAL ============
let editingTransactionData = null;

function openTransactionModal(data = null) {
  editingTransactionData = data;
  const type = data?.type || 'expense';

  document.getElementById('transactionModalTitle').textContent = data ? 'Editar Transacao' : 'Nova Transacao';
  document.getElementById('transactionId').value = data?.id || '';
  document.getElementById('transactionType').value = type;
  document.getElementById('transactionAmount').value = data?.amount || '';
  document.getElementById('transactionDate').value = data?.date || new Date().toISOString().split('T')[0];
  document.getElementById('transactionDesc').value = data?.description || '';

  setTransactionType(type);
  if (data) document.getElementById('transactionCategory').value = data.category_id;

  openModal('transactionModal');
}

function setTransactionType(type) {
  document.getElementById('transactionType').value = type;
  const expBtn = document.getElementById('typeExpense');
  const incBtn = document.getElementById('typeIncome');

  expBtn.className = type === 'expense' ? 'active-expense' : '';
  incBtn.className = type === 'income' ? 'active-income' : '';

  populateCategorySelect('transactionCategory', type);

  if (editingTransactionData?.type === type) {
    document.getElementById('transactionCategory').value = editingTransactionData.category_id;
  }
}

async function saveTransaction() {
  const id = document.getElementById('transactionId').value;
  const data = {
    category_id: parseInt(document.getElementById('transactionCategory').value),
    type: document.getElementById('transactionType').value,
    amount: parseFloat(document.getElementById('transactionAmount').value),
    date: document.getElementById('transactionDate').value,
    description: document.getElementById('transactionDesc').value.trim()
  };

  if (!data.category_id || !data.amount || !data.date) {
    showToast('Preenche todos os campos obrigatorios', 'error');
    return;
  }

  try {
    if (id) {
      await api(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      showToast('Transacao atualizada!', 'success');
    } else {
      await api('/transactions', { method: 'POST', body: JSON.stringify(data) });
      showToast('Transacao adicionada!', 'success');
    }

    closeModal('transactionModal');
    if (currentPage === 'dashboard') loadDashboard();
    else loadTransactions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editTransaction(id) {
  try {
    const transactions = await api(`/transactions?month=${currentMonth}&year=${currentYear}`);
    const t = transactions.find(tr => tr.id === id);
    if (t) openTransactionModal(t);
  } catch (err) {
    showToast('Erro ao carregar transacao', 'error');
  }
}

async function deleteTransaction(id) {
  if (!confirm('Tens a certeza que queres apagar esta transacao?')) return;

  try {
    await api(`/transactions/${id}`, { method: 'DELETE' });
    showToast('Transacao apagada', 'success');
    if (currentPage === 'dashboard') loadDashboard();
    else loadTransactions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============ FIXED EXPENSES ============
async function loadFixedExpenses() {
  try {
    const expenses = await api('/fixed-expenses');
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('fixedTotal').textContent = `Total: ${formatCurrency(total)}`;

    const container = document.getElementById('fixedExpensesList');

    if (expenses.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📋</div>
          <p>Nenhuma despesa fixa registada</p>
        </div>
      `;
      return;
    }

    container.innerHTML = expenses.map((e, i) => `
      <div class="fixed-expense-item" style="animation: pageIn 0.3s ease-out ${i * 0.05}s both">
        <div class="transaction-icon" style="background:${e.category_color}18">
          ${e.category_icon}
        </div>
        <div class="transaction-details">
          <div class="title">
            ${e.description}
            <span class="fixed-badge ${e.is_shared ? 'shared' : 'individual'}">
              ${e.is_shared ? '👥 Partilhada' : '👤 Individual'}
            </span>
          </div>
          <div class="meta">
            <span>${e.category_name}</span>
            ${e.due_day ? `<span>·</span><span class="due-day">Dia ${e.due_day}</span>` : ''}
            ${e.is_shared ? `<span>·</span><span>${formatCurrency(e.amount / 2)} cada</span>` : ''}
          </div>
        </div>
        <div class="transaction-amount expense">${formatCurrency(e.amount)}</div>
        <div class="transaction-actions" style="opacity:1">
          <button class="btn-icon" onclick="editFixedExpense(${e.id})" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon delete" onclick="deleteFixedExpense(${e.id})" title="Apagar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast('Erro ao carregar despesas fixas', 'error');
  }
}

function openFixedModal(data = null) {
  document.getElementById('fixedModalTitle').textContent = data ? 'Editar Despesa Fixa' : 'Nova Despesa Fixa';
  document.getElementById('fixedId').value = data?.id || '';
  document.getElementById('fixedDesc').value = data?.description || '';
  document.getElementById('fixedAmount').value = data?.amount || '';
  document.getElementById('fixedDueDay').value = data?.due_day || '';
  document.getElementById('fixedShared').checked = data ? !!data.is_shared : true;

  populateCategorySelect('fixedCategory', 'expense');
  if (data) document.getElementById('fixedCategory').value = data.category_id;

  openModal('fixedModal');
}

async function saveFixedExpense() {
  const id = document.getElementById('fixedId').value;
  const data = {
    category_id: parseInt(document.getElementById('fixedCategory').value),
    description: document.getElementById('fixedDesc').value.trim(),
    amount: parseFloat(document.getElementById('fixedAmount').value),
    due_day: parseInt(document.getElementById('fixedDueDay').value) || null,
    is_shared: document.getElementById('fixedShared').checked
  };

  if (!data.category_id || !data.description || !data.amount) {
    showToast('Preenche todos os campos obrigatorios', 'error');
    return;
  }

  try {
    if (id) {
      await api(`/fixed-expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      showToast('Despesa fixa atualizada!', 'success');
    } else {
      await api('/fixed-expenses', { method: 'POST', body: JSON.stringify(data) });
      showToast('Despesa fixa adicionada!', 'success');
    }

    closeModal('fixedModal');
    loadFixedExpenses();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editFixedExpense(id) {
  try {
    const expenses = await api('/fixed-expenses');
    const e = expenses.find(ex => ex.id === id);
    if (e) openFixedModal(e);
  } catch (err) {
    showToast('Erro ao carregar despesa fixa', 'error');
  }
}

async function deleteFixedExpense(id) {
  if (!confirm('Tens a certeza que queres apagar esta despesa fixa?')) return;

  try {
    await api(`/fixed-expenses/${id}`, { method: 'DELETE' });
    showToast('Despesa fixa removida', 'success');
    loadFixedExpenses();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============ MODAL UTILS ============
function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
      m.classList.remove('active');
    });
    document.body.style.overflow = '';
  }
});

// ============ HELPERS ============
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : '❌'} ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    toast.style.transition = 'all 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

function logout() {
  localStorage.clear();
  window.location.href = '/';
}

// ============ LOGS ============
async function loadLogs() {
  const container = document.getElementById('logsList');
  container.innerHTML = `<div class="empty-state"><div class="icon">⏳</div><p>A carregar...</p></div>`;

  try {
    const logs = await api('/logs');

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📋</div>
          <p>Ainda nao ha atividade registada</p>
        </div>`;
      return;
    }

    const actionLabel = { created: 'Adicionou', updated: 'Editou', deleted: 'Apagou' };
    const entityLabel = { transaction: 'transacao', fixed_expense: 'despesa fixa' };

    // Group by date
    const grouped = {};
    logs.forEach(log => {
      const date = log.created_at.split(' ')[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(log);
    });

    let html = '<ul class="log-feed">';

    Object.entries(grouped).forEach(([date, items]) => {
      html += `
        <li style="padding:12px 28px 4px;border-bottom:1px solid var(--border-light)">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">
            ${formatLogDate(date)}
          </span>
        </li>`;

      items.forEach((log, i) => {
        const isDeleted = log.action === 'deleted';
        const amountClass = isDeleted ? 'neutral' : (log.entity_type === 'transaction' ? 'expense' : 'neutral');
        const time = log.created_at.split(' ')[1]?.substring(0, 5) || '';

        html += `
          <li class="log-item" style="animation-delay:${i * 0.04}s">
            <div class="log-dot ${log.action}">
              ${log.entity_icon || '📦'}
            </div>
            <div class="log-body">
              <div class="log-main">
                <span class="log-user-badge" style="background:${log.avatar_color}">${log.username}</span>
                <span class="log-action-badge ${log.action}">${actionLabel[log.action] || log.action}</span>
                <span class="log-description">${log.entity_description || '—'}</span>
              </div>
              <div class="log-meta">
                <span class="log-category">${log.entity_icon || ''} ${log.entity_category || entityLabel[log.entity_type] || log.entity_type}</span>
                ${log.amount != null ? `<span class="log-amount ${amountClass}">${isDeleted ? '' : ''}${formatCurrency(log.amount)}</span>` : ''}
                <span class="log-time">⏱ ${time}</span>
              </div>
            </div>
          </li>`;
      });
    });

    html += '</ul>';
    container.innerHTML = html;

  } catch (err) {
    showToast('Erro ao carregar logs', 'error');
  }
}

function formatLogDate(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Hoje';
  if (dateStr === yesterday) return 'Ontem';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' });
}

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
  // Ctrl+N or Cmd+N = new transaction (only when no modal open)
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !document.querySelector('.modal-overlay.active')) {
    e.preventDefault();
    openTransactionModal();
  }
});
