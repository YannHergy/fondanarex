import { describe, expect, it } from 'vitest';

import { monthlyCloses, toVixReading, type VixDailyClose } from './vix';

const daily: VixDailyClose[] = [
    { date: '2026-06-29', close: 21.4 },
    { date: '2026-06-30', close: 22.1 },
    { date: '2026-07-30', close: 17.09 },
    { date: '2026-07-31', close: 15.99 },
    { date: '2026-08-03', close: 15.86 },
];

describe('monthlyCloses', () => {
    it('keeps the last close of each month, oldest first', () => {
        expect(monthlyCloses(daily)).toEqual([
            { date: '2026-06-30', close: 22.1 },
            { date: '2026-07-31', close: 15.99 },
            { date: '2026-08-03', close: 15.86 },
        ]);
    });

    it('does not assume the input is sorted', () => {
        const shuffled = [daily[3]!, daily[0]!, daily[4]!, daily[2]!, daily[1]!];
        expect(monthlyCloses(shuffled)).toEqual(monthlyCloses(daily));
    });

    it('drops sessions with no usable close', () => {
        // Yahoo returns null for a holiday inside the requested range; NaN would
        // otherwise win the "latest date" comparison and poison the month.
        const withGap: VixDailyClose[] = [
            { date: '2026-08-03', close: 15.86 },
            { date: '2026-08-04', close: Number.NaN },
        ];
        expect(monthlyCloses(withGap)).toEqual([{ date: '2026-08-03', close: 15.86 }]);
    });

    it('returns nothing for an empty series', () => {
        expect(monthlyCloses([])).toEqual([]);
    });
});

describe('toVixReading', () => {
    it('pairs the latest month with the one before it', () => {
        expect(toVixReading(daily)).toEqual({
            current: 15.86,
            previous: 15.99,
            period: '2026-08',
            previousPeriod: '2026-07',
        });
    });

    it('reports no momentum rather than a direction when only one month exists', () => {
        const single: VixDailyClose[] = [{ date: '2026-08-03', close: 15.86 }];
        expect(toVixReading(single)).toEqual({
            current: 15.86,
            previous: 15.86,
            period: '2026-08',
            previousPeriod: null,
        });
    });

    it('returns null when there is nothing usable', () => {
        expect(toVixReading([])).toBeNull();
        expect(toVixReading([{ date: '2026-08-03', close: Number.NaN }])).toBeNull();
    });
});
