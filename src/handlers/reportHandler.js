import { getOrCreateUser } from '../models/User.js';
import { getMonthlyAnalysis } from '../services/financeService.js';
import { generatePieChart, generateBarChart } from '../services/reportService.js';
import { formatCurrency, currentYearMonth, monthName } from '../utils/formatter.js';

export async function reportHandler(ctx) {
  const user = getOrCreateUser(ctx);
  const { year, month } = currentYearMonth();
  const data = getMonthlyAnalysis(user.id, year, month);

  if (data.income === 0 && data.totalExpenses === 0) {
    return ctx.reply('📭 No hay datos para generar el reporte. Registra transacciones primero.');
  }

  await ctx.reply('⏳ Generando gráficas, un momento...');

  try {
    const [pieBuffer, barBuffer] = await Promise.all([
      generatePieChart(data.actual),
      generateBarChart(data.actual, data.ideal),
    ]);

    const caption =
      `📈 *Reporte ${monthName(month)} ${year}*\n` +
      `💰 Ingresos: ${formatCurrency(data.income)}\n` +
      `💸 Gastos: ${formatCurrency(data.totalExpenses)}\n` +
      `${data.surplus >= 0 ? '✅' : '🔴'} Saldo: ${formatCurrency(data.surplus)}`;

    await ctx.replyWithPhoto(
      { source: pieBuffer },
      { caption: `🥧 Distribución de gastos\n${caption}`, parse_mode: 'Markdown' }
    );

    await ctx.replyWithPhoto(
      { source: barBuffer },
      { caption: `📊 Real vs Ideal (50/30/20)\n${caption}`, parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[reportHandler]', err);
    await ctx.reply('❌ Error generando gráficas. Verifica la instalación de chartjs-node-canvas.');
  }
}
