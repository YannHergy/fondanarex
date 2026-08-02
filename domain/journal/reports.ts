// ================================================================
// PERFORMANCE REPORTS
//
// Equity curve, drawdown, streaks and per-dimension breakdowns.
//
// Pure — no I/O, no clock. `now` is always passed in.
// ================================================================

import { journalStats, isThisMonth, isThisWeek, type JournalTrade } from './filters';
import { tradeOutcome } from './trade-math';

export type PeriodId = 'all' | 'week' | 'month' | 'quarter' | 'year';

export const PERIODS: readonly { id: PeriodId; label: string }[] = [
    { id: 'all', label: 'Tout' },
    { id: 'week', label: 'Cette semaine' },
    { id: 'month', label: 'Ce mois' },
    { id: 'quarter', label: 'Ce trimestre' },
    { id: 'year', label: 'Cette année' },
];

export const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

/** Trades whose ENTRY falls in the period. */
export function filterByPeriod(
    trades: readonly JournalTrade[],
    period: PeriodId,
    now: Date,
): JournalTrade[] {
    if (period === 'all') return [...trades];

    return trades.filter((trade) => {
        const date = trade.openedAt;

        if (period === 'week') return isThisWeek(date, now);
        if (period === 'month') return isThisMonth(date, now);
        if (period === 'year') return date.getUTCFullYear() === now.getUTCFullYear();

        // Quarter: same calendar quarter of the same year.
        return (
            date.getUTCFullYear() === now.getUTCFullYear() &&
            Math.floor(date.getUTCMonth() / 3) === Math.floor(now.getUTCMonth() / 3)
        );
    });
}

/** Closed trades in the order they were realised. */
function realised(trades: readonly JournalTrade[]): JournalTrade[] {
    return trades
        .filter((trade) => tradeOutcome(trade.closedAt, trade.pnl) !== 'open')
        .sort((a, b) => (a.closedAt?.getTime() ?? 0) - (b.closedAt?.getTime() ?? 0));
}

export interface EquityPoint {
    index: number;
    date: string;
    pnl: number;
    equity: number;
    peak: number;
    drawdown: number;
}

/**
 * Cumulative equity, ordered by CLOSE time.
 *
 * The legacy version sorted by entry date, which is the wrong axis for an
 * equity curve: a trade opened first but closed last realises its result last,
 * and ordering by entry makes the curve show gains before they existed — and
 * understates drawdown, because a loss realised early gets plotted late.
 */
export function equityCurve(trades: readonly JournalTrade[]): EquityPoint[] {
    let equity = 0;
    let peak = 0;

    return realised(trades).map((trade, index) => {
        equity = round(equity + (trade.pnl ?? 0));
        peak = Math.max(peak, equity);

        return {
            index,
            date: (trade.closedAt ?? trade.openedAt).toISOString().slice(0, 10),
            pnl: trade.pnl ?? 0,
            equity,
            peak,
            drawdown: round(peak - equity),
        };
    });
}

export interface DrawdownSummary {
    /** Largest peak-to-trough fall, in account currency. */
    maxDrawdown: number;
    /**
     * The fall as a percentage OF THE PEAK IT FELL FROM — not of account
     * capital, which this module never sees. The curve starts at zero and
     * tracks realised P&L, so a peak of +500 falling to -300 is a drawdown of
     * 800, which is 160 % of that peak. Values above 100 % are correct and mean
     * the account gave back more than it had made. Null when the peak was
     * never positive, since there is then no high-water mark to measure from.
     */
    maxDrawdownPct: number | null;
    /** Whether the account is currently below its high-water mark. */
    inDrawdown: boolean;
    currentDrawdown: number;
}

export function drawdown(trades: readonly JournalTrade[]): DrawdownSummary {
    const curve = equityCurve(trades);
    if (curve.length === 0) {
        return { maxDrawdown: 0, maxDrawdownPct: null, inDrawdown: false, currentDrawdown: 0 };
    }

    let maxDrawdown = 0;
    let maxDrawdownPct: number | null = null;

    for (const point of curve) {
        if (point.drawdown > maxDrawdown) {
            maxDrawdown = point.drawdown;
            // Percentage is meaningless against a zero or negative peak — an
            // account that never got above its start has no high-water mark to
            // measure the fall from.
            maxDrawdownPct = point.peak > 0 ? round((point.drawdown / point.peak) * 100) : null;
        }
    }

    const last = curve[curve.length - 1]!;

    return {
        maxDrawdown,
        maxDrawdownPct,
        inDrawdown: last.drawdown > 0,
        currentDrawdown: last.drawdown,
    };
}

export interface Streaks {
    longestWin: number;
    longestLoss: number;
    current: number;
    /** Direction of the current run. */
    currentKind: 'win' | 'loss' | 'none';
}

/**
 * Consecutive runs, in close order.
 *
 * Breakeven trades neither extend nor break a run: they are not a result in
 * either direction, and counting them as a loss would exaggerate losing streaks
 * on an account that scratches trades often.
 */
export function streaks(trades: readonly JournalTrade[]): Streaks {
    let longestWin = 0;
    let longestLoss = 0;
    let run = 0;
    let kind: 'win' | 'loss' | 'none' = 'none';

    for (const trade of realised(trades)) {
        const outcome = tradeOutcome(trade.closedAt, trade.pnl);
        if (outcome === 'breakeven') continue;

        if (outcome === kind) {
            run += 1;
        } else {
            kind = outcome === 'win' ? 'win' : 'loss';
            run = 1;
        }

        if (kind === 'win') longestWin = Math.max(longestWin, run);
        else longestLoss = Math.max(longestLoss, run);
    }

    return { longestWin, longestLoss, current: run, currentKind: kind };
}

export interface PerformanceRow {
    key: string;
    trades: number;
    closed: number;
    pnl: number;
    pips: number;
    winRate: number;
    profitFactor: number | null;
    expectancy: number;
    maxDrawdown: number;
}

/**
 * Performance grouped by a dimension — strategy, pair, session, weekday.
 *
 * Rows are sorted by P&L descending, so the best and worst read first. A group
 * with no closed trades still appears, with its counts, rather than being
 * dropped: "you have taken six of these and closed none" is information.
 */
export function groupPerformance(
    trades: readonly JournalTrade[],
    keyOf: (trade: JournalTrade) => string | null,
): PerformanceRow[] {
    const groups = new Map<string, JournalTrade[]>();

    for (const trade of trades) {
        const key = keyOf(trade) ?? 'Non renseigné';
        const bucket = groups.get(key);
        if (bucket) bucket.push(trade);
        else groups.set(key, [trade]);
    }

    return [...groups]
        .map(([key, groupTrades]) => {
            const stats = journalStats(groupTrades);

            return {
                key,
                trades: groupTrades.length,
                closed: stats.closed,
                pnl: stats.netPnl,
                pips: stats.totalPips,
                winRate: stats.winRate,
                profitFactor: stats.profitFactor,
                expectancy: stats.expectancy,
                maxDrawdown: drawdown(groupTrades).maxDrawdown,
            };
        })
        .sort((a, b) => b.pnl - a.pnl);
}

export interface DayPerformance {
    day: string;
    index: number;
    trades: number;
    pnl: number;
    winRate: number;
}

/** Performance by weekday of ENTRY, Monday first. */
export function byWeekday(trades: readonly JournalTrade[]): DayPerformance[] {
    return DAY_NAMES.map((day, index) => {
        const dayTrades = trades.filter(
            (trade) => (trade.openedAt.getUTCDay() + 6) % 7 === index,
        );
        const stats = journalStats(dayTrades);

        return {
            day,
            index,
            trades: dayTrades.length,
            pnl: stats.netPnl,
            winRate: stats.winRate,
        };
    });
}

export interface MonthPerformance {
    month: string;
    pnl: number;
    trades: number;
}

/** Realised P&L per calendar month, oldest first. */
export function byMonth(trades: readonly JournalTrade[]): MonthPerformance[] {
    const months = new Map<string, JournalTrade[]>();

    for (const trade of realised(trades)) {
        const key = (trade.closedAt ?? trade.openedAt).toISOString().slice(0, 7);
        const bucket = months.get(key);
        if (bucket) bucket.push(trade);
        else months.set(key, [trade]);
    }

    return [...months]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, monthTrades]) => ({
            month,
            trades: monthTrades.length,
            pnl: journalStats(monthTrades).netPnl,
        }));
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
