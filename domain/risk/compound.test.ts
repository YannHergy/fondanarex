import { describe, expect, it } from 'vitest';

import { maxViableRiskPct, simulateCompound, type CompoundInputs } from './compound';

const base: CompoundInputs = {
    capital: 10_000,
    riskPct: 0.4,
    rr: 6,
    winRatePct: 35,
    tradesPerWeek: 10,
    months: 6,
    targetPct: 8,
    maxDrawdownPct: 8,
    dailyDrawdownPct: 0.8,
};

describe('simulateCompound', () => {
    it('returns one capital point per month plus the start', () => {
        const result = simulateCompound(base);
        expect(result.monthlyCapital).toHaveLength(base.months + 1);
        expect(result.monthlyCapital[0]).toBe(base.capital);
    });

    it('grows the account when the edge is positive', () => {
        const result = simulateCompound(base);
        expect(result.geometricFactor).toBeGreaterThan(1);
        expect(result.finalCapital).toBeGreaterThan(base.capital);
    });

    it('separates arithmetic expectancy from geometric growth', () => {
        // The case the screen exists to expose: expectancy is positive, yet
        // the account shrinks, because losses compound multiplicatively.
        // 40% per trade at 3R and a 35% win rate: expectancy is +0.16 per
        // trade, but the geometric factor is below 1, so the curve falls.
        const overSized = simulateCompound({
            ...base,
            riskPct: 40,
            rr: 3,
            winRatePct: 35,
        });
        expect(overSized.expectancy).toBeGreaterThan(0);
        expect(overSized.geometricFactor).toBeLessThan(1);
        expect(overSized.finalCapital).toBeLessThan(base.capital);
    });

    it('reports no path to target when growth is not upward', () => {
        // Promising a finite trade count here would promise a target that
        // never arrives.
        const losing = simulateCompound({ ...base, winRatePct: 5 });
        expect(losing.geometricFactor).toBeLessThan(1);
        expect(losing.tradesToTarget).toBeNull();
        expect(losing.weeksToTarget).toBeNull();
    });

    it('computes trades and weeks to target when it grows', () => {
        const result = simulateCompound(base);
        expect(result.tradesToTarget).toBeGreaterThan(0);
        expect(result.weeksToTarget).toBe(
            Math.ceil(result.tradesToTarget! / base.tradesPerWeek),
        );
    });

    it('counts consecutive losses to the drawdown limit', () => {
        const result = simulateCompound({ ...base, riskPct: 1, maxDrawdownPct: 8 });
        // ln(0.92)/ln(0.99) ≈ 8.3 -> 8 losses.
        expect(result.tradesToBreachDrawdown).toBe(8);
    });

    it('caps daily trades by the daily drawdown allowance', () => {
        const result = simulateCompound({ ...base, riskPct: 0.4, dailyDrawdownPct: 0.8 });
        expect(result.dailyMaxTrades).toBe(2);
    });

    it('handles zero months as no growth', () => {
        const result = simulateCompound({ ...base, months: 0 });
        expect(result.finalCapital).toBe(base.capital);
        expect(result.totalProfit).toBe(0);
    });

    it('reports monthly profit per month', () => {
        const result = simulateCompound(base);
        expect(result.monthlyProfit).toHaveLength(base.months);
        for (const profit of result.monthlyProfit) expect(profit).toBeGreaterThan(0);
    });

    it('does not divide by zero at zero capital', () => {
        const result = simulateCompound({ ...base, capital: 0 });
        expect(Number.isFinite(result.profitPct)).toBe(true);
        expect(result.multiple).toBe(0);
    });

    it('clamps progress to 100', () => {
        const result = simulateCompound({ ...base, months: 60, targetPct: 1 });
        expect(result.progressPct).toBe(100);
    });
});

describe('maxViableRiskPct', () => {
    it('finds a risk below which the account still compounds upward', () => {
        const max = maxViableRiskPct(3, 35);
        expect(max).toBeGreaterThan(0);

        const viable = simulateCompound({ ...base, rr: 3, winRatePct: 35, riskPct: max });
        expect(viable.geometricFactor).toBeGreaterThan(1);
    });

    it('returns zero when no risk size makes the edge viable', () => {
        // A 10% win rate at 1:1 cannot compound at any size.
        expect(maxViableRiskPct(1, 10)).toBe(0);
    });

    it('allows larger sizing for a stronger edge', () => {
        expect(maxViableRiskPct(6, 50)).toBeGreaterThan(maxViableRiskPct(2, 50));
    });
});
