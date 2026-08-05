import { describe, expect, it } from 'vitest';

import { analyseJournal, type AnalysedTrade } from './analytics';

/** Minutes from a fixed origin, so every fixture reads as a timeline. */
const ORIGIN = Date.UTC(2026, 2, 2, 8, 0, 0); // Monday 2 March 2026, 08:00 UTC

function at(minutes: number): Date {
    return new Date(ORIGIN + minutes * 60_000);
}

function trade(overrides: Partial<AnalysedTrade> & { openedAt: Date }): AnalysedTrade {
    return {
        instrument: 'EUR/USD',
        direction: 'Sell',
        closedAt: new Date(overrides.openedAt.getTime() + 60 * 60_000),
        entryPrice: 1.1,
        stopLoss: null,
        lotSize: 0.1,
        pips: 10,
        pnl: 10,
        pipSize: 0.0001,
        ...overrides,
    };
}

describe('analyseJournal', () => {
    it('counts outcomes, keeping breakeven apart from wins and losses', () => {
        const result = analyseJournal([
            trade({ openedAt: at(0), pnl: 100 }),
            trade({ openedAt: at(60), pnl: -40 }),
            trade({ openedAt: at(120), pnl: 0 }),
        ]);

        expect(result).toMatchObject({
            trades: 3,
            wins: 1,
            losses: 1,
            breakeven: 1,
            net: 60,
            averageWin: 100,
            averageLoss: 40,
            payoffRatio: 2.5,
        });
        // 1 win out of 3 CLOSED trades, breakeven included in the denominator.
        expect(result.winRate).toBe(33);
    });

    it('ignores open trades entirely', () => {
        const result = analyseJournal([
            trade({ openedAt: at(0), pnl: 50 }),
            trade({ openedAt: at(60), closedAt: null, pnl: null }),
        ]);

        expect(result.trades).toBe(1);
        expect(result.net).toBe(50);
    });

    describe('streaks', () => {
        it('finds the longest run of each outcome', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), pnl: -1 }),
                trade({ openedAt: at(10), pnl: -1 }),
                trade({ openedAt: at(20), pnl: -1 }),
                trade({ openedAt: at(30), pnl: 5 }),
                trade({ openedAt: at(40), pnl: 5 }),
                trade({ openedAt: at(50), pnl: -1 }),
            ]);

            expect(result.maxConsecutiveLosses).toBe(3);
            expect(result.maxConsecutiveWins).toBe(2);
        });

        it('lets a breakeven break the streak, as the broker statement does', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), pnl: -1 }),
                trade({ openedAt: at(10), pnl: 0 }),
                trade({ openedAt: at(20), pnl: -1 }),
            ]);

            // A scratch between two losses is not a run of two. The imported
            // history reads P N P×7, and reporting 8 there contradicted the
            // broker's own "max consecutive losses: 7".
            expect(result.maxConsecutiveLosses).toBe(1);
        });
    });

    describe('what follows a result', () => {
        it('reports the position size taken after a loss and after a win', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), pnl: -50, lotSize: 0.1 }),
                trade({ openedAt: at(60), pnl: -50, lotSize: 0.4 }),
                trade({ openedAt: at(120), pnl: 80, lotSize: 0.4 }),
                trade({ openedAt: at(180), pnl: 10, lotSize: 0.1 }),
            ]);

            // Sizes on the trades that FOLLOW a loss: 0.4 then 0.4.
            expect(result.lotAfterLoss).toBe(0.4);
            // And the one following a win: 0.1.
            expect(result.lotAfterWin).toBe(0.1);
        });

        it('reports how long he waits before re-entering', () => {
            const result = analyseJournal([
                // Closes at +60, next opens at +65 -> 5 minutes after a loss.
                trade({ openedAt: at(0), closedAt: at(60), pnl: -50 }),
                trade({ openedAt: at(65), closedAt: at(125), pnl: 90 }),
                // Closes at +125, next opens at +425 -> 300 minutes after a win.
                trade({ openedAt: at(425), closedAt: at(485), pnl: 10 }),
            ]);

            expect(result.reentryMinutesAfterLoss).toBe(5);
            expect(result.reentryMinutesAfterWin).toBe(300);
        });

        it('skips overlapping positions, which are not a reaction to a result', () => {
            const result = analyseJournal([
                // The second opens BEFORE the first closes: both were running.
                trade({ openedAt: at(0), closedAt: at(120), pnl: -50 }),
                trade({ openedAt: at(30), closedAt: at(200), pnl: 20 }),
            ]);

            expect(result.reentryMinutesAfterLoss).toBeNull();
            // The size is still recorded — only the delay is meaningless here.
            expect(result.lotAfterLoss).toBe(0.1);
        });
    });

    describe('hold time', () => {
        it('separates how long winners and losers are held', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), closedAt: at(30), pnl: 100 }),
                trade({ openedAt: at(60), closedAt: at(660), pnl: -40 }),
            ]);

            // Cutting winners at 30 minutes while nursing losers for 10 hours is
            // the pattern this pair exists to expose.
            expect(result.holdMinutesOnWin).toBe(30);
            expect(result.holdMinutesOnLoss).toBe(600);
        });
    });

    describe('planned risk', () => {
        it('expresses the result as a multiple of the stop distance', () => {
            const result = analyseJournal([
                // Stop 20 pips away, result +40 pips -> +2R.
                trade({ openedAt: at(0), entryPrice: 1.1, stopLoss: 1.102, pips: 40, pnl: 400 }),
            ]);

            expect(result.medianRMultiple).toBe(2);
            expect(result.stopLossCoverage).toBe(100);
        });

        it('reports a loss beyond the stop as worse than −1R', () => {
            const result = analyseJournal([
                // Stop 10 pips away, but the loss ran to 25 pips.
                trade({ openedAt: at(0), entryPrice: 1.1, stopLoss: 1.101, pips: -25, pnl: -250 }),
            ]);

            expect(result.medianRMultiple).toBe(-2.5);
        });

        it('excludes trades with no stop rather than guessing a risk', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), entryPrice: 1.1, stopLoss: 1.102, pips: 40, pnl: 400 }),
                trade({ openedAt: at(60), stopLoss: null, pips: 900, pnl: 9000 }),
            ]);

            // The unstopped +900 pip trade cannot dilute the R statistic.
            expect(result.medianRMultiple).toBe(2);
            expect(result.stopLossCoverage).toBe(50);
        });
    });

    describe('breakdowns', () => {
        it('splits by direction, instrument, weekday and broker hour', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), direction: 'Sell', instrument: 'EUR/USD', pnl: 100 }),
                trade({ openedAt: at(60), direction: 'Sell', instrument: 'EUR/USD', pnl: -20 }),
                trade({ openedAt: at(120), direction: 'Buy', instrument: 'GBP/JPY', pnl: -30 }),
            ]);

            expect(result.byDirection).toEqual([
                { key: 'Vente', trades: 2, wins: 1, net: 80, winRate: 50 },
                { key: 'Achat', trades: 1, wins: 0, net: -30, winRate: 0 },
            ]);
            expect(result.byInstrument[0]).toMatchObject({ key: 'EUR/USD', trades: 2 });
            // 2 March 2026 is a Monday; the fixtures all open that day.
            expect(result.byWeekday).toEqual([
                { key: 'Lundi', trades: 3, wins: 1, net: 50, winRate: 33 },
            ]);
            expect(result.byServerHour.map((bucket) => bucket.key)).toEqual(['08h', '09h', '10h']);
        });
    });

    describe('clustered entries', () => {
        it('flags a same-instrument entry within two minutes of the previous', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), instrument: 'NZD/CAD', pnl: -30 }),
                trade({ openedAt: at(0.01), instrument: 'NZD/CAD', pnl: -12 }),
            ]);

            // The imported history holds exactly this: two NZD/CAD opened in the
            // same second, which is one decision, not two.
            expect(result.clusteredEntries).toBe(1);
        });

        it('does not flag a different instrument opened at the same moment', () => {
            const result = analyseJournal([
                trade({ openedAt: at(0), instrument: 'NZD/CAD', pnl: -30 }),
                trade({ openedAt: at(0), instrument: 'EUR/USD', pnl: -12 }),
            ]);

            expect(result.clusteredEntries).toBe(0);
        });
    });

    it('survives an empty journal without dividing by zero', () => {
        const result = analyseJournal([]);

        expect(result).toMatchObject({
            trades: 0,
            winRate: 0,
            net: 0,
            payoffRatio: null,
            medianRMultiple: null,
            stopLossCoverage: 0,
        });
        expect(result.byInstrument).toEqual([]);
    });
});
