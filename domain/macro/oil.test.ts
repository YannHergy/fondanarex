import { describe, expect, it } from 'vitest';

import { oilLevelScore, scoreOilLevel } from './oil';

describe('oilLevelScore', () => {
    it('walks every rung of the ladder', () => {
        expect(oilLevelScore(120)).toBe(10);
        expect(oilLevelScore(100)).toBe(10);
        expect(oilLevelScore(90)).toBe(6);
        expect(oilLevelScore(85)).toBe(6);
        expect(oilLevelScore(80)).toBe(3);
        expect(oilLevelScore(70)).toBe(3);
        expect(oilLevelScore(65)).toBe(0);
        expect(oilLevelScore(60)).toBe(0);
        expect(oilLevelScore(55)).toBe(-4);
        expect(oilLevelScore(50)).toBe(-4);
        expect(oilLevelScore(45)).toBe(-7);
        expect(oilLevelScore(40)).toBe(-7);
        expect(oilLevelScore(30)).toBe(-10);
    });
});

describe('scoreOilLevel', () => {
    it('keeps a flat barrel at its level — a month at $100 is not neutral', () => {
        // The whole reason this replaced the pure-change scorer: no move does
        // not mean no benefit when the level itself is excellent.
        expect(scoreOilLevel(100, 100)).toBe(10);
        expect(scoreOilLevel(80, 80)).toBe(3);
        expect(scoreOilLevel(45, 45)).toBe(-7);
    });

    it('lets the level outweigh the direction', () => {
        // Easing from a comfortable level stays positive...
        expect(scoreOilLevel(90, 98)).toBe(4); // 6 - 2, -8.2%
        // ...and rebounding from a painful one stays negative.
        expect(scoreOilLevel(45, 39)).toBe(-5); // -7 + 2, +15.4%
    });

    it('applies momentum only past a 5% move', () => {
        expect(scoreOilLevel(80, 77)).toBe(3); // +3.9%, under the threshold
        expect(scoreOilLevel(80, 75)).toBe(5); // +6.7%, over it
        expect(scoreOilLevel(80, 85)).toBe(1); // -5.9%, over it
    });

    it('clamps at the boundaries', () => {
        expect(scoreOilLevel(130, 100)).toBe(10); // 10 + 2 clamped
        expect(scoreOilLevel(30, 40)).toBe(-10); // -10 - 2 clamped
    });

    it('reports no momentum rather than Infinity on an unusable previous price', () => {
        expect(scoreOilLevel(80, 0)).toBe(3);
        expect(scoreOilLevel(80, -5)).toBe(3);
    });
});
