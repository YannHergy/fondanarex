// ================================================================
// FRED — the CSV export, which needs no API key
//
// Distinct from domain/macro/fred.ts, which models the keyed JSON
// API. That path has never run in this app: FRED_API_KEY has never
// been configured, so `fredConfigured()` is false and the whole
// integration short-circuits. The graph CSV export
// (fredgraph.csv?id=...) serves the same data with no key at all,
// which is why it backs the series wired here.
//
// The response is a two-column CSV:
//
//     observation_date,CPIAUCNS
//     2026-05-01,335.123
//     2026-06-01,333.952
//
// A period with no reading carries "." rather than being absent.
//
// Pure: no fetch, no clock, no I/O.
// ================================================================

export interface FredPoint {
    /** The app's period convention: "2026-06" monthly, "2026-Q2" quarterly. */
    period: string;
    value: number;
}

export type FredFrequency = 'monthly' | 'quarterly';

/**
 * FRED stamps every observation with the FIRST day of its period, so the
 * quarter has to be derived from the month rather than read: January is Q1,
 * April Q2, July Q3, October Q4.
 */
export function toPeriod(isoDate: string, frequency: FredFrequency): string | null {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate.trim());
    if (!match) return null;
    const [, year, month] = match;
    if (frequency === 'monthly') return `${year}-${month}`;

    const monthNumber = Number(month);
    if (monthNumber < 1 || monthNumber > 12) return null;
    return `${year}-Q${Math.floor((monthNumber - 1) / 3) + 1}`;
}

/**
 * Every published observation, oldest first.
 *
 * FRED already returns rows in chronological order, but the sort is kept so a
 * caller never depends on that being true.
 */
export function parseFredCsv(
    csv: string | null | undefined,
    frequency: FredFrequency,
): FredPoint[] {
    if (!csv) return [];

    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    return lines
        .slice(1) // header
        .map((line) => {
            const [rawDate, rawValue] = line.split(',');
            if (rawDate === undefined || rawValue === undefined) return null;
            const trimmed = rawValue.trim();
            // "." is FRED's marker for a period it has no reading for.
            if (trimmed === '' || trimmed === '.') return null;
            const period = toPeriod(rawDate, frequency);
            const value = Number(trimmed);
            return period !== null && Number.isFinite(value) ? { period, value } : null;
        })
        .filter((point): point is FredPoint => point !== null)
        .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

/** The most recent published point, or null when the series is empty. */
export function latestFredPoint(points: readonly FredPoint[]): FredPoint | null {
    return points.length > 0 ? points[points.length - 1]! : null;
}
