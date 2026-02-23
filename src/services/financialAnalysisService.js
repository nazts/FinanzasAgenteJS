import { RULE_50_30_20 } from '../config/constants.js';
import { calculate502030 } from './financeService.js';

// ── Income normalisation ─────────────────────────────────────────────────────

const FREQUENCY_MULTIPLIER = {
    semanal: 4.33,       // ~52 weeks / 12 months
    quincenal: 2,
    mensual: 1,
};

/**
 * Convert the declared salary into a monthly figure based on payment frequency.
 * @param {number} salary  – amount per pay period
 * @param {string} frequency – 'semanal' | 'quincenal' | 'mensual'
 * @returns {number}
 */
export function calculateMonthlyIncome(salary, frequency) {
    const multiplier = FREQUENCY_MULTIPLIER[frequency] ?? 1;
    return salary * multiplier;
}

// ── Financial structure ──────────────────────────────────────────────────────

/**
 * Build a full financial analysis from a completed profile row.
 * @param {object} profile – row from financial_profiles table
 * @returns {object}
 */
export function analyzeFinancialStructure(profile) {
    // The wizard now asks for total monthly income directly,
    // so profile.salary IS the monthly income. Frequency is stored for reference only.
    const monthlyIncome = profile.salary || 0;

    // Fixed expenses (needs): transport, food, services, studies, debt installment
    const fixedExpenses =
        (profile.transport_cost || 0) +
        (profile.food_cost || 0) +
        (profile.services_cost || 0) +
        (profile.study_cost || 0) +
        (profile.debt_monthly || 0);

    // Variable expenses (wants): leisure
    const variableExpenses = profile.leisure_cost || 0;

    const totalExpenses = fixedExpenses + variableExpenses;
    const savingsCapacity = monthlyIncome - totalExpenses;
    const savingsPercent = monthlyIncome > 0 ? savingsCapacity / monthlyIncome : 0;
    const debtIncomeRatio = monthlyIncome > 0 ? (profile.debt_monthly || 0) / monthlyIncome : 0;

    // 50/30/20 comparison
    const ideal = calculate502030(monthlyIncome);
    const actualNeeds = fixedExpenses;
    const actualWants = variableExpenses;
    const actualSavings = savingsCapacity;

    const comparison = {
        needs: { real: actualNeeds, ideal: ideal.needs, diff: actualNeeds - ideal.needs },
        wants: { real: actualWants, ideal: ideal.wants, diff: actualWants - ideal.wants },
        savings: { real: actualSavings, ideal: ideal.savings, diff: actualSavings - ideal.savings },
    };

    return {
        monthlyIncome,
        fixedExpenses,
        variableExpenses,
        totalExpenses,
        savingsCapacity,
        savingsPercent,
        debtIncomeRatio,
        debtTotal: profile.debt_total || 0,
        debtMonthly: profile.debt_monthly || 0,
        isStudent: !!profile.is_student,
        comparison,
        rule: RULE_50_30_20,
    };
}

// ── Alert detection ──────────────────────────────────────────────────────────

/**
 * Detect warning conditions from a financial analysis.
 * @param {object} analysis – output of analyzeFinancialStructure
 * @returns {string[]}
 */
export function detectAlerts(analysis) {
    const alerts = [];

    if (analysis.debtIncomeRatio > 0.4) {
        alerts.push(
            `🚨 *Sobreendeudamiento:* tu deuda mensual representa el ` +
            `${(analysis.debtIncomeRatio * 100).toFixed(1)}% de tu ingreso (umbral: 40%).`,
        );
    }

    if (analysis.savingsPercent < 0.1 && analysis.savingsPercent >= 0) {
        alerts.push(
            `⚠️ *Ahorro bajo:* solo puedes ahorrar el ` +
            `${(analysis.savingsPercent * 100).toFixed(1)}% de tu ingreso (mínimo recomendado: 10%).`,
        );
    }

    if (analysis.savingsPercent < 0) {
        alerts.push(
            `🔴 *Déficit:* tus gastos superan tu ingreso mensual. ` +
            `Estás gastando $${Math.abs(analysis.savingsCapacity).toFixed(2)} más de lo que ganas.`,
        );
    }

    if (analysis.comparison.wants.diff > 0 && analysis.monthlyIncome > 0) {
        const wantsPct = (analysis.comparison.wants.real / analysis.monthlyIncome * 100).toFixed(1);
        alerts.push(
            `⚠️ *Ocio elevado:* gastas ${wantsPct}% en ocio (ideal: 30%).`,
        );
    }

    if (analysis.savingsCapacity > 0 && analysis.savingsCapacity < analysis.monthlyIncome * 0.1) {
        const emergencyMonths = analysis.monthlyIncome > 0
            ? (analysis.savingsCapacity * 6 / analysis.monthlyIncome).toFixed(1)
            : '0';
        alerts.push(
            `💡 *Sin fondo de emergencia viable:* al ritmo actual, tardarías ~${emergencyMonths} meses ` +
            `en juntar 1 mes de gastos. Se recomienda tener 3–6 meses.`,
        );
    }

    return alerts;
}
