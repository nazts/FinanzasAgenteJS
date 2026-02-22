import { Markup } from 'telegraf';
import { getOrCreateUser } from '../models/User.js';
import { createGoal, findGoalsByUser, updateGoalProgress, deleteGoal } from '../database/queries.js';
import { validateAmount, sanitizeText } from '../utils/validator.js';
import { formatCurrency, formatDate, buildProgressBar } from '../utils/formatter.js';

// Pending creation state per user
const pendingGoal = new Map();

export async function goalsHandler(ctx) {
  const user = getOrCreateUser(ctx);
  await ctx.reply(
    '🎯 *Gestión de Metas de Ahorro*\n¿Qué deseas hacer?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Crear meta', `goal:create:${user.id}`)],
        [Markup.button.callback('📋 Ver mis metas', `goal:list:${user.id}`)],
      ]),
    }
  );
}

export async function goalsCallbackHandler(ctx) {
  const data = ctx.callbackQuery?.data || '';
  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== 'goal') return;

  const action = parts[1];
  const userId = parseInt(parts[2], 10);

  await ctx.answerCbQuery();

  if (action === 'create') {
    pendingGoal.set(userId, { step: 'name' });
    await ctx.editMessageText(
      '➕ *Nueva Meta*\n\nEscribe el *nombre* de tu meta (ej: "Vacaciones", "Fondo de emergencia"):',
      { parse_mode: 'Markdown' }
    );
  } else if (action === 'list') {
    const goals = findGoalsByUser(userId);
    if (goals.length === 0) {
      return ctx.editMessageText('📭 No tienes metas registradas. Usa /metas para crear una.');
    }
    const lines = goals.map((g) => {
      const bar = buildProgressBar(g.current_amount, g.target_amount);
      const deadline = g.deadline ? `\n   📅 Vence: ${formatDate(g.deadline)}` : '';
      return (
        `🎯 *${g.name}*\n` +
        `   ${bar}\n` +
        `   ${formatCurrency(g.current_amount)} / ${formatCurrency(g.target_amount)}` +
        deadline
      );
    });
    await ctx.editMessageText(
      `📋 *Tus Metas:*\n\n${lines.join('\n\n')}`,
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Handle text messages during goal creation flow.
 */
export async function goalsTextHandler(ctx) {
  const text = (ctx.message?.text || '').trim();
  const user = getOrCreateUser(ctx);
  const state = pendingGoal.get(user.id);
  if (!state) return false; // not in a goal creation flow

  if (state.step === 'name') {
    state.name = sanitizeText(text);
    state.step = 'amount';
    pendingGoal.set(user.id, state);
    await ctx.reply('💰 ¿Cuál es el *monto objetivo* de tu meta? (ej: 10000)', {
      parse_mode: 'Markdown',
    });
    return true;
  }

  if (state.step === 'amount') {
    const { valid, amount, error } = validateAmount(text);
    if (!valid) {
      await ctx.reply(`❌ ${error}\nIngresa un monto numérico positivo:`);
      return true;
    }
    state.targetAmount = amount;
    state.step = 'deadline';
    pendingGoal.set(user.id, state);
    await ctx.reply(
      '📅 ¿Cuál es la fecha límite? (formato AAAA-MM-DD)\nO escribe *omitir* para no establecer fecha.',
      { parse_mode: 'Markdown' }
    );
    return true;
  }

  if (state.step === 'deadline') {
    let deadline = null;
    if (text.toLowerCase() !== 'omitir') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const d = new Date(text);
      if (!dateRegex.test(text) || isNaN(d.getTime()) || d <= new Date()) {
        await ctx.reply('❌ Fecha inválida. Usa formato AAAA-MM-DD con una fecha futura, o escribe *omitir*:', {
          parse_mode: 'Markdown',
        });
        return true;
      }
      deadline = text;
    }
    pendingGoal.delete(user.id);
    const goal = createGoal({
      userId: user.id,
      name: state.name,
      targetAmount: state.targetAmount,
      deadline,
    });
    const bar = buildProgressBar(0, goal.target_amount);
    await ctx.reply(
      `✅ *Meta creada:* ${goal.name}\n` +
        `💰 Objetivo: ${formatCurrency(goal.target_amount)}\n` +
        `${bar}\n` +
        (deadline ? `📅 Fecha límite: ${formatDate(deadline)}\n` : '') +
        `\nUsa /metas para ver tus metas.`,
      { parse_mode: 'Markdown' }
    );
    return true;
  }

  return false;
}
