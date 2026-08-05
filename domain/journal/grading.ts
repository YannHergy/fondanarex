// ================================================================
// GRADING
//
// Turns each measure into good / neutral / bad, with the scale it
// was judged against.
//
// This is CODE, not a model's opinion. A colour is a claim — green
// says "this is fine" — and a claim that shifted between two runs
// of the same journal would be worse than no colour at all. Every
// threshold below is a published convention or a stated choice,
// and each one carries its reasoning.
//
// Deliberately NOT graded: win rate. A 27% win rate is excellent
// with a 3:1 payoff and ruinous with 1:1, so colouring it alone
// would be a lie in one of those two cases. It is shown plain.
//
// Pure — no I/O.
// ================================================================

export type Grade = 'good' | 'neutral' | 'bad';

export interface GradedMetric {
    key: string;
    label: string;
    /** Formatted for display, units included. */
    value: string;
    grade: Grade | null;
    /** The scale it was judged against, e.g. "bon ≥ 2,5 · faible < 1,5". */
    scale?: string;
    /** Extra context under the value. */
    hint?: string;
}

/** Higher is better, with two cut points. */
function above(value: number | null, good: number, bad: number): Grade | null {
    if (value === null) return null;
    if (value >= good) return 'good';
    if (value < bad) return 'bad';
    return 'neutral';
}

/** Lower is better. */
function below(value: number | null, good: number, bad: number): Grade | null {
    if (value === null) return null;
    if (value <= good) return 'good';
    if (value > bad) return 'bad';
    return 'neutral';
}

export const GRADERS = {
    /**
     * Expectancy — the only measure with a natural zero. Positive means the
     * edge exists; the size of it is what the ratios below judge.
     */
    expectancy: (value: number | null): Grade | null =>
        value === null ? null : value > 0 ? 'good' : value < 0 ? 'bad' : 'neutral',

    /** Van Tharp's own bands, unchanged. */
    sqn: (value: number | null): Grade | null => above(value, 2.5, 1.5),

    /**
     * Per-trade Sharpe. Not the annualised figure, so the familiar "above 1 is
     * good" does not apply — a per-trade ratio of 0.3 already means the average
     * result is a third of the swing around it.
     */
    sharpe: (value: number | null): Grade | null => above(value, 0.3, 0.1),

    /** Sortino sits above Sharpe on a positively skewed series, so its bar is higher. */
    sortino: (value: number | null): Grade | null => above(value, 0.5, 0.2),

    /** Average win over average loss. Below 1 the system needs a high hit rate to survive. */
    payoff: (value: number | null): Grade | null => above(value, 2, 1),

    /**
     * Median result in R. Zero means the typical trade returns exactly what it
     * risked; below −0.5 means the typical loss runs past its own stop.
     */
    medianR: (value: number | null): Grade | null => above(value, 0.3, -0.5),

    /** Share of the planned target actually taken. 60% is the usual alarm line. */
    targetEfficiency: (value: number | null): Grade | null => above(value, 60, 40),

    /** Trades carrying a stop. Anything under 90% means unprotected positions. */
    stopCoverage: (value: number | null): Grade | null => above(value, 90, 70),

    /**
     * Losses clustering beyond the base rate.
     *
     * Judged as a GAP, not a level: 70% of trades losing after a loss is
     * expected when 70% lose overall. Only the excess is behavioural.
     */
    clustering: (rate: number | null, base: number): Grade | null => {
        if (rate === null) return null;
        return below(rate - base, 5, 15);
    },

    /**
     * Position size after a loss against after a win.
     *
     * Above the win-size is the martingale reflex — raising the stake to win it
     * back. At or below it is discipline. Returns null when either is missing.
     */
    sizingAfterLoss: (afterLoss: number | null, afterWin: number | null): Grade | null => {
        if (afterLoss === null || afterWin === null || afterWin === 0) return null;
        const ratio = afterLoss / afterWin;
        if (ratio <= 1.05) return 'good';
        if (ratio > 1.25) return 'bad';
        return 'neutral';
    },

    /**
     * Holding winners longer than losers.
     *
     * The single most quoted edge in trade management: cut losers, let winners
     * run. Graded on the ratio so it works whatever the timeframe.
     */
    holdRatio: (onWin: number | null, onLoss: number | null): Grade | null => {
        if (onWin === null || onLoss === null || onLoss === 0) return null;
        const ratio = onWin / onLoss;
        if (ratio >= 2) return 'good';
        if (ratio < 1) return 'bad';
        return 'neutral';
    },

    /** A drawdown still open is a live problem, not history. */
    recovered: (value: boolean): Grade => (value ? 'good' : 'neutral'),

    /**
     * How much worse the simulated bad case is than what was actually endured.
     *
     * A stress test finding twice the real drawdown means the order of results
     * flattered the account, and the trader has not yet felt what this system
     * can do.
     */
    stressGap: (simulated: number | null, actual: number): Grade | null => {
        if (simulated === null || actual <= 0) return null;
        const ratio = simulated / actual;
        if (ratio <= 1.3) return 'good';
        if (ratio > 2) return 'bad';
        return 'neutral';
    },
} as const;
