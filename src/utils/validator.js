import { CATEGORIES } from '../config/constants.js';

/**
 * Validate and parse a monetary amount from a string token.
 * @param {string} text
 * @returns {{ valid: boolean, amount?: number, error?: string }}
 */
export function validateAmount(text) {
  if (!text) return { valid: false, error: 'No se proporcionó monto.' };
  const cleaned = text.replace(/[$,]/g, '').trim();
  const amount = parseFloat(cleaned);
  if (isNaN(amount)) return { valid: false, error: 'El monto no es un número válido.' };
  if (amount <= 0) return { valid: false, error: 'El monto debe ser mayor a cero.' };
  if (amount > 1_000_000_000) return { valid: false, error: 'El monto es demasiado grande.' };
  return { valid: true, amount };
}

/**
 * Validate that the provided text is a known category.
 * @param {string} text
 * @returns {{ valid: boolean, category?: string, error?: string }}
 */
export function validateCategory(text) {
  const lower = (text || '').toLowerCase().trim();
  const validCategories = Object.values(CATEGORIES);
  if (validCategories.includes(lower)) {
    return { valid: true, category: lower };
  }
  return {
    valid: false,
    error: `Categoría inválida. Opciones: ${validCategories.join(', ')}.`,
  };
}

/**
 * Remove potentially dangerous characters from user text.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
  if (!text) return '';
  return String(text).replace(/[<>&"']/g, '').trim().slice(0, 200);
}
