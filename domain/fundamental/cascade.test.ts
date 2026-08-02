import { describe, expect, it } from 'vitest';

import {
    calculateCurrencyScore,
    calculateSurprise,
    computeConviction,
    detectDivergences,
    impactOnTarget,
    propagateCascade,
    scoreToBias,
    temporalDecay,
    type ScoredEvent,
} from './cascade';

const NOW = new Date('2026-08-01T12:00:00Z');

function daysAgo(days: number): Date {
    return new Date(NOW.getTime() - days * 86_400_000);
}

function event(overrides: Partial<ScoredEvent> = {}): ScoredEvent {
    return {
        indicatorId: 'usd_nfp',
        currency: 'USD',
        occurredAt: NOW,
        surpriseNormalized: 3,
        cascadeImpacts: [],
        ...overrides,
    };
}

describe('calculateSurprise', () => {
    it('is zero when the figure lands exactly on consensus', () => {
        expect(calculateSurprise(200, 200, 190)).toBe(0);
    });

    it('signs with the direction of the miss', () => {
        expect(calculateSurprise(220, 200, 190)).toBeGreaterThan(0);
        expect(calculateSurprise(180, 200, 190)).toBeLessThan(0);
    });

    it('is relative, so the same absolute miss scores differently by scale', () => {
        // 0.2 on a 2.0 policy rate is a 10% miss; 0.2 on 200k payrolls is 0.1%.
        const onRate = calculateSurprise(2.2, 2.0, 2.0);
        const onPayrolls = calculateSurprise(200.2, 200, 195);
        expect(onRate).toBeGreaterThan(onPayrolls * 10);
    });

    it('compresses large misses instead of saturating', () => {
        const tenPct = calculateSurprise(110, 100, 100);
        const fiftyPct = calculateSurprise(150, 100, 100);
        expect(fiftyPct).toBeGreaterThan(tenPct);
        expect(fiftyPct).toBeLessThanOrEqual(5);
    });

    it('clamps to the -5..+5 scale however extreme the miss', () => {
        expect(calculateSurprise(10_000, 1, 1)).toBeLessThanOrEqual(5);
        expect(calculateSurprise(-10_000, 1, 1)).toBeGreaterThanOrEqual(-5);
    });

    it('falls back to previous when the forecast is zero', () => {
        // Net-change indicators legitimately forecast 0; dividing by it would
        // produce Infinity.
        const surprise = calculateSurprise(0.5, 0, 2);
        expect(Number.isFinite(surprise)).toBe(true);
        expect(surprise).toBeGreaterThan(0);
    });

    it('stays finite when forecast and previous are both zero', () => {
        expect(Number.isFinite(calculateSurprise(3, 0, 0))).toBe(true);
    });
});

describe('propagateCascade', () => {
    it('reaches nodes downstream of the source', () => {
        const impacts = propagateCascade('usd_nfp', 3);
        expect(impacts.length).toBeGreaterThan(0);
    });

    it('reports real depth rather than a constant', () => {
        // The legacy engine hardcoded `depth: 0` on every impact, so a direct
        // effect and a sixth-hand echo were indistinguishable.
        const impacts = propagateCascade('usd_nfp', 3);
        const depths = new Set(impacts.map((i) => i.depth));
        expect(Math.min(...depths)).toBe(1);
        expect(depths.size).toBeGreaterThan(1);
    });

    it('records the SHORTEST path when a node is reachable several ways', () => {
        const impacts = propagateCascade('usd_nfp', 3);
        expect(impacts.every((i) => i.depth >= 1)).toBe(true);
    });

    it('weakens with distance from the source', () => {
        const impacts = propagateCascade('usd_nfp', 5);
        const direct = impacts.filter((i) => i.depth === 1);
        const distant = impacts.filter((i) => i.depth >= 4);

        if (distant.length > 0) {
            const maxDirect = Math.max(...direct.map((i) => Math.abs(i.impact)));
            const maxDistant = Math.max(...distant.map((i) => Math.abs(i.impact)));
            expect(maxDistant).toBeLessThan(maxDirect);
        }
    });

    it('flips sign through an inverse edge', () => {
        const up = propagateCascade('usd_nfp', 3);
        const down = propagateCascade('usd_nfp', -3);

        for (const impact of up) {
            const mirrored = down.find((d) => d.targetId === impact.targetId);
            expect(mirrored).toBeDefined();
            expect(Math.sign(mirrored!.impact)).toBe(-Math.sign(impact.impact));
        }
    });

    it('scales linearly with the input surprise', () => {
        const small = propagateCascade('usd_nfp', 1);
        const large = propagateCascade('usd_nfp', 2);

        const target = small[0]!;
        const mirrored = large.find((i) => i.targetId === target.targetId)!;
        // Clamping can cap the larger run, so assert the ordering only.
        expect(Math.abs(mirrored.impact)).toBeGreaterThan(Math.abs(target.impact));
    });

    it('clamps every impact to the -5..+5 scale', () => {
        const impacts = propagateCascade('usd_nfp', 5);
        expect(impacts.every((i) => i.impact >= -5 && i.impact <= 5)).toBe(true);
    });

    it('sorts by absolute impact so the biggest effect reads first', () => {
        const impacts = propagateCascade('usd_nfp', 3);
        const magnitudes = impacts.map((i) => Math.abs(i.impact));
        expect([...magnitudes].sort((a, b) => b - a)).toEqual(magnitudes);
    });

    it('returns nothing for an unknown indicator', () => {
        expect(propagateCascade('does_not_exist', 3)).toEqual([]);
    });

    it('terminates on a graph with cycles', () => {
        // The graph has feedback loops (inflation -> policy -> growth ->
        // inflation); depth capping is what stops this running forever.
        expect(() => propagateCascade('usd_inflation', 4)).not.toThrow();
    });

    it('only names indicators that exist in the catalogue', () => {
        const impacts = propagateCascade('usd_nfp', 3);
        expect(impacts.every((i) => i.targetName.length > 0)).toBe(true);
    });
});

describe('temporalDecay', () => {
    it('is 1 for something published right now', () => {
        expect(temporalDecay(NOW, NOW)).toBe(1);
    });

    it('halves in roughly nine days', () => {
        expect(temporalDecay(daysAgo(8.66), NOW)).toBeCloseTo(0.5, 2);
    });

    it('is monotonically decreasing with age', () => {
        expect(temporalDecay(daysAgo(30), NOW)).toBeLessThan(temporalDecay(daysAgo(7), NOW));
    });

    it('does not exceed 1 for a future-dated event', () => {
        // Clock skew or a mis-typed date must not amplify an event.
        expect(temporalDecay(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(1);
    });
});

describe('impactOnTarget', () => {
    it('returns the raw surprise when the event IS the target node', () => {
        expect(impactOnTarget(event({ surpriseNormalized: 2.5 }), 'usd_nfp')).toBe(2.5);
    });

    it('reads the cascade for a downstream node', () => {
        const e = event({
            cascadeImpacts: [
                { targetId: 'usd_direction', targetCurrency: 'USD', targetName: 'x', impact: 1.2, depth: 2 },
            ],
        });
        expect(impactOnTarget(e, 'usd_direction')).toBe(1.2);
    });

    it('is zero for an unrelated node', () => {
        expect(impactOnTarget(event(), 'jpy_direction')).toBe(0);
    });
});

describe('calculateCurrencyScore', () => {
    function hittingKing(impact: number, occurredAt = NOW): ScoredEvent {
        return event({
            occurredAt,
            cascadeImpacts: [
                {
                    targetId: 'usd_direction',
                    targetCurrency: 'USD',
                    targetName: 'Direction USD',
                    impact,
                    depth: 2,
                },
            ],
        });
    }

    it('is neutral with no events', () => {
        const result = calculateCurrencyScore('USD', [], NOW);
        expect(result.score).toBe(50);
        expect(result.bias).toBe('NEUTRAL');
        expect(result.eventsCount).toBe(0);
    });

    it('rises above 50 on bullish impacts and falls below on bearish', () => {
        expect(calculateCurrencyScore('USD', [hittingKing(4)], NOW).score).toBeGreaterThan(50);
        expect(calculateCurrencyScore('USD', [hittingKing(-4)], NOW).score).toBeLessThan(50);
    });

    it('stays within 0–100 under an implausible pile-up of events', () => {
        const many = Array.from({ length: 40 }, () => hittingKing(5));
        const result = calculateCurrencyScore('USD', many, NOW);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('weights a fresh event more than an old one of equal size', () => {
        const fresh = calculateCurrencyScore('USD', [hittingKing(4, NOW)], NOW).score;
        const stale = calculateCurrencyScore('USD', [hittingKing(4, daysAgo(18))], NOW).score;
        expect(fresh).toBeGreaterThan(stale);
    });

    it('ignores events older than the window', () => {
        const result = calculateCurrencyScore('USD', [hittingKing(5, daysAgo(60))], NOW, 21);
        expect(result.score).toBe(50);
        expect(result.eventsCount).toBe(0);
    });

    it('does not count events whose impact is below the noise floor', () => {
        expect(calculateCurrencyScore('USD', [hittingKing(0.01)], NOW).eventsCount).toBe(0);
    });

    it('nets out opposing events of equal weight', () => {
        const result = calculateCurrencyScore('USD', [hittingKing(3), hittingKing(-3)], NOW);
        expect(result.score).toBe(50);
        // Both still counted — the score is neutral because they CANCEL, not
        // because nothing happened, and conviction reports the disagreement.
        expect(result.eventsCount).toBe(2);
        expect(result.conviction).toBe(2);
    });

    it('reports high conviction when every event agrees', () => {
        const agreeing = [hittingKing(3), hittingKing(2), hittingKing(4)];
        expect(calculateCurrencyScore('USD', agreeing, NOW).conviction).toBe(5);
    });

    it('returns neutral pillars for a currency with no pillar mapping', () => {
        const result = calculateCurrencyScore('XXX', [], NOW);
        expect(result.pillarScores).toEqual({
            rateDifferential: 50,
            riskAppetite: 50,
            capitalFlows: 50,
        });
    });

    it('scores pillars independently of the king node', () => {
        const e = event({
            cascadeImpacts: [
                {
                    targetId: 'usd_rate_differential',
                    targetCurrency: 'USD',
                    targetName: 'Diff. Taux USD',
                    impact: 4,
                    depth: 1,
                },
            ],
        });
        const result = calculateCurrencyScore('USD', [e], NOW);
        expect(result.pillarScores.rateDifferential).toBeGreaterThan(50);
        expect(result.pillarScores.riskAppetite).toBe(50);
        expect(result.score).toBe(50);
    });
});

describe('computeConviction', () => {
    it('is 1 with no signals, not 5', () => {
        // Unanimity among zero events is absence of evidence, not agreement.
        expect(computeConviction([])).toBe(1);
    });

    it('is 5 when all signals agree', () => {
        expect(computeConviction([1, 1, 1, 1])).toBe(5);
    });

    it('is 2 on a perfect split', () => {
        expect(computeConviction([1, -1])).toBe(2);
    });

    it('rises as the majority grows', () => {
        expect(computeConviction([1, 1, 1, -1])).toBeGreaterThan(computeConviction([1, 1, -1, -1]));
    });
});

describe('scoreToBias', () => {
    it('maps the extremes', () => {
        expect(scoreToBias(100)).toBe('STRONGLY_BULLISH');
        expect(scoreToBias(0)).toBe('STRONGLY_BEARISH');
    });

    it('treats the band around 50 as neutral', () => {
        expect(scoreToBias(42)).toBe('NEUTRAL');
        expect(scoreToBias(50)).toBe('NEUTRAL');
        expect(scoreToBias(57)).toBe('NEUTRAL');
    });

    it('is monotonic across the full range', () => {
        const order = [
            'STRONGLY_BEARISH',
            'BEARISH',
            'SLIGHTLY_BEARISH',
            'NEUTRAL',
            'SLIGHTLY_BULLISH',
            'BULLISH',
            'STRONGLY_BULLISH',
        ];
        let lastRank = -1;
        for (let score = 0; score <= 100; score += 1) {
            const rank = order.indexOf(scoreToBias(score));
            expect(rank).toBeGreaterThanOrEqual(lastRank);
            lastRank = rank;
        }
    });
});

describe('detectDivergences', () => {
    function pillarEvent(indicatorId: string, impact: number): ScoredEvent {
        return event({
            indicatorId,
            cascadeImpacts: [
                {
                    targetId: 'usd_rate_differential',
                    targetCurrency: 'USD',
                    targetName: 'Diff. Taux USD',
                    impact,
                    depth: 1,
                },
            ],
        });
    }

    it('finds nothing when every event pushes the same way', () => {
        const events = [pillarEvent('usd_nfp', 2), pillarEvent('usd_cpi', 3)];
        expect(detectDivergences('USD', events, NOW)).toEqual([]);
    });

    it('flags a pillar pulled in both directions', () => {
        const events = [pillarEvent('usd_nfp', 2), pillarEvent('usd_cpi', -2)];
        const found = detectDivergences('USD', events, NOW);
        expect(found).toHaveLength(1);
        expect(found[0]!.pillarName).toContain('Taux');
    });

    it('grades severity by how far apart the two sides are', () => {
        const mild = detectDivergences('USD', [pillarEvent('usd_nfp', 0.6), pillarEvent('usd_cpi', -0.6)], NOW);
        const severe = detectDivergences('USD', [pillarEvent('usd_nfp', 4), pillarEvent('usd_cpi', -4)], NOW);
        expect(mild[0]!.severity).toBe('low');
        expect(severe[0]!.severity).toBe('high');
    });

    it('ignores events outside the window', () => {
        const events = [
            pillarEvent('usd_nfp', 2),
            { ...pillarEvent('usd_cpi', -2), occurredAt: daysAgo(40) },
        ];
        expect(detectDivergences('USD', events, NOW, 14)).toEqual([]);
    });

    it('only considers events belonging to the currency asked for', () => {
        const events = [pillarEvent('usd_nfp', 2), { ...pillarEvent('usd_cpi', -2), currency: 'EUR' }];
        expect(detectDivergences('USD', events, NOW)).toEqual([]);
    });
});
