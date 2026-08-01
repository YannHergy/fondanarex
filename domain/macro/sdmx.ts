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
export function parseSdmxJson(
    json: unknown,
    divisor = 1,
): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    if (divisor === 0) return result;

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

    if (!dimensions || !observations) return result;

    const locationPosition = dimensions.findIndex(
        d => d.id === 'REF_AREA' || d.id === 'LOCATION',
    );
    const timePosition = dimensions.findIndex(d => d.id === 'TIME_PERIOD');
    if (locationPosition === -1 || timePosition === -1) return result;

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
        // Several series can land on the same (country, period) when the key
        // pattern leaves a dimension unfiltered. The first non-null wins, which
        // matches the legacy behaviour.
        if (!(period in byPeriod)) byPeriod[period] = value / divisor;
    }

    return result;
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
    };
}

// ================================================================
// COUNTRY CODE MAPPING
// ================================================================

/** OECD reference area -> currency code. EA20 is the euro area aggregate. */
export const OECD_TO_CURRENCY: Record<string, string> = {
    AUS: 'AUD',
    CAN: 'CAD',
    GBR: 'GBP',
    NZL: 'NZD',
    JPN: 'JPY',
    CHE: 'CHF',
    EA20: 'EUR',
    USA: 'USD',
};

export const CURRENCY_TO_OECD: Record<string, string> = Object.fromEntries(
    Object.entries(OECD_TO_CURRENCY).map(([oecd, currency]) => [currency, oecd]),
);

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
