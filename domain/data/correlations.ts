// ================================================================
// PAIR CORRELATIONS
//
// Historical co-movement between the pairs actually traded, as
// percentages. Kept in code, like the scoring weights: these are
// model parameters whose changes should be reviewable, not values
// silently editable in a database.
//
// Correlation is symmetric, so entries are stored once under a
// sorted key and read through getCorrelation() in either order.
// ================================================================

/** The pairs the correlation matrix covers. */
export const CORR_PAIRS: readonly string[] = [
    'EUR/USD', 'GBP/USD', 'GBP/NZD', 'EUR/NZD', 'GBP/CAD', 'EUR/CAD',
    'AUD/USD', 'NZD/USD', 'EUR/AUD', 'GBP/AUD', 'GBP/NOK', 'NZD/JPY',
    'NZD/CAD', 'EUR/GBP',
];

function key(a: string, b: string): string {
    return [a, b].sort().join('|');
}

/**
 * Measured correlations. A negative value means the pairs move opposite ways —
 * GBP/USD against EUR/GBP being the clearest case, since the pound is the base
 * of one and the quote of the other.
 */
const CORRELATIONS: Record<string, number> = {
    [key('EUR/USD', 'GBP/USD')]: 85,
    [key('EUR/NZD', 'GBP/NZD')]: 80,
    [key('EUR/CAD', 'GBP/CAD')]: 80,
    [key('EUR/AUD', 'GBP/AUD')]: 80,
    [key('AUD/USD', 'NZD/USD')]: 90,
    [key('EUR/USD', 'AUD/USD')]: 65,
    [key('EUR/USD', 'NZD/USD')]: 60,
    [key('GBP/USD', 'AUD/USD')]: 55,
    [key('GBP/USD', 'NZD/USD')]: 50,
    [key('EUR/USD', 'GBP/NOK')]: 50,
    [key('EUR/USD', 'NZD/JPY')]: 40,
    [key('EUR/GBP', 'AUD/USD')]: 20,
    [key('GBP/NOK', 'NZD/JPY')]: 25,
    [key('NZD/CAD', 'NZD/USD')]: 60,
    [key('NZD/CAD', 'AUD/USD')]: 55,
    [key('EUR/USD', 'EUR/GBP')]: 40,
    [key('GBP/USD', 'EUR/GBP')]: -40,

    // Derived rather than measured — same base currency, different quote.
    [key('EUR/USD', 'EUR/NZD')]: 35,
    [key('EUR/USD', 'EUR/CAD')]: 35,
    [key('EUR/USD', 'EUR/AUD')]: 35,
    [key('GBP/USD', 'GBP/NZD')]: 35,
    [key('GBP/USD', 'GBP/CAD')]: 35,
    [key('GBP/USD', 'GBP/AUD')]: 35,
    [key('GBP/USD', 'GBP/NOK')]: 40,
    [key('AUD/USD', 'NZD/CAD')]: 55,
    [key('NZD/USD', 'NZD/JPY')]: 45,
    [key('AUD/USD', 'NZD/JPY')]: 40,
    [key('EUR/NZD', 'EUR/CAD')]: 30,
    [key('EUR/NZD', 'EUR/AUD')]: 30,
    [key('GBP/NZD', 'GBP/CAD')]: 30,
    [key('GBP/NZD', 'GBP/AUD')]: 30,
};

/**
 * Correlation between two pairs, as a percentage.
 *
 * A pair with itself is 100. An unlisted combination returns 0 — meaning "not
 * measured", which is treated as independent. That is a deliberate optimism:
 * the conflict checker will not warn about a relationship nobody has recorded.
 */
export function getCorrelation(a: string, b: string): number {
    if (a === b) return 100;
    return CORRELATIONS[key(a, b)] ?? 0;
}
