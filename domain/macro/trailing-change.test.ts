import { describe, expect, it } from 'vitest';

import { trailingChangePct, type DailyClose } from './market-series';

/** Builds a series of consecutive daily closes starting at `start`. */
function series(start: string, closes: number[]): DailyClose[] {
    const day = new Date(`${start}T00:00:00Z`);
    return closes.map((close, i) => {
        const d = new Date(day);
        d.setUTCDate(d.getUTCDate() + i);
        return { date: d.toISOString().slice(0, 10), close };
    });
}

describe('trailingChangePct', () => {
    it('measures across the window, not since the start of the month', () => {
        // 40 days of data. A 30-day window must anchor 30 days back, which is
        // day 10 — not the last day of the previous month.
        const daily = series('2026-07-01', Array.from({ length: 40 }, (_, i) => 100 + i));
        const change = trailingChangePct(daily, 30);

        expect(change).not.toBeNull();
        // The cutoff date itself qualifies: the window is inclusive at its far
        // end, so a close landing exactly 30 days back is the one used.
        expect(change!.from.date).toBe('2026-07-10');
        expect(change!.to.date).toBe('2026-08-09');
        expect(change!.spanDays).toBe(30);
        // 109 -> 139
        expect(change!.changePct).toBeCloseTo(((139 - 109) / 109) * 100, 6);
    });

    it('does not reset when a new month begins', () => {
        // The month-over-month alternative would report a one-day move here.
        // This is the whole reason the rolling window exists.
        const daily = series('2026-07-03', [
            ...Array.from({ length: 29 }, () => 80),
            88, // 1 August
        ]);
        const change = trailingChangePct(daily, 30);

        expect(change!.to.date).toBe('2026-08-01');
        expect(change!.changePct).toBeCloseTo(10, 6);
    });

    it('keeps the sign on a fall', () => {
        // The decline has to happen INSIDE the window to be visible: a drop
        // that predates the cutoff is history the indicator has moved past.
        const daily = series('2026-07-01', [
            ...Array.from({ length: 12 }, () => 100),
            ...Array.from({ length: 28 }, (_, i) => 100 - i),
        ]);
        const change = trailingChangePct(daily, 30);

        expect(change!.changePct).toBeLessThan(0);
        expect(change!.from.close).toBe(100);
        expect(change!.to.close).toBe(73);
    });

    it('sees nothing when the whole move predates the window', () => {
        // Deliberate, and the counterpart to the test above. A price that
        // collapsed six weeks ago and has been flat since is a flat market
        // today, and the score should say so.
        const daily = series('2026-07-01', [100, ...Array.from({ length: 40 }, () => 85)]);
        expect(trailingChangePct(daily, 30)!.changePct).toBe(0);
    });

    it('anchors on the series, never on the current time', () => {
        // A series that stopped months ago reports the move it contains. Were
        // the anchor `now`, the window would widen every day the data stayed
        // stale, and the number would drift on its own.
        const daily = series('2020-01-01', Array.from({ length: 40 }, (_, i) => 50 + i));
        const first = trailingChangePct(daily, 30);
        const second = trailingChangePct(daily, 30);

        expect(first).toEqual(second);
        expect(first!.to.date).toBe('2020-02-09');
    });

    it('reports a partial window honestly rather than refusing', () => {
        const daily = series('2026-08-01', [100, 101, 105]);
        const change = trailingChangePct(daily, 30);

        expect(change!.from.date).toBe('2026-08-01');
        expect(change!.spanDays).toBe(2);
        expect(change!.changePct).toBeCloseTo(5, 6);
    });

    it('skips weekends and holidays without shifting the anchor', () => {
        // Gaps in the series are normal; the cutoff is a calendar date, so the
        // last close at or before it is used whatever day of the week it is.
        const daily: DailyClose[] = [
            { date: '2026-07-06', close: 60 },
            { date: '2026-07-10', close: 62 },
            { date: '2026-08-05', close: 66 },
            { date: '2026-08-07', close: 69 },
        ];
        const change = trailingChangePct(daily, 30);

        expect(change!.from.date).toBe('2026-07-06');
        expect(change!.to.date).toBe('2026-08-07');
        expect(change!.changePct).toBeCloseTo(15, 6);
    });

    it('refuses a base at or below zero', () => {
        // April 2020: WTI settled negative. A percentage change off that base
        // is not a number anyone should act on.
        expect(trailingChangePct(series('2026-07-01', [0, 40]), 30)).toBeNull();
        expect(trailingChangePct(series('2026-07-01', [-37, 20]), 30)).toBeNull();
    });

    it('refuses a series too thin to measure', () => {
        expect(trailingChangePct([], 30)).toBeNull();
        expect(trailingChangePct(series('2026-08-01', [70]), 30)).toBeNull();
    });

    it('ignores unusable closes', () => {
        const daily = [
            { date: '2026-07-01', close: 100 },
            { date: '2026-07-15', close: Number.NaN },
            { date: '2026-08-05', close: 120 },
        ];
        const change = trailingChangePct(daily, 30);

        expect(change!.from.date).toBe('2026-07-01');
        expect(change!.changePct).toBeCloseTo(20, 6);
    });

    it('does not require the input to be sorted', () => {
        const ordered = series('2026-07-01', Array.from({ length: 40 }, (_, i) => 100 + i));
        const shuffled = [...ordered].reverse();

        expect(trailingChangePct(shuffled, 30)).toEqual(trailingChangePct(ordered, 30));
    });
});
