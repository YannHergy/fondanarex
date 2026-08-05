// ================================================================
// FORWARD PROJECTION
//
// Draws FUTURE trades from the trader's own results and asks the
// only question a prop-firm account really poses: do I reach the
// target before I breach the loss limit, and how long does it take?
//
// Different in kind from the Monte-Carlo in deep-stats. That one
// reshuffles the SAME trades, so the sum never moves and only the
// path is tested. This one draws WITH REPLACEMENT, so the future
// is not the past reordered — it is a new sample from the same
// distribution, and the outcome genuinely varies.
//
// WHY BOOTSTRAP RATHER THAN A FORMULA: resampling the real
// results keeps the actual shape — a wall of small losses and a
// thin tail of large winners. A parametric draw from a win rate
// and an average payoff would smooth that tail away, and the tail
// is precisely what makes this trader profitable at a 27% hit
// rate.
//
// WHY MONEY RATHER THAN R-MULTIPLES: because a MetaTrader report
// records the stop AS AT CLOSE, not at entry. A trader who moves
// stops to breakeven — good practice — ends up with stops a pip or
// two from entry in the file, and the R computed from them
// explodes. On the imported journal four trades out of twenty-five
// carry a sub-5-pip stop, and they alone lift the mean from 0.29R
// to 1.00R. A projection built on that would have promised the
// target in weeks. Money needs no assumption about stops at all.
//
// THE ASSUMPTION, stated once and carried everywhere: that the
// future resembles the past. Same edge, same behaviour, same
// markets. Everything below is conditional on it.
//
// Resampling also assumes trades are INDEPENDENT. That is not
// taken on faith: `autocorrelation` in deep-stats measures it, and
// on the imported journal losses follow losses 71% of the time
// against a 72% base rate — no clustering, so the assumption holds
// there. On a journal where it did not, these figures would be
// optimistic.
//
// Pure — no I/O, no clock, no Math.random.
// ================================================================

export interface ProjectionInput {
    /** Realised net results per trade, in account currency. */
    results: readonly number[];
    capital: number;
    /**
     * Position size relative to the one actually traded.
     *
     * 1 keeps the sizes used; 2 doubles every position, and with it every gain
     * and every loss. Expressed as a multiple rather than a risk percentage
     * because it is what the trader controls directly, and because deriving a
     * risk percentage would need the very stop data the report cannot give.
     */
    sizeMultiplier: number;
    tradesPerWeek: number;
    /** Profit target, as a share of initial capital. */
    targetPct: number;
    /** Loss that ends the account, as a share of initial capital. */
    maxLossPct: number;
    /** Trades after which a run is abandoned as unresolved. */
    horizonTrades?: number;
    /**
     * Whether to build the fan-chart data.
     *
     * Off by default for sweeps, and the difference is not marginal: the
     * percentile bands pad every run out to the full horizon, so a sweep of
     * ten risk levels paid for sixteen million array writes it never drew.
     */
    withPaths?: boolean;
}

export interface ProjectionResult {
    iterations: number;
    /** Runs reaching the target before breaching the limit, 0–100. */
    passRate: number;
    /** Runs breaching the loss limit first, 0–100. */
    failRate: number;
    /** Runs that did neither within the horizon, 0–100. */
    unresolvedRate: number;

    medianTradesToTarget: number | null;
    medianWeeksToTarget: number | null;
    medianMonthsToTarget: number | null;

    /** Deepest fall from the high-water mark, in account currency. */
    medianMaxDrawdown: number;
    p95MaxDrawdown: number;

    /** Balance at the 5th, 50th and 95th percentile, per trade. */
    bands: { low: number[]; mid: number[]; high: number[] };
    /** A sample of complete balance curves, for the fan. */
    paths: number[][];
}

/** Below this a lever rests on too few observations to act on. */
export const MIN_TRADES_PER_LEVER = 5;

const ITERATIONS = 4000;
/** Enough for a percentage; the bands are what needed the larger run. */
const SWEEP_ITERATIONS = 1200;
const SAMPLE_PATHS = 60;
const DEFAULT_HORIZON = 400;
const SEED = 0x517cc1b7;
const WEEKS_PER_MONTH = 4.345;

function round(value: number, places = 2): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

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

function percentile(sorted: readonly number[], p: number): number | null {
    if (sorted.length === 0) return null;

    const rank = Math.ceil(p * sorted.length);
    return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)] ?? null;
}

/**
 * Projects a prop-firm account forward.
 *
 * Position size is held constant across the run rather than compounded with
 * the balance. That mirrors how these accounts are actually written — the loss
 * limit is a fixed number of dollars from the starting balance — and it keeps
 * the multiplier meaning one plain thing throughout.
 */
export function projectAccount(input: ProjectionInput): ProjectionResult {
    const horizon = input.horizonTrades ?? DEFAULT_HORIZON;
    const withPaths = input.withPaths ?? true;
    const iterations = withPaths ? ITERATIONS : SWEEP_ITERATIONS;
    const pool = input.results;

    const scale = input.sizeMultiplier;
    const target = input.capital * (input.targetPct / 100);
    const maxLoss = input.capital * (input.maxLossPct / 100);

    const empty: ProjectionResult = {
        iterations: 0,
        passRate: 0,
        failRate: 0,
        unresolvedRate: 0,
        medianTradesToTarget: null,
        medianWeeksToTarget: null,
        medianMonthsToTarget: null,
        medianMaxDrawdown: 0,
        p95MaxDrawdown: 0,
        bands: { low: [], mid: [], high: [] },
        paths: [],
    };

    if (pool.length === 0 || scale <= 0 || target <= 0 || maxLoss <= 0) return empty;

    const random = mulberry32(SEED);

    let passed = 0;
    let failed = 0;
    const tradesToTarget: number[] = [];
    const drawdowns: number[] = [];
    const paths: number[][] = [];
    // Balance at each step of every run, transposed later into percentiles.
    const byStep: number[][] = withPaths
        ? Array.from({ length: horizon + 1 }, () => [])
        : [];

    const everyNth = Math.max(1, Math.floor(iterations / SAMPLE_PATHS));

    for (let run = 0; run < iterations; run += 1) {
        let balance = input.capital;
        let peak = input.capital;
        let worst = 0;
        let resolvedAt: number | null = null;
        const curve: number[] = [balance];

        for (let step = 1; step <= horizon; step += 1) {
            const draw = pool[Math.floor(random() * pool.length)] ?? 0;
            balance += draw * scale;
            curve.push(balance);

            if (balance > peak) peak = balance;
            const drop = peak - balance;
            if (drop > worst) worst = drop;

            // The limit is checked FIRST: an account that breaches on the same
            // trade that would have reached the target is still closed.
            if (input.capital - balance >= maxLoss) {
                failed += 1;
                resolvedAt = step;
                break;
            }
            if (balance - input.capital >= target) {
                passed += 1;
                tradesToTarget.push(step);
                resolvedAt = step;
                break;
            }
        }

        drawdowns.push(worst);

        // A run that ended early keeps its last balance for the remaining
        // steps, so the percentile bands stay comparable across runs instead
        // of thinning out where the unlucky ones stopped.
        const last = curve.at(-1) ?? input.capital;
        if (withPaths) {
            for (let step = 0; step <= horizon; step += 1) {
                byStep[step]!.push(curve[step] ?? last);
            }
        }

        if (withPaths && run % everyNth === 0 && paths.length < SAMPLE_PATHS) {
            const padded = [...curve];
            while (padded.length <= horizon) padded.push(last);
            paths.push(padded.map((value) => round(value)));
        }

        void resolvedAt;
    }

    drawdowns.sort((a, b) => a - b);
    tradesToTarget.sort((a, b) => a - b);

    const medianTrades = percentile(tradesToTarget, 0.5);
    const weeks = medianTrades === null ? null : medianTrades / input.tradesPerWeek;

    const bands = { low: [] as number[], mid: [] as number[], high: [] as number[] };
    for (const step of byStep) {
        const sorted = [...step].sort((a, b) => a - b);
        bands.low.push(round(percentile(sorted, 0.05) ?? 0));
        bands.mid.push(round(percentile(sorted, 0.5) ?? 0));
        bands.high.push(round(percentile(sorted, 0.95) ?? 0));
    }

    return {
        iterations,
        passRate: Math.round((passed / iterations) * 100),
        failRate: Math.round((failed / iterations) * 100),
        unresolvedRate: Math.round(((iterations - passed - failed) / iterations) * 100),
        medianTradesToTarget: medianTrades,
        medianWeeksToTarget: weeks === null ? null : round(weeks, 1),
        medianMonthsToTarget: weeks === null ? null : round(weeks / WEEKS_PER_MONTH, 1),
        medianMaxDrawdown: round(percentile(drawdowns, 0.5) ?? 0),
        p95MaxDrawdown: round(percentile(drawdowns, 0.95) ?? 0),
        bands,
        paths,
    };
}

// ── Balayage de risque ────────────────────────────────────────────────────

export interface SizePoint {
    sizeMultiplier: number;
    passRate: number;
    failRate: number;
    monthsToTarget: number | null;
    p95MaxDrawdown: number;
}

/**
 * The same projection across a range of position sizes.
 *
 * The point of the sweep is that the answer is not monotonic: trading bigger
 * shortens the path to the target AND raises the chance of being closed out
 * before reaching it, so there is a size that maximises the chance of passing.
 * It cannot be reasoned to — it has to be searched.
 */
export function sweepSize(
    input: Omit<ProjectionInput, "sizeMultiplier">,
    levels: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4],
): SizePoint[] {
    return levels.map((sizeMultiplier) => {
        const result = projectAccount({ ...input, sizeMultiplier, withPaths: false });

        return {
            sizeMultiplier,
            passRate: result.passRate,
            failRate: result.failRate,
            monthsToTarget: result.medianMonthsToTarget,
            p95MaxDrawdown: result.p95MaxDrawdown,
        };
    });
}

/** The sweep entry with the highest chance of passing. */
export function bestSize(points: readonly SizePoint[]): SizePoint | null {
    if (points.length === 0) return null;

    return points.reduce((best, point) => {
        if (point.passRate > best.passRate) return point;
        // Equal odds: prefer the smaller position, which gets there with a
        // shallower drawdown and less to recover from if it goes wrong.
        if (point.passRate === best.passRate && point.sizeMultiplier < best.sizeMultiplier) return point;
        return best;
    });
}

// ── Recommandations ───────────────────────────────────────────────────────

/**
 * How much a lever asks the trader to believe.
 *
 * `arithmetic` — doubling a position doubles the result. No claim about the
 *   market, so nothing can be overfitted.
 * `observed` — a pattern read off past trades, with enough of them to be worth
 *   acting on. Still a claim about the future.
 * `insufficient` — the same, below the sample gate. Reported so the user sees
 *   what was considered and refused, rather than silently dropped.
 */
export type Evidence = "arithmetic" | "observed" | "insufficient";

export interface Recommendation {
    id: string;
    label: string;
    detail: string;
    evidence: Evidence;
    /** Observations the lever rests on. Null when it rests on none. */
    sampleSize: number | null;
    monthsToTarget: number | null;
    passRate: number;
    failRate: number;
    p95MaxDrawdown: number;
}

export interface SegmentPerformance {
    key: string;
    trades: number;
    /** Mean net result over the segment, in account currency. */
    meanNet: number;
}

/**
 * Ranked ways to reach the target sooner.
 *
 * Arithmetic levers are ranked ahead of observed ones at equal outcome,
 * because a shorter path bought with an assumption is not the same as one
 * bought with a bigger position — and only the second is certain to work.
 */
export function recommend(
    input: ProjectionInput,
    options: {
        /** Position multipliers to try, relative to the current size. */
        sizeMultipliers?: readonly number[];
        /** Absolute paces to try, in trades per week. */
        paces?: readonly number[];
        /** Per-segment results, for the filtering levers. */
        segments?: readonly SegmentPerformance[];
        /** Reject anything slower than this. */
        maxMonths?: number;
        /** Reject anything riskier than this, 0–100. */
        maxFailRate?: number;
    } = {},
): Recommendation[] {
    const sizes = options.sizeMultipliers ?? [1, 1.5, 2, 3];
    const paces = options.paces ?? [input.tradesPerWeek, 2, 3, 4];
    const maxMonths = options.maxMonths ?? 8;
    const maxFailRate = options.maxFailRate ?? 25;

    const out: Recommendation[] = [];

    for (const size of sizes) {
        for (const pace of paces) {
            if (size === 1 && pace === input.tradesPerWeek) continue;

            const result = projectAccount({
                ...input,
                sizeMultiplier: input.sizeMultiplier * size,
                tradesPerWeek: pace,
                withPaths: false,
            });

            if (result.medianMonthsToTarget === null) continue;
            if (result.medianMonthsToTarget > maxMonths) continue;
            if (result.failRate > maxFailRate) continue;

            const parts: string[] = [];
            if (size !== 1) parts.push(`taille × ${size}`);
            if (pace !== input.tradesPerWeek) parts.push(`${pace} trades/semaine`);

            out.push({
                id: `size-${size}-pace-${pace}`,
                label: parts.join(", "),
                detail:
                    "Repose sur de l'arithmétique : doubler une position double le gain et la perte. Aucune hypothèse sur le marché.",
                evidence: "arithmetic",
                sampleSize: null,
                monthsToTarget: result.medianMonthsToTarget,
                passRate: result.passRate,
                failRate: result.failRate,
                p95MaxDrawdown: result.p95MaxDrawdown,
            });
        }
    }

    for (const segment of options.segments ?? []) {
        // Only positive segments are worth proposing, and only those with
        // enough trades behind them. A segment that won on one trade is noise
        // wearing the costume of an edge.
        if (segment.meanNet <= 0) continue;

        if (segment.trades < MIN_TRADES_PER_LEVER) {
            out.push({
                id: `segment-${segment.key}`,
                label: `Se concentrer sur ${segment.key}`,
                detail: `Écarté : ${segment.trades} trade${segment.trades > 1 ? "s" : ""} seulement, contre ${MIN_TRADES_PER_LEVER} requis. Sélectionner sur si peu d'observations revient à s'ajuster au hasard.`,
                evidence: "insufficient",
                sampleSize: segment.trades,
                monthsToTarget: null,
                passRate: 0,
                failRate: 0,
                p95MaxDrawdown: 0,
            });
            continue;
        }

        const result = projectAccount({
            ...input,
            results: [segment.meanNet],
            tradesPerWeek: input.tradesPerWeek,
            withPaths: false,
        });

        out.push({
            id: `segment-${segment.key}`,
            label: `Se concentrer sur ${segment.key}`,
            detail: `Repose sur ${segment.trades} trades observés. C'est une hypothèse sur le futur, pas une certitude : à reconsidérer quand tu en auras 30 sur ce segment.`,
            evidence: "observed",
            sampleSize: segment.trades,
            monthsToTarget: result.medianMonthsToTarget,
            passRate: result.passRate,
            failRate: result.failRate,
            p95MaxDrawdown: result.p95MaxDrawdown,
        });
    }

    const rank: Record<Evidence, number> = { arithmetic: 0, observed: 1, insufficient: 2 };

    return out.sort((a, b) => {
        if (rank[a.evidence] !== rank[b.evidence]) return rank[a.evidence] - rank[b.evidence];
        return (a.monthsToTarget ?? Infinity) - (b.monthsToTarget ?? Infinity);
    });
}

// ── Calendrier ────────────────────────────────────────────────────────────

/**
 * The calendar date a given trade number falls on, at a given pace.
 *
 * Takes `start` rather than reading the clock, so the module stays pure and a
 * test can assert a date instead of a duration. Fractional weeks are kept —
 * rounding to whole ones would drift by days over a projection measured in
 * months, which is exactly the scale the user reads it at.
 */
export function dateAfterTrades(start: Date, trades: number, tradesPerWeek: number): Date {
    if (tradesPerWeek <= 0 || !Number.isFinite(trades)) return start;

    const days = (trades / tradesPerWeek) * 7;
    return new Date(start.getTime() + days * 86_400_000);
}

/**
 * A label for a projected date, at the precision the span deserves.
 *
 * A projection running over two years labelled to the day claims an accuracy
 * it does not have; one running over three weeks labelled to the month says
 * nothing. The span decides.
 */
export function formatProjectedDate(date: Date, spanDays: number): string {
    const options: Intl.DateTimeFormatOptions =
        spanDays > 180
            ? { month: "long", year: "numeric" }
            : spanDays > 45
              ? { day: "numeric", month: "short", year: "numeric" }
              : { day: "numeric", month: "short" };

    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" }).format(date);
}
