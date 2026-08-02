// ================================================================
// SDMX-JSON PARSING
//
// The OECD serves two incompatible shapes and the app needs both:
//
//   v2.0 (sdmx.oecd.org)  json.data.dataSets[0].observations
//                         json.data.structures[0].dimensions.observation
//                         country dimension id = "REF_AREA"
//   v1.x (stats.oecd.org) json.dataSets[0].observations
//                         json.structure.dimensions.observation
//                         country dimension id = "LOCATION"
//
// v1.x is still required because the trade-balance series was never
// migrated to the new API.
//
// Pure: no fetch, no cache, no I/O. Given a parsed JSON body it
// returns numbers, which is what makes it testable — the legacy
// version of this code was reachable only through a live API call.
// ================================================================

/** One indicator reading for one country. */
export interface SdmxDatapoint {
    /** Most recent observation */
    current: number;
    /** Preceding observation, for momentum */
    previous: number;
    /** Period label of `current`, e.g. "2026-01" or "2025-Q4" */
    latestPeriod: string;
    /**
     * Period label of `previous`, or null when only one observation exists.
     *
     * Needed because both readings are persisted as separate dated rows. Storing
     * only the latest would leave every momentum scorer without a prior value,
     * and those scorers fall back to treating the change as zero — a currency
     * whose inflation was accelerating would score as though it were flat.
     */
    previousPeriod: string | null;
}

interface SdmxDimension {
    id: string;
    values: Array<{ id: string }>;
}

/**
 * Decodes an SDMX-JSON body into `{ countryCode: { period: value } }`.
 *
 * Observation keys are colon-joined dimension indices ("0:3:1:..."), where
 * position i indexes into `dimensions[i].values`. Only the country and time
 * dimensions are needed, so the rest are ignored rather than enumerated.
 *
 * @param divisor Scales the raw value — e.g. 1000 to turn millions into billions.
 */
export interface SdmxParseResult {
    values: Record<string, Record<string, number>>;
    /**
     * Number of (country, period) slots that matched MORE THAN ONE observation.
     *
     * This is a correctness alarm, not a statistic. It means the query key left
     * a dimension unpinned — for example asking the OECD price dataflow for CPI
     * without fixing EXPENDITURE, which returns 29 sub-indices (food, health,
     * fuels, ...) alongside the headline. The first one encountered would then
     * silently become "the CPI", and the resulting score would be wrong in a way
     * nothing else in the system could detect.
     *
     * Callers must treat a non-zero value as a broken query, not as noise.
     */
    collisions: number;
}

/** Backwards-compatible view over {@link parseSdmxSeries}. */
export function parseSdmxJson(
    json: unknown,
    divisor = 1,
): Record<string, Record<string, number>> {
    return parseSdmxSeries(json, divisor).values;
}

export function parseSdmxSeries(json: unknown, divisor = 1): SdmxParseResult {
    const result: Record<string, Record<string, number>> = {};
    let collisions = 0;
    if (divisor === 0) return { values: result, collisions };

    const root = json as {
        data?: {
            structures?: Array<{ dimensions?: { observation?: SdmxDimension[] } }>;
            dataSets?: Array<{ observations?: Record<string, Array<number | null>> }>;
        };
        structure?: { dimensions?: { observation?: SdmxDimension[] } };
        dataSets?: Array<{ observations?: Record<string, Array<number | null>> }>;
    } | null;

    const dimensions =
        root?.data?.structures?.[0]?.dimensions?.observation ??
        root?.structure?.dimensions?.observation;

    const observations =
        root?.data?.dataSets?.[0]?.observations ?? root?.dataSets?.[0]?.observations;

    if (!dimensions || !observations) return { values: result, collisions };

    const locationPosition = dimensions.findIndex(
        d => d.id === 'REF_AREA' || d.id === 'LOCATION',
    );
    const timePosition = dimensions.findIndex(d => d.id === 'TIME_PERIOD');
    if (locationPosition === -1 || timePosition === -1) return { values: result, collisions };

    const locationValues = dimensions[locationPosition]?.values ?? [];
    const timeValues = dimensions[timePosition]?.values ?? [];

    for (const [key, values] of Object.entries(observations)) {
        const indices = key.split(':').map(Number);

        const locationIndex = indices[locationPosition];
        const timeIndex = indices[timePosition];
        if (locationIndex === undefined || timeIndex === undefined) continue;

        const country = locationValues[locationIndex]?.id;
        const period = timeValues[timeIndex]?.id;
        const value = values[0];

        if (!country || !period || value === null || value === undefined) continue;

        const byPeriod = (result[country] ??= {});
        // Several series land on the same (country, period) when the key leaves
        // a dimension unpinned. The first still wins so the shape of the result
        // is unchanged, but the collision is COUNTED — see SdmxParseResult.
        if (period in byPeriod) {
            collisions += 1;
        } else {
            byPeriod[period] = value / divisor;
        }
    }

    return { values: result, collisions };
}

/**
 * Latest two observations from a period map.
 *
 * Periods sort lexicographically for both monthly ("2026-01") and quarterly
 * ("2025-Q4") labels, so no date parsing is needed.
 *
 * When only one observation exists, `previous` repeats `current`. That reports
 * zero momentum rather than unknown momentum — carried over from the legacy
 * behaviour deliberately, because the scorers treat a missing previous value as
 * a reason to exclude the indicator entirely, which is a bigger distortion than
 * a flat reading.
 */
export function extractLatestTwo(
    periodMap: Record<string, number>,
): SdmxDatapoint | null {
    const periods = Object.keys(periodMap).sort().reverse();

    const latest = periods[0];
    if (latest === undefined) return null;

    const current = periodMap[latest];
    if (current === undefined) return null;

    const priorPeriod = periods[1];
    const previous = priorPeriod === undefined ? current : (periodMap[priorPeriod] ?? current);

    const round = (n: number) => Math.round(n * 100) / 100;

    return {
        current: round(current),
        previous: round(previous),
        latestPeriod: latest,
        previousPeriod: priorPeriod ?? null,
    };
}

// ================================================================
// COUNTRY CODE MAPPING
// ================================================================

/**
 * OECD reference area -> currency code.
 *
 * The euro area appears under more than one code depending on the dataflow:
 * the price and labour dataflows use `EA20` (the 20 members), while the
 * national-accounts dataflow uses plain `EA`. Both must map to EUR or the euro
 * area silently disappears from whichever dataset uses the other spelling.
 */
export const OECD_TO_CURRENCY: Record<string, string> = {
    AUS: 'AUD',
    CAN: 'CAD',
    GBR: 'GBP',
    NZL: 'NZD',
    JPN: 'JPY',
    CHE: 'CHF',
    EA20: 'EUR',
    EA: 'EUR',
    EA19: 'EUR',
    USA: 'USD',
};

/**
 * Currency -> canonical OECD area. Built explicitly rather than by inverting
 * the map above, which would make the EUR entry depend on key order.
 */
export const CURRENCY_TO_OECD: Record<string, string> = {
    AUD: 'AUS',
    CAD: 'CAN',
    GBP: 'GBR',
    NZD: 'NZL',
    JPY: 'JPN',
    CHF: 'CHE',
    EUR: 'EA20',
    USD: 'USA',
};

/**
 * Reduces a parsed SDMX body to one datapoint per currency, dropping countries
 * the app does not track.
 */
export function toCurrencyDatapoints(
    parsed: Record<string, Record<string, number>>,
): Record<string, SdmxDatapoint> {
    const result: Record<string, SdmxDatapoint> = {};

    for (const [oecdCode, periodMap] of Object.entries(parsed)) {
        const currency = OECD_TO_CURRENCY[oecdCode];
        if (!currency) continue;

        const datapoint = extractLatestTwo(periodMap);
        if (datapoint) result[currency] = datapoint;
    }

    return result;
}
