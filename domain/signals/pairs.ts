// ================================================================
// PAIR SIGNALS
//
// A currency score is only half an opinion — you trade a PAIR. The
// signal for EUR/USD is the gap between the EUR score and the USD
// score: a strong base against a weak quote is a buy, and two equally
// strong currencies are no trade at all regardless of how high both
// score.
//
// Pure: scores in, signals out. No I/O, no clock.
// ================================================================

export interface PairDefinition {
    base: string;
    quote: string;
    group: string;
}

/** The 25 pairs the legacy screen tracked, in its display order. */
export const PAIRS: readonly PairDefinition[] = [
    { base: 'EUR', quote: 'USD', group: 'Majeurs' },
    { base: 'GBP', quote: 'USD', group: 'Majeurs' },
    { base: 'AUD', quote: 'USD', group: 'Majeurs' },
    { base: 'NZD', quote: 'USD', group: 'Majeurs' },
    { base: 'USD', quote: 'CAD', group: 'Majeurs' },
    { base: 'USD', quote: 'JPY', group: 'Majeurs' },
    { base: 'USD', quote: 'CHF', group: 'Majeurs' },
    { base: 'EUR', quote: 'GBP', group: 'EUR' },
    { base: 'EUR', quote: 'JPY', group: 'EUR' },
    { base: 'EUR', quote: 'AUD', group: 'EUR' },
    { base: 'EUR', quote: 'CAD', group: 'EUR' },
    { base: 'EUR', quote: 'NZD', group: 'EUR' },
    { base: 'EUR', quote: 'CHF', group: 'EUR' },
    { base: 'GBP', quote: 'JPY', group: 'GBP' },
    { base: 'GBP', quote: 'AUD', group: 'GBP' },
    { base: 'GBP', quote: 'CAD', group: 'GBP' },
    { base: 'GBP', quote: 'NZD', group: 'GBP' },
    { base: 'GBP', quote: 'CHF', group: 'GBP' },
    { base: 'AUD', quote: 'NZD', group: 'Croix' },
    { base: 'AUD', quote: 'JPY', group: 'Croix' },
    { base: 'AUD', quote: 'CAD', group: 'Croix' },
    { base: 'NZD', quote: 'JPY', group: 'Croix' },
    { base: 'NZD', quote: 'CAD', group: 'Croix' },
    { base: 'CAD', quote: 'JPY', group: 'Croix' },
    { base: 'CHF', quote: 'JPY', group: 'Croix' },
];

export type SignalDirection = 'buy' | 'sell' | 'neutral';
export type Recommendation = 'ACHETEUR' | 'VENDEUR' | 'NEUTRE' | 'ATTENDRE';
export type Conviction = 1 | 2 | 3 | 4 | 5;

export interface PairSignal {
    pair: string;
    base: string;
    quote: string;
    group: string;
    baseScore: number;
    quoteScore: number;
    /** baseScore - quoteScore */
    diff: number;
    direction: SignalDirection;
    conviction: Conviction;
    recommendation: Recommendation;
    /** A high-impact release for either leg lands within the alert window. */
    hasUpcomingNews: boolean;
}

/**
 * Conviction from the size of the score gap.
 *
 * Thresholds carried over verbatim from the legacy screen: >30 points is a
 * five, and anything at or below 5 is a one.
 */
export function computeConviction(absDiff: number): Conviction {
    if (absDiff > 30) return 5;
    if (absDiff > 20) return 4;
    if (absDiff > 10) return 3;
    if (absDiff > 5) return 2;
    return 1;
}

/**
 * Verdict for a pair.
 *
 * "ATTENDRE" exists for a specific reason: a marginal edge is not worth taking
 * into a high-impact release, because the release can move the pair further
 * than the edge is worth. A strong signal (conviction 3+) is still traded.
 */
export function computeRecommendation(
    diff: number,
    conviction: Conviction,
    hasUpcomingNews: boolean,
): Recommendation {
    if (conviction === 1) return 'NEUTRE';
    if (hasUpcomingNews && conviction <= 2) return 'ATTENDRE';
    if (diff > 5) return 'ACHETEUR';
    if (diff < -5) return 'VENDEUR';
    return 'NEUTRE';
}

export function directionOf(diff: number): SignalDirection {
    if (diff > 5) return 'buy';
    if (diff < -5) return 'sell';
    return 'neutral';
}

/**
 * Builds every pair signal from a map of currency scores.
 *
 * A pair whose legs are not both scored is omitted rather than defaulted to
 * zero — a missing currency must not read as a neutral signal.
 */
export function buildPairSignals(
    scores: Record<string, number>,
    options: { pairsWithNews?: ReadonlySet<string> } = {},
): PairSignal[] {
    const withNews = options.pairsWithNews ?? new Set<string>();
    const signals: PairSignal[] = [];

    for (const definition of PAIRS) {
        const baseScore = scores[definition.base];
        const quoteScore = scores[definition.quote];
        if (baseScore === undefined || quoteScore === undefined) continue;

        const pair = `${definition.base}/${definition.quote}`;
        const diff = Math.round((baseScore - quoteScore) * 10) / 10;
        const conviction = computeConviction(Math.abs(diff));
        const hasUpcomingNews = withNews.has(definition.base) || withNews.has(definition.quote);

        signals.push({
            pair,
            base: definition.base,
            quote: definition.quote,
            group: definition.group,
            baseScore,
            quoteScore,
            diff,
            direction: directionOf(diff),
            conviction,
            recommendation: computeRecommendation(diff, conviction, hasUpcomingNews),
            hasUpcomingNews,
        });
    }

    // Strongest conviction first, then by the size of the edge.
    signals.sort((a, b) => b.conviction - a.conviction || Math.abs(b.diff) - Math.abs(a.diff));
    return signals;
}
