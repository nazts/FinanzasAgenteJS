/* ═══════════════════════════════════════════════════════════════════════════
   Behavioral Analysis Service
   ─────────────────────────────────────────────────────────────────────────
   Temporal analysis engine that detects spending patterns, anomalies,
   and behavioral drift. Separated from the static financialAnalysisService.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
    getMonthlyCategoryTotals,
    getFinancialProfile,
    upsertFinancialProfile,
    getTotalByType,
} from '../database/queries.js';
import { analyzeFinancialStructure, detectAlerts } from './financialAnalysisService.js';

// ── Constants ────────────────────────────────────────────────────────────────

const ANOMALY_THRESHOLD = 0.15;        // 15 % above average → anomaly
const RECURRING_MIN_MONTHS = 2;        // 2+ consecutive months of spike → recurring
const MONTHS_FOR_AVERAGE = 3;          // baseline window
const MONTHS_FOR_TRENDS = 6;           // full trend window
const CATEGORY_LABELS = {
    necesidad: 'Necesidades',
    gusto: 'Ocio',
    ahorro: 'Ahorro',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a { month → { category → total } } map from raw query rows. */
function buildMonthCategoryMap(rows) {
    const map = {};
    for (const r of rows) {
        if (!map[r.month]) map[r.month] = {};
        map[r.month][r.category] = (map[r.month][r.category] || 0) + r.total;
    }
    return map;
}

/** Sorted array of month keys from a map (ascending). */
function sortedMonths(map) {
    return Object.keys(map).sort();
}

/** Current YYYY-MM string. */
function currentYearMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1) CATEGORY TRENDS — month-over-month growth rate
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute month-over-month growth rate per category for the last N months.
 * @param {number} userId
 * @returns {{ trends: Object, monthlyData: Object }}
 */
export function analyzeCategoryTrends(userId) {
    const rows = getMonthlyCategoryTotals(userId, MONTHS_FOR_TRENDS);
    const mcMap = buildMonthCategoryMap(rows);
    const months = sortedMonths(mcMap);

    // Per-category, compute growth from month to month
    const trends = {}; // category → [{ month, total, growthPct }]
    const allCategories = new Set(rows.map(r => r.category));

    for (const cat of allCategories) {
        trends[cat] = [];
        let prev = null;
        for (const m of months) {
            const total = mcMap[m][cat] || 0;
            const growthPct = prev !== null && prev > 0
                ? ((total - prev) / prev) * 100
                : 0;
            trends[cat].push({ month: m, total: Math.round(total * 100) / 100, growthPct: Math.round(growthPct * 10) / 10 });
            prev = total;
        }
    }

    return { trends, monthlyData: mcMap, months };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2) INCREMENT ANOMALY DETECTION — current month vs 3-month average
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Flag categories where current month spending exceeds the 3-month average
 * by more than ANOMALY_THRESHOLD (15 %).
 * @param {number} userId
 * @returns {{ anomalies: Array, currentMonth: string }}
 */
export function detectIncrementAnomalies(userId) {
    const { trends, months } = analyzeCategoryTrends(userId);
    const curMonth = currentYearMonth();
    const anomalies = [];

    for (const [cat, entries] of Object.entries(trends)) {
        // Entries for the last 3 months BEFORE current
        const pastEntries = entries.filter(e => e.month !== curMonth).slice(-MONTHS_FOR_AVERAGE);
        const currentEntry = entries.find(e => e.month === curMonth);

        if (!currentEntry || pastEntries.length === 0) continue;

        const avgPast = pastEntries.reduce((s, e) => s + e.total, 0) / pastEntries.length;
        if (avgPast === 0) continue;

        const deviation = (currentEntry.total - avgPast) / avgPast;

        if (deviation > ANOMALY_THRESHOLD) {
            anomalies.push({
                category: cat,
                label: CATEGORY_LABELS[cat] || cat,
                currentTotal: currentEntry.total,
                avgPast: Math.round(avgPast * 100) / 100,
                deviationPct: Math.round(deviation * 1000) / 10,
                month: curMonth,
            });
        }
    }

    return { anomalies, currentMonth: curMonth };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3) RECURRING SPIKE DETECTION — 2+ consecutive months above threshold
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Identify categories with spikes persisting 2+ consecutive months.
 * @param {number} userId
 * @returns {Array<{ category, months, confidence }>}
 */
export function detectRecurringSpikes(userId) {
    const { trends } = analyzeCategoryTrends(userId);
    const recurring = [];

    for (const [cat, entries] of Object.entries(trends)) {
        if (entries.length < MONTHS_FOR_AVERAGE + 1) continue;

        // Walk through entries and find consecutive above-threshold months
        let consecutiveHighMonths = [];
        for (let i = MONTHS_FOR_AVERAGE; i < entries.length; i++) {
            // Average of previous MONTHS_FOR_AVERAGE entries
            const window = entries.slice(i - MONTHS_FOR_AVERAGE, i);
            const avg = window.reduce((s, e) => s + e.total, 0) / window.length;
            if (avg === 0) continue;

            const deviation = (entries[i].total - avg) / avg;
            if (deviation > ANOMALY_THRESHOLD) {
                consecutiveHighMonths.push({
                    month: entries[i].month,
                    deviation: Math.round(deviation * 1000) / 10,
                });
            } else {
                // Broken streak — check if we had enough
                if (consecutiveHighMonths.length >= RECURRING_MIN_MONTHS) {
                    recurring.push({
                        category: cat,
                        label: CATEGORY_LABELS[cat] || cat,
                        months: [...consecutiveHighMonths],
                        confidence: Math.min(consecutiveHighMonths.length / 4, 1),
                    });
                }
                consecutiveHighMonths = [];
            }
        }

        // Check trailing streak
        if (consecutiveHighMonths.length >= RECURRING_MIN_MONTHS) {
            recurring.push({
                category: cat,
                label: CATEGORY_LABELS[cat] || cat,
                months: [...consecutiveHighMonths],
                confidence: Math.min(consecutiveHighMonths.length / 4, 1),
            });
        }
    }

    return recurring;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4) COMPOSITE BEHAVIORAL METRICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute composite behavioral indicators.
 * @param {number} userId
 * @returns {{ categoryGrowthRate, behavioralDriftIndex, recurringSpikeConfidence, selfControlIndicator }}
 */
export function calculateBehavioralMetrics(userId) {
    const { trends } = analyzeCategoryTrends(userId);
    const { anomalies } = detectIncrementAnomalies(userId);
    const recurring = detectRecurringSpikes(userId);
    const profile = getFinancialProfile(userId);

    // Category Growth Rate — average absolute growth across all categories for latest month
    let totalGrowth = 0;
    let catCount = 0;
    for (const entries of Object.values(trends)) {
        if (entries.length < 2) continue;
        const last = entries[entries.length - 1];
        totalGrowth += Math.abs(last.growthPct);
        catCount++;
    }
    const categoryGrowthRate = catCount > 0
        ? Math.round((totalGrowth / catCount) * 10) / 10
        : 0;

    // Behavioral Drift Index — how far the user has drifted from their own baseline
    // Combines anomaly count + severity
    const driftRaw = anomalies.reduce((s, a) => s + a.deviationPct, 0);
    const behavioralDriftIndex = Math.round(Math.min(driftRaw / 50, 1) * 100) / 100;

    // Recurring Spike Confidence — max confidence across detected patterns
    const recurringSpikeConfidence = recurring.length > 0
        ? Math.max(...recurring.map(r => r.confidence))
        : 0;

    // Financial Self-Control Indicator — 0 to 1 (1 = great)
    // Based on: few anomalies, low drift, consistent savings
    const anomalyPenalty = Math.min(anomalies.length * 0.15, 0.5);
    const driftPenalty = behavioralDriftIndex * 0.3;
    const spikePenalty = recurringSpikeConfidence * 0.2;
    const selfControlIndicator = Math.round(Math.max(1 - anomalyPenalty - driftPenalty - spikePenalty, 0) * 100) / 100;

    // Risk level classification
    let behavioralRiskLevel = 'normal';
    if (selfControlIndicator < 0.4) behavioralRiskLevel = 'alto';
    else if (selfControlIndicator < 0.65) behavioralRiskLevel = 'moderado';
    else if (selfControlIndicator < 0.85) behavioralRiskLevel = 'bajo';

    return {
        categoryGrowthRate,
        behavioralDriftIndex,
        recurringSpikeConfidence,
        selfControlIndicator,
        behavioralRiskLevel,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5) SPLIT RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate split adjustment suggestions based on detected patterns.
 * @param {number} userId
 * @param {{ anomalies, recurring, metrics, profile }} analysis
 * @returns {string[]}
 */
export function generateSplitRecommendations(analysis) {
    const { anomalies, recurring, metrics, structuralAnalysis } = analysis;
    const suggestions = [];

    // Leisure growing recurrently → reduce variable %
    const leisureSpike = anomalies.find(a => a.category === 'gusto');
    const leisureRecurring = recurring.find(r => r.category === 'gusto');
    if (leisureRecurring) {
        suggestions.push(
            `📉 Tu gasto en ocio ha crecido de forma recurrente (${leisureRecurring.months.length} meses consecutivos). ` +
            `Considera reducir tu % variable del presupuesto.`
        );
    } else if (leisureSpike) {
        suggestions.push(
            `⚠️ Tu gasto en ocio este mes es ${leisureSpike.deviationPct}% superior al promedio. ` +
            `Si continúa, conviene ajustar tu split.`
        );
    }

    // Needs growing → evaluate if income is sufficient
    const needsSpike = anomalies.find(a => a.category === 'necesidad');
    if (needsSpike && structuralAnalysis) {
        const needsPct = structuralAnalysis.monthlyIncome > 0
            ? (needsSpike.currentTotal / structuralAnalysis.monthlyIncome * 100).toFixed(1)
            : 0;
        if (needsPct > 60) {
            suggestions.push(
                `🔴 Tus necesidades representan ${needsPct}% del ingreso (ideal: 50%). ` +
                `Evalúa si tus ingresos son suficientes o si algún gasto fijo puede reducirse.`
            );
        }
    }

    // Savings unstable or falling → suggest emergency fund increase
    if (structuralAnalysis && structuralAnalysis.savingsPercent < 0.15) {
        suggestions.push(
            `💡 Tu ahorro actual es ${(structuralAnalysis.savingsPercent * 100).toFixed(1)}%. ` +
            `Prioriza aumentar tu fondo de emergencia antes de gastos variables.`
        );
    }

    // High debt + high variable spending → prioritize debt
    if (structuralAnalysis && structuralAnalysis.debtIncomeRatio > 0.3 && leisureSpike) {
        suggestions.push(
            `🚨 Tu ratio deuda/ingreso es ${(structuralAnalysis.debtIncomeRatio * 100).toFixed(1)}% ` +
            `y tu gasto variable está en alza. Prioriza reducir la deuda antes de gastos de ocio.`
        );
    }

    // Self-control indicator warning
    if (metrics.selfControlIndicator < 0.5) {
        suggestions.push(
            `⚡ Tu indicador de autocontrol financiero es bajo (${(metrics.selfControlIndicator * 100).toFixed(0)}%). ` +
            `Se detecta un patrón de gasto impulsivo. Considera establecer límites diarios.`
        );
    }

    return suggestions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6) FULL BEHAVIORAL REPORT (orchestrator)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete behavioral analysis: runs all sub-analyses, persists results,
 * and returns the full report object.
 * @param {number} userId
 * @returns {object}
 */
export function getFullBehavioralReport(userId) {
    const profile = getFinancialProfile(userId);

    // Category trends
    const { trends, monthlyData, months } = analyzeCategoryTrends(userId);

    // Anomaly detection
    const { anomalies, currentMonth } = detectIncrementAnomalies(userId);

    // Recurring spikes
    const recurring = detectRecurringSpikes(userId);

    // Behavioral composite metrics
    const metrics = calculateBehavioralMetrics(userId);

    // Structural analysis (existing system)
    let structuralAnalysis = null;
    let alerts = [];
    if (profile && profile.salary) {
        structuralAnalysis = analyzeFinancialStructure(profile);
        alerts = detectAlerts(structuralAnalysis);
    }

    // Split recommendations
    const splitRecommendations = generateSplitRecommendations({
        anomalies, recurring, metrics, structuralAnalysis,
    });

    // Current month totals (income for context)
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonthNum = now.getMonth() + 1;
    const variableIncome = getTotalByType(userId, 'income', curYear, curMonthNum);
    const fixedIncome = (profile && profile.onboarding_completed === 1 && profile.salary > 0)
      ? profile.salary
      : 0;
    const monthlyIncome = fixedIncome + variableIncome;

    const report = {
        userId,
        currentMonth,
        monthlyIncome,
        trends,
        monthlyData,
        months,
        anomalies,
        recurring,
        metrics,
        structuralAnalysis,
        alerts,
        splitRecommendations,
        profile,
    };

    // Persist behavioral data to profile
    try {
        upsertFinancialProfile(userId, {
            category_trends: JSON.stringify(trends),
            monthly_deviation_score: metrics.behavioralDriftIndex,
            recurring_spike_pattern: JSON.stringify(recurring),
            behavioral_risk_level: metrics.behavioralRiskLevel,
        });
    } catch (err) {
        console.error('[behavioralAnalysis] Error persisting behavioral data:', err.message);
    }

    return report;
}
