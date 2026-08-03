// ================================================================
// TRADE-BY-TRADE PROJECTION
//
// Walks a sequence of trades one at a time, compounding the
// capital and watching for two things a percentage summary cannot
// express: the drawdown limit being breached, and the target being
// reached — including WHEN, in trades and in weeks.
//
// Pure — no I/O, no randomness.
// ================================================================

export interface SequenceInputs {
    initialCapital: number;
    /** Percentage of capital risked per trade. */
    riskPct: number;
    /** Reward-to-risk on a winner. */
    rr: number;
    /** Expected win rate, 0–100. */
    winRatePct: number;
    /** Maximum drawdown from the starting capital before the account is lost. */
    maxDDPct: number;
    /** Profit target, as a percentage of the starting capital. */
    targetPct: number | null;
    /** How many trades the strategy produces per week. */
    tradesPerWeek: number;
    /** How many trades to project. */
    tradeCount: number;
    /**
     * Whether sizing follows the compounding capital.
     *
     * Fixed sizing off the STARTING capital is the honest default for a funded
     * account: most programmes size against the initial balance, and letting
     * risk grow with equity flatters the projection.
     */
    compound?: boolean;
}

export interface SequencePoint {
    index: number;
    capital: number;
    /** Null on the starting point, which is not a trade. */
    win: boolean | null;
    /** Drawdown from the running peak, in currency. */
    drawdown: number;
    week: number;
}

export interface SequenceOutcome {
    points: SequencePoint[];
    finalCapital: number;
    peak: number;
    maxDrawdown: number;
    /** Level at which the account is considered lost. */
    breachLevel: number;
    /** Level at which the target is met, null when there is no target. */
    targetLevel: number | null;
    /** Index of the trade that breached, null if never. */
    breachedAt: number | null;
    /** Index of the trade that reached the target, null if never. */
    reachedTargetAt: number | null;
    tradesToTarget: number | null;
    weeksToTarget: number | null;
    wins: number;
    losses: number;
}

/**
 * Deterministic win/loss ordering for a given win rate.
 *
 * Not random: a projection that changes every render is impossible to reason
 * about or to screenshot. Wins and losses are INTERLEAVED by accumulating the
 * win rate, which spreads losses evenly instead of front-loading every win —
 * the ordering matters enormously, because the same set of results in a
 * different order can breach the drawdown limit or not.
 */
function outcomeAt(index: number, winRatePct: number): boolean {
    const rate = Math.max(0, Math.min(100, winRatePct)) / 100;
    // Bresenham-style distribution: true when the running total crosses an
    // integer boundary.
    return Math.floor(index * rate) > Math.floor((index - 1) * rate);
}

/**
 * Projects a sequence of trades.
 *
 * Stops at a breach: an account that has hit its maximum drawdown is closed by
 * the programme, so continuing to simulate it would describe trades that could
 * never be taken.
 */
export function projectSequence(inputs: SequenceInputs): SequenceOutcome {
    const {
        initialCapital,
        riskPct,
        rr,
        winRatePct,
        maxDDPct,
        targetPct,
        tradesPerWeek,
        tradeCount,
        compound = false,
    } = inputs;

    const breachLevel = initialCapital * (1 - maxDDPct / 100);
    const targetLevel = targetPct === null ? null : initialCapital * (1 + targetPct / 100);

    let capital = initialCapital;
    let peak = initialCapital;
    let maxDrawdown = 0;
    let wins = 0;
    let losses = 0;
    let breachedAt: number | null = null;
    let reachedTargetAt: number | null = null;

    const points: SequencePoint[] = [
        { index: 0, capital, win: null, drawdown: 0, week: 0 },
    ];

    for (let i = 1; i <= Math.max(0, tradeCount); i += 1) {
        const base = compound ? capital : initialCapital;
        const risk = base * (riskPct / 100);
        const win = outcomeAt(i, winRatePct);

        capital = win ? capital + risk * rr : capital - risk;
        if (win) wins += 1;
        else losses += 1;

        peak = Math.max(peak, capital);
        maxDrawdown = Math.max(maxDrawdown, peak - capital);

        points.push({
            index: i,
            capital: round(capital),
            win,
            drawdown: round(peak - capital),
            week: tradesPerWeek > 0 ? Math.ceil(i / tradesPerWeek) : 0,
        });

        if (reachedTargetAt === null && targetLevel !== null && capital >= targetLevel) {
            reachedTargetAt = i;
        }

        if (capital <= breachLevel) {
            breachedAt = i;
            break;
        }
    }

    return {
        points,
        finalCapital: round(capital),
        peak: round(peak),
        maxDrawdown: round(maxDrawdown),
        breachLevel: round(breachLevel),
        targetLevel: targetLevel === null ? null : round(targetLevel),
        breachedAt,
        reachedTargetAt,
        tradesToTarget: reachedTargetAt,
        weeksToTarget:
            reachedTargetAt !== null && tradesPerWeek > 0
                ? Math.ceil(reachedTargetAt / tradesPerWeek)
                : null,
        wins,
        losses,
    };
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
