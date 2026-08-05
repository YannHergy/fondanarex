import { describe, expect, it } from 'vitest';

import { GRADERS } from './grading';

describe('GRADERS', () => {
    describe('expectancy', () => {
        it('grades on the sign, which is the only natural cut point', () => {
            expect(GRADERS.expectancy(4.05)).toBe('good');
            expect(GRADERS.expectancy(0)).toBe('neutral');
            expect(GRADERS.expectancy(-1)).toBe('bad');
            expect(GRADERS.expectancy(null)).toBeNull();
        });
    });

    describe('sqn', () => {
        it("keeps Van Tharp's published bands", () => {
            expect(GRADERS.sqn(3)).toBe('good');
            expect(GRADERS.sqn(2)).toBe('neutral');
            // The imported journal scores 1.17 — below the 1.5 line.
            expect(GRADERS.sqn(1.17)).toBe('bad');
        });

        it('treats the boundaries as inclusive on the good side', () => {
            expect(GRADERS.sqn(2.5)).toBe('good');
            expect(GRADERS.sqn(1.5)).toBe('neutral');
        });
    });

    describe('clustering', () => {
        it('judges the GAP to the base rate, never the level', () => {
            // 71% losing after a loss when 72% lose overall is not clustering,
            // however high 71% looks on its own.
            expect(GRADERS.clustering(71, 72)).toBe('good');
            expect(GRADERS.clustering(80, 72)).toBe('neutral');
            expect(GRADERS.clustering(92, 72)).toBe('bad');
        });

        it('does not punish a high base rate by itself', () => {
            expect(GRADERS.clustering(85, 85)).toBe('good');
        });
    });

    describe('sizingAfterLoss', () => {
        it('rewards holding size or cutting it after a loss', () => {
            // The real journal: 0.14 lots after a loss against 0.19 after a win.
            expect(GRADERS.sizingAfterLoss(0.14, 0.19)).toBe('good');
            expect(GRADERS.sizingAfterLoss(0.2, 0.2)).toBe('good');
        });

        it('flags the martingale reflex', () => {
            expect(GRADERS.sizingAfterLoss(0.5, 0.2)).toBe('bad');
            expect(GRADERS.sizingAfterLoss(0.23, 0.2)).toBe('neutral');
        });

        it('returns null rather than guessing when a side is missing', () => {
            expect(GRADERS.sizingAfterLoss(null, 0.2)).toBeNull();
            expect(GRADERS.sizingAfterLoss(0.2, null)).toBeNull();
            expect(GRADERS.sizingAfterLoss(0.2, 0)).toBeNull();
        });
    });

    describe('holdRatio', () => {
        it('rewards holding winners longer than losers', () => {
            // 22.1 hours on winners against 67 minutes on losers.
            expect(GRADERS.holdRatio(1326, 67)).toBe('good');
        });

        it('flags nursing losers longer than winners', () => {
            expect(GRADERS.holdRatio(30, 600)).toBe('bad');
            expect(GRADERS.holdRatio(90, 60)).toBe('neutral');
        });
    });

    describe('stressGap', () => {
        it('flags a simulated drawdown far worse than the one endured', () => {
            // −195 simulated against −120 endured: the order was kind.
            expect(GRADERS.stressGap(195, 120)).toBe('neutral');
            expect(GRADERS.stressGap(300, 120)).toBe('bad');
            expect(GRADERS.stressGap(130, 120)).toBe('good');
        });

        it('is null when there is no drawdown to compare against', () => {
            expect(GRADERS.stressGap(100, 0)).toBeNull();
            expect(GRADERS.stressGap(null, 100)).toBeNull();
        });
    });

    describe('the rest', () => {
        it('grades the remaining measures on their stated scales', () => {
            expect(GRADERS.sharpe(0.4)).toBe('good');
            expect(GRADERS.sharpe(0.11)).toBe('neutral');
            expect(GRADERS.sortino(0.23)).toBe('neutral');
            expect(GRADERS.payoff(3.52)).toBe('good');
            expect(GRADERS.payoff(0.8)).toBe('bad');
            expect(GRADERS.targetEfficiency(86.66)).toBe('good');
            expect(GRADERS.targetEfficiency(30)).toBe('bad');
            expect(GRADERS.stopCoverage(96)).toBe('good');
            expect(GRADERS.medianR(-1)).toBe('bad');
            expect(GRADERS.recovered(false)).toBe('neutral');
            expect(GRADERS.recovered(true)).toBe('good');
        });

        it('returns null for every measure when the value is missing', () => {
            expect(GRADERS.sharpe(null)).toBeNull();
            expect(GRADERS.sortino(null)).toBeNull();
            expect(GRADERS.payoff(null)).toBeNull();
            expect(GRADERS.medianR(null)).toBeNull();
            expect(GRADERS.targetEfficiency(null)).toBeNull();
            expect(GRADERS.stopCoverage(null)).toBeNull();
        });
    });
});
