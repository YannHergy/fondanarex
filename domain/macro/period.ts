// ================================================================
// PERIOD LABELS
//
// Upstream sources label a reference period in several ways:
//   "2026-01"   monthly   (OECD, FRED)
//   "2025-Q4"   quarterly (OECD national accounts)
//   "2025-S1"   half-year (occasionally)
//   "2025"      annual
//
// Storage needs a real date to order and range-query on, so every
// label resolves to the LAST day of the period it names. Using the
// last day rather than the first matters: a Q4 reading and a
// December reading then sort onto the same date instead of the
// quarterly value appearing three months stale.
// ================================================================

/** Last day of the period a label names, as a UTC date. Null if unrecognised. */
export function periodEnd(label: string): Date | null {
    const trimmed = label.trim();

    const monthly = /^(\d{4})-(\d{2})$/.exec(trimmed);
    if (monthly) {
        const year = Number(monthly[1]);
        const month = Number(monthly[2]);
        if (month < 1 || month > 12) return null;
        // Day 0 of the next month is the last day of this one.
        return new Date(Date.UTC(year, month, 0));
    }

    const quarterly = /^(\d{4})-Q([1-4])$/i.exec(trimmed);
    if (quarterly) {
        const year = Number(quarterly[1]);
        const quarter = Number(quarterly[2]);
        return new Date(Date.UTC(year, quarter * 3, 0));
    }

    const half = /^(\d{4})-S([12])$/i.exec(trimmed);
    if (half) {
        const year = Number(half[1]);
        const semester = Number(half[2]);
        return new Date(Date.UTC(year, semester * 6, 0));
    }

    const annual = /^(\d{4})$/.exec(trimmed);
    if (annual) {
        return new Date(Date.UTC(Number(annual[1]), 12, 0));
    }

    const exact = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (exact) {
        const date = new Date(`${trimmed}T00:00:00Z`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
}

/**
 * Normalises a label to the `period` column, which is VarChar(8).
 *
 * Longer labels (a full date) are reduced to their month, so the unique key
 * (currency, indicator, period, source) still collapses repeated readings of
 * the same month onto one row instead of accumulating one per publication.
 */
export function periodLabel(label: string): string {
    const trimmed = label.trim();
    const exact = /^(\d{4})-(\d{2})-\d{2}$/.exec(trimmed);
    if (exact) return `${exact[1]}-${exact[2]}`;
    return trimmed.slice(0, 8);
}
