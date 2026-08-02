import { describe, expect, it } from 'vitest';

import {
    FRED_SERIES,
    applyTransform,
    cleanObservations,
    directValue,
    millionsToBillions,
    yoyFromIndex,
    type FredObservation,
} from './fred';

/**
 * Index series rising 0.5% a month, newest last.
 *
 * Months are generated through Date.UTC so they roll into the next year.
 * Building the label by hand from `i % 12` silently repeats a date once the
 * series passes twelve entries, which makes the year-ago lookup compare two
 * points less than a year apart.
 */
function indexSeries(count: number, start = 100): FredObservation[] {
    return Array.from({ length: count }, (_, i) => ({
        date: new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10),
        value: (start * Math.pow(1.005, i)).toFixed(3),
    }));
}

describe('cleanObservations', () => {
    it('drops FRED\'s "." placeholder for a missing value', () => {
        const cleaned = cleanObservations([
            { date: '2026-01-01', value: '1.5' },
            { date: '2026-02-01', value: '.' },
            { date: '2026-03-01', value: '2.0' },
        ]);
        expect(cleaned).toEqual([
            { date: '2026-01-01', value: 1.5 },
            { date: '2026-03-01', value: 2 },
        ]);
    });

    it('sorts oldest first, whatever order the API returned', () => {
        const cleaned = cleanObservations([
            { date: '2026-03-01', value: '3' },
            { date: '2026-01-01', value: '1' },
            { date: '2026-02-01', value: '2' },
        ]);
        expect(cleaned.map(o => o.value)).toEqual([1, 2, 3]);
    });

    it('drops unparseable values', () => {
        expect(cleanObservations([{ date: '2026-01-01', value: 'n/a' }])).toEqual([]);
    });
});

describe('directValue', () => {
    it('returns the latest two readings with the latest period', () => {
        expect(
            directValue([
                { date: '2026-01-01', value: '4.3' },
                { date: '2026-02-01', value: '4.2' },
            ]),
        ).toEqual({
            current: 4.2,
            previous: 4.3,
            period: '2026-02',
            observedOn: '2026-02-01',
            previousPeriod: '2026-01',
            previousObservedOn: '2026-01-01',
        });
    });

    it('needs at least two observations', () => {
        expect(directValue([{ date: '2026-01-01', value: '4.2' }])).toBeNull();
        expect(directValue([])).toBeNull();
    });

    it('ignores missing values when picking the latest two', () => {
        const result = directValue([
            { date: '2026-01-01', value: '1' },
            { date: '2026-02-01', value: '.' },
            { date: '2026-03-01', value: '3' },
        ]);
        expect(result).toMatchObject({ current: 3, previous: 1 });
    });
});

describe('yoyFromIndex', () => {
    it('converts an index level into a year-over-year percentage', () => {
        // 13 months at +0.5% compounding => ~6.17% over 12 months.
        const result = yoyFromIndex(indexSeries(13));
        expect(result).not.toBeNull();
        expect(result!.current).toBeCloseTo(6.17, 1);
    });

    it('returns null below 13 observations, since a year cannot be spanned', () => {
        expect(yoyFromIndex(indexSeries(12))).toBeNull();
    });

    it('computes previous against its own year-ago base when available', () => {
        const result = yoyFromIndex(indexSeries(14));
        expect(result!.previous).toBeCloseTo(6.17, 1);
    });

    it('does not divide by a zero base', () => {
        const series = indexSeries(13);
        series[0] = { date: series[0]!.date, value: '0' };
        expect(yoyFromIndex(series)).toBeNull();
    });

    it('reports a flat series as zero growth', () => {
        const flat = Array.from({ length: 14 }, (_, i) => ({
            date: new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10),
            value: '100',
        }));
        expect(yoyFromIndex(flat)!.current).toBe(0);
    });
});

describe('millionsToBillions', () => {
    it('scales by 1000 and rounds to two decimals', () => {
        expect(
            millionsToBillions([
                { date: '2026-01-01', value: '-54600' },
                { date: '2026-02-01', value: '-77600' },
            ]),
        ).toMatchObject({ current: -77.6, previous: -54.6 });
    });

    it('returns null when there is not enough data', () => {
        expect(millionsToBillions([])).toBeNull();
    });
});

describe('applyTransform', () => {
    it('dispatches to the configured transform', () => {
        const two: FredObservation[] = [
            { date: '2026-01-01', value: '1000' },
            { date: '2026-02-01', value: '2000' },
        ];
        expect(applyTransform('direct', two)?.current).toBe(2000);
        expect(applyTransform('billions', two)?.current).toBe(2);
        expect(applyTransform('yoy_from_index', two)).toBeNull();
    });
});

describe('FRED_SERIES config', () => {
    it('requests enough observations for every YoY series', () => {
        for (const series of FRED_SERIES) {
            if (series.transform === 'yoy_from_index') {
                expect(series.limitObs).toBeGreaterThanOrEqual(13);
            }
        }
    });

    it('maps each series to a distinct field', () => {
        const fields = FRED_SERIES.map(s => s.field);
        expect(new Set(fields).size).toBe(fields.length);
    });
});
