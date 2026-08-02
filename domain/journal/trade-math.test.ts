import { describe, expect, it } from 'vitest';

import {
    netPnl,
    pipValuePerLot,
    plannedRR,
    realisedRR,
    stopAndTargetSane,
    tradeOutcome,
    tradePips,
    tradePnl,
} from './trade-math';

const EURUSD = { symbol: 'EUR/USD', pipSize: 0.0001, contractSize: 100_000 };
const USDJPY = { symbol: 'USD/JPY', pipSize: 0.01, contractSize: 100_000 };
const GBPNOK = { symbol: 'GBP/NOK', pipSize: 0.0001, contractSize: 100_000 };

describe('tradePips', () => {
    it('counts a winning buy as positive', () => {
        expect(tradePips('Buy', 1.085, 1.09, EURUSD)).toBe(50);
    });

    it('counts a losing buy as negative', () => {
        expect(tradePips('Buy', 1.09, 1.085, EURUSD)).toBe(-50);
    });

    it('inverts the sign for a sell', () => {
        expect(tradePips('Sell', 1.09, 1.085, EURUSD)).toBe(50);
        expect(tradePips('Sell', 1.085, 1.09, EURUSD)).toBe(-50);
    });

    it('uses the instrument pip size rather than the symbol name', () => {
        // The legacy rule was `pair.includes('JPY') ? 100 : 10000`, which
        // reads the name instead of the spec.
        expect(tradePips('Buy', 150.0, 150.5, USDJPY)).toBe(50);
    });

    it('is zero for a trade with no exit yet', () => {
        // A blank exit treated as 0.0 would post the whole entry price as a
        // loss — about 10 850 pips on EUR/USD.
        expect(tradePips('Buy', 1.085, null, EURUSD)).toBe(0);
    });

    it('is zero for a missing entry', () => {
        expect(tradePips('Buy', 0, 1.09, EURUSD)).toBe(0);
    });

    it('is zero when the instrument has no pip size', () => {
        expect(tradePips('Buy', 1.085, 1.09, { ...EURUSD, pipSize: 0 })).toBe(0);
    });

    it('is symmetric: a buy and a sell over the same move are opposites', () => {
        const buy = tradePips('Buy', 1.085, 1.0912, EURUSD);
        const sell = tradePips('Sell', 1.085, 1.0912, EURUSD);
        expect(buy).toBe(-sell);
    });
});

describe('pipValuePerLot', () => {
    it('is 10 quote units for a standard-lot major', () => {
        expect(pipValuePerLot(EURUSD)).toBeCloseTo(10, 6);
    });

    it('is 1000 quote units for a JPY pair — not 10', () => {
        // The legacy flat "1 pip = 10 USD" understates a USD/JPY lot by 100x
        // in yen terms; converted at ~150 it is still about 6.7 USD, not 10.
        expect(pipValuePerLot(USDJPY)).toBeCloseTo(1000, 6);
    });
});

describe('tradePnl', () => {
    it('values a 50-pip win on one lot at 500 quote units', () => {
        expect(tradePnl(50, 1, EURUSD)).toBe(500);
    });

    it('scales with lot size', () => {
        expect(tradePnl(50, 0.1, EURUSD)).toBe(50);
        expect(tradePnl(50, 2.5, EURUSD)).toBe(1250);
    });

    it('carries the sign of the pip result', () => {
        expect(tradePnl(-30, 1, EURUSD)).toBe(-300);
    });

    it('converts the quote currency when a rate is supplied', () => {
        // GBP/NOK pays in NOK; an account in GBP needs the conversion the
        // legacy flat rate could not express.
        const inNok = tradePnl(50, 1, GBPNOK);
        const inGbp = tradePnl(50, 1, GBPNOK, 0.075);
        expect(inNok).toBe(500);
        expect(inGbp).toBe(37.5);
    });

    it('defaults to no conversion', () => {
        expect(tradePnl(50, 1, EURUSD, 1)).toBe(tradePnl(50, 1, EURUSD));
    });
});

describe('netPnl', () => {
    it('applies commission and swap', () => {
        expect(netPnl(500, -7, -2.5)).toBe(490.5);
    });

    it('treats missing costs as zero', () => {
        expect(netPnl(500, null, null)).toBe(500);
    });

    it('can turn a gross win into a net loss', () => {
        expect(netPnl(5, -7, -1)).toBe(-3);
    });
});

describe('realisedRR', () => {
    it('is 2 when the gain was twice the risk', () => {
        // Stop 25 pips away, exit 50 pips in profit.
        expect(realisedRR('Buy', 1.085, 1.09, 1.0825, EURUSD)).toBe(2);
    });

    it('is negative on a loss', () => {
        expect(realisedRR('Buy', 1.085, 1.0825, 1.0825, EURUSD)).toBe(-1);
    });

    it('measures against the original stop, not the exit', () => {
        // Closing early for a small gain does not retroactively make the trade
        // less risky than it was.
        expect(realisedRR('Buy', 1.085, 1.0855, 1.0825, EURUSD)).toBe(0.2);
    });

    it('is null with no stop to divide by', () => {
        expect(realisedRR('Buy', 1.085, 1.09, null, EURUSD)).toBeNull();
    });

    it('is null for a trade still open', () => {
        expect(realisedRR('Buy', 1.085, null, 1.0825, EURUSD)).toBeNull();
    });

    it('is null when the stop sits on the entry', () => {
        expect(realisedRR('Buy', 1.085, 1.09, 1.085, EURUSD)).toBeNull();
    });

    it('works for a sell', () => {
        expect(realisedRR('Sell', 1.09, 1.085, 1.0925, EURUSD)).toBe(2);
    });
});

describe('plannedRR', () => {
    it('is the target distance over the stop distance', () => {
        expect(plannedRR('Buy', 1.085, 1.0825, 1.09, EURUSD)).toBe(2);
    });

    it('works for a sell', () => {
        expect(plannedRR('Sell', 1.09, 1.0925, 1.085, EURUSD)).toBe(2);
    });

    it('is null when either level is missing', () => {
        expect(plannedRR('Buy', 1.085, null, 1.09, EURUSD)).toBeNull();
        expect(plannedRR('Buy', 1.085, 1.0825, null, EURUSD)).toBeNull();
    });
});

describe('stopAndTargetSane', () => {
    it('accepts a correctly placed buy', () => {
        expect(stopAndTargetSane('Buy', 1.085, 1.0825, 1.09)).toEqual({
            stopOk: true,
            targetOk: true,
        });
    });

    it('accepts a correctly placed sell', () => {
        expect(stopAndTargetSane('Sell', 1.09, 1.0925, 1.085)).toEqual({
            stopOk: true,
            targetOk: true,
        });
    });

    it('flags a buy whose stop is above the entry', () => {
        // A typo, not a strategy — and it inverts every RR derived from it.
        expect(stopAndTargetSane('Buy', 1.085, 1.09, 1.095).stopOk).toBe(false);
    });

    it('flags a sell whose target is above the entry', () => {
        expect(stopAndTargetSane('Sell', 1.09, 1.0925, 1.095).targetOk).toBe(false);
    });

    it('does not complain about levels that were not set', () => {
        expect(stopAndTargetSane('Buy', 1.085, null, null)).toEqual({
            stopOk: true,
            targetOk: true,
        });
    });
});

describe('tradeOutcome', () => {
    const closed = new Date('2026-08-01T12:00:00Z');

    it('classifies a closed trade by its net result', () => {
        expect(tradeOutcome(closed, 120)).toBe('win');
        expect(tradeOutcome(closed, -80)).toBe('loss');
        expect(tradeOutcome(closed, 0)).toBe('breakeven');
    });

    it('is open with no close date', () => {
        expect(tradeOutcome(null, 120)).toBe('open');
    });

    it('is open when closed but not yet valued', () => {
        expect(tradeOutcome(closed, null)).toBe('open');
    });
});
