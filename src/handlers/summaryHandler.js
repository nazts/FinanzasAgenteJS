import { getOrCreateUser } from '../models/User.js';
import { getMonthlyAnalysis } from '../services/financeService.js';
import { formatCurrency, formatPercentage, currentYearMonth, monthName } from '../utils/formatter.js';

export async function summaryHandler(ctx) {
  const user = getOrCreateUser(ctx);
  const { year, month } = currentYearMonth();
  const data = getMonthlyAnalysis(user.id, year, month);

  if (data.income === 0 && data.totalExpenses === 0) {
    return ctx.reply(
      '📭 No hay datos registrados para este mes.\n' +
      'Registra un ingreso con /ingreso o configura tu salario con /actualizar_ingreso.'
    );
  }

  const { income, fixedIncome, variableIncome, ideal, actual, totalExpenses, deviations, alerts, surplus } = data;

  const pctNeeds = income > 0 ? actual.needs / income : 0;
  const pctWants = income > 0 ? actual.wants / income : 0;
  const pctSavings = income > 0 ? actual.savings / income : 0;

  const devSign = (n) => (n > 0 ? `+${formatCurrency(n)}` : formatCurrency(n));

  const incomeLines = [`💰 *Ingresos:* ${formatCurrency(income)}`];
  if (fixedIncome > 0 || variableIncome > 0) {
    incomeLines.push(`   📌 Fijo: ${formatCurrency(fixedIncome)}`);
    incomeLines.push(`   📊 Variable: ${formatCurrency(variableIncome)}`);
  }

  const lines = [
    `📊 *Resumen de ${monthName(month)} ${year}*\n`,
    ...incomeLines,
    `💸 *Gastos totales:* ${formatCurrency(totalExpenses)}`,
    `${surplus >= 0 ? '✅' : '🔴'} *Saldo:* ${formatCurrency(surplus)}\n`,
    `─────────────────────────`,
    `📐 *Distribución de gastos:*`,
    `🏠 Necesidades: ${formatCurrency(actual.needs)} (${formatPercentage(pctNeeds)}) | Ideal: ${formatCurrency(ideal.needs)} | ${devSign(deviations.needs)}`,
    `🎉 Gustos:      ${formatCurrency(actual.wants)} (${formatPercentage(pctWants)}) | Ideal: ${formatCurrency(ideal.wants)} | ${devSign(deviations.wants)}`,
    `💎 Ahorro:      ${formatCurrency(actual.savings)} (${formatPercentage(pctSavings)}) | Ideal: ${formatCurrency(ideal.savings)} | ${devSign(deviations.savings)}`,
  ];

  if (alerts.length > 0) {
    lines.push('\n─────────────────────────');
    lines.push('🚨 *Alertas:*');
    alerts.forEach((a) => lines.push(a));
  }

  lines.push('\n📈 Genera gráficas con /reporte');

  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
}
