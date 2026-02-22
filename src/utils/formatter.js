/**
 * Format a number as currency string.
 * @param {number} amount
 * @returns {string} e.g. "$1,234.56"
 */
export function formatCurrency(amount) {
  return `$${Number(amount || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a JS Date or ISO string to Spanish long date.
 * @param {Date|string} date
 * @returns {string} e.g. "22 de febrero de 2026"
 */
export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Format a decimal as percentage string.
 * @param {number} value  (0–1 range or already in %)
 * @returns {string} e.g. "45.2%"
 */
export function formatPercentage(value) {
  return `${Number(value * 100).toFixed(1)}%`;
}

/**
 * Build a text progress bar.
 * @param {number} current
 * @param {number} total
 * @param {number} [length=10]
 * @returns {string} e.g. "████░░░░░░ 40%"
 */
export function buildProgressBar(current, total, length = 10) {
  if (total <= 0) return `${'░'.repeat(length)} 0%`;
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const pct = (ratio * 100).toFixed(0);
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${pct}%`;
}

/**
 * Get current year and month as numbers.
 */
export function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Month name in Spanish.
 */
export function monthName(month) {
  return new Date(2000, month - 1, 1).toLocaleDateString('es-MX', { month: 'long' });
}
