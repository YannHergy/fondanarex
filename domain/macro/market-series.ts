// ================================================================
// CONTINUOUSLY-QUOTED MARKET SERIES
//
// The VIX and the oil barrel are priced every second the market is
// open, while IndicatorValue stores one row per MONTH like every
// other indicator. These helpers bridge the two: they reduce a
// daily series to one point per month, so a market price sits in
// the same table as a CPI print without pretending to be one.
//
// Monthly rather than daily is also the right comparison for
// scoring. Every scorer in the engine reads its momentum from the
// previous stored period, with thresholds meant for macro moves —
// ±2 VIX points, ±5% on a barrel. Day to day, both cross those
// thresholds on noise alone, and the score would oscillate on
// nothing.
//
// Pure: no fetch, no cache, no I/O.
// ================================================================

export interface DailyClose {
    /** ISO date of the session, "2026-07-31" */
    date: string;
    close: number;
}

export interface MonthlyReading {
    current: number;
    /** Previous MONTH's last close. */
    previous: number;
    /** Month label of `current`, "2026-08" */
    period: string;
    /** Month label of `previous`, or null when only one month is available. */
    previousPeriod: string | null;
}

/**
 * Last close of each month, oldest first.
 *
 * The input is not assumed to be sorted, and sessions with no usable close
 * are dropped rather than zeroed — a holiday inside the requested range comes
 * back as null from the provider, and a VIX or a barrel at 0 would read as an
 * extreme reading rather than as missing data.
 */
export function monthlyCloses(daily: readonly DailyClose[]): DailyClose[] {
    const lastOfMonth = new Map<string, DailyClose>();

    for (const point of daily) {
        if (!Number.isFinite(point.close)) continue;
        const month = point.date.slice(0, 7);
        const seen = lastOfMonth.get(month);
        if (!seen || point.date > seen.date) lastOfMonth.set(month, point);
    }

    return [...lastOfMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Latest month's close and the month before it. Null when there is no usable data. */
export function toMonthlyReading(daily: readonly DailyClose[]): MonthlyReading | null {
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
