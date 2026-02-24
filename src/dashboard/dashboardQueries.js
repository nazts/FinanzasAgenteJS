let _getDb;

export function setDbGetter(fn) {
  _getDb = fn;
}

function getDb() {
  if (!_getDb) throw new Error('DB getter not set. Call setDbGetter first.');
  return _getDb();
}

// ── General Stats ──────────────────────────────────────────────────────────

export function getTotalUsers() {
  return getDb().prepare('SELECT COUNT(*) as count FROM users').get().count;
}

export function getActiveUsers(days = 7) {
  return getDb().prepare(`
    SELECT COUNT(DISTINCT u.id) as count
    FROM users u
    JOIN transactions t ON t.user_id = u.id
    WHERE t.created_at >= datetime('now', ?)
  `).get(`-${days} days`).count;
}

export function getOnboardedUsers() {
  return getDb().prepare(`
    SELECT COUNT(*) as count
    FROM financial_profiles
    WHERE onboarding_completed = 1
  `).get().count;
}

export function getTotalTransactions() {
  return getDb().prepare('SELECT COUNT(*) as count FROM transactions').get().count;
}

export function getTotalIncome() {
  return getDb().prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income'"
  ).get().total;
}

export function getTotalExpenses() {
  return getDb().prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense'"
  ).get().total;
}

// ── Stats bundle ───────────────────────────────────────────────────────────

export function getDashboardStats() {
  return {
    totalUsers: getTotalUsers(),
    activeUsers: getActiveUsers(),
    onboardedUsers: getOnboardedUsers(),
    totalTransactions: getTotalTransactions(),
    totalIncome: getTotalIncome(),
    totalExpenses: getTotalExpenses(),
    balance: getTotalIncome() - getTotalExpenses(),
  };
}

// ── Users list with activity ───────────────────────────────────────────────

export function getUsersList() {
  return getDb().prepare(`
    SELECT
      u.id,
      u.telegram_id,
      u.username,
      u.first_name,
      u.created_at,
      COUNT(t.id) as transaction_count,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense,
      MAX(t.created_at) as last_activity,
      CASE WHEN fp.onboarding_completed = 1 THEN 1 ELSE 0 END as onboarding_done
    FROM users u
    LEFT JOIN transactions t ON t.user_id = u.id
    LEFT JOIN financial_profiles fp ON fp.user_id = u.id
    GROUP BY u.id
    ORDER BY transaction_count DESC
  `).all();
}

// ── Recent activity ────────────────────────────────────────────────────────

export function getRecentActivity(limit = 30) {
  return getDb().prepare(`
    SELECT
      t.id,
      t.type,
      t.amount,
      t.category,
      t.description,
      t.date,
      t.created_at,
      u.username,
      u.first_name,
      u.telegram_id
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit);
}

// ── Trends (registrations & transactions per day, last 30 days) ────────────

export function getRegistrationTrends(days = 30) {
  return getDb().prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM users
    WHERE created_at >= datetime('now', ?)
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `).all(`-${days} days`);
}

export function getTransactionTrends(days = 30) {
  return getDb().prepare(`
    SELECT date as day, COUNT(*) as count, SUM(amount) as total
    FROM transactions
    WHERE created_at >= datetime('now', ?)
    GROUP BY date
    ORDER BY day ASC
  `).all(`-${days} days`);
}

export function getTrends() {
  return {
    registrations: getRegistrationTrends(),
    transactions: getTransactionTrends(),
  };
}

// ── Category distribution ──────────────────────────────────────────────────

export function getCategoryDistribution() {
  return getDb().prepare(`
    SELECT
      category,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'expense' AND category IS NOT NULL
    GROUP BY category
    ORDER BY total DESC
  `).all();
}

export function getIncomeVsExpense() {
  return getDb().prepare(`
    SELECT
      type,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total
    FROM transactions
    GROUP BY type
  `).all();
}

export function getCategoriesData() {
  return {
    distribution: getCategoryDistribution(),
    incomeVsExpense: getIncomeVsExpense(),
  };
}

// ── Goals summary ──────────────────────────────────────────────────────────

export function getGoalsSummary() {
  const goals = getDb().prepare(`
    SELECT
      g.id,
      g.name,
      g.target_amount,
      g.current_amount,
      g.deadline,
      g.created_at,
      u.username,
      u.first_name,
      ROUND(g.current_amount * 100.0 / g.target_amount, 1) as progress_pct
    FROM goals g
    JOIN users u ON u.id = g.user_id
    ORDER BY g.created_at DESC
  `).all();

  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => g.current_amount >= g.target_amount).length;
  const avgProgress = totalGoals > 0
    ? Math.round(goals.reduce((sum, g) => sum + (g.progress_pct || 0), 0) / totalGoals)
    : 0;

  return { goals, totalGoals, completedGoals, avgProgress };
}

// ── Interactions (most used commands approx. from transaction types) ──────

export function getInteractionsByType() {
  return getDb().prepare(`
    SELECT
      type,
      category,
      COUNT(*) as count
    FROM transactions
    GROUP BY type, category
    ORDER BY count DESC
  `).all();
}
