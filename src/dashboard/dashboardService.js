/* ═══════════════════════════════════════════════════════════════════════════
   FinanzasBot — Dashboard Service
   All analytics queries organized by metric group.
   Uses injectable DB getter pattern (set via setDbGetter).
   ═══════════════════════════════════════════════════════════════════════════ */

let _getDb;

export function setDbGetter(fn) { _getDb = fn; }

function db() {
    if (!_getDb) throw new Error('DB getter not set. Call setDbGetter first.');
    return _getDb();
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) OVERVIEW METRICS
// ═════════════════════════════════════════════════════════════════════════════

export function getOverviewMetrics() {
    const totalUsers = db().prepare('SELECT COUNT(*) as v FROM users').get().v;

    const active7d = db().prepare(`
    SELECT COUNT(DISTINCT user_id) as v FROM user_activity_log
    WHERE timestamp >= datetime('now', '-7 days')
  `).get().v;

    const active30d = db().prepare(`
    SELECT COUNT(DISTINCT user_id) as v FROM user_activity_log
    WHERE timestamp >= datetime('now', '-30 days')
  `).get().v;

    const onboardedUsers = db().prepare(`
    SELECT COUNT(*) as v FROM financial_profiles WHERE onboarding_completed = 1
  `).get().v;

    const withoutOnboarding = totalUsers - onboardedUsers;

    const totalTransactions = db().prepare('SELECT COUNT(*) as v FROM transactions').get().v;

    const totalCommands = db().prepare('SELECT COUNT(*) as v FROM user_activity_log').get().v;

    const totalIncome = db().prepare(
        "SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE type = 'income'"
    ).get().v;

    const totalExpenses = db().prepare(
        "SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE type = 'expense'"
    ).get().v;

    return {
        totalUsers,
        active7d,
        active30d,
        onboardedUsers,
        withoutOnboarding,
        totalTransactions,
        totalCommands,
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) USER METRICS
// ═════════════════════════════════════════════════════════════════════════════

export function getUserMetrics() {
    // Full user list with activity stats
    const users = db().prepare(`
    SELECT
      u.id, u.telegram_id, u.username, u.first_name, u.created_at,
      COALESCE(tc.tx_count, 0) as transaction_count,
      COALESCE(tc.total_income, 0) as total_income,
      COALESCE(tc.total_expense, 0) as total_expense,
      COALESCE(ac.cmd_count, 0) as command_count,
      ac.last_command,
      CASE WHEN fp.onboarding_completed = 1 THEN 1 ELSE 0 END as onboarding_done,
      fp.salary
    FROM users u
    LEFT JOIN (
      SELECT user_id,
        COUNT(*) as tx_count,
        SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_expense
      FROM transactions GROUP BY user_id
    ) tc ON tc.user_id = u.id
    LEFT JOIN (
      SELECT user_id,
        COUNT(*) as cmd_count,
        MAX(timestamp) as last_command
      FROM user_activity_log GROUP BY user_id
    ) ac ON ac.user_id = u.id
    LEFT JOIN financial_profiles fp ON fp.user_id = u.id
    ORDER BY command_count DESC
  `).all();

    // Top 10 by commands
    const top10 = users.slice(0, 10);

    // New users per day (last 30 days)
    const newPerDay = db().prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM users
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `).all();

    return { users, top10, newPerDay };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3) INTERACTION METRICS
// ═════════════════════════════════════════════════════════════════════════════

export function getInteractionMetrics() {
    // Command distribution
    const commandDistribution = db().prepare(`
    SELECT command, COUNT(*) as count
    FROM user_activity_log
    GROUP BY command
    ORDER BY count DESC
  `).all();

    // Most used command
    const mostUsed = commandDistribution.length > 0 ? commandDistribution[0] : null;

    // Total commands
    const totalCommands = db().prepare('SELECT COUNT(*) as v FROM user_activity_log').get().v;

    // Unique users who issued commands
    const uniqueUsers = db().prepare(
        'SELECT COUNT(DISTINCT user_id) as v FROM user_activity_log'
    ).get().v;

    // Average interactions per user
    const avgPerUser = uniqueUsers > 0 ? Math.round((totalCommands / uniqueUsers) * 10) / 10 : 0;

    // Top 10 users by command count
    const top10Users = db().prepare(`
    SELECT u.id, u.username, u.first_name, u.telegram_id, COUNT(a.id) as cmd_count
    FROM user_activity_log a
    JOIN users u ON u.id = a.user_id
    GROUP BY a.user_id
    ORDER BY cmd_count DESC
    LIMIT 10
  `).all();

    // Recent activity (last 50 commands)
    const recentCommands = db().prepare(`
    SELECT a.command, a.timestamp, u.username, u.first_name
    FROM user_activity_log a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.timestamp DESC
    LIMIT 50
  `).all();

    // Commands per day (last 30 days)
    const commandsPerDay = db().prepare(`
    SELECT DATE(timestamp) as day, COUNT(*) as count
    FROM user_activity_log
    WHERE timestamp >= datetime('now', '-30 days')
    GROUP BY DATE(timestamp)
    ORDER BY day ASC
  `).all();

    return {
        commandDistribution,
        mostUsed,
        totalCommands,
        avgPerUser,
        top10Users,
        recentCommands,
        commandsPerDay,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// 4) FINANCE METRICS
// ═════════════════════════════════════════════════════════════════════════════

export function getFinanceMetrics() {
    // Average declared salary
    const avgSalary = db().prepare(`
    SELECT COALESCE(AVG(salary), 0) as v
    FROM financial_profiles WHERE salary > 0
  `).get().v;

    // All profiles for aggregate analysis
    const profiles = db().prepare(`
    SELECT fp.*, u.id as uid
    FROM financial_profiles fp
    JOIN users u ON u.id = fp.user_id
    WHERE fp.salary > 0
  `).all();

    // Compute per-user savings rate & 50/30/20 deviation
    let totalSavingsRate = 0;
    let lowSaverCount = 0;       // < 10% savings
    let overIndebtedCount = 0;   // > 40% income in debt
    let totalLeisure = 0;
    let deviationSum = 0;

    const lowSavers = [];
    const overIndebted = [];

    for (const p of profiles) {
        const salary = p.salary || 0;
        if (salary <= 0) continue;

        // Actual category spending from profiles
        const needs = (p.transport_cost || 0) + (p.food_cost || 0) + (p.services_cost || 0) + (p.study_cost || 0);
        const wants = p.leisure_cost || 0;
        const debtPmt = p.debt_monthly || 0;
        const totalSpent = needs + wants + debtPmt;
        const savings = Math.max(salary - totalSpent, 0);
        const savingsRate = (savings / salary) * 100;
        const debtRatio = (debtPmt / salary) * 100;

        totalSavingsRate += savingsRate;
        totalLeisure += wants;

        // 50/30/20 deviation
        const needsPct = (needs / salary) * 100;
        const wantsPct = (wants / salary) * 100;
        const savingsPct = savingsRate;
        deviationSum += Math.abs(needsPct - 50) + Math.abs(wantsPct - 30) + Math.abs(savingsPct - 20);

        // Get user info for tables
        const user = db().prepare('SELECT username, first_name, telegram_id FROM users WHERE id = ?').get(p.user_id);

        if (savingsRate < 10) {
            lowSaverCount++;
            lowSavers.push({
                username: user?.username, first_name: user?.first_name,
                salary, savingsRate: Math.round(savingsRate * 10) / 10,
            });
        }

        if (debtRatio > 40) {
            overIndebtedCount++;
            overIndebted.push({
                username: user?.username, first_name: user?.first_name,
                salary, debtMonthly: debtPmt, debtRatio: Math.round(debtRatio * 10) / 10,
            });
        }
    }

    const profileCount = profiles.length || 1;
    const avgSavingsRate = Math.round((totalSavingsRate / profileCount) * 10) / 10;
    const avgDeviation = Math.round((deviationSum / profileCount) * 10) / 10;
    const avgLeisure = Math.round(totalLeisure / profileCount);
    const pctLowSavers = Math.round((lowSaverCount / profileCount) * 100);
    const pctOverIndebted = Math.round((overIndebtedCount / profileCount) * 100);

    // Monthly evolution (last 6 months)
    const monthlyEvolution = db().prepare(`
    SELECT
      strftime('%Y-%m', date) as month,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) -
        SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as savings
    FROM transactions
    WHERE date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month ASC
  `).all();

    // Category distribution for expenses
    const categoryTotals = db().prepare(`
    SELECT category, COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'expense' AND category IS NOT NULL
    GROUP BY category
  `).all();

    return {
        avgSalary: Math.round(avgSalary),
        avgSavingsRate,
        avgDeviation,
        avgLeisure,
        pctLowSavers,
        pctOverIndebted,
        lowSavers,
        overIndebted,
        monthlyEvolution,
        categoryTotals,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// 5) FUNNEL & RETENTION METRICS
// ═════════════════════════════════════════════════════════════════════════════

export function getFunnelMetrics() {
    const totalRegistered = db().prepare('SELECT COUNT(*) as v FROM users').get().v;

    const completedOnboarding = db().prepare(`
    SELECT COUNT(*) as v FROM financial_profiles WHERE onboarding_completed = 1
  `).get().v;

    const madeIncome = db().prepare(`
    SELECT COUNT(DISTINCT user_id) as v FROM transactions WHERE type = 'income'
  `).get().v;

    const madeExpense = db().prepare(`
    SELECT COUNT(DISTINCT user_id) as v FROM transactions WHERE type = 'expense'
  `).get().v;

    // Users who used /reporte command
    const generatedReport = db().prepare(`
    SELECT COUNT(DISTINCT user_id) as v FROM user_activity_log WHERE command = '/reporte'
  `).get().v;

    // Funnel stages
    const funnel = [
        { stage: 'Registrados', count: totalRegistered, pct: 100 },
        { stage: 'Onboarding completo', count: completedOnboarding, pct: totalRegistered > 0 ? Math.round((completedOnboarding / totalRegistered) * 100) : 0 },
        { stage: 'Registró ingreso', count: madeIncome, pct: totalRegistered > 0 ? Math.round((madeIncome / totalRegistered) * 100) : 0 },
        { stage: 'Registró gasto', count: madeExpense, pct: totalRegistered > 0 ? Math.round((madeExpense / totalRegistered) * 100) : 0 },
        { stage: 'Generó reporte', count: generatedReport, pct: totalRegistered > 0 ? Math.round((generatedReport / totalRegistered) * 100) : 0 },
    ];

    // Retention: users who came back after 7 days from first interaction
    const retention7d = db().prepare(`
    SELECT COUNT(DISTINCT a1.user_id) as v
    FROM user_activity_log a1
    WHERE EXISTS (
      SELECT 1 FROM user_activity_log a2
      WHERE a2.user_id = a1.user_id
        AND a2.timestamp >= datetime(a1.timestamp, '+7 days')
    )
  `).get().v;

    const retentionRate = totalRegistered > 0
        ? Math.round((retention7d / totalRegistered) * 100) : 0;

    // Abandoned onboarding: have profile record but onboarding_completed = 0
    const abandonedOnboarding = db().prepare(`
    SELECT COUNT(*) as v FROM financial_profiles WHERE onboarding_completed = 0
  `).get().v;

    // Users who started /onboarding but never completed
    const startedOnboarding = db().prepare(`
    SELECT COUNT(DISTINCT user_id) as v FROM user_activity_log WHERE command = '/onboarding'
  `).get().v;

    return {
        funnel,
        retention7d,
        retentionRate,
        abandonedOnboarding,
        startedOnboarding,
    };
}
