// ================================================================
// ECB DATA PORTAL — SDMX-JSON parsing for the ECB's own series
//
// Different shape from Eurostat's JSON-stat (see eurostat.ts):
// observations live under dataSets[0].series["<key>"].observations,
// a SPARSE object keyed by a flat numeric position, and the actual
// dates live separately under structure.dimensions.observation[0].values
// (id: "TIME_PERIOD"). One query = one series here, so there is
// always exactly one key under `series` once dimensions are pinned
// in the request URL.
//
// Pure: no fetch, no clock, no I/O.
// ================================================================

export interface EcbObservationValue {
    id: string;
}

export interface EcbSdmxResponse {
    dataSets?: Array<{
        series?: Record<string, { observations?: Record<string, [number, ...unknown[]]> }>;
    }>;
    structure?: {
        dimensions?: {
            observation?: Array<{ id: string; values: EcbObservationValue[] }>;
        };
    };
}

export interface EcbPoint {
    /** ECB's own period label, daily for this dataset: "2026-06-17". */
    period: string;
    value: number;
}

/**
 * Every published observation, oldest first.
 *
 * The DFR/MRR series publish daily but the rate only actually MOVES on a
 * decision date — every other day repeats the same value. Left as-is here
 * (one point per day) rather than collapsed to only the days it changed:
 * `parseJsonStat`'s Eurostat counterpart keeps one point per Eurostat period
 * for the same reason, and the chart's step-line rendering already draws a
 * flat segment between two identical values however many points make it up.
 */
export function parseEcbSdmx(payload: EcbSdmxResponse | null | undefined): EcbPoint[] {
    const dataset = payload?.dataSets?.[0];
    const seriesMap = dataset?.series;
    const timeValues = payload?.structure?.dimensions?.observation?.[0]?.values;
    if (!seriesMap || !timeValues) return [];

    const key = Object.keys(seriesMap)[0];
    if (key === undefined) return [];
    const observations = seriesMap[key]?.observations;
    if (!observations) return [];

    return Object.entries(observations)
        .map(([position, obs]) => {
            const index = Number(position);
            const period = timeValues[index]?.id;
            const value = obs[0];
            return period !== undefined && typeof value === "number" ? { period, value } : null;
        })
        .filter((point): point is EcbPoint => point !== null && Number.isFinite(point.value))
        .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

/** The most recent published point, or null when the series is empty. */
export function latestEcbPoint(points: readonly EcbPoint[]): EcbPoint | null {
    return points.length > 0 ? points[points.length - 1]! : null;
}

/**
 * Sanity bound for a euro-area policy rate, in percentage points.
 *
 * The DFR and MRR have never left roughly -1% to 20% in the euro's history —
 * a value outside this band means a dimension filter picked up something
 * that is not a rate (an index level, a volume) rather than a real reading.
 */
const MIN_PLAUSIBLE_RATE = -1;
const MAX_PLAUSIBLE_RATE = 20;

export function isPlausiblePolicyRate(value: number): boolean {
    return Number.isFinite(value) && value > MIN_PLAUSIBLE_RATE && value < MAX_PLAUSIBLE_RATE;
}
