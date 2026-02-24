import { getDb } from '../database/index.js';

/**
 * Telegraf middleware — logs every command to user_activity_log.
 * Runs fire-and-forget so it never blocks the handler pipeline.
 */
export function activityLoggerMiddleware(ctx, next) {
    try {
        const text = ctx.message?.text || ctx.callbackQuery?.data || '';
        // Only log slash-commands and callback actions
        if (text.startsWith('/') || text.startsWith('cat:') || text.startsWith('goal:')) {
            const telegramId = String(ctx.from?.id);
            if (telegramId) {
                const command = text.startsWith('/')
                    ? text.split(/\s+/)[0].split('@')[0]   // "/gasto 500" → "/gasto"
                    : text.split(':').slice(0, 2).join(':'); // "cat:necesidad:3" → "cat:necesidad"

                // Resolve internal user_id (may not exist yet for /start)
                const user = getDb()
                    .prepare('SELECT id FROM users WHERE telegram_id = ?')
                    .get(telegramId);

                if (user) {
                    getDb()
                        .prepare('INSERT INTO user_activity_log (user_id, command) VALUES (?, ?)')
                        .run(user.id, command);
                }
            }
        }
    } catch {
        // Never block the bot — silently ignore logging errors
    }
    return next();
}
