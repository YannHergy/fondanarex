import { describe, expect, it } from 'vitest';

import {
    parseEstatPoints,
    toEstatReading,
    toMonthLabel,
    type EstatPoint,
} from './estat';

/** Shape of a real Statistics Dashboard response, trimmed to what we read. */
function payload(values: Array<Record<string, string>>) {
    return {
        GET_STATS: {
            STATISTICAL_DATA: {
                DATA_INF: { DATA_OBJ: values.map((VALUE) => ({ VALUE })) },
            },
        },
    };
}

describe('toMonthLabel', () => {
    it('reads the YYYYMM00 form the API uses for months', () => {
        expect(toMonthLabel('20260600')).toBe('2026-06');
        expect(toMonthLabel('19710100')).toBe('1971-01');
    });

    it('rejects the annual and fiscal-year forms', () => {
        // Their yearly series end in CY/FY; coercing those would mix a whole
        // year's figure into a monthly series.
        expect(toMonthLabel('2026CY')).toBeNull();
        expect(toMonthLabel('9999FY')).toBeNull();
        expect(toMonthLabel('')).toBeNull();
        expect(toMonthLabel('20261300')).toBeNull();
    });
});

describe('parseEstatPoints', () => {
    const raw = payload([
        { '@time': '20260500', '@regionCode': '13100', $: '1.3' },
        { '@time': '20260600', '@regionCode': '13100', $: '1.6' },
        { '@time': '20260600', '@regionCode': '27100', $: '1.4' },
        { '@time': '20260400', '@regionCode': '13100', $: '1.5' },
    ]);

    it('keeps only the requested region, oldest first', () => {
        expect(parseEstatPoints(raw, '13100')).toEqual([
            { period: '2026-04', value: 1.5 },
            { period: '2026-05', value: 1.3 },
            { period: '2026-06', value: 1.6 },
        ]);
    });

    it('does not confuse one city with another', () => {
        // Osaka is 27100. Reading the wrong city's inflation would look
        // perfectly plausible on screen.
        expect(parseEstatPoints(raw, '27100')).toEqual([
            { period: '2026-06', value: 1.4 },
        ]);
    });

    it('drops unusable rows instead of turning them into zeroes', () => {
        const dirty = payload([
            { '@time': '20260600', '@regionCode': '13100', $: '' },
            { '@time': '20260500', '@regionCode': '13100', $: '-' },
            { '@time': '20260400', '@regionCode': '13100', $: '1.5' },
        ]);
        expect(parseEstatPoints(dirty, '13100')).toEqual([
            { period: '2026-04', value: 1.5 },
        ]);
    });

    it('accepts a single-point response, which arrives unwrapped', () => {
        const single = {
            GET_STATS: {
                STATISTICAL_DATA: {
                    DATA_INF: {
                        DATA_OBJ: { VALUE: { '@time': '20260600', '@regionCode': '13100', $: '1.6' } },
                    },
                },
            },
        };
        expect(parseEstatPoints(single, '13100')).toEqual([
            { period: '2026-06', value: 1.6 },
        ]);
    });

    it('returns nothing on a malformed payload rather than throwing', () => {
        expect(parseEstatPoints(null, '13100')).toEqual([]);
        expect(parseEstatPoints({}, '13100')).toEqual([]);
        expect(parseEstatPoints({ GET_STATS: {} }, '13100')).toEqual([]);
    });
});

describe('toEstatReading', () => {
    const points: EstatPoint[] = [
        { period: '2026-04', value: 1.5 },
        { period: '2026-05', value: 1.3 },
        { period: '2026-06', value: 1.6 },
    ];

    it('pairs the latest month with the one before it', () => {
        expect(toEstatReading(points)).toEqual({
            current: 1.6,
            previous: 1.3,
            period: '2026-06',
            previousPeriod: '2026-05',
        });
    });

    it('reports no momentum rather than a direction on a lone reading', () => {
        expect(toEstatReading([{ period: '2026-06', value: 1.6 }])).toEqual({
            current: 1.6,
            previous: 1.6,
            period: '2026-06',
            previousPeriod: null,
        });
    });

    it('returns null when there is nothing', () => {
        expect(toEstatReading([])).toBeNull();
    });
});
