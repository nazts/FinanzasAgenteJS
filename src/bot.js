import './config/index.js'; // validates env vars first
import express from 'express';
import { Telegraf, Scenes, session } from 'telegraf';
import { BOT_TOKEN, RENDER_EXTERNAL_URL, PORT } from './config/index.js';
import { getDb, closeDb } from './database/index.js';
import { checkLimit } from './utils/rateLimiter.js';
import { activityLoggerMiddleware } from './utils/activityLogger.js';
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
import { askHandler, askCallbackHandler } from './handlers/askHandler.js';
import { updateIncomeHandler } from './handlers/updateIncomeHandler.js';
import { suggestionHandler } from './handlers/suggestionHandler.js';
import { helpHandler } from './handlers/helpHandler.js';
import { dashboardRouter, setBotInstance } from './dashboard/dashboardRoutes.js';

// Initialise DB (runs migrations)
getDb();

const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 180_000 });
setBotInstance(bot);

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

// ── Activity logger middleware ───────────────────────────────────────────────
bot.use(activityLoggerMiddleware);

// ── Command handlers ─────────────────────────────────────────────────────────
bot.start(startHandler);
bot.command('ingreso', incomeHandler);
bot.command('gasto', expenseHandler);
bot.command('resumen', summaryHandler);
bot.command('reporte', reportHandler);
bot.command('perfil', profileHandler);
bot.command('metas', goalsHandler);
bot.command('onboarding', onboardingCommand);
bot.command('preguntar', askHandler);
bot.command('actualizar_ingreso', updateIncomeHandler);
bot.command('sugerencia', suggestionHandler);
bot.command('ayuda', helpHandler);

// ── Callback query handlers ───────────────────────────────────────────────────
bot.action(/^cat:/, expenseCategoryHandler);
bot.action(/^goal:/, goalsCallbackHandler);
bot.action(/^ask:/, askCallbackHandler);
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
bot.catch((err) => {
  // Suppress noisy timeout / stale-query errors — they're benign after restart
  const msg = err?.message || '';
  if (msg.includes('timed out') || msg.includes('query is too old')) {
    console.warn('[Bot] Suppressed:', msg.split('\n')[0]);
    return;
  }
  errorHandler(err);
});

// ── Express server + Webhook ──────────────────────────────────────────────────
const app = express();

app.get('/', (_req, res) => {
  res.send('🤖 Bot activo');
});

// ── Dashboard routes ──────────────────────────────────────────────────────────
app.use(dashboardRouter);

const webhookPath = `/bot${BOT_TOKEN}`;
app.use(bot.webhookCallback(webhookPath));

app.listen(PORT, async () => {
  console.log(`🚀 Servidor Express escuchando en puerto ${PORT}`);

  const webhookUrl = `${RENDER_EXTERNAL_URL}${webhookPath}`;

  try {
    await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
    console.log(`✅ Webhook configurado: ${webhookUrl}`);
  } catch (err) {
    console.error('❌ Error configurando webhook:', err.message);
    process.exit(1);
  }

  // Dashboard URL
  const dashboardUrl = RENDER_EXTERNAL_URL
    ? `${RENDER_EXTERNAL_URL}/admin`
    : `http://localhost:${PORT}/admin`;
  console.log(`📊 Dashboard disponible en: ${dashboardUrl}`);
  console.log('🤖 Bot iniciado correctamente en modo webhook.');
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`Recibida señal ${signal}. Cerrando...`);
  bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => console.log('Webhook eliminado.'))
    .catch((err) => console.error('Error eliminando webhook:', err.message))
    .finally(() => {
      closeDb();
      console.log(`Bot detenido (${signal}).`);
      process.exit(0);
    });
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));


