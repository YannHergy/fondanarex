import { describe, expect, it } from 'vitest';

import { buildPairInsightPrompt, type PairInsightSubject } from './pair-insight-prompt';

function subject(overrides: Partial<PairInsightSubject> = {}): PairInsightSubject {
    return {
        code: 'EUR',
        category: 'Risk-On',
        gdpQoQ: 0.3,
        cpi: 2.1,
        unemployment: 6.2,
        wagePPI: 3.1,
        stance: 'Neutral',
        interestRate: 2.25,
        pmiManufacturing: 49.5,
        pmiServices: 51.2,
        ...overrides,
    };
}

describe('buildPairInsightPrompt', () => {
    it('names the leading currency when the score favours the base', () => {
        const prompt = buildPairInsightPrompt(subject({ code: 'EUR' }), subject({ code: 'USD' }), 65);
        expect(prompt).toContain('en faveur de EUR');
    });

    it('names the leading currency when the score favours the quote', () => {
        const prompt = buildPairInsightPrompt(subject({ code: 'EUR' }), subject({ code: 'USD' }), 35);
        expect(prompt).toContain('en faveur de USD');
    });

    it('includes both currencies\' figures', () => {
        const prompt = buildPairInsightPrompt(
            subject({ code: 'EUR', cpi: 2.8 }),
            subject({ code: 'USD', cpi: 3.5 }),
            50,
        );
        expect(prompt).toContain('EUR/USD');
        expect(prompt).toContain('2.8%');
        expect(prompt).toContain('3.5%');
    });
});
