import { OPENAI_API_KEY, OPENAI_BASE_URL, AI_MODEL } from '../config/index.js';

let openaiClient = null;

export async function getOrCreateClient() {
  if (!OPENAI_API_KEY) return null;
  if (!openaiClient) {
    const { default: OpenAI } = await import('openai');
    const opts = { apiKey: OPENAI_API_KEY, timeout: 30000 };
    if (OPENAI_BASE_URL) opts.baseURL = OPENAI_BASE_URL;
    openaiClient = new OpenAI(opts);
  }
  return openaiClient;
}

/**
 * Analyse a user's financial profile and return a risk summary + recommendations.
 */
export async function analyzeFinancialProfile(userData) {
  const client = await getOrCreateClient();

  if (!client) {
    return {
      riskProfile: 'No disponible',
      recommendations: [
        '💡 Configura tu API key de OpenAI para obtener análisis personalizados.',
        '📌 Mientras tanto, revisa tu distribución 50/30/20 en /resumen.',
      ],
    };
  }

  const prompt = `Eres un asesor financiero personal. Analiza los siguientes datos financieros de un usuario y proporciona:
1. Perfil de riesgo (Conservador / Moderado / Agresivo)
2. Tres recomendaciones personalizadas cortas en español

Datos financieros del mes actual:
- Ingresos totales: $${userData.income?.toFixed(2) || 0}
- Gastos en necesidades: $${userData.actual?.needs?.toFixed(2) || 0} (ideal: $${userData.ideal?.needs?.toFixed(2) || 0})
- Gastos en gustos: $${userData.actual?.wants?.toFixed(2) || 0} (ideal: $${userData.ideal?.wants?.toFixed(2) || 0})
- Ahorro real: $${userData.actual?.savings?.toFixed(2) || 0} (ideal: $${userData.ideal?.savings?.toFixed(2) || 0})
- Metas de ahorro: ${userData.goals?.length || 0}

Responde en JSON con este formato exacto:
{"riskProfile": "...", "recommendations": ["...", "...", "..."]}`;

  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return {
      riskProfile: parsed.riskProfile || 'Moderado',
      recommendations: parsed.recommendations || [],
    };
  } catch (err) {
    return {
      riskProfile: 'Moderado',
      recommendations: [
        '💡 No se pudo obtener análisis de IA en este momento.',
        '📊 Revisa tu resumen con /resumen.',
      ],
    };
  }
}

/**
 * Answer a financial question in context.
 */
export async function answerQuestion(question, financialData) {
  const client = await getOrCreateClient();

  if (!client) {
    return '🤖 Configura tu API key de OpenAI para hacer preguntas con IA.';
  }

  const context = `Datos financieros del usuario: ingresos $${financialData.income?.toFixed(2) || 0}, gastos necesidades $${financialData.actual?.needs?.toFixed(2) || 0}, gustos $${financialData.actual?.wants?.toFixed(2) || 0}, ahorro $${financialData.actual?.savings?.toFixed(2) || 0}.`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Eres un asesor financiero personal amigable. ${context} Responde en español, de forma concisa (máximo 3 oraciones).`,
        },
        { role: 'user', content: question },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });
    return response.choices[0]?.message?.content || 'No pude responder en este momento.';
  } catch {
    return '❌ Error al consultar la IA. Intenta de nuevo más tarde.';
  }
}
export { AI_MODEL };
