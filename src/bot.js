import './config/index.js'; // validates env vars first
import { Telegraf } from 'telegraf';
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

// Initialise DB (runs migrations)
getDb();

const bot = new Telegraf(BOT_TOKEN);

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

// ── Callback query handlers ───────────────────────────────────────────────────
bot.action(/^cat:/, expenseCategoryHandler);
bot.action(/^goal:/, goalsCallbackHandler);

// ── Text messages (multi-step flows) ─────────────────────────────────────────
bot.on('text', async (ctx, next) => {
  const handled = await goalsTextHandler(ctx);
  if (!handled) return next();
});

// ── Global error handler ──────────────────────────────────────────────────────
bot.catch(errorHandler);

// ── Launch ────────────────────────────────────────────────────────────────────
await bot.launch();
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
