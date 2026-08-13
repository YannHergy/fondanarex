import { describe, expect, it } from 'vitest';

import {
    buildSetupAnalysisPrompt,
    pairCurrencies,
    releasesInWindow,
    type ReleaseForPrompt,
    type SetupForPrompt,
} from './setup-analysis';

const NOW = new Date('2026-08-10T00:00:00.000Z');

function release(overrides: Partial<ReleaseForPrompt> = {}): ReleaseForPrompt {
    return {
        currencyCode: 'USD',
        label: 'NFP',
        at: new Date('2026-08-12T12:30:00.000Z'),
        impact: 'high',
        previous: 150,
        ...overrides,
    };
}

function setup(overrides: Partial<SetupForPrompt> = {}): SetupForPrompt {
    return {
        instrument: 'EUR/USD',
        bias: 'Bullish',
        entryZone: '1.0850',
        tp: '1.0950',
        sl: '1.0800',
        notes: 'Cassure de range, retest de la zone.',
        horizonDays: 7,
        screenshotCount: 1,
        ...overrides,
    };
}

describe('pairCurrencies', () => {
    it('splits a pair, and rejects what is not one', () => {
        expect(pairCurrencies('EUR/USD')).toEqual(['EUR', 'USD']);
        expect(pairCurrencies('eur/usd')).toEqual(['EUR', 'USD']);
        expect(pairCurrencies('XAUUSD')).toEqual([]);
    });
});

describe('releasesInWindow', () => {
    it('keeps only the pair currencies inside the horizon', () => {
        const kept = releasesInWindow(
            [
                release({ currencyCode: 'USD', label: 'NFP' }),
                release({ currencyCode: 'EUR', label: 'CPI', at: new Date('2026-08-14T09:00:00.000Z') }),
                // Hors paire.
                release({ currencyCode: 'JPY', label: 'CPI Tokyo' }),
                // Au-delà de l'horizon de 7 jours.
                release({ currencyCode: 'USD', label: 'PIB', at: new Date('2026-08-25T12:30:00.000Z') }),
            ],
            'EUR/USD',
            7,
            NOW,
        );
        expect(kept.map(r => r.label)).toEqual(['NFP', 'CPI']);
    });

    it('drops releases already out — they are context, not conditions', () => {
        const kept = releasesInWindow(
            [release({ at: new Date('2026-08-08T12:30:00.000Z') })],
            'EUR/USD',
            7,
            NOW,
        );
        expect(kept).toEqual([]);
    });

    it('returns nothing for an instrument that is not a currency pair', () => {
        expect(releasesInWindow([release()], 'XAUUSD', 7, NOW)).toEqual([]);
    });

    it('orders by date, soonest first', () => {
        const kept = releasesInWindow(
            [
                release({ label: 'tard', at: new Date('2026-08-15T12:00:00.000Z') }),
                release({ label: 'tôt', at: new Date('2026-08-11T12:00:00.000Z') }),
            ],
            'EUR/USD',
            7,
            NOW,
        );
        expect(kept.map(r => r.label)).toEqual(['tôt', 'tard']);
    });
});

describe('buildSetupAnalysisPrompt', () => {
    it('carries the pair, the horizon, the typed levels and the calendar', () => {
        const prompt = buildSetupAnalysisPrompt(setup(), [release()], NOW);
        expect(prompt).toContain('EUR/USD');
        expect(prompt).toContain('Bullish');
        expect(prompt).toContain('7 jour(s)');
        expect(prompt).toContain("zone d'entrée 1.0850");
        expect(prompt).toContain('NFP');
        expect(prompt).toContain('précédent 150');
        expect(prompt).toContain('Cassure de range');
    });

    it('states plainly when no release lands in the window', () => {
        const prompt = buildSetupAnalysisPrompt(setup(), [], NOW);
        expect(prompt).toContain('AUCUNE publication économique connue');
    });

    it('says the previous is unknown rather than printing null', () => {
        const prompt = buildSetupAnalysisPrompt(setup(), [release({ previous: null })], NOW);
        expect(prompt).toContain('précédent inconnu');
        expect(prompt).not.toContain('précédent null');
    });

    it('tells the model to lean on the capture when the trader wrote nothing', () => {
        const prompt = buildSetupAnalysisPrompt(setup({ notes: null }), [release()], NOW);
        expect(prompt).toContain("le trader n'a rien écrit");
    });
});
