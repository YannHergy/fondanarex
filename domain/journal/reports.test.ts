import { describe, expect, it } from 'vitest';

import type { JournalTrade } from './filters';
import {
    byMonth,
    byWeekday,
    drawdown,
    equityCurve,
    filterByPeriod,
    groupPerformance,
    streaks,
} from './reports';

const NOW = new Date('2026-08-05T12:00:00Z'); // Wednesday, Q3

let counter = 0;

function trade(overrides: Partial<JournalTrade> = {}): JournalTrade {
    counter += 1;
    return {
        id: `t${counter}`,
        instrument: 'EUR/USD',
        direction: 'Buy',
        openedAt: NOW,
        closedAt: NOW,
        pips: 10,
        pnl: 100,
        strategy: 'M2 ENTRY',
        session: 'London',
        tags: [],
        source: 'manual',
        ...overrides,
    };
}

/** A closed trade with explicit open and close instants. */
function closed(pnl: number, opened: string, closedAt = opened): JournalTrade {
    return trade({
        pnl,
        pips: pnl / 10,
        openedAt: new Date(opened),
        closedAt: new Date(closedAt),
    });
}

describe('filterByPeriod', () => {
    const trades = [
        trade({ openedAt: new Date('2026-08-04T00:00:00Z') }), // this week
        trade({ openedAt: new Date('2026-08-01T00:00:00Z') }), // this month, last week
        trade({ openedAt: new Date('2026-07-15T00:00:00Z') }), // this quarter
        trade({ openedAt: new Date('2026-02-01T00:00:00Z') }), // this year
        trade({ openedAt: new Date('2025-08-05T00:00:00Z') }), // last year
    ];

    it('returns everything for "all"', () => {
        expect(filterByPeriod(trades, 'all', NOW)).toHaveLength(5);
    });

    it('narrows progressively', () => {
        expect(filterByPeriod(trades, 'week', NOW)).toHaveLength(1);
        expect(filterByPeriod(trades, 'month', NOW)).toHaveLength(2);
        expect(filterByPeriod(trades, 'quarter', NOW)).toHaveLength(3);
        expect(filterByPeriod(trades, 'year', NOW)).toHaveLength(4);
    });

    it('does not leak the same quarter of another year', () => {
        const lastYearQ3 = [trade({ openedAt: new Date('2025-07-15T00:00:00Z') })];
        expect(filterByPeriod(lastYearQ3, 'quarter', NOW)).toHaveLength(0);
    });

    it('does not mutate the input', () => {
        const original = [...trades];
        filterByPeriod(trades, 'all', NOW);
        expect(trades).toEqual(original);
    });
});

describe('equityCurve', () => {
    it('is empty with no closed trades', () => {
        expect(equityCurve([trade({ closedAt: null, pnl: null })])).toEqual([]);
    });

    it('accumulates P&L', () => {
        const curve = equityCurve([
            closed(100, '2026-08-01T10:00:00Z'),
            closed(-40, '2026-08-02T10:00:00Z'),
            closed(60, '2026-08-03T10:00:00Z'),
        ]);
        expect(curve.map((point) => point.equity)).toEqual([100, 60, 120]);
    });

    it('orders by CLOSE time, not entry', () => {
        // A trade opened first but closed last realises last. Ordering by entry
        // plots gains before they existed and understates drawdown.
        const curve = equityCurve([
            closed(-100, '2026-08-01T09:00:00Z', '2026-08-05T10:00:00Z'),
            closed(50, '2026-08-02T09:00:00Z', '2026-08-02T10:00:00Z'),
        ]);
        expect(curve.map((point) => point.pnl)).toEqual([50, -100]);
        expect(curve.map((point) => point.equity)).toEqual([50, -50]);
    });

    it('tracks the running peak and drawdown', () => {
        const curve = equityCurve([
            closed(100, '2026-08-01T10:00:00Z'),
            closed(-30, '2026-08-02T10:00:00Z'),
        ]);
        expect(curve[1]!.peak).toBe(100);
        expect(curve[1]!.drawdown).toBe(30);
    });

    it('excludes open trades', () => {
        const curve = equityCurve([
            closed(100, '2026-08-01T10:00:00Z'),
            trade({ closedAt: null, pnl: null }),
        ]);
        expect(curve).toHaveLength(1);
    });
});

describe('drawdown', () => {
    it('is zero for an empty journal', () => {
        expect(drawdown([])).toEqual({
            maxDrawdown: 0,
            maxDrawdownPct: null,
            inDrawdown: false,
            currentDrawdown: 0,
        });
    });

    it('measures the largest peak-to-trough fall', () => {
        const result = drawdown([
            closed(200, '2026-08-01T10:00:00Z'),
            closed(-150, '2026-08-02T10:00:00Z'),
            closed(50, '2026-08-03T10:00:00Z'),
            closed(-30, '2026-08-04T10:00:00Z'),
        ]);
        expect(result.maxDrawdown).toBe(150);
    });

    it('expresses it against the peak it fell from', () => {
        const result = drawdown([
            closed(200, '2026-08-01T10:00:00Z'),
            closed(-100, '2026-08-02T10:00:00Z'),
        ]);
        expect(result.maxDrawdownPct).toBe(50);
    });

    it('reports no percentage when the account never rose above zero', () => {
        // There is no high-water mark to measure a fall from.
        const result = drawdown([closed(-100, '2026-08-01T10:00:00Z')]);
        expect(result.maxDrawdown).toBe(100);
        expect(result.maxDrawdownPct).toBeNull();
    });

    it('knows whether the account is currently below its peak', () => {
        const recovered = drawdown([
            closed(100, '2026-08-01T10:00:00Z'),
            closed(-50, '2026-08-02T10:00:00Z'),
            closed(60, '2026-08-03T10:00:00Z'),
        ]);
        expect(recovered.inDrawdown).toBe(false);
        expect(recovered.currentDrawdown).toBe(0);

        const underwater = drawdown([
            closed(100, '2026-08-01T10:00:00Z'),
            closed(-50, '2026-08-02T10:00:00Z'),
        ]);
        expect(underwater.inDrawdown).toBe(true);
        expect(underwater.currentDrawdown).toBe(50);
    });

    it('is zero for a monotonically rising account', () => {
        const result = drawdown([
            closed(100, '2026-08-01T10:00:00Z'),
            closed(50, '2026-08-02T10:00:00Z'),
        ]);
        expect(result.maxDrawdown).toBe(0);
    });
});

describe('streaks', () => {
    it('is empty for no trades', () => {
        expect(streaks([])).toEqual({
            longestWin: 0,
            longestLoss: 0,
            current: 0,
            currentKind: 'none',
        });
    });

    it('finds the longest runs', () => {
        const result = streaks([
            closed(10, '2026-08-01T10:00:00Z'),
            closed(10, '2026-08-02T10:00:00Z'),
            closed(10, '2026-08-03T10:00:00Z'),
            closed(-10, '2026-08-04T10:00:00Z'),
            closed(-10, '2026-08-05T10:00:00Z'),
        ]);
        expect(result.longestWin).toBe(3);
        expect(result.longestLoss).toBe(2);
        expect(result.current).toBe(2);
        expect(result.currentKind).toBe('loss');
    });

    it('lets a breakeven trade neither extend nor break a run', () => {
        // Counting a scratch as a loss would exaggerate losing streaks on an
        // account that closes at entry often.
        const result = streaks([
            closed(10, '2026-08-01T10:00:00Z'),
            closed(0, '2026-08-02T10:00:00Z'),
            closed(10, '2026-08-03T10:00:00Z'),
        ]);
        expect(result.longestWin).toBe(2);
        expect(result.longestLoss).toBe(0);
    });

    it('counts in close order', () => {
        const result = streaks([
            closed(-10, '2026-08-01T09:00:00Z', '2026-08-09T10:00:00Z'),
            closed(10, '2026-08-02T09:00:00Z', '2026-08-02T10:00:00Z'),
        ]);
        expect(result.currentKind).toBe('loss');
    });
});

describe('groupPerformance', () => {
    const trades = [
        trade({ strategy: 'M2 ENTRY', pnl: 200, pips: 20 }),
        trade({ strategy: 'M2 ENTRY', pnl: -50, pips: -5 }),
        trade({ strategy: 'A2 ENTRY', pnl: 300, pips: 30 }),
        trade({ strategy: null, pnl: 10, pips: 1 }),
    ];

    it('groups and sorts by P&L descending', () => {
        const rows = groupPerformance(trades, (t) => t.strategy);
        expect(rows.map((row) => row.key)).toEqual(['A2 ENTRY', 'M2 ENTRY', 'Non renseigné']);
    });

    it('aggregates each group', () => {
        const rows = groupPerformance(trades, (t) => t.strategy);
        const m2 = rows.find((row) => row.key === 'M2 ENTRY')!;
        expect(m2).toMatchObject({ trades: 2, closed: 2, pnl: 150, pips: 15, winRate: 50 });
    });

    it('labels a missing dimension rather than dropping the trades', () => {
        const rows = groupPerformance(trades, (t) => t.strategy);
        expect(rows.find((row) => row.key === 'Non renseigné')?.trades).toBe(1);
    });

    it('keeps a group whose trades are all still open', () => {
        // "Six taken, none closed" is information, not an empty row.
        const rows = groupPerformance(
            [trade({ strategy: 'NEW', closedAt: null, pnl: null })],
            (t) => t.strategy,
        );
        expect(rows[0]).toMatchObject({ key: 'NEW', trades: 1, closed: 0, pnl: 0 });
    });

    it('reports profit factor as null when a group never lost', () => {
        // The legacy helper returned the magic number 999, which rendered as a
        // real and absurd figure.
        const rows = groupPerformance([trade({ strategy: 'X', pnl: 100 })], (t) => t.strategy);
        expect(rows[0]!.profitFactor).toBeNull();
    });

    it('computes a per-group drawdown', () => {
        const rows = groupPerformance(
            [
                closed(200, '2026-08-01T10:00:00Z'),
                closed(-150, '2026-08-02T10:00:00Z'),
            ],
            () => 'one',
        );
        expect(rows[0]!.maxDrawdown).toBe(150);
    });

    it('groups by any dimension', () => {
        const rows = groupPerformance(trades, (t) => t.instrument);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.key).toBe('EUR/USD');
    });
});

describe('byWeekday', () => {
    it('always returns seven days, Monday first', () => {
        const rows = byWeekday([]);
        expect(rows).toHaveLength(7);
        expect(rows[0]!.day).toBe('Lun');
        expect(rows[6]!.day).toBe('Dim');
    });

    it('files a trade under its entry weekday', () => {
        // 2026-08-05 is a Wednesday.
        const rows = byWeekday([trade({ openedAt: new Date('2026-08-05T10:00:00Z'), pnl: 100 })]);
        expect(rows[2]!.trades).toBe(1);
        expect(rows[2]!.pnl).toBe(100);
    });

    it('handles Sunday, which is day 0 in JavaScript', () => {
        const rows = byWeekday([trade({ openedAt: new Date('2026-08-09T10:00:00Z') })]);
        expect(rows[6]!.trades).toBe(1);
    });
});

describe('byMonth', () => {
    it('is empty with no closed trades', () => {
        expect(byMonth([trade({ closedAt: null, pnl: null })])).toEqual([]);
    });

    it('groups by close month, oldest first', () => {
        const rows = byMonth([
            closed(100, '2026-08-01T10:00:00Z'),
            closed(50, '2026-07-01T10:00:00Z'),
            closed(-20, '2026-08-15T10:00:00Z'),
        ]);
        expect(rows.map((row) => row.month)).toEqual(['2026-07', '2026-08']);
        expect(rows[1]!.pnl).toBe(80);
        expect(rows[1]!.trades).toBe(2);
    });

    it('files a trade under the month it CLOSED in', () => {
        const rows = byMonth([closed(100, '2026-07-30T10:00:00Z', '2026-08-02T10:00:00Z')]);
        expect(rows[0]!.month).toBe('2026-08');
    });
});

describe('drawdown percentage semantics', () => {
    it('can legitimately exceed 100 % of the peak', () => {
        // The curve starts at zero and tracks realised P&L, so +500 falling to
        // -300 is a drawdown of 800 — 160 % of the peak it fell from. That is
        // correct, and means the account gave back more than it had made.
        const result = drawdown([
            closed(500, '2026-08-01T10:00:00Z'),
            closed(-800, '2026-08-02T10:00:00Z'),
        ]);
        expect(result.maxDrawdown).toBe(800);
        expect(result.maxDrawdownPct).toBe(160);
    });
});
