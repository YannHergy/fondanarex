import { describe, expect, it } from 'vitest';

import { CORR_PAIRS, getCorrelation } from '../data/correlations';
import {
    adjustedRiskPct,
    analyzeConflicts,
    maxEffectiveCorrelation,
    type PlannedTrade,
} from './conflicts';

const trade = (id: string, pair: string, direction: 'buy' | 'sell'): PlannedTrade => ({
    id,
    pair,
    direction,
});

describe('getCorrelation', () => {
    it('is symmetric', () => {
        expect(getCorrelation('EUR/USD', 'GBP/USD')).toBe(85);
        expect(getCorrelation('GBP/USD', 'EUR/USD')).toBe(85);
    });

    it('is 100 against itself', () => {
        expect(getCorrelation('EUR/USD', 'EUR/USD')).toBe(100);
    });

    it('returns 0 for an unmeasured combination', () => {
        expect(getCorrelation('EUR/USD', 'XXX/YYY')).toBe(0);
    });

    it('keeps negative correlations negative', () => {
        // The pound is base in one and quote in the other, so they diverge.
        expect(getCorrelation('GBP/USD', 'EUR/GBP')).toBe(-40);
    });

    it('covers every listed pair against itself', () => {
        for (const pair of CORR_PAIRS) expect(getCorrelation(pair, pair)).toBe(100);
    });
});

describe('analyzeConflicts', () => {
    it('returns nothing for fewer than two trades', () => {
        expect(analyzeConflicts([])).toEqual([]);
        expect(analyzeConflicts([trade('1', 'EUR/USD', 'buy')])).toEqual([]);
    });

    it('flags two highly correlated trades in the same direction as one trade', () => {
        const [conflict] = analyzeConflicts([
            trade('1', 'AUD/USD', 'buy'),
            trade('2', 'NZD/USD', 'buy'),
        ]);
        expect(conflict?.level).toBe('CONFLIT');
        expect(conflict?.effectiveCorrelation).toBe(90);
    });

    it('treats the same pairs in opposite directions as neutralising', () => {
        // +90% correlation taken opposite ways cancels out — the sign of the
        // effective correlation is what matters, not its magnitude.
        const [conflict] = analyzeConflicts([
            trade('1', 'AUD/USD', 'buy'),
            trade('2', 'NZD/USD', 'sell'),
        ]);
        expect(conflict?.level).toBe('NEUTRALISE');
        expect(conflict?.effectiveCorrelation).toBe(-90);
    });

    it('warns about double exposure between 60 and 75', () => {
        const [conflict] = analyzeConflicts([
            trade('1', 'EUR/USD', 'buy'),
            trade('2', 'AUD/USD', 'buy'),
        ]);
        expect(conflict?.level).toBe('DOUBLE');
    });

    it('passes independent trades', () => {
        const [conflict] = analyzeConflicts([
            trade('1', 'EUR/GBP', 'buy'),
            trade('2', 'AUD/USD', 'buy'),
        ]);
        expect(conflict?.level).toBe('OK');
    });

    it('turns a negative correlation into reinforcement when directions oppose', () => {
        // GBP/USD and EUR/GBP correlate -40. Taking them opposite ways makes
        // the effective correlation +40, i.e. they reinforce.
        const [conflict] = analyzeConflicts([
            trade('1', 'GBP/USD', 'buy'),
            trade('2', 'EUR/GBP', 'sell'),
        ]);
        expect(conflict?.effectiveCorrelation).toBe(40);
        expect(conflict?.level).toBe('OK');
    });

    it('compares every pair of trades', () => {
        const conflicts = analyzeConflicts([
            trade('1', 'EUR/USD', 'buy'),
            trade('2', 'GBP/USD', 'buy'),
            trade('3', 'AUD/USD', 'buy'),
        ]);
        expect(conflicts).toHaveLength(3);
    });

    it('sorts the worst conflict first', () => {
        const conflicts = analyzeConflicts([
            trade('1', 'EUR/GBP', 'buy'),
            trade('2', 'NZD/JPY', 'buy'),
            trade('3', 'AUD/USD', 'buy'),
            trade('4', 'NZD/USD', 'buy'),
        ]);
        expect(conflicts[0]?.level).toBe('CONFLIT');
    });
});

describe('adjustedRiskPct', () => {
    it('drops to zero at an outright conflict', () => {
        // The answer to "same trade twice" is to drop one, not size both down.
        expect(adjustedRiskPct(90)).toBe(0);
    });

    it('scales down as correlated exposure rises', () => {
        expect(adjustedRiskPct(0)).toBe(0.4);
        expect(adjustedRiskPct(25)).toBe(0.3);
        expect(adjustedRiskPct(45)).toBe(0.2);
        expect(adjustedRiskPct(65)).toBe(0.1);
    });

    it('is monotonic', () => {
        const values = [0, 20, 40, 60, 75].map(adjustedRiskPct);
        for (let i = 1; i < values.length; i += 1) {
            expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
        }
    });
});

describe('maxEffectiveCorrelation', () => {
    it('is zero with no conflicts', () => {
        expect(maxEffectiveCorrelation([])).toBe(0);
    });

    it('picks the binding constraint across the set', () => {
        const conflicts = analyzeConflicts([
            trade('1', 'EUR/GBP', 'buy'),
            trade('2', 'AUD/USD', 'buy'),
            trade('3', 'NZD/USD', 'buy'),
        ]);
        expect(maxEffectiveCorrelation(conflicts)).toBe(90);
    });
});
