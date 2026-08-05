// ================================================================
// EQUITY CURVE AND PERIOD TOTALS
//
// The account's balance over time, plus the same result cut into
// days, weeks or months.
//
// Buckets a trade on its CLOSE date, which is when the journal
// considers it resolved. A broker's ledger differs slightly: it
// charges the commission at entry, so a position opened in one
// month and closed in the next splits across both. On the imported
// history that moves 0.56 of 105.37 between February and March —
// visible only if you compare against the broker's own report,
// which is why it is written down here rather than hidden.
//
// Pure — no I/O, no clock. `now` is never read.
// ================================================================

export type Granularity = 'day' | 'week' | 'month';

/** The minimum a trade must carry to sit on the curve. */
export interface ResolvedTrade {
    closedAt: Date | null;
    pnl: number | null;
}

export interface EquityPoint {
    at: Date;
    /** Starting balance plus everything realised up to and including this trade. */
    balance: number;
    /** Realised result since the start, without the starting balance. */
    cumulative: number;
}

export interface PeriodTotal {
    /** Sort key, e.g. "2026-02" or "2026-02-18". */
    key: string;
    label: string;
    start: Date;
    net: number;
    trades: number;
}

const MONTHS_FR = [
    'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin',
    'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc',
];

const DAY_MS = 86_400_000;

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Closed trades carrying a result, oldest first. */
function resolved<T extends ResolvedTrade>(trades: readonly T[]): (T & { closedAt: Date })[] {
    return trades
        .filter((trade): trade is T & { closedAt: Date } => trade.closedAt !== null && trade.pnl !== null)
        .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
}

// ----------------------------------------------------------------
// Granularity
// ----------------------------------------------------------------

/**
 * How finely to cut the timeline.
 *
 * Driven by the span first, because that is what decides whether a label row
 * can be read at all: thirty months of daily bars is a smear, and five days of
 * monthly bars is one bar. The trade count only steps the choice FINER, never
 * coarser — a long but sparse history still deserves months, whereas a short
 * burst of activity deserves days.
 */
export function pickGranularity(spanDays: number, tradeCount: number): Granularity {
    if (spanDays > 120) return 'month';
    if (spanDays > 21) return tradeCount <= 6 ? 'day' : 'week';
    return 'day';
}

/** Granularity for a set of trades, from their own span. */
export function granularityFor(trades: readonly ResolvedTrade[]): Granularity {
    const closed = resolved(trades);
    if (closed.length === 0) return 'month';

    const first = closed[0]!.closedAt.getTime();
    const last = closed.at(-1)!.closedAt.getTime();

    return pickGranularity((last - first) / DAY_MS, closed.length);
}

// ----------------------------------------------------------------
// Curve
// ----------------------------------------------------------------

/**
 * Balance after each closed trade, oldest first.
 *
 * Opens with a point at the starting balance dated just before the first
 * trade, so the curve begins on the account's real starting line instead of
 * on its first result. Without it a first losing trade would make the chart
 * open at its own low, hiding the drop entirely.
 */
export function equityCurve(
    trades: readonly ResolvedTrade[],
    startingBalance: number,
): EquityPoint[] {
    const closed = resolved(trades);
    if (closed.length === 0) return [];

    const opening = new Date(closed[0]!.closedAt.getTime() - DAY_MS);
    const points: EquityPoint[] = [
        { at: opening, balance: round(startingBalance), cumulative: 0 },
    ];

    let cumulative = 0;
    for (const trade of closed) {
        cumulative += trade.pnl ?? 0;
        points.push({
            at: trade.closedAt,
            balance: round(startingBalance + cumulative),
            cumulative: round(cumulative),
        });
    }

    return points;
}

// ----------------------------------------------------------------
// Buckets
// ----------------------------------------------------------------

/** Monday of the week containing `date`, at midnight UTC. */
function weekStart(date: Date): Date {
    const day = date.getUTCDay();
    // getUTCDay puts Sunday at 0; shift it to the end so weeks start Monday.
    const back = day === 0 ? 6 : day - 1;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - back));
}

function bucketStart(date: Date, granularity: Granularity): Date {
    if (granularity === 'month') {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    }
    if (granularity === 'week') return weekStart(date);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function bucketKey(start: Date, granularity: Granularity): string {
    const year = start.getUTCFullYear();
    const month = String(start.getUTCMonth() + 1).padStart(2, '0');
    const day = String(start.getUTCDate()).padStart(2, '0');

    if (granularity === 'month') return `${year}-${month}`;
    return `${year}-${month}-${day}`;
}

function bucketLabel(start: Date, granularity: Granularity): string {
    const month = MONTHS_FR[start.getUTCMonth()] ?? '';

    if (granularity === 'month') return month;
    if (granularity === 'week') return `${start.getUTCDate()} ${month}`;
    return `${start.getUTCDate()} ${month}`;
}

/**
 * Net result per period, oldest first.
 *
 * Only periods that actually contain a trade appear. Emitting empty ones would
 * pad the strip with zeros that read as flat performance rather than as no
 * activity, and on a journal the difference matters.
 */
export function periodTotals(
    trades: readonly ResolvedTrade[],
    granularity: Granularity,
): PeriodTotal[] {
    const buckets = new Map<string, PeriodTotal>();

    for (const trade of resolved(trades)) {
        const start = bucketStart(trade.closedAt, granularity);
        const key = bucketKey(start, granularity);

        const bucket = buckets.get(key);
        if (bucket) {
            bucket.net = round(bucket.net + (trade.pnl ?? 0));
            bucket.trades += 1;
        } else {
            buckets.set(key, {
                key,
                label: bucketLabel(start, granularity),
                start,
                net: round(trade.pnl ?? 0),
                trades: 1,
            });
        }
    }

    return [...buckets.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * The largest drop from a previous peak, in account currency.
 *
 * Measured on the realised curve, so it is the drawdown a journal can prove —
 * not the intraday one, which needs tick data the report does not carry.
 */
export function maxDrawdown(points: readonly EquityPoint[]): number {
    let peak = -Infinity;
    let worst = 0;

    for (const point of points) {
        if (point.balance > peak) peak = point.balance;
        const drop = peak - point.balance;
        if (drop > worst) worst = drop;
    }

    return round(worst);
}
