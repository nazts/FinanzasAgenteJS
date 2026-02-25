import { getOrCreateUser } from '../models/User.js';
import { getFinancialProfile, upsertFinancialProfile } from '../database/queries.js';
import { validateAmount } from '../utils/validator.js';
import { formatCurrency } from '../utils/formatter.js';

export async function updateIncomeHandler(ctx) {
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  const amountStr = parts[1];

  if (!amountStr) {
    const user = getOrCreateUser(ctx);
    const profile = getFinancialProfile(user.id);
    const current = profile?.salary || 0;
    return ctx.reply(
      `💰 *Tu ingreso fijo actual:* ${formatCurrency(current)}/mes\n\n` +
      `Para actualizar, escribe:\n` +
      `/actualizar_ingreso <nuevo_monto>\n\n` +
      `Ejemplo: /actualizar_ingreso 18000`,
      { parse_mode: 'Markdown' }
    );
  }

  const { valid, amount, error } = validateAmount(amountStr);
  if (!valid) {
    return ctx.reply(`❌ ${error}\n\nEjemplo: /actualizar_ingreso 18000`);
  }

  const user = getOrCreateUser(ctx);
  upsertFinancialProfile(user.id, { salary: amount, is_employed: amount > 0 ? 1 : 0 });

  return ctx.reply(
    `✅ *Ingreso fijo actualizado:* ${formatCurrency(amount)}/mes\n\n` +
    `Este valor se usará automáticamente en todos tus análisis y reportes.`,
    { parse_mode: 'Markdown' }
  );
}
