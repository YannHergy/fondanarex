// ================================================================
// COMPOUND GROWTH SIMULATION
//
// Projects an account forward under a fixed-fractional scheme:
// risk r per trade, win rate wr, reward-to-risk rr.
//
// The growth rate is the GEOMETRIC mean, not the arithmetic
// expectancy. That distinction is the whole point of the screen: a
// strategy can have positive expectancy and still shrink the account,
// because losses compound multiplicatively. Sizing too large turns a
// winning edge into a losing equity curve.
// ================================================================

export interface CompoundInputs {
    capital: number;
    /** Risk per trade, percent. */
    riskPct: number;
    /** Reward-to-risk of the target. */
    rr: number;
    /** Win rate, percent. */
    winRatePct: number;
    /** Trades per week. */
    tradesPerWeek: number;
    months: number;
    /** Profit target, percent of starting capital. */
    targetPct: number;
    /** Maximum drawdown allowed, percent. */
    maxDrawdownPct: number;
    /** Daily drawdown limit, percent. */
    dailyDrawdownPct: number;
}

export interface CompoundOutcome {
    /** Capital at the end of each month, index 0 = starting capital. */
    monthlyCapital: number[];
    /** Profit generated within each month. */
    monthlyProfit: number[];
    finalCapital: number;
    totalProfit: number;
    /** Final capital as a multiple of the start. */
    multiple: number;
    profitPct: number;
    /** Progress towards the target, 0..100. */
    progressPct: number;
    /**
     * Arithmetic expectancy per trade, as a fraction of capital. Positive does
     * NOT guarantee growth — see geometricFactor.
     */
    expectancy: number;
    /**
     * Growth multiplier per trade. Below 1 the account shrinks even when
     * expectancy is positive.
     */
    geometricFactor: number;
    /** Trades needed to reach the target, or null when growth is not positive. */
    tradesToTarget: number | null;
    weeksToTarget: number | null;
    /** Consecutive losses that breach the maximum drawdown. */
    tradesToBreachDrawdown: number;
    dailyMaxLoss: number;
    dailyMaxTrades: number;
}

/** Average trades per month, from a weekly rate (52 weeks / 12 months). */
const WEEKS_PER_MONTH = 4.33;

export function simulateCompound(inputs: CompoundInputs): CompoundOutcome {
    const {
        capital,
        riskPct,
        rr,
        winRatePct,
        tradesPerWeek,
        months,
        targetPct,
        maxDrawdownPct,
        dailyDrawdownPct,
    } = inputs;

    const r = riskPct / 100;
    const wr = Math.min(1, Math.max(0, winRatePct / 100));
    const tradesPerMonth = tradesPerWeek * WEEKS_PER_MONTH;

    // Geometric mean of the per-trade multiplier: (1 + rr*r) on a win,
    // (1 - r) on a loss, weighted by their probabilities.
    const geometricFactor = Math.pow(1 + rr * r, wr) * Math.pow(1 - r, 1 - wr);
    const expectancy = wr * rr * r - (1 - wr) * r;

    const monthlyCapital: number[] = [capital];
    for (let month = 1; month <= months; month += 1) {
        const previous = monthlyCapital[month - 1] ?? capital;
        monthlyCapital.push(previous * Math.pow(geometricFactor, tradesPerMonth));
    }

    const finalCapital = monthlyCapital[months] ?? capital;
    const totalProfit = finalCapital - capital;
    const profitPct = capital > 0 ? (totalProfit / capital) * 100 : 0;

    // Growth must actually compound upward for a target to be reachable.
    // Reporting a finite trade count when the factor is <= 1 would promise a
    // target that never arrives.
    const growsUpward = geometricFactor > 1;
    const tradesToTarget = growsUpward
        ? Math.ceil(Math.log(1 + targetPct / 100) / Math.log(geometricFactor))
        : null;

    const monthlyProfit = monthlyCapital
        .slice(1)
        .map((value, index) => value - (monthlyCapital[index] ?? capital));

    return {
        monthlyCapital,
        monthlyProfit,
        finalCapital,
        totalProfit,
        multiple: capital > 0 ? finalCapital / capital : 0,
        profitPct,
        progressPct: Math.min(100, Math.max(0, targetPct > 0 ? (profitPct / targetPct) * 100 : 0)),
        expectancy,
        geometricFactor,
        tradesToTarget,
        weeksToTarget:
            tradesToTarget !== null && tradesPerWeek > 0
                ? Math.ceil(tradesToTarget / tradesPerWeek)
                : null,
        tradesToBreachDrawdown:
            r > 0 && r < 1
                ? Math.floor(Math.log(1 - maxDrawdownPct / 100) / Math.log(1 - r))
                : 0,
        dailyMaxLoss: finalCapital * (dailyDrawdownPct / 100),
        dailyMaxTrades: riskPct > 0 ? Math.floor(dailyDrawdownPct / riskPct) : 0,
    };
}

/**
 * Largest risk fraction that still compounds upward, for the given edge.
 *
 * Answers the question the simulator raises: "my expectancy is positive but the
 * curve falls — how much smaller should I size?"
 */
export function maxViableRiskPct(rr: number, winRatePct: number): number {
    const wr = Math.min(1, Math.max(0, winRatePct / 100));

    // Scan rather than solve: the closed form is awkward and this runs once.
    //
    // The upper bound is 99%, not a "sane" 10%: a strong edge can support a
    // very large fraction mathematically, and clipping the scan low would
    // silently return the cap for every good strategy, making two different
    // edges look identical.
    let best = 0;
    for (let pct = 0.01; pct <= 99; pct += 0.01) {
        const r = pct / 100;
        const factor = Math.pow(1 + rr * r, wr) * Math.pow(1 - r, 1 - wr);
        if (factor > 1) best = pct;
        else if (best > 0) break;
    }
    return Number(best.toFixed(2));
}
