/**
 * Global Dairy Trade — the NZD's first commodity driver.
 *
 * Dairy is roughly a quarter of New Zealand's exports and the GDT auction is
 * where it is priced, every two weeks. `scoreDairy` reads the percentage move
 * of the GDT Price Index between consecutive events, saturating at ±10%.
 *
 * WHERE THE NUMBERS COME FROM. globaldairytrade.info renders its results
 * client-side, so the HTML carries the labels and none of the figures — a
 * scraper reading the page would find "Change in GDT Price Index" followed by
 * an empty percent sign. The figures are served as plain JSON from a public S3
 * bucket, with no key and no authentication, which is what this module parses.
 *
 * EVERY FIELD ARRIVES AS A STRING, including the numbers and including the
 * sign: "0.1", "-3.4", "409.00". Nothing here trusts a field to be the type
 * its name suggests.
 */

/** The shape actually served, with every value a string. */
export interface RawEventSummary {
    EventSummary?: {
        EventNumber?: string;
        EventDate?: string;
        AveragePublishedPrice?: string;
        ChangeInPriceIndex?: string;
    };
}

export interface RawTwelveEvents {
    PriceIndicesTwelveMonths?: {
        Events?: {
            EventDetails?: Array<{
                EventNumber?: string;
                EventDate?: string;
                PriceIndexPercentageChange?: string;
                PriceIndex?: string;
            }>;
        };
    };
}

export interface GdtEvent {
    /** Auction number, e.g. 409. */
    eventNumber: number;
    /** Auction date, midday UTC on the published day. */
    eventDate: Date;
    /** Percentage move of the index since the previous event. Signed. */
    changePct: number;
    /** Quantity-weighted average winning price, USD per tonne. */
    averagePrice: number | null;
}

/**
 * Bound on a believable auction move.
 *
 * GDT events move by single digits as a rule and have never approached this in
 * the index's history. The bound exists for the same reason the Chinese GDP
 * guard does: a parsing or upstream unit change should cost the reading, not
 * silently drive the NZD score to its limit.
 */
const MAX_PLAUSIBLE_MOVE = 25;

/** GDT runs fortnightly. Past this a reading is reported, but flagged. */
export const STALE_AFTER_DAYS = 30;

function toNumber(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The published date, parsed without relying on the host's locale.
 *
 * The field reads "August 4, 2026 12:00:00". Handing that to `new Date` works
 * in a V8 running in English and is not something to depend on for a value
 * that decides whether an indicator is shown as stale, so the month name is
 * matched explicitly and the result pinned to midday UTC — the auction has no
 * meaningful clock time, and midday keeps it on the right calendar day either
 * side of the date line, which for a New Zealand indicator is not academic.
 */
const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
];

export function parseEventDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null;

    const match = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(value);
    if (!match) return null;

    const month = MONTHS.indexOf(match[1]!.toLowerCase());
    if (month < 0) return null;

    const day = Number.parseInt(match[2]!, 10);
    const year = Number.parseInt(match[3]!, 10);
    if (day < 1 || day > 31) return null;

    const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
    // Rejects the 31st of a 30-day month, which Date.UTC would roll forward.
    return date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

/**
 * Reads one auction result.
 *
 * Returns null rather than a partial event: a change with no date cannot be
 * checked for staleness, and a date with no change scores nothing. The average
 * price is the one genuinely optional field — it is displayed, never scored.
 */
export function parseEventSummary(payload: RawEventSummary | null | undefined): GdtEvent | null {
    const summary = payload?.EventSummary;
    if (!summary) return null;

    const changePct = toNumber(summary.ChangeInPriceIndex);
    const eventNumber = toNumber(summary.EventNumber);
    const eventDate = parseEventDate(summary.EventDate);

    if (changePct === null || eventNumber === null || eventDate === null) return null;
    if (Math.abs(changePct) > MAX_PLAUSIBLE_MOVE) return null;

    return {
        eventNumber: Math.round(eventNumber),
        eventDate,
        changePct,
        averagePrice: toNumber(summary.AveragePublishedPrice),
    };
}

export interface GdtHistoryPoint {
    eventNumber: number;
    eventDate: Date;
    changePct: number;
    /** The index level itself, e.g. 1273. */
    priceIndex: number | null;
}

/**
 * The twelve most recent auctions, oldest first.
 *
 * Malformed entries are skipped rather than failing the series: a chart of
 * eleven events beats no chart, and the upstream has no contract with us.
 */
export function parseTwelveEvents(payload: RawTwelveEvents | null | undefined): GdtHistoryPoint[] {
    const details = payload?.PriceIndicesTwelveMonths?.Events?.EventDetails ?? [];

    const points: GdtHistoryPoint[] = [];

    for (const entry of details) {
        const changePct = toNumber(entry.PriceIndexPercentageChange);
        const eventNumber = toNumber(entry.EventNumber);
        const eventDate = parseEventDate(entry.EventDate);

        if (changePct === null || eventNumber === null || eventDate === null) continue;
        if (Math.abs(changePct) > MAX_PLAUSIBLE_MOVE) continue;

        points.push({
            eventNumber: Math.round(eventNumber),
            eventDate,
            changePct,
            priceIndex: toNumber(entry.PriceIndex),
        });
    }

    return points.sort((a, b) => a.eventNumber - b.eventNumber);
}

/**
 * Whether a reading is too old to present as current.
 *
 * `now` is a parameter because the domain layer owns no clock — the same
 * inputs must always give the same answer, which a hidden Date.now() would
 * break for every test that outlives its fixtures.
 */
export function isStale(event: GdtEvent, now: Date): boolean {
    const ageDays = (now.getTime() - event.eventDate.getTime()) / 86_400_000;
    return ageDays > STALE_AFTER_DAYS;
}

/** Reading of an auction move, for display beside the number. */
export function gdtVerdict(changePct: number): string {
    if (changePct >= 3) return 'Enchères laitières en forte hausse';
    if (changePct > 0.5) return 'Enchères laitières en hausse';
    if (changePct >= -0.5) return 'Enchères laitières stables';
    if (changePct > -3) return 'Enchères laitières en baisse';
    return 'Enchères laitières en forte baisse';
}
