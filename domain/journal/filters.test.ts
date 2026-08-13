import { describe, expect, it } from 'vitest';

import {
    filterTrades,
    isThisMonth,
    isThisWeek,
    journalStats,
    monthCalendar,
    sortTrades,
    tradesByDay,
    weekStart,
    type JournalTrade,
} from './filters';

const NOW = new Date('2026-08-05T12:00:00Z'); // a Wednesday

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

describe('weekStart', () => {
    it('returns Monday of the containing week', () => {
        expect(weekStart(NOW).toISOString().slice(0, 10)).toBe('2026-08-03');
    });

    it('treats Sunday as the end of the week, not the start', () => {
        expect(weekStart(new Date('2026-08-09T23:00:00Z')).toISOString().slice(0, 10)).toBe(
            '2026-08-03',
        );
    });
});

describe('isThisWeek', () => {
    it('accepts a trade inside the week', () => {
        expect(isThisWeek(new Date('2026-08-03T00:00:00Z'), NOW)).toBe(true);
        expect(isThisWeek(new Date('2026-08-09T23:59:00Z'), NOW)).toBe(true);
    });

    it('rejects last week', () => {
        expect(isThisWeek(new Date('2026-08-02T23:00:00Z'), NOW)).toBe(false);
    });

    it('rejects NEXT week', () => {
        // The legacy test was `d >= weekStart` with no upper bound, so every
        // future trade counted as "this week" forever.
        expect(isThisWeek(new Date('2026-08-10T00:00:00Z'), NOW)).toBe(false);
    });

    it('rejects a date mis-typed years into the future', () => {
        // One fat-fingered year would otherwise inflate the weekly figures
        // permanently.
        expect(isThisWeek(new Date('2126-08-05T00:00:00Z'), NOW)).toBe(false);
    });
});

describe('isThisMonth', () => {
    it('accepts a date in the same month and year', () => {
        expect(isThisMonth(new Date('2026-08-31T00:00:00Z'), NOW)).toBe(true);
    });

    it('rejects the same month a year apart', () => {
        expect(isThisMonth(new Date('2025-08-05T00:00:00Z'), NOW)).toBe(false);
    });

    it('rejects an adjacent month', () => {
        expect(isThisMonth(new Date('2026-09-01T00:00:00Z'), NOW)).toBe(false);
    });
});

describe('filterTrades', () => {
    const trades = [
        trade({ instrument: 'EUR/USD', strategy: 'M2 ENTRY', session: 'London', pnl: 100 }),
        trade({ instrument: 'GBP/USD', strategy: 'A2 ENTRY', session: 'New York', pnl: -50 }),
        trade({ instrument: 'EUR/USD', strategy: 'M2 ENTRY', session: 'Asian', pnl: 0 }),
        trade({ instrument: 'USD/JPY', closedAt: null, pnl: null, pips: null }),
    ];

    it('returns everything with no filters', () => {
        expect(filterTrades(trades, {}, NOW)).toHaveLength(4);
    });

    it('filters by trading account, and never keeps a trade attached to none', () => {
        const withAccounts = [
            trade({ instrument: 'EUR/USD', accountId: 'acc-5k' }),
            trade({ instrument: 'GBP/USD', accountId: 'acc-25k' }),
            trade({ instrument: 'USD/JPY', accountId: 'acc-5k' }),
            // Saisi à la main sans compte : il n'appartient à aucun, donc un
            // filtre par compte ne doit jamais le retenir.
            trade({ instrument: 'AUD/USD', accountId: null }),
        ];

        expect(filterTrades(withAccounts, { account: 'acc-5k' }, NOW).map(t => t.instrument))
            .toEqual(['EUR/USD', 'USD/JPY']);
        expect(filterTrades(withAccounts, { account: 'acc-25k' }, NOW)).toHaveLength(1);
        expect(filterTrades(withAccounts, { account: 'inconnu' }, NOW)).toHaveLength(0);
        // Pas de filtre : le trade sans compte reste visible.
        expect(filterTrades(withAccounts, {}, NOW)).toHaveLength(4);
    });

    it('filters by instrument, strategy and session', () => {
        expect(filterTrades(trades, { instrument: 'EUR/USD' }, NOW)).toHaveLength(2);
        expect(filterTrades(trades, { strategy: 'A2 ENTRY' }, NOW)).toHaveLength(1);
        expect(filterTrades(trades, { session: 'Asian' }, NOW)).toHaveLength(1);
    });

    it('separates wins, losses, breakeven and open', () => {
        // The legacy tests were `pnl <= 0` for wins and `pnl >= 0` for losses,
        // so open trades fell into neither and a filtered list never added up
        // to the unfiltered one.
        expect(filterTrades(trades, { result: 'win' }, NOW)).toHaveLength(1);
        expect(filterTrades(trades, { result: 'loss' }, NOW)).toHaveLength(1);
        expect(filterTrades(trades, { result: 'breakeven' }, NOW)).toHaveLength(1);
        expect(filterTrades(trades, { result: 'open' }, NOW)).toHaveLength(1);
    });

    it('accounts for every trade across the result buckets', () => {
        const counts = (['win', 'loss', 'breakeven', 'open'] as const).map(
            (result) => filterTrades(trades, { result }, NOW).length,
        );
        expect(counts.reduce((a, b) => a + b, 0)).toBe(trades.length);
    });

    it('filters by period', () => {
        const older = trade({ openedAt: new Date('2026-06-01T00:00:00Z') });
        const all = [...trades, older];
        expect(filterTrades(all, { period: 'week' }, NOW)).toHaveLength(4);
        expect(filterTrades(all, { period: 'month' }, NOW)).toHaveLength(4);
        expect(filterTrades(all, { period: 'all' }, NOW)).toHaveLength(5);
    });

    it('searches instrument, strategy and tags', () => {
        const tagged = trade({ tags: ['revenge', 'tilt'] });
        const all = [...trades, tagged];
        expect(filterTrades(all, { search: 'revenge' }, NOW)).toHaveLength(1);
        expect(filterTrades(all, { search: 'gbp' }, NOW)).toHaveLength(1);
        // Four: two explicit M2 trades, plus the open one and the tagged one
        // that both carry the default strategy.
        expect(filterTrades(all, { search: 'M2' }, NOW)).toHaveLength(4);
    });

    it('ignores case and surrounding space in the search', () => {
        expect(filterTrades(trades, { search: '  eur/usd  ' }, NOW)).toHaveLength(2);
    });

    it('combines filters conjunctively', () => {
        expect(
            filterTrades(trades, { instrument: 'EUR/USD', result: 'win' }, NOW),
        ).toHaveLength(1);
    });
});

describe('sortTrades', () => {
    const trades = [
        trade({ instrument: 'GBP/USD', pnl: 50, pips: 5, openedAt: new Date('2026-08-01T00:00:00Z') }),
        trade({ instrument: 'EUR/USD', pnl: 200, pips: 20, openedAt: new Date('2026-08-03T00:00:00Z') }),
        trade({ instrument: 'USD/JPY', pnl: -30, pips: -3, openedAt: new Date('2026-08-02T00:00:00Z') }),
    ];

    it('sorts by P&L in both directions', () => {
        expect(sortTrades(trades, 'pnl', 'desc').map((t) => t.pnl)).toEqual([200, 50, -30]);
        expect(sortTrades(trades, 'pnl', 'asc').map((t) => t.pnl)).toEqual([-30, 50, 200]);
    });

    it('sorts by date', () => {
        const dates = sortTrades(trades, 'date', 'asc').map((t) =>
            t.openedAt.toISOString().slice(0, 10),
        );
        expect(dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    });

    it('sorts by instrument alphabetically', () => {
        expect(sortTrades(trades, 'instrument', 'asc').map((t) => t.instrument)).toEqual([
            'EUR/USD',
            'GBP/USD',
            'USD/JPY',
        ]);
    });

    it('puts unvalued trades last in BOTH directions', () => {
        // An open trade has no result; ranking it as zero would place it in
        // the middle of the list as though it had broken even.
        const withOpen = [...trades, trade({ pnl: null, pips: null, closedAt: null })];
        expect(sortTrades(withOpen, 'pnl', 'desc').at(-1)?.pnl).toBeNull();
        expect(sortTrades(withOpen, 'pnl', 'asc').at(-1)?.pnl).toBeNull();
    });

    it('does not mutate the input', () => {
        const original = [...trades];
        sortTrades(trades, 'pnl', 'asc');
        expect(trades).toEqual(original);
    });
});

describe('journalStats', () => {
    it('is all zeroes for an empty journal', () => {
        const stats = journalStats([]);
        expect(stats).toMatchObject({ total: 0, closed: 0, winRate: 0, netPnl: 0, expectancy: 0 });
        expect(stats.best).toBeNull();
    });

    it('counts outcomes and nets the P&L', () => {
        const stats = journalStats([
            trade({ pnl: 200, pips: 20 }),
            trade({ pnl: -50, pips: -5 }),
            trade({ pnl: 0, pips: 0 }),
        ]);
        expect(stats).toMatchObject({
            closed: 3,
            wins: 1,
            losses: 1,
            breakeven: 1,
            netPnl: 150,
            totalPips: 15,
        });
    });

    it('computes the win rate over CLOSED trades only', () => {
        // An unresolved trade must not dilute the rate.
        const stats = journalStats([
            trade({ pnl: 100 }),
            trade({ pnl: -100 }),
            trade({ closedAt: null, pnl: null }),
        ]);
        expect(stats.open).toBe(1);
        expect(stats.closed).toBe(2);
        expect(stats.winRate).toBe(50);
    });

    it('excludes open trades from the net P&L', () => {
        const stats = journalStats([trade({ pnl: 100 }), trade({ closedAt: null, pnl: 999 })]);
        expect(stats.netPnl).toBe(100);
    });

    it('averages wins and losses separately', () => {
        const stats = journalStats([
            trade({ pnl: 300 }),
            trade({ pnl: 100 }),
            trade({ pnl: -50 }),
        ]);
        expect(stats.averageWin).toBe(200);
        expect(stats.averageLoss).toBe(50);
    });

    it('computes the profit factor', () => {
        const stats = journalStats([trade({ pnl: 300 }), trade({ pnl: -100 })]);
        expect(stats.profitFactor).toBe(3);
    });

    it('reports profit factor as null with no losses, not Infinity', () => {
        // A profit factor with nothing in the denominator is undefined, not a
        // very large number — and Infinity renders as garbage.
        expect(journalStats([trade({ pnl: 300 })]).profitFactor).toBeNull();
    });

    it('computes expectancy per closed trade', () => {
        const stats = journalStats([trade({ pnl: 300 }), trade({ pnl: -100 })]);
        expect(stats.expectancy).toBe(100);
    });

    it('identifies the best and worst closed trades', () => {
        const stats = journalStats([
            trade({ pnl: 300, instrument: 'EUR/USD' }),
            trade({ pnl: -100, instrument: 'GBP/USD' }),
            trade({ closedAt: null, pnl: null, instrument: 'USD/JPY' }),
        ]);
        expect(stats.best?.instrument).toBe('EUR/USD');
        expect(stats.worst?.instrument).toBe('GBP/USD');
    });
});

describe('tradesByDay', () => {
    it('groups by the UTC calendar day of entry', () => {
        const grouped = tradesByDay([
            trade({ openedAt: new Date('2026-08-03T08:00:00Z') }),
            trade({ openedAt: new Date('2026-08-03T20:00:00Z') }),
            trade({ openedAt: new Date('2026-08-04T09:00:00Z') }),
        ]);
        expect(grouped.get('2026-08-03')).toHaveLength(2);
        expect(grouped.get('2026-08-04')).toHaveLength(1);
    });
});

describe('monthCalendar', () => {
    it('pads to whole weeks starting on Monday', () => {
        // 2026-08-01 is a Saturday, so five leading blanks.
        const cells = monthCalendar(2026, 7, new Map());
        expect(cells.length % 7).toBe(0);
        expect(cells.slice(0, 5).every((cell) => cell === null)).toBe(true);
        expect(cells[5]?.day).toBe(1);
    });

    it('covers every day of the month', () => {
        const days = monthCalendar(2026, 7, new Map()).filter((cell) => cell !== null);
        expect(days).toHaveLength(31);
    });

    it('handles a February in a leap year', () => {
        const days = monthCalendar(2028, 1, new Map()).filter((cell) => cell !== null);
        expect(days).toHaveLength(29);
    });

    it('attaches trades and sums the day P&L', () => {
        const byDay = tradesByDay([
            trade({ openedAt: new Date('2026-08-03T08:00:00Z'), pnl: 100 }),
            trade({ openedAt: new Date('2026-08-03T15:00:00Z'), pnl: -30 }),
        ]);
        const cells = monthCalendar(2026, 7, byDay);
        const third = cells.find((cell) => cell?.day === 3);
        expect(third?.trades).toHaveLength(2);
        expect(third?.pnl).toBe(70);
    });
});
