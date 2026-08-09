import { describe, expect, it } from 'vitest';

import {
    isPlausibleRate,
    latestPoint,
    parseJsonStat,
    type JsonStatResponse,
} from './eurostat';

/** The real shape Eurostat returns, trimmed to four months. */
const REEL: JsonStatResponse = {
    label: 'HICP - monthly data (annual rate of change)',
    value: { '0': 2.1, '1': 2.1, '2': 2 },
    dimension: {
        time: { category: { index: { '2025-10': 0, '2025-11': 1, '2025-12': 2 } } },
    },
};

describe('parseJsonStat', () => {
    it('lit la vraie reponse Eurostat, du plus ancien au plus recent', () => {
        expect(parseJsonStat(REEL)).toEqual([
            { period: '2025-10', value: 2.1 },
            { period: '2025-11', value: 2.1 },
            { period: '2025-12', value: 2 },
        ]);
    });

    it('ordonne par index declare, pas par ordre des cles', () => {
        // Eurostat n'a aucune obligation de renvoyer les cles dans l'ordre, et
        // l'index est la seule source de verite sur la chronologie.
        const desordre: JsonStatResponse = {
            value: { '0': 1, '1': 2, '2': 3 },
            dimension: {
                time: { category: { index: { '2026-Q2': 2, '2025-Q4': 0, '2026-Q1': 1 } } },
            },
        };
        expect(parseJsonStat(desordre).map((p) => p.period)).toEqual([
            '2025-Q4',
            '2026-Q1',
            '2026-Q2',
        ]);
    });

    it('IGNORE une periode non publiee au lieu de la compter comme zero', () => {
        // Le cas rencontre en direct : le chomage declare des mois futurs sans
        // valeur. Les ecrire a 0 se lirait comme du plein emploi.
        const trous: JsonStatResponse = {
            value: { '0': 6.3, '2': 6.3 },
            dimension: {
                time: { category: { index: { '2026-04': 0, '2026-05': 1, '2026-06': 2 } } },
            },
        };
        expect(parseJsonStat(trous)).toEqual([
            { period: '2026-04', value: 6.3 },
            { period: '2026-06', value: 6.3 },
        ]);
    });

    it('ignore aussi un null explicite', () => {
        const avecNull: JsonStatResponse = {
            value: { '0': 2.4, '1': null },
            dimension: { time: { category: { index: { '2025-11': 0, '2025-12': 1 } } } },
        };
        expect(parseJsonStat(avecNull)).toEqual([{ period: '2025-11', value: 2.4 }]);
    });

    it('accepte une vraie valeur nulle, qui n\'est pas une absence', () => {
        // Le PIB de la zone euro a bien imprime 0 au T1 2026 : croissance nulle
        // est une lecture, pas une donnee manquante.
        const zero: JsonStatResponse = {
            value: { '0': 0 },
            dimension: { time: { category: { index: { '2026-Q1': 0 } } } },
        };
        expect(parseJsonStat(zero)).toEqual([{ period: '2026-Q1', value: 0 }]);
    });

    it('survit a une reponse vide ou malformee', () => {
        expect(parseJsonStat(null)).toEqual([]);
        expect(parseJsonStat(undefined)).toEqual([]);
        expect(parseJsonStat({})).toEqual([]);
        expect(parseJsonStat({ value: {} })).toEqual([]);
        expect(parseJsonStat({ dimension: {} })).toEqual([]);
    });
});

describe('latestPoint', () => {
    it('rend le point le plus recent', () => {
        expect(latestPoint(parseJsonStat(REEL))).toEqual({ period: '2025-12', value: 2 });
    });

    it('rend null sur une serie vide', () => {
        expect(latestPoint([])).toBeNull();
    });
});

describe('isPlausibleRate', () => {
    it('accepte les taux reels observes en direct', () => {
        for (const v of [2, 2.3, 0.4, 6.3, 0, -0.5]) {
            expect(isPlausibleRate(v)).toBe(true);
        }
    });

    it('refuse un niveau d\'indice pris pour un taux', () => {
        // 139.4 est l'indice CPIH britannique ; 103.55 l'artefact chinois.
        // Les deux signalent un filtre de dimension errone, pas une donnee.
        expect(isPlausibleRate(139.4)).toBe(false);
        expect(isPlausibleRate(103.55)).toBe(false);
    });

    it('refuse ce qui n\'est pas un nombre fini', () => {
        expect(isPlausibleRate(Number.NaN)).toBe(false);
        expect(isPlausibleRate(Number.POSITIVE_INFINITY)).toBe(false);
    });
});
