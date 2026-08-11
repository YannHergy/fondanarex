import { describe, expect, it } from 'vitest';

import {
    latestOnsPoint,
    normalisePeriod,
    parseOnsSeries,
    toYearOnYear,
    type OnsResponse,
} from './ons';

/** The real shape the ONS returns, trimmed to three months. */
const REEL: OnsResponse = {
    months: [
        { date: '2026 APR', value: '3.5', year: '2026', month: 'April', quarter: '' },
        { date: '2026 MAY', value: '2.8', year: '2026', month: 'May', quarter: '' },
        { date: '2026 JUN', value: '2.6', year: '2026', month: 'June', quarter: '' },
    ],
    quarters: [{ date: '2026 Q2', value: '2.8', year: '2026', month: '', quarter: 'Q2' }],
    years: [{ date: '2025', value: '3.1', year: '2025', month: '', quarter: '' }],
    description: { title: 'CPI ANNUAL RATE', cdid: 'D7G7' },
};

describe('normalisePeriod', () => {
    it('convertit un mois ONS en periode de l app', () => {
        expect(normalisePeriod({ date: '2026 JUN', year: '2026', month: 'June' })).toBe('2026-06');
    });

    it('convertit un trimestre ONS', () => {
        expect(normalisePeriod({ date: '2026 Q2', year: '2026', quarter: 'Q2' })).toBe('2026-Q2');
    });

    it('retombe sur la chaine `date` quand month/quarter sont vides', () => {
        expect(normalisePeriod({ date: '2026 JUN', year: '2026' })).toBe('2026-06');
        expect(normalisePeriod({ date: '2026 Q3', year: '2026' })).toBe('2026-Q3');
    });

    it('refuse une entree sans annee exploitable', () => {
        expect(normalisePeriod({ date: 'sans date' })).toBeNull();
        expect(normalisePeriod({})).toBeNull();
    });
});

describe('parseOnsSeries', () => {
    it('prend la frequence la plus fine et trie du plus ancien au plus recent', () => {
        expect(parseOnsSeries(REEL)).toEqual([
            { period: '2026-04', value: 3.5 },
            { period: '2026-05', value: 2.8 },
            { period: '2026-06', value: 2.6 },
        ]);
    });

    it('retombe sur les trimestres puis les annees quand il n y a pas de mois', () => {
        expect(parseOnsSeries({ quarters: REEL.quarters, years: REEL.years })).toEqual([
            { period: '2026-Q2', value: 2.8 },
        ]);
        expect(parseOnsSeries({ years: REEL.years })).toEqual([{ period: '2025', value: 3.1 }]);
    });

    it('ignore une periode supprimee, presente mais sans valeur', () => {
        const withGap: OnsResponse = {
            months: [
                { date: '2026 APR', value: '3.5', year: '2026', month: 'April' },
                { date: '2026 MAY', value: '', year: '2026', month: 'May' },
                { date: '2026 JUN', value: '2.6', year: '2026', month: 'June' },
            ],
        };
        expect(parseOnsSeries(withGap).map((p) => p.period)).toEqual(['2026-04', '2026-06']);
    });

    it('renvoie un tableau vide pour une reponse absente ou vide', () => {
        expect(parseOnsSeries(null)).toEqual([]);
        expect(parseOnsSeries({})).toEqual([]);
    });
});

describe('toYearOnYear', () => {
    it('calcule la variation sur douze mois pour une serie mensuelle', () => {
        // 13 mois: l'indice passe de 100 a 104, soit +4% sur un an.
        const points = Array.from({ length: 13 }, (_, i) => ({
            period: `2025-${String(i + 1).padStart(2, '0')}`,
            value: i === 0 ? 100 : 104,
        }));
        const yoy = toYearOnYear(points);
        expect(yoy).toHaveLength(1);
        expect(yoy[0]!.period).toBe('2025-13'.replace('13', '13')); // dernier libelle conserve
        expect(yoy[0]!.value).toBeCloseTo(4, 10);
    });

    it('recule de quatre periodes sur une serie trimestrielle', () => {
        const points = [
            { period: '2025-Q1', value: 100 },
            { period: '2025-Q2', value: 101 },
            { period: '2025-Q3', value: 102 },
            { period: '2025-Q4', value: 103 },
            { period: '2026-Q1', value: 110 },
        ];
        const yoy = toYearOnYear(points);
        expect(yoy).toEqual([{ period: '2026-Q1', value: 10.000000000000009 }]);
    });

    it('saute une base a zero plutot que de diviser par elle', () => {
        const points = Array.from({ length: 13 }, (_, i) => ({
            period: `2025-${String(i + 1).padStart(2, '0')}`,
            value: i === 0 ? 0 : 50,
        }));
        expect(toYearOnYear(points)).toEqual([]);
    });

    it('renvoie un tableau vide quand il y a moins d un an de donnees', () => {
        expect(toYearOnYear([{ period: '2026-01', value: 100 }])).toEqual([]);
    });
});

describe('latestOnsPoint', () => {
    it('renvoie le dernier point', () => {
        expect(latestOnsPoint(parseOnsSeries(REEL))).toEqual({ period: '2026-06', value: 2.6 });
    });

    it('renvoie null pour une serie vide', () => {
        expect(latestOnsPoint([])).toBeNull();
    });
});
