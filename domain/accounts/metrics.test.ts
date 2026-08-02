import { describe, expect, it } from 'vitest';

import type { EntryType } from '../data/entry-types';
import {
    accountHealth,
    drawdownRemaining,
    drawdownUsedPct,
    expectancyPct,
    riskPerTrade,
    setupsPerWeek,
    targetProgressPct,
    tradesUntilBreach,
    weightedRR,
    weightedWinRate,
    type AccountConfig,
} from './metrics';

function account(partial: Partial<AccountConfig> = {}): AccountConfig {
    return {
        initialCapital: 10_000,
        currentCapital: 10_000,
        tradingCapital: 10_000,
        useRealCapital: true,
        riskPct: 0.4,
        maxDDPct: 8,
        targetPct: 8,
        allowedEntries: ['A2_ENTRY', 'A21_ENTRY'] as EntryType[],
        ...partial,
    };
}

describe('riskPerTrade', () => {
    it('sizes off current capital when trading real capital', () => {
        expect(riskPerTrade(account({ currentCapital: 12_000 }))).toBeCloseTo(48);
    });

    it('sizes off notional capital when the account is traded smaller', () => {
        // A 10k funded account run as a 5k account must risk 5k-sized amounts.
        const config = account({
            initialCapital: 10_000,
            currentCapital: 10_000,
            tradingCapital: 5_000,
            useRealCapital: false,
        });
        expect(riskPerTrade(config)).toBeCloseTo(20);
    });

    it('follows the account down as it loses', () => {
        expect(riskPerTrade(account({ currentCapital: 9_000 }))).toBeCloseTo(36);
    });
});

describe('drawdown', () => {
    it('reports zero used while in profit', () => {
        expect(drawdownUsedPct(account({ currentCapital: 11_000 }))).toBe(0);
    });

    it('reports the share of the allowance consumed', () => {
        // 8% of 10 000 is 800; being 400 down is half of it.
        expect(drawdownUsedPct(account({ currentCapital: 9_600 }))).toBeCloseTo(50);
    });

    it('reports the amount still losable', () => {
        expect(drawdownRemaining(account({ currentCapital: 9_600 }))).toBeCloseTo(400);
    });

    it('goes non-positive once breached', () => {
        expect(drawdownRemaining(account({ currentCapital: 9_100 }))).toBeLessThanOrEqual(0);
    });

    it('counts losing trades until breach at the current risk', () => {
        // 400 of headroom at 38.4 per trade (0.4% of 9 600) is 10 trades.
        expect(tradesUntilBreach(account({ currentCapital: 9_600 }))).toBe(10);
    });

    it('never reports negative trades to breach', () => {
        expect(tradesUntilBreach(account({ currentCapital: 8_000 }))).toBe(0);
    });

    it('does not divide by zero at zero risk', () => {
        expect(tradesUntilBreach(account({ riskPct: 0 }))).toBe(0);
    });
});

describe('targetProgressPct', () => {
    it('is null when no target is set', () => {
        expect(targetProgressPct(account({ targetPct: null }))).toBeNull();
    });

    it('measures progress towards the target', () => {
        // Target is 8% of 10 000 = 800; being 400 up is halfway.
        expect(targetProgressPct(account({ currentCapital: 10_400 }))).toBeCloseTo(50);
    });

    it('clamps to the 0..100 range', () => {
        expect(targetProgressPct(account({ currentCapital: 20_000 }))).toBe(100);
        expect(targetProgressPct(account({ currentCapital: 9_000 }))).toBe(0);
    });
});

describe('setupsPerWeek', () => {
    it('sums expected appearances of the permitted entries', () => {
        // A2 every 3 days = 1.67/wk, A21 every 6 days = 0.83/wk.
        expect(setupsPerWeek(account())).toBeCloseTo(2.5, 1);
    });

    it('is zero when no permitted entry has a measured frequency', () => {
        expect(setupsPerWeek(account({ allowedEntries: ['GOLDEN_ENTRY'] }))).toBe(0);
    });
});

describe('weightedWinRate', () => {
    it('weights by how often each entry appears', () => {
        // A2 (27%, 1.67/wk) and A21 (40%, 0.83/wk): the frequent one dominates.
        const rate = weightedWinRate(account())!;
        expect(rate).toBeGreaterThan(27);
        expect(rate).toBeLessThan(40);
        expect(rate).toBeLessThan((27 + 40) / 2); // below the flat mean
    });

    it('excludes entries with no measured rate rather than scoring them zero', () => {
        const withGolden = weightedWinRate(
            account({ allowedEntries: ['A2_ENTRY', 'A21_ENTRY', 'GOLDEN_ENTRY'] }),
        );
        expect(withGolden).toBe(weightedWinRate(account()));
    });

    it('is null when nothing is measurable', () => {
        expect(weightedWinRate(account({ allowedEntries: ['GOLDEN_ENTRY'] }))).toBeNull();
        expect(weightedWinRate(account({ allowedEntries: [] }))).toBeNull();
    });
});

describe('weightedRR', () => {
    it('weights reward-to-risk by frequency', () => {
        const rr = weightedRR(account())!;
        expect(rr).toBeGreaterThan(7);
        expect(rr).toBeLessThan(8);
    });

    it('is null when no permitted entry has a usable frequency', () => {
        // GOLDEN has an RR but no measured frequency, so it carries no weight.
        expect(weightedRR(account({ allowedEntries: ['GOLDEN_ENTRY'] }))).toBeNull();
    });
});

describe('expectancyPct', () => {
    it('combines weighted win rate and reward-to-risk', () => {
        const expectancy = expectancyPct(account())!;
        expect(Number.isFinite(expectancy)).toBe(true);
    });

    it('is positive for a profitable configuration', () => {
        expect(expectancyPct(account({ allowedEntries: ['A21_ENTRY'] }))!).toBeGreaterThan(0);
    });

    it('returns null rather than a guess when the win rate is unknown', () => {
        // The legacy version fell back to a hardcoded RR of 6, producing a
        // confident-looking expectancy for an account with no data behind it.
        expect(expectancyPct(account({ allowedEntries: ['GOLDEN_ENTRY'] }))).toBeNull();
    });

    it('scales with the risk percentage', () => {
        const small = expectancyPct(account({ riskPct: 0.2 }))!;
        const large = expectancyPct(account({ riskPct: 0.8 }))!;
        expect(Math.abs(large)).toBeGreaterThan(Math.abs(small));
    });
});

describe('accountHealth', () => {
    it('is healthy near the high water mark', () => {
        expect(accountHealth(account({ currentCapital: 10_000 }))).toBe('healthy');
    });

    it('warns past 40% of the allowance', () => {
        expect(accountHealth(account({ currentCapital: 9_600 }))).toBe('warning');
    });

    it('is critical past 75%', () => {
        expect(accountHealth(account({ currentCapital: 9_350 }))).toBe('critical');
    });

    it('is breached once the headroom is gone', () => {
        expect(accountHealth(account({ currentCapital: 9_200 }))).toBe('breached');
    });
});
