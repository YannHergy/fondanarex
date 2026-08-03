import { describe, expect, it } from 'vitest';

import { dispersionReading, marketState, stateLabel, type ScoredCode } from './market-state';

function board(overrides: Record<string, number> = {}): ScoredCode[] {
    const base: Record<string, number> = {
        USD: 50, EUR: 50, GBP: 50, JPY: 50, CHF: 50, AUD: 50, NZD: 50, CAD: 50,
    };
    return Object.entries({ ...base, ...overrides }).map(([code, score]) => ({ code, score }));
}

describe('marketState', () => {
    it('calls risk-off when safe havens outscore the pro-cyclicals', () => {
        const result = marketState(board({ JPY: 75, CHF: 70, AUD: 35, NZD: 30 }));
        expect(result.state).toBe('risk-off');
        expect(result.spread).toBeGreaterThan(0);
    });

    it('calls risk-on when the pro-cyclicals lead', () => {
        expect(marketState(board({ JPY: 30, CHF: 35, AUD: 75, NZD: 70 })).state).toBe('risk-on');
    });

    it('is neutral when the two baskets are close', () => {
        // Below the threshold the difference is noise, and reading a regime out
        // of it would be inventing one.
        expect(marketState(board({ JPY: 54, CHF: 52, AUD: 50, NZD: 48 })).state).toBe('neutral');
    });

    it('needs to clear the threshold, not merely differ', () => {
        expect(marketState(board({ JPY: 58, CHF: 58, AUD: 50, NZD: 50 })).state).toBe('neutral');
        expect(marketState(board({ JPY: 59, CHF: 59, AUD: 50, NZD: 50 })).state).toBe('risk-off');
    });

    it('ranks strongest and weakest', () => {
        const result = marketState(board({ USD: 80, EUR: 72, GBP: 65, JPY: 20, CHF: 25, AUD: 30 }));
        expect(result.strongest.map((c) => c.code)).toEqual(['USD', 'EUR', 'GBP']);
        expect(result.weakest[0]!.code).toBe('JPY');
    });

    it('measures dispersion across the board', () => {
        expect(marketState(board({ USD: 85, JPY: 15 })).dispersion).toBe('high');
        expect(marketState(board({ USD: 65, JPY: 35 })).dispersion).toBe('medium');
        expect(marketState(board({ USD: 55, JPY: 45 })).dispersion).toBe('low');
    });

    it('treats a missing currency as neutral rather than zero', () => {
        // Scoring an absent currency 0 would fabricate an extreme regime.
        const result = marketState([{ code: 'USD', score: 50 }]);
        expect(result.safeHavenAvg).toBe(50);
        expect(result.state).toBe('neutral');
    });

    it('handles an empty board without throwing', () => {
        const result = marketState([]);
        expect(result.range).toBe(0);
        expect(result.strongest).toEqual([]);
    });

    it('labels every state and explains every dispersion', () => {
        for (const state of ['risk-on', 'risk-off', 'neutral'] as const) {
            expect(stateLabel(state).length).toBeGreaterThan(0);
        }
        for (const dispersion of ['high', 'medium', 'low'] as const) {
            expect(dispersionReading(dispersion).length).toBeGreaterThan(20);
        }
    });
});
