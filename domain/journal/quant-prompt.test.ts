import { describe, expect, it } from 'vitest';

import { computeDeepStats, type StatTrade } from './deep-stats';
import { buildQuantPrompt, QUANT_SYSTEM, validateQuantVerdict } from './quant-prompt';

function trade(pnl: number, extra: Partial<StatTrade> = {}): StatTrade {
    return {
        direction: 'Buy',
        entryPrice: 1.1,
        exitPrice: pnl >= 0 ? 1.102 : 1.098,
        stopLoss: 1.098,
        takeProfit: 1.104,
        pips: pnl / 5,
        pnl,
        pipSize: 0.0001,
        ...extra,
    };
}

const STATS = computeDeepStats(
    Array.from({ length: 40 }, (_, index) => trade(index % 3 === 0 ? 180 : -55)),
);

describe('QUANT_SYSTEM', () => {
    it('forbids computing and forbids estimating a missing value', () => {
        expect(QUANT_SYSTEM).toMatch(/ne calcules JAMAIS/);
        expect(QUANT_SYSTEM).toMatch(/tu ne l'estimes pas/);
    });

    it('imposes concept before reading before advice', () => {
        // A number nobody understands cannot be acted on, so the explanation
        // has to come first and must not mention this trader.
        expect(QUANT_SYSTEM).toMatch(/SANS parler de ce\s+trader/);
        expect(QUANT_SYSTEM.indexOf('"concept"')).toBeLessThan(QUANT_SYSTEM.indexOf('"lecture"'));
        expect(QUANT_SYSTEM.indexOf('"lecture"')).toBeLessThan(QUANT_SYSTEM.indexOf('"conseil"'));
    });

    it('demands a sample-size caveat', () => {
        expect(QUANT_SYSTEM).toMatch(/PRUDENCE OBLIGATOIRE/);
    });
});

describe('buildQuantPrompt', () => {
    const prompt = buildQuantPrompt(STATS, 'toute la période');

    it('supplies every figure so none has to be derived', () => {
        expect(prompt).toContain('Espérance par trade');
        expect(prompt).toContain('SQN');
        expect(prompt).toContain('Ratio de Sharpe');
        expect(prompt).toContain('Ratio de Sortino');
        expect(prompt).toContain('VaR 95');
        expect(prompt).toContain('CVaR 99');
        expect(prompt).toContain('Autocorrélation'.toUpperCase());
    });

    it('carries the conventional SQN thresholds rather than letting the model invent them', () => {
        expect(prompt).toMatch(/sous 1,5/);
        expect(prompt).toMatch(/au-dessus de 2,5/);
    });

    it('states plainly that this is not MAE/MFE and why', () => {
        // The report has no tick data, so real excursion analysis is impossible.
        // Letting the model call it MAE/MFE would misrepresent the measure.
        expect(prompt).toMatch(/PAS le MAE\/MFE classique/);
        expect(prompt).toMatch(/ticks/);
    });

    it('explains what reshuffling can and cannot test', () => {
        expect(prompt).toMatch(/ne teste pas\s+l'avantage, elle teste le CHEMIN/);
    });

    it('gives the base rates the autocorrelation must be judged against', () => {
        expect(prompt).toContain('Taux de perte de référence');
    });

    it('prints "non disponible" instead of null for a missing measure', () => {
        const thin = computeDeepStats([trade(50)]);
        const text = buildQuantPrompt(thin, 'test');

        expect(text).toContain('non disponible');
        expect(text).not.toContain('null');
    });

    it('names the period so the model does not describe the wrong window', () => {
        expect(prompt).toContain('Période : toute la période');
    });
});

describe('validateQuantVerdict', () => {
    const valid = {
        synthese: 'Un système à faible taux de réussite mais fort ratio.',
        blocs: [{ mesure: 'SQN', concept: 'a', lecture: 'b', conseil: 'c' }],
        verdict_systeme: 'Viable sous réserve d’échantillon.',
    };

    it('accepts a complete verdict', () => {
        expect(validateQuantVerdict(valid)?.blocs).toHaveLength(1);
    });

    it('rejects a block missing one of the three required parts', () => {
        expect(
            validateQuantVerdict({ ...valid, blocs: [{ mesure: 'SQN', concept: 'a', lecture: 'b' }] }),
        ).toBeNull();
    });

    it('rejects a blank field, which renders as an empty card', () => {
        expect(
            validateQuantVerdict({
                ...valid,
                blocs: [{ mesure: 'SQN', concept: '  ', lecture: 'b', conseil: 'c' }],
            }),
        ).toBeNull();
    });

    it('rejects an empty block list and a non-object', () => {
        expect(validateQuantVerdict({ ...valid, blocs: [] })).toBeNull();
        expect(validateQuantVerdict(null)).toBeNull();
    });
});
