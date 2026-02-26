import { getDb } from './index.js';

/** Returns the last day of a given month as YYYY-MM-DD string. */
function monthRange(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  // First day of next month minus one day = last day of current month
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

// ── Users ──────────────────────────────────────────────────────────────────

export function findUserByTelegramId(telegramId) {
  return getDb()
    .prepare('SELECT * FROM users WHERE telegram_id = ?')
    .get(String(telegramId));
}

export function findAllTelegramIds() {
  return getDb()
    .prepare('SELECT telegram_id FROM users')
    .all();
}

export function createUser({ telegramId, username, firstName }) {
  const stmt = getDb().prepare(
    'INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)'
  );
  const result = stmt.run(String(telegramId), username || null, firstName || null);
  return findUserByTelegramId(telegramId);
}

// ── Transactions ───────────────────────────────────────────────────────────

export function createTransaction({ userId, type, amount, category, description, date }) {
  const stmt = getDb().prepare(
    `INSERT INTO transactions (user_id, type, amount, category, description, date)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    userId,
    type,
    amount,
    category || null,
    description || null,
    date || new Date().toISOString().split('T')[0]
  );
  return getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
}

export function findTransactionsByUserAndMonth(userId, year, month) {
  const { from, to } = monthRange(year, month);
  return getDb()
    .prepare(
      `SELECT * FROM transactions
       WHERE user_id = ? AND date BETWEEN ? AND ?
       ORDER BY date DESC`
    )
    .all(userId, from, to);
}

export function getSummaryByMonth(userId, year, month) {
  const { from, to } = monthRange(year, month);
  return getDb()
    .prepare(
      `SELECT type, category, SUM(amount) as total, COUNT(*) as count
       FROM transactions
       WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY type, category`
    )
    .all(userId, from, to);
}

export function getTotalByType(userId, type, year, month) {
  const { from, to } = monthRange(year, month);
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE user_id = ? AND type = ? AND date BETWEEN ? AND ?`
    )
    .get(userId, type, from, to);
  return row ? row.total : 0;
}


export function getMonthlyCategoryTotals(userId, monthsBack = 6) {
  return getDb()
    .prepare(
      `SELECT
         strftime('%Y-%m', date) AS month,
         category,
         SUM(amount) AS total,
         COUNT(*) AS tx_count
       FROM transactions
       WHERE user_id = ?
         AND type = 'expense'
         AND date >= date('now', ? || ' months')
       GROUP BY month, category
       ORDER BY month ASC, category`
    )
    .all(userId, String(-Math.abs(monthsBack)));
}

// ── Goals ──────────────────────────────────────────────────────────────────

export function createGoal({ userId, name, targetAmount, deadline }) {
  const stmt = getDb().prepare(
    `INSERT INTO goals (user_id, name, target_amount, deadline)
     VALUES (?, ?, ?, ?)`
  );
  const result = stmt.run(userId, name, targetAmount, deadline || null);
  return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid);
}

export function findGoalsByUser(userId) {
  return getDb()
    .prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
}

export function updateGoalProgress(goalId, amount) {
  getDb()
    .prepare(
      `UPDATE goals
       SET current_amount = current_amount + ?,
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(amount, goalId);
  return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
}

export function deleteGoal(goalId, userId) {
  return getDb()
    .prepare('DELETE FROM goals WHERE id = ? AND user_id = ?')
    .run(goalId, userId);
}

// ── Financial Profiles ─────────────────────────────────────────────────────

export function upsertFinancialProfile(userId, data) {
  const fields = [
    'salary', 'payment_frequency', 'is_student', 'study_cost',
    'transport_cost', 'food_cost', 'leisure_cost', 'services_cost',
    'has_debt', 'debt_total', 'debt_monthly', 'onboarding_completed',
    'category_trends', 'monthly_deviation_score',
    'recurring_spike_pattern', 'behavioral_risk_level',
    'current_savings', 'is_employed', 'income_type',
  ];

  // Build only the fields present in data
  const updates = {};
  for (const f of fields) {
    if (data[f] !== undefined) updates[f] = data[f];
  }

  const existing = getDb()
    .prepare('SELECT id FROM financial_profiles WHERE user_id = ?')
    .get(userId);

  if (existing) {
    if (Object.keys(updates).length === 0) return getFinancialProfile(userId);
    const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
    getDb()
      .prepare(`UPDATE financial_profiles SET ${setClauses}, updated_at = datetime('now') WHERE user_id = @user_id`)
      .run({ ...updates, user_id: userId });
  } else {
    const cols = ['user_id', ...Object.keys(updates)];
    const placeholders = cols.map(c => `@${c}`).join(', ');
    getDb()
      .prepare(`INSERT INTO financial_profiles (${cols.join(', ')}) VALUES (${placeholders})`)
      .run({ user_id: userId, ...updates });
  }

  return getFinancialProfile(userId);
}

export function getFinancialProfile(userId) {
  return getDb()
    .prepare('SELECT * FROM financial_profiles WHERE user_id = ?')
    .get(userId) || null;
}

export function markOnboardingCompleted(userId) {
  return upsertFinancialProfile(userId, { onboarding_completed: 1 });
}

// ── Suggestions ────────────────────────────────────────────────────────────

export function createSuggestion(userId, message) {
  const stmt = getDb().prepare(
    'INSERT INTO suggestions (user_id, message) VALUES (?, ?)'
  );
  const result = stmt.run(userId, message);
  return getDb().prepare('SELECT * FROM suggestions WHERE id = ?').get(result.lastInsertRowid);
}

export function getAllSuggestions() {
  return getDb()
    .prepare(
      `SELECT s.id, s.message, s.created_at, u.username, u.first_name, u.telegram_id
       FROM suggestions s
       JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC`
    )
    .all();
}
