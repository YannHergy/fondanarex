// ================================================================
// SHARED SCORING MATH
//
// The legacy code duplicated these two helpers in utils.ts and in
// data/marketContext.ts. They are identical, so they live here once.
// ================================================================

/** Bounds a value inside the [-10, +10] interval */
export function clamp10(v: number): number {
    return Math.max(-10, Math.min(10, v));
}

/**
 * Converts a % change into a [-10, +10] score.
 * `fullScale` = the change that saturates the score at ±10.
 *
 * Example: oil with fullScale=15 -> +7.5% gives a score of +5.
 */
export function pctScore(pct: number, fullScale: number): number {
    return clamp10((pct / fullScale) * 10);
}
