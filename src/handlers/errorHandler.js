import { MESSAGES } from '../config/constants.js';

export function errorHandler(err, ctx) {
  console.error('[BotError]', err);
  try {
    ctx?.reply(MESSAGES.ERROR_GENERAL);
  } catch {
    // ignore secondary errors
  }
}
