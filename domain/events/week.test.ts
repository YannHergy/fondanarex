import { describe, expect, it } from 'vitest';

import {
    dateToStr,
    getMondayOfWeek,
    getWeekDates,
    getWeekKey,
    getWeekRange,
    nextWeekKey,
    prevWeekKey,
    weekKeysEndingAt,
} from './week';

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('getWeekKey', () => {
    it('numbers a mid-year week', () => {
        // 2026-04-22 is a Wednesday in ISO week 17.
        expect(getWeekKey(utc('2026-04-22'))).toBe('2026-W17');
    });

    it('gives every day of one week the same key', () => {
        const keys = ['2026-04-20', '2026-04-22', '2026-04-26'].map(d => getWeekKey(utc(d)));
        expect(new Set(keys).size).toBe(1);
    });

    it('assigns a year-end week to the year containing its Thursday', () => {
        // 2025-12-29 (Monday) belongs to ISO week 1 of 2026.
        expect(getWeekKey(utc('2025-12-29'))).toBe('2026-W01');
    });

    it('assigns an early-January date back to the previous ISO year', () => {
        // 2027-01-01 is a Friday, still in ISO week 53 of 2026.
        expect(getWeekKey(utc('2027-01-01'))).toBe('2026-W53');
    });

    it('reads the date in UTC, not the local calendar', () => {
        // 23:30 UTC on a Sunday is already Monday in some zones. Deriving the
        // key from local parts would move this into the following week.
        const lateSunday = new Date('2026-04-19T23:30:00Z');
        expect(getWeekKey(lateSunday)).toBe('2026-W16');
    });
});

describe('getMondayOfWeek', () => {
    it('returns the Monday at midnight UTC', () => {
        const monday = getMondayOfWeek('2026-W17');
        expect(dateToStr(monday)).toBe('2026-04-20');
        expect(monday.getUTCDay()).toBe(1);
        expect(monday.getUTCHours()).toBe(0);
    });

    it('round-trips with getWeekKey for many weeks', () => {
        let key = '2025-W01';
        for (let i = 0; i < 60; i += 1) {
            expect(getWeekKey(getMondayOfWeek(key))).toBe(key);
            key = nextWeekKey(key);
        }
    });

    it('rejects a malformed key rather than returning a wrong date', () => {
        expect(() => getMondayOfWeek('2026-17')).toThrow();
        expect(() => getMondayOfWeek('')).toThrow();
    });
});

describe('getWeekDates', () => {
    it('returns Monday to Friday', () => {
        const dates = getWeekDates('2026-W17').map(dateToStr);
        expect(dates).toEqual([
            '2026-04-20',
            '2026-04-21',
            '2026-04-22',
            '2026-04-23',
            '2026-04-24',
        ]);
    });
});

describe('getWeekRange', () => {
    it('spans Monday 00:00 to Sunday 23:59:59.999', () => {
        const { start, end } = getWeekRange('2026-W17');
        expect(dateToStr(start)).toBe('2026-04-20');
        expect(dateToStr(end)).toBe('2026-04-26');
        // Inclusive of the whole Sunday, so a weekend entry is not missed.
        expect(end.getUTCHours()).toBe(23);
    });
});

describe('prevWeekKey / nextWeekKey', () => {
    it('steps one week', () => {
        expect(nextWeekKey('2026-W17')).toBe('2026-W18');
        expect(prevWeekKey('2026-W17')).toBe('2026-W16');
    });

    it('crosses a year boundary correctly', () => {
        expect(nextWeekKey('2026-W53')).toBe('2027-W01');
        expect(prevWeekKey('2026-W01')).toBe('2025-W52');
    });

    it('is reversible', () => {
        expect(prevWeekKey(nextWeekKey('2026-W30'))).toBe('2026-W30');
    });
});

describe('weekKeysEndingAt', () => {
    it('returns the requested count, oldest first, ending at the key', () => {
        const keys = weekKeysEndingAt('2026-W17', 4);
        expect(keys).toEqual(['2026-W14', '2026-W15', '2026-W16', '2026-W17']);
    });
});
