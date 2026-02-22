import { getOrCreateUser } from '../models/User.js';
import { getMonthlyAnalysis } from '../services/financeService.js';
import { findGoalsByUser } from '../database/queries.js';
import { analyzeFinancialProfile } from '../services/aiService.js';
import { currentYearMonth } from '../utils/formatter.js';

export async function profileHandler(ctx) {
  const user = getOrCreateUser(ctx);
  const { year, month } = currentYearMonth();
  const financialData = getMonthlyAnalysis(user.id, year, month);
  const goals = findGoalsByUser(user.id);

  await ctx.reply('🧠 Analizando tu perfil financiero con IA... Un momento.');

  const { riskProfile, recommendations } = await analyzeFinancialProfile({
    ...financialData,
    goals,
  });

  const recLines = recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');

  const reply =
    `🧠 *Perfil Financiero IA*\n\n` +
    `👤 *Usuario:* ${user.first_name || 'Usuario'}\n` +
    `📊 *Perfil de riesgo:* ${riskProfile}\n\n` +
    `💡 *Recomendaciones personalizadas:*\n${recLines}\n\n` +
    `_Análisis basado en tus datos del mes actual._`;

  await ctx.reply(reply, { parse_mode: 'Markdown' });
}
