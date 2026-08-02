import { describe, expect, it } from 'vitest';

import {
    getInterpretation,
    getWeeklySummary,
    impactScore,
    type SummarisableEvent,
} from './summary';

function event(partial: Partial<SummarisableEvent> = {}): SummarisableEvent {
    return { impact: null, pipsVariation: null, date: '2026-04-20', ...partial };
}

describe('impactScore', () => {
    it('maps each impact to its weight', () => {
        expect(impactScore('BULLISH_STRONG')).toBe(2);
        expect(impactScore('BULLISH')).toBe(1);
        expect(impactScore('NEUTRAL')).toBe(0);
        expect(impactScore('BEARISH')).toBe(-1);
        expect(impactScore('BEARISH_STRONG')).toBe(-2);
    });

    it('scores an unpublished event as zero', () => {
        expect(impactScore(null)).toBe(0);
    });
});

describe('getWeeklySummary', () => {
    it('counts scheduled events but scores only published ones', () => {
        const summary = getWeeklySummary([
            event({ impact: 'BULLISH' }),
            event(), // scheduled, not yet released
            event(),
        ]);
        expect(summary.totalEvents).toBe(3);
        expect(summary.publishedEvents).toBe(1);
        expect(summary.totalScore).toBe(1);
    });

    it('does not let pending events dilute the week', () => {
        // Adding calendar entries that have not happened must not move the score.
        const withPending = getWeeklySummary([
            event({ impact: 'BULLISH_STRONG' }),
            event(),
            event(),
            event(),
        ]);
        expect(withPending.totalScore).toBe(2);
    });

    it('tallies direction counts', () => {
        const summary = getWeeklySummary([
            event({ impact: 'BULLISH' }),
            event({ impact: 'BULLISH_STRONG' }),
            event({ impact: 'BEARISH' }),
            event({ impact: 'NEUTRAL' }),
        ]);
        expect(summary.bullishCount).toBe(2);
        expect(summary.bearishCount).toBe(1);
        expect(summary.neutralCount).toBe(1);
        expect(summary.totalScore).toBe(2); // 1 + 2 - 1 + 0
    });

    it('sums pips, treating a missing value as zero', () => {
        const summary = getWeeklySummary([
            event({ impact: 'BULLISH', pipsVariation: 40 }),
            event({ impact: 'BEARISH', pipsVariation: null }),
            event({ impact: 'BEARISH', pipsVariation: -15 }),
        ]);
        expect(summary.totalPips).toBe(25);
    });

    it('breaks the week down by day, split into positive and negative', () => {
        const summary = getWeeklySummary([
            event({ impact: 'BULLISH_STRONG', date: '2026-04-20' }),
            event({ impact: 'BEARISH', date: '2026-04-20' }),
            event({ impact: 'BULLISH', date: '2026-04-22' }),
        ]);
        expect(summary.dailyBreakdown).toEqual([
            { date: '2026-04-20', positive: 2, negative: 1 },
            { date: '2026-04-22', positive: 1, negative: 0 },
        ]);
    });

    it('handles an empty week', () => {
        const summary = getWeeklySummary([]);
        expect(summary).toMatchObject({ totalEvents: 0, publishedEvents: 0, totalScore: 0 });
        expect(summary.dailyBreakdown).toEqual([]);
    });
});

describe('getInterpretation', () => {
    const summaryWith = (totalScore: number) =>
        getWeeklySummary(
            Array.from({ length: Math.abs(totalScore) }, () =>
                event({ impact: totalScore > 0 ? 'BULLISH' : 'BEARISH' }),
            ),
        );

    it('says nothing was published when nothing was', () => {
        const result = getInterpretation(getWeeklySummary([event()]), 50);
        expect(result.verdict).toContain('Aucun événement publié');
        expect(result.divergence).toBeNull();
    });

    it('calls a strongly positive week bullish', () => {
        expect(getInterpretation(summaryWith(12), 50).verdict).toContain('HAUSSIÈRE');
    });

    it('calls a strongly negative week bearish', () => {
        expect(getInterpretation(summaryWith(-12), 50).verdict).toContain('BAISSIÈRE');
    });

    it('calls a small move neutral', () => {
        expect(getInterpretation(summaryWith(3), 50).verdict).toContain('NEUTRE');
    });

    it('flags news pushing up against a bearish score', () => {
        const result = getInterpretation(summaryWith(8), 40);
        expect(result.divergence).toContain('baissier');
    });

    it('flags news pushing down against a bullish score', () => {
        const result = getInterpretation(summaryWith(-8), 60);
        expect(result.divergence).toContain('haussier');
    });

    it('reports no divergence when news and score agree', () => {
        expect(getInterpretation(summaryWith(8), 70).divergence).toBeNull();
        expect(getInterpretation(summaryWith(-8), 30).divergence).toBeNull();
    });
});
