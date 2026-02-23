import {
    upsertFinancialProfile,
    getFinancialProfile,
    markOnboardingCompleted,
} from '../database/queries.js';

/**
 * Save partial onboarding data for a user.
 * @param {number} userId – internal DB user id
 * @param {object} stepData – partial field(s) to persist
 * @returns {object} updated profile row
 */
export function savePartialProfile(userId, stepData) {
    return upsertFinancialProfile(userId, stepData);
}

/**
 * Mark onboarding as completed.
 * @param {number} userId
 * @returns {object} updated profile row
 */
export function completeOnboarding(userId) {
    return markOnboardingCompleted(userId);
}

/**
 * Check if user has already completed onboarding.
 * @param {number} userId
 * @returns {boolean}
 */
export function isOnboardingCompleted(userId) {
    const profile = getFinancialProfile(userId);
    return profile?.onboarding_completed === 1;
}
