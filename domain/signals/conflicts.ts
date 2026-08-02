// ================================================================
// TRADE CONFLICT ANALYSIS
//
// Two correlated positions in the same direction are not two trades
// — they are one trade at double the size. This checks a set of
// planned trades pairwise and reports where that is happening, then
// derives the risk percentage the set can support.
//
// Pure: trades in, conflicts out.
// ================================================================

import { getCorrelation } from '../data/correlations';

export type TradeDirection = 'buy' | 'sell';

export interface PlannedTrade {
    id: string;
    pair: string;
    direction: TradeDirection;
}

export type ConflictLevel = 'CONFLIT' | 'DOUBLE' | 'NEUTRALISE' | 'OK';

export interface Conflict {
    a: PlannedTrade;
    b: PlannedTrade;
    level: ConflictLevel;
    /** Raw correlation between the two pairs. */
    correlation: number;
    /**
     * Correlation adjusted for direction: positive means the trades reinforce
     * each other, negative means they offset. Two pairs correlated +85% taken
     * in OPPOSITE directions effectively cancel, which is why the sign matters
     * more than the magnitude.
     */
    effectiveCorrelation: number;
    message: string;
}

function describe(correlation: number): string {
    return `${correlation > 0 ? '+' : ''}${correlation} %`;
}

function classify(effective: number, correlation: number): { level: ConflictLevel; message: string } {
    if (effective >= 75) {
        return {
            level: 'CONFLIT',
            message: `Corrélation ${describe(correlation)} : c'est le même trade. Gardez le meilleur setup.`,
        };
    }
    if (effective >= 60) {
        return {
            level: 'DOUBLE',
            message: `Corrélation ${describe(correlation)} : double exposition. Réduisez le risque sur l'une des deux.`,
        };
    }
    if (effective <= -40) {
        return {
            level: 'NEUTRALISE',
            message: `Corrélation ${describe(correlation)} en sens opposés : les trades se neutralisent. Vérifiez la logique.`,
        };
    }
    return {
        level: 'OK',
        message: `Corrélation ${describe(correlation)} : ${
            Math.abs(correlation) < 30 ? 'trades indépendants.' : 'exposition modérée.'
        }`,
    };
}

/** Every pairwise comparison across the planned trades. */
export function analyzeConflicts(trades: readonly PlannedTrade[]): Conflict[] {
    const conflicts: Conflict[] = [];

    for (let i = 0; i < trades.length; i += 1) {
        for (let j = i + 1; j < trades.length; j += 1) {
            const a = trades[i];
            const b = trades[j];
            if (!a || !b) continue;

            const correlation = getCorrelation(a.pair, b.pair);
            const effectiveCorrelation = a.direction === b.direction ? correlation : -correlation;
            const { level, message } = classify(effectiveCorrelation, correlation);

            conflicts.push({ a, b, level, correlation, effectiveCorrelation, message });
        }
    }

    // Worst first, so the problem is the first thing read.
    const order: Record<ConflictLevel, number> = { CONFLIT: 0, DOUBLE: 1, NEUTRALISE: 2, OK: 3 };
    conflicts.sort((x, y) => order[x.level] - order[y.level]);
    return conflicts;
}

/**
 * Risk percentage the set of trades can support.
 *
 * Scales down as correlated exposure rises, reaching zero at an outright
 * conflict: if two positions are the same trade, the answer is to drop one, not
 * to size both smaller.
 */
export function adjustedRiskPct(maxEffectiveCorrelation: number): number {
    if (maxEffectiveCorrelation >= 75) return 0;
    if (maxEffectiveCorrelation >= 60) return 0.1;
    if (maxEffectiveCorrelation >= 40) return 0.2;
    if (maxEffectiveCorrelation >= 20) return 0.3;
    return 0.4;
}

/** Highest effective correlation across the set — the binding constraint. */
export function maxEffectiveCorrelation(conflicts: readonly Conflict[]): number {
    if (conflicts.length === 0) return 0;
    return Math.max(...conflicts.map(c => c.effectiveCorrelation));
}
