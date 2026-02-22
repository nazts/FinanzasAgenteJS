import { getOrCreateUser } from '../models/User.js';
import { MESSAGES } from '../config/constants.js';

export async function startHandler(ctx) {
  const user = getOrCreateUser(ctx);
  const name = user.first_name || ctx.from.first_name || 'amigo/a';
  await ctx.reply(MESSAGES.WELCOME(name), { parse_mode: 'Markdown' });
}
