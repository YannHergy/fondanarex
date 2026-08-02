// ================================================================
// SCORE-CHANGE DETECTION
//
// Turns a pair of score snapshots into the alerts worth raising.
//
// The legacy app DECLARED 'score_change_majeur' and 'score_change'
// alert types but never produced them: the only caller of addAlert
// was a manual test button. The alert centre could therefore only
// ever show alerts the user had created by hand. This is the missing
// generator, and it is pure so the thresholds are testable.
// ================================================================

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL';

export interface ScoreChange {
    currencyCode: string;
    previous: number;
    current: number;
    /** current - previous, rounded to one decimal */
    delta: number;
    severity: AlertSeverity;
    /** True when the move crossed a verdict boundary (e.g. Neutre -> Achat). */
    crossedVerdict: boolean;
}

/**
 * Minimum move worth an alert.
 *
 * Below this the score wobbles with routine data revisions and alerting would
 * be noise — an alert nobody reads is worse than no alert, because it teaches
 * the user to ignore the badge.
 */
export const MIN_DELTA = 5;

/** Verdict boundaries, matching getScoreLabel in the scoring domain. */
const VERDICT_BOUNDARIES = [30, 45, 60, 70];

function verdictBand(score: number): number {
    return VERDICT_BOUNDARIES.filter(b => score >= b).length;
}

export function severityFor(absDelta: number, crossedVerdict: boolean): AlertSeverity {
    if (absDelta >= 15) return 'CRITICAL';
    if (absDelta >= 10) return 'HIGH';
    // A smaller move that changes the verdict still matters: it flips the
    // recommendation, which is what the user acts on.
    if (crossedVerdict) return 'HIGH';
    return 'NORMAL';
}

/**
 * Compares previous and current scores and returns the changes worth alerting.
 *
 * A currency with no previous snapshot yields nothing: the first observation is
 * a baseline, not a movement, and reporting it as a change would fire an alert
 * for all eight currencies on first run.
 */
export function detectScoreChanges(
    previous: Readonly<Record<string, number>>,
    current: Readonly<Record<string, number>>,
): ScoreChange[] {
    const changes: ScoreChange[] = [];

    for (const [currencyCode, currentScore] of Object.entries(current)) {
        const previousScore = previous[currencyCode];
        if (previousScore === undefined) continue;

        const delta = Math.round((currentScore - previousScore) * 10) / 10;
        if (Math.abs(delta) < MIN_DELTA) continue;

        const crossedVerdict = verdictBand(previousScore) !== verdictBand(currentScore);

        changes.push({
            currencyCode,
            previous: previousScore,
            current: currentScore,
            delta,
            severity: severityFor(Math.abs(delta), crossedVerdict),
            crossedVerdict,
        });
    }

    // Largest move first — the most important alert should be the top row.
    changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return changes;
}

/** French headline for a change. */
export function describeChange(change: ScoreChange): { title: string; message: string } {
    const direction = change.delta > 0 ? 'progresse' : 'recule';
    const sign = change.delta > 0 ? '+' : '';

    return {
        title: `${change.currencyCode} ${direction} de ${sign}${change.delta} points`,
        message: change.crossedVerdict
            ? `Score ${change.previous} → ${change.current}. Le verdict de la devise a changé.`
            : `Score ${change.previous} → ${change.current}.`,
    };
}
