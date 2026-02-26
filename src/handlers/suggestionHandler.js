import { getOrCreateUser } from '../models/User.js';
import { createSuggestion } from '../database/queries.js';
import { sanitizeText } from '../utils/validator.js';

/**
 * /sugerencia <texto> — Envía una sugerencia o comentario visible en el dashboard admin.
 */
export async function suggestionHandler(ctx) {
    const user = getOrCreateUser(ctx);
    const parts = (ctx.message?.text || '').split(/\s+/);
    const text = parts.slice(1).join(' ').trim();

    if (!text) {
        return ctx.reply(
            '💬 Escribe tu sugerencia después del comando.\n' +
            'Ejemplo: `/sugerencia Me gustaría poder exportar mis datos`',
            { parse_mode: 'Markdown' },
        );
    }

    const sanitized = sanitizeText(text);
    if (!sanitized) {
        return ctx.reply('❌ La sugerencia no es válida. Intenta de nuevo.');
    }

    try {
        createSuggestion(user.id, sanitized);
        await ctx.reply('✅ ¡Gracias por tu sugerencia! El equipo la revisará. 💡');
    } catch (err) {
        console.error('[suggestion] Error:', err.message);
        await ctx.reply('❌ Error al guardar tu sugerencia. Intenta de nuevo.');
    }
}
