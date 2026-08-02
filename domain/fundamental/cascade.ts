// ================================================================
// FUNDAMENTAL ENGINE — surprise, cascade propagation, currency score
//
// A published indicator differs from consensus. That surprise is
// normalised, propagated through the connection graph, and decays
// with age into a 0–100 score per currency.
//
// Pure — no I/O, no clock. Every function that depends on "now"
// takes it as an argument so results are reproducible and testable.
// ================================================================

import {
    FUNDAMENTAL_INDICATORS,
    KING_IDS,
    PILLAR_IDS,
    getIndicatorById,
} from '../data/fundamental-indicators';
import { getOutgoingConnections } from '../data/fundamental-connections';

export type FundamentalBias =
    | 'STRONGLY_BEARISH'
    | 'BEARISH'
    | 'SLIGHTLY_BEARISH'
    | 'NEUTRAL'
    | 'SLIGHTLY_BULLISH'
    | 'BULLISH'
    | 'STRONGLY_BULLISH';

export interface CascadeImpact {
    targetId: string;
    targetCurrency: string;
    targetName: string;
    /** Accumulated impact on the target, clamped to -5..+5 */
    impact: number;
    /** Shortest hop count from the source node. 1 = direct neighbour. */
    depth: number;
}

/** The fields the cascade needs. Persistence adds ids and timestamps. */
export interface ScoredEvent {
    indicatorId: string;
    currency: string;
    /** Day the figure was published, used for time decay */
    occurredAt: Date;
    surpriseNormalized: number;
    cascadeImpacts: CascadeImpact[];
}

export interface PillarScores {
    rateDifferential: number;
    riskAppetite: number;
    capitalFlows: number;
}

export interface CurrencyFundamentalScore {
    currency: string;
    /** 0–100, 50 = neutral */
    score: number;
    bias: FundamentalBias;
    /** 1–5, how directionally consistent the contributing events were */
    conviction: number;
    pillarScores: PillarScores;
    eventsCount: number;
    windowDays: number;
}

/** Fraction of the impact that survives one hop. */
const ATTENUATION = 0.65;
/** Exponential decay per day: 7d -> 57%, 14d -> 33%, 30d -> 9%. */
const DECAY_RATE = 0.08;
/** Hops after which propagation stops, whatever the remaining impact. */
const MAX_DEPTH = 6;
/** Divisor mapping summed impacts onto the 0–100 scale. */
const NORMALIZATION_FACTOR = 15;
/** Impacts weaker than this are treated as noise and dropped. */
const IMPACT_EPSILON = 0.01;
/** An event must move a node by at least this much to count toward a score. */
const CONTRIBUTION_EPSILON = 0.05;

const MS_PER_DAY = 86_400_000;

export const TRACKED_CURRENCIES = [
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'AUD',
    'NZD',
    'CAD',
    'CHF',
] as const;

/**
 * Normalises `actual - forecast` onto a -5..+5 scale.
 *
 * The raw difference is meaningless across indicators — 0.2 is a large miss on
 * a policy rate and a rounding error on non-farm payrolls — so it is taken
 * relative to the forecast, then compressed logarithmically: a 5 % miss scores
 * about 2.9, a 20 % miss about 4.9. Without the compression a single outlier
 * print would saturate the whole cascade.
 *
 * `previous` is the fallback reference when the forecast is zero (net change
 * indicators legitimately forecast 0), and 1 when both are zero — at that point
 * the ratio has no meaning and the absolute miss is the only signal left.
 */
export function calculateSurprise(actual: number, forecast: number, previous: number): number {
    const reference =
        Math.abs(forecast) > 0.001 ? forecast : Math.abs(previous) > 0.001 ? previous : 1;

    const relativeSurprise = ((actual - forecast) / Math.abs(reference)) * 100;
    const compressed = Math.log1p(Math.abs(relativeSurprise)) * 1.6;

    return clamp(Math.sign(relativeSurprise) * Math.min(5, compressed), -5, 5);
}

interface PropagationNode {
    indicatorId: string;
    impact: number;
    depth: number;
}

/**
 * Propagates a surprise through the connection graph, breadth-first.
 *
 * Impacts ACCUMULATE: a node reached by two paths (say oil moving CAD both
 * through inflation and through the trade balance) gets both contributions,
 * which is the point — reinforcement through several channels is a stronger
 * signal than a single link.
 *
 * Two departures from the legacy implementation:
 *
 * 1. Depth is reported. The legacy version wrote `depth: 0` on every impact
 *    with a comment saying real depth "would need separate tracking" — so the
 *    field was always a lie, and nothing could distinguish a direct effect from
 *    a sixth-hand echo. BFS visits in non-decreasing depth order, so the first
 *    time a node is reached IS its shortest path; recording it there costs
 *    nothing.
 *
 * 2. Negligible impacts stop propagating. The legacy loop queued every edge
 *    regardless of how small the transmitted impact had become, walking the
 *    full six levels to spread values far below the epsilon that later
 *    discarded them.
 */
export function propagateCascade(indicatorId: string, surpriseScore: number): CascadeImpact[] {
    const accumulated = new Map<string, number>();
    const shortestDepth = new Map<string, number>();
    const visited = new Set<string>();

    let queue: PropagationNode[] = [{ indicatorId, impact: surpriseScore, depth: 0 }];

    while (queue.length > 0) {
        const next: PropagationNode[] = [];

        for (const current of queue) {
            if (current.depth >= MAX_DEPTH) continue;

            for (const conn of getOutgoingConnections(current.indicatorId)) {
                // An inverse edge flips the sign: unemployment rising is a
                // bearish input to growth even though the print went up.
                const dirFactor = conn.direction === 'positive' ? 1 : -1;
                const weightFactor = conn.weight / 5;
                const transmitted = current.impact * weightFactor * dirFactor * ATTENUATION;

                accumulated.set(conn.to, (accumulated.get(conn.to) ?? 0) + transmitted);

                const depth = current.depth + 1;
                if (!shortestDepth.has(conn.to)) shortestDepth.set(conn.to, depth);

                const visitKey = `${conn.to}:${depth}`;
                if (visited.has(visitKey)) continue;
                visited.add(visitKey);

                // Anything below the epsilon is dropped from the result anyway;
                // continuing to propagate it only fans out noise.
                if (Math.abs(transmitted) < IMPACT_EPSILON) continue;

                next.push({ indicatorId: conn.to, impact: transmitted, depth });
            }
        }

        queue = next;
    }

    const impacts: CascadeImpact[] = [];

    for (const [targetId, impact] of accumulated) {
        if (Math.abs(impact) < IMPACT_EPSILON) continue;

        const indicator = getIndicatorById(targetId);
        if (!indicator) continue;

        impacts.push({
            targetId,
            targetCurrency: indicator.currency,
            targetName: indicator.name,
            impact: clamp(impact, -5, 5),
            depth: shortestDepth.get(targetId) ?? 1,
        });
    }

    return impacts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

/** Weight of an event given its age. */
export function temporalDecay(occurredAt: Date, now: Date): number {
    const ageDays = (now.getTime() - occurredAt.getTime()) / MS_PER_DAY;
    return Math.exp(-DECAY_RATE * Math.max(0, ageDays));
}

/** Net impact of an event on one node — direct hit or via the cascade. */
export function impactOnTarget(event: ScoredEvent, targetId: string): number {
    if (event.indicatorId === targetId) return event.surpriseNormalized;
    return event.cascadeImpacts.find((c) => c.targetId === targetId)?.impact ?? 0;
}

/**
 * Cumulative fundamental score for one currency.
 *
 * score = 50 + clamp(Σ impact × decay / 15) × 50
 *
 * Events are filtered by the caller's window; anything older contributes
 * nothing meaningful anyway once decay is applied.
 */
export function calculateCurrencyScore(
    currency: string,
    events: readonly ScoredEvent[],
    now: Date,
    windowDays = 21,
): CurrencyFundamentalScore {
    const cutoff = new Date(now.getTime() - windowDays * MS_PER_DAY);
    const inWindow = events.filter((e) => e.occurredAt >= cutoff);

    const kingId = KING_IDS[currency];
    const pillarIds = PILLAR_IDS[currency] ?? [];

    let rawScore = 0;
    let activeEvents = 0;
    const directions: number[] = [];

    for (const event of inWindow) {
        const impact = kingId ? impactOnTarget(event, kingId) : 0;
        if (Math.abs(impact) < CONTRIBUTION_EPSILON) continue;

        rawScore += impact * temporalDecay(event.occurredAt, now);
        activeEvents += 1;
        directions.push(Math.sign(impact));
    }

    const offset = clamp(rawScore / NORMALIZATION_FACTOR, -1, 1);
    const score = Math.round(clamp(50 + offset * 50, 0, 100));

    return {
        currency,
        score,
        bias: scoreToBias(score),
        conviction: computeConviction(directions),
        pillarScores: calculatePillarScores(inWindow, pillarIds, now),
        eventsCount: activeEvents,
        windowDays,
    };
}

/**
 * The three pillar scores.
 *
 * Pillars use a tighter divisor (0.6×) than the king node on purpose: a pillar
 * receives a narrower slice of the graph, so the same raw sum represents a
 * proportionally stronger move within that pillar.
 */
function calculatePillarScores(
    events: readonly ScoredEvent[],
    pillarIds: readonly string[],
    now: Date,
): PillarScores {
    function pillarScore(targetId: string | undefined): number {
        if (!targetId) return 50;

        let raw = 0;
        for (const event of events) {
            const impact = impactOnTarget(event, targetId);
            if (Math.abs(impact) < CONTRIBUTION_EPSILON) continue;
            raw += impact * temporalDecay(event.occurredAt, now);
        }

        const normalized = clamp(raw / (NORMALIZATION_FACTOR * 0.6), -1, 1);
        return Math.round(clamp(50 + normalized * 50, 0, 100));
    }

    return {
        rateDifferential: pillarScore(pillarIds[0]),
        riskAppetite: pillarScore(pillarIds[1]),
        capitalFlows: pillarScore(pillarIds[2]),
    };
}

/**
 * Conviction 1–5 from how many contributing events agreed on direction.
 *
 * With no events conviction is 1, not 5: unanimity among zero signals is not
 * agreement, it is absence of evidence.
 */
export function computeConviction(directions: readonly number[]): number {
    if (directions.length === 0) return 1;

    const bullish = directions.filter((d) => d > 0).length;
    const bearish = directions.filter((d) => d < 0).length;
    const ratio = Math.max(bullish, bearish) / directions.length;

    if (ratio >= 0.9) return 5;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.6) return 3;
    if (ratio >= 0.5) return 2;
    return 1;
}

export function scoreToBias(score: number): FundamentalBias {
    if (score >= 85) return 'STRONGLY_BULLISH';
    if (score >= 70) return 'BULLISH';
    if (score >= 58) return 'SLIGHTLY_BULLISH';
    if (score >= 42) return 'NEUTRAL';
    if (score >= 30) return 'SLIGHTLY_BEARISH';
    if (score >= 15) return 'BEARISH';
    return 'STRONGLY_BEARISH';
}

const BIAS_LABELS: Record<FundamentalBias, string> = {
    STRONGLY_BULLISH: 'Fortement haussier',
    BULLISH: 'Haussier',
    SLIGHTLY_BULLISH: 'Légèrement haussier',
    NEUTRAL: 'Neutre',
    SLIGHTLY_BEARISH: 'Légèrement baissier',
    BEARISH: 'Baissier',
    STRONGLY_BEARISH: 'Fortement baissier',
};

export function biasLabel(bias: FundamentalBias): string {
    return BIAS_LABELS[bias];
}

export interface Divergence {
    currency: string;
    pillarName: string;
    bullishIndicator: string;
    bearishIndicator: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
}

/**
 * Pillars pushed in both directions at once by recent events.
 *
 * A divergence is not noise to be smoothed away — it is the case where the
 * cumulative score is least trustworthy, because opposite forces have netted
 * out to something that looks calm.
 */
export function detectDivergences(
    currency: string,
    events: readonly ScoredEvent[],
    now: Date,
    windowDays = 14,
): Divergence[] {
    const cutoff = new Date(now.getTime() - windowDays * MS_PER_DAY);
    const scoped = events.filter((e) => e.currency === currency && e.occurredAt >= cutoff);

    const divergences: Divergence[] = [];

    for (const pillarId of PILLAR_IDS[currency] ?? []) {
        const withImpact = scoped
            .map((e) => ({ event: e, impact: impactOnTarget(e, pillarId) }))
            .filter((x) => Math.abs(x.impact) > 0.5);

        const positive = withImpact.filter((x) => x.impact > 0);
        const negative = withImpact.filter((x) => x.impact < 0);
        if (positive.length === 0 || negative.length === 0) continue;

        const spread =
            Math.max(...positive.map((x) => x.impact)) - Math.min(...negative.map((x) => x.impact));

        const pillarName = getIndicatorById(pillarId)?.name ?? pillarId;
        const bullish = indicatorName(positive[0]!.event.indicatorId);
        const bearish = indicatorName(negative[0]!.event.indicatorId);

        divergences.push({
            currency,
            pillarName,
            bullishIndicator: bullish,
            bearishIndicator: bearish,
            severity: spread > 3 ? 'high' : spread > 1.5 ? 'medium' : 'low',
            description: `Divergence sur ${pillarName} : ${bullish} pousse à la hausse, ${bearish} à la baisse.`,
        });
    }

    return divergences;
}

function indicatorName(id: string): string {
    return FUNDAMENTAL_INDICATORS.find((i) => i.id === id)?.name ?? id;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
