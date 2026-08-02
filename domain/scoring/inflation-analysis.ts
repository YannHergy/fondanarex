// ================================================================
// TRIPARTITE INFLATION ANALYSIS
//
// An inflation print on its own says very little. What a central
// bank reacts to is the combination of two things:
//
//   TRAJECTORY  is it rising, flat, or falling?
//   LEVEL       where is it relative to the 2 % target?
//
// The same 0.2 point rise is hawkish at 4 % and reassuring at
// 1.2 %. This module scores the nine combinations.
//
// Pure — no I/O.
// ================================================================

export type Trajectory = 'rising' | 'flat' | 'falling';
export type InflationLevel = 'HIGH' | 'TARGET' | 'LOW';
export type Stance =
    | 'MAX_HAWKISH'
    | 'HAWKISH'
    | 'MODERATELY_HAWKISH'
    | 'SLIGHTLY_HAWKISH'
    | 'NEUTRAL'
    | 'NEUTRAL_HAWKISH'
    | 'DOVISH'
    | 'MAX_DOVISH';

/** The central-bank target every G10 mandate is written around. */
export const INFLATION_TARGET = 2.0;

/**
 * Half-point band either side of target counted as "at target".
 *
 * Narrower and ordinary measurement noise flips the classification month to
 * month; wider and a genuine 2.9 % overshoot reads as on-target.
 */
export const TARGET_BUFFER = 0.5;

/**
 * Movement smaller than this counts as flat.
 *
 * The legacy version tested `variation > 0`, so a 0.01 revision — well inside
 * the rounding of a published figure — was scored as a full acceleration and
 * moved the result by 35 points. A dead zone is what stops noise becoming a
 * policy signal.
 */
export const FLAT_THRESHOLD = 0.05;

export interface InflationAnalysis {
    current: number;
    previous: number;
    variation: number;
    trajectory: Trajectory;
    level: InflationLevel;
    scenario: string;
    /** -35..+35. Positive is hawkish, which is currency-positive. */
    score: number;
    stance: Stance;
    stanceLabel: string;
    /** Why this combination reads the way it does. */
    reading: string;
}

export function classifyLevel(current: number): InflationLevel {
    if (current > INFLATION_TARGET + TARGET_BUFFER) return 'HIGH';
    if (current < INFLATION_TARGET - TARGET_BUFFER) return 'LOW';
    return 'TARGET';
}

export function classifyTrajectory(variation: number): Trajectory {
    if (variation > FLAT_THRESHOLD) return 'rising';
    if (variation < -FLAT_THRESHOLD) return 'falling';
    return 'flat';
}

const STANCE_LABELS: Record<Stance, string> = {
    MAX_HAWKISH: 'Très restrictif',
    HAWKISH: 'Restrictif',
    MODERATELY_HAWKISH: 'Modérément restrictif',
    SLIGHTLY_HAWKISH: 'Légèrement restrictif',
    NEUTRAL_HAWKISH: 'Neutre à restrictif',
    NEUTRAL: 'Neutre',
    DOVISH: 'Accommodant',
    MAX_DOVISH: 'Très accommodant',
};

export function stanceLabel(stance: Stance): string {
    return STANCE_LABELS[stance];
}

interface Cell {
    scenario: string;
    score: number;
    stance: Stance;
    reading: string;
}

/**
 * The nine combinations.
 *
 * The asymmetry is deliberate and is the point of the whole model. Falling
 * inflation is reassuring at target (-15) and alarming below it (-35), because
 * the second is disinflation heading toward deflation — the outcome a central
 * bank fears most and cuts hardest against. Rising inflation is worst when it
 * is already high (+35), and almost welcome when it is climbing back from
 * below target (+5).
 */
const MATRIX: Record<Trajectory, Record<InflationLevel, Cell>> = {
    rising: {
        HIGH: {
            scenario: 'Accélération sur niveau élevé',
            score: 35,
            stance: 'MAX_HAWKISH',
            reading:
                "L'inflation était déjà au-dessus de la cible et continue de monter. C'est le scénario qui force une banque centrale à agir, et le plus favorable à la devise.",
        },
        TARGET: {
            scenario: 'Accélération modérée',
            score: 15,
            stance: 'MODERATELY_HAWKISH',
            reading:
                "L'inflation reste dans la bande cible mais remonte. Surveillé de près sans justifier une action immédiate.",
        },
        LOW: {
            scenario: 'Rebond vers la cible',
            score: 5,
            stance: 'NEUTRAL_HAWKISH',
            reading:
                "L'inflation remonte depuis un niveau trop bas : c'est le résultat recherché, pas une menace. Effet quasi neutre.",
        },
    },
    flat: {
        HIGH: {
            scenario: 'Stabilité en zone haute',
            score: 20,
            stance: 'HAWKISH',
            reading:
                "L'inflation ne baisse pas alors qu'elle est au-dessus de la cible. L'absence de progrès est en soi un argument pour rester restrictif.",
        },
        TARGET: {
            scenario: 'Goldilocks',
            score: 0,
            stance: 'NEUTRAL',
            reading:
                "L'inflation est à la cible et y reste. Aucune pression sur la politique monétaire dans un sens ou dans l'autre.",
        },
        LOW: {
            scenario: 'Stagnation basse',
            score: -20,
            stance: 'DOVISH',
            reading:
                "L'inflation est trop basse et n'y remonte pas. L'enlisement sous la cible pousse à l'assouplissement.",
        },
    },
    falling: {
        HIGH: {
            scenario: 'Désinflation lente',
            score: 10,
            stance: 'SLIGHTLY_HAWKISH',
            reading:
                "L'inflation baisse mais reste au-dessus de la cible. La direction est bonne, le niveau ne l'est pas encore : maintien restrictif.",
        },
        TARGET: {
            scenario: 'Désinflation saine',
            score: -15,
            stance: 'DOVISH',
            reading:
                "L'inflation revient vers la cible sans la traverser. Le mandat est en voie d'être rempli, ce qui ouvre la porte à un assouplissement.",
        },
        LOW: {
            scenario: 'Désinflation risquée',
            score: -35,
            stance: 'MAX_DOVISH',
            reading:
                "L'inflation est déjà sous la cible et continue de baisser. C'est la trajectoire vers la déflation, celle contre laquelle une banque centrale agit le plus vite.",
        },
    },
};

/**
 * Reads an inflation print against its previous value.
 *
 * `previous` defaults to `current` when unknown, which yields a flat
 * trajectory — the honest answer with one observation, rather than inventing a
 * direction from a single point.
 */
export function analyseInflation(current: number, previous?: number | null): InflationAnalysis {
    const prior = previous ?? current;
    const variation = round(current - prior);

    const trajectory = classifyTrajectory(variation);
    const level = classifyLevel(current);
    const cell = MATRIX[trajectory][level];

    return {
        current,
        previous: prior,
        variation,
        trajectory,
        level,
        scenario: cell.scenario,
        score: cell.score,
        stance: cell.stance,
        stanceLabel: STANCE_LABELS[cell.stance],
        reading: cell.reading,
    };
}

const TRAJECTORY_LABELS: Record<Trajectory, string> = {
    rising: 'En hausse',
    flat: 'Stable',
    falling: 'En baisse',
};

const LEVEL_LABELS: Record<InflationLevel, string> = {
    HIGH: 'Élevé (> 2,5 %)',
    TARGET: 'À la cible',
    LOW: 'Faible (< 1,5 %)',
};

export function trajectoryLabel(trajectory: Trajectory): string {
    return TRAJECTORY_LABELS[trajectory];
}

export function levelLabel(level: InflationLevel): string {
    return LEVEL_LABELS[level];
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
