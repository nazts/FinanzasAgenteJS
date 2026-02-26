/**
 * Centralized main menu service.
 * Always validates against DB — never relies on session alone.
 */

/**
 * Show the main menu with all available commands.
 * Call this after login, onboarding, restart, or any critical action.
 * @param {import('telegraf').Context} ctx
 */
export async function showMainMenu(ctx) {
    const menuText =
        `*¿Qué deseas hacer?*\n\n` +
        '📥 /ingreso `<monto> <descripción>` — Registrar ingreso\n' +
        '📤 /gasto `<monto> <descripción>` — Registrar gasto\n' +
        '📊 /resumen — Resumen del mes actual\n' +
        '📈 /reporte — Gráficas visuales\n' +
        '🧠 /perfil — Análisis con IA\n' +
        '🎯 /metas — Metas de ahorro\n' +
        '💰 /actualizar\\_ingreso `<monto>` — Actualizar ingreso fijo\n' +
        '📋 /onboarding — Actualizar perfil financiero\n' +
        '🤖 /preguntar — Preguntar a la IA';

    return ctx.reply(menuText, { parse_mode: 'Markdown' });
}
