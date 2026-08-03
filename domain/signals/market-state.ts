// ================================================================
// MARKET STATE
//
// Risk-on / risk-off read from the score board itself, plus the
// dispersion that says whether the board is worth trading at all.
//
// Pure — no I/O.
// ================================================================

export interface ScoredCode {
    code: string;
    score: number;
}

export type RiskState = 'risk-on' | 'risk-off' | 'neutral';
export type Dispersion = 'high' | 'medium' | 'low';

export interface MarketState {
    state: RiskState;
    /** Safe-haven average minus pro-cyclical average. Positive is risk-off. */
    spread: number;
    safeHavenAvg: number;
    proCyclicalAvg: number;
    strongest: ScoredCode[];
    weakest: ScoredCode[];
    /** Highest score minus lowest. */
    range: number;
    dispersion: Dispersion;
}

/** In stress, capital shelters here. */
const SAFE_HAVENS = ['JPY', 'CHF'] as const;
/** Tied to global growth and commodities; sold first in stress. */
const PRO_CYCLICAL = ['AUD', 'NZD'] as const;

/**
 * Spread beyond which the board is calling a regime.
 *
 * Below it the two baskets are scored too closely for the difference to mean
 * anything, and the honest answer is neutral rather than a direction read out
 * of noise.
 */
const REGIME_THRESHOLD = 8;

function average(scores: Readonly<Record<string, number>>, codes: readonly string[]): number {
    const values = codes.map((code) => scores[code]).filter((value): value is number => value !== undefined);
    if (values.length === 0) return 50;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Reads the regime from the currency scores.
 *
 * Not from a volatility index — from what the fundamental board itself says.
 * When the yen and franc outscore the Australian and New Zealand dollars, the
 * model is describing exactly the conditions that define risk-off, whether or
 * not the VIX has caught up yet.
 */
export function marketState(currencies: readonly ScoredCode[]): MarketState {
    const scores = Object.fromEntries(currencies.map((entry) => [entry.code, entry.score]));

    const safeHavenAvg = average(scores, SAFE_HAVENS);
    const proCyclicalAvg = average(scores, PRO_CYCLICAL);
    const spread = round(safeHavenAvg - proCyclicalAvg);

    const state: RiskState =
        spread > REGIME_THRESHOLD ? 'risk-off' : spread < -REGIME_THRESHOLD ? 'risk-on' : 'neutral';

    const ranked = [...currencies].sort((a, b) => b.score - a.score);
    const values = currencies.map((entry) => entry.score);
    const range = values.length === 0 ? 0 : round(Math.max(...values) - Math.min(...values));

    return {
        state,
        spread,
        safeHavenAvg: round(safeHavenAvg),
        proCyclicalAvg: round(proCyclicalAvg),
        strongest: ranked.slice(0, 3),
        // Reversed so the weakest currency reads first, matching how the
        // strongest list reads.
        weakest: ranked.slice(-3).reverse(),
        range,
        dispersion: range > 40 ? 'high' : range > 25 ? 'medium' : 'low',
    };
}

const STATE_LABELS: Record<RiskState, string> = {
    'risk-on': 'Risk-on',
    'risk-off': 'Risk-off',
    neutral: 'Neutre',
};

const DISPERSION_LABELS: Record<Dispersion, string> = {
    high: 'Élevée',
    medium: 'Moyenne',
    low: 'Faible',
};

export function stateLabel(state: RiskState): string {
    return STATE_LABELS[state];
}

export function dispersionLabel(dispersion: Dispersion): string {
    return DISPERSION_LABELS[dispersion];
}

/**
 * What the dispersion means for taking trades.
 *
 * A tightly-bunched board is the genuinely useful signal here: it says the
 * strongest available pair is still a weak pair, which is a reason to size
 * down or stand aside rather than to hunt harder.
 */
export function dispersionReading(dispersion: Dispersion): string {
    if (dispersion === 'high') {
        return "Les devises sont très dispersées : les écarts de paires sont larges et les setups fondamentaux sont nets.";
    }
    if (dispersion === 'medium') {
        return 'Dispersion modérée : les meilleures paires gardent un écart exploitable.';
    }
    return "Les scores sont resserrés : même la meilleure paire oppose deux devises proches. Peu de conviction fondamentale disponible.";
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
