// ================================================================
// DEEP STATISTICAL ANALYSIS
//
// Expectancy, system quality, risk-adjusted ratios, Monte-Carlo
// stress test, tail risk and outcome autocorrelation.
//
// Gated at 30 trades. Below that these numbers are not merely
// imprecise, they are misleading: a Sharpe ratio on 12 trades, or
// a Monte-Carlo built by reshuffling 12 results, produces a
// confident-looking figure describing nothing but noise. The gate
// is part of the statistic, not a UI nicety.
//
// WHAT IS DELIBERATELY ABSENT: MAE and MFE (maximum adverse and
// favourable excursion). Both need the price PATH during a trade,
// and a MetaTrader report carries only entry, exit, stop and
// target — no ticks. `targetEfficiency` below is a weaker, honest
// substitute measured against the planned target, and is named so.
//
// Pure — no I/O, no clock, and no Math.random: the Monte-Carlo
// draws from a seeded generator so the same journal always yields
// the same figure. A stress test that moved every time it was run
// could not be quoted or tested.
// ================================================================

export interface StatTrade {
    direction: 'Buy' | 'Sell';
    entryPrice: number;
    exitPrice: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    pips: number | null;
    pnl: number | null;
    pipSize: number;
}

export interface MonteCarlo {
    iterations: number;
    /** Max drawdown, in account currency, at the median of the runs. */
    medianMaxDrawdown: number;
    /** The drawdown exceeded by only 5% of runs — the realistic bad case. */
    p95MaxDrawdown: number;
    worstMaxDrawdown: number;
    /** Median longest run of trades spent below the previous peak. */
    medianUnderwaterTrades: number;
    /**
     * Deliberately NOT reported: the share of runs ending profitable.
     * Reordering the same trades cannot change their sum, so that figure is
     * always 0 or 100 — a constant dressed as a probability.
     */
}

export interface Autocorrelation {
    /** Share of trades following a LOSS that also lost, 0–100. */
    lossAfterLoss: number | null;
    /** Share of trades following a WIN that also won, 0–100. */
    winAfterWin: number | null;
    /** Base rates to compare them against. */
    baseLossRate: number;
    baseWinRate: number;
    sampleAfterLoss: number;
    sampleAfterWin: number;
}

export interface DeepStats {
    trades: number;
    /** Mean result per trade, in account currency. */
    expectancy: number;
    /** Mean result per trade in R. Null when too few trades carry a stop. */
    expectancyR: number | null;
    /** Van Tharp's System Quality Number. Null without enough R data. */
    sqn: number | null;
    /** Mean over standard deviation of per-trade results. */
    sharpe: number | null;
    /** Same, penalising only downside deviation. */
    sortino: number | null;

    maxDrawdown: number;
    /** Trades spent below the previous peak before it was regained. */
    drawdownDurationTrades: number;
    /** False when the account never returned to its high-water mark. */
    drawdownRecovered: boolean;

    /** Loss exceeded by only 5% / 1% of trades. Negative numbers. */
    var95: number | null;
    cvar95: number | null;
    var99: number | null;
    cvar99: number | null;

    monteCarlo: MonteCarlo | null;
    autocorrelation: Autocorrelation;

    /**
     * Median realised move as a share of the planned target move, 0–100+.
     * Under 60 suggests systematically leaving profit on the table.
     */
    targetEfficiency: number | null;
    targetEfficiencySample: number;
}

/** Below this the figures describe noise, however confidently they print. */
export const MIN_TRADES_FOR_DEEP_STATS = 30;

const MONTE_CARLO_ITERATIONS = 5000;
const MONTE_CARLO_SEED = 0x9e3779b9;

function round(value: number, places = 2): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

function mean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Sample standard deviation, dividing by n − 1.
 *
 * The population form (n) understates the spread of a sample, which would
 * flatter every ratio built on it — exactly the wrong direction for a figure
 * meant to tell a trader how rough the ride is.
 */
function stdev(values: readonly number[]): number {
    if (values.length < 2) return 0;

    const average = mean(values);
    const variance =
        values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);

    return Math.sqrt(variance);
}

/** Nearest-rank percentile. `p` is 0–1. */
function percentile(sorted: readonly number[], p: number): number | null {
    if (sorted.length === 0) return null;

    const rank = Math.ceil(p * sorted.length);
    const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);

    return sorted[index]!;
}

/** Deterministic generator, so the same journal always stresses identically. */
function mulberry32(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Largest peak-to-trough fall of the cumulative curve, and the longest stretch
 * spent below a previous peak.
 *
 * Both in one pass because the Monte-Carlo runs this thousands of times.
 */
function drawdownOf(results: readonly number[]): { depth: number; underwater: number } {
    let peak = 0;
    let cumulative = 0;
    let depth = 0;
    let sincePeak = 0;
    let underwater = 0;

    for (const result of results) {
        cumulative += result;

        if (cumulative >= peak) {
            peak = cumulative;
            sincePeak = 0;
        } else {
            sincePeak += 1;
            if (sincePeak > underwater) underwater = sincePeak;
        }

        const drop = peak - cumulative;
        if (drop > depth) depth = drop;
    }

    return { depth, underwater };
}

function rMultiple(trade: StatTrade): number | null {
    if (trade.stopLoss === null || trade.pips === null || trade.pipSize <= 0) return null;

    const riskPips = Math.abs(trade.entryPrice - trade.stopLoss) / trade.pipSize;
    if (riskPips === 0) return null;

    return trade.pips / riskPips;
}

/**
 * Realised move as a share of the move that was planned to the target.
 *
 * Not exit efficiency in the textbook sense — that divides by the maximum
 * favourable excursion, which needs the price path. This divides by the
 * distance to the TAKE PROFIT the trader set, which the report does carry.
 * It answers a narrower question: did you take what you came for?
 *
 * Only winners are measured. On a loser the ratio is negative and says nothing
 * about exits, only that the trade went the other way.
 */
function targetEfficiencyOf(trade: StatTrade): number | null {
    if (trade.takeProfit === null || trade.exitPrice === null || trade.pnl === null) return null;
    if (trade.pnl <= 0) return null;

    const planned = Math.abs(trade.takeProfit - trade.entryPrice);
    if (planned === 0) return null;

    const realised =
        trade.direction === 'Buy'
            ? trade.exitPrice - trade.entryPrice
            : trade.entryPrice - trade.exitPrice;

    return (realised / planned) * 100;
}

function monteCarlo(results: readonly number[]): MonteCarlo | null {
    if (results.length < 2) return null;

    const random = mulberry32(MONTE_CARLO_SEED);
    const depths: number[] = [];
    const underwaters: number[] = [];

    for (let run = 0; run < MONTE_CARLO_ITERATIONS; run += 1) {
        // Fisher-Yates on a copy. Reshuffling the ORDER keeps the same set of
        // trades, so this asks "how bad could this same edge have FELT?" rather
        // than inventing results the trader never had.
        const shuffled = [...results];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }

        const { depth, underwater } = drawdownOf(shuffled);
        depths.push(depth);
        underwaters.push(underwater);
    }

    depths.sort((a, b) => a - b);
    underwaters.sort((a, b) => a - b);

    return {
        iterations: MONTE_CARLO_ITERATIONS,
        medianMaxDrawdown: round(percentile(depths, 0.5) ?? 0),
        p95MaxDrawdown: round(percentile(depths, 0.95) ?? 0),
        worstMaxDrawdown: round(depths.at(-1) ?? 0),
        medianUnderwaterTrades: Math.round(percentile(underwaters, 0.5) ?? 0),
    };
}

function autocorrelationOf(results: readonly number[]): Autocorrelation {
    const decided = results.filter((value) => value !== 0);

    let afterLoss = 0;
    let lossAfterLoss = 0;
    let afterWin = 0;
    let winAfterWin = 0;

    for (let index = 1; index < decided.length; index += 1) {
        const previous = decided[index - 1]!;
        const current = decided[index]!;

        if (previous < 0) {
            afterLoss += 1;
            if (current < 0) lossAfterLoss += 1;
        } else {
            afterWin += 1;
            if (current > 0) winAfterWin += 1;
        }
    }

    const losses = decided.filter((value) => value < 0).length;

    return {
        lossAfterLoss: afterLoss === 0 ? null : Math.round((lossAfterLoss / afterLoss) * 100),
        winAfterWin: afterWin === 0 ? null : Math.round((winAfterWin / afterWin) * 100),
        baseLossRate: decided.length === 0 ? 0 : Math.round((losses / decided.length) * 100),
        baseWinRate:
            decided.length === 0 ? 0 : Math.round(((decided.length - losses) / decided.length) * 100),
        sampleAfterLoss: afterLoss,
        sampleAfterWin: afterWin,
    };
}

export function computeDeepStats(trades: readonly StatTrade[]): DeepStats {
    const closed = trades.filter((trade) => trade.pnl !== null);
    const results = closed.map((trade) => trade.pnl as number);

    const rs = closed.map(rMultiple).filter((value): value is number => value !== null);
    const rDeviation = stdev(rs);
    const pnlDeviation = stdev(results);

    const negatives = results.filter((value) => value < 0);
    const downside = negatives.length < 2 ? 0 : Math.sqrt(mean(negatives.map((value) => value ** 2)));

    const { depth: worst, underwater: longestUnderwater } = drawdownOf(results);

    // Whether the account ever climbed back to its high-water mark. Computed
    // from the final cumulative against the running peak: a curve still under
    // water reports its drawdown as ongoing, not as history.
    let peak = 0;
    let cumulative = 0;
    for (const result of results) {
        cumulative += result;
        if (cumulative > peak) peak = cumulative;
    }
    const recovered = cumulative >= peak;

    const sortedResults = [...results].sort((a, b) => a - b);
    const var95 = percentile(sortedResults, 0.05);
    const var99 = percentile(sortedResults, 0.01);

    const tail = (threshold: number | null): number | null => {
        if (threshold === null) return null;
        const worstOnes = sortedResults.filter((value) => value <= threshold);
        return worstOnes.length === 0 ? null : round(mean(worstOnes));
    };

    const efficiencies = closed
        .map(targetEfficiencyOf)
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);

    return {
        trades: closed.length,
        expectancy: round(mean(results)),
        // Fewer than five stopped trades cannot support a mean anyone should
        // act on, and SQN built on it would be pure noise wearing a threshold.
        expectancyR: rs.length < 5 ? null : round(mean(rs)),
        sqn: rs.length < 5 || rDeviation === 0 ? null : round((Math.sqrt(rs.length) * mean(rs)) / rDeviation),
        sharpe: pnlDeviation === 0 ? null : round(mean(results) / pnlDeviation),
        sortino: downside === 0 ? null : round(mean(results) / downside),

        maxDrawdown: round(worst),
        drawdownDurationTrades: longestUnderwater,
        drawdownRecovered: recovered,

        var95: var95 === null ? null : round(var95),
        cvar95: tail(var95),
        var99: var99 === null ? null : round(var99),
        cvar99: tail(var99),

        monteCarlo: monteCarlo(results),
        autocorrelation: autocorrelationOf(results),

        targetEfficiency: efficiencies.length === 0 ? null : round(percentile(efficiencies, 0.5) ?? 0),
        targetEfficiencySample: efficiencies.length,
    };
}
