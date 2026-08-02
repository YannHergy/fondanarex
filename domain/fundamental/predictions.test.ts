import { describe, expect, it } from 'vitest';

import { FUNDAMENTAL_INDICATORS } from '../data/fundamental-indicators';
import { PREDICTION_RULES } from '../data/prediction-rules';
import {
    directionForIndicator,
    effectiveStatus,
    eventDirection,
    expiryFor,
    predictionsFromEvent,
    resolutionFor,
    surpriseData,
    surpriseLevel,
    type StoredPrediction,
} from './predictions';

const NOW = new Date('2026-08-01T12:00:00Z');

function stored(overrides: Partial<StoredPrediction> = {}): StoredPrediction {
    return {
        id: 'p1',
        sourceIndicatorId: 'usd_nfp',
        sourceIndicatorName: 'NFP',
        sourceCurrency: 'USD',
        sourceDirection: 'bullish',
        targetIndicatorId: 'usd_wages',
        targetIndicatorName: 'Salaires US',
        targetCurrency: 'USD',
        predictedDirection: 'bullish',
        confidence: 3,
        reason: 'because',
        delayLabel: '~1 mois',
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        status: 'pending',
        createdAt: NOW,
        resolvedAt: null,
        resolvedDirection: null,
        ...overrides,
    };
}

describe('rule set integrity', () => {
    const ids = new Set(FUNDAMENTAL_INDICATORS.map((i) => i.id));

    it('names only indicators that exist in the catalogue', () => {
        // Three of these were dangling: `aud_cpi` was a typo for
        // `aud_cpi_quarterly` (silently disabling the two highest-confidence
        // RBA rules), and `usd_consumer_confidence` had no catalogue entry at
        // all, so eight rules predicted a figure that could never be published.
        const unknown = PREDICTION_RULES.flatMap((rule) =>
            [rule.sourceIndicatorId, rule.targetIndicatorId].filter((id) => !ids.has(id)),
        );
        expect([...new Set(unknown)]).toEqual([]);
    });

    it('uses only delay labels with a mapped expiry window', () => {
        // An unmapped label falls back to 30 days. For a quarterly target that
        // guarantees expiry before the figure is even published.
        const unmapped = PREDICTION_RULES.filter(
            (rule) => expiryFor(rule.delayLabel, NOW).getTime() === NOW.getTime() + 30 * 86_400_000,
        );
        expect(unmapped.map((r) => r.delayLabel)).toEqual([]);
    });

    it('never predicts an indicator from itself', () => {
        const selfReferential = PREDICTION_RULES.filter(
            (r) => r.sourceIndicatorId === r.targetIndicatorId,
        );
        expect(selfReferential).toEqual([]);
    });
});

describe('eventDirection', () => {
    it('reads a clear beat as bullish and a clear miss as bearish', () => {
        expect(eventDirection(2)).toBe('bullish');
        expect(eventDirection(-2)).toBe('bearish');
    });

    it('ignores a figure that landed on consensus', () => {
        // Firing rules on a no-information print fills the ledger with coin
        // flips and drags the surprise score toward 50%.
        expect(eventDirection(0)).toBeNull();
        expect(eventDirection(0.05)).toBeNull();
        expect(eventDirection(-0.1)).toBeNull();
    });

    it('acts just outside the dead zone', () => {
        expect(eventDirection(0.11)).toBe('bullish');
    });
});

describe('directionForIndicator', () => {
    it('reads a normal indicator straight', () => {
        expect(directionForIndicator('usd_nfp', 2)).toBe('bullish');
        expect(directionForIndicator('usd_nfp', -2)).toBe('bearish');
    });

    it('flips indicators where a higher print is bad news', () => {
        // Jobless claims FALLING is the bullish case. The rules say so in
        // words — "Emploi fort → moins de demandes de chômage" predicts claims
        // `bullish` while expecting the number to drop — so reading the raw
        // print settled all thirteen claims and unemployment rules backwards.
        expect(directionForIndicator('usd_initial_claims', -2)).toBe('bullish');
        expect(directionForIndicator('usd_initial_claims', 2)).toBe('bearish');
        expect(directionForIndicator('chf_unemployment', 2)).toBe('bearish');
        expect(directionForIndicator('eur_unemployment', -2)).toBe('bullish');
        expect(directionForIndicator('gbp_claimant_count', 2)).toBe('bearish');
    });

    it('keeps the dead zone on an inverted indicator', () => {
        expect(directionForIndicator('usd_initial_claims', 0.05)).toBeNull();
    });

    it('fires the bullish rule set when claims fall', () => {
        const drafts = predictionsFromEvent('usd_initial_claims', 'Claims', 'USD', -3, NOW);
        expect(drafts.length).toBeGreaterThan(0);
        expect(drafts.every((d) => d.sourceDirection === 'bullish')).toBe(true);
    });

    it('leaves an unknown indicator unflipped rather than throwing', () => {
        expect(directionForIndicator('not_a_real_indicator', 2)).toBe('bullish');
    });
});

describe('expiryFor', () => {
    it('gives a longer window to a longer-dated claim', () => {
        const immediate = expiryFor('immédiat', NOW);
        const monthly = expiryFor('~1 mois', NOW);
        expect(monthly.getTime()).toBeGreaterThan(immediate.getTime());
    });

    it('always expires in the future', () => {
        expect(expiryFor('immédiat', NOW).getTime()).toBeGreaterThan(NOW.getTime());
    });

    it('falls back to a default for an unrecognised delay label', () => {
        const fallback = expiryFor('un jour peut-être', NOW);
        expect(fallback.getTime()).toBe(NOW.getTime() + 30 * 86_400_000);
    });
});

describe('predictionsFromEvent', () => {
    it('fires the rules registered for the indicator and direction', () => {
        const drafts = predictionsFromEvent('usd_nfp', 'NFP', 'USD', 3, NOW);
        expect(drafts.length).toBeGreaterThan(0);
        expect(drafts.every((d) => d.sourceDirection === 'bullish')).toBe(true);
    });

    it('fires a different set for the opposite direction', () => {
        const up = predictionsFromEvent('usd_nfp', 'NFP', 'USD', 3, NOW);
        const down = predictionsFromEvent('usd_nfp', 'NFP', 'USD', -3, NOW);
        expect(up.map((d) => d.predictedDirection)).not.toEqual(down.map((d) => d.predictedDirection));
    });

    it('produces nothing for a figure on consensus', () => {
        expect(predictionsFromEvent('usd_nfp', 'NFP', 'USD', 0.02, NOW)).toEqual([]);
    });

    it('produces nothing for an indicator with no rules', () => {
        expect(predictionsFromEvent('global_bdi', 'BDI', 'GLOBAL', 3, NOW)).toEqual([]);
    });

    it('resolves the target name and currency from the catalogue', () => {
        const drafts = predictionsFromEvent('usd_nfp', 'NFP', 'USD', 3, NOW);
        expect(drafts.every((d) => d.targetIndicatorName !== d.targetIndicatorId)).toBe(true);
        expect(drafts.every((d) => d.targetCurrency.length === 3 || d.targetCurrency === 'GLOBAL')).toBe(true);
    });

    it('dates every expiry from the moment the rule fired', () => {
        const drafts = predictionsFromEvent('usd_nfp', 'NFP', 'USD', 3, NOW);
        expect(drafts.every((d) => d.expiresAt.getTime() > NOW.getTime())).toBe(true);
    });

    it('carries confidence in the documented 1–5 range', () => {
        const drafts = predictionsFromEvent('usd_nfp', 'NFP', 'USD', 3, NOW);
        expect(drafts.every((d) => d.confidence >= 1 && d.confidence <= 5)).toBe(true);
    });
});

describe('effectiveStatus', () => {
    it('leaves a live prediction pending', () => {
        expect(effectiveStatus(stored(), NOW)).toBe('pending');
    });

    it('expires a pending prediction past its date without a write', () => {
        // The legacy engine expired predictions only while processing a new
        // event, so a ledger nobody added news to reported months-old claims as
        // still pending — and kept them out of the resolved denominator.
        const past = stored({ expiresAt: new Date(NOW.getTime() - 86_400_000) });
        expect(effectiveStatus(past, NOW)).toBe('expired');
    });

    it('never reopens a resolved prediction', () => {
        const resolved = stored({
            status: 'confirmed',
            expiresAt: new Date(NOW.getTime() - 86_400_000),
        });
        expect(effectiveStatus(resolved, NOW)).toBe('confirmed');
    });
});

describe('resolutionFor', () => {
    it('confirms a correct call and contradicts a wrong one', () => {
        expect(resolutionFor('bullish', 'bullish')).toBe('confirmed');
        expect(resolutionFor('bullish', 'bearish')).toBe('contradicted');
    });
});

describe('surpriseData', () => {
    it('reports 50 with nothing resolved', () => {
        const result = surpriseData('USD', [stored(), stored({ id: 'p2' })], NOW);
        expect(result.score).toBe(50);
        expect(result.pending).toBe(2);
        expect(result.confirmed).toBe(0);
    });

    it('is 0 when every resolved prediction was right', () => {
        const preds = [stored({ status: 'confirmed' }), stored({ id: 'p2', status: 'confirmed' })];
        expect(surpriseData('USD', preds, NOW).score).toBe(0);
    });

    it('is 100 when every resolved prediction was wrong', () => {
        const preds = [stored({ status: 'contradicted' })];
        expect(surpriseData('USD', preds, NOW).score).toBe(100);
    });

    it('weights a contradiction by the confidence of the rule that made it', () => {
        // One 5-star rule being wrong is a bigger deal than one 1-star hunch.
        const strongWrong = surpriseData(
            'USD',
            [stored({ confidence: 5, status: 'contradicted' }), stored({ id: 'p2', confidence: 1, status: 'confirmed' })],
            NOW,
        );
        const weakWrong = surpriseData(
            'USD',
            [stored({ confidence: 1, status: 'contradicted' }), stored({ id: 'p2', confidence: 5, status: 'confirmed' })],
            NOW,
        );
        expect(strongWrong.score).toBeGreaterThan(weakWrong.score);
    });

    it('excludes pending and expired from the score but still counts them', () => {
        const preds = [
            stored({ status: 'confirmed' }),
            stored({ id: 'p2' }),
            stored({ id: 'p3', status: 'expired' }),
        ];
        const result = surpriseData('USD', preds, NOW);
        expect(result.score).toBe(0);
        expect(result.total).toBe(3);
        expect(result.pending).toBe(1);
        expect(result.expired).toBe(1);
    });

    it('counts a lapsed pending prediction as expired', () => {
        const preds = [stored({ expiresAt: new Date(NOW.getTime() - 86_400_000) })];
        const result = surpriseData('USD', preds, NOW);
        expect(result.expired).toBe(1);
        expect(result.pending).toBe(0);
    });

    it('reports zeroes for an empty ledger', () => {
        const result = surpriseData('USD', [], NOW);
        expect(result).toMatchObject({ score: 50, total: 0, confirmed: 0, contradicted: 0 });
    });
});

describe('surpriseLevel', () => {
    it('bands the score', () => {
        expect(surpriseLevel(0)).toBe('low');
        expect(surpriseLevel(34)).toBe('low');
        expect(surpriseLevel(35)).toBe('medium');
        expect(surpriseLevel(59)).toBe('medium');
        expect(surpriseLevel(60)).toBe('high');
        expect(surpriseLevel(100)).toBe('high');
    });
});
