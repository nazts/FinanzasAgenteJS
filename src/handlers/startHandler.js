import { getOrCreateUser } from '../models/User.js';
import { getFinancialProfile } from '../database/queries.js';
import { MESSAGES } from '../config/constants.js';
import { showMainMenu } from '../services/menuService.js';

export async function startHandler(ctx) {
  const user = getOrCreateUser(ctx);
  const name = user.first_name || ctx.from.first_name || 'amigo/a';

  // 1) Check if user already completed onboarding (returning user)
  const profile = getFinancialProfile(user.id);
  if (profile && profile.onboarding_completed) {
    await ctx.reply(`👋 ¡Hola de nuevo, ${name}!`, { parse_mode: 'Markdown' });
    return showMainMenu(ctx);
  }

  // 2) New user or incomplete onboarding → welcome + enter wizard
  await ctx.reply(MESSAGES.WELCOME(name), { parse_mode: 'Markdown' });
  return ctx.scene.enter('onboarding-wizard');
}
