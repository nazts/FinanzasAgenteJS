import { getOrCreateUser } from '../models/User.js';
import { createTransaction, getFinancialProfile } from '../database/queries.js';
import { calculate502030 } from '../services/financeService.js';
import { validateAmount, sanitizeText } from '../utils/validator.js';
import { formatCurrency } from '../utils/formatter.js';
import { MESSAGES } from '../config/constants.js';

export async function incomeHandler(ctx) {
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  // /ingreso <amount> [description...]
  const amountStr = parts[1];
  const description = sanitizeText(parts.slice(2).join(' ')) || 'Sin descripción';

  const { valid, amount, error } = validateAmount(amountStr);
  if (!valid) {
    return ctx.reply(
      `${MESSAGES.INVALID_AMOUNT}\n\n_Error: ${error}_\n\nEjemplo: /ingreso 15000 Salario`,
      { parse_mode: 'Markdown' }
    );
  }

  const user = getOrCreateUser(ctx);
  createTransaction({
    userId: user.id,
    type: 'income',
    amount,
    description,
  });

  const profile = getFinancialProfile(user.id);
  const fixedIncome = (profile && profile.onboarding_completed === 1) ? (profile.salary || 0) : 0;
  const totalIncome = fixedIncome + amount;

  const dist = calculate502030(totalIncome);

  const incomeContextLines = fixedIncome > 0
    ? `\n📌 *Ingreso fijo mensual:* ${formatCurrency(fixedIncome)}\n` +
      `📊 *Ingreso variable (este registro):* ${formatCurrency(amount)}\n` +
      `💰 *Ingreso total:* ${formatCurrency(totalIncome)}\n`
    : '';

  const reply =
    `✅ *Ingreso registrado:* ${formatCurrency(amount)}\n` +
    `📝 _${description}_\n` +
    incomeContextLines +
    `\n📐 *Distribución recomendada (50/30/20):*\n` +
    `🏠 Necesidades (50%): ${formatCurrency(dist.needs)}\n` +
    `🎉 Gustos (30%):      ${formatCurrency(dist.wants)}\n` +
    `💎 Ahorro (20%):      ${formatCurrency(dist.savings)}\n\n` +
    `Registra tus gastos con /gasto y consulta tu resumen con /resumen.`;

  await ctx.reply(reply, { parse_mode: 'Markdown' });
}
