import { describe, expect, it } from 'vitest';

import type { CurrencyWithScore } from '../types';
import {
    adjacentWeekStart,
    currenciesInSetups,
    eventsByDay,
    filterEventsByPair,
    getEventInfo,
    isConflicted,
    PUBLISHED_RELEASE_KEYS,
    pairFundamentalBias,
    setupBiasSummary,
    weekEventsFor,
    weekLabel,
    weekStartOf,
    weekdays,
} from './week-plan';

function currency(code: string, total: number, nextReleases: Record<string, string> = {}) {
    return { code, scores: { total }, nextReleases } as unknown as CurrencyWithScore;
}

describe('weekStartOf', () => {
    it('returns the Monday of the week', () => {
        // 2026-08-05 is a Wednesday.
        expect(weekStartOf(new Date('2026-08-05T10:00:00Z'))).toBe('2026-08-03');
    });

    it('treats Monday as its own week start', () => {
        expect(weekStartOf(new Date('2026-08-03T00:00:00Z'))).toBe('2026-08-03');
    });

    it('puts Sunday in the week that just ended, not the one starting', () => {
        // ISO weeks run Monday to Sunday.
        expect(weekStartOf(new Date('2026-08-09T23:00:00Z'))).toBe('2026-08-03');
    });

    it('is stable across the whole of a day', () => {
        const early = weekStartOf(new Date('2026-08-05T00:00:00Z'));
        const late = weekStartOf(new Date('2026-08-05T23:59:59Z'));
        expect(early).toBe(late);
    });

    it('crosses a month boundary', () => {
        // 2026-09-01 is a Tuesday, so its Monday is in August.
        expect(weekStartOf(new Date('2026-09-01T12:00:00Z'))).toBe('2026-08-31');
    });

    it('crosses a year boundary', () => {
        expect(weekStartOf(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12-28');
    });
});

describe('weekdays', () => {
    it('returns Monday through Friday', () => {
        expect(weekdays('2026-08-03')).toEqual([
            '2026-08-03',
            '2026-08-04',
            '2026-08-05',
            '2026-08-06',
            '2026-08-07',
        ]);
    });

    it('crosses a month boundary without gaps', () => {
        expect(weekdays('2026-08-31')).toEqual([
            '2026-08-31',
            '2026-09-01',
            '2026-09-02',
            '2026-09-03',
            '2026-09-04',
        ]);
    });

    it('produces days that all map back to the same week start', () => {
        for (const day of weekdays('2026-08-03')) {
            expect(weekStartOf(new Date(`${day}T12:00:00Z`))).toBe('2026-08-03');
        }
    });
});

describe('adjacentWeekStart', () => {
    it('steps a week in each direction', () => {
        expect(adjacentWeekStart('2026-08-03', 1)).toBe('2026-08-10');
        expect(adjacentWeekStart('2026-08-03', -1)).toBe('2026-07-27');
    });

    it('round-trips', () => {
        expect(adjacentWeekStart(adjacentWeekStart('2026-08-03', 1), -1)).toBe('2026-08-03');
    });

    it('stays correct across a DST transition', () => {
        // Europe springs forward on 2026-03-29. Working in UTC means the week
        // step is exactly seven days regardless.
        expect(adjacentWeekStart('2026-03-23', 1)).toBe('2026-03-30');
    });
});

describe('weekLabel', () => {
    it('names the Monday in French', () => {
        expect(weekLabel('2026-08-03')).toBe('Semaine du 3 août 2026');
    });
});

describe('pairFundamentalBias', () => {
    const currencies = [currency('EUR', 70), currency('USD', 45), currency('GBP', 50)];

    it('is bullish when the base outscores the quote clearly', () => {
        const result = pairFundamentalBias('EUR/USD', currencies);
        expect(result.bias).toBe('Bullish');
        expect(result.baseScore).toBe(70);
        expect(result.quoteScore).toBe(45);
        expect(result.diff).toBe(25);
    });

    it('is bearish when the quote outscores the base clearly', () => {
        expect(pairFundamentalBias('USD/EUR', currencies).bias).toBe('Bearish');
    });

    it('is neutral when the two are scored too closely to mean anything', () => {
        expect(pairFundamentalBias('GBP/USD', currencies).bias).toBe('Neutral');
    });

    it('needs to clear the threshold, not merely differ', () => {
        const close = [currency('AAA', 58), currency('BBB', 50)];
        expect(pairFundamentalBias('AAA/BBB', close).bias).toBe('Neutral');

        const clear = [currency('AAA', 59), currency('BBB', 50)];
        expect(pairFundamentalBias('AAA/BBB', clear).bias).toBe('Bullish');
    });

    it('treats an unknown currency as neutral rather than as zero', () => {
        // Scoring a missing currency 0 would read as a maximally bearish
        // signal for a pair we simply have no data on.
        const result = pairFundamentalBias('XXX/USD', currencies);
        expect(result.baseScore).toBe(50);
        expect(result.bias).toBe('Neutral');
    });

    it('handles a malformed pair without throwing', () => {
        expect(() => pairFundamentalBias('EURUSD', currencies)).not.toThrow();
    });
});

describe('isConflicted', () => {
    it('flags opposing directional reads', () => {
        expect(isConflicted('Bullish', 'Bearish')).toBe(true);
        expect(isConflicted('Bearish', 'Bullish')).toBe(true);
    });

    it('does not flag agreement', () => {
        expect(isConflicted('Bullish', 'Bullish')).toBe(false);
    });

    it('does not treat a neutral read as a conflict', () => {
        // No fundamental opinion is not the same as an opposing one.
        expect(isConflicted('Bullish', 'Neutral')).toBe(false);
        expect(isConflicted('Neutral', 'Bearish')).toBe(false);
    });
});

describe('getEventInfo', () => {
    it('names the known releases and grades their impact', () => {
        expect(getEventInfo('interestRate')).toEqual({
            label: 'Décision taux directeur',
            impact: 'High',
        });
        expect(getEventInfo('pmiServices').impact).toBe('Medium');
    });

    it('falls back to the raw key at low impact', () => {
        expect(getEventInfo('somethingNew')).toEqual({ label: 'somethingNew', impact: 'Low' });
    });

    it('names every key the currency records actually publish', () => {
        // The legacy map missed nfp, corePce, ifo and zew, so they hit the
        // fallback and were graded Low. Silent failure — the screen just
        // showed "nfp · Low" — hence the guard.
        const unmapped = PUBLISHED_RELEASE_KEYS.filter((key) => getEventInfo(key).label === key);
        expect(unmapped).toEqual([]);
    });

    it('grades the headline releases as High', () => {
        for (const key of ['nfp', 'cpi', 'interestRate', 'corePce', 'gdpQoQ'] as const) {
            expect(getEventInfo(key).impact).toBe('High');
        }
    });
});

describe('weekEventsFor', () => {
    const currencies = [
        currency('USD', 50, { interestRate: '2026-08-05', cpi: '2026-08-05', gdpQoQ: '2026-09-01' }),
        currency('EUR', 50, { pmiServices: '2026-08-04' }),
    ];

    it('keeps only releases inside the week', () => {
        const events = weekEventsFor(currencies, '2026-08-03');
        expect(events.map((e) => e.key)).not.toContain('USD-gdpQoQ');
        expect(events).toHaveLength(3);
    });

    it('sorts by date first', () => {
        const events = weekEventsFor(currencies, '2026-08-03');
        expect(events[0]!.date).toBe('2026-08-04');
    });

    it('ranks High above Medium and Medium above Low within a day', () => {
        // The legacy comparator could not tell Medium from Low, and being
        // applied in the same pass as the date sort it reshuffled days.
        const sameDay = [
            currency('USD', 50, { retailSales: '2026-08-05', interestRate: '2026-08-05' }),
            currency('EUR', 50, { unknownKey: '2026-08-05' }),
        ];
        const events = weekEventsFor(sameDay, '2026-08-03');
        expect(events.map((e) => e.impact)).toEqual(['High', 'Medium', 'Low']);
    });

    it('never lets an ordering rule break the date grouping', () => {
        const events = weekEventsFor(currencies, '2026-08-03');
        const dates = events.map((e) => e.date);
        expect([...dates].sort()).toEqual(dates);
    });

    it('is empty for a week with no releases', () => {
        expect(weekEventsFor(currencies, '2026-06-01')).toEqual([]);
    });

    it('tolerates a currency with no release map', () => {
        expect(() => weekEventsFor([currency('USD', 50)], '2026-08-03')).not.toThrow();
    });
});

describe('eventsByDay', () => {
    const events = weekEventsFor(
        [currency('USD', 50, { interestRate: '2026-08-05' }), currency('EUR', 50, { cpi: '2026-08-07' })],
        '2026-08-03',
    );

    it('groups under French day names', () => {
        const grouped = eventsByDay(events, '2026-08-03');
        expect(grouped.map((g) => g.day)).toEqual(['Mercredi', 'Vendredi']);
    });

    it('drops empty days', () => {
        expect(eventsByDay(events, '2026-08-03')).toHaveLength(2);
    });
});

describe('filterEventsByPair', () => {
    const events = weekEventsFor(
        [
            currency('USD', 50, { cpi: '2026-08-05' }),
            currency('EUR', 50, { cpi: '2026-08-05' }),
            currency('JPY', 50, { cpi: '2026-08-05' }),
        ],
        '2026-08-03',
    );

    it('keeps both legs of the pair', () => {
        const filtered = filterEventsByPair(events, 'EUR/USD');
        expect(filtered.map((e) => e.currency).sort()).toEqual(['EUR', 'USD']);
    });

    it('returns everything when no pair is selected', () => {
        expect(filterEventsByPair(events, null)).toHaveLength(3);
    });
});

describe('currenciesInSetups', () => {
    it('deduplicates across pairs', () => {
        expect(currenciesInSetups(['EUR/USD', 'GBP/USD'])).toEqual(['EUR', 'GBP', 'USD']);
    });

    it('is empty for no setups', () => {
        expect(currenciesInSetups([])).toEqual([]);
    });
});

describe('setupBiasSummary', () => {
    it('collapses a unanimous view into one phrase', () => {
        const setups = [
            { instrument: 'EUR/USD', technicalBias: 'Bullish' as const },
            { instrument: 'EUR/GBP', technicalBias: 'Bullish' as const },
        ];
        expect(setupBiasSummary(setups, 'EUR')).toBe('Bullish sur EUR/USD, EUR/GBP');
    });

    it('spells out a split view rather than picking a side', () => {
        const setups = [
            { instrument: 'EUR/USD', technicalBias: 'Bullish' as const },
            { instrument: 'EUR/GBP', technicalBias: 'Bearish' as const },
        ];
        expect(setupBiasSummary(setups, 'EUR')).toBe('Bullish EUR/USD · Bearish EUR/GBP');
    });

    it('is null for a currency no setup touches', () => {
        expect(setupBiasSummary([{ instrument: 'EUR/USD', technicalBias: 'Bullish' }], 'JPY')).toBeNull();
    });
});
