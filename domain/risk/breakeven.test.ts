import { describe, expect, it } from 'vitest';

import { simulateBreakeven, splitResultAt, type BreakevenInputs } from './breakeven';

const base: BreakevenInputs = {
    capital: 25_000,
    riskPct: 0.5,
    winRatePct: 55,
    rrSingle: 5,
    rrEntry1: 5,
    rrEntry2: 7,
    riskSplitPct: 60,
    totalTrades: 100,
};

describe('simulateBreakeven', () => {
    it('splits the risk between the two entries', () => {
        const result = simulateBreakeven(base);
        expect(result.riskAmount).toBeCloseTo(125);
        expect(result.riskEntry1).toBeCloseTo(75);
        expect(result.riskEntry2).toBeCloseTo(50);
        expect(result.riskEntry1 + result.riskEntry2).toBeCloseTo(result.riskAmount);
    });

    it('samples the full frequency range', () => {
        const result = simulateBreakeven(base);
        expect(result.points[0]?.frequency).toBe(0);
        expect(result.points.at(-1)?.frequency).toBe(100);
    });

    it('holds the single-entry result flat across frequencies', () => {
        // The second entry's frequency cannot affect an approach that never
        // takes it — so the comparison is entirely about where B crosses A.
        const result = simulateBreakeven(base);
        const values = new Set(result.points.map(p => p.single.toFixed(6)));
        expect(values.size).toBe(1);
    });

    it('improves the split result as the second entry appears more often', () => {
        // Only true because entry 2 has the better reward-to-risk here.
        const result = simulateBreakeven(base);
        const atZero = result.points[0]!.split;
        const atFull = result.points.at(-1)!.split;
        expect(atFull).toBeGreaterThan(atZero);
    });

    it('finds the crossing frequency', () => {
        const result = simulateBreakeven(base);
        expect(result.breakevenFrequency).not.toBeNull();

        const below = splitResultAt(base, Math.max(0, result.breakevenFrequency! - 20));
        const above = splitResultAt(base, Math.min(100, result.breakevenFrequency! + 20));
        const single = result.points[0]!.single;

        // Below the crossing the single entry wins; above it the split does.
        expect(below).toBeLessThan(single);
        expect(above).toBeGreaterThan(single);
    });

    it('reports no crossing when one approach dominates throughout', () => {
        // A second entry with a far worse target can never catch up.
        const dominated = simulateBreakeven({ ...base, rrEntry1: 1, rrEntry2: 1, rrSingle: 20 });
        expect(dominated.breakevenFrequency).toBeNull();
    });

    it('matches splitResultAt at the sampled frequencies', () => {
        const result = simulateBreakeven(base);
        const point = result.points.find(p => p.frequency === 60);
        expect(point?.split).toBeCloseTo(splitResultAt(base, 60), 6);
    });

    it('reduces to entry 1 alone at zero frequency', () => {
        const result = simulateBreakeven(base);
        const wr = base.winRatePct / 100;
        const riskEntry1 = base.capital * (base.riskPct / 100) * (base.riskSplitPct / 100);
        const expected =
            base.totalTrades * (wr * riskEntry1 * base.rrEntry1 - (1 - wr) * riskEntry1);
        expect(result.points[0]?.split).toBeCloseTo(expected, 6);
    });

    it('clamps an out-of-range win rate', () => {
        expect(() => simulateBreakeven({ ...base, winRatePct: 150 })).not.toThrow();
        expect(() => simulateBreakeven({ ...base, winRatePct: -10 })).not.toThrow();
    });
});
