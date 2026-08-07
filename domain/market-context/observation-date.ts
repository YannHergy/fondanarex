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

    if (candidate.getTime() > reference.getTime()) {
        return { date: null, error: 'Date dans le futur : aucune donnée de marché ne la couvre.' };
    }

    const floor = new Date(reference);
    floor.setUTCFullYear(floor.getUTCFullYear() - MAX_YEARS_BACK);
    if (candidate.getTime() < floor.getTime()) {
        return {
            date: null,
            error: `Date trop ancienne : ${MAX_YEARS_BACK} ans maximum.`,
        };
    }

    return { date: candidate, error: null };
}

/** The value a date input should start on: today, as AAAA-MM-JJ. */
export function todayIso(today: Date): string {
    return startOfUtcDay(today).toISOString().slice(0, 10);
}
