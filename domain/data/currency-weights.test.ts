import { describe, it, expect } from 'vitest';

import { CURRENCY_WEIGHTS, getCurrencyProfile, indicatorKind, totalWeight } from './currency-weights';

const CODES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'];

describe('CURRENCY_WEIGHTS', () => {
    it('covers exactly the 8 G10 currencies of the app', () => {
        expect(Object.keys(CURRENCY_WEIGHTS).sort()).toEqual([...CODES].sort());
    });

    it('every profile weighs exactly 100', () => {
        for (const code of CODES) {
            expect(totalWeight(code)).toBe(100);
        }
    });

    it('totalWeight returns 0 for an unknown code', () => {
        expect(totalWeight('XXX')).toBe(0);
        expect(getCurrencyProfile('XXX')).toBeUndefined();
    });

    it('every indicator carries a non-negative weight and a label', () => {
        // A weight of exactly 0 is a deliberate, documented exception: EUR's
        // eu_pmi_manu is a manually-entered figurant with no free source
        // (see currency-weights.ts), kept visible but excluded from the
        // score by construction — weightedAverage/familyScore both treat a
        // 0 weight as "never contributes", not as an error case.
        for (const code of CODES) {
            const profile = getCurrencyProfile(code);
            if (profile === undefined) throw new Error(`profile ${code} is missing`);
            expect(profile.indicateurs.length).toBeGreaterThan(0);
            expect(profile.banqueCentrale.length).toBeGreaterThan(0);
            expect(profile.moteurN1.length).toBeGreaterThan(0);
            for (const ind of profile.indicateurs) {
                expect(ind.poids).toBeGreaterThanOrEqual(0);
                expect(ind.nom.length).toBeGreaterThan(0);
            }
        }
    });

    it('indicator ids are unique inside a profile and prefixed by their country', () => {
        const prefixes: Record<string, string> = {
            USD: 'us_', EUR: 'eu_', GBP: 'gb_', JPY: 'jp_',
            AUD: 'au_', CAD: 'ca_', NZD: 'nz_', CHF: 'ch_',
        };
        const seen = new Set<string>();
        for (const code of CODES) {
            const profile = getCurrencyProfile(code);
            if (profile === undefined) throw new Error(`profile ${code} is missing`);
            const prefix = prefixes[code];
            if (prefix === undefined) throw new Error(`prefix ${code} is missing`);
            for (const ind of profile.indicateurs) {
                expect(ind.id.startsWith(prefix)).toBe(true);
                expect(seen.has(ind.id)).toBe(false);
                seen.add(ind.id);
            }
        }
    });

    it('the profiles are ordered by descending weight in the source table', () => {
        for (const code of CODES) {
            const profile = getCurrencyProfile(code);
            if (profile === undefined) throw new Error(`profile ${code} is missing`);
            const weights = profile.indicateurs.map(i => i.poids);
            expect(weights).toEqual([...weights].sort((a, b) => b - a));
        }
    });
});

describe('indicatorKind', () => {
    it('strips the country prefix', () => {
        expect(indicatorKind('us_core_cpi')).toBe('core_cpi');
        expect(indicatorKind('jp_cpi_tokyo')).toBe('cpi_tokyo');
        expect(indicatorKind('ch_interventions')).toBe('interventions');
        expect(indicatorKind('nz_laitiers')).toBe('laitiers');
    });

    it('leaves an unprefixed id untouched', () => {
        expect(indicatorKind('taux')).toBe('taux');
        expect(indicatorKind('global_oil')).toBe('global_oil');
    });

    it('maps every profile indicator onto a kind the engine can score', () => {
        // The exhaustive list of kinds handled by the switch of scoreIndicator.
        const known = new Set([
            'taux', 'orientation', 'cpi', 'hicp', 'core_cpi', 'core_hicp', 'cpi_tokyo',
            'pib', 'pmi_manu', 'prod_indus', 'pmi_serv', 'pmi', 'ivey', 'kof', 'zew', 'ifo', 'sentiment',
            'chomage', 'nfp', 'salaires', 'emploi', 'balance', 'retail',
            'petrole', 'fer', 'laitiers', 'chine', 'risque', 'us', 'eurchf', 'interventions',
        ]);
        for (const profile of Object.values(CURRENCY_WEIGHTS)) {
            for (const ind of profile.indicateurs) {
                expect(known.has(indicatorKind(ind.id))).toBe(true);
            }
        }
    });
});
