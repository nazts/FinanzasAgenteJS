import { Scenes, Markup } from 'telegraf';
import { getOrCreateUser } from '../models/User.js';
import { getFinancialProfile } from '../models/FinancialProfile.js';
import {
    savePartialProfile,
    completeOnboarding,
    isOnboardingCompleted,
} from '../services/onboardingService.js';
import {
    analyzeFinancialStructure,
    detectAlerts,
} from '../services/financialAnalysisService.js';
import { generateAIAnalysis } from '../services/aiAnalysisService.js';
import { formatCurrency, formatPercentage } from '../utils/formatter.js';
import { validateAmount } from '../utils/validator.js';
import { calculateMonthlyIncome } from '../services/financialAnalysisService.js';

// ── Wizard Scene ─────────────────────────────────────────────────────────────

export const onboardingScene = new Scenes.WizardScene(
    'onboarding-wizard',

    // ── STEP 0: Bienvenida + pedir salario ──────────────────────────────────
    async (ctx) => {
        await ctx.reply(
            '📋 *Onboarding Financiero*\n\n' +
            'Voy a hacerte algunas preguntas para entender tu situación financiera real ' +
            'y darte un análisis personalizado.\n\n' +
            'Puedes cancelar en cualquier momento con /cancelar.\n\n' +
            '💰 *¿Cuánto ganas AL MES en total?*\n' +
            '_(Si te pagan quincenal o semanal, suma todo lo que recibes en el mes. Ej: 15000)_',
            { parse_mode: 'Markdown' },
        );
        return ctx.wizard.next();
    },

    // ── STEP 1: Recibir salario → pedir frecuencia ─────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text);
        if (!valid) {
            await ctx.reply(`❌ ${error}\nIntenta de nuevo. ¿Cuánto ganas al mes en total?`);
            return; // stay on same step
        }

        ctx.wizard.state.salary = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { salary: amount });

        await ctx.reply(
            '📅 *¿Con qué frecuencia cobras?*',
            Markup.inlineKeyboard([
                [Markup.button.callback('Semanal', 'freq:semanal')],
                [Markup.button.callback('Quincenal', 'freq:quincenal')],
                [Markup.button.callback('Mensual', 'freq:mensual')],
            ]),
        );
        return ctx.wizard.next();
    },

    // ── STEP 2: Recibir frecuencia → preguntar si estudia ──────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();

        // This step expects a callback_query from the inline keyboard
        if (!ctx.callbackQuery?.data?.startsWith('freq:')) {
            await ctx.reply('Por favor, selecciona una opción del teclado de arriba ☝️');
            return;
        }

        const frequency = ctx.callbackQuery.data.replace('freq:', '');
        ctx.wizard.state.payment_frequency = frequency;
        await ctx.answerCbQuery();

        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { payment_frequency: frequency });

        await ctx.reply(
            '📚 *¿Estudias actualmente?*',
            Markup.inlineKeyboard([
                [Markup.button.callback('Sí', 'study:yes')],
                [Markup.button.callback('No', 'study:no')],
            ]),
        );
        return ctx.wizard.next();
    },

    // ── STEP 3: Estudia? → costo estudios o transporte ─────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();

        if (!ctx.callbackQuery?.data?.startsWith('study:')) {
            await ctx.reply('Por favor, selecciona Sí o No ☝️');
            return;
        }

        const isStudent = ctx.callbackQuery.data === 'study:yes';
        ctx.wizard.state.is_student = isStudent;
        await ctx.answerCbQuery();

        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { is_student: isStudent ? 1 : 0 });

        if (isStudent) {
            await ctx.reply(
                '🎓 *¿Cuánto pagas al mes por estudios?*\n_(Escribe el monto)_',
                { parse_mode: 'Markdown' },
            );
            return ctx.wizard.next(); // → step 4 (study cost)
        }

        // Skip study cost step
        ctx.wizard.state.study_cost = 0;
        savePartialProfile(user.id, { study_cost: 0 });
        await ctx.reply(
            '🚌 *¿Cuánto gastas al mes en transporte?*\n_(Escribe el monto)_',
            { parse_mode: 'Markdown' },
        );
        ctx.wizard.selectStep(5); // jump to step 5 (transport already asked)
        return;
    },

    // ── STEP 4: Costo estudios → transporte ────────────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuánto pagas al mes por estudios?`);
            return;
        }

        ctx.wizard.state.study_cost = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { study_cost: amount });

        await ctx.reply(
            '🚌 *¿Cuánto gastas al mes en transporte?*\n_(Escribe el monto o toca el botón)_',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🚫 No gasto en eso', 'skip:transport_cost')]]),
            },
        );
        return ctx.wizard.next();
    },

    // ── STEP 5: Transporte → comida ────────────────────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuánto gastas al mes en transporte?`);
            return;
        }

        ctx.wizard.state.transport_cost = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { transport_cost: amount });

        await ctx.reply(
            '🍔 *¿Cuánto gastas aproximadamente al mes en comida?*\n_(Escribe el monto o toca el botón)_',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🚫 No gasto en eso', 'skip:food_cost')]]),
            },
        );
        return ctx.wizard.next();
    },

    // ── STEP 6: Comida → ocio ──────────────────────────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuánto gastas al mes en comida?`);
            return;
        }

        ctx.wizard.state.food_cost = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { food_cost: amount });

        await ctx.reply(
            '🎮 *¿Cuánto gastas aproximadamente al mes en ocio?*\n_(Salidas, entretenimiento, suscripciones, etc.)_',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🚫 No gasto en eso', 'skip:leisure_cost')]]),
            },
        );
        return ctx.wizard.next();
    },

    // ── STEP 7: Ocio → servicios ───────────────────────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuánto gastas al mes en ocio?`);
            return;
        }

        ctx.wizard.state.leisure_cost = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { leisure_cost: amount });

        await ctx.reply(
            '💡 *¿Cuánto gastas aproximadamente al mes en servicios?*\n_(Luz, agua, internet, teléfono, etc.)_',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🚫 No gasto en eso', 'skip:services_cost')]]),
            },
        );
        return ctx.wizard.next();
    },

    // ── STEP 8: Servicios → preguntar deudas ───────────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuánto gastas al mes en servicios?`);
            return;
        }

        ctx.wizard.state.services_cost = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { services_cost: amount });

        await ctx.reply(
            '💳 *¿Tienes deudas actualmente?*',
            Markup.inlineKeyboard([
                [Markup.button.callback('Sí', 'debt:yes')],
                [Markup.button.callback('No', 'debt:no')],
            ]),
        );
        return ctx.wizard.next();
    },

    // ── STEP 9: Deudas? → monto total o finalizar ─────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();

        if (!ctx.callbackQuery?.data?.startsWith('debt:')) {
            await ctx.reply('Por favor, selecciona Sí o No ☝️');
            return;
        }

        const hasDebt = ctx.callbackQuery.data === 'debt:yes';
        ctx.wizard.state.has_debt = hasDebt;
        await safeCbAnswer(ctx);

        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { has_debt: hasDebt ? 1 : 0 });

        if (hasDebt) {
            await ctx.reply(
                '💳 *¿Cuál es el monto total de tu deuda?*\n_(Escribe el monto)_',
                { parse_mode: 'Markdown' },
            );
            return ctx.wizard.next(); // → step 10
        }

        // No debt → ask about savings
        ctx.wizard.state.debt_total = 0;
        ctx.wizard.state.debt_monthly = 0;
        savePartialProfile(user.id, { debt_total: 0, debt_monthly: 0 });
        await ctx.reply(
            '💰 *¿Tienes algo ahorrado actualmente?*',
            Markup.inlineKeyboard([
                [Markup.button.callback('Sí', 'savings:yes')],
                [Markup.button.callback('No', 'savings:no')],
            ]),
        );
        return ctx.wizard.selectStep(12);
    },

    // ── STEP 10: Monto total deuda → cuota mensual ────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuál es el monto total de tu deuda?`);
            return;
        }

        ctx.wizard.state.debt_total = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { debt_total: amount });

        await ctx.reply(
            '💳 *¿Cuánto pagas de cuota mensual por esa deuda?*\n_(Escribe el monto)_',
            { parse_mode: 'Markdown' },
        );
        return ctx.wizard.next();
    },

    // ── STEP 11: Cuota mensual → preguntar ahorro ──────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuánto pagas de cuota mensual?`);
            return;
        }

        ctx.wizard.state.debt_monthly = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { debt_monthly: amount });

        await ctx.reply(
            '💰 *¿Tienes algo ahorrado actualmente?*',
            Markup.inlineKeyboard([
                [Markup.button.callback('Sí', 'savings:yes')],
                [Markup.button.callback('No', 'savings:no')],
            ]),
        );
        return ctx.wizard.next();
    },

    // ── STEP 12: Ahorro? → monto ahorrado o finalizar ─────────────────────
    async (ctx) => {
        // This step is a placeholder for the savings callback handler
        if (checkCancel(ctx)) return ctx.scene.leave();
        if (!ctx.callbackQuery?.data?.startsWith('savings:')) {
            await ctx.reply('Por favor, selecciona Sí o No ☝️');
            return;
        }
    },

    // ── STEP 13: Monto ahorrado → finalizar ───────────────────────────────
    async (ctx) => {
        if (checkCancel(ctx)) return ctx.scene.leave();
        const { valid, amount, error } = validateAmount(ctx.message?.text, { allowZero: true });
        if (!valid) {
            await ctx.reply(`❌ ${error}\n¿Cuánto tienes ahorrado?`);
            return;
        }

        ctx.wizard.state.current_savings = amount;
        const user = getOrCreateUser(ctx);
        savePartialProfile(user.id, { current_savings: amount });

        return finishOnboarding(ctx);
    },
);

// Handle callback queries within the wizard — self-contained handlers
onboardingScene.action(/^freq:/, async (ctx) => {
    const frequency = ctx.callbackQuery.data.replace('freq:', '');
    ctx.wizard.state.payment_frequency = frequency;
    await safeCbAnswer(ctx);

    const user = getOrCreateUser(ctx);
    savePartialProfile(user.id, { payment_frequency: frequency });

    // Show per-period amount based on monthly income
    const monthly = ctx.wizard.state.salary;
    const freqLabel = { semanal: 'semanal', quincenal: 'quincenal', mensual: 'mensual' }[frequency];
    const perPeriod = { semanal: monthly / 4.33, quincenal: monthly / 2, mensual: monthly }[frequency];
    await ctx.reply(
        `✅ Cobras *${formatCurrency(perPeriod)}* ${freqLabel} (${formatCurrency(monthly)}/mes)`,
        { parse_mode: 'Markdown' },
    );

    await ctx.reply(
        '📚 *¿Estudias actualmente?*',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Sí', 'study:yes')],
                [Markup.button.callback('No', 'study:no')],
            ]),
        },
    );
    return ctx.wizard.selectStep(3);
});

onboardingScene.action(/^study:/, async (ctx) => {
    const isStudent = ctx.callbackQuery.data === 'study:yes';
    ctx.wizard.state.is_student = isStudent;
    await safeCbAnswer(ctx);

    const user = getOrCreateUser(ctx);
    savePartialProfile(user.id, { is_student: isStudent ? 1 : 0 });

    if (isStudent) {
        await ctx.reply(
            '🎓 *¿Cuánto pagas al mes por estudios?*\n_(Escribe el monto)_',
            { parse_mode: 'Markdown' },
        );
        return ctx.wizard.selectStep(4); // → step 4 (study cost text input)
    }

    // Skip study cost step
    ctx.wizard.state.study_cost = 0;
    savePartialProfile(user.id, { study_cost: 0 });
    await ctx.reply(
        '🚌 *¿Cuánto gastas al mes en transporte?*\n_(Escribe el monto)_',
        { parse_mode: 'Markdown' },
    );
    return ctx.wizard.selectStep(5); // → step 5 (transport text input)
});

onboardingScene.action(/^debt:/, async (ctx) => {
    const hasDebt = ctx.callbackQuery.data === 'debt:yes';
    ctx.wizard.state.has_debt = hasDebt;
    await safeCbAnswer(ctx);

    const user = getOrCreateUser(ctx);
    savePartialProfile(user.id, { has_debt: hasDebt ? 1 : 0 });

    if (hasDebt) {
        await ctx.reply(
            '💳 *¿Cuál es el monto total de tu deuda?*\n_(Escribe el monto)_',
            { parse_mode: 'Markdown' },
        );
        return ctx.wizard.selectStep(10);
    }

    // No debt → ask about savings
    ctx.wizard.state.debt_total = 0;
    ctx.wizard.state.debt_monthly = 0;
    savePartialProfile(user.id, { debt_total: 0, debt_monthly: 0 });
    await ctx.reply(
        '💰 *¿Tienes algo ahorrado actualmente?*',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Sí', 'savings:yes')],
                [Markup.button.callback('No', 'savings:no')],
            ]),
        },
    );
    return ctx.wizard.selectStep(12);
});

// "No gasto en eso" button — sets the expense to 0 and advances to the next question
const SKIP_MAP = {
    transport_cost: { step: 6, msg: '🍔 *¿Cuánto gastas aproximadamente al mes en comida?*\n_(Escribe el monto o toca el botón)_', nextSkip: 'food_cost' },
    food_cost: { step: 7, msg: '🎮 *¿Cuánto gastas aproximadamente al mes en ocio?*\n_(Salidas, entretenimiento, suscripciones, etc.)_', nextSkip: 'leisure_cost' },
    leisure_cost: { step: 8, msg: '💡 *¿Cuánto gastas aproximadamente al mes en servicios?*\n_(Luz, agua, internet, teléfono, etc.)_', nextSkip: 'services_cost' },
    services_cost: { step: null }, // last expense → go to debt question
};

onboardingScene.action(/^skip:/, async (ctx) => {
    const field = ctx.callbackQuery.data.replace('skip:', '');
    await safeCbAnswer(ctx);

    const mapping = SKIP_MAP[field];
    if (!mapping) return;

    ctx.wizard.state[field] = 0;
    const user = getOrCreateUser(ctx);
    savePartialProfile(user.id, { [field]: 0 });

    if (mapping.step === null) {
        // Last expense field → ask about debts
        await ctx.reply(
            '💳 *¿Tienes deudas actualmente?*',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('Sí', 'debt:yes')],
                    [Markup.button.callback('No', 'debt:no')],
                ]),
            },
        );
        return ctx.wizard.selectStep(9);
    }

    await ctx.reply(
        mapping.msg,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🚫 No gasto en eso', `skip:${mapping.nextSkip}`)]]),
        },
    );
    return ctx.wizard.selectStep(mapping.step);
});

onboardingScene.action(/^savings:/, async (ctx) => {
    const hasSavings = ctx.callbackQuery.data === 'savings:yes';
    await safeCbAnswer(ctx);

    if (hasSavings) {
        await ctx.reply(
            '🏦 *¿Cuánto tienes ahorrado?*\n_(Escribe el monto)_',
            { parse_mode: 'Markdown' },
        );
        return ctx.wizard.selectStep(13); // → step 13 (savings amount text input)
    }

    // No savings → finish
    ctx.wizard.state.current_savings = 0;
    const user = getOrCreateUser(ctx);
    savePartialProfile(user.id, { current_savings: 0 });
    return finishOnboarding(ctx);
});

onboardingScene.command('cancelar', async (ctx) => {
    await ctx.reply('❌ Onboarding cancelado. Puedes reiniciarlo con /onboarding cuando quieras.');
    return ctx.scene.leave();
});

// ── Command handler ──────────────────────────────────────────────────────────

/**
 * Handler for /onboarding command. Checks if already completed and enters the wizard.
 */
export async function onboardingCommand(ctx) {
    const user = getOrCreateUser(ctx);

    if (isOnboardingCompleted(user.id)) {
        await ctx.reply(
            '✅ Ya completaste tu onboarding financiero.\n\n' +
            '¿Deseas rehacerlo con datos actualizados?',
            Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Sí, rehacer', 'redo_onboarding')],
                [Markup.button.callback('❌ No, mantener', 'keep_onboarding')],
            ]),
        );
        return;
    }

    return ctx.scene.enter('onboarding-wizard');
}

// ── Redo/Keep callbacks (registered in bot.js scope via scene) ───────────────

onboardingScene.action('redo_onboarding', async (ctx) => {
    await safeCbAnswer(ctx);
    return ctx.scene.enter('onboarding-wizard');
});

onboardingScene.action('keep_onboarding', async (ctx) => {
    await safeCbAnswer(ctx);
    await ctx.reply('👍 Perfecto, tu perfil se mantiene. Usa /perfil para ver tu análisis.');
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Safely answer a callback query — ignores "query too old" errors after bot restart. */
async function safeCbAnswer(ctx) {
    try {
        await ctx.answerCbQuery();
    } catch { /* stale callback from previous session — safe to ignore */ }
}

function checkCancel(ctx) {
    const text = (ctx.message?.text || '').trim().toLowerCase();
    return text === '/cancelar' || text === '/cancel';
}

async function finishOnboarding(ctx) {
    try {
        const user = getOrCreateUser(ctx);
        completeOnboarding(user.id);

        const profile = getFinancialProfile(user.id);
        const analysis = analyzeFinancialStructure(profile);
        const alerts = detectAlerts(analysis);

        // Concise summary
        const savingsEmoji = analysis.savingsPercent >= 0.2 ? '✅' : analysis.savingsPercent >= 0.1 ? '⚠️' : '🔴';
        const summaryText =
            `📊 *Tu Perfil Financiero*\n\n` +
            `💰 Ingreso: *${formatCurrency(analysis.monthlyIncome)}*/mes\n` +
            `📦 Gastos: *${formatCurrency(analysis.totalExpenses)}*\n` +
            `${savingsEmoji} Ahorro: *${formatCurrency(analysis.savingsCapacity)}* (${formatPercentage(analysis.savingsPercent)})` +
            (analysis.debtMonthly > 0 ? `\n💳 Deuda mensual: *${formatCurrency(analysis.debtMonthly)}*` : '') +
            (profile.current_savings > 0 ? `\n🏦 Ahorrado: *${formatCurrency(profile.current_savings)}*` : '');

        // Only show critical alerts (max 2)
        const topAlerts = alerts.slice(0, 2);
        const alertsText = topAlerts.length > 0
            ? `\n\n${topAlerts.join('\n')}`
            : '';

        await ctx.reply(summaryText + alertsText, { parse_mode: 'Markdown' });

        // Concise AI analysis
        try {
            const aiText = await generateAIAnalysis(analysis, alerts);
            await ctx.reply(
                `🤖 ${aiText}`,
                { parse_mode: 'Markdown' },
            );
        } catch (aiErr) {
            console.error('[onboarding] AI analysis failed:', aiErr.message);
        }

        await ctx.reply(
            '✅ Perfil guardado. Usa /preguntar para consultas con IA o /resumen para ver tu mes.',
            { parse_mode: 'Markdown' },
        );
    } catch (err) {
        console.error('[onboarding] finishOnboarding error:', err.message);
        await ctx.reply('❌ Hubo un error. Intenta de nuevo con /onboarding.');
    }

    return ctx.scene.leave();
}
