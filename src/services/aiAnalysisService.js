import { getOrCreateClient, AI_MODEL } from './aiService.js';
import { formatCurrency, formatPercentage } from '../utils/formatter.js';

/**
 * Generate a deep AI-powered financial analysis from structured data.
 * @param {object} analysis – output of analyzeFinancialStructure()
 * @param {string[]} alerts – output of detectAlerts()
 * @returns {Promise<string>} – formatted AI analysis text
 */
export async function generateAIAnalysis(analysis, alerts) {
    const client = await getOrCreateClient();

    if (!client) {
        console.error('❌ [AI] Cliente de IA no disponible. generateAIAnalysis no puede ejecutarse.');
        return (
            '🤖 _No se pudo conectar con la IA. Configura tu API key de OpenAI para obtener un análisis personalizado._\n\n' +
            'Mientras tanto, revisa el resumen numérico y las alertas de arriba.'
        );
    }

    const prompt = buildPrompt(analysis, alerts);

    try {
        const response = await client.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 300,
        });

        return response.choices[0]?.message?.content || 'No se pudo generar el análisis.';
    } catch (err) {
        console.error('[aiAnalysisService] Error:', err.message);
        return '❌ Error al consultar la IA. Intenta de nuevo más tarde con /onboarding.';
    }
}

// ── Internal ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asesor financiero directo y conciso. Máximo 100 palabras. Sin markdown. Sin motivación vacía. Solo datos y acciones concretas. Responde en español.`;

function buildPrompt(analysis, alerts) {
    let prompt = `Haz un diagnóstico financiero BREVE (máximo 3-4 oraciones):
1) Estado actual en una oración.
2) Principal problema o fortaleza detectada.
3) Una acción concreta para esta semana.

DATOS:
- Ingreso: ${formatCurrency(analysis.monthlyIncome)}/mes
- Gastos: ${formatCurrency(analysis.totalExpenses)}
- Ahorro: ${formatCurrency(analysis.savingsCapacity)} (${formatPercentage(analysis.savingsPercent)})
- Deuda mensual: ${formatCurrency(analysis.debtMonthly)}`;

    if (alerts.length > 0) {
        prompt += `\nAlertas: ${alerts.map(a => a.replace(/\*/g, '').replace(/[🚨⚠️🔴❌]/g, '').trim()).join('; ')}`;
    }

    return prompt;
}
