// ================================================================
// STATISTICS DASHBOARD (Statistics Bureau of Japan)
//
// Source of the Tokyo CPI, which is 12% of the JPY profile and had
// no provider at all: FXMacroData has no slug for it (fifteen
// variants tested), and FRED carries 230 Japanese CPI series but
// only national ones.
//
// This API needs no key and no registration, and its data is under
// the Public Data License 1.0 — free reuse, commercial included.
// Two credits are mandatory in return; see ESTAT_CREDIT and
// ESTAT_API_NOTICE below, which the Méthodologie page renders.
//
// Pure: no fetch, no cache, no I/O.
// ================================================================

/**
 * Attribution required by the licence. Must stay visible to users.
 */
export const ESTAT_CREDIT =
    'Source : Statistics Dashboard (https://dashboard.e-stat.go.jp/en/)';

/**
 * Additional notice required specifically when the API is used, so no
 * reader mistakes our figures for something the Bureau vouches for.
 */
export const ESTAT_API_NOTICE =
    'This service uses the API feature of Statistics Dashboard, but the contents of this service are not guaranteed by the Statistics Bureau of Japan.';

/** Consumer Price Index, all items less fresh food, year-on-year %, monthly. */
export const TOKYO_CPI_INDICATOR = '0703010501010030010';

/** Tokyo ku-area — the 23 wards, which is what "Tokyo CPI" means in FX. */
export const TOKYO_REGION = '13100';

export interface EstatPoint {
    /** Month label, "2026-06" */
    period: string;
    value: number;
}

/** One reading and the one before it, for the engine's momentum. */
export interface EstatReading {
    current: number;
    previous: number;
    period: string;
    previousPeriod: string | null;
}

interface RawValue {
    '@time'?: string;
    '@regionCode'?: string;
    $?: string;
}

/**
 * Statistics Dashboard labels a month as "YYYYMM00" — a day component that is
 * always zero. Anything else (their annual and fiscal-year series use "YYYYCY"
 * and "YYYYFY") is not a month and is dropped rather than coerced.
 */
export function toMonthLabel(time: string): string | null {
    if (!/^\d{6}00$/.test(time)) return null;
    const month = time.slice(4, 6);
    if (month < '01' || month > '12') return null;
    return `${time.slice(0, 4)}-${month}`;
}

/**
 * Monthly points for one region, oldest first.
 *
 * The response carries every municipality when no region filter is applied, so
 * the region is matched here rather than assumed — reading the wrong city's
 * inflation would be invisible in the UI.
 */
export function parseEstatPoints(
    payload: unknown,
    regionCode: string,
): EstatPoint[] {
    const rows = extractValues(payload);
    const points: EstatPoint[] = [];

    for (const row of rows) {
        if (row['@regionCode'] !== regionCode) continue;
        const period = toMonthLabel(row['@time'] ?? '');
        if (!period) continue;
        const value = Number.parseFloat(row.$ ?? '');
        if (!Number.isFinite(value)) continue;
        points.push({ period, value });
    }

    points.sort((a, b) => a.period.localeCompare(b.period));
    return points;
}

/** Latest month and the one before it. Null when nothing usable is present. */
export function toEstatReading(points: readonly EstatPoint[]): EstatReading | null {
    const latest = points.at(-1);
    if (!latest) return null;

    const prior = points.at(-2);
    return {
        current: latest.value,
        // Comparing a lone reading to itself yields zero momentum, which is
        // honest — better than inventing a direction from nothing.
        previous: prior?.value ?? latest.value,
        period: latest.period,
        previousPeriod: prior?.period ?? null,
    };
}

function extractValues(payload: unknown): RawValue[] {
    if (typeof payload !== 'object' || payload === null) return [];
    const stats = (payload as Record<string, unknown>).GET_STATS;
    if (typeof stats !== 'object' || stats === null) return [];

    const data = (stats as Record<string, unknown>).STATISTICAL_DATA;
    if (typeof data !== 'object' || data === null) return [];

    const info = (data as Record<string, unknown>).DATA_INF;
    if (typeof info !== 'object' || info === null) return [];

    const objects = (info as Record<string, unknown>).DATA_OBJ;
    // A single-point response comes back as an object rather than an array.
    const list = Array.isArray(objects) ? objects : objects ? [objects] : [];

    const out: RawValue[] = [];
    for (const entry of list) {
        if (typeof entry !== 'object' || entry === null) continue;
        const value = (entry as Record<string, unknown>).VALUE;
        if (typeof value === 'object' && value !== null) out.push(value as RawValue);
    }
    return out;
}
