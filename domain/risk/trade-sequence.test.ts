import { describe, expect, it } from 'vitest';

import { projectSequence, type SequenceInputs } from './trade-sequence';

function inputs(overrides: Partial<SequenceInputs> = {}): SequenceInputs {
    return {
        initialCapital: 10_000,
        riskPct: 1,
        rr: 2,
        winRatePct: 50,
        maxDDPct: 10,
        targetPct: 8,
        tradesPerWeek: 4,
        tradeCount: 40,
        ...overrides,
    };
}

describe('projectSequence', () => {
    it('starts at the initial capital with no trade', () => {
        const result = projectSequence(inputs());
        expect(result.points[0]).toMatchObject({ index: 0, capital: 10_000, win: null });
    });

    it('produces one point per trade plus the start', () => {
        const result = projectSequence(inputs({ tradeCount: 10, maxDDPct: 100, targetPct: null }));
        expect(result.points).toHaveLength(11);
    });

    it('computes the breach and target levels from the STARTING capital', () => {
        // Not from the running capital: a funded programme measures drawdown
        // against the balance you began with.
        const result = projectSequence(inputs());
        expect(result.breachLevel).toBe(9_000);
        expect(result.targetLevel).toBe(10_800);
    });

    it('has no target level when there is no target', () => {
        expect(projectSequence(inputs({ targetPct: null })).targetLevel).toBeNull();
    });

    it('is deterministic — the same inputs give the same path', () => {
        // A projection that changes on every render cannot be reasoned about.
        const a = projectSequence(inputs());
        const b = projectSequence(inputs());
        expect(a.points.map((p) => p.capital)).toEqual(b.points.map((p) => p.capital));
    });

    it('interleaves wins and losses rather than front-loading them', () => {
        // Ordering decides whether the same set of results breaches or not, so
        // clustering every win first would flatter the projection enormously.
        const result = projectSequence(
            inputs({ winRatePct: 50, tradeCount: 8, maxDDPct: 100, targetPct: null }),
        );
        const outcomes = result.points.slice(1).map((p) => p.win);
        expect(outcomes.filter(Boolean)).toHaveLength(4);
        // No run of four identical results in eight trades at 50 %.
        expect(outcomes.slice(0, 4).every((w) => w === outcomes[0])).toBe(false);
    });

    it('honours the win rate over the whole sequence', () => {
        const result = projectSequence(
            inputs({ winRatePct: 25, tradeCount: 100, maxDDPct: 100, targetPct: null }),
        );
        expect(result.wins).toBe(25);
        expect(result.losses).toBe(75);
    });

    it('never wins at a 0 % rate and never loses at 100 %', () => {
        const never = projectSequence(
            inputs({ winRatePct: 0, tradeCount: 20, maxDDPct: 100, targetPct: null }),
        );
        expect(never.wins).toBe(0);

        const always = projectSequence(
            inputs({ winRatePct: 100, tradeCount: 20, maxDDPct: 100, targetPct: null }),
        );
        expect(always.losses).toBe(0);
    });

    it('stops at a breach rather than simulating trades that could not be taken', () => {
        // The programme closes the account; continuing would describe fiction.
        const result = projectSequence(
            inputs({ winRatePct: 0, riskPct: 2, maxDDPct: 10, tradeCount: 100 }),
        );
        expect(result.breachedAt).not.toBeNull();
        expect(result.points).toHaveLength(result.breachedAt! + 1);
        expect(result.finalCapital).toBeLessThanOrEqual(result.breachLevel);
    });

    it('does not breach on a winning sequence', () => {
        const result = projectSequence(inputs({ winRatePct: 100, targetPct: null }));
        expect(result.breachedAt).toBeNull();
    });

    it('records when the target was reached, in trades and weeks', () => {
        const result = projectSequence(
            inputs({ winRatePct: 100, riskPct: 1, rr: 2, targetPct: 8, tradesPerWeek: 4 }),
        );
        // Each win adds 2 % of 10 000 = 200; the target is +800, so four wins.
        expect(result.tradesToTarget).toBe(4);
        expect(result.weeksToTarget).toBe(1);
    });

    it('reports no target reached when it never is', () => {
        const result = projectSequence(
            inputs({ winRatePct: 0, targetPct: 8, maxDDPct: 100, tradeCount: 5 }),
        );
        expect(result.reachedTargetAt).toBeNull();
        expect(result.weeksToTarget).toBeNull();
    });

    it('sizes off the starting capital by default', () => {
        // Fixed sizing is the honest default: most funded programmes size
        // against the initial balance.
        const flat = projectSequence(
            inputs({ winRatePct: 100, tradeCount: 2, targetPct: null, riskPct: 1, rr: 1 }),
        );
        expect(flat.points[1]!.capital).toBe(10_100);
        expect(flat.points[2]!.capital).toBe(10_200);
    });

    it('compounds when asked, which grows the risk with equity', () => {
        const compounded = projectSequence(
            inputs({
                winRatePct: 100,
                tradeCount: 2,
                targetPct: null,
                riskPct: 1,
                rr: 1,
                compound: true,
            }),
        );
        expect(compounded.points[1]!.capital).toBe(10_100);
        expect(compounded.points[2]!.capital).toBe(10_201);
    });

    it('tracks drawdown from the running peak', () => {
        const result = projectSequence(
            inputs({ winRatePct: 50, tradeCount: 20, maxDDPct: 100, targetPct: null }),
        );
        expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
        expect(result.peak).toBeGreaterThanOrEqual(result.finalCapital - 0.01);
    });

    it('assigns trades to weeks', () => {
        const result = projectSequence(
            inputs({ tradesPerWeek: 5, tradeCount: 12, maxDDPct: 100, targetPct: null }),
        );
        expect(result.points[5]!.week).toBe(1);
        expect(result.points[6]!.week).toBe(2);
        expect(result.points[12]!.week).toBe(3);
    });

    it('does not divide by zero with no trades per week', () => {
        const result = projectSequence(
            inputs({ tradesPerWeek: 0, tradeCount: 5, maxDDPct: 100, targetPct: null }),
        );
        expect(result.points.every((p) => p.week === 0)).toBe(true);
        expect(result.weeksToTarget).toBeNull();
    });

    it('handles a zero trade count without throwing', () => {
        const result = projectSequence(inputs({ tradeCount: 0 }));
        expect(result.points).toHaveLength(1);
        expect(result.finalCapital).toBe(10_000);
    });

    it('handles a negative trade count as zero', () => {
        expect(projectSequence(inputs({ tradeCount: -5 })).points).toHaveLength(1);
    });
});
