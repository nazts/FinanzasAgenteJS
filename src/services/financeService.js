import { RULE_50_30_20, CATEGORIES } from '../config/constants.js';
import { getTotalByType, getSummaryByMonth } from '../database/queries.js';

/**
 * Calculate 50/30/20 ideal amounts from income.
 */
export function calculate502030(income) {
  return {
    needs: income * RULE_50_30_20.needs,
    wants: income * RULE_50_30_20.wants,
    savings: income * RULE_50_30_20.savings,
  };
}

/**
 * Analyse actual vs ideal 50/30/20 spending for a user/month.
 */
export function analyzeExpenses(userId, year, month) {
  const income = getTotalByType(userId, 'income', year, month);
  const ideal = calculate502030(income);

  const summary = getSummaryByMonth(userId, year, month);
  const actual = { needs: 0, wants: 0, savings: 0 };

  for (const row of summary) {
    if (row.type === 'expense') {
      if (row.category === CATEGORIES.NEED) actual.needs += row.total;
      else if (row.category === CATEGORIES.WANT) actual.wants += row.total;
      else if (row.category === CATEGORIES.SAVING) actual.savings += row.total;
    }
  }

  const totalExpenses = actual.needs + actual.wants + actual.savings;

  const deviations = {
    needs: actual.needs - ideal.needs,
    wants: actual.wants - ideal.wants,
    savings: actual.savings - ideal.savings,
  };

  return { income, ideal, actual, totalExpenses, deviations };
}

/**
 * Generate alert messages if the user is over budget.
 */
export function checkAlerts(userId, year, month) {
  const { deviations, income } = analyzeExpenses(userId, year, month);
  const alerts = [];

  if (income === 0) return alerts;

  if (deviations.needs > 0) {
    alerts.push(`⚠️ Estás gastando *$${deviations.needs.toFixed(2)} más* de lo ideal en necesidades.`);
  }
  if (deviations.wants > 0) {
    alerts.push(`⚠️ Estás gastando *$${deviations.wants.toFixed(2)} más* de lo ideal en gustos.`);
  }
  if (deviations.savings < 0) {
    alerts.push(`💡 Tu ahorro está *$${Math.abs(deviations.savings).toFixed(2)} por debajo* del ideal.`);
  }

  return alerts;
}

/**
 * Full monthly report object.
 */
export function getMonthlyAnalysis(userId, year, month) {
  const analysis = analyzeExpenses(userId, year, month);
  const alerts = checkAlerts(userId, year, month);
  const surplus = analysis.income - analysis.totalExpenses;

  return { ...analysis, alerts, surplus };
}
