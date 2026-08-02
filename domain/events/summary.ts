// ================================================================
// WEEKLY EVENT SUMMARY
//
// Aggregates the observed impact of a week's economic releases for
// one currency, and compares that against the fundamental score to
// surface divergences.
//
// Pure: events in, summary out.
// ================================================================

export type EventImpact =
    | 'BULLISH_STRONG'
    | 'BULLISH'
    | 'NEUTRAL'
    | 'BEARISH'
    | 'BEARISH_STRONG';

export interface SummarisableEvent {
    /** null = not yet published, so it contributes nothing. */
    impact: EventImpact | null;
    pipsVariation: number | null;
    /** ISO date, "YYYY-MM-DD". */
    date: string;
}

export interface WeeklySummary {
    totalEvents: number;
    publishedEvents: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    /** Sum of impact scores, -2..+2 each. */
    totalScore: number;
    totalPips: number;
    dailyBreakdown: Array<{ date: string; positive: number; negative: number }>;
}

/** Numeric weight of an observed impact. */
export function impactScore(impact: EventImpact | null): number {
    switch (impact) {
        case 'BULLISH_STRONG':
            return 2;
        case 'BULLISH':
            return 1;
        case 'BEARISH':
            return -1;
        case 'BEARISH_STRONG':
            return -2;
        case 'NEUTRAL':
        default:
            return 0;
    }
}

/**
 * Aggregates a week of events.
 *
 * Only PUBLISHED events count towards the score. A scheduled release with no
 * recorded impact is still counted in `totalEvents` — it is on the calendar —
 * but contributes nothing, because treating "not yet known" as neutral would
 * dilute the week's reading towards zero as the calendar fills up.
 */
export function getWeeklySummary(events: readonly SummarisableEvent[]): WeeklySummary {
    const published = events.filter(e => e.impact !== null);

    const byDate = new Map<string, { positive: number; negative: number }>();
    let totalScore = 0;
    let totalPips = 0;

    for (const event of published) {
        const score = impactScore(event.impact);
        totalScore += score;
        totalPips += event.pipsVariation ?? 0;

        const day = byDate.get(event.date) ?? { positive: 0, negative: 0 };
        if (score > 0) day.positive += score;
        else if (score < 0) day.negative += Math.abs(score);
        byDate.set(event.date, day);
    }

    const countOf = (...impacts: EventImpact[]) =>
        published.filter(e => e.impact !== null && impacts.includes(e.impact)).length;

    return {
        totalEvents: events.length,
        publishedEvents: published.length,
        bullishCount: countOf('BULLISH', 'BULLISH_STRONG'),
        bearishCount: countOf('BEARISH', 'BEARISH_STRONG'),
        neutralCount: countOf('NEUTRAL'),
        totalScore,
        totalPips,
        dailyBreakdown: [...byDate.entries()]
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date)),
    };
}

export interface Interpretation {
    verdict: string;
    /** Set when the week's news contradicts the fundamental score. */
    divergence: string | null;
}

/**
 * Plain-language reading of the week, plus a divergence warning.
 *
 * The divergence check is the point of this screen: news pushing one way while
 * the fundamental score sits the other way is precisely the situation where a
 * position taken on the score alone gets run over.
 */
export function getInterpretation(
    summary: WeeklySummary,
    fundamentalScore: number,
): Interpretation {
    if (summary.publishedEvents === 0) {
        return { verdict: 'Aucun événement publié cette semaine.', divergence: null };
    }

    const { totalScore } = summary;

    const verdict =
        totalScore >= 10
            ? `Semaine HAUSSIÈRE — les publications ont soutenu la devise (+${totalScore} pts)`
            : totalScore <= -10
              ? `Semaine BAISSIÈRE — les publications ont pesé sur la devise (${totalScore} pts)`
              : `Semaine NEUTRE — pas de direction claire (${totalScore > 0 ? '+' : ''}${totalScore} pts)`;

    let divergence: string | null = null;
    if (totalScore > 5 && fundamentalScore < 45) {
        divergence =
            'Divergence : les publications contredisent un score fondamental baissier.';
    } else if (totalScore < -5 && fundamentalScore > 55) {
        divergence =
            'Divergence : les publications contredisent un score fondamental haussier.';
    }

    return { verdict, divergence };
}
