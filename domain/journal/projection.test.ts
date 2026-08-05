import { describe, expect, it } from 'vitest';

import {
    bestSize,
    dateAfterTrades,
    formatProjectedDate,
    MIN_TRADES_PER_LEVER,
    projectAccount,
    recommend,
    sweepSize,
    type ProjectionInput,
} from './projection';

/** A profitable edge in account currency: loses 50 twice, wins 150 once. */
const EDGE = [-50, -50, 150, -50, -50, 150, -50, 125, -50, 150];

function input(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
    return {
        results: EDGE,
        capital: 5000,
        sizeMultiplier: 1,
        tradesPerWeek: 1.36,
        targetPct: 8,
        maxLossPct: 10,
        ...overrides,
    };
}

describe('projectAccount', () => {
    it('is deterministic — the same inputs always project identically', () => {
        // Seeded, not Math.random. A projection that moved on every run could
        // not be quoted to the user, compared against a previous one, or
        // asserted here.
        expect(projectAccount(input())).toEqual(projectAccount(input()));
    });

    it('resolves nearly every run into pass or fail', () => {
        const result = projectAccount(input());

        expect(result.passRate + result.failRate + result.unresolvedRate).toBe(100);
        expect(result.passRate).toBeGreaterThan(0);
        expect(result.failRate).toBeGreaterThan(0);
    });

    it('passes almost always when the edge is large and the limit far', () => {
        const result = projectAccount(input({ results: [100, 150, 200], maxLossPct: 50 }));

        expect(result.passRate).toBeGreaterThan(95);
    });

    it('fails almost always when every trade loses', () => {
        const result = projectAccount(input({ results: [-50] }));

        expect(result.failRate).toBe(100);
        expect(result.medianTradesToTarget).toBeNull();
        expect(result.medianMonthsToTarget).toBeNull();
    });

    it('closes the account on the limit even when the target was within reach', () => {
        // A single draw of −600 against a 500 limit: the loss lands beyond
        // it, so the run must be a failure whatever would have followed.
        const result = projectAccount(input({ results: [-600] }));

        expect(result.failRate).toBe(100);
        expect(result.passRate).toBe(0);
    });

    it('converts the trade count into weeks and months at the given pace', () => {
        const result = projectAccount(input({ tradesPerWeek: 2 }));

        expect(result.medianTradesToTarget).not.toBeNull();
        expect(result.medianWeeksToTarget).toBeCloseTo(result.medianTradesToTarget! / 2, 1);
        expect(result.medianMonthsToTarget).toBeCloseTo(result.medianWeeksToTarget! / 4.345, 1);
    });

    it('halves the time when the pace doubles, without touching the odds', () => {
        const slow = projectAccount(input({ tradesPerWeek: 1 }));
        const fast = projectAccount(input({ tradesPerWeek: 2 }));

        // Pace changes the calendar, never the sequence of trades — so the
        // odds and the trade count must be identical, and only the duration
        // move. Asserted on the trade count rather than the months, which are
        // rounded to one decimal and cannot halve exactly.
        expect(fast.passRate).toBe(slow.passRate);
        expect(fast.medianTradesToTarget).toBe(slow.medianTradesToTarget);
        expect(fast.medianWeeksToTarget!).toBeLessThan(slow.medianWeeksToTarget!);
        expect(slow.medianMonthsToTarget! / fast.medianMonthsToTarget!).toBeCloseTo(2, 0);
    });

    it('raises both the speed and the chance of ruin when positions grow', () => {
        const small = projectAccount(input({ sizeMultiplier: 0.5 }));
        const large = projectAccount(input({ sizeMultiplier: 4 }));

        expect(large.medianTradesToTarget!).toBeLessThan(small.medianTradesToTarget!);
        expect(large.failRate).toBeGreaterThan(small.failRate);
    });

    it('returns percentile bands and sample paths of matching length', () => {
        const result = projectAccount(input({ horizonTrades: 50 }));

        expect(result.bands.mid).toHaveLength(51);
        expect(result.bands.low.length).toBe(result.bands.high.length);
        // Bands must not cross.
        result.bands.mid.forEach((mid, index) => {
            expect(result.bands.low[index]!).toBeLessThanOrEqual(mid);
            expect(mid).toBeLessThanOrEqual(result.bands.high[index]!);
        });

        expect(result.paths).toHaveLength(60);
        for (const path of result.paths) expect(path).toHaveLength(51);
    });

    it('returns an empty result rather than dividing by zero', () => {
        expect(projectAccount(input({ results: [] })).iterations).toBe(0);
        expect(projectAccount(input({ sizeMultiplier: 0 })).iterations).toBe(0);
        expect(projectAccount(input({ maxLossPct: 0 })).iterations).toBe(0);
    });
});

describe('sweepSize', () => {
    const points = sweepSize({
        results: EDGE,
        capital: 5000,
        tradesPerWeek: 1.36,
        targetPct: 8,
        maxLossPct: 10,
    });

    it('covers every level asked for', () => {
        expect(points).toHaveLength(10);
        expect(points[0]!.sizeMultiplier).toBe(0.25);
    });

    it('shows the trade-off: bigger positions ruin more often', () => {
        expect(points.at(-1)!.failRate).toBeGreaterThan(points[0]!.failRate);
    });

    it('finds an optimum rather than simply the largest position', () => {
        const best = bestSize(points)!;

        // The whole reason the sweep exists: trading bigger shortens the path
        // AND raises the chance of being closed out first, so the best odds
        // cannot be reasoned to — they have to be searched.
        expect(best.sizeMultiplier).toBeGreaterThan(0);
        expect(best.passRate).toBeGreaterThanOrEqual(Math.max(...points.map((p) => p.passRate)));
    });

    it('prefers the smaller position when the odds tie', () => {
        const tie = [
            { sizeMultiplier: 1, passRate: 80, failRate: 5, monthsToTarget: 9, p95MaxDrawdown: 100 },
            { sizeMultiplier: 3, passRate: 80, failRate: 5, monthsToTarget: 3, p95MaxDrawdown: 400 },
        ];

        expect(bestSize(tie)?.sizeMultiplier).toBe(1);
    });

    it('is null on an empty sweep', () => {
        expect(bestSize([])).toBeNull();
    });
});

describe('recommend', () => {
    const base = input();

    it('ranks arithmetic levers ahead of observed ones', () => {
        const out = recommend(base, {
            segments: [{ key: 'EUR/USD', trades: 7, meanNet: 60 }],
        });

        const firstObserved = out.findIndex((r) => r.evidence === 'observed');
        const lastArithmetic = out.map((r) => r.evidence).lastIndexOf('arithmetic');

        // Buying speed with a bigger position is certain to work; buying it
        // with an assumption about the market is not.
        expect(lastArithmetic).toBeLessThan(firstObserved);
    });

    it('refuses a segment below the sample gate, and says so', () => {
        const out = recommend(base, {
            segments: [{ key: 'EUR/GBP', trades: 1, meanNet: 90 }],
        });

        const refused = out.find((r) => r.id === 'segment-EUR/GBP')!;
        expect(refused.evidence).toBe('insufficient');
        expect(refused.monthsToTarget).toBeNull();
        expect(refused.detail).toContain(String(MIN_TRADES_PER_LEVER));
        // Reported rather than dropped: the user must see what was considered.
        expect(refused.label).toContain('EUR/GBP');
    });

    it('ignores a losing segment entirely', () => {
        const out = recommend(base, {
            segments: [{ key: 'GBP/CAD', trades: 8, meanNet: -25 }],
        });

        expect(out.some((r) => r.id === 'segment-GBP/CAD')).toBe(false);
    });

    it('drops options that are too slow or too likely to blow the account', () => {
        const strict = recommend(base, { maxMonths: 1, maxFailRate: 1 });
        const loose = recommend(base, { maxMonths: 48, maxFailRate: 90 });

        expect(strict.length).toBeLessThan(loose.length);
        for (const entry of loose) {
            if (entry.evidence !== 'arithmetic') continue;
            expect(entry.failRate).toBeLessThanOrEqual(90);
        }
    });

    it('never proposes leaving everything unchanged', () => {
        const out = recommend(base, {});
        expect(out.some((r) => r.id === `size-1-pace-${base.tradesPerWeek}`)).toBe(false);
    });

    it('carries the sample size on every observed lever', () => {
        const out = recommend(base, {
            segments: [{ key: 'EUR/USD', trades: 7, meanNet: 60 }],
        });

        const observed = out.find((r) => r.evidence === 'observed')!;
        expect(observed.sampleSize).toBe(7);
        // Arithmetic levers rest on no observation at all, and say null rather
        // than borrowing the journal's size.
        expect(out.find((r) => r.evidence === 'arithmetic')!.sampleSize).toBeNull();
    });
});

describe('dateAfterTrades', () => {
    const START = new Date('2026-08-05T00:00:00Z');

    it('places a trade on the calendar at the given pace', () => {
        // 10 trades at 2 per week is 5 weeks, so 35 days.
        expect(dateAfterTrades(START, 10, 2)).toEqual(new Date('2026-09-09T00:00:00Z'));
    });

    it('keeps fractional weeks rather than rounding', () => {
        // 1.36/week is the real observed pace. 99 trades is 72.8 weeks — a
        // little over 509 days — landing in December 2027. Rounding the pace to
        // 1 or 2 would move that by months, which is the scale being read.
        const at = dateAfterTrades(START, 99, 1.36);

        expect(at.getUTCFullYear()).toBe(2027);
        expect(at.getUTCMonth()).toBe(11);

        expect(dateAfterTrades(START, 99, 1).getUTCFullYear()).toBe(2028);
    });

    it('returns the start date rather than an invalid one on a zero pace', () => {
        expect(dateAfterTrades(START, 10, 0)).toEqual(START);
        expect(dateAfterTrades(START, Number.NaN, 2)).toEqual(START);
    });
});

describe('formatProjectedDate', () => {
    const DATE = new Date('2027-03-12T00:00:00Z');

    it('drops to the month on a long projection', () => {
        // Naming a day two years out claims an accuracy the model does not have.
        expect(formatProjectedDate(DATE, 400)).toBe('mars 2027');
    });

    it('keeps the day on a short one', () => {
        expect(formatProjectedDate(DATE, 20)).toMatch(/12 mars/);
    });

    it('keeps the year in between', () => {
        expect(formatProjectedDate(DATE, 90)).toMatch(/2027/);
    });
});
