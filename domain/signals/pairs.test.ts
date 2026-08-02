import { describe, expect, it } from 'vitest';

import {
    PAIRS,
    buildPairSignals,
    computeConviction,
    computeRecommendation,
    directionOf,
} from './pairs';

const EIGHT = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];

describe('computeConviction', () => {
    it('scales with the size of the gap', () => {
        expect(computeConviction(0)).toBe(1);
        expect(computeConviction(5)).toBe(1);
        expect(computeConviction(5.1)).toBe(2);
        expect(computeConviction(10.1)).toBe(3);
        expect(computeConviction(20.1)).toBe(4);
        expect(computeConviction(30.1)).toBe(5);
    });

    it('treats the thresholds as exclusive, matching the legacy screen', () => {
        expect(computeConviction(10)).toBe(2);
        expect(computeConviction(20)).toBe(3);
        expect(computeConviction(30)).toBe(4);
    });
});

describe('directionOf', () => {
    it('needs more than 5 points to call a direction', () => {
        expect(directionOf(5)).toBe('neutral');
        expect(directionOf(5.1)).toBe('buy');
        expect(directionOf(-5)).toBe('neutral');
        expect(directionOf(-5.1)).toBe('sell');
    });
});

describe('computeRecommendation', () => {
    it('is neutral whenever conviction is lowest, however the gap looks', () => {
        expect(computeRecommendation(4, 1, false)).toBe('NEUTRE');
        expect(computeRecommendation(-4, 1, false)).toBe('NEUTRE');
    });

    it('buys a positive gap and sells a negative one', () => {
        expect(computeRecommendation(12, 3, false)).toBe('ACHETEUR');
        expect(computeRecommendation(-12, 3, false)).toBe('VENDEUR');
    });

    it('waits on a marginal edge into a high-impact release', () => {
        expect(computeRecommendation(6, 2, true)).toBe('ATTENDRE');
    });

    it('still trades a strong signal into news', () => {
        // The edge is large enough to be worth the event risk.
        expect(computeRecommendation(25, 4, true)).toBe('ACHETEUR');
    });
});

describe('buildPairSignals', () => {
    const flat = Object.fromEntries(EIGHT.map(c => [c, 50]));

    it('produces one signal per defined pair', () => {
        expect(buildPairSignals(flat)).toHaveLength(PAIRS.length);
    });

    it('computes the gap as base minus quote', () => {
        const signals = buildPairSignals({ ...flat, EUR: 80, USD: 40 });
        const eurusd = signals.find(s => s.pair === 'EUR/USD');
        expect(eurusd?.diff).toBe(40);
        expect(eurusd?.direction).toBe('buy');
        expect(eurusd?.conviction).toBe(5);
        expect(eurusd?.recommendation).toBe('ACHETEUR');
    });

    it('reverses correctly when the quote is the stronger leg', () => {
        const signals = buildPairSignals({ ...flat, USD: 85, JPY: 30 });
        const usdjpy = signals.find(s => s.pair === 'USD/JPY');
        expect(usdjpy?.diff).toBe(55);
        expect(usdjpy?.recommendation).toBe('ACHETEUR');

        const audjpy = signals.find(s => s.pair === 'AUD/JPY');
        expect(audjpy?.diff).toBe(20); // 50 - 30
    });

    it('gives two equally strong currencies no signal at all', () => {
        // Both at 90: high scores, but nothing to trade between them.
        const signals = buildPairSignals({ ...flat, EUR: 90, USD: 90 });
        const eurusd = signals.find(s => s.pair === 'EUR/USD');
        expect(eurusd?.diff).toBe(0);
        expect(eurusd?.recommendation).toBe('NEUTRE');
    });

    it('omits a pair whose leg has no score rather than treating it as zero', () => {
        const partial = { ...flat };
        delete (partial as Record<string, number>).CHF;
        const signals = buildPairSignals(partial);
        expect(signals.some(s => s.base === 'CHF' || s.quote === 'CHF')).toBe(false);
    });

    it('flags news when either leg has an upcoming release', () => {
        const signals = buildPairSignals(flat, { pairsWithNews: new Set(['JPY']) });
        expect(signals.find(s => s.pair === 'USD/JPY')?.hasUpcomingNews).toBe(true);
        expect(signals.find(s => s.pair === 'EUR/GBP')?.hasUpcomingNews).toBe(false);
    });

    it('sorts strongest conviction first', () => {
        const signals = buildPairSignals({ ...flat, EUR: 95, USD: 20, GBP: 55 });
        const convictions = signals.map(s => s.conviction);
        expect(convictions).toEqual([...convictions].sort((a, b) => b - a));
    });
});

describe('PAIRS table', () => {
    it('contains no duplicates', () => {
        const keys = PAIRS.map(p => `${p.base}/${p.quote}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('never pairs a currency with itself', () => {
        expect(PAIRS.every(p => p.base !== p.quote)).toBe(true);
    });

    it('only references tracked currencies', () => {
        for (const p of PAIRS) {
            expect(EIGHT).toContain(p.base);
            expect(EIGHT).toContain(p.quote);
        }
    });
});
