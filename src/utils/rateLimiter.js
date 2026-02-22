import { RATE_LIMIT } from '../config/constants.js';

/** @type {Map<string, { count: number, resetAt: number }>} */
const store = new Map();

/**
 * Check if a user is within rate limits.
 * @param {string|number} userId
 * @returns {boolean} true = allowed, false = limited
 */
export function checkLimit(userId) {
  const key = String(userId);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT.WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT.MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

// Periodically clean up expired entries to avoid memory leaks
// unref() so this timer doesn't prevent Node.js from exiting cleanly
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, RATE_LIMIT.WINDOW_MS * 5).unref();
