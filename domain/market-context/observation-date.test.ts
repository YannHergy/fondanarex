import { describe, expect, it } from 'vitest';

import { parseObservationDate, todayIso } from './observation-date';

const TODAY = new Date('2026-08-06T14:32:11Z');

describe('parseObservationDate', () => {
    it('defaults to today when nothing is typed', () => {
        for (const empty of [null, undefined, '', '   ']) {
            const result = parseObservationDate(empty, TODAY);
            expect(result.error).toBeNull();
            expect(result.date!.toISOString()).toBe('2026-08-06T00:00:00.000Z');
        }
    });

    it('strips the time from today rather than keeping it', () => {
        // The table's unique key is (user, key, day). A date carrying 14:32
        // would create a second row for the same day instead of correcting it.
        const result = parseObservationDate(null, TODAY);
        expect(result.date!.getUTCHours()).toBe(0);
        expect(result.date!.getUTCMinutes()).toBe(0);
    });

    it('accepts a back-dated reading', () => {
        const result = parseObservationDate('2026-08-04', TODAY);
        expect(result.error).toBeNull();
        expect(result.date!.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    });

    it('accepts today itself', () => {
        const result = parseObservationDate('2026-08-06', TODAY);
        expect(result.error).toBeNull();
        expect(result.date!.toISOString()).toBe('2026-08-06T00:00:00.000Z');
    });

    it('refuses tomorrow', () => {
        const result = parseObservationDate('2026-08-07', TODAY);
        expect(result.date).toBeNull();
        expect(result.error).toContain('futur');
    });

    it('refuses a day that does not exist instead of rolling it forward', () => {
        // Date.UTC would turn these into 1 July and 2 March respectively.
        for (const impossible of ['2026-06-31', '2026-02-30']) {
            const result = parseObservationDate(impossible, TODAY);
            expect(result.date).toBeNull();
            expect(result.error).toContain("n'existe pas");
        }
    });

    it('accepts a real leap day and refuses a false one', () => {
        expect(parseObservationDate('2024-02-29', TODAY).date).not.toBeNull();
        expect(parseObservationDate('2026-02-29', TODAY).date).toBeNull();
    });

    it('refuses a malformed input', () => {
        for (const bad of ['06/08/2026', '2026-8-6', 'hier', '20260806', '2026-08-06T00:00:00Z']) {
            const result = parseObservationDate(bad, TODAY);
            expect(result.date).toBeNull();
            expect(result.error).toContain('AAAA-MM-JJ');
        }
    });

    it('refuses a date old enough to be a typo', () => {
        // A mistyped year is the case this catches: "0226" or "2016" when 2026
        // was meant would otherwise create a row that sorts below everything.
        const result = parseObservationDate('2016-08-06', TODAY);
        expect(result.date).toBeNull();
        expect(result.error).toContain('ancienne');
    });

    it('accepts the oldest date still allowed', () => {
        expect(parseObservationDate('2021-08-06', TODAY).date).not.toBeNull();
        expect(parseObservationDate('2021-08-05', TODAY).date).toBeNull();
    });

    it('owns no clock — the same inputs always give the same answer', () => {
        const once = parseObservationDate('2026-08-04', TODAY);
        const twice = parseObservationDate('2026-08-04', TODAY);
        expect(once).toEqual(twice);
    });

    it('moves its window with the reference day it is given', () => {
        // What was "tomorrow" yesterday is "today" now.
        expect(parseObservationDate('2026-08-07', TODAY).date).toBeNull();
        expect(
            parseObservationDate('2026-08-07', new Date('2026-08-07T09:00:00Z')).date,
        ).not.toBeNull();
    });
});

describe('todayIso', () => {
    it('formats the reference day for a date input', () => {
        expect(todayIso(TODAY)).toBe('2026-08-06');
        expect(todayIso(new Date('2026-01-09T23:59:59Z'))).toBe('2026-01-09');
    });
});
