// ================================================================
// EUROSTAT — JSON-stat parsing for the euro area
//
// Eurostat answers in JSON-stat: dimensions are declared
// separately from the values, and the values live in a SPARSE
// object keyed by a flat numeric index rather than an array.
// A period with no reading is simply absent from that object,
// which is why every reader here must treat a missing key as
// "not published yet" and never as zero.
//
// Pure: no fetch, no clock, no I/O.
// ================================================================

/** The shape Eurostat actually returns, narrowed to what we read. */
export interface JsonStatResponse {
    label?: string;
    value?: Record<string, number | null>;
    dimension?: {
        time?: { category?: { index?: Record<string, number> } };
        unit?: { category?: { label?: Record<string, string> } };
    };
}

export interface EurostatPoint {
    /** Eurostat's own period label: "2025-12" or "2026-Q2". */
    period: string;
    value: number;
}

/**
 * Every published point, oldest first.
 *
 * Sorted by Eurostat's declared INDEX rather than by the period string,
 * because the index is the authoritative order — the labels happen to sort
 * correctly for monthly data but a mix of "2026-Q1" and "2026-01" would not.
 *
 * Null values are dropped rather than kept as zero. A month Eurostat has not
 * published yet is present in the time dimension with no matching value, and
 * writing that as 0 would read as deflation rather than as absence.
 */
export function parseJsonStat(payload: JsonStatResponse | null | undefined): EurostatPoint[] {
    const index = payload?.dimension?.time?.category?.index;
    const values = payload?.value;
    if (!index || !values) return [];

    return Object.entries(index)
        .sort((a, b) => a[1] - b[1])
        .map(([period, position]) => ({ period, value: values[String(position)] }))
        .filter((point): point is EurostatPoint =>
            typeof point.value === "number" && Number.isFinite(point.value),
        );
}

/** The most recent published point, or null when the series is empty. */
export function latestPoint(points: readonly EurostatPoint[]): EurostatPoint | null {
    return points.length > 0 ? points[points.length - 1]! : null;
}

/**
 * Sanity bound for a euro-area macro reading.
 *
 * Every indicator we pull is a PERCENTAGE — an inflation rate, a quarterly
 * growth rate, an unemployment rate. None of them legitimately leaves this
 * band, so a value outside it means a dimension filter selected an index level
 * instead of a rate. That is precisely the mistake that nearly wrote a 103%
 * growth figure for China, so it is refused here rather than trusted.
 */
const MIN_PLAUSIBLE = -50;
const MAX_PLAUSIBLE = 100;

export function isPlausibleRate(value: number): boolean {
    return Number.isFinite(value) && value > MIN_PLAUSIBLE && value < MAX_PLAUSIBLE;
}

/**
 * Sanity bound for the euro-area trade balance, in BILLIONS.
 *
 * Distinct from `isPlausibleRate` on purpose: this is a monetary aggregate,
 * not a percentage, and the two must never share a bound. Eurostat serves it
 * in millions — get the scale conversion wrong by a factor of 1000 and this
 * is exactly the check that would catch it, the same way the percentage bound
 * catches an index level mistaken for a rate.
 *
 * ±500bn is generous against anything the euro area has ever printed in a
 * single month (the widest swing seen while building this was under 55bn
 * either way) — wide enough to never reject a real reading, tight enough to
 * catch an actual units mistake.
 */
const MIN_PLAUSIBLE_BALANCE = -500;
const MAX_PLAUSIBLE_BALANCE = 500;

export function isPlausibleBalance(value: number): boolean {
    return (
        Number.isFinite(value) && value > MIN_PLAUSIBLE_BALANCE && value < MAX_PLAUSIBLE_BALANCE
    );
}
