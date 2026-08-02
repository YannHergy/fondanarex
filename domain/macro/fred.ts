// ================================================================
// FRED SERIES TRANSFORMS
//
// FRED (Federal Reserve Bank of St. Louis) publishes higher-quality
// US data than the OECD for several indicators, but it publishes
// them in raw form: CPI arrives as an index level, not a YoY rate,
// and the trade balance arrives in millions.
//
// These transforms turn an observation series into the (current,
// previous) pair the scoring engine expects. Pure: no fetch, no
// clock. In the legacy app this logic lived inside a Vercel handler
// and could only be exercised by calling the live API.
// ================================================================

/** One FRED observation as returned by the API. */
export interface FredObservation {
    date: string;
    /** FRED uses "." for a missing value. */
    value: string;
}

export interface FredDatapoint {
    current: number;
    previous: number;
    /** Period label of `current`, "YYYY-MM". */
    period: string;
    /** Observation date of `current`, "YYYY-MM-DD". */
    observedOn: string;
    /** Period label of `previous`, "YYYY-MM". */
    previousPeriod: string;
    /** Observation date of `previous`, "YYYY-MM-DD". */
    previousObservedOn: string;
}

export type FredTransform = 'direct' | 'yoy_from_index' | 'billions';

export interface FredSeriesConfig {
    /** Field on CurrencyData this series feeds. */
    field: string;
    seriesId: string;
    /** Observations to request. YoY needs at least 14 to see a full year back. */
    limitObs: number;
    transform: FredTransform;
}

/**
 * US series, carried over verbatim from the legacy FRED_FIELD_TO_SERIES map.
 *
 * FRED is US-only, so these apply to the USD alone. Every other currency is
 * sourced from the OECD.
 */
export const FRED_SERIES: readonly FredSeriesConfig[] = [
    { field: 'gdpQoQ',       seriesId: 'A191RL1Q225SBEA', limitObs: 4,  transform: 'direct' },
    { field: 'cpi',          seriesId: 'CPIAUCSL',        limitObs: 15, transform: 'yoy_from_index' },
    { field: 'coreCpi',      seriesId: 'CPILFESL',        limitObs: 15, transform: 'yoy_from_index' },
    { field: 'unemployment', seriesId: 'UNRATE',          limitObs: 3,  transform: 'direct' },
    { field: 'interestRate', seriesId: 'FEDFUNDS',        limitObs: 3,  transform: 'direct' },
    { field: 'tradeBalance', seriesId: 'BOPGSTB',         limitObs: 3,  transform: 'billions' },
    { field: 'wagePPI',      seriesId: 'CES0500000003',   limitObs: 15, transform: 'yoy_from_index' },
];

/** Drops missing values ("." or unparseable) and sorts oldest to newest. */
export function cleanObservations(
    observations: readonly FredObservation[],
): Array<{ date: string; value: number }> {
    return observations
        .map(o => ({ date: o.date, value: Number.parseFloat(o.value) }))
        .filter(o => Number.isFinite(o.value))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function periodOf(date: string): string {
    return date.slice(0, 7);
}

/**
 * Year-over-year rate from a raw index series (CPI, core CPI, wages).
 *
 * Needs 13 observations to compare against the same month a year earlier. The
 * previous reading compares month n-1 against n-13; when that 14th observation
 * is absent it falls back to the same base, which is what the legacy code did.
 */
export function yoyFromIndex(
    observations: readonly FredObservation[],
): FredDatapoint | null {
    const valid = cleanObservations(observations);
    if (valid.length < 13) return null;

    const n = valid.length;
    const current = valid[n - 1];
    const yearAgo = valid[n - 13];
    const prior = valid[n - 2];
    const priorYearAgo = valid[n - 14] ?? yearAgo;

    if (!current || !yearAgo || !prior || !priorYearAgo) return null;
    if (yearAgo.value === 0 || priorYearAgo.value === 0) return null;

    return {
        current: round2((current.value / yearAgo.value - 1) * 100),
        previous: round2((prior.value / priorYearAgo.value - 1) * 100),
        period: periodOf(current.date),
        observedOn: current.date,
        previousPeriod: periodOf(prior.date),
        previousObservedOn: prior.date,
    };
}

/** Latest two observations, used as published. */
export function directValue(
    observations: readonly FredObservation[],
): FredDatapoint | null {
    const valid = cleanObservations(observations);
    if (valid.length < 2) return null;

    const current = valid[valid.length - 1];
    const previous = valid[valid.length - 2];
    if (!current || !previous) return null;

    return {
        current: round2(current.value),
        previous: round2(previous.value),
        period: periodOf(current.date),
        observedOn: current.date,
        previousPeriod: periodOf(previous.date),
        previousObservedOn: previous.date,
    };
}

/** Latest two observations converted from millions to billions. */
export function millionsToBillions(
    observations: readonly FredObservation[],
): FredDatapoint | null {
    const direct = directValue(observations);
    if (!direct) return null;

    return {
        ...direct,
        current: round2(direct.current / 1000),
        previous: round2(direct.previous / 1000),
    };
}

/** Applies the transform a series is configured with. */
export function applyTransform(
    transform: FredTransform,
    observations: readonly FredObservation[],
): FredDatapoint | null {
    switch (transform) {
        case 'yoy_from_index':
            return yoyFromIndex(observations);
        case 'billions':
            return millionsToBillions(observations);
        case 'direct':
            return directValue(observations);
        default:
            return null;
    }
}
