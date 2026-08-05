import { describe, expect, it } from 'vitest';

import { computeDeepStats, MIN_TRADES_FOR_DEEP_STATS, type StatTrade } from './deep-stats';

function trade(pnl: number, extra: Partial<StatTrade> = {}): StatTrade {
    return {
        direction: 'Buy',
        entryPrice: 1.1,
        exitPrice: pnl >= 0 ? 1.102 : 1.098,
        stopLoss: 1.098,
        takeProfit: 1.104,
        // 20 pips of stop distance, so R is pips / 20.
        pips: pnl / 5,
        pnl,
        pipSize: 0.0001,
        ...extra,
    };
}

/** Alternating series long enough to clear every internal sample gate. */
function series(values: number[]): StatTrade[] {
    return values.map((value) => trade(value));
}

describe('MIN_TRADES_FOR_DEEP_STATS', () => {
    it('is 30, the gate the analysis is only meaningful above', () => {
        expect(MIN_TRADES_FOR_DEEP_STATS).toBe(30);
    });
});

describe('expectancy', () => {
    it('is the mean result per trade', () => {
        const stats = computeDeepStats(series([100, -50, -50, 100, 0]));
        expect(stats.expectancy).toBe(20);
    });

    it('reports R only once enough trades carry a stop', () => {
        const noStops = series([100, -50, 100]).map((t) => ({ ...t, stopLoss: null }));
        expect(computeDeepStats(noStops).expectancyR).toBeNull();
        expect(computeDeepStats(noStops).sqn).toBeNull();

        // 20 pips of stop, results of +20 and −10 pips -> +1R and −0.5R.
        const stopped = series([100, -50, 100, -50, 100]);
        expect(computeDeepStats(stopped).expectancyR).toBe(0.4);
    });
});

describe('SQN', () => {
    it('rises with sample size for the same distribution of R', () => {
        const short = computeDeepStats(series([100, -50, 100, -50, 100, -50]));
        const long = computeDeepStats(series(Array.from({ length: 60 }, (_, i) => (i % 2 ? -50 : 100))));

        // √N in the numerator: the same edge observed more often scores higher,
        // which is the whole point of Van Tharp's measure.
        expect(long.sqn!).toBeGreaterThan(short.sqn!);
    });

    it('is null when every trade returned exactly the same R', () => {
        // Zero deviation would divide by zero and print Infinity.
        expect(computeDeepStats(series([100, 100, 100, 100, 100])).sqn).toBeNull();
    });
});

describe('risk-adjusted ratios', () => {
    it('penalises only downside deviation in Sortino', () => {
        const stats = computeDeepStats(series([100, 200, -50, 300, -50]));

        // Big winners inflate total volatility but not downside volatility, so
        // Sortino must sit above Sharpe on a positively skewed series.
        expect(stats.sortino!).toBeGreaterThan(stats.sharpe!);
    });

    it('returns null rather than Infinity when nothing was lost', () => {
        expect(computeDeepStats(series([100, 200, 300])).sortino).toBeNull();
    });
});

describe('drawdown', () => {
    it('measures depth and the trades spent under water', () => {
        // Peak +300 at trade 3, trough +100 at trade 5, back above at trade 7.
        const stats = computeDeepStats(series([100, 100, 100, -100, -100, 150, 150]));

        expect(stats.maxDrawdown).toBe(200);
        expect(stats.drawdownDurationTrades).toBe(3);
        expect(stats.drawdownRecovered).toBe(true);
    });

    it('reports a curve still below its high-water mark as unrecovered', () => {
        const stats = computeDeepStats(series([200, -50, -50]));

        expect(stats.maxDrawdown).toBe(100);
        expect(stats.drawdownRecovered).toBe(false);
    });
});

describe('tail risk', () => {
    it('reads VaR as the loss only the worst few exceed', () => {
        const values = Array.from({ length: 100 }, (_, i) => -i);
        const stats = computeDeepStats(series(values));

        // Nearest-rank 5th percentile of −0…−99.
        expect(stats.var95).toBe(-95);
        // CVaR averages everything at or below it, so it is always worse.
        expect(stats.cvar95!).toBeLessThan(stats.var95!);
    });

    it('puts the 99% level beyond the 95% one', () => {
        const stats = computeDeepStats(series(Array.from({ length: 100 }, (_, i) => -i)));
        expect(stats.var99!).toBeLessThan(stats.var95!);
    });
});

describe('Monte-Carlo', () => {
    const values = [120, -40, -40, 200, -60, -30, 90, -40, 150, -50, -35, 80];

    it('is deterministic — the same journal always stresses identically', () => {
        const first = computeDeepStats(series(values)).monteCarlo;
        const second = computeDeepStats(series(values)).monteCarlo;

        // Seeded, not Math.random: a stress test that moved on every run could
        // neither be quoted to the user nor asserted here.
        expect(first).toEqual(second);
    });

    it('finds a worse case than the order that actually happened', () => {
        const stats = computeDeepStats(series(values));
        const mc = stats.monteCarlo!;

        expect(mc.iterations).toBe(5000);
        // Reshuffling clusters the losses somewhere, so the realistic bad case
        // must be at least as deep as the history that did occur.
        expect(mc.p95MaxDrawdown).toBeGreaterThanOrEqual(stats.maxDrawdown);
        expect(mc.worstMaxDrawdown).toBeGreaterThanOrEqual(mc.p95MaxDrawdown);
        expect(mc.medianMaxDrawdown).toBeLessThanOrEqual(mc.p95MaxDrawdown);
    });

    it('is null for a journal too short to reshuffle', () => {
        expect(computeDeepStats(series([50])).monteCarlo).toBeNull();
    });
});

describe('autocorrelation', () => {
    it('detects losses clustering beyond the base rate', () => {
        // L L L L W W W W. Four transitions follow a loss (the last one lands
        // on the first win), and three of them lost: 75% against a 50% base.
        const stats = computeDeepStats(series([-10, -10, -10, -10, 10, 10, 10, 10]));

        expect(stats.autocorrelation.lossAfterLoss).toBe(75);
        expect(stats.autocorrelation.baseLossRate).toBe(50);
        expect(stats.autocorrelation.sampleAfterLoss).toBe(4);
        expect(stats.autocorrelation.winAfterWin).toBe(100);
    });

    it('shows no clustering on a strictly alternating series', () => {
        const stats = computeDeepStats(series([-10, 10, -10, 10, -10, 10]));

        expect(stats.autocorrelation.lossAfterLoss).toBe(0);
        expect(stats.autocorrelation.winAfterWin).toBe(0);
    });

    it('drops breakeven trades, which are neither outcome', () => {
        const stats = computeDeepStats(series([-10, 0, -10, 10]));

        // The scratch is removed before pairing, so the two losses are adjacent.
        expect(stats.autocorrelation.sampleAfterLoss).toBe(2);
    });
});

describe('target efficiency', () => {
    it('compares the realised move to the move that was planned', () => {
        // Entry 1.1, target 1.104 (40 pips), exit 1.102 (20 pips) -> 50%.
        const stats = computeDeepStats([
            trade(100, { entryPrice: 1.1, takeProfit: 1.104, exitPrice: 1.102 }),
        ]);

        expect(stats.targetEfficiency).toBe(50);
        expect(stats.targetEfficiencySample).toBe(1);
    });

    it('handles a sell, where the profitable direction is downward', () => {
        const stats = computeDeepStats([
            trade(100, {
                direction: 'Sell',
                entryPrice: 1.1,
                takeProfit: 1.096,
                exitPrice: 1.098,
            }),
        ]);

        expect(stats.targetEfficiency).toBe(50);
    });

    it('measures winners only, since a loser says nothing about exits', () => {
        const stats = computeDeepStats([
            trade(100, { entryPrice: 1.1, takeProfit: 1.104, exitPrice: 1.102 }),
            trade(-100, { entryPrice: 1.1, takeProfit: 1.104, exitPrice: 1.098 }),
        ]);

        expect(stats.targetEfficiencySample).toBe(1);
    });

    it('is null when no target was set', () => {
        const stats = computeDeepStats(series([100, 200]).map((t) => ({ ...t, takeProfit: null })));

        expect(stats.targetEfficiency).toBeNull();
        expect(stats.targetEfficiencySample).toBe(0);
    });
});

describe('empty journal', () => {
    it('returns zeros and nulls without dividing by zero', () => {
        const stats = computeDeepStats([]);

        expect(stats).toMatchObject({
            trades: 0,
            expectancy: 0,
            expectancyR: null,
            sqn: null,
            sharpe: null,
            maxDrawdown: 0,
            monteCarlo: null,
            targetEfficiency: null,
        });
    });
});
