import { getOrCreateUser } from '../models/User.js';
import { getFinancialProfile } from '../database/queries.js';
import { MESSAGES } from '../config/constants.js';

export async function startHandler(ctx) {
  const user = getOrCreateUser(ctx);
  const name = user.first_name || ctx.from.first_name || 'amigo/a';

  // Check if user already has a profile (returning user)
  const profile = getFinancialProfile(user.id);
  if (profile && profile.onboarding_completed) {
    await ctx.reply(MESSAGES.WELCOME_BACK(name), { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(MESSAGES.WELCOME(name), { parse_mode: 'Markdown' });
  }
}
