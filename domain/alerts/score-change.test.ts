import { describe, expect, it } from 'vitest';

import { MIN_DELTA, describeChange, detectScoreChanges, severityFor } from './score-change';

describe('severityFor', () => {
    it('escalates with the size of the move', () => {
        expect(severityFor(5, false)).toBe('NORMAL');
        expect(severityFor(10, false)).toBe('HIGH');
        expect(severityFor(15, false)).toBe('CRITICAL');
    });

    it('raises a small move that flips the verdict', () => {
        // 5 points is normally NORMAL, but crossing a boundary changes the
        // recommendation the user acts on.
        expect(severityFor(5, true)).toBe('HIGH');
    });
});

describe('detectScoreChanges', () => {
    it('ignores moves below the noise floor', () => {
        const changes = detectScoreChanges({ USD: 50 }, { USD: 50 + MIN_DELTA - 0.1 });
        expect(changes).toEqual([]);
    });

    it('reports a move at or above the floor', () => {
        const changes = detectScoreChanges({ USD: 50 }, { USD: 56 });
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({ currencyCode: 'USD', delta: 6, previous: 50, current: 56 });
    });

    it('reports falls as well as rises', () => {
        const changes = detectScoreChanges({ EUR: 60 }, { EUR: 48 });
        expect(changes[0]?.delta).toBe(-12);
        expect(changes[0]?.severity).toBe('HIGH');
    });

    it('emits nothing for a currency with no previous snapshot', () => {
        // First run must not fire an alert for every currency at once.
        expect(detectScoreChanges({}, { USD: 70, EUR: 40 })).toEqual([]);
    });

    it('ignores a currency that disappeared from the current set', () => {
        expect(detectScoreChanges({ USD: 50 }, {})).toEqual([]);
    });

    it('flags a verdict crossing', () => {
        // 44 -> 52 crosses the 45 boundary (Vente -> Neutre).
        const [change] = detectScoreChanges({ GBP: 44 }, { GBP: 52 });
        expect(change?.crossedVerdict).toBe(true);
        expect(change?.severity).toBe('HIGH');
    });

    it('does not flag a move that stays inside one band', () => {
        const [change] = detectScoreChanges({ GBP: 46 }, { GBP: 54 });
        expect(change?.crossedVerdict).toBe(false);
        expect(change?.severity).toBe('NORMAL');
    });

    it('sorts the largest move first', () => {
        const changes = detectScoreChanges(
            { USD: 50, EUR: 50, JPY: 50 },
            { USD: 57, EUR: 30, JPY: 62 },
        );
        expect(changes.map(c => c.currencyCode)).toEqual(['EUR', 'JPY', 'USD']);
    });

    it('rounds the delta to one decimal', () => {
        const [change] = detectScoreChanges({ USD: 50 }, { USD: 55.25 });
        expect(change?.delta).toBe(5.3);
    });

    it('rounds the subtraction result, not the inputs', () => {
        // 55.55 - 50 is 5.549999... in binary floating point, so this rounds to
        // 5.5 rather than the 5.6 decimal arithmetic would give. Immaterial for
        // an alert threshold, and asserted so the behaviour is not mistaken for
        // a bug later: engine scores are whole numbers, so this case does not
        // arise in practice.
        const [change] = detectScoreChanges({ USD: 50 }, { USD: 55.55 });
        expect(change?.delta).toBe(5.5);
    });
});

describe('describeChange', () => {
    it('describes a rise', () => {
        const [change] = detectScoreChanges({ USD: 50 }, { USD: 62 });
        const described = describeChange(change!);
        expect(described.title).toContain('progresse');
        expect(described.title).toContain('+12');
    });

    it('describes a fall', () => {
        const [change] = detectScoreChanges({ USD: 62 }, { USD: 50 });
        expect(describeChange(change!).title).toContain('recule');
    });

    it('mentions the verdict when it changed', () => {
        const [change] = detectScoreChanges({ GBP: 44 }, { GBP: 52 });
        expect(describeChange(change!).message).toContain('verdict');
    });
});
