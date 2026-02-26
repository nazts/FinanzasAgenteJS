import { getOrCreateUser } from '../models/User.js';
import { getFinancialProfile } from '../database/queries.js';

/**
 * /ayuda — Explica cómo funciona el agente financiero.
 */
export async function helpHandler(ctx) {
    const user = getOrCreateUser(ctx);
    const profile = getFinancialProfile(user.id);
    const name = user.first_name || ctx.from.first_name || 'amigo/a';

    const completed = profile?.onboarding_completed;

    const helpText =
        `🤖 *¿Cómo funciona tu Agente Financiero?*\n\n` +

        `Soy tu asistente personal de finanzas. Te ayudo a organizar tu dinero ` +
        `usando la regla *50/30/20* y análisis con inteligencia artificial.\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 *PASO 1 — Perfil Financiero*\n` +
        `Al iniciar con /start, te hago un cuestionario rápido sobre tu ` +
        `salario, gastos fijos y deudas. Con eso creo tu perfil y un análisis ` +
        `personalizado con IA.\n\n` +

        `📥 *PASO 2 — Registra tus movimientos*\n` +
        `Cada vez que recibas dinero o gastes, regístralo:\n` +
        `• /ingreso \`5000 Freelance\` — Registra un ingreso\n` +
        `• /gasto \`800 Supermercado\` — Registra un gasto\n` +
        `El bot clasifica automáticamente cada gasto como *necesidad*, *gusto* o *ahorro*.\n\n` +

        `📊 *PASO 3 — Analiza tu progreso*\n` +
        `• /resumen — Ve cuánto has ganado, gastado y ahorrado este mes\n` +
        `• /reporte — Gráficas visuales de tu distribución de gastos\n` +
        `• /perfil — Análisis profundo con IA de tu salud financiera\n\n` +

        `🎯 *PASO 4 — Fija metas*\n` +
        `• /metas — Crea metas de ahorro con fecha límite y monitorea tu avance\n\n` +

        `🤖 *PASO 5 — Pregunta lo que quieras*\n` +
        `• /preguntar — Hazle cualquier pregunta sobre tus finanzas a la IA\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 *Otros comandos útiles:*\n` +
        `• /actualizar\\_ingreso \`<monto>\` — Actualiza tu ingreso fijo\n` +
        `• /onboarding — Refaz tu perfil financiero desde cero\n` +
        `• /sugerencia \`<texto>\` — Envía una sugerencia al equipo\n\n` +

        `📌 *Tip:* Mientras más movimientos registres, más preciso será tu análisis con IA.` +
        (completed ? '' : `\n\n⚡ *¡Comienza ahora!* Usa /start para configurar tu perfil.`);

    return ctx.reply(helpText, { parse_mode: 'Markdown' });
}
