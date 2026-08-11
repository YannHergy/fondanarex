// ================================================================
// ONS — Office for National Statistics (UK)
//
// Every ONS timeseries page serves its own JSON when `/data` is
// appended to the URL. No key, no registration.
//
// The payload splits one series across three arrays — `months`,
// `quarters`, `years` — and a series populates whichever it
// publishes at. Periods are human strings ("2026 JUN", "2026 Q2"),
// values are STRINGS, and a suppressed period is present with an
// empty value rather than absent.
//
// Pure: no fetch, no clock, no I/O.
// ================================================================

export interface OnsPoint {
    /** Normalised to the app's period convention: "2026-06" or "2026-Q2". */
    period: string;
    value: number;
}

export interface OnsEntry {
    date?: string;
    value?: string;
    year?: string;
    month?: string;
    quarter?: string;
}

export interface OnsResponse {
    months?: OnsEntry[];
    quarters?: OnsEntry[];
    years?: OnsEntry[];
    description?: {
        title?: string;
        cdid?: string;
        unit?: string;
        nextRelease?: string;
    };
}

const MONTH_NUMBER: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * "2026 JUN" -> "2026-06", "2026 Q2" -> "2026-Q2".
 *
 * Reads the `month`/`quarter` fields when present and falls back to parsing
 * `date`, because the two disagree in case and length: `month` is "June" while
 * `date` carries "JUN".
 */
export function normalisePeriod(entry: OnsEntry): string | null {
    const year = (entry.year ?? '').trim();
    if (!/^\d{4}$/.test(year)) return null;

    const quarter = (entry.quarter ?? '').trim().toUpperCase();
    if (/^Q[1-4]$/.test(quarter)) return `${year}-${quarter}`;

    const monthName = (entry.month ?? '').trim().toLowerCase();
    if (monthName && MONTH_NUMBER[monthName]) return `${year}-${MONTH_NUMBER[monthName]}`;

    // Fall back to the display string, e.g. "2026 JUN" or "2026 Q2".
    const fromDate = (entry.date ?? '').trim();
    const quarterMatch = /^(\d{4})\s+(Q[1-4])$/i.exec(fromDate);
    if (quarterMatch) return `${quarterMatch[1]}-${quarterMatch[2]!.toUpperCase()}`;
    const monthMatch = /^(\d{4})\s+([A-Za-z]{3,})$/.exec(fromDate);
    if (monthMatch) {
        const key = monthMatch[2]!.toLowerCase();
        if (MONTH_NUMBER[key]) return `${monthMatch[1]}-${MONTH_NUMBER[key]}`;
    }

    // An annual entry carries the year alone, in both `year` and `date`.
    // periodEnd() reads a bare "2025" as the last day of that year.
    if (fromDate === year) return year;

    return null;
}

/**
 * Every published point of the finest frequency the series carries, oldest
 * first.
 *
 * Monthly wins over quarterly when both are present: several ONS series
 * publish an annual roll-up alongside the monthly detail, and taking the
 * coarser one would silently drop eleven readings in twelve.
 */
export function parseOnsSeries(payload: OnsResponse | null | undefined): OnsPoint[] {
    const entries =
        payload?.months?.length ? payload.months
        : payload?.quarters?.length ? payload.quarters
        : (payload?.years ?? []);

    return entries
        .map((entry) => {
            const period = normalisePeriod(entry);
            const raw = (entry.value ?? '').trim();
            if (period === null || raw === '') return null;
            const value = Number(raw);
            return Number.isFinite(value) ? { period, value } : null;
        })
        .filter((point): point is OnsPoint => point !== null)
        .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

/**
 * Year-on-year percentage change, derived from an index series.
 *
 * The ONS publishes the retail sales VOLUME INDEX but no year-on-year series
 * for it, while the headline everyone quotes is the year-on-year rate. Twelve
 * months back on a monthly series, four quarters back on a quarterly one.
 *
 * Verified against the published headline: the index moved 100.6 -> 104.8 over
 * the year to June 2026, giving 4.17%, and the reported figure was 4.2% — the
 * gap is the index being published to one decimal, not a different concept.
 */
export function toYearOnYear(points: readonly OnsPoint[]): OnsPoint[] {
    const lag = points.some((p) => p.period.includes('-Q')) ? 4 : 12;
    const out: OnsPoint[] = [];
    for (let i = lag; i < points.length; i++) {
        const now = points[i]!;
        const before = points[i - lag]!;
        if (before.value === 0) continue;
        out.push({
            period: now.period,
            value: ((now.value / before.value) - 1) * 100,
        });
    }
    return out;
}

/** The most recent published point, or null when the series is empty. */
export function latestOnsPoint(points: readonly OnsPoint[]): OnsPoint | null {
    return points.length > 0 ? points[points.length - 1]! : null;
}
