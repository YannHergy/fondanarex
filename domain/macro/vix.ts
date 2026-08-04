// ================================================================
// VIX — CBOE VOLATILITY INDEX
//
// The `risque` indicator is the single heaviest line in two of the
// eight profiles (CHF 28%, JPY 22%) and worth 10% for the AUD and
// the NZD. The scoring side already exists and is tested:
// riskOffFromVix() in the engine turns a VIX LEVEL into a risk-off
// intensity, and the engine then keeps that intensity for the safe
// havens and flips its sign for the pro-cyclicals. Nothing here
// needs to know about that — this module's only job is to produce
// an honest VIX level and the one it should be compared against.
//
// Pure: no fetch, no cache, no I/O.
// ================================================================

export interface VixDailyClose {
    /** ISO date of the session, "2026-07-31" */
    date: string;
    close: number;
}

export interface VixReading {
    current: number;
    /** Previous MONTH's last close — see monthlyCloses() for why not yesterday's. */
    previous: number;
    /** Month label of `current`, "2026-08" */
    period: string;
    /** Month label of `previous`, or null when only one month is available. */
    previousPeriod: string | null;
}

/**
 * Last close of each month, oldest first.
 *
 * The VIX is a daily series but IndicatorValue stores a monthly period
 * (VarChar(8)), and every other indicator in the table is monthly or
 * quarterly. Collapsing to one point per month keeps that consistent and,
 * for this particular series, is also the better comparison: riskOffFromVix
 * reads a ±2 point move as a momentum signal, and day-to-day the VIX crosses
 * that threshold on noise alone. Month-on-month captures an actual shift in
 * regime.
 */
export function monthlyCloses(daily: readonly VixDailyClose[]): VixDailyClose[] {
    const lastOfMonth = new Map<string, VixDailyClose>();

    for (const point of daily) {
        if (!Number.isFinite(point.close)) continue;
        const month = point.date.slice(0, 7);
        const seen = lastOfMonth.get(month);
        // Not assuming the input is sorted: keep the latest date seen.
        if (!seen || point.date > seen.date) lastOfMonth.set(month, point);
    }

    return [...lastOfMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Latest month's close and the month before it. Null when there is no usable data. */
export function toVixReading(daily: readonly VixDailyClose[]): VixReading | null {
    const months = monthlyCloses(daily);
    const latest = months.at(-1);
    if (!latest) return null;

    const prior = months.at(-2);
    return {
        current: latest.close,
        // With a single month available, comparing the value to itself yields
        // zero momentum — correct, rather than inventing a direction.
        previous: prior?.close ?? latest.close,
        period: latest.date.slice(0, 7),
        previousPeriod: prior ? prior.date.slice(0, 7) : null,
    };
}
