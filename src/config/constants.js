export const RULE_50_30_20 = {
  needs: 0.5,
  wants: 0.3,
  savings: 0.2,
};

export const CATEGORIES = {
  NEED: 'necesidad',
  WANT: 'gusto',
  SAVING: 'ahorro',
};


export const RATE_LIMIT = {
  MAX_REQUESTS: 30,
  WINDOW_MS: 60 * 1000,
};

export const MESSAGES = {
  WELCOME: (name) =>
    `👋 Hola ${name}, soy tu asistente financiero inteligente 💰\n` +
    `Te ayudo a organizar tu dinero, analizar tus gastos y mejorar tu ahorro.\n\n` +
    `Vamos a configurar tu perfil financiero para darte un análisis personalizado. 🚀`,


  RATE_LIMITED: '⏳ Demasiadas solicitudes. Espera un momento antes de continuar.',
  ERROR_GENERAL: '❌ Ocurrió un error inesperado. Intenta de nuevo.',
  INVALID_AMOUNT: '❌ Monto inválido. Ingresa un número positivo. Ejemplo: `/ingreso 5000 Salario`',
  NO_DATA: '📭 No hay datos registrados para este mes.',
  INCOME_SAVED: '✅ Ingreso registrado correctamente.',
  EXPENSE_SAVED: '✅ Gasto registrado correctamente.',
};



export const CHART_COLORS = {
  needs: 'rgba(255, 99, 132, 0.8)',
  wants: 'rgba(54, 162, 235, 0.8)',
  savings: 'rgba(75, 192, 192, 0.8)',
  ideal: 'rgba(153, 102, 255, 0.5)',
};
