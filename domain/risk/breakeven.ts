// ================================================================
// SPLIT-ENTRY BREAKEVEN
//
// Compares two ways of taking the same idea:
//
//   A — one entry, full risk, one target
//   B — two entries, risk split between them, the second taken only
//       when the setup re-presents itself
//
// B trades a lower average size for a better average target. Whether
// that wins depends on how OFTEN the second entry actually appears.
// This finds the frequency at which the two break even, which is the
// number that decides whether splitting is worth it at all.
// ================================================================

export interface BreakevenInputs {
    capital: number;
    /** Total risk per idea, percent of capital. */
    riskPct: number;
    /** Win rate, percent. Applied to each entry independently. */
    winRatePct: number;
    /** Reward-to-risk of the single entry. */
    rrSingle: number;
    /** Reward-to-risk of the first entry when split. */
    rrEntry1: number;
    /** Reward-to-risk of the second entry when split. */
    rrEntry2: number;
    /** Share of the risk allocated to the first entry, percent. */
    riskSplitPct: number;
    /** Number of ideas simulated. */
    totalTrades: number;
}

export interface BreakevenPoint {
    /** Frequency of the second entry, percent. */
    frequency: number;
    /** Total result of the single-entry approach. */
    single: number;
    /** Total result of the split-entry approach. */
    split: number;
    /** split - single. Positive means splitting wins. */
    difference: number;
}

export interface BreakevenResult {
    points: BreakevenPoint[];
    /**
     * Frequency at which the two approaches are equal, or null when one
     * dominates across the whole range.
     */
    breakevenFrequency: number | null;
    riskAmount: number;
    riskEntry1: number;
    riskEntry2: number;
}

/**
 * Expected result of one idea under the split approach.
 *
 * Enumerates all six outcomes: the first entry wins or loses, and independently
 * the second entry may not appear at all, or appear and win, or appear and
 * lose. Writing them out rather than compressing to a formula keeps each branch
 * checkable against the intended trading logic.
 */
function splitExpectedValue(
    wr: number,
    frequency: number,
    riskEntry1: number,
    riskEntry2: number,
    rrEntry1: number,
    rrEntry2: number,
): number {
    const f = frequency;

    return (
        // Entry 1 wins, entry 2 appears and wins
        wr * f * wr * (riskEntry1 * rrEntry1 + riskEntry2 * rrEntry2) +
        // Entry 1 wins, entry 2 appears and loses
        wr * f * (1 - wr) * (riskEntry1 * rrEntry1 - riskEntry2) +
        // Entry 1 wins, entry 2 never appears
        wr * (1 - f) * (riskEntry1 * rrEntry1) +
        // Entry 1 loses, entry 2 appears and wins
        (1 - wr) * f * wr * (-riskEntry1 + riskEntry2 * rrEntry2) +
        // Entry 1 loses, entry 2 appears and loses
        (1 - wr) * f * (1 - wr) * (-riskEntry1 - riskEntry2) +
        // Entry 1 loses, entry 2 never appears
        (1 - wr) * (1 - f) * -riskEntry1
    );
}

export function simulateBreakeven(inputs: BreakevenInputs): BreakevenResult {
    const {
        capital,
        riskPct,
        winRatePct,
        rrSingle,
        rrEntry1,
        rrEntry2,
        riskSplitPct,
        totalTrades,
    } = inputs;

    const wr = Math.min(1, Math.max(0, winRatePct / 100));
    const riskAmount = capital * (riskPct / 100);
    const riskEntry1 = riskAmount * (riskSplitPct / 100);
    const riskEntry2 = riskAmount * (1 - riskSplitPct / 100);

    // The single-entry result does not depend on the second entry's frequency,
    // so it is a flat line — the comparison is entirely about where B crosses it.
    const single = totalTrades * (wr * riskAmount * rrSingle - (1 - wr) * riskAmount);

    const points: BreakevenPoint[] = [];
    for (let frequency = 0; frequency <= 100; frequency += 2) {
        const split =
            splitExpectedValue(wr, frequency / 100, riskEntry1, riskEntry2, rrEntry1, rrEntry2) *
            totalTrades;
        points.push({ frequency, single, split, difference: split - single });
    }

    // First sign change in the difference is the crossing point.
    let breakevenFrequency: number | null = null;
    for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1];
        const current = points[i];
        if (!previous || !current) continue;

        const crossed =
            (previous.difference <= 0 && current.difference >= 0) ||
            (previous.difference >= 0 && current.difference <= 0);

        if (crossed) {
            breakevenFrequency = current.frequency;
            break;
        }
    }

    return { points, breakevenFrequency, riskAmount, riskEntry1, riskEntry2 };
}

/** Result of the split approach at one specific frequency. */
export function splitResultAt(inputs: BreakevenInputs, frequencyPct: number): number {
    const wr = Math.min(1, Math.max(0, inputs.winRatePct / 100));
    const riskAmount = inputs.capital * (inputs.riskPct / 100);
    const riskEntry1 = riskAmount * (inputs.riskSplitPct / 100);
    const riskEntry2 = riskAmount * (1 - inputs.riskSplitPct / 100);

    return (
        splitExpectedValue(
            wr,
            frequencyPct / 100,
            riskEntry1,
            riskEntry2,
            inputs.rrEntry1,
            inputs.rrEntry2,
        ) * inputs.totalTrades
    );
}
