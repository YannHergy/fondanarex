import { describe, expect, it } from 'vitest';

import {
    equityCurve,
    granularityFor,
    maxDrawdown,
    periodTotals,
    pickGranularity,
    type ResolvedTrade,
} from './equity';

function trade(closedAt: string | null, pnl: number | null): ResolvedTrade {
    return { closedAt: closedAt === null ? null : new Date(closedAt), pnl };
}

describe('pickGranularity', () => {
    it('cuts a long history by month', () => {
        expect(pickGranularity(365, 200)).toBe('month');
        // The imported FundedNext history: 18 Feb -> 3 Jul, 26 trades.
        expect(pickGranularity(135, 26)).toBe('month');
    });

    it('cuts a mid-length history by week', () => {
        expect(pickGranularity(60, 40)).toBe('week');
    });

    it('cuts a short history by day', () => {
        expect(pickGranularity(10, 30)).toBe('day');
        expect(pickGranularity(21, 5)).toBe('day');
    });

    it('steps finer, never coarser, when trades are sparse', () => {
        // Two months but only four trades: weekly buckets would be mostly empty.
        expect(pickGranularity(60, 4)).toBe('day');
        // A long span stays monthly however sparse — daily labels would smear.
        expect(pickGranularity(400, 3)).toBe('month');
    });
});

describe('granularityFor', () => {
    it('reads the span off the trades themselves', () => {
        expect(
            granularityFor([trade('2026-02-18T00:00:00Z', 10), trade('2026-07-03T00:00:00Z', -5)]),
        ).toBe('month');
    });

    it('falls back to month when nothing is closed', () => {
        expect(granularityFor([])).toBe('month');
        expect(granularityFor([trade(null, null)])).toBe('month');
    });
});

describe('equityCurve', () => {
    it('opens on the starting balance before the first result', () => {
        const points = equityCurve([trade('2026-03-02T12:00:00Z', -100)], 5000);

        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({ balance: 5000, cumulative: 0 });
        // Dated a day earlier, so a first losing trade still shows as a drop
        // rather than opening the chart at its own low.
        expect(points[0]?.at).toEqual(new Date('2026-03-01T12:00:00Z'));
        expect(points[1]).toMatchObject({ balance: 4900, cumulative: -100 });
    });

    it('accumulates in close order regardless of input order', () => {
        const points = equityCurve(
            [
                trade('2026-03-10T00:00:00Z', 50),
                trade('2026-03-01T00:00:00Z', 200),
                trade('2026-03-05T00:00:00Z', -30),
            ],
            1000,
        );

        expect(points.map((point) => point.balance)).toEqual([1000, 1200, 1170, 1220]);
    });

    it('ignores open trades and trades with no result', () => {
        const points = equityCurve(
            [trade('2026-03-01T00:00:00Z', 100), trade(null, null), trade('2026-03-02T00:00:00Z', null)],
            0,
        );

        expect(points).toHaveLength(2);
        expect(points.at(-1)?.cumulative).toBe(100);
    });

    it('returns nothing when there is nothing to plot', () => {
        expect(equityCurve([], 5000)).toEqual([]);
    });
});

describe('periodTotals', () => {
    // The six monthly figures the imported history produces.
    const history: ResolvedTrade[] = [
        trade('2026-02-18T18:25:29Z', -2.21),
        trade('2026-02-27T10:05:55Z', -10.5),
        trade('2026-03-02T00:18:16Z', 102.48),
        trade('2026-03-23T00:29:46Z', -34.35),
    ];

    it('sums by month, oldest first', () => {
        expect(periodTotals(history, 'month')).toEqual([
            expect.objectContaining({ key: '2026-02', label: 'Févr', net: -12.71, trades: 2 }),
            expect.objectContaining({ key: '2026-03', label: 'Mars', net: 68.13, trades: 2 }),
        ]);
    });

    it('starts weeks on Monday', () => {
        // 2026-03-01 is a Sunday, so it belongs to the week opening 23 February.
        const totals = periodTotals([trade('2026-03-01T10:00:00Z', 5)], 'week');

        expect(totals[0]?.key).toBe('2026-02-23');
        expect(totals[0]?.start.getUTCDay()).toBe(1);
    });

    it('buckets by day when asked', () => {
        const totals = periodTotals(
            [trade('2026-03-02T01:00:00Z', 10), trade('2026-03-02T23:00:00Z', 5)],
            'day',
        );

        expect(totals).toHaveLength(1);
        expect(totals[0]).toMatchObject({ key: '2026-03-02', net: 15, trades: 2 });
    });

    it('omits periods with no activity rather than padding zeros', () => {
        const totals = periodTotals(
            [trade('2026-02-10T00:00:00Z', 10), trade('2026-05-10T00:00:00Z', 20)],
            'month',
        );

        // A zero-filled March and April would read as flat performance, which
        // is not the same as having placed no trade.
        expect(totals.map((total) => total.key)).toEqual(['2026-02', '2026-05']);
    });

    it('is empty when nothing is closed', () => {
        expect(periodTotals([], 'month')).toEqual([]);
    });
});

describe('maxDrawdown', () => {
    it('measures the largest fall from a previous peak', () => {
        const points = equityCurve(
            [
                trade('2026-03-01T00:00:00Z', 200),
                trade('2026-03-02T00:00:00Z', -150),
                trade('2026-03-03T00:00:00Z', -50),
                trade('2026-03-04T00:00:00Z', 300),
            ],
            1000,
        );

        // Peak 1200, trough 1000 -> 200. The later recovery does not reduce it.
        expect(maxDrawdown(points)).toBe(200);
    });

    it('is zero for a curve that only rises', () => {
        const points = equityCurve(
            [trade('2026-03-01T00:00:00Z', 10), trade('2026-03-02T00:00:00Z', 20)],
            100,
        );

        expect(maxDrawdown(points)).toBe(0);
    });

    it('is zero for an empty curve', () => {
        expect(maxDrawdown([])).toBe(0);
    });
});
