import { Markup } from 'telegraf';
import { getOrCreateUser } from '../models/User.js';
import { createTransaction } from '../database/queries.js';
import { checkAlerts, analyzeExpenses } from '../services/financeService.js';
import { validateAmount, validateCategory, sanitizeText } from '../utils/validator.js';
import { formatCurrency, currentYearMonth } from '../utils/formatter.js';
import { CATEGORIES, MESSAGES } from '../config/constants.js';

// In-memory store for multi-step expense flow: userId -> { amount, description }
const pendingExpenses = new Map();

export async function expenseHandler(ctx) {
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  // /gasto <amount> [description...]
  const amountStr = parts[1];
  const description = sanitizeText(parts.slice(2).join(' ')) || 'Sin descripción';

  const { valid, amount, error } = validateAmount(amountStr);
  if (!valid) {
    return ctx.reply(
      `${MESSAGES.INVALID_AMOUNT}\n\n_Error: ${error}_\n\nEjemplo: /gasto 500 Supermercado`,
      { parse_mode: 'Markdown' }
    );
  }

  const user = getOrCreateUser(ctx);
  pendingExpenses.set(user.id, { amount, description });

  await ctx.reply(
    `💳 *Registrando gasto:* ${formatCurrency(amount)}\n` +
      `📝 _${description}_\n\n` +
      `¿A qué categoría pertenece?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🏠 Necesidad', `cat:${CATEGORIES.NEED}:${user.id}`),
          Markup.button.callback('🎉 Gusto', `cat:${CATEGORIES.WANT}:${user.id}`),
          Markup.button.callback('💎 Ahorro', `cat:${CATEGORIES.SAVING}:${user.id}`),
        ],
      ]),
    }
  );
}

export async function expenseCategoryHandler(ctx) {
  const data = ctx.callbackQuery?.data || '';
  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== 'cat') return;

  const category = parts[1];
  const userId = parseInt(parts[2], 10);
  const pending = pendingExpenses.get(userId);

  await ctx.answerCbQuery();

  if (!pending) {
    return ctx.editMessageText('⏳ La sesión expiró. Usa /gasto nuevamente.');
  }

  pendingExpenses.delete(userId);

  const { year, month } = currentYearMonth();

  createTransaction({
    userId,
    type: 'expense',
    amount: pending.amount,
    category,
    description: pending.description,
  });

  const { deviations } = analyzeExpenses(userId, year, month);

  const categoryMeta = {
    [CATEGORIES.NEED]:   { key: 'needs',   emoji: '🏠' },
    [CATEGORIES.WANT]:   { key: 'wants',   emoji: '🎉' },
    [CATEGORIES.SAVING]: { key: 'savings', emoji: '💎' },
  };
  const { key: catKey, emoji } = categoryMeta[category] || { key: 'needs', emoji: '🏠' };
  const dev = deviations[catKey];

  let statusLine = '';
  if (dev > 0) {
    statusLine = `⚠️ Llevas ${formatCurrency(dev)} *por encima* del ideal en esta categoría.`;
  } else {
    statusLine = `✅ Estás *dentro* del presupuesto ideal.`;
  }

  const reply =
    `✅ *Gasto registrado:* ${formatCurrency(pending.amount)}\n` +
    `${emoji} Categoría: *${category}*\n` +
    `📝 _${pending.description}_\n\n` +
    statusLine +
    `\n\nUsa /resumen para ver tu balance del mes.`;

  await ctx.editMessageText(reply, { parse_mode: 'Markdown' });
}
