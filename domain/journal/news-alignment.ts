// ================================================================
// NEWS ALIGNMENT
//
// Did trading WITH the fundamentals do better than trading
// against them?
//
// The legacy version compared the sign of the P&L against a news
// score summed across BOTH currencies of the pair, which cannot
// work: bullish news on EUR and bullish news on USD both added
// positively, yet they push EUR/USD in opposite directions. It
// also ignored trade direction entirely, so a short that won on
// bearish news was counted as unaligned.
//
// Pure — no I/O.
// ================================================================

export type EventImpact = 'BULLISH_STRONG' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'BEARISH_STRONG';

/** Signed weight per impact grade. */
const IMPACT_SCORE: Record<EventImpact, number> = {
    BULLISH_STRONG: 2,
    BULLISH: 1,
    NEUTRAL: 0,
    BEARISH: -1,
    BEARISH_STRONG: -2,
};

export function impactScore(impact: EventImpact | null): number {
    return impact === null ? 0 : IMPACT_SCORE[impact];
}

export interface DayEvent {
    /** "YYYY-MM-DD" */
    date: string;
    currencyCode: string;
    impact: EventImpact | null;
}

export interface AlignmentTrade {
    id: string;
    instrument: string;
    direction: 'Buy' | 'Sell';
    /** "YYYY-MM-DD" of entry. */
    date: string;
    pnl: number | null;
}

/**
 * News score FOR THE PAIR, not for the two currencies separately.
 *
 * Base-currency news counts positively and quote-currency news negatively,
 * because that is what moves the quoted price. This is the correction: summing
 * both sides without a sign made a strong EUR print and a strong USD print
 * indistinguishable on EUR/USD, when they are opposites.
 */
export function pairNewsScore(instrument: string, events: readonly DayEvent[]): number {
    const [base, quote] = instrument.toUpperCase().split('/');
    if (!base || !quote) return 0;

    return events.reduce((total, event) => {
        const code = event.currencyCode.toUpperCase();
        if (code === base) return total + impactScore(event.impact);
        if (code === quote) return total - impactScore(event.impact);
        return total;
    }, 0);
}

export interface AlignedTrade {
    trade: AlignmentTrade;
    /** Signed news pressure on the pair that day. */
    newsScore: number;
    /** Whether the trade was taken in the direction the news pointed. */
    tradedWithNews: boolean;
    won: boolean;
}

/**
 * Pairs each trade with the news on its entry day.
 *
 * Trades on days with no relevant, graded news are EXCLUDED rather than
 * counted as neutral: they say nothing about whether following the news helps,
 * and including them would drag every rate toward 50 %.
 */
export function alignTrades(
    trades: readonly AlignmentTrade[],
    events: readonly DayEvent[],
): AlignedTrade[] {
    const byDate = new Map<string, DayEvent[]>();
    for (const event of events) {
        if (event.impact === null || event.impact === 'NEUTRAL') continue;
        const bucket = byDate.get(event.date);
        if (bucket) bucket.push(event);
        else byDate.set(event.date, [event]);
    }

    const aligned: AlignedTrade[] = [];

    for (const trade of trades) {
        // Only closed trades have a result to correlate with.
        if (trade.pnl === null) continue;

        const dayEvents = byDate.get(trade.date);
        if (!dayEvents || dayEvents.length === 0) continue;

        const newsScore = pairNewsScore(trade.instrument, dayEvents);
        if (newsScore === 0) continue;

        const newsFavoursLong = newsScore > 0;
        const wentLong = trade.direction === 'Buy';

        aligned.push({
            trade,
            newsScore,
            tradedWithNews: newsFavoursLong === wentLong,
            won: trade.pnl > 0,
        });
    }

    return aligned;
}

export interface AlignmentSummary {
    total: number;
    withNews: number;
    againstNews: number;
    /** Win rate when the trade followed the news, percent. */
    withNewsWinRate: number | null;
    againstNewsWinRate: number | null;
    withNewsPnl: number;
    againstNewsPnl: number;
    /** Percentage-point difference between the two win rates. */
    edge: number | null;
}

/**
 * Whether following the fundamentals paid.
 *
 * Reports the two win rates SEPARATELY rather than one "alignment" percentage.
 * A single figure conflates two different questions — how often you traded
 * with the news, and whether doing so worked — and only the second is
 * actionable.
 *
 * Win rates are null below a minimum sample. Three trades producing "100 %"
 * is not a finding, and presenting it as one invites a bad decision.
 */
export const MIN_SAMPLE = 5;

export function summariseAlignment(aligned: readonly AlignedTrade[]): AlignmentSummary {
    const withNews = aligned.filter((entry) => entry.tradedWithNews);
    const againstNews = aligned.filter((entry) => !entry.tradedWithNews);

    const rate = (entries: readonly AlignedTrade[]) =>
        entries.length < MIN_SAMPLE
            ? null
            : Math.round((entries.filter((entry) => entry.won).length / entries.length) * 100);

    const sum = (entries: readonly AlignedTrade[]) =>
        Math.round(entries.reduce((total, entry) => total + (entry.trade.pnl ?? 0), 0) * 100) / 100;

    const withRate = rate(withNews);
    const againstRate = rate(againstNews);

    return {
        total: aligned.length,
        withNews: withNews.length,
        againstNews: againstNews.length,
        withNewsWinRate: withRate,
        againstNewsWinRate: againstRate,
        withNewsPnl: sum(withNews),
        againstNewsPnl: sum(againstNews),
        edge: withRate !== null && againstRate !== null ? withRate - againstRate : null,
    };
}
