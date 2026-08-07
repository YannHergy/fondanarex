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

export interface TrailingChange {
    /** Percentage move across the window. Signed. */
    changePct: number;
    /** The close the move is measured from. */
    from: DailyClose;
    /** The most recent close. */
    to: DailyClose;
    /** Calendar days actually spanned, which is rarely exactly the window. */
    spanDays: number;
}

/**
 * Percentage move over a trailing window of calendar days.
 *
 * A ROLLING WINDOW, NOT A CALENDAR MONTH, and the distinction matters. The
 * obvious alternative is the month-over-month move already available from
 * `toMonthlyReading` — but that compares the latest close to the previous
 * MONTH-END, so on the second of the month it reports a one-day move and by
 * the thirtieth a full one. The indicator would spend every month climbing out
 * of a hole it fell into at midnight on the first, and a reader could not tell
 * a calm month from a fresh one. Thirty trailing days always spans thirty days.
 *
 * The anchor is the LATEST DATE IN THE SERIES, never the current time: this
 * module owns no clock, and a stale series must report the move it actually
 * contains rather than silently widening its window as the days pass.
 *
 * Returns null when the series cannot support the measure — no data, or a base
 * price of zero or less. A barrel did trade below zero once, in April 2020, so
 * that is a real guard and not a formality; a percentage change off a negative
 * base is not meaningful.
 */
export function trailingChangePct(
    daily: readonly DailyClose[],
    windowDays: number,
): TrailingChange | null {
    const sorted = [...daily]
        .filter((point) => Number.isFinite(point.close))
        .sort((a, b) => a.date.localeCompare(b.date));

    const to = sorted.at(-1);
    if (!to || sorted.length < 2) return null;

    const cutoff = new Date(`${to.date}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    // The last close at or before the cutoff. Falls back to the oldest point
    // when the series is shorter than the window — a partial window reported
    // honestly through `spanDays` beats no reading at all.
    let from = sorted[0]!;
    for (const point of sorted) {
        if (point.date <= cutoffIso) from = point;
        else break;
    }

    if (from.date === to.date || from.close <= 0) return null;

    const spanDays = Math.round(
        (Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / 86_400_000,
    );

    return {
        changePct: ((to.close - from.close) / from.close) * 100,
        from,
        to,
        spanDays,
    };
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
