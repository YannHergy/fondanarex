// ================================================================
// PREDICTIONS — rule firing, resolution, surprise scoring
//
// A published figure fires the rules that name it as a source, each
// producing a dated claim about a LATER figure. When that later
// figure is published the claim is confirmed or contradicted, and
// the running contradiction rate becomes the "surprise" score:
// how badly the market is behaving unlike the model expects.
//
// Pure — no I/O, no clock.
// ================================================================

import { getRulesFor, type PredictionDirection } from '../data/prediction-rules';
import { getIndicatorById } from '../data/fundamental-indicators';

export type PredictionStatus = 'pending' | 'confirmed' | 'contradicted' | 'expired';

/** A prediction as the domain sees it — persistence adds ids. */
export interface PredictionDraft {
    sourceIndicatorId: string;
    sourceIndicatorName: string;
    sourceCurrency: string;
    sourceDirection: PredictionDirection;
    targetIndicatorId: string;
    targetIndicatorName: string;
    targetCurrency: string;
    predictedDirection: PredictionDirection;
    confidence: number;
    reason: string;
    delayLabel: string;
    expiresAt: Date;
}

export interface StoredPrediction extends PredictionDraft {
    id: string;
    status: PredictionStatus;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedDirection: PredictionDirection | null;
}

export type SurpriseLevel = 'low' | 'medium' | 'high';

export interface SurpriseData {
    currency: string;
    /** 0–100. Low = the market behaved as the rules expected. */
    score: number;
    level: SurpriseLevel;
    confirmed: number;
    contradicted: number;
    pending: number;
    expired: number;
    total: number;
}

/**
 * How long a prediction stays open, by the rule's stated delay.
 *
 * Deliberately generous — roughly double the nominal delay — because the claim
 * is "the next print moves this way", and prints slip. Too tight a window
 * expires predictions that were about to be judged, which biases the surprise
 * score toward whichever horizon resolves fastest.
 *
 * EVERY label used by the rule set must appear here. The legacy map covered
 * five labels while the rules used eight, so 23 rules silently fell back to the
 * 30-day default — including the '~1 trimestre' ones, whose target figure is
 * published about 90 days out. Those predictions expired before the number they
 * were about existed, so a whole class of long-horizon rules could never be
 * confirmed and never entered the score. `immédiat` is kept for completeness
 * even though no rule currently uses it.
 */
const DELAY_EXPIRY_DAYS: Record<string, number> = {
    immédiat: 3,
    '~1 semaine': 12,
    '~2-3 semaines': 28,
    '~3-4 semaines': 40,
    '~1 mois': 45,
    '~1-2 mois': 75,
    '~2-3 mois': 105,
    '~1 trimestre': 135,
    'avant la réunion': 50,
};
const DEFAULT_EXPIRY_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Direction of a published figure, or null when it is not worth acting on.
 *
 * The ±0.1 dead zone matters: a figure landing on consensus carries no
 * information, and firing rules on it would fill the ledger with coin flips
 * that dilute the surprise score toward 50 %.
 */
export function eventDirection(surpriseNormalized: number): PredictionDirection | null {
    if (surpriseNormalized > 0.1) return 'bullish';
    if (surpriseNormalized < -0.1) return 'bearish';
    return null;
}

/**
 * Direction of a figure IN THE SENSE THE RULES MEAN IT.
 *
 * The rule set says `bullish` for "the economy improved" — one rule literally
 * reads "Emploi fort → moins de demandes de chômage", predicting claims
 * `bullish` while expecting the number to FALL. Reading the raw print for those
 * indicators therefore settled all thirteen unemployment and jobless-claims
 * rules backwards: correct calls were recorded as contradictions and fed the
 * surprise score as evidence the macro chain had broken down.
 *
 * Only the prediction side is flipped. The cascade keeps the raw sign, because
 * the connection graph already encodes the same relationship as `inverse`
 * edges — flipping both would cancel out and reintroduce the error.
 */
export function directionForIndicator(
    indicatorId: string,
    surpriseNormalized: number,
): PredictionDirection | null {
    const direction = eventDirection(surpriseNormalized);
    if (!direction) return null;

    if (!getIndicatorById(indicatorId)?.higherIsBearish) return direction;
    return direction === 'bullish' ? 'bearish' : 'bullish';
}

export function expiryFor(delayLabel: string, from: Date): Date {
    const days = DELAY_EXPIRY_DAYS[delayLabel] ?? DEFAULT_EXPIRY_DAYS;
    return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * The predictions a published figure fires.
 *
 * Returns drafts, not saved rows — the same call backs both the preview in the
 * predictor UI and the real write, so what a user is shown before committing is
 * produced by the identical code path.
 */
export function predictionsFromEvent(
    indicatorId: string,
    indicatorName: string,
    currency: string,
    surpriseNormalized: number,
    firedAt: Date,
): PredictionDraft[] {
    const direction = directionForIndicator(indicatorId, surpriseNormalized);
    if (!direction) return [];

    return getRulesFor(indicatorId, direction).map((rule) => {
        const target = getIndicatorById(rule.targetIndicatorId);

        return {
            sourceIndicatorId: indicatorId,
            sourceIndicatorName: indicatorName,
            sourceCurrency: currency,
            sourceDirection: direction,
            targetIndicatorId: rule.targetIndicatorId,
            targetIndicatorName: target?.name ?? rule.targetIndicatorId,
            targetCurrency: target?.currency ?? 'GLOBAL',
            predictedDirection: rule.predictedDirection,
            confidence: rule.confidence,
            reason: rule.reason,
            delayLabel: rule.delayLabel,
            expiresAt: expiryFor(rule.delayLabel, firedAt),
        };
    });
}

/**
 * Status of a pending prediction as of `now`.
 *
 * Expiry is derived here rather than only being written when the next event
 * arrives. The legacy engine expired predictions exclusively inside its
 * event-processing pass, so a ledger nobody had added news to kept reporting
 * months-old predictions as "en attente" — and, worse, the surprise score kept
 * excluding them from the denominator as if they were still live.
 */
export function effectiveStatus(prediction: StoredPrediction, now: Date): PredictionStatus {
    if (prediction.status !== 'pending') return prediction.status;
    return prediction.expiresAt.getTime() < now.getTime() ? 'expired' : 'pending';
}

/** Whether a resolved figure confirms or contradicts a claim. */
export function resolutionFor(
    predictedDirection: PredictionDirection,
    actualDirection: PredictionDirection,
): 'confirmed' | 'contradicted' {
    return predictedDirection === actualDirection ? 'confirmed' : 'contradicted';
}

/**
 * Surprise score for one currency.
 *
 * The share of RESOLVED predictions that were contradicted, weighted by the
 * rule's own confidence — a 5-star rule being wrong says more about the regime
 * than a 1-star hunch being wrong. 0 % means the macro chain behaved exactly as
 * modelled; 100 % means it inverted.
 *
 * With nothing resolved the score is 50 and must be read as "unknown", not as
 * "moderately predictable" — hence `total` and the counts travelling with it so
 * the UI can say which one it is.
 */
export function surpriseData(
    currency: string,
    predictions: readonly StoredPrediction[],
    now: Date,
): SurpriseData {
    const statuses = predictions.map((p) => effectiveStatus(p, now));

    const count = (s: PredictionStatus) => statuses.filter((x) => x === s).length;

    let weightedContradictions = 0;
    let weightedResolved = 0;

    predictions.forEach((prediction, index) => {
        const status = statuses[index];
        if (status !== 'confirmed' && status !== 'contradicted') return;

        weightedResolved += prediction.confidence;
        if (status === 'contradicted') weightedContradictions += prediction.confidence;
    });

    const score =
        weightedResolved === 0
            ? 50
            : Math.round((weightedContradictions / weightedResolved) * 100);

    return {
        currency,
        score,
        level: surpriseLevel(score),
        confirmed: count('confirmed'),
        contradicted: count('contradicted'),
        pending: count('pending'),
        expired: count('expired'),
        total: predictions.length,
    };
}

export function surpriseLevel(score: number): SurpriseLevel {
    if (score >= 60) return 'high';
    if (score >= 35) return 'medium';
    return 'low';
}

const LEVEL_LABELS: Record<SurpriseLevel, string> = {
    low: 'Cohérent',
    medium: 'Modéré',
    high: 'Surprenant',
};

export function surpriseLabel(level: SurpriseLevel): string {
    return LEVEL_LABELS[level];
}

/** Sort order for the detail list: what needs attention first. */
const STATUS_ORDER: Record<PredictionStatus, number> = {
    contradicted: 0,
    pending: 1,
    confirmed: 2,
    expired: 3,
};

export function byAttention(
    a: PredictionStatus,
    b: PredictionStatus,
): number {
    return STATUS_ORDER[a] - STATUS_ORDER[b];
}
