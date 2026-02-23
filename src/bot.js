import './config/index.js'; // validates env vars first
import { Telegraf, Scenes, session } from 'telegraf';
import { BOT_TOKEN } from './config/index.js';
import { getDb, closeDb } from './database/index.js';
import { checkLimit } from './utils/rateLimiter.js';
import { MESSAGES } from './config/constants.js';

import { startHandler } from './handlers/startHandler.js';
import { incomeHandler } from './handlers/incomeHandler.js';
import { expenseHandler, expenseCategoryHandler } from './handlers/expenseHandler.js';
import { summaryHandler } from './handlers/summaryHandler.js';
import { reportHandler } from './handlers/reportHandler.js';
import { profileHandler } from './handlers/profileHandler.js';
import { goalsHandler, goalsCallbackHandler, goalsTextHandler } from './handlers/goalsHandler.js';
import { errorHandler } from './handlers/errorHandler.js';
import { onboardingScene, onboardingCommand } from './handlers/onboardingHandler.js';

// Initialise DB (runs migrations)
getDb();

const bot = new Telegraf(BOT_TOKEN);

// ── Session & Scenes middleware ──────────────────────────────────────────────
const stage = new Scenes.Stage([onboardingScene]);
bot.use(session());
bot.use(stage.middleware());

// ── Rate limiter middleware ──────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId && !checkLimit(userId)) {
    return ctx.reply(MESSAGES.RATE_LIMITED);
  }
  return next();
});

// ── Command handlers ─────────────────────────────────────────────────────────
bot.start(startHandler);
bot.command('ingreso', incomeHandler);
bot.command('gasto', expenseHandler);
bot.command('resumen', summaryHandler);
bot.command('reporte', reportHandler);
bot.command('perfil', profileHandler);
bot.command('metas', goalsHandler);
bot.command('onboarding', onboardingCommand);

// ── Callback query handlers ───────────────────────────────────────────────────
bot.action(/^cat:/, expenseCategoryHandler);
bot.action(/^goal:/, goalsCallbackHandler);
bot.action('redo_onboarding', async (ctx) => {
  try { await ctx.answerCbQuery(); } catch { /* stale */ }
  return ctx.scene.enter('onboarding-wizard');
});
bot.action('keep_onboarding', async (ctx) => {
  try { await ctx.answerCbQuery(); } catch { /* stale */ }
  await ctx.reply('👍 Perfecto, tu perfil se mantiene. Usa /perfil para ver tu análisis.');
});

// ── Text messages (multi-step flows) ─────────────────────────────────────────
bot.on('text', async (ctx, next) => {
  const handled = await goalsTextHandler(ctx);
  if (!handled) return next();
});

// ── Global error handler ──────────────────────────────────────────────────────
bot.catch(errorHandler);

// ── Launch ────────────────────────────────────────────────────────────────────
await bot.launch({ dropPendingUpdates: true });
console.log('🤖 Bot iniciado correctamente.');

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  closeDb();
  console.log('Bot detenido (SIGINT).');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  closeDb();
  console.log('Bot detenido (SIGTERM).');
});
