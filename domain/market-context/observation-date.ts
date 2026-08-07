/**
 * The date a market-context reading is said to have been observed.
 *
 * WHY IT IS EDITABLE. Every manual entry used to be stamped with the day it
 * was typed. That is wrong often enough to matter: a GDT auction result read
 * on Thursday belongs to Tuesday's auction, and a figure caught up on after a
 * week away belongs to the week it describes. Because `getMarketContext` keeps
 * the NEWEST row per key, a back-dated correction typed today would otherwise
 * override the real reading and then claim to be more recent than it is.
 *
 * WHY IT IS STILL CONSTRAINED. The date is not free text. A reading cannot
 * come from the future — there is no market data for tomorrow — and a date
 * decades back is a typo rather than an intention. Both are refused with a
 * message rather than silently corrected, because silently moving someone's
 * date is worse than telling them it was wrong.
 */

/** Beyond this, a date is a slip of the keyboard rather than a backfill. */
const MAX_YEARS_BACK = 5;

/**
 * Bounds for a NEXT-RELEASE date, which is a different animal.
 *
 * An observation describes something that has happened, so it can never be in
 * the future. A scheduled release is the opposite: it is almost always ahead,
 * and refusing a future date there would make the field useless. It still
 * needs bounds — a statistical agency publishes a calendar a year or two out,
 * not a decade — and a little slack backwards, because a release that is
 * overdue is a real state worth recording rather than an error.
 */
const RELEASE_YEARS_BACK = 1;
const RELEASE_YEARS_FORWARD = 3;

export interface ParsedObservationDate {
    /** Midnight UTC on the chosen day, or null when the input was refused. */
    date: Date | null;
    /** A message for the editor, in French. Null when the date was accepted. */
    error: string | null;
}

/** Midnight UTC on the same calendar day as `value`. */
function startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * Validates an ISO date typed by the administrator.
 *
 * `today` is a parameter rather than a call to `Date.now()`: this module is
 * domain code and owns no clock, and a test that depends on the wall clock
 * starts failing on its own the day after it is written.
 *
 * An empty input is not an error — it means "today", which is what the field
 * defaults to and what almost every entry wants.
 */
export function parseObservationDate(
    input: string | null | undefined,
    today: Date,
): ParsedObservationDate {
    return parseBoundedDate(input, today, {
        yearsBack: MAX_YEARS_BACK,
        yearsForward: 0,
        futureMessage: 'Date dans le futur : aucune donnée de marché ne la couvre.',
    });
}

/**
 * A scheduled next publication.
 *
 * Same parsing, opposite expectation about the future. Kept as its own
 * function rather than a flag at the call site, so the two intents are named
 * where they are used and a reader never has to decode a boolean.
 */
export function parseReleaseDate(
    input: string | null | undefined,
    today: Date,
): ParsedObservationDate {
    return parseBoundedDate(input, today, {
        yearsBack: RELEASE_YEARS_BACK,
        yearsForward: RELEASE_YEARS_FORWARD,
        futureMessage: `Date trop lointaine : ${RELEASE_YEARS_FORWARD} ans maximum.`,
        pastMessage: `Date trop ancienne pour une publication à venir : ${RELEASE_YEARS_BACK} an maximum.`,
    });
}

interface Bounds {
    yearsBack: number;
    /** 0 refuses any future date. */
    yearsForward: number;
    futureMessage: string;
    pastMessage?: string;
}

function parseBoundedDate(
    input: string | null | undefined,
    today: Date,
    bounds: Bounds,
): ParsedObservationDate {
    const reference = startOfUtcDay(today);

    if (input === null || input === undefined || input.trim() === '') {
        return { date: reference, error: null };
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (!match) {
        return { date: null, error: 'Date invalide : format attendu AAAA-MM-JJ.' };
    }

    const year = Number.parseInt(match[1]!, 10);
    const month = Number.parseInt(match[2]!, 10) - 1;
    const day = Number.parseInt(match[3]!, 10);

    const candidate = new Date(Date.UTC(year, month, day));

    // Catches the 31st of a 30-day month and the 30th of February, which
    // Date.UTC rolls silently forward into the next month.
    if (
        candidate.getUTCFullYear() !== year ||
        candidate.getUTCMonth() !== month ||
        candidate.getUTCDate() !== day
    ) {
        return { date: null, error: "Date invalide : ce jour n'existe pas." };
    }

    const ceiling = new Date(reference);
    ceiling.setUTCFullYear(ceiling.getUTCFullYear() + bounds.yearsForward);
    if (candidate.getTime() > ceiling.getTime()) {
        return { date: null, error: bounds.futureMessage };
    }

    const floor = new Date(reference);
    floor.setUTCFullYear(floor.getUTCFullYear() - bounds.yearsBack);
    if (candidate.getTime() < floor.getTime()) {
        return {
            date: null,
            error: bounds.pastMessage ?? `Date trop ancienne : ${bounds.yearsBack} ans maximum.`,
        };
    }

    return { date: candidate, error: null };
}

/** The furthest a next-release date may be set, as AAAA-MM-JJ. */
export function releaseCeilingIso(today: Date): string {
    const ceiling = startOfUtcDay(today);
    ceiling.setUTCFullYear(ceiling.getUTCFullYear() + RELEASE_YEARS_FORWARD);
    return ceiling.toISOString().slice(0, 10);
}

/** The value a date input should start on: today, as AAAA-MM-JJ. */
export function todayIso(today: Date): string {
    return startOfUtcDay(today).toISOString().slice(0, 10);
}
