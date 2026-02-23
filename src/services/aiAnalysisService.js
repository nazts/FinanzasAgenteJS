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
            temperature: 0.6,
            max_tokens: 800,
        });

        return response.choices[0]?.message?.content || 'No se pudo generar el análisis.';
    } catch (err) {
        console.error('[aiAnalysisService] Error:', err.message);
        return '❌ Error al consultar la IA. Intenta de nuevo más tarde con /onboarding.';
    }
}

// ── Internal ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asesor financiero profesional y realista. Tu trabajo es dar análisis técnicos y prácticos basados en datos concretos.

REGLAS ESTRICTAS:
- NO hagas promesas de riqueza ni uses frases como "hazte rico", "libertad financiera fácil", "dinero trabajando para ti".
- NO recomiendes criptomonedas especulativas ni inversiones de alto riesgo sin contexto.
- NO uses lenguaje motivacional vacío.
- SÍ adapta tus recomendaciones al nivel de ingreso real del usuario.
- SÍ sé directo y honesto si la situación es difícil.
- SÍ sugiere pasos concretos y alcanzables.

Si el ingreso es bajo, NO asumas que el usuario puede invertir grandes cantidades. Enfócate en:
- Proteger lo que tiene
- Reducir gastos innecesarios
- Construir un fondo de emergencia pequeño pero real
- Microemprendimiento viable si aplica

Responde en español, en texto plano (sin markdown), con párrafos cortos y claros.`;

function buildPrompt(analysis, alerts) {
    return `Analiza la siguiente situación financiera y proporciona:

1) Evaluación objetiva de la situación (2-3 oraciones).
2) Si puede aumentar su ahorro y cuánto sería razonable (sé específico con números).
3) Recomendaciones realistas (máximo 5), priorizadas así:
   - Fondo de emergencia (3–6 meses de gastos)
   - Reducción específica de gastos (indica cuáles y cuánto)
   - Renta fija o CETES si aplica
   - Fondos indexados si el ahorro lo permite
   - Certificados financieros
   - Microemprendimiento viable según el ingreso
4) Un próximo paso concreto que pueda hacer esta semana.

DATOS DEL USUARIO:
- Ingreso mensual: ${formatCurrency(analysis.monthlyIncome)}
- Gastos fijos (necesidades): ${formatCurrency(analysis.fixedExpenses)}
- Gastos variables (ocio): ${formatCurrency(analysis.variableExpenses)}
- Total gastos: ${formatCurrency(analysis.totalExpenses)}
- Capacidad de ahorro: ${formatCurrency(analysis.savingsCapacity)} (${formatPercentage(analysis.savingsPercent)})
- Es estudiante: ${analysis.isStudent ? 'Sí' : 'No'}
- Deuda total: ${formatCurrency(analysis.debtTotal)}
- Cuota mensual de deuda: ${formatCurrency(analysis.debtMonthly)}
- Ratio deuda/ingreso: ${formatPercentage(analysis.debtIncomeRatio)}

DISTRIBUCIÓN REAL vs IDEAL (50/30/20):
- Necesidades: ${formatPercentage(analysis.monthlyIncome > 0 ? analysis.comparison.needs.real / analysis.monthlyIncome : 0)} real vs 50% ideal
- Gustos: ${formatPercentage(analysis.monthlyIncome > 0 ? analysis.comparison.wants.real / analysis.monthlyIncome : 0)} real vs 30% ideal
- Ahorro: ${formatPercentage(analysis.savingsPercent)} real vs 20% ideal

${alerts.length > 0 ? 'ALERTAS DETECTADAS:\n' + alerts.map(a => '- ' + a.replace(/\*/g, '')).join('\n') : 'No se detectaron alertas críticas.'}`;
}
