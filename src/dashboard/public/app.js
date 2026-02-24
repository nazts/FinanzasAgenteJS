/* ═══════════════════════════════════════════════════════════════════════════
   FinanzasBot Analytics Dashboard — Frontend Logic
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = '/admin/api';
const REFRESH = 30_000;

// ── Chart.js defaults ──────────────────────────────────────────────────────
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.plugins.legend.labels.usePointStyle = true;

const TOOLTIP_STYLE = {
    backgroundColor: 'rgba(13, 13, 31, 0.95)',
    borderColor: 'rgba(0, 229, 255, 0.2)',
    borderWidth: 1, padding: 12, titleFont: { weight: '600' },
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════

let adminKey = sessionStorage.getItem('adminKey') || '';

function authHeaders() {
    return { 'x-admin-key': adminKey };
}

async function fetchAPI(path) {
    try {
        const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
        if (res.status === 401) { showLogin(); return null; }
        if (!res.ok) throw new Error(res.statusText);
        return await res.json();
    } catch (e) { console.error(`API error ${path}:`, e); return null; }
}

function showLogin() {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
}

function showApp() {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('adminKeyInput').value.trim();
    if (!key) return;
    const res = await fetch(`${API_BASE}/auth`, { headers: { 'x-admin-key': key } });
    if (res.ok) {
        adminKey = key;
        sessionStorage.setItem('adminKey', key);
        document.getElementById('loginError').textContent = '';
        showApp();
        loadAll();
    } else {
        document.getElementById('loginError').textContent = 'Clave incorrecta';
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('adminKey');
    adminKey = '';
    showLogin();
});

// Check auth on load
async function checkAuth() {
    if (!adminKey) { showLogin(); return; }
    const res = await fetch(`${API_BASE}/auth`, { headers: authHeaders() });
    if (res.ok) { showApp(); loadAll(); }
    else { showLogin(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('navTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-tab');
    if (!btn) return;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function currency(n) {
    return new Intl.NumberFormat('es-DO', {
        style: 'currency', currency: 'DOP',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(n || 0);
}

function shortDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' });
}

function timeAgo(d) {
    if (!d) return '—';
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
}

function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

let charts = {};
function destroyChart(k) { if (charts[k]) { charts[k].destroy(); charts[k] = null; } }

// Command label map
const CMD_LABELS = {
    '/start': '🚀 /start',
    '/ingreso': '📥 /ingreso',
    '/gasto': '📤 /gasto',
    '/resumen': '📊 /resumen',
    '/reporte': '📈 /reporte',
    '/perfil': '🧠 /perfil',
    '/metas': '🎯 /metas',
    '/onboarding': '📋 /onboarding',
};
const CMD_COLORS = ['#00e5ff', '#a855f7', '#34d399', '#f471b5', '#fb923c', '#fbbf24', '#06b6d4', '#f87171'];

// ═══════════════════════════════════════════════════════════════════════════
// 1) OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════

async function loadOverview() {
    const data = await fetchAPI('/metrics/overview');
    if (!data) return;

    const moneyKeys = ['totalIncome', 'totalExpenses'];
    for (const [k, v] of Object.entries(data)) {
        const el = document.getElementById(`kv-${k}`);
        if (el) el.textContent = moneyKeys.includes(k) ? currency(v) : v.toLocaleString('es-DO');
    }

    // Also load command chart + user growth for overview tab
    const intData = await fetchAPI('/metrics/interactions');
    const userData = await fetchAPI('/metrics/users');

    // User growth chart
    if (userData?.newPerDay) {
        const labels = userData.newPerDay.map(d => {
            const dt = new Date(d.day);
            return dt.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
        });
        destroyChart('userGrowth');
        charts.userGrowth = new Chart(document.getElementById('chartUserGrowth'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Nuevos Usuarios',
                    data: userData.newPerDay.map(d => d.count),
                    borderColor: '#00e5ff',
                    backgroundColor: 'rgba(0, 229, 255, 0.08)',
                    fill: true, tension: 0.4, pointRadius: 3,
                    pointHoverRadius: 6, pointBackgroundColor: '#00e5ff', borderWidth: 2,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { tooltip: TOOLTIP_STYLE },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.04)' }, ticks: { precision: 0 } },
                    x: { grid: { display: false } },
                },
            },
        });
    }

    // Command distribution chart
    if (intData?.commandDistribution) {
        const cmds = intData.commandDistribution.slice(0, 8);
        destroyChart('cmdDist');
        charts.cmdDist = new Chart(document.getElementById('chartCommandDist'), {
            type: 'bar',
            data: {
                labels: cmds.map(c => CMD_LABELS[c.command] || c.command),
                datasets: [{
                    data: cmds.map(c => c.count),
                    backgroundColor: cmds.map((_, i) => CMD_COLORS[i % CMD_COLORS.length] + 'AA'),
                    borderColor: cmds.map((_, i) => CMD_COLORS[i % CMD_COLORS.length]),
                    borderWidth: 1.5, borderRadius: 6, borderSkipped: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.04)' }, ticks: { precision: 0 } },
                    y: { grid: { display: false } },
                },
            },
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) USERS TAB
// ═══════════════════════════════════════════════════════════════════════════

async function loadUsers() {
    const data = await fetchAPI('/metrics/users');
    if (!data) return;

    const tbody = document.getElementById('usersTableBody');
    if (!data.users.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">No hay usuarios.</td></tr>';
        return;
    }
    tbody.innerHTML = data.users.map(u => `
    <tr>
      <td><strong>${esc(u.first_name || u.username || '—')}</strong></td>
      <td style="font-family:monospace;color:var(--text-muted);font-size:0.72rem">${u.telegram_id}</td>
      <td>${u.command_count}</td>
      <td>${u.transaction_count}</td>
      <td style="color:var(--accent-green)">${currency(u.total_income)}</td>
      <td style="color:var(--accent-red)">${currency(u.total_expense)}</td>
      <td>${u.salary ? currency(u.salary) : '—'}</td>
      <td><span class="onboarding-badge ${u.onboarding_done ? 'done' : 'pending'}"></span></td>
      <td>${timeAgo(u.last_command)}</td>
    </tr>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) INTERACTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════

async function loadInteractions() {
    const data = await fetchAPI('/metrics/interactions');
    if (!data) return;

    setText('kv-intTotalCmds', data.totalCommands.toLocaleString());
    setText('kv-intMostUsed', data.mostUsed ? (CMD_LABELS[data.mostUsed.command] || data.mostUsed.command) : '—');
    setText('kv-intAvgPerUser', data.avgPerUser);
    setText('kv-intTop10Count', data.top10Users.length);

    // Commands per day line
    if (data.commandsPerDay?.length) {
        const labels = data.commandsPerDay.map(d => {
            const dt = new Date(d.day);
            return dt.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
        });
        destroyChart('cmdsPerDay');
        charts.cmdsPerDay = new Chart(document.getElementById('chartCmdsPerDay'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Comandos',
                    data: data.commandsPerDay.map(d => d.count),
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.08)',
                    fill: true, tension: 0.4, pointRadius: 3,
                    pointHoverRadius: 6, pointBackgroundColor: '#a855f7', borderWidth: 2,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { tooltip: TOOLTIP_STYLE },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.04)' }, ticks: { precision: 0 } },
                    x: { grid: { display: false } },
                },
            },
        });
    }

    // Command donut
    if (data.commandDistribution?.length) {
        const cmds = data.commandDistribution.slice(0, 8);
        destroyChart('cmdDonut');
        charts.cmdDonut = new Chart(document.getElementById('chartCmdDonut'), {
            type: 'doughnut',
            data: {
                labels: cmds.map(c => CMD_LABELS[c.command] || c.command),
                datasets: [{
                    data: cmds.map(c => c.count),
                    backgroundColor: cmds.map((_, i) => CMD_COLORS[i % CMD_COLORS.length]),
                    borderColor: '#0d0d1f', borderWidth: 3, hoverOffset: 8,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } }, tooltip: TOOLTIP_STYLE },
            },
        });
    }

    // Top 10 table
    const t10Body = document.getElementById('intTop10Body');
    if (data.top10Users.length) {
        t10Body.innerHTML = data.top10Users.map((u, i) => `
      <tr>
        <td style="color:var(--accent-cyan);font-weight:700">${i + 1}</td>
        <td><strong>${esc(u.first_name || u.username || '—')}</strong></td>
        <td>${u.cmd_count}</td>
      </tr>
    `).join('');
    } else {
        t10Body.innerHTML = '<tr><td colspan="3" class="no-data">Sin datos.</td></tr>';
    }

    // Recent commands
    const recentBody = document.getElementById('intRecentBody');
    if (data.recentCommands.length) {
        recentBody.innerHTML = data.recentCommands.slice(0, 30).map(c => `
      <tr>
        <td style="color:var(--text-muted);font-size:0.72rem">${timeAgo(c.timestamp)}</td>
        <td>${esc(c.username || c.first_name || '—')}</td>
        <td><code style="color:var(--accent-cyan)">${esc(c.command)}</code></td>
      </tr>
    `).join('');
    } else {
        recentBody.innerHTML = '<tr><td colspan="3" class="no-data">Sin datos.</td></tr>';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) FINANCE TAB
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_MAP = {
    necesidad: { label: '🏠 Necesidad (50%)', color: '#f471b5' },
    gusto: { label: '🎉 Gusto (30%)', color: '#06b6d4' },
    ahorro: { label: '💎 Ahorro (20%)', color: '#a855f7' },
};

async function loadFinance() {
    const data = await fetchAPI('/metrics/finance');
    if (!data) return;

    setText('kv-finAvgSalary', currency(data.avgSalary));
    setText('kv-finAvgSavings', data.avgSavingsRate + '%');
    setText('kv-finDeviation', data.avgDeviation + ' pts');
    setText('kv-finLowSavers', data.pctLowSavers + '%');
    setText('kv-finAvgLeisure', currency(data.avgLeisure));
    setText('kv-finOverIndebted', data.pctOverIndebted + '%');

    // Monthly evolution
    if (data.monthlyEvolution?.length) {
        const months = data.monthlyEvolution.map(m => m.month);
        destroyChart('evolution');
        charts.evolution = new Chart(document.getElementById('chartEvolution'), {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Ingresos', data: data.monthlyEvolution.map(m => m.income),
                        backgroundColor: 'rgba(52, 211, 153, 0.6)', borderColor: '#34d399',
                        borderWidth: 1.5, borderRadius: 6, borderSkipped: false,
                    },
                    {
                        label: 'Gastos', data: data.monthlyEvolution.map(m => m.expense),
                        backgroundColor: 'rgba(248, 113, 113, 0.6)', borderColor: '#f87171',
                        borderWidth: 1.5, borderRadius: 6, borderSkipped: false,
                    },
                    {
                        label: 'Ahorro', data: data.monthlyEvolution.map(m => m.savings),
                        type: 'line',
                        borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.06)',
                        fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#a855f7', borderWidth: 2,
                    },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { tooltip: { ...TOOLTIP_STYLE, callbacks: { label: ctx => `${ctx.dataset.label}: ${currency(ctx.raw)}` } } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => currency(v) }, grid: { color: 'rgba(148,163,184,0.04)' } },
                    x: { grid: { display: false } },
                },
            },
        });
    }

    // Category donut
    if (data.categoryTotals?.length) {
        destroyChart('catDonut');
        charts.catDonut = new Chart(document.getElementById('chartCategoryDonut'), {
            type: 'doughnut',
            data: {
                labels: data.categoryTotals.map(c => (CATEGORY_MAP[c.category] || {}).label || c.category),
                datasets: [{
                    data: data.categoryTotals.map(c => c.total),
                    backgroundColor: data.categoryTotals.map(c => (CATEGORY_MAP[c.category] || {}).color || '#64748b'),
                    borderColor: '#0d0d1f', borderWidth: 3, hoverOffset: 8,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 } } },
                    tooltip: { ...TOOLTIP_STYLE, callbacks: { label: ctx => `${ctx.label}: ${currency(ctx.raw)}` } },
                },
            },
        });
    }

    // Low savers table
    const lsBody = document.getElementById('lowSaversBody');
    if (data.lowSavers?.length) {
        lsBody.innerHTML = data.lowSavers.map(u => `
      <tr>
        <td><strong>${esc(u.first_name || u.username || '—')}</strong></td>
        <td>${currency(u.salary)}</td>
        <td style="color:var(--accent-red);font-weight:700">${u.savingsRate}%</td>
      </tr>
    `).join('');
    } else {
        lsBody.innerHTML = '<tr><td colspan="3" class="no-data">Todos ahorran ≥10% 🎉</td></tr>';
    }

    // Indebted table
    const indBody = document.getElementById('indebtedBody');
    if (data.overIndebted?.length) {
        indBody.innerHTML = data.overIndebted.map(u => `
      <tr>
        <td><strong>${esc(u.first_name || u.username || '—')}</strong></td>
        <td>${currency(u.salary)}</td>
        <td style="color:var(--accent-orange)">${currency(u.debtMonthly)}</td>
        <td style="color:var(--accent-red);font-weight:700">${u.debtRatio}%</td>
      </tr>
    `).join('');
    } else {
        indBody.innerHTML = '<tr><td colspan="4" class="no-data">Ningún sobreendeudado 🎉</td></tr>';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) FUNNEL TAB
// ═══════════════════════════════════════════════════════════════════════════

async function loadFunnel() {
    const data = await fetchAPI('/metrics/funnel');
    if (!data) return;

    setText('kv-retention7d', data.retention7d);
    setText('kv-retentionRate', data.retentionRate + '%');
    setText('kv-abandonedOB', data.abandonedOnboarding);
    setText('kv-startedOB', data.startedOnboarding);

    // Funnel bars
    const container = document.getElementById('funnelContainer');
    if (data.funnel?.length) {
        container.innerHTML = data.funnel.map(s => `
      <div class="funnel-stage">
        <span class="funnel-label">${esc(s.stage)}</span>
        <div class="funnel-bar-track">
          <div class="funnel-bar-fill" style="width:${Math.max(s.pct, 5)}%">${s.pct}%</div>
        </div>
        <span class="funnel-count">${s.count}</span>
      </div>
    `).join('');
    } else {
        container.innerHTML = '<p class="no-data">Sin datos de embudo.</p>';
    }

    // Funnel horizontal bar chart
    if (data.funnel?.length) {
        const funnelColors = ['#00e5ff', '#a855f7', '#34d399', '#fb923c', '#f471b5'];
        destroyChart('funnel');
        charts.funnel = new Chart(document.getElementById('chartFunnel'), {
            type: 'bar',
            data: {
                labels: data.funnel.map(s => s.stage),
                datasets: [{
                    data: data.funnel.map(s => s.count),
                    backgroundColor: funnelColors.map(c => c + 'BB'),
                    borderColor: funnelColors,
                    borderWidth: 1.5, borderRadius: 6, borderSkipped: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.04)' }, ticks: { precision: 0 } },
                    y: { grid: { display: false } },
                },
            },
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function updateTimestamp() {
    const el = document.getElementById('lastUpdated');
    const now = new Date();
    el.textContent = `Actualizado: ${now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

async function loadAll() {
    await Promise.all([
        loadOverview(),
        loadUsers(),
        loadInteractions(),
        loadFinance(),
        loadFunnel(),
    ]);
    updateTimestamp();
}

// Entry point
checkAuth();
setInterval(() => { if (adminKey) loadAll(); }, REFRESH);
