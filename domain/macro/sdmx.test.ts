import { describe, expect, it } from 'vitest';

import {
    OECD_TO_CURRENCY,
    CURRENCY_TO_OECD,
    extractLatestTwo,
    parseSdmxJson,
    toCurrencyDatapoints,
} from './sdmx';

/**
 * Minimal SDMX-JSON 2.0 body: 3 dimensions, country at position 0, time at 2.
 * Observation key "0:0:1" therefore means (country[0], anything, time[1]).
 */
function v2Body() {
    return {
        data: {
            structures: [
                {
                    dimensions: {
                        observation: [
                            { id: 'REF_AREA', values: [{ id: 'USA' }, { id: 'JPN' }] },
                            { id: 'MEASURE', values: [{ id: 'CPI' }] },
                            { id: 'TIME_PERIOD', values: [{ id: '2026-01' }, { id: '2026-02' }] },
                        ],
                    },
                },
            ],
            dataSets: [
                {
                    observations: {
                        '0:0:0': [3.1],
                        '0:0:1': [3.4],
                        '1:0:0': [2.0],
                        '1:0:1': [2.2],
                    },
                },
            ],
        },
    };
}

/** SDMX-JSON 1.x: same content, older envelope and LOCATION instead of REF_AREA. */
function v1Body() {
    return {
        structure: {
            dimensions: {
                observation: [
                    { id: 'LOCATION', values: [{ id: 'GBR' }] },
                    { id: 'TIME_PERIOD', values: [{ id: '2025-11' }, { id: '2025-12' }] },
                ],
            },
        },
        dataSets: [{ observations: { '0:0': [1000], '0:1': [2000] } }],
    };
}

describe('parseSdmxJson', () => {
    it('decodes the 2.0 envelope', () => {
        expect(parseSdmxJson(v2Body())).toEqual({
            USA: { '2026-01': 3.1, '2026-02': 3.4 },
            JPN: { '2026-01': 2.0, '2026-02': 2.2 },
        });
    });

    it('decodes the 1.x envelope, which trade balance still uses', () => {
        expect(parseSdmxJson(v1Body())).toEqual({
            GBR: { '2025-11': 1000, '2025-12': 2000 },
        });
    });

    it('applies the divisor, e.g. millions to billions', () => {
        expect(parseSdmxJson(v1Body(), 1000)).toEqual({
            GBR: { '2025-11': 1, '2025-12': 2 },
        });
    });

    it('skips null observations rather than reading them as zero', () => {
        const body = v1Body();
        body.dataSets[0]!.observations['0:0'] = [null as unknown as number];
        expect(parseSdmxJson(body)).toEqual({ GBR: { '2025-12': 2000 } });
    });

    it('returns empty for malformed or unrecognised bodies', () => {
        expect(parseSdmxJson(null)).toEqual({});
        expect(parseSdmxJson({})).toEqual({});
        expect(parseSdmxJson({ data: { structures: [], dataSets: [] } })).toEqual({});
    });

    it('returns empty when the country or time dimension is absent', () => {
        expect(
            parseSdmxJson({
                structure: { dimensions: { observation: [{ id: 'MEASURE', values: [{ id: 'X' }] }] } },
                dataSets: [{ observations: { '0': [1] } }],
            }),
        ).toEqual({});
    });

    it('keeps the first value when two series collide on one country and period', () => {
        const parsed = parseSdmxJson({
            structure: {
                dimensions: {
                    observation: [
                        { id: 'LOCATION', values: [{ id: 'USA' }] },
                        { id: 'ADJUSTMENT', values: [{ id: 'A' }, { id: 'B' }] },
                        { id: 'TIME_PERIOD', values: [{ id: '2026-01' }] },
                    ],
                },
            },
            dataSets: [{ observations: { '0:0:0': [5], '0:1:0': [9] } }],
        });
        expect(parsed).toEqual({ USA: { '2026-01': 5 } });
    });
});

describe('extractLatestTwo', () => {
    it('picks the newest two periods, newest first', () => {
        expect(extractLatestTwo({ '2026-01': 1, '2026-03': 3, '2026-02': 2 })).toEqual({
            current: 3,
            previous: 2,
            latestPeriod: '2026-03',
        });
    });

    it('orders quarterly labels correctly', () => {
        expect(extractLatestTwo({ '2025-Q3': 0.2, '2025-Q4': 0.5 })).toEqual({
            current: 0.5,
            previous: 0.2,
            latestPeriod: '2025-Q4',
        });
    });

    it('repeats current as previous when there is only one observation', () => {
        expect(extractLatestTwo({ '2026-01': 4.2 })).toEqual({
            current: 4.2,
            previous: 4.2,
            latestPeriod: '2026-01',
        });
    });

    it('rounds to two decimals', () => {
        expect(extractLatestTwo({ '2026-01': 3.14159 })?.current).toBe(3.14);
    });

    it('returns null for an empty map', () => {
        expect(extractLatestTwo({})).toBeNull();
    });
});

describe('toCurrencyDatapoints', () => {
    it('maps OECD areas onto currencies', () => {
        const result = toCurrencyDatapoints(parseSdmxJson(v2Body()));
        expect(result.USD?.current).toBe(3.4);
        expect(result.JPY?.current).toBe(2.2);
    });

    it('drops countries the app does not track', () => {
        expect(toCurrencyDatapoints({ MEX: { '2026-01': 5 } })).toEqual({});
    });
});

describe('country code maps', () => {
    it('round-trip between the two directions', () => {
        for (const [oecd, currency] of Object.entries(OECD_TO_CURRENCY)) {
            expect(CURRENCY_TO_OECD[currency]).toBe(oecd);
        }
    });

    it('covers all eight tracked currencies', () => {
        expect(Object.keys(CURRENCY_TO_OECD).sort()).toEqual(
            ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD'],
        );
    });
});
