import { describe, expect, it } from 'vitest';

import { latestFredPoint, parseFredCsv, toPeriod } from './fred-csv';

/** The real shape FRED's CSV export returns. */
const REEL = `observation_date,CPIAUCNS
2026-04-01,333.020
2026-05-01,335.123
2026-06-01,333.952`;

describe('toPeriod', () => {
    it('convertit une date mensuelle', () => {
        expect(toPeriod('2026-06-01', 'monthly')).toBe('2026-06');
    });

    it('laisse une date quotidienne inchangee, y compris le mois en cours', () => {
        expect(toPeriod('2026-08-12', 'daily')).toBe('2026-08-12');
        expect(toPeriod('2026-01-01', 'daily')).toBe('2026-01-01');
    });

    it('deduit le trimestre du mois de debut, que FRED est seul a donner', () => {
        expect(toPeriod('2026-01-01', 'quarterly')).toBe('2026-Q1');
        expect(toPeriod('2026-04-01', 'quarterly')).toBe('2026-Q2');
        expect(toPeriod('2026-07-01', 'quarterly')).toBe('2026-Q3');
        expect(toPeriod('2026-10-01', 'quarterly')).toBe('2026-Q4');
    });

    it('refuse une date mal formee', () => {
        expect(toPeriod('juin 2026', 'monthly')).toBeNull();
        expect(toPeriod('', 'monthly')).toBeNull();
        expect(toPeriod('2026-13-01', 'quarterly')).toBeNull();
    });
});

describe('parseFredCsv', () => {
    it('lit la vraie reponse, du plus ancien au plus recent', () => {
        expect(parseFredCsv(REEL, 'monthly')).toEqual([
            { period: '2026-04', value: 333.02 },
            { period: '2026-05', value: 335.123 },
            { period: '2026-06', value: 333.952 },
        ]);
    });

    it('ignore une periode marquee "." par FRED', () => {
        const withGap = `observation_date,X
2026-04-01,1.5
2026-05-01,.
2026-06-01,2.5`;
        expect(parseFredCsv(withGap, 'monthly').map((p) => p.period)).toEqual([
            '2026-04',
            '2026-06',
        ]);
    });

    it('renvoie un tableau vide pour une reponse absente, vide ou sans ligne de donnees', () => {
        expect(parseFredCsv(null, 'monthly')).toEqual([]);
        expect(parseFredCsv('', 'monthly')).toEqual([]);
        expect(parseFredCsv('observation_date,X', 'monthly')).toEqual([]);
    });

    it('gere une serie trimestrielle', () => {
        const quarterly = `observation_date,A191RL1Q225SBEA
2026-01-01,2.1
2026-04-01,1.5`;
        expect(parseFredCsv(quarterly, 'quarterly')).toEqual([
            { period: '2026-Q1', value: 2.1 },
            { period: '2026-Q2', value: 1.5 },
        ]);
    });

    it('accepte une valeur negative, que plusieurs series publient', () => {
        const negative = `observation_date,BOPGSTB
2026-06-01,-73261`;
        expect(parseFredCsv(negative, 'monthly')).toEqual([{ period: '2026-06', value: -73261 }]);
    });

    it('lit une serie quotidienne sans la collapser, y compris le mois en cours', () => {
        const daily = `observation_date,DFEDTARU
2026-08-10,3.75
2026-08-11,3.75
2026-08-12,3.75`;
        expect(parseFredCsv(daily, 'daily')).toEqual([
            { period: '2026-08-10', value: 3.75 },
            { period: '2026-08-11', value: 3.75 },
            { period: '2026-08-12', value: 3.75 },
        ]);
    });
});

describe('latestFredPoint', () => {
    it('renvoie le dernier point', () => {
        expect(latestFredPoint(parseFredCsv(REEL, 'monthly'))).toEqual({
            period: '2026-06',
            value: 333.952,
        });
    });

    it('renvoie null pour une serie vide', () => {
        expect(latestFredPoint([])).toBeNull();
    });
});
