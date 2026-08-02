import { describe, expect, it } from 'vitest';

import { periodEnd, periodLabel } from './period';

function iso(date: Date | null): string | null {
    return date ? date.toISOString().slice(0, 10) : null;
}

describe('periodEnd', () => {
    it('resolves a monthly label to the last day of that month', () => {
        expect(iso(periodEnd('2026-01'))).toBe('2026-01-31');
        expect(iso(periodEnd('2026-04'))).toBe('2026-04-30');
    });

    it('handles February in a leap year', () => {
        expect(iso(periodEnd('2024-02'))).toBe('2024-02-29');
        expect(iso(periodEnd('2026-02'))).toBe('2026-02-28');
    });

    it('resolves a quarter to the last day of its final month', () => {
        expect(iso(periodEnd('2025-Q1'))).toBe('2025-03-31');
        expect(iso(periodEnd('2025-Q4'))).toBe('2025-12-31');
    });

    it('is case-insensitive for quarter and semester labels', () => {
        expect(iso(periodEnd('2025-q2'))).toBe('2025-06-30');
        expect(iso(periodEnd('2025-s1'))).toBe('2025-06-30');
    });

    it('resolves a half-year', () => {
        expect(iso(periodEnd('2025-S2'))).toBe('2025-12-31');
    });

    it('resolves an annual label to 31 December', () => {
        expect(iso(periodEnd('2025'))).toBe('2025-12-31');
    });

    it('accepts a full date unchanged', () => {
        expect(iso(periodEnd('2026-03-15'))).toBe('2026-03-15');
    });

    it('rejects an invalid month', () => {
        expect(periodEnd('2026-13')).toBeNull();
        expect(periodEnd('2026-00')).toBeNull();
    });

    it('returns null for anything unrecognised', () => {
        expect(periodEnd('')).toBeNull();
        expect(periodEnd('garbage')).toBeNull();
        expect(periodEnd('2026-Q9')).toBeNull();
    });

    it('sorts a quarterly reading alongside the last month it covers', () => {
        // The point of using the period END: Q4 must not look three months
        // older than December when ordering by date.
        expect(iso(periodEnd('2025-Q4'))).toBe(iso(periodEnd('2025-12')));
    });
});

describe('periodLabel', () => {
    it('reduces a full date to its month, to fit the column and dedupe', () => {
        expect(periodLabel('2026-03-15')).toBe('2026-03');
    });

    it('leaves short labels untouched', () => {
        expect(periodLabel('2026-01')).toBe('2026-01');
        expect(periodLabel('2025-Q4')).toBe('2025-Q4');
    });

    it('never exceeds the 8-character column width', () => {
        for (const label of ['2026-03-15', '2025-Q4', '2026-01', '2025']) {
            expect(periodLabel(label).length).toBeLessThanOrEqual(8);
        }
    });
});
