import { describe, expect, it } from 'vitest';

import { isPlausiblePolicyRate, latestEcbPoint, parseEcbSdmx, type EcbSdmxResponse } from './ecb';

/** Trimmed shape of a real ECB Data Portal response for the DFR series. */
const REEL: EcbSdmxResponse = {
    dataSets: [
        {
            series: {
                '0:0:0:0:0:0:0': {
                    observations: {
                        '0': [2, 0, 0, null, null],
                        '1': [2, 0, 0, null, null],
                        '2': [2.25, 0, 0, null, null],
                    },
                },
            },
        },
    ],
    structure: {
        dimensions: {
            observation: [
                {
                    id: 'TIME_PERIOD',
                    values: [{ id: '2023-01-01' }, { id: '2023-01-02' }, { id: '2023-02-08' }],
                },
            ],
        },
    },
};

describe('parseEcbSdmx', () => {
    it('lit la vraie reponse SDMX de la BCE, du plus ancien au plus recent', () => {
        expect(parseEcbSdmx(REEL)).toEqual([
            { period: '2023-01-01', value: 2 },
            { period: '2023-01-02', value: 2 },
            { period: '2023-02-08', value: 2.25 },
        ]);
    });

    it("renvoie un tableau vide si dataSets, series ou les valeurs temporelles manquent", () => {
        expect(parseEcbSdmx(null)).toEqual([]);
        expect(parseEcbSdmx({})).toEqual([]);
        expect(parseEcbSdmx({ dataSets: [{}] })).toEqual([]);
        expect(
            parseEcbSdmx({
                dataSets: [{ series: { '0': { observations: { '0': [2] } } } }],
            }),
        ).toEqual([]);
    });

    it('ignore une observation dont la valeur numerique est absente', () => {
        const withGap: EcbSdmxResponse = {
            dataSets: [
                {
                    series: {
                        '0': {
                            observations: {
                                '0': [2, 0, 0, null, null],
                                // Index 1 has no key at all — a gap, not a null.
                                '2': [2.25, 0, 0, null, null],
                            },
                        },
                    },
                },
            ],
            structure: {
                dimensions: {
                    observation: [
                        {
                            id: 'TIME_PERIOD',
                            values: [{ id: '2023-01-01' }, { id: '2023-01-02' }, { id: '2023-01-03' }],
                        },
                    ],
                },
            },
        };
        expect(parseEcbSdmx(withGap)).toEqual([
            { period: '2023-01-01', value: 2 },
            { period: '2023-01-03', value: 2.25 },
        ]);
    });
});

describe('latestEcbPoint', () => {
    it('renvoie le dernier point une fois la serie triee', () => {
        expect(latestEcbPoint(parseEcbSdmx(REEL))).toEqual({ period: '2023-02-08', value: 2.25 });
    });

    it('renvoie null pour une serie vide', () => {
        expect(latestEcbPoint([])).toBeNull();
    });
});

describe('isPlausiblePolicyRate', () => {
    it('accepte un taux directeur realiste', () => {
        expect(isPlausiblePolicyRate(2.25)).toBe(true);
        expect(isPlausiblePolicyRate(0)).toBe(true);
        expect(isPlausiblePolicyRate(4.5)).toBe(true);
    });

    it('rejette une valeur hors bande (index, volume...)', () => {
        expect(isPlausiblePolicyRate(-5)).toBe(false);
        expect(isPlausiblePolicyRate(25)).toBe(false);
        expect(isPlausiblePolicyRate(NaN)).toBe(false);
    });
});
