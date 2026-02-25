/* ═══════════════════════════════════════════════════════════════════════════
   /preguntar command handler
   ─────────────────────────────────────────────────────────────────────────
   Lets users ask direct financial questions to the AI, backed by real
   historical data from the behavioral analysis engine.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Markup } from 'telegraf';
import { getOrCreateUser } from '../models/User.js';
import { getFinancialProfile } from '../database/queries.js';
import { getFullBehavioralReport } from '../services/behavioralAnalysisService.js';
import { getOrCreateClient, AI_MODEL } from '../services/aiService.js';
import { formatCurrency, formatPercentage } from '../utils/formatter.js';

// ── Preset questions for quick-select buttons ────────────────────────────────

const PRESET_QUESTIONS = [
    '¿Estoy gastando demasiado en ocio?',
    '¿Puedo aumentar mi ahorro?',
    '¿Por qué este mes gasté más?',
    '¿Estoy mejorando financieramente?',
    '¿En qué debería enfocarme?',
];

// ── System prompt — strict, data-driven, no fluff ───────────────────────────

const SYSTEM_PROMPT = `Eres un analista financiero conductual profesional. Tu trabajo es responder preguntas financieras personales usando ÚNICAMENTE los datos del usuario que se te proporcionan.

FORMATO OBLIGATORIO DE RESPUESTA (7 pasos):
1) Diagnóstico: Estado financiero actual en 1-2 oraciones.
2) Cambio detectado: Qué cambió respecto a meses anteriores.
3) Impacto financiero: Cómo afecta específicamente al usuario.
4) Nivel de riesgo: Bajo / Moderado / Alto con justificación.
5) Acción concreta recomendada: Un paso específico con números.
6) Ajuste de split: Si conviene modificar la distribución 50/30/20 y cómo.
7) Próximo paso práctico: Una acción que pueda hacer esta semana.

REGLAS ESTRICTAS:
- SOLO usa datos reales proporcionados. NUNCA inventes números.
- Si no hay datos suficientes, dilo claramente.
- NO uses frases como "Todo depende de ti", "Puedes ser rico", "Invierte en cripto", "Haz trading".
- NO des motivación vacía ni suposiciones sin datos.
- SÍ menciona cifras exactas del usuario.
- SÍ indica tendencias con porcentajes reales.
- Responde en español, texto plano (sin markdown), párrafos cortos.
- Máximo 400 palabras.`;

// ── Main handler ─────────────────────────────────────────────────────────────

export async function askHandler(ctx) {
    const user = getOrCreateUser(ctx);
    const profile = getFinancialProfile(user.id);

    // Must have completed onboarding
    if (!profile || !profile.onboarding_completed) {
        return ctx.reply(
            '⚠️ Primero necesitas completar tu perfil financiero.\n' +
            'Usa /onboarding para configurarlo.'
        );
    }

    // Extract the question (everything after the command)
    const rawText = ctx.message?.text || '';
    const question = rawText.replace(/^\/preguntar\s*/i, '').trim();

    if (!question) {
        return ctx.reply(
            '❓ *¿Qué quieres saber?*\n\n' +
            'Escribe tu pregunta después del comando o elige una:',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(
                    PRESET_QUESTIONS.map((q, i) => [Markup.button.callback(q, `ask:${i}`)]),
                ),
            },
        );
    }

    await ctx.reply('🧠 Analizando tu historial financiero y preparando respuesta...');

    // Get full behavioral report
    const report = getFullBehavioralReport(user.id);

    // Get AI client
    const client = await getOrCreateClient();
    if (!client) {
        return ctx.reply(
            '🤖 _No se pudo conectar con la IA. Configura tu API key de OpenAI._\n\n' +
            'Mientras tanto, aquí están las métricas detectadas:\n' +
            buildFallbackResponse(report),
            { parse_mode: 'Markdown' }
        );
    }

    // Build structured context prompt
    const contextPrompt = buildContextPrompt(question, report);

    try {
        const response = await client.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: contextPrompt },
            ],
            temperature: 0.5,
            max_tokens: 1000,
        });

        const aiResponse = response.choices[0]?.message?.content || 'No se pudo generar una respuesta.';

        const header = '🧠 *Análisis IA — Inteligencia Conductual*\n\n';
        const footer = buildMetricsFooter(report);

        await ctx.reply(header + aiResponse + '\n\n' + footer, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('[askHandler] AI error:', err.message);
        await ctx.reply('❌ Error al consultar la IA. Intenta de nuevo más tarde.');
    }
}

// ── Callback handler for preset question buttons ─────────────────────────────

export async function askCallbackHandler(ctx) {
    const idx = parseInt(ctx.callbackQuery.data.replace('ask:', ''), 10);
    const question = PRESET_QUESTIONS[idx];
    if (!question) return;

    try { await ctx.answerCbQuery(); } catch { /* stale */ }

    // Re-use the main flow by injecting the question
    const user = getOrCreateUser(ctx);
    const profile = getFinancialProfile(user.id);

    if (!profile || !profile.onboarding_completed) {
        return ctx.reply('⚠️ Primero completa tu perfil con /onboarding.');
    }

    await ctx.reply('🧠 Analizando tu historial financiero...');

    const report = getFullBehavioralReport(user.id);
    const client = await getOrCreateClient();
    if (!client) {
        return ctx.reply(buildFallbackResponse(report), { parse_mode: 'Markdown' });
    }

    const contextPrompt = buildContextPrompt(question, report);

    try {
        const response = await client.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: contextPrompt },
            ],
            temperature: 0.5,
            max_tokens: 1000,
        });

        const aiResponse = response.choices[0]?.message?.content || 'No se pudo generar una respuesta.';
        const header = '🧠 *Análisis IA — Inteligencia Conductual*\n\n';
        const footer = buildMetricsFooter(report);
        await ctx.reply(header + aiResponse + '\n\n' + footer, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('[askCallback] AI error:', err.message);
        await ctx.reply('❌ Error al consultar la IA. Intenta de nuevo más tarde.');
    }
}

// ── Context prompt builder ───────────────────────────────────────────────────

function buildContextPrompt(question, report) {
    const {
        monthlyIncome, anomalies, recurring, metrics,
        structuralAnalysis, alerts, splitRecommendations, trends, months,
    } = report;

    let prompt = `PREGUNTA DEL USUARIO: "${question}"\n\n`;

    // Current financial snapshot
    prompt += `DATOS FINANCIEROS ACTUALES:\n`;
    prompt += `- Ingreso mensual: ${formatCurrency(monthlyIncome)}\n`;

    if (structuralAnalysis) {
        prompt += `- Gastos fijos (necesidades): ${formatCurrency(structuralAnalysis.fixedExpenses)}\n`;
        prompt += `- Gastos variables (ocio): ${formatCurrency(structuralAnalysis.variableExpenses)}\n`;
        prompt += `- Capacidad de ahorro: ${formatCurrency(structuralAnalysis.savingsCapacity)} (${formatPercentage(structuralAnalysis.savingsPercent)})\n`;
        prompt += `- Ratio deuda/ingreso: ${formatPercentage(structuralAnalysis.debtIncomeRatio)}\n`;

        prompt += `\nDISTRIBUCIÓN ACTUAL vs IDEAL (50/30/20):\n`;
        const mi = structuralAnalysis.monthlyIncome;
        if (mi > 0) {
            prompt += `- Necesidades: ${formatPercentage(structuralAnalysis.comparison.needs.real / mi)} real vs 50% ideal\n`;
            prompt += `- Ocio: ${formatPercentage(structuralAnalysis.comparison.wants.real / mi)} real vs 30% ideal\n`;
            prompt += `- Ahorro: ${formatPercentage(structuralAnalysis.savingsPercent)} real vs 20% ideal\n`;
        }
    }

    // Category trends (last 6 months)
    if (Object.keys(trends).length > 0) {
        prompt += `\nTENDENCIAS POR CATEGORÍA (últimos meses):\n`;
        for (const [cat, entries] of Object.entries(trends)) {
            const label = cat === 'necesidad' ? 'Necesidades' : cat === 'gusto' ? 'Ocio' : cat === 'ahorro' ? 'Ahorro' : cat;
            const entryStrs = entries.map(e => `${e.month}: ${formatCurrency(e.total)} (${e.growthPct > 0 ? '+' : ''}${e.growthPct}%)`);
            prompt += `- ${label}: ${entryStrs.join(' → ')}\n`;
        }
    }

    // Anomalies detected
    if (anomalies.length > 0) {
        prompt += `\nANOMALÍAS DETECTADAS (incrementos >15% vs promedio):\n`;
        for (const a of anomalies) {
            prompt += `- ${a.label}: ${a.deviationPct}% por encima del promedio (${formatCurrency(a.currentTotal)} actual vs ${formatCurrency(a.avgPast)} promedio)\n`;
        }
    }

    // Recurring patterns
    if (recurring.length > 0) {
        prompt += `\nPATRONES RECURRENTES:\n`;
        for (const r of recurring) {
            prompt += `- ${r.label}: pico sostenido por ${r.months.length} meses consecutivos (confianza: ${(r.confidence * 100).toFixed(0)}%)\n`;
        }
    }

    // Behavioral metrics
    prompt += `\nMÉTRICAS CONDUCTUALES:\n`;
    prompt += `- Tasa de crecimiento por categoría: ${metrics.categoryGrowthRate}%\n`;
    prompt += `- Índice de drift conductual: ${(metrics.behavioralDriftIndex * 100).toFixed(0)}%\n`;
    prompt += `- Confianza de pico recurrente: ${(metrics.recurringSpikeConfidence * 100).toFixed(0)}%\n`;
    prompt += `- Indicador de autocontrol: ${(metrics.selfControlIndicator * 100).toFixed(0)}%\n`;
    prompt += `- Nivel de riesgo conductual: ${metrics.behavioralRiskLevel}\n`;

    // Alerts
    if (alerts.length > 0) {
        prompt += `\nALERTAS ACTIVAS:\n`;
        for (const a of alerts) {
            prompt += `- ${a.replace(/\*/g, '')}\n`;
        }
    }

    // Split recommendations from engine
    if (splitRecommendations.length > 0) {
        prompt += `\nRECOMENDACIONES DEL MOTOR DE ANÁLISIS:\n`;
        for (const r of splitRecommendations) {
            prompt += `- ${r.replace(/[📉⚠️🔴💡🚨⚡]/g, '').trim()}\n`;
        }
    }

    prompt += `\nResponde a la pregunta del usuario usando EXCLUSIVAMENTE los datos anteriores.`;

    return prompt;
}

// ── Metrics footer — always shown below AI response ──────────────────────────

function buildMetricsFooter(report) {
    const { metrics } = report;
    return (
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 *Métricas Conductuales*\n` +
        `• Autocontrol: ${(metrics.selfControlIndicator * 100).toFixed(0)}%\n` +
        `• Drift: ${(metrics.behavioralDriftIndex * 100).toFixed(0)}%\n` +
        `• Riesgo: ${metrics.behavioralRiskLevel}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`
    );
}

// ── Fallback when AI is not available ────────────────────────────────────────

function buildFallbackResponse(report) {
    const { anomalies, recurring, metrics, splitRecommendations } = report;
    let msg = '';

    if (anomalies.length > 0) {
        msg += '\n*Incrementos detectados:*\n';
        for (const a of anomalies) {
            msg += `• ${a.label}: +${a.deviationPct}% vs promedio\n`;
        }
    }

    if (recurring.length > 0) {
        msg += '\n*Patrones recurrentes:*\n';
        for (const r of recurring) {
            msg += `• ${r.label}: ${r.months.length} meses consecutivos\n`;
        }
    }

    if (splitRecommendations.length > 0) {
        msg += '\n*Recomendaciones:*\n';
        for (const s of splitRecommendations) {
            msg += `• ${s}\n`;
        }
    }

    msg += `\n*Métricas:* Autocontrol ${(metrics.selfControlIndicator * 100).toFixed(0)}% | `;
    msg += `Drift ${(metrics.behavioralDriftIndex * 100).toFixed(0)}% | `;
    msg += `Riesgo: ${metrics.behavioralRiskLevel}`;

    return msg || '_Sin suficientes datos para análisis conductual._';
}
