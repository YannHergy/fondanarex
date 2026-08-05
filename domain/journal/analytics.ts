// ================================================================
// BEHAVIOURAL ANALYTICS
//
// Every number an AI is allowed to talk about.
//
// The split is deliberate and load-bearing: arithmetic happens
// HERE, under test, and the model only ever reads the result. A
// language model asked to compute a win rate can return two
// different answers to the same journal on two runs, and nothing
// in the output would show it. So it gets facts, not data.
//
// The metrics chosen expose BEHAVIOUR rather than performance —
// position size after a loss, delay before re-entering, planned
// risk versus realised result. Performance says how the account
// did; these say why.
//
// Pure — no I/O, no clock.
// ================================================================

export interface AnalysedTrade {
    instrument: string;
    direction: 'Buy' | 'Sell';
    openedAt: Date;
    closedAt: Date | null;
    entryPrice: number;
    stopLoss: number | null;
    lotSize: number;
    pips: number | null;
    pnl: number | null;
    /** The instrument's pip size, needed to express the stop distance in pips. */
    pipSize: number;
}

export interface Breakdown {
    key: string;
    trades: number;
    wins: number;
    net: number;
    winRate: number;
}

export interface JournalAnalytics {
    /** Closed trades only — the ones with a result to reason about. */
    trades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    net: number;
    averageWin: number;
    averageLoss: number;
    /** Average win divided by average loss. Null when nothing was lost. */
    payoffRatio: number | null;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;

    byDirection: Breakdown[];
    byInstrument: Breakdown[];
    byWeekday: Breakdown[];
    /** Keyed on the BROKER's clock, which is what the report carries. */
    byServerHour: Breakdown[];

    /** Median minutes a winner is held, and a loser. */
    holdMinutesOnWin: number | null;
    holdMinutesOnLoss: number | null;

    /** Median lot size on the trade FOLLOWING a loss, and following a win. */
    lotAfterLoss: number | null;
    lotAfterWin: number | null;
    /** Median minutes between closing a trade and opening the next one. */
    reentryMinutesAfterLoss: number | null;
    reentryMinutesAfterWin: number | null;

    /** Share of closed trades that carried a stop loss, 0–100. */
    stopLossCoverage: number;
    /** Median result in multiples of the risk planned at the stop. */
    medianRMultiple: number | null;
    /** Entries on the same instrument within two minutes of the previous one. */
    clusteredEntries: number;
}

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function round(value: number, places = 2): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

/**
 * Median, not mean, throughout.
 *
 * One 10-lot revenge trade would drag an average far enough to invent a habit
 * that happened once — and inventing habits is exactly what this module exists
 * to avoid, since whatever it emits the model will treat as established fact.
 */
function median(values: readonly number[]): number | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 1
        ? round(sorted[middle]!, 2)
        : round((sorted[middle - 1]! + sorted[middle]!) / 2, 2);
}

type Closed = AnalysedTrade & { closedAt: Date; pnl: number };

function closedTrades(trades: readonly AnalysedTrade[]): Closed[] {
    return trades
        .filter((trade): trade is Closed => trade.closedAt !== null && trade.pnl !== null)
        .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
}

function group(trades: readonly Closed[], keyOf: (trade: Closed) => string): Breakdown[] {
    const buckets = new Map<string, { trades: number; wins: number; net: number }>();

    for (const trade of trades) {
        const key = keyOf(trade);
        const bucket = buckets.get(key) ?? { trades: 0, wins: 0, net: 0 };
        bucket.trades += 1;
        if (trade.pnl > 0) bucket.wins += 1;
        bucket.net += trade.pnl;
        buckets.set(key, bucket);
    }

    return [...buckets.entries()]
        .map(([key, bucket]) => ({
            key,
            trades: bucket.trades,
            wins: bucket.wins,
            net: round(bucket.net),
            winRate: Math.round((bucket.wins / bucket.trades) * 100),
        }))
        .sort((a, b) => b.trades - a.trades || a.key.localeCompare(b.key));
}

/**
 * Longest unbroken run of an outcome.
 *
 * A breakeven BREAKS the run. Skipping it instead — treating a scratch as no
 * relief from the drawdown — is arguable psychologically, but it reports "8
 * consecutive losses" for a sequence that reads P N P×7, and the broker's own
 * statement says 7. On a headline figure the user will hold against that
 * statement, the plain meaning of "consecutive" wins.
 */
function longestRun(trades: readonly Closed[], isMatch: (trade: Closed) => boolean): number {
    let best = 0;
    let run = 0;

    for (const trade of trades) {
        run = isMatch(trade) ? run + 1 : 0;
        if (run > best) best = run;
    }

    return best;
}

function minutesBetween(from: Date, to: Date): number {
    return (to.getTime() - from.getTime()) / 60_000;
}

/**
 * Result in multiples of the risk planned at the stop.
 *
 * The entry-to-stop distance is what the trader DECIDED to risk before knowing
 * the outcome, so comparing the result against it separates a plan that worked
 * from a plan that was abandoned — a +0.3R winner and a −2R loser describe
 * someone taking profit early and moving stops, whatever the P&L says.
 *
 * Trades without a stop are excluded rather than assigned a guessed risk.
 */
function rMultiple(trade: Closed): number | null {
    if (trade.stopLoss === null || trade.pips === null || trade.pipSize <= 0) return null;

    const riskPips = Math.abs(trade.entryPrice - trade.stopLoss) / trade.pipSize;
    if (riskPips === 0) return null;

    return round(trade.pips / riskPips, 2);
}

export function analyseJournal(trades: readonly AnalysedTrade[]): JournalAnalytics {
    const closed = closedTrades(trades);

    const wins = closed.filter((trade) => trade.pnl > 0);
    const losses = closed.filter((trade) => trade.pnl < 0);
    const breakeven = closed.filter((trade) => trade.pnl === 0);

    const grossProfit = wins.reduce((total, trade) => total + trade.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((total, trade) => total + trade.pnl, 0));

    const averageWin = wins.length === 0 ? 0 : round(grossProfit / wins.length);
    const averageLoss = losses.length === 0 ? 0 : round(grossLoss / losses.length);

    // What follows each outcome. Walked in ENTRY order, because "what did he do
    // next" is a question about the order he acted in, not the order results
    // happened to arrive.
    const lotsAfterLoss: number[] = [];
    const lotsAfterWin: number[] = [];
    const gapAfterLoss: number[] = [];
    const gapAfterWin: number[] = [];

    for (let index = 1; index < closed.length; index += 1) {
        const previous = closed[index - 1]!;
        const current = closed[index]!;
        if (previous.pnl === 0) continue;

        const gap = minutesBetween(previous.closedAt, current.openedAt);
        const lots = previous.pnl < 0 ? lotsAfterLoss : lotsAfterWin;
        lots.push(current.lotSize);

        // A negative gap means the next position was already open when this one
        // closed — overlapping trades, not a reaction to the result.
        if (gap >= 0) (previous.pnl < 0 ? gapAfterLoss : gapAfterWin).push(gap);
    }

    const withStop = closed.filter((trade) => trade.stopLoss !== null);
    const rMultiples = closed
        .map(rMultiple)
        .filter((value): value is number => value !== null);

    let clustered = 0;
    for (let index = 1; index < closed.length; index += 1) {
        const previous = closed[index - 1]!;
        const current = closed[index]!;
        if (
            previous.instrument === current.instrument &&
            Math.abs(minutesBetween(previous.openedAt, current.openedAt)) <= 2
        ) {
            clustered += 1;
        }
    }

    return {
        trades: closed.length,
        wins: wins.length,
        losses: losses.length,
        breakeven: breakeven.length,
        winRate: closed.length === 0 ? 0 : Math.round((wins.length / closed.length) * 100),
        net: round(grossProfit - grossLoss),
        averageWin,
        averageLoss,
        payoffRatio: averageLoss === 0 ? null : round(averageWin / averageLoss),
        maxConsecutiveWins: longestRun(closed, (trade) => trade.pnl > 0),
        maxConsecutiveLosses: longestRun(closed, (trade) => trade.pnl < 0),

        byDirection: group(closed, (trade) => (trade.direction === 'Buy' ? 'Achat' : 'Vente')),
        byInstrument: group(closed, (trade) => trade.instrument),
        byWeekday: group(closed, (trade) => WEEKDAYS[trade.openedAt.getUTCDay()] ?? '?'),
        byServerHour: group(
            closed,
            (trade) => `${String(trade.openedAt.getUTCHours()).padStart(2, '0')}h`,
        ),

        holdMinutesOnWin: median(wins.map((trade) => minutesBetween(trade.openedAt, trade.closedAt))),
        holdMinutesOnLoss: median(
            losses.map((trade) => minutesBetween(trade.openedAt, trade.closedAt)),
        ),

        lotAfterLoss: median(lotsAfterLoss),
        lotAfterWin: median(lotsAfterWin),
        reentryMinutesAfterLoss: median(gapAfterLoss),
        reentryMinutesAfterWin: median(gapAfterWin),

        stopLossCoverage:
            closed.length === 0 ? 0 : Math.round((withStop.length / closed.length) * 100),
        medianRMultiple: median(rMultiples),
        clusteredEntries: clustered,
    };
}
