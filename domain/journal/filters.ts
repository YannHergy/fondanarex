// ================================================================
// JOURNAL FILTERING, SORTING AND STATS
//
// Pure — no I/O, no clock. `now` is always passed in.
// ================================================================

import { tradeOutcome } from './trade-math';

/**
 * Where a trade came from.
 *
 * `mt5` is an import of the terminal's own HTML report — the fallback taken
 * because the broker refuses the third-party connections `metaapi` needs.
 * Both carry the broker's position id, so they deduplicate against each other.
 */
export type TradeOrigin = 'manual' | 'metaapi' | 'mt5';

export interface JournalTrade {
    id: string;
    instrument: string;
    direction: 'Buy' | 'Sell';
    openedAt: Date;
    closedAt: Date | null;
    pips: number | null;
    pnl: number | null;
    strategy: string | null;
    session: string | null;
    tags: string[];
    source: TradeOrigin;
}

/** True when the terminal produced the trade rather than the user typing it. */
export function isImported(source: TradeOrigin): boolean {
    return source !== 'manual';
}

export const ORIGIN_LABELS: Record<TradeOrigin, string> = {
    manual: 'Saisie manuelle',
    metaapi: 'MetaTrader (synchro)',
    mt5: 'MetaTrader (rapport)',
};

export const SESSIONS = ['London', 'New York', 'Asian', 'London Close'] as const;
export const CLOSE_TYPES = ['TP atteint', 'SL touché', 'Clôture manuelle', 'Break Even'] as const;
export const EMOTIONS_BEFORE = ['Confiant', 'Neutre', 'Hésitant', 'FOMO', 'Revenge'] as const;
export const EMOTIONS_AFTER = ['Satisfait', 'Frustré', 'Regret', 'Neutre'] as const;
export const DEFAULT_STRATEGIES = [
    'M1 ENTRY',
    'M2 ENTRY',
    'A11 ENTRY',
    'A12 ENTRY',
    'A2 ENTRY',
    'A21 ENTRY',
    'GOLDEN ENTRY',
] as const;

const DAY_MS = 86_400_000;

/**
 * Monday 00:00 UTC of the week containing `date`.
 *
 * The legacy helper built this from the LOCAL clock — `setHours(0,0,0,0)` and
 * `getDay()` — which puts the boundary at a different instant per machine.
 */
export function weekStart(date: Date): Date {
    const d = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d;
}

/**
 * Whether a trade falls in the current week.
 *
 * BOUNDED at both ends. The legacy test was `d >= weekStart` with no upper
 * limit, so every trade dated after this Monday counted as "this week" —
 * including next month's, and including anything mis-typed into the future.
 * A single fat-fingered year would inflate the weekly figures permanently.
 */
export function isThisWeek(date: Date, now: Date): boolean {
    const start = weekStart(now);
    return date >= start && date.getTime() < start.getTime() + 7 * DAY_MS;
}

export function isThisMonth(date: Date, now: Date): boolean {
    return (
        date.getUTCFullYear() === now.getUTCFullYear() &&
        date.getUTCMonth() === now.getUTCMonth()
    );
}

export type ResultFilter = 'all' | 'win' | 'loss' | 'breakeven' | 'open';
export type PeriodFilter = 'all' | 'week' | 'month';

export interface JournalFilters {
    instrument?: string;
    strategy?: string;
    session?: string;
    result?: ResultFilter;
    period?: PeriodFilter;
    /** Matches instrument, strategy, notes-free text and tags. */
    search?: string;
}

/**
 * Applies the filter set.
 *
 * The result filter routes through `tradeOutcome`, so an OPEN trade is its own
 * category. The legacy test was `pnl <= 0` for wins and `pnl >= 0` for losses,
 * which silently swallowed open trades — they carry a null or zero P&L — into
 * neither bucket, so a filtered list never added up to the unfiltered one.
 */
// Generic over the row type rather than fixed to JournalTrade: callers pass
// richer rows (entry price, account, screenshots) and need them back intact.
// Narrowing to the interface here silently stripped those fields at the type
// level, so anything downstream of a filter could only see the minimum.
export function filterTrades<T extends JournalTrade>(
    trades: readonly T[],
    filters: JournalFilters,
    now: Date,
): T[] {
    const search = filters.search?.trim().toLowerCase();

    return trades.filter((trade) => {
        if (filters.instrument && trade.instrument !== filters.instrument) return false;
        if (filters.strategy && trade.strategy !== filters.strategy) return false;
        if (filters.session && trade.session !== filters.session) return false;

        if (filters.result && filters.result !== 'all') {
            if (tradeOutcome(trade.closedAt, trade.pnl) !== filters.result) return false;
        }

        if (filters.period === 'week' && !isThisWeek(trade.openedAt, now)) return false;
        if (filters.period === 'month' && !isThisMonth(trade.openedAt, now)) return false;

        if (search) {
            const haystack = [trade.instrument, trade.strategy ?? '', ...trade.tags]
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(search)) return false;
        }

        return true;
    });
}

export type SortColumn = 'date' | 'pnl' | 'pips' | 'instrument';
export type SortDirection = 'asc' | 'desc';

/**
 * Sorts a trade list.
 *
 * Nulls sort last in both directions rather than being treated as zero: an
 * open trade has no result, and ranking it alongside a genuine breakeven would
 * misrepresent it at both ends of the list.
 */
export function sortTrades<T extends JournalTrade>(
    trades: readonly T[],
    column: SortColumn,
    direction: SortDirection,
): T[] {
    const sign = direction === 'asc' ? 1 : -1;

    return [...trades].sort((a, b) => {
        if (column === 'instrument') return sign * a.instrument.localeCompare(b.instrument);
        if (column === 'date') return sign * (a.openedAt.getTime() - b.openedAt.getTime());

        const left = column === 'pnl' ? a.pnl : a.pips;
        const right = column === 'pnl' ? b.pnl : b.pips;

        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;

        return sign * (left - right);
    });
}

export interface JournalStats {
    total: number;
    closed: number;
    open: number;
    wins: number;
    losses: number;
    breakeven: number;
    /** Percentage of CLOSED trades that won. */
    winRate: number;
    netPnl: number;
    totalPips: number;
    averageWin: number;
    averageLoss: number;
    /** Gross profit divided by gross loss. Null when nothing was lost. */
    profitFactor: number | null;
    /** Average result per closed trade. */
    expectancy: number;
    best: JournalTrade | null;
    worst: JournalTrade | null;
}

/**
 * Aggregate statistics.
 *
 * Every ratio is computed over CLOSED trades only. Including open positions
 * would let a trade that has not resolved dilute the win rate, and their P&L
 * is unrealised — a number that changes with the market, not with the trader.
 */
export function journalStats(trades: readonly JournalTrade[]): JournalStats {
    const withOutcome = trades.map((trade) => ({
        trade,
        outcome: tradeOutcome(trade.closedAt, trade.pnl),
    }));

    const closed = withOutcome.filter((entry) => entry.outcome !== 'open');
    const wins = closed.filter((entry) => entry.outcome === 'win');
    const losses = closed.filter((entry) => entry.outcome === 'loss');

    const sum = (entries: typeof closed) =>
        entries.reduce((total, entry) => total + (entry.trade.pnl ?? 0), 0);

    const grossProfit = sum(wins);
    const grossLoss = Math.abs(sum(losses));
    const netPnl = grossProfit - grossLoss;

    const best = closed.reduce<JournalTrade | null>(
        (top, entry) => (top === null || (entry.trade.pnl ?? 0) > (top.pnl ?? 0) ? entry.trade : top),
        null,
    );
    const worst = closed.reduce<JournalTrade | null>(
        (low, entry) => (low === null || (entry.trade.pnl ?? 0) < (low.pnl ?? 0) ? entry.trade : low),
        null,
    );

    return {
        total: trades.length,
        closed: closed.length,
        open: withOutcome.length - closed.length,
        wins: wins.length,
        losses: losses.length,
        breakeven: closed.filter((entry) => entry.outcome === 'breakeven').length,
        winRate: closed.length === 0 ? 0 : Math.round((wins.length / closed.length) * 100),
        netPnl: round(netPnl),
        totalPips: round(
            closed.reduce((total, entry) => total + (entry.trade.pips ?? 0), 0),
        ),
        averageWin: wins.length === 0 ? 0 : round(grossProfit / wins.length),
        averageLoss: losses.length === 0 ? 0 : round(grossLoss / losses.length),
        // Null rather than Infinity when nothing was lost: a profit factor with
        // no losses in it is not a very large number, it is undefined.
        profitFactor: grossLoss === 0 ? null : round(grossProfit / grossLoss),
        expectancy: closed.length === 0 ? 0 : round(netPnl / closed.length),
        best,
        worst,
    };
}

/** Trades grouped by the calendar day they were opened, "YYYY-MM-DD" in UTC. */
export function tradesByDay(
    trades: readonly JournalTrade[],
): Map<string, JournalTrade[]> {
    const grouped = new Map<string, JournalTrade[]>();

    for (const trade of trades) {
        const key = trade.openedAt.toISOString().slice(0, 10);
        const bucket = grouped.get(key);
        if (bucket) bucket.push(trade);
        else grouped.set(key, [trade]);
    }

    return grouped;
}

export interface CalendarCell {
    day: number;
    date: string;
    trades: JournalTrade[];
    pnl: number;
}

/**
 * A month's calendar grid, Monday-first, padded to whole weeks.
 *
 * Leading nulls are the offset before the 1st; trailing nulls complete the
 * final row so the grid never reflows.
 */
export function monthCalendar(
    year: number,
    month: number,
    byDay: Map<string, JournalTrade[]>,
): (CalendarCell | null)[] {
    const firstDay = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const offset = (firstDay.getUTCDay() + 6) % 7;

    const cells: (CalendarCell | null)[] = Array.from({ length: offset }, () => null);

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
        const dayTrades = byDay.get(date) ?? [];

        cells.push({
            day,
            date,
            trades: dayTrades,
            pnl: round(dayTrades.reduce((total, trade) => total + (trade.pnl ?? 0), 0)),
        });
    }

    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
