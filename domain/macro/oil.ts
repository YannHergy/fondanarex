// ================================================================
// OIL — WTI CRUDE, THE CAD'S FIRST DRIVER (22% of its profile)
//
// Scored on its LEVEL first, momentum second — which is how every
// other scorer in this engine works (GDP, PMI, VIX, trade balance,
// China demand all read a level ladder plus a ±2 adjustment), and
// which the three commodity scorers were the sole exception to.
//
// That exception produced backwards results. Reading only the %
// change, a barrel at $45 rebounding 15% scored +10 while a barrel
// at $90 easing 8% scored -5 — the model claimed Canada was better
// off at $45 than at $90. A barrel sitting flat at $100 for a month
// scored 0, as if a full month of excellent export revenue were
// neutral.
//
// Pure: no fetch, no cache, no I/O.
// ================================================================

import { clamp10 } from '../scoring/math';

/**
 * Where the barrel sits, before any momentum adjustment.
 *
 * The neutral point is $60 rather than a global break-even, because Canada
 * does not sell at the WTI price: Western Canadian Select trades at a
 * standing discount to it, so the WTI has to run meaningfully above bare
 * production cost before the CAD actually benefits.
 */
export function oilLevelScore(price: number): number {
    if (price >= 100) return 10;
    if (price >= 85) return 6;
    if (price >= 70) return 3;
    if (price >= 60) return 0;
    if (price >= 50) return -4;
    if (price >= 40) return -7;
    return -10;
}

/**
 * Full oil score: level plus a ±2 momentum adjustment.
 *
 * The momentum threshold is a 5% move month over month. Deliberately small
 * relative to the ladder: direction nuances the reading, it does not decide
 * it. A barrel falling from a comfortable level stays positive, and one
 * rising from a painful level stays negative.
 */
export function scoreOilLevel(price: number, previousPrice: number): number {
    const level = oilLevelScore(price);

    // Guard the division: a zero or negative previous price is not a real
    // quote, and would otherwise produce Infinity and a spurious ±2.
    let momentum = 0;
    if (previousPrice > 0) {
        const changePct = ((price - previousPrice) / previousPrice) * 100;
        momentum = changePct > 5 ? 2 : changePct < -5 ? -2 : 0;
    }

    return clamp10(level + momentum);
}
