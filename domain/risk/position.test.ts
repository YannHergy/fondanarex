import { describe, expect, it } from 'vitest';

import {
    calculatePositionSize,
    calculateRisk,
    priceToPips,
    type InstrumentSpec,
} from './position';

const EURUSD: InstrumentSpec = { symbol: 'EUR/USD', pipSize: 0.0001, contractSize: 100_000 };
const USDJPY: InstrumentSpec = { symbol: 'USD/JPY', pipSize: 0.01, contractSize: 100_000 };

describe('calculateRisk', () => {
    it('computes the amount at risk and the target gain', () => {
        const outcome = calculateRisk({ capital: 10_000, riskPct: 0.4, rr: 5 });
        expect(outcome.riskAmount).toBeCloseTo(40);
        expect(outcome.gainAmount).toBeCloseTo(200);
        expect(outcome.capitalAfterLoss).toBeCloseTo(9_960);
        expect(outcome.capitalAfterWin).toBeCloseTo(10_200);
    });

    it('shrinks the next risk after a loss', () => {
        // Fixed-fractional sizing: the absolute risk falls with the account,
        // which is what makes the scheme survivable.
        const outcome = calculateRisk({ capital: 10_000, riskPct: 1, rr: 2 });
        expect(outcome.nextRiskAfterLoss).toBeLessThan(outcome.riskAmount);
        expect(outcome.nextRiskAfterWin).toBeGreaterThan(outcome.riskAmount);
    });

    it('caps the day at twice the per-trade risk', () => {
        const outcome = calculateRisk({ capital: 10_000, riskPct: 0.5, rr: 3 });
        expect(outcome.dailyMaxLoss).toBeCloseTo(100);
        expect(outcome.dailyMaxTrades).toBe(2);
    });

    it('counts consecutive losses to an 8% drawdown', () => {
        const outcome = calculateRisk({ capital: 10_000, riskPct: 0.4, rr: 5 });
        // 8% of 10 000 is 800; at 40 per trade that is 20 losses.
        expect(outcome.tradesToBreach).toBe(20);
    });

    it('does not divide by zero at zero risk', () => {
        const outcome = calculateRisk({ capital: 10_000, riskPct: 0, rr: 5 });
        expect(outcome.dailyMaxTrades).toBe(0);
        expect(outcome.tradesToBreach).toBe(0);
        expect(Number.isFinite(outcome.riskAmount)).toBe(true);
    });

    it('treats negative capital as zero rather than producing negative risk', () => {
        expect(calculateRisk({ capital: -500, riskPct: 1, rr: 2 }).riskAmount).toBe(0);
    });
});

describe('calculatePositionSize', () => {
    it('derives pip value from the instrument, not a constant', () => {
        // 0.0001 x 100 000 = $10 per pip per lot for a standard major.
        expect(calculatePositionSize(100, 20, EURUSD).pipValuePerLot).toBeCloseTo(10);
        // A JPY pair has a different pip size and therefore a different value.
        expect(calculatePositionSize(100, 20, USDJPY).pipValuePerLot).toBeCloseTo(1000);
    });

    it('sizes lots from risk and stop distance', () => {
        // $200 risk over a 20-pip stop at $10/pip = 1.0 lot.
        const size = calculatePositionSize(200, 20, EURUSD);
        expect(size.lots).toBeCloseTo(1);
        expect(size.lotsRounded).toBeCloseTo(1);
    });

    it('rounds DOWN so the position never exceeds the intended risk', () => {
        // 1.666… lots must become 1.66, not 1.67.
        const size = calculatePositionSize(250, 15, EURUSD);
        expect(size.lots).toBeGreaterThan(1.66);
        expect(size.lotsRounded).toBe(1.66);
        expect(size.actualRisk).toBeLessThanOrEqual(250);
    });

    it('reports the risk actually taken at the rounded size', () => {
        const size = calculatePositionSize(250, 15, EURUSD);
        expect(size.actualRisk).toBeCloseTo(size.lotsRounded * 15 * 10, 2);
    });

    it('returns zero rather than Infinity for a zero stop', () => {
        const size = calculatePositionSize(200, 0, EURUSD);
        expect(size.lots).toBe(0);
        expect(size.lotsRounded).toBe(0);
    });

    it('returns zero for non-positive risk', () => {
        expect(calculatePositionSize(0, 20, EURUSD).lots).toBe(0);
        expect(calculatePositionSize(-50, 20, EURUSD).lots).toBe(0);
    });

    it('honours a different lot step', () => {
        const size = calculatePositionSize(250, 15, EURUSD, 0.1);
        expect(size.lotsRounded).toBe(1.6);
    });
});

describe('priceToPips', () => {
    it('uses the instrument pip size for a major', () => {
        expect(priceToPips(1.1000, 1.1020, EURUSD)).toBeCloseTo(20);
    });

    it('uses the instrument pip size for a JPY pair', () => {
        // The legacy code inferred this from the symbol name containing "JPY".
        expect(priceToPips(150.00, 150.20, USDJPY)).toBeCloseTo(20);
    });

    it('is signed, so direction is preserved', () => {
        expect(priceToPips(1.1020, 1.1000, EURUSD)).toBeCloseTo(-20);
    });

    it('returns zero for a malformed instrument rather than Infinity', () => {
        expect(priceToPips(1, 2, { symbol: 'X', pipSize: 0, contractSize: 1 })).toBe(0);
    });
});
